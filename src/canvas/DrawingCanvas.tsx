import { useEffect, useRef, useState, useMemo } from 'react';
import type { Line, Point, Tool } from './types';
import { dist, findSnap, findLineIntersections, type SnapTarget } from './geometry';
import { lineToPath } from './curveUtils';
import { processStroke } from './strokeProcessor';

interface Props {
  tool: Tool;
  lines: Line[];
  onAddLine: (line: Line) => void;
  onRemoveLine: (id: string) => void;
  onMovePoint: (moves: { lineId: string; endpoint: 'a' | 'b'; to: Point }[]) => void;
  onBend: (lineId: string, controlPointIndex: number | null, position: Point) => void;
  locked?: boolean;
  boilActive?: boolean;
  successOverlay?: React.ReactNode;
  /** Show colored debug dots at endpoints, corners, and intersections. Default true. */
  showDebugDots?: boolean;
}

const MIN_STROKE_LENGTH = 10;
const MOVE_GRAB_RADIUS = 14;

interface MoveState {
  targets: { lineId: string; endpoint: 'a' | 'b' }[];
  current: Point;
}

interface LineToolState {
  start: Point;
  current: Point;
  startSnap: SnapTarget | null;
  endSnap: SnapTarget | null;
  /** Points along the draft line that are near existing endpoints/intersections. */
  bodySnaps: Point[];
}

