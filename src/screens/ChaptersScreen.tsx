interface Props {
  onBack: () => void;
  onSelectChapter: (chapter: number) => void;
}

const CHAPTERS = [
  { id: 1, title: 'Five Pointed Star Challenge' },
  { id: 2, title: 'FPSC: Alphabetical' },
  { id: 3, title: 'Unchained' },
  { id: 4, title: 'Unchained: Alphabetical' },
  { id: 5, title: 'Ambiguation' },
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
              className="chapter-btn"
              onClick={() => onSelectChapter(ch.id)}
            >
              <span className="chapter-number">{ch.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ChaptersScreen;
