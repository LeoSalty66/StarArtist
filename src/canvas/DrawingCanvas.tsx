import { useEffect, useRef, useState } from 'react';
import type { Line, Point, Tool } from './types';

interface Props {
  tool: Tool;
  lines: Line[];
  onAddLine: (line: Line) => void;
  onRemoveLine: (id: string) => void;
}

/**
 * Two-click line drawing on an SVG canvas.
 *
 * Pen: first click sets the start point. Second click commits the line
 * and the end point becomes the new start (chain mode). Escape or
 * right-click cancels the in-progress chain.
 *
 * Eraser: click a line to remove it.
 */
function DrawingCanvas({ tool, lines, onAddLine, onRemoveLine }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  // Cancel chain when switching tools
  useEffect(() => {
    setStartPoint(null);
  }, [tool]);

  // Escape key cancels in-progress line
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

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'pen') return;
    const p = getSvgPoint(e.clientX, e.clientY);
    if (!p) return;

    if (!startPoint) {
      setStartPoint(p);
      return;
    }

    // Reject zero-length lines (double-click in place)
    const dx = p.x - startPoint.x;
    const dy = p.y - startPoint.y;
    if (Math.hypot(dx, dy) < 4) return;

    onAddLine({
      id: crypto.randomUUID(),
      a: startPoint,
      b: p,
    });
    // Chain: end point becomes next start
    setStartPoint(p);
  };

  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    setStartPoint(null);
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    setCursor(getSvgPoint(e.clientX, e.clientY));
  };

  const handleLeave = () => setCursor(null);

  const handleLineClick = (id: string) => {
    if (tool === 'eraser') onRemoveLine(id);
  };

  const showPreview = tool === 'pen' && startPoint && cursor;

  return (
    <svg
      ref={svgRef}
      className={`drawing-canvas tool-${tool}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {/* Committed lines */}
      {lines.map((l) => (
        <g key={l.id} className="line-group">
          {/* Wide invisible hit area for easier eraser clicks */}
          <line
            x1={l.a.x}
            y1={l.a.y}
            x2={l.b.x}
            y2={l.b.y}
            stroke="transparent"
            strokeWidth={16}
            onClick={(e) => {
              e.stopPropagation();
              handleLineClick(l.id);
            }}
            style={{ cursor: tool === 'eraser' ? 'pointer' : 'default' }}
          />
          {/* The actual visible line */}
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
      ))}

      {/* Preview line from startPoint to cursor */}
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

      {/* Anchor dot for the in-progress line start */}
      {tool === 'pen' && startPoint && (
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={5}
          fill="#ffd166"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

export default DrawingCanvas;
