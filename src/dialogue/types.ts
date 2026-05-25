/**
 * Dialogue system types.
 *
 * A DialogueSequence is an array of lines that play in order.
 * Each line has a speaker and text. The system types out the text
 * character-by-character while cycling talk sprites in sync.
 */

export interface PortraitSet {
  /** Idle frames — cycles between these when NOT typing. */
  idle: [string, string];
  /** Talk frames — cycles between these WHILE typing. */
  talk: [string, string];
}

/**
 * An image (or animated pair) to display on the canvas during this dialogue line.
 */
export interface CanvasImage {
  /** Single static image URL, or two URLs that alternate every 0.5s. */
  frames: [string] | [string, string];
}

export interface DialogueLine {
  /** Speaker name displayed above the text. */
  speaker: string;
  /** The text content to type out. */
  text: string;
  /** Portrait set for this line. */
  portraits: PortraitSet;
  /** Optional: override typing speed (seconds per character). Default 0.054. */
  charDelay?: number;
  /** Optional: image to show on the canvas during this line. */
  canvasImage?: CanvasImage;
  /** If true, signals PlayScreen to reveal the level's given lines on the canvas. */
  showGivenLines?: boolean;
  /** If true, signals PlayScreen to show the "lines remaining" counter. */
  showLinesRemaining?: boolean;
}

export type DialogueSequence = DialogueLine[];
