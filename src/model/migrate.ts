/**
 * Loading of project files: version migrations and defensive validation.
 *
 * Imported JSON is untrusted: every field is checked and normalised. Minor
 * problems are repaired and reported as warnings (never silently); files
 * that cannot be understood are rejected with a `ProjectFormatError`.
 */
import { DEVICE_KINDS, MAX_DEVICE_WIDTH, MAX_ROW_MODULES, SUGGESTIONS } from './catalog';
import { canPlace, findFreeSlot, isOnStep, STEP } from './layout';
import { currentGenerator, DEFAULT_SETTINGS, uid } from './project';
import { compareSemVer, formatSemVer, parseSemVer } from './semver';
import { DEVICE_STYLES, FORMAT_ID, FORMAT_VERSION, type Device, type DeviceKind, type DeviceProps, type PanelSettings, type Project, type Row } from './types';

export type FormatErrorCode = 'not-json' | 'not-a-project' | 'too-recent';

export class ProjectFormatError extends Error {
  constructor(public readonly code: FormatErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'ProjectFormatError';
  }
}

/** A repair performed while loading, reported to the user. `key` is an i18n key. */
export interface LoadWarning {
  key: string;
  params?: Record<string, string | number>;
}

export interface LoadResult {
  project: Project;
  warnings: LoadWarning[];
  /** Format version found in the file (normalised semver, e.g. "1.0.0"). */
  fileVersion: string;
  /** True when major-version migrations were applied: the original data should be backed up before being overwritten. */
  migrated: boolean;
}

type Json = Record<string, unknown>;

/** Converts raw JSON of format major N into raw JSON of format major N+1. */
export type Migration = (project: Json) => Json;

/**
 * Migrations between MAJOR format versions, keyed by the source major.
 * Minor and patch versions never need a migration (by definition they are
 * backward compatible). Example for a future 2.0.0:
 *   1: (p) => ({ ...p, version: '2.0.0', rows: convertRows(p.rows) }),
 */
const MIGRATIONS: Record<number, Migration> = {};

export interface LoadOptions {
  /** Format version of this application (overridable for tests). */
  formatVersion?: string;
  migrations?: Record<number, Migration>;
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

export function parseProjectText(text: string): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ProjectFormatError('not-json', e instanceof Error ? e.message : undefined);
  }
  return loadProject(data);
}

export function loadProject(data: unknown, options: LoadOptions = {}): LoadResult {
  const current = parseSemVer(options.formatVersion ?? FORMAT_VERSION)!;
  const migrations = options.migrations ?? MIGRATIONS;
  if (!isObject(data) || data.format !== FORMAT_ID) throw new ProjectFormatError('not-a-project');

  // Files written before semantic versioning have `version: 1` (read as 1.0.0) or no version at all.
  const fileVersion = data.version === undefined ? { major: 1, minor: 0, patch: 0 } : parseSemVer(data.version);
  if (!fileVersion) throw new ProjectFormatError('not-a-project', `invalid version ${String(data.version)}`);
  const fileVersionText = formatSemVer(fileVersion);
  if (fileVersion.major > current.major) throw new ProjectFormatError('too-recent', fileVersionText);

  const warnings: LoadWarning[] = [];
  if (fileVersion.major === current.major && compareSemVer(fileVersion, current) > 0) {
    // Same major, newer minor/patch: readable, but data added by the newer version is not kept.
    warnings.push({ key: 'load.newerMinor', params: { file: fileVersionText, app: formatSemVer(current) } });
  }

  let raw: Json = data;
  for (let major = fileVersion.major; major < current.major; major++) {
    const migrate = migrations[major];
    if (!migrate) throw new ProjectFormatError('not-a-project', `no migration from format ${major}.x`);
    raw = migrate(raw);
  }
  const migrated = fileVersion.major < current.major;
  if (migrated) warnings.push({ key: 'load.migrated', params: { file: fileVersionText, app: formatSemVer(current) } });

  const result = normalize(raw, formatSemVer(current));
  result.warnings.unshift(...warnings);
  return { ...result, fileVersion: fileVersionText, migrated };
}

function normalizeProps(raw: unknown): DeviceProps {
  const p = isObject(raw) ? raw : {};
  const props: DeviceProps = {
    name: str(p.name) || undefined,
    rating: num(p.rating),
    curve: oneOf(p.curve, SUGGESTIONS.curves),
    poles: oneOf(p.poles, SUGGESTIONS.poles),
    breakingCapacity: str(p.breakingCapacity) || undefined,
    diffType: oneOf(p.diffType, SUGGESTIONS.diffTypes),
    sensitivity: num(p.sensitivity),
    text: str(p.text) || undefined,
    secondary: str(p.secondary) || undefined,
    label: str(p.label) || undefined,
    color: str(p.color) || undefined,
    accentColor: str(p.accentColor) || undefined,
  };
  // Drop undefined keys to keep saved files tidy.
  for (const k of Object.keys(props) as Array<keyof DeviceProps>) if (props[k] === undefined) delete props[k];
  return props;
}

