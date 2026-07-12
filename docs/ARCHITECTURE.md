# BroSafe — Architecture

**Rev 0.3.0 · 2026-07-09**

A local, no-hosting web app: open `index.html` in **Edge or Chrome** from `file://`
(including from a NAS path). No build step, no server, no npm, no internet.

## Runtime model

- **One shell** (`index.html`): fixed header, fixed left menu, content area. It loads only the
  core scripts and then never changes.
- **Pages and sub-tabs lazy-load**: the router injects a `<script>` tag the first time you open
  one. Classic script injection works from `file://`; ES `import` and `fetch()` of local files
  do not.
- **Hash routing**: `#/verification/circuit`. Refresh, back/forward and deep links all work.
- **One global namespace: `SH`.**

## Load order

`core.js` → `loader.js` → `store.js` → `settings.js` → `content.js` → `router.js` → `app.js`

| File | Responsibility |
|---|---|
| `js/core.js` | `SH` namespace, `SH.VERSION`, DOM helpers, registries, event bus, `SH.tabbedPage()` |
| `js/loader.js` | `SH.loader.load(src)` — inject a script once, return a Promise |
| `js/store.js` | `SH.store` — the open project + persistence contract |
| `js/settings.js` | `SH.settings` — app config (company, logo, theme, layout, custom components) |
| `js/content.js` | `SH.content` — information sections + variants, lazy-loaded |
| `js/router.js` | `SH.router` — hash router; mounts pages, delegates tabs |
| `js/app.js` | `SH.MENU` (left-menu manifest) + header/sidebar boot |

## Three trees

- **Install tree** (this folder): the app + shipped `libraries/` and `content/`. Portable,
  self-contained, relative paths, **never written to**. Copy it anywhere, including the NAS.
- **BroSafe data folder**: chosen once. App config that outlives any project — company details,
  logo, report themes, information-section overrides, custom components. Owned by `SH.settings`.
- **Project output tree**: chosen at runtime (e.g. a NAS share). One folder per job with
  `project.json` and per-SF JSON. Owned by `SH.store`.

See `DATA_MODEL.md` for all three layouts.

## Persistence — File System Access API

- One-time: the user picks the root folder (`showDirectoryPicker({mode:'readwrite'})`).
- The app then creates job folders and writes JSON with no further prompts.
- The directory handle is cached in IndexedDB; next launch needs one click to re-grant.
- Chromium only (Edge/Chrome). One editor per project (last-write-wins).

## Why it's built this way

| Constraint | Consequence |
|---|---|
| Must run from `file://` | No ES modules, no `fetch()` of local files → script injection + `SH` namespace |
| No hosting, no build | Classic scripts, no bundler, no framework |
| Folder/file output on a NAS | File System Access API → Edge/Chrome only |
| Must stay portable between employers | Unbranded UI; client data lives in `project.json` |

If the `<script>` list ever becomes unwieldy, the escape hatch is a tiny bundler (esbuild)
that concatenates to one static `app.js` — the output still runs from `file://`. Earn that
step; don't start with it.
