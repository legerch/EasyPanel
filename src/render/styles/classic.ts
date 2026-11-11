/**
 * "Classic" device style: simplified, schematic-like fronts (black handle in a
 * window, "ON" marking), close to typical panel-drawing software output.
 */
import { KIND_SPECS } from '../../model/catalog';
import { bottomText, mainText } from '../../model/deviceText';
import type { DeviceKind, DeviceProps } from '../../model/types';
import { circle, fittedText, INK, lightningBolt, line, rect, STROKE, text } from '../svg';
import { esc, measure, n } from '../text';
import { DEVICE_H, MODULE_MM, type DrawableDevice } from '../geometry';

const DEFAULT_BODY: Partial<Record<DeviceKind, string>> = {
  blank: '#a4a8ad',
  meter: '#f1f1ef',
};

/** Rocker/handle window as on breakers and RCDs, with one handle segment per module. */
function handle(w: number, color = INK): string {
  const out: string[] = [];
  const x = Math.min(2.5, w * 0.15);
  out.push(rect(x, 14, w - 2 * x, 15, `fill="#f7f7f7" stroke="${STROKE}" stroke-width="0.6"`));
  out.push(rect(x + 1, 15.2, w - 2 * x - 2, 7, `fill="${color}"`));
  // Separate handles visually at each module boundary (multi-pole devices).
  for (let m = MODULE_MM; m < w - 1; m += MODULE_MM) out.push(line(m, 15.2, m, 22.2, 'stroke="#f7f7f7" stroke-width="0.8"'));
  out.push(text(w / 2, 25.6, 'ON', Math.min(2.8, w * 0.2), { bold: true }));
  return out.join('');
}

/** Square residual-current test button marked "T". */
function testButton(x: number, y: number): string {
  return rect(x, y, 4.4, 4.4, `fill="#ffffff" stroke="${STROKE}" stroke-width="0.5"`) + text(x + 2.2, y + 2.2, 'T', 3.2, { bold: true });
}

function breakingCapacityBox(w: number, value: string | undefined): string {
  if (!value) return '';
  const size = 2.3;
  const bw = Math.min(w - 2, measure(value, size) + 2);
  return rect((w - bw) / 2, 39.4, bw, 3.8, `fill="none" stroke="${STROKE}" stroke-width="0.35"`) + fittedText(w / 2, 41.3, value, bw - 0.8, size, 1.2);
}

/** Small designation (e.g. "Q3") at the very top of the device. */
function designation(w: number, props: DeviceProps): string {
  return props.name ? fittedText(w / 2, 3.2, props.name, w - 2, 2.6, 1.4, { fill: '#555' }) : '';
}

function bottom(w: number, s: string, y = 34.5): string {
  return fittedText(w / 2, y, s, w - 2, 3.6, 1.6, { bold: true });
}

