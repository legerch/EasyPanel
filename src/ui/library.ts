/** Component library palette (left side). Items can be dragged onto a rail, or clicked to add them at the first free slot. */
import { t } from '../i18n';
import { CATEGORIES, PRESETS, type Preset } from '../model/catalog';
import type { DeviceStyle } from '../model/types';
import { DEVICE_H, drawDevice, MODULE_MM } from '../render/devices';
import { FONT_FAMILY } from '../render/text';
import { fromHtml, h } from './dom';
import { icon } from './icons';

export interface LibraryCallbacks {
  /** Pointer pressed on an item: the editor decides whether it becomes a drag or a click. */
  onPointerDown(preset: Preset, event: PointerEvent): void;
  /** Keyboard activation (Enter/Space). */
  onActivate(preset: Preset): void;
}

export function presetTitle(preset: Preset): string {
  const p = preset.props;
  return t(preset.titleKey, {
    rating: p.rating ?? '',
    curve: p.curve ?? '',
    diffType: p.diffType ?? '',
    sensitivity: p.sensitivity ?? '',
    poles: p.poles ?? '',
    width: preset.width,
  });
}

/** Small SVG preview of a device, at the same scale for every preset so widths compare visually. */
export function devicePreview(preset: Pick<Preset, 'kind' | 'width' | 'props'>, style: DeviceStyle, pxPerMm = 1.05): Element {
  const w = preset.width * MODULE_MM;
  return fromHtml(
    `<svg class="preview" xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 ${w + 1} ${DEVICE_H + 1}" width="${(w + 1) * pxPerMm}" height="${(DEVICE_H + 1) * pxPerMm}" aria-hidden="true"><g font-family="${FONT_FAMILY}">${drawDevice({ ...preset, props: { ...preset.props, label: undefined } }, style)}</g></svg>`,
  );
}

/** Builds the palette; previews are drawn in the project's device style. */
export function renderLibrary(container: HTMLElement, style: DeviceStyle, cb: LibraryCallbacks): void {
  container.replaceChildren();
  const search = h('input', { type: 'search', class: 'library-search', placeholder: t('library.search'), 'aria-label': t('library.search') });
  const list = h('div', { class: 'library-list' });
  container.append(
    h('div', { class: 'panel-title' }, t('library.title')),
    h('div', { class: 'search-wrap' }, icon('search'), search),
    list,
    h('p', { class: 'library-tip muted' }, t('library.tip')),
  );

  const items: Array<{ el: HTMLElement; text: string; section: HTMLElement }> = [];
  for (const cat of CATEGORIES) {
    const section = h('section', { class: 'library-section' }, h('h3', {}, t(`category.${cat}`)));
    const grid = h('div', { class: 'library-grid' });
    for (const preset of PRESETS.filter((p) => p.category === cat)) {
      const title = presetTitle(preset);
      const el = h(
        'div',
        {
          class: 'library-item',
          tabindex: 0,
          role: 'button',
          title: `${title} — ${t('library.modules', { n: preset.width })}`,
          'data-preset': preset.id,
        },
        h('div', { class: 'library-preview' }, devicePreview(preset, style)),
        h('div', { class: 'library-text' }, h('span', { class: 'library-name' }, title), h('span', { class: 'library-width' }, t('library.modules', { n: preset.width }))),
      );
      el.addEventListener('pointerdown', (e) => {
        if (e.button === 0) cb.onPointerDown(preset, e);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cb.onActivate(preset);
        }
      });
      grid.appendChild(el);
      items.push({ el, text: `${title} ${t(`kind.${preset.kind}`)}`.toLowerCase(), section });
    }
    section.appendChild(grid);
    list.appendChild(section);
  }

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const it of items) it.el.hidden = q !== '' && !it.text.includes(q);
    for (const s of list.querySelectorAll<HTMLElement>('.library-section')) {
      s.hidden = !items.some((it) => it.section === s && !it.el.hidden);
    }
  });
}
