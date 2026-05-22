import type { Line, Point } from '../canvas/types';
import { getLineSegments, findLineIntersections } from '../canvas/geometry';

const VERTEX_MERGE_DISTANCE = 6; // pixels

export interface VertexValidationResult {
  isValidStar: boolean;
  message: string;
  vertices: Point[];
  adjacency: Map<number, Set<number>>;
  pentagonVertices: number[];
  tipVertices: number[];
  edgeCount: number;
}

/**
 * Validate a drawing as a 5-pointed star using generalized vertex/adjacency analysis.
 *
 * Finds any 5-cycle in the graph that can serve as the pentagon, then verifies
 * that each pentagon edge has exactly one triangle tip connecting to both endpoints.
 * Tips may be merged (multiple triangle roles served by one vertex).
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

  // Step 2: Collect all vertices.
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

  for (const l of exploded) {
    findOrAdd(l.a);
    findOrAdd(l.b);
  }
  for (let i = 0; i < exploded.length; i++) {
    for (let j = i + 1; j < exploded.length; j++) {
      const ixs = findLineIntersections(exploded[i], exploded[j]);
      for (const ix of ixs) findOrAdd(ix);
    }
  }

  // Step 3: Build adjacency.
  const adjacency: Map<number, Set<number>> = new Map();
  for (let i = 0; i < vertices.length; i++) adjacency.set(i, new Set());

  for (const l of exploded) {
    const onLine: { idx: number; dist: number }[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const d = distToLine(vertices[i], l);
      if (d <= VERTEX_MERGE_DISTANCE) {
        onLine.push({ idx: i, dist: distanceAlongLine(vertices[i], l) });
      }
    }
    onLine.sort((a, b) => a.dist - b.dist);
    const ordered: number[] = [];
    for (const entry of onLine) {
      if (ordered.length === 0 || ordered[ordered.length - 1] !== entry.idx) {
        ordered.push(entry.idx);
      }
    }
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
      if (!seenEdges.has(key)) { seenEdges.add(key); edgeCount++; }
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

  if (vertices.length < 6) {
    result.message = `${vertices.length} vertices. Need at least 6.`;
    return result;
  }
  if (vertices.length > 10) {
    result.message = `${vertices.length} vertices. Maximum is 10.`;
    return result;
  }

  // Step 4: Find a valid 5-cycle that can serve as the pentagon.
  const pentCycle = findValidPentagonCycle(vertices, adjacency, seenEdges);

  if (!pentCycle) {
    result.message = `${vertices.length} vertices, ${edgeCount} edges. No valid pentagon cycle found.`;
    return result;
  }

  const pentSet = new Set(pentCycle);
  const tipVerts = vertices.map((_, i) => i).filter((i) => !pentSet.has(i));

  // Step 5: Verify no extra edges exist.
  // Allowed edges:
  // - Pentagon edges: between adjacent pentagon vertices in the cycle
  // - Triangle edges: between a pentagon vertex and a tip that forms a triangle
  // Total allowed = 5 (pentagon) + 10 (triangle sides) = 15
  // But with merged tips, some triangle edges collapse, reducing edge count.

  // For each pentagon edge (adjacent pair in cycle), find the tip that connects to both.
  const pentEdgeTips: Map<string, number> = new Map(); // "pentA-pentB" -> tip vertex index
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    const key = Math.min(pA, pB) + '-' + Math.max(pA, pB);

    // Find a vertex (tip) that connects to both pA and pB
    let foundTip: number | null = null;
    for (const tipV of tipVerts) {
      if (adjacency.get(tipV)!.has(pA) && adjacency.get(tipV)!.has(pB)) {
        foundTip = tipV;
        break;
      }
    }
    // Also check if a pentagon vertex (non-adjacent) serves as tip for this edge
    // This handles extreme merging where a pent vertex also acts as tip for non-adjacent edge
    if (foundTip === null) {
      for (const otherP of pentCycle) {
        if (otherP === pA || otherP === pB) continue;
        if (adjacency.get(otherP)!.has(pA) && adjacency.get(otherP)!.has(pB)) {
          // This pentagon vertex connects to both, but it's not adjacent to them in the cycle
          // so it's acting as a triangle tip for this edge
          foundTip = otherP;
          break;
        }
      }
    }

    if (foundTip === null) {
      result.message = `No triangle tip found for pentagon edge ${pA}-${pB}.`;
      return result;
    }
    pentEdgeTips.set(key, foundTip);
  }

  // Step 6: Verify all edges are accounted for.
  const allowedEdges = new Set<string>();
  // Pentagon edges
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    allowedEdges.add(Math.min(pA, pB) + '-' + Math.max(pA, pB));
  }
  // Triangle edges (tip to pentagon vertex)
  for (const [pentEdgeKey, tipV] of pentEdgeTips) {
    const [pAStr, pBStr] = pentEdgeKey.split('-');
    const pA = parseInt(pAStr);
    const pB = parseInt(pBStr);
    allowedEdges.add(Math.min(tipV, pA) + '-' + Math.max(tipV, pA));
    allowedEdges.add(Math.min(tipV, pB) + '-' + Math.max(tipV, pB));
  }

  // Check for extra edges
  for (const edgeKey of seenEdges) {
    if (!allowedEdges.has(edgeKey)) {
      result.message = `Extra edge ${edgeKey} not part of star structure.`;
      return result;
    }
  }

  // Check all allowed edges exist
  for (const edgeKey of allowedEdges) {
    if (!seenEdges.has(edgeKey)) {
      result.message = `Missing edge ${edgeKey} required for star.`;
      return result;
    }
  }

  result.isValidStar = true;
  result.pentagonVertices = pentCycle;
  result.tipVertices = tipVerts;
  result.message = '⭐ Valid 5-pointed star!';
  return result;
}

/**
 * Find a 5-cycle in the graph that can serve as the pentagon.
 * A valid pentagon cycle must also satisfy: for each edge of the cycle,
 * there exists at least one other vertex connecting to both endpoints.
 *
 * Brute-force approach since graphs are small (≤10 vertices).
 */
