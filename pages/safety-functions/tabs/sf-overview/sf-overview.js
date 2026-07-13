/* File:     pages/safety-functions/tabs/sf-overview/sf-overview.js
   Rev:      0.1.0
   Updated:  2026-07-13
   Requires: SH.store, SH.bus, SH.el
   Purpose:  Overview fields editor for a single safety function (sf manifest entry)
*/

// CHANGELOG: 0.1.0 — initial implementation; SF ID auto-increment, PLr direct/graph modes

SH.registerTab('safety-functions', 'sf-overview', (function () {

  // ── PLr risk graph lookup ─────────────────────────────────────────────────
  var PLR_GRAPH = {
    '1/1/1': 'a', '1/1/2': 'b',
    '1/2/1': 'b', '1/2/2': 'c',
    '2/1/1': 'b', '2/1/2': 'c',
    '2/2/1': 'c', '2/2/2': 'd'
  };

  function derivePlr(s, f, p) {
    return PLR_GRAPH[s + '/' + f + '/' + p] || '—';
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function getSf(id) {
    var sfs = SH.store.get('sfs', []);
    for (var i = 0; i < sfs.length; i++) {
      if (sfs[i].id === id) return { sf: sfs[i], index: i };
    }
    return null;
  }

  function updateSf(id, patch) {
    var sfs = SH.store.get('sfs', []);
    var sfsNew = [];
    for (var i = 0; i < sfs.length; i++) {
      if (sfs[i].id === id) {
        var merged = {};
        var keys = Object.keys(sfs[i]);
        for (var k = 0; k < keys.length; k++) merged[keys[k]] = sfs[i][keys[k]];
        var pkeys = Object.keys(patch);
        for (var p = 0; p < pkeys.length; p++) merged[pkeys[p]] = patch[pkeys[p]];
        sfsNew.push(merged);
      } else {
        sfsNew.push(sfs[i]);
      }
    }
    SH.store.set('sfs', sfsNew);
  }

  function updatePlrField(id, field, value) {
    var found = getSf(id);
    if (!found) return;
    var sf = found.sf;
    var plr = sf.plr || { mode: 'direct', value: 'd', s: 2, f: 2, p: 1 };
    var newPlr = {};
    var keys = Object.keys(plr);
    for (var i = 0; i < keys.length; i++) newPlr[keys[i]] = plr[keys[i]];
    newPlr[field] = value;
    // recalculate derived PLr if in graph mode
    if (newPlr.mode === 'graph') {
      newPlr.value = derivePlr(newPlr.s, newPlr.f, newPlr.p);
    }
    updateSf(id, { plr: newPlr });
  }

  function nextSfId() {
    var sfs = SH.store.get('sfs', []);
    var n = sfs.length + 1;
    return 'SF.' + (n < 10 ? '0' : '') + n;
  }

  function isNewSf(sf) {
    return sf.name === 'New Safety Function' && /^sf_/.test(sf.id);
  }

  // ── tab object ────────────────────────────────────────────────────────────
  var tab = {
    _host: null,
    _pending: false,
    _sfId: null,   // the sf manifest id currently shown
    _onProject: null,

    mount: function (host, ctx) {
      this._host = host;
      this._ctx = ctx;

      // inject scoped styles once
      var style = document.createElement('style');
      style.textContent = [
        '.sfo-wrap { padding: 20px; max-width: 720px; }',
        '.sfo-wrap h2.section { margin-bottom: 16px; }',
        '.sfo-plr-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }',
        '.sfo-plr-result { font-size: 1.5em; font-weight: 700; color: var(--amber); min-width: 2em; text-align: center; }',
        '.sfo-mode-toggle { display: flex; gap: 0; border-radius: 4px; overflow: hidden; border: 1px solid var(--line); }',
        '.sfo-mode-toggle button { padding: 4px 14px; background: var(--card); color: var(--ink); border: none; cursor: pointer; font: inherit; }',
        '.sfo-mode-toggle button.active { background: var(--amber); color: var(--black); }'
      ].join('\n');
      host.appendChild(style);

      this._onProject = function () {
        if (host.contains(document.activeElement)) {
          tab._pending = true;
          return;
        }
        tab._render();
      };
      SH.bus.on('project:changed', this._onProject);

      host.addEventListener('focusout', function () {
        if (tab._pending) { tab._pending = false; tab._render(); }
      });

      this._render();
    },

    onShow: function () {
      this._render();
    },

    unmount: function () {
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
    },

    _currentId: function () {
      // ctx.selected comes from the page controller
      var sel = this._ctx && this._ctx.selected;
      return (sel && sel.kind === 'sf') ? sel.id : null;
    },

    _render: function () {
      var host = this._host;
      if (!host) return;

      var id = this._currentId();
      if (!id) {
        host.innerHTML = '';
        host.appendChild(SH.el('p', { class: 'hint' }, 'No safety function selected.'));
        return;
      }

      if (!SH.store.hasProject()) {
        host.innerHTML = '';
        host.appendChild(SH.el('p', { class: 'hint' }, 'No project open.'));
        return;
      }

      var found = getSf(id);
      if (!found) {
        host.innerHTML = '';
        host.appendChild(SH.el('p', { class: 'hint' }, 'Safety function not found.'));
        return;
      }

      var sf = found.sf;

      // auto-assign SF.## id on first visit for a newly created SF
      if (isNewSf(sf)) {
        var newId = nextSfId();
        updateSf(sf.id, { id: newId });
        // after updating, re-fetch (the store write will fire project:changed,
        // but we can update ctx.selected via the page controller if available)
        // For now, re-read and continue with new id
        var found2 = getSf(newId);
        if (found2) {
          sf = found2.sf;
          id = newId;
          if (this._ctx && this._ctx.selected) this._ctx.selected.id = newId;
        }
      }

      this._sfId = id;
      this._buildForm(host, sf);
    },

    _buildForm: function (host, sf) {
      var id = sf.id;
      var plr = sf.plr || { mode: 'direct', value: 'd', s: 2, f: 2, p: 1 };

      // clear and rebuild
      host.innerHTML = '';
      var wrap = SH.el('div', { class: 'sfo-wrap' });

      wrap.appendChild(SH.el('h2', { class: 'section' }, 'Safety Function Overview'));

      // ── ID ──
      wrap.appendChild(this._field('ID', this._input(sf.id, function (v) {
        updateSf(id, { id: v });
        tab._sfId = v;
        if (tab._ctx && tab._ctx.selected) tab._ctx.selected.id = v;
      })));

      // ── Name ──
      wrap.appendChild(this._field('Name', this._input(sf.name, function (v) {
        updateSf(tab._sfId || id, { name: v });
      })));

      // ── Description ──
      wrap.appendChild(this._field('Description', this._textarea(sf.description || '', function (v) {
        updateSf(tab._sfId || id, { description: v });
      })));

      // ── Area / Machine ──
      wrap.appendChild(this._field('Area / Machine', this._input(sf.accessPoint || '', function (v) {
        updateSf(tab._sfId || id, { accessPoint: v });
      })));

      // ── Triggering Event ──
      wrap.appendChild(this._field('Triggering Event', this._input(sf.triggeringEvent || '', function (v) {
        updateSf(tab._sfId || id, { triggeringEvent: v });
      })));

      // ── PLr ──
      wrap.appendChild(this._fieldPlr(plr, id));

      // ── Status ──
      wrap.appendChild(this._fieldStatus(sf.status || 'draft', id));

      // ── Notes ──
      wrap.appendChild(this._field('Notes', this._textarea(sf.notes || '', function (v) {
        updateSf(tab._sfId || id, { notes: v });
      })));

      host.appendChild(wrap);
    },

    _field: function (label, control) {
      var f = SH.el('div', { class: 'field' });
      f.appendChild(SH.el('label', null, label));
      f.appendChild(control);
      return f;
    },

    _input: function (val, onChange) {
      var el = document.createElement('input');
      el.type = 'text';
      el.value = val || '';
      el.addEventListener('input', function () { onChange(el.value); });
      return el;
    },

    _textarea: function (val, onChange) {
      var el = document.createElement('textarea');
      el.rows = 3;
      el.value = val || '';
      el.addEventListener('input', function () { onChange(el.value); });
      return el;
    },

    _select: function (options, val, onChange) {
      var el = document.createElement('select');
      for (var i = 0; i < options.length; i++) {
        var opt = document.createElement('option');
        opt.value = options[i];
        opt.textContent = options[i];
        if (options[i] === val) opt.selected = true;
        el.appendChild(opt);
      }
      el.addEventListener('change', function () { onChange(el.value); });
      return el;
    },

    _fieldPlr: function (plr, sfId) {
      var f = SH.el('div', { class: 'field' });
      f.appendChild(SH.el('label', null, 'PLr'));

      // mode toggle
      var toggle = SH.el('div', { class: 'sfo-mode-toggle' });

      var btnDirect = SH.el('button', {
        class: plr.mode === 'direct' ? 'active' : '',
        onClick: function () {
          updatePlrField(sfId, 'mode', 'direct');
        }
      }, 'Direct');

      var btnGraph = SH.el('button', {
        class: plr.mode === 'graph' ? 'active' : '',
        onClick: function () {
          updatePlrField(sfId, 'mode', 'graph');
        }
      }, 'Risk Graph');

      toggle.appendChild(btnDirect);
      toggle.appendChild(btnGraph);
      f.appendChild(toggle);

      var row = SH.el('div', { class: 'sfo-plr-row' });

      if (plr.mode === 'direct') {
        row.appendChild(this._select(['a', 'b', 'c', 'd', 'e'], plr.value || 'd', function (v) {
          updatePlrField(sfId, 'value', v);
        }));
      } else {
        // S dropdown
        var sWrap = SH.el('span', null);
        sWrap.appendChild(SH.el('small', null, 'S '));
        sWrap.appendChild(this._select(['1', '2'], String(plr.s || 2), function (v) {
          updatePlrField(sfId, 's', Number(v));
        }));

        // F dropdown
        var fWrap = SH.el('span', null);
        fWrap.appendChild(SH.el('small', null, 'F '));
        fWrap.appendChild(this._select(['1', '2'], String(plr.f || 2), function (v) {
          updatePlrField(sfId, 'f', Number(v));
        }));

        // P dropdown
        var pWrap = SH.el('span', null);
        pWrap.appendChild(SH.el('small', null, 'P '));
        pWrap.appendChild(this._select(['1', '2'], String(plr.p || 1), function (v) {
          updatePlrField(sfId, 'p', Number(v));
        }));

        var result = derivePlr(plr.s || 2, plr.f || 2, plr.p || 1);
        var resultEl = SH.el('span', { class: 'sfo-plr-result' }, 'PL' + result);

        row.appendChild(sWrap);
        row.appendChild(fWrap);
        row.appendChild(pWrap);
        row.appendChild(resultEl);
      }

      f.appendChild(row);
      return f;
    },

    _fieldStatus: function (status, sfId) {
      var f = SH.el('div', { class: 'field' });
      f.appendChild(SH.el('label', null, 'Status'));
      f.appendChild(this._select(['draft', 'complete'], status, function (v) {
        updateSf(sfId, { status: v });
      }));
      return f;
    }
  };

  return tab;

}()));
