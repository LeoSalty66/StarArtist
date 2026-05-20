import type { Line, Point } from './types';

export const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Closest point on segment AB to point P, plus the distance to it. */
export function closestPointOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return { point: a, distance: dist(p, a), t: 0 };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, distance: dist(p, point), t };
}

/**
 * Intersection point of two segments, or null if they don't cross.
 * Touching endpoints count as an intersection.
 */
export function segmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): Point | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (denom === 0) return null; // parallel or collinear
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

export interface SnapTarget {
  point: Point;
  kind: 'endpoint' | 'intersection' | 'line';
}

/**
 * Find the best snap target for a cursor position.
 * Priority: endpoint > intersection > line body.
 * Returns null if nothing within range.
 *
 * `excludeLineId` lets the in-progress line ignore its own start anchor when
 * we want it to (not currently used, but reserved).
 */
export function findSnap(
  cursor: Point,
  lines: Line[],
  options: {
    endpointRadius?: number;
    intersectionRadius?: number;
    lineRadius?: number;
    excludeLineId?: string;
  } = {},
): SnapTarget | null {
  const endpointRadius = options.endpointRadius ?? 11;
  const intersectionRadius = options.intersectionRadius ?? 9;
  const lineRadius = options.lineRadius ?? 5;

  // 1. Endpoints (highest priority)
  let bestEndpoint: { point: Point; distance: number } | null = null;
  for (const l of lines) {
    if (l.id === options.excludeLineId) continue;
    for (const p of [l.a, l.b]) {
      const d = dist(cursor, p);
      if (
        d <= endpointRadius &&
        (!bestEndpoint || d < bestEndpoint.distance)
      ) {
        bestEndpoint = { point: p, distance: d };
      }
    }
  }
  if (bestEndpoint) return { point: bestEndpoint.point, kind: 'endpoint' };

  // 2. Intersections
  let bestIntersection: { point: Point; distance: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (
        lines[i].id === options.excludeLineId ||
        lines[j].id === options.excludeLineId
      ) {
        continue;
      }
      const ix = segmentIntersection(
        lines[i].a,
        lines[i].b,
        lines[j].a,
        lines[j].b,
      );
      if (!ix) continue;
      const d = dist(cursor, ix);
      if (
        d <= intersectionRadius &&
        (!bestIntersection || d < bestIntersection.distance)
      ) {
        bestIntersection = { point: ix, distance: d };
      }
    }
  }
  if (bestIntersection) {
    return { point: bestIntersection.point, kind: 'intersection' };
  }

  // 3. Line body
  let bestLine: { point: Point; distance: number } | null = null;
  for (const l of lines) {
    if (l.id === options.excludeLineId) continue;
    const { point, distance } = closestPointOnSegment(cursor, l.a, l.b);
    if (distance <= lineRadius && (!bestLine || distance < bestLine.distance)) {
      bestLine = { point, distance };
    }
  }
  if (bestLine) return { point: bestLine.point, kind: 'line' };

  return null;
}
