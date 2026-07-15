/* ==============================================================
   FS Workbench — Validation › Phase 2 — Normal Operation
   File:     pages/validation/tabs/phase-2/phase-2.js
   Rev:      0.2.0
   Updated:  2026-07-15
   Requires: core.js, store.js
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
    + '.p2 .p2-scroll{overflow:auto;max-height:62vh;border:1px solid var(--line)}'
    + '.p2 table{border-collapse:collapse;font-size:12px;white-space:nowrap}'
    + '.p2 th,.p2 td{border:1px solid var(--line);padding:3px 6px;text-align:left}'
    + '.p2 thead th{position:sticky;top:0;background:var(--card);z-index:2}'
    + '.p2 thead tr.p2-grp th{top:0}'
    + '.p2 thead tr.p2-cols th{top:26px}'
    + '.p2 th.p2-grp-h{text-align:center;background:var(--black-3)}'
    + '.p2 td.p2-num{text-align:right;color:var(--muted)}'
    + '.p2 td.p2-dev{white-space:normal;min-width:180px}'
    + '.p2 td.p2-dev small{display:block;color:var(--muted)}'
    + '.p2 input.p2-in{width:100%;min-width:70px;border:0;background:transparent;'
    + 'color:var(--ink);font:inherit;padding:2px}'
    + '.p2 input.p2-in:focus{outline:1px solid var(--amber);background:var(--black-2)}'
    + '.p2 td.p2-cell{padding:0}'
    + '.p2 button.p2-st{width:100%;min-width:58px;border:0;background:transparent;'
    + 'font:inherit;font-size:11px;padding:5px 4px;cursor:pointer;color:var(--black)}'
    + '.p2 button.p2-st.s-blank{background:#fff}'
    + '.p2 button.p2-st.s-off{background:var(--fail-soft)}'
    + '.p2 button.p2-st.s-on{background:var(--pass-soft)}'
    + '.p2 button.p2-st.s-stop{background:var(--warn-soft)}'
    + '.p2 button.p2-st.s-na{background:var(--paper)}'
    + '.p2 button.p2-st.s-custom{background:var(--card);color:var(--ink)}'
    + '.p2 .p2-tools{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}'
    + '.p2 .p2-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}'
    + '.p2 .p2-row input,.p2 .p2-row select{flex:1}'
    + '.p2 .p2-tags{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}'
    + '.p2 .p2-tag{display:inline-flex;gap:6px;align-items:center;background:var(--black-3);'
    + 'border:1px solid var(--line);border-radius:12px;padding:2px 10px;font-size:12px}'
    + '.p2 .p2-tag button{border:0;background:transparent;color:var(--muted);cursor:pointer;font:inherit}'
    + '.p2 .p2-tag.fixed{opacity:.6}'
    + '.p2 .p2-x{border:0;background:transparent;color:var(--muted);cursor:pointer;font:inherit}';

  /* ---------- helpers ---------- */

  function uid(p) { return p + Math.random().toString(36).slice(2, 8); }

  function blankMatrix() {
    return { resetZones: [], outputGroups: [], customStates: [], rows: [] };
  }

  function readMatrix() {
    var m = SH.store.get('validation.phase2.matrix', null);
    if (!m || typeof m !== 'object') return blankMatrix();
    return {
      resetZones:   m.resetZones   instanceof Array ? m.resetZones   : [],
      outputGroups: m.outputGroups instanceof Array ? m.outputGroups : [],
      customStates: m.customStates instanceof Array ? m.customStates : [],
      rows:         m.rows         instanceof Array ? m.rows         : []
    };
  }

  function devices() { return SH.store.get('devices', []) || []; }

  function inputDevices() {
    var all = devices(), out = [], i;
    for (i = 0; i < all.length; i++) {
      if (INPUT_TYPES.indexOf(all[i].type) !== -1) out.push(all[i]);
    }
    return out;
  }

  function outputDevices() {
    var all = devices(), out = [], i;
    for (i = 0; i < all.length; i++) if (all[i].type === 'output') out.push(all[i]);
    return out;
  }

  function resetDevices() {
    var all = devices(), out = [], i;
    for (i = 0; i < all.length; i++) if (all[i].type === 'reset') out.push(all[i]);
    return out;
  }

  function deviceById(id) {
    var all = devices(), i;
    for (i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function stateClass(v, custom) {
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

  /* ---------- the tab ---------- */

  return {
    _host: null, _root: null, _pid: null,
    _section: 'matrix',
    _writing: false, _pending: false,
    _onProject: null, _onFocusOut: null,

    mount: function (host) {
      var self = this;
      this._host = host;
      this._pid  = SH.store.projectId();

      host.appendChild(SH.el('style', { html: CSS }));
      this._root = SH.el('div', { class: 'p2' });
      host.appendChild(this._root);

      this._onProject = function () {
        var pid = SH.store.projectId();
        if (pid !== self._pid) { self._pid = pid; self._section = 'matrix'; self._render(); return; }
        if (self._writing) return;
        if (self._host.contains(document.activeElement)) { self._pending = true; return; }
        self._render();
      };
      SH.bus.on('project:changed', this._onProject);

      this._onFocusOut = function () {
        if (!self._pending) return;
        self._pending = false;
        setTimeout(function () {
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
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
      if (this._onFocusOut && this._host) {
        this._host.removeEventListener('focusout', this._onFocusOut);
      }
      this._host = this._root = null;
    },

    _save: function (m) {
      var self = this;
      this._writing = true;
      SH.store.set('validation.phase2.matrix', m);
      setTimeout(function () { self._writing = false; }, 0);
    },

    /* find or create the stored row for a device / manual row id */
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

    _render: function () {
      var root = this._root;
      if (!root) return;
      root.innerHTML = '';

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

    /* ---------- section 1: matrix ---------- */

    _renderMatrix: function (root) {
      var self = this;
      var m = readMatrix();
      var ins = inputDevices();
      var outs = outputDevices();

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
          mm.rows.push({ id: uid('r_'), deviceId: null, name: '',
                         pageRef: '', info: '', delay: 'N/A', cells: {} });
          self._save(mm); self._render();
        }
      }, '+ Add Row'));
      root.appendChild(tools);

      /* column plan */
      var cols = [], gi, di, d;
      for (gi = 0; gi < m.resetZones.length; gi++) {
        cols.push({ key: 'rz:' + m.resetZones[gi].id,
                    label: m.resetZones[gi].label || 'Reset zone', group: 'Reset' });
      }
      var groups = [];
      if (m.outputGroups.length) {
        var used = {};
        for (gi = 0; gi < m.outputGroups.length; gi++) {
          var g = m.outputGroups[gi], gcols = [];
          var ids = g.deviceIds instanceof Array ? g.deviceIds : [];
          for (di = 0; di < ids.length; di++) {
            d = deviceById(ids[di]);
            if (!d || d.type !== 'output') continue;
            used[d.id] = true;
            gcols.push({ key: 'out:' + d.id, label: d.tag || d.description || d.id });
          }
          if (gcols.length) groups.push({ label: g.label || 'Group', cols: gcols });
        }
        var loose = [];
        for (di = 0; di < outs.length; di++) {
          if (!used[outs[di].id]) {
            loose.push({ key: 'out:' + outs[di].id,
                         label: outs[di].tag || outs[di].description || outs[di].id });
          }
        }
        if (loose.length) groups.push({ label: 'Ungrouped', cols: loose });
      } else if (outs.length) {
        var flat = [];
        for (di = 0; di < outs.length; di++) {
          flat.push({ key: 'out:' + outs[di].id,
                      label: outs[di].tag || outs[di].description || outs[di].id });
        }
        groups.push({ label: '', cols: flat });
      }
      for (gi = 0; gi < groups.length; gi++) cols = cols.concat(groups[gi].cols);

      /* rows: device rows first, then manual rows */
      var display = [], ri;
      for (ri = 0; ri < ins.length; ri++) {
        display.push({ device: ins[ri], stored: null });
      }
      for (ri = 0; ri < m.rows.length; ri++) {
        if (!m.rows[ri].deviceId) display.push({ device: null, stored: m.rows[ri] });
      }
      for (ri = 0; ri < display.length; ri++) {
        if (!display[ri].device) continue;
        var did = display[ri].device.id, k;
        for (k = 0; k < m.rows.length; k++) {
          if (m.rows[k].deviceId === did) { display[ri].stored = m.rows[k]; break; }
        }
      }

      var table = SH.el('table');
      var thead = SH.el('thead');

      var hasGroupBand = m.outputGroups.length > 0;
      if (hasGroupBand) {
        var band = SH.el('tr', { class: 'p2-grp' });
        band.appendChild(SH.el('th', { colspan: String(5 + m.resetZones.length) }, ''));
        for (gi = 0; gi < groups.length; gi++) {
          band.appendChild(SH.el('th', {
            class: 'p2-grp-h', colspan: String(groups[gi].cols.length)
          }, groups[gi].label));
        }
        thead.appendChild(band);
      }

      var hr = SH.el('tr', { class: 'p2-cols' });
      var fixed = ['#', 'Device', 'Page ref', 'Additional info', 'Delay time'];
      for (i = 0; i < fixed.length; i++) hr.appendChild(SH.el('th', null, fixed[i]));
      for (i = 0; i < cols.length; i++) hr.appendChild(SH.el('th', null, cols[i].label));
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = SH.el('tbody');
      for (ri = 0; ri < display.length; ri++) {
        tbody.appendChild(this._matrixRow(display[ri], ri, cols, m.customStates));
      }
      table.appendChild(tbody);

      var scroll = SH.el('div', { class: 'p2-scroll' });
      scroll.appendChild(table);
      root.appendChild(scroll);

      if (!cols.length) {
        root.appendChild(SH.el('div', { class: 'hint' },
          'No output devices or reset zones yet \u2014 add outputs in the Device Register, '
          + 'or reset zones in the Reset Zones section.'));
      }
    },

    _matrixRow: function (item, index, cols, custom) {
      var self = this;
      var tr = SH.el('tr');
      var dev = item.device, stored = item.stored;

      tr.appendChild(SH.el('td', { class: 'p2-num' }, String(index + 1)));

      var nameCell = SH.el('td', { class: 'p2-dev' });
      if (dev) {
        nameCell.appendChild(SH.el('strong', null, dev.tag || '(no tag)'));
        if (dev.description) nameCell.appendChild(SH.el('small', null, dev.description));
      } else {
        nameCell.appendChild(this._text(stored ? stored.name : '', 'Manual entry',
          function (v) {
            var m = readMatrix();
            self._rowFor(m, stored.id, false).name = v;
            self._save(m);
          }));
        nameCell.appendChild(SH.el('button', {
          class: 'p2-x', title: 'Delete row',
          onClick: function () { self._deleteRow(stored.id); }
        }, '\u00d7'));
      }
      tr.appendChild(nameCell);

      var key = dev ? dev.id : stored.id, isDev = !!dev;
      var fields = ['pageRef', 'info', 'delay'];
      var i;
      for (i = 0; i < fields.length; i++) {
        (function (f) {
          var val = stored ? (stored[f] || (f === 'delay' ? 'N/A' : '')) : (f === 'delay' ? 'N/A' : '');
          var td = SH.el('td');
          td.appendChild(self._text(val, '', function (v) {
            var m = readMatrix();
            self._rowFor(m, key, isDev)[f] = v;
            self._save(m);
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
              var m = readMatrix();
              var row = self._rowFor(m, key, isDev);
              if (!row.cells) row.cells = {};
              var next = cycle(row.cells[col.key] || '', m.customStates);
              if (next) row.cells[col.key] = next; else delete row.cells[col.key];
              self._save(m);
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

    _text: function (value, placeholder, onChange) {
      var el = SH.el('input', { class: 'p2-in', type: 'text', placeholder: placeholder || '' });
      el.value = value || '';
      el.addEventListener('input', function () { onChange(el.value); });
      return el;
    },

    _deleteRow: function (rowId) {
      var self = this;
      SH.modal('Delete row', SH.el('p', null, 'Remove this manual row and its matrix values?'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Delete', onClick: function (close) {
            var m = readMatrix(), keep = [], i;
            for (i = 0; i < m.rows.length; i++) if (m.rows[i].id !== rowId) keep.push(m.rows[i]);
            m.rows = keep;
            self._save(m); close(); self._render();
          } }
      ]);
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
        var res = [], s, has, arr;
        for (s = 0; s < sfs.length; s++) {
          arr = [].concat(sfs[s].inputs || [], sfs[s].logic || [], sfs[s].outputs || []);
          has = arr.indexOf(id) !== -1;
          if (!has) continue;
          var o = sfs[s].outputs || [];
          for (k = 0; k < o.length; k++) if (res.indexOf(o[k]) === -1) res.push(o[k]);
        }
        return res;
      }

      function fill(row, deviceIds, state) {
        if (!row.cells) row.cells = {};
        for (var x = 0; x < deviceIds.length; x++) {
          var ck = 'out:' + deviceIds[x];
          if (!row.cells[ck]) row.cells[ck] = state;
        }
      }

      for (i = 0; i < ins.length; i++) {
        d = ins[i];
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
        'Reset zones appear as columns in the matrix. Link to a reset device or define manually.'));

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
        SH.el('p', null, 'This removes its column and every value recorded in it.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Delete', onClick: function (close) {
            var m = readMatrix(), keep = [], i, r;
            for (i = 0; i < m.resetZones.length; i++) {
              if (m.resetZones[i].id !== z.id) keep.push(m.resetZones[i]);
            }
            m.resetZones = keep;
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

      /* output groups */
      var gc = SH.el('div', { class: 'card' });
      gc.appendChild(SH.el('h2', { class: 'section' }, 'Output Groups'));
      gc.appendChild(SH.el('p', { class: 'hint' },
        'Output groups split the matrix columns into sections. '
        + 'If no groups are defined all outputs appear in one table.'));

      var i;
      for (i = 0; i < m.outputGroups.length; i++) {
        (function (g) {
          var row = SH.el('div', { class: 'p2-row' });

          var label = SH.el('input', { type: 'text', placeholder: 'Group label' });
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
          var ids = g.deviceIds instanceof Array ? g.deviceIds : [];
          var j, opt;
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
      }, '+ Add Group'));
      root.appendChild(gc);

      /* custom states */
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
    },

    _deleteGroup: function (g) {
      var self = this;
      SH.modal('Delete output group',
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
