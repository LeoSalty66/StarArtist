/**
 * A level definition. Stored as JSON.
 *
 * Coordinates are normalized to [0, 1] so they scale to any canvas size.
 * When loaded, multiply by canvas width/height to get pixel positions.
 */
export interface LevelData {
  /** Unique level identifier, e.g. "1-1" for chapter 1 level 1. */
  id: string;
  /** Display name (optional). */
  name?: string;
  /** Pre-drawn lines the player cannot modify. */
  givenLines: NormalizedLine[];
  /** Maximum number of lines the player can add. */
  lineBudget: number;
}

export interface NormalizedLine {
  ax: number; // 0..1
  ay: number; // 0..1
  bx: number; // 0..1
  by: number; // 0..1
}
