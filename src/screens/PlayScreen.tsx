import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DrawingCanvas from '../canvas/DrawingCanvas';
import Toolbar from '../canvas/Toolbar';
import CurvedSuccessOverlay from '../canvas/CurvedSuccessOverlay';
import DialogueBox from '../dialogue/DialogueBox';
import CanvasImageOverlay from '../dialogue/CanvasImageOverlay';
import type { CanvasImage } from '../dialogue/types';
import VictoryPopup from './VictoryPopup';
import { useDrawingState } from '../canvas/useDrawingState';
import { analyze } from '../analyzer/analyzer';
import { vertexValidate } from '../analyzer/vertexValidation';
import { saveStar } from '../storage/starLibrary';
import type { Line, Tool } from '../canvas/types';
import type { LevelData, NormalizedLine } from '../levels/types';

interface Props {
  level: LevelData;
  onBack: () => void;
  onComplete: () => void;
  onMainMenu: () => void;
  onLevelSelect: () => void;
  onNextLevel: (() => void) | null; // null if no next level
}

/** Convert normalized lines to pixel lines, centered and scaled to fit the canvas uniformly. */
function denormalize(nl: NormalizedLine[], w: number, h: number): Line[] {
  if (nl.length === 0) return [];

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

  const padding = 0.1;
  const availW = w * (1 - 2 * padding);
  const availH = h * (1 - 2 * padding);
  const scale = Math.min(availW / bboxW, availH / bboxH);

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

function PlayScreen({ level, onBack, onComplete, onMainMenu, onLevelSelect, onNextLevel }: Props) {
  const drawTool = level.drawTool ?? 'pen';
  const [tool, setTool] = useState<Tool>(drawTool);
  const [boilActive, setBoilActive] = useState(false);
  const [showIntro, setShowIntro] = useState(false); // delayed until assets load
  const [showCompletion, setShowCompletion] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [currentPortrait, setCurrentPortrait] = useState<string>('');
  const [canvasImage, setCanvasImage] = useState<CanvasImage | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawing = useDrawingState();

  // Preload all images from dialogue before showing anything.
  useEffect(() => {
    const urls = new Set<string>();
    const dialogues = [level.introDialogue, level.completionDialogue].filter(Boolean);
    for (const seq of dialogues) {
      for (const line of seq!) {
        line.portraits.idle.forEach((u) => urls.add(u));
        line.portraits.talk.forEach((u) => urls.add(u));
        if (line.canvasImage) {
          line.canvasImage.frames.forEach((u) => urls.add(u));
        }
      }
    }
    if (urls.size === 0) {
      setAssetsLoaded(true);
      if (level.introDialogue) setShowIntro(true);
      return;
    }
    let loaded = 0;
    const total = urls.size;
    urls.forEach((url) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (loaded >= total) {
          setAssetsLoaded(true);
          if (level.introDialogue) setShowIntro(true);
        }
      };
      img.src = url;
    });
  }, [level]);

  // Timer: track seconds since intro finishes (gameplay start).
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Start timer once intro dialogue is dismissed.
  useEffect(() => {
    if (!showIntro) {
      startTimeRef.current = Date.now();
    }
  }, [showIntro]);

  // Given lines in pixel space (using fixed 600x600 viewBox coordinates).
  const givenLines = useMemo(() => {
    return denormalize(level.givenLines, 600, 600);
  }, [level.givenLines]);

  // Whether given lines are visible (hidden during tutorial intro until triggered).
  const hasIntroWithReveal = level.introDialogue?.some((l) => l.showGivenLines) ?? false;
  const [givenLinesVisible, setGivenLinesVisible] = useState(!hasIntroWithReveal);

  // Whether lines remaining is visible (hidden until triggered or given lines show).
  const hasLinesRemainingReveal = level.introDialogue?.some((l) => l.showLinesRemaining) ?? false;
  const [linesRemainingVisible, setLinesRemainingVisible] = useState(!hasIntroWithReveal && !hasLinesRemainingReveal);

  // All lines: given (if visible) + player-drawn.
  const allLines = useMemo(
    () => [...(givenLinesVisible ? givenLines : []), ...drawing.lines],
    [givenLines, givenLinesVisible, drawing.lines],
  );

  // Analyze all lines together.
  const analysis = useMemo(() => analyze(allLines), [allLines]);
  const vResult = useMemo(() => vertexValidate(allLines), [allLines]);

  // Use vertex validation as primary, face-based as fallback (same as TestScreen).
  let sharedEdgeValid = false;
  if (!vResult.isValidStar) {
    let hasMultiEdge = false;
    for (const [, count] of vResult.edgeMultiplicity) {
      if (count > 1) { hasMultiEdge = true; break; }
    }
    if (!hasMultiEdge) {
      sharedEdgeValid = analysis.isValidStar;
    }
  }
  const locked = vResult.isValidStar || sharedEdgeValid;

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

  // Freeze elapsed time when star is completed.
  useEffect(() => {
    if (locked) {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }
  }, [locked]);

  // Success boil effect + completion dialogue.
  useEffect(() => {
    if (locked) {
      const timer = setTimeout(() => setBoilActive(true), 2400);
      saveStar(level.id, allLines);
      if (level.completionDialogue) {
        const dlgTimer = setTimeout(() => setShowCompletion(true), 3000);
        return () => {
          clearTimeout(timer);
          clearTimeout(dlgTimer);
        };
      } else {
        // No completion dialogue — show victory after a short delay.
        const victoryTimer = setTimeout(() => setShowVictory(true), 3000);
        return () => {
          clearTimeout(timer);
          clearTimeout(victoryTimer);
        };
      }
      return () => clearTimeout(timer);
    } else {
      setBoilActive(false);
    }
  }, [locked, level.id, level.completionDialogue, allLines]);

  // Show victory popup after completion dialogue finishes.
  const handleCompletionDone = useCallback(() => {
    setShowCompletion(false);
    setShowVictory(true);
  }, []);

  return (
    <div className="screen">
      {!assetsLoaded && (
        <div className="loading-screen">
          <span className="loading-text">Loading...</span>
        </div>
      )}
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>{level.name || level.id}</h2>
        {linesRemainingVisible && (
          <span className="header-hint lines-remaining">
            {locked
              ? '⭐ Star complete!'
              : `Lines remaining: ${linesRemaining}`}
          </span>
        )}
      </header>
      <div className="canvas-area">
        <div className="canvas-wrapper" ref={wrapperRef}>
            <DrawingCanvas
              tool={locked || showIntro ? 'pen' : atBudget && tool === 'pen' ? 'pen' : tool}
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
              onBend={(lineId, cpIndex, position) => {
                if (lineId.startsWith('given-')) return;
                drawing.bendLine(lineId, cpIndex, position);
              }}
              locked={locked || showIntro}
              boilActive={boilActive}
              showDebugDots={false}
              successOverlay={
                locked ? (
                  <CurvedSuccessOverlay
                    pentCycle={vResult.pentagonVertices}
                    tipAssignment={vResult.tipAssignment}
                    vertices={vResult.vertices}
                    lines={allLines}
                  />
                ) : undefined
              }
            />
          {/* Canvas image from dialogue */}
          {canvasImage && (
            <CanvasImageOverlay image={canvasImage} />
          )}
          {/* Intro dialogue */}
          {showIntro && (
            <DialogueBox
              sequence={level.introDialogue ?? null}
              onComplete={() => { setShowIntro(false); setCanvasImage(null); }}
              onPortraitChange={setCurrentPortrait}
              onCanvasImageChange={setCanvasImage}
              onShowGivenLines={() => { setGivenLinesVisible(true); setLinesRemainingVisible(true); }}
              onShowLinesRemaining={() => setLinesRemainingVisible(true)}
            />
          )}
          {/* Completion dialogue */}
          {showCompletion && (
            <DialogueBox
              sequence={level.completionDialogue ?? null}
              onComplete={handleCompletionDone}
              onPortraitChange={setCurrentPortrait}
              onCanvasImageChange={setCanvasImage}
            />
          )}
          {/* Victory popup */}
          {showVictory && (
            <VictoryPopup
              elapsedSeconds={elapsedSeconds}
              onNextLevel={onNextLevel}
              onLevelSelect={onLevelSelect}
              onMainMenu={onMainMenu}
            />
          )}
        </div>
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          onUndo={drawing.undo}
          onRedo={drawing.redo}
          onClear={drawing.clear}
          canUndo={drawing.canUndo}
          canRedo={drawing.canRedo}
          lineCount={drawing.lines.length}
          portrait={(showIntro || showCompletion) ? currentPortrait : undefined}
        />
      </div>
    </div>
  );
}

export default PlayScreen;
