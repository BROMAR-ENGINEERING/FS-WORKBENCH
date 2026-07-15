/* ------------------------------------------------------------------
   File:     pages/validation/tabs/phase-3/phase-3.js
   Rev:      0.1.0
   Updated:  2026-07-15
   Requires: SH.el, SH.store (>= v0.15.5 — validation.phase3.tests),
             SH.bus, SH.modal
   Purpose:  Validation > Phase 3 — Fault Injection test sheets.
   ------------------------------------------------------------------ */

(function () {
  'use strict';

  var BASE = 'validation.phase3.tests.';

  /* ---------------- section definitions ---------------- */

  var SECTIONS = [
    {
      key: 'inconsistentInputs', num: 1, kind: 'std', gen: 'dual',
      title: 'Inconsistent Inputs (Channel Discrepancy)',
      desc: 'Simulate loss of one channel while the system is running. Verify the safety ' +
            'system detects the discrepancy and initiates a safe state within the discrepancy time.'
    },
    {
      key: 'channelShort', num: 2, kind: 'std', gen: 'input',
      title: 'Channel to Channel Short',
      desc: 'Short circuit between CH1 and CH2. Verify the safety system detects the fault.',
      note: 'Cat 3 — the system must detect the fault on the next demand. ' +
            'Cat 4 — the system must detect the fault immediately.'
    },
    {
      key: 'voltage24v', num: 3, kind: 'std', gen: 'input', cat4: true,
      title: 'External 24V Fault to Channel',
      desc: 'Apply 24VDC to an input channel. Verify the safety system detects the fault and ' +
            'initiates a safe state.',
      warn: 'CAUTION — Before performing this test confirm the safety controller uses test pulse ' +
            '(OSSD) inputs. Do NOT perform on safety relays that use positive/negative channel ' +
            'detection — applying 24V may damage the device or mask the fault. Confirm with ' +
            'manufacturer documentation before proceeding.'
    },
    {
      key: 'groundFault', num: 4, kind: 'std', gen: 'input', cat4: true,
      title: 'External 0V/Ground Fault to Channel',
      desc: 'Apply 0V/ground to an input channel. Verify the safety system detects the fault.',
      warn: 'CAUTION — Only recommended when the channel under test is already referenced to ' +
            'ground and the test verifies the channel does not go low. Confirm circuit topology ' +
            'before performing this test.'
    },
    {
      key: 'edm', num: 5, kind: 'edm', gen: 'edm',
      title: 'External Device Monitoring (EDM) Fault',
      desc: 'Remove or open the EDM feedback circuit. Verify the safety system cannot reset and ' +
            'remains in a faulted state.'
    },
    {
      key: 'special', num: 6, kind: 'special', gen: null,
      title: 'Special Condition Tests',
      desc: 'Project-specific fault tests. Add rows as required — these are not generated.'
    }
  ];

  /* ---------------- data helpers ---------------- */

  function devices() {
    return SH.store.get('devices', []) || [];
  }

  function byType(types) {
    var all = devices(), out = [], i;
    for (i = 0; i < all.length; i++) {
      if (types.indexOf(all[i].type) !== -1) out.push(all[i]);
    }
    return out;
  }

  function deviceById(id) {
    var all = devices(), i;
    for (i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
    return null;
  }

  /* Channel count. Explicit device.channels wins; otherwise infer from wiring
     labels by counting distinct CH<n> prefixes. A device with no recognisable
     channel labels is treated as single channel. */
  function channelsOf(d) {
    if (d.channels === 1 || d.channels === 2) return d.channels;
    var w = d.wiring || [], seen = {}, n = 0, i, m;
    for (i = 0; i < w.length; i++) {
      m = /CH\s*(\d+)/i.exec(w[i] && w[i].label || '');
      if (m && !seen[m[1]]) { seen[m[1]] = 1; n++; }
    }
    return n || 1;
  }

  function dualChannelInputs() {
    var a = byType(['estop', 'interlock']), out = [], i;
    for (i = 0; i < a.length; i++) { if (channelsOf(a[i]) >= 2) out.push(a[i]); }
    return out;
  }

  function genSource(gen) {
    if (gen === 'dual') return dualChannelInputs();
    if (gen === 'input') return byType(['estop', 'interlock']);
    if (gen === 'edm') return byType(['edm']);
    return [];
  }

  function rows(key) {
    var r = SH.store.get(BASE + key, []);
    return Array.isArray(r) ? r : [];
  }

  function blankStd(deviceId) {
    return { deviceId: deviceId, ch1: null, ch2: null,
             result: null, initial: '', date: '', comment: '' };
  }

  function blankSpecial() {
    return { description: '', expected: '', result: null,
             initial: '', date: '', comment: '' };
  }

  function clone(o) {
    var c = {}, k;
    for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; }
    return c;
  }

  /* ---------------- scoped css ---------------- */

  var CSS =
    '.t-phase3 .p3-bar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}' +
    '.t-phase3 .p3-sec{border:1px solid var(--line);border-radius:6px;margin-bottom:10px;' +
      'background:var(--card);overflow:hidden}' +
    '.t-phase3 .p3-sec.off{opacity:.55}' +
    '.t-phase3 .p3-head{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;' +
      'user-select:none}' +
    '.t-phase3 .p3-head:hover{background:var(--black-3)}' +
    '.t-phase3 .p3-num{font-family:var(--mono);color:var(--muted);min-width:14px}' +
    '.t-phase3 .p3-title{font-weight:600;flex:1}' +
    '.t-phase3 .p3-caret{color:var(--muted);font-family:var(--mono)}' +
    '.t-phase3 .p3-body{padding:0 12px 12px 12px;border-top:1px solid var(--line)}' +
    '.t-phase3 .p3-desc{margin:10px 0;color:var(--ink)}' +
    '.t-phase3 .p3-note{margin:8px 0;color:var(--muted);font-size:.9em}' +
    '.t-phase3 .p3-tbl{width:100%;border-collapse:collapse;font-size:.92em}' +
    '.t-phase3 .p3-tbl th{text-align:left;padding:6px;border-bottom:1px solid var(--line);' +
      'color:var(--muted);font-weight:600;white-space:nowrap}' +
    '.t-phase3 .p3-tbl td{padding:4px 6px;border-bottom:1px solid var(--line);vertical-align:middle}' +
    '.t-phase3 .p3-tbl input,.t-phase3 .p3-tbl select{width:100%;box-sizing:border-box}' +
    '.t-phase3 .p3-tag{font-family:var(--mono);white-space:nowrap}' +
    '.t-phase3 .p3-miss{color:var(--fail);font-style:italic}' +
    '.t-phase3 .p3-x{background:none;border:0;color:var(--muted);cursor:pointer;font-size:1.1em;' +
      'line-height:1;padding:2px 6px}' +
    '.t-phase3 .p3-x:hover{color:var(--fail)}' +
    '.t-phase3 .p3-actions{margin-top:10px}' +
    '.t-phase3 select.res-pass{color:var(--pass)}' +
    '.t-phase3 select.res-fail{color:var(--fail)}' +
    '.t-phase3 .p3-cnt{font-family:var(--mono);font-size:.85em;color:var(--muted)}';

  /* ---------------- ui builders ---------------- */

  function sel(value, cls) {
    var s = SH.el('select', cls ? { class: cls } : null,
      SH.el('option', { value: '' }, '—'),
      SH.el('option', { value: 'pass' }, 'Pass'),
      SH.el('option', { value: 'fail' }, 'Fail'));
    s.value = value || '';
    return s;
  }

  function resultClass(v) {
    return v === 'pass' ? 'res-pass' : (v === 'fail' ? 'res-fail' : '');
  }

  /* ---------------- tab ---------------- */

  var tab = {

    mount: function (host) {
      var self = this;
      this._host = host;
      this._open = {};
      this._cats = [];
      this._hasCat4 = false;
      this._writing = false;
      this._pending = false;
      this._pid = SH.store.projectId();

      host.appendChild(SH.el('style', { html: CSS }));
      this._body = SH.el('div', { class: 't-phase3' });
      host.appendChild(this._body);

      this._onProject = function () {
        if (self._writing) return;
        var id = SH.store.projectId();
        var switched = id !== self._pid;
        self._pid = id;
        if (switched) { self._open = {}; self._cats = []; self._hasCat4 = false; }
        self.refresh(switched);
        if (switched) self.loadCats();
      };
      SH.bus.on('project:changed', this._onProject);

      this._onBlur = function () {
        if (!self._pending) return;
        self._pending = false;
        setTimeout(function () { self.render(); }, 0);
      };
      host.addEventListener('focusout', this._onBlur);

      this.render();
      this.loadCats();
    },

    onShow: function () { this.refresh(false); },

    unmount: function () {
      SH.bus.off('project:changed', this._onProject);
      if (this._host) this._host.removeEventListener('focusout', this._onBlur);
    },

    /* Re-render, unless the user is typing inside this tab. */
    refresh: function (force) {
      if (!force && this._host && this._host.contains(document.activeElement)) {
        this._pending = true;
        return;
      }
      this.render();
    },

    /* Category is NOT on the sfs[] manifest by design — read each SF once. */
    loadCats: function () {
      var self = this;
      var man = SH.store.hasProject() ? (SH.store.get('sfs', []) || []) : [];
      var pid = SH.store.projectId();
      var out = [];
      var pending = man.length;
      var i;

      if (!pending || typeof SH.store.loadSF !== 'function') {
        this._cats = [];
        this._hasCat4 = false;
        this.refresh(false);
        return;
      }

      var done = function () {
        pending--;
        if (pending > 0) return;
        if (SH.store.projectId() !== pid) return;   // project switched mid-flight
        self._cats = out;
        self._hasCat4 = out.indexOf('4') !== -1;
        self.refresh(false);
      };

      for (i = 0; i < man.length; i++) {
        (function (m) {
          SH.store.loadSF(m.id).then(function (sf) {
            var c = sf && (sf.selectedCategory || (sf.plr && sf.plr.category));
            if (c) out.push(String(c));
            done();
          }, function () { done(); });
        })(man[i]);
      }
    },

    /* -------- writes -------- */

    write: function (key, arr) {
      var self = this;
      this._writing = true;
      SH.store.set(BASE + key, arr);
      setTimeout(function () { self._writing = false; }, 0);
    },

    setField: function (key, idx, field, value) {
      var arr = rows(key).slice();
      if (!arr[idx]) return;
      arr[idx] = clone(arr[idx]);
      arr[idx][field] = value === '' ? (field === 'result' || field === 'ch1' || field === 'ch2'
        ? null : '') : value;
      this.write(key, arr);
    },

    removeRow: function (key, idx) {
      var self = this;
      SH.modal('Remove test row', SH.el('p', null,
        'Remove this test row? Any result recorded against it will be lost.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Remove', onClick: function (close) {
            var arr = rows(key).slice();
            arr.splice(idx, 1);
            self.write(key, arr);
            close();
            self.render();
          } }
      ]);
    },

    addSpecial: function () {
      var arr = rows('special').slice();
      arr.push(blankSpecial());
      this.write('special', arr);
      this.render();
    },

    generate: function () {
      var self = this;
      SH.modal('Generate tests', SH.el('p', null,
        'Populate every empty section from the Device Register. Sections that already ' +
        'contain tests are left untouched.'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Generate', onClick: function (close) {
            var i, j, sec, src, arr;
            for (i = 0; i < SECTIONS.length; i++) {
              sec = SECTIONS[i];
              if (!sec.gen) continue;
              if (sec.cat4 && !self._hasCat4) continue;
              if (rows(sec.key).length) continue;
              src = genSource(sec.gen);
              if (!src.length) continue;
              arr = [];
              for (j = 0; j < src.length; j++) arr.push(blankStd(src[j].id));
              self.write(sec.key, arr);
            }
            close();
            self.render();
          } }
      ]);
    },

    /* -------- render -------- */

    render: function () {
      var body = this._body;
      var self = this;
      var i;

      body.innerHTML = '';

      if (!SH.store.hasProject()) {
        body.appendChild(SH.el('div', { class: 'stub' },
          'No project open. Open or create a project to record fault injection tests.'));
        return;
      }

      body.appendChild(SH.el('h2', { class: 'section' }, 'Phase 3 — Fault Injection'));
      body.appendChild(SH.el('p', { class: 'hint' },
        'Abnormal operation testing. Faults are deliberately induced to verify the safety ' +
        'system responds correctly. Read every caution before performing a test.'));

      if (!devices().length) {
        body.appendChild(SH.el('div', { class: 'warnnote' },
          'No devices found. Add devices in Safety Functions → Devices.'));
        return;
      }

      var bar = SH.el('div', { class: 'p3-bar' },
        SH.el('button', { class: 'btn', onClick: function () { self.generate(); } },
          'Generate Tests'),
        SH.el('span', { class: 'hint' },
          'Fills empty sections from the Device Register. Never overwrites existing results.'));
      body.appendChild(bar);

      for (i = 0; i < SECTIONS.length; i++) {
        body.appendChild(this.renderSection(SECTIONS[i]));
      }
    },

    renderSection: function (sec) {
      var self = this;
      var gated = sec.cat4 && !this._hasCat4;
      var open = !!this._open[sec.key] && !gated;
      var data = rows(sec.key);

      var head = SH.el('div', { class: 'p3-head', onClick: function () {
          if (gated) return;
          self._open[sec.key] = !self._open[sec.key];
          self.render();
        } },
        SH.el('span', { class: 'p3-num' }, String(sec.num)),
        SH.el('span', { class: 'p3-title' }, sec.title),
        SH.el('span', { class: 'p3-cnt' }, gated ? '' : this.summary(data)),
        SH.el('span', { class: 'p3-caret' }, gated ? '' : (open ? '▾' : '▸')));

      var wrap = SH.el('div', { class: 'p3-sec' + (gated ? ' off' : '') }, head);

      if (gated) {
        wrap.appendChild(SH.el('div', { class: 'p3-body' },
          SH.el('p', { class: 'p3-note' },
            'Not required — Cat 4 architecture not present in this project.')));
        return wrap;
      }

      if (!open) return wrap;

      var b = SH.el('div', { class: 'p3-body' });
      b.appendChild(SH.el('p', { class: 'p3-desc' }, sec.desc));
      if (sec.warn) b.appendChild(SH.el('div', { class: 'warnnote' }, sec.warn));
      if (sec.note) b.appendChild(SH.el('p', { class: 'p3-note' }, sec.note));

      if (!data.length) {
        b.appendChild(SH.el('p', { class: 'hint' }, sec.kind === 'special'
          ? 'No special condition tests. Use Add Test to create one.'
          : 'No tests yet. Use Generate Tests, or check the Device Register has ' +
            'matching devices.'));
      } else {
        b.appendChild(this.renderTable(sec, data));
      }

      if (sec.kind === 'special') {
        b.appendChild(SH.el('div', { class: 'p3-actions' },
          SH.el('button', { class: 'btn ghost sm', onClick: function () { self.addSpecial(); } },
            'Add Test')));
      }

      wrap.appendChild(b);
      return wrap;
    },

    summary: function (data) {
      var p = 0, f = 0, i;
      for (i = 0; i < data.length; i++) {
        if (data[i].result === 'pass') p++;
        else if (data[i].result === 'fail') f++;
      }
      if (!data.length) return '';
      return p + '/' + data.length + ' pass' + (f ? ' · ' + f + ' fail' : '');
    },

    renderTable: function (sec, data) {
      var heads, i;
      if (sec.kind === 'special') {
        heads = ['Description', 'Expected result', 'Result', 'Initial', 'Date', 'Comment', ''];
      } else if (sec.kind === 'edm') {
        heads = ['Tag', 'Description', 'Fault induced', 'System response',
                 'Result', 'Initial', 'Date', 'Comment', ''];
      } else {
        heads = ['Tag', 'Description', 'CH1', 'CH2', 'Result', 'Initial', 'Date', 'Comment', ''];
      }

      var tr = SH.el('tr');
      for (i = 0; i < heads.length; i++) tr.appendChild(SH.el('th', null, heads[i]));

      var tbody = SH.el('tbody');
      for (i = 0; i < data.length; i++) tbody.appendChild(this.renderRow(sec, data[i], i));

      return SH.el('table', { class: 'p3-tbl' }, SH.el('thead', null, tr), tbody);
    },

    renderRow: function (sec, r, idx) {
      var self = this;
      var tr = SH.el('tr');
      var key = sec.key;

      function td(child) { return SH.el('td', null, child); }

      function text(field, value) {
        var el = SH.el('input', { type: 'text', value: value || '' });
        el.addEventListener('change', function () {
          self.setField(key, idx, field, el.value);
        });
        return el;
      }

      function date(value) {
        var el = SH.el('input', { type: 'date', value: value || '' });
        el.addEventListener('change', function () {
          self.setField(key, idx, 'date', el.value);
        });
        return el;
      }

      function choice(field, value) {
        var el = sel(value, resultClass(value));
        el.addEventListener('change', function () {
          self.setField(key, idx, field, el.value);
          self.render();
        });
        return el;
      }

      if (sec.kind === 'special') {
        tr.appendChild(td(text('description', r.description)));
        tr.appendChild(td(text('expected', r.expected)));
      } else {
        var d = deviceById(r.deviceId);
        tr.appendChild(SH.el('td', { class: 'p3-tag' },
          d ? (d.tag || '—') : SH.el('span', { class: 'p3-miss' }, 'missing')));
        tr.appendChild(SH.el('td', null, d ? (d.description || '') : 'Device no longer in register'));
        if (sec.kind === 'edm') {
          tr.appendChild(td(text('ch1', r.ch1)));
          tr.appendChild(td(text('ch2', r.ch2)));
        } else {
          tr.appendChild(td(choice('ch1', r.ch1)));
          tr.appendChild(td(choice('ch2', r.ch2)));
        }
      }

      tr.appendChild(td(choice('result', r.result)));
      tr.appendChild(td(text('initial', r.initial)));
      tr.appendChild(td(date(r.date)));
      tr.appendChild(td(text('comment', r.comment)));
      tr.appendChild(SH.el('td', null,
        SH.el('button', { class: 'p3-x', title: 'Remove row',
          onClick: function () { self.removeRow(key, idx); } }, '×')));

      return tr;
    }
  };

  SH.registerTab('validation', 'phase-3', tab);
})();
