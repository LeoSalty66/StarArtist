import { useEffect } from 'react';
import { useDialogue } from './useDialogue';
import type { CanvasImage, DialogueSequence } from './types';
import './DialogueBox.css';

interface Props {
  /** The sequence of lines to display. Pass null to hide. */
  sequence: DialogueSequence | null;
  /** Called when the player finishes all lines. */
  onComplete?: () => void;
  /** Called when the current portrait URL changes (for external display). */
  onPortraitChange?: (url: string) => void;
  /** Called when the canvas image changes (for display on the canvas). */
  onCanvasImageChange?: (image: CanvasImage | null) => void;
  /** Called when a dialogue line triggers showing given lines. */
  onShowGivenLines?: () => void;
  /** Called when a dialogue line triggers showing lines remaining. */
  onShowLinesRemaining?: () => void;
}

/**
 * A slim dialogue box that types out text with voice babble.
 * The portrait is displayed externally (e.g., in the toolbar).
 * Click/tap anywhere to advance (finish typing or go to next line).
 */
function DialogueBox({ sequence, onComplete, onPortraitChange, onCanvasImageChange, onShowGivenLines, onShowLinesRemaining }: Props) {
  const { lineIndex, visibleChars, isLineComplete, isDone, currentPortrait, currentCanvasImage, showGivenLines, showLinesRemaining, advance } =
    useDialogue(sequence, onComplete);

  // Always push portrait to parent whenever it changes.
  useEffect(() => {
    if (currentPortrait) {
      onPortraitChange?.(currentPortrait);
    }
  }); // Run every render to ensure parent stays in sync

  // Push canvas image changes to parent.
  useEffect(() => {
    onCanvasImageChange?.(currentCanvasImage);
  }, [currentCanvasImage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger showing given lines when flagged.
  useEffect(() => {
    if (showGivenLines) {
      onShowGivenLines?.();
    }
  }, [showGivenLines, lineIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger showing lines remaining when flagged.
  useEffect(() => {
    if (showLinesRemaining) {
      onShowLinesRemaining?.();
    }
  }, [showLinesRemaining, lineIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear canvas image when dialogue finishes.
  useEffect(() => {
    if (isDone) {
      onCanvasImageChange?.(null);
    }
  }, [isDone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sequence || isDone) return null;

  const currentLine = sequence[lineIndex];
  const displayedText = currentLine.text.slice(0, visibleChars);

  return (
    <div className="dialogue-backdrop" onClick={advance}>
      <div className="dialogue-box">
        <div className="dialogue-content">
          <span className="dialogue-speaker">{currentLine.speaker}</span>
          <p className="dialogue-text">
            {displayedText}
            {!isLineComplete && <span className="dialogue-cursor">|</span>}
          </p>
          {isLineComplete && (
            <span className="dialogue-advance-hint">▼</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default DialogueBox;
