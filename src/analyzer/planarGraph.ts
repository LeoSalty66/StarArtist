import type { Line, Point } from '../canvas/types';
import { getLineSegments, findLineIntersections } from '../canvas/geometry';

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

const VERTEX_MERGE_DISTANCE = 6; // pixels — generous merge to avoid micro-duplicates

/**
 * Build a planar graph using a vertex-first approach:
 *
 * 1. Collect all meaningful vertices (endpoints, corners, intersections).
 * 2. For each line (after exploding at corners), determine which vertices
 *    it passes through, ordered by distance along the path.
 * 3. Each consecutive vertex pair on a line = one edge.
 * 4. Deduplicate edges.
 */
export function buildPlanarGraph(inputLines: Line[]): PlanarGraph {
  // Step 0: Explode lines at corners so corners become separate edges.
  const lines = explodeAtCorners(inputLines);

  // Step 1: Collect all vertices.
  const vertices: Vertex[] = [];
  const findOrAddVertex = (p: Point): number => {
    for (const v of vertices) {
      if (Math.hypot(v.point.x - p.x, v.point.y - p.y) <= VERTEX_MERGE_DISTANCE) {
        return v.id;
      }
    }
    const id = vertices.length;
    vertices.push({ id, point: p });
    return id;
  };

  // Add all endpoints as vertices.
  for (const l of lines) {
    findOrAddVertex(l.a);
    findOrAddVertex(l.b);
  }

  // Add all intersections between different lines as vertices.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const ixs = findLineIntersections(lines[i], lines[j]);
      for (const ix of ixs) {
        // Skip intersections that are at endpoints (already added).
        const nearEndpoint =
          Math.hypot(ix.x - lines[i].a.x, ix.y - lines[i].a.y) < VERTEX_MERGE_DISTANCE ||
          Math.hypot(ix.x - lines[i].b.x, ix.y - lines[i].b.y) < VERTEX_MERGE_DISTANCE ||
          Math.hypot(ix.x - lines[j].a.x, ix.y - lines[j].a.y) < VERTEX_MERGE_DISTANCE ||
          Math.hypot(ix.x - lines[j].b.x, ix.y - lines[j].b.y) < VERTEX_MERGE_DISTANCE;
        // Still add it (findOrAddVertex will merge if close enough)
        findOrAddVertex(ix);
      }
    }
  }

  // Step 2: For each line, find which vertices it passes through, in order.
  const rawEdges: { a: number; b: number; lineId: string }[] = [];

  for (const l of lines) {
    // Find all vertices that lie on this line (within distance threshold).
    const verticesOnLine: { vId: number; dist: number }[] = [];

    for (const v of vertices) {
      const d = distToLine(v.point, l);
      if (d <= VERTEX_MERGE_DISTANCE) {
        // Compute distance along the path from line start.
        const along = distanceAlongLine(v.point, l);
        verticesOnLine.push({ vId: v.id, dist: along });
      }
    }

    // Sort by distance along path.
    verticesOnLine.sort((a, b) => a.dist - b.dist);

    // Deduplicate consecutive same-vertex entries.
    const ordered: number[] = [];
    for (const entry of verticesOnLine) {
      if (ordered.length === 0 || ordered[ordered.length - 1] !== entry.vId) {
        ordered.push(entry.vId);
      }
    }

    // Each consecutive pair = an edge.
    for (let k = 0; k < ordered.length - 1; k++) {
      rawEdges.push({ a: ordered[k], b: ordered[k + 1], lineId: l.id });
    }
  }

  // Step 3: Deduplicate edges.
  const seenEdges = new Set<string>();
  const dedupedEdges: { a: number; b: number; lineId: string }[] = [];
  for (const edge of rawEdges) {
    const key = edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    dedupedEdges.push(edge);
  }

  // Step 4: Build half-edges.
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

/**
 * Explode lines with corners into sub-lines.
 */
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

/**
 * Compute the shortest distance from a point to a line's actual path.
 */
function distToLine(p: Point, l: Line): number {
  const segs = getLineSegments(l);
  let minDist = Infinity;
  for (const [s, e] of segs) {
    const d = distToSegment(p, s, e);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Compute how far along a line's path a point is (arc length from start).
 */
function distanceAlongLine(p: Point, l: Line): number {
  const segs = getLineSegments(l);
  let cumLen = 0;
  let bestCumDist = 0;
  let bestPerp = Infinity;

  for (const [s, e] of segs) {
    const segLen = Math.hypot(e.x - s.x, e.y - s.y);
    const d = distToSegment(p, s, e);

    if (d < bestPerp) {
      bestPerp = d;
      // Project p onto this segment to get local position.
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lenSq));
      }
      bestCumDist = cumLen + t * segLen;
    }
    cumLen += segLen;
  }

  return bestCumDist;
}

/** Distance from point to segment. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}
