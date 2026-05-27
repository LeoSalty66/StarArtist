import { useEffect } from 'react';
import type { Tool } from './types';

/**
 * Keyboard shortcuts for the drawing canvas:
 * Ctrl+Z = Undo, Ctrl+Y = Redo, Ctrl+X = Eraser, Ctrl+D = Draw tool
 */
export function useKeyboardShortcuts(
  setTool: (tool: Tool) => void,
  undo: () => void,
  redo: () => void,
  locked: boolean,
  drawTool: Tool = 'pen',
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      if (!e.ctrlKey && !e.metaKey) return;

      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          undo();
          break;
        case 'y':
          e.preventDefault();
          redo();
          break;
        case 'x':
          e.preventDefault();
          setTool('eraser');
          break;
        case 'd':
          e.preventDefault();
          setTool(drawTool);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool, undo, redo, locked, drawTool]);
}
