import type { Line, Point } from '../canvas/types';
import { lineToPath } from '../canvas/curveUtils';

const CANVAS_SIZE = 600;
const STROKE_WIDTH = 4;

/**
 * Generate fill overlays using ALL lines as boundary.
 * After each shape is filled, mark those pixels as "claimed" so
 * subsequent shapes can't fill into already-claimed regions.
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

  // Get mutable boundary data. We'll mark filled pixels as boundary after each fill.
  const boundaryData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  debugLines.push(`Lines rendered: ${lines.length}`);

  // Fill pentagon first (typically the innermost region).
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

/** Mark pixel indices as boundary (opaque) so future fills can't enter them. */
function markAsBoundary(data: ImageData, indices: number[]): void {
  for (const idx of indices) {
    data.data[idx * 4 + 3] = 255;
  }
}

/**
 * Find a seed for a triangle that produces a bounded fill ADJACENT to the pentagon.
 * A fill is adjacent to the pentagon if any of its border pixels neighbor a pentagon pixel.
 */
function findTriangleSeed(boundaryData: ImageData, center: Point, pentFilledSet: Set<number>): Point | null {
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

    // Quick bounded check
    const fillResult = quickBoundedFill(boundaryData, cx, cy);
    if (!fillResult) continue;

    // Check adjacency: does any pixel in this fill border the pentagon's filled region?
    if (pentFilledSet.size === 0) return { x: cx, y: cy }; // No pentagon to check against

    let adjacentToPent = false;
    for (const idx of fillResult) {
      const x = idx % w;
      const y = Math.floor(idx / w);
      // Check 4 neighbors
      if (pentFilledSet.has((y - 1) * w + x) ||
          pentFilledSet.has((y + 1) * w + x) ||
          pentFilledSet.has(y * w + x - 1) ||
          pentFilledSet.has(y * w + x + 1)) {
        adjacentToPent = true;
        break;
      }
    }

    if (adjacentToPent) return { x: cx, y: cy };
  }

  return null;
}

/**
 * Quick flood fill that returns the filled pixel indices if bounded, or null if unbounded.
 */
function quickBoundedFill(boundaryData: ImageData, sx: number, sy: number): number[] | null {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filled: number[] = [];
  const maxPixels = 60000;

  while (head < queue.length && filled.length < maxPixels) {
    const x = queue[head++];
    const y = queue[head++];
    if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) return null; // Hit edge
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    filled.push(idx);
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (filled.length >= maxPixels) return null; // Too large
  if (filled.length < 5) return null; // Too small
  return filled;
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
  // A legitimate star face should be at most ~20% of the canvas area.
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

  // If we hit maxPixels without finishing, this region is too large to be a star face.
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
