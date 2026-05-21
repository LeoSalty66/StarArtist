import type { Line, Point } from '../canvas/types';
import { getLineSegments, findLineIntersections } from '../canvas/geometry';

const VERTEX_MERGE_DISTANCE = 6; // pixels

export interface VertexValidationResult {
  isValidStar: boolean;
  message: string;
  vertices: Point[];
  /** Adjacency: for each vertex index, the set of vertex indices it connects to. */
  adjacency: Map<number, Set<number>>;
  /** Indices of pentagon vertices (degree 4), if found. */
  pentagonVertices: number[];
  /** Indices of tip vertices (degree 2), if found. */
  tipVertices: number[];
  /** Total edge count. */
  edgeCount: number;
}

/**
 * Validate a drawing as a 5-pointed star using pure vertex/adjacency analysis.
 *
 * A valid 5-pointed star has:
 * - Exactly 10 vertices
 * - 5 vertices with degree 4 (pentagon vertices)
 * - 5 vertices with degree 2 (star tips)
 * - The 5 degree-4 vertices form a cycle (each connects to exactly 2 others in the group)
 * - Each unique pair of adjacent pentagon vertices is shared by exactly one degree-4 vertex
 * - Each degree-2 vertex connects to exactly 2 degree-4 vertices
 * - Each degree-2 vertex's pair of connections is unique
 * - Exactly 15 edges total
 */
