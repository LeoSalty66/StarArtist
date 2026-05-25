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
  onExport?: () => void;
  /** Optional portrait image URL to display at the bottom of the toolbar. */
  portrait?: string;
  /** Whether to show the separate Line tool button. Default false (test mode sets true). */
  showLineTool?: boolean;
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
  onExport,
  portrait,
  showLineTool = false,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className={`tool-btn ${tool === 'pen' || (!showLineTool && tool === 'line') ? 'active' : ''}`}
          onClick={() => onToolChange(showLineTool ? 'pen' : (tool === 'pen' || tool === 'line' ? tool : 'pen'))}
          title="Pen (press & drag to draw a line)"
        >
          Pen
        </button>
        {showLineTool && (
          <button
            className={`tool-btn ${tool === 'line' ? 'active' : ''}`}
            onClick={() => onToolChange('line')}
            title="Line (press & drag to draw a straight line)"
          >
            Line
          </button>
        )}
        <button
          className={`tool-btn ${tool === 'move' ? 'active' : ''}`}
          onClick={() => onToolChange('move')}
          title="Move (drag an endpoint to reposition)"
        >
          Move
        </button>
        <button
          className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => onToolChange('eraser')}
          title="Eraser (click a line to remove it)"
        >
          Eraser
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
          Clear
        </button>
      </div>

      {onExport && (
        <div className="toolbar-group">
          <button
            className="tool-btn"
            onClick={onExport}
            disabled={lineCount === 0}
            title="Export lines as level JSON (copies to clipboard)"
          >
            Export
          </button>
        </div>
      )}

      {portrait && (
        <div className="toolbar-portrait">
          <img src={portrait} alt="Character" />
        </div>
      )}
    </div>
  );
}

export default Toolbar;
