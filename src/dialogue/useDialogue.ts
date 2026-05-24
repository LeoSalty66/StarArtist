import { useCallback, useEffect, useRef, useState } from 'react';
import { startBabble, stopBabble, preloadVoice } from '../audio/voiceBabble';
import type { DialogueSequence } from './types';

export interface DialogueState {
  /** Index of the current line in the sequence. */
  lineIndex: number;
  /** How many characters of the current line are visible. */
  visibleChars: number;
  /** Whether the current line is fully revealed. */
  isLineComplete: boolean;
  /** Whether the entire sequence has been dismissed. */
  isDone: boolean;
  /** Current portrait URL to display (cycles between frames). */
  currentPortrait: string;
  /** Advance: if typing, reveal full line. If line complete, go to next. */
  advance: () => void;
}

/**
 * Hook that drives a dialogue sequence with typewriter effect + voice babble
 * and cycling portrait animation.
 */
export function useDialogue(
  sequence: DialogueSequence | null,
  onComplete?: () => void,
): DialogueState {
  const [lineIndex, setLineIndex] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [portraitFrame, setPortraitFrame] = useState(0); // 0 or 1
  const typeIntervalRef = useRef<number | null>(null);
  const portraitIntervalRef = useRef<number | null>(null);

  const currentLine = sequence?.[lineIndex];
  const fullLength = currentLine?.text.length ?? 0;
  const isLineComplete = visibleChars >= fullLength;

  // Preload voice on mount.
  useEffect(() => {
    preloadVoice();
  }, []);

  // Preload all portrait images used in this dialogue sequence.
  useEffect(() => {
    if (!sequence) return;
    const urls = new Set<string>();
    for (const line of sequence) {
      line.portraits.idle.forEach((u) => urls.add(u));
      line.portraits.talk.forEach((u) => urls.add(u));
    }
    urls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [sequence]);

  // Reset state when sequence changes.
  useEffect(() => {
    setLineIndex(0);
    setVisibleChars(0);
    setIsTyping(false);
    setIsDone(!sequence || sequence.length === 0);
    setPortraitFrame(0);
  }, [sequence]);

  // Portrait cycling: 0.5s interval, toggles between frame 0 and 1.
  // Runs continuously while dialogue is active.
  useEffect(() => {
    if (!currentLine || isDone) return;

    setPortraitFrame(0);
    portraitIntervalRef.current = window.setInterval(() => {
      setPortraitFrame((prev) => (prev === 0 ? 1 : 0));
    }, 500);

    return () => {
      if (portraitIntervalRef.current !== null) {
        clearInterval(portraitIntervalRef.current);
        portraitIntervalRef.current = null;
      }
    };
  }, [lineIndex, isDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typewriter effect: increment visible chars over time.
  useEffect(() => {
    if (!currentLine || isDone) return;
    if (fullLength === 0) return;

    const charDelay = currentLine.charDelay ?? 0.054; // ~18.5 chars/sec (1.25x faster than 0.067)
    const msPerChar = charDelay * 1000;

    // Mark as typing and start babble.
    setIsTyping(true);
    startBabble();

    typeIntervalRef.current = window.setInterval(() => {
      setVisibleChars((prev) => {
        const next = prev + 1;
        if (next >= fullLength) {
          // Line fully revealed — stop typing.
          if (typeIntervalRef.current !== null) {
            clearInterval(typeIntervalRef.current);
            typeIntervalRef.current = null;
          }
          stopBabble();
          setIsTyping(false);
          return fullLength;
        }
        return next;
      });
    }, msPerChar);

    return () => {
      if (typeIntervalRef.current !== null) {
        clearInterval(typeIntervalRef.current);
        typeIntervalRef.current = null;
      }
      stopBabble();
      setIsTyping(false);
    };
  }, [lineIndex, isDone, fullLength]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine current portrait based on typing vs idle state.
  let currentPortrait = '';
  if (currentLine) {
    if (isTyping) {
      currentPortrait = currentLine.portraits.talk[portraitFrame];
    } else {
      currentPortrait = currentLine.portraits.idle[portraitFrame];
    }
  }

  const advance = useCallback(() => {
    if (!sequence || isDone) return;

    if (!isLineComplete) {
      // Still typing — reveal the full line instantly.
      if (typeIntervalRef.current !== null) {
        clearInterval(typeIntervalRef.current);
        typeIntervalRef.current = null;
      }
      stopBabble();
      setIsTyping(false);
      setVisibleChars(fullLength);
    } else {
      // Line is complete — advance to next line or finish.
      if (lineIndex < sequence.length - 1) {
        setLineIndex((prev) => prev + 1);
        setVisibleChars(0);
        setPortraitFrame(0);
      } else {
        setIsDone(true);
        onComplete?.();
      }
    }
  }, [sequence, isDone, isLineComplete, fullLength, lineIndex, onComplete]);

  return {
    lineIndex,
    visibleChars,
    isLineComplete,
    isDone,
    currentPortrait,
    advance,
  };
}
