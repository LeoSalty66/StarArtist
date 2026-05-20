import { useState } from 'react';
import MenuScreen from './screens/MenuScreen';
import RulesScreen from './screens/RulesScreen';
import TestScreen from './screens/TestScreen';
import ChaptersScreen from './screens/ChaptersScreen';

export type Screen = 'menu' | 'rules' | 'test' | 'chapters' | 'play';

function App() {
  const [screen, setScreen] = useState<Screen>('menu');

  return (
    <div className="app">
      {screen === 'menu' && <MenuScreen onNavigate={setScreen} />}
      {screen === 'rules' && <RulesScreen onBack={() => setScreen('menu')} />}
      {screen === 'test' && <TestScreen onBack={() => setScreen('menu')} />}
      {screen === 'chapters' && (
        <ChaptersScreen
          onBack={() => setScreen('menu')}
          onSelectChapter={(_chapter) => {
            // TODO: navigate to level select for this chapter
            setScreen('play');
          }}
        />
      )}
      {screen === 'play' && (
        <div className="placeholder">
          <h2>Level coming soon</h2>
          <button className="back-btn" onClick={() => setScreen('chapters')}>
            ← Back to chapters
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
