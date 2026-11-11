/**
 * Panel renderer: turns a Project into a complete SVG document.
 *
 * The same function serves the editor (mode "editor": adds the module grid,
 * selection outline and hit areas) and every export format (mode "export":
 * clean output, optional title block and notes). Units are millimetres.
 */
import { emptyRanges } from '../model/layout';
import type { Project, Row } from '../model/types';
import { DEVICE_H, drawDevice, MODULE_MM } from './devices';
import { esc, fitBlock, fitSingleLine, FONT_FAMILY, n, wrap } from './text';

const PAD_X = 12;
const PAD_Y = 12;
const LABEL_GAP = 3;
const ROW_NAME_W = 16;
const TITLE_H = 22;
const MARGIN = 6;
/** Height of a DIN rail (EN 60715 top-hat rail is 35 mm wide). */
const RAIL_H = 35;

export type RenderMode = 'editor' | 'export';

export interface RenderOptions {
  mode: RenderMode;
  /** Selected device or row id (editor only). */
  selectedDeviceId?: string;
  selectedRowId?: string;
  /** Formatted date and labels for the title block (export only). */
  titleInfo?: { date: string };
}

export interface RowGeometry {
  id: string;
  /** Left edge of module 0, in mm. */
  x: number;
  /** Top of the label strip (equal to deviceY when labels are hidden). */
  top: number;
  labelY: number;
  deviceY: number;
  /** Bottom of the device area. */
  bottom: number;
  modules: number;
}

export interface PanelLayout {
  width: number;
  height: number;
  panel: { x: number; y: number; w: number; h: number };
  rows: RowGeometry[];
  notesY: number;
  notesLines: string[];
}

const NOTES_SIZE = 3.4;

export function computeLayout(project: Project, mode: RenderMode): PanelLayout {
  const s = project.settings;
  const withTitle = mode === 'export' && s.showTitle;
  const rowNameW = s.showRowNames ? ROW_NAME_W : 0;
  const maxModules = Math.max(1, ...project.rows.map((r) => r.modules));
  const railsW = maxModules * MODULE_MM;
  const panelW = PAD_X * 2 + rowNameW + railsW;
  const labelBlock = s.showLabels ? s.labelHeight + LABEL_GAP : 0;
  const panelX = MARGIN;
  const panelY = MARGIN + (withTitle ? TITLE_H : 0);

  let y = panelY + PAD_Y;
  const rows: RowGeometry[] = project.rows.map((row) => {
    const top = y;
    const g: RowGeometry = {
      id: row.id,
      x: panelX + PAD_X + rowNameW + (railsW - row.modules * MODULE_MM) / 2,
      top,
      labelY: top,
      deviceY: top + labelBlock,
      bottom: top + labelBlock + DEVICE_H,
      modules: row.modules,
    };
    y = g.bottom + s.rowSpacing;
    return g;
  });
  const panelH = (rows.length ? rows[rows.length - 1].bottom : panelY) + PAD_Y - panelY;

  const notesLines = mode === 'export' && project.notes.trim() ? wrap(project.notes.trim(), panelW, NOTES_SIZE) : [];
  const notesY = panelY + panelH + 6;
  const notesH = notesLines.length ? 6 + notesLines.length * NOTES_SIZE * 1.3 : 0;

  return {
    width: panelW + MARGIN * 2,
    height: panelY + panelH + notesH + MARGIN,
    panel: { x: panelX, y: panelY, w: panelW, h: panelH },
    rows,
    notesY,
    notesLines,
  };
}

function renderTitle(project: Project, layout: PanelLayout, date: string): string {
  const { x, w } = layout.panel;
  const out: string[] = [];
  const name = project.meta.name || 'EasyPanel';
  const right = [project.meta.author, date].filter(Boolean).join(' — ');
  const rightSize = 3.2;
  out.push(`<text x="${n(x)}" y="${n(MARGIN + 7)}" font-size="${n(fitSingleLine(name, w * 0.65, 7, 3, true))}" font-weight="bold" fill="#1d1d1d">${esc(name)}</text>`);
  if (right) out.push(`<text x="${n(x + w)}" y="${n(MARGIN + 6)}" font-size="${rightSize}" text-anchor="end" fill="#444">${esc(right)}</text>`);
  if (project.meta.description) {
    const d = project.meta.description.replace(/\s+/g, ' ');
    out.push(`<text x="${n(x)}" y="${n(MARGIN + 14)}" font-size="${n(fitSingleLine(d, w, 3.6, 2, false))}" fill="#444">${esc(d)}</text>`);
  }
  out.push(`<line x1="${n(x)}" y1="${n(MARGIN + TITLE_H - 4)}" x2="${n(x + w)}" y2="${n(MARGIN + TITLE_H - 4)}" stroke="#888" stroke-width="0.3"/>`);
  return out.join('');
}

