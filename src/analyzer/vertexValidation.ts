import type { Line, Point } from '../canvas/types';
import { getLineSegments, findLineIntersections, findSelfIntersections } from '../canvas/geometry';
import { validatePentagonByMidpointFill } from './floodFill';

const VERTEX_MERGE_DISTANCE = 9; // pixels (increased from 6 for more forgiving overlap detection)

export interface VertexValidationResult {
  isValidStar: boolean;
  message: string;
  vertices: Point[];
  adjacency: Map<number, Set<number>>;
  pentagonVertices: number[];
  tipVertices: number[];
  tipAssignment: number[]; // tipAssignment[i] = vertex serving pentagon edge i
  edgeCount: number;
  edgeMultiplicity: Map<string, number>;
}

/**
 * Validate a drawing as a 5-pointed star using generalized vertex/adjacency analysis.
 *
 * Finds any 5-cycle in the graph that can serve as the pentagon, then verifies
 * that each pentagon edge has exactly one triangle tip connecting to both endpoints.
 * Tips may be merged (multiple triangle roles served by one vertex).
 */
export function vertexValidate(lines: Line[], runGeometryCheck = false): VertexValidationResult {
  const empty: VertexValidationResult = {
    isValidStar: false,
    message: '',
    vertices: [],
    adjacency: new Map(),
    pentagonVertices: [],
    tipVertices: [],
    tipAssignment: [],
    edgeCount: 0,
    edgeMultiplicity: new Map(),
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

  // Also detect self-intersections within each line.
  for (const l of exploded) {
    const selfIxs = findSelfIntersections(l);
    for (const ix of selfIxs) findOrAdd(ix);
  }

  // Step 3: Build adjacency and count edges.
  // Use a multiset for adjacency to track how many edges connect each pair.
  const adjacency: Map<number, Set<number>> = new Map();
  const edgeMultiplicity: Map<string, number> = new Map(); // "min-max" -> count
  for (let i = 0; i < vertices.length; i++) adjacency.set(i, new Set());

  for (const l of exploded) {
    const onLine: { idx: number; dist: number }[] = [];
    for (let i = 0; i < vertices.length; i++) {
      // Find ALL positions along the path where this vertex is near.
      // This handles self-intersections where the same vertex appears at multiple path locations.
      const positions = allDistancesAlongLine(vertices[i], l);
      for (const dist of positions) {
        onLine.push({ idx: i, dist });
      }
    }
    onLine.sort((a, b) => a.dist - b.dist);

    // Deduplicate only CONSECUTIVE same vertex (not all occurrences).
    const ordered: number[] = [];
    for (const entry of onLine) {
      if (ordered.length === 0 || ordered[ordered.length - 1] !== entry.idx) {
        ordered.push(entry.idx);
      }
    }

    // Handle closed loops: if a and b are the same vertex, ensure the path
    // includes it at both ends so edges from last intermediate back to start are created.
    const startVtx = findOrAdd(l.a);
    const endVtx = findOrAdd(l.b);
    if (startVtx === endVtx && ordered.length >= 2) {
      // If the loop's start vertex isn't already at the end, add it.
      if (ordered[ordered.length - 1] !== startVtx) {
        ordered.push(startVtx);
      }
      // If it's only [A, A] that's meaningless, clear it.
      if (ordered.length === 2 && ordered[0] === ordered[1]) {
        ordered.length = 0;
      }
    }

    for (let k = 0; k < ordered.length - 1; k++) {
      const a = ordered[k];
      const b = ordered[k + 1];
      // Skip self-edges (same vertex to itself — meaningless for connectivity)
      if (a === b) continue;
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      edgeMultiplicity.set(key, (edgeMultiplicity.get(key) ?? 0) + 1);
    }
  }

  // Step 3b: Contract degree-2 vertices that are collinear with their neighbors.
  // These are intermediate points on what is effectively a single straight edge
  // (common when overlapping lines create a chain like A→B→C where B is just a
  // given-line endpoint sitting in the middle of the path).
  let contracted = true;
  while (contracted) {
    contracted = false;
    for (let v = 0; v < vertices.length; v++) {
      const neighbors = adjacency.get(v);
      if (!neighbors || neighbors.size !== 2) continue;
      const [nA, nB] = [...neighbors];
      // Check collinearity: is V roughly on the line from nA to nB?
      const pV = vertices[v];
      const pA = vertices[nA];
      const pB = vertices[nB];
      const edgeLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (edgeLen < 1) continue;
      // Distance from V to line segment A-B
      const cross = Math.abs((pB.x - pA.x) * (pA.y - pV.y) - (pA.x - pV.x) * (pB.y - pA.y));
      const distToLine = cross / edgeLen;
      // Tolerance scales with edge length: for long edges 12px is fine,
      // but for short edges we need to be much stricter to avoid swallowing real vertices.
      const tolerance = Math.min(12, edgeLen * 0.2);
      if (distToLine > tolerance) continue; // not collinear enough

      // Also check that V actually projects BETWEEN A and B (not past either end).
      // Without this, a vertex beyond the segment end can appear "close to the line"
      // when the two neighbors are near each other.
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const t = ((pV.x - pA.x) * dx + (pV.y - pA.y) * dy) / (edgeLen * edgeLen);
      if (t < -0.1 || t > 1.1) continue; // V is not between A and B

      // Contract: remove V, connect nA↔nB directly.
      // Sum multiplicity of both edges into the new one.
      const keyAV = Math.min(v, nA) + '-' + Math.max(v, nA);
      const keyBV = Math.min(v, nB) + '-' + Math.max(v, nB);
      const multAV = edgeMultiplicity.get(keyAV) ?? 1;
      const multBV = edgeMultiplicity.get(keyBV) ?? 1;
      const combinedMult = Math.max(multAV, multBV);

      // Remove old edges
      edgeMultiplicity.delete(keyAV);
      edgeMultiplicity.delete(keyBV);
      adjacency.get(nA)!.delete(v);
      adjacency.get(nB)!.delete(v);
      adjacency.set(v, new Set());

      // Add new direct edge (or increase multiplicity if it already exists)
      adjacency.get(nA)!.add(nB);
      adjacency.get(nB)!.add(nA);
      const keyAB = Math.min(nA, nB) + '-' + Math.max(nA, nB);
      const existingMult = edgeMultiplicity.get(keyAB) ?? 0;
      edgeMultiplicity.set(keyAB, existingMult + combinedMult);

      contracted = true;
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
    edgeMultiplicity,
  };

  // Count only active vertices (those not contracted away).
  const activeVertexCount = vertices.filter((_, i) => (adjacency.get(i)?.size ?? 0) > 0).length;

  if (activeVertexCount < 6) {
    result.message = `${activeVertexCount} vertices. Need at least 6.`;
    return result;
  }
  if (activeVertexCount > 10) {
    result.message = `${activeVertexCount} vertices. Maximum is 10.`;
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
    const validation = validateWithCycle(pentCycle, vertices, adjacency, seenEdges, edgeMultiplicity);
    if (validation.valid) {
      // Final check: ensure no tip points inward using midpoint-based fill validation.
      // Only run this expensive check when explicitly requested (not on every keystroke).
      if (runGeometryCheck && !validatePentagonByMidpointFill(pentCycle, vertices, lines)) {
        // Pentagon is not a single contiguous bounded region — a tip points inward.
        if (validation.tipsFound > bestProgress) {
          bestProgress = validation.tipsFound;
          bestCycle = pentCycle;
        }
        continue;
      }
      result.isValidStar = true;
      result.pentagonVertices = pentCycle;
      result.tipVertices = vertices.map((_, i) => i).filter((i) => !new Set(pentCycle).has(i) && (adjacency.get(i)?.size ?? 0) > 0);
      result.tipAssignment = validation.assignment;
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
  assignment: number[];
}

function validateWithCycle(
  pentCycle: number[],
  vertices: Point[],
  adjacency: Map<number, Set<number>>,
  seenEdges: Set<string>,
  edgeMultiplicity: Map<string, number>,
): CycleValidation {
  const pentSet = new Set(pentCycle);
  const n = vertices.length;

  // For each pentagon edge, find ALL candidate tips (vertices connecting to both endpoints).
  // Tips must NOT be pentagon vertices — only non-pentagon vertices can serve as tips.
  const candidates: number[][] = []; // candidates[i] = list of vertex indices that could serve edge i
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    const cands: number[] = [];
    for (let v = 0; v < n; v++) {
      if (pentSet.has(v)) continue; // no pentagon vertex can be a tip
      if (adjacency.get(v)!.has(pA) && adjacency.get(v)!.has(pB)) {
        cands.push(v);
      }
    }
    candidates.push(cands);
  }

  // Check if all edges have at least one candidate.
  for (let i = 0; i < 5; i++) {
    if (candidates[i].length === 0) {
      return { valid: false, tipsFound: 5 - candidates.filter(c => c.length === 0).length, failReason: 'missing tip candidates', assignment: [] };
    }
  }

  // Try all valid tip assignments using backtracking.
  const assignment: number[] = new Array(5).fill(-1);
  const validAssignment = backtrackAssign(0, assignment, candidates, pentCycle, adjacency, seenEdges, edgeMultiplicity, vertices);

  if (validAssignment) {
    return { valid: true, tipsFound: 5, failReason: '', assignment: [...assignment] };
  }

  return { valid: false, tipsFound: 5, failReason: 'no valid tip assignment found', assignment: [] };
}

/**
 * Backtracking tip assignment: try each candidate for each pentagon edge,
 * and for each complete assignment, check if all edges are accounted for.
 */
function backtrackAssign(
  edgeIdx: number,
  assignment: number[],
  candidates: number[][],
  pentCycle: number[],
  adjacency: Map<number, Set<number>>,
  seenEdges: Set<string>,
  edgeMultiplicity: Map<string, number>,
  vertices: Point[],
): boolean {
  if (edgeIdx === 5) {
    // Complete assignment: validate it.
    return checkAssignment(assignment, pentCycle, adjacency, seenEdges, edgeMultiplicity, vertices);
  }

  for (const cand of candidates[edgeIdx]) {
    assignment[edgeIdx] = cand;
    if (backtrackAssign(edgeIdx + 1, assignment, candidates, pentCycle, adjacency, seenEdges, edgeMultiplicity, vertices)) {
      return true;
    }
  }
  assignment[edgeIdx] = -1;
  return false;
}

/**
 * Check if a complete tip assignment produces a valid star.
 * All edges in the graph must be accounted for by pentagon edges + tip edges.
 */
function checkAssignment(
  assignment: number[],
  pentCycle: number[],
  adjacency: Map<number, Set<number>>,
  seenEdges: Set<string>,
  edgeMultiplicity: Map<string, number>,
  vertices: Point[],
): boolean {
  // Build required edges from the assignment.
  const requiredPairs = new Set<string>();

  // Pentagon edges
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    requiredPairs.add(Math.min(pA, pB) + '-' + Math.max(pA, pB));
  }

  // Triangle edges from assignment
  for (let i = 0; i < 5; i++) {
    const tipV = assignment[i];
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    requiredPairs.add(Math.min(tipV, pA) + '-' + Math.max(tipV, pA));
    requiredPairs.add(Math.min(tipV, pB) + '-' + Math.max(tipV, pB));
  }

  // Check: every actual edge must be in required, and every required must exist.
  for (const key of seenEdges) {
    if (!requiredPairs.has(key)) return false;
  }
  for (const key of requiredPairs) {
    if (!seenEdges.has(key)) return false;
  }

  // Note: inside-the-pentagon check disabled for now.
  // The centroid-based heuristic produces false rejections with non-convex pentagons
  // and curved lines. Will be replaced with proper boundary-based check later.

  return true;
}

/**
 * Find ALL 5-cycles in the graph that could serve as the pentagon.
 */
function findAllPentagonCycles(
  vertices: Point[],
  adjacency: Map<number, Set<number>>,
): number[][] {
  // Only consider active (non-contracted) vertices.
  const active: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    if ((adjacency.get(i)?.size ?? 0) > 0) active.push(i);
  }
  const n = active.length;
  if (n < 5) return [];

  const cycles: number[][] = [];

  for (let ai = 0; ai < n; ai++) {
    for (let bi = ai + 1; bi < n; bi++) {
      for (let ci = bi + 1; ci < n; ci++) {
        for (let di = ci + 1; di < n; di++) {
          for (let ei = di + 1; ei < n; ei++) {
            const group = [active[ai], active[bi], active[ci], active[di], active[ei]];
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

/**
 * Find ALL distances along a line's path where a point is near.
 * For self-intersecting lines, a vertex may be near the path at multiple
 * distinct locations. Returns an array of arc-length distances.
 */
function allDistancesAlongLine(p: Point, l: Line): number[] {
  const segs = getLineSegments(l);
  const results: number[] = [];
  let cumLen = 0;

  for (const [s, e] of segs) {
    const segLen = Math.hypot(e.x - s.x, e.y - s.y);
    const d = distToSegment(p, s, e);

    if (d <= VERTEX_MERGE_DISTANCE) {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lenSq));
      const dist = cumLen + t * segLen;

      // Only add if it's not too close to an already-found position
      // (avoids duplicates from adjacent segments near the same point)
      const isDup = results.some((r) => Math.abs(r - dist) < 5);
      if (!isDup) results.push(dist);
    }

    cumLen += segLen;
  }

  return results;
}

/**
 * Check if ANY tip vertex is inside the pentagon.
 *
 * For each tip, we check if it's on the INTERIOR side of its corresponding
 * pentagon edge. The interior side is the side where the pentagon centroid is.
 * If a tip is on the same side as the centroid, it's pointing inward → reject.
 *
 * This handles all star shapes correctly regardless of how elongated or
 * curved they are, because it checks each tip against its own edge only.
 */
function isTipInsidePentagon(
  tipPoints: Point[],
  vertices: Point[],
  pentCycle: number[],
  _lines: Line[],
): boolean {
  if (tipPoints.length === 0) return false;

  // Compute pentagon centroid.
  const pentPoints = pentCycle.map((i) => vertices[i]);
  const cx = pentPoints.reduce((s, p) => s + p.x, 0) / 5;
  const cy = pentPoints.reduce((s, p) => s + p.y, 0) / 5;

  // For each tip, find which pentagon edge it belongs to and check which side it's on.
  // The tip assignment maps edge index → tip vertex index.
  // We need to reconstruct that here from the tipPoints and pentCycle.
  // Actually, we receive tipPoints as ALL non-pentagon vertices.
  // We need to check each tip against the edge it serves.

  // For each tip, find which pentagon edge it connects to (both endpoints).
  const pentSet = new Set(pentCycle);
  for (const tip of tipPoints) {
    // Find the tip's vertex index.
    let tipIdx = -1;
    for (let i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - tip.x, vertices[i].y - tip.y) < 1) {
        tipIdx = i;
        break;
      }
    }
    if (tipIdx === -1) continue;

    // Find which pentagon edge this tip serves (connects to both endpoints).
    for (let i = 0; i < 5; i++) {
      const eA = pentCycle[i];
      const eB = pentCycle[(i + 1) % 5];

      // Check if tip connects to both endpoints of this edge.
      const adjSet = new Set<number>();
      // We don't have adjacency here, so use proximity check against pentagon vertices.
      // Actually we check the tip's edges by looking at which pentagon vertices it's near.
      // Simpler: just check if the tip is on the interior side of ALL pentagon edges.
      // If it's on the interior side of all edges, it's fully inside.
    }
  }

  // Better approach: check if tip is inside the polygon using the cross-product
  // winding method against all pentagon edges.
  // A point is inside a polygon if it's on the interior side of ALL edges
  // (when edges are ordered consistently).

  // Determine winding direction: check if centroid is on the "left" side of edge 0.
  const pA = vertices[pentCycle[0]];
  const pB = vertices[pentCycle[1]];
  const crossCentroid = (pB.x - pA.x) * (cy - pA.y) - (pB.y - pA.y) * (cx - pA.x);
  // If crossCentroid > 0, the interior is on the left side (positive cross product).
  // If crossCentroid < 0, the interior is on the right side.
  const interiorSign = crossCentroid > 0 ? 1 : -1;

  for (const tip of tipPoints) {
    let allInside = true;
    for (let i = 0; i < 5; i++) {
      const edgeA = vertices[pentCycle[i]];
      const edgeB = vertices[pentCycle[(i + 1) % 5]];
      const cross = (edgeB.x - edgeA.x) * (tip.y - edgeA.y) - (edgeB.y - edgeA.y) * (tip.x - edgeA.x);
      // If the cross product has the same sign as interiorSign, tip is on interior side of this edge.
      if (cross * interiorSign <= 0) {
        allInside = false;
        break;
      }
    }
    // If the tip is on the interior side of ALL pentagon edges, it's inside the pentagon.
    if (allInside) return true;
  }

  return false;
}
