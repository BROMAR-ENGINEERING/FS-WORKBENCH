/* ==============================================================
   FS Workbench — Settings › Report Theme
   File:     pages/settings/tabs/report-theme/report-theme.js
   Rev:      0.7.1
   Updated:  2026-07-09
   Requires: core.js, settings.js, theme.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) runs ONCE and renders into host only.

   Editor for report themes: colour, typeface, point size and weight for
   every text role, plus the page header and footer bands (solid or
   two-colour gradient). Themes are named and revisioned.

   WHY THIS TAB DOES NOT CALL SH.theme.attach():
   attach() paints the ACTIVE theme and repaints on settings:changed.
   This editor must preview the DRAFT — unsaved edits, on a theme that may
   not be the active one. So it calls SH.theme.css(scope, draft) directly
   and re-injects on each edit. Same service, no duplicated CSS.

   NOTE ON COLOURS: hex values below are report *document* colours (theme
   data / defaults for a new theme), not app chrome. Every rule in the
   scoped stylesheet uses CSS variables from css/app.css.

   0.7.1 — removed "BroSafe" branding (product renamed FS Workbench at v0.12.0).
          Import alert now reads SH.APP_NAME; the data-folder hint no longer
          names the product; comments/logs say FS Workbench.
   0.7.0 — gradient bands gain a direction: left-to-right or top-to-bottom.
          New keys page.headerGradientDir / page.footerGradientDir ('lr' | 'tb'),
          back-filled to 'lr'. bandCss() is local again until SH.theme knows
          about direction — see the comment on it.
   0.6.1 — settings:changed is an echo of our own writes. load() now ignores
          the event while a save is in flight, and defers its repaint while
          focus is inside this tab (re-running on focusout / onShow), so a
          caret is never moved out from under the user. Themes are located
          by id, not by object identity — the array can be replaced beneath
          an in-flight save.
   0.6.0 — v0.6.x lifecycle: mount() runs once, onShow() re-reads the theme
          list, unmount() only on page teardown. Preview now themed via
          SH.theme.css() using the core .bs-* classes; local styleText()
          and bandCss() removed. Theme list access moved behind one adapter
          (see THEME_API) pending a core list/save/delete API.
   0.5.0 — Subtitle and Quote roles; gradient header/footer bands; taller
          preview.
   0.4.0 — replaced stub. Theme editor, live preview, named themes with
          nickname + revision, save / save-as-new / revert / delete,
          JSON export + import.
   ============================================================== */
