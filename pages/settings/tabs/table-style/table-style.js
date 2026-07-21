/* ==============================================================
   FS Workbench — Settings › Table Style
   File:     pages/settings/tabs/table-style/table-style.js
   Rev:      0.2.1
   Updated:  2026-07-09
   Requires: core.js, settings.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) runs ONCE and renders into host only.

   Editor for named, revisioned TABLE STYLES. A table style is the look of
   a report table: header row, body text density, zebra shading, a first
   column treatment, and border/grid lines. Styles are a small user-managed
   set (add / remove), and the report generator picks one per document
   (SRS, Validation, Verification, …) via settings.reports[docId].tableStyleId.

   WHY THIS IS A SEPARATE LIST, NOT PART OF A THEME:
   documents reference a style by id. If styles lived inside a theme, the
   reference would break the moment the active theme changed. So table
   styles get their own list, addressed by id, exactly like themes get
   themes.list. Colour/type of the surrounding report still comes from the
   active report theme; a table style only governs the table.

   NOTE ON COLOURS: hex values below are report *document* colours (style
   data / defaults), not app chrome. Every rule in the scoped stylesheet
   uses CSS variables from css/app.css.

   0.2.1 — removed "BroSafe" branding (product renamed FS Workbench at v0.12.0).
          User-facing text now reads SH.APP_NAME; comments/logs say FS Workbench.
   0.2.0 — line weight added to the border group (border.width, px). Width
          greys out when Style is "No lines". Disabled groups now dim harder
          and show a "turn on to edit" cue so a gated section no longer reads
          as broken.
   0.1.1 — core confirmed it writes tableStyles.list directly and declined the
          list/save/delete adapter. Removed the dead adapter probe; STYLE_API is
          now just the settings-key path. writeJSON / deleteFile hooks kept —
          those are real data-folder capabilities core has yet to ship.
   0.1.0 — first cut. Named table styles with add / remove / save / revert /
          rename + revision, JSON export / import, live preview. Storage
          behind one STYLE_API adapter (see below) pending a core API.
   ============================================================== */
