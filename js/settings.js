/* ==============================================================
   FS Workbench — application settings store
   File:     js/settings.js
   Rev:      0.13.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   SH.settings is the SECOND store. It holds app-level configuration
   that outlives any single project: the safety professional's company
   details and logo, report themes, report layout, information sections
   and the user's custom (non-SISTEMA) component library.

   Backed by the data folder (chosen once, handle cached in
   IndexedDB) — NOT by the project folder and NOT by localStorage.

       <data folder>/
         settings.json
         assets/logo.png
         themes/<themeId>.json
         components.json
         sections/<category>/<sectionId>/section.json
         sections/<category>/<sectionId>/assets/<file>

   A section is a SELF-CONTAINED FOLDER. Moving it between categories
   is one directory move; copying it to another data folder by hand is
   one drag. deleteSection() removes the folder, so assets can never
   be orphaned.

   0.11.0 — a handle to a DELETED folder still reports permission 'granted',
          so the app attached it, reported status 'saved', and every write
          failed silently. Both restore and reconnect now probe the directory
          and return 'gone', discarding the stale handle.
   0.11.1 — SH.IDB read lazily (same fix as store.js v0.9.3).
   0.10.0 — restoreDataFolder() no longer calls requestPermission(): that needs
          a live user gesture, so at boot it could only fail. It now returns
          'granted' | 'prompt' | 'none', and reconnectDataFolder() re-grants
          the cached handle from a click — no folder picker, ever again.
          Added hasDataFolder(), status(), path(), permission(), and the
          settings:status event. set() never throws; with no folder attached
          status() is 'memory' so a tab can say so.
   0.8.1 — exists() now folds case, matching resolve() and fileUrl(). It
          previously disagreed with them, so a guard of
          `if (!await exists(p)) return null;` before `await fileUrl(p)`
          silently dropped every asset in a differently-cased folder.
   0.8.0 — general data-folder file API for js/lib.js and any other
          consumer: exists, listDir, ensureDir, readFile, readText,
          writeText, writeBlob, deleteEntry, fileUrl, resolve.
          resolve() folds case, because vendors ship PNG/ and png/ and
          the File System Access API matches entry names exactly.
          sectionAssetUrl() is now a thin alias over fileUrl().
   0.5.0 — File System Access persistence: chooseDataFolder(), load(),
          save() (debounced), IndexedDB handle cache. Generic helpers
          writeJSON / readJSON / deleteFile (report-theme.js already
          calls the first two; until now they silently no-oped).
          Section adapter: listSections, saveSection, deleteSection,
          saveSectionAsset, sectionAssetUrl.
          settings schema -> brosafe.settings/2 (legacy
          informationSections[id].overrides is dropped on load; user
          content now lives in section folders, not in settings.json).
   0.3.0 — initial store, persistence stubbed.
   ============================================================== */
