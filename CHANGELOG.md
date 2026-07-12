# Changelog

All notable changes to BroSafe. Format: `MAJOR.MINOR.PATCH`.
`PATCH` = fix · `MINOR` = new feature/tab · `MAJOR` = breaking schema/architecture change.

## [0.4.0] — 2026-07-09
### Added
- **Safety Functions** page (Functions / Components).
- Full sub-menu structure: Project Details (Customer, Project, Involved Parties + RACI,
  Document Control, Job Management); Risk Assessment (Areas & Assets, Photo References,
  Document References, Risk Assessment, Corrections & Recommendations, Version Control,
  Report); SRS; Verification; Validation (Phases 1–4); LOTO (Asset Register, Procedures,
  LOTO, Report).
- **`js/doc-tabs.js`** — shared factory for the repeated *Version Control* and *Report* tabs.
  Nine tabs across five pages now share one implementation; each keeps its own revision history
  (`project.documents[docId]`) and report inclusions (`settings.reports[docId]`).
- Shared CSS: `.chk`, `.tbl`, `code`.

### Changed
- **Components** moved to the bottom of the left menu.
- `project.accessPoints` replaced by **`project.areas`** — the shared Areas & Assets register
  referenced by hazards, safety functions, LOTO and photos. LOTO's Asset Register is a filtered
  view of it, not a second list.
- `project.json` gains `documents{}`, `involvedParties[]` and `job{}`.

## [0.3.1] — 2026-07-09
### Added
- `docs/API.md` — the full `SH` surface, so a new chat needs no core source attached.
- **Reference implementation**: `Settings › Company` is now a real, working tab showing scoped
  CSS, `SH.el` rendering, `SH.settings` read/write, logo upload, and correct teardown.
- Tab lifecycle: optional `unmount()`, called on the outgoing tab before its DOM is discarded.
- `SH.bus.off(ev, fn)` and `.hint` shared class.

### Fixed
- Tabs subscribing to the event bus in `mount()` accumulated a duplicate listener on every
  visit. `unmount()` + `bus.off()` resolves it; `emit()` now iterates a copy so a handler may
  unsubscribe during dispatch.

## [0.3.0] — 2026-07-09
### Added
- **Settings page** (pinned to the bottom of the left menu) with six tabs: Company,
  Report Theme, Report Layout, Information Sections, Component Libraries, Data & Storage.
- **`SH.settings`** — a second store for app-level config (company details, logo, themes,
  report layout, information sections, custom components), backed by the BroSafe data folder.
- **`SH.content`** — information-section registry with variants and image support. Shipped
  sections ship as classic scripts (`content/sections/*.js`) because `fetch()` is blocked on
  `file://`. User edits save as overrides and never modify the defaults.
- **Components page** (Selected Components / Library Browser / Custom Components) — the job's
  component register. Custom, non-SISTEMA parts are saved to the data folder so they are
  reusable across jobs.
- **Audits page** (Checklists / Findings) and **Custom Reports page** (Report Builder / Templates).
- Two example information sections: Common Cause Failure, Category Architectures.

### Changed
- Version stamp moved from the header to the **foot of the left menu**.
- Removed the duplicate Verification › Component Library tab; the Components page owns it.
- `index.html` now loads `settings.js` and `content.js` as core scripts.
- Docs: three-tree model (install / data folder / project output) documented in
  `ARCHITECTURE.md` and `DATA_MODEL.md`; `settings.json` and `components.json` schemas added.

## [0.2.0] — 2026-07-09
### Changed
- Renamed the project to **BroSafe**; removed all company branding to keep the tool portable.
- New hi-vis palette: safety yellow + safety orange on black and greys. All colours are now
  CSS variables in `css/app.css`.
- Added the **revision header rule** — every source file carries `File / Rev / Updated /
  Requires` and a one-line purpose. App version now lives in `SH.VERSION` and renders in the UI.

### Added
- `docs/PROJECT_INSTRUCTIONS.md` — the rulebook.
- `docs/DATA_MODEL.md` — `project.json` and `sf_<id>.json` schemas.
- `CHANGELOG.md`.

## [0.1.0] — 2026-07-09
### Added
- Scaffold: shell, fixed header, fixed left menu, hash router, lazy page/tab loader,
  `SH` namespace, project store stub.
- Six pages with sub-tab stubs.
- `libraries/` with the Pilz VDMA 66413 XML.