/** Circuit label strip above a rail, with one cell per device. */
function renderLabels(project: Project, row: Row, g: RowGeometry): string {
  const s = project.settings;
  const h = s.labelHeight;
  const out: string[] = [];
  const railW = row.modules * MODULE_MM;
  out.push(`<rect x="${n(g.x - 1)}" y="${n(g.labelY)}" width="${n(railW + 2)}" height="${n(h)}" rx="0.8" fill="#f6f8fa" stroke="#7d9fcf" stroke-width="0.6"/>`);
  for (const d of row.devices) {
    const x = g.x + d.position * MODULE_MM;
    const w = d.width * MODULE_MM;
    // Cell separators at device edges help reading which label belongs to which device.
    out.push(`<line x1="${n(x)}" y1="${n(g.labelY + 1)}" x2="${n(x)}" y2="${n(g.labelY + h - 1)}" stroke="#c8d4e4" stroke-width="0.3"/>`);
    out.push(`<line x1="${n(x + w)}" y1="${n(g.labelY + 1)}" x2="${n(x + w)}" y2="${n(g.labelY + h - 1)}" stroke="#c8d4e4" stroke-width="0.3"/>`);
    const label = d.props.label?.trim();
    if (!label) continue;
    const vertical = s.labelOrientation === 'vertical';
    const boxW = (vertical ? h : w) - 1.6;
    const boxH = (vertical ? w : h) - 1.6;
    const block = fitBlock(label, boxW, boxH, 4.2, 1.5);
    const cx = x + w / 2;
    const cy = g.labelY + h / 2;
    const first = -((block.lines.length - 1) * block.lineHeight) / 2;
    const tspans = block.lines
      .map((l, i) => `<text x="0" y="${n(first + i * block.lineHeight + block.size * 0.35)}" font-size="${n(block.size)}" text-anchor="middle" fill="#1d1d1d">${esc(l)}</text>`)
      .join('');
    out.push(`<g transform="translate(${n(cx)} ${n(cy)})${vertical ? ' rotate(-90)' : ''}">${tspans}</g>`);
  }
  return out.join('');
}

function renderRail(row: Row, g: RowGeometry): string {
  const w = row.modules * MODULE_MM;
  const y = g.deviceY + (DEVICE_H - RAIL_H) / 2;
  return (
    `<rect x="${n(g.x - 3)}" y="${n(y)}" width="${n(w + 6)}" height="${RAIL_H}" fill="#c3c7cc" stroke="#9a9fa6" stroke-width="0.4"/>` +
    `<rect x="${n(g.x - 3)}" y="${n(y + 5)}" width="${n(w + 6)}" height="${RAIL_H - 10}" fill="#b3b8be"/>`
  );
}

function renderEmptySlots(project: Project, row: Row, g: RowGeometry, mode: RenderMode): string {
  const out: string[] = [];
  for (const [start, len] of emptyRanges(row)) {
    const x = g.x + start * MODULE_MM;
    const w = len * MODULE_MM;
    if (mode === 'editor') {
      // One dashed slot per module (or partial module) of the free range.
      for (let m = start; m < start + len; m = Math.floor(m + 1)) {
        const sx = g.x + m * MODULE_MM;
        const sw = (Math.min(Math.floor(m + 1), start + len) - m) * MODULE_MM;
        out.push(`<rect class="slot" x="${n(sx + 0.6)}" y="${n(g.deviceY + 0.6)}" width="${n(sw - 1.2)}" height="${n(DEVICE_H - 1.2)}" rx="0.8"/>`);
      }
    } else if (project.settings.fillEmptyWithBlanks) {
      out.push(`<rect x="${n(x + 0.25)}" y="${n(g.deviceY + 0.25)}" width="${n(w - 0.5)}" height="${n(DEVICE_H - 0.5)}" rx="0.8" fill="#a4a8ad" stroke="#2b2b2b" stroke-width="0.5"/>`);
    }
  }
  return out.join('');
}

