import type { Line } from '../canvas/types';
import { buildPlanarGraph, type PlanarGraph } from './planarGraph';
import { findFaces, type Face } from './findFaces';

export interface AnalysisResult {
  graph: PlanarGraph;
  faces: Face[];
  boundedFaces: Face[];
  /** True if the drawing is exactly a valid 5-pointed star. */
  isValidStar: boolean;
  /** Human-readable reason why it's not valid, or "Valid star!" */
  message: string;
  /** Index of the pentagon face in `boundedFaces`, if found. */
  pentagonIdx: number | null;
  /** Indices of the triangle faces in `boundedFaces`, if found. */
  triangleIdxs: number[];
  /** Half-edge ids that don't belong to any bounded face (dangling edges). */
  danglingEdgeIds: number[];
}

/**
 * Analyze a set of straight lines and determine whether they form
 * a valid 5-pointed star.
 *
 * A valid star has:
 * - Exactly 6 bounded faces.
 * - Exactly 1 face with 5 sides (pentagon).
 * - Exactly 5 faces with 3 sides (triangles).
 * - Each triangle shares exactly one edge with the pentagon.
 * - No dangling edges (edges not on the boundary of any bounded face).
 */
export function analyze(lines: Line[]): AnalysisResult {
  const empty: AnalysisResult = {
    graph: { vertices: [], halfEdges: [], outgoing: new Map() },
    faces: [],
    boundedFaces: [],
    isValidStar: false,
    message: '',
    pentagonIdx: null,
    triangleIdxs: [],
    danglingEdgeIds: [],
  };

  if (lines.length === 0) {
    return { ...empty, message: 'No lines drawn.' };
  }

  const graph = buildPlanarGraph(lines);

  if (graph.halfEdges.length === 0) {
    return { ...empty, graph, message: 'No edges in graph.' };
  }

  const faces = findFaces(graph);
  const boundedFaces = faces.filter((f) => !f.isOuter);

  // Find dangling edges: half-edges that only appear in the outer face
  // (i.e., not in any bounded face).
  const edgesInBoundedFaces = new Set<number>();
  for (const f of boundedFaces) {
    for (const heId of f.halfEdgeIds) {
      edgesInBoundedFaces.add(heId);
    }
  }
  // An undirected edge is "dangling" if neither of its half-edges appear
  // in any bounded face.
  const danglingEdgeIds: number[] = [];
  const seenUndirected = new Set<number>();
  for (const he of graph.halfEdges) {
    const minId = Math.min(he.id, he.twin);
    if (seenUndirected.has(minId)) continue;
    seenUndirected.add(minId);
    if (!edgesInBoundedFaces.has(he.id) && !edgesInBoundedFaces.has(he.twin)) {
      danglingEdgeIds.push(he.id);
    }
  }

  const result: AnalysisResult = {
    graph,
    faces,
    boundedFaces,
    isValidStar: false,
    message: '',
    pentagonIdx: null,
    triangleIdxs: [],
    danglingEdgeIds,
  };

  // Check face counts.
  if (boundedFaces.length === 0) {
    result.message = 'No enclosed shapes yet.';
    return result;
  }

  // Classify faces by side count.
  const pentagons: number[] = [];
  const triangles: number[] = [];
  const other: { idx: number; sides: number }[] = [];

  for (let i = 0; i < boundedFaces.length; i++) {
    const sides = boundedFaces[i].halfEdgeIds.length;
    if (sides === 5) pentagons.push(i);
    else if (sides === 3) triangles.push(i);
    else other.push({ idx: i, sides });
  }

  // Build a status message.
  const shapeSummary = boundedFaces
    .map((f) => `${f.halfEdgeIds.length}-sided`)
    .join(', ');
  const baseFeedback = `${boundedFaces.length} shape${boundedFaces.length !== 1 ? 's' : ''}: ${shapeSummary}.`;

  if (danglingEdgeIds.length > 0) {
    result.message = `${baseFeedback} But there are extra line segments not part of any shape.`;
    return result;
  }

  if (boundedFaces.length !== 6) {
    result.message = `${baseFeedback} Need exactly 6 shapes (1 pentagon + 5 triangles).`;
    return result;
  }

  if (pentagons.length !== 1) {
    result.message = `${baseFeedback} Need exactly 1 pentagon (5-sided shape), found ${pentagons.length}.`;
    return result;
  }

  if (triangles.length !== 5) {
    result.message = `${baseFeedback} Need exactly 5 triangles, found ${triangles.length}.`;
    return result;
  }

  if (other.length > 0) {
    result.message = `${baseFeedback} Unexpected shapes present.`;
    return result;
  }

  // Verify adjacency: each triangle shares exactly one edge with the pentagon.
  const pentagonEdges = new Set<number>();
  const pentFace = boundedFaces[pentagons[0]];
  for (const heId of pentFace.halfEdgeIds) {
    // An edge is shared if the twin half-edge is in another bounded face.
    pentagonEdges.add(heId);
    pentagonEdges.add(graph.halfEdges[heId].twin);
  }

  let allTrianglesAdjacentToPentagon = true;
  for (const tIdx of triangles) {
    const tFace = boundedFaces[tIdx];
    let sharedCount = 0;
    for (const heId of tFace.halfEdgeIds) {
      if (pentagonEdges.has(graph.halfEdges[heId].twin)) {
        sharedCount++;
      }
    }
    if (sharedCount !== 1) {
      allTrianglesAdjacentToPentagon = false;
      break;
    }
  }

  if (!allTrianglesAdjacentToPentagon) {
    result.message = `${baseFeedback} Each triangle must share exactly one side with the pentagon.`;
    return result;
  }

  // All checks pass!
  result.isValidStar = true;
  result.pentagonIdx = pentagons[0];
  result.triangleIdxs = triangles;
  result.message = '⭐ Valid 5-pointed star!';
  return result;
}
