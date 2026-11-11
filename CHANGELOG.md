# Changelog

All notable changes to EasyPanel are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The project file format is versioned separately (see "Versioning" in the README); format
changes are always mentioned here.

## [Unreleased]

## [1.1.0] - 2026-11-11

### Added

- **Modern device style** (new default for new projects): realistic fronts modelled on
  current hardware.
  - Breakers: large coloured handle, black rating badge, contact-status window, fine print
    and symbol.
  - RCDs: information panel with test button and type badge.
  - Contactors: OFF/AUTO/ON selector and coil/contact symbols.
  - Also redrawn: impulse relay, timer, surge protector, fuse carrier, outlet, meter and
    indicator.
- "Device style" panel setting to switch between *Modern* and *Classic*. The library
  previews follow it.
- "Handle / accent colour" device property (e.g. a light-green handle on white breakers).

### Changed

- Project format **1.1.0** (minor, backward compatible): adds `settings.deviceStyle` and
  `props.accentColor`. Files without `deviceStyle` keep their original *Classic* look.
- Day/night contactor preset shows its rating ("20A") with "Jour/Nuit" as secondary text.
- Example project updated to show the modern style.

### Fixed

- The residual current symbol "IΔn" is drawn as a vector shape, so it prints correctly in
  PDF exports.

## [1.0.0] - 2026-11-11

### Added

- DIN rail workspace: rows of configurable length, module grid, half-module positioning,
  zoom and scrolling.
- Component library: RCD, breakers, RCBO, main switch, fuse holder, surge protector,
  contactor, impulse relay, timer, indicator, outlet, energy meter, blank and generic devices.
- Drag and drop with snapping, collision feedback, Shift-insert and "pack left".
- Properties panel, undo/redo, keyboard shortcuts.
- Circuit label strip with automatic text fitting (horizontal or vertical).
- Automatic local saving, local project list, JSON import/export.
- Exports: PDF (A4 landscape, vector), PNG, SVG, JSON, print.
- English and French interface.
- Project format **1.0.0** (semantic versioning). Files written by earlier development
  builds (`"version": 1`) are read as 1.0.0.
