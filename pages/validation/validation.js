/* ==============================================================
   FS Workbench — Validation page controller
   File:     pages/validation/validation.js
   Rev:      0.5.0
   Updated:  2026-07-09
   Requires: core.js, store.js (SH.store.get / SH.store.set)
   --------------------------------------------------------------
   Custom page controller — does NOT use SH.tabbedPage() because
   the tab set depends on the method chosen at runtime.

   Before a method is selected the page shows a method-selector
   card. Once one is chosen it is written to
   project.validation.method and the appropriate tab set renders.

   Tab files are registered here but do not exist yet — each is
   built by its own chat. Missing tabs render the standard stub.
   ============================================================== */

SH.registerPage('validation', (function () {

  /* ---- tab definitions per method -------------------------------- */
  var TABS = {
    comprehensive: [
      { id: 'phase-1',          label: 'Phase 1 \u2014 I/O Verification',      src: 'pages/validation/tabs/phase-1/phase-1.js' },
      { id: 'phase-2',          label: 'Phase 2 \u2014 Normal Operation',       src: 'pages/validation/tabs/phase-2/phase-2.js' },
      { id: 'phase-3',          label: 'Phase 3 \u2014 Fault Injection',        src: 'pages/validation/tabs/phase-3/phase-3.js' },
      { id: 'phase-4',          label: 'Phase 4 \u2014 Category Verification',  src: 'pages/validation/tabs/phase-4/phase-4.js' },
      { id: 'version-control',  label: 'Version Control',                       src: 'pages/validation/tabs/version-control/version-control.js' },
      { id: 'report',           label: 'Report',                                src: 'pages/validation/tabs/report/report.js' }
    ],
    simplified: [
      { id: 'input-verification',    label: 'Input Verification',      src: 'pages/validation/tabs/input-verification/input-verification.js' },
      { id: 'output-verification',   label: 'Output Verification',     src: 'pages/validation/tabs/output-verification/output-verification.js' },
      { id: 'category-verification', label: 'Category Verification',   src: 'pages/validation/tabs/category-verification/category-verification.js' },
      { id: 'version-control',       label: 'Version Control',         src: 'pages/validation/tabs/version-control/version-control.js' },
      { id: 'report',                label: 'Report',                  src: 'pages/validation/tabs/report/report.js' }
    ]
  };

  /* ---- page object ----------------------------------------------- */
  return {
    title: 'Validation',

    /* internal state */
    _host:   null,
    _bar:    null,
    _sub:    null,
    _hosts:  null,
    _shown:  null,
    _method: null,   /* mirrors project.validation.method */
    _onProject: null,

    /* ---- lifecycle ------------------------------------------------ */

    mount: function (host, ctx) {
      this._host   = host;
      this._hosts  = {};
      this._method = null;

      var self = this;
      this._onProject = function () { self._sync(); };
      SH.bus.on('project:changed', this._onProject);

      this._sync();
    },

    onShow: function () {
      /* Re-check method in case it changed while we were hidden. */
      this._sync();
    },

    destroy: function () {
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
      var self = this;
      Object.keys(this._hosts || {}).forEach(function (id) {
        var key = 'validation/' + id;
        var def = SH.tabs && SH.tabs[key];
        if (def && def.unmount) { try { def.unmount(); } catch (e) { console.error(e); } }
      });
      this._hosts = {};
    },

    /* Called by the router for hash-driven tab switching. */
    onTab: function (tabId) {
      if (!this._method) return;          /* selector is showing — ignore */
      var tabs  = TABS[this._method] || [];
      var tab   = tabs.filter(function (t) { return t.id === tabId; })[0] || tabs[0];
      if (!tab) return;
      if (tabId !== tab.id) { location.hash = '#/validation/' + tab.id; return; }

      /* Update the active button */
      if (this._bar) {
        [].forEach.call(this._bar.children, function (c) {
          c.classList.toggle('active', c.getAttribute('data-tab') === tab.id);
        });
      }

      /* Show/hide kept-alive tab hosts */
      var self = this;
      Object.keys(this._hosts).forEach(function (id) {
        self._hosts[id].style.display = (id === tab.id) ? '' : 'none';
      });

      if (this._hosts[tab.id]) {
        this._shown = tab.id;
        var live = SH.tabs && SH.tabs['validation/' + tab.id];
        if (live && live.onShow) { try { live.onShow(); } catch (e) { console.error(e); } }
        return;
      }

      /* First visit — load and mount the tab */
      var thost = SH.el('div', { class: 'tab-host' });
      this._sub.appendChild(thost);
      this._hosts[tab.id] = thost;
      this._shown = tab.id;

      SH.loader.load(tab.src).then(function () {
        Object.keys(self._hosts).forEach(function (id) {
          self._hosts[id].style.display = (id === self._shown) ? '' : 'none';
        });
        var def = SH.tabs && SH.tabs['validation/' + tab.id];
        if (def && def.mount) {
          def.mount(thost, { page: 'validation', tab: tab.id });
        } else {
          thost.innerHTML = '<div class="stub">Tab \u201c' + SH.esc(tab.id) + '\u201d is not built yet.</div>';
        }
      }).catch(function (err) {
        thost.innerHTML = '<div class="stub error">Failed to load tab: ' + SH.esc(err.message) + '</div>';
      });
    },

    /* ---- internal helpers ----------------------------------------- */

    /* Re-read the method from the store and redraw if it has changed. */
    _sync: function () {
      if (!SH.store.hasProject()) {
        this._showNoProject();
        return;
      }
      var method = SH.store.get('validation.method', null);
      if (method === this._method) return;   /* nothing changed */
      this._method = method;
      method ? this._buildTabs(method) : this._buildSelector();
    },

    _showNoProject: function () {
      this._method = null;
      this._host.innerHTML = '';
      this._bar = null; this._sub = null; this._hosts = {};
      this._host.appendChild(
        SH.el('div', { class: 'warnnote' },
          'No project is open. Open or create a project to begin validation.')
      );
    },

    /* ----------------------------------------------------------------
       Method selector
       ---------------------------------------------------------------- */
    _buildSelector: function () {
      this._host.innerHTML = '';
      this._bar = null; this._sub = null; this._hosts = {};

      var self = this;

      var head = SH.el('div', { class: 'page-head' });
      head.appendChild(SH.el('h1', null, 'Validation'));
      this._host.appendChild(head);

      var intro = SH.el('p', { class: 'hint' },
        'Choose a validation method for this project. ' +
        'The method determines how tests are organised and cannot be changed ' +
        'without clearing existing validation data.');
      this._host.appendChild(intro);

      var grid = SH.el('div', { class: 'grid2' });

      grid.appendChild(this._methodCard(
        'Comprehensive Validation',
        'Recommended for larger installations with many safety functions or more than ' +
        '6 safety outputs. Tests are organised into 4 phases, covering all I/O ' +
        'systematically across the full system before moving to the next phase.',
        'comprehensive'
      ));
      grid.appendChild(this._methodCard(
        'Simplified Validation',
        'Recommended for smaller installations with fewer safety functions or 6 or ' +
        'fewer safety outputs. Tests are organised by input device, covering wiring, ' +
        'normal operation and fault conditions for each device in a single ' +
        'consolidated record.',
        'simplified'
      ));

      this._host.appendChild(grid);
    },

    _methodCard: function (title, desc, method) {
      var self = this;
      var card = SH.el('div', { class: 'card' });
      card.style.cursor = 'pointer';

      var h = SH.el('div', null);
      h.style.cssText = 'font-family:var(--display);font-size:17px;font-weight:600;margin-bottom:8px';
      h.appendChild(document.createTextNode(title));
      card.appendChild(h);

      var p = SH.el('p', { class: 'hint' }, desc);
      p.style.marginBottom = '16px';
      card.appendChild(p);

      var btn = SH.el('button', {
        class: 'btn',
        onClick: function (e) {
          e.stopPropagation();
          self._chooseMethod(method);
        }
      }, 'Use ' + title);
      card.appendChild(btn);

      card.addEventListener('click', function () { self._chooseMethod(method); });
      return card;
    },

    _chooseMethod: function (method) {
      SH.store.set('validation.method', method);
      /* _sync() will fire via project:changed */
    },

    /* ----------------------------------------------------------------
       Tab view
       ---------------------------------------------------------------- */
    _buildTabs: function (method) {
      var tabs = TABS[method] || [];
      this._host.innerHTML = '';
      this._hosts = {};
      var self = this;

      /* tabbar */
      var bar = SH.el('div', { class: 'tabbar' });
      tabs.forEach(function (t) {
        bar.appendChild(SH.el('button', {
          class: 'tab',
          'data-tab': t.id,
          onClick: function () { location.hash = '#/validation/' + t.id; }
        }, t.label));
      });

      /* Change Method button — right-aligned in the tabbar */
      var spacer = SH.el('span', { class: 'spacer' });
      spacer.style.cssText = 'flex:1';
      bar.appendChild(spacer);
      bar.appendChild(SH.el('button', {
        class: 'btn ghost sm',
        style: 'margin:4px 0',
        onClick: function () { self._confirmChangeMethod(); }
      }, 'Change method\u2026'));

      var sub = SH.el('div', { class: 'tabcontent' });
      this._host.appendChild(bar);
      this._host.appendChild(sub);
      this._bar = bar; this._sub = sub;

      /* Navigate to the first tab (or stay on current if valid). */
      var hash = location.hash.replace('#/validation/', '');
      var valid = tabs.filter(function (t) { return t.id === hash; }).length > 0;
      location.hash = '#/validation/' + (valid ? hash : tabs[0].id);
    },

    _confirmChangeMethod: function () {
      var self = this;
      var label = this._method === 'comprehensive' ? 'Comprehensive' : 'Simplified';

      var msg = SH.el('p', null,
        'Switching away from ' + label + ' Validation will permanently clear all ' +
        'existing validation data for this project. This cannot be undone.');

      var errEl = SH.el('div', { class: 'modal-err' }, '');

      SH.modal('Change Validation Method', msg, [
        { label: 'Cancel', ghost: true, onClick: function (c) { c(); } },
        { label: 'Clear data and change method', onClick: function (c) {
            /* Clear existing validation data and reset the method. */
            SH.store.set('validation.method', null);
            /* TODO: when validation data keys are defined, clear them here. */
            c();
          }
        }
      ]);
    }
  };

}()));
