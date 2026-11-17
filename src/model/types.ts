/**
 * EasyPanel data model.
 *
 * Everything in a project is plain, JSON-serialisable data. Positions and
 * widths are expressed in DIN modules (1 module = 18 mm); all graphical
 * dimensions are derived by the renderer, never stored.
 */

/**
 * Version of the project file format (semantic versioning, see `semver.ts`).
 *   - breaking change   → bump MAJOR and add a migration in `migrate.ts`;
 *   - new optional data → bump MINOR;
 *   - no structural change → bump PATCH.
 * This is independent from the application version (package.json).
 */
export const FORMAT_VERSION = '1.0.0';
export const FORMAT_ID = 'easypanel';

/** Identifies the visual/behavioural family of a device. The catalog maps kinds to defaults and editable fields. */
export type DeviceKind =
  | 'rcd' // Interrupteur différentiel (RCCB)
  | 'breaker' // Disjoncteur
  | 'rcbo' // Disjoncteur différentiel
  | 'main-switch' // Interrupteur-sectionneur / disjoncteur de branchement modulaire
  | 'fuse' // Porte-fusible
  | 'contactor' // Contacteur (incl. jour/nuit)
  | 'impulse-relay' // Télérupteur
  | 'timer' // Minuterie / horloge
  | 'spd' // Parafoudre
  | 'outlet' // Prise modulaire
  | 'meter' // Compteur d'énergie
  | 'indicator' // Voyant
  | 'blank' // Obturateur
  | 'generic'; // Any other modular device

export type Curve = 'B' | 'C' | 'D';
export type DiffType = 'AC' | 'A' | 'F' | 'B';
export type Poles = '1P' | '1P+N' | '2P' | '3P' | '3P+N' | '4P';

/**
 * Editable properties of a device. Every field is optional: which ones are
 * meaningful depends on the device kind (see `catalog.ts`). Free text is
 * always allowed – users are never limited to manufacturer references.
 */
export interface DeviceProps {
  /** Designation / reference, e.g. "Q3" or "ID1". Shown small on the device. */
  name?: string;
  /** Rated current in amperes. */
  rating?: number;
  curve?: Curve;
  poles?: Poles;
  /** Breaking capacity, free text such as "3kA", "4.5kA", "6000". */
  breakingCapacity?: string;
  diffType?: DiffType;
  /** Residual current sensitivity in mA (30, 300, 500…). */
  sensitivity?: number;
  /** Overrides the automatic main text (e.g. "C20") displayed on the device. */
  text?: string;
  /** Optional secondary text displayed at the bottom of the device. */
  secondary?: string;
  /** Circuit description shown in the label strip above the device. */
  label?: string;
  /** Body colour override (CSS colour). */
  color?: string;
  /** Handle / accent colour override (CSS colour). */
  accentColor?: string;
}

export interface Device {
  id: string;
  kind: DeviceKind;
  /** Offset of the device's left edge from the start of the rail, in modules (multiple of 0.5). */
  position: number;
  /** Width in DIN modules (multiple of 0.5, ≥ 0.5). */
  width: number;
  props: DeviceProps;
}

export interface Row {
  id: string;
  name: string;
  /** Number of modules available on this rail. */
  modules: number;
  devices: Device[];
}

export type LabelOrientation = 'horizontal' | 'vertical';

/** Visual style of device fronts: "modern" (realistic, current hardware) or "classic" (simplified). */
export type DeviceStyle = 'modern' | 'classic';
export const DEVICE_STYLES: DeviceStyle[] = ['modern', 'classic'];

export interface PanelSettings {
  /** Device drawing style. */
  deviceStyle: DeviceStyle;
  /** Panel (enclosure) background colour. */
  background: string;
  /** Vertical gap between two rows, in mm. */
  rowSpacing: number;
  /** Show the circuit label strip above each rail. */
  showLabels: boolean;
  labelOrientation: LabelOrientation;
  /** Height of the label strip, in mm. */
  labelHeight: number;
  /** Render empty module slots as grey blank covers in exports. */
  fillEmptyWithBlanks: boolean;
  /** Show row names on the left side of the panel. */
  showRowNames: boolean;
  /** Show the project title block in exports. */
  showTitle: boolean;
}

export interface ProjectMeta {
  name: string;
  description: string;
  author: string;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Application that last wrote the file (diagnostics only, never used for loading decisions). */
export interface Generator {
  name: string;
  /** Application semantic version, from package.json. */
  version: string;
}

export interface Project {
  format: typeof FORMAT_ID;
  /** Project format semantic version, e.g. "1.0.0". */
  formatVersion: string;
  generator: Generator;
  id: string;
  meta: ProjectMeta;
  settings: PanelSettings;
  rows: Row[];
  /** Free-form annotations printed below the panel. */
  notes: string;
}
