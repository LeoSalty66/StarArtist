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

  // Step 3: Build adjacency and count edges.
  // Use a multiset for adjacency to track how many edges connect each pair.
  const adjacency: Map<number, Set<number>> = new Map();
  const edgeMultiplicity: Map<string, number> = new Map(); // "min-max" -> count
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

    // Deduplicate consecutive same vertex, BUT preserve the closing vertex
    // for loops (where start == end).
    const ordered: number[] = [];
    for (const entry of onLine) {
      if (ordered.length === 0 || ordered[ordered.length - 1] !== entry.idx) {
        ordered.push(entry.idx);
      }
    }

    // Handle closed loops: if a and b are the same vertex, and the ordered list
    // doesn't end with that vertex, add it back so we get the closing edge.
    const startVtx = findOrAdd(l.a);
    const endVtx = findOrAdd(l.b);
    if (startVtx === endVtx && ordered.length >= 2 && ordered[ordered.length - 1] !== startVtx) {
      ordered.push(startVtx);
    }
    // Also handle case where ordered starts and ends with the same vertex but
    // the loop needs to be explicit.
    if (startVtx === endVtx && ordered.length >= 2 && ordered[0] === startVtx && ordered[ordered.length - 1] !== startVtx) {
      ordered.push(startVtx);
    }
    // If ordered only has the single vertex (pure self-loop with no intermediates),
    // that means the loop has no corners/intersections, which is a self-edge.
    // We add it back to create at least one edge.
    if (startVtx === endVtx && ordered.length === 1) {
      // A pure circle/loop with one vertex: this is a self-loop edge.
      // For our star validation this shouldn't normally happen in a valid star,
      // but we still count it.
      ordered.push(startVtx);
    }

    for (let k = 0; k < ordered.length - 1; k++) {
      const a = ordered[k];
      const b = ordered[k + 1];
      // Allow self-edges for loops (a === b is now valid for the closing edge).
      // But skip zero-length non-loop edges.
      if (a === b && startVtx !== endVtx) continue;
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      edgeMultiplicity.set(key, (edgeMultiplicity.get(key) ?? 0) + 1);
    }
  }

  // Count edges (including multi-edges).
  let edgeCount = 0;
  const seenEdges = new Set<string>();
  for (const [key, count] of edgeMultiplicity) {
    seenEdges.add(key);
    edgeCount += count;
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

  // Step 4: Find ALL valid 5-cycles and try each one as the pentagon.
  const allCycles = findAllPentagonCycles(vertices, adjacency);

  if (allCycles.length === 0) {
    result.message = `${vertices.length} vertices, ${edgeCount} edges. No valid pentagon cycle found.`;
    return result;
  }

  // Try each cycle: if any produces a fully valid star, accept it.
  let bestProgress = 0;
  let bestCycle = allCycles[0];

  for (const pentCycle of allCycles) {
    const validation = validateWithCycle(pentCycle, vertices, adjacency, seenEdges);
    if (validation.valid) {
      result.isValidStar = true;
      result.pentagonVertices = pentCycle;
      result.tipVertices = vertices.map((_, i) => i).filter((i) => !new Set(pentCycle).has(i));
      result.message = '⭐ Valid 5-pointed star!';
      return result;
    }
    if (validation.tipsFound > bestProgress) {
      bestProgress = validation.tipsFound;
      bestCycle = pentCycle;
    }
  }

  // No cycle worked fully. Show progress from the best one.
  result.pentagonVertices = bestCycle;
  result.message = `Pentagon found! ${bestProgress}/5 triangles complete.`;
  return result;
}

interface CycleValidation {
  valid: boolean;
  tipsFound: number;
  failReason: string;
}

