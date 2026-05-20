import type { Screen } from '../App';

interface Props {
  onNavigate: (screen: Screen) => void;
}

function MenuScreen({ onNavigate }: Props) {
  return (
    <div className="menu-screen">
      <h1 className="title">StarArtist</h1>
      <p className="tagline">Make weird 5-pointed stars.</p>
      <div className="menu-buttons">
        <button className="menu-btn primary" onClick={() => onNavigate('chapters')}>
          Story Mode
        </button>
        <button className="menu-btn" onClick={() => onNavigate('rules')}>
          Rules
        </button>
        <button className="menu-btn" onClick={() => onNavigate('test')}>
          Test
        </button>
      </div>
    </div>
  );
}

export default MenuScreen;
