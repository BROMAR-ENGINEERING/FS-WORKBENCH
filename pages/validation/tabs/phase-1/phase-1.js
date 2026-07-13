/* ==============================================================
   FS Workbench — Validation › Phase 1 — I/O Verification
   File:     pages/validation/tabs/phase-1/phase-1.js
   Rev:      0.2.0
   Updated:  2026-07-13
   Requires: core.js, store.js
   --------------------------------------------------------------
   Wiring verification before functional testing. Three modes:
   Simple Sign-off, Import Wire Table (CSV), Manual Wire Entry.
   Device data from project.devices[]; wire numbers written back
   to project.devices[].wiring. Mode stored in
   project.validation.phase1.mode (declared in core normalize()).
   NOTE: Mode 1 sign-off uses project.validation.phase1.signoff —
   core chat must add that key to normalize() to persist it.
   ============================================================== */
SH.registerTab('validation', 'phase-1', (function () {

  var GROUPS = [
    { key: 'inputs',  label: 'Inputs',  types: ['estop', 'interlock'] },
    { key: 'outputs', label: 'Outputs', types: ['output'] },
    { key: 'resets',  label: 'Resets',  types: ['reset'] },
    { key: 'edms',    label: 'EDMs',    types: ['edm'] },
    { key: 'other',   label: 'Other',   types: ['other'] }
  ];

  /* ---- helpers -------------------------------------------------- */

  function groupOf(type) {
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].types.indexOf(type) !== -1) return GROUPS[i].key;
    }
    return 'other';
  }

  // -> [{ group, label, devices:[] }] with empty groups dropped
  function grouped(devices) {
    var out = [], i, j;
    for (i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i], list = [];
      for (j = 0; j < devices.length; j++) {
        if (groupOf(devices[j].type) === g.key) list.push(devices[j]);
      }
      if (list.length) out.push({ group: g.key, label: g.label, devices: list });
    }
    return out;
  }

  function csvCell(s) {
    s = (s == null ? '' : String(s));
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function parseCsv(text) {
    var rows = [], row = [], field = '', inq = false, i, c;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (inq) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i++; }
          else inq = false;
        } else field += c;
      } else if (c === '"') inq = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function downloadCsv(name, text) {
    var blob = new Blob([text], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = SH.el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function updateWiring(deviceId, mutate) {
    var devices = SH.store.get('devices', []);
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].id === deviceId) {
        devices[i].wiring = devices[i].wiring || [];
        mutate(devices[i]);
        break;
      }
    }
    SH.store.set('devices', devices);
  }

  /* ---- scoped style --------------------------------------------- */

  function styleTag() {
    return SH.el('style', { html:
      '.p1-modes{display:flex;gap:8px;margin-bottom:16px}' +
      '.p1-modes .btn{flex:0 0 auto}' +
      '.p1-modes .btn.active{background:var(--amber);color:var(--black);border-color:var(--amber)}' +
      '.p1-grp{margin-bottom:18px}' +
      '.p1-grp h3{font:600 13px var(--sans);margin:0 0 6px;color:var(--muted);' +
        'text-transform:uppercase;letter-spacing:.04em}' +
      '.p1-dev{border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin-bottom:8px}' +
      '.p1-dev .tag{font:600 13px var(--sans)}' +
      '.p1-dev .desc{color:var(--muted);font-size:12px}' +
      '.p1-wires{margin-top:8px}' +
      '.p1-wire{display:flex;gap:8px;align-items:center;margin-bottom:6px}' +
      '.p1-wire input{flex:1 1 auto}' +
      '.p1-wire .btn.sm{flex:0 0 auto;padding:2px 8px}' +
      '.p1-sign{display:flex;gap:8px;align-items:center;margin:6px 0}' +
      '.p1-foot{margin-top:16px;display:flex;gap:16px;flex-wrap:wrap}' +
      '.p1-foot .field{min-width:200px}'
    });
  }

  /* ---- mode 1: simple sign-off ---------------------------------- */

  function renderSignoff(host, devices) {
    var signoff = SH.store.get('validation.phase1.signoff', {}) || {};
    var checks = signoff.groups || {};
    var groups = grouped(devices);

    var wrap = SH.el('div');

    groups.forEach(function (g) {
      var box = SH.el('div', { class: 'p1-grp' });
      box.appendChild(SH.el('h3', null, g.label + ' (' + g.devices.length + ')'));

      var ul = SH.el('div');
      g.devices.forEach(function (d) {
        ul.appendChild(SH.el('div', { class: 'p1-dev' },
          SH.el('span', { class: 'tag' }, d.tag || '(untagged)'),
          SH.el('div', { class: 'desc' }, d.description || '')
        ));
      });
      box.appendChild(ul);

      var cb = SH.el('input', { type: 'checkbox' });
      cb.checked = !!checks[g.group];
      cb.onchange = function () {
        var s = SH.store.get('validation.phase1.signoff', {}) || {};
        s.groups = s.groups || {};
        s.groups[g.group] = cb.checked;
        SH.store.set('validation.phase1.signoff', s);
      };
      box.appendChild(SH.el('label', { class: 'p1-sign' }, cb,
        SH.el('span', null, 'Wiring for all ' + g.label.toLowerCase() +
          ' complies with the associated schematic.')));

      wrap.appendChild(box);
    });

    var foot = SH.el('div', { class: 'p1-foot' });
    var name = SH.el('input', { type: 'text', value: signoff.tech || '' });
    name.oninput = function () {
      var s = SH.store.get('validation.phase1.signoff', {}) || {};
      s.tech = name.value;
      SH.store.set('validation.phase1.signoff', s);
    };
    var date = SH.el('input', { type: 'date', value: signoff.date || '' });
    date.oninput = function () {
      var s = SH.store.get('validation.phase1.signoff', {}) || {};
      s.date = date.value;
      SH.store.set('validation.phase1.signoff', s);
    };
    foot.appendChild(SH.el('label', { class: 'field' }, SH.el('span', null, 'Technician'), name));
    foot.appendChild(SH.el('label', { class: 'field' }, SH.el('span', null, 'Date'), date));
    wrap.appendChild(foot);

    host.appendChild(wrap);
  }

  /* ---- mode 2: import wire table -------------------------------- */

  function renderImport(host, devices) {
    var wrap = SH.el('div');

    wrap.appendChild(SH.el('p', { class: 'hint' },
      'Download the template, fill wire numbers off the schematic, then import ' +
      'it back. Rows are matched to devices by tag.'));

    var dl = SH.el('button', { class: 'btn' }, 'Download CSV template');
    dl.onclick = function () {
      var lines = ['tag,description,type,wire label,wire number'];
      devices.forEach(function (d) {
        var w = d.wiring && d.wiring.length ? d.wiring : [{ label: '', wire: '' }];
        w.forEach(function (row) {
          lines.push([d.tag, d.description, d.type, row.label, row.wire]
            .map(csvCell).join(','));
        });
      });
      downloadCsv('wire-table.csv', lines.join('\n'));
    };

    var file = SH.el('input', { type: 'file', accept: '.csv', style: 'display:none' });
    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        importCsv(String(reader.result), host);
      };
      reader.readAsText(f);
      file.value = '';
    };
    var imp = SH.el('button', { class: 'btn ghost' }, 'Import filled CSV…');
    imp.onclick = function () { file.click(); };

    wrap.appendChild(SH.el('div', { class: 'p1-foot' }, dl, imp, file));

    var msg = SH.el('div', { class: 'hint', id: 'p1-import-msg' });
    wrap.appendChild(msg);

    host.appendChild(wrap);
  }

  function importCsv(text, host) {
    var rows = parseCsv(text);
    if (!rows.length) return;
    // find header columns
    var head = rows[0].map(function (s) { return String(s).toLowerCase().trim(); });
    var ci = {
      tag:   head.indexOf('tag'),
      label: head.indexOf('wire label'),
      wire:  head.indexOf('wire number')
    };
    if (ci.tag === -1) { flash(host, 'CSV has no "tag" column — nothing imported.'); return; }

    // group non-empty wire rows by tag
    var byTag = {}, i, r, tag, label, wire;
    for (i = 1; i < rows.length; i++) {
      r = rows[i];
      tag = (r[ci.tag] || '').trim();
      if (!tag) continue;
      label = ci.label !== -1 ? (r[ci.label] || '').trim() : '';
      wire  = ci.wire  !== -1 ? (r[ci.wire]  || '').trim() : '';
      if (!byTag[tag]) byTag[tag] = [];
      if (label || wire) byTag[tag].push({ label: label, wire: wire });
    }

    var devices = SH.store.get('devices', []), touched = 0;
    for (i = 0; i < devices.length; i++) {
      var t = (devices[i].tag || '').trim();
      if (byTag.hasOwnProperty(t)) { devices[i].wiring = byTag[t]; touched++; }
    }
    SH.store.set('devices', devices);
    flash(host, touched + ' device' + (touched === 1 ? '' : 's') + ' updated from CSV.');
  }

  function flash(host, text) {
    var msg = host.querySelector('#p1-import-msg');
    if (msg) msg.textContent = text;
  }

  /* ---- mode 3: manual wire entry -------------------------------- */

  function renderManual(host, devices) {
    var wrap = SH.el('div');

    grouped(devices).forEach(function (g) {
      var box = SH.el('div', { class: 'p1-grp' });
      box.appendChild(SH.el('h3', null, g.label));

      g.devices.forEach(function (d) {
        var card = SH.el('div', { class: 'p1-dev' });
        card.appendChild(SH.el('span', { class: 'tag' }, d.tag || '(untagged)'));
        card.appendChild(SH.el('div', { class: 'desc' }, d.description || ''));

        var wires = SH.el('div', { class: 'p1-wires' });
        var list = d.wiring && d.wiring.length ? d.wiring : [];

        list.forEach(function (w, idx) {
          var lbl = SH.el('input', { type: 'text', placeholder: 'Label', value: w.label || '' });
          lbl.oninput = function () {
            updateWiring(d.id, function (dev) { dev.wiring[idx].label = lbl.value; });
          };
          var num = SH.el('input', { type: 'text', placeholder: 'Wire no.', value: w.wire || '' });
          num.oninput = function () {
            updateWiring(d.id, function (dev) { dev.wiring[idx].wire = num.value; });
          };
          var rm = SH.el('button', { class: 'btn ghost sm' }, '×');
          rm.onclick = function () {
            updateWiring(d.id, function (dev) { dev.wiring.splice(idx, 1); });
            render(host);
          };
          wires.appendChild(SH.el('div', { class: 'p1-wire' }, lbl, num, rm));
        });

        var add = SH.el('button', { class: 'btn ghost sm' }, '+ wire');
        add.onclick = function () {
          updateWiring(d.id, function (dev) { dev.wiring.push({ label: '', wire: '' }); });
          render(host);
        };
        wires.appendChild(add);

        card.appendChild(wires);
        box.appendChild(card);
      });

      wrap.appendChild(box);
    });

    host.appendChild(wrap);
  }

  /* ---- mode bar + top-level render ------------------------------ */

  function renderModeBar(host, mode) {
    var bar = SH.el('div', { class: 'p1-modes' });
    var defs = [
      { id: 'signoff', label: 'Simple Sign-off' },
      { id: 'import',  label: 'Import Wire Table' },
      { id: 'manual',  label: 'Manual Wire Entry' }
    ];
    defs.forEach(function (m) {
      var b = SH.el('button', { class: 'btn ghost' + (mode === m.id ? ' active' : '') }, m.label);
      b.onclick = function () {
        SH.store.set('validation.phase1.mode', m.id);
        render(host);
      };
      bar.appendChild(b);
    });
    host.appendChild(bar);
  }

  function render(host) {
    host.innerHTML = '';

    if (!SH.store.hasProject()) {
      host.appendChild(SH.el('div', { class: 'warnnote' }, 'No project is open.'));
      return;
    }

    host.appendChild(styleTag());
    host.appendChild(SH.el('h2', { class: 'section' }, 'Phase 1 — I/O Verification'));
    host.appendChild(SH.el('p', { class: 'hint' },
      'Confirm every safety device is wired correctly before functional testing.'));

    var devices = SH.store.get('devices', []);
    if (!devices.length) {
      host.appendChild(SH.el('div', { class: 'warnnote' },
        'No devices have been added. Add devices in Safety Functions → Devices.'));
      return;
    }

    var mode = SH.store.get('validation.phase1.mode', null);
    renderModeBar(host, mode);

    var body = SH.el('div');
    host.appendChild(body);

    if (mode === 'signoff') renderSignoff(body, devices);
    else if (mode === 'import') renderImport(body, devices);
    else if (mode === 'manual') renderManual(body, devices);
    else body.appendChild(SH.el('p', { class: 'hint' }, 'Select a verification mode above.'));
  }

  /* ---- lifecycle ------------------------------------------------ */

  return {
    _host: null,
    _pid:  null,
    _onProject: null,

    mount: function (host) {
      var self = this;
      this._host = host;
      this._pid  = SH.store.projectId();
      this._onProject = function () {
        var pid = SH.store.projectId();
        if (pid !== self._pid) { self._pid = pid; render(self._host); return; }
        if (!SH.store.hasProject()) { render(self._host); return; }
        if (host.contains(document.activeElement)) return; // guard caret
        render(self._host);
      };
      SH.bus.on('project:changed', this._onProject);
      render(host);
    },

    onShow: function () {
      if (this._host && !this._host.contains(document.activeElement)) render(this._host);
    },

    unmount: function () {
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
    }
  };
}()));
