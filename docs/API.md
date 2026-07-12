# BroSafe — `SH` API reference

**Rev 0.4.0 · 2026-07-09**

Everything a page or tab module can use. Attach this to a new chat instead of the core source.

---

## Registration

```js
// pages/<id>/<id>.js — page controller (declares sub-tabs only)
SH.registerPage('<id>', SH.tabbedPage({
  title: '<Page Title>',
  tabs: [ { id:'<tab>', label:'<Tab Label>', src:'pages/<id>/tabs/<tab>/<tab>.js' } ]
}));

// pages/<id>/tabs/<tab>/<tab>.js — tab module
SH.registerTab('<page>', '<tab>', {
  mount:   function (host, ctx) { /* render into host ONLY. ctx = {page, tab} */ },
  unmount: function () { /* optional: remove bus/window listeners, clear timers */ }
});
```

`mount()` runs every time the tab is opened. Render into `host`; never touch the header,
sidebar or another tab's DOM.

**If you call `SH.bus.on(...)` in `mount()`, you must remove it in `unmount()`** — otherwise a
duplicate listener is added each time the tab is opened. `unmount()` is called on the outgoing
tab before its DOM is discarded. See `pages/settings/tabs/company/company.js` for the pattern.

## Constants

| | |
|---|---|
| `SH.VERSION` | app version string, e.g. `'0.3.0'` (single source of truth) |
| `SH.BUILD` | build date |
| `SH.MENU` | left-menu manifest (`js/app.js`) |

## DOM helpers

```js
SH.el(tag, attrs, ...children)   // attrs: {class, html, onClick, any-attribute}
SH.esc(str)                      // HTML-escape
SH.qs(selector, root)            // querySelector
```

`SH.el` example:
```js
var btn = SH.el('button', { class:'btn', onClick: save }, 'Save');
var row = SH.el('div', { class:'grid2' }, btn, SH.el('span', null, 'text'));
```

## Event bus

```js
SH.bus.on('project:changed',  function (project) { ... });
SH.bus.on('settings:changed', function (settings) { ... });
SH.bus.off('project:changed', fnRef);   // required if you subscribed in mount()
SH.bus.emit('my:event', payload);
```
Never poll. React to these events.

## Lazy loading

```js
SH.loader.load('path/to/file.js').then(function(){ ... });  // injects a <script> once
```
Use this for any code loaded on demand. Do **not** use `fetch()` for local files.

---

## Store 1 — the open project (`SH.store`)

Per-job data, written to the project folder.

```js
SH.store.project           // { meta:{...}, sfs:[...], _rev }  — read directly
SH.store.hasProject()      // boolean
SH.store.newProject(meta)  // create in memory (+ folder, once persistence lands)
SH.store.setMeta(patch)    // merge into project.meta, marks dirty, emits project:changed

// persistence contract (currently stubbed — throws)
await SH.store.chooseRoot();
await SH.store.openProject();
await SH.store.save();
```

**Mutate only through store methods.** They own autosave.

## Store 2 — app config (`SH.settings`)

Config that outlives any project: company, logo, themes, report layout, information sections,
custom components. Written to the **BroSafe data folder**.

```js
SH.settings.get('theme.colors.accent', fallback);
SH.settings.set('company.name', 'Acme Safety');   // emits settings:changed

SH.settings.addCustomComponent({ desc:'…', role:'Output', pl:'d', category:'3' });
SH.settings.removeCustomComponent(id);
SH.settings.clearLogo();
SH.settings.reset();

// stubbed — throws
await SH.settings.chooseDataFolder();
await SH.settings.load(); await SH.settings.save();
```

> Company/logo/theme **never** go in `project.json`. Client details **never** go in settings.

## Information sections (`SH.content`)

```js
SH.content.all();                    // manifest [{id,title,category,src}]
SH.content.load(id).then(sec => …);  // lazy-load a section script
SH.content.get(id);                  // loaded definition
SH.content.variant(id, key);         // user override wins over shipped default
SH.content.selected();               // [{id, variant}] to include in a report
```

Shipped sections live in `content/sections/<id>.js` and self-register:
```js
SH.content.register('my-section', {
  title: 'My Section', category: 'ISO 13849-1',
  variants: { default: { label:'Standard', html:'<h2>…</h2>' } }
});
```
Images: relative `<img src="assets/content/x.png">` — works from `file://` (unlike `fetch`).

## Shared document tabs (`SH.docTabs`)

Risk Assessment, SRS, Verification, Validation and LOTO all need the same *Version Control* and
*Report* tabs. Do **not** write them again — the tab file is a three-liner:

```js
// pages/srs/tabs/report/report.js
SH.registerTab('srs', 'report', SH.docTabs.report('srs', { title:'Safety Requirement Specification' }));
```

```js
SH.docTabs.versionControl(docId, { title });  // revision history -> project.documents[docId].revisions
SH.docTabs.report(docId, { title });          // inclusions       -> settings.reports[docId]
```

`docId` ∈ `risk-assessment` · `srs` · `verification` · `validation` · `loto`.

---

## CSS you can use (from `css/app.css`)

**Never hard-code a colour.** Use these variables:

`--black --black-2 --black-3 --ink --graphite --muted --line --line-dark --paper --card`
`--yellow --yellow-deep --yellow-soft --orange --orange-deep --orange-soft`
`--pass --pass-soft --fail --fail-soft --warn --warn-soft`
`--mono --sans --header-h --nav-w`

Yellow/orange are **signal** colours: active state, primary action, warnings. Not decoration.

**Classes:** `.card` `.stub` `.stub.error` `h2.section` `.hint` `.field` `.grid2` `.grid3`
`.btn` `.btn.ghost` `.btn.danger` `.pill` `.warnnote` `.chk` `.tbl` `code` `.tabbar` `.tab` `.tab-host`

Tab-specific CSS: inject a scoped `<style>` inside `mount()`, prefixed with a tab-specific
class. Don't add to `app.css` unless genuinely shared.

---

## Hard constraints (repeat)

1. Runs from `file://` in Edge/Chrome. No server, build step, npm, internet or CDN.
2. No ES modules. No `import`/`export`. No `<script type="module">`.
3. No `fetch()` of local files.
4. One global: `SH`.
5. `index.html` is frozen.
6. No `localStorage` for project data or settings.
7. Every file carries a `File / Rev / Updated / Requires` header. Bump `Rev` on change and add
   a `CHANGELOG.md` entry.
