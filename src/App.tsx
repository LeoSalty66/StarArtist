import { useState } from 'react';
import MenuScreen from './screens/MenuScreen';
import RulesScreen from './screens/RulesScreen';
import TestScreen from './screens/TestScreen';
import ChaptersScreen from './screens/ChaptersScreen';
import LevelSelectScreen from './screens/LevelSelectScreen';

export type Screen = 'menu' | 'rules' | 'test' | 'chapters' | 'levelSelect' | 'play';

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [currentChapter, setCurrentChapter] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(1);

  return (
    <div className="app">
      {screen === 'menu' && <MenuScreen onNavigate={setScreen} />}
      {screen === 'rules' && <RulesScreen onBack={() => setScreen('menu')} />}
      {screen === 'test' && <TestScreen onBack={() => setScreen('menu')} />}
      {screen === 'chapters' && (
        <ChaptersScreen
          onBack={() => setScreen('menu')}
          onSelectChapter={(ch) => {
            setCurrentChapter(ch);
            setScreen('levelSelect');
          }}
        />
      )}
      {screen === 'levelSelect' && (
        <LevelSelectScreen
          chapter={currentChapter}
          onBack={() => setScreen('chapters')}
          onSelectLevel={(lvl) => {
            setCurrentLevel(lvl);
            setScreen('play');
          }}
        />
      )}
      {screen === 'play' && (
        <div className="placeholder">
          <h2>Chapter {currentChapter} – Level {currentLevel}</h2>
          <p>Level content coming soon</p>
          <button className="back-btn" onClick={() => setScreen('levelSelect')}>
            ← Back to levels
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
