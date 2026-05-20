import type { PlanarGraph, HalfEdge } from './planarGraph';
import type { Point } from '../canvas/types';

/**
 * A face of the planar subdivision: an ordered list of half-edges forming
 * a closed loop, plus a flag indicating whether it's the outer (unbounded)
 * face.
 */
export interface Face {
  id: number;
  halfEdgeIds: number[];
  vertexIds: number[];
  signedArea: number; // positive = counter-clockwise, negative = clockwise
  isOuter: boolean;
}

/**
 * Find all faces of a planar graph using the standard "next-around-face"
 * walk: at each vertex, the next half-edge of the current face is the one
 * that comes just clockwise from the twin of the current half-edge in the
 * angular ordering of edges around that vertex.
 *
 * After collecting all face cycles, the unbounded outer face is identified
 * as the one with negative signed area in screen coordinates (where y
 * increases downward, so a counter-clockwise polygon has negative area).
 *
 * Returns ALL face cycles. Caller can filter by `isOuter`.
 */
export function findFaces(graph: PlanarGraph): Face[] {
  // For each vertex, sort its outgoing half-edges by the angle of their
  // direction vector. We'll use this to find the "next" edge around a face.
  const sortedOutgoing = new Map<number, number[]>(); // vertexId -> sorted half-edge ids
  for (const [vId, eIds] of graph.outgoing.entries()) {
    const sorted = [...eIds].sort((a, b) => {
      return edgeAngle(graph, a) - edgeAngle(graph, b);
    });
    sortedOutgoing.set(vId, sorted);
  }

  // Build "next around face" map: given the half-edge you just traversed
  // (arriving at vertex `to`), the next edge in the face cycle is the one
  // that comes just before the twin in the clockwise (i.e. decreasing
  // angle) ordering around `to`. Equivalently: rotate from the twin
  // backwards by one step in the sorted list.
  const nextAroundFace = new Map<number, number>(); // halfEdgeId -> halfEdgeId
  for (const e of graph.halfEdges) {
    const twin = graph.halfEdges[e.twin];
    const sorted = sortedOutgoing.get(twin.from)!;
    const idx = sorted.indexOf(twin.id);
    // Step backwards (clockwise) one position; wrap around.
    const prevIdx = (idx - 1 + sorted.length) % sorted.length;
    nextAroundFace.set(e.id, sorted[prevIdx]);
  }

  // Walk faces.
  const visited = new Set<number>();
  const faces: Face[] = [];
  for (const e of graph.halfEdges) {
    if (visited.has(e.id)) continue;
    const cycle: number[] = [];
    let cur = e.id;
    let safety = 0;
    while (!visited.has(cur)) {
      visited.add(cur);
      cycle.push(cur);
      cur = nextAroundFace.get(cur)!;
      if (++safety > 10000) {
        // Defensive: shouldn't happen on valid graphs.
        break;
      }
    }
    if (cycle.length === 0) continue;

    const vertexIds = cycle.map((heId) => graph.halfEdges[heId].from);
    const points = vertexIds.map((vId) => graph.vertices[vId].point);
    const signedArea = computeSignedArea(points);
    faces.push({
      id: faces.length,
      halfEdgeIds: cycle,
      vertexIds,
      signedArea,
      isOuter: false, // set below
    });
  }

  // The outer face is the one with the most negative signed area in screen
  // coordinates. (In screen space, y goes down, so the outer boundary
  // traced counter-clockwise visually appears as a clockwise winding when
  // computed as if y went up. We pick the face whose absolute area is
  // largest AND whose orientation is "inverted" relative to the bounded
  // ones.) The simplest reliable heuristic: the outer face has a negative
  // signed area when its winding is opposite the bounded faces.
  //
  // Bounded faces in screen coordinates have NEGATIVE signed area when
  // their boundary is traced counter-clockwise visually. The outer face
  // has POSITIVE signed area for the same reason (its boundary is traced
  // the other way around). So mark the face with the largest positive
  // signed area as outer.
  let outerIdx = -1;
  let maxArea = -Infinity;
  for (let i = 0; i < faces.length; i++) {
    if (faces[i].signedArea > maxArea) {
      maxArea = faces[i].signedArea;
      outerIdx = i;
    }
  }
  if (outerIdx >= 0) faces[outerIdx].isOuter = true;

  return faces;
}

function edgeAngle(graph: PlanarGraph, halfEdgeId: number): number {
  const e = graph.halfEdges[halfEdgeId];
  const a = graph.vertices[e.from].point;
  const b = graph.vertices[e.to].point;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Signed area via the shoelace formula. */
function computeSignedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += (b.x - a.x) * (b.y + a.y);
  }
  return sum / 2;
}
