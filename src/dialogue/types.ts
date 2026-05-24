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

export interface DialogueLine {
  /** Speaker name displayed above the text. */
  speaker: string;
  /** The text content to type out. */
  text: string;
  /** Portrait set for this line. */
  portraits: PortraitSet;
  /** Optional: override typing speed (seconds per character). Default 0.1. */
  charDelay?: number;
}

export type DialogueSequence = DialogueLine[];
