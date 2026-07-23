/* ==============================================================
   FS Workbench — project store
   File:     js/store.js
   Rev:      0.13.0
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

   0.11.1 — MINOR schema:
             • project.loto.procedures[] — Procedure register, distinct
               from assets. Item shape maintained by the Procedures tab.
             • project.loto.assets[].parentId — null for top-level, or
               another asset id to nest as a sub-asset. Flat storage,
               tree rendering in the UI. Back-filled to null so existing
               top-level assets pick it up transparently.
   0.11.0 — MAJOR: schema string bumped fsworkbench.project/1 -> /2.
             Photos and other binary attachments now live under
             <project>/assets/, referenced by relative path. New API:
             saveProjectAsset(subPath, file) / projectAssetUrl(relPath)
             / deleteProjectAsset(relPath). All mirror the equivalents
             on SH.settings, so consumers see a consistent pattern.
             Migration from /1 is silent: any inline base64 photos
             on LOTO isolation points are decoded and written to
             <project>/assets/loto/<assetId>/ on first open, then
             replaced with { relPath, name, w, h }. Migration errors
             are logged; the photo is left untouched. Legacy /1 files
             load without a schema warning and are upgraded on next
             save. brosafe.project/1 continues to load transparently.
   0.10.10 — MINOR schema: project.loto.assets[] — LOTO Asset Register.
              Item shape TBD by the tab. Photos are held inline as base64
              data URLs with a per-photo cap (500 KB) enforced by the tab,
              matching project.customer.logo. A per-project assets/ folder
              was considered and deliberately not adopted — see the design
              note in DATA_MODEL.md.
   0.10.9 — MINOR schema: validation.phase4 with sfConfirmations[]
             and componentChecks[]. Item shapes TBD by the Phase 4 tab.
   0.10.8 — MINOR schema: project.customer + full defensive back-fill.
             Formalises the shape the Customer Details tab has been
             writing since its Rev 0.8.0; overdue documentation, not a
             new key. contacts[] defaults to one blank contact.
             address.state validated against AU codes or ''.
             logo is null or the exact { dataUrl, name, type, w, h } shape.
   0.10.7 — MINOR schema: validation.phase3.tests with six arrays
             (inconsistentInputs, channelShort, voltage24v, groundFault,
             edm, special). Item shapes TBD by the Phase 3 tab.
   0.10.6 — MINOR schema: four additive keys on validation.phase2.matrix
             (rowOrder, colOrder, hidden, prefs.showPageRef). Item
             shapes for the content arrays are still TBD.
   0.10.5 — MINOR schema: validation.phase2.matrix with four arrays
             (resetZones, outputGroups, customStates, rows). Item shapes
             deliberately not documented in DATA_MODEL.md until the
             Phase 2 tab pins them down.
   0.10.4 — MINOR schema: devices[].wiring[].side back-filled to 'field'
             when absent. Explicit values ('controller' or 'field') are
             left untouched. wiring itself is also defensively normalised
             to [] if a device is missing it.
   0.10.3 — MINOR schema: sfs[].plr back-filled to
             { mode:'direct', value:null, s:null, f:null, p:null }
             only when absent. Existing plr objects untouched.
   0.10.2 — MINOR schema: project.lists.deviceTypes back-filled to the
             default six-type list. Existing arrays are left untouched
             so user-added types survive.
   0.10.1 — MINOR schema: project.validation.phase1.signoff
             { groups: { <key>: bool }, tech: '', date: '' }
             Back-filled to {} on every open. phase1 itself is also created
             if absent so reads don't need to guard the intermediate level.
   0.10.0 — MINOR schema additions:
             - project.devices[]  — shared Device Register
             - project.sfs[].inputs / .logic / .outputs — device assignments
             All three are back-filled by _normalize() so existing projects open
             unchanged and pick up the new keys on next save. The schema string
             fsworkbench.project/1 is unchanged — old files are not migrated,
             they simply gain the defaults transparently.
   0.9.3 — SH.IDB is now read lazily inside idb() rather than at IIFE scope.
          A top-level SH.IDB.name reference threw if store.js ever loaded before
          core.js, leaving SH.store unassigned and the boot guard reporting
          'not loaded'.
   0.9.2 — MINOR schema: project.validation.method ('comprehensive'|'simplified'|null).
          Added _normalize() — called on every project open to back-fill keys
          added after a project was first created. blankProject() updated.
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

  var SCHEMA   = 'fsworkbench.project/2';
  /* Files written before the rename. Read them, warn about nothing, and
     upgrade the string on the next save. A renamed schema that rejects its
     own old files is a data-loss bug wearing a cosmetics costume. */
  /* /1 held photos as inline base64. /2 stores them under
     <project>/assets/. Migration runs silently on first open of a
     /1 project; see _migrateAssets(). Any legacy schema string in
     LEGACY_SCHEMAS is accepted on read and upgraded on next save. */
  var LEGACY_SCHEMAS = ['brosafe.project/1', 'fsworkbench.project/1'];

  /* Default device types for project.lists.deviceTypes (0.14.3).
     Kept as a module constant so blankProject() and _normalize() cannot
     drift out of sync — a user who deletes then re-imports a project
     from before this key existed should see the same list as a new one. */
  var DEFAULT_DEVICE_TYPES = ['estop', 'interlock', 'reset', 'edm', 'output', 'other'];
  /* Read SH.IDB lazily so a load-order mishap cannot throw at IIFE scope.
     If store.js ever executes before core.js, a top-level SH.IDB.name
     reference throws, SH.store is never assigned, and the boot guard
     reports 'not loaded' with no obvious cause. */
  function idbName()  { return (SH.IDB && SH.IDB.name)  || 'fs-workbench'; }
  function idbStore() { return (SH.IDB && SH.IDB.store) || 'handles'; }
  var IDB_KEY  = 'projectRoot';      // the projects root directory handle
  var IDB_RECENTS = 'recents';       // [{id, handle, …labels}] — see listRecents()
  var MAX_RECENTS = 10;

  /* ---- IndexedDB handle cache -------------------------------------
     settings.js keeps its own copy of these under a different key. Two
     short helpers beat a shared module that neither can import on
     file://; if a third store ever needs them, promote to core.js. */
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
      customer: {                  // client details — see docs/DATA_MODEL.md
        company:  '',
        abn:      '',
        hasAcn:   false,
        acn:      '',
        address:  { street: '', suburb: '', postcode: '', state: '' },
        contacts: [{ id: '', name: '', role: '', email: '', phone: '' }],
        admin:    { email: '', phone: '' },
        logo:     null            // null | { dataUrl, name, type, w, h }
      },
      involvedParties: [],       // RACI
      job: { jobNumber: '', purchaseOrders: [], costCode: '' },
      devices: [],               // shared Device Register (see docs/DATA_MODEL.md)
      sfs: [],                   // manifest; full data in sf/*.json
      validation: {
        method: null,           // 'comprehensive' | 'simplified' | null
        phase1: { signoff: {} }, // sign-off state; see docs/DATA_MODEL.md
        phase2: {                // matrix state for the Phase 2 tab
          matrix: {
            resetZones:   [],   // item shapes TBD by the Phase 2 tab
            outputGroups: [],
            customStates: [],
            rows:         [],
            rowOrder:     [],   // ordered row keys: device id or manual row id
            colOrder:     [],   // ordered column keys: 'out:<deviceId>' (flat)
            hidden:       [],   // hidden keys: device id | 'out:<id>' | 'rz:<id>'
            prefs:        { showPageRef: true }
          }
        },
        phase3: {                // fault-injection tests for the Phase 3 tab
          tests: {
            inconsistentInputs: [],
            channelShort:       [],
            voltage24v:         [],
            groundFault:        [],
            edm:                [],
            special:            []
          }
        },
        phase4: {                // category-verification state for the Phase 4 tab
          sfConfirmations: [],  // per-SF checklist + result records; shape TBD by the tab
          componentChecks: []   // per-device-type checklist records; shape TBD by the tab
        }
      },
      loto: {                    // LOTO registers
        assets:     [],         // Asset Register — physical machines/sub-assets
        procedures: []          // Procedure Register — LOTO procedures
      },
      lists: { deviceTypes: DEFAULT_DEVICE_TYPES.slice() }
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
      return window.showDirectoryPicker({ mode: 'readwrite', id: 'fsw-projects' });
    },

    /* Adopt a handle as the projects root. remember:false skips the cache. */
    useRoot: async function (handle, remember) {
      this.rootHandle = handle || null;
      if (handle && remember !== false) {
        try { await idbPut(handle); } catch (e) { console.warn(SH.APP_NAME + ': root handle not cached —', e); }
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
        dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'fsw-project' });
      }
      return this._openFrom(dir, dir.name);
    },

    /* Ensure keys added in later schema revisions exist on projects written
       by an older version. Add only scalar/null defaults here — never
       overwrite a value the user set. Arrays cannot use fill(). */
    /* Back-fill keys added after a project was first created. Add only
       scalar/null/[]/{} defaults here — never overwrite a value the user set.
       Called on every project open. */
    _normalize: function (p) {
      /* validation.method (0.9.2) */
      if (!p.validation) p.validation = {};
      if (p.validation.method === undefined) p.validation.method = null;

      /* validation.phase1.signoff (0.14.2) — objects can't use fill(),
         back-fill each level explicitly so an existing project without
         phase1 gains the empty shape without wiping user data. */
      if (!p.validation.phase1) p.validation.phase1 = {};
      if (!p.validation.phase1.signoff) p.validation.phase1.signoff = {};

      /* validation.phase2.matrix (0.15.2 + 0.15.3) — content arrays and
         view-state (rowOrder / colOrder / hidden / prefs). Item shapes for
         resetZones/outputGroups/customStates/rows are still TBD by the
         Phase 2 tab. A wrong-type matrix is replaced entirely; a partial
         one has only its missing fields filled, so tab-in-progress data
         survives. */
      if (!p.validation.phase2) p.validation.phase2 = {};
      if (!p.validation.phase2.matrix ||
          typeof p.validation.phase2.matrix !== 'object') {
        p.validation.phase2.matrix = {
          resetZones: [], outputGroups: [], customStates: [], rows: [],
          rowOrder: [], colOrder: [], hidden: [],
          prefs: { showPageRef: true }
        };
      } else {
        var m = p.validation.phase2.matrix;
        if (!Array.isArray(m.resetZones))   m.resetZones   = [];
        if (!Array.isArray(m.outputGroups)) m.outputGroups = [];
        if (!Array.isArray(m.customStates)) m.customStates = [];
        if (!Array.isArray(m.rows))         m.rows         = [];
        if (!Array.isArray(m.rowOrder))     m.rowOrder     = [];
        if (!Array.isArray(m.colOrder))     m.colOrder     = [];
        if (!Array.isArray(m.hidden))       m.hidden       = [];
        if (!m.prefs || typeof m.prefs !== 'object') {
          m.prefs = { showPageRef: true };
        } else if (m.prefs.showPageRef === undefined) {
          m.prefs.showPageRef = true;
        }
      }

      /* validation.phase3.tests (0.15.5) — six fault-injection
         test-record arrays. Item shapes TBD by the Phase 3 tab. A
         wrong-type tests is replaced; a partial one has only its
         missing arrays filled. */
      if (!p.validation.phase3) p.validation.phase3 = {};
      if (!p.validation.phase3.tests ||
          typeof p.validation.phase3.tests !== 'object') {
        p.validation.phase3.tests = {
          inconsistentInputs: [], channelShort: [], voltage24v: [],
          groundFault: [], edm: [], special: []
        };
      } else {
        var t3 = p.validation.phase3.tests;
        if (!Array.isArray(t3.inconsistentInputs)) t3.inconsistentInputs = [];
        if (!Array.isArray(t3.channelShort))       t3.channelShort       = [];
        if (!Array.isArray(t3.voltage24v))         t3.voltage24v         = [];
        if (!Array.isArray(t3.groundFault))        t3.groundFault        = [];
        if (!Array.isArray(t3.edm))                t3.edm                = [];
        if (!Array.isArray(t3.special))            t3.special            = [];
      }

      /* validation.phase4 (0.15.6) — two arrays holding the tab's
         checklists. Item shapes TBD by the Phase 4 tab. */
      if (!p.validation.phase4) p.validation.phase4 = {};
      if (!Array.isArray(p.validation.phase4.sfConfirmations)) {
        p.validation.phase4.sfConfirmations = [];
      }
      if (!Array.isArray(p.validation.phase4.componentChecks)) {
        p.validation.phase4.componentChecks = [];
      }

      /* project.loto.assets (0.15.7) + parentId (0.16.1)
         parentId is null for top-level assets, or another asset id to
         nest under. Renders as a tree in the UI, stored flat.
         project.loto.procedures (0.16.1) — Procedure register. Item
         shape maintained by the Procedures tab; only defensive back-fill
         at the top level here. */
      if (!p.loto || typeof p.loto !== 'object') p.loto = {};
      if (!Array.isArray(p.loto.assets)) p.loto.assets = [];
      p.loto.assets.forEach(function (a) {
        if (a && typeof a === 'object' && a.parentId === undefined) a.parentId = null;
      });
      if (!Array.isArray(p.loto.procedures)) p.loto.procedures = [];

      /* shared Device Register (0.14.0) + wiring[].side (0.15.1)
         side defaults to 'field'. The Pilz import parser writes side
         explicitly at import time; this back-fill only touches entries
         that pre-date the field or that were entered manually. */
      if (!Array.isArray(p.devices)) p.devices = [];
      p.devices.forEach(function (dev) {
        if (!Array.isArray(dev.wiring)) dev.wiring = [];
        dev.wiring.forEach(function (w) {
          if (w && w.side === undefined) w.side = 'field';
        });
      });

      /* project.customer (0.16.1) — back-fill the full shape without
         overwriting anything the user already set. contacts[] is an
         array so it uses the array back-fill path, defaulting to one
         blank contact when absent or empty. state is one of NSW VIC QLD
         SA WA TAS NT ACT or ''. wrong-type nested objects are replaced,
         missing scalar/nullable keys are filled at their defaults. */
      if (!p.customer || typeof p.customer !== 'object') p.customer = {};
      var c = p.customer;
      if (typeof c.company !== 'string') c.company = '';
      if (typeof c.abn     !== 'string') c.abn     = '';
      if (typeof c.hasAcn  !== 'boolean') c.hasAcn = false;
      if (typeof c.acn     !== 'string') c.acn     = '';
      if (!c.address || typeof c.address !== 'object') c.address = {};
      if (typeof c.address.street   !== 'string') c.address.street   = '';
      if (typeof c.address.suburb   !== 'string') c.address.suburb   = '';
      if (typeof c.address.postcode !== 'string') c.address.postcode = '';
      /* state: allow the eight AU codes or ''; anything else -> '' */
      var AU_STATES = ['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'];
      if (typeof c.address.state !== 'string' ||
          (c.address.state !== '' && AU_STATES.indexOf(c.address.state) === -1)) {
        c.address.state = '';
      }
      if (!Array.isArray(c.contacts) || c.contacts.length === 0) {
        c.contacts = [{ id: '', name: '', role: '', email: '', phone: '' }];
      } else {
        c.contacts.forEach(function (ct) {
          if (!ct || typeof ct !== 'object') return;
          if (typeof ct.id    !== 'string') ct.id    = '';
          if (typeof ct.name  !== 'string') ct.name  = '';
          if (typeof ct.role  !== 'string') ct.role  = '';
          if (typeof ct.email !== 'string') ct.email = '';
          if (typeof ct.phone !== 'string') ct.phone = '';
        });
      }
      if (!c.admin || typeof c.admin !== 'object') c.admin = {};
      if (typeof c.admin.email !== 'string') c.admin.email = '';
      if (typeof c.admin.phone !== 'string') c.admin.phone = '';
      /* logo: null OR an object with the exact shape below */
      if (c.logo !== null) {
        if (!c.logo || typeof c.logo !== 'object' || typeof c.logo.dataUrl !== 'string') {
          c.logo = null;
        } else {
          if (typeof c.logo.name !== 'string') c.logo.name = '';
          if (typeof c.logo.type !== 'string') c.logo.type = '';
          if (typeof c.logo.w    !== 'number') c.logo.w    = 0;
          if (typeof c.logo.h    !== 'number') c.logo.h    = 0;
        }
      }

      /* project.lists.deviceTypes (0.14.3) — leave alone if the user has
         customised it; only fill if absent or the wrong shape. */
      if (!p.lists || typeof p.lists !== 'object') p.lists = {};
      if (!Array.isArray(p.lists.deviceTypes)) {
        p.lists.deviceTypes = DEFAULT_DEVICE_TYPES.slice();
      }

      /* per-SF device assignments (0.14.0) and PLr object (0.14.4) —
         each field is back-filled individually so a manifest entry that
         has some fields (e.g. inputs but no plr) picks up only what it
         is missing. Existing values are never overwritten. */
      if (Array.isArray(p.sfs)) {
        p.sfs.forEach(function (sf) {
          if (!Array.isArray(sf.inputs))  sf.inputs  = [];
          if (!Array.isArray(sf.logic))   sf.logic   = [];
          if (!Array.isArray(sf.outputs)) sf.outputs = [];
          if (!sf.plr || typeof sf.plr !== 'object') {
            sf.plr = { mode: 'direct', value: null,
                       s: null, f: null, p: null };
          }
        });
      }

      return p;
    },

    _openFrom: async function (dir, folder) {
      var fh;
      try { fh = await dir.getFileHandle('project.json', { create: false }); }
      catch (e) { throw new Error('"' + folder + '" is not a ' + SH.APP_NAME + ' project (no project.json).'); }

      var p = this._normalize(JSON.parse(await (await fh.getFile()).text()));
      /* Silent asset migration from /1 to /2 runs before we touch the file
         on disk. If it makes changes, they get saved on the next _touch. */
      if (p.schema === 'brosafe.project/1' || p.schema === 'fsworkbench.project/1') {
        try { await this._migrateAssets(p); }
        catch (e) { console.warn(SH.APP_NAME + ': asset migration errored —', e); }
      }

      if (p.schema && p.schema !== SCHEMA && LEGACY_SCHEMAS.indexOf(p.schema) === -1) {
        console.warn(SH.APP_NAME + ': project schema ' + p.schema + ', expected ' + SCHEMA);
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
      catch (e) { console.warn(SH.APP_NAME + ': recent projects not cached —', e); }
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
        var e1 = new Error(SH.APP_NAME + ' was not given permission to open that folder.');
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
        self.save().catch(function (e) { console.warn(SH.APP_NAME + ': project not saved —', e); });
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

    /* ------------------------------------------------------------
       Project asset API (/2 schema)

       Photos and other binary attachments are stored on disk under
       <project>/assets/<subPath>, then referenced from project.json
       by a relative path. The photo record shape is:

         { relPath:'assets/loto/ast_x/e1.jpg', name:'e1.jpg', w:1200, h:900 }

       The three helpers mirror SH.settings.saveCompanyAsset etc, so
       consumers see one consistent pattern for on-disk attachments.

       saveProjectAsset(subPath, file)
         subPath is the folder inside <project>/assets/, e.g. 'loto/ast_x'.
         The filename is taken from file.name (safe-named + de-duped).
         Returns the full path relative to the project folder,
         e.g. 'assets/loto/ast_x/e1.jpg'.

       projectAssetUrl(relPath)
         Returns a blob: URL for use as an <img> src. Caller revokes
         the URL when the image is unmounted.

       deleteProjectAsset(relPath)
         Removes the file. Fire-and-forget — resolves true/false,
         never rejects. Missing files count as success (already gone).

       All three throw synchronously if no project is open.
       ------------------------------------------------------------ */

    saveProjectAsset: async function (subPath, file) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      if (!file) throw new Error('No file supplied.');
      if (typeof subPath !== 'string' || !subPath.trim()) {
        throw new Error('saveProjectAsset() needs a non-empty subPath (e.g. "loto/ast_x").');
      }
      /* Clean the subPath: drop leading assets/, leading/trailing slashes,
         empty segments. Never allow ".." — users must not escape assets/. */
      var raw = String(subPath).replace(/^assets\//, '').split('/').filter(Boolean);
      /* Refuse to silently strip '..' — that's an attempt to escape assets/. */
      for (var s = 0; s < raw.length; s++) {
        if (raw[s] === '..' || raw[s] === '.') {
          throw new Error('saveProjectAsset() subPath must not contain "." or ".." segments.');
        }
      }
      if (!raw.length) throw new Error('saveProjectAsset() needs a non-empty subPath.');
      var subParts = raw;

      /* Ensure <project>/assets/<subPath>/ exists */
      var dir = await this._dir(['assets'].concat(subParts), true);

      /* De-dupe filename in the same way as saveCompanyAsset. */
      function safe(s) { return String(s || 'image.bin').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120); }
      function splitExt(s) {
        var i = s.lastIndexOf('.');
        if (i <= 0) return { base: s, ext: '' };
        return { base: s.slice(0, i), ext: s.slice(i) };
      }
      var wanted = safe(file.name || 'image.bin');
      var parts = splitExt(wanted);
      var name = wanted, n = 0;
      /* eslint-disable no-constant-condition */
      while (true) {
        var taken = true;
        try { await dir.getFileHandle(name, { create: false }); }
        catch (e) { taken = false; }
        if (!taken) break;
        n += 1;
        name = parts.base + '-' + n + parts.ext;
        if (n > 999) throw new Error('Too many files named ' + wanted);
      }

      var fh = await dir.getFileHandle(name, { create: true });
      var w  = await fh.createWritable();
      await w.write(file);
      await w.close();

      /* Return path relative to the project folder */
      return ['assets'].concat(subParts).concat([name]).join('/');
    },

    projectAssetUrl: async function (relPath) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      if (!relPath) throw new Error('projectAssetUrl() needs a path.');
      var parts = String(relPath).split('/').filter(Boolean);
      var name = parts.pop();
      var dir = await this._dir(parts, false);
      var fh = await dir.getFileHandle(name, { create: false });
      var file = await fh.getFile();
      return URL.createObjectURL(file);
    },

    deleteProjectAsset: async function (relPath) {
      if (!this.dirHandle) throw new Error('No project folder is open.');
      if (!relPath) return false;
      try {
        var parts = String(relPath).split('/').filter(Boolean);
        var name = parts.pop();
        var dir = await this._dir(parts, false);
        await dir.removeEntry(name);
        return true;
      } catch (e) {
        /* Missing file is success — caller wanted it gone, it is. */
        if (e && (e.name === 'NotFoundError' || /not\s*found/i.test(e.message || ''))) return false;
        throw e;
      }
    },

    /* ------------------------------------------------------------
       Migration: /1 -> /2

       Called on open when p.schema === 'fsworkbench.project/1' (or
       any legacy string that came from a /1 project). Any base64
       photos on LOTO isolation points are decoded, written to
       <project>/assets/loto/<assetId>/, and replaced with a
       { relPath, name, w, h } record.

       Fire-and-forget internally: on failure, we log and leave the
       photo untouched. The user won't see broken images, just old ones.
       ------------------------------------------------------------ */
    _migrateAssets: async function (p) {
      if (!p || !p.loto || !Array.isArray(p.loto.assets)) return;
      var self = this, i, j, dirty = false;
      for (i = 0; i < p.loto.assets.length; i++) {
        var a = p.loto.assets[i];
        if (!a || !Array.isArray(a.isolationPoints)) continue;
        for (j = 0; j < a.isolationPoints.length; j++) {
          var ip = a.isolationPoints[j];
          if (!ip || !ip.photo) continue;
          /* /2 shape: object with relPath. /1 shape: string dataUrl. */
          if (typeof ip.photo === 'string' && ip.photo.indexOf('data:') === 0) {
            try {
              var mig = await self._migrateOnePhoto(ip.photo, a.id || 'unknown', 'photo');
              if (mig) { ip.photo = mig; dirty = true; }
            } catch (e) {
              console.warn(SH.APP_NAME + ': asset migration failed for '
                           + (a.id || '(no id)') + ' —', e);
            }
          }
        }
      }
      return dirty;
    },

    _migrateOnePhoto: async function (dataUrl, assetId, baseName) {
      /* Parse the data URL header + decode. */
      var m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
      if (!m) return null;
      var mime = (m[1] || 'application/octet-stream').toLowerCase();
      var isB64 = !!m[2];
      var payload = m[3] || '';
      var bytes;
      if (isB64) {
        var bin = atob(payload);
        bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      /* Pick an extension from the mime type. */
      var ext = 'bin';
      if (mime.indexOf('png')  !== -1) ext = 'png';
      else if (mime.indexOf('jpeg') !== -1 || mime.indexOf('jpg') !== -1) ext = 'jpg';
      else if (mime.indexOf('webp') !== -1) ext = 'webp';
      else if (mime.indexOf('gif')  !== -1) ext = 'gif';
      var file = new File([bytes], baseName + '.' + ext, { type: mime });
      var relPath = await this.saveProjectAsset('loto/' + assetId, file);
      return { relPath: relPath, name: file.name, w: 0, h: 0 };
    },


    /* exposed for tests / tabs that need a safe folder name */
    safeFolder: safeFolder
  };

})(window.SH);
