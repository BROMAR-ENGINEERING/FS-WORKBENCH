/* ==============================================================
   BroSafe — project store
   File:     js/store.js
   Rev:      0.9.1
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   SH.store is the single source of truth for the OPEN PROJECT, and it
   owns writing it to disk. Feature code reads SH.store.project and
   mutates it only through store methods, so autosave lives in one place.

   Two handles, two jobs:

     rootHandle   the projects root (e.g. a NAS share). Chosen once,
                  cached in IndexedDB. New projects are created inside it.
     dirHandle    the folder of the project currently open.

   On disk:

     <projects root>/
       <Project Name>/
         project.json      meta, areas, documents, revisions, SF manifest
         sf/               one JSON per safety function
         exports/          generated PDFs

   Paths stored inside project.json are always RELATIVE to the project
   folder, so a project written on one PC opens on another.

   Single editor per project is assumed (last-write-wins). Every save
   stamps savedBy + savedAt and bumps rev; openProject() warns if the
   file on disk is newer than what we loaded.

   0.9.1 — save() now emits `project:status`, not `project:changed`. Typing one
          character used to fire `project:changed` three times: once for the
          edit, then twice more when the debounced save started and finished.
          A tab that redraws on that event lost the caret ~600ms after every
          pause. `project:changed` now means the DATA changed; `project:status`
          means the save state moved. Added projectId().
   0.9.0 — recent projects: listRecents / rememberRecent / openRecent /
          forgetRecent / clearRecents, backed by the IndexedDB handle cache
          (a path string cannot reopen a folder). openProjectFolder() no
          longer adopts the picked folder as the projects root — doing so
          left "Open" listing an empty parent.
   0.8.1 — pickRoot() / useRoot() split out so a caller can choose a folder
          per project. newProject(meta, {root}) creates inside that folder and
          adopts it as the projects root afterwards.
   0.7.2 — newProject() accepts a jobNumber and files it under
          project.job.jobNumber (your internal job), not meta.documentNumber
          (the report's document number). listProjects() surfaces it.
   0.7.0 — real persistence. chooseRoot / restoreRoot / listProjects /
          newProject / openProject / save (debounced) / closeProject,
          plus generic get()/set(). Previously all of this threw
          "not implemented in scaffold" and projects lived only in RAM.
   ============================================================== */
