import './VictoryPopup.css';

interface Props {
  elapsedSeconds: number;
  onNextLevel: (() => void) | null;
  onLevelSelect: () => void;
  onMainMenu: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function VictoryPopup({ elapsedSeconds, onNextLevel, onLevelSelect, onMainMenu }: Props) {
  return (
    <div className="victory-backdrop">
      <div className="victory-popup">
        <h1 className="victory-title">Success</h1>
        <p className="victory-time">Time: {formatTime(elapsedSeconds)}</p>
        <div className="victory-buttons">
          {onNextLevel && (
            <button className="menu-btn primary" onClick={onNextLevel}>
              Next Level
            </button>
          )}
          <button className="menu-btn" onClick={onLevelSelect}>
            Level Select
          </button>
          <button className="menu-btn" onClick={onMainMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export default VictoryPopup;
