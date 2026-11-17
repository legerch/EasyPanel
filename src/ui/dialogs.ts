/** Modal dialogs built on the native <dialog> element. */
import { formatDate, t } from '../i18n';
import { listStoredProjects, type StoredProjectInfo } from '../store/persistence';
import { FORMAT_VERSION } from '../model/types';
import { APP_VERSION } from '../version';
import { h } from './dom';
import { icon } from './icons';

interface ModalAction<T> {
  label: string;
  value: T;
  kind?: 'primary' | 'danger' | 'default';
}

/**
 * Shows a modal and resolves with the value of the clicked action, or `null`
 * when dismissed (Escape, close button, backdrop click).
 */
export function modal<T>(title: string, body: Node, actions: ModalAction<T>[], className = ''): Promise<T | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: `modal ${className}` });
    let result: T | null = null;
    const close = (value: T | null) => {
      result = value;
      dialog.close();
    };
    const header = h(
      'header',
      {},
      h('h2', {}, title),
      h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': t('action.close'), onclick: () => close(null) },
        icon('close'),
      ),
    );
    const footer = h('footer', {});
    for (const a of actions) {
      footer.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : ''}`,
            onclick: () => close(a.value),
          },
          a.label,
        ),
      );
    }
    dialog.append(header, h('div', { class: 'modal-body' }, body), footer);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close(null); // backdrop
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    (footer.querySelector('.btn-primary, .btn-danger') as HTMLElement | null)?.focus();
  });
}

export async function confirmDialog(title: string, message: string, okLabel: string, danger = false): Promise<boolean> {
  const r = await modal(title, h('p', {}, message), [
    { label: t('action.cancel'), value: false },
    { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' },
  ]);
  return r === true;
}

export type OpenChoice = { type: 'open'; id: string } | { type: 'delete'; id: string };

/** Lists the projects saved in the browser. */
export function openProjectDialog(currentId: string): Promise<OpenChoice | null> {
  const projects = listStoredProjects();
  return new Promise((resolve) => {
    let choice: OpenChoice | null = null;
    const list = h('ul', { class: 'project-list' });
    const body = h('div', {}, projects.length ? list : h('p', { class: 'muted' }, t('open.empty')));
    const pick = (c: OpenChoice) => {
      choice = c;
      (body.closest('dialog') as HTMLDialogElement).close();
    };
    projects.forEach((p: StoredProjectInfo) => {
      list.appendChild(
        h(
          'li',
          { class: p.id === currentId ? 'current' : '' },
          h(
            'button',
            { type: 'button', class: 'project-open', onclick: () => pick({ type: 'open', id: p.id }) },
            h('strong', {}, p.name || t('project.untitled')),
            h(
              'span',
              { class: 'muted' },
              `${formatDate(p.updatedAt, true)}${p.id === currentId ? ` · ${t('open.current')}` : ''}`,
            ),
          ),
          p.id === currentId
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  title: t('action.delete'),
                  'aria-label': t('action.delete'),
                  onclick: () => pick({ type: 'delete', id: p.id }),
                },
                icon('trash'),
              ),
        ),
      );
    });
    void modal<null>(t('open.title'), body, [{ label: t('action.close'), value: null }], 'modal-open').then(() =>
      resolve(choice),
    );
  });
}

export type ExportFormat = 'svg' | 'png' | 'pdf' | 'json' | 'print';
export interface ExportOptions {
  format: ExportFormat;
  dpi: number;
  pdfScale: 'fit' | 'real';
}

export function exportDialog(initial: ExportOptions): Promise<ExportOptions | null> {
  const opts = { ...initial };
  const formats: ExportFormat[] = ['pdf', 'png', 'svg', 'json', 'print'];
  const radios = h('div', { class: 'format-grid' });
  const dpiField = h(
    'label',
    { class: 'field' },
    h('span', {}, t('export.resolution')),
    h(
      'select',
      { onchange: (e: Event) => (opts.dpi = Number((e.target as HTMLSelectElement).value)) },
      ...[150, 300, 600].map((d) => h('option', { value: d, selected: d === opts.dpi }, `${d} DPI`)),
    ),
  );
  const pdfField = h(
    'label',
    { class: 'field' },
    h('span', {}, t('export.scale')),
    h(
      'select',
      { onchange: (e: Event) => (opts.pdfScale = (e.target as HTMLSelectElement).value as 'fit' | 'real') },
      h('option', { value: 'fit', selected: opts.pdfScale === 'fit' }, t('export.scaleFit')),
      h('option', { value: 'real', selected: opts.pdfScale === 'real' }, t('export.scaleReal')),
    ),
  );
  const sync = () => {
    dpiField.hidden = opts.format !== 'png';
    pdfField.hidden = opts.format !== 'pdf';
  };
  for (const f of formats) {
    radios.appendChild(
      h(
        'label',
        { class: 'format-option' },
        h('input', {
          type: 'radio',
          name: 'export-format',
          value: f,
          checked: f === opts.format,
          onchange: () => {
            opts.format = f;
            sync();
          },
        }),
        h('span', {}, h('strong', {}, t(`export.${f}`)), h('small', {}, t(`export.${f}.desc`))),
      ),
    );
  }
  sync();
  const body = h('div', { class: 'export-body' }, radios, dpiField, pdfField);
  return modal(t('export.title'), body, [
    { label: t('action.cancel'), value: null },
    { label: t('export.go'), value: 'go', kind: 'primary' },
  ]).then((r) => (r === 'go' ? opts : null));
}

export function helpDialog(): void {
  const shortcuts: Array<[string, string]> = [
    ['Ctrl+Z / Ctrl+Y', t('help.undoRedo')],
    ['Ctrl+D', t('help.duplicate')],
    ['Del', t('help.delete')],
    ['← → ↑ ↓', t('help.arrows')],
    [t('help.shiftKey'), t('help.insert')],
    ['Ctrl + ' + t('help.wheel'), t('help.zoom')],
    ['Ctrl+S', t('help.save')],
    ['Esc', t('help.escape')],
  ];
  const body = h(
    'div',
    { class: 'help' },
    h('p', {}, t('help.intro')),
    h(
      'ol',
      {},
      h('li', {}, t('help.step1')),
      h('li', {}, t('help.step2')),
      h('li', {}, t('help.step3')),
      h('li', {}, t('help.step4')),
    ),
    h('h3', {}, t('help.shortcuts')),
    h('table', {}, ...shortcuts.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))),
    h('p', { class: 'disclaimer' }, t('disclaimer')),
    h('p', { class: 'muted' }, t('help.license')),
    h('p', { class: 'muted small' }, t('help.version', { app: APP_VERSION, format: FORMAT_VERSION })),
  );
  void modal(t('help.title'), body, [{ label: t('action.close'), value: null, kind: 'primary' }], 'modal-help');
}
