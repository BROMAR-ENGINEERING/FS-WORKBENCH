/* ==============================================================
   FS Workbench — Safety Functions page
   File:     pages/safety-functions/safety-functions.js
   Rev:      0.5.0
   Updated:  2026-07-09
   Requires: core.js, store.js
   --------------------------------------------------------------
   Three-panel page controller. Left sidebar toggles between
   Functions and Devices lists (UI state, not persisted). Right
   panel loads sub-tabs when an item is selected.

   Sub-tab files do not exist yet — src paths are declared but
   registration will happen in each tab's own chat. Missing tabs
   render the standard "not built yet" stub.
   ============================================================== */

SH.registerPage('safety-functions', (function () {

  var SUB_TABS = {
    sf: [
      { id: 'sf-overview', label: 'Overview', src: 'pages/safety-functions/tabs/sf-overview/sf-overview.js' },
      { id: 'sf-devices',  label: 'Devices',  src: 'pages/safety-functions/tabs/sf-devices/sf-devices.js' }
    ],
    device: [
      { id: 'device-overview', label: 'Overview', src: 'pages/safety-functions/tabs/device-overview/device-overview.js' },
      { id: 'device-wiring',   label: 'Wiring',   src: 'pages/safety-functions/tabs/device-wiring/device-wiring.js' }
    ]
  };

  var STYLE_ID = 'sf-page-style';
  var STYLE = ''
    + '.sf-page{display:flex;gap:16px;height:calc(100vh - var(--header-h) - 48px);margin-top:20px}'
    + '.sf-side{flex:none;width:220px;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}'
    + '.sf-toggle{display:flex;border-bottom:1px solid var(--line)}'
    + '.sf-toggle button{flex:1;font:inherit;font-family:var(--sans);font-size:12.5px;font-weight:600;padding:10px 8px;background:var(--paper);border:0;border-right:1px solid var(--line);color:var(--muted);cursor:pointer;transition:all .12s ease}'
    + '.sf-toggle button:last-child{border-right:0}'
    + '.sf-toggle button.active{background:var(--card);color:var(--ink);box-shadow:inset 0 -2px 0 var(--amber)}'
    + '.sf-toggle button:hover:not(.active){color:var(--ink)}'
    + '.sf-newbar{padding:8px;border-bottom:1px solid var(--line-2)}'
    + '.sf-newbar .btn{width:100%}'
    + '.sf-list{flex:1;overflow-y:auto;padding:6px}'
    + '.sf-item{display:block;width:100%;text-align:left;background:transparent;border:1px solid transparent;border-radius:6px;padding:8px 10px;margin:2px 0;cursor:pointer;font:inherit;font-family:var(--sans);color:var(--ink);transition:background .12s ease}'
    + '.sf-item:hover{background:var(--paper)}'
    + '.sf-item.selected{background:var(--amber-soft);border-color:var(--amber-deep)}'
    + '.sf-item-top{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;margin-bottom:2px}'
    + '.sf-item-tag{font-family:var(--mono);color:var(--graphite)}'
    + '.sf-item-sub{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.sf-status{flex:none;width:8px;height:8px;border-radius:50%;background:var(--muted)}'
    + '.sf-status.verified{background:var(--pass)}'
    + '.sf-status.draft{background:var(--muted)}'
    + '.sf-status.review{background:var(--orange)}'
    + '.sf-status.rejected{background:var(--fail)}'
    + '.sf-typebadge{flex:none;font-family:var(--mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;padding:1px 5px;border-radius:3px;background:var(--paper);border:1px solid var(--line);color:var(--graphite)}'
    + '.sf-empty{padding:16px;color:var(--muted);font-size:12px;text-align:center}'
    + '.sf-detail{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}'
    + '.sf-detail-head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}'
    + '.sf-detail-title{font-family:var(--display);font-size:16px;font-weight:600}'
    + '.sf-detail-sub{font-size:12px;color:var(--muted)}'
    + '.sf-detail-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--paper)}'
    + '.sf-detail-tabs button{font:inherit;font-family:var(--sans);font-size:13px;font-weight:500;background:transparent;border:0;border-bottom:2.5px solid transparent;padding:9px 14px;margin-bottom:-1px;color:var(--muted);cursor:pointer;transition:color .12s}'
    + '.sf-detail-tabs button:hover{color:var(--ink)}'
    + '.sf-detail-tabs button.active{color:var(--ink);font-weight:600;border-bottom-color:var(--amber)}'
    + '.sf-detail-body{flex:1;overflow-y:auto;padding:18px}'
    + '.sf-placeholder{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:13px;text-align:center;padding:24px}'
  ;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function truncate(s, n) {
    s = s || ''; if (s.length <= n) return s;
    return s.slice(0, n - 1) + '\u2026';
  }

  return {
    title: 'Safety Functions',

    /* internal state */
    _host:     null,
    _side:     null,
    _detail:   null,
    _mode:     'sf',        // 'sf' | 'device' — UI toggle, not persisted
    _selected: null,        // { kind:'sf'|'device', id:'...' } | null
    _detailTab:null,        // active sub-tab id in the detail panel
    _hosts:    null,        // sub-tab kept-alive hosts: { tabId: element }
    _pid:      null,
    _onProject:null,

    mount: function (host) {
      var self = this;
      ensureStyle();

      this._host   = host;
      this._hosts  = {};
      this._pid    = SH.store.projectId();

      /* project no longer open, or none yet: show the standard warnnote */
      if (!SH.store.hasProject()) {
        host.innerHTML =
          '<div class="warnnote">No project is open. ' +
          'Open or create a project to begin.</div>';
      } else {
        this._buildLayout();
      }

      /* Subscribe once. Guards:
         - identity change (different project opened): always redraw
         - no project: always redraw
         - focus is inside the detail panel: skip (caret guard)  */
      this._onProject = function () {
        var pid = SH.store.projectId();
        if (pid !== self._pid || !SH.store.hasProject()) {
          self._pid = pid;
          self._selected = null;
          self._hosts = {};
          host.innerHTML = '';
          if (!SH.store.hasProject()) {
            host.innerHTML =
              '<div class="warnnote">No project is open. ' +
              'Open or create a project to begin.</div>';
          } else {
            self._buildLayout();
          }
          return;
        }
        if (self._detail && self._detail.contains(document.activeElement)) return;
        self._renderSidebarList();
      };
      SH.bus.on('project:changed', this._onProject);
    },

    onShow: function () {
      /* re-render on return in case something changed while hidden */
      if (SH.store.hasProject() && this._side) this._renderSidebarList();
    },

    destroy: function () {
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
      var self = this;
      Object.keys(this._hosts || {}).forEach(function (id) {
        var def = SH.tabs && SH.tabs['safety-functions/' + id];
        if (def && def.unmount) { try { def.unmount(); } catch (e) { console.error(e); } }
      });
      this._hosts = {};
    },

    onTab: function (/* tabId */) { /* not used — sub-tabs live inside the detail panel */ },

    /* ---------------------------------------------------------------- */

    _buildLayout: function () {
      var self = this;
      this._host.innerHTML = '';

      var page = SH.el('div', { class: 'sf-page' });

      /* --- sidebar ------------------------------------------------- */
      var side = SH.el('div', { class: 'sf-side' });

      var toggle = SH.el('div', { class: 'sf-toggle' });
      var btnF = SH.el('button', {
        class: this._mode === 'sf' ? 'active' : '',
        onClick: function () { self._setMode('sf'); }
      }, 'Functions');
      var btnD = SH.el('button', {
        class: this._mode === 'device' ? 'active' : '',
        onClick: function () { self._setMode('device'); }
      }, 'Devices');
      toggle.appendChild(btnF); toggle.appendChild(btnD);
      side.appendChild(toggle);

      var newBar = SH.el('div', { class: 'sf-newbar' });
      var newBtn = SH.el('button', {
        class: 'btn sm',
        onClick: function () {
          self._mode === 'sf' ? self._newSF() : self._newDevice();
        }
      }, this._mode === 'sf' ? '+ New Safety Function' : '+ New Device');
      newBar.appendChild(newBtn);
      side.appendChild(newBar);

      var list = SH.el('div', { class: 'sf-list' });
      side.appendChild(list);

      this._side    = side;
      this._sideList= list;
      this._sideNew = newBtn;
      this._sideToggleF = btnF;
      this._sideToggleD = btnD;

      /* --- detail panel ------------------------------------------- */
      var detail = SH.el('div', { class: 'sf-detail' });
      this._detail = detail;
      this._paintPlaceholder();

      page.appendChild(side);
      page.appendChild(detail);
      this._host.appendChild(page);

      this._renderSidebarList();
    },

    _setMode: function (mode) {
      if (mode === this._mode) return;
      this._mode = mode;
      this._sideToggleF.classList.toggle('active', mode === 'sf');
      this._sideToggleD.classList.toggle('active', mode === 'device');
      this._sideNew.textContent = mode === 'sf' ? '+ New Safety Function' : '+ New Device';
      /* clear selection when switching mode: an SF id is not a device id */
      this._selected = null;
      this._paintPlaceholder();
      this._renderSidebarList();
    },

    /* ---- sidebar list ---------------------------------------------- */

    _renderSidebarList: function () {
      if (!this._sideList) return;
      var self = this;
      this._sideList.innerHTML = '';

      var items = this._mode === 'sf'
        ? SH.store.get('sfs', [])
        : SH.store.get('devices', []);

      if (!items.length) {
        this._sideList.appendChild(SH.el('div', { class: 'sf-empty' },
          this._mode === 'sf'
            ? 'No safety functions yet.'
            : 'No devices yet.'));
        return;
      }

      items.forEach(function (item) {
        var el = self._mode === 'sf'
          ? self._renderSFItem(item)
          : self._renderDeviceItem(item);
        self._sideList.appendChild(el);
      });
    },

    _renderSFItem: function (sf) {
      var self = this;
      var selected = this._selected
        && this._selected.kind === 'sf'
        && this._selected.id === sf.id;

      var top = SH.el('div', { class: 'sf-item-top' });
      top.appendChild(SH.el('span', { class: 'sf-status ' + (sf.status || 'draft') }));
      top.appendChild(SH.el('span', { class: 'sf-item-tag' }, sf.id || ''));

      var sub = SH.el('div', { class: 'sf-item-sub' }, truncate(sf.name || 'Untitled', 40));

      var btn = SH.el('button', {
        class: 'sf-item' + (selected ? ' selected' : ''),
        onClick: function () { self._select({ kind: 'sf', id: sf.id }); }
      });
      btn.appendChild(top); btn.appendChild(sub);
      return btn;
    },

    _renderDeviceItem: function (dev) {
      var self = this;
      var selected = this._selected
        && this._selected.kind === 'device'
        && this._selected.id === dev.id;

      var top = SH.el('div', { class: 'sf-item-top' });
      top.appendChild(SH.el('span', { class: 'sf-item-tag' }, dev.tag || '\u2014'));
      top.appendChild(SH.el('span', { class: 'sf-typebadge' }, dev.type || 'other'));

      var sub = SH.el('div', { class: 'sf-item-sub' }, truncate(dev.description || 'No description', 40));

      var btn = SH.el('button', {
        class: 'sf-item' + (selected ? ' selected' : ''),
        onClick: function () { self._select({ kind: 'device', id: dev.id }); }
      });
      btn.appendChild(top); btn.appendChild(sub);
      return btn;
    },

    /* ---- create ---------------------------------------------------- */

    _newSF: function () {
      var sfs = (SH.store.get('sfs', []) || []).slice();
      var id  = 'sf_' + Date.now().toString(36);
      sfs.push({
        id: id,
        name: 'New Safety Function',
        status: 'draft',
        inputs: [], logic: [], outputs: []
      });
      SH.store.set('sfs', sfs);
      this._selected = { kind: 'sf', id: id };
      this._renderSidebarList();
      this._paintDetail();
    },

    _newDevice: function () {
      var devs = (SH.store.get('devices', []) || []).slice();
      var id   = 'dev_' + Date.now().toString(36);
      devs.push({
        id: id,
        tag: '',
        description: 'New Device',
        type: 'estop',
        manufacturer: '', model: '',
        source: 'manual',
        libraryRef: null,
        wiring: []
      });
      SH.store.set('devices', devs);
      this._selected = { kind: 'device', id: id };
      this._renderSidebarList();
      this._paintDetail();
    },

    /* ---- selection & detail --------------------------------------- */

    _select: function (sel) {
      if (this._selected
          && this._selected.kind === sel.kind
          && this._selected.id === sel.id) return;
      this._selected = sel;
      this._renderSidebarList();
      this._paintDetail();
    },

    _paintPlaceholder: function () {
      this._detail.innerHTML = '';
      this._hosts = {};
      this._detail.appendChild(SH.el('div', { class: 'sf-placeholder' },
        this._mode === 'sf'
          ? 'Select a safety function on the left, or create a new one.'
          : 'Select a device on the left, or create a new one.'));
    },

    _paintDetail: function () {
      var self = this;
      if (!this._selected) { this._paintPlaceholder(); return; }

      /* find the record */
      var rec;
      if (this._selected.kind === 'sf') {
        rec = (SH.store.get('sfs', []) || []).filter(function (s) {
          return s.id === self._selected.id;
        })[0];
      } else {
        rec = (SH.store.get('devices', []) || []).filter(function (d) {
          return d.id === self._selected.id;
        })[0];
      }
      if (!rec) { this._selected = null; this._paintPlaceholder(); return; }

      var tabs = SUB_TABS[this._selected.kind];

      /* header */
      this._detail.innerHTML = '';
      this._hosts = {};

      var head = SH.el('div', { class: 'sf-detail-head' });
      if (this._selected.kind === 'sf') {
        head.appendChild(SH.el('div', null,
          SH.el('div', { class: 'sf-detail-title' }, rec.name || 'Untitled'),
          SH.el('div', { class: 'sf-detail-sub'   }, (rec.id || '') + ' \u00b7 ' + (rec.status || 'draft'))
        ));
      } else {
        head.appendChild(SH.el('div', null,
          SH.el('div', { class: 'sf-detail-title' }, rec.description || 'New Device'),
          SH.el('div', { class: 'sf-detail-sub'   }, (rec.tag || '\u2014') + ' \u00b7 ' + (rec.type || 'other'))
        ));
      }
      this._detail.appendChild(head);

      /* sub-tabbar */
      var bar = SH.el('div', { class: 'sf-detail-tabs' });
      tabs.forEach(function (t) {
        bar.appendChild(SH.el('button', {
          'data-tab': t.id,
          onClick: function () { self._selectDetailTab(t.id); }
        }, t.label));
      });
      this._detail.appendChild(bar);
      this._detailBar = bar;

      /* body */
      this._detailBody = SH.el('div', { class: 'sf-detail-body' });
      this._detail.appendChild(this._detailBody);

      /* default to first sub-tab, or restore previous if valid */
      var startTab = tabs[0].id;
      if (this._detailTab && tabs.filter(function (t) { return t.id === self._detailTab; }).length) {
        startTab = this._detailTab;
      }
      this._selectDetailTab(startTab);
    },

    _selectDetailTab: function (tabId) {
      var self = this;
      var tabs = SUB_TABS[this._selected.kind];
      var tab  = tabs.filter(function (t) { return t.id === tabId; })[0];
      if (!tab) return;
      this._detailTab = tabId;

      /* toggle active state on the buttons */
      [].forEach.call(this._detailBar.children, function (c) {
        c.classList.toggle('active', c.getAttribute('data-tab') === tabId);
      });

      /* hide all cached hosts, show target */
      Object.keys(this._hosts).forEach(function (id) {
        self._hosts[id].style.display = (id === tabId) ? '' : 'none';
      });

      if (this._hosts[tabId]) {
        var live = SH.tabs && SH.tabs['safety-functions/' + tabId];
        if (live && live.onShow) { try { live.onShow(); } catch (e) { console.error(e); } }
        return;
      }

      /* first visit: load the tab module and mount it */
      var thost = SH.el('div', { class: 'tab-host' });
      this._detailBody.appendChild(thost);
      this._hosts[tabId] = thost;

      SH.loader.load(tab.src).then(function () {
        var def = SH.tabs && SH.tabs['safety-functions/' + tabId];
        if (def && def.mount) {
          def.mount(thost, {
            page:     'safety-functions',
            tab:      tabId,
            selected: self._selected
          });
        } else {
          thost.innerHTML = '<div class="stub">Tab \u201c' + SH.esc(tabId) + '\u201d is not built yet.</div>';
        }
      }).catch(function (err) {
        thost.innerHTML = '<div class="stub error">Failed to load tab: ' + SH.esc(err.message) + '</div>';
      });
    }
  };

}()));
