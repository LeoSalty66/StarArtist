import type { Line, Point } from '../canvas/types';
import { lineToPath } from '../canvas/curveUtils';

/**
 * Render lines onto a hidden canvas and flood-fill regions to produce
 * filled shape masks as ImageData or canvas elements.
 */

const CANVAS_SIZE = 600; // Match the SVG viewBox
const STROKE_WIDTH = 4; // Width of the stroke boundary on the hidden canvas
const FILL_COLORS = {
  pentagon: 'rgba(126, 200, 227, 0.3)',
  triangle: 'rgba(176, 136, 249, 0.2)',
};

/**
 * Given validated star info, produce filled canvas overlays for each face.
 * Returns data URLs of individual face canvases that can be used as <image> in SVG.
 */
export function generateFillOverlays(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[] } | null {
  // Create hidden canvas and render all lines as boundaries.
  const boundaryCanvas = document.createElement('canvas');
  boundaryCanvas.width = CANVAS_SIZE;
  boundaryCanvas.height = CANVAS_SIZE;
  const ctx = boundaryCanvas.getContext('2d')!;

  // Draw all lines as black strokes on white background won't work.
  // Instead: transparent background, draw lines as opaque boundary.
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const l of lines) {
    const pathStr = lineToPath(l);
    const path2d = new Path2D(pathStr);
    ctx.stroke(path2d);
  }

  // Get the boundary pixel data.
  const boundaryData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Pentagon fill
  const pentCenter = centroid(pentCycle.map((i) => vertices[i]));
  const pentCanvas = floodFillFromSeed(boundaryData, pentCenter, FILL_COLORS.pentagon);

  // Triangle fills
  const triCanvases: string[] = [];
  for (let i = 0; i < 5; i++) {
    const triVerts = [
      vertices[pentCycle[i]],
      vertices[tipAssignment[i]],
      vertices[pentCycle[(i + 1) % 5]],
    ];
    const triCenter = centroid(triVerts);
    const triCanvas = floodFillFromSeed(boundaryData, triCenter, FILL_COLORS.triangle);
    triCanvases.push(triCanvas);
  }

  return { pentagonDataUrl: pentCanvas, triangleDataUrls: triCanvases };
}

/**
 * Flood fill from a seed point on the boundary image, return a data URL
 * of a canvas filled with the given color in the enclosed region.
 */
function floodFillFromSeed(boundaryData: ImageData, seed: Point, fillColor: string): string {
  const w = boundaryData.width;
  const h = boundaryData.height;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);

  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return '';

  // Create a visited array.
  const visited = new Uint8Array(w * h);

  // Check if a pixel is a boundary (has any opacity).
  const isBoundary = (x: number, y: number): boolean => {
    if (x < 0 || x >= w || y < 0 || y >= h) return true; // Out of bounds = boundary
    const idx = (y * w + x) * 4;
    return boundaryData.data[idx + 3] > 50; // Alpha > threshold = boundary
  };

  // BFS flood fill from seed.
  const queue: [number, number][] = [[sx, sy]];
  const filledPixels: [number, number][] = [];

  if (isBoundary(sx, sy)) {
    // Seed is on a boundary line — try nudging slightly
    const offsets = [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]];
    let found = false;
    for (const [dx, dy] of offsets) {
      if (!isBoundary(sx + dx, sy + dy)) {
        queue[0] = [sx + dx, sy + dy];
        found = true;
        break;
      }
    }
    if (!found) return '';
  }

  const maxPixels = w * h / 4; // Safety limit: don't fill more than 25% of canvas
  
  while (queue.length > 0 && filledPixels.length < maxPixels) {
    const [x, y] = queue.pop()!;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (isBoundary(x, y)) continue;
    visited[idx] = 1;
    filledPixels.push([x, y]);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Render filled pixels onto a new canvas.
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = w;
  fillCanvas.height = h;
  const fCtx = fillCanvas.getContext('2d')!;

  // Parse the fill color.
  fCtx.fillStyle = fillColor;
  
  // Draw each filled pixel (batch with ImageData for performance).
  const fillData = fCtx.createImageData(w, h);
  // Parse rgba from fillColor string.
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.fillStyle = fillColor;
  tCtx.fillRect(0, 0, 1, 1);
  const colorData = tCtx.getImageData(0, 0, 1, 1).data;

  for (const [x, y] of filledPixels) {
    const idx = (y * w + x) * 4;
    fillData.data[idx] = colorData[0];
    fillData.data[idx + 1] = colorData[1];
    fillData.data[idx + 2] = colorData[2];
    fillData.data[idx + 3] = colorData[3];
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
