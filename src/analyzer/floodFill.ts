import type { Line, Point } from '../canvas/types';
import { lineToPath } from '../canvas/curveUtils';

const CANVAS_SIZE = 600;
const STROKE_WIDTH = 4;

/**
 * Given validated star info, produce filled canvas overlays for each face.
 *
 * Approach: render ALL lines on one boundary canvas. For each face,
 * find an interior seed point (via spiral search) that produces a bounded
 * fill. The other lines naturally act as boundaries between faces.
 */
export function generateFillOverlays(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[]; debug: string } | null {
  // Render all lines on a shared boundary canvas.
  const boundaryCanvas = document.createElement('canvas');
  boundaryCanvas.width = CANVAS_SIZE;
  boundaryCanvas.height = CANVAS_SIZE;
  const ctx = boundaryCanvas.getContext('2d')!;
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

  const debugLines: string[] = [];
  debugLines.push('=== FLOOD FILL DEBUG ===');
  debugLines.push(`Lines rendered: ${lines.length}`);

  // Pentagon: seed search near centroid of pentagon vertices
  const pentPoints = pentCycle.map((i) => vertices[i]);
  const pentCenter = centroid(pentPoints);
  debugLines.push(`\nPENTAGON centroid: (${pentCenter.x.toFixed(1)}, ${pentCenter.y.toFixed(1)})`);
  const pentSeed = findValidSeed(boundaryData, pentCenter);
  debugLines.push(`Pentagon seed found: ${pentSeed ? `(${pentSeed.x}, ${pentSeed.y})` : 'NONE'}`);
  const pentDataUrl = pentSeed ? doFloodFill(boundaryData, pentSeed, 'rgba(126, 200, 227, 0.3)') : '';
  debugLines.push(`Pentagon fill: ${pentDataUrl ? 'SUCCESS' : 'FAILED'}`);

  // Triangles: seed search near centroid of each triangle's vertices
  const triDataUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    const triPoints = [
      vertices[pentCycle[i]],
      vertices[tipAssignment[i]],
      vertices[pentCycle[(i + 1) % 5]],
    ];
    const triCenter = centroid(triPoints);
    debugLines.push(`\nTRIANGLE ${i} vertices: [${pentCycle[i]}, ${tipAssignment[i]}, ${pentCycle[(i + 1) % 5]}]`);
    debugLines.push(`  centroid: (${triCenter.x.toFixed(1)}, ${triCenter.y.toFixed(1)})`);
    const triSeed = findValidSeed(boundaryData, triCenter);
    debugLines.push(`  seed found: ${triSeed ? `(${triSeed.x}, ${triSeed.y})` : 'NONE'}`);
    const triDataUrl = triSeed ? doFloodFill(boundaryData, triSeed, 'rgba(176, 136, 249, 0.2)') : '';
    debugLines.push(`  fill: ${triDataUrl ? 'SUCCESS' : 'FAILED'}`);
    triDataUrls.push(triDataUrl);
  }

  return { pentagonDataUrl: pentDataUrl, triangleDataUrls: triDataUrls, debug: debugLines.join('\n') };
}

/**
 * Search for a valid seed: one that produces a bounded fill.
 * Spiral outward from center, testing candidates.
 */
function findValidSeed(boundaryData: ImageData, center: Point): Point | null {
  const w = boundaryData.width;
  const h = boundaryData.height;

  const candidates: Point[] = [center];
  for (let r = 2; r < 40; r += 2) {
    for (let angle = 0; angle < 360; angle += 20) {
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
    if (cx < 2 || cx >= w - 2 || cy < 2 || cy >= h - 2) continue;
    // Skip boundary pixels
    if (boundaryData.data[((cy * w + cx) * 4) + 3] > 50) continue;
    if (isFloodBounded(boundaryData, cx, cy)) {
      return { x: cx, y: cy };
    }
  }

  return null;
}

/**
 * Quick bounded check: BFS from seed, return true if it stays within canvas edges.
 * Uses a pixel limit to avoid checking the entire canvas.
 */
function isFloodBounded(boundaryData: ImageData, sx: number, sy: number): boolean {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  let count = 0;
  const maxCheck = 80000; // Check at most this many pixels for speed

  while (head < queue.length && count < maxCheck) {
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

  // If we hit maxCheck without hitting edge, assume bounded
  // (large shapes are still valid)
  return count > 5; // Must fill at least a few pixels
}

/**
 * Full flood fill, returns data URL.
 */
function doFloodFill(boundaryData: ImageData, seed: Point, color: string): string {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);

  const visited = new Uint8Array(w * h);
  const queue: number[] = [sx, sy];
  let head = 0;
  const filledIndices: number[] = [];
  const maxPixels = 150000;

  while (head < queue.length && filledIndices.length < maxPixels) {
    const x = queue[head++];
    const y = queue[head++];
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (boundaryData.data[idx * 4 + 3] > 50) continue;
    visited[idx] = 1;
    filledIndices.push(idx);
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (filledIndices.length === 0) return '';

  // Parse color
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1; tempCanvas.height = 1;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.fillStyle = color;
  tCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = tCtx.getImageData(0, 0, 1, 1).data;

  // Write pixels
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = w; fillCanvas.height = h;
  const fCtx = fillCanvas.getContext('2d')!;
  const fillData = fCtx.createImageData(w, h);

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

function centroid(points: Point[]): Point {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}
