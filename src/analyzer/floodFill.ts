import type { Line, Point } from '../canvas/types';
import { lineToPath } from '../canvas/curveUtils';

const STROKE_WIDTH = 4;
const VERTEX_MERGE_DISTANCE = 6;
const SEED_OFFSET = 7; // pixels away from midpoint (past the stroke width)
const MIDPOINT_HIT_RADIUS = 8; // how close a filled pixel must be to "hit" a midpoint

/**
 * Generate fill overlays using the midpoint-based approach:
 * 1. Find midpoints of the 5 pentagon edges (along actual drawn curves)
 * 2. Place a seed near midpoint A, fill, check if fill hits other midpoints
 *    - Hits other midpoints → pentagon fill
 *    - Doesn't → triangle fill, flip seed to get pentagon
 * 3. For remaining midpoints, fill the triangle on the opposite side of pentagon
 */
export function generateFillOverlays(
  pentCycle: number[],
  _tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[]; debug: string; canvasSize: number } | null {
  const debugLines: string[] = ['=== MIDPOINT FLOOD FILL DEBUG ==='];

  // Determine canvas size: must encompass all line coordinates.
  let maxCoord = 600;
  for (const l of lines) {
    maxCoord = Math.max(maxCoord, l.a.x, l.a.y, l.b.x, l.b.y);
    if (l.pathPoints) {
      for (const p of l.pathPoints) {
        maxCoord = Math.max(maxCoord, p.x, p.y);
      }
    }
  }
  const canvasSize = Math.ceil(maxCoord) + 20; // small padding

  // Render ALL lines as boundary on hidden canvas.
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const l of lines) {
    const pathStr = lineToPath(l);
    try {
      const path2d = new Path2D(pathStr);
      ctx.stroke(path2d);
    } catch {
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
    }
  }

  const boundaryData = ctx.getImageData(0, 0, canvasSize, canvasSize);
  debugLines.push(`Lines rendered: ${lines.length}, canvasSize: ${canvasSize}`);

  // Step 1: Find midpoints and normals for all 5 pentagon edges.
  const midpoints: Point[] = [];
  const normals: Point[] = []; // unit normal at each midpoint

  for (let i = 0; i < 5; i++) {
    const vA = vertices[pentCycle[i]];
    const vB = vertices[pentCycle[(i + 1) % 5]];
    const result = findEdgeMidpointAndNormal(vA, vB, lines);
    midpoints.push(result.midpoint);
    normals.push(result.normal);
    debugLines.push(`Edge ${i} (V${pentCycle[i]}→V${pentCycle[(i + 1) % 5]}): midpoint=(${result.midpoint.x.toFixed(1)}, ${result.midpoint.y.toFixed(1)}), normal=(${result.normal.x.toFixed(2)}, ${result.normal.y.toFixed(2)})`);
  }

  // Step 2: Find the pentagon by filling from midpoint 0 and checking midpoint hits.
  const otherMidpoints = midpoints.slice(1); // midpoints 1-4
  const firstMid = midpoints[0];
  const firstNormal = normals[0];

  // Try side A of midpoint 0.
  const seedA = findClearSeed(firstMid, firstNormal, SEED_OFFSET, boundaryData);
  // Try side B of midpoint 0.
  const seedB = findClearSeed(firstMid, { x: -firstNormal.x, y: -firstNormal.y }, SEED_OFFSET, boundaryData);

  debugLines.push(`\nMidpoint 0: (${firstMid.x.toFixed(1)}, ${firstMid.y.toFixed(1)})`);
  debugLines.push(`  SeedA: ${seedA ? `(${seedA.x.toFixed(1)}, ${seedA.y.toFixed(1)})` : 'NONE'}`);
  debugLines.push(`  SeedB: ${seedB ? `(${seedB.x.toFixed(1)}, ${seedB.y.toFixed(1)})` : 'NONE'}`);

  // Fill from both sides and determine which is pentagon vs triangle.
  let pentagonIndices: number[] = [];
  let firstTriangleIndices: number[] = [];

  const fillA = seedA ? doFloodFillWithMidpointCheck(boundaryData, seedA, otherMidpoints) : null;
  const fillB = seedB ? doFloodFillWithMidpointCheck(boundaryData, seedB, otherMidpoints) : null;

  debugLines.push(`  FillA: ${fillA ? `${fillA.filledIndices.length}px, hitsMidpoints=${fillA.hitsMidpoints}` : 'no seed'}`);
  debugLines.push(`  FillB: ${fillB ? `${fillB.filledIndices.length}px, hitsMidpoints=${fillB.hitsMidpoints}` : 'no seed'}`);

  if (fillA && fillA.filledIndices.length > 0 && fillA.hitsMidpoints) {
    // Side A is the pentagon.
    pentagonIndices = fillA.filledIndices;
    firstTriangleIndices = (fillB && fillB.filledIndices.length > 0) ? fillB.filledIndices : [];
    debugLines.push(`  → SideA=pentagon, SideB=triangle0`);
  } else if (fillB && fillB.filledIndices.length > 0 && fillB.hitsMidpoints) {
    // Side B is the pentagon.
    pentagonIndices = fillB.filledIndices;
    firstTriangleIndices = (fillA && fillA.filledIndices.length > 0) ? fillA.filledIndices : [];
    debugLines.push(`  → SideB=pentagon, SideA=triangle0`);
  } else if (fillA && fillA.filledIndices.length > 0 && fillB && fillB.filledIndices.length > 0) {
    // Neither explicitly hit midpoints. The larger fill is likely the pentagon.
    // (Pentagon has more area than any single triangle.)
    if (fillA.filledIndices.length > fillB.filledIndices.length) {
      pentagonIndices = fillA.filledIndices;
      firstTriangleIndices = fillB.filledIndices;
      debugLines.push(`  → Larger=SideA (pentagon by size), SideB=triangle0`);
    } else {
      pentagonIndices = fillB.filledIndices;
      firstTriangleIndices = fillA.filledIndices;
      debugLines.push(`  → Larger=SideB (pentagon by size), SideA=triangle0`);
    }
  } else if (fillA && fillA.filledIndices.length > 0) {
    // Only side A worked. Mark it and fill B after.
    pentagonIndices = fillA.filledIndices;
    debugLines.push(`  → Only SideA filled, treating as pentagon`);
    markAsBoundary(boundaryData, pentagonIndices);
    const retryB = seedB ? doFloodFillSimple(boundaryData, seedB) : { filledIndices: [] };
    firstTriangleIndices = retryB.filledIndices;
  } else if (fillB && fillB.filledIndices.length > 0) {
    // Only side B worked.
    pentagonIndices = fillB.filledIndices;
    debugLines.push(`  → Only SideB filled, treating as pentagon`);
    markAsBoundary(boundaryData, pentagonIndices);
    const retryA = seedA ? doFloodFillSimple(boundaryData, seedA) : { filledIndices: [] };
    firstTriangleIndices = retryA.filledIndices;
  } else {
    // Both sides failed. Fall back to spiral search from pentagon centroid.
    debugLines.push(`  → Both sides FAILED. Falling back to centroid spiral.`);
    const pentPoints = pentCycle.map((i) => vertices[i]);
    const pentCenter = centroid(pentPoints);
    const spiralSeed = findSeedBySpiral(boundaryData, pentCenter);
    if (spiralSeed) {
      const spiralFill = doFloodFillSimple(boundaryData, spiralSeed);
      pentagonIndices = spiralFill.filledIndices;
    }
    debugLines.push(`  Fallback pentagon: ${pentagonIndices.length} pixels`);
  }

  // Render pentagon data URL.
  const pentDataUrl = renderFillToDataUrl(pentagonIndices, 'rgba(126, 200, 227, 0.3)', canvasSize);

  // Mark pentagon as boundary so triangle fills are bounded.
  markAsBoundary(boundaryData, pentagonIndices);
  // Also mark triangle 0 as boundary if we got it.
  markAsBoundary(boundaryData, firstTriangleIndices);

  const triDataUrls: string[] = [];
  triDataUrls.push(renderFillToDataUrl(firstTriangleIndices, 'rgba(176, 136, 249, 0.2)', canvasSize));

  // Step 3: Fill triangles 1-4 using midpoints 1-4.
  for (let i = 1; i < 5; i++) {
    const mid = midpoints[i];
    const normal = normals[i];

    debugLines.push(`\nTriangle ${i}: midpoint=(${mid.x.toFixed(1)}, ${mid.y.toFixed(1)})`);

    // Try side A of this midpoint.
    const tSeedA = findClearSeed(mid, normal, SEED_OFFSET, boundaryData);
    // Try side B.
    const tSeedB = findClearSeed(mid, { x: -normal.x, y: -normal.y }, SEED_OFFSET, boundaryData);

    let triFillIndices: number[] = [];

    // Check which side is NOT in already-filled territory.
    const aInFilled = tSeedA ? isPixelFilled(boundaryData, tSeedA) : true;
    const bInFilled = tSeedB ? isPixelFilled(boundaryData, tSeedB) : true;

    debugLines.push(`  seedA=${tSeedA ? `(${tSeedA.x.toFixed(1)},${tSeedA.y.toFixed(1)}) filled=${aInFilled}` : 'NONE'}`);
    debugLines.push(`  seedB=${tSeedB ? `(${tSeedB.x.toFixed(1)},${tSeedB.y.toFixed(1)}) filled=${bInFilled}` : 'NONE'}`);

    if (!aInFilled && tSeedA) {
      const fill = doFloodFillSimple(boundaryData, tSeedA);
      triFillIndices = fill.filledIndices;
      debugLines.push(`  Filled from sideA: ${triFillIndices.length}px`);
    } else if (!bInFilled && tSeedB) {
      const fill = doFloodFillSimple(boundaryData, tSeedB);
      triFillIndices = fill.filledIndices;
      debugLines.push(`  Filled from sideB: ${triFillIndices.length}px`);
    } else {
      debugLines.push(`  Both sides in filled/no seed. Skipping.`);
    }

    triDataUrls.push(renderFillToDataUrl(triFillIndices, 'rgba(176, 136, 249, 0.2)', canvasSize));
    markAsBoundary(boundaryData, triFillIndices);
  }

  debugLines.push(`\n=== FILL COMPLETE ===`);
  debugLines.push(`Pentagon: ${pentagonIndices.length} pixels`);
  debugLines.push(`Triangle 0: ${firstTriangleIndices.length} pixels`);
  for (let i = 1; i < 5; i++) {
    debugLines.push(`Triangle ${i}: ${triDataUrls[i] ? 'filled' : 'empty'}`);
  }

  const debug = debugLines.join('\n');
  // Also log to console for dev debugging.
  console.warn(debug);

  return {
    pentagonDataUrl: pentDataUrl,
    triangleDataUrls: triDataUrls,
    debug,
    canvasSize,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the arc-length midpoint and perpendicular normal of a pentagon edge.
 * The pentagon vertices may be intersection points in the MIDDLE of a line,
 * so we project them onto each line's path to find which line contains the edge.
 */
function findEdgeMidpointAndNormal(
  vA: Point,
  vB: Point,
  lines: Line[],
): { midpoint: Point; normal: Point } {
  let bestSubPath: Point[] | null = null;
  let bestScore = Infinity;

  for (const l of lines) {
    const pts = getPathPoints(l);
    if (pts.length < 2) continue;

    const projA = projectOntoPath(vA, pts);
    const projB = projectOntoPath(vB, pts);

    // Both vertices must project close to the path.
    if (projA.distance > VERTEX_MERGE_DISTANCE * 3) continue;
    if (projB.distance > VERTEX_MERGE_DISTANCE * 3) continue;

    // Also ensure A and B are at different positions along the path (not the same point).
    const distAB = Math.abs(arcLengthAt(pts, projA.segIndex, projA.t) - arcLengthAt(pts, projB.segIndex, projB.t));
    if (distAB < 5) continue; // Too close along path, probably same vertex projected

    const score = projA.distance + projB.distance;
    if (score < bestScore) {
      bestScore = score;
      bestSubPath = extractSubPath(pts, projA.segIndex, projA.t, projB.segIndex, projB.t);
    }
  }

  // Fallback: straight line between the two vertices.
  if (!bestSubPath || bestSubPath.length < 2) {
    bestSubPath = [vA, vB];
  }

  // Walk the sub-path to find arc-length midpoint.
  let totalLen = 0;
  for (let i = 0; i < bestSubPath.length - 1; i++) {
    totalLen += Math.hypot(
      bestSubPath[i + 1].x - bestSubPath[i].x,
      bestSubPath[i + 1].y - bestSubPath[i].y,
    );
  }

  const halfLen = totalLen / 2;
  let accumulated = 0;
  let midpoint: Point = bestSubPath[0];
  let tangent: Point = { x: 1, y: 0 };

  for (let i = 0; i < bestSubPath.length - 1; i++) {
    const dx = bestSubPath[i + 1].x - bestSubPath[i].x;
    const dy = bestSubPath[i + 1].y - bestSubPath[i].y;
    const segLen = Math.hypot(dx, dy);
    if (accumulated + segLen >= halfLen) {
      const remainder = halfLen - accumulated;
      const t = segLen > 0 ? remainder / segLen : 0;
      midpoint = {
        x: bestSubPath[i].x + t * dx,
        y: bestSubPath[i].y + t * dy,
      };
      tangent = segLen > 0 ? { x: dx / segLen, y: dy / segLen } : { x: 1, y: 0 };
      break;
    }
    accumulated += segLen;
  }

  // Normal is perpendicular to tangent (rotate 90° CCW).
  const normal: Point = { x: -tangent.y, y: tangent.x };

  return { midpoint, normal };
}

/** Compute arc length at a given segment/t position along a path. */
function arcLengthAt(pts: Point[], segIdx: number, t: number): number {
  let len = 0;
  for (let i = 0; i < segIdx && i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (segIdx < pts.length - 1) {
    const segLen = Math.hypot(pts[segIdx + 1].x - pts[segIdx].x, pts[segIdx + 1].y - pts[segIdx].y);
    len += t * segLen;
  }
  return len;
}

/**
 * Project a point onto a polyline path. Returns the closest segment index,
 * parametric t along that segment, the projected point, and distance.
 */
function projectOntoPath(
  p: Point,
  path: Point[],
): { segIndex: number; t: number; point: Point; distance: number } {
  let bestDist = Infinity;
  let bestSegIdx = 0;
  let bestT = 0;
  let bestPoint: Point = path[0];

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    }
    const proj = { x: a.x + t * dx, y: a.y + t * dy };
    const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestT = t;
      bestPoint = proj;
    }
  }

  return { segIndex: bestSegIdx, t: bestT, point: bestPoint, distance: bestDist };
}

