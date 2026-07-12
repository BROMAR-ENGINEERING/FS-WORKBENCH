/* ==============================================================
   BroSafe — Project Details › Document Control
   File:     pages/project/tabs/document-control/document-control.js
   Rev:      0.6.0
   Updated:  2026-07-09
   Requires: core.js, store.js
   --------------------------------------------------------------
   Register of project documents (type, title, number, revision,
   date, author, company, file name). Reads/writes project.documents[].
   Kept-alive safe: re-renders on project:changed and on reveal.
   ============================================================== */
(function () {
  'use strict';

  var DOC_TYPES = [
    'Electrical Schematics',
    'Pneumatic Schematics',
    'Hydraulic Schematics',
    'Mechanical Drawings',
    'Layout',
    'Risk Assessment',
    'SRS',
    "SOP's",
    'Manuals',
    'Other'
  ];

  /* ---------- store access ---------- */

  function isOpen() {
    return !!(SH.store && SH.store.hasProject && SH.store.hasProject());
  }

  function readDocs() {
    if (!isOpen()) return [];
    var d = SH.store.project && SH.store.project.documents;
    return Array.isArray(d) ? d : [];
  }

  /* TODO: confirm the canonical mutator; collapse this to a single call. */
  function writeDocs(next) {
    if (!isOpen()) return;
    if (typeof SH.store.set === 'function') {
      SH.store.set('documents', next);
    } else if (typeof SH.store.update === 'function') {
      SH.store.update(function (p) { p.documents = next; });
    } else if (typeof SH.store.patch === 'function') {
      SH.store.patch({ documents: next });
    } else {
      SH.store.project.documents = next;
      SH.bus.emit('project:changed', SH.store.project);
    }
  }

  /* ---------- helpers ---------- */

  function uid() {
    if (SH.uid) return SH.uid('doc');
    return 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : iso;
  }

  function blank() {
    return {
      id: '', type: DOC_TYPES[0], title: '', number: '', revision: '',
      date: '', author: '', company: '', fileName: '', notes: ''
    };
  }

  function typeOptions(sel) {
    return DOC_TYPES.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === sel ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }

  /* ---------- module state ---------- */

  var state = { editing: null, filter: '' };
  var els = {};
  var onProjectChanged = null;

  /* ---------- rendering ---------- */

  function renderForm() {
    if (!els.form) return;

    if (!state.editing || !isOpen()) {
      els.form.innerHTML = '';
      return;
    }

    var d = state.editing;
    var isNew = !d.id;

    els.form.innerHTML =
      '<div class="card">' +
        '<h2 class="section">' + (isNew ? 'Add document' : 'Edit document') + '</h2>' +
        '<div class="grid2">' +
          '<label class="field"><span>Document type</span>' +
            '<select data-f="type">' + typeOptions(d.type) + '</select></label>' +
          '<label class="field"><span>Title</span>' +
            '<input type="text" data-f="title" value="' + esc(d.title) + '" placeholder="e.g. Cell 3 power schematic"></label>' +
          '<label class="field"><span>Document number</span>' +
            '<input type="text" data-f="number" value="' + esc(d.number) + '"></label>' +
          '<label class="field"><span>Revision / version</span>' +
            '<input type="text" data-f="revision" value="' + esc(d.revision) + '"></label>' +
          '<label class="field"><span>Date</span>' +
            '<input type="date" data-f="date" value="' + esc(d.date) + '"></label>' +
          '<label class="field"><span>Author</span>' +
            '<input type="text" data-f="author" value="' + esc(d.author) + '"></label>' +
          '<label class="field"><span>Author company</span>' +
            '<input type="text" data-f="company" value="' + esc(d.company) + '"></label>' +
          '<label class="field"><span>File name</span>' +
            '<span class="row">' +
              '<input type="text" data-f="fileName" value="' + esc(d.fileName) + '" placeholder="e.g. drawings/E-1042_RevC.pdf">' +
              '<button type="button" class="btn" data-act="browse">Browse…</button>' +
            '</span></label>' +
        '</div>' +
        '<label class="field"><span>Notes</span>' +
          '<textarea data-f="notes" rows="2">' + esc(d.notes) + '</textarea></label>' +
        '<p class="hint">The file name is recorded for reference only — no file is copied or linked.</p>' +
        '<div class="row">' +
          '<button type="button" class="btn primary" data-act="save">' + (isNew ? 'Add document' : 'Save changes') + '</button> ' +
          '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
        '</div>' +
        '<input type="file" data-role="picker" hidden>' +
      '</div>';
  }

  function renderList() {
    if (!els.list) return;

    if (!isOpen()) {
      els.list.innerHTML =
        '<div class="card"><p class="warnnote">No project is open. ' +
        'Open or create a project first.</p></div>';
      return;
    }

    var docs = readDocs();
    var shown = state.filter ? docs.filter(function (d) { return d.type === state.filter; }) : docs;

    var head =
      '<div class="row">' +
        '<label class="field"><span>Filter by type</span>' +
          '<select data-role="filter">' +
            '<option value="">All types</option>' +
            typeOptions(state.filter) +
          '</select></label>' +
        '<span class="pill">' + shown.length + ' of ' + docs.length + '</span>' +
        '<button type="button" class="btn primary" data-act="add">Add document</button>' +
      '</div>';

    var body;
    if (!docs.length) {
      body = '<p class="hint">No documents recorded yet. Add electrical, pneumatic and hydraulic ' +
             'schematics, mechanical drawings, layouts, SOPs, manuals, the risk assessment and the SRS.</p>';
    } else if (!shown.length) {
      body = '<p class="hint">No documents of that type.</p>';
    } else {
      body =
        '<table class="tbl"><thead><tr>' +
          '<th>Type</th><th>Title</th><th>Number</th><th>Rev</th>' +
          '<th>Date</th><th>Author</th><th>Company</th><th>File</th><th></th>' +
        '</tr></thead><tbody>' +
        shown.map(function (d) {
          return '<tr>' +
            '<td>' + esc(d.type) + '</td>' +
            '<td>' + (esc(d.title) || '—') + '</td>' +
            '<td>' + (esc(d.number) || '—') + '</td>' +
            '<td>' + (esc(d.revision) || '—') + '</td>' +
            '<td>' + fmtDate(d.date) + '</td>' +
            '<td>' + (esc(d.author) || '—') + '</td>' +
            '<td>' + (esc(d.company) || '—') + '</td>' +
            '<td>' + (esc(d.fileName) || '—') + '</td>' +
            '<td class="row">' +
              '<button type="button" class="btn" data-act="edit" data-id="' + esc(d.id) + '">Edit</button> ' +
              '<button type="button" class="btn" data-act="del" data-id="' + esc(d.id) + '">Delete</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    els.list.innerHTML = '<div class="card"><h2 class="section">Document register</h2>' + head + body + '</div>';
  }

  function renderAll() {
    if (!isOpen()) state.editing = null;
    renderForm();
    renderList();
  }

  /* ---------- actions ---------- */

  function collect(root) {
    var d = state.editing;
    Array.prototype.forEach.call(root.querySelectorAll('[data-f]'), function (el) {
      d[el.getAttribute('data-f')] = el.value.trim();
    });
    return d;
  }

  function save(root) {
    if (!isOpen()) return;
    var d = collect(root);
    if (!d.title && !d.number) {
      window.alert('Give the document a title or a document number.');
      return;
    }
    var docs = readDocs().slice();
    if (d.id) {
      docs = docs.map(function (x) { return x.id === d.id ? d : x; });
    } else {
      d.id = uid();
      docs.push(d);
    }
    state.editing = null;
    writeDocs(docs);
    renderAll();
  }

  function remove(id) {
    var d = readDocs().filter(function (x) { return x.id === id; })[0];
    var name = (d && (d.title || d.number)) || 'this document';
    if (!window.confirm('Delete "' + name + '" from the register?')) return;
    if (state.editing && state.editing.id === id) state.editing = null;
    writeDocs(readDocs().filter(function (x) { return x.id !== id; }));
    renderAll();
  }

  function onClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');

    if (act === 'add') {
      if (!isOpen()) return;
      state.editing = blank();
      renderForm();
      var first = els.form.querySelector('[data-f="title"]');
      if (first) first.focus();
    } else if (act === 'edit') {
      var src = readDocs().filter(function (x) { return x.id === btn.getAttribute('data-id'); })[0];
      if (!src) return;
      state.editing = Object.assign(blank(), src);
      renderForm();
    } else if (act === 'del') {
      remove(btn.getAttribute('data-id'));
    } else if (act === 'save') {
      save(els.form);
    } else if (act === 'cancel') {
      state.editing = null;
      renderForm();
    } else if (act === 'browse') {
      var picker = els.form.querySelector('[data-role="picker"]');
      if (picker) picker.click();
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t.getAttribute('data-role') === 'filter') {
      state.filter = t.value;
      renderList();
    } else if (t.getAttribute('data-role') === 'picker') {
      var f = t.files && t.files[0];
      var input = els.form.querySelector('[data-f="fileName"]');
      if (f && input) input.value = f.name;
      t.value = '';
    }
  }

  /* ---------- tab ---------- */

  SH.registerTab('project', 'document-control', {
    mount: function (host) {
      state.editing = null;
      state.filter = '';

      host.innerHTML = '<div data-role="form"></div><div data-role="list"></div>';
      els.host = host;
      els.form = host.querySelector('[data-role="form"]');
      els.list = host.querySelector('[data-role="list"]');

      host.addEventListener('click', onClick);
      host.addEventListener('change', onChange);

      onProjectChanged = function () { renderAll(); };
      SH.bus.on('project:changed', onProjectChanged);

      renderAll();
    },

    onShow: function () {
      renderAll();
    },

    unmount: function () {
      if (onProjectChanged) {
        SH.bus.off('project:changed', onProjectChanged);
        onProjectChanged = null;
      }
      if (els.host) {
        els.host.removeEventListener('click', onClick);
        els.host.removeEventListener('change', onChange);
      }
      els = {};
      state.editing = null;
    }
  });
})();