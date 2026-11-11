/**
 * Informational statistics and hints about a project.
 *
 * This module is deliberately separate from layout rules: it only reports
 * facts about the drawing (occupancy, missing labels…). It does NOT check
 * electrical rules and must never be presented as a compliance check.
 */
import { usedModules } from './layout';
import type { DeviceKind, Project } from './types';

export interface ProjectStats {
  totalModules: number;
  usedModules: number;
  freeModules: number;
  /** Free space as a fraction of the total (0–1). */
  freeRatio: number;
  deviceCount: number;
  countByKind: Partial<Record<DeviceKind, number>>;
}

export interface Hint {
  /** i18n key */
  key: string;
  params?: Record<string, string | number>;
  /** Device or row concerned, to let the UI select it. */
  targetId?: string;
}

/** Kinds that normally do not carry a circuit label (no hint when unlabelled). */
const UNLABELLED_OK: DeviceKind[] = ['blank'];

export function computeStats(project: Project): ProjectStats {
  const totalModules = project.rows.reduce((s, r) => s + r.modules, 0);
  const used = project.rows.reduce((s, r) => s + usedModules(r), 0);
  const countByKind: Partial<Record<DeviceKind, number>> = {};
  let deviceCount = 0;
  for (const r of project.rows)
    for (const d of r.devices) {
      countByKind[d.kind] = (countByKind[d.kind] ?? 0) + 1;
      if (d.kind !== 'blank') deviceCount++;
    }
  return {
    totalModules,
    usedModules: used,
    freeModules: totalModules - used,
    freeRatio: totalModules ? (totalModules - used) / totalModules : 0,
    deviceCount,
    countByKind,
  };
}

export function computeHints(project: Project): Hint[] {
  const hints: Hint[] = [];
  for (const row of project.rows) {
    if (row.devices.length === 0) hints.push({ key: 'hint.emptyRow', params: { row: row.name }, targetId: row.id });
    for (const d of row.devices) {
      if (!UNLABELLED_OK.includes(d.kind) && !d.props.label?.trim()) {
        hints.push({ key: 'hint.noLabel', params: { row: row.name, module: d.position + 1 }, targetId: d.id });
      }
    }
  }
  return hints;
}
