# FS Workbench — Architecture

**Rev 0.13.1 · 2026-07-09**

Why it is built this way. `docs/API.md` says *what* the surface is; this says *why*.

---

## The one constraint everything follows from

FS Workbench must run by double-clicking `index.html` on a local or network path, on a
locked-down machine, with no server, no install and no internet.

| We can't | Because | So we |
|---|---|---|
| use ES modules | `file://` blocks module loading | inject classic `<script>` tags (`SH.loader`) |
| `fetch()` a local file | `file://` is an opaque origin | ship data as `.js` that self-registers, or read through a directory handle |
| use npm, a bundler, or a CDN | no build step, no internet | one global `SH`, hand-written ES5-compatible JS |
| use `localStorage` for data | invisible, unbackupable, per-origin | write JSON files the user can see, copy and back up |
| use web fonts via CDN or relative url() | CDN needs internet; fonts are CORS subresources, `file://` is opaque | embed fonts as base64 data: URIs in `css/fonts.css` |

The corollary: **the filesystem is the database.** Projects are folders; libraries are
folders; sections are folders. There is no index that can drift from disk.

---

## Three trees, deliberately separate

```
1. Install tree   (repo)      the app + shipped content seeds
2. Data folder               company, logo, themes, sections, custom components, libraries
3. Project output tree       one folder per job: project.json + per-SF JSON files
```

Different lifetimes, different owners. Your company logo outlives every project. A client's
hazard register must never travel with the app. This is why there are two stores, and why
"company/logo/theme never go in `SH.store`; client details never go in `SH.settings`" is
stated so bluntly. Every leak across that boundary is a confidentiality bug.

---

## `SH` — one namespace, nine core scripts

```
core → loader → store → settings → theme → content → doc-tabs → router → app
```

Load order is a dependency order. `index.html` is frozen so adding a page never requires
touching the shell. `app.js` boots with a **feature-detecting guard** that names the
offending file when a core service is missing or stale.

---

## Pages and tabs are kept alive

Originally every navigation cleared `#content` and re-ran `mount()`. Simple, but silently
destroyed anything the user had typed.

Now each page and tab gets a container that is **hidden**, never destroyed. `mount()` runs
once. The cost: a tab must subscribe to `project:changed` or implement `onShow()` to stay
current. That trade is worth it — losing a half-filled hazard row is a real harm, and a
stale tab is a visible, fixable one.

A broken page must not take its siblings down. Errors render inside that page's own
container; the router no longer writes failures into `#content`.

---

## Custom page controllers

When a page's tab set depends on runtime state, `SH.tabbedPage()` is not enough — it
hardwires the tabs at registration time. The Validation page is the canonical example:
the tabs change depending on whether the user chose Comprehensive or Simplified validation.

The solution is a plain object registered with `SH.registerPage()`:

```js
SH.registerPage('validation', {
  title: 'Validation',
  mount:   function (host, ctx) { /* subscribe, render */ },
  onTab:   function (tabId)     { /* standard tab switching */ },
  destroy: function ()          { /* cleanup */ }
});
```

The object subscribes to `project:changed` in `mount()` and re-renders when
`project.validation.method` changes, switching between the method-selector card and the
appropriate tab set.

---

## Snapshots, not references

A verification report is signed off. Component values (`PFHd`, `PL`, `category`, `B10d`)
are **copied into `sf/sf_<id>.json`** at the moment of verification. The library reference
stored alongside is provenance only (`slug`, `file`, `crc32`, `uid`, `useCaseIndex`).
`crc32` detects a library update. The report itself never moves.

---

## Schema evolution

`blankProject()` defines the shape of a new project. But a project created before a key
existed won't have it. `SH.store._normalize()` is called on every project open and
back-fills missing keys to their defaults. Every MINOR schema addition must go in both
places. This is what prevents "cannot read property X of undefined" errors on old projects.

---

## Real data beats assumption

Three vendor libraries (Pilz, Schneider, Rockwell) disagree about almost everything:
decimal comma vs point, `/` vs `\`, `PNG/` vs `png/`, hierarchy depth, whether icons
exist. Every one of those was found by parsing the actual files.

Two findings changed the design:
- **Rockwell supplies only `Hierarchy1` on 379 of 420 use cases.** `SH.lib.search()`
  offers no hierarchy filter — it filters on function and category instead.
- **A repeated device `uid` is not a duplicate.** Pilz ships `8176540` twice: Cat 3/PL d
  and Cat 4/PL e — a 68× better option. `parse()` merges them; discarding would hide it.

---

## Case folding, and why it lives in one place

Vendors ship `PNG/` and `png/`. `exists()`, `resolve()` and `fileUrl()` all fold case —
all three, or none. When only two did, a guard like `if (!await exists(p)) return null;`
before `fileUrl(p)` dropped every icon on one vendor's library, silently.

---

## What is deliberately not here

- **No framework.** Nothing to install, nothing to explain to an auditor.
- **No index files.** Scanning a directory cannot desync from the directory.
- **No server.** The moment FS Workbench needs one, it stops being something you can
  hand to a client on a USB stick.
- **No branding in code.** The product name is a single constant in `js/core.js`.
  One line renames the tool for another consultant.
