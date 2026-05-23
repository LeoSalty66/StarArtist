import type { Line, Point } from '../canvas/types';

const CANVAS_SIZE = 600;
const STROKE_WIDTH = 4;
const VERTEX_NEAR = 8;

/**
 * Generate fill overlays using shape isolation:
 * For each face, render ONLY that face's boundary, then flood fill.
 * A valid fill never hits the canvas edge.
 */
export function generateFillOverlays(
  pentCycle: number[],
  tipAssignment: number[],
  vertices: Point[],
  lines: Line[],
): { pentagonDataUrl: string; triangleDataUrls: string[]; debug: string } | null {
  const exploded = explodeAtCorners(lines);
  const debugLines: string[] = ['=== FLOOD FILL DEBUG ==='];
  debugLines.push(`Lines rendered (exploded): ${exploded.length}`);

  // Pentagon
  const pentPoints = pentCycle.map((i) => vertices[i]);
  const pentCenter = centroid(pentPoints);
  debugLines.push(`\nPENTAGON centroid: (${pentCenter.x.toFixed(1)}, ${pentCenter.y.toFixed(1)})`);
  const pentBoundary = renderFaceBoundary(pentCycle, vertices, exploded);
  const pentSeed = findValidSeed(pentBoundary, pentCenter);
  debugLines.push(`Pentagon seed: ${pentSeed ? `(${pentSeed.x}, ${pentSeed.y})` : 'NONE'}`);
  const pentDataUrl = pentSeed ? doFloodFill(pentBoundary, pentSeed, 'rgba(126, 200, 227, 0.3)') : '';
  debugLines.push(`Pentagon fill: ${pentDataUrl ? 'SUCCESS' : 'FAILED'}`);

  // Triangles
  const triDataUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    const triVerts = [pentCycle[i], tipAssignment[i], pentCycle[(i + 1) % 5]];
    const triPoints = triVerts.map((v) => vertices[v]);
    const triCenter = centroid(triPoints);
    debugLines.push(`\nTRIANGLE ${i} vertices: [${triVerts.join(', ')}]`);
    debugLines.push(`  centroid: (${triCenter.x.toFixed(1)}, ${triCenter.y.toFixed(1)})`);
    const triBoundary = renderFaceBoundary(triVerts, vertices, exploded);
    const triSeed = findValidSeed(triBoundary, triCenter);
    debugLines.push(`  seed: ${triSeed ? `(${triSeed.x}, ${triSeed.y})` : 'NONE'}`);
    const triDataUrl = triSeed ? doFloodFill(triBoundary, triSeed, 'rgba(176, 136, 249, 0.2)') : '';
    debugLines.push(`  fill: ${triDataUrl ? 'SUCCESS' : 'FAILED'}`);
    triDataUrls.push(triDataUrl);
  }

  return { pentagonDataUrl: pentDataUrl, triangleDataUrls: triDataUrls, debug: debugLines.join('\n') };
}

/**
 * Render only the boundary of a single face onto a canvas.
 * A face is defined by vertex indices. We find and draw the path between
 * each consecutive pair of vertices.
 */
function renderFaceBoundary(faceVertexIndices: number[], vertices: Point[], explodedLines: Line[]): ImageData {
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
    drawEdge(ctx, fromPt, toPt, explodedLines);
  }

  return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

/**
 * Draw the path between two vertices by finding the best matching line segment.
 * Renders directly using canvas lineTo for each pathPoint.
 */
function drawEdge(ctx: CanvasRenderingContext2D, from: Point, to: Point, lines: Line[]): void {
  // Find the line whose path goes between these two points.
  let bestLine: { pts: Point[]; dist: number } | null = null;

  for (const l of lines) {
    const pts = l.pathPoints && l.pathPoints.length >= 2 ? l.pathPoints : [l.a, l.b];

    // Check if this line's endpoints are near from/to
    const dAFrom = Math.hypot(pts[0].x - from.x, pts[0].y - from.y);
    const dBTo = Math.hypot(pts[pts.length - 1].x - to.x, pts[pts.length - 1].y - to.y);
    const dATo = Math.hypot(pts[0].x - to.x, pts[0].y - to.y);
    const dBFrom = Math.hypot(pts[pts.length - 1].x - from.x, pts[pts.length - 1].y - from.y);

    // Forward match
    if (dAFrom < VERTEX_NEAR && dBTo < VERTEX_NEAR) {
      const dist = dAFrom + dBTo;
      if (!bestLine || dist < bestLine.dist) {
        bestLine = { pts, dist };
      }
    }
    // Reverse match
    if (dATo < VERTEX_NEAR && dBFrom < VERTEX_NEAR) {
      const dist = dATo + dBFrom;
      if (!bestLine || dist < bestLine.dist) {
        bestLine = { pts: [...pts].reverse(), dist };
      }
    }
  }

  // Draw the path
  ctx.beginPath();
  if (bestLine && bestLine.pts.length >= 2) {
    ctx.moveTo(bestLine.pts[0].x, bestLine.pts[0].y);
    for (let i = 1; i < bestLine.pts.length; i++) {
      ctx.lineTo(bestLine.pts[i].x, bestLine.pts[i].y);
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
  for (let r = 2; r < 60; r += 2) {
    for (let angle = 0; angle < 360; angle += 15) {
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

  while (head < queue.length && count < 100000) {
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

  return count > 5;
}

function doFloodFill(boundaryData: ImageData, seed: Point, color: string): string {
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

  if (filled.length === 0) return '';

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
