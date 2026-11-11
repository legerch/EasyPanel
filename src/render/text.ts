/**
 * Text measurement and fitting for SVG rendering.
 *
 * Measurements use a canvas 2D context (same metrics as the browser's SVG
 * text). Outside a browser (unit tests) an average-width approximation is used.
 * Exports use Helvetica/Arial, so the measured widths stay valid in SVG, PNG and PDF.
 */

export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();
const REF_SIZE = 100;

/** Width of `text` at font size 1 (multiply by the font size to get the width in user units). */
function unitWidth(text: string, bold: boolean): number {
  const key = (bold ? 'b|' : 'n|') + text;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  if (ctx === undefined) {
    ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  let w: number;
  if (ctx) {
    ctx.font = `${bold ? 'bold ' : ''}${REF_SIZE}px Arial, Helvetica, sans-serif`;
    w = ctx.measureText(text).width / REF_SIZE;
  } else {
    w = text.length * (bold ? 0.6 : 0.55);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, w);
  return w;
}

export function measure(text: string, size: number, bold = false): number {
  return unitWidth(text, bold) * size;
}

/** Largest font size ≤ `max` (and ≥ `min`) at which a single line fits in `width`. */
export function fitSingleLine(text: string, width: number, max: number, min: number, bold = false): number {
  const w = unitWidth(text, bold);
  if (w === 0) return max;
  return Math.max(min, Math.min(max, width / w));
}

interface WrapResult {
  lines: string[];
  /** True when a word was wider than the line (cut when allowed, overflowing otherwise). */
  overflow: boolean;
}

/**
 * Greedy word wrap. Lines may break at spaces and after hyphens
 * ("Lave-" / "vaisselle"). Words still wider than the line are cut into
 * chunks when `breakWords` is true. Explicit newlines are honoured.
 */
function wrapLines(text: string, width: number, size: number, bold: boolean, breakWords: boolean): WrapResult {
  const lines: string[] = [];
  let overflow = false;
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      // Segments of one word are joined without a space.
      word.split(/(?<=-)(?=.)/).forEach((segment, i) => {
        const candidate = line ? line + (i === 0 ? ' ' : '') + segment : segment;
        if (measure(candidate, size, bold) <= width) {
          line = candidate;
          return;
        }
        if (line) lines.push(line);
        line = segment;
        if (measure(segment, size, bold) <= width) return;
        overflow = true;
        if (!breakWords) return;
        while (measure(line, size, bold) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measure(line.slice(0, cut), size, bold) > width) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      });
    }
    lines.push(line);
  }
  // Remove trailing empty lines caused by trailing newlines.
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return { lines, overflow };
}

export function wrap(text: string, width: number, size: number, bold = false): string[] {
  return wrapLines(text, width, size, bold, true).lines;
}

export interface FittedBlock {
  size: number;
  lines: string[];
  lineHeight: number;
}

const LINE_HEIGHT = 1.15;

/**
 * Finds the largest font size (between `min` and `max`) at which `text`,
 * wrapped to `width`, fits in `height`. Sizes that keep every word whole are
 * preferred; words are only cut when no size allows otherwise. At `min` size
 * the text may still overflow: extra lines are then truncated with an ellipsis.
 */
export function fitBlock(text: string, width: number, height: number, max: number, min: number, bold = false): FittedBlock {
  const sizes: number[] = [];
  for (let size = max; size >= min - 1e-9; size = Math.round((size - 0.1) * 100) / 100) sizes.push(size);
  for (const breakWords of [false, true]) {
    for (const size of sizes) {
      const { lines, overflow } = wrapLines(text, width, size, bold, breakWords);
      if ((breakWords || !overflow) && lines.length * size * LINE_HEIGHT <= height) return { size, lines, lineHeight: size * LINE_HEIGHT };
    }
  }
  const lines = wrap(text, width, min, bold);
  const maxLines = Math.max(1, Math.floor(height / (min * LINE_HEIGHT)));
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/, '…');
  }
  return { size: min, lines, lineHeight: min * LINE_HEIGHT };
}

/** Escapes text for inclusion in SVG/XML markup. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Formats a number for SVG attributes (avoids long floating point tails). */
export const n = (v: number): string => String(Math.round(v * 100) / 100);
