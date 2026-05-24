import { useEffect } from 'react';
import { useDialogue } from './useDialogue';
import type { DialogueSequence } from './types';
import './DialogueBox.css';

interface Props {
  /** The sequence of lines to display. Pass null to hide. */
  sequence: DialogueSequence | null;
  /** Called when the player finishes all lines. */
  onComplete?: () => void;
  /** Called when the current portrait URL changes (for external display). */
  onPortraitChange?: (url: string) => void;
}

/**
 * A slim dialogue box that types out text with voice babble.
 * The portrait is displayed externally (e.g., in the toolbar).
 * Click/tap anywhere to advance (finish typing or go to next line).
 */
function DialogueBox({ sequence, onComplete, onPortraitChange }: Props) {
  const { lineIndex, visibleChars, isLineComplete, isDone, currentPortrait, advance } =
    useDialogue(sequence, onComplete);

  // Always push portrait to parent whenever it changes.
  useEffect(() => {
    if (currentPortrait) {
      onPortraitChange?.(currentPortrait);
    }
  }); // Run every render to ensure parent stays in sync

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
