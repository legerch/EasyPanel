/**
 * Prepares and publishes a release: checks, version bump, CHANGELOG, commit, tag and push.
 * Pushing the tag starts .github/workflows/release.yml (GitHub release + GitHub Pages deployment).
 *
 *   npm run release -- <major|minor|patch|x.y.z> [--dry-run] [--yes]
 *
 * --dry-run runs every check and shows what would change, without modifying anything.
 * --yes     skips the confirmation before pushing.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
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
} from './release-lib.ts';

const BRANCH = 'master';
const REMOTE = 'origin';
const CHANGELOG = 'CHANGELOG.md';
const TYPES = 'src/model/types.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');
const positional = args.filter((a) => !a.startsWith('--'));
if (positional.length !== 1 || args.some((a) => a.startsWith('--') && a !== '--dry-run' && a !== '--yes')) {
  console.error('Usage: npm run release -- <major|minor|patch|x.y.z> [--dry-run] [--yes]');
  process.exit(2);
}

const git = (...a: string[]): string =>
  execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a: string[]): string | null => {
  try {
    return git(...a);
  } catch {
    return null;
  }
};
/** Runs an npm script with live output. Arguments are fixed strings, so a shell command line is safe. */
const npm = (command: string): boolean => spawnSync(`npm ${command}`, { stdio: 'inherit', shell: true }).status === 0;

const problems: string[] = [];
const ok = (message: string) => console.log(`  [ok]   ${message}`);
const fail = (message: string) => {
  problems.push(message);
  console.log(`  [FAIL] ${message}`);
};
const check = (condition: boolean, okMessage: string, failMessage: string) =>
  condition ? ok(okMessage) : fail(failMessage);

console.log(dryRun ? '\nRelease dry run: nothing will be modified.\n' : '\nPreparing release.\n');

// --- Repository state -------------------------------------------------------------------
console.log('Repository');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
check(branch === BRANCH, `on ${BRANCH}`, `on branch "${branch}", releases are made from ${BRANCH}`);
const dirty = git('status', '--porcelain');
check(dirty === '', 'no uncommitted changes', `uncommitted changes:\n${dirty.replace(/^/gm, '           ')}`);
const fetched = tryGit('fetch', '--quiet', '--tags', REMOTE, BRANCH) !== null;
if (!fetched) fail(`cannot fetch ${REMOTE}`);
else {
  const local = git('rev-parse', 'HEAD');
  const remote = git('rev-parse', `${REMOTE}/${BRANCH}`);
  check(
    local === remote,
    `up to date with ${REMOTE}/${BRANCH}`,
    `${BRANCH} differs from ${REMOTE}/${BRANCH} (pull or push first)`,
  );
}
const repoUrl = repoUrlFromRemote(tryGit('remote', 'get-url', REMOTE) ?? '');
if (!repoUrl) fail(`remote "${REMOTE}" is not a GitHub repository`);

// --- Version -----------------------------------------------------------------------------
console.log('\nVersion');
const previous = latestRelease(git('tag', '--list', 'v*').split('\n').filter(Boolean));
let version: string | null = null;
try {
  version = nextVersion(previous, positional[0]);
  ok(`${previous ? `last release ${previous}` : 'first release'} -> ${version}`);
} catch (e) {
  fail((e as Error).message);
}
if (version)
  check(
    tryGit('rev-parse', '--verify', '--quiet', `refs/tags/v${version}`) === null,
    `tag v${version} is free`,
    `tag v${version} already exists`,
  );

// --- Changelog and project format --------------------------------------------------------
console.log('\nChangelog');
const changelog = readFileSync(CHANGELOG, 'utf8');
const unreleased = changelogSection(changelog, 'Unreleased');
check(hasEntries(unreleased), '[Unreleased] lists changes', '[Unreleased] section is missing or lists no change');

const currentFormat = readFormatVersion(readFileSync(TYPES, 'utf8'));
const previousTypes = previous ? tryGit('show', `v${previous}:${TYPES}`) : null;
const previousFormat = previousTypes ? readFormatVersion(previousTypes) : null;
if (!currentFormat) fail(`cannot read FORMAT_VERSION in ${TYPES}`);
else if (version) {
  const formatErrors = checkFormatChange({
    previousFormat,
    currentFormat,
    previousVersion: previous,
    nextVersion: version,
    unreleased: unreleased ?? '',
  });
  formatErrors.forEach(fail);
  if (formatErrors.length === 0) {
    ok(
      previousFormat && previousFormat !== currentFormat
        ? `project format ${previousFormat} -> ${currentFormat}, documented`
        : `project format ${currentFormat}`,
    );
  }
}

// --- Quality gates -----------------------------------------------------------------------
console.log('\nChecks (typecheck, lint, formatting, tests, build)\n');
check(
  npm('run typecheck') && npm('run lint') && npm('run format:check') && npm('test') && npm('run build'),
  'typecheck, lint, formatting, tests and build pass',
  'typecheck, lint, formatting, tests or build failed',
);

// --- Plan --------------------------------------------------------------------------------
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s) to fix before releasing:`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
const v = version!;
const tag = `v${v}`;
const date = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
const updatedChangelog = releaseChangelog(changelog, { version: v, date, repoUrl: repoUrl!, previous });

console.log(`\nRelease notes for ${tag}:\n`);
console.log((unreleased ?? '').replace(/^/gm, '  | '));
console.log(`\nSteps${dryRun ? ' (not run: dry run)' : ''}:`);
console.log(`  1. package.json, package-lock.json: version ${v}`);
console.log(`  2. ${CHANGELOG}: "## [Unreleased]" -> "## [${v}] - ${date}", new empty [Unreleased], comparison links`);
console.log(`  3. git commit "[release] EasyPanel ${v}" and annotated tag ${tag}`);
console.log(`  4. git push --atomic ${REMOTE} ${BRANCH} ${tag}`);
console.log(`  5. GitHub Actions publishes the release and deploys ${pagesUrl(repoUrl!)}`);

if (dryRun) {
  console.log('\nDry run complete: everything is ready, nothing was modified.');
  process.exit(0);
}

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nRelease ${tag} and push it? [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Cancelled: nothing was modified.');
    process.exit(1);
  }
}

// --- Release -----------------------------------------------------------------------------
if (!npm(`version ${v} --no-git-tag-version --allow-same-version`)) process.exit(1);
writeFileSync(CHANGELOG, updatedChangelog);
git('add', 'package.json', 'package-lock.json', CHANGELOG);
git('commit', '--quiet', '-m', `[release] EasyPanel ${v}`);
git('tag', '-a', tag, '-m', `EasyPanel ${v}`);
console.log(`\nCommitted and tagged ${tag}. Pushing...`);
execFileSync('git', ['push', '--atomic', REMOTE, BRANCH, tag], { stdio: 'inherit' });
console.log(`\nDone. Follow the publication in ${repoUrl}/actions`);
