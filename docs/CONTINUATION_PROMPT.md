# FS Workbench — starting a new chat

**Rev 0.13.1 · 2026-07-09**

Paste the relevant block at the top of a new chat, after the Project instructions are in place.

---

## A. Core chat

> We're on **FS Workbench v0.13.1**. This is the **CORE chat**.
>
> It owns `index.html`, `css/app.css`, `css/fonts.css`, `js/*` (except `js/lib.js`),
> the page controllers `pages/<page>/<page>.js`, `docs/*`, `CHANGELOG.md` and `CLAUDE.md`
> — and all JSON schema decisions.
>
> **Sub-tabs (`pages/<page>/tabs/<tab>/<tab>.js`) are owned by their own chats.** Never
> create, rename, move or delete anything under `pages/*/tabs/`, and never rename a tab id.
> If a sub-tab must change, give me a **prompt to paste into that tab's chat**. If you need
> to see a sub-tab file, ask me to paste it in. If a core change affects tabs, give me a
> **broadcast note** for the tab chats.
>
> Return complete file contents for anything you change, with the header `Rev`/`Updated`
> bumped, and a `CHANGELOG.md` entry. Verify against real artefacts where they exist.
>
> Today's task: ...

---

## B. Tab chat

> We're on **FS Workbench v0.13.1**. This chat owns exactly one file:
> `pages/<page>/tabs/<tab>/<tab>.js`. Touch nothing else.
>
> Menu entries, new sub-tabs, new shared services, CSS classes and JSON schema changes
> belong in the **core chat** — say so, don't do them here.
>
> Remember:
> - `mount(host, ctx)` runs **once** (tabs are kept alive). Add `onShow()` to refresh on
>   return, and subscribe to `SH.bus.on('project:changed', ...)` to react to project edits.
>   A tab first opened with no project will keep saying so forever unless it subscribes.
> - Guard keystroke writes against echoing — use `SH.store.projectId()` + a focus guard +
>   `_pending` flag. Re-render on `focusout` and in `onShow()`.
> - `unmount()` runs only on page teardown. Revoke blob URLs and clear timers there.
> - Reuse `SH.store`, `SH.settings`, `SH.theme`, `SH.content`, `SH.docTabs`, `SH.modal`,
>   `SH.lib`. Never duplicate their logic.
> - Never `fetch()` a local file. Never assign `''` or `null` to `src`.
> - `showDirectoryPicker()` must be the first statement of a click handler.
> - Use `SH.modal(title, bodyEl, actions)` for confirm dialogs — never build your own.
> - Use `SH.APP_NAME` in any user-facing text that names the product.
>
> Return the complete file with the header `Rev`/`Updated` bumped and a one-line changelog entry.
>
> Today's task: ...

---

## C. Component Libraries chat

> We're on **FS Workbench v0.13.1**. This chat owns `js/lib.js` and the tab
> `pages/settings/tabs/libraries/libraries.js`.
>
> `js/lib.js` is lazy-loaded via `SH.loader.load('js/lib.js')` and is **never** added to
> `index.html`. It needs `SH.settings` >= 0.8.1 for the data-folder file API.
>
> Today's task: ...
