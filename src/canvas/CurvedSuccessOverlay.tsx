import { useEffect, useState } from 'react';
import type { Line, Point } from './types';
import { extractShapeBoundaries } from '../analyzer/shapeBoundaries';

interface Props {
  pentCycle: number[];
  tipAssignment: number[];
  vertices: Point[];
  lines: Line[];
}

/**
 * Success overlay that fills in the actual curved shapes
 * using the drawn paths as boundaries.
 */
function CurvedSuccessOverlay({ pentCycle, tipAssignment, vertices, lines }: Props) {
  const [step, setStep] = useState(0);
  const [boilActive, setBoilActive] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= 6) {
          clearInterval(timer);
          setTimeout(() => setBoilActive(true), 200);
          return s;
        }
        return s + 1;
      });
    }, 350);
    return () => clearInterval(timer);
  }, []);

  const boundaries = extractShapeBoundaries(pentCycle, tipAssignment, vertices, lines);
  if (!boundaries) return null;

  return (
    <g className={`success-overlay ${boilActive ? 'boil-active' : ''}`}>
      {/* Boil filters */}
      <defs>
        <filter id="boil-1" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="1" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="boil-2" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="42" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="boil-3" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="99" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* Pentagon fill */}
      {step >= 1 && (
        <path
          d={boundaries.pentagon.path}
          className="fill-pentagon"
        />
      )}

      {/* Triangle fills, one at a time */}
      {boundaries.triangles.map((tri, i) =>
        step >= i + 2 ? (
          <path
            key={i}
            d={tri.path}
            className="fill-triangle"
          />
        ) : null,
      )}
    </g>
  );
}

export default CurvedSuccessOverlay;
