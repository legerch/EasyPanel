/**
 * "Modern" device style: realistic fronts modelled on current residential
 * hardware (grey bodies with large coloured handles, black rating badge,
 * contact-status window, fine print and symbols; white control devices with
 * selector and coil symbol). Deliberately generic: no brand names or logos.
 *
 * Every element is optional data-driven decoration: texts come from the device
 * properties (see model/deviceText.ts), colours from `color` / `accentColor`.
 */
import { KIND_SPECS } from '../../model/catalog';
import { bottomText, formatRating, mainText } from '../../model/deviceText';
import type { DeviceKind, DeviceProps } from '../../model/types';
import { DEVICE_H as H, MODULE_MM, type DrawableDevice } from '../geometry';
import { circle, fittedText, lightningBolt, line, rect, text } from '../svg';
import { esc, measure, n } from '../text';

const EDGE = '#8b9096';
const GREY_BODY = '#e7e8ea';
const WHITE_BODY = '#f8f8f6';
const HOUSING = '#d3d6da';
const BADGE = '#1b1b1b';
const PRINT = '#4b4f55';
const STATUS = '#d8343a';
const BLUE = '#1f6fb6';
const RED = '#c8262c';
const FINE = 1.45;

const DEFAULT_BODY: Partial<Record<DeviceKind, string>> = {
  contactor: WHITE_BODY,
  'impulse-relay': WHITE_BODY,
  timer: WHITE_BODY,
  outlet: WHITE_BODY,
  meter: WHITE_BODY,
  indicator: WHITE_BODY,
  generic: WHITE_BODY,
  blank: '#e2e3e5',
};

