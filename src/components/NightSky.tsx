import { useEffect, useState } from 'react';
import { loadStars, type SavedStar } from '../storage/starLibrary';

/**
 * Renders saved stars as tiny SVG drawings scattered across the background
 * with line boil wobble effect.
 */
function NightSky() {
  const [stars, setStars] = useState<SavedStar[]>([]);

  useEffect(() => {
    setStars(loadStars());
  }, []);

  if (stars.length === 0) return null;

  // Scale up when fewer stars so they're more visible.
  const sizeBase = stars.length < 11 ? 80 : 55;

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
          <svg
            viewBox="0 0 1 1"
            width={sizeBase}
            height={sizeBase}
            className="sky-star-svg"
          >
            <defs>
              <filter id={`sky-boil-1-${i}`} x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed={i * 3 + 1} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale="0.015" xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <filter id={`sky-boil-2-${i}`} x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed={i * 3 + 2} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale="0.015" xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <filter id={`sky-boil-3-${i}`} x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed={i * 3 + 3} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale="0.015" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            <g className="sky-star-lines" style={{ '--boil-idx': i } as React.CSSProperties}>
              {star.lines.map((l, j) => (
                <line
                  key={j}
                  x1={l.ax}
                  y1={l.ay}
                  x2={l.bx}
                  y2={l.by}
                  stroke="rgba(180, 220, 240, 0.9)"
                  strokeWidth={0.025}
                  strokeLinecap="round"
                />
              ))}
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
}

export default NightSky;
