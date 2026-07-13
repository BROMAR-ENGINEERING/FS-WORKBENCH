# FS Workbench — Recent Changes

**Rev 0.14.0 · 2026-07-09**

What every chat needs to know about the last few releases without being told.
This file lives in Project Knowledge and is read by every session.

Ordered newest first. When an item is older than three or four releases and no
longer surprises anyone, remove it — this file is for what's currently novel,
not history. That's what `CHANGELOG.md` is for.

---

## v0.14.0 — new schema keys

Three additive keys, back-filled by `SH.store._normalize()`. No migration —
existing projects open unchanged and pick up the defaults on next save.

**Shared Device Register** — `project.devices[]`

```js
var devices = SH.store.get('devices', []);
// [{ id, tag, description, type, manufacturer, model,
//    source, libraryRef, wiring:[{ label, wire }] }]
```

Same pattern as `project.areas[]`. Reference devices by `id`, never duplicate a
tag. Deleting a device must be blocked or cascade-warned if anything references
it.

**Per-SF device assignments** — `project.sfs[i].inputs / .logic / .outputs`

```js
var sfs = SH.store.get('sfs', []);
// each sf has: inputs:[deviceId], logic:[deviceId], outputs:[deviceId]
```

**Validation method** — `project.validation.method`

```js
var method = SH.store.get('validation.method', null);
// null | 'comprehensive' | 'simplified'
```

Full spec: `docs/DATA_MODEL.md` → *The shared Device Register*.

---

## v0.13.2 — boot resilience

`SH.IDB` is now read lazily inside `store.js` and `settings.js` — a version
mismatch produces the boot guard's clear "not loaded" message rather than a
silent crash.

**Impact on tabs:** none. This is core plumbing.

---

## v0.13.1 — `SH.modal()` on the SH namespace

Tab files can now open modal dialogs without reaching into `js/app.js`.

```js
SH.modal('Change something', bodyEl, [
  { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
  { label: 'Confirm', onClick: function (close) { /* … */ close(); } }
]);
```

`bodyEl` is a DOM node built with `SH.el(...)`. Actions render as buttons in
a footer bar.

**Impact on tabs:** stop building your own modals — call `SH.modal`.

---

## v0.12.0 — brand and fonts

Product renamed to **FS Workbench**. The name lives only in `SH.APP` in
`js/core.js` — everywhere else reads `SH.APP_NAME`. Never hard-code the name.

Fonts (IBM Plex Sans/Mono, Space Grotesk) are embedded as base64 in
`css/fonts.css`. **Never add a Google Fonts `@import` or a `@font-face` with a
relative `url()`** — both fail on `file://`.

Palette moved to amber-led signal system on soft-graphite dark chrome.
`--yellow*` remain as aliases of `--amber*` so tab files written earlier keep
working. Prefer `--amber*` in new code.

**Impact on tabs:** use `SH.APP_NAME` in any user-facing text that names the
product. Use `--amber*` for new signal colours.

---

## v0.10.0 – v0.11.0 — data folder resilience

`SH.settings.status()` returns `'gone'` when a granted permission points at a
deleted folder — a granted handle is no longer trusted without probing the
directory. `SH.settings.permission()` returns `'granted' | 'prompt' | 'none'`.

**Impact on tabs:** if a settings tab reads a data-folder file, guard with
`SH.settings.hasDataFolder()` and check `status()`.

---

## How to use this file

- **In a new tab chat.** Read this before writing anything. If a schema key
  or shared service you need is here, use it.
- **In the core chat.** Add a new entry at the top on every meaningful change
  that affects a tab file. Prune the bottom when items are no longer surprising.
- **In any chat.** If a broadcast prompt would have told you something once,
  it belongs here instead. Broadcasts vanish; this file persists in Project
  Knowledge.

Detailed API reference: `docs/API.md`.
Detailed schema: `docs/DATA_MODEL.md`.
Full history: `CHANGELOG.md`.
