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
  // Search the ORIGINAL lines (not exploded) since they have full pathPoints.
  const pentPath = buildFaceBoundary(pentCycle, vertices, lines);
  if (!pentPath) return null;

  // Triangle boundaries
  const triangles: ShapeBoundary[] = [];
  for (let i = 0; i < 5; i++) {
    const triVertices = [pentCycle[i], tipAssignment[i], pentCycle[(i + 1) % 5]];
    const triPath = buildFaceBoundary(triVertices, vertices, lines);
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
 * Searches ALL lines (not just those whose endpoints match) for any line
 * whose path passes through both vertices, then extracts the sub-path between them.
 */
function findPathBetween(from: Point, to: Point, lines: Line[]): Point[] {
  for (const l of lines) {
    const pts = l.pathPoints && l.pathPoints.length >= 2 ? l.pathPoints : [l.a, l.b];
    
    // Find the closest point in pts to `from` and `to`.
    let bestFromIdx = -1, bestFromDist = Infinity;
    let bestToIdx = -1, bestToDist = Infinity;
    
    for (let i = 0; i < pts.length; i++) {
      const df = Math.hypot(pts[i].x - from.x, pts[i].y - from.y);
      const dt = Math.hypot(pts[i].x - to.x, pts[i].y - to.y);
      if (df < bestFromDist) { bestFromDist = df; bestFromIdx = i; }
      if (dt < bestToDist) { bestToDist = dt; bestToIdx = i; }
    }
    
    // Both vertices must be near the path
    if (bestFromDist > VERTEX_MERGE_DISTANCE * 2 || bestToDist > VERTEX_MERGE_DISTANCE * 2) continue;
    // Must be different points on the path
    if (bestFromIdx === bestToIdx) continue;
    
    // Extract the sub-path between them
    const startIdx = Math.min(bestFromIdx, bestToIdx);
    const endIdx = Math.max(bestFromIdx, bestToIdx);
    let subPath = pts.slice(startIdx, endIdx + 1);
    
    // Ensure direction is from→to (not reversed)
    if (bestFromIdx > bestToIdx) {
      subPath = subPath.reverse();
    }
    
    // Only use this if it's a reasonable length segment (not the entire stroke)
    // Skip if the path contains other vertices between from and to
    // (which would mean this isn't the direct edge between them)
    if (subPath.length >= 2) {
      return subPath;
    }
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