function validateWithCycle(
  pentCycle: number[],
  vertices: Point[],
  adjacency: Map<number, Set<number>>,
  seenEdges: Set<string>,
): CycleValidation {
  const pentSet = new Set(pentCycle);
  const tipVerts = vertices.map((_, i) => i).filter((i) => !pentSet.has(i));

  // For each pentagon edge, find the tip.
  const pentEdgeTips: Map<string, number> = new Map();
  let missingTips = 0;
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    const key = Math.min(pA, pB) + '-' + Math.max(pA, pB);

    let foundTip: number | null = null;
    for (const tipV of tipVerts) {
      if (adjacency.get(tipV)!.has(pA) && adjacency.get(tipV)!.has(pB)) {
        foundTip = tipV;
        break;
      }
    }
    if (foundTip === null) {
      for (const otherP of pentCycle) {
        if (otherP === pA || otherP === pB) continue;
        if (adjacency.get(otherP)!.has(pA) && adjacency.get(otherP)!.has(pB)) {
          foundTip = otherP;
          break;
        }
      }
    }
    if (foundTip !== null) {
      pentEdgeTips.set(key, foundTip);
    } else {
      missingTips++;
    }
  }

  if (missingTips > 0) {
    return { valid: false, tipsFound: 5 - missingTips, failReason: 'missing tips' };
  }

  // Build allowed pairs and check edges.
  const allowedPairs = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    allowedPairs.add(Math.min(pA, pB) + '-' + Math.max(pA, pB));
  }
  for (const [pentEdgeKey, tipV] of pentEdgeTips) {
    const [pAStr, pBStr] = pentEdgeKey.split('-');
    const pA = parseInt(pAStr);
    const pB = parseInt(pBStr);
    allowedPairs.add(Math.min(tipV, pA) + '-' + Math.max(tipV, pA));
    allowedPairs.add(Math.min(tipV, pB) + '-' + Math.max(tipV, pB));
  }

  for (const key of seenEdges) {
    if (!allowedPairs.has(key)) {
      return { valid: false, tipsFound: 5, failReason: `extra edge ${key}` };
    }
  }
  for (const key of allowedPairs) {
    if (!seenEdges.has(key)) {
      return { valid: false, tipsFound: 5, failReason: `missing edge ${key}` };
    }
  }

  return { valid: true, tipsFound: 5, failReason: '' };
}

/**
 * Find ALL 5-cycles in the graph that could serve as the pentagon.
 */
function findAllPentagonCycles(
  vertices: Point[],
  adjacency: Map<number, Set<number>>,
): number[][] {
  const n = vertices.length;
  if (n < 5) return [];

  const cycles: number[][] = [];

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

  return cycles;
}

/**
 * Given a group of 5 vertices, find a Hamiltonian cycle among them
 * (a way to visit all 5 exactly once and return to start, using only
 * edges that exist in the adjacency).
 * Doesn't require exactly degree 2 — allows extra edges within the group.
 */
function findCycleInGroup(group: number[], adjacency: Map<number, Set<number>>): number[] | null {
  const groupSet = new Set(group);

  // Build the subgraph adjacency restricted to this group.
  const subAdj: Map<number, number[]> = new Map();
  for (const v of group) {
    const neighbors = [...adjacency.get(v)!].filter((n) => groupSet.has(n));
    if (neighbors.length < 2) return null; // Can't be in a cycle with fewer than 2 connections
    subAdj.set(v, neighbors);
  }

  // Try all permutations of the group to find a valid cycle.
  // With only 5 vertices, there are 5!/2 = 60 distinct cycles to check (manageable).
  const perms = permutations(group);
  for (const perm of perms) {
    let valid = true;
    for (let i = 0; i < 5; i++) {
      const curr = perm[i];
      const next = perm[(i + 1) % 5];
      if (!adjacency.get(curr)!.has(next)) {
        valid = false;
        break;
      }
    }
    if (valid) return perm;
  }

  return null;
}

/** Generate all unique cycle permutations of an array (fix first element, permute rest). */
function permutations(arr: number[]): number[][] {
  if (arr.length <= 1) return [arr];
  const results: number[][] = [];
  // Fix first element to avoid duplicate cycles (rotations)
  const first = arr[0];
  const rest = arr.slice(1);
  permuteHelper(rest, [], (perm) => {
    results.push([first, ...perm]);
  });
  return results;
}

function permuteHelper(remaining: number[], current: number[], emit: (p: number[]) => void): void {
  if (remaining.length === 0) {
    emit(current);
    return;
  }
  for (let i = 0; i < remaining.length; i++) {
    const next = [...current, remaining[i]];
    const rest = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
    permuteHelper(rest, next, emit);
  }
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
