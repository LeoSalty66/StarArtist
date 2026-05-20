import type { Line, Point } from '../canvas/types';
import { segmentIntersection } from '../canvas/geometry';

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
 * Build a planar graph from a set of straight line segments.
 *
 * - Computes all pairwise intersections.
 * - Splits each line at every intersection on it (in order along the line).
 * - Deduplicates vertices by spatial proximity.
 * - Returns vertices and a list of directed half-edges (each undirected edge
 *   appears twice, once per direction, paired via `twin`).
 */
export function buildPlanarGraph(lines: Line[]): PlanarGraph {
  // Per-line list of split points along the segment, expressed as parameter t in [0,1].
  const splits: { t: number; point: Point }[][] = lines.map((l) => [
    { t: 0, point: l.a },
    { t: 1, point: l.b },
  ]);

  // Find all intersections and add them to both lines.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const li = lines[i];
      const lj = lines[j];
      const ix = segmentIntersection(li.a, li.b, lj.a, lj.b);
      if (!ix) continue;
      splits[i].push({ t: paramOnSegment(ix, li.a, li.b), point: ix });
      splits[j].push({ t: paramOnSegment(ix, lj.a, lj.b), point: ix });
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

  // Build half-edges by walking each line in t-order.
  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<number, number[]>();
  const addOutgoing = (vId: number, eId: number) => {
    const list = outgoing.get(vId) ?? [];
    list.push(eId);
    outgoing.set(vId, list);
  };

  for (let i = 0; i < lines.length; i++) {
    const points = splits[i];
    // Collapse consecutive identical t-values (e.g. a line ending exactly on
    // another line's endpoint) so we don't emit zero-length edges.
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

    // Emit a pair of half-edges for each consecutive vertex pair.
    for (let k = 0; k < uniqueVertexIds.length - 1; k++) {
      const a = uniqueVertexIds[k];
      const b = uniqueVertexIds[k + 1];
      if (a === b) continue;

      const forwardId = halfEdges.length;
      const reverseId = forwardId + 1;
      halfEdges.push({
        id: forwardId,
        from: a,
        to: b,
        twin: reverseId,
        lineId: lines[i].id,
      });
      halfEdges.push({
        id: reverseId,
        from: b,
        to: a,
        twin: forwardId,
        lineId: lines[i].id,
      });
      addOutgoing(a, forwardId);
      addOutgoing(b, reverseId);
    }
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
