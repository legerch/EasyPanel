/**
 * Project factories and editing operations.
 *
 * Operations mutate the project passed to them. They are meant to be called
 * on a draft copy by the store (see store/store.ts), which takes care of
 * undo/redo and change notification. Invalid operations throw an `EditError`
 * and leave the draft untouched (they validate before mutating).
 */
import { MAX_DEVICE_WIDTH, MAX_ROW_MODULES, type Preset } from './catalog';
import { checkPlacement, findFreeSlot, isOnStep, minimumModules, planCompact, planInsert, STEP } from './layout';
import { APP_NAME, APP_VERSION } from '../version';
import { FORMAT_ID, FORMAT_VERSION, type Device, type DeviceKind, type DeviceProps, type Generator, type PanelSettings, type Project, type Row } from './types';

export type EditErrorCode =
  | 'no-space'
  | 'no-space-anywhere'
  | 'occupied'
  | 'out-of-bounds'
  | 'row-too-small'
  | 'invalid-width'
  | 'invalid-modules'
  | 'not-found'
  | 'last-row';

/** Expected, user-facing editing failure. `code` is translated by the UI. */
export class EditError extends Error {
  constructor(public readonly code: EditErrorCode) {
    super(code);
    this.name = 'EditError';
  }
}

/** Random identifier. `crypto.randomUUID` is unavailable on insecure origins (e.g. file://), hence the fallback. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_SETTINGS: PanelSettings = {
  deviceStyle: 'modern',
  background: '#d4d6d9',
  rowSpacing: 30,
  showLabels: true,
  labelOrientation: 'horizontal',
  labelHeight: 22,
  fillEmptyWithBlanks: false,
  showRowNames: false,
  showTitle: true,
};

/** Identity of this application, written into every saved project. */
export function currentGenerator(): Generator {
  return { name: APP_NAME, version: APP_VERSION };
}

export function createRow(modules: number, name: string): Row {
  return { id: uid(), name, modules, devices: [] };
}

