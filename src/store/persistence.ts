/**
 * Local persistence (browser localStorage) and JSON file helpers.
 *
 * Storage layout:
 *   easypanel:index          → StoredProjectInfo[] (list shown in the "Open" dialog)
 *   easypanel:project:<id>   → serialised Project
 *   easypanel:current        → id of the project open at last visit
 *   easypanel:prefs          → UI preferences (language…)
 *
 * Every write may fail (quota exceeded, private mode, disabled storage); the
 * caller receives a `StorageError` and must tell the user.
 */
import { loadProject, type LoadResult } from '../model/migrate';
import type { Project } from '../model/types';

const PREFIX = 'easypanel:';
const INDEX_KEY = `${PREFIX}index`;
const CURRENT_KEY = `${PREFIX}current`;
const PREFS_KEY = `${PREFIX}prefs`;
const projectKey = (id: string) => `${PREFIX}project:${id}`;

export interface StoredProjectInfo {
  id: string;
  name: string;
  updatedAt: string;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // Access can throw when storage is disabled.
  }
}

function write(key: string, value: string): void {
  const s = storage();
  if (!s) throw new StorageError('localStorage unavailable');
  try {
    s.setItem(key, value);
  } catch (e) {
    throw new StorageError(e instanceof Error ? e.message : String(e));
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function listStoredProjects(): StoredProjectInfo[] {
  try {
    const data = JSON.parse(read(INDEX_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

/** Saves the project in the local library and marks it as current. */
export function saveToLibrary(project: Project): void {
  write(projectKey(project.id), JSON.stringify(project));
  const index = listStoredProjects().filter((p) => p.id !== project.id);
  index.unshift({ id: project.id, name: project.meta.name, updatedAt: project.meta.updatedAt });
  write(INDEX_KEY, JSON.stringify(index));
  write(CURRENT_KEY, project.id);
}

export function loadFromLibrary(id: string): LoadResult | null {
  const text = read(projectKey(id));
  if (!text) return null;
  const result = loadProject(JSON.parse(text));
  if (result.migrated) {
    // The next autosave will overwrite the stored data in the new format:
    // keep the original, untouched, so an upgrade can never destroy a project.
    const key = backupKey(id, result.fileVersion);
    try {
      if (read(key) === null) write(key, text);
      result.warnings.push({ key: 'load.backupKept', params: { version: result.fileVersion } });
    } catch {
      result.warnings.push({ key: 'load.backupFailed', params: { version: result.fileVersion } });
    }
  }
  return result;
}

const backupKey = (id: string, version: string) => `${PREFIX}backup:${id}:${version}`;

/** Original data of a project saved before a format migration, if any (newest format first). */
function listBackups(id: string): Array<{ version: string; text: string }> {
  const s = storage();
  if (!s) return [];
  const prefix = `${PREFIX}backup:${id}:`;
  const out: Array<{ version: string; text: string }> = [];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (key?.startsWith(prefix)) out.push({ version: key.slice(prefix.length), text: s.getItem(key) ?? '' });
  }
  return out.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

export function deleteFromLibrary(id: string): void {
  const s = storage();
  if (!s) return;
  for (const b of listBackups(id)) s.removeItem(backupKey(id, b.version));
  s.removeItem(projectKey(id));
  write(INDEX_KEY, JSON.stringify(listStoredProjects().filter((p) => p.id !== id)));
}

export function currentProjectId(): string | null {
  return read(CURRENT_KEY);
}

export interface Prefs {
  lang?: string;
  zoom?: number;
}

export function loadPrefs(): Prefs {
  try {
    return JSON.parse(read(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    write(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...prefs }));
  } catch {
    // Preferences are a convenience: failing to store them is not worth bothering the user.
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/** File-system-safe name derived from the project name. */
export function fileBaseName(project: Project): string {
  const base = project.meta.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return base || 'easypanel';
}

