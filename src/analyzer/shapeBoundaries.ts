import type { Line, Point } from '../canvas/types';
import { getLineSegments } from '../canvas/geometry';

const VERTEX_MERGE_DISTANCE = 6;

export interface ShapeBoundary {
  /** SVG path string for filling this shape. */
  path: string;
  /** The ordered points along the boundary (for point-in-polygon tests). */
  boundaryPoints: Point[];
}

/**
 * Given a validated star's pentagon cycle, tip assignment, and the drawn lines,
 * extract the actual curved boundaries of the pentagon and each triangle.
 *
 * Returns { pentagon, triangles: [...] } with SVG paths and sampled boundary points.
 */
export function extractShapeBoundaries(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagon: ShapeBoundary; triangles: ShapeBoundary[] } | null {
  // Explode lines at corners (same as validation does).
  const exploded = explodeAtCorners(lines);

  // Pentagon boundary: trace the path along each pentagon edge.
  const pentPath = buildFaceBoundary(pentCycle, vertices, exploded);
  if (!pentPath) return null;

  // Triangle boundaries: each triangle is [pentCycle[i], tipAssignment[i], pentCycle[(i+1)%5]]
  const triangles: ShapeBoundary[] = [];
  for (let i = 0; i < 5; i++) {
    const triVertices = [pentCycle[i], tipAssignment[i], pentCycle[(i + 1) % 5]];
    const triPath = buildFaceBoundary(triVertices, vertices, exploded);
    if (triPath) {
      triangles.push(triPath);
    }
  }

  return { pentagon: pentPath, triangles };
}

/**
 * Build the boundary of a face (ordered list of vertex indices) by finding
 * the actual drawn path between each consecutive pair of vertices.
 */
function buildFaceBoundary(
  faceVertexIndices: number[],
  vertices: Point[],
  explodedLines: Line[],
): ShapeBoundary | null {
  const allPoints: Point[] = [];
  let svgPath = '';

  for (let i = 0; i < faceVertexIndices.length; i++) {
    const fromIdx = faceVertexIndices[i];
    const toIdx = faceVertexIndices[(i + 1) % faceVertexIndices.length];
    const fromPt = vertices[fromIdx];
    const toPt = vertices[toIdx];

    // Find the drawn path segment between these two vertices.
    const segment = findPathBetween(fromPt, toPt, explodedLines);

    if (i === 0) {
      svgPath += `M ${segment[0].x} ${segment[0].y}`;
    }
    // Add all points except the first (which overlaps with previous segment's last).
    for (let j = 1; j < segment.length; j++) {
      svgPath += ` L ${segment[j].x} ${segment[j].y}`;
      allPoints.push(segment[j]);
    }
  }

  svgPath += ' Z';
  return { path: svgPath, boundaryPoints: allPoints };
}

/**
 * Find the actual drawn path between two vertex positions.
 * Searches through exploded lines for one whose endpoints are near the target vertices.
 * Returns the pathPoints (or straight line if nothing found).
 */
function findPathBetween(from: Point, to: Point, lines: Line[]): Point[] {
  let bestLine: Line | null = null;
  let bestDist = Infinity;
  let reversed = false;

  for (const l of lines) {
    // Check forward: l.a near from, l.b near to
    const dForward = Math.hypot(l.a.x - from.x, l.a.y - from.y) +
                     Math.hypot(l.b.x - to.x, l.b.y - to.y);
    if (dForward < bestDist) {
      bestDist = dForward;
      bestLine = l;
      reversed = false;
    }
    // Check reverse: l.a near to, l.b near from
    const dReverse = Math.hypot(l.a.x - to.x, l.a.y - to.y) +
                     Math.hypot(l.b.x - from.x, l.b.y - from.y);
    if (dReverse < bestDist) {
      bestDist = dReverse;
      bestLine = l;
      reversed = true;
    }
  }

  // Only use if the match is reasonably close (both endpoints within merge distance)
  if (bestLine && bestDist < VERTEX_MERGE_DISTANCE * 4) {
    let pts = bestLine.pathPoints && bestLine.pathPoints.length >= 2
      ? [...bestLine.pathPoints]
      : [bestLine.a, bestLine.b];
    if (reversed) pts.reverse();
    return pts;
  }

  // Fallback: straight line.
  return [from, to];
}

/**
 * Point-in-polygon test using ray casting on sampled boundary points.
 */
export function isPointInsideBoundary(p: Point, boundary: Point[]): boolean {
  let inside = false;
  const n = boundary.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = boundary[i].x, yi = boundary[i].y;
    const xj = boundary[j].x, yj = boundary[j].y;
    if (((yi > p.y) !== (yj > p.y)) &&
        (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function explodeAtCorners(lines: Line[]): Line[] {
  const result: Line[] = [];
  for (const l of lines) {
    if (!l.pathPoints || !l.cornerIndices || l.cornerIndices.length <= 2) {
      result.push(l);
      continue;
    }
    const sorted = [...l.cornerIndices].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const startIdx = sorted[i];
      const endIdx = sorted[i + 1];
      const subPoints = l.pathPoints.slice(startIdx, endIdx + 1);
      if (subPoints.length < 2) continue;
      result.push({
        id: `${l.id}__seg${i}`,
        a: subPoints[0],
        b: subPoints[subPoints.length - 1],
        pathPoints: subPoints,
      });
    }
  }
  return result;
}
