/**
 * Properties panel (right side). Shows, depending on the selection:
 *   - device properties,
 *   - row properties,
 *   - project metadata, panel settings, rows overview and summary.
 *
 * Edits are applied live through `actions.edit`, coalesced per field so that
 * typing a label produces a single undo step.
 */
import { formatNumber, t } from '../i18n';
import { COMMON_FIELDS, DEVICE_KINDS, KIND_SPECS, MAX_DEVICE_WIDTH, MAX_ROW_MODULES, SUGGESTIONS, type PropField } from '../model/catalog';
import { bottomText, mainText } from '../model/deviceText';
import { computeHints, computeStats } from '../model/insights';
import { usedModules } from '../model/layout';
import {
  findDevice,
  moveRow,
  renameRow,
  setDeviceKind,
  setDeviceWidth,
  setRowModules,
  updateDeviceProps,
  compactRow,
} from '../model/project';
import { DEVICE_STYLES, type Device, type DeviceKind, type DeviceProps, type PanelSettings, type Project, type Row } from '../model/types';
import type { Selection } from '../store/store';
import { append, h } from './dom';
import { icon, type IconName } from './icons';

export interface InspectorActions {
  /** Runs a model edit; errors are reported to the user and `false` is returned. */
  edit(mutate: (draft: Project) => void, coalesceKey?: string): boolean;
  select(sel: Selection): void;
  duplicateDevice(id: string): void;
  deleteDevice(id: string): void;
  addRow(afterRowId?: string): void;
  deleteRow(id: string): void;
}

let uniq = 0;
const nextId = () => `f${++uniq}`;

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || (control.id = nextId());
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', { class: 'muted' }, hint) : null);
}

function datalist(values: Array<string | number>): HTMLDataListElement {
  return h('datalist', { id: nextId() }, ...values.map((v) => h('option', { value: v })));
}

function textInput(value: string, onInput: (v: string) => void, placeholder = ''): HTMLInputElement {
  return h('input', { type: 'text', value, placeholder, oninput: (e: Event) => onInput((e.target as HTMLInputElement).value) });
}

function numberInput(value: number | undefined, onInput: (v: number | undefined) => void, opts: { min?: number; max?: number; step?: number; list?: HTMLDataListElement } = {}): HTMLInputElement {
  return h('input', {
    type: 'number',
    value: value ?? '',
    min: opts.min,
    max: opts.max,
    step: opts.step ?? 'any',
    list: opts.list?.id,
    oninput: (e: Event) => {
      const raw = (e.target as HTMLInputElement).value.replace(',', '.');
      onInput(raw.trim() === '' ? undefined : Number(raw));
    },
  });
}

function selectInput<T extends string>(value: T | undefined, options: ReadonlyArray<{ value: T | ''; label: string }>, onChange: (v: T | undefined) => void): HTMLSelectElement {
  return h(
    'select',
    { onchange: (e: Event) => onChange(((e.target as HTMLSelectElement).value || undefined) as T | undefined) },
    ...options.map((o) => h('option', { value: o.value, selected: (value ?? '') === o.value }, o.label)),
  );
}

function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }), h('span', {}, label));
}

