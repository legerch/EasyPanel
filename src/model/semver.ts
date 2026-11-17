/**
 * Minimal semantic version handling (https://semver.org) for project files.
 *
 * Project format policy:
 *   MAJOR – breaking change: older files need a migration, newer files are refused.
 *   MINOR – backward-compatible addition (new optional field…): files of a newer
 *           minor can still be opened, but fields unknown to this app are dropped.
 *   PATCH – clarification or fix with no structural change.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.+-]*)?$/;

/** Parses a version. Pre-release/build suffixes are accepted and ignored. */
export function parseSemVer(value: unknown): SemVer | null {
  if (typeof value !== 'string') return null;
  const m = SEMVER_RE.exec(value.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

export function formatSemVer(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareSemVer(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
