/* ==============================================================
   FS Workbench — Settings › Data & Storage
   File:     pages/settings/tabs/data-storage/data-storage.js
   Rev:      0.4.1
   Updated:  2026-07-10
   Requires: core.js, store.js, settings.js (>= 0.10.0)
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   The one tab that may deliberately offer Choose / Reconnect /
   Forget for the app data folder, and Choose for the projects
   root. All product naming comes from SH.APP.name.
   ============================================================== */
(function () {
  'use strict';

  // Single rename point: js/core.js owns SH.APP. Never hard-code the product name.
  var APP = (SH.APP && SH.APP.name) || 'FS Workbench';

  /* ---------- scoped styles (never added to css/app.css) -------- */

  var CSS = [
    '.t-data-storage .ds-body{display:grid;gap:16px}',
    '.t-data-storage .ds-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}',
    '.t-data-storage .ds-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
    '.t-data-storage .ds-pill{border:1px solid var(--line);color:var(--muted)}',
    '.t-data-storage .ds-ok{border-color:var(--pass);color:var(--pass)}',
    '.t-data-storage .ds-warn{border-color:var(--warn);color:var(--warn)}',
    '.t-data-storage .ds-bad{border-color:var(--fail);color:var(--fail)}',
    '.t-data-storage .ds-label{color:var(--muted);min-width:104px}',
    '.t-data-storage .ds-path{word-break:break-all}',
    '.t-data-storage .ds-empty{color:var(--muted);font-style:italic}',
    '.t-data-storage .tbl .btn{padding:2px 10px}',
    '.t-data-storage .tbl td.ds-act{white-space:nowrap;text-align:right}',
    '.t-data-storage .ds-note{margin-bottom:16px}'
  ].join('\n');

  /* ---------- status vocabulary --------------------------------- */

  var SETTINGS_STATUS = {
    none:    ['No folder',      'bad'],
    memory:  ['Memory only',    'bad'],
    saved:   ['Saved',          'ok'],
    unsaved: ['Unsaved',        'warn'],
    saving:  ['Saving…',        'warn']
  };
  var PERMISSION = {
    granted: ['Access granted', 'ok'],
    prompt:  ['Needs reconnect','warn'],
    none:    ['No access',      'bad']
  };
  var STORE_STATUS = {
    none:    ['No project',     'muted'],
    memory:  ['Memory only',    'bad'],
    saved:   ['Saved',          'ok'],
    unsaved: ['Unsaved',        'warn'],
    saving:  ['Saving…',        'warn']
  };

  /* ---------- small helpers ------------------------------------- */

  function spec(map, key) { return map[key] || [String(key || '—'), 'muted']; }

  function pill(s) {
    return SH.el('span', { class: 'pill ds-pill ds-' + s[1] }, s[0]);
  }

  function setPill(el, s) {
    if (!el) return;
    el.className = 'pill ds-pill ds-' + s[1];
    el.textContent = s[0];
  }

  function card(title) {
    var c = SH.el('div', { class: 'card' });
    c.appendChild(SH.el('h2', { class: 'section' }, title));
    return c;
  }

  function field(label, valueEl) {
    return SH.el('div', { class: 'ds-row' },
      SH.el('span', { class: 'ds-label' }, label),
      valueEl);
  }

  function pathEl(text) {
    return text
      ? SH.el('code', { class: 'ds-path' }, text)
      : SH.el('span', { class: 'ds-empty' }, 'Not chosen');
  }

  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function cancelled(err) {
    return !!err && (err.name === 'AbortError' || err.code === 'ABORT');
  }

  // The projects root has no single documented accessor. Feature-detect,
  // then fall back to the open project's display path.
  function rootLabel() {
    if (!SH.store.hasRoot()) return '';
    if (typeof SH.store.rootName === 'function') return SH.store.rootName() || '';
    if (typeof SH.store.rootPath === 'function') return SH.store.rootPath() || '';
    if (SH.store.hasProject()) {
      var p = String(SH.store.path() || '');
      var i = p.indexOf(' / ');
      if (i > 0) return p.slice(0, i);
    }
    return 'Connected';
  }

  function confirmDestructive(message) {
    if (!SH.settings.get('prefs.confirmBeforeDelete', true)) return true;
    return window.confirm(message);
  }

  /* ---------- the tab ------------------------------------------- */

  SH.registerTab('settings', 'data-storage', {

    mount: function (host) {
      var self = this;

      host.classList.add('t-data-storage');
      host.appendChild(SH.el('style', null, CSS));          // SH.el sets textContent

      this._note = SH.el('div', { class: 'warnnote ds-note' });
      this._note.style.display = 'none';
      host.appendChild(this._note);

      this._body = SH.el('div', { class: 'ds-body' });
      host.appendChild(this._body);

      this._token = 0;
      this._pending = false;
      this._last = '';

      // Redraw guard: never rebuild the DOM out from under a focused control.
      this._onFocusOut = function () {
        if (!self._pending) return;
        window.setTimeout(function () {
          if (self._body && !self._body.contains(document.activeElement)) self._render();
        }, 0);
      };
      this._body.addEventListener('focusout', this._onFocusOut);

      this._onData = function () { self._render(); };
      this._onStatus = function () { self._paint(); };

      SH.bus.on('settings:changed', this._onData);
      SH.bus.on('settings:status',  this._onStatus);
      SH.bus.on('project:root',     this._onData);
      SH.bus.on('project:changed',  this._onData);
      SH.bus.on('project:status',   this._onStatus);

      this._render();
    },

    onShow: function () {
      if (this._pending) this._render();
      else { this._paint(); this._refresh(); }
    },

    unmount: function () {
      SH.bus.off('settings:changed', this._onData);
      SH.bus.off('settings:status',  this._onStatus);
      SH.bus.off('project:root',     this._onData);
      SH.bus.off('project:changed',  this._onData);
      SH.bus.off('project:status',   this._onStatus);
      if (this._body) this._body.removeEventListener('focusout', this._onFocusOut);
      this._body = this._note = null;
    },

    /* ---- messaging ---- */

    _say: function (text) {
      this._message = text || '';
      if (!this._note) return;
      this._note.textContent = this._message;
      this._note.style.display = this._message ? '' : 'none';
    },

    _run: function (promise) {
      var self = this;
      Promise.resolve(promise).then(function () {
        self._say('');
        self._render();
      })['catch'](function (err) {
        if (cancelled(err)) return;                 // the user closed the picker
        self._say((err && err.message) || 'That did not work. Try again.');
      });
    },

    /* ---- render ---- */

    _render: function () {
      var b = this._body;
      if (!b) return;
      if (b.contains(document.activeElement)) { this._pending = true; return; }

      this._pending = false;
      this._token++;
      b.innerHTML = '';
      this._countEl = null;
      this._recentsEl = null;

      b.appendChild(this._dataFolderCard());
      b.appendChild(this._projectsCard());
      b.appendChild(this._recentsCard());
      b.appendChild(this._prefsCard());
      b.appendChild(this._mapCard());
      b.appendChild(this._resetCard());

      this._say(this._message);
      this._paint();
      this._refresh();
    },

    // Only the save/permission indicators. Falls through to a full render
    // when the *shape* of the page changes (memory ⇄ attached, grant lost).
    _paint: function () {
      if (!this._body) return;
      var s = SH.settings.status();
      var p = SH.settings.permission();
      var r = SH.store.status();

      var key = s + '|' + p + '|' + (SH.store.hasRoot() ? '1' : '0');
      if (this._last && this._last !== key) {
        var shapeChanged =
          (this._last.split('|')[0] === 'memory') !== (s === 'memory') ||
          this._last.split('|')[1] !== p ||
          this._last.split('|')[2] !== (SH.store.hasRoot() ? '1' : '0');
        this._last = key;
        if (shapeChanged) { this._render(); return; }
      }
      this._last = key;

      setPill(this._pillSettings, spec(SETTINGS_STATUS, s));
      setPill(this._pillPermission, spec(PERMISSION, p));
      setPill(this._pillProject, spec(STORE_STATUS, r));
    },

    // Anything that has to be read off disk.
    _refresh: function () {
      var self = this, token = this._token;

      if (this._countEl && SH.store.hasRoot()) {
        this._countEl.textContent = 'Reading…';
        Promise.resolve(SH.store.listProjects()).then(function (list) {
          if (token !== self._token || !self._countEl) return;
          var n = list ? list.length : 0;
          self._countEl.textContent = n === 1 ? '1 project in this folder'
                                              : n + ' projects in this folder';
        })['catch'](function () {
          if (token !== self._token || !self._countEl) return;
          self._countEl.textContent = 'This folder could not be read. Choose it again.';
        });
      }

      if (this._recentsEl) {
        Promise.resolve(SH.store.listRecents()).then(function (list) {
          if (token !== self._token) return;
          self._paintRecents(list || []);
        })['catch'](function () {
          if (token !== self._token) return;
          self._paintRecents([]);
        });
      }
    },

    /* ---- card: app data folder ---- */

    _dataFolderCard: function () {
      var self = this;
      var c = card(APP + ' data folder');
      var attached = SH.settings.hasDataFolder();
      var perm = SH.settings.permission();
      var status = SH.settings.status();

      c.appendChild(SH.el('p', { class: 'hint' },
        'Holds your company details, logo, report themes, report layout, information sections, ' +
        'custom components and installed component libraries. It outlives every job — client ' +
        'details are never written here.'));

      this._pillSettings = pill(spec(SETTINGS_STATUS, status));
      this._pillPermission = pill(spec(PERMISSION, perm));

      c.appendChild(field('Folder', pathEl(SH.settings.path())));
      c.appendChild(field('State',
        SH.el('span', { class: 'ds-row' }, this._pillSettings, this._pillPermission)));

      if (status === 'memory') {
        c.appendChild(SH.el('div', { class: 'warnnote' },
          'No folder is attached, so every change is held in memory and is lost when this tab ' +
          'closes. Choose a folder to keep your settings.'));
      }
      if (perm === 'prompt') {
        c.appendChild(SH.el('div', { class: 'warnnote' },
          'The browser has dropped write access to this folder. Reconnect to restore it — one ' +
          'click, no folder picker.'));
      }

      var actions = SH.el('div', { class: 'ds-actions' });

      actions.appendChild(SH.el('button', {
        class: 'btn',
        onClick: function () {
          var p = SH.settings.chooseDataFolder();   // picker: first statement of the handler
          self._run(p);
        }
      }, attached ? 'Change folder…' : 'Choose folder…'));

      if (perm === 'prompt') {
        actions.appendChild(SH.el('button', {
          class: 'btn',
          onClick: function () {
            var p = SH.settings.reconnectDataFolder();  // needs a live gesture, first statement
            self._run(p);
          }
        }, 'Reconnect'));
      }

      if (attached) {
        actions.appendChild(SH.el('button', {
          class: 'btn ghost',
          onClick: function () { self._run(SH.settings.load()); }
        }, 'Reload from disk'));

        actions.appendChild(SH.el('button', {
          class: 'btn danger',
          onClick: function () {
            if (!window.confirm(
              'Forget this data folder?\n\n' +
              APP + ' drops the cached handle and will ask for a folder next time. ' +
              'Nothing on disk is deleted.')) return;
            self._run(SH.settings.forget());
          }
        }, 'Forget folder'));
      }

      c.appendChild(actions);
      c.appendChild(SH.el('p', { class: 'hint' },
        'Choosing the folder is a once-per-machine act. The handle is cached so ' + APP +
        ' re-attaches on reload.'));
      return c;
    },

    /* ---- card: projects folder ---- */

    _projectsCard: function () {
      var self = this;
      var c = card('Projects folder');

      c.appendChild(SH.el('p', { class: 'hint' },
        'The folder that contains your project folders — one folder per job, each with its own ' +
        'project.json. A project folder is not a projects folder.'));

      c.appendChild(field('Folder', pathEl(rootLabel())));

      this._countEl = SH.el('span', { class: 'ds-empty' },
        SH.store.hasRoot() ? 'Reading…' : 'Choose a folder to list its projects.');
      c.appendChild(field('Contents', this._countEl));

      this._pillProject = pill(spec(STORE_STATUS, SH.store.status()));
      c.appendChild(field('Open project',
        SH.el('span', { class: 'ds-row' },
          SH.el('span', { class: SH.store.hasProject() ? 'ds-path' : 'ds-empty' },
            SH.store.hasProject() ? String(SH.store.path() || '') : 'No project open'),
          this._pillProject)));

      var actions = SH.el('div', { class: 'ds-actions' });

      actions.appendChild(SH.el('button', {
        class: 'btn',
        onClick: function () {
          var p = SH.store.chooseRoot();            // picker: first statement of the handler
          self._run(p);
        }
      }, SH.store.hasRoot() ? 'Change projects folder…' : 'Choose projects folder…'));

      actions.appendChild(SH.el('button', {
        class: 'btn ghost',
        onClick: function () {
          var p = SH.store.openProjectFolder();     // picker: first statement of the handler
          self._run(p);
        }
      }, 'Open a project folder…'));

      c.appendChild(actions);
      c.appendChild(SH.el('p', { class: 'hint' },
        'Opening a single project folder from anywhere leaves the projects folder unchanged.'));
      return c;
    },

    /* ---- card: recent projects ---- */

    _recentsCard: function () {
      var c = card('Recent projects');
      c.appendChild(SH.el('p', { class: 'hint' },
        APP + ' remembers the folder itself, not its path — a moved or renamed folder has to ' +
        'be opened again.'));
      this._recentsEl = SH.el('div', null, SH.el('span', { class: 'ds-empty' }, 'Reading…'));
      c.appendChild(this._recentsEl);
      return c;
    },

    _paintRecents: function (list) {
      var self = this, wrap = this._recentsEl;
      if (!wrap) return;
      wrap.innerHTML = '';

      if (!list.length) {
        wrap.appendChild(SH.el('p', { class: 'ds-empty' },
          'Nothing yet. Projects you open appear here.'));
        return;
      }

      var tbl = SH.el('table', { class: 'tbl' });
      var thead = SH.el('thead');
      var hr = SH.el('tr');
      ['Project', 'Client', 'Folder', 'Last opened', ''].forEach(function (h) {
        hr.appendChild(SH.el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);

      var tbody = SH.el('tbody');
      list.forEach(function (r) {
        var tr = SH.el('tr');
        tr.appendChild(SH.el('td', null, r.name || r.folder || '—'));
        tr.appendChild(SH.el('td', null, r.client || '—'));
        tr.appendChild(SH.el('td', null,
          (r.rootName ? r.rootName + ' / ' : '') + (r.folder || '—')));
        tr.appendChild(SH.el('td', null, when(r.lastOpened)));

        var act = SH.el('td', { class: 'ds-act' });
        act.appendChild(SH.el('button', {
          class: 'btn',
          onClick: function () {
            var p = SH.store.openRecent(r.id);     // needs a live gesture: first statement
            self._open(p, r);
          }
        }, 'Open'));
        act.appendChild(SH.el('button', {
          class: 'btn ghost',
          onClick: function () {
            if (!confirmDestructive('Remove "' + (r.name || r.folder) + '" from this list?')) return;
            self._run(SH.store.forgetRecent(r.id));
          }
        }, 'Forget'));
        tr.appendChild(act);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);

      var actions = SH.el('div', { class: 'ds-actions' });
      actions.appendChild(SH.el('button', {
        class: 'btn danger',
        onClick: function () {
          if (!window.confirm('Clear the recent projects list? The projects themselves stay on disk.')) return;
          self._run(SH.store.clearRecents());
        }
      }, 'Clear list'));
      wrap.appendChild(actions);
    },

    // openRecent() names its failure, so the user is sent to the right problem.
    _open: function (promise, r) {
      var self = this;
      Promise.resolve(promise).then(function () {
        self._say('');
        self._render();
      })['catch'](function (err) {
        var code = err && err.code;
        if (code === 'DENIED') {
          self._say('The browser refused access to that folder. Click Open again and allow it.');
        } else if (code === 'GONE') {
          self._say('"' + (r.name || r.folder) + '" has moved or been deleted. Removed from the list.');
          Promise.resolve(SH.store.forgetRecent(r.id))['catch'](function () {})
            .then(function () { self._refresh(); });
          return;
        } else if (code === 'INVALID') {
          self._say('That folder holds no project.json, so it is not a project.');
        } else if (!cancelled(err)) {
          self._say((err && err.message) || 'That project could not be opened.');
        }
        self._refresh();
      });
    },

    /* ---- card: preferences ---- */

    _prefsCard: function () {
      var c = card('Preferences');
      var box = SH.el('input', { type: 'checkbox' });
      box.checked = !!SH.settings.get('prefs.confirmBeforeDelete', true);
      box.addEventListener('change', function () {
        SH.settings.set('prefs.confirmBeforeDelete', box.checked);
      });
      var lbl = SH.el('label', { class: 'chk' });
      lbl.appendChild(box);
      lbl.appendChild(SH.el('span', null, 'Ask before deleting a project, a component or a library'));
      c.appendChild(lbl);
      c.appendChild(SH.el('p', { class: 'hint' },
        'Forgetting the data folder and resetting settings always ask, whatever this says.'));
      return c;
    },

    /* ---- card: where things are stored ---- */

    _mapCard: function () {
      var c = card('Where things are stored');

      var rows = [
        ['Install tree', 'The app, its shipped information sections and any libraries it came with.', 'Never written'],
        [APP + ' data folder', 'settings.json, components.json, assets/, content/ overrides, libraries/.', 'Chosen once'],
        ['Project output tree', 'One folder per job: project.json, sf/, risk/, loto/, exports/.', 'Chosen once']
      ];

      var tbl = SH.el('table', { class: 'tbl' });
      var thead = SH.el('thead');
      var hr = SH.el('tr');
      ['Tree', 'What it holds', 'Written to'].forEach(function (h) { hr.appendChild(SH.el('th', null, h)); });
      thead.appendChild(hr);
      tbl.appendChild(thead);

      var tbody = SH.el('tbody');
      rows.forEach(function (r) {
        var tr = SH.el('tr');
        tr.appendChild(SH.el('td', null, r[0]));
        tr.appendChild(SH.el('td', null, r[1]));
        tr.appendChild(SH.el('td', null, r[2]));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      c.appendChild(tbl);

      c.appendChild(SH.el('p', { class: 'hint' },
        'Everything is a file you can see, copy and back up. The browser stores only the folder ' +
        'handles, so ' + APP + ' can re-open a folder you already chose — no project data and ' +
        'no settings are kept in the browser.'));
      return c;
    },

    /* ---- card: reset ---- */

    _resetCard: function () {
      var self = this;
      var c = card('Reset');

      c.appendChild(SH.el('div', { class: 'warnnote' },
        'Restores company details, report theme, report layout, section choices and custom ' +
        'components to their defaults. Your projects are untouched.'));

      var actions = SH.el('div', { class: 'ds-actions' });
      actions.appendChild(SH.el('button', {
        class: 'btn danger',
        onClick: function () {
          if (!window.confirm(
            'Reset all ' + APP + ' settings to defaults?\n\n' +
            'Company details, logo, themes, layout, section choices and custom components ' +
            'are cleared. Projects are not affected.')) return;
          self._run(SH.settings.reset());
        }
      }, 'Reset settings'));
      c.appendChild(actions);
      return c;
    }

  });
}());