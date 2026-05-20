import type { Line, Point } from './types';

const PARALLEL_ANGLE_THRESHOLD = 0.05; // radians (~3 degrees)
const DISTANCE_THRESHOLD = 4; // pixels: how close lines must be to count as "on top of each other"

/**
 * Given a set of lines, merge any that are nearly parallel and overlapping
 * into a single line spanning the full extent of both.
 *
 * Returns a new array with merges applied. May need multiple passes if
 * a chain of lines overlap each other sequentially.
 */
export function mergeOverlappingLines(lines: Line[]): Line[] {
  let result = [...lines];
  let merged = true;

  // Repeat until no more merges happen (handles chains).
  while (merged) {
    merged = false;
    for (let i = 0; i < result.length && !merged; i++) {
      for (let j = i + 1; j < result.length && !merged; j++) {
        const m = tryMerge(result[i], result[j]);
        if (m) {
          // Replace i with the merged line, remove j.
          result[i] = m;
          result.splice(j, 1);
          merged = true;
        }
      }
    }
  }

  return result;
}

/**
 * Try to merge two lines. Returns the merged line or null if they can't merge.
 *
 * Two lines merge when:
 * 1. They're nearly parallel (angle between directions < threshold)
 * 2. They're close together (perpendicular distance < threshold)
 * 3. Their projections onto the shared direction overlap
 */
function tryMerge(a: Line, b: Line): Line | null {
  // Direction vectors.
  const dax = a.b.x - a.a.x;
  const day = a.b.y - a.a.y;
  const dbx = b.b.x - b.a.x;
  const dby = b.b.y - b.a.y;

  const lenA = Math.hypot(dax, day);
  const lenB = Math.hypot(dbx, dby);
  if (lenA < 1 || lenB < 1) return null;

  // Normalize directions.
  const nax = dax / lenA;
  const nay = day / lenA;
  const nbx = dbx / lenB;
  const nby = dby / lenB;

  // Check parallelism: |sin(angle)| = |cross product of unit vectors|
  const cross = Math.abs(nax * nby - nay * nbx);
  if (cross > PARALLEL_ANGLE_THRESHOLD) return null;

  // Use line A's direction as the reference axis.
  // Check perpendicular distance from B's endpoints to line A.
  const distBa = perpendicularDistance(b.a, a.a, nax, nay);
  const distBb = perpendicularDistance(b.b, a.a, nax, nay);
  if (distBa > DISTANCE_THRESHOLD || distBb > DISTANCE_THRESHOLD) return null;

  // Also check A's endpoints' distance to line B's infinite line.
  const distAa = perpendicularDistance(a.a, b.a, nbx, nby);
  const distAb = perpendicularDistance(a.b, b.a, nbx, nby);
  if (distAa > DISTANCE_THRESHOLD || distAb > DISTANCE_THRESHOLD) return null;

  // Project all 4 endpoints onto line A's direction.
  const tAa = 0;
  const tAb = lenA;
  const tBa = (b.a.x - a.a.x) * nax + (b.a.y - a.a.y) * nay;
  const tBb = (b.b.x - a.a.x) * nax + (b.b.y - a.a.y) * nay;

  const allT = [tAa, tAb, tBa, tBb];
  const minT = Math.min(...allT);
  const maxT = Math.max(...allT);

  // Check overlap: the union of [tAa, tAb] and [tBa, tBb] must overlap,
  // not just be adjacent.
  const aMin = Math.min(tAa, tAb);
  const aMax = Math.max(tAa, tAb);
  const bMin = Math.min(tBa, tBb);
  const bMax = Math.max(tBa, tBb);
  const overlapStart = Math.max(aMin, bMin);
  const overlapEnd = Math.min(aMax, bMax);
  if (overlapEnd - overlapStart < -DISTANCE_THRESHOLD) return null; // No overlap (gap between them)

  // Merged line spans from minT to maxT along A's direction.
  const mergedA: Point = {
    x: a.a.x + minT * nax,
    y: a.a.y + minT * nay,
  };
  const mergedB: Point = {
    x: a.a.x + maxT * nax,
    y: a.a.y + maxT * nay,
  };

  return { id: a.id, a: mergedA, b: mergedB };
}

/** Perpendicular distance from point p to the infinite line through origin with direction (nx, ny). */
function perpendicularDistance(p: Point, origin: Point, nx: number, ny: number): number {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  // Cross product gives signed perpendicular distance.
  return Math.abs(dx * ny - dy * nx);
}