export function createProject(name: string, rows = 2, modules = 13, rowName = (i: number) => `R${i + 1}`): Project {
  const now = new Date().toISOString();
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    generator: currentGenerator(),
    id: uid(),
    meta: { name, description: '', author: '', createdAt: now, updatedAt: now },
    settings: { ...DEFAULT_SETTINGS },
    rows: Array.from({ length: rows }, (_, i) => createRow(modules, rowName(i))),
    notes: '',
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export interface DeviceLocation {
  row: Row;
  rowIndex: number;
  device: Device;
}

export function findDevice(project: Project, deviceId: string): DeviceLocation | undefined {
  for (let rowIndex = 0; rowIndex < project.rows.length; rowIndex++) {
    const row = project.rows[rowIndex];
    const device = row.devices.find((d) => d.id === deviceId);
    if (device) return { row, rowIndex, device };
  }
  return undefined;
}

function getDevice(project: Project, deviceId: string): DeviceLocation {
  const loc = findDevice(project, deviceId);
  if (!loc) throw new EditError('not-found');
  return loc;
}

export function getRow(project: Project, rowId: string): Row {
  const row = project.rows.find((r) => r.id === rowId);
  if (!row) throw new EditError('not-found');
  return row;
}

const validModules = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_ROW_MODULES;
const validWidth = (w: number) => isOnStep(w) && w >= STEP && w <= MAX_DEVICE_WIDTH;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function addRow(project: Project, modules: number, name: string, index = project.rows.length): Row {
  if (!validModules(modules)) throw new EditError('invalid-modules');
  const row = createRow(modules, name);
  project.rows.splice(Math.max(0, Math.min(index, project.rows.length)), 0, row);
  return row;
}

export function removeRow(project: Project, rowId: string): void {
  const index = project.rows.findIndex((r) => r.id === rowId);
  if (index < 0) throw new EditError('not-found');
  if (project.rows.length === 1) throw new EditError('last-row');
  project.rows.splice(index, 1);
}

export function renameRow(project: Project, rowId: string, name: string): void {
  getRow(project, rowId).name = name;
}

/** Changes the rail length. Shrinking is refused when it would cut a device. */
export function setRowModules(project: Project, rowId: string, modules: number): void {
  if (!validModules(modules)) throw new EditError('invalid-modules');
  const row = getRow(project, rowId);
  if (modules < minimumModules(row)) throw new EditError('row-too-small');
  row.modules = modules;
}

/** Moves a row up (delta -1) or down (+1). No-op at the boundaries. */
export function moveRow(project: Project, rowId: string, delta: number): void {
  const index = project.rows.findIndex((r) => r.id === rowId);
  if (index < 0) throw new EditError('not-found');
  const target = index + delta;
  if (target < 0 || target >= project.rows.length) return;
  const [row] = project.rows.splice(index, 1);
  project.rows.splice(target, 0, row);
}

/** Packs devices to the left of the rail, preserving their order (explicit user action). */
export function compactRow(project: Project, rowId: string): void {
  const row = getRow(project, rowId);
  for (const [id, pos] of planCompact(row)) row.devices.find((d) => d.id === id)!.position = pos;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export interface NewDevice {
  kind: DeviceKind;
  width: number;
  props: DeviceProps;
}

export const deviceFromPreset = (preset: Preset): NewDevice => ({
  kind: preset.kind,
  width: preset.width,
  props: structuredClone(preset.props),
});

/**
 * Adds a device. When `position` is omitted, the first free slot is used.
 * With `insert`, devices at/after `position` are pushed right to make room.
 */
export function addDevice(project: Project, rowId: string, spec: NewDevice, position?: number, insert = false): Device {
  if (!validWidth(spec.width)) throw new EditError('invalid-width');
  const row = getRow(project, rowId);
  let pos = position ?? findFreeSlot(row, spec.width);
  if (pos < 0) throw new EditError('no-space');
  if (insert && position !== undefined) {
    applyInsert(row, pos, spec.width);
  } else {
    assertPlacement(row, pos, spec.width);
  }
  const device: Device = { id: uid(), kind: spec.kind, position: pos, width: spec.width, props: structuredClone(spec.props) };
  row.devices.push(device);
  return device;
}

function assertPlacement(row: Row, position: number, width: number, ignoreId?: string): void {
  const check = checkPlacement(row, position, width, ignoreId);
  if (!check.ok) throw new EditError(check.reason);
}

/** Pushes devices to free [position, position + width). Throws when the rail lacks space. */
function applyInsert(row: Row, position: number, width: number, ignoreId?: string): void {
  const plan = planInsert(row, position, width, ignoreId);
  if (!plan) throw new EditError('no-space');
  for (const [id, pos] of plan) row.devices.find((d) => d.id === id)!.position = pos;
}

/** Moves a device to `position` on `targetRowId` (possibly another row). */
export function moveDevice(project: Project, deviceId: string, targetRowId: string, position: number, insert = false): void {
  const { row: source, device } = getDevice(project, deviceId);
  const target = getRow(project, targetRowId);
  // Validate before mutating anything, so a failure leaves the project intact.
  if (insert) {
    if (!planInsert(target, position, device.width, device.id)) throw new EditError('no-space');
  } else {
    assertPlacement(target, position, device.width, device.id);
  }
  if (source !== target) {
    source.devices.splice(source.devices.indexOf(device), 1);
    target.devices.push(device);
  }
  if (insert) applyInsert(target, position, device.width, device.id);
  device.position = position;
}

export function removeDevice(project: Project, deviceId: string): void {
  const { row, device } = getDevice(project, deviceId);
  row.devices.splice(row.devices.indexOf(device), 1);
}

/**
 * Duplicates a device next to the original when possible, otherwise in the
 * first row with enough room. Returns the copy.
 */
export function duplicateDevice(project: Project, deviceId: string): Device {
  const { row, rowIndex, device } = getDevice(project, deviceId);
  const spec: NewDevice = { kind: device.kind, width: device.width, props: device.props };
  const near = findFreeSlot(row, device.width, device.position + device.width);
  if (near >= 0) return addDevice(project, row.id, spec, near);
  // Search the following rows first, then the preceding ones.
  const order = [...project.rows.slice(rowIndex + 1), ...project.rows.slice(0, rowIndex)];
  for (const other of order) {
    const pos = findFreeSlot(other, device.width);
    if (pos >= 0) return addDevice(project, other.id, spec, pos);
  }
  throw new EditError('no-space-anywhere');
}

/**
 * Merges `patch` into the device properties. `undefined` or empty-string
 * values remove the property, so the automatic text applies again.
 */
export function updateDeviceProps(project: Project, deviceId: string, patch: Partial<DeviceProps>): void {
  const { device } = getDevice(project, deviceId);
  const props = device.props as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) delete props[key];
    else props[key] = value;
  }
}

/** Resizes a device; it keeps its left position and must not overlap its neighbours. */
export function setDeviceWidth(project: Project, deviceId: string, width: number): void {
  if (!validWidth(width)) throw new EditError('invalid-width');
  const { row, device } = getDevice(project, deviceId);
  assertPlacement(row, device.position, width, device.id);
  device.width = width;
}

/** Changes the kind of an existing device (keeps position, width and properties). */
export function setDeviceKind(project: Project, deviceId: string, kind: DeviceKind): void {
  getDevice(project, deviceId).device.kind = kind;
}
