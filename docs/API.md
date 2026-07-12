# FS Workbench — `SH` API reference

**Rev 0.13.1 · 2026-07-09**

Everything a page or tab module can use. Attach this to a new chat instead of the core source.

---

## Registration

```js
// pages/<id>/<id>.js — standard page (fixed tab set)
SH.registerPage('<id>', SH.tabbedPage({
  title: '<Page Title>',
  tabs: [ { id:'<tab>', label:'<Tab Label>', src:'pages/<id>/tabs/<tab>/<tab>.js' } ]
}));

// pages/<id>/<id>.js — custom page (dynamic tab set or special layout)
SH.registerPage('<id>', {
  title: '<Page Title>',
  mount:   function (host, ctx) { /* build the page into host */ },
  onTab:   function (tabId)     { /* called by the router on hash change */ },
  destroy: function ()          { /* called if the page is torn down */ }
});

// pages/<id>/tabs/<tab>/<tab>.js — tab module
SH.registerTab('<page>', '<tab>', {
  mount:   function (host, ctx) { /* render into host ONLY. ctx = {page, tab} */ },
  onShow:  function () { /* optional: tab revealed again */ },
  unmount: function () { /* optional: release listeners/blob URLs */ }
});
```

**Tabs and pages are kept alive (v0.6.0+).** `mount()` runs **once**. Switching hides the
DOM. Subscribe to `project:changed` or implement `onShow()` if a tab must refresh on return.
`unmount()` runs only on page teardown.

## Constants

| | |
|---|---|
| `SH.VERSION` | app version string e.g. `'0.13.1'` |
| `SH.APP` | `{ name, accent }` — the product name. Read `SH.APP_NAME` everywhere. |
| `SH.APP_NAME` | shorthand for `SH.APP.name` — use this in messages/errors/UI |
| `SH.IDB` | `{ name, store, legacy }` — the IndexedDB descriptor |
| `SH.MENU` | left-menu manifest (`js/app.js`) |

## DOM helpers

```js
SH.el(tag, attrs, ...children)   // attrs: {class, html, onClick, any-attribute}
SH.esc(str)                      // HTML-escape
SH.qs(selector, root)            // querySelector
SH.modal(title, bodyEl, actions) // app-level modal dialog
```

`SH.modal` actions: `[{ label, ghost?, onClick: function(closeFn){ … } }]`

## Event bus

```js
SH.bus.on('project:changed',  function (project) { ... });   // data changed
SH.bus.on('project:status',   function (status)  { ... });   // save state only
SH.bus.on('project:root',     function (handle)  { ... });   // projects folder changed
SH.bus.on('settings:changed', function (settings){ ... });   // settings data changed
SH.bus.on('settings:status',  function (status)  { ... });   // settings save state
SH.bus.off('project:changed', fnRef);
SH.bus.emit('my:event', payload);
```

`project:changed` fires once per content mutation + on open/close/switch.
`project:status` carries the save state (`saved·saving·unsaved·memory`) — autosave noise.
Use `SH.store.projectId()` to distinguish "same project edited" from "different project opened".

## Lazy loading

```js
SH.loader.load('path/to/file.js').then(function(){ ... });  // injects a <script> once
```

---

## Store 1 — the open project (`SH.store`)

