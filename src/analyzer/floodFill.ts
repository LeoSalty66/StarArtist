import type { Line, Point } from '../canvas/types';

const CANVAS_SIZE = 600;
const STROKE_WIDTH = 4;

/**
 * Generate fill overlays using ISOLATED SHAPES:
 * For each face, render ONLY that face's edges, find a bounded seed, fill it.
 */
export function generateFillOverlays(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[]; debug: string } | null {
  const debugLines: string[] = ['=== FLOOD FILL DEBUG ==='];
  debugLines.push(`Lines: ${lines.length}`);

  // Pentagon
  const pentPoints = pentCycle.map((i) => vertices[i]);
  const pentCenter = centroid(pentPoints);
  debugLines.push(`\nPENTAGON centroid: (${pentCenter.x.toFixed(1)}, ${pentCenter.y.toFixed(1)})`);
  const pentBoundary = renderIsolatedFace(pentCycle, vertices, lines);
  const pentSeed = findValidSeed(pentBoundary, pentCenter);
  debugLines.push(`Pentagon seed: ${pentSeed ? `(${pentSeed.x}, ${pentSeed.y})` : 'NONE'}`);
  const pentDataUrl = pentSeed ? doFloodFill(pentBoundary, pentSeed, 'rgba(126, 200, 227, 0.3)').dataUrl : '';
  debugLines.push(`Pentagon fill: ${pentDataUrl ? 'SUCCESS' : 'FAILED'}`);

  // Triangles
  const triDataUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    const triVerts = [pentCycle[i], tipAssignment[i], pentCycle[(i + 1) % 5]];
    const triPoints = triVerts.map((v) => vertices[v]);
    const triCenter = centroid(triPoints);
    debugLines.push(`\nTRIANGLE ${i} vertices: [${triVerts.join(', ')}]`);
    debugLines.push(`  centroid: (${triCenter.x.toFixed(1)}, ${triCenter.y.toFixed(1)})`);
    const triBoundary = renderIsolatedFace(triVerts, vertices, lines);
    const triSeed = findValidSeed(triBoundary, triCenter);
    debugLines.push(`  seed: ${triSeed ? `(${triSeed.x}, ${triSeed.y})` : 'NONE'}`);
    const triDataUrl = triSeed ? doFloodFill(triBoundary, triSeed, 'rgba(176, 136, 249, 0.2)').dataUrl : '';
    debugLines.push(`  fill: ${triDataUrl ? 'SUCCESS' : 'FAILED'}`);
    triDataUrls.push(triDataUrl);
  }

  return { pentagonDataUrl: pentDataUrl, triangleDataUrls: triDataUrls, debug: debugLines.join('\n') };
}

/**
 * Render only the edges of a single face onto a clean canvas.
 * For each edge (vertex pair), find the portion of an original line's path
 * that connects them and draw it.
 */
function renderIsolatedFace(faceVertexIndices: number[], vertices: Point[], originalLines: Line[]): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < faceVertexIndices.length; i++) {
    const fromPt = vertices[faceVertexIndices[i]];
    const toPt = vertices[faceVertexIndices[(i + 1) % faceVertexIndices.length]];
    drawSubPath(ctx, fromPt, toPt, originalLines);
  }

  return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

/**
 * Draw the sub-path between two vertex positions by searching original lines.
 * For each original line, walk its pathPoints and find the closest indices to
 * both vertices, then draw the sub-path between them.
 */
function drawSubPath(ctx: CanvasRenderingContext2D, from: Point, to: Point, lines: Line[]): void {
  const NEAR = 10;
  let bestSubPath: Point[] | null = null;
  let bestLength = Infinity;

  for (const l of lines) {
    const pts = l.pathPoints && l.pathPoints.length >= 2 ? l.pathPoints : [l.a, l.b];

    // Find ALL indices near `from` and `to`
    const fromIndices: number[] = [];
    const toIndices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - from.x, pts[i].y - from.y) < NEAR) fromIndices.push(i);
      if (Math.hypot(pts[i].x - to.x, pts[i].y - to.y) < NEAR) toIndices.push(i);
    }

    // Try all from/to index combinations, pick the shortest sub-path
    for (const fi of fromIndices) {
      for (const ti of toIndices) {
        if (fi === ti) continue;
        const startIdx = Math.min(fi, ti);
        const endIdx = Math.max(fi, ti);
        const subPath = pts.slice(startIdx, endIdx + 1);
        // Compute length
        let len = 0;
        for (let k = 1; k < subPath.length; k++) {
          len += Math.hypot(subPath[k].x - subPath[k - 1].x, subPath[k].y - subPath[k - 1].y);
        }
        if (len < bestLength) {
          bestLength = len;
          bestSubPath = fi < ti ? subPath : [...subPath].reverse();
        }
      }
    }
  }

  // Draw the best sub-path found
  ctx.beginPath();
  if (bestSubPath && bestSubPath.length >= 2) {
    ctx.moveTo(bestSubPath[0].x, bestSubPath[0].y);
    for (let i = 1; i < bestSubPath.length; i++) {
      ctx.lineTo(bestSubPath[i].x, bestSubPath[i].y);
    }
  } else {
    // Fallback: straight line
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
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