function findValidPentagonCycle(
  vertices: Point[],
  adjacency: Map<number, Set<number>>,
  allEdges: Set<string>,
): number[] | null {
  const n = vertices.length;
  if (n < 5) return null;

  // Find all 5-cycles using DFS.
  const cycles: number[][] = [];
  const indices = Array.from({ length: n }, (_, i) => i);

  // Generate all combinations of 5 vertices
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            const group = [a, b, c, d, e];
            const cycle = findCycleInGroup(group, adjacency);
            if (cycle) cycles.push(cycle);
          }
        }
      }
    }
  }

  // For each cycle, check if it can be a valid pentagon
  // (each edge has a triangle tip connecting to both endpoints).
  for (const cycle of cycles) {
    if (isValidPentagonCycle(cycle, vertices, adjacency)) {
      return cycle;
    }
  }

  return null;
}

/**
 * Given a group of 5 vertices, determine if they form a Hamiltonian cycle
 * (each connected to exactly 2 others in the group).
 */
function findCycleInGroup(group: number[], adjacency: Map<number, Set<number>>): number[] | null {
  const groupSet = new Set(group);

  // Check each vertex connects to exactly 2 others in the group
  for (const v of group) {
    let count = 0;
    for (const n of adjacency.get(v)!) {
      if (groupSet.has(n)) count++;
    }
    if (count !== 2) return null;
  }

  // Trace the cycle
  const visited = new Set<number>();
  const cycle: number[] = [];
  let current = group[0];

  for (let step = 0; step < 5; step++) {
    visited.add(current);
    cycle.push(current);
    const next = [...adjacency.get(current)!].find(
      (n) => groupSet.has(n) && !visited.has(n),
    );
    if (next === undefined && step < 4) return null;
    if (step < 4) current = next!;
  }

  // Verify last connects back to first
  if (!adjacency.get(current)!.has(cycle[0])) return null;

  return cycle;
}

/**
 * Check if a 5-cycle can serve as a valid pentagon:
 * for each edge of the cycle, some vertex (outside or inside the cycle)
 * connects to both endpoints.
 */
function isValidPentagonCycle(
  cycle: number[],
  vertices: Point[],
  adjacency: Map<number, Set<number>>,
): boolean {
  const n = vertices.length;

  for (let i = 0; i < 5; i++) {
    const pA = cycle[i];
    const pB = cycle[(i + 1) % 5];

    let hasTip = false;
    for (let v = 0; v < n; v++) {
      if (v === pA || v === pB) continue;
      if (adjacency.get(v)!.has(pA) && adjacency.get(v)!.has(pB)) {
        hasTip = true;
        break;
      }
    }
    if (!hasTip) return false;
  }

  return true;
}

// --- Helpers ---

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

function distToLine(p: Point, l: Line): number {
  const segs = getLineSegments(l);
  let minDist = Infinity;
  for (const [s, e] of segs) {
    const d = distToSegment(p, s, e);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

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
      if (lenSq > 0) t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lenSq));
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
