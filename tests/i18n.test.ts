import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { CATEGORIES, DEVICE_KINDS, PRESETS } from '../src/model/catalog';

// Keys built dynamically in the UI (`t(\`kind.${k}\`)`…) cannot be checked by the compiler.
const dynamicKeys = [
  ...DEVICE_KINDS.map((k) => `kind.${k}`),
  ...CATEGORIES.map((c) => `category.${c}`),
  ...PRESETS.map((p) => p.titleKey),
  ...['no-space', 'no-space-anywhere', 'occupied', 'out-of-bounds', 'row-too-small', 'invalid-width', 'invalid-modules', 'not-found', 'last-row'].map((c) => `error.${c}`),
  ...['not-json', 'not-a-project', 'too-recent'].map((c) => `error.format.${c}`),
  ...['saved', 'pending', 'error'].flatMap((s) => [`save.${s}`, `save.${s}.title`]),
  ...['pdf', 'png', 'svg', 'json', 'print'].flatMap((f) => [`export.${f}`, `export.${f}.desc`]),
  'deviceStyle.modern',
  'deviceStyle.classic',
  'hint.emptyRow',
  'hint.noLabel',
  'load.rowSkipped',
  'load.deviceUnknown',
  'load.deviceMoved',
  'load.deviceDropped',
  'load.newerMinor',
  'load.migrated',
  'load.backupKept',
  'load.backupFailed',
];

describe('dictionaries', () => {
  it('define every dynamically built key', () => {
    for (const dict of [en, fr]) {
      const missing = dynamicKeys.filter((k) => !(k in dict));
      expect(missing).toEqual([]);
    }
  });

  it('use the same placeholders in every language', () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(params(fr[key]), key).toBe(params(en[key]));
    }
  });
});
