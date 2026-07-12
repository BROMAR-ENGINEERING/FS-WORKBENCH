/* ============================================================================
 * File:     pages/settings/tabs/information-sections/information-sections.js
 * Rev:      0.3.0
 * Updated:  2026-07-09
 * Requires: js/core.js, js/loader.js, js/settings.js, js/content.js, js/theme.js
 * Purpose:  Settings > Information Sections. Browse, create and edit reusable
 *           report boilerplate, grouped by category, built from sub-heading /
 *           text / table / image blocks.
 *
 * Changes:
 *   0.3.0  Core adoption. Calls the real SH.settings section adapter instead of
 *          stubs; renders the preview with SH.content.render/hydrateAssets and
 *          themes it with SH.theme.attach. Overrides and variants removed -
 *          editing a shipped section forks a new user section. New lifecycle:
 *          mount() runs once, onShow() refreshes, unmount() revokes blob URLs.
 *          Block type is 'heading' again (core-defined); the UI label stays
 *          "Sub-heading". Read-only when no data folder is open.
 *   0.2.0  Heading/sub-heading rename; local theme adapter (both superseded).
 *   0.1.1  Register against tab id 'information-sections'.
 *   0.1.0  Initial.
 *
 * Notes:
 *   - Section "Heading" is the `title` key. A "Sub-heading" block is
 *     `{type:'heading', level:3|4, text}` because that is what SH.content
 *     renders. Do not rename the type.
 *   - Preview markup comes from SH.content.render(). This file must not invent
 *     its own, or the editor and the printed report will drift apart.
 * ========================================================================== */

