interface Props {
  onBack: () => void;
}

function RulesScreen({ onBack }: Props) {
  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Rules</h2>
      </header>
      <div className="screen-body">
        <section className="rules-section">
          <h3>What's a 5-pointed star?</h3>
          <p>
            A drawing made of straight lines that contains exactly{' '}
            <strong>6 enclosed shapes</strong>: one central pentagon, plus
            five triangles, where each triangle shares one side with the
            pentagon.
          </p>
          <p>
            No extra line segments allowed. Every line you draw has to be
            part of one of those 6 shapes.
          </p>
        </section>
        <section className="rules-section">
          <h3>How to play</h3>
          <p>
            Each level gives you a partial drawing and a limited number of
            lines. Add lines to complete a valid 5-pointed star.
          </p>
        </section>
        <section className="rules-section">
          <h3>Tools</h3>
          <ul>
            <li>
              <strong>Pen:</strong> click two points to draw a straight line.
            </li>
            <li>
              <strong>Eraser:</strong> click a line to remove it (only the
              ones you drew).
            </li>
            <li>
              <strong>Undo:</strong> step back one action at a time.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export default RulesScreen;
