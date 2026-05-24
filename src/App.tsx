import { useState } from 'react';
import MenuScreen from './screens/MenuScreen';
import RulesScreen from './screens/RulesScreen';
import TestScreen from './screens/TestScreen';
import ChaptersScreen from './screens/ChaptersScreen';
import LevelSelectScreen from './screens/LevelSelectScreen';
import PlayScreen from './screens/PlayScreen';
import chapter1 from './levels/chapter1';

export type Screen = 'menu' | 'rules' | 'test' | 'chapters' | 'levelSelect' | 'play';

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [currentChapter, setCurrentChapter] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(1);

  const getLevelData = () => {
    // For now, only chapter 1 has levels.
    if (currentChapter === 1) {
      return chapter1[currentLevel - 1] ?? null;
    }
    return null;
  };

  const levelData = getLevelData();

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
      {screen === 'play' && levelData && (
        <PlayScreen
          key={levelData.id}
          level={levelData}
          onBack={() => setScreen('levelSelect')}
          onComplete={() => {}}
          onMainMenu={() => setScreen('menu')}
          onLevelSelect={() => setScreen('levelSelect')}
          onNextLevel={
            currentChapter === 1 && currentLevel < chapter1.length
              ? () => {
                  setCurrentLevel(currentLevel + 1);
                }
              : null
          }
        />
      )}
    </div>
  );
}

export default App;
