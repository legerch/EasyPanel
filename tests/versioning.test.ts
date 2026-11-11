import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../src/model/example';
import { loadProject, ProjectFormatError } from '../src/model/migrate';
import { compareSemVer, parseSemVer } from '../src/model/semver';
import { FORMAT_VERSION } from '../src/model/types';
import { APP_VERSION } from '../src/version';
import pkg from '../package.json';

const minimal = (version: unknown) => ({ format: 'easypanel', version, rows: [{ name: 'R1', modules: 13, devices: [] }] });

function errorOf(fn: () => unknown): ProjectFormatError | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProjectFormatError) return e;
    throw e;
  }
  return null;
}

describe('semver', () => {
  it('parses versions, legacy integers and suffixes', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemVer('2.0.0-beta.1+build5')).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(parseSemVer(1)).toEqual({ major: 1, minor: 0, patch: 0 });
    for (const bad of ['1.2', '01.2.3', 'v1.2.3', '', null, 1.5, -1]) expect(parseSemVer(bad)).toBeNull();
  });

  it('compares numerically, not lexically', () => {
    expect(compareSemVer(parseSemVer('1.10.0')!, parseSemVer('1.9.9')!)).toBeGreaterThan(0);
    expect(compareSemVer(parseSemVer('1.0.0')!, parseSemVer('1.0.0')!)).toBe(0);
  });

  it('takes the application version from package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(parseSemVer(APP_VERSION)).not.toBeNull();
    expect(parseSemVer(FORMAT_VERSION)).not.toBeNull();
  });
});

describe('format versioning', () => {
  it('stamps loaded projects with the current format and app version', () => {
    const { project } = loadProject(createExampleProject());
    expect(project.version).toBe(FORMAT_VERSION);
    expect(project.generator).toEqual({ name: 'EasyPanel', version: APP_VERSION });
  });

  it('reads files saved before semantic versioning (version: 1 or missing)', () => {
    for (const v of [1, undefined]) {
      const r = loadProject(minimal(v));
      expect(r.fileVersion).toBe('1.0.0');
      expect(r.migrated).toBe(false);
      expect(r.warnings).toEqual([]);
    }
  });

  it('opens a newer minor version with a warning', () => {
    const r = loadProject(minimal('1.4.2'), { formatVersion: '1.0.0' });
    expect(r.warnings.map((w) => w.key)).toEqual(['load.newerMinor']);
    expect(r.project.version).toBe('1.0.0');
  });

  it('accepts an older minor version silently', () => {
    expect(loadProject(minimal('1.0.0'), { formatVersion: '1.3.0' }).warnings).toEqual([]);
  });

  it('refuses a newer major version and an invalid version', () => {
    const e = errorOf(() => loadProject(minimal('2.0.0'), { formatVersion: '1.5.0' }));
    expect(e?.code).toBe('too-recent');
    expect(e?.message).toBe('2.0.0');
    expect(errorOf(() => loadProject(minimal('one')))?.code).toBe('not-a-project');
  });

  it('chains major migrations and reports them', () => {
    const calls: number[] = [];
    const migrations = {
      1: (p: Record<string, unknown>) => (calls.push(1), { ...p, version: '2.0.0', lines: p.rows, rows: undefined }),
      2: (p: Record<string, unknown>) => (calls.push(2), { ...p, version: '3.0.0', rows: p.lines, notes: 'migrated' }),
    };
    const r = loadProject(minimal('1.2.0'), { formatVersion: '3.1.0', migrations });
    expect(calls).toEqual([1, 2]);
    expect(r.migrated).toBe(true);
    expect(r.fileVersion).toBe('1.2.0');
    expect(r.project.version).toBe('3.1.0');
    expect(r.project.notes).toBe('migrated');
    expect(r.project.rows[0].name).toBe('R1');
    expect(r.warnings[0].key).toBe('load.migrated');
  });

  it('refuses when a migration step is missing', () => {
    expect(errorOf(() => loadProject(minimal('1.0.0'), { formatVersion: '2.0.0', migrations: {} }))?.code).toBe('not-a-project');
  });
});
