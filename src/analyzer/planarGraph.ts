import type { Line, Point } from '../canvas/types';
import { segmentIntersection, getLineSegments } from '../canvas/geometry';

/** A vertex in the planar graph. */
export interface Vertex {
  id: number;
  point: Point;
}

/**
 * A directed half-edge. Every edge in the graph appears as two half-edges,
 * one in each direction, sharing the same `lineId` (the original user line).
 */
export interface HalfEdge {
  id: number;
  from: number; // vertex id
  to: number; // vertex id
  twin: number; // half-edge id
  lineId: string; // id of the original Line this came from
}

export interface PlanarGraph {
  vertices: Vertex[];
  halfEdges: HalfEdge[];
  /** Map vertex id -> array of half-edge ids leaving that vertex. */
  outgoing: Map<number, number[]>;
}

const VERTEX_MERGE_DISTANCE = 1.5; // pixels

/**
 * Explode lines with corners into sub-lines (one per segment between corners).
 * Lines without corners pass through unchanged (as a single a->b line).
 * This ensures corners become vertices in the planar graph.
 */
function explodeAtCorners(lines: Line[]): Line[] {
  const result: Line[] = [];
  for (const l of lines) {
    if (!l.pathPoints || !l.cornerIndices || l.cornerIndices.length <= 2) {
      // No internal corners, use as-is (straight or single curve segment)
      result.push(l);
      continue;
    }

    // Split at each corner. cornerIndices includes first and last point.
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

/**
 * Build a planar graph from a set of line segments (straight or curved).
 *
 * - First explodes lines at detected corners into sub-segments.
 * - Computes all pairwise intersections (including collinear overlaps).
 * - Splits each line at every intersection on it (in order along the line).
 * - Deduplicates vertices by spatial proximity.
 * - Deduplicates edges connecting the same vertex pair.
 * - Returns vertices and a list of directed half-edges (each undirected edge
 *   appears twice, once per direction, paired via `twin`).
 */
export function buildPlanarGraph(inputLines: Line[]): PlanarGraph {
  // Explode lines at corners first so corners become graph vertices.
  const lines = explodeAtCorners(inputLines);

  // Per-line list of split points along the segment, expressed as parameter t in [0,1].
  const splits: { t: number; point: Point }[][] = lines.map((l) => [
    { t: 0, point: l.a },
    { t: 1, point: l.b },
  ]);

  // Find all intersections and collinear overlaps.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const li = lines[i];
      const lj = lines[j];

      // For curved lines, check piecewise segments for intersections.
      const segsI = getLineSegments(li);
      const segsJ = getLineSegments(lj);
      for (const [a1, a2] of segsI) {
        for (const [b1, b2] of segsJ) {
          const ix = segmentIntersection(a1, a2, b1, b2);
          if (!ix) continue;
          // Compute t on the overall a->b line for each
          splits[i].push({ t: paramOnSegment(ix, li.a, li.b), point: ix });
          splits[j].push({ t: paramOnSegment(ix, lj.a, lj.b), point: ix });
        }
      }

      // Also check for collinear overlap (straight lines only).
      if (!li.pathPoints && !lj.pathPoints) {
        const overlapPoints = findCollinearOverlapSplits(li, lj);
        if (overlapPoints) {
          for (const p of overlapPoints.forI) {
            splits[i].push({ t: paramOnSegment(p, li.a, li.b), point: p });
          }
          for (const p of overlapPoints.forJ) {
            splits[j].push({ t: paramOnSegment(p, lj.a, lj.b), point: p });
          }
        }
      }
    }
  }

  // "Graph-time snap": For each line, check if any endpoint of any OTHER line
  // lies close to the body of this line (but not at its own endpoints).
  // If so, treat that point as lying ON this line and add it as a split.
  // This handles the case where a long line passes near an existing vertex
  // without exactly hitting it.
  const SNAP_TO_LINE_DISTANCE = 4; // pixels, slightly larger than VERTEX_MERGE_DISTANCE
  for (let i = 0; i < lines.length; i++) {
    const li = lines[i];
    const liDx = li.b.x - li.a.x;
    const liDy = li.b.y - li.a.y;
    const liLenSq = liDx * liDx + liDy * liDy;
    if (liLenSq < 1) continue;

    for (let j = 0; j < lines.length; j++) {
      if (i === j) continue;
      for (const ep of [lines[j].a, lines[j].b]) {
        // Project ep onto line i
        const t = ((ep.x - li.a.x) * liDx + (ep.y - li.a.y) * liDy) / liLenSq;
        if (t <= 0.01 || t >= 0.99) continue; // Skip if near line's own endpoints
        const closest: Point = {
          x: li.a.x + t * liDx,
          y: li.a.y + t * liDy,
        };
        const dx = ep.x - closest.x;
        const dy = ep.y - closest.y;
        if (dx * dx + dy * dy <= SNAP_TO_LINE_DISTANCE * SNAP_TO_LINE_DISTANCE) {
          // This endpoint is close enough to line i: split line i at this point.
          splits[i].push({ t, point: ep });
        }
      }
    }
  }

  // Sort each split list by t so we can walk along the line in order.
  for (const arr of splits) arr.sort((a, b) => a.t - b.t);

  // Deduplicate vertices spatially.
  const vertices: Vertex[] = [];
  const findOrAddVertex = (p: Point): number => {
    for (const v of vertices) {
      const dx = v.point.x - p.x;
      const dy = v.point.y - p.y;
      if (dx * dx + dy * dy <= VERTEX_MERGE_DISTANCE * VERTEX_MERGE_DISTANCE) {
        return v.id;
      }
    }
    const id = vertices.length;
    vertices.push({ id, point: p });
    return id;
  };

  // Build raw edges (before dedup) by walking each line in t-order.
  const rawEdges: { a: number; b: number; lineId: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const points = splits[i];
    // Collapse consecutive identical vertices.
    const uniqueVertexIds: number[] = [];
    for (const sp of points) {
      const vId = findOrAddVertex(sp.point);
      if (
        uniqueVertexIds.length === 0 ||
        uniqueVertexIds[uniqueVertexIds.length - 1] !== vId
      ) {
        uniqueVertexIds.push(vId);
      }
    }

    for (let k = 0; k < uniqueVertexIds.length - 1; k++) {
      const a = uniqueVertexIds[k];
      const b = uniqueVertexIds[k + 1];
      if (a === b) continue;
      rawEdges.push({ a, b, lineId: lines[i].id });
    }
  }

  // Deduplicate edges: if two raw edges connect the same vertex pair
  // (in either direction), keep only one.
  const seenEdges = new Set<string>();
  const dedupedEdges: { a: number; b: number; lineId: string }[] = [];
  for (const edge of rawEdges) {
    const key = edge.a < edge.b
      ? `${edge.a}-${edge.b}`
      : `${edge.b}-${edge.a}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    dedupedEdges.push(edge);
  }

  // Build half-edges from deduped edges.
  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<number, number[]>();
  const addOutgoing = (vId: number, eId: number) => {
    const list = outgoing.get(vId) ?? [];
    list.push(eId);
    outgoing.set(vId, list);
  };

  for (const edge of dedupedEdges) {
    const forwardId = halfEdges.length;
    const reverseId = forwardId + 1;
    halfEdges.push({
      id: forwardId,
      from: edge.a,
      to: edge.b,
      twin: reverseId,
      lineId: edge.lineId,
    });
    halfEdges.push({
      id: reverseId,
      from: edge.b,
      to: edge.a,
      twin: forwardId,
      lineId: edge.lineId,
    });
    addOutgoing(edge.a, forwardId);
    addOutgoing(edge.b, reverseId);
  }

  return { vertices, halfEdges, outgoing };
}

/** Compute the parameter t in [0,1] for point p along segment a->b. */
function paramOnSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
}

/**
 * Detect collinear overlap between two segments and return the split points
 * that should be added to each line.
 *
 * Two segments overlap when they're (nearly) collinear AND share a non-trivial
 * range of t-values. The overlapping portion's endpoints become split points
 * on both lines.
 *
 * Returns null if segments are not collinear or don't overlap.
 */
function findCollinearOverlapSplits(
  li: Line,
  lj: Line,
): { forI: Point[]; forJ: Point[] } | null {
  // Check if the two segments are approximately collinear.
  // Method: the cross product of direction vectors should be near zero,
  // AND the vector from li.a to lj.a should be nearly parallel to li's direction.
  const dix = li.b.x - li.a.x;
  const diy = li.b.y - li.a.y;
  const djx = lj.b.x - lj.a.x;
  const djy = lj.b.y - lj.a.y;

  const cross = dix * djy - diy * djx;
  const lenI = Math.hypot(dix, diy);
  const lenJ = Math.hypot(djx, djy);
  if (lenI < 1e-9 || lenJ < 1e-9) return null;

  // Normalize the cross product by segment lengths to get a scale-independent
  // measure of the angle between them.
  const sinAngle = Math.abs(cross) / (lenI * lenJ);
  if (sinAngle > 0.02) return null; // Not parallel enough (about 1 degree)

  // Check distance from lj.a to the infinite line through li.
  // If the segments are collinear, this distance should be near zero.
  const toJx = lj.a.x - li.a.x;
  const toJy = lj.a.y - li.a.y;
  const distToLine = Math.abs(toJx * diy - toJy * dix) / lenI;
  if (distToLine > VERTEX_MERGE_DISTANCE) return null; // Parallel but offset

  // Project lj's endpoints onto li's parametric space.
  const tJa = paramOnSegment(lj.a, li.a, li.b);
  const tJb = paramOnSegment(lj.b, li.a, li.b);
  const tMin = Math.min(tJa, tJb);
  const tMax = Math.max(tJa, tJb);

  // Overlap with [0, 1] on li.
  const overlapStart = Math.max(0, tMin);
  const overlapEnd = Math.min(1, tMax);
  if (overlapEnd - overlapStart < 1e-9) return null; // No meaningful overlap

  // The overlap boundary points on li's segment.
  const pStart: Point = {
    x: li.a.x + overlapStart * dix,
    y: li.a.y + overlapStart * diy,
  };
  const pEnd: Point = {
    x: li.a.x + overlapEnd * dix,
    y: li.a.y + overlapEnd * diy,
  };

  // These points need to be splits on BOTH lines.
  const forI: Point[] = [pStart, pEnd];
  const forJ: Point[] = [pStart, pEnd];

  // Also add li's endpoints that fall within lj's range (and vice versa)
  // since those create additional necessary split points.
  if (tJa >= -1e-9 && tJa <= 1 + 1e-9) {
    forI.push(lj.a);
  }
  if (tJb >= -1e-9 && tJb <= 1 + 1e-9) {
    forI.push(lj.b);
  }

  // Project li's endpoints onto lj's parametric space.
  const tIaOnJ = paramOnSegment(li.a, lj.a, lj.b);
  const tIbOnJ = paramOnSegment(li.b, lj.a, lj.b);
  if (tIaOnJ >= -1e-9 && tIaOnJ <= 1 + 1e-9) {
    forJ.push(li.a);
  }
  if (tIbOnJ >= -1e-9 && tIbOnJ <= 1 + 1e-9) {
    forJ.push(li.b);
  }

  return { forI, forJ };
}
