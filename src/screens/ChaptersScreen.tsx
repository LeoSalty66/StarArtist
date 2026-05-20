interface Props {
  onBack: () => void;
  onSelectChapter: (chapter: number) => void;
}

const CHAPTERS = [
  { id: 1, title: 'Chapter 1', subtitle: 'First Light' },
  { id: 2, title: 'Chapter 2', subtitle: 'Crooked Skies' },
  { id: 3, title: 'Chapter 3', subtitle: 'Strange Constellations' },
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
              <span className="chapter-subtitle">{ch.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ChaptersScreen;
