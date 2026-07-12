# Continuation prompt

Paste the block below into a new chat, fill the two blanks at the end, and attach the file(s)
you're working on (plus a manufacturer XML if the task needs the library).

---

I'm building **BroSafe**, a standalone local functional-safety report generator (Project
Details, Risk Assessment, Safety Requirement Spec, Components, Verification, Validation, LOTO,
Audits, Custom Reports, Settings). It runs by opening `index.html` in Edge/Chrome from
`file://`, often from a NAS path.

**Hard constraints — do not break:**

- No server, no build step, no npm, no internet, no CDN. Runs from `file://`.
- **No ES modules** — no `import`/`export`, no `<script type="module">`, no `fetch()` of local
  files. Code lazy-loads by injecting classic `<script>` tags via `SH.loader.load(src)`.
- One global namespace **`SH`**. No other globals.
- `index.html` is **frozen** — never add feature scripts to it.
- No `localStorage` for project data; project data is JSON files on disk.
- The app is **unbranded and vendor-neutral**. No company names, logos or brand colours in the
  code or UI. Client details live in project data only.

**Architecture:**

- Shell = `index.html` (fixed header + fixed left menu + content area) loading only core
  scripts: `js/core.js`, `js/loader.js`, `js/store.js`, `js/router.js`, `js/app.js`.
- Hash router (`#/page/tab`). Left menu defined only in `SH.MENU` (`js/app.js`).
- Page = `pages/<id>/<id>.js` using
  `SH.registerPage(id, SH.tabbedPage({ title, tabs:[{id,label,src}] }))`.
- Sub-tab = `pages/<id>/tabs/<tab>/<tab>.js` using
  `SH.registerTab(page, tab, { mount:function(host,ctx){ /* render into host only */ } })`.
- **Two stores, kept strictly separate:**
  `SH.store` = the open **project** (project folder, per job).
  `SH.settings` = **app config** — company details, logo, report themes, report layout,
  information sections, custom components (BroSafe data folder, chosen once).
  Company/logo/theme never go in `project.json`; client details never go in settings or code.
  Mutate only via store methods; listen with `SH.bus.on('project:changed'|'settings:changed', fn)`.
  Persistence (File System Access API) lives in those stores and may still be stubbed.
- Information sections (reusable report boilerplate, e.g. Common Cause Failure) live in
  `content/sections/<id>.js` and register via `SH.content.register()`. They **cannot** be
  `fetch()`ed on `file://`; lazy-load with `SH.content.load(id)`. Images use relative
  `<img src="assets/content/x.png">`, which does work from `file://`. User edits are saved as
  overrides in the data folder and never modify the shipped files.
- Styling: CSS variables in `css/app.css` only — never hard-code colours. Palette is hi-vis
  safety yellow/orange on black and greys; yellow/orange are signal colours (active state,
  primary action, warnings), not decoration. Reuse `.card/.field/.grid2/.btn/.warnnote`.

**Revision rule (important):** every file starts with a header block giving `File`, `Rev`,
`Updated`, `Requires` and a one-line purpose. Bump `Rev` + `Updated` on any change and add a
`CHANGELOG.md` entry. App version lives only in `SH.VERSION` (`js/core.js`) and renders in the
header.

**Rules for your changes:**

- Work **only inside the relevant `pages/<page>/...` file(s)** unless I say otherwise. Don't
  modify `index.html` or core files unless the task truly requires it — and say so if it does.
- Give me **complete file contents** for anything you change, with the header block updated.
- Keep it runnable from `file://`. `mount(host,ctx)` renders into `host` only.
- If you need a shared capability (calc, library parsing, report rendering), propose it as a
  `js/<name>.js` service rather than duplicating logic in a tab.
- Ask before changing a JSON schema; schema changes are a MAJOR version bump.

Reference docs in the repo: `docs/PROJECT_INSTRUCTIONS.md`, `docs/DATA_MODEL.md`,
`docs/ARCHITECTURE.md`.

**What I want to do in this session:** ______________________________________________

**Files I've attached:** ____________________________________________________________