/** Validates data that is already in the current format major. The result is stamped with the current format version and app identity. */
function normalize(raw: Json, formatVersion: string): Pick<LoadResult, 'project' | 'warnings'> {
  if (!Array.isArray(raw.rows)) throw new ProjectFormatError('not-a-project', 'missing rows');
  const warnings: LoadWarning[] = [];
  const meta = isObject(raw.meta) ? raw.meta : {};
  const now = new Date().toISOString();
  const s = isObject(raw.settings) ? raw.settings : {};
  const settings: PanelSettings = {
    // Added in format 1.1.0. Older files were drawn in the classic style: keep their look.
    deviceStyle: oneOf(s.deviceStyle, DEVICE_STYLES) ?? 'classic',
    background: str(s.background, DEFAULT_SETTINGS.background) || DEFAULT_SETTINGS.background,
    rowSpacing: clamp(num(s.rowSpacing) ?? DEFAULT_SETTINGS.rowSpacing, 0, 200),
    showLabels: bool(s.showLabels, DEFAULT_SETTINGS.showLabels),
    labelOrientation: oneOf(s.labelOrientation, ['horizontal', 'vertical'] as const) ?? DEFAULT_SETTINGS.labelOrientation,
    labelHeight: clamp(num(s.labelHeight) ?? DEFAULT_SETTINGS.labelHeight, 8, 120),
    fillEmptyWithBlanks: bool(s.fillEmptyWithBlanks, DEFAULT_SETTINGS.fillEmptyWithBlanks),
    showRowNames: bool(s.showRowNames, DEFAULT_SETTINGS.showRowNames),
    showTitle: bool(s.showTitle, DEFAULT_SETTINGS.showTitle),
  };

  const rows: Row[] = [];
  const seenIds = new Set<string>();
  const freshId = (v: unknown): string => {
    const id = str(v);
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      return id;
    }
    const n = uid();
    seenIds.add(n);
    return n;
  };

  (raw.rows as unknown[]).forEach((rawRow, rowIndex) => {
    if (!isObject(rawRow)) {
      warnings.push({ key: 'load.rowSkipped', params: { row: rowIndex + 1 } });
      return;
    }
    const modules = clamp(Math.round(num(rawRow.modules) ?? 13), 1, MAX_ROW_MODULES);
    const row: Row = { id: freshId(rawRow.id), name: str(rawRow.name, `R${rowIndex + 1}`), modules, devices: [] };
    const rawDevices = Array.isArray(rawRow.devices) ? rawRow.devices : [];
    for (const rd of rawDevices) {
      if (!isObject(rd) || !DEVICE_KINDS.includes(rd.kind as DeviceKind)) {
        warnings.push({ key: 'load.deviceUnknown', params: { row: row.name } });
        continue;
      }
      let width = num(rd.width) ?? 1;
      if (!isOnStep(width) || width < STEP || width > MAX_DEVICE_WIDTH) width = clamp(Math.round(width), 1, MAX_DEVICE_WIDTH);
      const device: Device = {
        id: freshId(rd.id),
        kind: rd.kind as DeviceKind,
        position: num(rd.position) ?? 0,
        width,
        props: normalizeProps(rd.props),
      };
      // Overlapping or out-of-rail devices are moved to a free slot (or another row) and reported.
      if (!canPlace(row, device.position, device.width)) {
        const pos = findFreeSlot(row, device.width, device.position);
        if (pos < 0) {
          warnings.push({ key: 'load.deviceDropped', params: { row: row.name, device: device.props.label ?? device.kind } });
          continue;
        }
        warnings.push({ key: 'load.deviceMoved', params: { row: row.name, device: device.props.label ?? device.kind } });
        device.position = pos;
      }
      row.devices.push(device);
    }
    rows.push(row);
  });
  if (rows.length === 0) rows.push({ id: uid(), name: 'R1', modules: 13, devices: [] });

  const project: Project = {
    format: FORMAT_ID,
    version: formatVersion,
    generator: currentGenerator(),
    id: str(raw.id) || uid(),
    meta: {
      name: str(meta.name, 'EasyPanel'),
      description: str(meta.description),
      author: str(meta.author),
      createdAt: str(meta.createdAt, now),
      updatedAt: str(meta.updatedAt, now),
    },
    settings,
    rows,
    notes: str(raw.notes),
  };
  return { project, warnings };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