```js
SH.store.project                     // read directly
SH.store.hasProject()  SH.store.projectId()  SH.store.hasRoot()
SH.store.status()                    // 'none'|'memory'|'saved'|'unsaved'|'saving'
SH.store.path()                      // "<root> / <folder>" for display
SH.store.get('meta.client', '')      // safe read with default
SH.store.set('meta.client', 'Acme') // write + autosave + project:changed
SH.store.setMeta({ machine:'Kneader' })
// schema back-fill (called on every open)
SH.store._normalize(project)  // adds missing keys; call only if manually constructing

// projects root
await SH.store.pickRoot();            // picker — FIRST statement of a click handler
await SH.store.useRoot(handle, remember);
await SH.store.chooseRoot();          // pickRoot + useRoot
await SH.store.restoreRoot();         // silent re-attach at boot
await SH.store.listProjects();        // [{folder,name,client,documentNumber,jobNumber,savedAt,rev}]

// recent projects (handles cached in IndexedDB)
await SH.store.listRecents();         // [{id,name,client,jobNumber,folder,rootName,lastOpened,handle}]
await SH.store.openRecent(id);        // from a CLICK; .code = DENIED | GONE | INVALID
await SH.store.forgetRecent(id);  await SH.store.clearRecents();

// lifecycle
await SH.store.newProject({ name, client, jobNumber }, { root });
await SH.store.openProject(folder);        // by folder name inside root
await SH.store.openProjectFolder(handle?); // IS a project; does NOT change root
SH.store.closeProject();
await SH.store.save();
await SH.store.checkForNewerOnDisk();

// safety functions
await SH.store.saveSF(sf);  await SH.store.loadSF(id);  await SH.store.deleteSF(id);
```

**Root vs project folder.** The projects root *contains* projects. Adopting a project
folder as the root makes `listProjects()` return nothing.

`openRecent()` errors: `DENIED` (permission refused), `GONE` (folder deleted/moved — drop
from list), `INVALID` (folder exists, no `project.json`).

**Kept-alive tabs must subscribe:**

```js
mount: function (host) {
  var self = this;
  this._pid = SH.store.projectId();
  this._onProject = function () {
    var pid = SH.store.projectId();
    var switched = pid !== self._pid; self._pid = pid;
    if (switched || !SH.store.hasProject()) { self._render(); return; }
    if (host.contains(document.activeElement)) { self._pending = true; return; }
    self._render();
  };
  this._onBlur = function () { if (self._pending) self._render(); };
  this._render();
  SH.bus.on('project:changed', this._onProject);
  host.addEventListener('focusout', this._onBlur);
},
onShow:  function () { if (this._pending) this._render(); },
unmount: function () {
  SH.bus.off('project:changed', this._onProject);
  if (this._host) this._host.removeEventListener('focusout', this._onBlur);
}
```

---

## Store 2 — app config (`SH.settings`)

```js
SH.settings.get('theme.colors.accent', fallback);
SH.settings.set('company.name', 'Acme Safety');   // emits settings:changed

SH.settings.addCustomComponent({ desc:'...', role:'Output', pl:'d', category:'3' });
SH.settings.removeCustomComponent(id);
SH.settings.clearLogo();
SH.settings.reset();

// data folder
SH.settings.hasDataFolder();          // bool
SH.settings.path();                   // folder name, or ''
SH.settings.status();                 // 'none'|'memory'|'saved'|'unsaved'|'saving'
SH.settings.permission();             // 'granted'|'prompt'|'none'
await SH.settings.chooseDataFolder(); // picker — FIRST statement of a click handler
await SH.settings.restoreDataFolder();// boot; -> 'granted'|'prompt'|'gone'|'none'
await SH.settings.reconnectDataFolder(); // CLICK only; re-grants without a picker
await SH.settings.load();  await SH.settings.save();
await SH.settings.forget();
```

**`set()` never throws.** With no folder attached status() reports `'memory'`.
`save()` resolves `false` rather than rejecting.

**A granted permission does not mean the folder exists.** A handle to a deleted folder
reports `'granted'`. `restoreDataFolder()` and `reconnectDataFolder()` probe the directory
and return `'gone'`, discarding the stale handle. `js/app.js` shows a bar to choose a
new folder.

**`settings:changed` vs `settings:status`.** Redraw on `settings:changed`. Bind a save
indicator to `settings:status`. Apply the same keystroke-guard as project tabs.

**`'prompt'` is not `'none'`.** Chrome drops persisted `readwrite` grants; `reconnectDataFolder()`
re-grants without a picker. `js/app.js` surfaces this once, app-level. Never show a
reconnect prompt in a tab.

