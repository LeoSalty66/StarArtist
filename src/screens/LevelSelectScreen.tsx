interface Props {
  chapter: number;
  onBack: () => void;
  onSelectLevel: (level: number) => void;
}

const LEVELS_PER_CHAPTER = 12;
const UNLOCKED_LEVELS = 3; // First 3 levels are unlocked for now

function LevelSelectScreen({ chapter, onBack, onSelectLevel }: Props) {
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
            return (
              <button
                key={levelNum}
                className={`level-btn ${locked ? 'locked' : ''}`}
                onClick={() => !locked && onSelectLevel(levelNum)}
                disabled={locked}
              >
                {locked ? '🔒' : levelNum}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default LevelSelectScreen;
