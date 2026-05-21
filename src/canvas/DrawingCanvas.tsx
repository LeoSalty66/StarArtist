import { useEffect, useRef, useState } from 'react';
import type { Line, Point, Tool } from './types';
import { dist, findSnap, type SnapTarget } from './geometry';
import { lineToPath, closestPointOnCurve } from './curveUtils';
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
}

const MIN_STROKE_LENGTH = 10;
const MOVE_GRAB_RADIUS = 14;
const BEND_GRAB_RADIUS = 12;
const BEND_LINE_RADIUS = 16;

interface MoveState {
  targets: { lineId: string; endpoint: 'a' | 'b' }[];
  current: Point;
}

interface BendState {
  lineId: string;
  cpIndex: number | null;
  insertT: number;
  current: Point;
}

function DrawingCanvas({
  tool,
  lines,
  onAddLine,
  onRemoveLine,
  onMovePoint,
  onBend,
  locked,
  boilActive,
  successOverlay,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<SnapTarget | null>(null);
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const [bendState, setBendState] = useState<BendState | null>(null);
  // Freehand pen state
  const [isDrawing, setIsDrawing] = useState(false);
  const rawPointsRef = useRef<Point[]>([]);
  const [previewPoints, setPreviewPoints] = useState<Point[]>([]);

  useEffect(() => {
    setIsDrawing(false);
    setPreviewPoints([]);
    setMoveState(null);
    setBendState(null);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawing(false);
        setPreviewPoints([]);
        setMoveState(null);
        setBendState(null);
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
    } else if (tool === 'bend') {
      for (const l of lines) {
        if (!l.controlPoints) continue;
        for (let i = 0; i < l.controlPoints.length; i++) {
          if (dist(raw, l.controlPoints[i]) <= BEND_GRAB_RADIUS) {
            setBendState({ lineId: l.id, cpIndex: i, insertT: 0, current: raw });
            (e.target as Element).setPointerCapture?.(e.pointerId);
            return;
          }
        }
      }
      let bestLine: Line | null = null;
      let bestDist = Infinity;
      let bestT = 0;
      for (const l of lines) {
        const { t, distance } = closestPointOnCurve(raw, l);
        if (distance < bestDist) {
          bestDist = distance;
          bestLine = l;
          bestT = t;
        }
      }
      if (!bestLine || bestDist > BEND_LINE_RADIUS) return;
      setBendState({ lineId: bestLine.id, cpIndex: null, insertT: bestT, current: raw });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = getSvgPoint(e.clientX, e.clientY);
    if (!raw) return;

    if (tool === 'pen' && isDrawing) {
      rawPointsRef.current.push(raw);
      // Throttle preview updates
      if (rawPointsRef.current.length % 3 === 0) {
        setPreviewPoints([...rawPointsRef.current]);
      }
      return;
    }

    if (tool === 'move' && moveState) {
      setMoveState({ ...moveState, current: raw });
      return;
    }
    if (tool === 'bend' && bendState) {
      setBendState({ ...bendState, current: raw });
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
        const { point } = resolvePoint(raw);
        rawPointsRef.current.push(point);
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

    if (tool === 'move' && moveState) {
      const raw = getSvgPoint(e.clientX, e.clientY);
      const finalPoint = raw ?? moveState.current;
      onMovePoint(moveState.targets.map((t) => ({ ...t, to: finalPoint })));
      setMoveState(null);
      return;
    }

    if (tool === 'bend' && bendState) {
      const raw = getSvgPoint(e.clientX, e.clientY);
      const finalPoint = raw ?? bendState.current;
      onBend(bendState.lineId, bendState.cpIndex, finalPoint);
      setBendState(null);
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

  // Preview: apply move/bend state for real-time feedback.
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
    if (bendState) {
      result = result.map((l) => {
        if (l.id !== bendState.lineId) return l;
        const cps = [...(l.controlPoints ?? [])];
        if (bendState.cpIndex !== null) {
          cps[bendState.cpIndex] = bendState.current;
        } else {
          const insertIdx = getInsertIndex(cps, bendState.insertT);
          cps.splice(insertIdx, 0, bendState.current);
        }
        return { ...l, controlPoints: cps };
      });
    }
    return result;
  })();

  // Build raw preview path for freehand drawing
  const previewPath = previewPoints.length >= 2
    ? 'M ' + previewPoints.map((p) => `${p.x} ${p.y}`).join(' L ')
    : null;

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
            {/* Show corners as small dots when bend tool is active */}
            {tool === 'bend' && l.cornerIndices && l.pathPoints && l.cornerIndices.map((ci) => (
              <circle
                key={`${l.id}-corner-${ci}`}
                cx={l.pathPoints![ci].x}
                cy={l.pathPoints![ci].y}
                r={4}
                fill="#ef476f"
                opacity={0.7}
                pointerEvents="none"
              />
            ))}
          </g>
        );
      })}

      {/* Bend tool: show control points */}
      {tool === 'bend' && displayLines.map((l) => {
        if (!l.controlPoints || l.controlPoints.length === 0) return null;
        return l.controlPoints.map((cp, i) => (
          <circle
            key={`${l.id}-cp-${i}`}
            cx={cp.x}
            cy={cp.y}
            r={5}
            fill="#7ec8e3"
            opacity={0.7}
            pointerEvents="none"
          />
        ));
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
      {snap && tool === 'pen' && !isDrawing && (
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

      {/* Success overlay */}
      {successOverlay}
    </svg>
  );
}

function getInsertIndex(existingCPs: Point[], t: number): number {
  if (existingCPs.length === 0) return 0;
  const idx = Math.round(t * existingCPs.length);
  return Math.max(0, Math.min(existingCPs.length, idx));
}

function computePathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

export default DrawingCanvas;
