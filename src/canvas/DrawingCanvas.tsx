import { useEffect, useRef, useState } from 'react';
import type { Line, Point, Tool } from './types';
import { dist, findSnap, type SnapTarget } from './geometry';
import { lineToPath, closestPointOnCurve } from './curveUtils';

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

const MIN_LINE_LENGTH = 4;
const MOVE_GRAB_RADIUS = 14;
const BEND_GRAB_RADIUS = 12;
const BEND_LINE_RADIUS = 16;

interface MoveState {
  targets: { lineId: string; endpoint: 'a' | 'b' }[];
  current: Point;
}

interface BendState {
  lineId: string;
  /** Index of existing control point being moved, or null if creating a new one. */
  cpIndex: number | null;
  /** Parameter t on the curve where the new control point was inserted. */
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
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<SnapTarget | null>(null);
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const [bendState, setBendState] = useState<BendState | null>(null);

  useEffect(() => {
    setStartPoint(null);
    setMoveState(null);
    setBendState(null);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStartPoint(null);
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
      setStartPoint(point);
      setCursor(point);
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
      // Check if clicking near an existing control point first.
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
      // Otherwise, find the closest line body to add a new control point.
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

    if (tool !== 'pen' || !startPoint) {
      setStartPoint(null);
      return;
    }
    const raw = getSvgPoint(e.clientX, e.clientY);
    const endRaw = raw ?? startPoint;
    const { point: endPoint } = resolvePoint(endRaw);

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    if (Math.hypot(dx, dy) >= MIN_LINE_LENGTH) {
      onAddLine({ id: crypto.randomUUID(), a: startPoint, b: endPoint });
    }
    setStartPoint(null);
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
          // Moving existing control point
          cps[bendState.cpIndex] = bendState.current;
        } else {
          // Inserting new control point at the right position
          const insertIdx = getInsertIndex(cps, bendState.insertT);
          cps.splice(insertIdx, 0, bendState.current);
        }
        return { ...l, controlPoints: cps };
      });
    }
    return result;
  })();

  const showPreview = tool === 'pen' && startPoint && cursor;

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
      {/* Committed lines (rendered as paths to support curves) */}
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
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* Bend tool: show control points as draggable handles */}
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

      {/* Pen: preview line */}
      {showPreview && (
        <line
          x1={startPoint.x}
          y1={startPoint.y}
          x2={cursor.x}
          y2={cursor.y}
          stroke="#7ec8e3"
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}

      {/* Snap indicator */}
      {snap && tool === 'pen' && (
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

      {/* Anchor for pen */}
      {tool === 'pen' && startPoint && !snap && (
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={4}
          fill="#7ec8e3"
          pointerEvents="none"
        />
      )}

      {/* Success overlay */}
      {successOverlay}
    </svg>
  );
}

/**
 * Determine where to insert a new control point based on the t parameter.
 * If there are existing CPs, we insert at the position that maintains t ordering.
 */
function getInsertIndex(existingCPs: Point[], t: number): number {
  // With no existing CPs, insert at 0.
  if (existingCPs.length === 0) return 0;
  // With existing CPs, the t-space is divided evenly among segments.
  // Insert based on proportional position.
  const idx = Math.round(t * existingCPs.length);
  return Math.max(0, Math.min(existingCPs.length, idx));
}

export default DrawingCanvas;
