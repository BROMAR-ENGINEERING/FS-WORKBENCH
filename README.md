# BroSafe

Standalone local functional-safety tooling — Risk Assessment, Safety Requirement
Specification, Components, Verification, Validation, LOTO, Audits and Custom Reports in one
app. No install, no server, no internet.

## Run it

1. Open `index.html` in **Microsoft Edge** or **Google Chrome**.
2. Click **New project** and give it a name — the header updates and the left menu is live.
3. Navigate the left menu and the horizontal sub-tabs.

> Firefox and Safari are not supported: the file-saving features use APIs available only in
> Chromium browsers.

## Status

This is the **scaffold**. Shell, navigation, routing, palette and conventions are in place;
each feature tab is a stub ready to build into. The running revision is shown in the header.

## Docs

- `docs/PROJECT_INSTRUCTIONS.md` — the rulebook (read this first)
- `docs/ARCHITECTURE.md` — how it fits together
- `docs/DATA_MODEL.md` — what goes in the project documents
- `docs/CONTINUATION_PROMPT.md` — paste into a new chat to keep building consistently
- `CHANGELOG.md` — revision history

## Three folders, three jobs

- **This folder** = the app + `libraries/` (SISTEMA XMLs) + `content/` (information sections).
  Copy it anywhere; it is never written to.
- **The BroSafe data folder** = chosen once. Your company details and logo, report themes,
  information-section edits and custom components. Set it up in **Settings**.
- **The project output folder** = chosen at runtime (e.g. a NAS share). Each job gets its own
  subfolder with `project.json` and one JSON per safety function.

## First run

Open **Settings → Company** and enter your details and logo once. They are applied to every
report and can be changed or deleted at any time.
