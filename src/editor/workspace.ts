/**
 * Interactive workspace: displays the panel SVG and handles zoom, selection
 * and drag & drop (from the library or between/within rails).
 *
 * The drawing itself comes from `renderPanel` (editor mode). This module only
 * adds transient feedback (drag ghost) and converts pointer positions into
 * rail/module coordinates. Placement validity is decided by the model
 * (`model/layout.ts`), never here.
 */
import { t } from '../i18n';
import type { Preset } from '../model/catalog';
import { canPlace, checkPlacement, planInsert, roundToStep } from '../model/layout';
import { deviceFromPreset, findDevice, type NewDevice } from '../model/project';
import type { Row } from '../model/types';
import { DEVICE_H, drawDevice, MODULE_MM } from '../render/devices';
import { renderPanel, type PanelLayout } from '../render/panel';
import { FONT_FAMILY, n } from '../render/text';
import type { Store } from '../store/store';
import { devicePreview } from '../ui/library';

/** Screen pixels per millimetre at 100 % zoom (CSS reference: 96 px per inch). */
const PX_PER_MM = 96 / 25.4;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;
/** Pointer travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
const AUTOSCROLL_EDGE = 40;

export type DropFailure = 'occupied' | 'out-of-bounds' | 'no-space';

export interface WorkspaceCallbacks {
  /** Adds a library preset at the first free slot (click without drag). */
  addPreset(preset: Preset): void;
  /** Commits a drop. Returns false when the model refused it. */
  dropNew(spec: NewDevice, rowId: string, position: number, insert: boolean): boolean;
  dropMove(deviceId: string, rowId: string, position: number, insert: boolean): boolean;
  dropFailed(reason: DropFailure): void;
  status(message: string): void;
  editDevice(deviceId: string): void;
  zoomChanged(zoom: number): void;
}

interface DropTarget {
  rowId: string;
  position: number;
  insert: boolean;
  /** null when the drop is valid. */
  failure: DropFailure | null;
}

interface DragState {
  spec: NewDevice;
  /** Set when moving an existing device. */
  deviceId?: string;
  preset?: Preset;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  shift: boolean;
  started: boolean;
  /** Pointer offset from the device's top-left corner, in mm. */
  grabX: number;
  grabY: number;
  target: DropTarget | null;
  floating: HTMLElement | null;
}

export class Workspace {
  readonly scroller: HTMLElement;
  private readonly store: Store;
  private readonly cb: WorkspaceCallbacks;
  private readonly canvas: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private layout: PanelLayout | null = null;
  private drag: DragState | null = null;
  private autoScrollFrame = 0;
  private _zoom = 1;

