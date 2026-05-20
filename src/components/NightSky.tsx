import { useEffect, useState } from 'react';
import { loadStars, type SavedStar } from '../storage/starLibrary';

/**
 * Renders saved stars as tiny SVG drawings scattered across the background.
 * Each star is positioned, rotated, and scaled based on its saved placement data.
 */
function NightSky() {
  const [stars, setStars] = useState<SavedStar[]>([]);

  useEffect(() => {
    setStars(loadStars());
  }, []);

  if (stars.length === 0) return null;

  return (
    <div className="night-sky">
      {stars.map((star, i) => (
        <div
          key={`${star.levelId}-${i}`}
          className="sky-star"
          style={{
            left: `${star.x * 100}%`,
            top: `${star.y * 100}%`,
            transform: `translate(-50%, -50%) rotate(${star.rotation}deg) scale(${star.scale})`,
          }}
        >
          <svg viewBox="0 0 1 1" width="50" height="50">
            {star.lines.map((l, j) => (
              <line
                key={j}
                x1={l.ax}
                y1={l.ay}
                x2={l.bx}
                y2={l.by}
                stroke="rgba(126, 200, 227, 0.6)"
                strokeWidth={0.02}
                strokeLinecap="round"
              />
            ))}
          </svg>
        </div>
      ))}
    </div>
  );
}

export default NightSky;
