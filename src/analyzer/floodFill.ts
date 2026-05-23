import type { Line, Point } from '../canvas/types';
import { lineToPath } from '../canvas/curveUtils';

const CANVAS_SIZE = 600;
const STROKE_WIDTH = 4;

/**
 * Given validated star info, produce filled canvas overlays for each face.
 * 
 * For each shape (pentagon + 5 triangles):
 * 1. Render ONLY that shape's boundary lines on a clean canvas
 * 2. Find a seed point that produces a bounded fill (doesn't hit canvas edge)
 * 3. Flood fill from that seed
 * 4. Return as data URL
 */
export function generateFillOverlays(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[] } | null {
  // Find which lines form each face's boundary.
  const exploded = explodeAtCorners(lines);

  // Pentagon: edges between consecutive pentagon vertices
  const pentEdgeLines = findEdgeLines(pentCycle, vertices, exploded);
  const pentDataUrl = fillShape(pentEdgeLines, vertices, pentCycle, 'rgba(126, 200, 227, 0.3)');

  // Triangles
  const triDataUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    const triVertexIndices = [pentCycle[i], tipAssignment[i], pentCycle[(i + 1) % 5]];
    const triEdgeLines = findEdgeLines(triVertexIndices, vertices, exploded);
    const triDataUrl = fillShape(triEdgeLines, vertices, triVertexIndices, 'rgba(176, 136, 249, 0.2)');
    triDataUrls.push(triDataUrl);
  }

  return { pentagonDataUrl: pentDataUrl, triangleDataUrls: triDataUrls };
}

/**
 * Find the drawn lines that form the edges of a face.
 * A face is defined by an ordered list of vertex indices.
 * Each edge is between consecutive vertices (wrapping around).
 */
function findEdgeLines(faceVertexIndices: number[], vertices: Point[], allLines: Line[]): Line[] {
  const result: Line[] = [];
  for (let i = 0; i < faceVertexIndices.length; i++) {
    const from = vertices[faceVertexIndices[i]];
    const to = vertices[faceVertexIndices[(i + 1) % faceVertexIndices.length]];
    const edgeLine = findBestLine(from, to, allLines);
    if (edgeLine) result.push(edgeLine);
  }
  return result;
}

/**
 * Find the line that best connects two vertex positions.
 * Searches for any line whose path passes near both vertices.
 */
function findBestLine(from: Point, to: Point, lines: Line[]): Line | null {
  let best: Line | null = null;
  let bestDist = Infinity;

  for (const l of lines) {
    const pts = l.pathPoints && l.pathPoints.length >= 2 ? l.pathPoints : [l.a, l.b];
    
    // Find closest point to `from` and `to` along this line's path
    let closestFromDist = Infinity;
    let closestToDist = Infinity;
    let fromIdx = -1, toIdx = -1;
    
    for (let i = 0; i < pts.length; i++) {
      const df = Math.hypot(pts[i].x - from.x, pts[i].y - from.y);
      const dt = Math.hypot(pts[i].x - to.x, pts[i].y - to.y);
      if (df < closestFromDist) { closestFromDist = df; fromIdx = i; }
      if (dt < closestToDist) { closestToDist = dt; toIdx = i; }
    }
    
    if (closestFromDist > 8 || closestToDist > 8) continue;
    if (fromIdx === toIdx) continue;
    
    const totalDist = closestFromDist + closestToDist;
    if (totalDist < bestDist) {
      bestDist = totalDist;
      // Create a sub-line with just the portion between from and to
      const startIdx = Math.min(fromIdx, toIdx);
      const endIdx = Math.max(fromIdx, toIdx);
      const subPts = pts.slice(startIdx, endIdx + 1);
      if (fromIdx > toIdx) subPts.reverse();
      best = { id: l.id + '__sub', a: subPts[0], b: subPts[subPts.length - 1], pathPoints: subPts };
    }
  }

  return best;
}

/**
 * Fill a shape defined by its boundary lines.
 * Renders only those lines, then searches for a valid seed point
 * (one that produces a bounded fill that doesn't hit the canvas edge).
 */
