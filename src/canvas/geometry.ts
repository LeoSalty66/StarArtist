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
 * Nearly-collinear segments (angle < ~10°) are treated as parallel to
 * avoid phantom intersections from imprecise overlapping lines.
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

  // Skip nearly-collinear segments: if the angle between them is very small,
  // any intersection is likely a phantom from imprecise overlap.
  const len1 = Math.hypot(dx1, dy1);
  const len2 = Math.hypot(dx2, dy2);
  if (len1 > 0 && len2 > 0) {
    const sinAngle = Math.abs(denom) / (len1 * len2);
    if (sinAngle < 0.132) return null; // ~7.6° threshold
  }

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

  // 2. Intersections (check all piecewise segments for curves)
  let bestIntersection: { point: Point; distance: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (
        lines[i].id === options.excludeLineId ||
        lines[j].id === options.excludeLineId
      ) {
        continue;
      }
      const intersections = findLineIntersections(lines[i], lines[j]);
      for (const ix of intersections) {
        const d = dist(cursor, ix);
        if (
          d <= intersectionRadius &&
          (!bestIntersection || d < bestIntersection.distance)
        ) {
          bestIntersection = { point: ix, distance: d };
        }
      }
    }
  }
  if (bestIntersection) {
    return { point: bestIntersection.point, kind: 'intersection' };
  }

  // 3. Line body (check along pathPoints if curve, else straight a->b)
  let bestLine: { point: Point; distance: number } | null = null;
  for (const l of lines) {
    if (l.id === options.excludeLineId) continue;
    const result = closestPointOnLine(cursor, l);
    if (result.distance <= lineRadius && (!bestLine || result.distance < bestLine.distance)) {
      bestLine = { point: result.point, distance: result.distance };
    }
  }
  if (bestLine) return { point: bestLine.point, kind: 'line' };

  return null;
}

/**
 * Find the closest point on a line (using pathPoints if it's a curve,
 * or the straight segment from a to b otherwise).
 */
export function closestPointOnLine(
  p: Point,
  l: Line,
): { point: Point; distance: number } {
  if (l.pathPoints && l.pathPoints.length >= 2) {
    // Check each segment of the path polyline
    let best = { point: l.pathPoints[0], distance: dist(p, l.pathPoints[0]) };
    for (let i = 0; i < l.pathPoints.length - 1; i++) {
      const { point, distance } = closestPointOnSegment(p, l.pathPoints[i], l.pathPoints[i + 1]);
      if (distance < best.distance) {
        best = { point, distance };
      }
    }
    return best;
  }
  const { point, distance } = closestPointOnSegment(p, l.a, l.b);
  return { point, distance };
}


/**
 * Get the piecewise straight segments that make up a line.
 * If it has pathPoints, use consecutive pairs. Otherwise, just a->b.
 */
export function getLineSegments(l: Line): [Point, Point][] {
  if (l.pathPoints && l.pathPoints.length >= 2) {
    const segs: [Point, Point][] = [];
    for (let i = 0; i < l.pathPoints.length - 1; i++) {
      segs.push([l.pathPoints[i], l.pathPoints[i + 1]]);
    }
    return segs;
  }
  return [[l.a, l.b]];
}

/**
 * Find all intersection points between two lines (supporting curves via
 * piecewise segment comparison).
 */
export function findLineIntersections(l1: Line, l2: Line): Point[] {
  const segs1 = getLineSegments(l1);
  const segs2 = getLineSegments(l2);
  const results: Point[] = [];

  for (const [a1, a2] of segs1) {
    for (const [b1, b2] of segs2) {
      const ix = segmentIntersection(a1, a2, b1, b2);
      if (ix) {
        // Deduplicate: don't add if too close to an existing intersection
        const isDup = results.some((r) => dist(r, ix) < 2);
        if (!isDup) results.push(ix);
      }
    }
  }

  return results;
}

/**
 * Find all self-intersection points within a single line's path.
 * Checks non-adjacent segments for crossings.
 */
export function findSelfIntersections(l: Line): Point[] {
  const segs = getLineSegments(l);
  if (segs.length < 3) return [];
  const results: Point[] = [];

  for (let i = 0; i < segs.length; i++) {
    // Skip adjacent segments (they share an endpoint and will always "intersect" there)
    for (let j = i + 2; j < segs.length; j++) {
      // Also skip if i=0 and j=last (for closed loops, they share start/end)
      if (i === 0 && j === segs.length - 1) continue;
      const ix = segmentIntersection(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
      if (ix) {
        // Skip intersections at endpoints (shared vertices)
        const atEndpoint =
          dist(ix, l.a) < 4 || dist(ix, l.b) < 4;
        if (atEndpoint) continue;
        const isDup = results.some((r) => dist(r, ix) < 4);
        if (!isDup) results.push(ix);
      }
    }
  }

  return results;
}
