import type { Point } from './types';

/**
 * Process a raw freehand stroke into a smooth path with detected corners.
 *
 * Steps:
 * 1. Resample to even spacing (removes speed variation)
 * 2. Smooth with a moving average (removes hand jitter)
 * 3. Detect corners (sharp angle changes above threshold)
 * 4. Simplify smooth sections (reduce point count)
 *
 * Returns the processed points and which indices are corners.
 */
export interface ProcessedStroke {
  /** The smoothed, simplified points of the path. */
  points: Point[];
  /** Indices into `points` that are corners (sharp angle changes). */
  cornerIndices: number[];
}

const RESAMPLE_SPACING = 8; // pixels between resampled points
const SMOOTH_WINDOW = 5; // moving average window size
const CORNER_ANGLE_THRESHOLD = 20; // degrees: sharper than this = a corner
const SIMPLIFY_TOLERANCE = 3; // pixels: how aggressively to reduce points in smooth sections

/**
 * Process raw pointer positions into a clean stroke.
 */
export function processStroke(rawPoints: Point[]): ProcessedStroke | null {
  if (rawPoints.length < 3) return null;

  // 1. Resample to even spacing
  const resampled = resample(rawPoints, RESAMPLE_SPACING);
  if (resampled.length < 3) return null;

  // 2. Smooth
  const smoothed = smooth(resampled, SMOOTH_WINDOW);

  // 3. Detect corners
  const corners = detectCorners(smoothed, CORNER_ANGLE_THRESHOLD);

  // 4. Simplify, keeping corners
  const { points, cornerIndices } = simplifyKeepingCorners(smoothed, corners, SIMPLIFY_TOLERANCE);

  if (points.length < 2) return null;

  return { points, cornerIndices };
}

/** Resample a path to have evenly spaced points. */
function resample(points: Point[], spacing: number): Point[] {
  const result: Point[] = [points[0]];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.hypot(dx, dy);
    accumulated += segLen;

    while (accumulated >= spacing) {
      const overshoot = accumulated - spacing;
      const t = 1 - overshoot / segLen;
      const p: Point = {
        x: points[i - 1].x + t * dx,
        y: points[i - 1].y + t * dy,
      };
      result.push(p);
      accumulated -= spacing;
    }
  }

  // Always include the last point
  const last = points[points.length - 1];
  const prevLast = result[result.length - 1];
  if (Math.hypot(last.x - prevLast.x, last.y - prevLast.y) > 2) {
    result.push(last);
  }

  return result;
}

/** Smooth points with a moving average. */
function smooth(points: Point[], windowSize: number): Point[] {
  const half = Math.floor(windowSize / 2);
  return points.map((_, i) => {
    let sumX = 0, sumY = 0, count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < points.length) {
        sumX += points[j].x;
        sumY += points[j].y;
        count++;
      }
    }
    return { x: sumX / count, y: sumY / count };
  });
}

/** Detect corner indices where the angle change exceeds the threshold. */
function detectCorners(points: Point[], angleDeg: number): Set<number> {
  const corners = new Set<number>();
  const threshold = angleDeg * Math.PI / 180;

  // Always mark first and last as "corners" (endpoints)
  corners.add(0);
  corners.add(points.length - 1);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);

    let diff = Math.abs(angle2 - angle1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    if (diff > threshold) {
      corners.add(i);
    }
  }

  return corners;
}

/**
 * Simplify the path using Ramer-Douglas-Peucker, but never remove corners.
 * Returns the simplified points and updated corner indices.
 */
function simplifyKeepingCorners(
  points: Point[],
  corners: Set<number>,
  tolerance: number,
): { points: Point[]; cornerIndices: number[] } {
  // Split into segments between consecutive corners, simplify each.
  const sortedCorners = [...corners].sort((a, b) => a - b);
  const resultPoints: Point[] = [];
  const resultCorners: number[] = [];

  for (let seg = 0; seg < sortedCorners.length - 1; seg++) {
    const startIdx = sortedCorners[seg];
    const endIdx = sortedCorners[seg + 1];
    const segment = points.slice(startIdx, endIdx + 1);
    const simplified = rdpSimplify(segment, tolerance);

    // Add to result (avoid duplicating junction points)
    const offset = resultPoints.length;
    if (seg === 0) {
      resultPoints.push(...simplified);
      resultCorners.push(offset); // first point is a corner
    } else {
      resultPoints.push(...simplified.slice(1));
    }
    // Mark the end of this segment as a corner
    resultCorners.push(resultPoints.length - 1);
  }

  return { points: resultPoints, cornerIndices: resultCorners };
}

/** Ramer-Douglas-Peucker line simplification. */
function rdpSimplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), tolerance);
    const right = rdpSimplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}
