import { useCallback, useState } from 'react';
import type { Line, Point } from './types';
import { mergeOverlappingLines } from './mergeLines';

/**
 * Drawing state with undo/redo via history stacks.
 *
 * `lines` is the current set of committed lines.
 * `past` and `future` are the undo/redo stacks of previous `lines` snapshots.
 *
 * Any mutation pushes the previous state to `past` and clears `future`.
 * After each mutation, overlapping/parallel lines are automatically merged.
 */
export function useDrawingState() {
  const [lines, setLines] = useState<Line[]>([]);
  const [past, setPast] = useState<Line[][]>([]);
  const [future, setFuture] = useState<Line[][]>([]);

  const commit = useCallback((next: Line[]) => {
    const merged = mergeOverlappingLines(next);
    setPast((p) => [...p, lines]);
    setFuture([]);
    setLines(merged);
  }, [lines]);

  const addLine = useCallback((line: Line) => {
    commit([...lines, line]);
  }, [lines, commit]);

  const removeLine = useCallback((id: string) => {
    commit(lines.filter((l) => l.id !== id));
  }, [lines, commit]);

  const movePoint = useCallback(
    (moves: { lineId: string; endpoint: 'a' | 'b'; to: Point }[]) => {
      const next = lines.map((l) => {
        let newA = l.a;
        let newB = l.b;
        for (const m of moves) {
          if (m.lineId === l.id && m.endpoint === 'a') newA = m.to;
          if (m.lineId === l.id && m.endpoint === 'b') newB = m.to;
        }
        if (newA === l.a && newB === l.b) return l;
        return { ...l, a: newA, b: newB };
      });
      commit(next);
    },
    [lines, commit],
  );

  const bendLine = useCallback(
    (lineId: string, cpIndex: number | null, position: Point) => {
      const next = lines.map((l) => {
        if (l.id !== lineId) return l;
        const cps = [...(l.controlPoints ?? [])];
        if (cpIndex !== null) {
          cps[cpIndex] = position;
        } else {
          // Insert new CP. Figure out where based on closest point.
          // Simple heuristic: insert at end if no CPs, otherwise based on position.
          if (cps.length === 0) {
            cps.push(position);
          } else {
            // Find best insert position by checking distances.
            let bestIdx = cps.length;
            let bestDist = Infinity;
            for (let i = 0; i <= cps.length; i++) {
              const prev = i === 0 ? l.a : cps[i - 1];
              const next = i === cps.length ? l.b : cps[i];
              const midX = (prev.x + next.x) / 2;
              const midY = (prev.y + next.y) / 2;
              const d = Math.hypot(position.x - midX, position.y - midY);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
              }
            }
            cps.splice(bestIdx, 0, position);
          }
        }
        return { ...l, controlPoints: cps };
      });
      commit(next);
    },
    [lines, commit],
  );

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
    movePoint,
    bendLine,
    clear,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
