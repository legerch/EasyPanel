import { describe, expect, it } from 'vitest';
import {
  canPlace,
  checkPlacement,
  emptyRanges,
  findFreeSlot,
  isRowConsistent,
  minimumModules,
  planCompact,
  planInsert,
} from '../src/model/layout';
import type { Device, Row } from '../src/model/types';

const dev = (id: string, position: number, width = 1): Device => ({ id, kind: 'breaker', position, width, props: {} });
const row = (modules: number, devices: Device[]): Row => ({ id: 'r', name: 'R', modules, devices });

describe('placement', () => {
  const r = row(13, [dev('a', 0, 2), dev('b', 2), dev('c', 5)]);

  it('rejects out-of-bounds positions', () => {
    expect(checkPlacement(r, -1, 1)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(checkPlacement(r, 12, 2)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(checkPlacement(r, 0.3, 1)).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('detects overlaps (half-open intervals)', () => {
    expect(checkPlacement(r, 1, 1)).toEqual({ ok: false, reason: 'occupied' });
    expect(canPlace(r, 3, 2)).toBe(true); // touches c at 5 but does not overlap
    expect(canPlace(r, 4, 2)).toBe(false);
  });

  it('ignores the moving device itself', () => {
    expect(canPlace(r, 1, 2, 'a')).toBe(false); // would overlap b
    expect(canPlace(r, 0, 2, 'a')).toBe(true);
    expect(canPlace(r, 2, 1, 'b')).toBe(true);
  });

  it('supports half-module positions and widths', () => {
    const h = row(4, [dev('x', 0, 0.5), dev('y', 0.5, 2.5)]);
    expect(isRowConsistent(h)).toBe(true);
    expect(canPlace(h, 3, 1)).toBe(true);
    expect(canPlace(h, 2.5, 1)).toBe(false);
  });

  it('finds free slots, preferring whole modules and wrapping around', () => {
    expect(findFreeSlot(r, 1)).toBe(3);
    expect(findFreeSlot(r, 2)).toBe(3);
    expect(findFreeSlot(r, 3)).toBe(6);
    expect(findFreeSlot(r, 1, 10)).toBe(10);
    expect(findFreeSlot(r, 2, 12)).toBe(11);
    expect(findFreeSlot(row(3, [dev('a', 0), dev('b', 1), dev('c', 2)]), 1)).toBe(-1);
    // Only a half-module position fits a 1.5-module device here
    const h = row(3, [dev('x', 0, 1.5)]);
    expect(findFreeSlot(h, 1.5)).toBe(1.5);
    expect(findFreeSlot(h, 1)).toBe(2);
  });

  it('lists empty ranges', () => {
    expect(emptyRanges(r)).toEqual([
      [3, 2],
      [6, 7],
    ]);
    expect(emptyRanges(row(2, []))).toEqual([[0, 2]]);
  });

  it('computes the minimum rail length', () => {
    expect(minimumModules(r)).toBe(6);
    expect(minimumModules(row(5, []))).toBe(1);
  });
});

describe('insert & compact', () => {
  it('pushes following devices, absorbing gaps', () => {
    const r = row(8, [dev('a', 0), dev('b', 1), dev('c', 4)]);
    const plan = planInsert(r, 1, 2)!;
    expect(plan.get('b')).toBe(3);
    expect(plan.has('c')).toBe(false); // b now ends at 4: c does not need to move
    expect(plan.has('a')).toBe(false);
  });

  it('pushes a device straddling the insertion point', () => {
    const r = row(6, [dev('a', 0, 2)]);
    expect(planInsert(r, 1, 1)!.get('a')).toBe(2);
  });

  it('refuses when the rail is full', () => {
    const r = row(3, [dev('a', 0), dev('b', 1), dev('c', 2)]);
    expect(planInsert(r, 1, 1)).toBeNull();
  });

  it('compacts preserving order', () => {
    const r = row(10, [dev('c', 7), dev('a', 1, 2), dev('b', 4)]);
    const plan = planCompact(r);
    expect(plan.get('a')).toBe(0);
    expect(plan.get('b')).toBe(2);
    expect(plan.get('c')).toBe(3);
  });
});
