import { correction, generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';
import { useMemo } from 'react';

/** Four modules of quiet zone: the margin the QR spec asks for. */
const QUIET = 4;

/**
 * A share code drawn as one SVG path: no canvas and no `window`, so it
 * renders identically in Workers SSR and the browser. Medium error
 * correction survives a scuffed screen or a glare spot without growing the
 * code past what a phone reads from arm's length.
 */
export function ShareCodeImage({ url, label }: { url: string; label: string }) {
  const { size, path } = useMemo(() => {
    const code = generate(url, { minCorrectionLevel: correction.M });
    return { size: code.size, path: toSvgPath(code) };
  }, [url]);
  const box = size + QUIET * 2;
  return (
    <svg
      className="share-code"
      role="img"
      aria-label={label}
      viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET} y={-QUIET} width={box} height={box} className="share-code__bg" />
      <path d={path} className="share-code__ink" />
    </svg>
  );
}
