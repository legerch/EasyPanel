/**
 * Export of the panel as SVG, PNG, PDF and JSON.
 *
 * All image formats start from the exact same SVG produced by `renderPanel`
 * in "export" mode, so proportions, labels and positions are identical
 * everywhere and no UI element can leak into the output.
 */
import type { Project } from '../model/types';
import { renderPanel } from '../render/panel';
import { fileBaseName, serializeProject } from '../store/persistence';

export interface ExportContext {
  /** Date string printed in the title block. */
  date: string;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportSvgString(project: Project, ctx: ExportContext): { svg: string; width: number; height: number } {
  const { svg, layout } = renderPanel(project, { mode: 'export', titleInfo: { date: ctx.date } });
  return { svg, width: layout.width, height: layout.height };
}

export function exportJson(project: Project): void {
  downloadBlob(
    new Blob([serializeProject(project)], { type: 'application/json' }),
    `${fileBaseName(project)}.easypanel.json`,
  );
}

export function exportSvg(project: Project, ctx: ExportContext): void {
  const { svg } = exportSvgString(project, ctx);
  const doc = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  downloadBlob(new Blob([doc], { type: 'image/svg+xml' }), `${fileBaseName(project)}.svg`);
}

/** Browsers limit canvas sizes (≈ 16k px per side, ~268 Mpx area on Chromium). Stay well below. */
const MAX_CANVAS_SIDE = 16000;
const MAX_CANVAS_AREA = 120_000_000;

/** Rasterises the export SVG. Returns the effective DPI (reduced if the canvas would be too large). */
export async function renderPng(
  project: Project,
  ctx: ExportContext,
  dpi: number,
): Promise<{ blob: Blob; dpi: number }> {
  const { svg, width, height } = exportSvgString(project, ctx);
  let pxPerMm = dpi / 25.4;
  const limit = Math.min(MAX_CANVAS_SIDE / Math.max(width, height), Math.sqrt(MAX_CANVAS_AREA / (width * height)));
  if (pxPerMm > limit) pxPerMm = limit;
  const w = Math.round(width * pxPerMm);
  const h = Math.round(height * pxPerMm);

  // Explicit pixel size so the image rasterises at the target resolution (not at its mm size).
  const sized = svg.replace(/width="[^"]*mm" height="[^"]*mm"/, `width="${w}" height="${h}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c2d = canvas.getContext('2d');
    if (!c2d) throw new Error('Canvas 2D context unavailable');
    c2d.fillStyle = '#ffffff';
    c2d.fillRect(0, 0, w, h);
    c2d.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    return { blob, dpi: Math.round(pxPerMm * 25.4) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(project: Project, ctx: ExportContext, dpi: number): Promise<number> {
  const { blob, dpi: effective } = await renderPng(project, ctx, dpi);
  downloadBlob(blob, `${fileBaseName(project)}.png`);
  return effective;
}

export type PdfScale = 'fit' | 'real';

/** A4 landscape page, in mm. */
const PAGE_W = 297;
const PAGE_H = 210;
const PAGE_MARGIN = 10;

/**
 * Vector PDF on an A4 landscape page. "fit" scales the drawing to the page;
 * "real" prints at 1:1 (so the label strips can be cut out and used in the
 * actual panel) and falls back to fit when the drawing is larger than the page.
 * Returns the scale actually used.
 */
export async function exportPdf(project: Project, ctx: ExportContext, scaleMode: PdfScale): Promise<number> {
  // Loaded on demand: keeps the PDF libraries out of the main bundle.
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { svg, width, height } = exportSvgString(project, ctx);

  const fit = Math.min((PAGE_W - 2 * PAGE_MARGIN) / width, (PAGE_H - 2 * PAGE_MARGIN) / height);
  const scale = scaleMode === 'real' ? Math.min(1, fit) : fit;
  const w = width * scale;
  const h = height * scale;

  // svg2pdf needs an element attached to the document to resolve styles.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;';
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    const element = host.querySelector('svg')!;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: project.meta.name, subject: project.meta.description, creator: 'EasyPanel' });
    await svg2pdf(element, doc, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
    doc.save(`${fileBaseName(project)}.pdf`);
  } finally {
    host.remove();
  }
  return scale;
}

/** Opens the browser print dialog with only the panel drawing. */
export function printPanel(project: Project, ctx: ExportContext): void {
  const { svg } = exportSvgString(project, ctx);
  const host = document.createElement('div');
  host.className = 'print-host';
  host.innerHTML = svg;
  document.body.appendChild(host);
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    host.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  // Some browsers do not fire afterprint reliably.
  setTimeout(cleanup, 60_000);
}
