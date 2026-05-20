import { useState } from 'react';
import MenuScreen from './screens/MenuScreen';
import RulesScreen from './screens/RulesScreen';
import TestScreen from './screens/TestScreen';

export type Screen = 'menu' | 'rules' | 'test' | 'play';

function App() {
  const [screen, setScreen] = useState<Screen>('menu');

  return (
    <div className="app">
      {screen === 'menu' && <MenuScreen onNavigate={setScreen} />}
      {screen === 'rules' && <RulesScreen onBack={() => setScreen('menu')} />}
      {screen === 'test' && <TestScreen onBack={() => setScreen('menu')} />}
      {screen === 'play' && (
        <div className="placeholder">
          <h2>Play mode coming soon</h2>
          <button onClick={() => setScreen('menu')}>Back</button>
        </div>
      )}
    </div>
  );
}

export default App;