(function () {
  'use strict';

  var PAGE = 'settings';
  var TAB = 'information-sections';
  var SCHEMA = 'brosafe.section/1';

  /* ---------------------------------------------------------------- config */

  /* Ids come from SH.settings.SECTION_CATEGORIES. Labels are ours. */
  var CAT_LABELS = {
    'risk-assessment': 'Risk Assessment',
    'srs': 'SRS',
    'validation': 'Validation',
    'verification': 'Verification',
    'category-architecture': 'Category Architecture',
    'ccf': 'Common Cause Failures',
    'performance-level': 'Performance Level',
    'standard-extracts': 'Standard Extracts',
    'other': 'Other'
  };

  var FALLBACK_CATS = Object.keys(CAT_LABELS);

  var BLOCK_TYPES = [
    { type: 'heading', label: 'Sub-heading' },
    { type: 'text', label: 'Body text' },
    { type: 'table', label: 'Table' },
    { type: 'image', label: 'Image' }
  ];

  var BLOCK_LABEL = {
    heading: 'Sub-heading', text: 'Body text', table: 'Table', image: 'Image'
  };

  /* 0.2.0 briefly wrote 'subheading'. Read it, write 'heading'. */
  function blockType(b) {
    return b.type === 'subheading' ? 'heading' : b.type;
  }

  function categories() {
    var ids = (window.SH && SH.settings && SH.settings.SECTION_CATEGORIES) || FALLBACK_CATS;
    return ids.map(function (id) {
      return { id: id, label: CAT_LABELS[id] || id };
    });
  }

  function catLabel(id) { return CAT_LABELS[id] || id; }

  /* App chrome only. The preview inside .preview is styled by SH.theme. */
  var STYLE = [
    '<style id="sh-sections-style">',
    '.t-sections .sec-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px 0;',
    'padding:0 0 12px 0;border-bottom:1px solid var(--line)}',
    '.t-sections .sec-nav .pill{cursor:pointer;user-select:none;',
    'border:1px solid var(--line);background:transparent}',
    '.t-sections .sec-nav .pill[aria-current="true"]{border-color:var(--accent);',
    'color:var(--accent);font-weight:600}',
    '.t-sections .sec-nav .pill:focus-visible{outline:2px solid var(--accent);',
    'outline-offset:2px}',
    '.t-sections .sec-nav .pill .cnt{opacity:.6;margin-left:6px;',
    'font-variant-numeric:tabular-nums}',
    '.t-sections .sec-row{display:flex;align-items:center;gap:12px;padding:10px 0;',
    'border-bottom:1px solid var(--line)}',
    '.t-sections .sec-row:last-child{border-bottom:0}',
    '.t-sections .sec-row .grow{flex:1;min-width:0}',
    '.t-sections .sec-row .nick{font-weight:600}',
    '.t-sections .sec-row .sub{font-size:.85em;color:var(--muted);overflow:hidden;',
    'text-overflow:ellipsis;white-space:nowrap}',
    '.t-sections .sec-row .acts{display:flex;gap:6px;flex-shrink:0}',
    '.t-sections .blk{border:1px solid var(--line);border-radius:4px;padding:12px;',
    'margin:0 0 10px 0}',
    '.t-sections .blk-head{display:flex;align-items:center;gap:8px;margin:0 0 10px 0}',
    '.t-sections .blk-head .grow{flex:1}',
    '.t-sections .blk-kind{font-size:.8em;letter-spacing:.06em;text-transform:uppercase;',
    'color:var(--muted)}',
    '.t-sections .blk textarea{width:100%;min-height:120px;resize:vertical}',
    '.t-sections .blk input[type=text]{width:100%}',
    '.t-sections .tbl-edit{width:100%;border-collapse:collapse}',
    '.t-sections .tbl-edit td,.t-sections .tbl-edit th{padding:2px}',
    '.t-sections .tbl-edit input{width:100%}',
    '.t-sections .sec-empty{padding:28px 0;text-align:center;color:var(--muted)}',
    '.t-sections .preview{padding:24px;border:1px solid var(--line);border-radius:4px}',
    '.t-sections .preview img{max-width:100%;height:auto}',
    '</style>'
  ].join('');

  /* ------------------------------------------------------------ utilities */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() { return 'sec_' + Math.random().toString(36).slice(2, 9); }

  function today() { return new Date().toISOString().slice(0, 10); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function isNoFolder(err) {
    return !!err && /no data folder/i.test(String(err.message || err));
  }

  function blankSection(cat) {
    return {
      schema: SCHEMA,
      id: uid(),
      nickname: '',
      title: '',
      category: cat || FALLBACK_CATS[0],
      source: 'user',
      rev: 1,
      updated: today(),
      blocks: [newBlock('text')]
    };
  }

  function newBlock(type) {
    if (type === 'heading') return { type: 'heading', level: 3, text: '' };
    if (type === 'table') {
      return {
        type: 'table', caption: '',
        header: ['Column 1', 'Column 2'],
        rows: [['', ''], ['', '']]
      };
    }
    if (type === 'image') return { type: 'image', path: '', alt: '', caption: '' };
    return { type: 'text', text: '' };
  }

  function sectionSummary(s) {
    var n = (s.blocks || []).length;
    return catLabel(s.category) + ' \u00b7 ' + n + ' block' + (n === 1 ? '' : 's') +
      ' \u00b7 rev ' + (s.rev || 1) + ' \u00b7 ' + (s.updated || '');
  }

  /* Shipped sections are read-only seeds. The registry shape is not pinned in
     the API doc, so read it defensively and never let it throw. */
  function listShipped() {
    var c = window.SH && SH.content;
    if (!c) return [];
    var raw = null;
    try {
      if (typeof c.list === 'function') raw = c.list();
      else if (typeof c.all === 'function') raw = c.all();
      else if (c.registry) raw = c.registry;
    } catch (e) { return []; }
    if (!raw) return [];
    var arr = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });
    return arr.map(function (s) {
      return {
        schema: SCHEMA,
        id: s.id,
        nickname: s.nickname || s.title || s.id,
        title: s.title || s.id,
        category: s.category || 'other',
        source: 'shipped',
        rev: s.rev || 1,
        updated: s.updated || '',
        blocks: s.blocks || []
      };
    });
  }

  /* -------------------------------------------------------------- state */

  var state = {
    cat: FALLBACK_CATS[0],
    mode: 'list',      /* 'list' | 'edit' */
    draft: null,
    isNew: false,
    all: [],
    dirty: false,
    noFolder: false
  };

  var hostEl = null;
  var bodyEl = null;
  var detachTheme = null;
  var urls = [];        /* blob: URLs owned by this tab */
  var previewGen = 0;   /* guards against out-of-order hydrateAssets */
  var previewTimer = null;

  /* ------------------------------------------------------- preview render */

  function revokeUrls() {
    urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    urls = [];
  }

  function drawPreview() {
    if (!bodyEl) return;
    var el = bodyEl.querySelector('.preview');
    if (!el || !state.draft) return;

    var gen = ++previewGen;
    revokeUrls();

    try {
      el.innerHTML = SH.content.render(state.draft);
    } catch (e) {
      el.innerHTML = '<p class="hint">This section cannot be previewed yet.</p>';
      return;
    }

    Promise.resolve(SH.content.hydrateAssets(el)).then(function (got) {
      if (gen !== previewGen) {           /* a newer render already ran */
        (got || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
        return;
      }
      urls = (got || []).slice();
    }).catch(function () { /* missing asset: leave the img empty */ });
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(drawPreview, 200);
  }

  /* --------------------------------------------------------------- views */

  function navHtml() {
    var counts = {};
    state.all.forEach(function (s) { counts[s.category] = (counts[s.category] || 0) + 1; });
    var out = '<nav class="sec-nav" role="tablist" aria-label="Section categories">';
    categories().forEach(function (c) {
      var on = c.id === state.cat;
      out += '<button type="button" class="pill" role="tab" data-act="cat" data-cat="' +
        esc(c.id) + '" aria-current="' + (on ? 'true' : 'false') + '">' +
        esc(c.label) + '<span class="cnt">' + (counts[c.id] || 0) + '</span></button>';
    });
    return out + '</nav>';
  }

  function folderWarnHtml() {
    return '<p class="warnnote">No data folder is open, so sections cannot be saved. ' +
      'Choose one in Settings \u2192 Data &amp; Storage. Shipped sections are still ' +
      'readable below.</p>';
  }

  function listHtml() {
    var rows = state.all.filter(function (s) { return s.category === state.cat; });

    var out = navHtml();
    out += '<div class="card">';
    out += '<h2 class="section">' + esc(catLabel(state.cat)) + '</h2>';
    out += '<p class="hint">Reusable boilerplate inserted into reports.</p>';
    if (state.noFolder) out += folderWarnHtml();

    if (!rows.length) {
      out += '<div class="sec-empty">No sections in this category yet.</div>';
    } else {
      rows.forEach(function (s) {
        var shipped = s.source === 'shipped';
        out += '<div class="sec-row">' +
          '<div class="grow">' +
          '<div class="nick">' + esc(s.nickname || s.title || 'Untitled') +
          (shipped ? ' <span class="pill">Shipped</span>' : '') +
          '</div>' +
          '<div class="sub">' + esc(sectionSummary(s)) + '</div>' +
          '</div>' +
          '<div class="acts">' +
          (shipped
            ? '<button type="button" class="btn" data-act="fork" data-id="' + esc(s.id) +
              '"' + (state.noFolder ? ' disabled' : '') + '>Copy &amp; edit</button>'
            : '<button type="button" class="btn" data-act="edit" data-id="' + esc(s.id) + '">Edit</button>' +
              '<button type="button" class="btn" data-act="fork" data-id="' + esc(s.id) + '">Duplicate</button>' +
              '<button type="button" class="btn" data-act="del" data-id="' + esc(s.id) + '">Delete</button>') +
          '</div></div>';
      });
    }

    out += '<div style="margin-top:16px">' +
      '<button type="button" class="btn primary" data-act="new"' +
      (state.noFolder ? ' disabled' : '') + '>Add section</button>' +
      '</div>';
    out += '</div>';
    return out;
  }

  function catOptions(sel) {
    return categories().map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' +
        esc(c.label) + '</option>';
    }).join('');
  }

  function blockHtml(b, i, n) {
    var t = blockType(b);
    var out = '<div class="blk" data-i="' + i + '">';
    out += '<div class="blk-head">' +
      '<span class="blk-kind">' + esc(BLOCK_LABEL[t] || t) + '</span>' +
      '<span class="grow"></span>' +
      '<button type="button" class="btn" data-act="up" data-i="' + i + '"' +
      (i === 0 ? ' disabled' : '') + ' aria-label="Move up">Up</button>' +
      '<button type="button" class="btn" data-act="down" data-i="' + i + '"' +
      (i === n - 1 ? ' disabled' : '') + ' aria-label="Move down">Down</button>' +
      '<button type="button" class="btn" data-act="rmblk" data-i="' + i + '">Remove</button>' +
      '</div>';

    if (t === 'heading') {
      out += '<div class="grid2">' +
        '<label class="field"><span>Sub-heading text</span>' +
        '<input type="text" data-f="text" data-i="' + i + '" value="' + esc(b.text) + '"></label>' +
        '<label class="field"><span>Level</span><select data-f="level" data-i="' + i + '">' +
        [3, 4].map(function (l) {
          return '<option value="' + l + '"' + (Number(b.level) === l ? ' selected' : '') +
            '>H' + l + '</option>';
        }).join('') +
        '</select></label></div>';

    } else if (t === 'text') {
      out += '<label class="field"><span>Body text</span>' +
        '<textarea data-f="text" data-i="' + i + '">' + esc(b.text) + '</textarea></label>' +
        '<p class="hint">One blank line starts a new paragraph.</p>';

    } else if (t === 'table') {
      out += '<label class="field"><span>Caption</span>' +
        '<input type="text" data-f="caption" data-i="' + i + '" value="' + esc(b.caption) + '"></label>';
      out += '<table class="tbl-edit"><thead><tr>';
      b.header.forEach(function (h, c) {
        out += '<th><input type="text" data-f="th" data-i="' + i + '" data-c="' + c +
          '" value="' + esc(h) + '"></th>';
      });
      out += '<th style="width:1%"></th></tr></thead><tbody>';
      b.rows.forEach(function (row, r) {
        out += '<tr>';
        b.header.forEach(function (h, c) {
          out += '<td><input type="text" data-f="td" data-i="' + i + '" data-r="' + r +
            '" data-c="' + c + '" value="' + esc(row[c] || '') + '"></td>';
        });
        out += '<td><button type="button" class="btn" data-act="rmrow" data-i="' + i +
          '" data-r="' + r + '" aria-label="Remove row">&minus;</button></td></tr>';
      });
      out += '</tbody></table>';
      out += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button type="button" class="btn" data-act="addrow" data-i="' + i + '">Add row</button>' +
        '<button type="button" class="btn" data-act="addcol" data-i="' + i + '">Add column</button>' +
        '<button type="button" class="btn" data-act="rmcol" data-i="' + i + '"' +
        (b.header.length < 2 ? ' disabled' : '') + '>Remove last column</button>' +
        '</div>';

    } else if (t === 'image') {
      out += '<div class="grid2">' +
        '<label class="field"><span>Image file</span>' +
        '<input type="file" accept="image/*" data-act="pick" data-i="' + i + '"' +
        (state.noFolder ? ' disabled' : '') + '></label>' +
        '<label class="field"><span>Alt text</span>' +
        '<input type="text" data-f="alt" data-i="' + i + '" value="' + esc(b.alt) + '"></label>' +
        '</div>' +
        '<label class="field"><span>Caption</span>' +
        '<input type="text" data-f="caption" data-i="' + i + '" value="' + esc(b.caption) + '"></label>';
      out += b.path
        ? '<p class="hint">Stored as ' + esc(b.path) + '</p>'
        : '<p class="hint">No image chosen. Images are written into the section folder as ' +
          'soon as you choose them.</p>';
    }

    out += '</div>';
    return out;
  }

  function editorHtml() {
    var s = state.draft;
    var out = navHtml();
    out += '<div class="card">';
    out += '<h2 class="section">' + (state.isNew ? 'New section' : 'Edit section') + '</h2>';
    if (state.noFolder) out += folderWarnHtml();

    out += '<div class="grid2">' +
      '<label class="field"><span>Nickname</span>' +
      '<input type="text" data-f="nickname" value="' + esc(s.nickname) + '" ' +
      'placeholder="Short name shown in this list"></label>' +
      '<label class="field"><span>Category</span>' +
      '<select data-f="category">' + catOptions(s.category) + '</select></label>' +
      '</div>';
    out += '<label class="field"><span>Heading</span>' +
      '<input type="text" data-f="title" value="' + esc(s.title) + '" ' +
      'placeholder="Heading printed at the top of the section"></label>';

    out += '<h2 class="section">Blocks</h2>';
    if (!s.blocks.length) out += '<div class="sec-empty">No blocks yet.</div>';
    s.blocks.forEach(function (b, i) { out += blockHtml(b, i, s.blocks.length); });

    out += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">';
    BLOCK_TYPES.forEach(function (t) {
      out += '<button type="button" class="btn" data-act="addblk" data-type="' + t.type +
        '">Add ' + esc(t.label.toLowerCase()) + '</button>';
    });
    out += '</div>';

    out += '<div style="display:flex;gap:6px;margin-top:20px">' +
      '<button type="button" class="btn primary" data-act="save"' +
      (state.noFolder ? ' disabled' : '') + '>Save section</button>' +
      '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
      '</div>';
    out += '</div>';

    out += '<div class="card"><h2 class="section">Preview</h2>' +
      '<p class="hint">Shown with your active report theme.</p>' +
      '<div class="preview"></div></div>';
    return out;
  }

  /* --------------------------------------------------------------- render */

  function render() {
    if (!bodyEl) return;
    if (state.mode !== 'edit') revokeUrls();
    bodyEl.innerHTML = (state.mode === 'edit') ? editorHtml() : listHtml();
    if (state.mode === 'edit') drawPreview();
  }

  function refresh() {
    var user = [];
    state.noFolder = false;
    try {
      user = SH.settings.listSections() || [];
    } catch (e) {
      if (!isNoFolder(e)) throw e;
      state.noFolder = true;
    }
    state.all = listShipped().concat(user);
    render();
  }

  function find(id) {
    for (var i = 0; i < state.all.length; i++) if (state.all[i].id === id) return state.all[i];
    return null;
  }

  function openEditor(sec, isNew) {
    state.draft = sec;
    state.isNew = !!isNew;
    state.mode = 'edit';
    state.dirty = !!isNew;
    render();
  }

  function closeEditor() {
    state.mode = 'list';
    state.draft = null;
    state.isNew = false;
    state.dirty = false;
    revokeUrls();
  }

  /* --------------------------------------------------------------- events */

  function onClick(e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || !hostEl.contains(el) || el.disabled) return;
    var act = el.getAttribute('data-act');
    var i = Number(el.getAttribute('data-i'));
    var s = state.draft;

    if (act === 'cat') {
      if (state.mode === 'edit' && state.dirty &&
        !window.confirm('Discard unsaved changes to this section?')) return;
      state.cat = el.getAttribute('data-cat');
      closeEditor();
      render(); return;
    }

    if (act === 'new') { openEditor(blankSection(state.cat), true); return; }

    if (act === 'edit') {
      var src = find(el.getAttribute('data-id'));
      if (!src || src.source === 'shipped') return;
      openEditor(clone(src), false); return;
    }

    /* Duplicate a user section, or fork a shipped seed. Same operation: a new
       user section with a new id. Asset paths are dropped - they live in the
       source section's folder and are not ours to reference. */
    if (act === 'fork') {
      var orig = find(el.getAttribute('data-id'));
      if (!orig) return;
      var copy = clone(orig);
      copy.schema = SCHEMA;
      copy.id = uid();
      copy.source = 'user';
      copy.rev = 1;
      copy.nickname = (orig.nickname || orig.title || 'Section') + ' (copy)';
      copy.blocks.forEach(function (b) {
        if (blockType(b) === 'image') b.path = '';
      });
      openEditor(copy, true); return;
    }

    if (act === 'del') {
      var victim = find(el.getAttribute('data-id'));
      if (!victim) return;
      if (!window.confirm('Delete "' + (victim.nickname || victim.title) +
        '"? The whole section folder is removed. This cannot be undone.')) return;
      Promise.resolve(SH.settings.deleteSection(victim.id, victim.category))
        .then(refresh)
        .catch(function (err) { window.alert(err.message || 'The section could not be deleted.'); });
      return;
    }

    if (act === 'cancel') {
      if (state.dirty && !window.confirm('Discard unsaved changes to this section?')) return;
      closeEditor();
      render(); return;
    }

    if (act === 'save') { save(); return; }

    if (!s) return;   /* everything below edits the draft */

    if (act === 'addblk') { s.blocks.push(newBlock(el.getAttribute('data-type'))); }
    else if (act === 'rmblk') { s.blocks.splice(i, 1); }
    else if (act === 'up') { s.blocks.splice(i - 1, 0, s.blocks.splice(i, 1)[0]); }
    else if (act === 'down') { s.blocks.splice(i + 1, 0, s.blocks.splice(i, 1)[0]); }
    else if (act === 'addrow') { s.blocks[i].rows.push(s.blocks[i].header.map(function () { return ''; })); }
    else if (act === 'rmrow') { s.blocks[i].rows.splice(Number(el.getAttribute('data-r')), 1); }
    else if (act === 'addcol') {
      var b = s.blocks[i];
      b.header.push('Column ' + (b.header.length + 1));
      b.rows.forEach(function (r) { r.push(''); });
    } else if (act === 'rmcol') {
      var bb = s.blocks[i];
      if (bb.header.length < 2) return;
      bb.header.pop();
      bb.rows.forEach(function (r) { r.pop(); });
    } else { return; }

    state.dirty = true;
    render();
  }

  function save() {
    var s = state.draft;
    if (!s) return;

    if (!s.nickname.trim() && !s.title.trim()) {
      window.alert('Give the section a nickname or a heading before saving.');
      return;
    }
    if (!s.nickname.trim()) s.nickname = s.title.trim();

    s.schema = SCHEMA;
    s.source = 'user';
    s.updated = today();
    s.rev = state.isNew ? 1 : (Number(s.rev) || 1) + 1;
    s.blocks.forEach(function (b) { b.type = blockType(b); });

    Promise.resolve(SH.settings.saveSection(s)).then(function (stored) {
      /* saveSection may have moved the folder and rewritten blocks[].path */
      var cat = (stored && stored.category) || s.category;
      closeEditor();
      state.cat = cat;
      refresh();
    }).catch(function (err) {
      window.alert(err.message || 'The section could not be saved.');
      if (isNoFolder(err)) { state.noFolder = true; render(); }
    });
  }

  function onInput(e) {
    var el = e.target;
    var f = el.getAttribute && el.getAttribute('data-f');
    if (!f || !state.draft) return;
    var s = state.draft;
    var iAttr = el.getAttribute('data-i');

    if (iAttr === null) {
      s[f] = el.value;                    /* nickname | title | category */
      state.dirty = true;
      if (f === 'title') schedulePreview();
      return;
    }

    var b = s.blocks[Number(iAttr)];
    if (!b) return;

    if (f === 'th') b.header[Number(el.getAttribute('data-c'))] = el.value;
    else if (f === 'td') b.rows[Number(el.getAttribute('data-r'))][Number(el.getAttribute('data-c'))] = el.value;
    else if (f === 'level') b.level = Number(el.value);
    else b[f] = el.value;

    state.dirty = true;
    schedulePreview();
  }

  function onChange(e) {
    var el = e.target;
    if (!el.getAttribute || el.getAttribute('data-act') !== 'pick') return;
    var file = el.files && el.files[0];
    if (!file || !state.draft) return;

    var s = state.draft;
    var b = s.blocks[Number(el.getAttribute('data-i'))];

    Promise.resolve(SH.settings.saveSectionAsset(s.category, s.id, file)).then(function (path) {
      b.path = path;
      if (!b.alt) b.alt = file.name.replace(/\.[^.]+$/, '');
      state.dirty = true;
      render();
    }).catch(function (err) {
      window.alert(err.message || 'That image could not be saved.');
      if (isNoFolder(err)) { state.noFolder = true; render(); }
    });
  }

  /* ------------------------------------------------------------ lifecycle */

  SH.registerTab(PAGE, TAB, {

    /* Runs once. The shell persists; only .sec-body is redrawn. */
    mount: function (host) {
      hostEl = host;
      host.innerHTML = STYLE + '<div class="t-sections"><div class="sec-body">' +
        '<div class="card"><p class="hint">Loading sections\u2026</p></div></div></div>';
      bodyEl = host.querySelector('.sec-body');

      host.addEventListener('click', onClick);
      host.addEventListener('input', onInput);
      host.addEventListener('change', onChange);
      host.addEventListener('change', onInput);   /* select elements */

      detachTheme = SH.theme.attach(host, '.t-sections .preview');

      refresh();
    },

    /* Revealed again. Refresh the list, but never discard a live draft. */
    onShow: function () {
      if (state.mode === 'edit') return;
      refresh();
    },

    unmount: function () {
      clearTimeout(previewTimer);
      previewTimer = null;
      previewGen++;
      revokeUrls();
      if (detachTheme) { detachTheme(); detachTheme = null; }
      hostEl = null;
      bodyEl = null;
      state.draft = null;
      state.mode = 'list';
      state.isNew = false;
      state.dirty = false;
    }
  });
})();