import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DrawingCanvas from '../canvas/DrawingCanvas';
import Toolbar from '../canvas/Toolbar';
import SuccessOverlay from '../canvas/SuccessOverlay';
import { useDrawingState } from '../canvas/useDrawingState';
import { analyze } from '../analyzer/analyzer';
import type { Line, Tool } from '../canvas/types';
import type { LevelData, NormalizedLine } from '../levels/types';

interface Props {
  level: LevelData;
  onBack: () => void;
  onComplete: () => void;
}

/** Convert normalized lines to pixel lines given canvas dimensions. */
function denormalize(nl: NormalizedLine[], w: number, h: number): Line[] {
  return nl.map((n, i) => ({
    id: `given-${i}`,
    a: { x: n.ax * w, y: n.ay * h },
    b: { x: n.bx * w, y: n.by * h },
  }));
}

function PlayScreen({ level, onBack, onComplete }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [boilActive, setBoilActive] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawing = useDrawingState();

  // Measure the canvas on mount and resize.
  useEffect(() => {
    const measure = () => {
      const el = wrapperRef.current;
      if (!el) return;
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Given lines in pixel space.
  const givenLines = useMemo(() => {
    if (!canvasSize) return [];
    return denormalize(level.givenLines, canvasSize.w, canvasSize.h);
  }, [level.givenLines, canvasSize]);

  // All lines: given + player-drawn.
  const allLines = useMemo(
    () => [...givenLines, ...drawing.lines],
    [givenLines, drawing.lines],
  );

  // Analyze all lines together.
  const analysis = useMemo(() => analyze(allLines), [allLines]);
  const locked = analysis.isValidStar;

  const linesRemaining = level.lineBudget - drawing.lines.length;
  const atBudget = linesRemaining <= 0;

  // Block adding lines when at budget.
  const handleAddLine = useCallback(
    (line: Line) => {
      if (atBudget) return;
      drawing.addLine(line);
    },
    [atBudget, drawing],
  );

  // Success boil effect.
  useEffect(() => {
    if (locked) {
      const timer = setTimeout(() => setBoilActive(true), 2400);
      return () => clearTimeout(timer);
    } else {
      setBoilActive(false);
    }
  }, [locked]);

  // Notify parent on success (after animation).
  useEffect(() => {
    if (locked) {
      const timer = setTimeout(() => onComplete(), 3500);
      return () => clearTimeout(timer);
    }
  }, [locked, onComplete]);

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>{level.name || level.id}</h2>
        <span className="header-hint">
          {locked
            ? '⭐ Star complete!'
            : `Lines remaining: ${linesRemaining}`}
        </span>
      </header>
      <div className="canvas-area">
        <div className="canvas-wrapper" ref={wrapperRef}>
          {canvasSize && (
            <DrawingCanvas
              tool={locked ? 'pen' : atBudget && tool === 'pen' ? 'pen' : tool}
              lines={allLines}
              onAddLine={handleAddLine}
              onRemoveLine={(id) => {
                if (id.startsWith('given-')) return;
                drawing.removeLine(id);
              }}
              onMovePoint={(moves) => {
                const playerMoves = moves.filter((m) => !m.lineId.startsWith('given-'));
                if (playerMoves.length > 0) drawing.movePoint(playerMoves);
              }}
              locked={locked}
              boilActive={boilActive}
              successOverlay={
                analysis.isValidStar && analysis.pentagonIdx !== null ? (
                  <SuccessOverlay
                    graph={analysis.graph}
                    pentagon={analysis.boundedFaces[analysis.pentagonIdx]}
                    triangles={analysis.triangleIdxs.map(
                      (i) => analysis.boundedFaces[i],
                    )}
                  />
                ) : undefined
              }
            />
          )}
        </div>
        {!locked && (
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            onUndo={drawing.undo}
            onRedo={drawing.redo}
            onClear={drawing.clear}
            canUndo={drawing.canUndo}
            canRedo={drawing.canRedo}
            lineCount={drawing.lines.length}
          />
        )}
      </div>
      </div>
      {/* Analyzer feedback bar */}
      <div className={`analyzer-bar ${locked ? 'success' : ''}`}>
        <span className="analyzer-message">{analysis.message}</span>
      </div>
    </div>
  );
}

export default PlayScreen;
