/**
 * Derives the texts printed on a device from its properties.
 * Shared by the renderer, the library palette and summaries so the
 * "C20" / "30mA A" conventions live in exactly one place.
 */
import type { Device, DeviceKind, DeviceProps } from './types';

const hasValue = (s: string | undefined): s is string => s !== undefined && s.trim() !== '';

/** Formats a current rating: 20 → "20A", 4.5 → "4.5A". */
export function formatRating(rating: number | undefined): string {
  return rating === undefined || !Number.isFinite(rating) ? '' : `${rating}A`;
}

/** Large text on the front of the device (e.g. "C20", "63A"). */
export function mainText(kind: DeviceKind, props: DeviceProps): string {
  if (hasValue(props.text)) return props.text.trim();
  switch (kind) {
    case 'breaker':
    case 'rcbo':
      if (props.rating === undefined) return props.curve ?? '';
      return `${props.curve ?? ''}${props.rating}`;
    case 'rcd':
    case 'main-switch':
    case 'fuse':
    case 'contactor':
    case 'impulse-relay':
      return formatRating(props.rating);
    default:
      return '';
  }
}

/** Residual current characteristics, e.g. "30mA A". Empty for devices without differential function. */
export function differentialText(props: DeviceProps): string {
  const parts: string[] = [];
  if (props.sensitivity !== undefined && Number.isFinite(props.sensitivity)) parts.push(`${props.sensitivity}mA`);
  if (props.diffType) parts.push(props.diffType);
  return parts.join(' ');
}

/** Small text at the bottom of the device. */
export function bottomText(kind: DeviceKind, props: DeviceProps): string {
  if (hasValue(props.secondary)) return props.secondary.trim();
  if (kind === 'rcd' || kind === 'rcbo') return differentialText(props);
  return '';
}

/** Short one-line summary used in lists and tooltips. */
export function summary(device: Device): string {
  return [mainText(device.kind, device.props), bottomText(device.kind, device.props)].filter(Boolean).join(' ');
}
