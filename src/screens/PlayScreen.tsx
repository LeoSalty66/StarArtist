import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DrawingCanvas from '../canvas/DrawingCanvas';
import Toolbar from '../canvas/Toolbar';
import SuccessOverlay from '../canvas/SuccessOverlay';
import { useDrawingState } from '../canvas/useDrawingState';
import { analyze } from '../analyzer/analyzer';
import { saveStar } from '../storage/starLibrary';
import type { Line, Tool } from '../canvas/types';
import type { LevelData, NormalizedLine } from '../levels/types';

interface Props {
  level: LevelData;
  onBack: () => void;
  onComplete: () => void;
  onMainMenu: () => void;
  onNextLevel: (() => void) | null; // null if no next level
}

/** Convert normalized lines to pixel lines, centered and scaled to fit the canvas uniformly. */
function denormalize(nl: NormalizedLine[], w: number, h: number): Line[] {
  if (nl.length === 0) return [];

  // Collect all points.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of nl) {
    xs.push(n.ax, n.bx);
    ys.push(n.ay, n.by);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const bboxW = maxX - minX || 0.001;
  const bboxH = maxY - minY || 0.001;

  // Use a UNIFORM scale to avoid distortion.
  // Fit within 80% of the canvas (10% padding on each side).
  const padding = 0.1;
  const availW = w * (1 - 2 * padding);
  const availH = h * (1 - 2 * padding);
  const scale = Math.min(availW / bboxW, availH / bboxH);

  // Center the result.
  const scaledW = bboxW * scale;
  const scaledH = bboxH * scale;
  const offsetX = (w - scaledW) / 2;
  const offsetY = (h - scaledH) / 2;

  const transform = (nx: number, ny: number) => ({
    x: (nx - minX) * scale + offsetX,
    y: (ny - minY) * scale + offsetY,
  });

  return nl.map((n, i) => ({
    id: `given-${i}`,
    a: transform(n.ax, n.ay),
    b: transform(n.bx, n.by),
  }));
}

function PlayScreen({ level, onBack, onComplete, onMainMenu, onNextLevel }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [boilActive, setBoilActive] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawing = useDrawingState();

  // Given lines in pixel space (using fixed 600x600 viewBox coordinates).
  const givenLines = useMemo(() => {
    return denormalize(level.givenLines, 600, 600);
  }, [level.givenLines]);

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
      // Save the star to the night sky library.
      saveStar(level.id, allLines);
      return () => clearTimeout(timer);
    } else {
      setBoilActive(false);
    }
  }, [locked, level.id, allLines]);

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
      {/* Analyzer feedback bar */}
      <div className={`analyzer-bar ${locked ? 'success' : ''}`}>
        <span className="analyzer-message">{analysis.message}</span>
        {locked && (
          <div className="success-actions">
            {onNextLevel && (
              <button className="menu-btn primary small" onClick={onNextLevel}>
                Next Level →
              </button>
            )}
            <button className="menu-btn small" onClick={onMainMenu}>
              Main Menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayScreen;
