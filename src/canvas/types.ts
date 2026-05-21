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
}

export type Tool = 'pen' | 'eraser' | 'move' | 'bend';