function DrawingCanvas({
  tool,
  lines,
  onAddLine,
  onRemoveLine,
  onMovePoint,
  locked,
  boilActive,
  successOverlay,
  showDebugDots = true,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<SnapTarget | null>(null);
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const [lineToolState, setLineToolState] = useState<LineToolState | null>(null);
  // Freehand pen state
  const [isDrawing, setIsDrawing] = useState(false);
  const rawPointsRef = useRef<Point[]>([]);
  const [previewPoints, setPreviewPoints] = useState<Point[]>([]);

  useEffect(() => {
    setIsDrawing(false);
    setPreviewPoints([]);
    setMoveState(null);
    setLineToolState(null);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawing(false);
        setPreviewPoints([]);
        setMoveState(null);
        setLineToolState(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getSvgPoint = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: svgPt.x, y: svgPt.y };
  };

  const resolvePoint = (raw: Point): { point: Point; snap: SnapTarget | null } => {
    const target = findSnap(raw, lines);
    return { point: target ? target.point : raw, snap: target };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (locked) return;
    if (e.button !== 0) return;
    const raw = getSvgPoint(e.clientX, e.clientY);
    if (!raw) return;

    if (tool === 'pen') {
      const { point } = resolvePoint(raw);
      rawPointsRef.current = [point];
      setPreviewPoints([point]);
      setIsDrawing(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (tool === 'line') {
      const { point, snap: startSnap } = resolvePoint(raw);
      setLineToolState({ start: point, current: point, startSnap, endSnap: null, bodySnaps: [] });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (tool === 'move') {
      let bestDist = Infinity;
      let bestPoint: Point | null = null;
      for (const l of lines) {
        const dA = dist(raw, l.a);
        const dB = dist(raw, l.b);
        if (dA < bestDist) { bestDist = dA; bestPoint = l.a; }
        if (dB < bestDist) { bestDist = dB; bestPoint = l.b; }
      }
      if (!bestPoint || bestDist > MOVE_GRAB_RADIUS) return;
      const targets: { lineId: string; endpoint: 'a' | 'b' }[] = [];
      for (const l of lines) {
        if (dist(bestPoint, l.a) <= 2) targets.push({ lineId: l.id, endpoint: 'a' });
        if (dist(bestPoint, l.b) <= 2) targets.push({ lineId: l.id, endpoint: 'b' });
      }
      if (targets.length === 0) return;
      setMoveState({ targets, current: bestPoint });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = getSvgPoint(e.clientX, e.clientY);
    if (!raw) return;

    if (tool === 'pen' && isDrawing) {
      rawPointsRef.current.push(raw);
      // Self-snap: check if near own start point (for closing loops/teardrops).
      const startPt = rawPointsRef.current[0];
      const distToStart = Math.hypot(raw.x - startPt.x, raw.y - startPt.y);
      const SELF_SNAP_RADIUS = 11;
      // Only allow self-snap if we've drawn far enough (avoid triggering at the very beginning).
      const pathLen = rawPointsRef.current.length;

      let snapPoint = raw;
      let snapTarget: SnapTarget | null = null;

      if (distToStart <= SELF_SNAP_RADIUS && pathLen > 20) {
        // Snap to own start
        snapPoint = startPt;
        snapTarget = { point: startPt, kind: 'endpoint' };
      } else {
        // Normal snap to other lines/endpoints
        const resolved = resolvePoint(raw);
        snapPoint = resolved.point;
        snapTarget = resolved.snap;
      }

      setCursor(snapPoint);
      setSnap(snapTarget);
      // Throttle preview updates
      if (rawPointsRef.current.length % 3 === 0) {
        setPreviewPoints([...rawPointsRef.current]);
      }
      return;
    }

    if (tool === 'line' && lineToolState) {
      const { point: endPoint, snap: endSnap } = resolvePoint(raw);
      // Find existing endpoints/intersections that fall near the draft line body.
      const BODY_SNAP_DIST = 9;
      const bodySnaps: Point[] = [];
      // Collect all candidate points: endpoints of existing lines + intersections.
      const candidates: Point[] = [];
      for (const l of lines) {
        candidates.push(l.a, l.b);
      }
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const ixs = findLineIntersections(lines[i], lines[j]);
          candidates.push(...ixs);
        }
      }
      // Check each candidate's distance to the draft line segment.
      const draftA = lineToolState.start;
      const draftB = endPoint;
      for (const c of candidates) {
        // Skip if it's near the start or end (those already have their own snaps).
        if (dist(c, draftA) < BODY_SNAP_DIST || dist(c, draftB) < BODY_SNAP_DIST) continue;
        // Distance from candidate to the draft line segment.
        const { distance } = closestPointOnDraftSegment(c, draftA, draftB);
        if (distance <= BODY_SNAP_DIST) {
          // Deduplicate
          if (!bodySnaps.some((s) => dist(s, c) < 4)) {
            bodySnaps.push(c);
          }
        }
      }
      setLineToolState({ ...lineToolState, current: endPoint, endSnap, bodySnaps });
      setCursor(endPoint);
      setSnap(endSnap);
      return;
    }

    if (tool === 'move' && moveState) {
      setMoveState({ ...moveState, current: raw });
      return;
    }

    const { point, snap } = resolvePoint(raw);
    setCursor(point);
    setSnap(snap);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (locked) return;

    if (tool === 'pen' && isDrawing) {
      const raw = getSvgPoint(e.clientX, e.clientY);
      if (raw) {
        // Self-snap on release: if near own start, close the loop.
        const startPt = rawPointsRef.current[0];
        const distToStart = Math.hypot(raw.x - startPt.x, raw.y - startPt.y);
        const pathLen = rawPointsRef.current.length;
        if (distToStart <= 11 && pathLen > 20) {
          rawPointsRef.current.push(startPt);
        } else {
          const { point } = resolvePoint(raw);
          rawPointsRef.current.push(point);
        }
      }

      // Process the raw stroke
      const rawPts = rawPointsRef.current;
      const totalLength = computePathLength(rawPts);

      if (totalLength >= MIN_STROKE_LENGTH && rawPts.length >= 2) {
        const processed = processStroke(rawPts);
        if (processed && processed.points.length >= 2) {
          const pts = processed.points;
          // Preserve the snapped start and end points
          const snappedStart = rawPts[0]; // first raw point was already snapped on pointerDown
          const snappedEnd = rawPts[rawPts.length - 1]; // last raw point was snapped above
          pts[0] = snappedStart;
          pts[pts.length - 1] = snappedEnd;
          onAddLine({
            id: crypto.randomUUID(),
            a: snappedStart,
            b: snappedEnd,
            pathPoints: pts,
            cornerIndices: processed.cornerIndices,
          });
        }
      }

      setIsDrawing(false);
      setPreviewPoints([]);
      rawPointsRef.current = [];
      return;
    }

    if (tool === 'line' && lineToolState) {
      const raw = getSvgPoint(e.clientX, e.clientY);
      const { point: endPoint } = raw ? resolvePoint(raw) : { point: lineToolState.current };
      const startPoint = lineToolState.start;
      const length = dist(startPoint, endPoint);

      if (length >= MIN_STROKE_LENGTH) {
        onAddLine({
          id: crypto.randomUUID(),
          a: startPoint,
          b: endPoint,
        });
      }

      setLineToolState(null);
      return;
    }

    if (tool === 'move' && moveState) {
      const raw = getSvgPoint(e.clientX, e.clientY);
      const finalPoint = raw ?? moveState.current;
      onMovePoint(moveState.targets.map((t) => ({ ...t, to: finalPoint })));
      setMoveState(null);
      return;
    }
  };

  const handlePointerLeave = () => {
    setCursor(null);
    setSnap(null);
  };

  const handleLineClick = (id: string, e: React.MouseEvent) => {
    if (tool !== 'eraser') return;
    e.stopPropagation();
    onRemoveLine(id);
  };

  // Preview: apply move state for real-time feedback.
  const displayLines = (() => {
    let result = lines;
    if (moveState) {
      result = result.map((l) => {
        let newA = l.a;
        let newB = l.b;
        for (const t of moveState.targets) {
          if (t.lineId === l.id && t.endpoint === 'a') newA = moveState.current;
          if (t.lineId === l.id && t.endpoint === 'b') newB = moveState.current;
        }
        return { ...l, a: newA, b: newB };
      });
    }
    return result;
  })();

  // Build raw preview path for freehand drawing
  const previewPath = previewPoints.length >= 2
    ? 'M ' + previewPoints.map((p) => `${p.x} ${p.y}`).join(' L ')
    : null;

  // Compute all intersection points for debug visualization
  const intersectionPoints = useMemo(() => {
    const pts: Point[] = [];
    for (let i = 0; i < displayLines.length; i++) {
      for (let j = i + 1; j < displayLines.length; j++) {
        const ixs = findLineIntersections(displayLines[i], displayLines[j]);
        pts.push(...ixs);
      }
    }
    return pts;
  }, [displayLines]);

  return (
    <svg
      ref={svgRef}
      className={`drawing-canvas tool-${tool}${boilActive ? ' boil-active' : ''}`}
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Committed lines */}
      {displayLines.map((l) => {
        const eraserMode = tool === 'eraser';
        const pathD = lineToPath(l);
        return (
          <g key={l.id} className="line-group">
            {eraserMode && (
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                onClick={(e) => handleLineClick(l.id, e)}
                style={{ cursor: 'pointer' }}
              />
            )}
            <path
              d={pathD}
              fill="none"
              stroke="#f0f0f0"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {/* Debug dots: endpoints and corners */}
            {showDebugDots && (
              <>
                <circle cx={l.a.x} cy={l.a.y} r={4} fill="#ef476f" pointerEvents="none" />
                <circle cx={l.b.x} cy={l.b.y} r={4} fill="#ef476f" pointerEvents="none" />
                {l.cornerIndices && l.pathPoints && l.cornerIndices
                  .filter((ci) => ci !== 0 && ci !== l.pathPoints!.length - 1)
                  .map((ci) => (
                    <circle
                      key={`${l.id}-corner-${ci}`}
                      cx={l.pathPoints![ci].x}
                      cy={l.pathPoints![ci].y}
                      r={4}
                      fill="#ef476f"
                      pointerEvents="none"
                    />
                  ))}
              </>
            )}
          </g>
        );
      })}

      {/* Freehand preview while drawing */}
      {isDrawing && previewPath && (
        <path
          d={previewPath}
          fill="none"
          stroke="#7ec8e3"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
          pointerEvents="none"
        />
      )}

      {/* Line tool preview */}
      {lineToolState && (
        <g pointerEvents="none">
          <line
            x1={lineToolState.start.x}
            y1={lineToolState.start.y}
            x2={lineToolState.current.x}
            y2={lineToolState.current.y}
            stroke="#7ec8e3"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.7}
          />
          {/* Start snap indicator */}
          {lineToolState.startSnap && (
            <circle
              cx={lineToolState.start.x}
              cy={lineToolState.start.y}
              r={7}
              fill="none"
              stroke="#6b8fa8"
              strokeWidth={2}
            />
          )}
          {/* End snap indicator */}
          {lineToolState.endSnap && (
            <circle
              cx={lineToolState.current.x}
              cy={lineToolState.current.y}
              r={7}
              fill="none"
              stroke="#6b8fa8"
              strokeWidth={2}
            />
          )}
          {/* Body snap indicators — existing points that the draft line passes through */}
          {lineToolState.bodySnaps.map((p, i) => (
            <circle
              key={`body-snap-${i}`}
              cx={p.x}
              cy={p.y}
              r={6}
              fill="none"
              stroke="#b088f9"
              strokeWidth={2}
              opacity={0.8}
            />
          ))}
        </g>
      )}

      {/* Move tool: highlight */}
      {tool === 'move' && moveState && (
        <circle
          cx={moveState.current.x}
          cy={moveState.current.y}
          r={6}
          fill="#7ec8e3"
          opacity={0.8}
          pointerEvents="none"
        />
      )}

      {/* Snap indicator */}
      {snap && (tool === 'pen' || tool === 'line') && !lineToolState && (
        <g pointerEvents="none">
          <circle
            cx={snap.point.x}
            cy={snap.point.y}
            r={7}
            fill="none"
            stroke="#6b8fa8"
            strokeWidth={2}
          />
        </g>
      )}

      {/* Debug: intersection dots */}
      {showDebugDots && intersectionPoints.map((p, i) => (
        <circle
          key={`ix-${i}`}
          cx={p.x}
          cy={p.y}
          r={5}
          fill="#ffff00"
          pointerEvents="none"
        />
      ))}

      {/* Success overlay */}
      {successOverlay}
    </svg>
  );
}

function computePathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Distance from point P to segment AB. */
function closestPointOnDraftSegment(p: Point, a: Point, b: Point): { distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { distance: Math.hypot(p.x - a.x, p.y - a.y) };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return { distance: Math.hypot(p.x - proj.x, p.y - proj.y) };
}

export default DrawingCanvas;
