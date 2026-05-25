import { useEffect } from 'react';
import { preloadVoice } from '../audio/voiceBabble';

interface Props {
  chapter: number;
  onBack: () => void;
  onSelectLevel: (level: number) => void;
}

const LEVELS_PER_CHAPTER = 12;
const UNLOCKED_LEVELS = 3; // First 3 levels are unlocked for now

function LevelSelectScreen({ chapter, onBack, onSelectLevel }: Props) {
  // Preload voice clips so they're ready when dialogue starts.
  useEffect(() => {
    preloadVoice();
  }, []);
  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Chapter {chapter}</h2>
      </header>
      <div className="screen-body">
        <div className="level-grid">
          {Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => {
            const levelNum = i + 1;
            const locked = levelNum > UNLOCKED_LEVELS;
            const label = i === 0 ? 'Tutorial' : `${i}`;
            return (
              <button
                key={levelNum}
                className={`level-btn ${locked ? 'locked' : ''}${i === 0 ? ' tutorial-btn' : ''}`}
                onClick={() => !locked && onSelectLevel(levelNum)}
                disabled={locked}
              >
                {locked ? '–' : label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default LevelSelectScreen;
