import { useMemo, useState } from 'react';
import DrawingCanvas from '../canvas/DrawingCanvas';
import Toolbar from '../canvas/Toolbar';
import SuccessOverlay from '../canvas/SuccessOverlay';
import { useDrawingState } from '../canvas/useDrawingState';
import { analyze } from '../analyzer/analyzer';
import type { Tool } from '../canvas/types';

interface Props {
  onBack: () => void;
}

function TestScreen({ onBack }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const drawing = useDrawingState();

  // Run the analyzer every time lines change.
  const analysis = useMemo(() => analyze(drawing.lines), [drawing.lines]);

  const locked = analysis.isValidStar;

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Test</h2>
        <span className="header-hint">
          {locked
            ? '⭐ Star complete!'
            : 'Draw a 5-pointed star. Press & drag to draw lines.'}
        </span>
      </header>
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
      <div className="canvas-wrapper">
        <DrawingCanvas
          tool={locked ? 'pen' : tool}
          lines={drawing.lines}
          onAddLine={drawing.addLine}
          onRemoveLine={drawing.removeLine}
          locked={locked}
          successOverlay={
            analysis.isValidStar &&
            analysis.pentagonIdx !== null ? (
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
      {/* Analyzer feedback bar */}
      <div className={`analyzer-bar ${locked ? 'success' : ''}`}>
        <span className="analyzer-message">{analysis.message}</span>
        {analysis.boundedFaces.length > 0 && !locked && (
          <span className="analyzer-detail">
            Shapes:{' '}
            {analysis.boundedFaces.map((f, i) => (
              <span key={f.id} className="shape-badge">
                {f.halfEdgeIds.length}△{i < analysis.boundedFaces.length - 1 ? ' ' : ''}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export default TestScreen;
