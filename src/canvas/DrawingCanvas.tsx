import { useEffect, useRef, useState } from 'react';
import type { Line, Point, Tool } from './types';
import { dist, findSnap, type SnapTarget } from './geometry';

interface Props {
  tool: Tool;
  lines: Line[];
  onAddLine: (line: Line) => void;
  onRemoveLine: (id: string) => void;
  onMovePoint: (moves: { lineId: string; endpoint: 'a' | 'b'; to: Point }[]) => void;
  locked?: boolean;
  boilActive?: boolean;
  successOverlay?: React.ReactNode;
}

const MIN_LINE_LENGTH = 4;
const MOVE_GRAB_RADIUS = 14;

interface MoveState {
  /** The lines and which endpoint on each is being dragged. */
  targets: { lineId: string; endpoint: 'a' | 'b' }[];
  /** Current position during drag (for preview). */
  current: Point;
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
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Pen state
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<SnapTarget | null>(null);
  // Move state
  const [moveState, setMoveState] = useState<MoveState | null>(null);

  // Cancel in-progress actions when switching tools
  useEffect(() => {
    setStartPoint(null);
    setMoveState(null);
  }, [tool]);

  // Escape cancels in-progress actions
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStartPoint(null);
        setMoveState(null);
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
      // Find the closest endpoint within grab radius.
      let bestDist = Infinity;
      let bestPoint: Point | null = null;

      for (const l of lines) {
        const dA = dist(raw, l.a);
        const dB = dist(raw, l.b);
        if (dA < bestDist) { bestDist = dA; bestPoint = l.a; }
        if (dB < bestDist) { bestDist = dB; bestPoint = l.b; }
      }

      if (!bestPoint || bestDist > MOVE_GRAB_RADIUS) return;

      // Find ALL lines that share this point (within merge distance).
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

    if (tool === 'move' && moveState) {
      const raw = getSvgPoint(e.clientX, e.clientY);
      const finalPoint = raw ?? moveState.current;
      onMovePoint(
        moveState.targets.map((t) => ({ ...t, to: finalPoint })),
      );
      setMoveState(null);
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
      onAddLine({
        id: crypto.randomUUID(),
        a: startPoint,
        b: endPoint,
      });
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

  // Compute display lines: apply move state in real-time for preview.
  const displayLines = moveState
    ? lines.map((l) => {
        let newA = l.a;
        let newB = l.b;
        for (const t of moveState.targets) {
          if (t.lineId === l.id && t.endpoint === 'a') newA = moveState.current;
          if (t.lineId === l.id && t.endpoint === 'b') newB = moveState.current;
        }
        return { ...l, a: newA, b: newB };
      })
    : lines;

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
      {/* Committed lines */}
      {displayLines.map((l) => {
        const eraserMode = tool === 'eraser';
        return (
          <g key={l.id} className="line-group">
            {eraserMode && (
              <line
                x1={l.a.x}
                y1={l.a.y}
                x2={l.b.x}
                y2={l.b.y}
                stroke="transparent"
                strokeWidth={18}
                onClick={(e) => handleLineClick(l.id, e)}
                style={{ cursor: 'pointer' }}
              />
            )}
            <line
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke="#f0f0f0"
              strokeWidth={3}
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* Move tool: highlight the point being dragged */}
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

      {/* Pen: preview line while dragging */}
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

      {/* Anchor for the in-progress line */}
      {tool === 'pen' && startPoint && !snap && (
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={4}
          fill="#7ec8e3"
          pointerEvents="none"
        />
      )}

      {/* Success fill overlay */}
      {successOverlay}
    </svg>
  );
}

export default DrawingCanvas;
