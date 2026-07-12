# FS Workbench

Standalone local functional-safety tooling — Risk Assessment, Safety Requirement
Specification, Safety Functions, Verification, Validation, LOTO, Audits, Custom Reports
and Components in one app. No install, no server, no internet required.

## Run it

1. Open `index.html` in **Microsoft Edge** or **Google Chrome**.
2. First run: **Settings → Data & Storage → Choose data folder** — pick a folder outside
   the app for your company details, themes and libraries. One-time per machine.
3. **Settings → Company** — enter your details once. Applied to every report.
4. **New project** — choose a location, give it a name.

> Firefox and Safari are not supported: the File System Access API is only available
> in Chromium-based browsers (Edge and Chrome).

## Desktop shortcut

```powershell
powershell -ExecutionPolicy Bypass -File tools\create-shortcut.ps1
```

Creates a chromeless app window with the FS Workbench icon. Launch it once, then
right-click the taskbar button → *Pin to taskbar*. Add `-StartMenu` to also pin to
the Start menu.

## Three folders, three jobs

| Folder | What it holds | Written to? |
|---|---|---|
| **This repo** | the app — `js/`, `css/`, `pages/`, `content/` | never |
| **Data folder** | company, logo, themes, sections, libraries, custom components | yes — chosen once |
| **Projects folder** | one sub-folder per job: `project.json`, safety functions | yes — per project |

The data and projects folders live wherever you want — a local path or a network share.
They are not part of this repo and must never be committed.

## Architecture

Runs from `file://` — a deliberate constraint. Every unusual decision follows from it.
See `docs/ARCHITECTURE.md` for the full reasoning.

```
core → loader → store → settings → theme → content → doc-tabs → router → app
```

- **`SH.store`** — the open project (client data, written to the projects folder)
- **`SH.settings`** — app config (company, themes, sections — written to the data folder)
- These two stores are kept strictly separate

## Docs

| File | What it covers |
|---|---|
| `docs/PROJECT_INSTRUCTIONS.md` | the rulebook — read before changing anything |
| `docs/ARCHITECTURE.md` | why it is built this way |
| `docs/API.md` | the full `SH` API surface |
| `docs/DATA_MODEL.md` | what goes in `project.json`, `settings.json`, section files |
| `docs/OWNERSHIP.md` | which file belongs to which chat |
| `docs/CONTINUATION_PROMPT.md` | paste into a new chat to keep building consistently |
| `docs/CLAUDE_PROJECT_SETUP.md` | configuring the Claude Project |
| `CLAUDE.md` | Claude Code rules — loaded automatically every session |
| `CHANGELOG.md` | revision history |

## Status

v0.13.0 — shell, navigation, routing, brand, persistence and conventions in place.
Each feature tab is built in a separate chat following the ownership rules in
`docs/OWNERSHIP.md`. The running version is shown in the footer of the left sidebar.

## Browser requirement

The File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`) is
required for all persistence. Available in Edge 86+ and Chrome 86+.
Firefox and Safari do not support it.
