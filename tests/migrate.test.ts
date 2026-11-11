import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../src/model/example';
import { isRowConsistent } from '../src/model/layout';
import { loadProject, parseProjectText, ProjectFormatError } from '../src/model/migrate';

function errorCode(fn: () => unknown): string | null {
  try {
    fn();
  } catch (e) {
    return e instanceof ProjectFormatError ? e.code : 'other';
  }
  return null;
}

describe('project loading', () => {
  it('round-trips a project through JSON', () => {
    const p = createExampleProject();
    const { project, warnings } = parseProjectText(JSON.stringify(p));
    expect(warnings).toEqual([]);
    expect(project).toEqual(p);
  });

  it('rejects non-JSON, foreign JSON and newer versions', () => {
    expect(errorCode(() => parseProjectText('{oops'))).toBe('not-json');
    expect(errorCode(() => loadProject({ hello: 1 }))).toBe('not-a-project');
    expect(errorCode(() => loadProject({ format: 'easypanel', version: '99.0.0', rows: [] }))).toBe('too-recent');
  });

  it('repairs overlapping devices and reports it', () => {
    const raw = {
      format: 'easypanel',
      version: 1,
      rows: [
        {
          id: 'r',
          name: 'R1',
          modules: 3,
          devices: [
            { id: 'a', kind: 'breaker', position: 0, width: 1, props: { rating: 10 } },
            { id: 'b', kind: 'breaker', position: 0, width: 1, props: { label: 'dup' } },
            { id: 'c', kind: 'breaker', position: 1, width: 3, props: {} },
            { id: 'd', kind: 'teleporter', position: 2, width: 1, props: {} },
          ],
        },
      ],
    };
    const { project, warnings } = loadProject(raw);
    expect(isRowConsistent(project.rows[0])).toBe(true);
    expect(warnings.map((w) => w.key)).toEqual(['load.deviceMoved', 'load.deviceDropped', 'load.deviceUnknown']);
    expect(project.rows[0].devices.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('fills defaults and sanitises props', () => {
    const { project } = loadProject({
      format: 'easypanel',
      rows: [{ devices: [{ kind: 'rcd', position: 0, width: 2, props: { diffType: 'Z', sensitivity: '30', label: 5 } }] }],
    });
    expect(project.settings.showLabels).toBe(true);
    expect(project.rows[0].modules).toBe(13);
    expect(project.rows[0].devices[0].props).toEqual({});
  });

  it('regenerates duplicate ids', () => {
    const raw = {
      format: 'easypanel',
      rows: [
        { id: 'x', modules: 2, devices: [{ id: 'x', kind: 'blank', position: 0, width: 1, props: {} }] },
        { id: 'x', modules: 2, devices: [] },
      ],
    };
    const { project } = loadProject(raw);
    const ids = [project.rows[0].id, project.rows[0].devices[0].id, project.rows[1].id];
    expect(new Set(ids).size).toBe(3);
  });
});