export interface RenderResult {
  svg: string;
  layout: PanelLayout;
}

export function renderPanel(project: Project, options: RenderOptions): RenderResult {
  const layout = computeLayout(project, options.mode);
  const editor = options.mode === 'editor';
  const s = project.settings;
  const { panel } = layout;
  const out: string[] = [];

  if (!editor) out.push(`<rect x="0" y="0" width="${n(layout.width)}" height="${n(layout.height)}" fill="#ffffff"/>`);
  if (!editor && s.showTitle) out.push(renderTitle(project, layout, options.titleInfo?.date ?? ''));

  // Enclosure
  out.push(`<rect x="${n(panel.x)}" y="${n(panel.y)}" width="${n(panel.w)}" height="${n(panel.h)}" rx="3" fill="${esc(s.background)}" stroke="#4a4d52" stroke-width="1.2"/>`);
  out.push(`<rect x="${n(panel.x + 2.5)}" y="${n(panel.y + 2.5)}" width="${n(panel.w - 5)}" height="${n(panel.h - 5)}" rx="1.5" fill="none" stroke="#000000" stroke-opacity="0.12" stroke-width="0.6"/>`);

  project.rows.forEach((row, i) => {
    const g = layout.rows[i];
    const railW = row.modules * MODULE_MM;
    out.push(`<g data-row-id="${esc(row.id)}">`);
    if (editor) {
      // Transparent hit area: clicking anywhere on the row selects it / targets it for drops.
      out.push(`<rect class="row-hit" x="${n(g.x - 4)}" y="${n(g.top - 2)}" width="${n(railW + 8)}" height="${n(g.bottom - g.top + 4)}" fill="transparent"/>`);
    }
    if (s.showRowNames && row.name) {
      const nx = panel.x + PAD_X + ROW_NAME_W / 2 - 2;
      const ny = g.deviceY + DEVICE_H / 2;
      const size = fitSingleLine(row.name, DEVICE_H - 4, 4.2, 2, true);
      out.push(`<text transform="translate(${n(nx)} ${n(ny)}) rotate(-90)" x="0" y="${n(size * 0.35)}" font-size="${n(size)}" font-weight="bold" text-anchor="middle" fill="#2b2b2b">${esc(row.name)}</text>`);
    }
    out.push(renderRail(row, g));
    if (s.showLabels) out.push(renderLabels(project, row, g));
    out.push(renderEmptySlots(project, row, g, options.mode));
    for (const d of row.devices) {
      const x = g.x + d.position * MODULE_MM;
      const attrs = editor ? ` data-device-id="${esc(d.id)}" class="device"` : '';
      out.push(`<g transform="translate(${n(x)} ${n(g.deviceY)})"${attrs}>${drawDevice(d)}</g>`);
    }
    if (editor) {
      if (s.rowSpacing >= 6) {
        // Module numbers under the rail (editor only).
        for (let m = 0; m < row.modules; m++) {
          out.push(`<text class="module-number" x="${n(g.x + (m + 0.5) * MODULE_MM)}" y="${n(g.bottom + 4)}" font-size="2.6" text-anchor="middle">${m + 1}</text>`);
        }
      }
      if (options.selectedRowId === row.id) {
        out.push(`<rect class="row-selected" x="${n(g.x - 4)}" y="${n(g.top - 2)}" width="${n(railW + 8)}" height="${n(g.bottom - g.top + 4)}" rx="1.5"/>`);
      }
      const sel = row.devices.find((d) => d.id === options.selectedDeviceId);
      if (sel) {
        out.push(`<rect class="device-selected" x="${n(g.x + sel.position * MODULE_MM - 0.8)}" y="${n(g.deviceY - 0.8)}" width="${n(sel.width * MODULE_MM + 1.6)}" height="${n(DEVICE_H + 1.6)}" rx="1.4"/>`);
      }
    }
    out.push('</g>');
  });

  layout.notesLines.forEach((l, i) => {
    out.push(`<text x="${n(panel.x)}" y="${n(layout.notesY + 4 + i * NOTES_SIZE * 1.3)}" font-size="${NOTES_SIZE}" fill="#333">${esc(l)}</text>`);
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" width="${n(layout.width)}mm" height="${n(layout.height)}mm">` +
    `<g font-family="${FONT_FAMILY}">${out.join('')}</g></svg>`;
  return { svg, layout };
}
