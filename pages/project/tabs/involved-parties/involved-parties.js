/* ==============================================================
   BroSafe — Project Details › Involved Parties
   File:     pages/project/tabs/involved-parties/involved-parties.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js, store.js, settings.js
   --------------------------------------------------------------
   Everyone involved in the project, each with one RACI role.
   Reads/writes project.involvedParties[] only (schema
   brosafe.project/1). Reads settings.company.name for the
   organisation datalist; never writes SH.settings.
   Kept-alive safe: re-renders on project:changed while visible.
   ============================================================== */
(function () {
  'use strict';

  var RACI = [
    { k: 'R', label: 'Responsible', hint: 'Does the work' },
    { k: 'A', label: 'Accountable', hint: 'Owns the outcome — exactly one person' },
    { k: 'C', label: 'Consulted',   hint: 'Two-way input before decisions' },
    { k: 'I', label: 'Informed',    hint: 'Kept up to date, one-way' }
  ];

  var LETTERS = RACI.map(function (r) { return r.k; });

  /* ---------------------------------- store access */

  var writing = false;

  function uid() {
    return 'pty_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* The schema has no id. One is added in memory so a row survives
     reordering and renaming; it is stripped before every write. */
  function hydrate(p) {
    return {
      _id:          uid(),
      name:         p.name || '',
      role:         p.role || '',
      organisation: p.organisation || '',
      email:        p.email || '',
      raci:         LETTERS.indexOf(p.raci) > -1 ? p.raci : ''
    };
  }

  function dehydrate(p) {
    return { name: p.name, role: p.role, organisation: p.organisation, email: p.email, raci: p.raci };
  }

  function read() {
    var list = SH.store.get('involvedParties', []);
    return Array.isArray(list) ? list.map(hydrate) : [];
  }

  /* TODO: pin to the real store writer once its signature is confirmed.
     A fresh array is handed over every time — never the live reference. */
  function write(list) {
    var out = list.map(dehydrate);
    writing = true;
    try {
      if (typeof SH.store.set === 'function') SH.store.set('involvedParties', out);
      else if (typeof SH.store.update === 'function') SH.store.update(function (p) { p.involvedParties = out; });
      else console.warn('[involved-parties] no store write method available');
    } finally {
      writing = false;
    }
  }

  function blank() {
    return { _id: uid(), name: '', role: '', organisation: '', email: '', raci: '' };
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------------------------------- tab */

  SH.registerTab('project', 'involved-parties', {

    _saveTimer: null,

    _commit: function (now) {
      var self = this;
      clearTimeout(this._saveTimer);
      var run = function () { write(self._list); self._summary(); };
      if (now) run(); else this._saveTimer = setTimeout(run, 250);
    },

    /* -- counts and integrity warnings ------------------------------------ */

    _summary: function () {
      if (!this._counts) return;

      var counts = { R: 0, A: 0, C: 0, I: 0 };
      this._list.forEach(function (p) { if (counts[p.raci] != null) counts[p.raci]++; });

      var box = this._counts;
      box.textContent = '';
      RACI.forEach(function (r) {
        var pill = el('span', 'pill', r.k + ' ' + counts[r.k]);
        pill.title = r.label;
        box.appendChild(pill);
      });

      this._notes.textContent = '';
      if (!this._list.length) return;

      if (counts.A === 0) {
        this._notes.appendChild(el('div', 'warnnote',
          'No one is Accountable. Every project needs exactly one accountable person.'));
      } else if (counts.A > 1) {
        this._notes.appendChild(el('div', 'warnnote',
          counts.A + ' people are marked Accountable. RACI allows only one.'));
      }
      if (counts.R === 0) {
        this._notes.appendChild(el('div', 'warnnote',
          'No one is Responsible. At least one person must do the work.'));
      }

      var idle = this._list.filter(function (p) { return p.name && !p.raci; }).length;
      if (idle) {
        this._notes.appendChild(el('div', 'hint',
          idle + (idle === 1 ? ' person has' : ' people have') +
          ' no RACI role and will be left out of the report table.'));
      }
    },

    _organisations: function () {
      if (!this._dl) return;
      var seen = {}, out = [];
      var mine   = SH.settings && SH.settings.get ? SH.settings.get('company.name', '') : '';
      var client = SH.store.get('meta.client', '');
      [mine, client].forEach(function (c) { if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
      this._list.forEach(function (p) {
        if (p.organisation && !seen[p.organisation]) { seen[p.organisation] = 1; out.push(p.organisation); }
      });
      var dl = this._dl;
      dl.textContent = '';
      out.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c;
        dl.appendChild(o);
      });
    },

    /* -- cells ------------------------------------------------------------ */

    _textCell: function (person, key, placeholder, type) {
      var self = this;
      var td = el('td');
      var i = el('input', 'field');
      i.type = type || 'text';
      i.value = person[key] || '';
      i.placeholder = placeholder;
      i.setAttribute('aria-label', placeholder);
      if (key === 'organisation') i.setAttribute('list', 'bs-party-orgs');
      i.addEventListener('input', function () {
        person[key] = i.value;
        self._commit();
      });
      if (key === 'organisation') i.addEventListener('change', function () { self._organisations(); });
      td.appendChild(i);
      return td;
    },

    /* One role per person — the schema stores a single letter, so these are
       radios, not checkboxes. The blank option clears the role. */
    _raciCell: function (person, role) {
      var self = this;
      var td = el('td');
      var lab = el('label', 'chk');
      var r = document.createElement('input');
      r.type = 'radio';
      r.name = 'raci_' + person._id;
      r.checked = person.raci === role.k;
      r.title = role.k ? role.label + ' — ' + role.hint : 'No role';
      r.setAttribute('aria-label', (role.label || 'No role') + ': ' + (person.name || 'new person'));
      r.addEventListener('change', function () {
        if (!r.checked) return;
        person.raci = role.k;
        self._commit(true);
      });
      lab.appendChild(r);
      lab.appendChild(el('span', null, role.k || '—'));
      td.appendChild(lab);
      return td;
    },

    _actionsCell: function (person) {
      var self = this;
      var td = el('td');
      td.style.whiteSpace = 'nowrap';

      var up = el('button', 'btn', '↑');
      up.type = 'button';
      up.title = 'Move up';
      up.addEventListener('click', function () { self._move(person, -1); });

      var dn = el('button', 'btn', '↓');
      dn.type = 'button';
      dn.title = 'Move down';
      dn.addEventListener('click', function () { self._move(person, 1); });

      var rm = el('button', 'btn', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', function () { self._remove(person); });

      td.appendChild(up);
      td.appendChild(dn);
      td.appendChild(rm);
      return td;
    },

    _row: function (person) {
      var self = this;
      var tr = el('tr');
      tr.appendChild(this._textCell(person, 'name',         'Full name'));
      tr.appendChild(this._textCell(person, 'role',         'Role or title'));
      tr.appendChild(this._textCell(person, 'organisation', 'Company represented'));
      tr.appendChild(this._textCell(person, 'email',        'Email', 'email'));
      RACI.concat([{ k: '', label: '', hint: '' }]).forEach(function (r) {
        tr.appendChild(self._raciCell(person, r));
      });
      tr.appendChild(this._actionsCell(person));
      return tr;
    },

    _rows: function () {
      if (!this._tbody) return;
      this._tbody.textContent = '';
      if (!this._list.length) {
        var tr = el('tr');
        var td = el('td');
        td.colSpan = 10;
        td.appendChild(el('div', 'hint',
          'No one added yet. Add the first person to start the RACI table.'));
        tr.appendChild(td);
        this._tbody.appendChild(tr);
      } else {
        var self = this;
        this._list.forEach(function (p) { self._tbody.appendChild(self._row(p)); });
      }
      this._organisations();
      this._summary();
    },

    /* -- mutations -------------------------------------------------------- */

    _add: function () {
      this._list.push(blank());
      this._commit(true);
      this._rows();
      var rows = this._tbody.querySelectorAll('tr');
      var last = rows[rows.length - 1];
      if (last) last.querySelector('input[type=text]').focus();
    },

    _remove: function (person) {
      var ask = SH.settings && SH.settings.get
        ? SH.settings.get('prefs.confirmBeforeDelete', true) : true;
      if (ask && !window.confirm('Remove ' + (person.name || 'this person') + ' from the project?')) return;
      this._list = this._list.filter(function (p) { return p._id !== person._id; });
      this._commit(true);
      this._rows();
    },

    _move: function (person, delta) {
      var i = this._list.indexOf(person);
      var j = i + delta;
      if (i < 0 || j < 0 || j >= this._list.length) return;
      this._list.splice(j, 0, this._list.splice(i, 1)[0]);
      this._commit(true);
      this._rows();
    },

    /* -- render ----------------------------------------------------------- */

    _render: function () {
      var host = this._host;
      if (!host) return;

      host.textContent = '';
      this._tbody = this._notes = this._counts = this._dl = null;

      host.appendChild(el('h2', 'section', 'Involved Parties'));

      if (!SH.store.hasProject()) {
        this._list = [];
        host.appendChild(el('div', 'warnnote',
          'No project is open. Open or create a project first.'));
        return;
      }

      this._list = read();

      var self = this;
      var card = el('div', 'card');

      card.appendChild(el('p', 'hint',
        'Everyone involved in the project. Assign each person one RACI role — Responsible, ' +
        'Accountable, Consulted, Informed — and produce the RACI table for the report.'));

      var head = el('div', 'grid2');
      var addBtn = el('button', 'btn', 'Add person');
      addBtn.type = 'button';
      addBtn.addEventListener('click', function () { self._add(); });
      head.appendChild(addBtn);

      this._counts = el('div');
      head.appendChild(this._counts);
      card.appendChild(head);

      this._dl = document.createElement('datalist');
      this._dl.id = 'bs-party-orgs';
      card.appendChild(this._dl);

      var tbl = el('table', 'tbl');
      var thead = el('thead');
      var htr = el('tr');
      [['Full name', '20%'], ['Role', '17%'], ['Company represented', '20%'], ['Email', '17%']]
        .forEach(function (c) {
          var th = el('th', null, c[0]);
          th.style.width = c[1];
          htr.appendChild(th);
        });
      RACI.forEach(function (r) {
        var th = el('th', null, r.k);
        th.title = r.label + ' — ' + r.hint;
        htr.appendChild(th);
      });
      var none = el('th', null, '—');
      none.title = 'No role';
      htr.appendChild(none);
      htr.appendChild(el('th', null, ''));
      thead.appendChild(htr);
      tbl.appendChild(thead);

      this._tbody = el('tbody');
      tbl.appendChild(this._tbody);
      card.appendChild(tbl);

      this._notes = el('div');
      card.appendChild(this._notes);

      card.appendChild(el('div', 'hint',
        RACI.map(function (r) { return r.k + ' = ' + r.label + ' (' + r.hint + ')'; }).join(' · ')));

      host.appendChild(card);
      this._rows();
    },

    /* -- lifecycle -------------------------------------------------------- */

    mount: function (host) {
      var self = this;
      this._host = host;
      this._list = [];
      this._render();

      /* Kept-alive tabs: a tab first mounted with no project open must redraw
         when one is created, opened or closed. Skip our own write echoing
         back, and skip a sibling's write while someone is typing here. */
      this._onProject = function () {
        if (writing) return;
        if (SH.store.hasProject() && self._host &&
            self._host.contains(document.activeElement)) return;
        self._render();
      };
      SH.bus.on('project:changed', this._onProject);

      /* A company-name change only affects the datalist. Never redraw for it. */
      this._onSettings = function () { self._organisations(); };
      SH.bus.on('settings:changed', this._onSettings);
    },

    onShow: function () {
      if (this._host && this._host.contains(document.activeElement)) return;
      this._render();
    },

    unmount: function () {
      clearTimeout(this._saveTimer);
      if (this._onProject)  SH.bus.off('project:changed',  this._onProject);
      if (this._onSettings) SH.bus.off('settings:changed', this._onSettings);
      this._onProject = this._onSettings = null;
      this._host = this._tbody = this._notes = this._counts = this._dl = null;
      this._list = [];
    }

  });
})();