import type { DialogueSequence } from '../dialogue/types';

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
  /** Tool to use for drawing in this level. Defaults to 'pen'. */
  drawTool?: 'pen' | 'line';
  /**
   * Aspect ratio (width/height) of the canvas the level was authored on.
   * Used to correct coordinate distortion. Defaults to 1 (square).
   */
  sourceAspect?: number;
  /** Dialogue shown before the player can draw. */
  introDialogue?: DialogueSequence;
  /** Dialogue shown after the player completes the star. */
  completionDialogue?: DialogueSequence;
}

export interface NormalizedLine {
  ax: number; // 0..1
  ay: number; // 0..1
  bx: number; // 0..1
  by: number; // 0..1
}