const DEFAULT_ACCENT: Partial<Record<DeviceKind, string>> = {
  'main-switch': RED,
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Parses #rgb / #rrggbb; other CSS colours return null (helpers then fall back). */
function rgb(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Darkens (factor < 1) or lightens (factor > 1) a hex colour. */
function shade(color: string, factor: number): string {
  const c = rgb(color);
  if (!c) return color;
  const f = (v: number) =>
    Math.round(Math.min(255, Math.max(0, factor > 1 ? v + (255 - v) * (factor - 1) : v * factor)));
  return `#${c.map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Readable text colour on top of `color`. */
function onColor(color: string): string {
  const c = rgb(color);
  if (!c) return '#ffffff';
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return lum > 0.6 ? '#1b1b1b' : '#ffffff';
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function body(w: number, fill: string): string {
  return (
    rect(0.25, 0.25, w - 0.5, H - 0.5, `rx="1" fill="${esc(fill)}" stroke="${EDGE}" stroke-width="0.45"`) +
    // Slight shading on the right edge gives the front some depth.
    rect(w - 1.1, 0.7, 0.6, H - 1.4, `fill="${esc(shade(fill, 0.92))}"`)
  );
}

/** Top cap with a label slot holding the designation. */
function labelCap(w: number, name: string | undefined): string {
  return (
    rect(0.8, 0.8, w - 1.6, 4.6, `rx="0.6" fill="${HOUSING}"`) +
    rect(1.5, 1.5, w - 3, 3.2, `rx="0.3" fill="#f6f6f4"`) +
    (name ? fittedText(w / 2, 3.1, name, w - 4, 2.3, 1, { fill: '#333' }) : '')
  );
}

/** Toggle handle in its housing, with its marking ("I-ON" on breakers). */
function lever(x: number, y: number, lw: number, lh: number, color: string, modules: number, label = 'I-ON'): string {
  const out: string[] = [];
  out.push(rect(x, y, lw, lh, `rx="1" fill="${HOUSING}" stroke="${EDGE}" stroke-width="0.3"`));
  const hh = lh * 0.6;
  out.push(
    rect(
      x + 0.5,
      y + 0.6,
      lw - 1,
      hh,
      `rx="1" fill="${esc(color)}" stroke="${esc(shade(color, 0.7))}" stroke-width="0.3"`,
    ),
  );
  out.push(rect(x + 1, y + 1, lw - 2, 0.9, `rx="0.4" fill="${esc(shade(color, 1.35))}"`));
  out.push(rect(x + 0.5, y + 0.6 + hh - 1.3, lw - 1, 1.3, `fill="${esc(shade(color, 0.78))}"`));
  // Pivot block under the handle.
  out.push(rect(x + lw * 0.3, y + 0.6 + hh, lw * 0.4, lh - hh - 1.2, `rx="0.5" fill="${shade(HOUSING, 0.85)}"`));
  // Multi-module handles show their junctions.
  for (let m = 1; m < modules; m++) {
    const lx = x + (lw * m) / modules;
    out.push(line(lx, y + 0.6, lx, y + 0.6 + hh, `stroke="${esc(shade(color, 0.6))}" stroke-width="0.35"`));
  }
  const size = Math.min(1.9, (lw / modules) * 0.14);
  for (let m = 0; m < modules; m++) {
    out.push(
      text(x + (lw * (m + 0.5)) / modules, y + 0.6 + hh * 0.55, label, size, { bold: true, fill: onColor(color) }),
    );
  }
  return out.join('');
}

/** Black badge with white rating text ("C32", "63A"). */
function badge(
  x: number,
  y: number,
  s: string,
  maxW: number,
  size = 2.9,
  anchor: 'start' | 'middle' = 'start',
): string {
  if (!s) return '';
  const fs = Math.min(size, ((maxW - 1.4) / Math.max(1, measure(s, 1, true))) * 1);
  const bw = Math.min(maxW, measure(s, fs, true) + 1.4);
  const bx = anchor === 'middle' ? x - bw / 2 : x;
  return (
    rect(bx, y, bw, fs + 1.4, `rx="0.3" fill="${BADGE}"`) +
    text(bx + bw / 2, y + (fs + 1.4) / 2, s, fs, { bold: true, fill: '#ffffff' })
  );
}

/** Mechanical contact-status window. */
const statusWindow = (x: number, y: number, w = 4.4) =>
  rect(x, y, w, 2, `rx="0.3" fill="${STATUS}" stroke="#7a1d20" stroke-width="0.25"`);

const fine = (x: number, y: number, s: string, anchor: 'start' | 'middle' | 'end' = 'start', size = FINE) =>
  s ? text(x, y, s, size, { anchor, fill: PRINT }) : '';

function boxed(x: number, y: number, s: string | undefined): string {
  if (!s) return '';
  const bw = measure(s, FINE) + 1;
  return (
    rect(x, y - 1.1, bw, 2.2, `fill="none" stroke="${PRINT}" stroke-width="0.25"`) + fine(x + bw / 2, y, s, 'middle')
  );
}

const thin = `stroke="${PRINT}" stroke-width="0.25" fill="none" stroke-linecap="round"`;

/** IEC circuit-breaker symbol (one pole). */
function breakerSymbol(cx: number, cy: number, s: number): string {
  return (
    line(cx, cy - s, cx, cy - s * 0.35, thin) +
    line(cx, cy - s * 0.35, cx + s * 0.45, cy + s * 0.25, thin) +
    line(cx, cy + s * 0.3, cx, cy + s, thin) +
    line(cx - s * 0.15, cy - s * 0.5, cx + s * 0.15, cy - s * 0.2, thin) +
    line(cx + s * 0.15, cy - s * 0.5, cx - s * 0.15, cy - s * 0.2, thin)
  );
}

/** Normally-open contact symbol. */
function contactSymbol(cx: number, top: number, bottom: number, labels?: [string, string]): string {
  const mid = (top + bottom) / 2;
  const s = (bottom - top) / 2;
  return (
    line(cx, top, cx, mid - s * 0.35, thin) +
    line(cx, mid - s * 0.35, cx + s * 0.5, mid + s * 0.35, thin) +
    line(cx, mid + s * 0.35, cx, bottom, thin) +
    (labels
      ? fine(cx + 0.9, top + 0.4, labels[0], 'start', 1.1) + fine(cx + 0.9, bottom - 0.3, labels[1], 'start', 1.1)
      : '')
  );
}

/** Coil symbol with A1/A2 terminals; `impulse` adds the bistable (impulse relay) mark. */
function coilSymbol(cx: number, top: number, bottom: number, impulse = false): string {
  const mid = (top + bottom) / 2;
  const cw = 3.4;
  const ch = 2;
  return (
    line(cx, top, cx, mid - ch / 2, thin) +
    rect(cx - cw / 2, mid - ch / 2, cw, ch, thin) +
    (impulse
      ? line(cx - cw / 2, mid + ch / 2, cx + cw / 2, mid - ch / 2, thin) +
        line(cx - cw / 2 + 0.6, mid + ch / 2, cx + cw / 2 + 0.6, mid - ch / 2, thin)
      : line(cx - cw / 2, mid + ch / 2, cx + cw / 2, mid - ch / 2, thin)) +
    line(cx, mid + ch / 2, cx, bottom, thin) +
    fine(cx - cw / 2 - 0.4, top + 0.5, 'A1', 'end', 1.1) +
    fine(cx - cw / 2 - 0.4, bottom - 0.4, 'A2', 'end', 1.1)
  );
}

/** Small residual-current test button. */
function testButton(x: number, y: number, w: number, h: number): string {
  return (
    rect(x, y, w, h, `rx="0.4" fill="#eceeef" stroke="${EDGE}" stroke-width="0.3"`) +
    text(x + w / 2, y + h / 2, 'T', Math.min(2.6, h * 0.6), { fill: '#6d7177', bold: true })
  );
}

/** Residual-current type badge with its waveform pictogram. */
function diffTypeBadge(x: number, y: number, type: string | undefined): string {
  if (!type) return '';
  const s = 3.6;
  const wave = `M${n(x + s + 1.2)},${n(y + s / 2)} q${n(0.9)},${n(-1.8)} ${n(1.8)},0 t${n(1.8)},0`;
  return (
    rect(x, y, s + (type.length - 1) * 1.6, s, `fill="${BADGE}"`) +
    text(x + (s + (type.length - 1) * 1.6) / 2, y + s / 2, type, 2.5, { bold: true, fill: '#ffffff' }) +
    `<path d="${wave}" ${thin}/>`
  );
}

/**
 * "IΔn 30mA" with the Δ drawn as a vector triangle: the standard PDF fonts
 * have no Greek glyphs, so a text Δ would print as garbage in PDF exports.
 */
function deltaLine(x: number, y: number, sensitivity: number): string {
  const wI = measure('I', FINE);
  const d = FINE * 0.62;
  const tx = x + wI + 0.15;
  const tri = `<path d="M${n(tx)},${n(y + d * 0.45)} L${n(tx + d * 0.5)},${n(y - d * 0.55)} L${n(tx + d)},${n(y + d * 0.45)} Z" fill="none" stroke="${PRINT}" stroke-width="0.15" stroke-linejoin="round"/>`;
  return fine(x, y, 'I') + tri + fine(tx + d + 0.15, y, `n ${sensitivity}mA`);
}

const voltage = (p: DeviceProps) => (p.poles && /^(3P|4P)/.test(p.poles) ? '400V~' : '230V~');

// ---------------------------------------------------------------------------
// Device fronts
// ---------------------------------------------------------------------------

/** Breakers, RCBOs and narrow RCDs: cap, handle, rating badge, status, fine print. */
function protectionNarrow(d: DrawableDevice, w: number, accent: string): string {
  const p = d.props;
  const out: string[] = [];
  const modules = Math.max(1, Math.round(d.width));
  out.push(labelCap(w, p.name));
  out.push(lever(1, 6.2, w - 2, 13.6, accent, modules));
  out.push(badge(1.4, 21, mainText(d.kind, p), Math.min(w - 2.8, 11)));
  out.push(statusWindow(1.6, 26.6, Math.min(4.4, w * 0.3)));
  if (KIND_SPECS[d.kind].hasTestButton) out.push(testButton(w - 5.2, 21, 3.8, 3.8));
  out.push(fine(1.6, 30.6, voltage(p)));
  out.push(boxed(1.6, 33.4, p.breakingCapacity));
  if (w >= 14) out.push(breakerSymbol(w - 4, 33, 3));
  out.push(fittedText(w / 2, 40.6, bottomText(d.kind, p), w - 2.4, 2.4, 1.2, { bold: true, fill: '#2a2d31' }));
  return out.join('');
}

/** Wide RCD / RCBO: information panel on the first module, handle on the others. */
function protectionWide(d: DrawableDevice, w: number, accent: string): string {
  const p = d.props;
  const out: string[] = [];
  const pw = MODULE_MM;
  out.push(rect(0.8, 0.8, pw - 1, H - 1.6, `rx="0.6" fill="#dcdee1"`));
  out.push(testButton(2.4, 1.8, pw - 4.8, 4.4));
  out.push(diffTypeBadge(2, 8.6, p.diffType));
  const info: Array<string | { sensitivity: number }> = [
    p.name ?? '',
    p.rating !== undefined ? `In ${formatRating(p.rating)}` : '',
    p.sensitivity !== undefined ? { sensitivity: p.sensitivity } : '',
    p.poles ?? '',
  ].filter(Boolean);
  info.forEach((s, i) =>
    out.push(typeof s === 'string' ? fine(2, 15.2 + i * 2.2, s) : deltaLine(2, 15.2 + i * 2.2, s.sensitivity)),
  );
  // Simplified internal diagram: two poles through a toroid, with the test circuit.
  const gx = 2.2;
  const gw = pw - 4.4;
  out.push(rect(gx, 30.5, gw, 11, `fill="none" stroke="${PRINT}" stroke-width="0.25"`));
  const x1 = gx + gw * 0.35;
  const x2 = gx + gw * 0.65;
  for (const x of [x1, x2]) out.push(contactSymbol(x, 31.5, 36));
  out.push(`<ellipse cx="${n((x1 + x2) / 2)}" cy="38.4" rx="${n(gw * 0.3)}" ry="0.9" ${thin}/>`);
  out.push(line(x1, 39.3, x1, 40.8, thin) + line(x2, 39.3, x2, 40.8, thin));

  const rx = pw + 0.4;
  const rw = w - pw - 1.2;
  const modules = Math.max(1, Math.round(d.width) - 1);
  out.push(labelCap2(rx, rw));
  out.push(lever(rx, 6.2, rw, 16, accent, modules));
  out.push(statusWindow(rx + 1.4, 24.4, Math.min(5, rw * 0.3)));
  out.push(badge(rx + 1.4, 28, mainText(d.kind, p), rw - 2.8));
  out.push(fittedText(rx + rw / 2, 38.8, bottomText(d.kind, p), rw - 2, 2.6, 1.2, { bold: true, fill: '#2a2d31' }));
  if (p.breakingCapacity) out.push(boxed(rx + 1.4, 42.2, p.breakingCapacity));
  return out.join('');
}

/** Cap without designation, for the handle side of wide devices. */
function labelCap2(x: number, w: number): string {
  return rect(x + 0.4, 0.8, w - 0.8, 4.6, `rx="0.6" fill="${HOUSING}"`);
}

function mainSwitch(d: DrawableDevice, w: number, accent: string): string {
  const p = d.props;
  const modules = Math.max(1, Math.round(d.width));
  return [
    labelCap(w, p.name),
    lever(1, 6.2, w - 2, 15, accent, modules, 'I - O'),
    fine(w - 1.6, 7.8, 'I', 'end', 1.6),
    fine(w - 1.6, 20, 'O', 'end', 1.6),
    badge(1.4, 23.4, mainText(d.kind, p), w - 2.8),
    fine(1.6, 31.6, `${voltage(p)}${p.poles ? ` · ${p.poles}` : ''}`),
    fittedText(w / 2, 39.5, bottomText(d.kind, p), w - 2.4, 2.4, 1.2, { bold: true, fill: '#2a2d31' }),
  ].join('');
}

function fuseHolder(d: DrawableDevice, w: number): string {
  const p = d.props;
  const out: string[] = [labelCap(w, p.name)];
  // Hinged fuse carrier with a window on the cartridge.
  out.push(rect(1.4, 6.2, w - 2.8, 25, `rx="1.2" fill="${HOUSING}" stroke="${EDGE}" stroke-width="0.35"`));
  out.push(rect(w / 2 - Math.min(3.5, w / 4), 6.8, Math.min(7, w / 2), 2.6, `rx="0.6" fill="#9ea3a9"`));
  out.push(rect(3, 11.4, w - 6, 15, `rx="0.6" fill="#4b4f55"`));
  const cw = Math.min(4.4, (w - 6) * 0.6);
  out.push(rect(w / 2 - cw / 2, 13, cw, 11.8, `rx="0.8" fill="#e8e1c8"`));
  out.push(rect(w / 2 - cw / 2, 13, cw, 1.8, `fill="#b8bcc1"`) + rect(w / 2 - cw / 2, 23, cw, 1.8, `fill="#b8bcc1"`));
  out.push(badge(w / 2, 33, mainText(d.kind, p), w - 2.8, 2.9, 'middle'));
  out.push(fittedText(w / 2, 41, bottomText(d.kind, p), w - 2.4, 2.4, 1.2, { bold: true, fill: '#2a2d31' }));
  return out.join('');
}

/** White control device header: large rating, voltage and function text. */
function controlHeader(d: DrawableDevice, w: number, fallback = ''): string {
  const p = d.props;
  return [
    fittedText(w / 2, 3.6, mainText(d.kind, p) || fallback, w - 2, 4.2, 1.6, { bold: true }),
    fine(1.4, 7.4, voltage(p)),
    p.name ? fine(w - 1.4, 7.4, p.name, 'end') : '',
    fittedText(w / 2, 9.6, bottomText(d.kind, p), w - 2.4, 1.8, 1, { fill: PRINT }),
  ].join('');
}

function contactor(d: DrawableDevice, w: number, accent: string): string {
  const out: string[] = [controlHeader(d, w)];
  // OFF / AUTO / ON selector (slider in AUTO, its usual position).
  const sx = w - 6.2;
  out.push(rect(sx, 11.6, 4.4, 13.2, `rx="0.8" fill="#e1e2e4" stroke="${EDGE}" stroke-width="0.3"`));
  out.push(
    rect(
      sx + 0.5,
      16.4,
      3.4,
      3.6,
      `rx="0.5" fill="${esc(accent === BLUE ? '#9ca1a7' : accent)}" stroke="${EDGE}" stroke-width="0.25"`,
    ),
  );
  for (const y of [17.4, 18.2, 19])
    out.push(line(sx + 1, y, sx + 3.4, y, `stroke="${shade('#9ca1a7', 0.75)}" stroke-width="0.2"`));
  out.push(fine(sx - 0.6, 13, 'OFF', 'end', 1.3));
  out.push(fine(sx - 0.6, 18.2, 'AUTO', 'end', 1.3));
  out.push(fine(sx - 0.6, 23.4, 'ON', 'end', 1.3));
  out.push(line(1, 27.2, w - 1, 27.2, `stroke="#d4d6d9" stroke-width="0.3"`));
  // Coil and power contacts.
  const contacts = Math.max(1, Math.min(4, Math.round(d.width * 2)));
  const cx = Math.min(5.2, w * 0.28);
  out.push(coilSymbol(cx, 29, 42));
  const span = w - cx - 3.6;
  for (let i = 0; i < contacts; i++) {
    const x = cx + 3 + (span * (i + 0.3)) / contacts;
    out.push(contactSymbol(x, 30, 41, [String(i * 2 + 1), String(i * 2 + 2)]));
  }
  return out.join('');
}

function impulseRelay(d: DrawableDevice, w: number, accent: string): string {
  const out: string[] = [controlHeader(d, w)];
  const bw = Math.min(10, w - 4);
  out.push(rect((w - bw) / 2, 11.6, bw, bw, `rx="1.6" fill="#e1e2e4" stroke="${EDGE}" stroke-width="0.35"`));
  out.push(
    rect(
      (w - bw) / 2 + 1,
      12.6,
      bw - 2,
      bw - 2,
      `rx="1.2" fill="${esc(accent === BLUE ? '#f2f2f0' : accent)}" stroke="${EDGE}" stroke-width="0.25"`,
    ),
  );
  out.push(fine(w / 2, 11.6 + bw / 2, 'I / O', 'middle', 1.5));
  out.push(line(1, 27.2, w - 1, 27.2, `stroke="#d4d6d9" stroke-width="0.3"`));
  const cx = Math.min(5.2, w * 0.3);
  out.push(coilSymbol(cx, 29, 42, true));
  out.push(contactSymbol(Math.min(w - 4, cx + 6.5), 30, 41, ['1', '2']));
  return out.join('');
}

function timer(d: DrawableDevice, w: number, accent: string): string {
  const out: string[] = [controlHeader(d, w)];
  const r = Math.max(2, Math.min(6, w / 2 - 2.5));
  const cy = 19;
  out.push(circle(w / 2, cy, r + 0.9, `fill="#e1e2e4" stroke="${EDGE}" stroke-width="0.3"`));
  out.push(
    circle(w / 2, cy, r, `fill="${esc(accent === BLUE ? '#f2f2f0' : accent)}" stroke="${EDGE}" stroke-width="0.3"`),
  );
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * (0.75 + (i / 6) * 1.5);
    out.push(
      line(
        w / 2 + Math.cos(a) * (r + 0.9),
        cy + Math.sin(a) * (r + 0.9),
        w / 2 + Math.cos(a) * (r + 2),
        cy + Math.sin(a) * (r + 2),
        thin,
      ),
    );
  }
  out.push(
    line(
      w / 2,
      cy,
      w / 2 + Math.cos(-1.2) * r * 0.8,
      cy + Math.sin(-1.2) * r * 0.8,
      `stroke="#2a2d31" stroke-width="0.8" stroke-linecap="round"`,
    ),
  );
  out.push(fine(w / 2, cy + r + 3.4, 'min', 'middle', 1.3));
  out.push(line(1, 30, w - 1, 30, `stroke="#d4d6d9" stroke-width="0.3"`));
  out.push(coilSymbol(Math.min(5.2, w * 0.3), 31.5, 43));
  return out.join('');
}

function spd(d: DrawableDevice, w: number): string {
  const p = d.props;
  const out: string[] = [labelCap(w, p.name)];
  const poles = Math.max(1, Math.round(d.width));
  const ww = (w - 3) / poles;
  for (let i = 0; i < poles; i++) {
    const x = 1.5 + i * ww;
    out.push(rect(x + 0.4, 6.4, ww - 0.8, 7.4, `rx="0.5" fill="${HOUSING}" stroke="${EDGE}" stroke-width="0.25"`));
    out.push(rect(x + 1.4, 8, ww - 2.8, 3.8, `rx="0.3" fill="#3cb371"`));
  }
  out.push(lightningBolt(w / 2, 21, Math.min(5.2, w / 3.4)));
  out.push(badge(w / 2, 28, mainText(d.kind, p), w - 2.8, 2.6, 'middle'));
  out.push(fine(w / 2, 35, p.poles ?? '', 'middle'));
  out.push(fittedText(w / 2, 40.5, bottomText(d.kind, p), w - 2.4, 2.4, 1.2, { bold: true, fill: '#2a2d31' }));
  return out.join('');
}

function outlet(d: DrawableDevice, w: number): string {
  const p = d.props;
  const main = mainText(d.kind, p) || formatRating(p.rating);
  const out: string[] = [];
  const r = Math.max(2, Math.min(w / 2 - 2.6, 15));
  const cx = w / 2;
  const cy = H / 2 + 1.5;
  out.push(fine(1.6, 3, main, 'start', 1.6) + fine(w - 1.6, 3, '230V~', 'end'));
  out.push(circle(cx, cy, r, `fill="#eeeeec" stroke="${EDGE}" stroke-width="0.45"`));
  out.push(circle(cx, cy, r * 0.84, `fill="#fbfbfa" stroke="#c7c9cc" stroke-width="0.35"`));
  // French/Belgian socket: earth pin on top, two shuttered holes.
  out.push(circle(cx, cy - r * 0.42, r * 0.11, `fill="#9a9ea3" stroke="${EDGE}" stroke-width="0.25"`));
  out.push(circle(cx - r * 0.3, cy + r * 0.22, r * 0.12, `fill="#3a3d41"`));
  out.push(circle(cx + r * 0.3, cy + r * 0.22, r * 0.12, `fill="#3a3d41"`));
  const sub = bottomText(d.kind, p);
  if (sub) out.push(fittedText(w / 2, H - 2.2, sub, w - 2.4, 2.2, 1.2, { bold: true, fill: '#2a2d31' }));
  return out.join('');
}

function meter(d: DrawableDevice, w: number): string {
  const p = d.props;
  const out: string[] = [];
  out.push(fittedText(w / 2, 3.4, mainText(d.kind, p) || formatRating(p.rating), w - 2, 3, 1.4, { bold: true }));
  out.push(rect(1.8, 6.4, w - 3.6, 9.4, `rx="0.6" fill="#2f3337"`));
  out.push(rect(2.6, 7.2, w - 5.2, 7.8, `rx="0.3" fill="#c5d4b0"`));
  out.push(fittedText(w / 2 - 1.2, 11.2, '000123.4', w - 9, 3.4, 1.2, { fill: '#22301a' }));
  out.push(fine(w - 3.2, 13.6, 'kWh', 'end', 1.2));
  out.push(circle(3.4, 19.2, 0.9, `fill="${STATUS}"`) + fine(5, 19.2, 'imp/kWh', 'start', 1.2));
  out.push(fine(1.6, 23, voltage(p)));
  if (p.name) out.push(fine(w - 1.6, 23, p.name, 'end'));
  out.push(line(1, 26, w - 1, 26, `stroke="#d4d6d9" stroke-width="0.3"`));
  out.push(fittedText(w / 2, 36, bottomText(d.kind, p), w - 2.4, 2.6, 1.2, { bold: true, fill: '#2a2d31' }));
  return out.join('');
}

function indicator(d: DrawableDevice, w: number, accent: string): string {
  const p = d.props;
  const r = Math.max(1.5, Math.min(4.6, w / 2 - 3));
  const lens = accent === BLUE ? '#57c26e' : accent;
  return [
    controlHeader(d, w),
    circle(w / 2, 18, r + 1.1, `fill="#e1e2e4" stroke="${EDGE}" stroke-width="0.3"`),
    circle(w / 2, 18, r, `fill="${esc(lens)}" stroke="${esc(shade(lens, 0.6))}" stroke-width="0.3"`),
    circle(w / 2 - r * 0.35, 18 - r * 0.35, r * 0.3, `fill="${esc(shade(lens, 1.6))}"`),
    fine(w / 2, 40, p.poles ?? '', 'middle'),
  ].join('');
}

function blank(d: DrawableDevice, w: number): string {
  const out: string[] = [];
  // Grip ridges.
  for (const y of [H / 2 - 1.6, H / 2, H / 2 + 1.6])
    out.push(line(w * 0.3, y, w * 0.7, y, `stroke="#c5c8cc" stroke-width="0.45" stroke-linecap="round"`));
  const main = mainText(d.kind, d.props);
  if (main) out.push(fittedText(w / 2, 8, main, w - 1.6, 3, 1, { bold: true }));
  return out.join('');
}

function generic(d: DrawableDevice, w: number): string {
  const p = d.props;
  return [
    labelCap(w, p.name),
    fittedText(w / 2, 10, mainText(d.kind, p), w - 2.4, 4, 1.4, { bold: true }),
    rect(2, 14.5, w - 4, 11, `rx="0.6" fill="#ecedee" stroke="${EDGE}" stroke-width="0.3"`),
    fine(1.6, 30, voltage(p)),
    fittedText(w / 2, 38, bottomText(d.kind, p), w - 2.4, 2.6, 1.2, { bold: true, fill: '#2a2d31' }),
  ].join('');
}

export function drawModern(d: DrawableDevice): string {
  const w = d.width * MODULE_MM;
  const p = d.props;
  const accent = p.accentColor || DEFAULT_ACCENT[d.kind] || BLUE;
  const fill = p.color || DEFAULT_BODY[d.kind] || GREY_BODY;
  let front: string;
  switch (d.kind) {
    case 'rcd':
    case 'rcbo':
      front = w >= 30 ? protectionWide(d, w, accent) : protectionNarrow(d, w, accent);
      break;
    case 'breaker':
      front = protectionNarrow(d, w, accent);
      break;
    case 'main-switch':
      front = mainSwitch(d, w, accent);
      break;
    case 'fuse':
      front = fuseHolder(d, w);
      break;
    case 'contactor':
      front = contactor(d, w, accent);
      break;
    case 'impulse-relay':
      front = impulseRelay(d, w, accent);
      break;
    case 'timer':
      front = timer(d, w, accent);
      break;
    case 'spd':
      front = spd(d, w);
      break;
    case 'outlet':
      front = outlet(d, w);
      break;
    case 'meter':
      front = meter(d, w);
      break;
    case 'indicator':
      front = indicator(d, w, accent);
      break;
    case 'blank':
      front = blank(d, w);
      break;
    default:
      front = generic(d, w);
  }
  return body(w, fill) + front;
}
