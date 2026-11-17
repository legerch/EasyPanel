import { describe, expect, it } from 'vitest';
import {
  changelogSection,
  checkFormatChange,
  hasEntries,
  latestRelease,
  nextVersion,
  pagesUrl,
  readFormatVersion,
  releaseChangelog,
  repoUrlFromRemote,
} from '../scripts/release-lib.ts';

const REPO = 'https://github.com/owner/EasyPanel';

const changelog = (sections: string, refs = '') =>
  `# Changelog\n\nIntro.\n\n## [Unreleased]\n\n${sections}${refs ? `\n\n${refs}` : ''}\n`;

describe('release versions', () => {
  it('finds the latest release tag, ignoring other tags', () => {
    expect(latestRelease(['v1.0.0', 'v1.10.0', 'v1.9.3', 'nightly', 'v2.0.0-beta.1'])).toBe('1.10.0');
    expect(latestRelease([])).toBeNull();
  });

  it('bumps the last release', () => {
    expect(nextVersion('1.4.2', 'patch')).toBe('1.4.3');
    expect(nextVersion('1.4.2', 'minor')).toBe('1.5.0');
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0');
  });

  it('accepts an explicit version greater than the last release', () => {
    expect(nextVersion(null, '1.0.0')).toBe('1.0.0');
    expect(nextVersion('1.4.2', '1.6.0')).toBe('1.6.0');
    expect(() => nextVersion('1.4.2', '1.4.2')).toThrow(/greater/);
    expect(() => nextVersion('1.4.2', '1.3.9')).toThrow(/greater/);
  });

  it('requires the first version to be explicit and rejects invalid requests', () => {
    expect(() => nextVersion(null, 'minor')).toThrow(/explicitly/);
    for (const bad of ['v1.0.0', '1.0', '1.0.0-beta.1', 'big']) expect(() => nextVersion('1.0.0', bad)).toThrow();
  });
});

describe('changelog', () => {
  const sample = changelog(
    '### Added\n\n- New thing.\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- First.',
    `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0`,
  );

  it('extracts a section without the link references', () => {
    expect(changelogSection(sample, 'Unreleased')).toBe('### Added\n\n- New thing.');
    expect(changelogSection(sample, '1.0.0')).toBe('### Added\n\n- First.');
    expect(changelogSection(sample, '9.9.9')).toBeNull();
  });

  it('detects an empty Unreleased section', () => {
    expect(hasEntries(changelogSection(changelog('### Added\n'), 'Unreleased'))).toBe(false);
    expect(hasEntries(null)).toBe(false);
    expect(hasEntries('- Fix.')).toBe(true);
  });

  it('releases the first version', () => {
    const out = releaseChangelog(changelog('### Added\n\n- First.'), {
      version: '1.0.0',
      date: '2026-11-20',
      repoUrl: REPO,
      previous: null,
    });
    expect(out).toBe(
      `# Changelog\n\nIntro.\n\n## [Unreleased]\n\n## [1.0.0] - 2026-11-20\n\n### Added\n\n- First.\n\n` +
        `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`,
    );
    expect(changelogSection(out, '1.0.0')).toBe('### Added\n\n- First.');
    expect(changelogSection(out, 'Unreleased')).toBe('');
  });

  it('releases a later version and keeps older links, newest first', () => {
    const out = releaseChangelog(sample, { version: '1.1.0', date: '2026-12-01', repoUrl: REPO, previous: '1.0.0' });
    expect(out).toContain(
      '## [Unreleased]\n\n## [1.1.0] - 2026-12-01\n\n### Added\n\n- New thing.\n\n## [1.0.0] - 2026-01-01',
    );
    expect(
      out.endsWith(
        `[Unreleased]: ${REPO}/compare/v1.1.0...HEAD\n[1.1.0]: ${REPO}/compare/v1.0.0...v1.1.0\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`,
      ),
    ).toBe(true);
  });

  it('handles Windows line endings and refuses a changelog without Unreleased', () => {
    expect(changelogSection(sample.replace(/\n/g, '\r\n'), 'Unreleased')).toBe('### Added\n\n- New thing.');
    expect(() =>
      releaseChangelog('# Changelog\n', { version: '1.0.0', date: 'd', repoUrl: REPO, previous: null }),
    ).toThrow(/Unreleased/);
  });
});

describe('project format checks', () => {
  const base = { previousFormat: '1.0.0', previousVersion: '1.2.0', nextVersion: '1.3.0', unreleased: '- Something.' };

  it('accepts an unchanged format and the first release', () => {
    expect(checkFormatChange({ ...base, currentFormat: '1.0.0' })).toEqual([]);
    expect(checkFormatChange({ ...base, previousFormat: null, previousVersion: null, currentFormat: '1.0.0' })).toEqual(
      [],
    );
  });

  it('requires a changed format to be documented', () => {
    expect(checkFormatChange({ ...base, currentFormat: '1.1.0' })).toHaveLength(1);
    expect(
      checkFormatChange({ ...base, currentFormat: '1.1.0', unreleased: '- Project format **1.1.0**: adds `x`.' }),
    ).toEqual([]);
  });

  it('requires an app MAJOR for a format MAJOR, and refuses going backwards', () => {
    const unreleased = '- Project format **2.0.0**.';
    expect(checkFormatChange({ ...base, currentFormat: '2.0.0', unreleased })[0]).toMatch(/MAJOR/);
    expect(checkFormatChange({ ...base, currentFormat: '2.0.0', unreleased, nextVersion: '2.0.0' })).toEqual([]);
    expect(checkFormatChange({ ...base, currentFormat: '0.9.0' })[0]).toMatch(/backwards/);
  });

  it('requires at least an app MINOR for a format MINOR; a format PATCH fits any release', () => {
    const minor = { ...base, currentFormat: '1.1.0', unreleased: '- Project format **1.1.0**.' };
    expect(checkFormatChange({ ...minor, nextVersion: '1.2.1' })[0]).toMatch(/at least a MINOR/);
    expect(checkFormatChange(minor)).toEqual([]);
    expect(
      checkFormatChange({
        ...base,
        currentFormat: '1.0.1',
        unreleased: '- Project format **1.0.1**.',
        nextVersion: '1.2.1',
      }),
    ).toEqual([]);
  });

  it('reads FORMAT_VERSION from the types source', () => {
    expect(readFormatVersion("export const FORMAT_VERSION = '1.2.3';")).toBe('1.2.3');
    expect(readFormatVersion('nothing')).toBeNull();
  });
});

describe('GitHub URLs', () => {
  it('derives the repository and Pages URLs from the remote', () => {
    expect(repoUrlFromRemote('git@github.com:owner/EasyPanel.git')).toBe(REPO);
    expect(repoUrlFromRemote('https://github.com/owner/EasyPanel.git')).toBe(REPO);
    expect(repoUrlFromRemote('https://gitlab.com/owner/EasyPanel.git')).toBeNull();
    expect(pagesUrl('https://github.com/Owner/EasyPanel')).toBe('https://owner.github.io/EasyPanel/');
  });
});
