/* ==============================================================
   FS Workbench — core
   File:     js/core.js
   Rev:      0.13.0
   Updated:  2026-07-09
   Requires: (none — load first)
   --------------------------------------------------------------
   Global namespace SH: DOM helpers, registries, event bus, and the
   shared tabbedPage() factory. No ES modules. Must run from file://.
   ============================================================== */
window.SH = window.SH || {};
(function (SH) {

  /* --- product name. Rename here and nowhere else. -------------------
     The name is a placeholder. Nothing else in the codebase hard-codes it:
     the header wordmark, the document title and every user-facing message
     read SH.APP_NAME. `accent` is a trailing slice rendered bold in the
     wordmark; set it to '' for a plain one. Vendor-neutrality is a hard
     constraint, so this must stay a single constant. */
  SH.APP = { name: 'FS Workbench', accent: 'Workbench' };
  SH.APP_NAME = SH.APP.name;

  /* --- the IndexedDB that caches directory handles ---------------------
     A path string cannot reopen a folder, so the FileSystemDirectoryHandle
     itself is cached here: the data folder, the projects root, and the
     recent-project handles. NOTHING else goes in IndexedDB.

     `legacy` is the pre-rename database. Renaming the DB without migrating
     would orphan every handle: the user would be sent back to the folder
     picker and lose their recent projects, for nothing but a cosmetic
     change. SH.migrateHandleDb() copies the records across once, at boot. */
  SH.IDB = { name: 'fs-workbench', store: 'handles', legacy: 'brosafe' };

  /* Copy any records from the legacy database, then drop it. Always resolves:
     a failed migration costs one folder re-pick, never a broken boot. */
  SH.migrateHandleDb = function () {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(false);

      function open(name) {
        return new Promise(function (res, rej) {
          var rq = indexedDB.open(name, 1);
          rq.onupgradeneeded = function () {
            if (!rq.result.objectStoreNames.contains(SH.IDB.store)) {
              rq.result.createObjectStore(SH.IDB.store);
            }
          };
          rq.onsuccess = function () { res(rq.result); };
          rq.onerror = function () { rej(rq.error); };
        });
      }

      var oldDb, newDb;
      open(SH.IDB.legacy).then(function (db) {
        oldDb = db;
        var tx = db.transaction(SH.IDB.store, 'readonly');
        var os = tx.objectStore(SH.IDB.store);
        return new Promise(function (res) {
          var keys = os.getAllKeys(), vals = os.getAll();
          tx.oncomplete = function () { res({ keys: keys.result || [], vals: vals.result || [] }); };
          tx.onerror = function () { res({ keys: [], vals: [] }); };
        });
      }).then(function (data) {
        if (!data.keys.length) { if (oldDb) oldDb.close(); return resolve(false); }
        return open(SH.IDB.name).then(function (db) {
          newDb = db;
          var tx = db.transaction(SH.IDB.store, 'readwrite');
          var os = tx.objectStore(SH.IDB.store);
          data.keys.forEach(function (k, i) { os.put(data.vals[i], k); });
          return new Promise(function (res) {
            tx.oncomplete = function () { res(true); };
            tx.onerror = function () { res(false); };
          });
        }).then(function (ok) {
          if (oldDb) oldDb.close();
          if (newDb) newDb.close();
          if (ok) {
            try { indexedDB.deleteDatabase(SH.IDB.legacy); } catch (e) { /* leave it */ }
            console.info(SH.APP_NAME + ': migrated ' + data.keys.length +
                         ' cached folder handle(s) from the previous database.');
          }
          resolve(ok);
        });
      }).catch(function () {
        if (oldDb) try { oldDb.close(); } catch (e) {}
        resolve(false);
      });
    });
  };

  /* --- LOTO energy types + colour mapping ------------------------
     One authoritative list, so the Asset Register tab and the
     report generator cannot drift. Colours follow the industry
     conventions on ANSI/OSHA and manufacturer LOTO tag sheets. */
  SH.LOTO_ENERGY = [
    { id: 'electrical',       label: 'Electrical',       colour: '#c0392b' },  // red
    { id: 'pneumatic',        label: 'Pneumatic',        colour: '#2980b9' },  // blue
    { id: 'hydraulic',        label: 'Hydraulic',        colour: '#8e44ad' },  // purple
    { id: 'water',            label: 'Water',            colour: '#3498db' },  // light blue
    { id: 'gas',              label: 'Gas',              colour: '#f39c12' },  // amber
    { id: 'steam',            label: 'Steam',            colour: '#e67e22' },  // orange
    { id: 'thermal',          label: 'Thermal',          colour: '#d35400' },  // dark orange
    { id: 'gravity',          label: 'Gravity',          colour: '#7f8c8d' },  // grey
    { id: 'stored-pressure',  label: 'Stored pressure',  colour: '#16a085' },  // teal
    { id: 'chemical',         label: 'Chemical',         colour: '#27ae60' },  // green
    { id: 'mechanical',       label: 'Mechanical',       colour: '#34495e' },  // slate
    { id: 'other',            label: 'Other',            colour: '#95a5a6' }   // muted
  ];

  /* --- application revision (single source of truth; shown in header) --- */
  SH.VERSION = '0.13.0';
  SH.BUILD   = '2026-07-09';

  /* --- registries (filled by page/tab scripts as they load) --- */
  SH.pages = {};                 // pageId -> page object (has mount / onTab)
  SH.tabs  = {};                 // "pageId/tabId" -> tab object (has mount)
  SH.registerPage = function (id, def) { SH.pages[id] = Object.assign({ id: id }, def); };
  SH.registerTab  = function (pageId, id, def) { SH.tabs[pageId + '/' + id] = Object.assign({ pageId: pageId, id: id }, def); };

  /* --- tiny DOM helper: SH.el('div',{class:'x',onClick:fn}, child, 'text') --- */
  SH.el = function (tag, attrs) {
    var e = document.createElement(tag), i, k;
    if (attrs) for (k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  };
  SH.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  SH.qs  = function (sel, root) { return (root || document).querySelector(sel); };

  /* --- minimal event bus (e.g. 'project:changed') --- */
  SH.bus = (function () {
    var m = {};
    return {
      on:   function (ev, fn) { (m[ev] = m[ev] || []).push(fn); return fn; },
      off:  function (ev, fn) { m[ev] = (m[ev] || []).filter(function (f) { return f !== fn; }); },
      emit: function (ev, data) { (m[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }
    };
  })();

  /* -------------------------------------------------------------
     SH.tabbedPage — the standard page shape.
     Every left-menu page is built with this so sub-tabs behave
     identically everywhere. A page controller is just:

       SH.registerPage('verification', SH.tabbedPage({
         title: 'Verification',
         tabs: [
           { id:'circuit', label:'Circuit Verification', src:'pages/verification/tabs/circuit/circuit.js' },
           ...
         ]
       }));

     Each tab file registers itself:
       SH.registerTab('verification','circuit', {
         mount:   function(host,ctx){ ... },   // required
         unmount: function(){ ... }            // optional: remove bus/window listeners
       });
     unmount() is called on the outgoing tab before its DOM is discarded.
     ------------------------------------------------------------- */
  SH.tabbedPage = function (cfg) {
    return {
      title: cfg.title,
      tabs: cfg.tabs || [],
      _page: null, _bar: null, _sub: null, _hosts: null, _shown: null,

      mount: function (host, ctx) {
        if (this._sub && this._sub.parentNode === host) return;   // already built
        this._page = ctx.page;
        this._hosts = this._hosts || {};
        host.innerHTML = '';
        var bar = SH.el('div', { class: 'tabbar' });
        var self = this;
        this.tabs.forEach(function (t) {
          var b = SH.el('button', {
            class: 'tab', 'data-tab': t.id,
            onClick: function () { location.hash = '#/' + self._page + '/' + t.id; }
          }, t.label);
          bar.appendChild(b);
        });
        var sub = SH.el('div', { class: 'tabcontent' });
        host.appendChild(bar);
        host.appendChild(sub);
        this._bar = bar; this._sub = sub;
      },

      /* Tab hosts are built once and then hidden/shown. Destroying and
         re-mounting on every switch threw away anything the user had typed
         but not yet saved. A tab that needs to refresh on return can expose
         onShow(); a tab that must release resources can expose unmount(),
         which now runs only when the page itself is torn down. */
      onTab: function (tabId) {
        var self = this;
        var tab = this.tabs.filter(function (t) { return t.id === tabId; })[0] || this.tabs[0];
        if (!tab) { this._sub.innerHTML = '<div class="stub">No tabs defined.</div>'; return; }
        if (tabId !== tab.id) { location.hash = '#/' + this._page + '/' + tab.id; return; }

        [].forEach.call(this._bar.children, function (c) {
          c.classList.toggle('active', c.getAttribute('data-tab') === tab.id);
        });

        Object.keys(this._hosts).forEach(function (id) {
          self._hosts[id].style.display = (id === tab.id) ? '' : 'none';
        });

        if (this._hosts[tab.id]) {
          this._shown = tab.id;
          var live = SH.tabs[this._page + '/' + tab.id];
          if (live && live.onShow) { try { live.onShow(); } catch (e) { console.error(e); } }
          return;
        }

        SH.loader.load(tab.src).then(function () {
          if (self._hosts[tab.id]) return;                         // raced; already built
          var def = SH.tabs[self._page + '/' + tab.id];
          var thost = SH.el('div', { class: 'tab-host' });
          self._sub.appendChild(thost);
          self._hosts[tab.id] = thost;
          self._shown = tab.id;
          if (def && def.mount) def.mount(thost, { page: self._page, tab: tab.id });
          else thost.innerHTML = '<div class="stub">Tab "' + SH.esc(tab.id) + '" has no mount() yet.</div>';
          // the target is the only host that should be visible
          Object.keys(self._hosts).forEach(function (id) {
            self._hosts[id].style.display = (id === self._shown) ? '' : 'none';
          });
        }).catch(function (err) {
          self._sub.innerHTML = '<div class="stub error">Failed to load tab: ' + SH.esc(err.message) + '</div>';
        });
      },

      /* Called by the router only if a page is ever destroyed. */
      destroy: function () {
        var self = this;
        Object.keys(this._hosts || {}).forEach(function (id) {
          var def = SH.tabs[self._page + '/' + id];
          if (def && def.unmount) { try { def.unmount(); } catch (e) { console.error(e); } }
        });
        this._hosts = {};
      }
    };
  };

})(window.SH);