(function (SH) {

  /* ==============================================================
     Constants
     ============================================================== */

  var SCHEMA = 'fsworkbench.settings/2';
  /* Schemas written before the rename, at the same structural version. */
  var LEGACY_SCHEMAS = ['brosafe.settings/2'];

  /* Exactly these nine, lowercase, hyphenated. Used as folder names. */
  var SECTION_CATEGORIES = [
    'risk-assessment', 'srs', 'validation', 'verification',
    'category-architecture', 'ccf', 'performance-level',
    'standard-extracts', 'other'
  ];

  var SECTIONS_ROOT = 'sections';
  /* Lazy helpers — same reason as store.js: a top-level SH.IDB read throws
     if settings.js ever executes before core.js. */
  function idbName()  { return (SH.IDB && SH.IDB.name)  || 'fs-workbench'; }
  function idbStore() { return (SH.IDB && SH.IDB.store) || 'handles'; }
  var IDB_KEY = 'dataDir';

  var DEFAULTS = {
    schema: SCHEMA,
    appVersion: SH.VERSION,

    /* the safety professional using the program (not a client) */
    company: {
      name: '', abn: '', address: '', phone: '', email: '', website: '',
      licence: '',
      logo: null,                  // { file:'assets/logo.png', dataUrl?:'…' }
      preparedByDefault: ''
    },

    /* report themes — see pages/settings/tabs/report-theme/report-theme.js */
    themes: { list: null, activeId: null },

    /* report header / footer / title page */
    layout: {
      titlePage: {
        show: true, showLogo: true, logoWidth: 60,
        title: '{{documentType}}', subtitle: '{{project.machine}}',
        fields: ['client', 'documentNumber', 'version', 'date', 'author', 'reviewedBy']
      },
      header: { show: true, left: '{{company.name}}', center: '', right: '{{project.name}}', showLogo: false, rule: true },
      footer: { show: true, left: '{{document.number}} Rev {{document.version}}', center: '', right: 'Page {{page}} of {{pages}}' }
    },

    /* per-document report inclusions — written by js/doc-tabs.js */
    reports: {},

    /* custom, non-SISTEMA components */
    customComponents: [],

    prefs: { lastRootPath: '', confirmBeforeDelete: true }
  };

  /* ==============================================================
     Small helpers
     ============================================================== */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* Filenames the OS will accept, and that survive a hand-copy. */
  function safeName(s) {
    return String(s || '').replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
  }
  function splitExt(name) {
    var i = name.lastIndexOf('.');
    return i > 0 ? { base: name.slice(0, i), ext: name.slice(i) } : { base: name, ext: '' };
  }

  /* ---- IndexedDB: cache the directory handle between launches ---- */
  function idb(fn) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(idbName(), 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(idbStore()); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction(idbStore(), 'readwrite');
        var r = fn(tx.objectStore(idbStore()));
        tx.oncomplete = function () { db.close(); resolve(r && r.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      };
    });
  }
  function idbPut(v) { return idb(function (s) { return s.put(v, IDB_KEY); }); }
  function idbGet()  { return idb(function (s) { return s.get(IDB_KEY); }); }
  function idbDel()  { return idb(function (s) { return s.delete(IDB_KEY); }); }

  /* ==============================================================
     SH.settings
     ============================================================== */

  SH.settings = {

    data: null,             // loaded settings object
    dataDirHandle: null,    // FileSystemDirectoryHandle for the data folder
    loaded: false,
    dirty: false,
    saving: false,
    _perm: 'none',          // 'none' | 'prompt' | 'granted'
    sectionsCache: [],      // Array<section> — populated by loadSections()

    SECTION_CATEGORIES: SECTION_CATEGORIES,

    /* ------------------------------------------------------------
       Lifecycle
       ------------------------------------------------------------ */

    defaults: function () { return clone(DEFAULTS); },

    /* Runs on defaults so the UI works before any data folder exists. */
    init: function () {
      if (!this.data) this.data = this.defaults();
      this.loaded = true;
      SH.bus.emit('settings:changed', this.data);
      this._emitStatus();
      return this.data;
    },

    hasDataFolder: function () { return !!this.dataDirHandle; },

    /* Display name of the data folder, or ''. */
    path: function () { return this.dataDirHandle ? this.dataDirHandle.name : ''; },

    /* 'none'    settings not initialised yet
       'memory'  no data folder attached — edits live in RAM and WILL be lost
       'saving' | 'unsaved' | 'saved'                                        */
    status: function () {
      if (!this.loaded) return 'none';
      if (!this.dataDirHandle) return 'memory';
      if (this.saving) return 'saving';
      return this.dirty ? 'unsaved' : 'saved';
    },

    /* 'granted' attached and writable
       'prompt'  a handle is cached but the grant lapsed — needs a click
       'none'    nothing cached                                             */
    permission: function () { return this._perm; },

    _emitStatus: function () { SH.bus.emit('settings:status', this.status()); },

    get: function (path, fallback) {
      var o = this.data || DEFAULTS, parts = String(path).split('.'), i;
      for (i = 0; i < parts.length; i++) {
        if (o == null) return fallback;
        o = o[parts[i]];
      }
      return o === undefined ? fallback : o;
    },

    set: function (path, value) {
      if (!this.data) this.init();
      var parts = String(path).split('.'), o = this.data, i;
      for (i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
      }
      o[parts[parts.length - 1]] = value;
      this._touch();
    },

    /* `settings:changed` means the DATA changed. `settings:status` means only
       the save state moved. A tab that redraws on the former is not redrawn
       by its own autosave — the same split as project:changed / project:status.

       set() NEVER throws. With no data folder attached the write lands in
       memory and status() reports 'memory', so a tab can render the truth
       instead of a false "Saved". */
    _touch: function () {
      this.dirty = true;
      SH.bus.emit('settings:changed', this.data);
      this._emitStatus();
      this._queueSave();
    },

    /* Debounced write of settings.json. No-op with no data folder. */
    _queueSave: function () {
      var self = this;
      if (!this.dataDirHandle) return;    // stays dirty; status() reports 'memory'
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(function () {
        self.save().catch(function (e) { console.warn(SH.APP_NAME + ': settings not saved —', e); });
      }, 400);
    },

    /* ------------------------------------------------------------
       Data folder — one-time grant, handle cached in IndexedDB
       ------------------------------------------------------------ */

    chooseDataFolder: async function () {
      if (!window.showDirectoryPicker) {
        throw new Error('This browser cannot open folders. Use Microsoft Edge or Google Chrome.');
      }
      var h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'fsw-data' });
      this.dataDirHandle = h;
      this._cachedHandle = h;
      this._perm = 'granted';
      try { await idbPut(h); } catch (e) { console.warn(SH.APP_NAME + ': handle not cached —', e); }
      await this.load();
      return h;
    },

    /* Re-attach the cached handle at boot. NEVER calls requestPermission():
       that needs a live user gesture, and boot has none. Returns:

         'granted'  re-attached and loaded
         'prompt'   a handle is cached but Chrome dropped the grant — the app
                    must offer a ONE-CLICK reconnect, not a folder picker
         'gone'     the remembered folder has been deleted or moved; the stale
                    handle is discarded
         'none'     nothing cached; this machine has never chosen a folder

       Chrome does drop persisted readwrite grants, so 'prompt' is a normal
       state, not an error. Never treat it as "no folder" — that is how a
       user ends up re-picking the folder every session. */
    restoreDataFolder: async function () {
      var h;
      try { h = await idbGet(); } catch (e) { this._perm = 'none'; return 'none'; }
      if (!h) { this._perm = 'none'; return 'none'; }

      this._cachedHandle = h;
      var perm;
      try { perm = await h.queryPermission({ mode: 'readwrite' }); }
      catch (e) { perm = 'prompt'; }

      if (perm !== 'granted') { this._perm = 'prompt'; this._emitStatus(); return 'prompt'; }

      /* Permission survives the folder. A handle to a deleted folder still
         reports 'granted', so attaching it without a probe leaves
         hasDataFolder() true and status() reporting 'saved' while every write
         fails. Touch the directory before trusting it. */
      if (!(await probe(h))) return this._forgetDeadHandle();

      this.dataDirHandle = h;
      this._perm = 'granted';
      await this.load();
      return 'granted';
    },

    /* The remembered folder is not there any more (moved, renamed, deleted,
       or an unmounted network drive). Drop the stale handle so the app asks
       for a new folder instead of pretending to save. */
    _forgetDeadHandle: async function () {
      this.dataDirHandle = null;
      this._cachedHandle = null;
      this._perm = 'none';
      this.dirty = false;
      try { await idbDel(); } catch (e) { /* nothing to remove */ }
      console.warn(SH.APP_NAME + ': the remembered data folder no longer exists. Choose one in Settings \u2192 Data & Storage.');
      this._emitStatus();
      return 'gone';
    },

    /* Call from a CLICK. Re-grants the cached handle without a folder picker,
       so a user who reconnects never sees the picker again. */
    reconnectDataFolder: async function () {
      var h = this._cachedHandle;
      if (!h) { try { h = await idbGet(); } catch (e) { h = null; } }
      if (!h) { this._perm = 'none'; return 'none'; }

      var perm = await h.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { this._perm = 'prompt'; this._emitStatus(); return 'denied'; }
      if (!(await probe(h))) return this._forgetDeadHandle();

      this.dataDirHandle = h;
      this._perm = 'granted';
      await this.load();
      return 'granted';
    },

    forget: async function () {
      this.dataDirHandle = null;
      this._cachedHandle = null;
      this._perm = 'none';
      this.dirty = false;
      this.sectionsCache = [];
      try { await idbDel(); } catch (e) { /* nothing to remove */ }
      SH.bus.emit('settings:changed', this.data);
      this._emitStatus();
    },

    reset: function () { this.data = this.defaults(); this._touch(); },

    /* ------------------------------------------------------------
       settings.json
       ------------------------------------------------------------ */

    load: async function () {
      if (!this.dataDirHandle) throw new Error('No data folder is open.');
      var loaded = null;
      try { loaded = await this.readJSON('settings.json'); }
      catch (e) { loaded = null; }                       // first run: file absent

      var d = this.defaults();
      this.data = loaded ? migrate(mergeDefaults(d, loaded)) : d;
      this.data.appVersion = SH.VERSION;
      this.loaded = true;

      await this.loadSections();
      this.dirty = false;
      if (!loaded) await this.save();                    // seed the folder

      SH.bus.emit('settings:changed', this.data);
      this._emitStatus();
      return this.data;
    },

    save: async function () {
      if (!this.dataDirHandle) return false;
      if (!this.data) this.init();
      if (this.saving) return false;

      this.saving = true;
      this._emitStatus();
      try {
        this.data.schema = SCHEMA;
        this.data.appVersion = SH.VERSION;
        await this._writeJSONStrict('settings.json', this.data);
        this.dirty = false;
        return true;
      } finally {
        this.saving = false;
        this._emitStatus();
      }
    },

    /* ------------------------------------------------------------
       Generic file helpers.

       writeJSON / deleteFile never reject — report-theme.js calls them
       fire-and-forget inside a synchronous try/catch, which cannot catch
       an async rejection. They resolve true/false and log instead.
       Internal callers that must know about failure use the *Strict
       variants below, which do throw.
       ------------------------------------------------------------ */

    writeJSON: function (relPath, obj) {
      return this._writeJSONStrict(relPath, obj)
        .then(function () { return true; })
        .catch(function (e) { console.warn(SH.APP_NAME + ': could not write ' + relPath + ' —', e); return false; });
    },

    deleteFile: function (relPath) {
      return this._deleteStrict(relPath, false)
        .then(function () { return true; })
        .catch(function (e) { console.warn(SH.APP_NAME + ': could not delete ' + relPath + ' —', e); return false; });
    },

    readJSON: async function (relPath) {
      var fh = await this._fileHandle(relPath, false);
      var f = await fh.getFile();
      return JSON.parse(await f.text());
    },

    _writeJSONStrict: async function (relPath, obj) {
      var fh = await this._fileHandle(relPath, true);
      var w = await fh.createWritable();
      await w.write(JSON.stringify(obj, null, 2));
      await w.close();
    },

    _writeBlobStrict: async function (relPath, blob) {
      var fh = await this._fileHandle(relPath, true);
      var w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    },

    _deleteStrict: async function (relPath, recursive) {
      var parts = String(relPath).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, false);
      await dir.removeEntry(name, { recursive: !!recursive });
    },

    /* walk path segments, optionally creating them */
    _dir: async function (parts, create) {
      if (!this.dataDirHandle) throw new Error('No data folder is open.');
      var h = this.dataDirHandle, i;
      for (i = 0; i < parts.length; i++) {
        h = await h.getDirectoryHandle(parts[i], { create: !!create });
      }
      return h;
    },

    _fileHandle: async function (relPath, create) {
      var parts = String(relPath).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, create);
      return dir.getFileHandle(name, { create: !!create });
    },

    /* ==============================================================
       Information sections — the adapter the sections tab calls.

       On disk:  sections/<category>/<id>/section.json
                 sections/<category>/<id>/assets/<file>

       Asset paths stored in blocks are relative to the DATA FOLDER
       (e.g. "sections/ccf/sec_ab12/assets/fig-1.png"), because the tab
       hands sectionAssetUrl() a bare path with no section context.
       Changing a section's category therefore rewrites those paths —
       saveSection() does it, and returns the updated section so the
       tab renders the new paths immediately.
       ============================================================== */

    /* The cache owns private copies. Handing out a live reference lets a
       caller mutate cached state, which breaks change detection in
       saveSection() — notably the old-vs-new category comparison. */
    listSections: function () { return this.sectionsCache.map(clone); },

    getSection: function (id) {
      for (var i = 0; i < this.sectionsCache.length; i++) {
        if (this.sectionsCache[i].id === id) return clone(this.sectionsCache[i]);
      }
      return null;
    },

    _cachePut: function (sec) {
      var idx = -1, i;
      for (i = 0; i < this.sectionsCache.length; i++) {
        if (this.sectionsCache[i].id === sec.id) { idx = i; break; }
      }
      if (idx >= 0) this.sectionsCache[idx] = clone(sec);
      else this.sectionsCache.push(clone(sec));
    },

    /* Scan every category folder. Missing folders are normal, not errors. */
    loadSections: async function () {
      this.sectionsCache = [];
      if (!this.dataDirHandle) return this.sectionsCache;

      var root;
      try { root = await this._dir([SECTIONS_ROOT], false); }
      catch (e) { return this.sectionsCache; }           // no sections yet

      var seen = {};
      for (var i = 0; i < SECTION_CATEGORIES.length; i++) {
        var cat = SECTION_CATEGORIES[i], catDir;
        try { catDir = await root.getDirectoryHandle(cat, { create: false }); }
        catch (e) { continue; }

        for await (var entry of catDir.values()) {
          if (entry.kind !== 'directory') continue;
          try {
            var fh = await entry.getFileHandle('section.json', { create: false });
            var sec = JSON.parse(await (await fh.getFile()).text());
            sec.category = cat;                          // folder is the truth
            sec.id = sec.id || entry.name;

            // A scan-based store has no index to enforce uniqueness, and a
            // hand-copied folder can duplicate an id. Keep the first, warn.
            if (seen[sec.id]) {
              console.warn(SH.APP_NAME + ': duplicate section id "' + sec.id + '" in ' +
                seen[sec.id] + ' and ' + cat + '. Using ' + seen[sec.id] + '.');
              continue;
            }
            seen[sec.id] = cat;
            this.sectionsCache.push(sec);
          } catch (e) {
            console.warn(SH.APP_NAME + ': skipping ' + cat + '/' + entry.name + ' —', e.message);
          }
        }
      }
      this.sectionsCache.sort(function (a, b) {
        return (a.category + a.title).localeCompare(b.category + b.title);
      });
      return this.sectionsCache;
    },

    /* Write a section. Moves its folder (and rewrites asset paths) when
       the category changed. Returns the stored section. */
    saveSection: async function (section) {
      if (!this.dataDirHandle) throw new Error('No data folder is open. Choose one in Settings → Data & Storage.');
      if (!section || !section.id) throw new Error('Section needs an id.');
      if (SECTION_CATEGORIES.indexOf(section.category) === -1) {
        throw new Error('Unknown section category: ' + section.category);
      }

      var sec = clone(section);
      sec.schema = 'fsworkbench.section/1';
      sec.source = 'user';
      sec.rev = sec.rev || 1;
      sec.updated = sec.updated || today();
      delete sec.overrides;                              // no override concept

      var prev = this.getSection(sec.id);
      var moved = prev && prev.category !== sec.category;

      if (moved) {
        await this._moveSectionFolder(sec.id, prev.category, sec.category);
        sec.blocks = rewriteAssetPaths(sec.blocks, prev.category, sec.category, sec.id);
      }

      await this._writeJSONStrict(sectionJsonPath(sec.category, sec.id), sec);

      this._cachePut(sec);
      SH.bus.emit('settings:changed', this.data);
      return sec;
    },

    /* Remove the whole section folder — assets go with it. */
    deleteSection: async function (id, category) {
      if (!this.dataDirHandle) throw new Error('No data folder is open.');
      if (!id) throw new Error('deleteSection() needs an id.');
      var cat = category || (this.getSection(id) || {}).category;
      if (!cat) throw new Error('Unknown category for section ' + id);

      var catDir = await this._dir([SECTIONS_ROOT, cat], false);
      try { await catDir.removeEntry(id, { recursive: true }); }
      catch (e) { if (e.name !== 'NotFoundError') throw e; }

      this.sectionsCache = this.sectionsCache.filter(function (s) { return s.id !== id; });
      SH.bus.emit('settings:changed', this.data);
    },

    /* Write an image into the section's own assets folder.
       De-dupes: fig.png -> fig-1.png -> fig-2.png
       Returns the data-folder-relative path to store in the block. */
    saveSectionAsset: async function (category, id, file) {
      if (!this.dataDirHandle) throw new Error('No data folder is open.');
      if (SECTION_CATEGORIES.indexOf(category) === -1) throw new Error('Unknown category: ' + category);
      if (!file) throw new Error('No file supplied.');

      var assetsDir = await this._dir([SECTIONS_ROOT, category, id, 'assets'], true);
      var wanted = safeName(file.name || 'image.png');
      var parts = splitExt(wanted);
      var name = wanted, n = 0;

      /* eslint-disable no-constant-condition */
      while (true) {
        var taken = true;
        try { await assetsDir.getFileHandle(name, { create: false }); }
        catch (e) { taken = false; }
        if (!taken) break;
        n += 1;
        name = parts.base + '-' + n + parts.ext;
        if (n > 999) throw new Error('Too many files named ' + wanted);
      }

      var fh = await assetsDir.getFileHandle(name, { create: true });
      var w = await fh.createWritable();
      await w.write(file);
      await w.close();

      return [SECTIONS_ROOT, category, id, 'assets', name].join('/');
    },

    /* ============================================================
       General data-folder file API (0.8.0)

       Added for js/lib.js, which installs SISTEMA libraries into
       <data folder>/libraries/<slug>/ and reads their PNG/ and PDF/
       assets. Useful to any consumer of the data folder.

       Two families:
         strict   throw on failure — use when you must know
         lenient  writeJSON / deleteFile resolve true|false and never
                  reject, because report-theme.js calls them
                  fire-and-forget inside a synchronous try/catch
       ------------------------------------------------------------ */

    /* Folds case, like resolve() and fileUrl(). They must agree: a guard of
       `if (!await exists(p)) return null;` before `await fileUrl(p)` would
       otherwise drop every asset a vendor shipped in a differently-cased
       folder (PNG/ vs png/), silently. Exact match is tried first. */
    exists: async function (rel) {
      if (!this.dataDirHandle) return false;
      try { await this._entry(rel); return true; }
      catch (e) { /* fall through to a case-folded lookup */ }
      return (await this.resolve(rel)) !== null;
    },

    /* rel '' or '/' lists the data folder root. */
    listDir: async function (rel) {
      var dir = (!rel || rel === '/' || rel === '.')
        ? this.dataDirHandle
        : await this._dir(String(rel).split('/').filter(Boolean), false);
      if (!dir) throw new Error('No data folder is open.');
      var out = [];
      for await (var entry of dir.values()) out.push({ name: entry.name, kind: entry.kind });
      out.sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return out;
    },

    ensureDir: function (rel) {
      return this._dir(String(rel).split('/').filter(Boolean), true);
    },

    readFile: async function (rel) {
      var fh = await this._fileHandleCI(rel);
      return fh.getFile();
    },

    readText: async function (rel) {
      return (await this.readFile(rel)).text();
    },

    writeText: async function (rel, str) {
      var fh = await this._fileHandle(rel, true);
      var w = await fh.createWritable();
      await w.write(String(str));
      await w.close();
      return true;
    },

    writeBlob: function (rel, blob) { return this._writeBlobStrict(rel, blob).then(function () { return true; }); },

    /* recursive:true removes a whole directory. Throws (unlike deleteFile). */
    deleteEntry: async function (rel, opts) {
      var parts = String(rel).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, false);
      await dir.removeEntry(name, { recursive: !!(opts && opts.recursive) });
      return true;
    },

    /* The data folder can sit outside the app root (a NAS path), so a
       relative <img src> will not resolve and fetch() is blocked on
       file://. Read the bytes through the handle and hand back a blob:
       URL. The caller owns it and must URL.revokeObjectURL() it. */
    fileUrl: async function (rel) {
      var fh = await this._fileHandleCI(rel);
      return URL.createObjectURL(await fh.getFile());
    },

    /* Resolve a path case-insensitively, returning the ACTUAL path on disk,
       or null. Vendors ship PNG/ and png/, .png and .PNG; File System Access
       matches entry names exactly, so a naive lookup fails on one of them. */
    resolve: async function (rel) {
      if (!this.dataDirHandle) return null;
      var parts = String(rel).split('/').filter(Boolean);
      var dir = this.dataDirHandle, actual = [], i;
      for (i = 0; i < parts.length; i++) {
        var want = parts[i].toLowerCase();
        var hit = null;
        for await (var entry of dir.values()) {
          if (entry.name === parts[i]) { hit = entry; break; }        // exact wins
          if (!hit && entry.name.toLowerCase() === want) hit = entry;  // else fold case
        }
        if (!hit) return null;
        actual.push(hit.name);
        if (i < parts.length - 1) {
          if (hit.kind !== 'directory') return null;
          dir = hit;
        }
      }
      return actual.join('/');
    },

    /* exact match first; fall back to a case-insensitive resolve */
    _fileHandleCI: async function (rel) {
      try { return await this._fileHandle(rel, false); }
      catch (e) {
        var actual = await this.resolve(rel);
        if (!actual) throw e;
        return this._fileHandle(actual, false);
      }
    },

    _entry: async function (rel) {
      var parts = String(rel).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, false);
      try { return await dir.getFileHandle(name, { create: false }); }
      catch (e) { return dir.getDirectoryHandle(name, { create: false }); }
    },

    /* ------------------------------------------------------------
       Section assets — now a thin alias over the general API
       ------------------------------------------------------------ */
    sectionAssetUrl: function (relativePath) {
      if (!this.dataDirHandle) return Promise.reject(new Error('No data folder is open.'));
      if (!relativePath) return Promise.reject(new Error('sectionAssetUrl() needs a path.'));
      return this.fileUrl(relativePath);
    },

    /* copy every entry of sections/<from>/<id> into sections/<to>/<id>,
       then remove the original. Copy-then-delete, so a failure mid-way
       leaves the original intact rather than losing the section. */
    _moveSectionFolder: async function (id, fromCat, toCat) {
      var src = await this._dir([SECTIONS_ROOT, fromCat, id], false);
      var dst = await this._dir([SECTIONS_ROOT, toCat, id], true);
      await copyDir(src, dst);
      var fromDir = await this._dir([SECTIONS_ROOT, fromCat], false);
      await fromDir.removeEntry(id, { recursive: true });
    },

    /* ------------------------------------------------------------
       Company logo
       ------------------------------------------------------------ */

    setLogo: async function (file) {
      if (!file) throw new Error('No file supplied.');
      if (!this.dataDirHandle) throw new Error('No data folder is open. Choose one in Settings → Data & Storage.');
      var name = 'assets/logo' + (splitExt(safeName(file.name)).ext || '.png');
      await this._writeBlobStrict(name, file);
      this.set('company.logo', { file: name });
      return name;
    },

    logoUrl: async function () {
      var logo = this.get('company.logo', null);
      if (!logo) return null;
      if (logo.dataUrl) return logo.dataUrl;             // pre-data-folder upload
      if (!this.dataDirHandle || !logo.file) return null;
      var fh = await this._fileHandle(logo.file, false);
      return URL.createObjectURL(await fh.getFile());
    },

    clearLogo: function () {
      var logo = this.get('company.logo', null);
      if (logo && logo.file && this.dataDirHandle) this.deleteFile(logo.file);
      this.set('company.logo', null);
    },

    /* ------------------------------------------------------------
       Custom component library
       ------------------------------------------------------------ */

    addCustomComponent: function (c) {
      if (!this.data) this.init();
      c.id = c.id || ('cc_' + Date.now().toString(36));
      c.source = 'custom';
      this.data.customComponents.push(c);
      this._touch();
      return c;
    },
    removeCustomComponent: function (id) {
      if (!this.data) return;
      this.data.customComponents = this.data.customComponents.filter(function (c) { return c.id !== id; });
      this._touch();
    }
  };

  /* ==============================================================
     Module-private helpers
     ============================================================== */

  /* Can we actually reach this directory? A granted permission says nothing
     about the folder still existing. */
  async function probe(handle) {
    try {
      // eslint-disable-next-line no-unused-vars
      for await (var _e of handle.values()) break;
      return true;
    } catch (e) { return false; }
  }

  function sectionJsonPath(category, id) {
    return [SECTIONS_ROOT, category, id, 'section.json'].join('/');
  }

  /* Asset paths embed the category, so a move must rewrite them. */
  function rewriteAssetPaths(blocks, fromCat, toCat, id) {
    if (!Array.isArray(blocks)) return blocks;
    var from = [SECTIONS_ROOT, fromCat, id, ''].join('/');
    var to   = [SECTIONS_ROOT, toCat,  id, ''].join('/');
    return blocks.map(function (b) {
      if (b && b.type === 'image' && typeof b.path === 'string' && b.path.indexOf(from) === 0) {
        b = clone(b);
        b.path = to + b.path.slice(from.length);
      }
      return b;
    });
  }

  async function copyDir(src, dst) {
    for await (var entry of src.values()) {
      if (entry.kind === 'file') {
        var file = await entry.getFile();
        var fh = await dst.getFileHandle(entry.name, { create: true });
        var w = await fh.createWritable();
        await w.write(file);
        await w.close();
      } else {
        var sub = await dst.getDirectoryHandle(entry.name, { create: true });
        await copyDir(entry, sub);
      }
    }
  }

  /* Fill in keys added since the file was written; never overwrite. */
  function mergeDefaults(def, loaded) {
    Object.keys(def).forEach(function (k) {
      if (loaded[k] === undefined) loaded[k] = def[k];
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) &&
               loaded[k] && typeof loaded[k] === 'object' && !Array.isArray(loaded[k])) {
        mergeDefaults(def[k], loaded[k]);
      }
    });
    return loaded;
  }

  /* brosafe.settings/1 -> /2
     User section content used to live at informationSections[id].overrides.
     It now lives in section folders on disk. Drop the dead key rather than
     leave a field that looks live and is not. */
  function migrate(s) {
    /* Already current, or current-but-pre-rename: only the string changes. */
    if (s.schema === SCHEMA) return s;
    if (LEGACY_SCHEMAS.indexOf(s.schema) !== -1) { s.schema = SCHEMA; return s; }
    if (s.informationSections) {
      var dropped = Object.keys(s.informationSections).filter(function (k) {
        return s.informationSections[k] && s.informationSections[k].overrides;
      });
      if (dropped.length) {
        console.warn(SH.APP_NAME + ': settings migrated to ' + SCHEMA +
          '. Legacy inline section overrides dropped for: ' + dropped.join(', ') +
          '. Recreate them as sections in Settings → Sections.');
      }
      delete s.informationSections;
    }
    s.schema = SCHEMA;
    return s;
  }

})(window.SH);
