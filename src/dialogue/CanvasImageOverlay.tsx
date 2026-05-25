import { useEffect, useState } from 'react';
import type { CanvasImage } from './types';

interface Props {
  image: CanvasImage;
}

/**
 * Renders an image (or animated pair) centered on the canvas.
 * For two-frame animations, alternates every 0.5s.
 */
function CanvasImageOverlay({ image }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (image.frames.length < 2) return;
    setFrame(0);
    const interval = setInterval(() => {
      setFrame((f) => (f === 0 ? 1 : 0));
    }, 500);
    return () => clearInterval(interval);
  }, [image]);

  const src = image.frames[frame] ?? image.frames[0];

  return (
    <div className="canvas-image-overlay">
      <img src={src} alt="" />
    </div>
  );
}

export default CanvasImageOverlay;
