export interface Point {
  x: number;
  y: number;
}

export interface Line {
  id: string;
  a: Point;
  b: Point;
}

export type Tool = 'pen' | 'eraser' | 'move';
