/**
 * Device catalog: the single place that describes which device kinds exist,
 * which properties they expose, and which ready-made presets appear in the
 * library palette.
 *
 * To add a new device:
 *   1. add its kind to `DeviceKind` in types.ts,
 *   2. describe it in `KIND_SPECS` below,
 *   3. (optionally) add presets to `PRESETS`,
 *   4. add a drawing in `render/devices.ts` (falls back to the generic drawing otherwise),
 *   5. add its translations in `i18n/*.ts`.
 */
import type { DeviceKind, DeviceProps } from './types';

/** Properties that can be edited in the properties panel. */
export type PropField = keyof DeviceProps;

export interface KindSpec {
  kind: DeviceKind;
  /** Properties shown in the properties panel, in display order. `label`, `text`, `secondary`, `color` are always available. */
  fields: PropField[];
  /** Whether the device has a residual current test button. */
  hasTestButton?: boolean;
}

export const KIND_SPECS: Record<DeviceKind, KindSpec> = {
  rcd: { kind: 'rcd', fields: ['name', 'rating', 'poles', 'diffType', 'sensitivity'], hasTestButton: true },
  breaker: { kind: 'breaker', fields: ['name', 'rating', 'curve', 'poles', 'breakingCapacity'] },
  rcbo: {
    kind: 'rcbo',
    fields: ['name', 'rating', 'curve', 'poles', 'breakingCapacity', 'diffType', 'sensitivity'],
    hasTestButton: true,
  },
  'main-switch': { kind: 'main-switch', fields: ['name', 'rating', 'poles'] },
  fuse: { kind: 'fuse', fields: ['name', 'rating', 'poles'] },
  contactor: { kind: 'contactor', fields: ['name', 'rating', 'poles'] },
  'impulse-relay': { kind: 'impulse-relay', fields: ['name', 'rating', 'poles'] },
  timer: { kind: 'timer', fields: ['name'] },
  spd: { kind: 'spd', fields: ['name', 'poles'] },
  outlet: { kind: 'outlet', fields: ['name', 'rating'] },
  meter: { kind: 'meter', fields: ['name', 'rating'] },
  indicator: { kind: 'indicator', fields: ['name'] },
  blank: { kind: 'blank', fields: [] },
  generic: { kind: 'generic', fields: ['name', 'rating'] },
};

/** Fields every kind gets in addition to its specific ones. */
export const COMMON_FIELDS: PropField[] = ['label', 'text', 'secondary', 'color'];

export type CategoryId = 'protection' | 'breakers' | 'control' | 'other';
export const CATEGORIES: CategoryId[] = ['protection', 'breakers', 'control', 'other'];

export interface Preset {
  id: string;
  category: CategoryId;
  kind: DeviceKind;
  width: number;
  props: DeviceProps;
  /** i18n key for the palette title; parameters are taken from props. */
  titleKey: string;
}

const breaker = (rating: number): Preset => ({
  id: `breaker-c${rating}`,
  category: 'breakers',
  kind: 'breaker',
  width: 1,
  props: { rating, curve: 'C', poles: '1P+N' },
  titleKey: 'preset.breaker',
});

const rcd = (rating: number, diffType: 'AC' | 'A' | 'F' | 'B'): Preset => ({
  id: `rcd-${rating}-${diffType.toLowerCase()}`,
  category: 'protection',
  kind: 'rcd',
  width: 2,
  props: { rating, diffType, sensitivity: 30, poles: '2P' },
  titleKey: 'preset.rcd',
});

/**
 * Presets shown in the library. They only provide sensible starting values:
 * every property (rating, curve, width…) remains editable after placement.
 */
export const PRESETS: Preset[] = [
  rcd(40, 'AC'),
  rcd(63, 'AC'),
  rcd(40, 'A'),
  rcd(63, 'A'),
  rcd(40, 'F'),
  rcd(63, 'B'),
  {
    id: 'rcbo-16',
    category: 'protection',
    kind: 'rcbo',
    width: 2,
    props: { rating: 16, curve: 'C', poles: '1P+N', diffType: 'A', sensitivity: 30 },
    titleKey: 'preset.rcbo',
  },
  {
    id: 'main-switch-63',
    category: 'protection',
    kind: 'main-switch',
    width: 2,
    props: { rating: 63, poles: '2P' },
    titleKey: 'preset.mainSwitch',
  },
  {
    id: 'spd',
    category: 'protection',
    kind: 'spd',
    width: 2,
    props: { poles: '1P+N' },
    titleKey: 'preset.spd',
  },
  {
    id: 'fuse-20',
    category: 'protection',
    kind: 'fuse',
    width: 1,
    props: { rating: 20, poles: '1P+N' },
    titleKey: 'preset.fuse',
  },
  breaker(2),
  breaker(6),
  breaker(10),
  breaker(16),
  breaker(20),
  breaker(25),
  breaker(32),
  breaker(40),
  {
    id: 'breaker-2p-20',
    category: 'breakers',
    kind: 'breaker',
    width: 2,
    props: { rating: 20, curve: 'C', poles: '2P' },
    titleKey: 'preset.breaker2p',
  },
  {
    id: 'contactor-hc',
    category: 'control',
    kind: 'contactor',
    width: 1,
    props: { rating: 20, poles: '2P', text: 'HC', secondary: 'J/N' },
    titleKey: 'preset.contactorDayNight',
  },
  {
    id: 'contactor-25',
    category: 'control',
    kind: 'contactor',
    width: 2,
    props: { rating: 25, poles: '2P' },
    titleKey: 'preset.contactor',
  },
  {
    id: 'impulse-relay',
    category: 'control',
    kind: 'impulse-relay',
    width: 1,
    props: { rating: 16, poles: '1P', text: 'TL' },
    titleKey: 'preset.impulseRelay',
  },
  { id: 'timer', category: 'control', kind: 'timer', width: 1, props: {}, titleKey: 'preset.timer' },
  { id: 'indicator', category: 'control', kind: 'indicator', width: 1, props: {}, titleKey: 'preset.indicator' },
  { id: 'outlet', category: 'other', kind: 'outlet', width: 3, props: { rating: 16 }, titleKey: 'preset.outlet' },
  { id: 'meter', category: 'other', kind: 'meter', width: 2, props: {}, titleKey: 'preset.meter' },
  { id: 'blank-1', category: 'other', kind: 'blank', width: 1, props: {}, titleKey: 'preset.blank' },
  { id: 'generic-1', category: 'other', kind: 'generic', width: 1, props: { text: 'AUX' }, titleKey: 'preset.generic' },
  { id: 'generic-2', category: 'other', kind: 'generic', width: 2, props: { text: 'AUX' }, titleKey: 'preset.generic' },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export const DEVICE_KINDS = Object.keys(KIND_SPECS) as DeviceKind[];

/** Suggested values for the properties panel (free input is always allowed). */
export const SUGGESTIONS = {
  rating: [2, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100],
  sensitivity: [10, 30, 100, 300, 500],
  breakingCapacity: ['3kA', '4.5kA', '6kA', '10kA', '15kA'],
  curves: ['B', 'C', 'D'] as const,
  diffTypes: ['AC', 'A', 'F', 'B'] as const,
  poles: ['1P', '1P+N', '2P', '3P', '3P+N', '4P'] as const,
  rowModules: [13, 18, 24, 26, 36],
};

/** Maximum width of a single device, and maximum rail length. Generous but bounded to keep rendering sane. */
export const MAX_DEVICE_WIDTH = 24;
export const MAX_ROW_MODULES = 72;
