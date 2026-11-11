/**
 * Placement rules on a DIN rail: bounds, collisions, free slots and the
 * explicit "insert & shift" / "compact" operations.
 *
 * All functions are pure. Positions and widths are expressed in modules and
 * may use half-module steps (e.g. a 2.5-module outlet followed by a ½-module
 * blank, as found on real panels); rows always have a whole number of modules.
 */
import type { Device, Row } from './types';

/** Smallest positioning increment, in modules. */
export const STEP = 0.5;

/** True when `x` is a multiple of STEP (exact in floating point since STEP is a power of two). */
export const isOnStep = (x: number): boolean => Number.isFinite(x) && Number.isInteger(x / STEP);

/** Rounds to the nearest STEP multiple. */
export const roundToStep = (x: number): number => Math.round(x / STEP) * STEP;

/** Half-open interval [position, position + width) of a device. */
const end = (d: Pick<Device, 'position' | 'width'>) => d.position + d.width;

/** Devices of the row sorted by position, optionally ignoring one device (the one being moved). */
export function sortedDevices(row: Row, ignoreId?: string): Device[] {
  return row.devices.filter((d) => d.id !== ignoreId).sort((a, b) => a.position - b.position);
}

export function isInBounds(row: Row, position: number, width: number): boolean {
  return isOnStep(position) && isOnStep(width) && width >= STEP && position >= 0 && position + width <= row.modules;
}

/** Devices overlapping the interval [position, position + width). */
export function collisions(row: Row, position: number, width: number, ignoreId?: string): Device[] {
  return row.devices.filter((d) => d.id !== ignoreId && d.position < position + width && end(d) > position);
}

export type PlacementCheck = { ok: true } | { ok: false; reason: 'out-of-bounds' | 'occupied' };

export function checkPlacement(row: Row, position: number, width: number, ignoreId?: string): PlacementCheck {
  if (!isInBounds(row, position, width)) return { ok: false, reason: 'out-of-bounds' };
  if (collisions(row, position, width, ignoreId).length > 0) return { ok: false, reason: 'occupied' };
  return { ok: true };
}

export function canPlace(row: Row, position: number, width: number, ignoreId?: string): boolean {
  return checkPlacement(row, position, width, ignoreId).ok;
}

/**
 * First free position able to hold `width` modules, searching from `from`
 * to the end of the rail, then wrapping around from the start. Whole-module
 * positions are preferred; half-module positions are only used when no
 * whole-module position fits. Returns -1 when no gap is large enough.
 */
export function findFreeSlot(row: Row, width: number, from = 0, ignoreId?: string): number {
  const max = row.modules - width;
  const start = Math.max(0, Math.min(roundToStep(from), max));
  const scan = (step: number): number => {
    for (let p = start; p <= max; p += step) if (canPlace(row, p, width, ignoreId)) return p;
    for (let p = 0; p < start; p += step) if (canPlace(row, p, width, ignoreId)) return p;
    return -1;
  };
  const whole = Number.isInteger(start) ? scan(1) : -1;
  return whole !== -1 ? whole : scan(STEP);
}

export function usedModules(row: Row): number {
  return row.devices.reduce((sum, d) => sum + d.width, 0);
}

/** Lowest module count the row can be resized to without cutting a device. */
export function minimumModules(row: Row): number {
  return row.devices.reduce((max, d) => Math.max(max, end(d)), 1);
}

/** Index ranges of empty modules, as [start, length] pairs. */
export function emptyRanges(row: Row): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  for (const d of sortedDevices(row)) {
    if (d.position > cursor) ranges.push([cursor, d.position - cursor]);
    cursor = Math.max(cursor, end(d));
  }
  if (cursor < row.modules) ranges.push([cursor, row.modules - cursor]);
  return ranges;
}

/**
 * Computes the new positions required to insert a block of `width` modules at
 * `position`, pushing the devices located at or after the insertion point to
 * the right (consuming free space first, as on a real rail).
 *
 * Returns a map deviceId → new position (only for devices that move), or null
 * when the rail does not have enough room. Devices before the insertion point
 * are never moved. A device straddling the insertion point is pushed as well.
 */
export function planInsert(row: Row, position: number, width: number, ignoreId?: string): Map<string, number> | null {
  if (!isInBounds(row, position, width)) return null;
  const moves = new Map<string, number>();
  let cursor = position + width;
  // Every device ending after the insertion point is pushed (in order), each one
  // only as far as needed: existing gaps absorb the shift.
  for (const d of sortedDevices(row, ignoreId).filter((d) => end(d) > position)) {
    const newPos = Math.max(d.position, cursor);
    if (newPos + d.width > row.modules) return null;
    if (newPos !== d.position) moves.set(d.id, newPos);
    cursor = newPos + d.width;
  }
  return moves;
}

/** New positions that pack all devices to the left, preserving their order. */
export function planCompact(row: Row): Map<string, number> {
  const moves = new Map<string, number>();
  let cursor = 0;
  for (const d of sortedDevices(row)) {
    if (d.position !== cursor) moves.set(d.id, cursor);
    cursor += d.width;
  }
  return moves;
}

/** True when no two devices overlap and all are within bounds. Used by validation and tests. */
export function isRowConsistent(row: Row): boolean {
  let cursor = 0;
  for (const d of sortedDevices(row)) {
    if (!isInBounds(row, d.position, d.width) || d.position < cursor) return false;
    cursor = end(d);
  }
  return true;
}
