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
 * SVG overlay that animates the star fill-in on success.
 * Pentagon fills first, then the five triangles sequentially.
 */
function SuccessOverlay({ graph, pentagon, triangles }: Props) {
  const [step, setStep] = useState(0); // 0..5: which shapes are filled

  useEffect(() => {
    // Animate: fill one shape every 350ms
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

  const faceToPolygon = (face: Face): string => {
    return face.vertexIds
      .map((vId) => {
        const p: Point = graph.vertices[vId].point;
        return `${p.x},${p.y}`;
      })
      .join(' ');
  };

  return (
    <g className="success-overlay">
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
