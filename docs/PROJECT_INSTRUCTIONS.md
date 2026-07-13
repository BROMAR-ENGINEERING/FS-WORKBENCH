# FS Workbench — Project Instructions

**Rev 0.14.0 · 2026-07-09 · app version `SH.VERSION = '0.14.0'`**

Paste this whole file into the Claude Project's *Custom Instructions*.

---

## 1. What FS Workbench is

A standalone local functional-safety report generator: Project Details, Risk Assessment,
SRS, Safety Functions, Verification, Validation, LOTO, Audits, Custom Reports, Components,
Settings.

It runs by opening `index.html` in Edge or Chrome from `file://`. No server, no install,
no internet required.

---

## 2. Read `docs/RECENT_CHANGES.md` first

Every schema addition, new shared service and behaviour change in the last few
releases is listed there. It replaces the per-change broadcast prompts that
used to be pasted into each chat. If the key or service you need appears in
`docs/RECENT_CHANGES.md`, use it — that is the current state.

---

## 3. File ownership — read this before writing anything

FS Workbench is built across several parallel chats. **Crossing this line breaks other
people's work.**

| Path | Owner |
|---|---|
| `index.html`, `css/app.css`, `css/fonts.css`, `js/*.js` (except `lib.js`) | **core chat** |
| `pages/<page>/<page>.js` (page controllers) | **core chat** |
| `docs/*`, `CHANGELOG.md`, `content/sections/*`, `test/*` | **core chat** |
| all JSON schemas | **core chat** |
| `CLAUDE.md` | **core chat** |
| `pages/<page>/tabs/<tab>/<tab>.js` | **that tab's own chat** |
| `js/lib.js` | **Component Libraries chat** |

**If you are the core chat:**
- Never create, rename, move or delete anything under `pages/*/tabs/`. Not even a stub.
- Never rename a tab id. The id in the page controller must match the id the tab file
  passes to `SH.registerTab(page, id, ...)`.
- If a sub-tab must change, hand back a **prompt to paste into that tab's chat**.
- If you need to read a sub-tab, **ask for it to be pasted in**. Don't guess or reconstruct.
- If a core change affects tabs (lifecycle, API, schema), write a **broadcast note** to
  paste into each tab chat.

**If you are a tab chat:** touch only your one file. Menu entries, new sub-tabs, new shared
services and schema changes belong in the core chat — say so, don't do it.

**Contention list — edit in one chat at a time:**
`js/core.js` · `js/loader.js` · `js/store.js` · `js/settings.js` · `js/theme.js` ·
`js/content.js` · `js/doc-tabs.js` · `js/router.js` · `js/app.js` · `js/lib.js` ·
`css/app.css` · `css/fonts.css` · `index.html` · `docs/DATA_MODEL.md` · `CLAUDE.md`

---

## 4. Hard constraints — never break these

1. **Runs from `file://`.** No server, build step, npm, internet or CDN.
2. **No ES modules.** No `import`/`export`, no `<script type="module">`, **no `fetch()` of
   local files** — `file://` blocks it. Code lazy-loads via `SH.loader.load(src)`.
3. **One global namespace `SH`.** No other globals.
4. **`index.html` is frozen.** Loads core scripts only. Genuinely new core services are the
   only exception, and must be stated explicitly.
5. **No `localStorage`** for project data or settings — both are JSON files on disk.
   IndexedDB caches directory handles only. See `SH.IDB` in `js/core.js`.
6. **Unbranded and vendor-neutral.** No company names, logos or brand colours in code.
   The product name lives only in `SH.APP` (`js/core.js`). Use `SH.APP_NAME` everywhere
   else — never a string literal.
7. **Every file carries a header block**: File, Rev, Updated, Requires, one-line purpose.
   Bump Rev + Updated on any change. Add a `CHANGELOG.md` entry.
8. **App version lives only in `SH.VERSION`** (`js/core.js`).
9. **A granted directory permission does not mean the folder still exists.** Probe before
   trusting a restored handle. Both `restoreDataFolder()` and `reconnectDataFolder()` probe
   and return `'gone'` if the folder has disappeared.
10. **No web fonts over the network; no `@font-face` with a relative `url()`.** A CDN
    `@import` is a silent no-op on `file://`. Relative font URLs fail too — fonts are
    CORS-enabled subresources and `file://` is an opaque origin. Fonts are embedded as
    base64 data: URIs in `css/fonts.css`.

---

## 5. Architecture

Shell `index.html` loads core scripts in this order only:

```
core → loader → store → settings → theme → content → doc-tabs → router → app
```

- Hash router: `#/page/tab`. Left menu defined **only** in `SH.MENU` (`js/app.js`).
- Standard page: `SH.registerPage(id, SH.tabbedPage({title, tabs:[...]}))`
- Custom page: `SH.registerPage(id, {title, mount, onTab, destroy})` — use when the tab
  set depends on runtime state (e.g. `project.validation.method`).
- Tab: `SH.registerTab(page, tab, {mount, onShow, unmount})`
- `mount(host, ctx)` renders into `host` **only**.

### Tabs and pages are kept alive

`mount()` runs **once**. Switching hides the DOM rather than destroying it.

- Subscribe to `project:changed` or implement `onShow()` to refresh on return.
- A tab first opened with no project will keep saying so until it subscribes.
- `unmount()` runs only on page teardown — release blob URLs and timers there.

Reference implementation: `pages/settings/tabs/company/company.js`

---

## 6. Two stores, kept strictly separate

- **`SH.store`** — open project (client data, project folder). Company/logo/theme never go here.
- **`SH.settings`** — app config (company, themes, sections, libraries — data folder).
  Client details never go here.

