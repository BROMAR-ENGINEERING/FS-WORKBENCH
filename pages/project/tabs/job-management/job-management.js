/* ==============================================================
   BroSafe — Project Details › Job Management
   File:     pages/project/tabs/job-management/job-management.js
   Rev:      0.7.0
   Updated:  2026-07-09
   Requires: core.js, store.js (>= 0.9.1 — projectId, project:status)
   --------------------------------------------------------------
   Internal job admin for the open project: job number (mirrors the
   project number set at create-project), purchase orders, quoted
   hours / cost code, and reference paths to the job documentation
   folders (NAS, OneDrive, etc.) via the directory picker.
   Reads/writes project.job only. Never touches SH.settings.
   Kept-alive safe: redraws on project switch, defers redraws while
   the caret is inside this tab, replays them on focusout / onShow.
   ============================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     Directory-handle cache (IndexedDB only — no project data here).
     NOTE: this belongs in js/store.js as a shared service. Defined
     defensively so it is created once and reused if store.js later
     provides it.
     ------------------------------------------------------------ */
  SH.fsdir = SH.fsdir || (function () {
    var DB = 'brosafe-handles', STORE = 'dirs', VER = 1;

    function open() {
      return new Promise(function (res, rej) {
        var r = indexedDB.open(DB, VER);
        r.onupgradeneeded = function () {
          if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    }

    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction(STORE, mode);
          var rq = fn(t.objectStore(STORE));
          t.oncomplete = function () { db.close(); res(rq && rq.result); };
          t.onerror = function () { db.close(); rej(t.error); };
        });
      });
    }

    return {
      supported: function () { return typeof window.showDirectoryPicker === 'function'; },
      put: function (key, handle) { return tx('readwrite', function (s) { return s.put(handle, key); }); },
      get: function (key) { return tx('readonly', function (s) { return s.get(key); }); },
      del: function (key) { return tx('readwrite', function (s) { return s.delete(key); }); },
      permission: function (handle, mode) {
        var opts = { mode: mode || 'read' };
        if (!handle || !handle.queryPermission) return Promise.resolve('granted');
        return handle.queryPermission(opts).then(function (p) {
          return p === 'granted' ? p : handle.requestPermission(opts);
        });
      }
    };
  })();

  /* ---------------------------------- store access */
  function defaults() {
    return {
      jobNumber: '', linkProjectNumber: true, costCode: '',
      quotedHours: '', quotedValue: '', notes: '',
      purchaseOrders: [], docLocations: []
    };
  }

  /* The project number captured at create-project.
     TODO: confirm the real key and drop the fallbacks. */
  function projectNumber() {
    return SH.store.get('meta.projectNumber', '') ||
           SH.store.get('meta.number', '') ||
           SH.store.get('projectNumber', '') || '';
  }

  /* A private clone. Never hand the store back the object it already
     holds — a store that compares a reference with itself sees no
     change and silently no-ops the save. */
  function jobClone() {
    var p = SH.store.project;
    if (!p) return null;
    var j = p.job || defaults();
    return JSON.parse(JSON.stringify(j));
  }

  function patchJob(mutate) {
    var j = jobClone();
    if (!j) return;
    mutate(j);
    SH.store.set('job', j);   // owns autosave + dirty flag + project:changed
  }

  /* ---------------------------------- helpers */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var LOC_TYPES = [
    ['nas', 'NAS / network share'],
    ['onedrive', 'OneDrive'],
    ['sharepoint', 'SharePoint'],
    ['local', 'Local disk'],
    ['other', 'Other']
  ];
  var PO_STATUS = [
    ['open', 'Open'], ['part', 'Part invoiced'],
    ['invoiced', 'Invoiced'], ['closed', 'Closed']
  ];

  function options(list, sel) {
    return list.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* no-op */ }
      document.body.removeChild(ta);
    }
  }

  /* ---------------------------------- rendering */
  function renderPO(po) {
    return '' +
      '<tr data-po="' + esc(po.id) + '">' +
        '<td><input class="field" data-po-k="number" value="' + esc(po.number) + '" placeholder="PO number"></td>' +
        '<td><input class="field" data-po-k="description" value="' + esc(po.description) + '" placeholder="Scope covered"></td>' +
        '<td><input class="field" data-po-k="value" value="' + esc(po.value) + '" placeholder="0.00" inputmode="decimal"></td>' +
        '<td><input class="field" type="date" data-po-k="date" value="' + esc(po.date) + '"></td>' +
        '<td><select class="field" data-po-k="status">' + options(PO_STATUS, po.status) + '</select></td>' +
        '<td><button class="btn" data-act="po-del" title="Remove purchase order">Remove</button></td>' +
      '</tr>';
  }

  function renderLoc(loc, canPick) {
    var linked = loc.handleKey ? '<span class="pill">Folder linked</span>' : '';
    return '' +
      '<div class="card" data-loc="' + esc(loc.id) + '">' +
        '<div class="grid2">' +
          '<label class="field"><span>Label</span>' +
            '<input data-loc-k="label" value="' + esc(loc.label) + '" placeholder="e.g. Site survey photos"></label>' +
          '<label class="field"><span>Location type</span>' +
            '<select data-loc-k="type">' + options(LOC_TYPES, loc.type) + '</select></label>' +
        '</div>' +
        '<label class="field"><span>Full path</span>' +
          '<input data-loc-k="path" value="' + esc(loc.path) + '" placeholder="\\\\nas\\jobs\\2026\\J-1042\\documentation"></label>' +
        '<div class="hint">' +
          (loc.handleName ? 'Picked folder: <strong>' + esc(loc.handleName) + '</strong> ' : '') + linked +
        '</div>' +
        '<div class="row">' +
          (canPick ? '<button class="btn" data-act="loc-pick">Choose folder…</button>' : '') +
          '<button class="btn" data-act="loc-copy">Copy path</button>' +
          '<button class="btn" data-act="loc-del">Remove</button>' +
        '</div>' +
      '</div>';
  }

  function render(host) {
    if (!SH.store.hasProject()) {
      host.innerHTML =
        '<div class="warnnote">No project is open. Open or create a project first.</div>';
      return;
    }

    var j = jobClone();
    var pn = projectNumber();
    var canPick = SH.fsdir.supported();

    /* Mirror the project number into the job number if the user has
       not unlinked it. Persist it so reports don't have to re-derive. */
    if (j.linkProjectNumber && pn && j.jobNumber !== pn) {
      patchJob(function (x) { x.jobNumber = pn; });
      j.jobNumber = pn;
    }

    host.innerHTML = '' +
      '<h2 class="section">Job identification</h2>' +
      '<div class="card">' +
        '<div class="grid2">' +
          '<label class="field"><span>Job number</span>' +
            '<input data-k="jobNumber" value="' + esc(j.jobNumber) + '"' +
            (j.linkProjectNumber ? ' readonly' : '') + ' placeholder="J-0000"></label>' +
          '<label class="field"><span>Cost code</span>' +
            '<input data-k="costCode" value="' + esc(j.costCode) + '" placeholder="Internal cost code"></label>' +
        '</div>' +
        '<label class="chk"><input type="checkbox" data-k="linkProjectNumber"' +
          (j.linkProjectNumber ? ' checked' : '') + '>' +
          '<span>Use the project number as the job number</span></label>' +
        (pn
          ? '<div class="hint">Project number: <strong>' + esc(pn) + '</strong></div>'
          : '<div class="hint">No project number set on this project yet.</div>') +
        '<div class="grid2">' +
          '<label class="field"><span>Quoted hours</span>' +
            '<input data-k="quotedHours" value="' + esc(j.quotedHours) + '" inputmode="decimal" placeholder="0"></label>' +
          '<label class="field"><span>Quoted value</span>' +
            '<input data-k="quotedValue" value="' + esc(j.quotedValue) + '" inputmode="decimal" placeholder="0.00"></label>' +
        '</div>' +
      '</div>' +

      '<h2 class="section">Purchase orders</h2>' +
      '<div class="card">' +
        (j.purchaseOrders.length
          ? '<table class="tbl"><thead><tr>' +
              '<th>PO number</th><th>Covers</th><th>Value</th><th>Received</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' + j.purchaseOrders.map(renderPO).join('') + '</tbody></table>'
          : '<div class="hint">No purchase order recorded. Add one if the job is covered by a PO.</div>') +
        '<div class="row"><button class="btn" data-act="po-add">Add purchase order</button></div>' +
      '</div>' +

      '<h2 class="section">Documentation folders</h2>' +
      (canPick
        ? '<div class="hint">Choosing a folder stores a link so BroSafe can reopen it later. ' +
          'The browser will not reveal the folder\'s full path — paste it in yourself so it can appear in reports.</div>'
        : '<div class="warnnote">This browser cannot open a folder picker. Record the full path by hand.</div>') +
      (j.docLocations.length
        ? j.docLocations.map(function (l) { return renderLoc(l, canPick); }).join('')
        : '<div class="card"><div class="hint">No documentation folder recorded.</div></div>') +
      '<div class="row"><button class="btn" data-act="loc-add">Add documentation folder</button></div>' +

      '<h2 class="section">Job notes</h2>' +
      '<div class="card">' +
        '<label class="field"><span>Internal notes</span>' +
          '<textarea data-k="notes" rows="4" placeholder="Not shown to the client unless included in a report.">' +
          esc(j.notes) + '</textarea></label>' +
      '</div>';
  }

  /* ---------------------------------- tab */
  SH.registerTab('project', 'job-management', {
    mount: function (host) {
      var self = this;
      self._host = host;
      self._pid = SH.store.projectId();
      self._pending = false;

      self._render = function () {
        self._pending = false;
        render(host);
      };

      /* project:changed. Identity change always wins. Otherwise, if the
         caret is inside this tab the event is almost certainly the echo
         of our own keystroke — defer, and replay on focusout / onShow. */
      self._onProject = function () {
        var pid = SH.store.projectId();
        var switched = (pid !== self._pid);
        self._pid = pid;

        if (switched || !SH.store.hasProject()) { self._render(); return; }
        if (host.contains(document.activeElement)) { self._pending = true; return; }
        self._render();
      };
      SH.bus.on('project:changed', self._onProject);

      /* focusout fires BEFORE focus lands on the next element, so tabbing
         between two fields would otherwise redraw and eat the caret.
         Re-check on the next tick and only redraw if focus really left. */
      self._onBlur = function () {
        setTimeout(function () {
          if (!self._host) return;
          if (self._pending && !self._host.contains(document.activeElement)) self._render();
        }, 0);
      };
      host.addEventListener('focusout', self._onBlur);

      /* Field edits write to the store but never re-render — the DOM
         shape is unchanged and the value is already on screen. */
      self._onInput = function (e) {
        if (!SH.store.hasProject()) return;
        var el = e.target;
        var poRow = el.closest && el.closest('[data-po]');
        var locCard = el.closest && el.closest('[data-loc]');

        if (poRow && el.dataset.poK) {
          patchJob(function (j) {
            var po = byId(j.purchaseOrders, poRow.dataset.po);
            if (po) po[el.dataset.poK] = el.value;
          });
          return;
        }
        if (locCard && el.dataset.locK) {
          patchJob(function (j) {
            var l = byId(j.docLocations, locCard.dataset.loc);
            if (l) l[el.dataset.locK] = el.value;
          });
          return;
        }
        if (!el.dataset.k) return;

        if (el.dataset.k === 'linkProjectNumber') {
          var on = el.checked;
          patchJob(function (j) {
            j.linkProjectNumber = on;
            if (on) j.jobNumber = projectNumber() || j.jobNumber;
          });
          self._render();          // readonly state of the field flips
          return;
        }
        patchJob(function (j) { j[el.dataset.k] = el.value; });
      };
      host.addEventListener('input', self._onInput);
      host.addEventListener('change', self._onInput);

      /* Row add/remove changes the DOM shape — these do re-render. */
      self._onClick = function (e) {
        if (!SH.store.hasProject()) return;
        var btn = e.target.closest && e.target.closest('[data-act]');
        if (!btn) return;
        e.preventDefault();
        var act = btn.dataset.act;
        var poRow = btn.closest('[data-po]');
        var locCard = btn.closest('[data-loc]');

        if (act === 'po-add') {
          patchJob(function (j) {
            j.purchaseOrders.push({ id: uid(), number: '', description: '', value: '', date: '', status: 'open' });
          });
          self._render();
        }
        else if (act === 'po-del' && poRow) {
          patchJob(function (j) {
            j.purchaseOrders = j.purchaseOrders.filter(function (x) { return x.id !== poRow.dataset.po; });
          });
          self._render();
        }
        else if (act === 'loc-add') {
          patchJob(function (j) {
            j.docLocations.push({ id: uid(), label: '', type: 'nas', path: '', handleName: '', handleKey: '' });
          });
          self._render();
        }
        else if (act === 'loc-del' && locCard) {
          var id = locCard.dataset.loc;
          var doomed = byId(jobClone().docLocations, id) || {};
          if (doomed.handleKey) SH.fsdir.del(doomed.handleKey);
          patchJob(function (j) {
            j.docLocations = j.docLocations.filter(function (x) { return x.id !== id; });
          });
          self._render();
        }
        else if (act === 'loc-copy' && locCard) {
          var path = (locCard.querySelector('[data-loc-k="path"]') || {}).value || '';
          if (path) copy(path);
        }
        else if (act === 'loc-pick' && locCard) {
          /* showDirectoryPicker() must be the first statement of the
             click handler — no await before it. */
          pickFolder(locCard.dataset.loc, self._render);
        }
      };
      host.addEventListener('click', self._onClick);

      self._render();
    },

    onShow: function () {
      if (this._pending) this._render();
    },

    unmount: function () {
      SH.bus.off('project:changed', this._onProject);
      if (this._host) {
        this._host.removeEventListener('focusout', this._onBlur);
        this._host.removeEventListener('input', this._onInput);
        this._host.removeEventListener('change', this._onInput);
        this._host.removeEventListener('click', this._onClick);
      }
      this._host = null;
    }
  });

  function pickFolder(locId, done) {
    if (!SH.fsdir.supported()) return;
    window.showDirectoryPicker({ id: 'brosafe-job-docs', mode: 'read', startIn: 'documents' })
      .then(function (handle) {
        var key = 'job:' + locId;
        return SH.fsdir.put(key, handle).then(function () {
          patchJob(function (j) {
            var l = byId(j.docLocations, locId);
            if (l) { l.handleKey = key; l.handleName = handle.name; if (!l.label) l.label = handle.name; }
          });
          done();
        });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;   /* user cancelled */
        console.warn('[job-management] folder picker failed:', err);
      });
  }
})();