import { useCallback, useState } from 'react';
import type { Line } from './types';

/**
 * Drawing state with undo/redo via history stacks.
 *
 * `lines` is the current set of committed lines.
 * `past` and `future` are the undo/redo stacks of previous `lines` snapshots.
 *
 * Any mutation pushes the previous state to `past` and clears `future`.
 */
export function useDrawingState() {
  const [lines, setLines] = useState<Line[]>([]);
  const [past, setPast] = useState<Line[][]>([]);
  const [future, setFuture] = useState<Line[][]>([]);

  const commit = useCallback((next: Line[]) => {
    setPast((p) => [...p, lines]);
    setFuture([]);
    setLines(next);
  }, [lines]);

  const addLine = useCallback((line: Line) => {
    commit([...lines, line]);
  }, [lines, commit]);

  const removeLine = useCallback((id: string) => {
    commit(lines.filter((l) => l.id !== id));
  }, [lines, commit]);

  const clear = useCallback(() => {
    if (lines.length === 0) return;
    commit([]);
  }, [lines.length, commit]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [lines, ...f]);
      setLines(previous);
      return p.slice(0, -1);
    });
  }, [lines]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, lines]);
      setLines(next);
      return f.slice(1);
    });
  }, [lines]);

  return {
    lines,
    addLine,
    removeLine,
    clear,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