function button(label: string, iconName: IconName, onClick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn btn-small ${cls}`, onclick: onClick }, icon(iconName), h('span', {}, label));
}

const section = (title: string, ...children: Array<HTMLElement | null>) => h('section', { class: 'inspector-section' }, h('h3', {}, title), ...children);

export class Inspector {
  constructor(
    private readonly root: HTMLElement,
    private readonly actions: InspectorActions,
  ) {}

  /** True while the user is typing in the panel: the form must not be rebuilt under their cursor. */
  hasFocus(): boolean {
    return this.root.contains(document.activeElement) && document.activeElement !== this.root;
  }

  render(project: Project, selection: Selection): void {
    const scroll = this.root.scrollTop;
    this.root.replaceChildren();
    if (selection.type === 'device') {
      const loc = findDevice(project, selection.id);
      if (loc) this.renderDevice(loc.device, loc.row);
    } else if (selection.type === 'row') {
      const row = project.rows.find((r) => r.id === selection.id);
      if (row) this.renderRow(row);
    }
    if (!this.root.childElementCount) this.renderProject(project);
    this.root.scrollTop = scroll;
  }

  /** Moves the focus to the circuit label field of the selected device. */
  focusLabel(): void {
    const el = this.root.querySelector<HTMLTextAreaElement>('[data-field="label"]');
    el?.focus();
    el?.select();
  }

  // ---------------------------------------------------------------------------

  private renderDevice(device: Device, row: Row): void {
    const id = device.id;
    const edit = (patch: Partial<DeviceProps>, key: string) => this.actions.edit((p) => updateDeviceProps(p, id, patch), `${id}:${key}`);
    const first = device.position + 1;
    const range = device.width <= 1 ? String(first) : `${first}–${device.position + device.width}`;

    const kindSelect = selectInput<DeviceKind>(
      device.kind,
      DEVICE_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) })),
      (k) => k && this.actions.edit((p) => setDeviceKind(p, id, k)),
    );
    const widthInput = numberInput(device.width, () => undefined, { min: 0.5, max: MAX_DEVICE_WIDTH, step: 0.5 });
    // Width is committed on change (not on each keystroke) since intermediate values are often invalid.
    widthInput.addEventListener('change', () => {
      const w = Number(widthInput.value.replace(',', '.'));
      if (!this.actions.edit((p) => setDeviceWidth(p, id, w))) widthInput.value = String(device.width);
    });

    const general = section(
      t('inspector.device'),
      field(t('field.kind'), kindSelect),
      field(t('field.width'), widthInput, t('inspector.location', { row: row.name, range })),
    );

    const specific: HTMLElement[] = [];
    for (const f of KIND_SPECS[device.kind].fields) {
      const el = this.propField(f, device, edit);
      if (el) specific.push(el);
    }

    const label = h('textarea', {
      rows: 3,
      'data-field': 'label',
      placeholder: t('field.label.placeholder'),
      oninput: (e: Event) => edit({ label: (e.target as HTMLTextAreaElement).value }, 'label'),
    });
    label.value = device.props.label ?? '';

    const appearance: HTMLElement[] = [];
    for (const f of COMMON_FIELDS) {
      if (f === 'label') continue;
      const el = this.propField(f, device, edit);
      if (el) appearance.push(el);
    }

    append(
      this.root,
      general,
      section(t('inspector.circuit'), field(t('field.label'), label, t('field.label.hint'))),
      specific.length ? section(t('inspector.characteristics'), ...specific) : null,
      section(t('inspector.appearance'), ...appearance),
      h(
        'div',
        { class: 'inspector-actions' },
        button(t('action.duplicate'), 'copy', () => this.actions.duplicateDevice(id)),
        button(t('action.delete'), 'trash', () => this.actions.deleteDevice(id), 'btn-danger-ghost'),
      ),
    );
  }

  private propField(f: PropField, device: Device, edit: (patch: Partial<DeviceProps>, key: string) => void): HTMLElement | null {
    const p = device.props;
    switch (f) {
      case 'name':
        return field(t('field.name'), textInput(p.name ?? '', (v) => edit({ name: v }, f), t('field.name.placeholder')));
      case 'rating': {
        const list = datalist(SUGGESTIONS.rating);
        return h('div', {}, field(t('field.rating'), numberInput(p.rating, (v) => edit({ rating: v }, f), { min: 0, list })), list);
      }
      case 'curve':
        return field(t('field.curve'), selectInput(p.curve, [{ value: '', label: '—' }, ...SUGGESTIONS.curves.map((c) => ({ value: c, label: c }))], (v) => edit({ curve: v }, f)));
      case 'poles':
        return field(t('field.poles'), selectInput(p.poles, [{ value: '', label: '—' }, ...SUGGESTIONS.poles.map((c) => ({ value: c, label: c }))], (v) => edit({ poles: v }, f)));
      case 'breakingCapacity': {
        const list = datalist(SUGGESTIONS.breakingCapacity);
        const input = textInput(p.breakingCapacity ?? '', (v) => edit({ breakingCapacity: v }, f), '6kA');
        input.setAttribute('list', list.id);
        return h('div', {}, field(t('field.breakingCapacity'), input), list);
      }
      case 'diffType':
        return field(t('field.diffType'), selectInput(p.diffType, [{ value: '', label: '—' }, ...SUGGESTIONS.diffTypes.map((c) => ({ value: c, label: t('field.diffType.option', { type: c }) }))], (v) => edit({ diffType: v }, f)));
      case 'sensitivity': {
        const list = datalist(SUGGESTIONS.sensitivity);
        return h('div', {}, field(t('field.sensitivity'), numberInput(p.sensitivity, (v) => edit({ sensitivity: v }, f), { min: 0, list })), list);
      }
      case 'text':
        return field(t('field.text'), textInput(p.text ?? '', (v) => edit({ text: v }, f), mainText(device.kind, { ...p, text: undefined }) || t('field.auto')), t('field.text.hint'));
      case 'secondary':
        return field(t('field.secondary'), textInput(p.secondary ?? '', (v) => edit({ secondary: v }, f), bottomText(device.kind, { ...p, secondary: undefined }) || t('field.auto')));
      case 'accentColor': {
        const input = h('input', { type: 'color', value: p.accentColor && /^#[0-9a-f]{6}$/i.test(p.accentColor) ? p.accentColor : '#1f6fb6', oninput: (e: Event) => edit({ accentColor: (e.target as HTMLInputElement).value }, f) });
        const reset = h('button', { type: 'button', class: 'btn btn-small', onclick: () => edit({ accentColor: undefined }, 'accent-reset') }, t('action.reset'));
        return field(t('field.accentColor'), h('div', { class: 'inline' }, input, reset), t('field.accentColor.hint'));
      }
      case 'color': {
        const input = h('input', { type: 'color', value: p.color && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#fbfbfb', oninput: (e: Event) => edit({ color: (e.target as HTMLInputElement).value }, f) });
        const reset = h('button', { type: 'button', class: 'btn btn-small', onclick: () => edit({ color: undefined }, 'color-reset') }, t('action.reset'));
        return field(t('field.color'), h('div', { class: 'inline' }, input, reset));
      }
      case 'label':
        return null; // rendered separately (prominent)
    }
  }

  // ---------------------------------------------------------------------------

  private renderRow(row: Row): void {
    const id = row.id;
    const used = usedModules(row);
    const list = datalist(SUGGESTIONS.rowModules);
    const modules = numberInput(row.modules, () => undefined, { min: 1, max: MAX_ROW_MODULES, step: 1, list });
    modules.addEventListener('change', () => {
      const v = Number(modules.value);
      if (!this.actions.edit((p) => setRowModules(p, id, v))) modules.value = String(row.modules);
    });
    this.root.append(
      section(
        t('inspector.row'),
        field(t('field.rowName'), textInput(row.name, (v) => this.actions.edit((p) => renameRow(p, id, v), `${id}:name`))),
        h('div', {}, field(t('field.modules'), modules, t('inspector.rowUsage', { used: formatNumber(used), free: formatNumber(row.modules - used) })), list),
      ),
      h(
        'div',
        { class: 'inspector-actions wrap' },
        button(t('action.compact'), 'compact', () => this.actions.edit((p) => compactRow(p, id))),
        button(t('action.moveUp'), 'up', () => this.actions.edit((p) => moveRow(p, id, -1))),
        button(t('action.moveDown'), 'down', () => this.actions.edit((p) => moveRow(p, id, 1))),
        button(t('action.addRowBelow'), 'plus', () => this.actions.addRow(id)),
        button(t('action.deleteRow'), 'trash', () => this.actions.deleteRow(id), 'btn-danger-ghost'),
      ),
      h('p', { class: 'muted small' }, t('inspector.compactHint')),
    );
  }

  // ---------------------------------------------------------------------------

  private renderProject(project: Project): void {
    const meta = (key: 'name' | 'description' | 'author', v: string) => this.actions.edit((p) => (p.meta[key] = v), `meta:${key}`);
    const set = <K extends keyof PanelSettings>(key: K, v: PanelSettings[K], coalesce = true) =>
      this.actions.edit((p) => (p.settings[key] = v), coalesce ? `settings:${key}` : undefined);
    const s = project.settings;

    const description = h('textarea', { rows: 2, oninput: (e: Event) => meta('description', (e.target as HTMLTextAreaElement).value) });
    description.value = project.meta.description;
    const notes = h('textarea', { rows: 3, placeholder: t('field.notes.placeholder'), oninput: (e: Event) => this.actions.edit((p) => (p.notes = (e.target as HTMLTextAreaElement).value), 'notes') });
    notes.value = project.notes;

    const stats = computeStats(project);
    const hints = computeHints(project);
    const rows = h(
      'ul',
      { class: 'row-list' },
      ...project.rows.map((r) =>
        h(
          'li',
          {},
          h(
            'button',
            { type: 'button', class: 'row-link', onclick: () => this.actions.select({ type: 'row', id: r.id }) },
            h('strong', {}, r.name || '—'),
            h('span', { class: 'muted' }, t('inspector.rowSummary', { modules: r.modules, devices: r.devices.length })),
          ),
        ),
      ),
    );

    const hintList = h(
      'ul',
      { class: 'hint-list' },
      ...hints.slice(0, 8).map((hint) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'hint-link',
              onclick: () => hint.targetId && this.actions.select(project.rows.some((r) => r.id === hint.targetId) ? { type: 'row', id: hint.targetId } : { type: 'device', id: hint.targetId }),
            },
            icon('info'),
            h('span', {}, t(hint.key, hint.params)),
          ),
        ),
      ),
    );
    if (hints.length > 8) hintList.appendChild(h('li', { class: 'muted' }, t('hint.more', { n: hints.length - 8 })));

    this.root.append(
      section(
        t('inspector.project'),
        field(t('field.projectName'), textInput(project.meta.name, (v) => meta('name', v))),
        field(t('field.description'), description),
        field(t('field.author'), textInput(project.meta.author, (v) => meta('author', v))),
        field(t('field.notes'), notes),
      ),
      section(
        t('inspector.panel'),
        field(
          t('field.deviceStyle'),
          selectInput(s.deviceStyle, DEVICE_STYLES.map((v) => ({ value: v, label: t(`deviceStyle.${v}`) })), (v) => v && set('deviceStyle', v, false)),
        ),
        field(t('field.background'), h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(s.background) ? s.background : '#d4d6d9', oninput: (e: Event) => set('background', (e.target as HTMLInputElement).value) })),
        field(t('field.rowSpacing'), numberInput(s.rowSpacing, (v) => v !== undefined && v >= 0 && v <= 200 && set('rowSpacing', v), { min: 0, max: 200, step: 1 })),
        checkbox(t('field.showLabels'), s.showLabels, (v) => set('showLabels', v, false)),
        field(
          t('field.labelOrientation'),
          selectInput(s.labelOrientation, [
            { value: 'horizontal', label: t('field.horizontal') },
            { value: 'vertical', label: t('field.vertical') },
          ], (v) => v && set('labelOrientation', v, false)),
        ),
        field(t('field.labelHeight'), numberInput(s.labelHeight, (v) => v !== undefined && v >= 8 && v <= 120 && set('labelHeight', v), { min: 8, max: 120, step: 1 })),
        checkbox(t('field.showRowNames'), s.showRowNames, (v) => set('showRowNames', v, false)),
        checkbox(t('field.fillEmpty'), s.fillEmptyWithBlanks, (v) => set('fillEmptyWithBlanks', v, false)),
        checkbox(t('field.showTitle'), s.showTitle, (v) => set('showTitle', v, false)),
      ),
      section(t('inspector.rows'), rows, h('div', { class: 'inspector-actions' }, button(t('action.addRow'), 'plus', () => this.actions.addRow()))),
      section(
        t('inspector.summary'),
        h(
          'dl',
          { class: 'stats' },
          h('dt', {}, t('stats.devices')),
          h('dd', {}, String(stats.deviceCount)),
          h('dt', {}, t('stats.modules')),
          h('dd', {}, `${formatNumber(stats.usedModules)} / ${stats.totalModules}`),
          h('dt', {}, t('stats.free')),
          h('dd', {}, `${formatNumber(stats.freeModules)} (${Math.round(stats.freeRatio * 100)} %)`),
        ),
        hints.length ? hintList : h('p', { class: 'muted small' }, t('hint.none')),
        h('p', { class: 'disclaimer small' }, t('disclaimer')),
      ),
    );
  }
}
