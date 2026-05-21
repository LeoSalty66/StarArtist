import type { Line, Point } from './types';

/**
 * Convert a line (with optional control points) to an SVG path string.
 * - No control points: straight line "M ax ay L bx by"
 * - With control points: quadratic bezier chain
 */
export function lineToPath(line: Line): string {
  const { a, b, controlPoints } = line;
  if (!controlPoints || controlPoints.length === 0) {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  if (controlPoints.length === 1) {
    const cp = controlPoints[0];
    return `M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}`;
  }

  // Multiple control points: chain of quadratic beziers.
  // Split into segments. For N control points, we have N+1 segments
  // with midpoints between consecutive control points as the on-curve joints.
  let d = `M ${a.x} ${a.y}`;
  const cps = controlPoints;

  for (let i = 0; i < cps.length; i++) {
    let endPt: Point;
    if (i < cps.length - 1) {
      // Midpoint between consecutive control points
      endPt = {
        x: (cps[i].x + cps[i + 1].x) / 2,
        y: (cps[i].y + cps[i + 1].y) / 2,
      };
    } else {
      // Last segment ends at b
      endPt = b;
    }
    d += ` Q ${cps[i].x} ${cps[i].y} ${endPt.x} ${endPt.y}`;
  }

  return d;
}

/**
 * Sample points along a line/curve at regular intervals.
 * Used for the analyzer's intersection and shape detection.
 * Returns `count` evenly spaced points along the curve.
 */
export function sampleCurve(line: Line, count: number = 20): Point[] {
  if (!line.controlPoints || line.controlPoints.length === 0) {
    // Straight line: just two endpoints
    return [line.a, line.b];
  }

  const points: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push(evaluateCurveAt(line, t));
  }
  return points;
}

/**
 * Evaluate the position on the curve at parameter t (0..1).
 */
export function evaluateCurveAt(line: Line, t: number): Point {
  const { a, b, controlPoints } = line;
  if (!controlPoints || controlPoints.length === 0) {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }

  if (controlPoints.length === 1) {
    return quadBezier(a, controlPoints[0], b, t);
  }

  // Multi-control-point: same chain logic as lineToPath.
  // Build the joint points (on-curve points between segments).
  const cps = controlPoints;
  const joints: Point[] = [a];
  for (let i = 0; i < cps.length - 1; i++) {
    joints.push({
      x: (cps[i].x + cps[i + 1].x) / 2,
      y: (cps[i].y + cps[i + 1].y) / 2,
    });
  }
  joints.push(b);

  // Find which segment t falls into.
  const numSegments = cps.length;
  const segT = t * numSegments;
  const segIdx = Math.min(Math.floor(segT), numSegments - 1);
  const localT = segT - segIdx;

  return quadBezier(joints[segIdx], cps[segIdx], joints[segIdx + 1], localT);
}

/** Evaluate a quadratic bezier at parameter t. */
function quadBezier(p0: Point, cp: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
  };
}

/**
 * Find the closest point on a curve to a given position.
 * Returns the parameter t and the point.
 */
export function closestPointOnCurve(
  p: Point,
  line: Line,
  samples: number = 50,
): { t: number; point: Point; distance: number } {
  let bestT = 0;
  let bestDist = Infinity;
  let bestPoint: Point = line.a;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = evaluateCurveAt(line, t);
    const dx = pt.x - p.x;
    const dy = pt.y - p.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
      bestPoint = pt;
    }
  }

  return { t: bestT, point: bestPoint, distance: Math.sqrt(bestDist) };
}
