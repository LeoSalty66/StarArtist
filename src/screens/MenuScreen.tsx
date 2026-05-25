import type { Screen } from '../App';
import NightSky from '../components/NightSky';

interface Props {
  onNavigate: (screen: Screen) => void;
}

function MenuScreen({ onNavigate }: Props) {
  return (
    <div className="menu-screen">
      <NightSky />
      {/* Animated logo — cycles between two frames */}
      <div className="menu-mural">
        <div className="menu-logo">
          <img src="/art/backgrounds/Logo1.png" alt="StarArtist" className="logo-frame logo-frame-1" />
          <img src="/art/backgrounds/Logo2.png" alt="" className="logo-frame logo-frame-2" />
        </div>
      </div>
      {/* Bottom button bar */}
      <div className="menu-bottom-bar">
        <button className="menu-btn" onClick={() => onNavigate('test')}>
          Test
        </button>
        <div className="menu-bottom-buttons">
          <button className="menu-btn" onClick={() => {}}>
            Sandbox
          </button>
          <button className="menu-btn" onClick={() => onNavigate('rules')}>
            Rules
          </button>
          <button className="menu-btn primary" onClick={() => onNavigate('chapters')}>
            Story Mode
          </button>
          <button className="menu-btn" onClick={() => {}}>
            Options
          </button>
          <button className="menu-btn" onClick={() => {}}>
            History
          </button>
        </div>
      </div>
    </div>
  );
}

export default MenuScreen;