export function vertexValidate(lines: Line[]): VertexValidationResult {
  const empty: VertexValidationResult = {
    isValidStar: false,
    message: '',
    vertices: [],
    adjacency: new Map(),
    pentagonVertices: [],
    tipVertices: [],
    edgeCount: 0,
  };

  if (lines.length === 0) return { ...empty, message: 'No lines drawn.' };

  // Step 1: Explode at corners.
  const exploded = explodeAtCorners(lines);

  // Step 2: Collect all vertices (endpoints + intersections).
  const vertices: Point[] = [];
  const findOrAdd = (p: Point): number => {
    for (let i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - p.x, vertices[i].y - p.y) <= VERTEX_MERGE_DISTANCE) {
        return i;
      }
    }
    vertices.push(p);
    return vertices.length - 1;
  };

  // Add endpoints.
  for (const l of exploded) {
    findOrAdd(l.a);
    findOrAdd(l.b);
  }

  // Add intersections.
  for (let i = 0; i < exploded.length; i++) {
    for (let j = i + 1; j < exploded.length; j++) {
      const ixs = findLineIntersections(exploded[i], exploded[j]);
      for (const ix of ixs) {
        findOrAdd(ix);
      }
    }
  }

  // Step 3: Build adjacency by finding which vertices each line passes through.
  const adjacency: Map<number, Set<number>> = new Map();
  for (let i = 0; i < vertices.length; i++) {
    adjacency.set(i, new Set());
  }

  for (const l of exploded) {
    // Find vertices on this line, ordered by distance along path.
    const onLine: { idx: number; dist: number }[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const d = distToLine(vertices[i], l);
      if (d <= VERTEX_MERGE_DISTANCE) {
        onLine.push({ idx: i, dist: distanceAlongLine(vertices[i], l) });
      }
    }
    onLine.sort((a, b) => a.dist - b.dist);

    // Deduplicate consecutive same vertex.
    const ordered: number[] = [];
    for (const entry of onLine) {
      if (ordered.length === 0 || ordered[ordered.length - 1] !== entry.idx) {
        ordered.push(entry.idx);
      }
    }

    // Connect consecutive vertices.
    for (let k = 0; k < ordered.length - 1; k++) {
      adjacency.get(ordered[k])!.add(ordered[k + 1]);
      adjacency.get(ordered[k + 1])!.add(ordered[k]);
    }
  }

  // Count edges.
  let edgeCount = 0;
  const seenEdges = new Set<string>();
  for (const [v, neighbors] of adjacency) {
    for (const n of neighbors) {
      const key = Math.min(v, n) + '-' + Math.max(v, n);
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edgeCount++;
      }
    }
  }

  const result: VertexValidationResult = {
    isValidStar: false,
    message: '',
    vertices,
    adjacency,
    pentagonVertices: [],
    tipVertices: [],
    edgeCount,
  };

  // Step 4: Validate.
  const vertexCount = vertices.length;

  if (vertexCount < 10) {
    result.message = `${vertexCount} vertices found. Need exactly 10.`;
    return result;
  }
  if (vertexCount > 10) {
    result.message = `${vertexCount} vertices found. Need exactly 10 (too many).`;
    return result;
  }

  // Classify by degree.
  const degree4: number[] = [];
  const degree2: number[] = [];
  const otherDegrees: { idx: number; deg: number }[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const deg = adjacency.get(i)!.size;
    if (deg === 4) degree4.push(i);
    else if (deg === 2) degree2.push(i);
    else otherDegrees.push({ idx: i, deg });
  }

  if (otherDegrees.length > 0) {
    const desc = otherDegrees.map((o) => `vertex ${o.idx} has degree ${o.deg}`).join(', ');
    result.message = `Invalid vertex degrees: ${desc}. Need 5×degree-4 and 5×degree-2.`;
    return result;
  }

  if (degree4.length !== 5) {
    result.message = `Found ${degree4.length} degree-4 vertices. Need exactly 5 (pentagon).`;
    return result;
  }

  if (degree2.length !== 5) {
    result.message = `Found ${degree2.length} degree-2 vertices. Need exactly 5 (tips).`;
    return result;
  }

  // Check that the 5 degree-4 vertices form a cycle (each connects to exactly 2 others in the group).
  const pentSet = new Set(degree4);
  for (const pv of degree4) {
    const neighbors = adjacency.get(pv)!;
    let pentNeighborCount = 0;
    for (const n of neighbors) {
      if (pentSet.has(n)) pentNeighborCount++;
    }
    if (pentNeighborCount !== 2) {
      result.message = `Pentagon vertex connects to ${pentNeighborCount} other pentagon vertices (need exactly 2).`;
      return result;
    }
  }

  // Check that the pentagon connections form a single cycle (not two disconnected pieces).
  const pentCycle = traceCycle(degree4, adjacency, pentSet);
  if (!pentCycle) {
    result.message = 'Pentagon vertices do not form a single cycle.';
    return result;
  }

  // Check uniqueness of pentagon pairs: each degree-4 vertex's pair of pentagon neighbors is unique.
  const pentPairs = new Set<string>();
  for (const pv of degree4) {
    const pentNeighbors = [...adjacency.get(pv)!].filter((n) => pentSet.has(n)).sort();
    const pairKey = pentNeighbors.join('-');
    if (pentPairs.has(pairKey)) {
      result.message = 'Two pentagon vertices share the same pair of pentagon neighbors.';
      return result;
    }
    pentPairs.add(pairKey);
  }

  // Check degree-2 vertices: each connects to exactly 2 degree-4 vertices.
  for (const tv of degree2) {
    const neighbors = [...adjacency.get(tv)!];
    if (neighbors.length !== 2) {
      result.message = `Tip vertex has ${neighbors.length} connections (need exactly 2).`;
      return result;
    }
    if (!pentSet.has(neighbors[0]) || !pentSet.has(neighbors[1])) {
      result.message = 'Tip vertex connects to a non-pentagon vertex.';
      return result;
    }
  }

  // Check uniqueness of tip connections.
  const tipPairs = new Set<string>();
  for (const tv of degree2) {
    const neighbors = [...adjacency.get(tv)!].sort();
    const pairKey = neighbors.join('-');
    if (tipPairs.has(pairKey)) {
      result.message = 'Two tip vertices connect to the same pair of pentagon vertices.';
      return result;
    }
    tipPairs.add(pairKey);
  }

  // Check edge count (should be exactly 15).
  if (edgeCount !== 15) {
    result.message = `${edgeCount} edges found. A valid star has exactly 15.`;
    return result;
  }

  // All checks pass!
  result.isValidStar = true;
  result.pentagonVertices = degree4;
  result.tipVertices = degree2;
  result.message = '⭐ Valid 5-pointed star!';
  return result;
}

/** Trace a cycle through vertices that are connected within a group. */
function traceCycle(
  group: number[],
  adjacency: Map<number, Set<number>>,
  groupSet: Set<number>,
): number[] | null {
  if (group.length === 0) return null;
  const visited = new Set<number>();
  const cycle: number[] = [];
  let current = group[0];

  for (let step = 0; step < group.length; step++) {
    visited.add(current);
    cycle.push(current);
    const neighbors = [...adjacency.get(current)!].filter(
      (n) => groupSet.has(n) && !visited.has(n),
    );
    if (neighbors.length === 0 && step < group.length - 1) return null; // Dead end
    if (step < group.length - 1) current = neighbors[0];
  }

  // Check that the last vertex connects back to the first.
  if (!adjacency.get(current)!.has(cycle[0])) return null;
  if (cycle.length !== group.length) return null;

  return cycle;
}

/** Explode lines at corners. */
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

/** Distance from point to a line's actual path. */
function distToLine(p: Point, l: Line): number {
  const segs = getLineSegments(l);
  let minDist = Infinity;
  for (const [s, e] of segs) {
    const d = distToSegment(p, s, e);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Arc-length distance along a line from start to the projection of a point. */
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
