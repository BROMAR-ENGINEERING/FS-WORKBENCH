/* ==============================================================
   FS Workbench — Validation › Phase 2 — Normal Operation
   File:     pages/validation/tabs/phase-2/phase-2.js
   Rev:      0.4.1
   Updated:  2026-07-15
   Requires: core.js, store.js, css/app.css >= 0.15.4 (.tab-host.wide)
   --------------------------------------------------------------
   Safety matrix: input devices × (reset zones + output devices).
   Reads/writes project.validation.phase2.matrix only.
   ============================================================== */
SH.registerTab('validation', 'phase-2', (function () {

  var INPUT_TYPES = ['estop', 'interlock', 'reset', 'edm', 'other'];
  var STD_STATES  = ['OFF', 'ON', 'STOP', 'N/A'];

  var CSS = ''
    + '.p2 .p2-bar{display:flex;gap:6px;margin-bottom:14px}'
    + '.p2 .p2-bar .btn.on{background:var(--amber);color:var(--black)}'
    + '.p2 .p2-scroll{overflow:auto;max-height:64vh;width:100%;border:1px solid var(--line)}'
    + '.p2 table{border-collapse:collapse;font-size:12px;width:100%;table-layout:auto}'
    + '.p2 th,.p2 td{border:1px solid var(--line);padding:3px 6px;text-align:left}'
    + '.p2 thead th{position:sticky;background:var(--card);z-index:2}'
    + '.p2 thead tr.p2-grp th{top:0;z-index:3}'
    + '.p2 thead tr.p2-cols th{top:0}'
    + '.p2 th.p2-grp-h{text-align:center;background:var(--black-3)}'
    + '.p2 th.p2-col{white-space:nowrap;cursor:grab}'
    + '.p2 th.p2-col .p2-col-in{display:flex;gap:6px;align-items:center;justify-content:space-between}'
    + '.p2 th.p2-fix{white-space:nowrap}'
    + '.p2 td.p2-num{text-align:right;color:var(--muted);white-space:nowrap}'
    + '.p2 td.p2-num .p2-grip{display:inline-block;cursor:grab;color:var(--muted);'
    + 'margin-right:6px;font-size:13px;line-height:1;touch-action:none;'
    + '-webkit-user-select:none;user-select:none}'
    + '.p2 td.p2-num .p2-grip:hover{color:var(--amber)}'
    + '.p2 tr.p2-dragrow{background:var(--black-3);outline:2px solid var(--amber);'
    + 'outline-offset:-2px}'
    + '.p2 tr.p2-dragrow .p2-grip{cursor:grabbing}'
    + '.p2 td.p2-dev{white-space:normal;min-width:170px}'
    + '.p2 td.p2-dev .p2-dev-in{display:flex;gap:6px;align-items:flex-start;justify-content:space-between}'
    + '.p2 td.p2-dev small{display:block;color:var(--muted)}'
    + '.p2 input.p2-in{width:100%;min-width:60px;border:0;background:transparent;'
    + 'color:var(--ink);font:inherit;padding:2px}'
    + '.p2 input.p2-in:focus{outline:1px solid var(--amber);background:var(--black-2)}'
    + '.p2 td.p2-cell{padding:0}'
    + '.p2 button.p2-st{width:100%;min-width:54px;border:0;background:transparent;'
    + 'font:inherit;font-size:11px;padding:5px 4px;cursor:pointer;color:var(--black)}'
    + '.p2 button.p2-st.s-blank{background:#fff}'
    + '.p2 button.p2-st.s-off{background:var(--fail-soft)}'
    + '.p2 button.p2-st.s-on{background:var(--pass-soft)}'
    + '.p2 button.p2-st.s-stop{background:var(--warn-soft)}'
    + '.p2 button.p2-st.s-na{background:var(--paper)}'
    + '.p2 button.p2-st.s-custom{background:var(--card);color:var(--ink)}'
    + '.p2 .p2-tools{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center}'
    + '.p2 .p2-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}'
    + '.p2 .p2-row input,.p2 .p2-row select{flex:1}'
    + '.p2 .p2-tags{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}'
    + '.p2 .p2-tag{display:inline-flex;gap:6px;align-items:center;background:var(--black-3);'
    + 'border:1px solid var(--line);border-radius:12px;padding:2px 10px;font-size:12px}'
    + '.p2 .p2-tag button{border:0;background:transparent;color:var(--muted);cursor:pointer;font:inherit}'
    + '.p2 .p2-tag.fixed{opacity:.6}'
    + '.p2 .p2-x{border:0;background:transparent;color:var(--muted);cursor:pointer;'
    + 'font:inherit;line-height:1;padding:0 2px}'
    + '.p2 .p2-x:hover{color:var(--fail)}'
    + '.p2 .p2-dragging{opacity:.4}'
    + '.p2 th.p2-over{outline:2px solid var(--amber);outline-offset:-2px}'
    + '.p2 .p2-hid{display:flex;gap:8px;align-items:center;margin-bottom:6px}'
    + '.p2 .p2-hid span{flex:1}';

  /* ---------- helpers ---------- */

  function uid(p) { return p + Math.random().toString(36).slice(2, 8); }
  function arr(v) { return v instanceof Array ? v : []; }

  function blankMatrix() {
    return { resetZones: [], outputGroups: [], customStates: [], rows: [],
             rowOrder: [], colOrder: [], hidden: [], prefs: { showPageRef: true } };
  }

  /* store.js >= 0.15.3 back-fills these; defaults kept so the tab also
     works against an older store. */
  function readMatrix() {
    var m = SH.store.get('validation.phase2.matrix', null);
    if (!m || typeof m !== 'object') return blankMatrix();
    var p = (m.prefs && typeof m.prefs === 'object') ? m.prefs : {};
    return {
      resetZones:   arr(m.resetZones),
      outputGroups: arr(m.outputGroups),
      customStates: arr(m.customStates),
      rows:         arr(m.rows),
      rowOrder:     arr(m.rowOrder),
      colOrder:     arr(m.colOrder),
      hidden:       arr(m.hidden),
      prefs:        { showPageRef: p.showPageRef !== false }
    };
  }

  function devices() { return SH.store.get('devices', []) || []; }

  function byType(types) {
    var all = devices(), out = [], i;
    for (i = 0; i < all.length; i++) {
      if (types.indexOf(all[i].type) !== -1) out.push(all[i]);
    }
    return out;
  }

  function inputDevices()  { return byType(INPUT_TYPES); }
  function outputDevices() { return byType(['output']); }
  function resetDevices()  { return byType(['reset']); }

  function deviceById(id) {
    var all = devices(), i;
    for (i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function devLabel(d) {
    if (!d) return '(unknown device)';
    return d.tag || d.description || d.id;
  }

  function stateClass(v) {
    if (!v) return 's-blank';
    if (v === 'OFF')  return 's-off';
    if (v === 'ON')   return 's-on';
    if (v === 'STOP') return 's-stop';
    if (v === 'N/A')  return 's-na';
    return 's-custom';
  }

  function cycle(v, custom) {
    var seq = [''].concat(STD_STATES).concat(custom);
    var i = seq.indexOf(v || '');
    if (i === -1) i = 0;
    return seq[(i + 1) % seq.length];
  }

  /* stored order first (only keys that still exist), then anything new, appended */
  function applyOrder(keys, order) {
    var out = [], seen = {}, i;
    for (i = 0; i < order.length; i++) {
      if (keys.indexOf(order[i]) !== -1 && !seen[order[i]]) {
        out.push(order[i]); seen[order[i]] = true;
      }
    }
    for (i = 0; i < keys.length; i++) {
      if (!seen[keys[i]]) { out.push(keys[i]); seen[keys[i]] = true; }
    }
    return out;
  }

  /* move `from` to sit where `to` currently is */
  function moveKey(list, from, to) {
    var a = list.slice(), i = a.indexOf(from), j = a.indexOf(to);
    if (i === -1 || j === -1 || i === j) return a;
    a.splice(i, 1);
    j = a.indexOf(to);
    a.splice(i < j ? j + 1 : j, 0, from);
    return a;
  }

  /* ---------- the tab ---------- */

  return {
    _host: null, _root: null, _pid: null,
    _section: 'matrix',
    _writing: false, _pending: false,
    _dragCol: null,
    _scroll: null,
    _rowDragEnd: null,
    _onProject: null, _onFocusOut: null,

    mount: function (host) {
      var self = this;
      this._host = host;
      this._pid  = SH.store.projectId();

      host.appendChild(SH.el('style', { html: CSS }));
      this._root = SH.el('div', { class: 'p2' });
      host.appendChild(this._root);
      host.classList.add('wide');   /* core .tab-host.wide — 0.15.4 */

      this._onProject = function () {
        var pid = SH.store.projectId();
        if (pid !== self._pid) { self._pid = pid; self._section = 'matrix'; self._render(); return; }
        if (self._writing) return;
        if (self._rowDragEnd) return;
        if (self._host.contains(document.activeElement)) { self._pending = true; return; }
        self._render();
      };
      SH.bus.on('project:changed', this._onProject);

      this._onFocusOut = function () {
        if (!self._pending) return;
        self._pending = false;
        setTimeout(function () {
          if (!self._host) return;
          if (self._host.contains(document.activeElement)) return;
          self._render();
        }, 0);
      };
      host.addEventListener('focusout', this._onFocusOut);

      this._render();
    },

    onShow: function () {
      if (this._host && this._host.contains(document.activeElement)) return;
      this._render();
    },

    unmount: function () {
      if (this._rowDragEnd) this._rowDragEnd();
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
      if (this._onFocusOut && this._host) {
        this._host.removeEventListener('focusout', this._onFocusOut);
      }
      this._host = this._root = this._scroll = null;
    },

    _save: function (m) {
      var self = this;
      this._writing = true;
      SH.store.set('validation.phase2.matrix', m);
      setTimeout(function () { self._writing = false; }, 0);
    },

    _rowFor: function (m, key, isDevice) {
      var i;
      for (i = 0; i < m.rows.length; i++) {
        if (isDevice ? m.rows[i].deviceId === key : m.rows[i].id === key) return m.rows[i];
      }
      var r = { id: uid('r_'), deviceId: isDevice ? key : null, name: '',
                pageRef: '', info: '', delay: 'N/A', cells: {} };
      m.rows.push(r);
      return r;
    },

    _without: function (list, v) {
      var out = [], i;
      for (i = 0; i < list.length; i++) if (list[i] !== v) out.push(list[i]);
      return out;
    },

    _render: function () {
      var root = this._root;
      if (!root) return;
      root.innerHTML = '';
      this._scroll = null;

      if (!SH.store.hasProject()) {
        root.appendChild(SH.el('div', { class: 'warnnote' }, 'No project is open.'));
        return;
      }

      var self = this;
      var bar = SH.el('div', { class: 'p2-bar' });
      var tabs = [['matrix', 'Matrix'], ['zones', 'Reset Zones'], ['settings', 'Settings']];
      var i;
      for (i = 0; i < tabs.length; i++) {
        (function (id, label) {
          bar.appendChild(SH.el('button', {
            class: 'btn sm' + (self._section === id ? ' on' : ' ghost'),
            onClick: function () { self._section = id; self._render(); }
          }, label));
        }(tabs[i][0], tabs[i][1]));
      }
      root.appendChild(bar);

      if (this._section === 'matrix')   this._renderMatrix(root);
      if (this._section === 'zones')    this._renderZones(root);
      if (this._section === 'settings') this._renderSettings(root);
    },

    /* ---------- column plan ---------- */

    _colPlan: function (m) {
      var groups = [], i, j, d, ids;
      var hidden = m.hidden;

      var rz = [];
      for (i = 0; i < m.resetZones.length; i++) {
        var z = m.resetZones[i];
        if (hidden.indexOf('rz:' + z.id) !== -1) continue;
        rz.push({ key: 'rz:' + z.id, label: z.label || 'Reset zone',
                  kind: 'rz', zoneId: z.id, groupId: '__rz__' });
      }
      if (rz.length) groups.push({ id: '__rz__', label: 'Reset', cols: rz, band: false });

      var outs = outputDevices();
      var used = {};

      if (m.outputGroups.length) {
        for (i = 0; i < m.outputGroups.length; i++) {
          var g = m.outputGroups[i], gcols = [];
          ids = arr(g.deviceIds);
          for (j = 0; j < ids.length; j++) {
            d = deviceById(ids[j]);
            if (!d || d.type !== 'output') continue;
            used[d.id] = true;
            if (hidden.indexOf('out:' + d.id) !== -1) continue;
            gcols.push({ key: 'out:' + d.id, label: devLabel(d),
                         kind: 'out', deviceId: d.id, groupId: g.id });
          }
          if (gcols.length) groups.push({ id: g.id, label: g.label || 'Group', cols: gcols, band: true });
        }
        var loose = [];
        for (i = 0; i < outs.length; i++) {
          if (used[outs[i].id]) continue;
          if (hidden.indexOf('out:' + outs[i].id) !== -1) continue;
          loose.push({ key: 'out:' + outs[i].id, label: devLabel(outs[i]),
                       kind: 'out', deviceId: outs[i].id, groupId: '__loose__' });
        }
        if (loose.length) groups.push({ id: '__loose__', label: 'Ungrouped', cols: loose, band: true });
      } else {
        var keys = [], byKey = {};
        for (i = 0; i < outs.length; i++) {
          if (hidden.indexOf('out:' + outs[i].id) !== -1) continue;
          keys.push('out:' + outs[i].id);
          byKey['out:' + outs[i].id] = outs[i];
        }
        var ordered = applyOrder(keys, m.colOrder), flat = [];
        for (i = 0; i < ordered.length; i++) {
          d = byKey[ordered[i]];
          flat.push({ key: ordered[i], label: devLabel(d),
                      kind: 'out', deviceId: d.id, groupId: '__flat__' });
        }
        if (flat.length) groups.push({ id: '__flat__', label: '', cols: flat, band: false });
      }

      var all = [];
      for (i = 0; i < groups.length; i++) all = all.concat(groups[i].cols);
      return { groups: groups, cols: all, hasBand: m.outputGroups.length > 0 };
    },

    /* ---------- section 1: matrix ---------- */

    _renderMatrix: function (root) {
      var self = this;
      var m = readMatrix();

      if (!devices().length) {
        root.appendChild(SH.el('div', { class: 'hint' },
          'No devices found. Add devices in Safety Functions \u2192 Devices.'));
        return;
      }

      var tools = SH.el('div', { class: 'p2-tools' });
      tools.appendChild(SH.el('button', {
        class: 'btn sm', onClick: function () { self._autoFill(); }
      }, 'Auto-fill from Safety Functions'));
      tools.appendChild(SH.el('button', {
        class: 'btn sm ghost', onClick: function () {
          var mm = readMatrix();
          var r = { id: uid('r_'), deviceId: null, name: '',
                    pageRef: '', info: '', delay: 'N/A', cells: {} };
          mm.rows.push(r);
          mm.rowOrder = mm.rowOrder.concat([r.id]);
          self._save(mm); self._render();
        }
      }, '+ Add Row'));
      tools.appendChild(SH.el('span', { class: 'hint' },
        'Drag the \u283f grip to reorder rows; drag a column header to reorder columns.'));
      root.appendChild(tools);

      var plan = this._colPlan(m);

      var ins = inputDevices(), keys = [], meta = {}, i;
      for (i = 0; i < ins.length; i++) {
        if (m.hidden.indexOf(ins[i].id) !== -1) continue;
        keys.push(ins[i].id);
        meta[ins[i].id] = { device: ins[i], stored: null, key: ins[i].id, isDev: true };
      }
      for (i = 0; i < m.rows.length; i++) {
        if (m.rows[i].deviceId) continue;
        keys.push(m.rows[i].id);
        meta[m.rows[i].id] = { device: null, stored: m.rows[i], key: m.rows[i].id, isDev: false };
      }
      for (i = 0; i < m.rows.length; i++) {
        var did = m.rows[i].deviceId;
        if (did && meta[did]) meta[did].stored = m.rows[i];
      }
      var order = applyOrder(keys, m.rowOrder);

      var table = SH.el('table');
      var thead = SH.el('thead');
      var fixedLabels = ['#', 'Device'];
      if (m.prefs.showPageRef) fixedLabels.push('Page ref');
      fixedLabels.push('Additional info');
      fixedLabels.push('Delay time');

      var bandRow = null;
      if (plan.hasBand) {
        bandRow = SH.el('tr', { class: 'p2-grp' });
        var lead = fixedLabels.length, g0;
        for (g0 = 0; g0 < plan.groups.length; g0++) {
          if (plan.groups[g0].id === '__rz__') lead += plan.groups[g0].cols.length;
        }
        bandRow.appendChild(SH.el('th', { colspan: String(lead) }, ''));
        for (g0 = 0; g0 < plan.groups.length; g0++) {
          if (plan.groups[g0].id === '__rz__') continue;
          bandRow.appendChild(SH.el('th', {
            class: 'p2-grp-h', colspan: String(plan.groups[g0].cols.length)
          }, plan.groups[g0].label));
        }
        thead.appendChild(bandRow);
      }

      var hr = SH.el('tr', { class: 'p2-cols' });
      for (i = 0; i < fixedLabels.length; i++) {
        hr.appendChild(SH.el('th', { class: 'p2-fix' }, fixedLabels[i]));
      }
      for (i = 0; i < plan.cols.length; i++) {
        hr.appendChild(this._colHeader(plan.cols[i]));
      }
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = SH.el('tbody');
      for (i = 0; i < order.length; i++) {
        tbody.appendChild(this._matrixRow(meta[order[i]], i, plan.cols, m));
      }
      table.appendChild(tbody);

      var scroll = SH.el('div', { class: 'p2-scroll' });
      scroll.appendChild(table);
      root.appendChild(scroll);
      this._scroll = scroll;

      if (bandRow) {
        setTimeout(function () {
          var h = bandRow.offsetHeight || 26;
          var ths = hr.querySelectorAll('th'), k;
          for (k = 0; k < ths.length; k++) ths[k].style.top = h + 'px';
        }, 0);
      }

      if (!plan.cols.length) {
        root.appendChild(SH.el('div', { class: 'hint' },
          'No output devices or reset zones yet \u2014 add outputs in the Device Register, '
          + 'or reset zones in the Reset Zones section.'));
      }
    },

    _colHeader: function (col) {
      var self = this;
      var th = SH.el('th', { class: 'p2-col', draggable: 'true' });
      var inner = SH.el('div', { class: 'p2-col-in' });
      inner.appendChild(SH.el('span', null, col.label));
      inner.appendChild(SH.el('button', {
        class: 'p2-x', title: 'Remove this column from the matrix',
        onClick: function (e) { e.stopPropagation(); self._removeCol(col); }
      }, '\u00d7'));
      th.appendChild(inner);

      th.addEventListener('dragstart', function (e) {
        self._dragCol = col;
        th.classList.add('p2-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', col.key);
        }
      });
      th.addEventListener('dragend', function () {
        self._dragCol = null; th.classList.remove('p2-dragging');
      });
      th.addEventListener('dragover', function (e) {
        if (!self._dragCol || self._dragCol.kind !== col.kind) return;
        e.preventDefault();
        th.classList.add('p2-over');
      });
      th.addEventListener('dragleave', function () { th.classList.remove('p2-over'); });
      th.addEventListener('drop', function (e) {
        e.preventDefault();
        th.classList.remove('p2-over');
        if (!self._dragCol || self._dragCol.key === col.key) return;
        if (self._dragCol.kind !== col.kind) return;
        self._dropCol(self._dragCol, col);
      });
      return th;
    },

    _dropCol: function (from, to) {
      var m = readMatrix(), i;

      if (from.kind === 'rz') {
        var ids = [], byId = {};
        for (i = 0; i < m.resetZones.length; i++) {
          ids.push(m.resetZones[i].id); byId[m.resetZones[i].id] = m.resetZones[i];
        }
        var nz = moveKey(ids, from.zoneId, to.zoneId), zones = [];
        for (i = 0; i < nz.length; i++) zones.push(byId[nz[i]]);
        m.resetZones = zones;
        this._save(m); this._render();
        return;
      }

      if (from.groupId === '__flat__') {
        var outs = outputDevices(), keys = [];
        for (i = 0; i < outs.length; i++) keys.push('out:' + outs[i].id);
        m.colOrder = moveKey(applyOrder(keys, m.colOrder), from.key, to.key);
        this._save(m); this._render();
        return;
      }

      var srcG = this._group(m, from.groupId), dstG = this._group(m, to.groupId);
      if (srcG) srcG.deviceIds = this._without(arr(srcG.deviceIds), from.deviceId);
      if (dstG) {
        var d2 = arr(dstG.deviceIds).slice();
        if (d2.indexOf(from.deviceId) === -1) {
          var at = d2.indexOf(to.deviceId);
          d2.splice(at === -1 ? d2.length : at + 1, 0, from.deviceId);
        } else {
          d2 = moveKey(d2, from.deviceId, to.deviceId);
        }
        dstG.deviceIds = d2;
      }
      this._save(m); this._render();
    },

    _group: function (m, id) {
      var i;
      for (i = 0; i < m.outputGroups.length; i++) {
        if (m.outputGroups[i].id === id) return m.outputGroups[i];
      }
      return null;
    },

    _removeCol: function (col) {
      var self = this;
      var what = col.kind === 'rz' ? 'reset zone column' : 'output column';
      SH.modal('Remove ' + what,
        SH.el('div', null,
          SH.el('p', null, 'Remove "' + col.label + '" from this matrix?'),
          SH.el('p', { class: 'hint' },
            col.kind === 'rz'
              ? 'The reset zone stays defined \u2014 only its column is hidden. '
                + 'Restore it in Settings \u2192 Hidden from matrix.'
              : 'The device stays in the Device Register and in its safety functions. '
                + 'Only its matrix column is hidden. Restore it in Settings \u2192 Hidden from matrix.')),
        [
          { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
          { label: 'Remove', onClick: function (close) {
              var m = readMatrix();
              if (m.hidden.indexOf(col.key) === -1) m.hidden = m.hidden.concat([col.key]);
              self._save(m); close(); self._render();
            } }
        ]);
    },

    /* ---------- rows ---------- */

    _matrixRow: function (item, index, cols, m) {
      var self = this;
      var dev = item.device, stored = item.stored, key = item.key, isDev = item.isDev;
      var tr = SH.el('tr', { 'data-key': key });

      var num = SH.el('td', { class: 'p2-num' });
      var grip = SH.el('span', { class: 'p2-grip', title: 'Drag to reorder' }, '\u283f');
      grip.addEventListener('pointerdown', function (e) { self._beginRowDrag(e, tr); });
      num.appendChild(grip);
      num.appendChild(SH.el('span', { class: 'p2-n' }, String(index + 1)));
      tr.appendChild(num);

      var nameCell = SH.el('td', { class: 'p2-dev' });
      var nin = SH.el('div', { class: 'p2-dev-in' });
      if (dev) {
        var block = SH.el('div');
        block.appendChild(SH.el('strong', null, dev.tag || '(no tag)'));
        if (dev.description) block.appendChild(SH.el('small', null, dev.description));
        nin.appendChild(block);
        nin.appendChild(SH.el('button', {
          class: 'p2-x', title: 'Remove this row from the matrix',
          onClick: function () { self._removeRow(dev); }
        }, '\u00d7'));
      } else {
        nin.appendChild(this._text(stored ? stored.name : '', 'Manual entry',
          function (v) {
            var mm = readMatrix();
            self._rowFor(mm, key, false).name = v;
            self._save(mm);
          }));
        nin.appendChild(SH.el('button', {
          class: 'p2-x', title: 'Delete this row',
          onClick: function () { self._deleteRow(key); }
        }, '\u00d7'));
      }
      nameCell.appendChild(nin);
      tr.appendChild(nameCell);

      var fields = [];
      if (m.prefs.showPageRef) fields.push('pageRef');
      fields.push('info');
      fields.push('delay');

      var i;
      for (i = 0; i < fields.length; i++) {
        (function (f) {
          var dflt = f === 'delay' ? 'N/A' : '';
          var val = stored ? (stored[f] || dflt) : dflt;
          var td = SH.el('td');
          td.appendChild(self._text(val, '', function (v) {
            var mm = readMatrix();
            self._rowFor(mm, key, isDev)[f] = v;
            self._save(mm);
          }));
          tr.appendChild(td);
        }(fields[i]));
      }

      for (i = 0; i < cols.length; i++) {
        (function (col) {
          var val = stored && stored.cells ? (stored.cells[col.key] || '') : '';
          var td = SH.el('td', { class: 'p2-cell' });
          var btn = SH.el('button', {
            class: 'p2-st ' + stateClass(val),
            onClick: function () {
              var mm = readMatrix();
              var row = self._rowFor(mm, key, isDev);
              if (!row.cells) row.cells = {};
              var next = cycle(row.cells[col.key] || '', mm.customStates);
              if (next) row.cells[col.key] = next; else delete row.cells[col.key];
              self._save(mm);
              btn.className = 'p2-st ' + stateClass(next);
              btn.textContent = next || '\u00a0';
            }
          }, val || '\u00a0');
          td.appendChild(btn);
          tr.appendChild(td);
        }(cols[i]));
      }
      return tr;
    },

    /* pointer-drag: the row physically moves as you drag; committed on release */
    _beginRowDrag: function (e, tr) {
      if (e.button !== undefined && e.button !== 0) return;
      if (this._rowDragEnd) return;
      var tbody = tr.parentNode;
      if (!tbody) return;
      e.preventDefault();

      var self = this;
      tr.classList.add('p2-dragrow');
      document.body.style.cursor = 'grabbing';

      function rowAt(x, y) {
        var el = document.elementFromPoint(x, y);
        while (el && el !== document.body) {
          if (el.tagName === 'TR' && el.parentNode === tbody) return el;
          el = el.parentElement;
        }
        return null;
      }

      function onMove(ev) {
        var sc = self._scroll, b;
        if (sc) {
          b = sc.getBoundingClientRect();
          if (ev.clientY < b.top + 34)         sc.scrollTop -= 14;
          else if (ev.clientY > b.bottom - 34) sc.scrollTop += 14;
        }
        var t = rowAt(ev.clientX, ev.clientY);
        if (!t || t === tr) return;
        var r = t.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) tbody.insertBefore(tr, t);
        else                                   tbody.insertBefore(tr, t.nextSibling);
        self._renumber(tbody);
      }

      function end() {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', end, true);
        document.removeEventListener('pointercancel', end, true);
        document.body.style.cursor = '';
        tr.classList.remove('p2-dragrow');
        self._rowDragEnd = null;
        self._commitRowOrder(tbody);
      }

      this._rowDragEnd = end;
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', end, true);
      document.addEventListener('pointercancel', end, true);
    },

    _renumber: function (tbody) {
      var i, n;
      for (i = 0; i < tbody.children.length; i++) {
        n = tbody.children[i].querySelector('.p2-n');
        if (n) n.textContent = String(i + 1);
      }
    },

    _commitRowOrder: function (tbody) {
      var m = readMatrix(), order = [], i, k;
      for (i = 0; i < tbody.children.length; i++) {
        k = tbody.children[i].getAttribute('data-key');
        if (k) order.push(k);
      }
      m.rowOrder = order;
      this._save(m);
    },

    _removeRow: function (dev) {
      var self = this;
      SH.modal('Remove row from matrix',
        SH.el('div', null,
          SH.el('p', null, 'Remove "' + devLabel(dev) + '" from this matrix?'),
          SH.el('p', { class: 'hint' },
            'The device stays in the Device Register and in its safety functions \u2014 only its '
            + 'matrix row is hidden. Restore it in Settings \u2192 Hidden from matrix. '
            + 'To delete the device itself, use Safety Functions \u2192 Devices.')),
        [
          { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
          { label: 'Remove', onClick: function (close) {
              var m = readMatrix();
              if (m.hidden.indexOf(dev.id) === -1) m.hidden = m.hidden.concat([dev.id]);
              self._save(m); close(); self._render();
            } }
        ]);
    },

    _deleteRow: function (rowId) {
      var self = this;
      SH.modal('Delete row',
        SH.el('p', null, 'Remove this manual row and its matrix values? This cannot be undone.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Delete', onClick: function (close) {
            var m = readMatrix(), keep = [], i;
            for (i = 0; i < m.rows.length; i++) if (m.rows[i].id !== rowId) keep.push(m.rows[i]);
            m.rows = keep;
            m.rowOrder = self._without(m.rowOrder, rowId);
            self._save(m); close(); self._render();
          } }
      ]);
    },

    _text: function (value, placeholder, onChange) {
      var el = SH.el('input', { class: 'p2-in', type: 'text', placeholder: placeholder || '' });
      el.value = value || '';
      el.addEventListener('input', function () { onChange(el.value); });
      return el;
    },

    /* ---------- auto-fill ---------- */

    _autoFill: function () {
      var self = this;
      SH.modal('Auto-fill from Safety Functions',
        SH.el('p', null, 'Fill blank cells only. Values you have already set are never overwritten.'),
        [
          { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
          { label: 'Auto-fill', onClick: function (close) { close(); self._doAutoFill(); } }
        ]);
    },

    _doAutoFill: function () {
      var m = readMatrix();
      var sfs = SH.store.get('sfs', []) || [];
      var outs = outputDevices();
      var ins = inputDevices();
      var i, j, k, d, row;

      function outputsForDevice(id) {
        var res = [], s, all, o;
        for (s = 0; s < sfs.length; s++) {
          all = [].concat(sfs[s].inputs || [], sfs[s].logic || [], sfs[s].outputs || []);
          if (all.indexOf(id) === -1) continue;
          o = sfs[s].outputs || [];
          for (k = 0; k < o.length; k++) if (res.indexOf(o[k]) === -1) res.push(o[k]);
        }
        return res;
      }

      function fill(r, ids, state) {
        if (!r.cells) r.cells = {};
        for (var x = 0; x < ids.length; x++) {
          var ck = 'out:' + ids[x];
          if (!r.cells[ck]) r.cells[ck] = state;
        }
      }

      for (i = 0; i < ins.length; i++) {
        d = ins[i];
        if (m.hidden.indexOf(d.id) !== -1) continue;
        var desc = (d.description || '').toLowerCase();
        var isPull = d.type === 'other' && desc.indexOf('pull') !== -1;

        if (d.type === 'estop' || isPull) {
          row = this._rowFor(m, d.id, true);
          var allOut = [];
          for (j = 0; j < outs.length; j++) allOut.push(outs[j].id);
          fill(row, allOut, 'OFF');
        } else if (d.type === 'reset') {
          row = this._rowFor(m, d.id, true);
          fill(row, outputsForDevice(d.id), 'ON');
        } else if (d.type === 'edm') {
          row = this._rowFor(m, d.id, true);
          fill(row, outputsForDevice(d.id), 'OFF');
        }
      }
      this._save(m);
      this._render();
    },

    /* ---------- section 2: reset zones ---------- */

    _renderZones: function (root) {
      var self = this;
      var m = readMatrix();
      var resets = resetDevices();

      var card = SH.el('div', { class: 'card' });
      card.appendChild(SH.el('h2', { class: 'section' }, 'Reset Zones'));
      card.appendChild(SH.el('p', { class: 'hint' },
        'Reset zones appear as columns in the matrix. Link to a reset device or define manually. '
        + 'Drag the column headers in the matrix to reorder them.'));

      var i;
      for (i = 0; i < m.resetZones.length; i++) {
        (function (z) {
          var row = SH.el('div', { class: 'p2-row' });

          var label = SH.el('input', { type: 'text', placeholder: 'Label' });
          label.value = z.label || '';
          label.addEventListener('input', function () {
            var mm = readMatrix(), k;
            for (k = 0; k < mm.resetZones.length; k++) {
              if (mm.resetZones[k].id === z.id) mm.resetZones[k].label = label.value;
            }
            self._save(mm);
          });
          row.appendChild(label);

          var sel = SH.el('select');
          sel.appendChild(SH.el('option', { value: '' }, '\u2014 no linked device \u2014'));
          var j;
          for (j = 0; j < resets.length; j++) {
            sel.appendChild(SH.el('option', { value: resets[j].id },
              (resets[j].tag || '(no tag)') + ' \u2014 ' + (resets[j].description || '')));
          }
          sel.value = z.deviceId || '';
          sel.addEventListener('change', function () {
            var mm = readMatrix(), k;
            for (k = 0; k < mm.resetZones.length; k++) {
              if (mm.resetZones[k].id === z.id) mm.resetZones[k].deviceId = sel.value || null;
            }
            self._save(mm);
          });
          row.appendChild(sel);

          row.appendChild(SH.el('button', {
            class: 'btn sm danger',
            onClick: function () { self._deleteZone(z); }
          }, 'Delete'));

          card.appendChild(row);
        }(m.resetZones[i]));
      }

      if (!m.resetZones.length) {
        card.appendChild(SH.el('p', { class: 'hint' }, 'No reset zones defined.'));
      }

      card.appendChild(SH.el('button', {
        class: 'btn sm', onClick: function () {
          var mm = readMatrix();
          mm.resetZones.push({ id: uid('rz_'), label: '', deviceId: null });
          self._save(mm); self._render();
        }
      }, '+ Add Reset Zone'));

      root.appendChild(card);
    },

    _deleteZone: function (z) {
      var self = this;
      SH.modal('Delete reset zone',
        SH.el('p', null, 'This removes its column and every value recorded in it. This cannot be undone.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Delete', onClick: function (close) {
            var m = readMatrix(), keep = [], i, r;
            for (i = 0; i < m.resetZones.length; i++) {
              if (m.resetZones[i].id !== z.id) keep.push(m.resetZones[i]);
            }
            m.resetZones = keep;
            m.hidden   = self._without(m.hidden, 'rz:' + z.id);
            m.colOrder = self._without(m.colOrder, 'rz:' + z.id);
            for (i = 0; i < m.rows.length; i++) {
              r = m.rows[i];
              if (r.cells) delete r.cells['rz:' + z.id];
            }
            self._save(m); close(); self._render();
          } }
      ]);
    },

    /* ---------- section 3: settings ---------- */

    _renderSettings: function (root) {
      var self = this;
      var m = readMatrix();
      var outs = outputDevices();
      var i;

      var cc = SH.el('div', { class: 'card' });
      cc.appendChild(SH.el('h2', { class: 'section' }, 'Matrix Columns'));
      var chk = SH.el('label', { class: 'chk' });
      var box = SH.el('input', { type: 'checkbox' });
      box.checked = m.prefs.showPageRef;
      box.addEventListener('change', function () {
        var mm = readMatrix();
        mm.prefs.showPageRef = box.checked;
        self._save(mm);
      });
      chk.appendChild(box);
      chk.appendChild(SH.el('span', null, 'Show the Page ref column'));
      cc.appendChild(chk);
      root.appendChild(cc);

      var gc = SH.el('div', { class: 'card' });
      gc.appendChild(SH.el('h2', { class: 'section' }, 'Split Matrix Table'));
      gc.appendChild(SH.el('p', { class: 'hint' },
        'Split the output columns into labelled sections. '
        + 'If nothing is defined here, all outputs appear in one table.'));

      for (i = 0; i < m.outputGroups.length; i++) {
        (function (g) {
          var row = SH.el('div', { class: 'p2-row' });

          var label = SH.el('input', { type: 'text', placeholder: 'Section label' });
          label.value = g.label || '';
          label.addEventListener('input', function () {
            var mm = readMatrix(), k;
            for (k = 0; k < mm.outputGroups.length; k++) {
              if (mm.outputGroups[k].id === g.id) mm.outputGroups[k].label = label.value;
            }
            self._save(mm);
          });
          row.appendChild(label);

          var sel = SH.el('select', { multiple: 'multiple', size: '4' });
          var ids = arr(g.deviceIds), j, opt;
          for (j = 0; j < outs.length; j++) {
            opt = SH.el('option', { value: outs[j].id },
              (outs[j].tag || '(no tag)') + ' \u2014 ' + (outs[j].description || ''));
            if (ids.indexOf(outs[j].id) !== -1) opt.selected = true;
            sel.appendChild(opt);
          }
          sel.addEventListener('change', function () {
            var picked = [], k;
            for (k = 0; k < sel.options.length; k++) {
              if (sel.options[k].selected) picked.push(sel.options[k].value);
            }
            var mm = readMatrix();
            for (k = 0; k < mm.outputGroups.length; k++) {
              if (mm.outputGroups[k].id === g.id) mm.outputGroups[k].deviceIds = picked;
            }
            self._save(mm);
          });
          row.appendChild(sel);

          row.appendChild(SH.el('button', {
            class: 'btn sm danger',
            onClick: function () { self._deleteGroup(g); }
          }, 'Delete'));

          gc.appendChild(row);
        }(m.outputGroups[i]));
      }

      if (!outs.length) {
        gc.appendChild(SH.el('p', { class: 'hint' },
          'No output devices in the Device Register yet.'));
      }

      gc.appendChild(SH.el('button', {
        class: 'btn sm', onClick: function () {
          var mm = readMatrix();
          mm.outputGroups.push({ id: uid('og_'), label: '', deviceIds: [] });
          self._save(mm); self._render();
        }
      }, '+ Add Section'));
      root.appendChild(gc);

      var sc = SH.el('div', { class: 'card' });
      sc.appendChild(SH.el('h2', { class: 'section' }, 'Custom States'));
      sc.appendChild(SH.el('p', { class: 'hint' },
        'OFF, ON, STOP and N/A are always available. Add extra states here \u2014 '
        + 'they join the click-cycle in every matrix cell.'));

      var tags = SH.el('div', { class: 'p2-tags' });
      for (i = 0; i < STD_STATES.length; i++) {
        tags.appendChild(SH.el('span', { class: 'p2-tag fixed' }, STD_STATES[i]));
      }
      for (i = 0; i < m.customStates.length; i++) {
        (function (s) {
          var tag = SH.el('span', { class: 'p2-tag' }, s);
          tag.appendChild(SH.el('button', {
            title: 'Remove', onClick: function () { self._deleteState(s); }
          }, '\u00d7'));
          tags.appendChild(tag);
        }(m.customStates[i]));
      }
      sc.appendChild(tags);

      var add = SH.el('input', { type: 'text', placeholder: 'Type a state and press Enter' });
      add.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var v = (add.value || '').trim().toUpperCase();
        if (!v) return;
        var mm = readMatrix();
        if (STD_STATES.indexOf(v) !== -1 || mm.customStates.indexOf(v) !== -1) {
          add.value = ''; return;
        }
        mm.customStates.push(v);
        self._save(mm);
        add.value = '';
        self._render();
      });
      sc.appendChild(add);
      root.appendChild(sc);

      var hc = SH.el('div', { class: 'card' });
      hc.appendChild(SH.el('h2', { class: 'section' }, 'Hidden from matrix'));
      hc.appendChild(SH.el('p', { class: 'hint' },
        'Rows and columns removed from this matrix. Nothing here is deleted \u2014 the devices '
        + 'remain in the Device Register and their recorded values are kept.'));

      if (!m.hidden.length) {
        hc.appendChild(SH.el('p', { class: 'hint' }, 'Nothing is hidden.'));
      }
      for (i = 0; i < m.hidden.length; i++) {
        (function (k) {
          var label, kind;
          if (k.indexOf('out:') === 0) {
            label = devLabel(deviceById(k.slice(4))); kind = 'column';
          } else if (k.indexOf('rz:') === 0) {
            var z = null, j;
            for (j = 0; j < m.resetZones.length; j++) {
              if (m.resetZones[j].id === k.slice(3)) z = m.resetZones[j];
            }
            label = z ? (z.label || 'Reset zone') : '(deleted reset zone)'; kind = 'column';
          } else {
            label = devLabel(deviceById(k)); kind = 'row';
          }
          var r = SH.el('div', { class: 'p2-hid' });
          r.appendChild(SH.el('span', null, label + '  \u2014  ' + kind));
          r.appendChild(SH.el('button', {
            class: 'btn sm ghost', onClick: function () {
              var mm = readMatrix();
              mm.hidden = self._without(mm.hidden, k);
              self._save(mm); self._render();
            }
          }, 'Restore'));
          hc.appendChild(r);
        }(m.hidden[i]));
      }
      root.appendChild(hc);
    },

    _deleteGroup: function (g) {
      var self = this;
      SH.modal('Delete section',
        SH.el('p', null, 'The outputs return to the ungrouped list. No cell values are lost.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Delete', onClick: function (close) {
            var m = readMatrix(), keep = [], i;
            for (i = 0; i < m.outputGroups.length; i++) {
              if (m.outputGroups[i].id !== g.id) keep.push(m.outputGroups[i]);
            }
            m.outputGroups = keep;
            self._save(m); close(); self._render();
          } }
      ]);
    },

    _deleteState: function (s) {
      var self = this;
      SH.modal('Remove custom state',
        SH.el('p', null, 'Cells currently set to "' + s + '" will be cleared.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Remove', onClick: function (close) {
            var m = readMatrix(), keep = [], i, r, ck;
            for (i = 0; i < m.customStates.length; i++) {
              if (m.customStates[i] !== s) keep.push(m.customStates[i]);
            }
            m.customStates = keep;
            for (i = 0; i < m.rows.length; i++) {
              r = m.rows[i];
              if (!r.cells) continue;
              for (ck in r.cells) {
                if (r.cells.hasOwnProperty(ck) && r.cells[ck] === s) delete r.cells[ck];
              }
            }
            self._save(m); close(); self._render();
          } }
      ]);
    }
  };
}()));
