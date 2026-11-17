# Changelog

All notable changes to EasyPanel are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The project file format is versioned separately (see "Versioning" in the README); format
changes are always mentioned here.

## [Unreleased]

## [1.0.0] - 2026-11-17

### Added

- DIN rail workspace: rows of configurable length, module grid, half-module positioning,
  zoom and scrolling.
- Component library: RCD, breakers, RCBO, main switch, fuse holder, surge protector,
  contactor, impulse relay, timer, indicator, outlet, energy meter, blank and generic devices.
- Two device styles, selectable in the panel settings (the library previews follow it):
  - _Modern_ (default for new projects): realistic fronts modelled on current hardware —
    breakers with a large coloured handle, rating badge and contact-status window; RCDs
    with an information panel, test button and type badge; contactors with an
    OFF/AUTO/ON selector and coil/contact symbols; redrawn impulse relay, timer, surge
    protector, fuse carrier, outlet, meter and indicator.
  - _Classic_.
- "Handle / accent colour" device property (e.g. a light-green handle on white breakers).
- Day/night contactor preset showing its rating ("20A") with "Jour/Nuit" as secondary text.
- Drag and drop with snapping, collision feedback, Shift-insert and "pack left".
- Properties panel, undo/redo, keyboard shortcuts.
- Circuit label strip with automatic text fitting (horizontal or vertical).
- Automatic local saving, local project list, JSON import/export.
- Exports: PDF (A4 landscape, vector), PNG, SVG, JSON, print. The residual current symbol
  "IΔn" is drawn as a vector shape so it prints correctly in PDF exports.
- English and French interface.
- Example project showing the modern style.
- Project format **1.0.0** (semantic versioning), stored in the `formatVersion` field,
  separate from the application version in `generator.version`.

[Unreleased]: https://github.com/legerch/EasyPanel/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/legerch/EasyPanel/releases/tag/v1.0.0
