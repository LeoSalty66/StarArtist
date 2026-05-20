import { useEffect, useRef, useState } from 'react';
import type { Line, Point, Tool } from './types';
import { findSnap, type SnapTarget } from './geometry';

interface Props {
  tool: Tool;
  lines: Line[];
  onAddLine: (line: Line) => void;
  onRemoveLine: (id: string) => void;
}

const MIN_LINE_LENGTH = 4;

/**
 * Press-and-drag line drawing on an SVG canvas.
 *
 * Pen: press to start, drag to set endpoint, release to commit.
 * Eraser: click a line to remove it.
 *
 * Snap behavior: while drawing or hovering, the cursor magnetizes to nearby
 * endpoints, intersections, or line bodies (in that priority).
 */
function DrawingCanvas({ tool, lines, onAddLine, onRemoveLine }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<SnapTarget | null>(null);

  // Cancel in-progress line when switching tools
  useEffect(() => {
    setStartPoint(null);
  }, [tool]);

  // Escape cancels in-progress line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStartPoint(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getSvgPoint = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /** Resolve the effective point given the raw cursor position and snap state. */
  const resolvePoint = (raw: Point): { point: Point; snap: SnapTarget | null } => {
    const target = findSnap(raw, lines);
    return { point: target ? target.point : raw, snap: target };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'pen') return;
    if (e.button !== 0) return; // left button only
    const raw = getSvgPoint(e.clientX, e.clientY);
    if (!raw) return;
    const { point } = resolvePoint(raw);
    setStartPoint(point);
    setCursor(point);
    // Capture so we keep getting move/up events even off the SVG
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = getSvgPoint(e.clientX, e.clientY);
    if (!raw) return;
    const { point, snap } = resolvePoint(raw);
    setCursor(point);
    setSnap(snap);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
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

  const showPreview = tool === 'pen' && startPoint && cursor;

  return (
    <svg
      ref={svgRef}
      className={`drawing-canvas tool-${tool}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Committed lines */}
      {lines.map((l) => {
        // The hit area is wider for the eraser to make clicking easy.
        // For the pen, we want the visible line itself to NOT block pointer
        // events so the user can press/release on top of existing lines.
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

      {/* Preview line while dragging */}
      {showPreview && (
        <line
          x1={startPoint.x}
          y1={startPoint.y}
          x2={cursor.x}
          y2={cursor.y}
          stroke="#ffd166"
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
            stroke="#a0a0c0"
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
          fill="#ffd166"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

export default DrawingCanvas;
