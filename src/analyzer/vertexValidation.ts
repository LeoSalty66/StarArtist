import type { Line, Point } from '../canvas/types';
import { getLineSegments, findLineIntersections, findSelfIntersections } from '../canvas/geometry';
import { lineToPath } from '../canvas/curveUtils';

const VERTEX_MERGE_DISTANCE = 6; // pixels
const INSIDE_CHECK_CANVAS_SIZE = 600;

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
export function vertexValidate(lines: Line[]): VertexValidationResult {
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
    const validation = validateWithCycle(pentCycle, vertices, adjacency, seenEdges, edgeMultiplicity, exploded);
    if (validation.valid) {
      result.isValidStar = true;
      result.pentagonVertices = pentCycle;
      result.tipVertices = vertices.map((_, i) => i).filter((i) => !new Set(pentCycle).has(i));
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
  lines: Line[],
): CycleValidation {
  const pentSet = new Set(pentCycle);
  const n = vertices.length;

  // For each pentagon edge, find ALL candidate tips (vertices connecting to both endpoints).
  const candidates: number[][] = []; // candidates[i] = list of vertex indices that could serve edge i
  for (let i = 0; i < 5; i++) {
    const pA = pentCycle[i];
    const pB = pentCycle[(i + 1) % 5];
    const cands: number[] = [];
    for (let v = 0; v < n; v++) {
      if (v === pA || v === pB) continue;
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
  const validAssignment = backtrackAssign(0, assignment, candidates, pentCycle, adjacency, seenEdges, edgeMultiplicity, vertices, lines);

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
  lines: Line[],
): boolean {
  if (edgeIdx === 5) {
    return checkAssignment(assignment, pentCycle, adjacency, seenEdges, edgeMultiplicity, vertices, lines);
  }

  for (const cand of candidates[edgeIdx]) {
    assignment[edgeIdx] = cand;
    if (backtrackAssign(edgeIdx + 1, assignment, candidates, pentCycle, adjacency, seenEdges, edgeMultiplicity, vertices, lines)) {
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
  lines: Line[],
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

  // Check: no tip vertex is inside the pentagon using flood-fill.
  // Render only pentagon edges, then flood from each tip. If bounded → inside → invalid.
  if (!areTipsOutsidePentagon(assignment, pentCycle, vertices, lines)) return false;

  return true;
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
 * Check that all tip vertices are OUTSIDE the pentagon by rendering only the
 * pentagon's edges and flood-filling from each tip. If a fill stays bounded
 * (doesn't hit canvas edge), the tip is inside → invalid.
 */
function areTipsOutsidePentagon(
  assignment: number[],
  pentCycle: number[],
  vertices: Point[],
  lines: Line[],
): boolean {
  // Render pentagon edges on a hidden canvas.
  const canvas = document.createElement('canvas');
  canvas.width = INSIDE_CHECK_CANVAS_SIZE;
  canvas.height = INSIDE_CHECK_CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, INSIDE_CHECK_CANVAS_SIZE, INSIDE_CHECK_CANVAS_SIZE);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw each pentagon edge using the original lines' paths.
  for (let i = 0; i < 5; i++) {
    const fromPt = vertices[pentCycle[i]];
    const toPt = vertices[pentCycle[(i + 1) % 5]];
    drawPentagonEdge(ctx, fromPt, toPt, lines);
  }

  const boundaryData = ctx.getImageData(0, 0, INSIDE_CHECK_CANVAS_SIZE, INSIDE_CHECK_CANVAS_SIZE);
  const w = INSIDE_CHECK_CANVAS_SIZE;
  const h = INSIDE_CHECK_CANVAS_SIZE;

  // For each unique tip, check if it's outside.
  const checkedTips = new Set<number>();
  for (const tipV of assignment) {
    if (checkedTips.has(tipV)) continue;
    checkedTips.add(tipV);

    const tipPt = vertices[tipV];
    const tx = Math.round(tipPt.x);
    const ty = Math.round(tipPt.y);
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue; // Off-canvas = outside

    // If the tip is on a boundary pixel, nudge slightly
    let sx = tx, sy = ty;
    if (boundaryData.data[((sy * w + sx) * 4) + 3] > 50) {
      // Try small offsets
      const offsets = [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]];
      let found = false;
      for (const [dx, dy] of offsets) {
        const nx = sx + dx, ny = sy + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && boundaryData.data[((ny * w + nx) * 4) + 3] <= 50) {
          sx = nx; sy = ny; found = true; break;
        }
      }
      if (!found) continue; // Can't test, skip
    }

    // Flood from tip. If it DOESN'T hit the edge, it's inside → invalid.
    const hitsEdge = floodHitsEdge(boundaryData, sx, sy, w, h);
    if (!hitsEdge) return false; // Tip is inside the pentagon
  }

  return true; // All tips are outside
}

function drawPentagonEdge(ctx: CanvasRenderingContext2D, from: Point, to: Point, lines: Line[]): void {
  // Find the line whose path connects these two vertices (best match).
  const NEAR = 10;
  let bestPts: Point[] | null = null;
  let bestLen = Infinity;

  for (const l of lines) {
    const pts = l.pathPoints && l.pathPoints.length >= 2 ? l.pathPoints : [l.a, l.b];
    const fromIndices: number[] = [];
    const toIndices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - from.x, pts[i].y - from.y) < NEAR) fromIndices.push(i);
      if (Math.hypot(pts[i].x - to.x, pts[i].y - to.y) < NEAR) toIndices.push(i);
    }
    for (const fi of fromIndices) {
      for (const ti of toIndices) {
        if (fi === ti) continue;
        const startIdx = Math.min(fi, ti);
        const endIdx = Math.max(fi, ti);
        const sub = pts.slice(startIdx, endIdx + 1);
        let len = 0;
        for (let k = 1; k < sub.length; k++) len += Math.hypot(sub[k].x - sub[k-1].x, sub[k].y - sub[k-1].y);
        if (len < bestLen) { bestLen = len; bestPts = fi < ti ? sub : [...sub].reverse(); }
      }
    }
  }

  ctx.beginPath();
  if (bestPts && bestPts.length >= 2) {
    ctx.moveTo(bestPts[0].x, bestPts[0].y);
    for (let i = 1; i < bestPts.length; i++) ctx.lineTo(bestPts[i].x, bestPts[i].y);
  } else {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
}

function floodHitsEdge(data: ImageData, sx: number, sy: number, w: number, h: number): boolean {
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  let count = 0;
  const maxPixels = 80000;

  while (head < queue.length && count < maxPixels) {
    const x = queue[head++];
    const y = queue[head++];
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) return true; // Hit edge!
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (data.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    count++;
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  // If maxPixels hit without reaching edge, assume inside (bounded = inside)
  return false;
}
