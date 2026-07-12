# BroSafe — Project Instructions

**Rev 0.3.0 · 2026-07-09**

The rulebook. Every work session — human or AI — follows this. Paste
`docs/CONTINUATION_PROMPT.md` into a new chat to carry these rules forward.

---

## 1. What BroSafe is

A local functional-safety tool covering Project Details, Risk Assessment, Safety Requirement
Specification, Components, Verification, Validation, LOTO, Audits and Custom Reports. It
generates reports from a project stored as JSON on a shared drive.

It is **standalone software**, not an in-house script. The person using it enters their own
company details and logo once in **Settings**; those are stored in the BroSafe data folder and
applied to every report.

It is **vendor-neutral and unbranded** by design, so it stays portable between employers.
Do not add company logos, colours or names to the app. Client/company details belong in
*project data* (`project.json`), never in the code or UI chrome.

---

## 2. Hard constraints — never break these

1. **Runs from `file://` in Edge/Chrome.** No server, no build step, no npm, no internet, no CDN.
2. **No ES modules.** No `import`/`export`, no `<script type="module">`.
3. **No `fetch()` of local files** (blocked on `file://`). Load code with `SH.loader.load(src)`;
   load library data through a file picker.
4. **One global: `SH`.** Everything attaches to it. No other globals.
5. **`index.html` is frozen.** Never add feature/page/tab scripts to it.
6. **No browser storage for project data or settings.** Both live in JSON files on disk.
   IndexedDB is used only to cache directory handles; `localStorage` only for trivial UI prefs.
7. **Information sections and libraries cannot be `fetch()`ed.** Shipped sections are classic
   scripts under `content/sections/` loaded via `SH.loader`. Images use relative `<img src>`,
   which does work from `file://`.

---

## 3. Revision rule (applies to EVERY file)

Every source file starts with a header block. Bump `Rev` and `Updated` whenever you change
the file, and record the change in `CHANGELOG.md`.

```js
/* ==============================================================
   BroSafe — <short module name>
   File:     <path from repo root>
   Rev:      0.2.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   <one or two lines: what this file is responsible for>
   ============================================================== */
```

- Use `<!-- ... -->` in HTML and `/* ... */` in CSS/JS. Same fields.
- **App version** lives in exactly one place: `SH.VERSION` in `js/core.js`. It renders in the
  header so you can read the running revision at a glance. Bump it on any release.
- **Versioning:** `MAJOR.MINOR.PATCH`.
  `PATCH` = fix, no behaviour change · `MINOR` = new feature/tab · `MAJOR` = breaking change
  to the data schema or architecture.
- Data files carry their own `"schema"` and `"appVersion"` (see `DATA_MODEL.md`) so old
  projects can be migrated.

---

## 4. Architecture

- **Shell** = `index.html`: fixed header + fixed left menu + content area. Loads only the five
  core scripts: `core.js`, `loader.js`, `store.js`, `router.js`, `app.js` (in that order).
- **Router** = hash based (`#/verification/circuit`). Refresh, back/forward and deep links work.
- **Lazy loading**: pages and tabs load on first open by injecting a classic `<script>` tag.
  This is the one pattern that works from `file://`.
- **Left menu** is defined only in `SH.MENU` (`js/app.js`).

### Folder map

```
BroSafe/
  index.html                    shell (frozen)
  css/app.css                   design tokens + shell layout
  js/
    core.js                     SH namespace, SH.VERSION, helpers, registries, bus, tabbedPage()
    loader.js                   SH.loader.load(src)
    store.js                    SH.store — open project + persistence contract
    router.js                   SH.router — hash router
    app.js                      SH.MENU + boot
  pages/<page>/<page>.js                     page controller
  pages/<page>/tabs/<tab>/<tab>.js           tab module
  libraries/                    SISTEMA VDMA 66413 XML (+ PNG icon folders)
  assets/                       static images
  docs/                         these documents
```

### Adding a left-menu page

1. Create `pages/<id>/<id>.js`:
   ```js
   SH.registerPage('<id>', SH.tabbedPage({
     title: '<Page Title>',
     tabs: [{ id: '<tab>', label: '<Tab Label>', src: 'pages/<id>/tabs/<tab>/<tab>.js' }]
   }));
   ```
