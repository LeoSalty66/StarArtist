interface Props {
  onBack: () => void;
  onSelectChapter: (chapter: number) => void;
}

const CHAPTERS = [
  { id: 1, title: 'Five Pointed Star Challenge', locked: false },
  { id: 2, title: 'FPSC: Alphabetical', locked: true },
  { id: 3, title: 'Unchained', locked: true },
  { id: 4, title: 'Unchained: Alphabetical', locked: true },
  { id: 5, title: 'Ambiguation', locked: true },
];

function ChaptersScreen({ onBack, onSelectChapter }: Props) {
  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Story Mode</h2>
      </header>
      <div className="screen-body">
        <div className="chapters-grid">
          {CHAPTERS.map((ch) => (
            <button
              key={ch.id}
              className={`chapter-btn ${ch.locked ? 'locked' : ''}`}
              onClick={() => !ch.locked && onSelectChapter(ch.id)}
              disabled={ch.locked}
            >
              <span className="chapter-number">{ch.title}</span>
              {ch.locked && <span className="chapter-lock">🔒</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ChaptersScreen;