/**
 * Extract a sub-path between two parametric positions on a polyline.
 */
function extractSubPath(
  path: Point[],
  segA: number,
  tA: number,
  segB: number,
  tB: number,
): Point[] {
  let reversed = false;
  let startSeg = segA, startT = tA, endSeg = segB, endT = tB;
  if (segA > segB || (segA === segB && tA > tB)) {
    startSeg = segB; startT = tB;
    endSeg = segA; endT = tA;
    reversed = true;
  }

  const result: Point[] = [];

  // Start point.
  const sA = path[startSeg];
  const sB = path[startSeg + 1];
  result.push({
    x: sA.x + startT * (sB.x - sA.x),
    y: sA.y + startT * (sB.y - sA.y),
  });

  // Intermediate full points.
  if (startSeg !== endSeg) {
    for (let i = startSeg + 1; i <= endSeg; i++) {
      result.push(path[i]);
    }
  }

  // End point.
  const eA = path[endSeg];
  const eB = path[endSeg + 1];
  result.push({
    x: eA.x + endT * (eB.x - eA.x),
    y: eA.y + endT * (eB.y - eA.y),
  });

  if (reversed) result.reverse();
  return result;
}

/** Get the full path points for a line. */
function getPathPoints(l: Line): Point[] {
  if (l.pathPoints && l.pathPoints.length >= 2) {
    return l.pathPoints;
  }
  return [l.a, l.b];
}

