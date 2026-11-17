/**
 * Application shell: builds the UI chrome and wires the store, the
 * workspace, the library, the properties panel, persistence and exports.
 * All user commands are defined here and go through `run()` / `edit()` so
 * that model errors are consistently reported to the user.
 */
import { exportJson, exportPdf, exportPng, exportSvg, printPanel } from './export/exporters';
import { formatDate, getLang, LANGS, setLang, t, type Lang } from './i18n';
import { SUGGESTIONS, type Preset } from './model/catalog';
import { createExampleProject } from './model/example';
import { parseProjectText, ProjectFormatError, type LoadResult } from './model/migrate';
import {
  addDevice,
  addRow,
  createProject,
  deviceFromPreset,
  duplicateDevice,
  EditError,
  findDevice,
  moveDevice,
  removeDevice,
  removeRow,
} from './model/project';
import { findFreeSlot } from './model/layout';
import { FORMAT_VERSION, type DeviceStyle, type Project } from './model/types';
import { Workspace, type DropFailure } from './editor/workspace';
import {
  currentProjectId,
  deleteFromLibrary,
  listStoredProjects,
  loadFromLibrary,
  loadPrefs,
  savePrefs,
  saveToLibrary,
  StorageError,
} from './store/persistence';
import { Store, type Selection } from './store/store';
import { confirmDialog, exportDialog, helpDialog, modal, openProjectDialog, type ExportOptions } from './ui/dialogs';
import { h } from './ui/dom';
import { isEditingText } from './ui/dom';
import { icon, type IconName } from './ui/icons';
import { Inspector } from './ui/inspector';
import { renderLibrary } from './ui/library';
import { toast } from './ui/toast';

const AUTOSAVE_DELAY = 400;

type SaveState = 'saved' | 'pending' | 'error';

export class App {
  private readonly root: HTMLElement;
  private readonly store: Store;
  private workspace!: Workspace;
  private inspector!: Inspector;
  private libraryEl!: HTMLElement;
  private libraryStyle: DeviceStyle = 'modern';
  private statusEl!: HTMLElement;
  private saveEl!: HTMLElement;
  private zoomEl!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private titleEl!: HTMLElement;
  private saveTimer = 0;
  private savedRevision = -1;
  private saveState: SaveState = 'saved';
  private exportOptions: ExportOptions = { format: 'pdf', dpi: 300, pdfScale: 'fit' };

  constructor(root: HTMLElement) {
    this.root = root;
    const prefs = loadPrefs();
    if (prefs.lang === 'en' || prefs.lang === 'fr') setLang(prefs.lang);
    this.store = new Store(this.initialProject());
    this.savedRevision = this.store.revision;
    this.buildChrome();
    this.store.subscribe((kind) => this.onStoreChange(kind));
    this.installGlobalHandlers();
    this.refreshAll();
    requestAnimationFrame(() => this.workspace.fit());
  }

  // ---------------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------------

  private initialProject(): Project {
    const id = currentProjectId();
    if (id) {
      try {
        const result = loadFromLibrary(id);
        if (result) {
          this.reportLoadWarnings(result);
          return result.project;
        }
      } catch (e) {
        // The stored data is left untouched so it can still be recovered; a new project gets a new id.
        console.error('Could not load the last project', e);
        setTimeout(() => toast(t('error.restoreFailed'), 'error', 0), 0);
      }
    }
    // First launch: show an example so the user immediately sees what EasyPanel does.
    const example = listStoredProjects().length === 0 ? createExampleProject() : this.blankProject();
    return example;
  }

  private blankProject(name = t('project.new'), rows = 2, modules = 13): Project {
    return createProject(name, rows, modules, (i) => t('row.defaultName', { n: i + 1 }));
  }

  private reportLoadWarnings(result: LoadResult): void {
    if (!result.warnings.length) return;
    const lines = result.warnings.map((w) => t(w.key, w.params));
    setTimeout(() => toast(`${t('load.repaired')}\n${lines.join('\n')}`, 'warning', 0), 0);
  }

  // ---------------------------------------------------------------------------
  // UI construction
  // ---------------------------------------------------------------------------

  private toolButton(name: IconName, label: string, onClick: () => void, showLabel = false): HTMLButtonElement {
    return h(
      'button',
      {
        type: 'button',
        class: `tool${showLabel ? ' tool-labelled' : ''}`,
        title: label,
        'aria-label': label,
        onclick: onClick,
      },
      icon(name),
      showLabel ? h('span', {}, label) : null,
    );
  }

