import { useEffect, useMemo } from 'react';
import { preloadVoice } from '../audio/voiceBabble';
import { loadStars } from '../storage/starLibrary';
import chapter1 from '../levels/chapter1';

interface Props {
  chapter: number;
  onBack: () => void;
  onSelectLevel: (level: number) => void;
}

function LevelSelectScreen({ chapter, onBack, onSelectLevel }: Props) {
  // Preload voice clips so they're ready when dialogue starts.
  useEffect(() => {
    preloadVoice();
  }, []);

  // Determine which levels exist and which are completed.
  const levels = chapter === 1 ? chapter1 : [];
  const completedIds = useMemo(() => {
    const stars = loadStars();
    return new Set(stars.map((s) => s.levelId));
  }, []);

  // Find the first uncompleted level index (0-based).
  const firstUncompletedIdx = levels.findIndex((l) => !completedIds.has(l.id));
  // If all completed, everything is unlocked.
  const unlockedUpTo = firstUncompletedIdx === -1 ? levels.length - 1 : firstUncompletedIdx;

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
          {Array.from({ length: 16 }, (_, i) => {
            const levelNum = i + 1;
            const level = levels[i];
            const isCompleted = level ? completedIds.has(level.id) : false;
            const isUnlocked = level ? i <= unlockedUpTo : false;
            const label = i === 0 ? 'Tutorial' : `${i}`;
            return (
              <button
                key={i}
                className={`level-btn${!isUnlocked ? ' locked' : ''}${isCompleted ? ' completed' : ''}${i === 0 ? ' tutorial-btn' : ''}`}
                onClick={() => isUnlocked && onSelectLevel(levelNum)}
                disabled={!isUnlocked}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default LevelSelectScreen;
