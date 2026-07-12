# FS Workbench — Claude Project setup

**Rev 0.13.1 · 2026-07-09**

How to configure the Claude Project so every chat starts with the right context.

---

## 1. Custom Instructions

Paste **`docs/PROJECT_INSTRUCTIONS.md`** in full, replacing what's there.

---

## 2. Project knowledge

Upload these files, replacing old copies:

| File | Why |
|---|---|
| `docs/API.md` | full `SH` surface — avoids attaching core source |
| `docs/DATA_MODEL.md` | `project.json`, `settings.json`, section files, schemas |
| `docs/OWNERSHIP.md` | which chat owns which file |
| `docs/PROJECT_INSTRUCTIONS.md` | rulebook (searchable) |
| `docs/ARCHITECTURE.md` | why it is built this way |
| `CHANGELOG.md` | what changed and what the fix was |
| `pages/settings/tabs/company/company.js` | reference tab to copy |

**Upload your own current `company.js`** — not a copy from a bundle.

Do **not** upload: the whole zip; `libraries/*.xml` (large, attach per-chat if needed).

---

## 3. Per-chat: attach only what the task touches

| Task | Attach |
|---|---|
| Any tab | page controller + the tab file |
| Project data / store | `js/store.js` |
| Settings / themes | `js/settings.js` (+ `js/theme.js` if themes) |
| Information sections | `js/content.js` + one `content/sections/*.js` |
| Version Control / Report tabs | `js/doc-tabs.js` |
| Library / component work | manufacturer VDMA XML |
| Menu / navigation | `js/app.js` |
| Lifecycle / routing | `js/core.js` + `js/router.js` |

---

## 4. Keep knowledge fresh

Re-upload `API.md`, `DATA_MODEL.md` and `CHANGELOG.md` whenever they change. A stale
schema in Project knowledge is trusted and will produce wrong code.

Start each chat: *"We're on v0.13.1"* — drift becomes obvious in one line.

---

## 5. Watch for contention

Tabs are independent — parallel tab chats are safe. These are not:

`js/core.js` · `js/loader.js` · `js/store.js` · `js/settings.js` · `js/theme.js` ·
`js/content.js` · `js/doc-tabs.js` · `js/router.js` · `js/app.js` · `js/lib.js` ·
`css/app.css` · `css/fonts.css` · `index.html` · `docs/DATA_MODEL.md` · `CLAUDE.md`

---

## 6. After copying files out of a chat

Every FS Workbench file names itself on **line 3** of its header:

```
   File:     js/core.js
```

Check it after copying. Downloads collide (`core.js`, `core.js (1)`). Two files are called
`settings.js` — `js/settings.js` (the store) and `pages/settings/settings.js` (the page
controller). Since v0.7.3 the boot guard catches the swap and names the file.

---

## 7. Claude Code

`CLAUDE.md` at the repo root is read automatically by Claude Code every session. It imports
`docs/OWNERSHIP.md`, `docs/API.md` and `docs/PROJECT_INSTRUCTIONS.md` with `@` syntax.
Keep `CLAUDE.md` under 80 lines — it's always in context. Detailed rules live in the
referenced docs.
