/* ==============================================================
   BroSafe — Settings › Report Layout
   File:     pages/settings/tabs/report-layout/report-layout.js
   Rev:      0.8.0
   Updated:  2026-07-09
   Requires: core.js, settings.js, theme.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only, ONCE.

   Governs where things sit on a report page: header/footer band
   heights, which band and which cell each element lands in, the
   table of contents, the LOTO procedure sheet, the document naming
   conventions, and the title-page arrangement.

   Layout is app config, not project data — it lives in SH.settings
   and applies to every report the user generates.

   NOT here, deliberately:
     · colours, faces and point sizes            -> Settings > Report Theme
     · energy-source tag colours (E-1, W-1, …)   -> Report Theme (theme.loto.*)
     · shutdown/restore step wording, zero-energy
       statement, and other boilerplate prose    -> SH.content / Information Sections

   0.8.0 — new LOTO pane: a posted-procedure placard built as an ordered,
           toggleable block stack (identification, notes, audit, photos,
           energy sources, statement, shutdown, restore) with portrait or
           landscape paper. Naming pane gained a second convention for LOTO
           procedure sheets. New `layout.loto.*` (additive).
   0.7.0 — control rows rebuilt as a 4-column grid. Checkbox width pinned.
           Title page renders at TRUE SCALE with the real company logo and
           theme-styled placeholder text.
   0.6.1 — a deferred settings:changed is remembered and replayed on focusout.
   0.6.0 — v0.6 lifecycle: mount() once, onShow() re-reads, SH.theme.attach().
   0.5.0 — four panes sharing one tab strip. `layout.std` -> `layout.sub`.
   0.4.0 — replaced stub with the layout editor + live page schematic.
   ============================================================== */
