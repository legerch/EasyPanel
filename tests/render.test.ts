import { describe, expect, it } from 'vitest';
import { DEVICE_KINDS, PRESETS } from '../src/model/catalog';
import { createExampleProject } from '../src/model/example';
import { DEVICE_STYLES, type DeviceProps } from '../src/model/types';
import { drawDevice } from '../src/render/devices';
import { renderPanel } from '../src/render/panel';

const FULL_PROPS: DeviceProps = {
  name: 'Q1',
  rating: 16,
  curve: 'C',
  poles: '1P+N',
  breakingCapacity: '4500',
  diffType: 'A',
  sensitivity: 30,
  secondary: 'note',
  label: 'label',
  color: '#ffffff',
  accentColor: '#c9dd3c',
};

describe('device drawings', () => {
  for (const style of DEVICE_STYLES) {
    it(`draws every kind and width in the ${style} style`, () => {
      for (const kind of DEVICE_KINDS) {
        for (const width of [0.5, 1, 2, 2.5, 4]) {
          for (const props of [{}, FULL_PROPS]) {
            const svg = drawDevice({ kind, width, props }, style);
            expect(svg.length, `${kind} ${width}`).toBeGreaterThan(50);
            expect(svg, `${kind} ${width}`).not.toMatch(/NaN|undefined|Infinity/);
          }
        }
      }
    });
  }

  it('draws all library presets', () => {
    for (const style of DEVICE_STYLES)
      for (const p of PRESETS) expect(drawDevice(p, style)).not.toMatch(/NaN|undefined/);
  });

  it('escapes user text', () => {
    const svg = drawDevice({ kind: 'generic', width: 2, props: { text: '<b>&' } }, 'modern');
    expect(svg).toContain('&lt;b&gt;&amp;');
  });

  it('keeps exported SVG free of characters missing from standard PDF fonts', () => {
    // The PDF export uses Helvetica (WinAnsi encoding): Latin-1 plus a few typographic
    // characters. Everything EasyPanel prints by itself must stay within that set.
    const { svg } = renderPanel(createExampleProject(), { mode: 'export' });
    const texts = [...svg.matchAll(/>([^<]+)</g)].map((m) => m[1]).join('');
    const unsupported = (texts.match(/[\u{100}-\u{10ffff}]/gu) ?? []).filter((c) => !'…—’'.includes(c));
    expect(unsupported).toEqual([]);
  });
});
