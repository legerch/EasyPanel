/**
 * SVG drawings of modular devices, in local coordinates (millimetres, origin
 * at the top-left corner of the device front face).
 *
 * Several drawing styles exist (see `DeviceStyle`); each lives in
 * `render/styles/` and must handle every `DeviceKind` (falling back to a
 * generic front is fine).
 */
import type { DeviceStyle } from '../model/types';
import type { DrawableDevice } from './geometry';
import { drawClassic } from './styles/classic';
import { drawModern } from './styles/modern';

export { DEVICE_H, MODULE_MM, type DrawableDevice } from './geometry';

export function drawDevice(d: DrawableDevice, style: DeviceStyle): string {
  return style === 'classic' ? drawClassic(d) : drawModern(d);
}
