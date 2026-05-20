import { useEffect, useState } from 'react';
import type { PlanarGraph } from '../analyzer/planarGraph';
import type { Face } from '../analyzer/findFaces';
import type { Point } from './types';

interface Props {
  graph: PlanarGraph;
  pentagon: Face;
  triangles: Face[];
}

/**
 * SVG overlay that animates the star fill-in on success,
 * then applies a line boil wobble effect to the completed star.
 */
function SuccessOverlay({ graph, pentagon, triangles }: Props) {
  const [step, setStep] = useState(0); // 0..6: fill animation steps
  const [boilActive, setBoilActive] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= 6) {
          clearInterval(timer);
          // Start line boil shortly after fill completes
          setTimeout(() => setBoilActive(true), 200);
          return s;
        }
        return s + 1;
      });
    }, 350);
    return () => clearInterval(timer);
  }, []);

  const faceToPolygon = (face: Face): string => {
    return face.vertexIds
      .map((vId) => {
        const p: Point = graph.vertices[vId].point;
        return `${p.x},${p.y}`;
      })
      .join(' ');
  };

  return (
    <g className={`success-overlay ${boilActive ? 'boil-active' : ''}`}>
      {/* SVG filters for line boil: 3 displacement maps with different seeds */}
      <defs>
        <filter id="boil-1" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="3"
            seed="1"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="boil-2" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="3"
            seed="42"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="boil-3" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="3"
            seed="99"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      {/* Pentagon */}
      {step >= 1 && (
        <polygon
          points={faceToPolygon(pentagon)}
          className="fill-pentagon"
        />
      )}
      {/* Triangles, one at a time */}
      {triangles.map((tri, i) =>
        step >= i + 2 ? (
          <polygon
            key={tri.id}
            points={faceToPolygon(tri)}
            className="fill-triangle"
          />
        ) : null,
      )}
    </g>
  );
}

export default SuccessOverlay;