SH.registerTab('settings', 'table-style', {

  mount: function (host) {

    var self = this;
    this._host = host;

    /* --- 0. constants ---------------------------------------------- */

    var DENSITIES = [
      { key: 'compact', label: 'Compact', padV: 3, padH: 7  },
      { key: 'normal',  label: 'Normal',  padV: 5, padH: 9  },
      { key: 'roomy',   label: 'Roomy',   padV: 8, padH: 12 }
    ];
    function density(key) {
      for (var i = 0; i < DENSITIES.length; i++) if (DENSITIES[i].key === key) return DENSITIES[i];
      return DENSITIES[1];
    }

    var BORDERS = [
      { key: 'grid',       label: 'Full grid'        },
      { key: 'horizontal', label: 'Horizontal only'  },
      { key: 'none',       label: 'No lines'         }
    ];

    var WIDTHS = [
      { v: 0.5, label: 'Hairline (0.5px)' },
      { v: 1,   label: 'Thin (1px)'       },
      { v: 1.5, label: 'Medium (1.5px)'   },
      { v: 2,   label: 'Thick (2px)'      }
    ];

    var WEIGHTS = [
      { label: 'Regular',  v: 400 },
      { label: 'Medium',   v: 500 },
      { label: 'Semibold', v: 600 },
      { label: 'Bold',     v: 700 }
    ];

    var STYLE_DIR = 'table-styles/';   // used only by the settings-key fallback

    /* --- 1. helpers ------------------------------------------------- */
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function today() { return new Date().toISOString().slice(0, 10); }
    function uid()   { return 'tbl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function later(v) { return Promise.resolve(v); }

    function normHex(v, fallback) {
      var s = String(v || '').trim();
      if (s.charAt(0) !== '#') s = '#' + s;
      if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
      return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : fallback;
    }

    /* The shipped default table style — neutral, vendor-neutral. */
    function defaultStyle() {
      return {
        id: 'default',
        name: 'Default',
        rev: 1,
        updated: today(),
        builtin: true,
        header:   { bg: '#1A1A1A', color: '#FFFFFF', weight: 700 },
        body:     { color: '#222222', fontScale: 1.0, density: 'normal' },
        zebra:    { on: true,  color: '#F4F4F4' },
        firstCol: { on: false, bg: '#EDEDED', color: '#222222', weight: 600 },
        border:   { style: 'horizontal', width: 1, color: '#CFCFCF' }
      };
    }

    /* Back-fill any key added after a style was saved. Never overwrites. */
    function normalize(t) {
      var d = defaultStyle();
      ['header', 'body', 'zebra', 'firstCol', 'border'].forEach(function (grp) {
        t[grp] = t[grp] || {};
        for (var k in d[grp]) if (!(k in t[grp])) t[grp][k] = d[grp][k];
      });
      if (typeof t.rev !== 'number') t.rev = 1;
      if (!t.name) t.name = 'Untitled';
      return t;
    }

    /* --------------------------------------------------------------
       2. STYLE_API — the one place that touches storage.
       Core writes tableStyles.list directly and declined a list/save/delete
       adapter, so that is the whole implementation. The per-style file
       writes (writeJSON / deleteFile) are best-effort: they fire only if
       the data-folder file API is present, and are harmless until it is.
       -------------------------------------------------------------- */
    var STYLE_API = (function () {
      var s = SH.settings;

      function read() {
        var list = s.get('tableStyles.list', null);
        return Array.isArray(list) && list.length ? list : [defaultStyle()];
      }
      function writeFile(x) {
        if (!x || x.builtin) return;
        if (typeof s.writeJSON === 'function') {
          try { s.writeJSON(STYLE_DIR + x.id + '.json', x); }
          catch (err) { console.warn('FS Workbench: table style not written —', err); }
        }
      }
      return {
        list: function () { return later(read()); },
        save: function (x) {
          var list = read(), i = -1;
          list.forEach(function (o, n) { if (o.id === x.id) i = n; });
          if (i < 0) list.push(x); else list[i] = x;
          s.set('tableStyles.list', list);
          writeFile(x);
          return later(x);
        },
        remove: function (id) {
          var list = read().filter(function (o) { return o.id !== id; });
          s.set('tableStyles.list', list);
          if (typeof s.deleteFile === 'function') {
            try { s.deleteFile(STYLE_DIR + id + '.json'); }
            catch (err) { console.warn('FS Workbench: table style file not removed —', err); }
          }
          return later(true);
        }
      };
    })();

    /* --- 3. scoped styles (layout only) ------------------------------ */
    host.appendChild(SH.el('style', { html:
      '.t-tbl{display:grid;grid-template-columns:minmax(0,1fr) 480px;gap:18px;align-items:stretch}' +
      '@media(max-width:1240px){.t-tbl{grid-template-columns:minmax(0,1fr) 400px}}' +
      '@media(max-width:1040px){.t-tbl{grid-template-columns:1fr;align-items:start}}' +

      '.t-tbl .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}' +
      '.t-tbl .bar .field{margin:0}' +
      '.t-tbl .grow{flex:1 1 200px;min-width:180px}' +

      '.t-tbl .rev{font-size:11px;letter-spacing:.06em;text-transform:uppercase;' +
        'color:var(--muted);white-space:nowrap;padding-bottom:9px}' +
      '.t-tbl .state{font-size:12px;font-weight:600;white-space:nowrap;padding-bottom:9px}' +
      '.t-tbl .state.clean{color:var(--pass)}' +
      '.t-tbl .state.dirty{color:var(--warn,var(--muted))}' +

      '.t-tbl .subhead{font-size:11px;letter-spacing:.06em;text-transform:uppercase;' +
        'color:var(--muted);margin:22px 0 10px;display:flex;align-items:center;gap:8px}' +
      '.t-tbl .subhead:first-child{margin-top:0}' +
      '.t-tbl .subhead .toggle{margin-left:auto}' +

      '.t-tbl .row{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px 12px;' +
        'align-items:center;margin-bottom:10px}' +
      '.t-tbl .row>label{font-size:13px;font-weight:600}' +
      '@media(max-width:640px){.t-tbl .row{grid-template-columns:1fr}}' +

      '.t-tbl .swatch{display:flex;align-items:center;gap:6px}' +
      '.t-tbl .swatch input[type=color]{width:34px;height:30px;padding:0;' +
        'border:1px solid var(--line);border-radius:5px;background:none;cursor:pointer;flex:0 0 auto}' +
      '.t-tbl .swatch input[type=text]{width:120px;font-family:ui-monospace,Consolas,monospace;' +
        'font-size:12px;text-transform:uppercase}' +
      '.t-tbl .inline{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
      '.t-tbl .inline select,.t-tbl .inline input[type=number]{flex:0 0 auto}' +
      '.t-tbl .grp{position:relative}' +
      '.t-tbl .grp.off{opacity:.4}' +
      '.t-tbl .grp.off input,.t-tbl .grp.off select{pointer-events:none}' +
      '.t-tbl .grp.off .row{filter:grayscale(1)}' +
      '.t-tbl .grp .offcue{display:none;font-size:11px;font-style:italic;color:var(--muted);' +
        'margin:2px 0 0}' +
      '.t-tbl .grp.off .offcue{display:block}' +
      '.t-tbl .chk{display:inline-flex;align-items:center;gap:6px;font-size:12px;' +
        'color:var(--muted);cursor:pointer;user-select:none}' +
      '.t-tbl .chk input{margin:0;cursor:pointer}' +

      '.t-tbl .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;' +
        'padding-top:16px;border-top:1px solid var(--line)}' +
      '.t-tbl .acts .spacer{flex:1 1 auto}' +

      '.t-tbl .previewcard{display:flex;flex-direction:column;min-height:0}' +
      '.t-tbl .sheet{background:#fff;border:1px solid var(--line);border-radius:4px;' +
        'box-shadow:0 1px 6px rgba(0,0,0,.18);padding:20px 16px;flex:1 1 auto;overflow:auto;min-height:380px}' +
      '.t-tbl .sheet h4{margin:0 0 10px;font:600 12px/1.3 var(--sans,sans-serif);color:var(--muted);' +
        'letter-spacing:.04em;text-transform:uppercase}' +
      '.t-tbl table.pv{border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif}' +
      '.t-tbl .notescale{font-size:11px;color:var(--muted);margin:10px 0 0;flex:0 0 auto}'
    }));

    /* Preview table CSS is rewritten on every edit, in its own <style>. */
    var pvStyle = SH.el('style');
    host.appendChild(pvStyle);

    var wrap = SH.el('div', { class: 't-tbl' });
    host.appendChild(wrap);

    /* --- 4. state ---------------------------------------------------- */
    var STYLES  = [defaultStyle()];
    var activeId = STYLES[0].id;
    var draft    = clone(STYLES[0]);
    var flash;
    var blobUrls = [];
    var saving   = false;
    var pending  = false;

    function findStyle(id) {
      for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
      return null;
    }
    function indexOfStyle(id) {
      for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return i;
      return -1;
    }
    function dirty() {
      var t = findStyle(activeId);
      return !t || !same(draft, t);
    }
    function focusInside() {
      return !!(self._host && self._host.contains(document.activeElement));
    }
    function absorb(stored) {
      var s = normalize(stored);
      var i = indexOfStyle(s.id);
      if (i < 0) STYLES.push(s); else STYLES[i] = s;
      return s;
    }

    function load() {
      if (saving) return Promise.resolve();
      return STYLE_API.list().then(function (list) {
        if (saving) return;
        if (!Array.isArray(list) || !list.length) list = [defaultStyle()];
        list.forEach(normalize);
        if (same(list, STYLES)) { pending = false; return; }

        var wasDirty = dirty();
        STYLES = list;
        if (!findStyle(activeId)) activeId = STYLES[0].id;
        if (!wasDirty) draft = clone(findStyle(activeId));

        if (focusInside()) { pending = true; return; }
        repaintAll();
      })['catch'](function (err) {
        console.warn('FS Workbench: could not load table styles —', err);
      });
    }

    function write(fn) {
      saving = true;
      return Promise.resolve().then(fn).then(
        function (v) { saving = false; return v; },
        function (e) { saving = false; throw e; });
    }

    /* --- 5. status --------------------------------------------------- */
    var stateEl = SH.el('span', { class: 'state clean' }, 'Saved');
    var revEl   = SH.el('span', { class: 'rev' }, '');

    function paintStatus() {
      var t = findStyle(activeId) || draft;
      revEl.textContent = 'Rev ' + (draft.rev || 1) + ' · ' + (draft.updated || '—');
      var d = dirty();
      stateEl.className = 'state ' + (d ? 'dirty' : 'clean');
      stateEl.textContent = d ? 'Unsaved changes' : 'Saved';
      saveBtn.disabled   = !d || !!t.builtin;
      revertBtn.disabled = !d;
      deleteBtn.disabled = !!t.builtin || STYLES.length < 2;
      builtinHint.style.display = t.builtin ? '' : 'none';
    }
    function flashSaved() {
      stateEl.className = 'state clean';
      stateEl.textContent = 'Saved';
      clearTimeout(flash);
      flash = setTimeout(paintStatus, 1200);
    }

    /* --- 6. picker + name -------------------------------------------- */
    var picker = SH.el('select');
    function paintPicker() {
      picker.innerHTML = '';
      STYLES.forEach(function (t) {
        var o = SH.el('option', { value: t.id },
          t.name + ' — rev ' + t.rev + (t.builtin ? ' (shipped)' : ''));
        if (t.id === activeId) o.selected = true;
        picker.appendChild(o);
      });
    }
    picker.addEventListener('change', function () {
      if (dirty() && !confirm('Discard unsaved changes to "' + draft.name + '"?')) {
        paintPicker();
        return;
      }
      activeId = picker.value;
      draft = clone(findStyle(activeId));
      repaintAll();
    });

    var nameInput = SH.el('input', { type: 'text', maxlength: 60 });
    nameInput.addEventListener('input', function () {
      draft.name = nameInput.value;
      paintStatus();
    });

    var pickerBox = SH.el('div', { class: 'field grow' },
      SH.el('label', null, 'Table style'), picker);
    var nameBox = SH.el('div', { class: 'field grow' },
      SH.el('label', null, 'Name'), nameInput);

    var builtinHint = SH.el('p', { class: 'hint', style: 'margin:12px 0 0' },
      'This is the shipped style. Edit it freely, then use Save as new — ' +
      'the original stays available as a fallback.');

    /* --- 7. controls -------------------------------------------------- */
    var controls = [];

    function colourControl(get, set) {
      var swatch = SH.el('input', { type: 'color' });
      var hex    = SH.el('input', { type: 'text', maxlength: 7, spellcheck: 'false' });
      function paint() { swatch.value = get(); hex.value = get(); }
      swatch.addEventListener('input',  function () { set(normHex(swatch.value, get())); hex.value = get(); onEdit(); });
      hex.addEventListener('change', function () { set(normHex(hex.value, get())); paint(); onEdit(); });
      var box = SH.el('div', { class: 'swatch' }, swatch, hex);
      box.repaint = paint; paint();
      return box;
    }

    function selectControl(opts, get, set) {
      var sel = SH.el('select');
      opts.forEach(function (o) { sel.appendChild(SH.el('option', { value: String(o.v) }, o.label)); });
      sel.addEventListener('change', function () { set(sel.value); onEdit(); });
      sel.repaint = function () { sel.value = String(get()); };
      sel.repaint();
      return sel;
    }

    function weightSelect(get, set) {
      return selectControl(
        WEIGHTS.map(function (w) { return { v: w.v, label: w.label }; }),
        get, function (v) { set(parseInt(v, 10)); });
    }

    function numberControl(min, max, step, suffix, get, set) {
      var inp = SH.el('input', { type: 'number', min: min, max: max, step: step, style: 'width:80px' });
      inp.repaint = function () { inp.value = get(); };
      inp.addEventListener('change', function () {
        var n = parseFloat(inp.value);
        if (isNaN(n)) { inp.repaint(); return; }
        set(Math.min(max, Math.max(min, n)));
        inp.repaint(); onEdit();
      });
      inp.repaint();
      var box = SH.el('span', { class: 'inline' }, inp);
      if (suffix) box.appendChild(SH.el('span', { class: 'hint', style: 'margin:0' }, suffix));
      box.repaint = inp.repaint;
      return box;
    }

    /* a checkbox that also greys out the group it gates */
    function toggle(label, get, set, group) {
      var cb = SH.el('input', { type: 'checkbox' });
      cb.addEventListener('change', function () {
        set(cb.checked);
        if (group) group.classList.toggle('off', !cb.checked);
        onEdit();
      });
      var el = SH.el('label', { class: 'chk' }, cb, label);
      el.repaint = function () {
        cb.checked = !!get();
        if (group) group.classList.toggle('off', !cb.checked);
      };
      el.repaint();
      return el;
    }

    function row(labelText, control) {
      controls.push(control);
      return SH.el('div', { class: 'row' }, SH.el('label', null, labelText), control);
    }

    /* --- 8. Header group --------------------------------------------- */
    var headerGrp = SH.el('div', null,
      SH.el('div', { class: 'subhead' }, 'Header row'),
      row('Fill',   colourControl(function () { return draft.header.bg; },   function (v) { draft.header.bg = v; })),
      row('Text',   colourControl(function () { return draft.header.color; },function (v) { draft.header.color = v; })),
      row('Weight', weightSelect (function () { return draft.header.weight; },function (v) { draft.header.weight = v; }))
    );

    /* --- 9. Body group ----------------------------------------------- */
    var bodyGrp = SH.el('div', null,
      SH.el('div', { class: 'subhead' }, 'Body'),
      row('Text',    colourControl(function () { return draft.body.color; }, function (v) { draft.body.color = v; })),
      row('Density', selectControl(
        DENSITIES.map(function (d) { return { v: d.key, label: d.label }; }),
        function () { return draft.body.density; },
        function (v) { draft.body.density = v; })),
      row('Font size', numberControl(0.7, 1.4, 0.05, '× report body',
        function () { return draft.body.fontScale; },
        function (v) { draft.body.fontScale = v; }))
    );

    /* --- 10. Zebra group --------------------------------------------- */
    var zebraColour = colourControl(function () { return draft.zebra.color; },
                                    function (v) { draft.zebra.color = v; });
    var zebraGrp = SH.el('div', { class: 'grp' });
    var zebraToggle = toggle('Alternate row shading',
      function () { return draft.zebra.on; },
      function (v) { draft.zebra.on = v; }, zebraGrp);
    controls.push(zebraColour, zebraToggle);
    zebraGrp.appendChild(SH.el('div', { class: 'subhead' }, 'Zebra shading', zebraToggle));
    zebraGrp.appendChild(SH.el('div', { class: 'row' },
      SH.el('label', null, 'Shade'), zebraColour));
    zebraGrp.appendChild(SH.el('p', { class: 'offcue' }, 'Turn on “Alternate row shading” to edit.'));

    /* --- 11. First-column group -------------------------------------- */
    var fcBg     = colourControl(function () { return draft.firstCol.bg; },    function (v) { draft.firstCol.bg = v; });
    var fcColor  = colourControl(function () { return draft.firstCol.color; }, function (v) { draft.firstCol.color = v; });
    var fcWeight = weightSelect (function () { return draft.firstCol.weight; },function (v) { draft.firstCol.weight = v; });
    var fcGrp = SH.el('div', { class: 'grp' });
    var fcToggle = toggle('Style the first column',
      function () { return draft.firstCol.on; },
      function (v) { draft.firstCol.on = v; }, fcGrp);
    controls.push(fcBg, fcColor, fcWeight, fcToggle);
    fcGrp.appendChild(SH.el('div', { class: 'subhead' }, 'First column', fcToggle));
    fcGrp.appendChild(SH.el('div', { class: 'row' }, SH.el('label', null, 'Fill'),   fcBg));
    fcGrp.appendChild(SH.el('div', { class: 'row' }, SH.el('label', null, 'Text'),   fcColor));
    fcGrp.appendChild(SH.el('div', { class: 'row' }, SH.el('label', null, 'Weight'), fcWeight));
    fcGrp.appendChild(SH.el('p', { class: 'offcue' }, 'Turn on “Style the first column” to edit.'));

    /* --- 12. Borders group -------------------------------------------
       Width and colour only mean something when there are lines to draw,
       so they dim when Style is "No lines". */
    var borderDeps = SH.el('div', { class: 'grp' });

    var borderStyleSel = selectControl(
      BORDERS.map(function (b) { return { v: b.key, label: b.label }; }),
      function () { return draft.border.style; },
      function (v) { draft.border.style = v; paintBorderDeps(); });

    var borderWidthSel = selectControl(
      WIDTHS.map(function (w) { return { v: w.v, label: w.label }; }),
      function () { return draft.border.width; },
      function (v) { draft.border.width = parseFloat(v); });

    var borderColour = colourControl(
      function () { return draft.border.color; },
      function (v) { draft.border.color = v; });

    controls.push(borderStyleSel, borderWidthSel, borderColour);

    function paintBorderDeps() {
      borderDeps.classList.toggle('off', draft.border.style === 'none');
    }

    borderDeps.appendChild(SH.el('div', { class: 'row' }, SH.el('label', null, 'Weight'), borderWidthSel));
    borderDeps.appendChild(SH.el('div', { class: 'row' }, SH.el('label', null, 'Colour'), borderColour));
    borderDeps.appendChild(SH.el('p', { class: 'offcue' }, 'Choose a line style other than “No lines” to edit.'));

    var borderGrp = SH.el('div', null,
      SH.el('div', { class: 'subhead' }, 'Lines'),
      SH.el('div', { class: 'row' }, SH.el('label', null, 'Style'), borderStyleSel),
      borderDeps
    );
    paintBorderDeps();

    /* --- 13. actions ------------------------------------------------- */
    function failed(err) {
      console.warn('FS Workbench: table style save failed —', err);
      alert('The table style could not be saved.\n\n' + (err && err.message ? err.message : err) +
            '\n\nChoose a data folder in Settings → Data & Storage.');
    }

    var saveBtn = SH.el('button', { class: 'btn primary', onClick: function () {
      var t = findStyle(activeId);
      if (!t || t.builtin) return;
      var next = clone(draft);
      next.rev = (next.rev || 1) + 1;
      next.updated = today();
      write(function () { return STYLE_API.save(next); }).then(function (stored) {
        draft = clone(absorb(stored || next));
        repaintAll(); flashSaved();
      })['catch'](failed);
    } }, 'Save changes');

    var newBtn = SH.el('button', { class: 'btn', onClick: function () {
      var base = findStyle(activeId) || draft;
      var copy = clone(draft);
      copy.id = uid();
      copy.builtin = false;
      copy.rev = 1;
      copy.updated = today();
      if (copy.name === base.name) copy.name = base.name + ' (copy)';
      write(function () {
        return STYLE_API.save(copy).then(function (stored) {
          var s = absorb(stored || copy);
          activeId = s.id;
          draft = clone(s);
        });
      }).then(function () { repaintAll(); flashSaved(); })['catch'](failed);
    } }, 'Save as new');

    var revertBtn = SH.el('button', { class: 'btn', onClick: function () {
      if (!dirty()) return;
      draft = clone(findStyle(activeId));
      repaintAll();
    } }, 'Revert');

    var deleteBtn = SH.el('button', { class: 'btn danger', onClick: function () {
      var t = findStyle(activeId);
      if (!t || t.builtin || STYLES.length < 2) return;
      if (SH.settings.get('prefs.confirmBeforeDelete', true) &&
          !confirm('Delete the table style "' + t.name + '"? Any report set to use it ' +
                   'will fall back to the default. This cannot be undone.')) return;
      write(function () {
        return STYLE_API.remove(t.id).then(function () {
          var i = indexOfStyle(t.id);
          if (i >= 0) STYLES.splice(i, 1);
          if (!STYLES.length) STYLES = [defaultStyle()];
          activeId = STYLES[0].id;
          draft = clone(STYLES[0]);
        });
      }).then(repaintAll)['catch'](failed);
    } }, 'Delete');

    var exportBtn = SH.el('button', { class: 'btn', onClick: function () {
      var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      blobUrls.push(url);
      var a = SH.el('a', { href: url,
        download: draft.name.replace(/[^\w\-]+/g, '-').toLowerCase() + '-rev' + draft.rev + '.json' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } }, 'Export JSON');

    var importInput = SH.el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    importInput.addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var t;
        try { t = JSON.parse(r.result); }
        catch (err) { alert('That file is not valid JSON.'); return; }
        if (!t || !t.header || !t.body || !t.border) {
          alert('That file is not an ' + SH.APP_NAME + ' table style.');
          return;
        }
        t.id = uid(); t.builtin = false; t.rev = t.rev || 1; t.updated = today();
        t.name = t.name || 'Imported style';
        normalize(t);
        write(function () {
          return STYLE_API.save(t).then(function (stored) {
            var s = absorb(stored || t);
            activeId = s.id;
            draft = clone(s);
          });
        }).then(function () { repaintAll(); flashSaved(); })['catch'](failed);
      };
      r.readAsText(f);
    });
    var importBtn = SH.el('button', { class: 'btn', onClick: function () { importInput.click(); } }, 'Import JSON');

    var acts = SH.el('div', { class: 'acts' },
      saveBtn, newBtn, revertBtn,
      SH.el('span', { class: 'spacer' }),
      exportBtn, importBtn, deleteBtn, importInput);

    /* --- 14. live preview -------------------------------------------- */
    function pvCell(tag, text) { return SH.el(tag, null, text); }

    /* A sample that exercises every control: a header, a first column of
       labels, several body rows, numeric values. */
    var pvTable = SH.el('table', { class: 'pv' });
    (function buildPreview() {
      var head = SH.el('tr', null,
        pvCell('th', 'Subsystem'), pvCell('th', 'Category'),
        pvCell('th', 'PL'), pvCell('th', 'PFHd'));
      var thead = SH.el('thead', null, head);
      var rows = [
        ['Input — PSEN cs3.1',  '4', 'e', '2.62e-9'],
        ['Logic — PNOZ m B0',   '4', 'e', '1.00e-9'],
        ['Output — contactors', '3', 'd', '4.43e-9'],
        ['Feedback loop',       '3', 'd', '—']
      ];
      var tbody = SH.el('tbody');
      rows.forEach(function (r) {
        var tr = SH.el('tr');
        r.forEach(function (c, i) { tr.appendChild(pvCell(i === 0 ? 'th' : 'td', c)); });
        tbody.appendChild(tr);
      });
      pvTable.appendChild(thead);
      pvTable.appendChild(tbody);
    })();

    var SCOPE = '.t-tbl .sheet';

    /* Turn the draft into CSS scoped to the preview table. The report
       generator will produce equivalent CSS from the same fields. */
    function styleCss() {
      var d = density(draft.body.density);
      var pad = d.padV + 'px ' + d.padH + 'px';
      var fs = (10.5 * (draft.body.fontScale || 1)).toFixed(2) + 'pt';

      var line;
      var w = (draft.border.width || 1) + 'px';
      if (draft.border.style === 'grid')            line = w + ' solid ' + draft.border.color;
      else if (draft.border.style === 'horizontal') line = w + ' solid ' + draft.border.color;
      else                                          line = '0';

      var css = '';
      css += SCOPE + ' table.pv{font-size:' + fs + ';color:' + draft.body.color + '}';
      css += SCOPE + ' table.pv th,' + SCOPE + ' table.pv td{padding:' + pad + ';text-align:left}';

      // borders
      if (draft.border.style === 'grid') {
        css += SCOPE + ' table.pv th,' + SCOPE + ' table.pv td{border:' + line + '}';
      } else if (draft.border.style === 'horizontal') {
        css += SCOPE + ' table.pv tr{border-bottom:' + line + '}';
      }

      // header
      css += SCOPE + ' table.pv thead th{background:' + draft.header.bg + ';color:' + draft.header.color +
             ';font-weight:' + draft.header.weight + '}';

      // zebra (body rows only)
      if (draft.zebra.on) {
        css += SCOPE + ' table.pv tbody tr:nth-child(even){background:' + draft.zebra.color + '}';
      }

      // first column — applied to body rows; wins over zebra via specificity/order
      if (draft.firstCol.on) {
        css += SCOPE + ' table.pv tbody tr>*:first-child{background:' + draft.firstCol.bg +
               ';color:' + draft.firstCol.color + ';font-weight:' + draft.firstCol.weight + '}';
      }
      return css;
    }

    function paintPreview() { pvStyle.textContent = styleCss(); }

    /* --- 15. plumbing ------------------------------------------------ */
    function onEdit() { paintPreview(); paintStatus(); }

    function repaintAll() {
      pending = false;
      paintPicker();
      nameInput.value = draft.name;
      controls.forEach(function (c) { if (c.repaint) c.repaint(); });
      paintBorderDeps();
      paintPreview();
      paintStatus();
    }

    /* --- 16. assemble ------------------------------------------------ */
    wrap.appendChild(SH.el('div', null,
      SH.el('div', { class: 'card' },
        SH.el('h2', { class: 'section' }, 'Table style'),
        SH.el('p', { class: 'hint' },
          'The look of tables in generated reports. Add as many styles as you like; ' +
          'each report (SRS, Verification, Validation, …) chooses one when you generate it.'),
        SH.el('div', { class: 'bar' }, pickerBox, nameBox, revEl, stateEl),
        builtinHint
      ),
      SH.el('div', { class: 'card', style: 'margin-top:16px' },
        headerGrp, bodyGrp, zebraGrp, fcGrp, borderGrp, acts
      )
    ));

    wrap.appendChild(SH.el('div', { class: 'card previewcard' },
      SH.el('h2', { class: 'section' }, 'Preview'),
      SH.el('div', { class: 'sheet' },
        SH.el('h4', null, 'PFHd calculation — sample'),
        pvTable),
      SH.el('p', { class: 'notescale' },
        'A sample table at the chosen style. Real reports apply it to every table.')
    ));

    repaintAll();
    load();

    self._onSettings = function () { load(); };
    SH.bus.on('settings:changed', self._onSettings);
    self._onBlur = function () { if (pending) repaintAll(); };
    host.addEventListener('focusout', self._onBlur);
    self._load = load;
    self._flush = function () { if (pending) repaintAll(); };
    self._release = function () {
      clearTimeout(flash);
      blobUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      blobUrls.length = 0;
    };
  },

  onShow: function () {
    if (this._flush) this._flush();
    if (this._load)  this._load();
  },

  unmount: function () {
    if (this._onSettings) SH.bus.off('settings:changed', this._onSettings);
    if (this._host && this._onBlur) this._host.removeEventListener('focusout', this._onBlur);
    if (this._release) this._release();
    this._onSettings = null; this._onBlur = null; this._release = null;
    this._load = null; this._flush = null; this._host = null;
  }
});
