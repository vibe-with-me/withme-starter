import { correction, generate, mode } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { radius, useTokens } from '../lib/tokens';

/** Four modules of quiet zone: the margin the QR spec asks for. */
const QUIET = 4;

/**
 * A resolver URL is plain ASCII. Naming the modes keeps lean-qr from
 * probing its Shift-JIS and UTF-8 encoders, and Hermes has no Shift-JIS
 * TextDecoder: the default list fails to render on mobile.
 */
const MODES = [mode.numeric, mode.alphaNumeric, mode.ascii];

/**
 * A share code: the same encoder and the same medium error correction as
 * the web (components/ShareCode.tsx there), so both clients draw identical
 * codes. Dark modules on a light panel in both schemes, because camera
 * apps read a light-on-dark code poorly: ink on surface in light, bg on
 * ink in dark (the web's .share-code rules). No token of its own.
 */
export function ShareCodeImage({ url, label, size = 240 }: { url: string; label: string; size?: number }) {
  const t = useTokens();
  const dark = useColorScheme() === 'dark';
  const panel = dark ? t.ink : t.surface;
  const modulesColor = dark ? t.bg : t.ink;
  const { modules, path } = useMemo(() => {
    const code = generate(url, { minCorrectionLevel: correction.M, modes: MODES });
    return { modules: code.size, path: toSvgPath(code) };
  }, [url]);
  const box = modules + QUIET * 2;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ borderRadius: radius.control, overflow: 'hidden' }}
    >
      <Rect x={-QUIET} y={-QUIET} width={box} height={box} fill={panel} />
      <Path d={path} fill={modulesColor} />
    </Svg>
  );
}