SH.registerTab('settings', 'report-layout', {

  mount: function (host) {

    /* --- 1. scoped CSS -----------------------------------------------
           Rows are a grid, not a flex line: label | place | align | extra.
           A row with two controls leaves the fourth column empty, so its
           edges still line up with a row that has three.

           Checkbox width is pinned. app.css sets `input{width:100%}`, which
           silently stretched every checkbox across its cell. */
    if (!document.getElementById('rl-css')) {
      var css = SH.el('style', { id: 'rl-css' });
      css.textContent = [
        '.rl-wrap{display:flex;gap:26px;align-items:flex-start}',
        '.rl-controls{flex:1 1 460px;min-width:420px}',
        '.rl-preview{flex:0 0 380px;position:sticky;top:16px}',
        '@media(max-width:1280px){.rl-wrap{flex-wrap:wrap}.rl-preview{position:static;flex:1 1 100%}}',

        '.rl-row{display:grid;grid-template-columns:minmax(0,1fr) 112px 100px 138px;',
        '  gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line,#e2e2e2)}',
        '.rl-row:last-child{border-bottom:0}',
        '.rl-row>.rl-lbl{grid-column:1;min-width:0;margin:0;font:inherit;font-weight:400;',
        '  text-transform:none;letter-spacing:normal;line-height:1.3;display:block}',
        '.rl-row select,.rl-row input[type=number],.rl-row input[type=text]{width:100%;min-width:0;',
        '  box-sizing:border-box;padding:5px 6px;font:inherit;border:1px solid var(--line,#c9c9c9);',
        '  background:var(--bg,#fff);color:inherit;border-radius:3px}',
        '.rl-row input[type=checkbox]{grid-column:2;justify-self:start;',
        '  width:16px;height:16px;min-width:0;margin:0;padding:0;flex:none}',
        '.rl-row input[type=text]{grid-column:2/-1}',
        '.rl-num{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:center}',
        '.rl-unit{color:var(--muted,#777);font-size:12px}',
        '.rl-off{opacity:.5}',

        /* ordered block list (LOTO) */
        '.rl-blk{display:grid;grid-template-columns:16px minmax(0,1fr) 32px 32px;gap:10px;',
        '  align-items:center;padding:8px 0;border-bottom:1px solid var(--line,#e2e2e2)}',
        '.rl-blk:last-of-type{border-bottom:0}',
        '.rl-blk input[type=checkbox]{width:16px;height:16px;margin:0;padding:0;min-width:0}',
        '.rl-blk-name{min-width:0;line-height:1.3}',
        '.rl-blk-name small{display:block;color:var(--muted,#888);font-size:11px}',
        '.rl-blk.rl-hid .rl-blk-name{opacity:.45}',
        '.rl-blk button{width:32px;height:27px;cursor:pointer;border-radius:3px;font:12px/1 inherit;',
        '  border:1px solid var(--line,#d2d2d2);background:transparent;color:var(--muted,#777)}',
        '.rl-blk button:disabled{opacity:.25;cursor:default}',
        '.rl-blk button:not(:disabled):hover{border-color:var(--accent,#F5C400);color:inherit}',

        '.rl-sub{font-size:11px;letter-spacing:.08em;text-transform:uppercase;',
        '  color:var(--muted,#777);margin:22px 0 2px}',
        '.rl-sub:first-child{margin-top:0}',
        '.rl-hint{font-size:12px;color:var(--muted,#777);margin:6px 0 0}',

        '.rl-pattern{width:100%;box-sizing:border-box;padding:7px 8px;',
        '  font:13px/1.4 ui-monospace,Consolas,monospace;border:1px solid var(--line,#c9c9c9);',
        '  background:var(--bg,#fff);color:inherit;border-radius:3px}',
        '.rl-tokens{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}',
        '.rl-tok{font:11px/1 ui-monospace,Consolas,monospace;padding:5px 6px;cursor:pointer;',
        '  border:1px solid var(--line,#d2d2d2);border-radius:3px;background:transparent;color:var(--muted,#666)}',
        '.rl-tok:hover{border-color:var(--accent,#F5C400);color:inherit}',
        '.rl-resolved{font:12px/1.5 ui-monospace,Consolas,monospace;color:var(--muted,#777);margin-top:9px}',
        '.rl-resolved b{color:inherit;font-weight:600}',

        /* preview frame */
        '.rl-frame{border:1px solid var(--line,#d2d2d2);box-shadow:0 2px 8px rgba(0,0,0,.12);',
        '  background:#fff;overflow:hidden;position:relative;margin:0 auto}',
        '.rl-pv{width:100%;height:100%;background:#fff;color:#3a3a3a;display:flex;flex-direction:column}',

        /* schematic pages (Sub pages, Contents) */
        '.rl-band{display:flex;flex:0 0 auto;overflow:hidden}',
        '.rl-body{flex:1 1 auto;display:flex;align-items:center;justify-content:center;',
        '  font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#c4c4c4;',
        '  background:repeating-linear-gradient(0deg,transparent 0 9px,#f5f5f5 9px 10px)}',
        '.rl-rule{flex:0 0 auto;background:currentColor;opacity:.55}',
        '.rl-cell{flex:1 1 33.33%;display:flex;flex-direction:column;justify-content:center;',
        '  gap:3px;padding:3px 5px;min-width:0}',
        '.rl-cell.c{align-items:center}.rl-cell.r{align-items:flex-end}.rl-cell.l{align-items:flex-start}',
        '.rl-chip{font:10px/1.3 system-ui,sans-serif;padding:2px 5px;border-radius:2px;max-width:100%;',
        '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
        '  background:transparent;color:inherit;border:1px solid currentColor;font-weight:500}',
        '.rl-chip.ghost{border-style:dashed;opacity:.65;font-weight:400}',
        '.rl-chip.hot{background:var(--accent,#F5C400);border-color:var(--accent,#F5C400);',
        '  color:#111;font-weight:700;outline:2px solid currentColor;outline-offset:2px}',
        '.rl-logo{border:1px solid currentColor;color:inherit;font:10px/1 system-ui,sans-serif;',
        '  font-weight:700;letter-spacing:.06em;display:flex;align-items:center;',
        '  justify-content:center;min-width:30px;border-radius:2px}',
        '.rl-band img,.rl-cell img{display:block;max-width:100%;object-fit:contain}',

        /* contents body mock */
        '.rl-toc{flex:1 1 auto;padding:16px 20px;display:flex;flex-direction:column;gap:5px;overflow:hidden}',
        '.rl-toc-h{font:600 13px/1.3 system-ui,sans-serif;color:#222;margin-bottom:8px}',
        '.rl-toc-e{display:flex;align-items:baseline;gap:5px;font:10px/1.4 system-ui,sans-serif;color:#888}',
        '.rl-toc-e .n{color:#555;min-width:26px}',
        '.rl-toc-e .t{white-space:nowrap}',
        '.rl-toc-e .ld{flex:1 1 auto;overflow:hidden;color:#c0c0c0;letter-spacing:2px;white-space:nowrap}',
        '.rl-toc-e .p{color:#555}',
        '.rl-toc-e.d2{padding-left:16px}.rl-toc-e.d3{padding-left:32px}',
        '.rl-toc-x{margin-top:10px;font:600 11px/1.3 system-ui,sans-serif;color:#666}',

        /* --- true-scale pages (Title page, LOTO). Drawn at real mm and
               scaled down, so a 26 pt heading and a 34 mm logo shrink by the
               same factor. Anything sized in px in here would be wrong. */
        '.rl-mm{transform-origin:top left}',
        '.rl-mm .rl-zone{flex:1 1 20%;display:flex;flex-direction:column;justify-content:center;',
        '  gap:4mm;padding:0 15mm;border-bottom:0.3mm dashed #e8e8e8;min-height:0}',
        '.rl-mm .rl-zone:last-of-type{border-bottom:0}',
        '.rl-mm .rl-zone>*{max-width:100%}',
        '.rl-mm .a-left{align-self:flex-start;text-align:left}',
        '.rl-mm .a-center{align-self:center;text-align:center}',
        '.rl-mm .a-right{align-self:flex-end;text-align:right}',
        '.rl-mm .rl-tp-logo{display:block;object-fit:contain}',
        '.rl-mm .rl-tp-logobox{border:0.4mm solid currentColor;display:flex;align-items:center;',
        '  justify-content:center;font:700 9pt/1 system-ui,sans-serif;letter-spacing:.1em;opacity:.55}',
        '.rl-mm table{width:100%;border-collapse:collapse}',
        '.rl-mm td,.rl-mm th{border:0.25mm solid currentColor;padding:1mm 1.5mm;',
        '  font:8pt/1.2 system-ui,sans-serif;text-align:left;vertical-align:top}',
        '.rl-mm th{font-weight:700}',
        '.rl-mm .rl-tp-imgs{display:flex;gap:5mm}',
        '.rl-mm .rl-tp-img{border:0.4mm dashed currentColor;opacity:.5;display:flex;',
        '  align-items:center;justify-content:center;font:9pt/1 system-ui,sans-serif}',
        '.rl-mm .rl-tp-pn{flex:0 0 auto;padding:6mm 15mm 10mm}',
        '.rl-mm p{margin:0 0 1mm}',

        /* --- the LOTO placard, also true scale */
        '.rl-lt{display:flex;flex-direction:column;gap:3mm;padding:8mm;overflow:hidden}',
        '.rl-lt-banner{flex:0 0 auto;display:flex;align-items:center;gap:6mm}',
        '.rl-lt-banner .rl-lt-ttl{flex:1 1 auto;min-width:0}',
        '.rl-lt-note{display:flex;gap:3mm;align-items:stretch}',
        '.rl-lt-pts{border:0.6mm solid currentColor;padding:1.5mm 3mm;text-align:center;',
        '  min-width:24mm;display:flex;flex-direction:column;justify-content:center;',
        '  font:700 7pt/1.1 system-ui,sans-serif}',
        '.rl-lt-pts b{display:block;font-size:18pt;line-height:1}',
        '.rl-lt-notebox{flex:1 1 auto;border:0.5mm dashed currentColor;padding:2mm;',
        '  font:8pt/1.35 system-ui,sans-serif}',
        '.rl-lt-audit{display:flex;gap:3mm}',
        '.rl-lt-audit>div{flex:1 1 0;border:0.4mm solid currentColor;opacity:.6;padding:1.5mm;',
        '  text-align:center;font:8pt/1.25 system-ui,sans-serif}',
        '.rl-lt-photos{display:flex;gap:2mm}',
        '.rl-lt-photo{flex:1 1 0;border:0.4mm dashed currentColor;opacity:.5;display:flex;',
        '  align-items:center;justify-content:center;font:9pt/1 system-ui,sans-serif}',
        '.rl-lt-tag{display:inline-block;border:0.5mm solid currentColor;padding:0.4mm 1.6mm;',
        '  font:700 8pt/1.15 system-ui,sans-serif;border-radius:0.6mm}',
        '.rl-lt-stmt{text-align:center;font:700 8pt/1.35 system-ui,sans-serif;',
        '  border:0.4mm solid currentColor;padding:1.5mm}',
        '.rl-lt-seq th.rl-lt-seqh{text-align:center;font-size:9pt}',
        '.rl-lt-seq td:first-child{width:6mm;text-align:center}',
        '.rl-lt-seq td:nth-child(2){width:28mm;font-weight:700;text-align:center}',
        '.rl-lt-foot{margin-top:auto;flex:0 0 auto;display:flex;align-items:center;',
        '  justify-content:space-between;gap:4mm;font:9pt/1 system-ui,sans-serif}',

        '.rl-cap{font-size:11px;color:var(--muted,#777);text-align:center;margin:9px 0 16px;line-height:1.5}',

        '.rl-tabs{display:flex;gap:5px;margin:0 0 18px;flex-wrap:wrap}',
        '.rl-tabs button{flex:1 1 auto;padding:7px 12px;font:13px/1 inherit;cursor:pointer;',
        '  border-radius:3px;border:1px solid var(--line,#d2d2d2);background:transparent;color:var(--muted,#777)}',
        '.rl-tabs button.on{border-color:var(--accent,#F5C400);color:inherit;font-weight:600}',

        '.rl-bar{display:flex;align-items:center;gap:12px;margin-bottom:14px}',
        '.rl-state{font-size:12px;color:var(--muted,#777)}',
        '.rl-state.dirty{color:var(--warn,var(--accent,#F5C400))}'
      ].join('');
      document.head.appendChild(css);
    }

    /* --- 2. defaults ------------------------------------------------ */
    function defaults() {
      return {
        sub: {
          headerEnabled: true,
          footerEnabled: true,
          headerHeight: 24,      /* mm */
          footerHeight: 16,      /* mm */
          headerRule: true,
          footerRule: true,
          ruleWeight: 0.75,      /* pt */
          docNamePattern: '{{project.number}}-{{doc.type}}-R{{doc.rev}}',
          elements: {
            logo:     { band: 'header', align: 'left',   size: 12 },
            company:  { band: 'header', align: 'right'  },
            title:    { band: 'header', align: 'center' },
            subtitle: { band: 'hidden', align: 'center' },
            docName:  { band: 'footer', align: 'left'   },
            revision: { band: 'footer', align: 'center' },
            pageNo:   { band: 'footer', align: 'right', style: 'page-n-of-m' }
          }
        },
        toc: {
          enabled: true,
          heading: 'Table of Contents',
          depth: 2,
          numberEntries: true,
          showPageNumbers: true,
          leader: 'dots',
          pageNumberStyle: 'roman',
          hyperlinks: true,
          listOfFigures: false,
          listOfTables: false
        },
        title: {
          showPageNumber: false,
          elements: {
            logo:       { zone: 'top',    align: 'center', size: 34 },
            title:      { zone: 'upper',  align: 'center' },
            subtitle:   { zone: 'upper',  align: 'center' },
            jobDetails: { zone: 'middle', align: 'left'   },
            date:       { zone: 'lower',  align: 'center' },
            revTable:   { zone: 'bottom', align: 'center' },
            images:     { zone: 'lower',  align: 'center', size: 55, enabled: false }
          }
        },
        /* One placard per isolation point. The block ORDER is the page order. */
        loto: {
          orientation: 'portrait',
          bannerTitle: 'Lockout Tagout Posted Procedure',
          bannerHeight: 20,               /* mm */
          namePattern: '{{area.id}}-LOTO-{{loto.asset}}',
          logo:   { show: true, align: 'left', size: 16 },
          footer: { show: true, height: 12, showLogo: true },
          blocks: [
            { id: 'identification', show: true },
            { id: 'notes',          show: true, showPointCount: true },
            { id: 'audit',          show: true, columns: 4 },
            { id: 'photos',         show: true, count: 3, height: 48 },
            { id: 'energy',         show: true, showTags: true },
            { id: 'statement',      show: true },
            { id: 'shutdown',       show: true, title: 'Shutdown Sequence' },
            { id: 'restore',        show: true, title: 'Restore to Service Sequence' }
          ]
        }
      };
    }

    /* Human names for the block ids, plus a one-line reminder of what each is. */
    var BLOCK_META = {
      identification: ['Identification block', 'Description, facility, location, created / revised'],
      notes:          ['Hazard notes', 'Stored-energy warnings, with the isolation-point count'],
      audit:          ['Audit due row', 'Next-audit-due boxes across the sheet'],
      photos:         ['Equipment photos', 'Annotated shots with callouts to each point'],
      energy:         ['Energy source table', 'Source, device, location, isolation method'],
      statement:      ['Zero-energy statement', 'Wording comes from Information Sections'],
      shutdown:       ['Shutdown sequence', 'Numbered steps; wording from Information Sections'],
      restore:        ['Restore to service sequence', 'Numbered steps; wording from Information Sections']
    };
    var BLOCK_ORDER_DEFAULT = ['identification', 'notes', 'audit', 'photos',
                               'energy', 'statement', 'shutdown', 'restore'];

    /* --- 3. helpers ------------------------------------------------- */
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

    function fill(dst, src) {
      for (var k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        var v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
          fill(dst[k], v);
        } else if (dst[k] === undefined) {
          dst[k] = v;
        }
      }
      return dst;
    }

    /* fill() treats an array as a scalar, so a stored `blocks` wins whole and a
       block added in a later rev would never reach an existing user. Keep the
       stored order, fill in missing per-block options, append anything new, drop
       ids we no longer know about. */
    function has(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return true;
      return false;
    }
    function normaliseBlocks(stored) {
      var def = defaults().loto.blocks;
      var byId = {}, out = [], i;
      for (i = 0; i < def.length; i++) byId[def[i].id] = def[i];

      if (Object.prototype.toString.call(stored) === '[object Array]') {
        for (i = 0; i < stored.length; i++) {
          var b = stored[i];
          if (!b || !byId[b.id] || has(out, b.id)) continue;
          out.push(fill(clone(b), byId[b.id]));
        }
      }
      for (i = 0; i < def.length; i++) {
        if (!has(out, def[i].id)) out.push(clone(def[i]));
      }
      return out;
    }

    /* 0.4.x stored these at layout.std. Move them across on first read. */
    function migrate(raw) {
      if (raw && raw.std && !raw.sub) { raw.sub = raw.std; delete raw.std; }
      return raw;
    }

    function read() {
      var out = fill(migrate(clone(SH.settings.get('layout', {}) || {})), defaults());
      out.loto.blocks = normaliseBlocks(out.loto.blocks);
      return out;
    }

    var L = read();
    var S, E, T, TE, C, O;      /* O = L.loto — rebound on every rebuild() */
    var pane = 'title';
    var flash;

    function blk(id) {
      for (var i = 0; i < O.blocks.length; i++) if (O.blocks[i].id === id) return O.blocks[i];
      return { id: id, show: false };
    }

    /* --- 4. the company logo -----------------------------------------
           Read through the data-folder handle: the folder can live outside
           the app root and fetch() is blocked on file://, so a relative
           <img src> would not resolve. fileUrl() hands back a fresh blob:
           URL each call, so ours is ours to revoke.

           Never assign '' or null to src — on file:// an empty src resolves
           to the document URL and the console fills with unique-origin
           warnings. No URL means no <img>, just the outline placeholder. */
    var logoSrc = null;
    var logoFile = SH.settings.get('company.logo.file', '');

    function releaseLogo() {
      if (logoSrc) { try { URL.revokeObjectURL(logoSrc); } catch (e) {} logoSrc = null; }
    }

    function loadLogo() {
      var p;
      try {
        if (typeof SH.settings.logoUrl === 'function') {
          p = Promise.resolve(SH.settings.logoUrl());
        } else if (logoFile && typeof SH.settings.fileUrl === 'function') {
          p = Promise.resolve(SH.settings.fileUrl(logoFile));
        } else {
          p = Promise.resolve(null);
        }
      } catch (err) {
        p = Promise.resolve(null);    /* no data folder open — placeholder it is */
      }
      return p.then(function (url) {
        releaseLogo();
        logoSrc = url || null;
        repaint();
      }, function () {
        releaseLogo();
        repaint();
      });
    }

    /* --- 5. persistence ---------------------------------------------- */
    function save() {
      SH.settings.set('layout', L);
      if (SH.settings && typeof SH.settings.writeJSON === 'function') {
        try { SH.settings.writeJSON('report-layout.json', L); }
        catch (err) { console.warn('BroSafe: layout not written to disk —', err); }
      }
      flashSaved();
      repaint();
    }

    var stateEl = SH.el('span', { class: 'rl-state' }, 'Saved');
    function flashSaved() {
      stateEl.className = 'rl-state dirty';
      stateEl.textContent = 'Saving…';
      clearTimeout(flash);
      flash = setTimeout(function () {
        stateEl.className = 'rl-state';
        stateEl.textContent = 'Saved';
      }, 700);
    }

    /* --- 6. option tables -------------------------------------------- */
    var BANDS  = [['header', 'Header'], ['footer', 'Footer'], ['hidden', 'Hidden']];
    var ALIGNS = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];
    var ZONES  = [['top', 'Top'], ['upper', 'Upper third'], ['middle', 'Middle'],
                  ['lower', 'Lower third'], ['bottom', 'Bottom'], ['hidden', 'Hidden']];
    var ORIENTATIONS = [['portrait', 'Portrait'], ['landscape', 'Landscape']];

    var PAGE_STYLES = [
      ['n',            'Number only'],
      ['page-n',       'Page + number'],
      ['n-of-m',       'Number of total'],
      ['page-n-of-m',  'Page + no. of total'],
      ['n/m',          'Number / total'],
      ['dash',         'Dashed number'],
      ['roman',        'Roman numeral']
    ];

    var TOC_PAGE_STYLES = [
      ['roman',  'Roman (i, ii)'],
      ['arabic', 'As sub pages'],
      ['none',   'Not numbered']
    ];

    var LEADERS = [['dots', 'Dots'], ['dashes', 'Dashes'], ['none', 'None']];
    var DEPTHS  = [[1, 'Top level'], [2, 'Two levels'], [3, 'Three levels']];

    var ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
    function pageSample(style, n, m) {
      switch (style) {
        case 'page-n':      return 'Page ' + n;
        case 'n-of-m':      return n + ' of ' + m;
        case 'page-n-of-m': return 'Page ' + n + ' of ' + m;
        case 'n/m':         return n + '/' + m;
        case 'dash':        return '\u2013 ' + n + ' \u2013';
        case 'roman':       return ROMAN[n] || String(n);
        default:            return String(n);
      }
    }

    /* Two token sets. A LOTO sheet is per isolation point, so it can name
       itself after the point and its area; a report cannot. */
    var TOKENS = [
      '{{project.number}}', '{{project.name}}', '{{project.client}}',
      '{{doc.type}}', '{{doc.rev}}', '{{date}}', '{{company.name}}'
    ];
    var LOTO_TOKENS = [
      '{{project.number}}', '{{area.id}}', '{{area.name}}',
      '{{loto.id}}', '{{loto.asset}}', '{{loto.description}}',
      '{{doc.rev}}', '{{date}}'
    ];

    var SAMPLE = {
      '{{project.number}}':    'P-2418',
      '{{project.name}}':      'Palletiser Cell',
      '{{project.client}}':    'Northline',
      '{{doc.type}}':          'SRS',
      '{{doc.rev}}':           '02',
      '{{date}}':              new Date().toISOString().slice(0, 10),
      '{{company.name}}':      'Company',
      '{{area.id}}':           'A02',
      '{{area.name}}':         'Chiller Room',
      '{{loto.id}}':           'LP-13',
      '{{loto.asset}}':        'CWP-13',
      '{{loto.description}}':  'Chilled Water Pump 13'
    };
    function refreshSample() {
      SAMPLE['{{company.name}}'] = SH.settings.get('company.name', 'Company');
    }
    refreshSample();

    function resolve(pattern) {
      return String(pattern || '').replace(/\{\{[a-z.]+\}\}/gi, function (t) {
        return SAMPLE[t] !== undefined ? SAMPLE[t] : t;
      });
    }

    /* --- 7. control builders ------------------------------------------
           Every control fills its grid cell, so column edges line up. */
    function select(pairs, value, onChange) {
      var s = SH.el('select');
      pairs.forEach(function (p) {
        var o = SH.el('option', { value: String(p[0]) }, p[1]);
        if (String(p[0]) === String(value)) o.selected = true;
        s.appendChild(o);
      });
      s.addEventListener('change', function () { onChange(s.value); });
      return s;
    }

    function number(value, min, max, step, unit, onChange) {
      var i = SH.el('input', { type: 'number', min: min, max: max, step: step });
      i.value = value;
      i.addEventListener('change', function () {
        var v = parseFloat(i.value);
        if (isNaN(v)) v = min;
        v = Math.min(max, Math.max(min, v));
        i.value = v;
        onChange(v);
      });
      var box = SH.el('span', { class: 'rl-num' }, i, SH.el('span', { class: 'rl-unit' }, unit));
      box.input = i;
      return box;
    }

    function checkbox(value, onChange) {
      var c = SH.el('input', { type: 'checkbox' });
      c.checked = !!value;
      c.addEventListener('change', function () { onChange(c.checked); });
      return c;
    }

    function text(value, onChange) {
      var i = SH.el('input', { type: 'text', spellcheck: 'false' });
      i.value = value || '';
      i.addEventListener('change', function () { onChange(i.value.trim()); });
      return i;
    }

    function row(labelText) {
      var r = SH.el('div', { class: 'rl-row' },
        SH.el('label', { class: 'rl-lbl' }, labelText));
      for (var i = 1; i < arguments.length; i++) r.appendChild(arguments[i]);
      return r;
    }

    function placement(labelText, obj, kind, sizeOpts) {
      var key = (kind === 'zone') ? 'zone' : 'band';
      var pairs = (kind === 'zone') ? ZONES : BANDS;
      var sizeBox = null;

      function paintOff() {
        var off = obj[key] === 'hidden';
        r.classList.toggle('rl-off', off);
        alignSel.disabled = off;
        if (sizeBox) sizeBox.input.disabled = off;
      }

      var placeSel = select(pairs, obj[key], function (v) { obj[key] = v; paintOff(); save(); });
      var alignSel = select(ALIGNS, obj.align, function (v) { obj.align = v; save(); });

      var r = row(labelText, placeSel, alignSel);
      if (sizeOpts) {
        sizeBox = number(obj.size, sizeOpts[0], sizeOpts[1], 1, 'mm',
          function (v) { obj.size = v; save(); });
        r.appendChild(sizeBox);
      }
      paintOff();
      return r;
    }

    /* A token-insertion field. Used by both naming conventions. */
    function patternField(initial, tokens, onCommit) {
      var wrap = SH.el('div');
      var input = SH.el('input', { type: 'text', class: 'rl-pattern', spellcheck: 'false' });
      input.value = initial || '';
      var out = SH.el('div', { class: 'rl-resolved' });

      function paint() {
        out.innerHTML = '';
        out.appendChild(document.createTextNode('Example  '));
        out.appendChild(SH.el('b', null, resolve(input.value) || '\u2014'));
      }
      input.addEventListener('input', paint);
      input.addEventListener('change', function () { onCommit(input.value.trim()); });

      var bar = SH.el('div', { class: 'rl-tokens' });
      tokens.forEach(function (t) {
        var b = SH.el('button', { type: 'button', class: 'rl-tok' }, t);
        b.addEventListener('click', function () {
          var start = input.selectionStart, end = input.selectionEnd, v = input.value;
          input.value = v.slice(0, start) + t + v.slice(end);
          input.focus();
          input.selectionStart = input.selectionEnd = start + t.length;
          paint();
          onCommit(input.value.trim());
        });
        bar.appendChild(b);
      });

      wrap.appendChild(input);
      wrap.appendChild(bar);
      wrap.appendChild(out);
      paint();
      return wrap;
    }

    /* --- 8. pane: sub pages ------------------------------------------- */
    var warn = null;

    function subCard() {
      var card = SH.el('div', { class: 'card' });
      card.appendChild(SH.el('h3', null, 'Sub pages'));
      card.appendChild(SH.el('p', { class: 'rl-hint' },
        'Every page except the title page, the table of contents and LOTO placards.'));

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'Bands'));

      var hHeight = number(S.headerHeight, 10, 60, 1, 'mm', function (v) { S.headerHeight = v; save(); });
      var hRule   = checkbox(S.headerRule, function (v) { S.headerRule = v; paintBands(); save(); });
      var fHeight = number(S.footerHeight, 8, 50, 1, 'mm', function (v) { S.footerHeight = v; save(); });
      var fRule   = checkbox(S.footerRule, function (v) { S.footerRule = v; paintBands(); save(); });
      var wRule   = number(S.ruleWeight, 0.25, 3, 0.25, 'pt', function (v) { S.ruleWeight = v; save(); });

      var rHH = row('Header height', hHeight);
      var rHR = row('Dividing line below header', hRule);
      var rFH = row('Footer height', fHeight);
      var rFR = row('Dividing line above footer', fRule);
      var rWR = row('Line weight', wRule);

      function paintBands() {
        var h = !!S.headerEnabled, f = !!S.footerEnabled;
        rHH.classList.toggle('rl-off', !h); hHeight.input.disabled = !h;
        rHR.classList.toggle('rl-off', !h); hRule.disabled = !h;
        rFH.classList.toggle('rl-off', !f); fHeight.input.disabled = !f;
        rFR.classList.toggle('rl-off', !f); fRule.disabled = !f;
        var anyRule = (h && S.headerRule) || (f && S.footerRule);
        rWR.classList.toggle('rl-off', !anyRule); wRule.input.disabled = !anyRule;
      }

      card.appendChild(row('Header', checkbox(S.headerEnabled, function (v) {
        S.headerEnabled = v; paintBands(); save();
      })));
      card.appendChild(rHH);
      card.appendChild(rHR);
      card.appendChild(row('Footer', checkbox(S.footerEnabled, function (v) {
        S.footerEnabled = v; paintBands(); save();
      })));
      card.appendChild(rFH);
      card.appendChild(rFR);
      card.appendChild(rWR);

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'Placement'));
      card.appendChild(placement('Logo',            E.logo,     'band', [6, 40]));
      card.appendChild(placement('Company details', E.company,  'band'));
      card.appendChild(placement('Title',           E.title,    'band'));
      card.appendChild(placement('Sub-title',       E.subtitle, 'band'));
      card.appendChild(placement('Document name',   E.docName,  'band'));
      card.appendChild(placement('Revision number', E.revision, 'band'));

      var pnRow = placement('Page number', E.pageNo, 'band');
      pnRow.appendChild(select(PAGE_STYLES, E.pageNo.style, function (v) { E.pageNo.style = v; save(); }));
      card.appendChild(pnRow);

      warn = SH.el('div', { class: 'warnnote', style: 'margin-top:14px' });
      card.appendChild(warn);

      paintBands();
      return card;
    }

    /* --- 9. pane: table of contents ------------------------------------ */
    function tocCard() {
      var card = SH.el('div', { class: 'card' });
      card.appendChild(SH.el('h3', null, 'Table of Contents'));
      card.appendChild(SH.el('p', { class: 'rl-hint' },
        'Sits between the title page and the first sub page. It carries the sub-page header and footer.'));

      var rows = [];
      function dim() {
        var on = !!C.enabled;
        rows.forEach(function (r) {
          r.classList.toggle('rl-off', !on);
          Array.prototype.forEach.call(r.querySelectorAll('input,select'), function (i) { i.disabled = !on; });
        });
        if (on) {
          leaderRow.classList.toggle('rl-off', !C.showPageNumbers);
          leaderSel.disabled = !C.showPageNumbers;
        }
      }

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'Contents'));
      card.appendChild(row('Include a table of contents',
        checkbox(C.enabled, function (v) { C.enabled = v; dim(); save(); })));

      var rHead = row('Heading', text(C.heading, function (v) {
        C.heading = v || 'Table of Contents'; save();
      }));
      var rDepth = row('Levels shown', select(DEPTHS, C.depth, function (v) {
        C.depth = parseInt(v, 10); save();
      }));
      var rNum = row('Number the entries', checkbox(C.numberEntries, function (v) {
        C.numberEntries = v; save();
      }));
      var rPages = row('Show page numbers', checkbox(C.showPageNumbers, function (v) {
        C.showPageNumbers = v; dim(); save();
      }));
      var leaderSel = select(LEADERS, C.leader, function (v) { C.leader = v; save(); });
      var leaderRow = row('Leader between entry and page', leaderSel);

      [rHead, rDepth, rNum, rPages, leaderRow].forEach(function (r) { card.appendChild(r); rows.push(r); });

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'The contents page itself'));
      var rSelf = row('Page numbering', select(TOC_PAGE_STYLES, C.pageNumberStyle, function (v) {
        C.pageNumberStyle = v; save();
      }));
      var rLink = row('Link entries to their sections',
        checkbox(C.hyperlinks, function (v) { C.hyperlinks = v; save(); }));
      [rSelf, rLink].forEach(function (r) { card.appendChild(r); rows.push(r); });
      card.appendChild(SH.el('p', { class: 'rl-hint' },
        'Links only do anything in an exported PDF. Printed pages ignore them.'));

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'Additional lists'));
      var rFigs = row('Include a list of figures',
        checkbox(C.listOfFigures, function (v) { C.listOfFigures = v; save(); }));
      var rTabs = row('Include a list of tables',
        checkbox(C.listOfTables, function (v) { C.listOfTables = v; save(); }));
      [rFigs, rTabs].forEach(function (r) { card.appendChild(r); rows.push(r); });

      dim();
      return card;
    }

    /* --- 10. pane: LOTO procedure ---------------------------------------
           One placard per isolation point. The block list IS the page order,
           so moving a row moves it on the sheet. */
    function lotoCard() {
      var wrapCard = SH.el('div');

      /* -- paper and banner -- */
      var page = SH.el('div', { class: 'card' });
      page.appendChild(SH.el('h3', null, 'LOTO procedure'));
      page.appendChild(SH.el('p', { class: 'rl-hint' },
        'A posted procedure placard, one per isolation point. It does not use the sub-page header or footer.'));

      page.appendChild(SH.el('div', { class: 'rl-sub' }, 'Paper'));
      page.appendChild(row('Orientation', select(ORIENTATIONS, O.orientation, function (v) {
        O.orientation = v; save();
      })));

      page.appendChild(SH.el('div', { class: 'rl-sub' }, 'Banner'));
      page.appendChild(row('Banner title', text(O.bannerTitle, function (v) {
        O.bannerTitle = v || 'Lockout Tagout Posted Procedure'; save();
      })));
      page.appendChild(row('Banner height',
        number(O.bannerHeight, 10, 45, 1, 'mm', function (v) { O.bannerHeight = v; save(); })));

      var logoAlign = select(ALIGNS, O.logo.align, function (v) { O.logo.align = v; save(); });
      var logoSize  = number(O.logo.size, 8, 40, 1, 'mm', function (v) { O.logo.size = v; save(); });
      var rLogo = row('Logo', logoAlign, logoSize);
      function paintLogoRow() {
        rLogo.classList.toggle('rl-off', !O.logo.show);
        logoAlign.disabled = !O.logo.show;
        logoSize.input.disabled = !O.logo.show;
      }
      page.appendChild(row('Show the logo', checkbox(O.logo.show, function (v) {
        O.logo.show = v; paintLogoRow(); save();
      })));
      page.appendChild(rLogo);
      paintLogoRow();

      page.appendChild(SH.el('div', { class: 'rl-sub' }, 'Footer'));
      var footH = number(O.footer.height, 6, 30, 1, 'mm', function (v) { O.footer.height = v; save(); });
      var footL = checkbox(O.footer.showLogo, function (v) { O.footer.showLogo = v; save(); });
      var rFootH = row('Footer height', footH);
      var rFootL = row('Repeat the logo in the footer', footL);
      function paintFooter() {
        var on = !!O.footer.show;
        rFootH.classList.toggle('rl-off', !on); footH.input.disabled = !on;
        rFootL.classList.toggle('rl-off', !on); footL.disabled = !on;
      }
      page.appendChild(row('Show a footer', checkbox(O.footer.show, function (v) {
        O.footer.show = v; paintFooter(); save();
      })));
      page.appendChild(rFootH);
      page.appendChild(rFootL);
      paintFooter();

      wrapCard.appendChild(page);

      /* -- block stack -- */
      var stack = SH.el('div', { class: 'card' });
      stack.appendChild(SH.el('h3', null, 'Blocks'));
      stack.appendChild(SH.el('p', { class: 'rl-hint' },
        'Top to bottom, this is the order they print in. Untick to leave one off the sheet.'));

      function move(i, delta) {
        var j = i + delta;
        if (j < 0 || j >= O.blocks.length) return;
        var tmp = O.blocks[i];
        O.blocks[i] = O.blocks[j];
        O.blocks[j] = tmp;
        SH.settings.set('layout', L);
        flashSaved();
        rebuild();                       /* the list order changed — redraw it */
      }

      O.blocks.forEach(function (b, i) {
        var meta = BLOCK_META[b.id] || [b.id, ''];
        var r = SH.el('div', { class: 'rl-blk' + (b.show ? '' : ' rl-hid') });

        r.appendChild(checkbox(b.show, function (v) {
          b.show = v;
          r.classList.toggle('rl-hid', !v);
          paintOpts();
          save();
        }));

        var name = SH.el('div', { class: 'rl-blk-name' }, meta[0]);
        if (meta[1]) name.appendChild(SH.el('small', null, meta[1]));
        r.appendChild(name);

        var up = SH.el('button', { type: 'button', title: 'Move up' }, '\u2191');
        var dn = SH.el('button', { type: 'button', title: 'Move down' }, '\u2193');
        up.disabled = (i === 0);
        dn.disabled = (i === O.blocks.length - 1);
        up.addEventListener('click', function () { move(i, -1); });
        dn.addEventListener('click', function () { move(i, 1); });
        r.appendChild(up);
        r.appendChild(dn);

        stack.appendChild(r);
      });

      var resetOrder = SH.el('button', { type: 'button', class: 'btn ghost', style: 'margin-top:14px' },
        'Restore block order');
      resetOrder.addEventListener('click', function () {
        var byId = {}, i;
        for (i = 0; i < O.blocks.length; i++) byId[O.blocks[i].id] = O.blocks[i];
        O.blocks = BLOCK_ORDER_DEFAULT.map(function (id) { return byId[id]; });
        SH.settings.set('layout', L);
        flashSaved();
        rebuild();
      });
      stack.appendChild(resetOrder);
      wrapCard.appendChild(stack);

      /* -- per-block options -- */
      var opts = SH.el('div', { class: 'card' });
      opts.appendChild(SH.el('h3', null, 'Block options'));

      var bNotes = blk('notes'), bAudit = blk('audit'),
          bPhoto = blk('photos'), bEnergy = blk('energy'),
          bShut = blk('shutdown'), bRest = blk('restore');

      var rPts = row('Show the isolation-point count',
        checkbox(bNotes.showPointCount, function (v) { bNotes.showPointCount = v; save(); }));
      var rCols = row('Audit boxes across the sheet',
        number(bAudit.columns, 2, 6, 1, '', function (v) { bAudit.columns = v; save(); }));
      var rCount = row('Photos across the sheet',
        number(bPhoto.count, 1, 4, 1, '', function (v) { bPhoto.count = v; save(); }));
      var rPhotoH = row('Photo strip height',
        number(bPhoto.height, 20, 90, 1, 'mm', function (v) { bPhoto.height = v; save(); }));
      var rTags = row('Show energy-source tags',
        checkbox(bEnergy.showTags, function (v) { bEnergy.showTags = v; save(); }));
      var rShutT = row('Shutdown heading', text(bShut.title, function (v) {
        bShut.title = v || 'Shutdown Sequence'; save();
      }));
      var rRestT = row('Restore heading', text(bRest.title, function (v) {
        bRest.title = v || 'Restore to Service Sequence'; save();
      }));

      var OPT_ROWS = [[rPts, 'notes'], [rCols, 'audit'], [rCount, 'photos'],
                      [rPhotoH, 'photos'], [rTags, 'energy'],
                      [rShutT, 'shutdown'], [rRestT, 'restore']];

      function paintOpts() {
        OPT_ROWS.forEach(function (pair) {
          var on = !!blk(pair[1]).show;
          pair[0].classList.toggle('rl-off', !on);
          Array.prototype.forEach.call(pair[0].querySelectorAll('input,select'), function (i) {
            i.disabled = !on;
          });
        });
      }

      opts.appendChild(SH.el('div', { class: 'rl-sub' }, 'Hazard notes'));
      opts.appendChild(rPts);
      opts.appendChild(SH.el('div', { class: 'rl-sub' }, 'Audit row'));
      opts.appendChild(rCols);
      opts.appendChild(SH.el('div', { class: 'rl-sub' }, 'Photos'));
      opts.appendChild(rCount);
      opts.appendChild(rPhotoH);
      opts.appendChild(SH.el('div', { class: 'rl-sub' }, 'Energy sources'));
      opts.appendChild(rTags);
      opts.appendChild(SH.el('p', { class: 'rl-hint' },
        'Tag colours by energy type (electrical, water, pneumatic \u2026) are a theme concern. ' +
        'They belong in Settings \u203a Report Theme, not here.'));
      opts.appendChild(SH.el('div', { class: 'rl-sub' }, 'Sequences'));
      opts.appendChild(rShutT);
      opts.appendChild(rRestT);
      opts.appendChild(SH.el('p', { class: 'rl-hint' },
        'The step wording and the zero-energy statement are report boilerplate. ' +
        'Edit them in Settings \u203a Information Sections.'));

      paintOpts();
      wrapCard.appendChild(opts);
      return wrapCard;
    }

    /* --- 11. pane: naming conventions ------------------------------------ */
    function namingCard() {
      var wrapCard = SH.el('div');

      var docCard = SH.el('div', { class: 'card' });
      docCard.appendChild(SH.el('h3', null, 'Document naming convention'));
      docCard.appendChild(SH.el('p', { class: 'rl-hint' },
        'Builds the document name printed wherever you placed it on a sub page.'));
      docCard.appendChild(patternField(S.docNamePattern, TOKENS, function (v) {
        S.docNamePattern = v; save();
      }));
      if (E.docName.band === 'hidden') {
        docCard.appendChild(SH.el('div', { class: 'warnnote', style: 'margin-top:14px' },
          'The document name is currently hidden. Give it a band on the Sub pages tab to print it.'));
      }
      wrapCard.appendChild(docCard);

      var lotoName = SH.el('div', { class: 'card' });
      lotoName.appendChild(SH.el('h3', null, 'LOTO procedure naming convention'));
      lotoName.appendChild(SH.el('p', { class: 'rl-hint' },
        'One placard per isolation point, so it can name itself after the point and its area. ' +
        'Used for the sheet identifier and the exported file name.'));
      lotoName.appendChild(patternField(O.namePattern, LOTO_TOKENS, function (v) {
        O.namePattern = v; save();
      }));
      wrapCard.appendChild(lotoName);

      return wrapCard;
    }

    /* --- 12. pane: title page -------------------------------------------- */
    function titleCard() {
      var card = SH.el('div', { class: 'card' });
      card.appendChild(SH.el('h3', null, 'Title page'));
      card.appendChild(SH.el('p', { class: 'rl-hint' },
        'No running header or footer. Elements sit in one of five bands down the page.'));

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'Placement'));
      card.appendChild(placement('Logo',           TE.logo,       'zone', [15, 120]));
      card.appendChild(placement('Title',          TE.title,      'zone'));
      card.appendChild(placement('Sub-title',      TE.subtitle,   'zone'));
      card.appendChild(placement('Job details',    TE.jobDetails, 'zone'));
      card.appendChild(placement('Date',           TE.date,       'zone'));
      card.appendChild(placement('Revision table', TE.revTable,   'zone'));

      card.appendChild(SH.el('div', { class: 'rl-sub' }, 'Extras'));
      card.appendChild(row('Number the title page',
        checkbox(T.showPageNumber, function (v) { T.showPageNumber = v; save(); })));

      var imgRow = placement('Additional images', TE.images, 'zone', [20, 160]);
      function paintImgRow() { imgRow.style.display = TE.images.enabled ? '' : 'none'; }
      card.appendChild(row('Show additional images', checkbox(TE.images.enabled, function (v) {
        TE.images.enabled = v; paintImgRow(); save();
      })));
      card.appendChild(imgRow);
      paintImgRow();

      if (!logoSrc) {
        card.appendChild(SH.el('div', { class: 'rl-hint', style: 'margin-top:14px' },
          'No company logo is available, so the preview shows a placeholder. ' +
          'Upload one in Settings \u203a Company.'));
      }
      return card;
    }

    /* --- 13. preview geometry ---------------------------------------------
           CSS renders 1 mm as 96/25.4 px. A true-scale page is drawn at real
           mm and scaled so its width lands on PV_W. The schematic pages use
           the same effective ratio via plain px arithmetic, so every preview
           is the same physical size on screen. */
    var PX_PER_MM = 96 / 25.4;
    var PV_W = 360;
    var K = PV_W / 210;                       /* px per mm, schematic (portrait) */
    var PV_H = Math.round(297 * K);

    function frame(wPx, hPx) {
      return SH.el('div', { class: 'rl-frame', style: 'width:' + wPx + 'px;height:' + hPx + 'px' });
    }

    /* A page drawn in real millimetres, scaled to fit the frame width. */
    function truePage(wMm, hMm, cls) {
      var wPx  = PV_W;
      var hPx  = Math.round(hMm * PV_W / wMm);
      var scale = wPx / (wMm * PX_PER_MM);
      var f = frame(wPx, hPx);
      var p = SH.el('div', { class: 'rl-pv rl-mm ' + (cls || ''),
        style: 'width:' + wMm + 'mm;height:' + hMm + 'mm;transform:scale(' + scale + ')' });
      f.appendChild(p);
      return { frame: f, page: p };
    }

    /* --- 14. schematic pages (Sub pages, Contents) ------------------------ */
    function cell(align) {
      return SH.el('div', { class: 'rl-cell ' + (align === 'center' ? 'c' : align === 'right' ? 'r' : 'l') });
    }
    function chip(label, mods) {
      return SH.el('div', { class: 'rl-chip' + (mods || '') }, label);
    }
    function schematicLogo(sizeMm) {
      var px = Math.max(10, Math.round(sizeMm * K));
      if (logoSrc) {
        return SH.el('img', { src: logoSrc, alt: 'Company logo', style: 'height:' + px + 'px' });
      }
      return SH.el('div', { class: 'rl-logo',
        style: 'height:' + px + 'px;width:' + Math.round(px * 1.6) + 'px' }, 'LOGO');
    }
    function rule() {
      return SH.el('div', { class: 'rl-rule', style: 'height:' + Math.max(1, Math.round(S.ruleWeight)) + 'px' });
    }

    var SUB_ORDER = ['logo', 'company', 'title', 'subtitle', 'docName', 'revision', 'pageNo'];
    function subLabel(k, pn) {
      return { logo: 'Logo', company: 'Company details', title: 'Title', subtitle: 'Sub-title',
               docName: resolve(S.docNamePattern) || 'Document name',
               revision: 'Rev 02',
               pageNo: pn }[k];
    }

    function buildBand(bandName, heightMm, pageNoText, hot) {
      var band = SH.el('div', {
        class: 'rl-band bs-' + bandName + '-band',
        style: 'height:' + Math.round(heightMm * K) + 'px'
      });
      var cells = { left: cell('left'), center: cell('center'), right: cell('right') };
      band.appendChild(cells.left); band.appendChild(cells.center); band.appendChild(cells.right);
      SUB_ORDER.forEach(function (k) {
        var e = E[k];
        if (e.band !== bandName) return;
        if (k === 'pageNo' && pageNoText === null) return;
        if (k === 'logo') { cells[e.align].appendChild(schematicLogo(e.size)); return; }
        cells[e.align].appendChild(chip(subLabel(k, pageNoText), k === hot ? ' hot' : ''));
      });
      return band;
    }

    function chromePage(body, pageNoText, hot) {
      var f = frame(PV_W, PV_H);
      var p = SH.el('div', { class: 'rl-pv' });
      if (S.headerEnabled) {
        p.appendChild(buildBand('header', S.headerHeight, pageNoText, hot));
        if (S.headerRule) p.appendChild(rule());
      }
      p.appendChild(body);
      if (S.footerEnabled) {
        if (S.footerRule) p.appendChild(rule());
        p.appendChild(buildBand('footer', S.footerHeight, pageNoText, hot));
      }
      f.appendChild(p);
      return f;
    }

    function buildSubPage(hot) {
      return chromePage(SH.el('div', { class: 'rl-body' }, 'Report content'),
        pageSample(E.pageNo.style, 3, 12), hot);
    }

    var TOC_ROWS = [
      [1, '1',     'Introduction',            '1'],
      [2, '1.1',   'Scope',                   '1'],
      [3, '1.1.1', 'Machinery covered',       '2'],
      [1, '2',     'Risk Assessment',         '3'],
      [2, '2.1',   'Hazard identification',   '3'],
      [1, '3',     'Safety Functions',        '7'],
      [2, '3.1',   'Performance level',       '8'],
      [1, '4',     'Verification',           '12']
    ];
    function leaderText(kind) {
      if (kind === 'dashes') return new Array(60).join('-');
      if (kind === 'none')   return '';
      return new Array(60).join('\u00b7');
    }

    function buildTocPage() {
      var body = SH.el('div', { class: 'rl-toc' });
      var head = SH.el('div', { class: 'rl-toc-h' }, C.heading || 'Table of Contents');
      body.appendChild(head);

      if (!C.enabled) {
        head.style.opacity = '.3';
        body.appendChild(SH.el('div', { class: 'rl-toc-e' },
          SH.el('span', { class: 't' }, 'No contents page in this report.')));
      } else {
        TOC_ROWS.forEach(function (r) {
          if (r[0] > C.depth) return;
          var e = SH.el('div', { class: 'rl-toc-e d' + r[0] });
          if (C.numberEntries) e.appendChild(SH.el('span', { class: 'n' }, r[1]));
          e.appendChild(SH.el('span', { class: 't' }, r[2]));
          if (C.showPageNumbers) {
            e.appendChild(SH.el('span', { class: 'ld' }, leaderText(C.leader)));
            e.appendChild(SH.el('span', { class: 'p' }, r[3]));
          }
          body.appendChild(e);
        });
        if (C.listOfFigures) body.appendChild(SH.el('div', { class: 'rl-toc-x' }, 'List of Figures'));
        if (C.listOfTables)  body.appendChild(SH.el('div', { class: 'rl-toc-x' }, 'List of Tables'));
      }

      var pn = C.pageNumberStyle === 'none' ? null
             : C.pageNumberStyle === 'roman' ? pageSample('roman', 2, 12)
             : pageSample(E.pageNo.style, 2, 12);
      return chromePage(body, pn, null);
    }

    /* --- 15. the true-scale title page ------------------------------------ */
    var TTL_ORDER = ['logo', 'title', 'subtitle', 'jobDetails', 'date', 'revTable', 'images'];

    function mmLogo(sizeMm, cls) {
      if (logoSrc) {
        return SH.el('img', { class: cls || 'rl-tp-logo', src: logoSrc, alt: 'Company logo',
          style: 'height:' + sizeMm + 'mm' });
      }
      return SH.el('div', { class: 'rl-tp-logobox',
        style: 'height:' + sizeMm + 'mm;width:' + Math.round(sizeMm * 1.6) + 'mm' }, 'LOGO');
    }

    function tbl(rows, headRow) {
      var t = SH.el('table');
      if (headRow) {
        var hr = SH.el('tr');
        headRow.forEach(function (h) { hr.appendChild(SH.el('th', null, h)); });
        t.appendChild(SH.el('thead', null, hr));
      }
      var body = SH.el('tbody');
      rows.forEach(function (r) {
        var tr = SH.el('tr');
        r.forEach(function (c) {
          tr.appendChild(c && c.nodeType ? SH.el('td', null, c) : SH.el('td', null, String(c)));
        });
        body.appendChild(tr);
      });
      t.appendChild(body);
      return t;
    }

    function titleNode(k, e) {
      switch (k) {
        case 'logo':     return mmLogo(e.size);
        case 'title':    return SH.el('div', { class: 'bs-title' }, 'Report Title');
        case 'subtitle': return SH.el('div', { class: 'bs-subtitle' }, 'Machine or production line');
        case 'date':     return SH.el('p', null, SAMPLE['{{date}}']);
        case 'revTable':
          return tbl([['1.0', 'Creation of the document', '2026-02-04'],
                      ['2.0', 'Additional safety function', '2026-02-19']],
                     ['Rev', 'Description', 'Date']);
        case 'jobDetails':
          return SH.el('div', null,
            SH.el('p', null, 'Client: ' + SAMPLE['{{project.client}}']),
            SH.el('p', null, 'Job number: ' + SAMPLE['{{project.number}}']),
            SH.el('p', null, 'Prepared by: ' + SAMPLE['{{company.name}}']));
        case 'images':
          var w = e.size, h = Math.round(e.size * 0.7);
          var box = SH.el('div', { class: 'rl-tp-imgs' });
          box.appendChild(SH.el('div', { class: 'rl-tp-img',
            style: 'width:' + w + 'mm;height:' + h + 'mm' }, 'Image'));
          box.appendChild(SH.el('div', { class: 'rl-tp-img',
            style: 'width:' + w + 'mm;height:' + h + 'mm' }, 'Image'));
          return box;
        default: return null;
      }
    }

    function buildTitlePage() {
      var tp = truePage(210, 297);

      ['top', 'upper', 'middle', 'lower', 'bottom'].forEach(function (z) {
        var zone = SH.el('div', { class: 'rl-zone' });
        TTL_ORDER.forEach(function (k) {
          var e = TE[k];
          if (e.zone !== z) return;
          if (k === 'images' && !e.enabled) return;
          var node = titleNode(k, e);
          if (!node) return;
          node.classList.add('a-' + e.align);
          zone.appendChild(node);
        });
        tp.page.appendChild(zone);
      });

      if (T.showPageNumber) {
        tp.page.appendChild(SH.el('div', { class: 'rl-tp-pn' },
          SH.el('p', { class: 'a-center' }, pageSample(E.pageNo.style, 1, 12))));
      }
      return tp.frame;
    }

    /* --- 16. the true-scale LOTO placard ----------------------------------
           Sample content only. The step wording lives in Information Sections
           and the tag colours in Report Theme; both are drawn neutrally here. */
    var ENERGY_ROWS = [
      ['E-1', 'Electrical 480 VAC, single feed', 'Lock',                'Isolation point beside the pump', 'Open the supply disconnect and lock out'],
      ['W-1', 'Water 450 psi, inlet',            'Cable device + lock', 'Isolation point beside the pump', 'Shut the inlet valve and lock out'],
      ['W-2', 'Water 450 psi, discharge',        'Cable device + lock', 'Isolation point beside the pump', 'Shut the discharge valve and lock out']
    ];
    var SHUTDOWN_STEPS = [
      ['Notify',           'Tell every affected employee the machine is being shut down and locked out.'],
      ['Machine stop',     'Shut down using the manufacturer\u2019s approved procedure.'],
      ['Isolate',          'Wearing appropriate PPE, isolate every energy source.'],
      ['Lock out',         'Apply the lockout devices, locks and completed tags.'],
      ['Test devices',     'Attempt to remove each lock to verify the isolation holds.'],
      ['Attempt restart',  'With nobody exposed, attempt to start the machine.'],
      ['Dissipate energy', 'Release or restrain stored energy \u2014 springs, capacitors, pressure.'],
      ['Live\u2013dead\u2013live', 'Prove the tester, prove the circuit dead, prove the tester again.'],
      ['Safeguards',       'Apply any further restraints, blocks or earthing required.']
    ];
    var RESTORE_STEPS = [
      ['Inspect',        'Check that no tools or loose items remain on the machine.'],
      ['Check the area', 'Confirm everyone is clear of the machine.'],
      ['Verify',         'Confirm the controls are neutral or off.'],
      ['Remove LOTO',    'Remove the locks, tags and devices, then re-energise.'],
      ['Notify',         'Tell affected employees the isolation has been removed.']
    ];

    function lotoBlockNode(b) {
      var i, node;
      switch (b.id) {

        case 'identification':
          return tbl([
            ['Description: ' + SAMPLE['{{loto.description}}'], 'Created: 2026-01-14', 'By: ' + SAMPLE['{{company.name}}']],
            ['Facility: ' + SAMPLE['{{project.client}}'],      'Revised: \u2014',      'By:'],
            ['Location: ' + SAMPLE['{{area.name}}'],           'Revised: \u2014',      'By:']
          ]);

        case 'notes':
          node = SH.el('div', { class: 'rl-lt-note' });
          if (b.showPointCount) {
            node.appendChild(SH.el('div', { class: 'rl-lt-pts' },
              SH.el('b', null, String(ENERGY_ROWS.length)), 'LOTO points'));
          }
          node.appendChild(SH.el('div', { class: 'rl-lt-notebox' },
            SH.el('div', null, 'Note: stored hydraulic pressure \u2014 bleed before servicing.'),
            SH.el('div', null, 'The drive holds a charge in its DC bus \u2014 allow it to dissipate.')));
          return node;

        case 'audit':
          node = SH.el('div', { class: 'rl-lt-audit' });
          for (i = 0; i < b.columns; i++) {
            node.appendChild(SH.el('div', null,
              SH.el('div', null, 'Next audit due'),
              SH.el('div', null, 'January ' + (2027 + i))));
          }
          return node;

        case 'photos':
          node = SH.el('div', { class: 'rl-lt-photos', style: 'height:' + b.height + 'mm' });
          for (i = 0; i < b.count; i++) {
            node.appendChild(SH.el('div', { class: 'rl-lt-photo' }, 'Photo ' + (i + 1)));
          }
          return node;

        case 'energy':
          return tbl(ENERGY_ROWS.map(function (r) {
            var first = b.showTags ? SH.el('span', { class: 'rl-lt-tag' }, r[0]) : r[0];
            return [first, r[1], r[2], r[3], r[4]];
          }), ['Tag', 'Energy source', 'Device', 'Location', 'Method']);

        case 'statement':
          return SH.el('div', { class: 'rl-lt-stmt' },
            SH.el('div', null, 'This procedure puts the equipment into a zero-energy state.'),
            SH.el('div', null, 'Follow the approved shutdown procedure before isolating.'));

        case 'shutdown':
        case 'restore':
          var steps = (b.id === 'shutdown') ? SHUTDOWN_STEPS : RESTORE_STEPS;
          var t = SH.el('table', { class: 'rl-lt-seq' });
          var hr = SH.el('tr', null,
            SH.el('th', { class: 'rl-lt-seqh', colspan: '3' }, b.title));
          t.appendChild(SH.el('thead', null, hr));
          var body = SH.el('tbody');
          steps.forEach(function (s, n) {
            body.appendChild(SH.el('tr', null,
              SH.el('td', null, String(n + 1)),
              SH.el('td', null, s[0]),
              SH.el('td', null, s[1])));
          });
          t.appendChild(body);
          return t;

        default: return null;
      }
    }

    function buildLotoPage() {
      var landscape = (O.orientation === 'landscape');
      var tp = truePage(landscape ? 297 : 210, landscape ? 210 : 297, 'rl-lt');

      /* banner */
      var banner = SH.el('div', { class: 'rl-lt-banner bs-header-band',
        style: 'height:' + O.bannerHeight + 'mm' });
      var ttl = SH.el('div', { class: 'bs-title rl-lt-ttl' }, O.bannerTitle);
      if (O.logo.show && O.logo.align === 'right') {
        ttl.style.textAlign = 'left';
        banner.appendChild(ttl);
        banner.appendChild(mmLogo(O.logo.size));
      } else if (O.logo.show && O.logo.align === 'center') {
        ttl.style.textAlign = 'center';
        banner.appendChild(mmLogo(O.logo.size));
        banner.appendChild(ttl);
      } else {
        if (O.logo.show) banner.appendChild(mmLogo(O.logo.size));
        ttl.style.textAlign = O.logo.show ? 'right' : 'center';
        banner.appendChild(ttl);
      }
      tp.page.appendChild(banner);

      /* blocks, in stored order */
      O.blocks.forEach(function (b) {
        if (!b.show) return;
        var node = lotoBlockNode(b);
        if (node) tp.page.appendChild(node);
      });

      /* footer */
      if (O.footer.show) {
        var foot = SH.el('div', { class: 'rl-lt-foot bs-footer-band',
          style: 'height:' + O.footer.height + 'mm' });
        foot.appendChild(SH.el('span', null,
          SH.settings.get('company.website', '') || SAMPLE['{{company.name}}']));
        foot.appendChild(SH.el('span', null, resolve(O.namePattern)));
        if (O.footer.showLogo) foot.appendChild(mmLogo(Math.max(6, O.footer.height - 4)));
        tp.page.appendChild(foot);
      }

      return tp.frame;
    }

    /* --- 17. warnings: real, computable problems only ---------------------- */
    function paintWarn() {
      if (!warn) return;
      var msgs = [];
      if (E.logo.band !== 'hidden') {
        var on = E.logo.band === 'header' ? S.headerEnabled : S.footerEnabled;
        var h  = E.logo.band === 'header' ? S.headerHeight  : S.footerHeight;
        if (on && E.logo.size > h - 4) {
          msgs.push('The logo is ' + E.logo.size + ' mm tall but the ' + E.logo.band +
            ' band is only ' + h + ' mm. Raise the band height or shrink the logo.');
        }
      }
      var orphans = [];
      SUB_ORDER.forEach(function (k) {
        var b = E[k].band;
        if (b === 'header' && !S.headerEnabled) orphans.push(k);
        if (b === 'footer' && !S.footerEnabled) orphans.push(k);
      });
      if (orphans.length) {
        msgs.push(orphans.length + ' element' + (orphans.length > 1 ? 's are' : ' is') +
          ' assigned to a band that is turned off, so ' +
          (orphans.length > 1 ? 'they' : 'it') + ' will not print.');
      }
      var used = (S.headerEnabled ? S.headerHeight : 0) + (S.footerEnabled ? S.footerHeight : 0);
      if (used > 90) msgs.push('Header and footer together take ' + used + ' mm of every sub page.');

      warn.innerHTML = '';
      warn.style.display = msgs.length ? '' : 'none';
      msgs.forEach(function (m) { warn.appendChild(SH.el('div', null, m)); });
    }

    /* --- 18. panes, tabs, assembly ----------------------------------------- */
    var PANES = [
      ['title',  'Title page', titleCard,  buildTitlePage,
        'A4 portrait at true scale. Logo from Company, type from Report Theme.'],
      ['toc',    'Contents',   tocCard,    buildTocPage,
        'A4 portrait, to scale. Entries are a sample, not your project.'],
      ['sub',    'Sub pages',  subCard,    function () { return buildSubPage(null); },
        'A4 portrait, to scale. Band colours follow Report Theme.'],
      ['loto',   'LOTO',       lotoCard,   buildLotoPage,
        'One placard per isolation point, at true scale. Content is a sample.'],
      ['naming', 'Naming',     namingCard, function () { return buildSubPage('docName'); },
        'The document name is highlighted where it will print.']
    ];
    function paneDef(id) {
      for (var i = 0; i < PANES.length; i++) if (PANES[i][0] === id) return PANES[i];
      return PANES[0];
    }

    var tabs = SH.el('div', { class: 'rl-tabs' });
    var tabBtns = {};
    PANES.forEach(function (p) {
      var b = SH.el('button', { type: 'button' }, p[1]);
      b.addEventListener('click', function () { pane = p[0]; rebuild(); });
      tabBtns[p[0]] = b;
      tabs.appendChild(b);
    });

    var resetBtn = SH.el('button', { type: 'button', class: 'btn' }, 'Restore defaults');
    resetBtn.addEventListener('click', function () {
      if (!confirm('Reset the whole report layout to its default arrangement?')) return;
      L = defaults();
      SH.settings.set('layout', L);
      rebuild();
      flashSaved();
    });

    var bar     = SH.el('div', { class: 'rl-bar' }, resetBtn, stateEl);
    var wrap    = SH.el('div', { class: 'rl-wrap' });
    var pvBox   = SH.el('div');
    var pvCap   = SH.el('div', { class: 'rl-cap' });
    var preview = SH.el('div', { class: 'rl-preview' }, pvBox, pvCap);
    var controls;

    function repaint() {
      var def = paneDef(pane);
      pvBox.innerHTML = '';
      pvBox.appendChild(def[3]());
      pvCap.textContent = def[4];
      paintWarn();
    }

    /* Rebuilds the control column for the active pane. Not the whole tab —
       mount() only runs once, and bar/tabs/preview are long-lived nodes. */
    function rebuild() {
      S = L.sub; E = S.elements; T = L.title; TE = T.elements; C = L.toc; O = L.loto;
      warn = null;

      var def = paneDef(pane);
      PANES.forEach(function (p) { tabBtns[p[0]].className = (p[0] === pane) ? 'on' : ''; });

      controls = SH.el('div', { class: 'rl-controls' }, def[2]());
      wrap.innerHTML = '';
      wrap.appendChild(controls);
      wrap.appendChild(preview);
      repaint();
    }

    host.innerHTML = '';
    host.appendChild(bar);
    host.appendChild(tabs);
    host.appendChild(wrap);
    rebuild();
    loadLogo();

    /* Theme every preview kind. attach() injects scoped CSS and repaints on
       settings:changed, so the bands and the true-scale type track the editor. */
    if (SH.theme && typeof SH.theme.attach === 'function') {
      this._detachTheme = SH.theme.attach(host, '.rl-pv');
    }

    /* --- 19. react to external changes --------------------------------------
           Our own writes come straight back: save() calls SH.settings.set(),
           which emits settings:changed. Those echoes deep-equal what we hold,
           so they only repaint the preview — the controls are never rebuilt
           under the user's cursor.

           A real external write must rebuild the controls, which close over the
           old object. Rebuilding while focus is inside them would swallow the
           click, so defer — and REMEMBER that we deferred. A skipped sync that
           is never replayed is a tab that has gone silently stale. Replay on
           focusout, and again in onShow(). */
    var pending = false;

    function syncFromSettings() {
      refreshSample();

      var f = SH.settings.get('company.logo.file', '');
      if (f !== logoFile) { logoFile = f; loadLogo(); }

      var next = read();
      if (same(next, L)) { pending = false; repaint(); return; }
      if (controls && controls.contains(document.activeElement)) { pending = true; return; }

      pending = false;
      L = next;
      rebuild();
    }

    this._host = host;
    this._sync = syncFromSettings;
    this._onSettings = function () { syncFromSettings(); };
    this._onBlur = function () { if (pending) syncFromSettings(); };

    SH.bus.on('settings:changed', this._onSettings);
    host.addEventListener('focusout', this._onBlur);
    this._clearFlash = function () { clearTimeout(flash); };
    this._releaseLogo = releaseLogo;
  },

  /* --- 20. revealed again. mount() no longer re-runs, so re-read here.
           This also clears any sync deferred while the tab was hidden. */
  onShow: function () {
    if (this._sync) this._sync();
  },

  /* --- 21. teardown: the page is being torn down, not merely hidden. */
  unmount: function () {
    if (this._onSettings) SH.bus.off('settings:changed', this._onSettings);
    if (this._host && this._onBlur) this._host.removeEventListener('focusout', this._onBlur);
    if (this._clearFlash) this._clearFlash();
    if (this._detachTheme) this._detachTheme();
    if (this._releaseLogo) this._releaseLogo();
    this._onSettings = null; this._onBlur = null; this._clearFlash = null;
    this._detachTheme = null; this._sync = null; this._host = null;
    this._releaseLogo = null;
  }
});