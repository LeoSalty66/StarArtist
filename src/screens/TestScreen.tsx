interface Props {
  onBack: () => void;
}

function TestScreen({ onBack }: Props) {
  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Test</h2>
      </header>
      <div className="screen-body">
        <p className="placeholder-text">
          Development sandbox. The canvas and shape analyzer will live here.
        </p>
      </div>
    </div>
  );
}

export default TestScreen;
