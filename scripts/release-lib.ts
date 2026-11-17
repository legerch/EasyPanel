/**
 * Pure release helpers: version computation, CHANGELOG handling and format checks.
 * No I/O here, so everything is unit-tested (tests/release.test.ts). The CLI lives in release.ts.
 */
import { compareSemVer, formatSemVer, parseSemVer, type SemVer } from '../src/model/semver.ts';

export const BUMPS = ['major', 'minor', 'patch'] as const;
export type Bump = (typeof BUMPS)[number];

const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/;
const UNRELEASED_HEADING = '## [Unreleased]';
/** Link reference definition, e.g. `[1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0`. */
const LINK_REF = /^\[([^\]]+)\]:\s*\S+\s*$/;

/** Parses a plain `x.y.z` version (no pre-release or build suffix). */
export function parsePlainVersion(value: string): SemVer | null {
  return PLAIN_SEMVER.test(value) ? parseSemVer(value) : null;
}

/** Version of a release tag (`v1.2.3`), or null when the tag is not a release tag. */
export function tagVersion(tag: string): string | null {
  return tag.startsWith('v') && parsePlainVersion(tag.slice(1)) ? tag.slice(1) : null;
}

/** Most recent release version among git tags, or null when nothing was released yet. */
export function latestRelease(tags: string[]): string | null {
  const versions = tags.map(tagVersion).filter((v): v is string => v !== null);
  versions.sort((a, b) => compareSemVer(parseSemVer(b)!, parseSemVer(a)!));
  return versions[0] ?? null;
}

/**
 * Version of the next release. `request` is a bump type or an explicit `x.y.z`.
 * The first release (no previous one) must be given explicitly.
 */
export function nextVersion(previous: string | null, request: string): string {
  if ((BUMPS as readonly string[]).includes(request)) {
    if (!previous)
      throw new Error(
        `Nothing was released yet: give the first version explicitly (e.g. "1.0.0") instead of "${request}".`,
      );
    const p = parseSemVer(previous)!;
    if (request === 'major') return formatSemVer({ major: p.major + 1, minor: 0, patch: 0 });
    if (request === 'minor') return formatSemVer({ major: p.major, minor: p.minor + 1, patch: 0 });
    return formatSemVer({ major: p.major, minor: p.minor, patch: p.patch + 1 });
  }
  const v = parsePlainVersion(request);
  if (!v) throw new Error(`"${request}" is neither major, minor, patch nor a version like 1.2.3.`);
  if (previous && compareSemVer(v, parseSemVer(previous)!) <= 0) {
    throw new Error(`Version ${request} must be greater than the last release (${previous}).`);
  }
  return formatSemVer(v);
}

/** Splits the changelog into its body and the trailing block of link reference definitions. */
function splitLinkRefs(changelog: string): { body: string[]; refs: Map<string, string> } {
  const lines = changelog.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  let start = lines.length;
  while (start > 0 && (LINK_REF.test(lines[start - 1]) || (lines[start - 1].trim() === '' && start < lines.length)))
    start--;
  const refs = new Map<string, string>();
  for (const line of lines.slice(start)) {
    const m = LINK_REF.exec(line);
    if (m) refs.set(m[1], line);
  }
  return { body: lines.slice(0, start), refs };
}

/** Text of the `## [name]` section (without its heading), or null when the section does not exist. */
export function changelogSection(changelog: string, name: string): string | null {
  const { body } = splitLinkRefs(changelog);
  const start = body.findIndex((l) => l === `## [${name}]` || l.startsWith(`## [${name}] `));
  if (start < 0) return null;
  let end = body.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = body.length;
  return body
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

/** True when a changelog section lists at least one change (a `- ` bullet). */
export function hasEntries(section: string | null): boolean {
  return section !== null && /^\s*- \S/m.test(section);
}

/**
 * Turns `## [Unreleased]` into `## [version] - date`, opens a new empty Unreleased section and
 * updates the comparison links at the bottom of the file.
 */
export function releaseChangelog(
  changelog: string,
  o: { version: string; date: string; repoUrl: string; previous: string | null },
): string {
  const { body, refs } = splitLinkRefs(changelog);
  const index = body.indexOf(UNRELEASED_HEADING);
  if (index < 0) throw new Error(`CHANGELOG.md has no "${UNRELEASED_HEADING}" section.`);
  body.splice(index, 1, UNRELEASED_HEADING, '', `## [${o.version}] - ${o.date}`);

  refs.delete('Unreleased');
  refs.delete(o.version);
  const newRefs = [
    `[Unreleased]: ${o.repoUrl}/compare/v${o.version}...HEAD`,
    o.previous
      ? `[${o.version}]: ${o.repoUrl}/compare/v${o.previous}...v${o.version}`
      : `[${o.version}]: ${o.repoUrl}/releases/tag/v${o.version}`,
    ...refs.values(),
  ];
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  return `${body.join('\n')}\n\n${newRefs.join('\n')}\n`;
}

/**
 * Checks the project format version against the previous release. A format change must be
 * mentioned in the changelog as "format **x.y.z**", and a new format MAJOR needs an app MAJOR.
 */
export function checkFormatChange(o: {
  previousFormat: string | null;
  currentFormat: string;
  previousVersion: string | null;
  nextVersion: string;
  unreleased: string;
}): string[] {
  if (!o.previousFormat || !o.previousVersion) return [];
  const before = parseSemVer(o.previousFormat)!;
  const now = parseSemVer(o.currentFormat);
  if (!now) return [`FORMAT_VERSION "${o.currentFormat}" is not a valid version.`];
  const diff = compareSemVer(now, before);
  if (diff === 0) return [];
  if (diff < 0) return [`The project format went backwards (${o.previousFormat} -> ${o.currentFormat}).`];

  const errors: string[] = [];
  const mention = new RegExp(`format \\*\\*${o.currentFormat.replace(/\./g, '\\.')}\\*\\*`, 'i');
  if (!mention.test(o.unreleased)) {
    errors.push(
      `The project format changed (${o.previousFormat} -> ${o.currentFormat}) but the [Unreleased] changelog does not mention "Project format **${o.currentFormat}**".`,
    );
  }
  const next = parseSemVer(o.nextVersion)!;
  const prev = parseSemVer(o.previousVersion)!;
  if (now.major > before.major && next.major === prev.major) {
    errors.push(`The project format has a new MAJOR version (${o.currentFormat}): the app needs a MAJOR release too.`);
  } else if (
    now.major === before.major &&
    now.minor > before.minor &&
    next.major === prev.major &&
    next.minor === prev.minor
  ) {
    errors.push(
      `The project format has a new MINOR version (${o.currentFormat}): the app needs at least a MINOR release.`,
    );
  }
  return errors;
}

/** Reads `FORMAT_VERSION` from the source of src/model/types.ts. */
export function readFormatVersion(typesSource: string): string | null {
  return /export const FORMAT_VERSION = '([^']+)'/.exec(typesSource)?.[1] ?? null;
}

/** GitHub web URL from a git remote (`git@github.com:owner/repo.git` or `https://github.com/owner/repo.git`). */
export function repoUrlFromRemote(remote: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

/** GitHub Pages URL of a repository (`https://github.com/owner/repo` -> `https://owner.github.io/repo/`). */
export function pagesUrl(repoUrl: string): string {
  const [owner, repo] = repoUrl.replace('https://github.com/', '').split('/');
  return `https://${owner.toLowerCase()}.github.io/${repo}/`;
}