function fillShape(boundaryLines: Line[], vertices: Point[], vertexIndices: number[], color: string): string {
  // Render boundary lines on a clean canvas.
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const l of boundaryLines) {
    const pathStr = lineToPath(l);
    try {
      const path2d = new Path2D(pathStr);
      ctx.stroke(path2d);
    } catch {
      // Fallback: draw straight line
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
    }
  }

  const boundaryData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Find a valid seed point by searching near the centroid.
  const facePoints = vertexIndices.map((i) => vertices[i]);
  const center = centroid(facePoints);
  const seed = findValidSeed(boundaryData, center);

  if (!seed) return '';

  // Flood fill from the seed.
  return doFloodFill(boundaryData, seed, color);
}

/**
 * Search for a valid seed point: one that produces a fill that doesn't
 * hit the canvas edge. Start at the centroid and spiral outward.
 */
function findValidSeed(boundaryData: ImageData, center: Point): Point | null {
  const w = boundaryData.width;
  const h = boundaryData.height;

  // Try the centroid first.
  const candidates: Point[] = [center];

  // Spiral outward from centroid.
  for (let r = 3; r < 50; r += 3) {
    for (let angle = 0; angle < 360; angle += 30) {
      const rad = angle * Math.PI / 180;
      candidates.push({
        x: center.x + r * Math.cos(rad),
        y: center.y + r * Math.sin(rad),
      });
    }
  }

  for (const candidate of candidates) {
    const cx = Math.round(candidate.x);
    const cy = Math.round(candidate.y);
    if (cx < 1 || cx >= w - 1 || cy < 1 || cy >= h - 1) continue;

    // Skip if on a boundary pixel.
    const idx = (cy * w + cx) * 4;
    if (boundaryData.data[idx + 3] > 50) continue;

    // Quick test: flood fill and check if it hits the edge.
    if (isFloodBounded(boundaryData, cx, cy)) {
      return { x: cx, y: cy };
    }
  }

  return null;
}

/**
 * Quick check: does a flood fill from (sx, sy) stay bounded (not hit canvas edge)?
 */
function isFloodBounded(boundaryData: ImageData, sx: number, sy: number): boolean {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy]; // flat array of x,y pairs
  let head = 0;

  const maxPixels = w * h / 3;
  let count = 0;

  while (head < queue.length && count < maxPixels) {
    const x = queue[head++];
    const y = queue[head++];
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) return false; // Hit edge!
    const idx = y * w + x;
    if (visited[idx]) continue;
    const pIdx = idx * 4;
    if (boundaryData.data[pIdx + 3] > 50) continue; // Boundary
    visited[idx] = 1;
    count++;
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  return count > 0 && count < maxPixels;
}

/**
 * Perform the actual flood fill and return a data URL of the filled region.
 */
function doFloodFill(boundaryData: ImageData, seed: Point, color: string): string {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);

  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filledPixels: number[] = []; // flat array of indices

  const maxPixels = w * h / 3;

  while (head < queue.length && filledPixels.length < maxPixels) {
    const x = queue[head++];
    const y = queue[head++];
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    const pIdx = idx * 4;
    if (boundaryData.data[pIdx + 3] > 50) continue;
    visited[idx] = 1;
    filledPixels.push(idx);
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (filledPixels.length === 0) return '';

  // Render to canvas.
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = w;
  fillCanvas.height = h;
  const fCtx = fillCanvas.getContext('2d')!;

  // Parse color.
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.fillStyle = color;
  tCtx.fillRect(0, 0, 1, 1);
  const colorData = tCtx.getImageData(0, 0, 1, 1).data;

  const fillData = fCtx.createImageData(w, h);
  for (const idx of filledPixels) {
    const pIdx = idx * 4;
    fillData.data[pIdx] = colorData[0];
    fillData.data[pIdx + 1] = colorData[1];
    fillData.data[pIdx + 2] = colorData[2];
    fillData.data[pIdx + 3] = colorData[3];
  }

  fCtx.putImageData(fillData, 0, 0);
  return fillCanvas.toDataURL();
}

function centroid(points: Point[]): Point {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

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
