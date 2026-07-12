# FS Workbench — File Ownership

**Rev 0.13.1 · 2026-07-09**

FS Workbench is built across several chats. This document says **who may write which file**.

---

## The core chat owns

| Path | What |
|---|---|
| `index.html` | shell |
| `css/app.css` `css/fonts.css` | shared styles + design tokens + embedded fonts |
| `js/*.js` | core services: `core` `loader` `store` `settings` `theme` `content` `doc-tabs` `router` `app` |
| `pages/<page>/<page>.js` | **page controllers only** |
| `docs/*` `CHANGELOG.md` `README.md` `CLAUDE.md` | documentation + repo guardrails |
| `content/sections/*.js` | shipped information-section seeds |
| `test/*` | test harnesses |
| `.gitignore` | repo config |

## Each tab chat owns

| Path | What |
|---|---|
| `pages/<page>/tabs/<tab>/<tab>.js` | **the sub-tab module and nothing else** |

## Shared services owned by another chat

| Path | Owner | Note |
|---|---|---|
| `js/lib.js` | Component Libraries chat | VDMA 66413 parser. Lazy-loaded; **never** added to `index.html`. |

## Contention list — edit in ONE chat at a time

`js/core.js` · `js/loader.js` · `js/store.js` · `js/settings.js` · `js/theme.js` ·
`js/content.js` · `js/doc-tabs.js` · `js/router.js` · `js/app.js` · `js/lib.js` ·
`css/app.css` · `css/fonts.css` · `index.html` · `docs/DATA_MODEL.md` · `CLAUDE.md`

## Rules for the core chat

1. **Never create, rename, move or delete a file under `pages/*/tabs/`.**
2. **Never rename a tab id.** The id in the page controller must match the id the tab
   file passes to `SH.registerTab(page, id, ...)`.
3. If a sub-tab must change, **hand back a prompt to paste into that tab's chat**.
4. If the core chat needs to read a sub-tab, **ask for it to be pasted in**.
5. Changing a core service in a way that affects tabs means writing a **broadcast note**.

## Rules for a tab chat

1. Touch **only** `pages/<page>/tabs/<tab>/<tab>.js`.
2. Need a menu entry, new sub-tab, new shared service, or schema change?
   **That belongs in the core chat.** Say so; don't do it.
3. Consume `SH.store`, `SH.settings`, `SH.theme`, `SH.content`, `SH.docTabs`, `SH.modal`;
   never duplicate their logic locally.
4. Don't edit `js/*`, `index.html`, `css/*` or the page controller.

## Where JSON schemas are decided

`docs/DATA_MODEL.md` is the single source of truth. **Schema changes are core chat only.**
A tab must not invent new persisted keys — raise it in the core chat first, where it will
be added to `blankProject()` AND `SH.store._normalize()`.