2. Create each tab file `pages/<id>/tabs/<tab>/<tab>.js`:
   ```js
   SH.registerTab('<id>', '<tab>', {
     mount: function (host, ctx) { /* render into host ONLY */ }
   });
   ```
3. Add one entry to `SH.MENU` in `js/app.js`. **Do not edit `index.html`.**

### Adding a sub-tab

Create the tab file, add one `{ id, label, src }` entry to that page's `tabs:` array. Done.

### The mount contract

`mount(host, ctx)` renders **only inside `host`**. `ctx = { page, tab }`. Never touch the
header, sidebar or another tab's DOM. Clean up any listeners you attach outside `host`.

---

## 5. State & data — TWO stores

Keep these strictly separate. Putting app config in a project (or vice-versa) is a bug.

| Store | Holds | Backed by |
|---|---|---|
| `SH.store` | the **open project** — meta, SFs, hazards, LOTO | project folder (per job) |
| `SH.settings` | **app config** — company, logo, themes, report layout, information sections, custom components | BroSafe data folder (once) |

Company details, logos, themes and custom components are **never** written into `project.json`.
Client details are project data and never live in settings or code.

- **Single source of truth:** `SH.store.project`. Read it directly; **mutate only via
  `SH.store` methods**, which own autosave.
- App config: read with `SH.settings.get('theme.colors.accent')`, write with `SH.settings.set(...)`.
  Listen with `SH.bus.on('settings:changed', fn)`.
- **React to change** with `SH.bus.on('project:changed', fn)`. Never poll.
- **Persistence** (File System Access API) lives in `SH.store`. Feature code never touches the
  filesystem.
- Schemas are defined in `docs/DATA_MODEL.md`. Changing a schema = MAJOR bump + a migration note.
- Store paths **relative to the project folder**. Sanitise names before using them as filenames.
- Assume **one editor per project** (last-write-wins). Stamp `savedBy` + `savedAt` on save and
  warn if the on-disk `rev` is newer than the loaded one.

---

## 6. Styling

- Use the CSS variables in `css/app.css`. **Never hard-code a colour.**
- Palette: hi-vis **safety yellow** (`--yellow`) and **safety orange** (`--orange`) on
  **black** (`--black`) and **greys**. Yellow/orange are *signal* colours — active state,
  primary action, warnings. Not decoration.
- Reuse the shared classes: `.card`, `.field`, `.grid2`, `.grid3`, `.btn`, `.pill`,
  `.warnnote`, `h2.section`.
- Tab-specific CSS: inject a scoped `<style>` inside `mount()`, prefixed with a tab-specific
  class. Don't add to `app.css` unless it's genuinely shared.
- Keep a quality floor: visible keyboard focus, reduced-motion respected, readable contrast.

---

## 7. Naming

- Folders/files: **kebab-case** (`risk-assessment`, `test-plan`). Page/tab id == folder name ==
  file name.
- JS identifiers: camelCase. Keep functions inside the module's IIFE / registration object.
- Safety function ids follow the report convention: `A01.01`, `A02.06`.

---

## 8. Shared services (build once, reuse everywhere)

Planned `js/` services that tools consume rather than duplicate:

| Service | File | Responsibility |
|---|---|---|
| Store | `js/store.js` | open project, autosave, File System Access |
| Settings | `js/settings.js` | app config: company, logo, theme, layout, custom components |
| Content | `js/content.js` | information sections + variants (lazy-loaded, override-aware) |
| Library | `js/lib.js` | parse SISTEMA VDMA 66413 XML, search components |
| Calc | `js/calc.js` | PL/PFh engine, risk graph, category checks |
| Report | `js/report.js` | print/PDF rendering, A4 page layout, theme + layout tokens |

If a tab needs a capability that another tab could use, propose it as a service — don't
duplicate the logic.

---

## 9. Definition of done for a change

- [ ] File header updated (`Rev`, `Updated`); `SH.VERSION` bumped if releasing.
- [ ] `CHANGELOG.md` entry added.
- [ ] Runs from `file://` in Edge/Chrome with no console errors.
- [ ] No new globals; no `import`; `index.html` untouched.
- [ ] Colours come from CSS variables.
- [ ] Schema changes reflected in `docs/DATA_MODEL.md`.
