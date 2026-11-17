> [!NOTE]
> **This project is 100 % vibe-coded.** Every line of code, test and documentation was
> written by an AI coding agent from natural-language instructions. It also serves as a
> **sandbox project for testing AI agents**, so expect experiments, and review the code
> before relying on it.

**The simple electrical panel designer.**

**EasyPanel** is a lightweight, offline visual editor for drawing the physical layout of
residential electrical distribution boards: DIN rails, modular devices (RCDs, breakers,
contactors, outlets…), circuit labels and empty spaces. Its primary target is the French
residential market (NF C 15-100 conventions such as “C20”, “30mA type A”), but nothing in
the editor is tied to it.

> [!IMPORTANT]
> EasyPanel is a **visual documentation tool**. It does not check electrical installations
> and does not certify compliance with NF C 15-100 or any other standard.

![EasyPanel editor: component library on the left, a two-row panel in the middle, device properties on the right][img-editor-overview]

**Table of contents:**

- [1. Screenshots](#1-screenshots)
- [2. Getting started](#2-getting-started)
  - [2.1. Install Node.js (once)](#21-install-nodejs-once)
  - [2.2. Install EasyPanel's dependencies (once)](#22-install-easypanels-dependencies-once)
  - [2.3. Start the app](#23-start-the-app)
  - [2.4. Troubleshooting](#24-troubleshooting)
- [3. Features](#3-features)
- [4. Using EasyPanel](#4-using-easypanel)
  - [4.1. Where is my data?](#41-where-is-my-data)
- [5. Project file format](#5-project-file-format)
  - [5.1. Versioning](#51-versioning)
- [6. Architecture](#6-architecture)
  - [6.1. Tech stack](#61-tech-stack)
  - [6.2. Adding a device type](#62-adding-a-device-type)
- [7. Development](#7-development)
  - [7.1. Deploying (no Node.js needed for users)](#71-deploying-no-nodejs-needed-for-users)
- [8. Known limitations](#8-known-limitations)
- [9. License](#9-license)

# 1. Screenshots

**Realistic device fronts.** The _Modern_ style draws coloured handles, rating badges,
status windows, residual-current type badges and the day/night contactor's OFF/AUTO/ON
selector. The label strip above the rail fits each circuit name to its device.

![Close-up of a rail: 63A type A RCD, breakers with blue and yellow-green handles, day/night contactor][img-modern-row]

**Every library component, in both styles.** Switch between them under _Panel
appearance → Device style_.

| Modern                                                    | Classic                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| ![All components in the modern style][img-devices-modern] | ![All components in the classic style][img-devices-classic] |

**Drag and drop with collision detection.** A drop on an occupied slot is refused, and
the status bar says why. Hold Shift to insert and push the following devices instead.

![Dragging a breaker onto an occupied slot: the ghost turns red and the status bar explains the refusal][img-drag-refused]

**Exports.** PDF (A4 landscape, vector), PNG, SVG, JSON or print, with an optional title
block. Below is a PNG export of the example project.

![Export dialog with PDF, PNG, SVG, JSON and Print options][img-export-dialog]

![PNG export of the example panel with its title block][img-export-a4]

# 2. Getting started

## 2.1. Install Node.js (once)

Download and install **Node.js 26 or newer** (the _LTS_ version) from
[nodejs.org][nodejs]. Check it in a terminal:

```bash
node -v    # must print v26.0.0 or higher
```

## 2.2. Install EasyPanel's dependencies (once)

Open a terminal **in the EasyPanel folder** (in VS Code: _Terminal → New Terminal_), then:

```bash
npm install
```

## 2.3. Start the app

```bash
npm start
```

Your browser opens EasyPanel automatically. If it doesn't, open the address printed in
the terminal (usually [http://localhost:5173][dev-server]).

Keep the terminal open while you use the app. To stop it, press **Ctrl+C** in the
terminal. Next time, only step 3 is needed.

Your projects are saved in the browser, not in the terminal session: stopping or
restarting the app does not lose them (see [Where is my data?][where-is-my-data]).

## 2.4. Troubleshooting

| Problem                                                   | Fix                                                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm` is not recognised                                   | Node.js is not installed, or the terminal was opened before installing it. Reopen the terminal.                         |
| `Unsupported engine` / errors mentioning the Node version | Install a newer Node.js (step 1).                                                                                       |
| `Port 5173 is in use`                                     | Another copy is already running. Use it, or stop it with Ctrl+C. Vite otherwise picks the next free port and prints it. |
| Blank page when opening `index.html` directly             | Don't double-click the file: browsers block ES modules on `file://`. Use `npm start`.                                   |

# 3. Features

- **DIN rail workspace.** Rows of any length (13, 18, 24, 26, 36… modules), a visible
  module grid, and numbered modules. 1 module = 18 mm.
- **Half-module support.** Positions and widths snap to the module grid in 0.5 steps, so a
  2.5-module outlet plus a ½-module blank is possible. Whole-module positions are preferred.
- **Drag and drop with collision detection.** Drag from the library, within a rail or
  between rails. The ghost turns red with the reason (occupied, does not fit) and the drop
  is refused. Other devices never move unless you ask:
  - hold **Shift** while dropping to _insert_ and push the following devices;
  - use **Pack left** on a row to remove gaps.
- **Two device styles.**
  - _Modern_ (default) draws realistic fronts like current hardware: coloured handles,
    rating badges, status windows, OFF/AUTO/ON selectors and coil symbols.
  - _Classic_ draws simplified fronts.
  - Both are generic, with no brand names or logos.
- **Component library.** Includes:
  - RCD (type AC/A/F/B), breakers 1P+N and 2P (B/C/D curves), RCBO and main switch;
  - fuse holder, surge protector, contactor (incl. day/night), impulse relay and timer;
  - indicator light, modular outlet, energy meter, blank cover and generic devices.
- **Free-form properties.** Every property is optional and editable: designation, rating,
  curve, poles, breaking capacity, residual-current type and sensitivity, width, main-text
  override, secondary text, circuit label, body colour and handle/accent colour. The drawing updates live.
- **Circuit label strip** above each rail. Each label sits in a cell aligned with its
  device. Text is fitted automatically: it shrinks before cutting words and can break
  after hyphens. Labels can be horizontal or vertical.
- **Undo/redo** (200 steps), duplicate, delete, and keyboard nudging.
- **Projects.**
  - Automatic saving in the browser, plus a list of local projects (Open).
  - JSON import/export with a versioned format.
  - Drop a `.json` file anywhere on the window to import it.
- **Exports.**
  - **PDF**: A4 landscape, vector, fit to page or real size 1:1.
  - **PNG**: 150/300/600 DPI.
  - **SVG** and **JSON**.
  - **Print**: the browser print dialog with the panel only.
  - Exports never contain UI elements. An optional title block (name, description,
    author, date) and notes can be included.
- **Summary.** Module usage, free space, and _informational_ hints such as circuits
  without a label.
- **English and French UI**, picked automatically from the browser language and switchable.

# 4. Using EasyPanel

1. **Add devices.** Drag a component from the left library onto a rail. You can also
   click it: it goes to the first free slot of the selected row.
2. **Edit a device.** Click it and use the right-hand panel.
   - Double-click a device (or press Enter) to jump to its circuit label.
   - Leave _Main text_ empty to keep the automatic marking (`C20`, `63A`…).
3. **Manage rows.** Click a rail to rename it, change its length, move it, pack it or
   delete it. _Add row_ is at the bottom of the workspace.
4. **Project and panel settings.** Click an empty area of the workspace to edit the
   project information and the panel appearance:
   - background, row spacing, label strip height and orientation;
   - row names, blank covers for empty slots, and the export title block.
5. **Export.** Use the **Export** button.

| Shortcut                       | Action                                       |
| ------------------------------ | -------------------------------------------- |
| Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) | Undo / redo                                  |
| Ctrl+D                         | Duplicate selected device                    |
| Del / Backspace                | Delete selected device (or row)              |
| ← →                            | Move device by one module (Alt: half module) |
| ↑ ↓                            | Move device to the previous/next row         |
| Shift while dropping           | Insert and push following devices            |
| Ctrl + wheel, Ctrl + / − / 0   | Zoom / fit                                   |
| Ctrl+S                         | Save now (saving is automatic anyway)        |
| Esc                            | Cancel drag / clear selection                |

## 4.1. Where is my data?

Projects are stored in the browser's `localStorage` on your computer; nothing is sent
anywhere. Clearing site data deletes them, so **export important projects as JSON**.

If the browser refuses to save (storage full or disabled), the status badge turns red and a
persistent message asks you to export. Before opening or creating another project, EasyPanel
offers to export the unsaved one.

# 5. Project file format

Projects are plain JSON (`*.easypanel.json`):

```jsonc
{
  "format": "easypanel",
  "formatVersion": "1.0.0",
  "generator": { "name": "EasyPanel", "version": "1.0.0" },
  "id": "…",
  "meta": { "name": "…", "description": "…", "author": "…", "createdAt": "ISO", "updatedAt": "ISO" },
  "settings": {
    "deviceStyle": "modern",
    "background": "#d4d6d9",
    "rowSpacing": 30,
    "showLabels": true,
    "labelOrientation": "horizontal",
    "labelHeight": 22,
    "fillEmptyWithBlanks": false,
    "showRowNames": false,
    "showTitle": true,
  },
  "rows": [
    {
      "id": "…",
      "name": "Row 1",
      "modules": 13,
      "devices": [
        {
          "id": "…",
          "kind": "breaker",
          "position": 2,
          "width": 1,
          "props": { "rating": 20, "curve": "C", "poles": "1P+N", "label": "Kitchen sockets" },
        },
      ],
    },
  ],
  "notes": "",
}
```

- `position` and `width` are in modules (multiples of 0.5).
- Graphic dimensions are never stored. They are derived by the renderer.
- Every load is validated defensively (`src/model/migrate.ts`), whether it's an imported
  file or a project reopened from the browser:
  - overlapping devices are moved, and unknown devices are skipped;
  - every repair is **reported** to the user, never silent.

## 5.1. Versioning

EasyPanel uses [semantic versioning][semver] for two independent numbers:

| Number                     | Where                                                                   | Meaning                                                  |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| **Application version**    | `package.json` → `generator.version` in each file                       | Releases of the app, listed in [CHANGELOG.md][changelog] |
| **Project format version** | `FORMAT_VERSION` in `src/model/types.ts` → `formatVersion` in each file | Structure of the JSON file                               |

The format version decides how a file is loaded:

| File format vs. app format    | Behaviour                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Same, or older MINOR/PATCH    | Opens normally.                                                                                                                            |
| Newer MINOR/PATCH, same MAJOR | Opens with a warning: data added by the newer version is dropped when saving.                                                              |
| Older MAJOR                   | Migrated step by step (1→2→3…). The original is kept as a backup in the browser (`easypanel:backup:<id>:<version>`), and the user is told. |
| Newer MAJOR                   | Refused with an "update EasyPanel" message. Nothing is opened or overwritten.                                                              |

The `generator` field is informational only and never affects loading.

When changing the format:

- **PATCH**: no structural change (clarification, stricter validation).
- **MINOR**: new _optional_ data that older apps can safely ignore. Bump `FORMAT_VERSION`
  and read the new field with a default in `normalize()`.
- **MAJOR**: anything else (renamed or removed field, changed meaning or units):
  1. bump `FORMAT_VERSION`;
  2. add `MIGRATIONS[oldMajor]` in `migrate.ts`;
  3. add a test that loads a saved sample of the old format;
  4. the next release must be an application MAJOR release.

Bump `FORMAT_VERSION` in the change that modifies the format, not at release time, and
mention it in the `[Unreleased]` section of the CHANGELOG as `Project format **x.y.z**`.
The release script refuses to release an undocumented format change (see
[Releasing](#72-releasing)).

# 6. Architecture

```
src/
  model/         Pure data & rules (no DOM): unit-tested
    types.ts       Project / Row / Device types, format version
    catalog.ts     Device kinds, editable fields, library presets   ← extension point
    layout.ts      Placement rules: bounds, collisions, free slots, insert, compact
    project.ts     Editing operations (add/move/duplicate/resize…), EditError
    deviceText.ts  Markings derived from properties ("C20", "30mA A")
    migrate.ts     Loading, validation, versioned migrations
    semver.ts      Semantic version parsing/comparison
    insights.ts    Informational statistics & hints (separate from layout rules)
    example.ts     Example project
  render/        Project → SVG (shared by editor and all exports)
    devices.ts     Dispatches to the selected device style
    styles/        modern.ts (realistic) and classic.ts (simplified): one front per kind
    svg.ts         SVG primitives (text, rect, symbols) shared by the styles
    geometry.ts    Physical dimensions (module = 18 mm, front = 45 mm)
    panel.ts       Panel layout & full SVG document (editor/export modes)
    text.ts        Text measuring, wrapping and fitting
  store/
    store.ts       State, selection, undo/redo (mutations applied to a draft copy)
    persistence.ts localStorage library, preferences, file naming
  editor/
    workspace.ts   Zoom, selection, drag & drop, snapping feedback
  ui/            Library palette, properties panel, dialogs, toasts, icons
  export/        SVG / PNG / PDF / JSON / print
  i18n/          en (reference) and fr dictionaries
  app.ts         Wiring, commands, keyboard shortcuts, autosave
scripts/         Release tooling, run by Node directly (not part of the app)
  release.ts       `npm run release`: checks, version, CHANGELOG, tag, push
  release-lib.ts   Pure helpers used by the scripts: unit-tested
  release-notes.ts Prints a CHANGELOG section (GitHub release notes)
.github/workflows/
  release.yml      On a release tag: GitHub release and Pages deployment
  deploy-pages.yml Build and deploy to GitHub Pages (release tags only)
```

Design principles:

- **Model and rules are pure.** The UI never decides whether a placement is valid; it asks
  `layout.ts`. Operations validate before mutating, and the store applies them to a copy,
  so a refused edit leaves the project untouched.
- **One renderer.** The editor and every export call `renderPanel()`, so what you see is
  what you export. The SVG uses millimetres and plain presentation attributes, which keeps
  it compatible with svg2pdf and standalone viewers.
- **Electrical knowledge stays informational.** `insights.ts` only reports facts about the
  drawing. No electrical rule is enforced or implied.

## 6.1. Tech stack

- TypeScript + [Vite][vite], with no UI framework: the UI is small, and plain
  DOM keeps it fast and dependency-free.
- Runtime dependencies: [jsPDF][jspdf] and
  [svg2pdf.js][svg2pdf] for vector PDF. They are loaded on
  demand, only when exporting a PDF.
- Tests: [Vitest][vitest].
- Lint: [oxlint][oxlint], with type-aware rules. Formatting: [Prettier][prettier].

## 6.2. Adding a device type

1. Add the kind to `DeviceKind` in `src/model/types.ts`.
2. Describe its editable fields in `KIND_SPECS` (`src/model/catalog.ts`). Optionally add
   presets to `PRESETS` for the library.
3. Draw it in each style under `src/render/styles/` (`modern.ts` and `classic.ts`). Without
   a dedicated case, the generic front is used. Only use plain SVG attributes and
   Latin-1 text: `tests/render.test.ts` checks every kind in every style.
4. If it has an automatic marking, extend `mainText()` / `bottomText()` in `deviceText.ts`.
5. Add `kind.<kind>` (and preset titles) to `src/i18n/en.ts` and `fr.ts`. The French
   dictionary is typed against the English one, and `tests/i18n.test.ts` checks the keys
   built at runtime.

# 7. Development

```bash
npm run dev         # dev server with hot reload (same as npm start)
npm test            # unit tests (model, loading, text fitting, i18n)
npm run typecheck   # TypeScript strict check (app, tests and scripts)
npm run lint        # oxlint, type-aware (warnings fail)
npm run format      # format every file with Prettier (format:check only checks)
npm run build       # typecheck + production build into dist/
npm run preview     # serve the production build locally
npm run release -- <major|minor|patch|x.y.z> [--dry-run]   # see "Releasing"
```

## 7.1. Deploying (no Node.js needed for users)

`npm run build` produces a fully static site in `dist/`: HTML, JS and CSS, with no server
code. Copy that folder to any static host, such as GitHub Pages, a NAS or an intranet
server. The build uses relative paths, so it also works from a sub-folder. Users then
only need a browser.

To serve `dist/` from your own machine without the dev tools, use any static file server:
`npx serve dist` or `python -m http.server -d dist`.

The official build is published on GitHub Pages at each release (see below). Each GitHub
release also has the built app attached as `easypanel-x.y.z.zip`.

## 7.2. Releasing

During development, every user-visible change is listed under `## [Unreleased]` in the
[CHANGELOG][changelog]. To publish a release, from an up-to-date `master` with no local
changes:

```bash
npm run release -- minor --dry-run   # check everything and preview, change nothing
npm run release -- minor             # release (asks for confirmation before pushing)
```

The argument is `major`, `minor` or `patch` (bump from the last release), or an explicit
version such as `1.0.0` (required for the very first release). The script:

1. checks the repository (on `master`, clean, in sync with GitHub, tag not taken), the
   CHANGELOG (`[Unreleased]` is not empty) and the project format (a change since the last
   release is documented; a new format MINOR requires at least an app MINOR, a new format
   MAJOR an app MAJOR);
2. runs the typecheck, the linter, the formatting check, the tests and the build;
3. sets the version in `package.json`, turns `[Unreleased]` into `[x.y.z] - date` and
   updates the comparison links;
4. commits `[release] EasyPanel x.y.z`, creates the tag `vx.y.z` and pushes both.

Pushing the tag starts the **Release** workflow on GitHub, which builds the tag again,
creates the GitHub release (CHANGELOG section as notes, zip attached) and deploys it to
GitHub Pages. Only release tags can be deployed: a manual run of either workflow on a
branch is a dry run. To retry a failed publication, run the workflow on the tag with
"dry run" unticked.

# 8. Known limitations

- Single selection only (no multi-select or group move).
- Only half-module granularity, no arbitrary widths.
- Exported text uses Helvetica/Arial. Characters outside the Latin-1 range may not render
  in the PDF (they do in SVG/PNG).
- Projects live in one browser profile. Use JSON export to move them between computers.

# 9. License

MIT. See [LICENSE][license].

<!-- Links -->

[nodejs]: https://nodejs.org/
[dev-server]: http://localhost:5173
[where-is-my-data]: #41-where-is-my-data
[semver]: https://semver.org
[changelog]: CHANGELOG.md
[vite]: https://vitejs.dev/
[jspdf]: https://github.com/parallax/jsPDF
[svg2pdf]: https://github.com/yWorks/svg2pdf.js
[vitest]: https://vitest.dev/
[oxlint]: https://oxc.rs/docs/guide/usage/linter
[prettier]: https://prettier.io/
[license]: LICENSE

<!-- Images -->

[img-editor-overview]: docs/images/editor-overview.png
[img-modern-row]: docs/images/modern-row.png
[img-devices-modern]: docs/images/devices-modern.png
[img-devices-classic]: docs/images/devices-classic.png
[img-drag-refused]: docs/images/drag-refused.png
[img-export-dialog]: docs/images/export-dialog.png
[img-export-a4]: docs/images/export-a4.png
