import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../src/model/example';
import { isRowConsistent } from '../src/model/layout';
import {
  addDevice,
  addRow,
  compactRow,
  createProject,
  duplicateDevice,
  EditError,
  findDevice,
  moveDevice,
  removeRow,
  setDeviceWidth,
  setRowModules,
  updateDeviceProps,
} from '../src/model/project';

const breaker = { kind: 'breaker' as const, width: 1, props: { rating: 16 } };

function expectCode(fn: () => unknown, code: string) {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(EditError);
  expect((error as EditError).code).toBe(code);
}

describe('project operations', () => {
  it('adds devices in the first free slot and reports a full rail', () => {
    const p = createProject('t', 1, 3);
    const r = p.rows[0];
    addDevice(p, r.id, { ...breaker, width: 2 });
    const d = addDevice(p, r.id, breaker);
    expect(d.position).toBe(2);
    expectCode(() => addDevice(p, r.id, breaker), 'no-space');
  });

  it('moves devices between rows and refuses invalid targets without side effects', () => {
    const p = createProject('t', 2, 4);
    const [r1, r2] = p.rows;
    const a = addDevice(p, r1.id, breaker);
    addDevice(p, r2.id, { ...breaker, width: 4 });
    expectCode(() => moveDevice(p, a.id, r2.id, 0), 'occupied');
    expect(findDevice(p, a.id)!.row.id).toBe(r1.id);
    addRow(p, 4, 'R3');
    moveDevice(p, a.id, p.rows[2].id, 3);
    expect(findDevice(p, a.id)!.row.name).toBe('R3');
    expect(r1.devices).toHaveLength(0);
  });

  it('inserts with shift when requested', () => {
    const p = createProject('t', 1, 4);
    const r = p.rows[0];
    const a = addDevice(p, r.id, breaker, 0);
    const b = addDevice(p, r.id, breaker, 1);
    const c = addDevice(p, r.id, breaker, 3);
    moveDevice(p, c.id, r.id, 0, true);
    expect([c.position, a.position, b.position]).toEqual([0, 1, 2]);
    expect(isRowConsistent(r)).toBe(true);
  });

  it('refuses an insert on a full rail without modifying it', () => {
    const p = createProject('t', 2, 2);
    const [r1, r2] = p.rows;
    addDevice(p, r1.id, breaker, 0);
    addDevice(p, r1.id, breaker, 1);
    const x = addDevice(p, r2.id, breaker, 0);
    const before = JSON.stringify(p);
    expectCode(() => moveDevice(p, x.id, r1.id, 0, true), 'no-space');
    expect(JSON.stringify(p)).toBe(before);
  });

  it('duplicates next to the original, or in another row', () => {
    const p = createProject('t', 2, 2);
    const a = addDevice(p, p.rows[0].id, breaker);
    const copy = duplicateDevice(p, a.id);
    expect(copy.position).toBe(1);
    expect(copy.props).toEqual(a.props);
    expect(copy.props).not.toBe(a.props);
    const copy2 = duplicateDevice(p, a.id);
    expect(findDevice(p, copy2.id)!.row.id).toBe(p.rows[1].id);
  });

  it('refuses shrinking a row below its content and resizing into a neighbour', () => {
    const p = createProject('t', 1, 6);
    const r = p.rows[0];
    const a = addDevice(p, r.id, breaker, 0);
    addDevice(p, r.id, breaker, 4);
    expectCode(() => setRowModules(p, r.id, 4), 'row-too-small');
    setRowModules(p, r.id, 5);
    expectCode(() => setDeviceWidth(p, a.id, 5), 'occupied');
    setDeviceWidth(p, a.id, 4);
    expectCode(() => setDeviceWidth(p, a.id, 0.3), 'invalid-width');
  });

  it('removes empty props so automatic text applies again', () => {
    const p = createProject('t', 1, 6);
    const a = addDevice(p, p.rows[0].id, { ...breaker, props: { rating: 16, text: 'X' } });
    updateDeviceProps(p, a.id, { text: '', rating: Number.NaN, label: 'Prises' });
    expect(a.props).toEqual({ label: 'Prises' });
  });

  it('keeps at least one row and compacts rows', () => {
    const p = createProject('t', 1, 6);
    expectCode(() => removeRow(p, p.rows[0].id), 'last-row');
    const r = p.rows[0];
    addDevice(p, r.id, breaker, 2);
    addDevice(p, r.id, breaker, 5);
    compactRow(p, r.id);
    expect(r.devices.map((d) => d.position).toSorted((a, b) => a - b)).toEqual([0, 1]);
  });

  it('builds a consistent example project', () => {
    const p = createExampleProject();
    expect(p.rows.every(isRowConsistent)).toBe(true);
    expect(p.rows[0].devices).toHaveLength(12);
    expect(p.rows[1].devices.reduce((s, d) => s + d.width, 0)).toBe(13);
  });
});
