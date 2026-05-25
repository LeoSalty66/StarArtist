export interface Point {
  x: number;
  y: number;
}

export interface Line {
  id: string;
  a: Point;
  b: Point;
  /** Optional control points that bend the line into a curve. */
  controlPoints?: Point[];
  /**
   * Full path points for freehand strokes.
   * If present, `a` is the first point and `b` is the last.
   * The line is rendered as a smooth path through these points.
   */
  pathPoints?: Point[];
  /** Indices into pathPoints that are corners (sharp angle changes). */
  cornerIndices?: number[];
}

export type Tool = 'pen' | 'eraser' | 'move' | 'line';
