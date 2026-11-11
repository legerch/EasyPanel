/** Physical dimensions shared by all renderers (millimetres). */
import type { DeviceKind, DeviceProps } from '../model/types';

/** Width of one DIN module, in mm. */
export const MODULE_MM = 18;
/** Visible height of a device front face (through the panel cover), in mm. */
export const DEVICE_H = 45;

/** What a drawing style needs to draw a device. */
export interface DrawableDevice {
  kind: DeviceKind;
  width: number;
  props: DeviceProps;
}