/** Draws a device front face (local coordinates, mm). */
export function drawClassic(d: DrawableDevice): string {
  const w = d.width * MODULE_MM;
  const h = DEVICE_H;
  const p = d.props;
  const main = mainText(d.kind, p);
  const sub = bottomText(d.kind, p);
  const body = p.color || DEFAULT_BODY[d.kind] || '#fbfbfb';
  const out: string[] = [rect(0.25, 0.25, w - 0.5, h - 0.5, `rx="0.8" fill="${esc(body)}" stroke="${STROKE}" stroke-width="0.5"`)];
  const mainLine = (left = 1.5, right = 1.5, y = 9.2) => fittedText((left + w - right) / 2, y, main, w - left - right, 6, 2.2, { bold: true });

  switch (d.kind) {
    case 'breaker':
    case 'rcd':
    case 'rcbo':
    case 'main-switch': {
      const hasTest = KIND_SPECS[d.kind].hasTestButton;
      const wide = w >= 30;
      out.push(designation(w, p));
      // On wide devices the test button sits left of the rating, as on the real product.
      out.push(hasTest && wide ? testButton(2.5, 7) + mainLine(8, 1.5) : mainLine());
      out.push(handle(w, d.kind === 'main-switch' ? '#c0392b' : INK));
      if (hasTest && !wide) out.push(testButton(w - 5.4, 29.8));
      out.push(bottom(hasTest && !wide ? w - 6 : w, sub, hasTest && !wide ? 37.2 : 34.5));
      out.push(breakingCapacityBox(w, p.breakingCapacity));
      break;
    }
    case 'fuse': {
      out.push(designation(w, p), mainLine());
      const x = Math.min(3, w * 0.15);
      out.push(rect(x, 14, w - 2 * x, 18, `rx="0.8" fill="#55595e" stroke="${STROKE}" stroke-width="0.5"`));
      const cx = w / 2;
      const zz = Math.min(3, (w - 2 * x) / 4);
      out.push(`<polyline points="${n(cx - 2 * zz)},18 ${n(cx - zz)},28 ${n(cx)},21 ${n(cx + zz)},28 ${n(cx + 2 * zz)},18" fill="none" stroke="#d9d9d9" stroke-width="0.8" stroke-linejoin="round"/>`);
      out.push(bottom(w, sub, 37));
      break;
    }
    case 'contactor': {
      out.push(designation(w, p), mainLine());
      const x = Math.min(2.5, w * 0.15);
      out.push(rect(x, 14, w - 2 * x, 10, `fill="#f7f7f7" stroke="${STROKE}" stroke-width="0.5"`));
      const labels = ['I', '0', 'A'];
      const step = (w - 2 * x) / 3;
      labels.forEach((l, i) => out.push(text(x + step * (i + 0.5), 17, l, 2.4, { bold: true })));
      // Selector lever pointing to "A" (automatic), the usual resting position.
      out.push(rect(x + step * 2.5 - 1, 19.2, 2, 4, `fill="${INK}"`));
      out.push(circle(w / 2, 27.6, 1.1, `fill="#2ecc71" stroke="${STROKE}" stroke-width="0.3"`));
      out.push(bottom(w, sub, 34.5));
      break;
    }
    case 'impulse-relay': {
      out.push(designation(w, p), mainLine());
      const bw = Math.min(9, w - 4);
      out.push(rect((w - bw) / 2, 15, bw, bw, `rx="1.5" fill="#e6e6e6" stroke="${STROKE}" stroke-width="0.5"`));
      out.push(circle(w / 2, 15 + bw / 2, bw * 0.28, `fill="#ffffff" stroke="${STROKE}" stroke-width="0.4"`));
      out.push(bottom(w, sub, 34.5));
      break;
    }
    case 'timer': {
      out.push(designation(w, p), mainLine());
      const r = Math.min(7, w / 2 - 2);
      const cy = 22;
      out.push(circle(w / 2, cy, r, `fill="#f2f2f2" stroke="${STROKE}" stroke-width="0.5"`));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        out.push(line(w / 2 + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, w / 2 + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, `stroke="${STROKE}" stroke-width="0.35"`));
      }
      out.push(line(w / 2, cy, w / 2 + Math.cos(-1.1) * r * 0.65, cy + Math.sin(-1.1) * r * 0.65, `stroke="${INK}" stroke-width="0.9" stroke-linecap="round"`));
      out.push(bottom(w, sub, 34.5));
      break;
    }
    case 'spd': {
      out.push(designation(w, p), mainLine());
      const iw = Math.min(10, w - 5);
      out.push(rect((w - iw) / 2, 13.5, iw, 5, `fill="#3cb371" stroke="${STROKE}" stroke-width="0.4"`));
      out.push(lightningBolt(w / 2, 26, Math.min(6, w / 3)));
      out.push(bottom(w, sub, 37));
      break;
    }
    case 'outlet': {
      const r = Math.max(2, Math.min(w / 2 - 3, 15.5));
      const cx = w / 2;
      const cy = h / 2 + (main ? 2.5 : 0);
      out.push(main ? fittedText(w / 2, 4, main, w - 3, 3.2, 1.6, { bold: true }) : '');
      out.push(circle(cx, cy, r, `fill="#ffffff" stroke="${STROKE}" stroke-width="0.8"`));
      // French socket: protruding earth pin on top, two holes below.
      out.push(circle(cx, cy - r * 0.45, r * 0.14, `fill="${INK}"`));
      out.push(circle(cx - r * 0.33, cy + r * 0.28, r * 0.14, `fill="#ffffff" stroke="${STROKE}" stroke-width="0.8"`));
      out.push(circle(cx + r * 0.33, cy + r * 0.28, r * 0.14, `fill="#ffffff" stroke="${STROKE}" stroke-width="0.8"`));
      if (sub) out.push(bottom(w, sub, h - 3));
      break;
    }
    case 'meter': {
      out.push(designation(w, p), mainLine(1.5, 1.5, 7.5));
      const x = Math.min(2.5, w * 0.12);
      out.push(rect(x, 11, w - 2 * x, 9, `rx="0.6" fill="#b8c6a3" stroke="${STROKE}" stroke-width="0.5"`));
      out.push(fittedText(w / 2, 15.5, '000000', w - 2 * x - 2, 4, 1.4, { fill: '#26301c' }));
      out.push(text(w / 2, 24, 'kWh', Math.min(2.4, w * 0.12)));
      out.push(circle(w / 2, 28.5, 1, `fill="#e74c3c" stroke="${STROKE}" stroke-width="0.3"`));
      out.push(bottom(w, sub, 35));
      break;
    }
    case 'indicator': {
      out.push(designation(w, p), mainLine());
      const r = Math.max(1.5, Math.min(5.5, w / 2 - 2.5));
      out.push(circle(w / 2, 22, r + 1, `fill="#d0d0d0" stroke="${STROKE}" stroke-width="0.5"`));
      out.push(circle(w / 2, 22, r, `fill="#ffb347" stroke="#8a5a00" stroke-width="0.3"`));
      out.push(bottom(w, sub, 34.5));
      break;
    }
    case 'blank': {
      if (main) out.push(fittedText(w / 2, h / 2, main, w - 1.5, 3.5, 1.2, { bold: true }));
      if (sub) out.push(bottom(w, sub, 37));
      break;
    }
    case 'generic':
    default: {
      out.push(designation(w, p), mainLine());
      const x = Math.min(2.5, w * 0.15);
      out.push(rect(x, 15, w - 2 * x, 12, `fill="#efefef" stroke="${STROKE}" stroke-width="0.4"`));
      out.push(bottom(w, sub, 34.5));
      break;
    }
  }
  return out.join('');
}
