/**
 * Prints the CHANGELOG section of a version, used as the GitHub release notes.
 *
 *   node scripts/release-notes.ts <version> [--or-unreleased]
 *
 * --or-unreleased falls back to the [Unreleased] section (dry runs before the version exists).
 */
import { readFileSync } from 'node:fs';
import { changelogSection, hasEntries } from './release-lib.ts';

const [version, flag] = process.argv.slice(2);
if (!version || (flag !== undefined && flag !== '--or-unreleased')) {
  console.error('Usage: node scripts/release-notes.ts <version> [--or-unreleased]');
  process.exit(2);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
let notes = changelogSection(changelog, version);
if (!hasEntries(notes) && flag === '--or-unreleased') notes = changelogSection(changelog, 'Unreleased');
if (!hasEntries(notes)) {
  console.error(`CHANGELOG.md has no entries for ${version}.`);
  process.exit(1);
}
console.log(notes);
