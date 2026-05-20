import type { Tool } from './types';

interface Props {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lineCount: number;
}

function Toolbar({
  tool,
  onToolChange,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  lineCount,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
          onClick={() => onToolChange('pen')}
          title="Pen (press & drag to draw a line)"
        >
          ✏️ Pen
        </button>
        <button
          className={`tool-btn ${tool === 'move' ? 'active' : ''}`}
          onClick={() => onToolChange('move')}
          title="Move (drag an endpoint to reposition)"
        >
          ✋ Move
        </button>
        <button
          className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => onToolChange('eraser')}
          title="Eraser (click a line to remove it)"
        >
          🧽 Eraser
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="tool-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          ↶ Undo
        </button>
        <button
          className="tool-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          ↷ Redo
        </button>
        <button
          className="tool-btn danger"
          onClick={onClear}
          disabled={lineCount === 0}
          title="Clear all lines"
        >
          🗑 Clear
        </button>
      </div>

      <div className="toolbar-info">
        {lineCount} {lineCount === 1 ? 'line' : 'lines'}
      </div>
    </div>
  );
}

export default Toolbar;