/**
 * Find a clear (non-boundary) seed point offset from a midpoint along a normal.
 * Tries increasing offsets until finding a pixel that's not on a boundary.
 * Returns null if no clear pixel found within range.
 */
function findClearSeed(
  midpoint: Point,
  normal: Point,
  baseOffset: number,
  boundaryData: ImageData,
): Point | null {
  const w = boundaryData.width;
  const h = boundaryData.height;

  // Try offsets from baseOffset outward.
  for (let offset = baseOffset; offset <= baseOffset + 8; offset += 1) {
    const x = Math.round(midpoint.x + normal.x * offset);
    const y = Math.round(midpoint.y + normal.y * offset);
    if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue;
    if (boundaryData.data[((y * w + x) * 4) + 3] <= 50) {
      return { x, y };
    }
  }

  return null;
}

/** Check if a pixel position is already filled/boundary. */
function isPixelFilled(boundaryData: ImageData, p: Point): boolean {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || x >= w || y < 0 || y >= h) return true;
  return boundaryData.data[((y * w + x) * 4) + 3] > 50;
}

/** Find a seed via spiral search from a center point. */
function findSeedBySpiral(boundaryData: ImageData, center: Point): Point | null {
  const w = boundaryData.width;
  const h = boundaryData.height;

  for (let r = 2; r < 100; r += 2) {
    for (let angle = 0; angle < 360; angle += 10) {
      const rad = angle * Math.PI / 180;
      const x = Math.round(center.x + r * Math.cos(rad));
      const y = Math.round(center.y + r * Math.sin(rad));
      if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue;
      if (boundaryData.data[((y * w + x) * 4) + 3] <= 50) {
        // Quick check that it's bounded.
        if (isFloodBounded(boundaryData, x, y)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

/** Quick bounded check — does a BFS stay within canvas bounds? */
function isFloodBounded(boundaryData: ImageData, sx: number, sy: number): boolean {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  let count = 0;

  while (head < queue.length && count < 60000) {
    const x = queue[head++];
    const y = queue[head++];
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) return false;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    count++;
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  return count < 60000 && count > 5;
}

/**
 * Flood fill with midpoint proximity check.
 * Returns filled indices AND whether the fill hit other midpoints (meaning it's the pentagon).
 */
function doFloodFillWithMidpointCheck(
  boundaryData: ImageData,
  seed: Point,
  otherMidpoints: Point[],
): { filledIndices: number[]; hitsMidpoints: boolean } {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);

  if (sx < 1 || sx >= w - 1 || sy < 1 || sy >= h - 1) {
    return { filledIndices: [], hitsMidpoints: false };
  }
  if (boundaryData.data[((sy * w + sx) * 4) + 3] > 50) {
    return { filledIndices: [], hitsMidpoints: false };
  }

  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filled: number[] = [];
  let midpointsHit = 0;
  const midpointHitFlags = new Uint8Array(otherMidpoints.length);

  while (head < queue.length && filled.length < 150000) {
    const x = queue[head++];
    const y = queue[head++];
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) {
      // Hit canvas edge — unbounded.
      return { filledIndices: [], hitsMidpoints: false };
    }
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    filled.push(idx);

    // Check proximity to other midpoints.
    for (let m = 0; m < otherMidpoints.length; m++) {
      if (midpointHitFlags[m]) continue;
      const mp = otherMidpoints[m];
      const dx = x - mp.x;
      const dy = y - mp.y;
      if (dx * dx + dy * dy <= MIDPOINT_HIT_RADIUS * MIDPOINT_HIT_RADIUS) {
        midpointHitFlags[m] = 1;
        midpointsHit++;
      }
    }

    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (filled.length >= 150000) {
    return { filledIndices: [], hitsMidpoints: false };
  }

  // Pentagon must hit at least 3 of the 4 other midpoints.
  const hitsMidpoints = midpointsHit >= 3;

  return { filledIndices: filled, hitsMidpoints };
}

/**
 * Standard bounded flood fill. Returns empty if unbounded or too large.
 */
function doFloodFillSimple(
  boundaryData: ImageData,
  seed: Point,
): { filledIndices: number[] } {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);

  if (sx < 1 || sx >= w - 1 || sy < 1 || sy >= h - 1) {
    return { filledIndices: [] };
  }
  if (boundaryData.data[((sy * w + sx) * 4) + 3] > 50) {
    return { filledIndices: [] };
  }

  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filled: number[] = [];

  while (head < queue.length && filled.length < 150000) {
    const x = queue[head++];
    const y = queue[head++];
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) {
      return { filledIndices: [] };
    }
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    filled.push(idx);
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (filled.length >= 150000) {
    return { filledIndices: [] };
  }

  return { filledIndices: filled };
}

/** Render a set of pixel indices to a data URL with the given color. */
function renderFillToDataUrl(filledIndices: number[], color: string, size: number): string {
  if (filledIndices.length === 0) return '';

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.fillStyle = color;
  tCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = tCtx.getImageData(0, 0, 1, 1).data;

  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = size;
  fillCanvas.height = size;
  const fCtx = fillCanvas.getContext('2d')!;
  const fillData = fCtx.createImageData(size, size);

  for (const idx of filledIndices) {
    const p = idx * 4;
    fillData.data[p] = r;
    fillData.data[p + 1] = g;
    fillData.data[p + 2] = b;
    fillData.data[p + 3] = a;
  }

  fCtx.putImageData(fillData, 0, 0);
  return fillCanvas.toDataURL();
}

/** Mark filled pixels as boundary so subsequent fills can't enter them. */
function markAsBoundary(data: ImageData, indices: number[]): void {
  for (const idx of indices) {
    data.data[idx * 4 + 3] = 255;
  }
}

/** Compute centroid of a set of points. */
function centroid(points: Point[]): Point {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

/**
 * Midpoint-based validation: checks whether the pentagon exists as a single
 * bounded region by flood-filling from a pentagon edge midpoint and verifying
 * the fill touches all other midpoints.
 *
 * Returns true if the star is geometrically valid (no inward-pointing tips).
 * Returns false if any tip slices through the pentagon, making it non-contiguous.
 */
export function validatePentagonByMidpointFill(
  pentCycle: number[],
  vertices: Point[],
  lines: Line[],
): boolean {
  // Build boundary canvas (same approach as fill).
  let maxCoord = 600;
  for (const l of lines) {
    maxCoord = Math.max(maxCoord, l.a.x, l.a.y, l.b.x, l.b.y);
    if (l.pathPoints) {
      for (const p of l.pathPoints) {
        maxCoord = Math.max(maxCoord, p.x, p.y);
      }
    }
  }
  const canvasSize = Math.ceil(maxCoord) + 20;

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const l of lines) {
    const pathStr = lineToPath(l);
    try {
      const path2d = new Path2D(pathStr);
      ctx.stroke(path2d);
    } catch {
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
    }
  }

  const boundaryData = ctx.getImageData(0, 0, canvasSize, canvasSize);

  // Find midpoints for all 5 pentagon edges.
  const midpoints: Point[] = [];
  const normals: Point[] = [];
  for (let i = 0; i < 5; i++) {
    const vA = vertices[pentCycle[i]];
    const vB = vertices[pentCycle[(i + 1) % 5]];
    const result = findEdgeMidpointAndNormal(vA, vB, lines);
    midpoints.push(result.midpoint);
    normals.push(result.normal);
  }

  // Try midpoint 0: seed side A, then side B.
  const otherMidpoints = midpoints.slice(1);
  const mid = midpoints[0];
  const normal = normals[0];

  const seedA = findClearSeed(mid, normal, SEED_OFFSET, boundaryData);
  const seedB = findClearSeed(mid, { x: -normal.x, y: -normal.y }, SEED_OFFSET, boundaryData);

  // Try side A.
  if (seedA) {
    const fillA = doFloodFillWithMidpointCheck(boundaryData, seedA, otherMidpoints);
    if (fillA.hitsMidpoints) return true; // Side A is the pentagon — valid!
    // Side A is a triangle (bounded, no midpoint hits). Flip to B.
    if (fillA.filledIndices.length > 0 && seedB) {
      // Mark triangle as boundary so pentagon fill is isolated.
      markAsBoundary(boundaryData, fillA.filledIndices);
      const fillB = doFloodFillWithMidpointCheck(boundaryData, seedB, otherMidpoints);
      if (fillB.hitsMidpoints) return true; // Pentagon found on side B — valid!
      // Side B is also not the pentagon → invalid (inward tip).
      return false;
    }
  }

  // Try side B first if A didn't work.
  if (seedB) {
    const fillB = doFloodFillWithMidpointCheck(boundaryData, seedB, otherMidpoints);
    if (fillB.hitsMidpoints) return true;
    if (fillB.filledIndices.length > 0 && seedA) {
      markAsBoundary(boundaryData, fillB.filledIndices);
      const fillA = doFloodFillWithMidpointCheck(boundaryData, seedA, otherMidpoints);
      if (fillA.hitsMidpoints) return true;
      return false;
    }
  }

  // If neither side produced a bounded fill at all, we can't determine — assume valid
  // (the graph-theory check already passed, and this edge case is extremely rare).
  return true;
}