Mutate only via store methods. Listen via `SH.bus.on(event, fn)`.

**Event split:**

| Event | Meaning |
|---|---|
| `project:changed` | data changed — once per edit, plus open/close/switch |
| `project:status` | save state only (`saved·saving·unsaved·memory`) |
| `settings:changed` | settings data changed |
| `settings:status` | settings save state changed |

Redraw on `*:changed`. Bind save indicators to `*:status`. Guard keystroke writers against
echoing their own write — use `SH.store.projectId()` to detect identity changes.

---

## 7. Schema changes

`docs/DATA_MODEL.md` is the single source of truth. Core chat only.

- **MINOR** (new nullable key): add to `blankProject()` AND `SH.store._normalize()`.
  `_normalize()` is called on every project open and back-fills missing keys. Arrays cannot
  use the scalar `fill()` helper.
- **MAJOR** (restructure/rename/remove): bump schema version, write a migration.

Declare the addition in this chat before writing it anywhere else.

---

## 8. Shared services — reuse, never duplicate

| Service | What it does |
|---|---|
| `SH.modal(title, bodyEl, actions)` | app-level modal — never roll your own |
| `SH.docTabs.versionControl(docId,{title})` / `.report(docId,{title})` | shared Version Control and Report tabs |
| `SH.theme` | active report theme; `SH.theme.attach(host, '.preview')` for live previews |
| `SH.content` | information sections (shipped seeds cannot be `fetch()`ed) |
| `SH.settings` file API | `exists`, `listDir`, `ensureDir`, `readFile`, `readText`, `writeText`, `writeBlob`, `deleteEntry`, `fileUrl`, `resolve` — all case-folding |
| `SH.lib` | VDMA 66413 parser + library I/O. Lazy-loaded, never in `index.html` |

`project.areas[]` is the shared register for Areas & Assets. Always reference by `areaId`.

---

## 9. Styling

CSS variables from `css/app.css` only — never hard-code a colour.

**Signal palette:** `--amber` = primary action/active state only. `--orange` = secondary/warning.
`--steel` = links/info. Keep signals sparse.

`--yellow*` are aliases of `--amber*` for pre-0.12.0 tab files. Use `--amber*` in new code.

Fonts (IBM Plex Sans, IBM Plex Mono, Space Grotesk) embedded in `css/fonts.css`.
**Never add a CDN @import or relative @font-face.**

Classes to reuse: `.card .field .grid2 .grid3 .btn .btn.ghost .btn.danger .btn.sm .chk
.tbl .hint .warnnote .pill h2.section .chip .proj-item .loc-row .stub`

Tab-specific CSS: scoped `<style>` tag inside `mount()`. Don't add to `app.css` unless
genuinely shared.

---

## 10. Traps that have already bitten, in this codebase

- **`showDirectoryPicker()` needs a live user gesture** — first statement of a click handler,
  never after `await`.
- **Data-folder images need blob URLs** — `SH.settings.fileUrl(path)`, revoke in `unmount()`.
  Never use relative `<img src>` for files outside the app root.
- **Empty `src=""` resolves to the current document URL** — logs a security error on
  `file://`. Never assign `''` or `null` to `src`. `logoUrl()` / `iconUrl()` return `null`
  legitimately — guard before assigning.
- **Case folding must be consistent** — `exists()`, `resolve()` and `fileUrl()` all fold
  case. One inconsistency silently drops files.
- **`SH.el()` sets `textContent`** — write `Data & Storage`, never `Data &amp; Storage`.
- **A script that loads but throws still fires `onload`** — boot guard catches it by
  feature-detecting each core service.
- **Two files are called `settings.js`** — `js/settings.js` (store) and
  `pages/settings/settings.js` (page controller). Check line 3 of the header after copying.
- **The projects root CONTAINS projects** — adopting a project folder as the root makes
  `listProjects()` return nothing.
- **A granted handle to a deleted folder still reports `'granted'`** — always probe before
  trusting. `restoreDataFolder()` / `reconnectDataFolder()` return `'gone'` and discard it.
- **Library values are snapshotted** into `sf/sf_<id>.json` — provenance only; a library
  update can never silently change a signed-off report.
- **Repeated device `uid` is not a duplicate** — Pilz models extra use cases as extra
  `<Device>` elements. `SH.lib.parse()` merges them.
- **Schema back-filling belongs in `_normalize()`, not just `blankProject()`** — a project
  created before a key existed won't have it. `_normalize()` runs on every open.
- **`SH.modal()` is the only modal** — never build a custom one in a tab file.
- **`--user-data-dir` kills IndexedDB** — the desktop shortcut deliberately omits it.
  Adding it starts a fresh profile, orphaning all cached folder handles.

---

## 11. Repository

The repo contains the app only. Data and project folders are never committed.

```
repo/
  CLAUDE.md          ← Claude Code reads this every session (imports docs/ with @syntax)
  .gitignore         ← excludes *.xml, settings.json, themes/, sections/, libraries/
  README.md  CHANGELOG.md
  index.html
  css/   js/   pages/   assets/   content/   docs/   tools/   test/
```

`CLAUDE.md` is the Claude Code guardrail — it references `docs/OWNERSHIP.md`,
`docs/API.md` and `docs/PROJECT_INSTRUCTIONS.md` with `@` imports.

---

## 12. How to work with me

- Change only the files the task needs. State explicitly if a core file must change.
- **Return complete file contents**, header updated, on every change.
- **Declare schema additions here first**, then write them.
- Flag duplicates of existing shared services rather than re-implementing them.
- **Flag anything that would break the `file://` constraint.**
- Verify against real artefacts when they exist. Say when you have, and what you found.
- Tell me plainly when I'm wrong, or when an instruction would cause a bug.
