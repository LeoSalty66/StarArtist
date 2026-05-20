import { useState } from 'react';
import DrawingCanvas from '../canvas/DrawingCanvas';
import Toolbar from '../canvas/Toolbar';
import { useDrawingState } from '../canvas/useDrawingState';
import type { Tool } from '../canvas/types';

interface Props {
  onBack: () => void;
}

function TestScreen({ onBack }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const drawing = useDrawingState();

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Test</h2>
        <span className="header-hint">
          Click two points to draw a line. Right-click or Esc to break the chain.
        </span>
      </header>
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
      <div className="canvas-wrapper">
        <DrawingCanvas
          tool={tool}
          lines={drawing.lines}
          onAddLine={drawing.addLine}
          onRemoveLine={drawing.removeLine}
        />
      </div>
    </div>
  );
}

export default TestScreen;
