/**
 * SVG primitives shared by the device drawing styles. Only plain presentation
 * attributes are emitted (no CSS, no dominant-baseline) so the output renders
 * identically in browsers, standalone SVG viewers and svg2pdf.
 */
import { esc, fitSingleLine, n } from './text';

export const INK = '#1f1f1f';
export const STROKE = '#2b2b2b';

export interface TextOpts {
  anchor?: 'start' | 'middle' | 'end';
  bold?: boolean;
  fill?: string;
}

/** `y` is the vertical centre of the text (converted to a baseline, as dominant-baseline is poorly supported by PDF converters). */
export function text(x: number, y: number, s: string, size: number, o: TextOpts = {}): string {
  if (!s) return '';
  const weight = o.bold ? ' font-weight="bold"' : '';
  return `<text x="${n(x)}" y="${n(y + size * 0.35)}" font-size="${n(size)}" text-anchor="${o.anchor ?? 'middle'}" fill="${o.fill ?? INK}"${weight}>${esc(s)}</text>`;
}

/** Text auto-shrunk to fit `maxWidth`, centred on `cx`. */
export function fittedText(
  cx: number,
  cy: number,
  s: string,
  maxWidth: number,
  max: number,
  min: number,
  o: TextOpts = {},
): string {
  if (!s) return '';
  return text(cx, cy, s, fitSingleLine(s, maxWidth, max, min, o.bold), o);
}

export const rect = (x: number, y: number, w: number, h: number, attrs: string) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" ${attrs}/>`;

export const circle = (cx: number, cy: number, r: number, attrs: string) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${attrs}/>`;

export const line = (x1: number, y1: number, x2: number, y2: number, attrs: string) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attrs}/>`;

export function lightningBolt(cx: number, cy: number, s: number): string {
  const p = [
    [0.15, -1],
    [-0.45, 0.1],
    [-0.02, 0.1],
    [-0.2, 1],
    [0.45, -0.18],
    [0.03, -0.18],
    [0.3, -1],
  ]
    .map(([x, y], i) => `${i ? 'L' : 'M'}${n(cx + x * s)},${n(cy + y * s)}`)
    .join(' ');
  return `<path d="${p} Z" fill="#f2b705" stroke="${STROKE}" stroke-width="0.4" stroke-linejoin="round"/>`;
}