  constructor(host: HTMLElement, store: Store, cb: WorkspaceCallbacks) {
    this.store = store;
    this.cb = cb;
    this.scroller = host;
    this.canvas = document.createElement('div');
    this.canvas.className = 'canvas';
    host.appendChild(this.canvas);

    this.canvas.addEventListener('pointerdown', (e) => this.onCanvasPointerDown(e));
    this.canvas.addEventListener('dblclick', (e) => {
      const id = (e.target as Element).closest?.('[data-device-id]')?.getAttribute('data-device-id');
      if (id) this.cb.editDevice(id);
    });
    host.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault(); // Ctrl+wheel / pinch: zoom the drawing, not the page.
        this.setZoom(this._zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      },
      { passive: false },
    );
  }

  get zoom(): number {
    return this._zoom;
  }

  // ---------------------------------------------------------------------------
  // Rendering & zoom
  // ---------------------------------------------------------------------------

  render(): void {
    if (this.drag?.started) this.cancelDrag();
    const sel = this.store.selection;
    const { svg, layout } = renderPanel(this.store.project, {
      mode: 'editor',
      selectedDeviceId: sel.type === 'device' ? sel.id : undefined,
      selectedRowId: sel.type === 'row' ? sel.id : undefined,
    });
    this.canvas.innerHTML = svg;
    this.svg = this.canvas.querySelector('svg');
    this.layout = layout;
    this.applySize();
  }

  private applySize(): void {
    if (!this.svg || !this.layout) return;
    const k = PX_PER_MM * this._zoom;
    this.svg.setAttribute('width', n(this.layout.width * k));
    this.svg.setAttribute('height', n(this.layout.height * k));
  }

  /** Sets the zoom, keeping the point under (clientX, clientY) fixed when given. */
  setZoom(zoom: number, clientX?: number, clientY?: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    if (!this.svg || z === this._zoom) {
      this._zoom = z;
      return;
    }
    const rect = this.scroller.getBoundingClientRect();
    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;
    const before = this.toPanel(cx, cy);
    this._zoom = z;
    this.applySize();
    if (before) {
      const after = this.toPanel(cx, cy);
      if (after) {
        const k = PX_PER_MM * z;
        this.scroller.scrollLeft += (before.x - after.x) * k;
        this.scroller.scrollTop += (before.y - after.y) * k;
      }
    }
    this.cb.zoomChanged(z);
  }

  /** Zoom so that the whole panel is visible. */
  fit(): void {
    if (!this.layout) return;
    const padding = 64; // canvas padding on both sides
    const zx = (this.scroller.clientWidth - padding) / (this.layout.width * PX_PER_MM);
    const zy = (this.scroller.clientHeight - padding) / (this.layout.height * PX_PER_MM);
    this.setZoom(Math.min(zx, zy, 2.5));
  }

  /** Converts client (screen) coordinates into panel millimetres. */
  private toPanel(clientX: number, clientY: number): { x: number; y: number } | null {
    const ctm = this.svg?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // ---------------------------------------------------------------------------
  // Pointer handling
  // ---------------------------------------------------------------------------

  private onCanvasPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const deviceEl = target.closest('[data-device-id]');
    const rowEl = target.closest('[data-row-id]');
    if (deviceEl) {
      const id = deviceEl.getAttribute('data-device-id')!;
      const loc = findDevice(this.store.project, id);
      if (!loc) return;
      this.store.select({ type: 'device', id });
      const p = this.toPanel(e.clientX, e.clientY);
      const g = this.layout!.rows[loc.rowIndex];
      this.startDrag(e, {
        spec: { kind: loc.device.kind, width: loc.device.width, props: loc.device.props },
        deviceId: id,
        grabX: p ? p.x - (g.x + loc.device.position * MODULE_MM) : 0,
        grabY: p ? p.y - g.deviceY : DEVICE_H / 2,
      });
      e.preventDefault();
    } else if (rowEl) {
      this.store.select({ type: 'row', id: rowEl.getAttribute('data-row-id')! });
    } else {
      this.store.select({ type: 'none' });
    }
  }

  /** Called by the library when an item is pressed. */
  beginLibraryDrag(preset: Preset, e: PointerEvent): void {
    const spec = deviceFromPreset(preset);
    this.startDrag(e, { spec, preset, grabX: (spec.width * MODULE_MM) / 2, grabY: DEVICE_H / 2 });
    e.preventDefault();
  }

  private startDrag(e: PointerEvent, init: Pick<DragState, 'spec' | 'deviceId' | 'preset' | 'grabX' | 'grabY'>): void {
    this.cancelDrag();
    this.drag = {
      ...init,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      shift: e.shiftKey,
      started: false,
      target: null,
      floating: null,
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.shift = e.shiftKey;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.started = true;
      document.body.classList.add('dragging');
      if (d.deviceId)
        this.canvas.querySelector(`[data-device-id="${CSS.escape(d.deviceId)}"]`)?.classList.add('drag-source');
      this.autoScrollFrame = requestAnimationFrame(this.autoScroll);
    }
    this.updateDrag();
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.endDragListeners();
    if (!d.started) {
      // A simple click on a library item adds it at the first free slot.
      if (d.preset) this.cb.addPreset(d.preset);
      return;
    }
    const target = d.target;
    this.cleanupDragVisuals(d);
    if (!target) return; // dropped outside the panel: nothing happens
    if (target.failure) {
      this.cb.dropFailed(target.failure);
      return;
    }
    if (d.deviceId) this.cb.dropMove(d.deviceId, target.rowId, target.position, target.insert);
    else this.cb.dropNew(d.spec, target.rowId, target.position, target.insert);
  };

  private onCancel = (): void => this.cancelDrag();

  private onKey = (e: KeyboardEvent): void => {
    const d = this.drag;
    if (!d) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelDrag();
    } else if (e.key === 'Shift' && d.started) {
      d.shift = e.type === 'keydown';
      this.updateDrag();
    }
  };

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.endDragListeners();
    this.cleanupDragVisuals(d);
    this.cb.status('');
  }

  private endDragListeners(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    cancelAnimationFrame(this.autoScrollFrame);
  }

  private cleanupDragVisuals(d: DragState): void {
    d.floating?.remove();
    this.svg?.querySelector('.ghost')?.remove();
    this.canvas.querySelector('.drag-source')?.classList.remove('drag-source');
    document.body.classList.remove('dragging');
    this.drag = null;
  }

  /** Scrolls the workspace while the pointer is held near its edges during a drag. */
  private autoScroll = (): void => {
    const d = this.drag;
    if (!d?.started) return;
    const r = this.scroller.getBoundingClientRect();
    const inside = d.lastX >= r.left && d.lastX <= r.right && d.lastY >= r.top && d.lastY <= r.bottom;
    if (inside) {
      const speed = (dist: number) => (dist < AUTOSCROLL_EDGE ? Math.ceil((AUTOSCROLL_EDGE - dist) / 4) : 0);
      const dx = speed(r.right - d.lastX) - speed(d.lastX - r.left);
      const dy = speed(r.bottom - d.lastY) - speed(d.lastY - r.top);
      if (dx || dy) {
        this.scroller.scrollLeft += dx;
        this.scroller.scrollTop += dy;
        this.updateDrag();
      }
    }
    this.autoScrollFrame = requestAnimationFrame(this.autoScroll);
  };

  // ---------------------------------------------------------------------------
  // Drop target computation & feedback
  // ---------------------------------------------------------------------------

  private updateDrag(): void {
    const d = this.drag;
    if (!d) return;
    d.target = this.computeTarget(d);
    this.drawGhost(d);
  }

  private computeTarget(d: DragState): DropTarget | null {
    if (!this.layout) return null;
    const r = this.scroller.getBoundingClientRect();
    if (d.lastX < r.left || d.lastX > r.right || d.lastY < r.top || d.lastY > r.bottom) return null;
    const p = this.toPanel(d.lastX, d.lastY);
    if (!p) return null;

    // Nearest rail (vertically), within a tolerance around the panel.
    const centerY = p.y - d.grabY + DEVICE_H / 2;
    let index = -1;
    let bestDist = Infinity;
    this.layout.rows.forEach((g, i) => {
      const dist = Math.abs(centerY - (g.deviceY + DEVICE_H / 2));
      if (dist < bestDist) [index, bestDist] = [i, dist];
    });
    if (index < 0) return null;
    const g = this.layout.rows[index];
    const { panel } = this.layout;
    const tolerance = 30;
    if (
      p.x < panel.x - tolerance ||
      p.x > panel.x + panel.w + tolerance ||
      p.y < panel.y - tolerance ||
      p.y > panel.y + panel.h + tolerance
    )
      return null;

    const row = this.store.project.rows[index];
    const width = d.spec.width;
    const rel = (p.x - d.grabX - g.x) / MODULE_MM;
    const maxPos = Math.max(0, row.modules - width);
    const clamp = (v: number) => Math.min(maxPos, Math.max(0, v));
    const insert = d.shift;

    if (width > row.modules) return { rowId: row.id, position: 0, insert, failure: 'out-of-bounds' };

    // Whole-module snapping first; half-module positions only when they are the
    // only valid option nearby (or the device itself is half-module wide).
    const whole = clamp(Math.round(rel));
    const half = clamp(roundToStep(rel));
    const valid = (pos: number) =>
      insert ? planInsert(row, pos, width, d.deviceId) !== null : canPlace(row, pos, width, d.deviceId);
    const position = valid(whole) && (Number.isInteger(width) || !valid(half)) ? whole : valid(half) ? half : whole;

    let failure: DropFailure | null = null;
    if (insert) {
      if (!planInsert(row, position, width, d.deviceId)) failure = 'no-space';
    } else {
      const check = checkPlacement(row, position, width, d.deviceId);
      if (!check.ok) failure = check.reason;
    }
    return { rowId: row.id, position, insert, failure };
  }

  private drawGhost(d: DragState): void {
    this.svg?.querySelector('.ghost')?.remove();
    const target = d.target;
    if (!target || !this.svg || !this.layout) {
      this.showFloating(d);
      this.cb.status(t('drag.outside'));
      return;
    }
    d.floating?.remove();
    d.floating = null;
    const index = this.store.project.rows.findIndex((r) => r.id === target.rowId);
    const g = this.layout.rows[index];
    const row: Row = this.store.project.rows[index];
    const x = g.x + target.position * MODULE_MM;
    const w = d.spec.width * MODULE_MM;
    const state = target.failure ? 'invalid' : target.insert ? 'insert' : 'valid';
    const marker = target.insert
      ? `<line class="insert-marker" x1="${n(x - 0.6)}" y1="${n(g.deviceY - 4)}" x2="${n(x - 0.6)}" y2="${n(g.deviceY + DEVICE_H + 4)}"/>`
      : '';
    const html =
      `<g class="ghost ghost-${state}" font-family="${FONT_FAMILY}" pointer-events="none">` +
      `<g transform="translate(${n(x)} ${n(g.deviceY)})" opacity="0.8">${drawDevice(d.spec, this.store.project.settings.deviceStyle)}</g>` +
      `<rect class="ghost-outline" x="${n(x - 0.6)}" y="${n(g.deviceY - 0.6)}" width="${n(w + 1.2)}" height="${n(DEVICE_H + 1.2)}" rx="1.2"/>${marker}</g>`;
    this.svg.insertAdjacentHTML('beforeend', html);

    // Human-friendly module range, 1-based: a 2-module device at position 2 covers "3–4".
    const first = target.position + 1;
    const last = target.position + d.spec.width;
    const range = d.spec.width <= 1 ? fmt(first) : `${fmt(first)}–${fmt(last)}`;
    const where = t('drag.where', { row: row.name, range });
    this.cb.status(
      target.failure
        ? `${where} — ${t(`error.${target.failure}`)}`
        : `${where}${target.insert ? ` — ${t('drag.insert')}` : ` — ${t('drag.shiftHint')}`}`,
    );
  }

  /** HTML ghost following the pointer while it is outside the panel (e.g. still over the library). */
  private showFloating(d: DragState): void {
    if (!d.started) return;
    if (!d.floating) {
      d.floating = document.createElement('div');
      d.floating.className = 'floating-ghost';
      d.floating.appendChild(devicePreview(d.spec, this.store.project.settings.deviceStyle, PX_PER_MM * this._zoom));
      document.body.appendChild(d.floating);
    }
    const k = PX_PER_MM * this._zoom;
    d.floating.style.transform = `translate(${d.lastX - d.grabX * k}px, ${d.lastY - d.grabY * k}px)`;
  }

  /** Scrolls so the given device is visible. */
  reveal(deviceId: string): void {
    this.canvas
      .querySelector(`[data-device-id="${CSS.escape(deviceId)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
