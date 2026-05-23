import type { Line, Point } from '../canvas/types';
import { lineToPath } from '../canvas/curveUtils';

const CANVAS_SIZE = 600;
const STROKE_WIDTH = 4;

/**
 * Generate fill overlays using ALL lines as boundary with progressive claiming.
 * After each shape is filled, its pixels become boundary so subsequent fills
 * can't overlap.
 */
export function generateFillOverlays(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[]; debug: string } | null {
  const debugLines: string[] = ['=== FLOOD FILL DEBUG ==='];

  // Render ALL lines as boundary.
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
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

  const boundaryData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  debugLines.push(`Lines rendered: ${lines.length}`);

  // Fill pentagon first.
  const pentPoints = pentCycle.map((i) => vertices[i]);
  const pentCenter = centroid(pentPoints);
  debugLines.push(`\nPENTAGON centroid: (${pentCenter.x.toFixed(1)}, ${pentCenter.y.toFixed(1)})`);
  const pentSeed = findValidSeed(boundaryData, pentCenter);
  debugLines.push(`Pentagon seed: ${pentSeed ? `(${pentSeed.x}, ${pentSeed.y})` : 'NONE'}`);
  let pentDataUrl = '';
  if (pentSeed) {
    const { dataUrl, filledIndices } = doFloodFill(boundaryData, pentSeed, 'rgba(126, 200, 227, 0.3)');
    pentDataUrl = dataUrl;
    markAsBoundary(boundaryData, filledIndices);
    debugLines.push(`Pentagon fill: SUCCESS (${filledIndices.length} pixels)`);
  } else {
    debugLines.push(`Pentagon fill: FAILED`);
  }

  // Fill triangles.
  const triDataUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    const triVerts = [pentCycle[i], tipAssignment[i], pentCycle[(i + 1) % 5]];
    const triPoints = triVerts.map((v) => vertices[v]);
    const triCenter = centroid(triPoints);
    debugLines.push(`\nTRIANGLE ${i} vertices: [${triVerts.join(', ')}]`);
    debugLines.push(`  centroid: (${triCenter.x.toFixed(1)}, ${triCenter.y.toFixed(1)})`);
    const triSeed = findValidSeed(boundaryData, triCenter);
    debugLines.push(`  seed: ${triSeed ? `(${triSeed.x}, ${triSeed.y})` : 'NONE'}`);
    if (triSeed) {
      const { dataUrl, filledIndices } = doFloodFill(boundaryData, triSeed, 'rgba(176, 136, 249, 0.2)');
      triDataUrls.push(dataUrl);
      markAsBoundary(boundaryData, filledIndices);
      debugLines.push(`  fill: SUCCESS (${filledIndices.length} pixels)`);
    } else {
      triDataUrls.push('');
      debugLines.push(`  fill: FAILED`);
    }
  }

  return { pentagonDataUrl: pentDataUrl, triangleDataUrls: triDataUrls, debug: debugLines.join('\n') };
}

function markAsBoundary(data: ImageData, indices: number[]): void {
  for (const idx of indices) {
    data.data[idx * 4 + 3] = 255;
  }
}

/**
 * Find a triangle seed that shares a significant border with the pentagon.
 * Does a quick fill from each candidate, counts how many border pixels
 * neighbor the pentagon's filled pixels. If too few (≤20), it's whitespace.
 */
function findTriangleSeed(
  boundaryData: ImageData,
  center: Point,
  pentFilledSet: Set<number>,
): Point | null {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const MIN_SHARED_BORDER = 20;

  const candidates: Point[] = [center];
  for (let r = 2; r < 150; r += 2) {
    for (let angle = 0; angle < 360; angle += 10) {
      const rad = angle * Math.PI / 180;
      candidates.push({ x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) });
    }
  }

  for (const c of candidates) {
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    if (cx < 2 || cx >= w - 2 || cy < 2 || cy >= h - 2) continue;
    if (boundaryData.data[((cy * w + cx) * 4) + 3] > 50) continue;
    if (!isFloodBounded(boundaryData, cx, cy)) continue;

    // Quick fill to get the region's pixels.
    const { filledIndices } = doFloodFillRaw(boundaryData, cx, cy);
    if (filledIndices.length < 5) continue;

    // Count border pixels shared with pentagon.
    if (pentFilledSet.size === 0) return { x: cx, y: cy };

    let sharedBorder = 0;
    for (const idx of filledIndices) {
      const x = idx % w;
      const y = Math.floor(idx / w);
      if (pentFilledSet.has((y - 1) * w + x) ||
          pentFilledSet.has((y + 1) * w + x) ||
          pentFilledSet.has(y * w + x - 1) ||
          pentFilledSet.has(y * w + x + 1)) {
        sharedBorder++;
        if (sharedBorder >= MIN_SHARED_BORDER) break;
      }
    }

    if (sharedBorder >= MIN_SHARED_BORDER) return { x: cx, y: cy };
  }

  return null;
}

/** Raw flood fill that just returns indices without rendering to canvas. */
function doFloodFillRaw(boundaryData: ImageData, sx: number, sy: number): { filledIndices: number[] } {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filled: number[] = [];

  while (head < queue.length && filled.length < 60000) {
    const x = queue[head++];
    const y = queue[head++];
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    filled.push(idx);
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  return { filledIndices: filled };
}

function findValidSeed(boundaryData: ImageData, center: Point): Point | null {
  const w = boundaryData.width;
  const h = boundaryData.height;

  const candidates: Point[] = [center];
  for (let r = 2; r < 150; r += 2) {
    for (let angle = 0; angle < 360; angle += 10) {
      const rad = angle * Math.PI / 180;
      candidates.push({ x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) });
    }
  }

  for (const c of candidates) {
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    if (cx < 2 || cx >= w - 2 || cy < 2 || cy >= h - 2) continue;
    if (boundaryData.data[((cy * w + cx) * 4) + 3] > 50) continue;
    if (isFloodBounded(boundaryData, cx, cy)) return { x: cx, y: cy };
  }

  return null;
}

function isFloodBounded(boundaryData: ImageData, sx: number, sy: number): boolean {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  let count = 0;
  const maxPixels = 60000;

  while (head < queue.length && count < maxPixels) {
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

  if (count >= maxPixels) return false;
  return count > 5;
}

function doFloodFill(boundaryData: ImageData, seed: Point, color: string): { dataUrl: string; filledIndices: number[] } {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);

  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filled: number[] = [];

  while (head < queue.length && filled.length < 150000) {
    const x = queue[head++];
    const y = queue[head++];
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    filled.push(idx);
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (filled.length === 0) return { dataUrl: '', filledIndices: [] };

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1; tempCanvas.height = 1;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.fillStyle = color;
  tCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = tCtx.getImageData(0, 0, 1, 1).data;

  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = w; fillCanvas.height = h;
  const fCtx = fillCanvas.getContext('2d')!;
  const fillData = fCtx.createImageData(w, h);

  for (const idx of filled) {
    const p = idx * 4;
    fillData.data[p] = r;
    fillData.data[p + 1] = g;
    fillData.data[p + 2] = b;
    fillData.data[p + 3] = a;
  }

  fCtx.putImageData(fillData, 0, 0);
  return { dataUrl: fillCanvas.toDataURL(), filledIndices: filled };
}

function centroid(points: Point[]): Point {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}