> Company/logo/theme **never** go in `project.json`. Client details **never** go in settings.

---

## Component libraries (`SH.lib`) — lazy-loaded

`js/lib.js` (Component Libraries chat) — VDMA 66413 parser. Never add to `index.html`.

```js
SH.loader.load('js/lib.js').then(function () { /* SH.lib ready */ });

SH.lib.parse(xmlText, {languages:['en']})
SH.lib.summarise(lib)
SH.lib.search(lib, {text, fn, category, pl, basis, includeArchived})
SH.lib.device(lib, uid)
SH.lib.useCase(lib, uid, index)
SH.lib.ref(lib, uid, index)          // -> {slug,file,crc32,uid,useCaseIndex} provenance

await SH.lib.slugs()  await SH.lib.list()  await SH.lib.load(slug, {force})
await SH.lib.install(srcDir, {replace, onProgress, token})  await SH.lib.remove(slug)
await SH.lib.iconUrl(lib, device)    // blob: URL or null — caller revokes
await SH.lib.docUrl(lib, device)
```

Never filter on hierarchy depth — Rockwell supplies only `Hierarchy1` on 379/420 use cases.
`iconUrl()` returning `null` is normal (Rockwell has zero icons). Never assign it to `src`.
A repeated `uid` is not a duplicate — `parse()` merges extra use cases.

---

## Information sections (`SH.content`)

```js
SH.content.all()         SH.content.load(id)   SH.content.get(id)
SH.content.variant(id, key)   SH.content.selected()
SH.content.register('id', { title, category, variants:{ default:{ label, html } } })
```

---

## Report theme (`SH.theme`)

```js
SH.theme.active()   SH.theme.list()   SH.theme.get(id)   SH.theme.setActive(id)
SH.theme.bandCss(theme, 'header')   SH.theme.css('.preview', theme)
var detach = SH.theme.attach(host, '.preview');   // in unmount(): detach()
```

---

## Shared document tabs (`SH.docTabs`)

```js
SH.docTabs.versionControl(docId, { title });  // -> project.documents[docId].revisions
SH.docTabs.report(docId, { title });          // -> settings.reports[docId]
```

`docId` values: `risk-assessment` · `srs` · `verification` · `validation` · `loto`

---

## CSS variables and classes

**Never hard-code a colour.** Use these variables:

Surfaces: `--black --black-2 --black-3 --ink --graphite --muted --line --line-2 --line-dark --paper --card`
Signal:   `--amber --amber-deep --amber-soft --amber-glow --orange --orange-deep --orange-soft --steel --steel-deep --steel-soft`
Status:   `--pass --pass-soft --fail --fail-soft --warn --warn-soft`
Elevation:`--shadow-1 --shadow-2 --shadow-3 --radius`
Type:     `--mono --sans --display --header-h --nav-w`

`--yellow*` = aliases of `--amber*` (pre-0.12.0 compatibility).

**Amber is the signal colour**: primary action and active state only. Keep it sparse.

Classes: `.card .stub .stub.error .field .grid2 .grid3 .btn .btn.ghost .btn.danger .btn.sm
.chk .tbl .hint .warnnote .pill h2.section .chip .chip-ok .chip-warn .chip-bad
.proj-item .loc-row .loc-path .modal .modal-acts .modal-err .tabbar .tab .tab-host`

Tab-specific CSS: inject a scoped `<style>` inside `mount()`.

---

## Hard constraints (summary)

1. `file://` only — no server, build, npm, internet, CDN
2. No ES modules, no `fetch()` of local files
3. One global: `SH`
4. `index.html` frozen
5. No `localStorage` for data
6. `SH.APP_NAME` everywhere — never a string literal for the product name
7. Complete file + bumped header + CHANGELOG entry on every change
8. Version only in `SH.VERSION`
9. Probe before trusting a granted handle
10. No network fonts; no relative `@font-face` — both fail on `file://`