(function (SH) {

  var SCHEMA   = 'brosafe.project/1';
  var IDB_NAME = 'brosafe', IDB_STORE = 'handles';
  var IDB_KEY  = 'projectRoot';      // the projects root directory handle
  var IDB_RECENTS = 'recents';       // [{id, handle, …labels}] — see listRecents()
  var MAX_RECENTS = 10;

  /* ---- IndexedDB handle cache -------------------------------------
     settings.js keeps its own copy of these under a different key. Two
     short helpers beat a shared module that neither can import on
     file://; if a third store ever needs them, promote to core.js. */
  function idb(fn) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var r = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = function () { db.close(); resolve(r && r.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      };
    });
  }
  function idbPut(v, key) { return idb(function (s) { return s.put(v, key || IDB_KEY); }); }
  function idbGet(key)    { return idb(function (s) { return s.get(key || IDB_KEY); }); }
  function idbDel(key)    { return idb(function (s) { return s.delete(key || IDB_KEY); }); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nowISO() { return new Date().toISOString(); }

  /* Windows-safe folder name. Keeps spaces; strips \ / : * ? " < > | */
  function safeFolder(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 120) || 'Untitled project';
  }

  function blankProject(meta) {
    return {
      schema: SCHEMA,
      appVersion: SH.VERSION,
      id: 'prj_' + Date.now().toString(36),
      rev: 1,
      savedAt: null,
      savedBy: '',

      meta: Object.assign({
        name: 'Untitled project',
        documentNumber: '',
        version: '1.0',
        date: nowISO().slice(0, 10),
        client: '',
        site: '',
        machine: '',
        author: '',
        reviewedBy: '',
        status: 'draft'
      }, meta || {}),

      revisions: [],
      references: [],
      executiveSummary: [],
      areas: [],                 // the shared Areas & Assets register
      documents: {},             // per-document revision history
      involvedParties: [],       // RACI
      job: { jobNumber: '', purchaseOrders: [], costCode: '' },
      sfs: [],                   // manifest; full data in sf/*.json
      lists: {}
    };
  }

  SH.store = {

    project: null,
    rootHandle: null,          // projects root (NAS share)
    dirHandle: null,           // this project's folder
    folderName: '',
    dirty: false,
    saving: false,
    _loadedRev: 0,

    /* ------------------------------------------------------------
       Status — the header listens to this
       ------------------------------------------------------------ */
    status: function () {
      if (!this.project) return 'none';
      if (!this.dirHandle) return 'memory';     // opened without a folder
      if (this.saving) return 'saving';
      return this.dirty ? 'unsaved' : 'saved';
    },
    hasProject: function () { return !!this.project; },

    /* Identity of the open project. A tab can compare this to decide whether
       it is looking at a different project, or merely at an edit of the same
       one (possibly its own). */
    projectId: function () { return this.project ? this.project.id : null; },
    hasRoot: function () { return !!this.rootHandle; },
    rootName: function () { return this.rootHandle ? this.rootHandle.name : ''; },
    path: function () {
      if (!this.folderName) return '';
      return (this.rootName() ? this.rootName() + ' / ' : '') + this.folderName;
    },

    /* ------------------------------------------------------------
       Projects root — one-time grant, handle cached in IndexedDB
       ------------------------------------------------------------ */

    /* Just show the picker. showDirectoryPicker() needs a user gesture, so
       call this as the FIRST statement of a click handler — never after an
       await, or the browser will reject it. Remembers nothing. */
    pickRoot: function () {
      if (!window.showDirectoryPicker) {
        return Promise.reject(new Error('This browser cannot open folders. Use Microsoft Edge or Google Chrome.'));
      }
      return window.showDirectoryPicker({ mode: 'readwrite', id: 'brosafe-projects' });
    },

    /* Adopt a handle as the projects root. remember:false skips the cache. */
    useRoot: async function (handle, remember) {
      this.rootHandle = handle || null;
      if (handle && remember !== false) {
        try { await idbPut(handle); } catch (e) { console.warn('BroSafe: root handle not cached —', e); }
      }
      SH.bus.emit('project:root', this.rootHandle);
      return this.rootHandle;
    },

    chooseRoot: async function () {
      var h = await this.pickRoot();
      return this.useRoot(h);
    },

    /* Re-attach the cached root. Returns false if absent or the browser
       will not re-grant without a user gesture. Safe to call on boot. */
    restoreRoot: async function (opts) {
      var h;
      try { h = await idbGet(); } catch (e) { return false; }
      if (!h) return false;
      var perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        if (!opts || !opts.prompt) return false;          // needs a click
        perm = await h.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return false;
      }
      this.rootHandle = h;
      SH.bus.emit('project:root', h);
      return true;
    },

    forgetRoot: async function () {
      this.rootHandle = null;
      try { await idbDel(); } catch (e) { /* nothing cached */ }
      SH.bus.emit('project:root', null);
    },

    /* ------------------------------------------------------------
       Listing / creating / opening
       ------------------------------------------------------------ */

    /* Every subfolder of the root that contains a project.json. */
    listProjects: async function () {
      if (!this.rootHandle) return [];
      var out = [];
      for await (var entry of this.rootHandle.values()) {
        if (entry.kind !== 'directory') continue;
        try {
          var fh = await entry.getFileHandle('project.json', { create: false });
          var p = JSON.parse(await (await fh.getFile()).text());
          out.push({
            folder: entry.name,
            name: (p.meta && p.meta.name) || entry.name,
            client: (p.meta && p.meta.client) || '',
            documentNumber: (p.meta && p.meta.documentNumber) || '',
            jobNumber: (p.job && p.job.jobNumber) || '',
            savedAt: p.savedAt || '',
            rev: p.rev || 1
          });
        } catch (e) { /* not a project folder */ }
      }
      out.sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
      return out;
    },

    /* Create <root>/<name>/ with project.json and sf/. */
    /* Create <root>/<name>/ with project.json and sf/.
       `opts.root` is a directory handle chosen for THIS project. When absent,
       the cached projects root is used. */
    newProject: async function (meta, opts) {
      var root = (opts && opts.root) || this.rootHandle;
      if (!root) throw new Error('Choose a folder for this project first.');

      meta = Object.assign({}, meta || {});
      var jobNumber = meta.jobNumber || '';
      delete meta.jobNumber;
      var folder = safeFolder(meta.name);

      var exists = true;
      try { await root.getDirectoryHandle(folder, { create: false }); }
      catch (e) { exists = false; }
      if (exists) throw new Error('A folder named "' + folder + '" already exists here. Open it, or pick another name or location.');

      var dir = await root.getDirectoryHandle(folder, { create: true });
      await dir.getDirectoryHandle('sf', { create: true });
      await dir.getDirectoryHandle('exports', { create: true });

      /* Adopt the chosen folder as the root, so Open lists its neighbours. */
      if (root !== this.rootHandle) await this.useRoot(root);

      this.dirHandle = dir;
      this.folderName = folder;
      this.project = blankProject(meta);
      this.project.job.jobNumber = jobNumber;
      this._loadedRev = 0;
      this.dirty = true;

      await this.save();
      await this.rememberRecent();
      SH.bus.emit('project:changed', this.project);
      return this.project;
    },

    /* Open by folder name inside the root. */
    openProject: async function (folder) {
      if (!this.rootHandle) throw new Error('Choose a projects folder first.');
      var dir = await this.rootHandle.getDirectoryHandle(folder, { create: false });
      return this._openFrom(dir, folder);
    },

    /* Open a folder that IS a project (contains project.json). Does NOT change
       the projects root — picking a project folder as the root is precisely the
       mistake that leaves "Open" showing an empty list. */
    openProjectFolder: async function (dir) {
      if (!dir) {
        if (!window.showDirectoryPicker) {
          throw new Error('This browser cannot open folders. Use Microsoft Edge or Google Chrome.');
        }
        dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'brosafe-project' });
      }
      return this._openFrom(dir, dir.name);
    },

    _openFrom: async function (dir, folder) {
      var fh;
      try { fh = await dir.getFileHandle('project.json', { create: false }); }
      catch (e) { throw new Error('"' + folder + '" is not a BroSafe project (no project.json).'); }

      var p = JSON.parse(await (await fh.getFile()).text());
      if (p.schema && p.schema !== SCHEMA) {
        console.warn('BroSafe: project schema ' + p.schema + ', expected ' + SCHEMA);
      }
      this.dirHandle = dir;
      this.folderName = folder;
      this.project = p;
      this._loadedRev = p.rev || 0;
      this.dirty = false;

      await this.rememberRecent();
      SH.bus.emit('project:changed', this.project);
      return p;
    },

    closeProject: function () {
      this.project = null;
      this.dirHandle = null;
      this.folderName = '';
      this.dirty = false;
      SH.bus.emit('project:changed', null);
    },

    /* ------------------------------------------------------------
       Recent projects

       A path string cannot reopen a folder — the browser would have to
       prompt again. So we cache the directory HANDLE, which is what
       IndexedDB is for here, alongside enough labels to render the list
       without touching the disk (and therefore without a permission
       prompt just to draw a menu).

       Reopening still needs a granted permission, so openRecent() must be
       called from a click.
       ------------------------------------------------------------ */

    listRecents: async function () {
      var list;
      try { list = await idbGet(IDB_RECENTS); } catch (e) { return []; }
      return Array.isArray(list) ? list : [];
    },

    rememberRecent: async function () {
      if (!this.project || !this.dirHandle) return;
      var p = this.project;
      var entry = {
        id: p.id,
        handle: this.dirHandle,
        name: (p.meta && p.meta.name) || this.folderName,
        client: (p.meta && p.meta.client) || '',
        jobNumber: (p.job && p.job.jobNumber) || '',
        folder: this.folderName,
        rootName: this.rootName(),
        lastOpened: nowISO()
      };
      var list = await this.listRecents();
      list = list.filter(function (r) { return r.id !== entry.id; });
      list.unshift(entry);
      if (list.length > MAX_RECENTS) list.length = MAX_RECENTS;
      try { await idbPut(list, IDB_RECENTS); }
      catch (e) { console.warn('BroSafe: recent projects not cached —', e); }
    },

    forgetRecent: async function (id) {
      var list = (await this.listRecents()).filter(function (r) { return r.id !== id; });
      try { await idbPut(list, IDB_RECENTS); } catch (e) { /* ignore */ }
      return list;
    },

    clearRecents: async function () {
      try { await idbDel(IDB_RECENTS); } catch (e) { /* ignore */ }
    },

    /* Call from a click: re-granting a handle needs a user gesture.
       Throws with .code =
         'DENIED'  the user refused permission
         'GONE'    the folder has moved or been deleted
         'INVALID' the folder is still there but holds no project.json */
    openRecent: async function (id) {
      var list = await this.listRecents();
      var rec = list.filter(function (r) { return r.id === id; })[0];
      if (!rec || !rec.handle) {
        var e0 = new Error('That project is no longer in the recent list.');
        e0.code = 'GONE'; throw e0;
      }

      var perm = await rec.handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await rec.handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        var e1 = new Error('BroSafe was not given permission to open that folder.');
        e1.code = 'DENIED'; throw e1;
      }

      /* Touch the directory itself first. Both a deleted folder and a folder
         without project.json raise NotFoundError, and telling the user the
         wrong one sends them looking for the wrong problem. */
      try {
        // eslint-disable-next-line no-unused-vars
        for await (var _entry of rec.handle.values()) break;
      } catch (e) {
        var e2 = new Error('The folder "' + (rec.folder || rec.name) + '" has moved or been deleted.');
        e2.code = 'GONE'; throw e2;
      }

      try {
        return await this._openFrom(rec.handle, rec.folder || rec.handle.name);
      } catch (e) {
        e.code = 'INVALID';
        throw e;
      }
    },

    /* ------------------------------------------------------------
       Reading / mutating
       ------------------------------------------------------------ */
    get: function (path, fallback) {
      var o = this.project, parts = String(path).split('.'), i;
      for (i = 0; i < parts.length; i++) {
        if (o == null) return fallback;
        o = o[parts[i]];
      }
      return o === undefined ? fallback : o;
    },

    set: function (path, value) {
      if (!this.project) return;
      var parts = String(path).split('.'), o = this.project, i;
      for (i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
      }
      o[parts[parts.length - 1]] = value;
      this._touch();
    },

    setMeta: function (patch) {
      if (!this.project) return;
      Object.assign(this.project.meta, patch);
      this._touch();
    },

    /* A content mutation. `project:changed` means the DATA changed;
       `project:status` means only the save state moved (saving / saved).
       Keeping them apart is what lets a tab redraw on content without being
       redrawn out from under the user's caret every time autosave ticks. */
    _touch: function () {
      this.dirty = true;
      SH.bus.emit('project:changed', this.project);
      SH.bus.emit('project:status', this.status());
      this._queueSave();
    },

    _queueSave: function () {
      var self = this;
      if (!this.dirHandle) return;                 // in-memory project
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(function () {
        self.save().catch(function (e) { console.warn('BroSafe: project not saved —', e); });
      }, 600);
    },

    /* ------------------------------------------------------------
       Saving
       ------------------------------------------------------------ */
    save: async function () {
      if (!this.project || !this.dirHandle) return false;
      if (this.saving) return false;

      this.saving = true;
      SH.bus.emit('project:status', this.status());
      try {
        var p = this.project;
        p.schema = SCHEMA;
        p.appVersion = SH.VERSION;
        p.rev = (p.rev || 0) + 1;
        p.savedAt = nowISO();
        p.savedBy = (SH.settings && (SH.settings.get('company.preparedByDefault', '') ||
                                     SH.settings.get('company.name', ''))) || '';

        await this._writeJSON('project.json', p);
        this._loadedRev = p.rev;
        this.dirty = false;
        return true;
      } finally {
        this.saving = false;
        SH.bus.emit('project:status', this.status());
      }
    },

    /* Warn when someone else saved this project from another PC since we
       loaded it. Not concurrency control — just a guard against silently
       clobbering an hour-old change. */
    checkForNewerOnDisk: async function () {
      if (!this.dirHandle || !this.project) return null;
      try {
        var fh = await this.dirHandle.getFileHandle('project.json', { create: false });
        var onDisk = JSON.parse(await (await fh.getFile()).text());
        if ((onDisk.rev || 0) > this._loadedRev) {
          return { rev: onDisk.rev, savedBy: onDisk.savedBy, savedAt: onDisk.savedAt };
        }
      } catch (e) { /* ignore */ }
      return null;
    },

    /* ------------------------------------------------------------
       Safety functions — one file each, manifest in project.json
       ------------------------------------------------------------ */
    sfPath: function (id) { return 'sf/sf_' + safeFolder(id).replace(/[.\s]/g, '-') + '.json'; },

    saveSF: async function (sf) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      if (!sf || !sf.id) throw new Error('Safety function needs an id.');
      var file = this.sfPath(sf.id);
      await this._writeJSON(file, sf);

      var m = { id: sf.id, name: sf.name, accessPoint: sf.accessPoint || sf.areaId || '',
                plr: (sf.plr && sf.plr.value) || '', pl: (sf.result && sf.result.pl) || '',
                pfh: (sf.result && sf.result.sumPfh) || '',
                status: (sf.result && sf.result.pass) ? 'verified' : 'draft', file: file };
      var i = this.project.sfs.findIndex(function (x) { return x.id === sf.id; });
      if (i >= 0) this.project.sfs[i] = m; else this.project.sfs.push(m);
      this._touch();
      return sf;
    },

    loadSF: async function (id) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      return this._readJSON(this.sfPath(id));
    },

    deleteSF: async function (id) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      try { await this._delete(this.sfPath(id)); }
      catch (e) { if (e.name !== 'NotFoundError') throw e; }
      this.project.sfs = this.project.sfs.filter(function (x) { return x.id !== id; });
      this._touch();
    },

    /* ------------------------------------------------------------
       File helpers, relative to the PROJECT folder
       ------------------------------------------------------------ */
    _dir: async function (parts, create) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      var h = this.dirHandle, i;
      for (i = 0; i < parts.length; i++) h = await h.getDirectoryHandle(parts[i], { create: !!create });
      return h;
    },
    _fileHandle: async function (rel, create) {
      var parts = String(rel).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, create);
      return dir.getFileHandle(name, { create: !!create });
    },
    _writeJSON: async function (rel, obj) {
      var fh = await this._fileHandle(rel, true);
      var w = await fh.createWritable();
      await w.write(JSON.stringify(obj, null, 2));
      await w.close();
    },
    _readJSON: async function (rel) {
      var fh = await this._fileHandle(rel, false);
      return JSON.parse(await (await fh.getFile()).text());
    },
    _delete: async function (rel) {
      var parts = String(rel).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, false);
      await dir.removeEntry(name);
    },

    /* exposed for tests / tabs that need a safe folder name */
    safeFolder: safeFolder
  };

})(window.SH);