  private buildChrome(): void {
    this.root.replaceChildren();
    this.undoBtn = this.toolButton('undo', `${t('action.undo')} (Ctrl+Z)`, () => this.undo());
    this.redoBtn = this.toolButton('redo', `${t('action.redo')} (Ctrl+Y)`, () => this.redo());
    this.zoomEl = h(
      'button',
      { type: 'button', class: 'zoom-value', title: t('action.zoomReset'), onclick: () => this.workspace.setZoom(1) },
      '100 %',
    );
    this.saveEl = h('span', { class: 'save-state' });
    this.titleEl = h('button', {
      type: 'button',
      class: 'project-title',
      title: t('inspector.project'),
      onclick: () => this.store.select({ type: 'none' }),
    });

    const lang = h(
      'select',
      {
        class: 'lang',
        'aria-label': 'Language',
        onchange: (e: Event) => this.setLanguage((e.target as HTMLSelectElement).value as Lang),
      },
      ...LANGS.map((l) => h('option', { value: l.id, selected: l.id === getLang() }, l.label)),
    );

    const header = h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('div', {}, h('strong', {}, 'EasyPanel'), h('small', {}, t('app.tagline'))),
      ),
      h(
        'nav',
        { class: 'toolbar', 'aria-label': t('app.toolbar') },
        this.toolButton('file', t('action.new'), () => void this.newProject(), true),
        this.toolButton('folder', t('action.open'), () => void this.openProject(), true),
        this.toolButton('upload', t('action.import'), () => this.importJson(), true),
        this.toolButton('download', t('action.export'), () => void this.exportProject(), true),
        h('span', { class: 'sep' }),
        this.undoBtn,
        this.redoBtn,
        h('span', { class: 'sep' }),
        this.toolButton('zoomOut', t('action.zoomOut'), () => this.workspace.setZoom(this.workspace.zoom / 1.25)),
        this.zoomEl,
        this.toolButton('zoomIn', t('action.zoomIn'), () => this.workspace.setZoom(this.workspace.zoom * 1.25)),
        this.toolButton('fit', t('action.fit'), () => this.workspace.fit()),
      ),
      h(
        'div',
        { class: 'topbar-right' },
        this.titleEl,
        this.saveEl,
        lang,
        this.toolButton('sample', t('action.example'), () => void this.loadExample()),
        this.toolButton('help', t('action.help'), helpDialog),
      ),
    );

    this.libraryEl = h('aside', { class: 'library', 'aria-label': t('library.title') });
    const scroller = h('div', { class: 'workspace-scroll', tabindex: -1 });
    this.statusEl = h('span', { class: 'status-text' });
    const workspaceEl = h(
      'section',
      { class: 'workspace', 'aria-label': t('app.workspace') },
      scroller,
      h(
        'footer',
        { class: 'statusbar' },
        this.statusEl,
        h(
          'button',
          { type: 'button', class: 'btn btn-small', onclick: () => this.addRowCommand() },
          icon('plus'),
          h('span', {}, t('action.addRow')),
        ),
      ),
    );
    const inspectorEl = h('aside', { class: 'inspector', 'aria-label': t('inspector.title') });

    this.root.append(header, h('main', { class: 'layout' }, this.libraryEl, workspaceEl, inspectorEl));

    this.workspace = new Workspace(scroller, this.store, {
      addPreset: (p) => this.addPresetAuto(p),
      dropNew: (spec, rowId, pos, insert) =>
        this.run(() => {
          const d = this.store.update((p) => addDevice(p, rowId, spec, pos, insert));
          this.store.select({ type: 'device', id: d.id });
        }),
      dropMove: (id, rowId, pos, insert) =>
        this.run(() => this.store.update((p) => moveDevice(p, id, rowId, pos, insert))),
      dropFailed: (reason: DropFailure) => toast(t(`error.${reason}`), 'warning'),
      status: (msg) => this.setStatus(msg),
      editDevice: (id) => {
        this.store.select({ type: 'device', id });
        this.inspector.focusLabel();
      },
      zoomChanged: (z) => {
        this.zoomEl.textContent = `${Math.round(z * 100)} %`;
        savePrefs({ zoom: z });
      },
    });
    this.inspector = new Inspector(inspectorEl, {
      edit: (mutate, key) => this.run(() => this.store.update(mutate, key)),
      select: (sel: Selection) => this.store.select(sel),
      duplicateDevice: (id) => this.duplicate(id),
      deleteDevice: (id) => this.deleteDevice(id),
      addRow: (after) => this.addRowCommand(after),
      deleteRow: (id) => void this.deleteRow(id),
    });
    this.renderLibrary();
  }

  /** (Re)builds the component palette, with previews in the current device style. */
  private renderLibrary(): void {
    this.libraryStyle = this.store.project.settings.deviceStyle;
    renderLibrary(this.libraryEl, this.libraryStyle, {
      onPointerDown: (preset, e) => this.workspace.beginLibraryDrag(preset, e),
      onActivate: (preset) => this.addPresetAuto(preset),
    });
  }

  private setLanguage(lang: Lang): void {
    setLang(lang);
    savePrefs({ lang });
    const zoom = this.workspace.zoom;
    this.buildChrome();
    this.workspace.setZoom(zoom);
    this.refreshAll();
  }

  // ---------------------------------------------------------------------------
  // Store → UI
  // ---------------------------------------------------------------------------

  private onStoreChange(kind: 'project' | 'selection' | 'replace'): void {
    this.workspace.render();
    if (this.store.project.settings.deviceStyle !== this.libraryStyle) this.renderLibrary();
    // Don't rebuild the form under the user's cursor while they type in it.
    if (kind !== 'project' || !this.inspector.hasFocus())
      this.inspector.render(this.store.project, this.store.selection);
    this.updateToolbar();
    if (kind !== 'selection') this.scheduleSave();
    if (kind === 'replace') requestAnimationFrame(() => this.workspace.fit());
  }

  private refreshAll(): void {
    this.workspace.render();
    this.inspector.render(this.store.project, this.store.selection);
    this.updateToolbar();
    this.updateSaveIndicator();
    this.setStatus('');
  }

  private updateToolbar(): void {
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    this.titleEl.textContent = this.store.project.meta.name || t('project.untitled');
    document.title = `${this.store.project.meta.name || t('project.untitled')} — EasyPanel`;
    this.zoomEl.textContent = `${Math.round(this.workspace.zoom * 100)} %`;
  }

  private setStatus(message: string): void {
    this.statusEl.textContent = message || t('status.default');
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private scheduleSave(): void {
    this.saveState = 'pending';
    this.updateSaveIndicator();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), AUTOSAVE_DELAY);
  }

  /** Writes the project to local storage. Returns false (and tells the user) on failure. */
  private saveNow(): boolean {
    clearTimeout(this.saveTimer);
    if (this.savedRevision === this.store.revision && this.saveState === 'saved') return true;
    try {
      saveToLibrary(this.store.project);
      this.savedRevision = this.store.revision;
      this.saveState = 'saved';
      this.updateSaveIndicator();
      return true;
    } catch (e) {
      const wasOk = this.saveState !== 'error';
      this.saveState = 'error';
      this.updateSaveIndicator();
      if (wasOk)
        toast(t('error.saveFailed', { detail: e instanceof StorageError ? e.message : String(e) }), 'error', 0);
      return false;
    }
  }

  private updateSaveIndicator(): void {
    this.saveEl.className = `save-state save-${this.saveState}`;
    this.saveEl.textContent = t(`save.${this.saveState}`);
    this.saveEl.title = t(`save.${this.saveState}.title`);
  }

  /**
   * Called before replacing the current project. Makes sure it is saved; if
   * storage fails, offers to export it as a file first so nothing is lost.
   */
  private async ensureCurrentSaved(): Promise<boolean> {
    if (this.saveNow()) return true;
    const choice = await modal(t('unsaved.title'), h('p', {}, t('unsaved.message')), [
      { label: t('action.cancel'), value: 'cancel' },
      { label: t('unsaved.discard'), value: 'discard', kind: 'danger' },
      { label: t('unsaved.export'), value: 'export', kind: 'primary' },
    ]);
    if (choice === 'export') {
      exportJson(this.store.project);
      return true;
    }
    return choice === 'discard';
  }

  private async replaceProject(project: Project): Promise<void> {
    if (!(await this.ensureCurrentSaved())) return;
    this.store.replace(project);
    this.saveNow();
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /** Runs a model command, reporting expected errors as notifications. */
  private run(fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (e) {
      if (e instanceof EditError) {
        toast(t(`error.${e.code}`), 'warning');
      } else {
        console.error(e);
        toast(t('error.unexpected', { detail: e instanceof Error ? e.message : String(e) }), 'error');
      }
      return false;
    }
  }

  private undo(): void {
    this.store.undo();
  }

  private redo(): void {
    this.store.redo();
  }

  /** Row targeted by "add" commands: the selected row, or the row of the selected device. */
  private targetRowId(): string | undefined {
    const sel = this.store.selection;
    if (sel.type === 'row') return sel.id;
    if (sel.type === 'device') return findDevice(this.store.project, sel.id)?.row.id;
    return undefined;
  }

  /** Adds a preset at the first free slot of the target row, or of the first row with room. */
  private addPresetAuto(preset: Preset): void {
    const spec = deviceFromPreset(preset);
    const project = this.store.project;
    const preferred = this.targetRowId();
    const rows = [...project.rows].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    const row = rows.find((r) => findFreeSlot(r, spec.width) >= 0);
    if (!row) {
      toast(t('error.no-space-anywhere'), 'warning');
      return;
    }
    this.run(() => {
      const d = this.store.update((p) => addDevice(p, row.id, spec));
      this.store.select({ type: 'device', id: d.id });
      this.workspace.reveal(d.id);
    });
  }

  private duplicate(id: string): void {
    this.run(() => {
      const copy = this.store.update((p) => duplicateDevice(p, id));
      this.store.select({ type: 'device', id: copy.id });
    });
  }

  private deleteDevice(id: string): void {
    this.run(() => this.store.update((p) => removeDevice(p, id)));
  }

  private addRowCommand(afterRowId?: string): void {
    const project = this.store.project;
    const index = afterRowId ? project.rows.findIndex((r) => r.id === afterRowId) + 1 : project.rows.length;
    const ref = project.rows[Math.max(0, index - 1)];
    const modules = ref?.modules ?? 13;
    this.run(() => {
      const row = this.store.update((p) => addRow(p, modules, t('row.defaultName', { n: p.rows.length + 1 }), index));
      this.store.select({ type: 'row', id: row.id });
    });
  }

  private async deleteRow(id: string): Promise<void> {
    const row = this.store.project.rows.find((r) => r.id === id);
    if (!row) return;
    if (row.devices.length > 0) {
      const ok = await confirmDialog(
        t('confirm.deleteRow.title'),
        t('confirm.deleteRow', { name: row.name, n: row.devices.length }),
        t('action.delete'),
        true,
      );
      if (!ok) return;
    }
    this.run(() => this.store.update((p) => removeRow(p, id)));
  }

  private async newProject(): Promise<void> {
    const name = h('input', { type: 'text', value: t('project.new') });
    const rows = h('input', { type: 'number', min: 1, max: 12, value: 2 });
    const modules = h(
      'select',
      {},
      ...SUGGESTIONS.rowModules.map((m) =>
        h('option', { value: m, selected: m === 13 }, t('library.modules', { n: m })),
      ),
    );
    const body = h(
      'div',
      { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', {}, t('field.projectName')), name),
      h('label', { class: 'field' }, h('span', {}, t('newProject.rows')), rows),
      h('label', { class: 'field' }, h('span', {}, t('newProject.modules')), modules),
      h('p', { class: 'muted small' }, t('newProject.hint')),
    );
    const ok = await modal(t('newProject.title'), body, [
      { label: t('action.cancel'), value: false },
      { label: t('action.create'), value: true, kind: 'primary' },
    ]);
    if (!ok) return;
    const nRows = Math.min(12, Math.max(1, Math.round(Number(rows.value)) || 1));
    await this.replaceProject(this.blankProject(name.value.trim() || t('project.new'), nRows, Number(modules.value)));
  }

  private async loadExample(): Promise<void> {
    await this.replaceProject(createExampleProject());
  }

  private async openProject(): Promise<void> {
    this.saveNow();
    const choice = await openProjectDialog(this.store.project.id);
    if (!choice) return;
    if (choice.type === 'delete') {
      const info = listStoredProjects().find((p) => p.id === choice.id);
      if (
        await confirmDialog(
          t('confirm.deleteProject.title'),
          t('confirm.deleteProject', { name: info?.name ?? '' }),
          t('action.delete'),
          true,
        )
      ) {
        deleteFromLibrary(choice.id);
        toast(t('toast.projectDeleted'), 'info');
      }
      void this.openProject();
      return;
    }
    if (choice.id === this.store.project.id) return;
    try {
      const result = loadFromLibrary(choice.id);
      if (!result) throw new ProjectFormatError('not-a-project');
      await this.replaceProject(result.project);
      this.reportLoadWarnings(result);
    } catch (e) {
      toast(this.formatLoadError(e), 'error');
    }
  }

  private importJson(): void {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.importFile(file);
    });
    input.click();
  }

  private async importFile(file: File): Promise<void> {
    try {
      const result = parseProjectText(await file.text());
      // An imported file whose id already exists locally (e.g. re-importing an
      // export) must not silently overwrite the stored copy: give it a new id.
      if (listStoredProjects().some((p) => p.id === result.project.id)) result.project.id = createProject('').id;
      await this.replaceProject(result.project);
      this.reportLoadWarnings(result);
      toast(t('toast.imported', { name: result.project.meta.name }), 'success');
    } catch (e) {
      toast(this.formatLoadError(e), 'error');
    }
  }

  private formatLoadError(e: unknown): string {
    if (e instanceof ProjectFormatError)
      return t(`error.format.${e.code}`, { version: e.message, supported: FORMAT_VERSION });
    return t('error.unexpected', { detail: e instanceof Error ? e.message : String(e) });
  }

  private async exportProject(): Promise<void> {
    const opts = await exportDialog(this.exportOptions);
    if (!opts) return;
    this.exportOptions = opts;
    const project = this.store.project;
    const ctx = { date: formatDate(new Date().toISOString()) };
    try {
      switch (opts.format) {
        case 'json':
          exportJson(project);
          break;
        case 'svg':
          exportSvg(project, ctx);
          break;
        case 'png': {
          const dpi = await exportPng(project, ctx, opts.dpi);
          if (dpi < opts.dpi) toast(t('toast.pngReduced', { dpi }), 'warning');
          break;
        }
        case 'pdf': {
          toast(t('toast.pdfWorking'), 'info', 1500);
          const scale = await exportPdf(project, ctx, opts.pdfScale);
          if (opts.pdfScale === 'real' && scale < 1)
            toast(t('toast.pdfScaled', { pct: Math.round(scale * 100) }), 'warning');
          break;
        }
        case 'print':
          printPanel(project, ctx);
          return;
      }
      toast(t('toast.exported'), 'success');
    } catch (e) {
      console.error(e);
      toast(t('error.exportFailed', { detail: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard, file drop, unload
  // ---------------------------------------------------------------------------

  private installGlobalHandlers(): void {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('beforeunload', (e) => {
      if (!this.saveNow()) {
        // Storage failed: ask the browser to confirm leaving (unsaved work).
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow();
    });
    // Dropping a project file anywhere imports it.
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      void this.importFile(file);
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Shortcuts that also work while typing.
    if (mod && key === 's') {
      e.preventDefault();
      if (this.saveNow()) toast(t('toast.saved'), 'success', 1500);
      return;
    }
    if (isEditingText(e.target)) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }

    const sel = this.store.selection;
    const deviceId = sel.type === 'device' ? sel.id : null;
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
    } else if (mod && key === 'd' && deviceId) {
      e.preventDefault();
      this.duplicate(deviceId);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && deviceId) {
      e.preventDefault();
      this.deleteDevice(deviceId);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.type === 'row') {
      e.preventDefault();
      void this.deleteRow(sel.id);
    } else if (e.key === 'Escape') {
      this.store.select({ type: 'none' });
    } else if (mod && (key === '+' || key === '=')) {
      e.preventDefault();
      this.workspace.setZoom(this.workspace.zoom * 1.25);
    } else if (mod && key === '-') {
      e.preventDefault();
      this.workspace.setZoom(this.workspace.zoom / 1.25);
    } else if (mod && key === '0') {
      e.preventDefault();
      this.workspace.fit();
    } else if (deviceId && e.key.startsWith('Arrow')) {
      e.preventDefault();
      this.nudge(deviceId, e.key, e.altKey);
    } else if (e.key === 'Enter' && deviceId) {
      e.preventDefault();
      this.inspector.focusLabel();
    }
  }

  /** Arrow keys: move within the rail (Alt = half module) or to the adjacent row, never overlapping. */
  private nudge(deviceId: string, key: string, half: boolean): void {
    const project = this.store.project;
    const loc = findDevice(project, deviceId);
    if (!loc) return;
    const { device, rowIndex } = loc;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const step = (half ? 0.5 : 1) * (key === 'ArrowLeft' ? -1 : 1);
      this.run(() =>
        this.store.update((p) => moveDevice(p, deviceId, loc.row.id, device.position + step), `nudge:${deviceId}`),
      );
    } else {
      const target = project.rows[rowIndex + (key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      const pos = Math.min(device.position, Math.max(0, target.modules - device.width));
      this.run(() => this.store.update((p) => moveDevice(p, deviceId, target.id, pos)));
    }
  }
}