SH.registerTab('settings', 'report-theme', {

  mount: function (host) {

    var self = this;
    this._host = host;

    /* --- 0. constants ---------------------------------------------- */

    /* Faces that ship with Windows and/or macOS. No webfonts — the app
       runs from file:// with no internet. */
    var FONTS = [
      { label: 'Arial',            css: 'Arial, Helvetica, sans-serif' },
      { label: 'Calibri',          css: 'Calibri, Candara, Segoe UI, sans-serif' },
      { label: 'Segoe UI',         css: '"Segoe UI", Frutiger, Helvetica, sans-serif' },
      { label: 'Helvetica',        css: 'Helvetica, Arial, sans-serif' },
      { label: 'Verdana',          css: 'Verdana, Geneva, sans-serif' },
      { label: 'Tahoma',           css: 'Tahoma, Geneva, sans-serif' },
      { label: 'Trebuchet MS',     css: '"Trebuchet MS", Tahoma, sans-serif' },
      { label: 'Times New Roman',  css: '"Times New Roman", Times, serif' },
      { label: 'Georgia',          css: 'Georgia, "Times New Roman", serif' },
      { label: 'Cambria',          css: 'Cambria, Georgia, serif' },
      { label: 'Garamond',         css: 'Garamond, "Palatino Linotype", serif' },
      { label: 'Palatino',         css: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
      { label: 'Courier New',      css: '"Courier New", Courier, monospace' },
      { label: 'Consolas',         css: 'Consolas, "Lucida Console", monospace' }
    ];

    var WEIGHTS = [
      { label: 'Regular',  v: 400 },
      { label: 'Medium',   v: 500 },
      { label: 'Semibold', v: 600 },
      { label: 'Bold',     v: 700 }
    ];

    /* Role key -> the class SH.theme.css() targets inside the preview. */
    var ROLES = [
      { key: 'title',      name: 'Report title'     },
      { key: 'subtitle',   name: 'Subtitle'         },
      { key: 'heading',    name: 'Heading'          },
      { key: 'subheading', name: 'Sub-heading'      },
      { key: 'body',       name: 'Standard text'    },
      { key: 'quote',      name: 'Quote'            },
      { key: 'header',     name: 'Page header text' },
      { key: 'footer',     name: 'Page footer text' }
    ];

    var BANDS = [
      { key: 'header', name: 'Page header' },
      { key: 'footer', name: 'Page footer' }
    ];

    /* Gradient directions. CSS angles, not free-form: a report has to render
       the same in the browser and in the PDF. */
    var DIRS = {
      lr: { label: 'Left to right', deg: '90deg'  },
      tb: { label: 'Top to bottom', deg: '180deg' }
    };
    var DIR_KEYS = ['lr', 'tb'];

    var PREVIEW_SCOPE = '.t-theme .page';

    /* Where theme files live inside the data folder. Only used by the
       settings-key fallback below; a real core API owns its own paths. */
    var THEME_DIR = 'themes/';

    /* --- 1. helpers ------------------------------------------------- */
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function today() { return new Date().toISOString().slice(0, 10); }
    function uid()   { return 'thm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function later(v) { return Promise.resolve(v); }   // async-tolerant adapter calls

    function normHex(v, fallback) {
      var s = String(v || '').trim();
      if (s.charAt(0) !== '#') s = '#' + s;
      if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
      return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : fallback;
    }

    var SANS  = 'Arial, Helvetica, sans-serif';
    var SERIF = 'Georgia, "Times New Roman", serif';

    /* Neutral shipped default. Prefer the core's copy if it has one —
       there should not be two ideas of what a default theme is. */
    function defaultTheme() {
      if (SH.theme && typeof SH.theme.defaultTheme === 'function') return SH.theme.defaultTheme();
      return {
        id: 'default', nickname: 'Default', rev: 1, updated: today(), builtin: true,
        page: {
          headerBg: '#F2F2F2', headerBg2: '#F2F2F2', headerGradient: false, headerGradientDir: 'lr',
          footerBg: '#F2F2F2', footerBg2: '#F2F2F2', footerGradient: false, footerGradientDir: 'lr'
        },
        text: {
          title:      { color: '#111111', font: SANS,  size: 26,   weight: 700 },
          subtitle:   { color: '#5A5A5A', font: SANS,  size: 14,   weight: 400 },
          heading:    { color: '#1A1A1A', font: SANS,  size: 15,   weight: 700 },
          subheading: { color: '#3C3C3C', font: SANS,  size: 12,   weight: 600 },
          body:       { color: '#222222', font: SERIF, size: 10.5, weight: 400 },
          quote:      { color: '#4A4A4A', font: SERIF, size: 10.5, weight: 400 },
          header:     { color: '#555555', font: SANS,  size: 8,    weight: 400 },
          footer:     { color: '#555555', font: SANS,  size: 8,    weight: 400 }
        }
      };
    }

    /* Back-fill keys added in later revs. Never overwrites a value.
       Core's normalize() runs first when it exists, then we top up the keys
       it may predate. */
    function normalize(t) {
      if (SH.theme && typeof SH.theme.normalize === 'function') t = SH.theme.normalize(t);
      var d = defaultTheme();
      t.page = t.page || {};
      BANDS.forEach(function (b) {
        var bg = b.key + 'Bg';
        if (!t.page[bg]) t.page[bg] = d.page[bg] || '#F2F2F2';
        if (!t.page[bg + '2']) t.page[bg + '2'] = t.page[bg];
        if (typeof t.page[b.key + 'Gradient'] !== 'boolean') t.page[b.key + 'Gradient'] = false;
        if (!DIRS[t.page[b.key + 'GradientDir']]) t.page[b.key + 'GradientDir'] = 'lr';
      });
      t.text = t.text || {};
      ROLES.forEach(function (r) { if (!t.text[r.key]) t.text[r.key] = clone(d.text[r.key]); });
      return t;
    }

    /* Local, deliberately.
       SH.theme.bandCss() predates page.<band>GradientDir, so delegating to it
       would render every gradient left-to-right whatever the user picked —
       silently, which is the worst kind of wrong. Once core understands the
       direction key, delete this and call SH.theme.bandCss(theme, key). */
    function bandCss(theme, key) {
      var p = theme.page;
      var a = p[key + 'Bg'], b = p[key + 'Bg2'];
      if (!p[key + 'Gradient']) return a;
      var dir = DIRS[p[key + 'GradientDir']] || DIRS.lr;
      return 'linear-gradient(' + dir.deg + ',' + a + ',' + b + ')';
    }

    /* --------------------------------------------------------------
       2. THEME_API — the one place that touches storage.

       Core has SH.theme for READING the active theme, but no documented
       list / save / delete. Information Sections got that shape on
       SH.settings, so this adapter tries, in order:
         1. SH.theme.list / save / remove / setActive
         2. SH.settings.listThemes / saveTheme / deleteTheme
         3. the rev 0.5.0 settings keys (themes.list, themes.activeId)
       All calls are treated as possibly async. Once core settles this,
       delete the branches that lost.
       -------------------------------------------------------------- */
    var THEME_API = (function () {
      var t = SH.theme, s = SH.settings;

      if (t && typeof t.list === 'function' && typeof t.save === 'function') {
        return {
          list:      function ()   { return later(t.list()); },
          save:      function (x)  { return later(t.save(x)); },
          remove:    function (id) { return later(t.remove(id)); },
          activeId:  function ()   { return typeof t.activeId === 'function'
                                            ? t.activeId() : (t.active() || {}).id; },
          setActive: function (id) { return later(t.setActive(id)); }
        };
      }

      if (s && typeof s.listThemes === 'function' && typeof s.saveTheme === 'function') {
        return {
          list:      function ()   { return later(s.listThemes()); },
          save:      function (x)  { return later(s.saveTheme(x)); },
          remove:    function (id) { return later(s.deleteTheme(id)); },
          activeId:  function ()   { return s.get('themes.activeId', null); },
          setActive: function (id) { return later(s.set('themes.activeId', id)); }
        };
      }

      /* Fallback: mirror the list inside settings.json, and write one file
         per theme if the data folder adapter happens to exist. */
      function read() {
        var list = s.get('themes.list', null);
        return Array.isArray(list) && list.length ? list : [defaultTheme()];
      }
      function writeFile(x) {
        if (!x || x.builtin) return;                       // never overwrite a shipped theme
        if (typeof s.writeJSON === 'function') {
          try { s.writeJSON(THEME_DIR + x.id + '.json', x); }
          catch (err) { console.warn('FS Workbench: theme not written to disk —', err); }
        }
      }
      return {
        list: function () { return later(read()); },
        save: function (x) {
          var list = read(), i = -1;
          list.forEach(function (o, n) { if (o.id === x.id) i = n; });
          if (i < 0) list.push(x); else list[i] = x;
          s.set('themes.list', list);
          writeFile(x);
          return later(x);
        },
        remove: function (id) {
          var list = read().filter(function (o) { return o.id !== id; });
          s.set('themes.list', list);
          if (typeof s.deleteFile === 'function') {
            try { s.deleteFile(THEME_DIR + id + '.json'); }
            catch (err) { console.warn('FS Workbench: theme file not removed —', err); }
          }
          return later(true);
        },
        activeId:  function ()   { return s.get('themes.activeId', null); },
        setActive: function (id) { return later(s.set('themes.activeId', id)); }
      };
    })();

    /* --- 3. scoped styles -------------------------------------------
       Layout only. Every report colour and typeface in the preview comes
       from SH.theme.css(); nothing below sets one.
       ----------------------------------------------------------------- */
    var layout = SH.el('style');
    layout.textContent =
      '.t-theme{display:grid;grid-template-columns:minmax(0,1fr) 480px;gap:18px;align-items:stretch}' +
      '@media(max-width:1240px){.t-theme{grid-template-columns:minmax(0,1fr) 400px}}' +
      '@media(max-width:1040px){.t-theme{grid-template-columns:1fr;align-items:start}}' +

      '.t-theme .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}' +
      '.t-theme .bar .field{margin:0}' +
      '.t-theme .grow{flex:1 1 200px;min-width:180px}' +

      '.t-theme .rev{font-size:11px;letter-spacing:.06em;text-transform:uppercase;' +
        'color:var(--muted);white-space:nowrap;padding-bottom:9px}' +
      '.t-theme .state{font-size:12px;font-weight:600;white-space:nowrap;padding-bottom:9px}' +
      '.t-theme .state.clean{color:var(--pass)}' +
      '.t-theme .state.dirty{color:var(--warn,var(--muted))}' +

      '.t-theme .subhead{font-size:11px;letter-spacing:.06em;text-transform:uppercase;' +
        'color:var(--muted);margin:22px 0 10px}' +
      '.t-theme .subhead:first-child{margin-top:0}' +

      '.t-theme .roles{display:grid;grid-template-columns:130px 108px minmax(0,1fr) 74px 104px;' +
        'gap:10px 12px;align-items:center}' +
      '.t-theme .roles .colhead{font-size:11px;letter-spacing:.05em;text-transform:uppercase;' +
        'color:var(--muted)}' +
      '.t-theme .rolename{font-size:13px;font-weight:600}' +
      '@media(max-width:820px){' +
        '.t-theme .roles{grid-template-columns:1fr 1fr}' +
        '.t-theme .roles .colhead{display:none}' +
        '.t-theme .rolename{grid-column:1/-1;margin-top:10px;padding-top:10px;' +
          'border-top:1px solid var(--line)}' +
        '.t-theme .swatch{grid-column:1/-1}' +
        '.t-theme .rolefont{grid-column:1/-1}}' +

      '.t-theme .swatch{display:flex;align-items:center;gap:6px}' +
      '.t-theme .swatch input[type=color]{width:34px;height:30px;padding:0;' +
        'border:1px solid var(--line);border-radius:5px;background:none;cursor:pointer;flex:0 0 auto}' +
      '.t-theme .swatch input[type=text]{width:100%;min-width:0;' +
        'font-family:ui-monospace,Consolas,monospace;font-size:12px;text-transform:uppercase}' +

      '.t-theme .bands{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}' +
      '@media(max-width:640px){.t-theme .bands{grid-template-columns:1fr}}' +
      '.t-theme .band-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
      '.t-theme .band-row .swatch{flex:1 1 130px;min-width:120px}' +
      '.t-theme .grad-lbl{display:inline-flex;align-items:center;gap:6px;font-size:12px;' +
        'color:var(--muted);cursor:pointer;user-select:none;white-space:nowrap}' +
      '.t-theme .grad-lbl input{margin:0;cursor:pointer}' +
      '.t-theme .grad-dir{flex:0 0 auto;max-width:150px}' +
      '.t-theme .band-row .swatch.hide,.t-theme .grad-dir.hide{display:none}' +
      '.t-theme .band-prev{height:18px;border-radius:3px;border:1px solid var(--line);' +
        'margin-top:8px;flex:1 1 100%}' +

      '.t-theme .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;' +
        'padding-top:16px;border-top:1px solid var(--line)}' +
      '.t-theme .acts .spacer{flex:1 1 auto}' +

      '.t-theme .previewcard{display:flex;flex-direction:column;min-height:0}' +
      '.t-theme .page{background:#fff;border:1px solid var(--line);border-radius:4px;' +
        'overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.18);' +
        'display:flex;flex-direction:column;flex:1 1 auto;min-height:420px}' +
      '.t-theme .page .bs-header-band,.t-theme .page .bs-footer-band{' +
        'display:flex;justify-content:space-between;gap:12px;padding:9px 14px;flex:0 0 auto}' +
      '.t-theme .pg-body{padding:20px 16px 24px;flex:1 1 auto;overflow:auto}' +
      '.t-theme .pg-body>*{margin:0 0 10px}' +
      '.t-theme .pg-body>*:last-child{margin-bottom:0}' +
      '.t-theme .notescale{font-size:11px;color:var(--muted);margin:10px 0 0;flex:0 0 auto}';
    host.appendChild(layout);

    /* Theme CSS lives in its own <style>, rewritten on every edit. */
    var themeStyle = SH.el('style');
    host.appendChild(themeStyle);

    var wrap = SH.el('div', { class: 't-theme' });
    host.appendChild(wrap);

    /* --- 4. state ---------------------------------------------------- */
    var THEMES  = [defaultTheme()];   // replaced by the first load()
    var activeId = THEMES[0].id;
    var draft    = clone(THEMES[0]);
    var flash;
    var blobUrls = [];                // exports awaiting revocation
    var saving   = false;             // a write is in flight — ignore its echo
    var pending  = false;             // a repaint was deferred; owed on focusout

    function findTheme(id) {
      for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
      return null;
    }
    function indexOfTheme(id) {
      for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return i;
      return -1;
    }
    function dirty() {
      var t = findTheme(activeId);
      return !t || !same(draft, t);
    }
    function focusInside() {
      return !!(self._host && self._host.contains(document.activeElement));
    }

    /* Put a stored theme into THEMES by id. Never by object identity: the
       array may have been replaced while the write was in flight. */
    function absorb(stored) {
      var s = normalize(stored);
      var i = indexOfTheme(s.id);
      if (i < 0) THEMES.push(s); else THEMES[i] = s;
      return s;
    }

    /* Pull the list from storage. Never clobbers unsaved edits, never moves
       the caret, and never fights a save that is still running. */
    function load() {
      if (saving) return Promise.resolve();
      return THEME_API.list().then(function (list) {
        if (saving) return;                       // a write started mid-flight
        if (!Array.isArray(list) || !list.length) list = [defaultTheme()];
        list.forEach(normalize);
        if (same(list, THEMES)) { pending = false; return; }

        var wasDirty = dirty();
        THEMES = list;

        var wanted = THEME_API.activeId();
        if (!findTheme(wanted)) wanted = (findTheme(activeId) || THEMES[0]).id;
        var switched = (wanted !== activeId);
        activeId = wanted;

        if (!wasDirty) draft = clone(findTheme(activeId));

        // A different theme is now active: nothing on screen is valid, redraw
        // regardless of focus. Otherwise defer rather than steal the caret.
        if (!switched && focusInside()) { pending = true; return; }
        repaintAll();
      })['catch'](function (err) {
        // No data folder chosen yet — stay usable with the shipped default.
        console.warn('FS Workbench: could not load themes —', err);
      });
    }

    /* Wrap any write so its own settings:changed echo is ignored. */
    function write(fn) {
      saving = true;
      return Promise.resolve()
        .then(fn)
        .then(function (v) { saving = false; return v; },
              function (e) { saving = false; throw e; });
    }

    /* --- 5. status --------------------------------------------------- */
    var stateEl = SH.el('span', { class: 'state clean' }, 'Saved');
    var revEl   = SH.el('span', { class: 'rev' }, '');

    function paintStatus() {
      var t = findTheme(activeId) || draft;
      revEl.textContent = 'Rev ' + (draft.rev || 1) + ' · ' + (draft.updated || '—');
      var d = dirty();
      stateEl.className = 'state ' + (d ? 'dirty' : 'clean');
      stateEl.textContent = d ? 'Unsaved changes' : 'Saved';
      saveBtn.disabled   = !d || !!t.builtin;
      revertBtn.disabled = !d;
      deleteBtn.disabled = !!t.builtin || THEMES.length < 2;
      builtinHint.style.display = t.builtin ? '' : 'none';
    }
    function flashSaved() {
      stateEl.className = 'state clean';
      stateEl.textContent = 'Saved';
      clearTimeout(flash);
      flash = setTimeout(paintStatus, 1200);
    }

    /* --- 6. theme picker + nickname ---------------------------------- */
    var picker = SH.el('select');
    function paintPicker() {
      picker.innerHTML = '';
      THEMES.forEach(function (t) {
        var o = SH.el('option', { value: t.id },
          t.nickname + ' — rev ' + t.rev + (t.builtin ? ' (shipped)' : ''));
        if (t.id === activeId) o.selected = true;
        picker.appendChild(o);
      });
    }

    picker.addEventListener('change', function () {
      if (dirty() && !confirm('Discard unsaved changes to "' + draft.nickname + '"?')) {
        paintPicker();
        return;
      }
      activeId = picker.value;
      draft = clone(findTheme(activeId));
      THEME_API.setActive(activeId);
      repaintAll();
    });

    var nickInput = SH.el('input', { type: 'text', maxlength: 60 });
    nickInput.addEventListener('input', function () {
      draft.nickname = nickInput.value;
      paintStatus();
    });

    var pickerBox = SH.el('div', { class: 'field grow' },
      SH.el('label', null, 'Active theme'), picker);
    var nickBox = SH.el('div', { class: 'field grow' },
      SH.el('label', null, 'Nickname'), nickInput);

    var builtinHint = SH.el('p', { class: 'hint', style: 'margin:12px 0 0' },
      'This is the shipped theme. Edit it freely, then use Save as new theme — ' +
      'the original stays available as a fallback.');

    /* --- 7. controls -------------------------------------------------- */
    var controls = [];   // anything with a .repaint()

    function colourControl(get, set) {
      var swatch = SH.el('input', { type: 'color' });
      var hex    = SH.el('input', { type: 'text', maxlength: 7, spellcheck: 'false' });

      function paint() { swatch.value = get(); hex.value = get(); }

      swatch.addEventListener('input',  function () { set(normHex(swatch.value, get())); hex.value = get(); onEdit(); });
      hex.addEventListener('change', function () { set(normHex(hex.value, get())); paint(); onEdit(); });

      var box = SH.el('div', { class: 'swatch' }, swatch, hex);
      box.repaint = paint;
      paint();
      return box;
    }

    function fontSelect(get, set) {
      var sel = SH.el('select', { class: 'rolefont' });
      FONTS.forEach(function (f) {
        var o = SH.el('option', { value: f.css }, f.label);
        o.style.fontFamily = f.css;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { set(sel.value); onEdit(); });
      sel.repaint = function () { sel.value = get(); };
      sel.repaint();
      return sel;
    }

    function sizeInput(get, set) {
      var inp = SH.el('input', { type: 'number', min: 6, max: 72, step: 0.5, title: 'Points' });
      inp.repaint = function () { inp.value = get(); };
      inp.addEventListener('change', function () {
        var n = parseFloat(inp.value);
        if (isNaN(n)) { inp.repaint(); return; }
        set(Math.min(72, Math.max(6, n)));
        inp.repaint(); onEdit();
      });
      inp.repaint();
      return inp;
    }

    function weightSelect(get, set) {
      var sel = SH.el('select');
      WEIGHTS.forEach(function (w) { sel.appendChild(SH.el('option', { value: String(w.v) }, w.label)); });
      sel.addEventListener('change', function () { set(parseInt(sel.value, 10)); onEdit(); });
      sel.repaint = function () { sel.value = String(get()); };
      sel.repaint();
      return sel;
    }

    /* --- 8. role rows -------------------------------------------------- */
    var roles = SH.el('div', { class: 'roles' });
    ['Element', 'Colour', 'Typeface', 'Size (pt)', 'Weight'].forEach(function (h) {
      roles.appendChild(SH.el('span', { class: 'colhead' }, h));
    });

    ROLES.forEach(function (r) {
      var spec = function () { return draft.text[r.key]; };

      var col = colourControl(function () { return spec().color; },  function (v) { spec().color = v; });
      var fnt = fontSelect  (function () { return spec().font; },   function (v) { spec().font = v; });
      var siz = sizeInput   (function () { return spec().size; },   function (v) { spec().size = v; });
      var wgt = weightSelect(function () { return spec().weight; }, function (v) { spec().weight = v; });

      controls.push(col, fnt, siz, wgt);

      roles.appendChild(SH.el('span', { class: 'rolename' }, r.name));
      roles.appendChild(col);
      roles.appendChild(fnt);
      roles.appendChild(siz);
      roles.appendChild(wgt);
    });

    /* --- 9. page bands --------------------------------------------------
       One solid colour, or a left-to-right two-colour gradient. The second
       swatch only appears when the gradient is on.
       -------------------------------------------------------------------- */
    function bandField(band) {
      var kBg = band.key + 'Bg', kBg2 = band.key + 'Bg2';
      var kGrad = band.key + 'Gradient', kDir = band.key + 'GradientDir';
      var strip = SH.el('div', { class: 'band-prev' });

      function paintStrip() { strip.style.background = bandCss(draft, band.key); }

      var c1 = colourControl(function () { return draft.page[kBg]; },
                             function (v) { draft.page[kBg] = v; paintStrip(); });
      var c2 = colourControl(function () { return draft.page[kBg2]; },
                             function (v) { draft.page[kBg2] = v; paintStrip(); });

      var cb = SH.el('input', { type: 'checkbox' });

      var dir = SH.el('select', { class: 'grad-dir', title: 'Gradient direction' });
      DIR_KEYS.forEach(function (k) { dir.appendChild(SH.el('option', { value: k }, DIRS[k].label)); });
      dir.addEventListener('change', function () {
        draft.page[kDir] = dir.value;
        paintStrip(); onEdit();
      });

      cb.addEventListener('change', function () {
        draft.page[kGrad] = cb.checked;
        // A gradient from one colour to itself looks like nothing happened,
        // so seed the second stop the first time it is switched on.
        if (cb.checked && draft.page[kBg2] === draft.page[kBg]) {
          draft.page[kBg2] = '#FFFFFF';
          c2.repaint();
        }
        paintGrad(); onEdit();
      });

      function paintGrad() {
        var on = cb.checked;
        c2.classList.toggle('hide', !on);
        dir.classList.toggle('hide', !on);
        paintStrip();
      }

      var row = SH.el('div', { class: 'band-row' },
        c1,
        SH.el('label', { class: 'grad-lbl', title: 'Fade to a second colour' },
          cb, 'Gradient'),
        c2,
        dir,
        strip
      );

      row.repaint = function () {
        cb.checked = !!draft.page[kGrad];
        dir.value = draft.page[kDir] || 'lr';
        c1.repaint(); c2.repaint(); paintGrad();
      };
      controls.push(row);
      row.repaint();

      return SH.el('div', { class: 'field' }, SH.el('label', null, band.name), row);
    }

    var bands = SH.el('div', { class: 'bands' }, bandField(BANDS[0]), bandField(BANDS[1]));

    /* --- 10. actions ----------------------------------------------------- */
    function failed(err) {
      console.warn('FS Workbench: theme save failed —', err);
      alert('The theme could not be saved.\n\n' + (err && err.message ? err.message : err) +
            '\n\nChoose a data folder in Settings → Data & Storage.');
    }

    var saveBtn = SH.el('button', { class: 'btn primary', onClick: function () {
      var t = findTheme(activeId);
      if (!t || t.builtin) return;
      var next = clone(draft);
      next.rev = (next.rev || 1) + 1;
      next.updated = today();

      write(function () { return THEME_API.save(next); }).then(function (stored) {
        // Trust the store's copy, not ours — it may have rewritten ids or paths.
        draft = clone(absorb(stored || next));
        repaintAll(); flashSaved();
      })['catch'](failed);
    } }, 'Save changes');

    var newBtn = SH.el('button', { class: 'btn', onClick: function () {
      var base = findTheme(activeId) || draft;
      var copy = clone(draft);
      copy.id = uid();
      copy.builtin = false;
      copy.rev = 1;
      copy.updated = today();
      if (copy.nickname === base.nickname) copy.nickname = base.nickname + ' (copy)';

      write(function () {
        return THEME_API.save(copy).then(function (stored) {
          var s = absorb(stored || copy);
          activeId = s.id;
          draft = clone(s);
          return THEME_API.setActive(activeId);
        });
      }).then(function () { repaintAll(); flashSaved(); })['catch'](failed);
    } }, 'Save as new theme');

    var revertBtn = SH.el('button', { class: 'btn', onClick: function () {
      if (!dirty()) return;
      draft = clone(findTheme(activeId));
      repaintAll();
    } }, 'Revert');

    var deleteBtn = SH.el('button', { class: 'btn danger', onClick: function () {
      var t = findTheme(activeId);
      if (!t || t.builtin || THEMES.length < 2) return;
      if (SH.settings.get('prefs.confirmBeforeDelete', true) &&
          !confirm('Delete the theme "' + t.nickname + '"? This cannot be undone.')) return;

      write(function () {
        return THEME_API.remove(t.id).then(function () {
          var i = indexOfTheme(t.id);
          if (i >= 0) THEMES.splice(i, 1);
          if (!THEMES.length) THEMES = [defaultTheme()];
          activeId = THEMES[0].id;
          draft = clone(THEMES[0]);
          return THEME_API.setActive(activeId);
        });
      }).then(repaintAll)['catch'](failed);
    } }, 'Delete');

    var exportBtn = SH.el('button', { class: 'btn', onClick: function () {
      var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      blobUrls.push(url);
      var a = SH.el('a', {
        href: url,
        download: draft.nickname.replace(/[^\w\-]+/g, '-').toLowerCase() + '-rev' + draft.rev + '.json'
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } }, 'Export JSON');

    var importInput = SH.el('input', { type: 'file', accept: '.json,application/json',
                                       style: 'display:none' });
    importInput.addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var t;
        try { t = JSON.parse(r.result); }
        catch (err) { alert('That file is not valid JSON.'); return; }
        if (!t || !t.text || !t.page || !t.text.body) {
          alert('That file is not an ' + SH.APP_NAME + ' report theme.');
          return;
        }
        t.id = uid();
        t.builtin = false;
        t.rev = t.rev || 1;
        t.updated = today();
        t.nickname = t.nickname || 'Imported theme';
        normalize(t);

        write(function () {
          return THEME_API.save(t).then(function (stored) {
            var s = absorb(stored || t);
            activeId = s.id;
            draft = clone(s);
            return THEME_API.setActive(activeId);
          });
        }).then(function () { repaintAll(); flashSaved(); })['catch'](failed);
      };
      r.readAsText(f);
    });

    var importBtn = SH.el('button', { class: 'btn', onClick: function () { importInput.click(); } },
      'Import JSON');

    var acts = SH.el('div', { class: 'acts' },
      saveBtn, newBtn, revertBtn,
      SH.el('span', { class: 'spacer' }),
      exportBtn, importBtn, deleteBtn, importInput
    );

    /* --- 11. live preview -------------------------------------------------
       Markup uses the classes SH.theme.css() targets, so what you see here
       is what the report renderer will emit. No colours are set locally.
       ---------------------------------------------------------------------- */
    var pvHeader = SH.el('div', { class: 'bs-header-band' },
      SH.el('span', null, 'Functional Safety Report'),
      SH.el('span', null, 'FS-2026-014'));

    var pvFooter = SH.el('div', { class: 'bs-footer-band' },
      SH.el('span', null, 'Uncontrolled when printed'),
      SH.el('span', null, 'Page 4 of 18'));

    var pvBody = SH.el('div', { class: 'pg-body' },
      SH.el('h1', { class: 'bs-title' }, 'Functional Safety Report'),
      SH.el('p',  { class: 'bs-subtitle' }, 'Cell 4 — robotic welding line · Revision C'),
      SH.el('h2', { class: 'bs-heading' }, '3. Risk assessment'),
      SH.el('h3', { class: 'bs-subheading' }, '3.2 Hazard identification'),
      SH.el('p', null,
        'Each hazard was assessed against severity, frequency of exposure and possibility of ' +
        'avoidance to establish a required performance level. Hazards carrying a required ' +
        'performance level of PL d or above are listed in the safety requirement specification.'),
      SH.el('blockquote', { class: 'bs-quote' },
        'The required performance level shall be determined for each safety function before the ' +
        'design of the safety-related part begins.'),
      SH.el('p', null,
        'Where the achieved performance level fell short of the requirement, the architecture was ' +
        'revised and the calculation repeated.')
    );

    function paintPreview() {
      themeStyle.textContent = SH.theme.css(PREVIEW_SCOPE, draft);
      // SH.theme.css() emits a left-to-right gradient for the bands regardless
      // of page.<band>GradientDir. Inline styles outrank it, so the preview
      // stays truthful. Remove these two lines once core honours direction —
      // they will then be setting the value core already set.
      pvHeader.style.background = bandCss(draft, 'header');
      pvFooter.style.background = bandCss(draft, 'footer');
    }

    /* --- 12. plumbing ------------------------------------------------------ */
    function onEdit() { paintPreview(); paintStatus(); }

    function repaintAll() {
      pending = false;
      paintPicker();
      nickInput.value = draft.nickname;
      controls.forEach(function (c) { if (c.repaint) c.repaint(); });
      paintPreview();
      paintStatus();
    }

    /* --- 13. assemble ------------------------------------------------------ */
    wrap.appendChild(SH.el('div', null,
      SH.el('div', { class: 'card' },
        SH.el('h2', { class: 'section' }, 'Report theme'),
        SH.el('p', { class: 'hint' },
          'Controls how generated reports look. Themes are saved to the data folder, ' +
          'not to a project, so every job can use any theme.'),
        SH.el('div', { class: 'bar' }, pickerBox, nickBox, revEl, stateEl),
        builtinHint
      ),
      SH.el('div', { class: 'card', style: 'margin-top:16px' },
        SH.el('div', { class: 'subhead' }, 'Text'),
        roles,
        SH.el('div', { class: 'subhead' }, 'Page bands'),
        bands,
        acts
      )
    ));

    wrap.appendChild(SH.el('div', { class: 'card previewcard' },
      SH.el('h2', { class: 'section' }, 'Preview'),
      SH.el('div', { class: 'page' }, pvHeader, pvBody, pvFooter),
      SH.el('p', { class: 'notescale' },
        'Type is shown at its true point size. The page is cropped, not scaled.')
    ));

    repaintAll();
    load();

    /* Another tab or window changing settings should not clobber a live edit;
       load() checks dirty() before replacing the draft. */
    /* settings:changed is mostly our own echo. load() ignores it while a write
       is in flight, and defers its repaint while the user is typing in here. */
    self._onSettings = function () { load(); };
    SH.bus.on('settings:changed', self._onSettings);

    /* A deferred repaint is owed the moment focus leaves this tab. */
    self._onBlur = function () { if (pending) repaintAll(); };
    host.addEventListener('focusout', self._onBlur);

    self._load = load;
    self._flush = function () { if (pending) repaintAll(); };

    /* Exports hold a blob: URL open until the download commits, so they are
       revoked at teardown rather than on a timer. */
    self._release = function () {
      clearTimeout(flash);
      blobUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      blobUrls.length = 0;
    };
  },

  /* --- 14. revealed again: settle any deferred repaint, then re-read -------- */
  onShow: function () {
    if (this._flush) this._flush();
    if (this._load)  this._load();
  },

  /* --- 15. teardown: page is being destroyed ------------------------------- */
  unmount: function () {
    if (this._onSettings) SH.bus.off('settings:changed', this._onSettings);
    if (this._host && this._onBlur) this._host.removeEventListener('focusout', this._onBlur);
    if (this._release) this._release();
    this._onSettings = null;
    this._onBlur = null;
    this._release = null;
    this._load = null;
    this._flush = null;
    this._host = null;
  }
});
