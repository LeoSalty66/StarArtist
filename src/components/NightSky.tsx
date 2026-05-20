import { useEffect, useState } from 'react';
import { loadStars, type SavedStar } from '../storage/starLibrary';

/**
 * Renders saved stars as tiny SVG drawings scattered across the background
 * with per-line wobble effect.
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
          >
            <defs>
              {/* Each line gets its own set of 3 filters for independent wobble */}
              {star.lines.map((_, j) => (
                <g key={j}>
                  <filter id={`sb-${i}-${j}-1`} x="-15%" y="-15%" width="130%" height="130%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed={i * 100 + j * 3 + 1} result="n" />
                    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.012" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                  <filter id={`sb-${i}-${j}-2`} x="-15%" y="-15%" width="130%" height="130%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed={i * 100 + j * 3 + 2} result="n" />
                    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.012" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                  <filter id={`sb-${i}-${j}-3`} x="-15%" y="-15%" width="130%" height="130%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed={i * 100 + j * 3 + 3} result="n" />
                    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.012" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                </g>
              ))}
            </defs>
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
                className="sky-line"
                style={{
                  animationDelay: `${-(j * 0.15)}s`,
                  '--f1': `url(#sb-${i}-${j}-1)`,
                  '--f2': `url(#sb-${i}-${j}-2)`,
                  '--f3': `url(#sb-${i}-${j}-3)`,
                } as React.CSSProperties}
              />
            ))}
          </svg>
        </div>
      ))}
    </div>
  );
}

export default NightSky;
