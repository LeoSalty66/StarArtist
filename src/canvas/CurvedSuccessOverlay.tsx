import { useEffect, useMemo, useState } from 'react';
import type { Line, Point } from './types';
import { generateFillOverlays } from '../analyzer/floodFill';

interface Props {
  pentCycle: number[];
  tipAssignment: number[];
  vertices: Point[];
  lines: Line[];
}

/**
 * Success overlay using flood-fill: renders actual enclosed regions
 * by filling from seed points on a hidden canvas.
 */
function CurvedSuccessOverlay({ pentCycle, tipAssignment, vertices, lines }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= 6) {
          clearInterval(timer);
          return s;
        }
        return s + 1;
      });
    }, 350);
    return () => clearInterval(timer);
  }, []);

  // Generate fill overlays once on mount.
  const overlays = useMemo(() => {
    return generateFillOverlays(pentCycle, tipAssignment, vertices, lines);
  }, [pentCycle, tipAssignment, vertices, lines]);

  if (!overlays) return null;

  return (
    <g className="success-overlay">
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
      {step >= 1 && overlays.pentagonDataUrl && (
        <image
          href={overlays.pentagonDataUrl}
          x="0"
          y="0"
          width="600"
          height="600"
          className="fill-pentagon"
        />
      )}

      {/* Triangle fills, one at a time */}
      {overlays.triangleDataUrls.map((dataUrl, i) =>
        step >= i + 2 && dataUrl ? (
          <image
            key={i}
            href={dataUrl}
            x="0"
            y="0"
            width="600"
            height="600"
            className="fill-triangle"
          />
        ) : null,
      )}
    </g>
  );
}

export default CurvedSuccessOverlay;
