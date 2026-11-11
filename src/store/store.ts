/**
 * Application state container: current project, selection and undo/redo.
 *
 * All project modifications go through `update()`, which applies a mutation
 * to a deep copy ("draft") of the project. If the mutation throws, the copy
 * is discarded so the project is never left half-modified.
 */
import type { Project } from '../model/types';

export type Selection = { type: 'none' } | { type: 'device'; id: string } | { type: 'row'; id: string };

export type ChangeKind = 'project' | 'selection' | 'replace';
type Listener = (kind: ChangeKind) => void;

const HISTORY_LIMIT = 200;
/** Edits with the same coalesce key within this delay form a single undo step (e.g. typing in a text field). */
const COALESCE_MS = 1200;

export class Store {
  private _project: Project;
  private _selection: Selection = { type: 'none' };
  private past: Project[] = [];
  private future: Project[] = [];
  private listeners = new Set<Listener>();
  private lastCoalesce: { key: string; time: number } | null = null;
  /** Incremented on each project change; persistence uses it to know what has been saved. */
  revision = 0;

  constructor(project: Project) {
    this._project = project;
  }

  get project(): Project {
    return this._project;
  }

  get selection(): Selection {
    return this._selection;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(kind: ChangeKind): void {
    for (const l of this.listeners) l(kind);
  }

  /**
   * Applies `mutate` to a copy of the project and commits it. Errors thrown by
   * `mutate` propagate to the caller and leave the state unchanged.
   * @param coalesceKey consecutive updates with the same key are merged into one undo step.
   */
  update<T>(mutate: (draft: Project) => T, coalesceKey?: string): T {
    const draft = structuredClone(this._project);
    const result = mutate(draft);
    draft.meta.updatedAt = new Date().toISOString();

    const now = Date.now();
    const merge = coalesceKey !== undefined && this.lastCoalesce?.key === coalesceKey && now - this.lastCoalesce.time < COALESCE_MS;
    if (!merge) {
      this.past.push(this._project);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.lastCoalesce = coalesceKey !== undefined ? { key: coalesceKey, time: now } : null;
    this.future = [];
    this._project = draft;
    this.revision++;
    this.validateSelection();
    this.emit('project');
    return result;
  }

  /** Replaces the whole project (new / open / import). Clears the history. */
  replace(project: Project): void {
    this._project = project;
    this.past = [];
    this.future = [];
    this.lastCoalesce = null;
    this._selection = { type: 'none' };
    this.revision++;
    this.emit('replace');
  }

  select(selection: Selection): void {
    const same =
      selection.type === this._selection.type && (selection.type === 'none' || (this._selection as { id: string }).id === selection.id);
    if (same) return;
    this._selection = selection;
    this.lastCoalesce = null;
    this.emit('selection');
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this._project);
    this._project = prev;
    this.afterHistoryMove();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this._project);
    this._project = next;
    this.afterHistoryMove();
  }

  private afterHistoryMove(): void {
    this.lastCoalesce = null;
    this.revision++;
    this.validateSelection();
    this.emit('project');
  }

  /** Drops the selection if the selected item no longer exists. */
  private validateSelection(): void {
    const s = this._selection;
    if (s.type === 'device' && !this._project.rows.some((r) => r.devices.some((d) => d.id === s.id))) this._selection = { type: 'none' };
    if (s.type === 'row' && !this._project.rows.some((r) => r.id === s.id)) this._selection = { type: 'none' };
  }
}
