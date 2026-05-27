import type { Line } from '../canvas/types';

const STORAGE_KEY = 'starartist-stars';

export interface SavedStar {
  levelId: string;
  /** Normalized line coordinates (0-1 range, square). */
  lines: { ax: number; ay: number; bx: number; by: number }[];
  /** Random placement data, generated on save. */
  x: number; // 0-1, position on screen
  y: number; // 0-1
  rotation: number; // degrees
  scale: number; // size multiplier
  completedAt: string;
}

/** Load all saved stars from localStorage. */
export function loadStars(): SavedStar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save a completed star. Normalizes the lines to a 0-1 bounding box,
 * assigns a random position/rotation, and appends to the library.
 */
export function saveStar(levelId: string, lines: Line[]): void {
  if (lines.length === 0) return;

  // Find bounding box.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of lines) {
    minX = Math.min(minX, l.a.x, l.b.x);
    minY = Math.min(minY, l.a.y, l.b.y);
    maxX = Math.max(maxX, l.a.x, l.b.x);
    maxY = Math.max(maxY, l.a.y, l.b.y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const size = Math.max(w, h);

  // Normalize to 0-1 using uniform scale (preserves aspect ratio).
  const normalized = lines.map((l) => ({
    ax: (l.a.x - minX) / size,
    ay: (l.a.y - minY) / size,
    bx: (l.b.x - minX) / size,
    by: (l.b.y - minY) / size,
  }));

  // Place stars in the top third of the screen, on the left or right third
  // (avoiding the center where the logo/character will be).
  const onLeft = Math.random() < 0.5;
  const xPos = onLeft
    ? 0.02 + Math.random() * 0.30   // left third: 2%-32%
    : 0.68 + Math.random() * 0.30;  // right third: 68%-98%
  const yPos = 0.03 + Math.random() * 0.30; // top third: 3%-33%

  const star: SavedStar = {
    levelId,
    lines: normalized,
    x: xPos,
    y: yPos,
    rotation: Math.random() * 360,
    scale: 0.6 + Math.random() * 0.5,
    completedAt: new Date().toISOString(),
  };

  const existing = loadStars();
  // Don't duplicate: replace if same level already saved.
  const filtered = existing.filter((s) => s.levelId !== levelId);
  filtered.push(star);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}


/** Clear all saved stars from localStorage. */
export function clearStars(): void {
  localStorage.removeItem(STORAGE_KEY);
}
