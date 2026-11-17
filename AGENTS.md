# Agent guidelines

## Language

- All code, identifiers, code comments, commit messages and documentation (README,
  CHANGELOG, docs/) must be written in **English**, even when the conversation with the
  user happens in another language.
- The only exception is user-facing interface text, which is translated: French strings
  belong in `src/i18n/fr.ts`, next to their English counterparts in `src/i18n/en.ts`.

## Changelog and versions

- List every user-visible change under `## [Unreleased]` in `CHANGELOG.md`, in the existing
  Keep a Changelog sections (Added, Changed, Fixed…). Never edit a released section.
- Never change the application version or create tags yourself: releases are made only with
  `npm run release` (see "Releasing" in the README), when the user asks for one.
- A change to the project file structure bumps `FORMAT_VERSION` in the same change,
  following "Versioning" in the README, and is noted in the changelog as
  `Project format **x.y.z**`.

## Tooling versions

- Keep the tooling current: Node.js (current LTS), TypeScript, Vite, Vitest, `@types/*`,
  GitHub Actions and any new dependency use their **latest stable major version**, not the
  minimum that happens to work.
- Look the versions up (`npm view <package> version`, nodejs.org, the action's releases page)
  instead of relying on memory, which may be outdated.
- The Node.js version lives in one place: `engines.node` in `package.json`. The CI workflows
  read it from there (`node-version-file`), and the README states the same requirement.
- When upgrading a major version, read its release notes for breaking changes, then run the
  typecheck, the tests and the build.

## Before handing work back

Run `npm run format`, then `npm run typecheck`, `npm run lint` and `npm test`. The CI and the
release script reject any formatting difference, lint warning or failing test.
