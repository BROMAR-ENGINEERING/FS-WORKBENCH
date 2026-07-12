/* ==============================================================
   FS Workbench — left-menu manifest + boot
   File:     js/app.js
   Rev:      0.13.0
   Updated:  2026-07-09
   Requires: core.js, loader.js, store.js, settings.js, theme.js,
             content.js, doc-tabs.js, router.js
   --------------------------------------------------------------
   SH.MENU is the ONLY place the left menu is defined. To add a page:
   add an entry here and create pages/<id>/<id>.js. index.html never
   changes. Items with `pin:'bottom'` sit at the foot of the sidebar,
   above the version stamp.

   0.9.0 — Open project now lists RECENT projects first (one click, no file
          picker), then the projects inside the current root. The two
          confusing buttons are relabelled: "Set projects folder…" picks
          the folder that CONTAINS projects; "Open a project folder…"
          picks a folder that IS a project.
   0.8.1 — New project no longer silently reuses the last folder. The dialog
          has a Location row: "Choose…" opens the picker, and a shortcut
          button offers the last-used folder by name. Create refuses until a
          location is chosen. Pickers now fire as the first statement of a
          click handler, never after an await, which is what the browser's
          user-gesture rule requires.
   0.7.3 — the boot check now detects a STALE core file, not just a missing
          one: each service must expose a method only its current revision
          has. An old js/settings.js used to boot fine and then explode in
          a tab with "SH.settings.listSections is not a function".
   0.7.2 — New project asks for a Job number (stored in project.job.jobNumber)
          rather than a Document number. The document number is report front
          matter and belongs in Project Details / Document Control.
   0.7.0 — New / Open now do real work: choose a projects folder, create
          or open a project on disk, and show where it lives. The header
          shows the project path and a save status chip instead of the
          meaningless "No document number".
   ============================================================== */
(function (SH) {

  var ic = {
    project:      '<path d="M4 4h9l3 3v9H4z"/><path d="M13 4v3h3"/>',
    risk:         '<path d="M10 3 18 17H2z"/><path d="M10 8v4"/><circle cx="10" cy="14.5" r=".6"/>',
    srs:          '<path d="M5 3h7l3 3v11H5z"/><path d="M7 8h6M7 11h6M7 14h4"/>',
    components:   '<rect x="6" y="6" width="8" height="8" rx="1"/><path d="M8 6V3M12 6V3M8 17v-3M12 17v-3M6 8H3M6 12H3M17 8h-3M17 12h-3"/>',
    verification: '<path d="M4 10l4 4 8-9"/>',
    validation:   '<path d="M7 3h6M9 3v5l-4 8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l-4-8V3"/>',
    loto:         '<rect x="4" y="9" width="12" height="8" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>',
    audits:       '<path d="M6 3h8v14H6z"/><path d="M8 7l1.5 1.5L12 6"/><path d="M8 12h5"/>',
    reports:      '<path d="M5 3h7l3 3v11H5z"/><path d="M8 12l2-2 2 3 2-4"/>',
    sfns:         '<path d="M3 10h3l2-5 3 10 2-6 2 3h2"/>',
    settings:     '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"/>'
  };
  function svg(p) {
    return '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" ' +
           'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* --- LEFT MENU (order = display order) --- */
  SH.MENU = [
    { id: 'project',         label: 'Project Details',         icon: ic.project,      src: 'pages/project/project.js' },
    { id: 'risk-assessment', label: 'Risk Assessment',         icon: ic.risk,         src: 'pages/risk-assessment/risk-assessment.js' },
    { id: 'srs',             label: 'Safety Requirement Spec', icon: ic.srs,          src: 'pages/srs/srs.js' },
    { id: 'safety-functions',label: 'Safety Functions',        icon: ic.sfns,         src: 'pages/safety-functions/safety-functions.js' },
    { id: 'verification',    label: 'Verification',            icon: ic.verification, src: 'pages/verification/verification.js' },
    { id: 'validation',      label: 'Validation',              icon: ic.validation,   src: 'pages/validation/validation.js' },
    { id: 'loto',            label: 'LOTO',                    icon: ic.loto,         src: 'pages/loto/loto.js' },
    { id: 'audits',          label: 'Audits',                  icon: ic.audits,       src: 'pages/audits/audits.js' },
    { id: 'custom-reports',  label: 'Custom Reports',          icon: ic.reports,      src: 'pages/custom-reports/custom-reports.js' },
    { id: 'components',      label: 'Components',              icon: ic.components,   src: 'pages/components/components.js' },
    { id: 'settings',        label: 'Settings',                icon: ic.settings,     src: 'pages/settings/settings.js', pin: 'bottom' }
  ];

  /* ==============================================================
     Sidebar
     ============================================================== */
  function navLink(m) {
    return SH.el('a', {
      class: 'nav-item', 'data-page': m.id, href: '#/' + m.id,
      html: svg(m.icon) + '<span>' + SH.esc(m.label) + '</span>'
    });
  }

  /* The wordmark and document title are the ONLY places the product name is
     rendered. Both read SH.APP, so renaming the app is a one-line edit in
     js/core.js — a hard requirement, since the tool is meant to be handed to
     another consultant unbranded. */
  /* The wordmark and document title are the ONLY places the product name is
     rendered. Both read SH.APP, so renaming the app is a one-line edit in
     js/core.js — a hard requirement, since the tool is meant to be handed to
     another consultant unbranded.

     The mark is inlined as SVG rather than <img src="assets/fsw-mark.svg">.
     An <img> would work on file://, but inlining lets the tick inherit the
     header's foreground and costs no extra request. */
  var MARK = '<svg viewBox="0 0 48 48" role="img" aria-label="' + '{{name}}' + ' mark">' +
      '<circle cx="24" cy="24" r="15" fill="none" stroke="#F59E0B" stroke-width="4.5" ' +
        'stroke-linecap="round" stroke-dasharray="82 14" transform="rotate(-52 24 24)"></circle>' +
      '<path d="M16.8 24.6 L21.8 29.6 L31.6 18.4" fill="none" stroke="#FFFFFF" stroke-width="4.5" ' +
        'stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  function buildBrand() {
    var el = document.getElementById('app-brand');
    if (!el) return;
    var name = SH.APP.name, accent = SH.APP.accent || '';

    el.innerHTML = MARK.replace('{{name}}', SH.esc(name));

    if (accent && name.slice(-accent.length) === accent) {
      var head = name.slice(0, name.length - accent.length);
      if (head) el.appendChild(document.createTextNode(head));
      el.appendChild(SH.el('b', null, accent));
    } else {
      el.appendChild(document.createTextNode(name));
    }
    document.title = name;
  }

  function buildSidebar() {
    var nav = document.getElementById('sidebar');
    nav.innerHTML = '';
    var scroll = SH.el('div', { class: 'nav-scroll' });
    var foot   = SH.el('div', { class: 'nav-foot' });
    SH.MENU.forEach(function (m) { (m.pin === 'bottom' ? foot : scroll).appendChild(navLink(m)); });
    foot.appendChild(SH.el('div', { class: 'nav-rev', id: 'app-rev', title: 'Build ' + SH.BUILD }, 'v' + SH.VERSION));
    nav.appendChild(scroll);
    nav.appendChild(foot);
  }

  /* ==============================================================
     Header — identity, location on disk, save state
     ============================================================== */
  var CHIP = {
    saved:   ['Saved', 'chip-ok'],
    unsaved: ['Unsaved…', 'chip-warn'],
    saving:  ['Saving…', 'chip-warn'],
    memory:  ['Not saved to disk', 'chip-bad'],
    none:    ['', '']
  };

  function updateHeader() {
    var p = SH.store.project;
    var nameEl = document.getElementById('proj-name');
    var metaEl = document.getElementById('proj-meta');

    if (!p) {
      nameEl.textContent = 'No project open';
      metaEl.innerHTML = SH.store.hasRoot()
        ? 'Projects folder: ' + SH.esc(SH.store.rootName())
        : 'Create or open a project to begin';
      return;
    }

    nameEl.textContent = p.meta.name || 'Untitled project';

    /* Left of the chip: where it lives, then who it's for. Only show the
       document number once one exists — an empty slot taught nobody
       anything. */
    var bits = [];
    if (SH.store.path()) bits.push(SH.store.path());
    if (p.meta.client) bits.push(p.meta.client);
    if (p.job && p.job.jobNumber) bits.push('Job ' + p.job.jobNumber);
    if (p.meta.documentNumber) bits.push(p.meta.documentNumber);
    if (!bits.length) bits.push('Unsaved project');

    var st = SH.store.status();
    var chip = CHIP[st] || CHIP.none;
    metaEl.innerHTML =
      '<span class="pathline">' + SH.esc(bits.join('  ·  ')) + '</span>' +
      (chip[0] ? '<span class="chip ' + chip[1] + '">' + SH.esc(chip[0]) + '</span>' : '');
  }

  /* ==============================================================
     data folder — one app-level prompt, never per tab

     Chrome drops a persisted readwrite grant. The handle survives in
     IndexedDB, so re-attaching is one click — not a folder picker. Showing
     that prompt in every settings tab would train the user to re-pick the
     folder, which is how the company details got lost in the first place.
     ============================================================== */
  var reconnectBar = null;

  function paintDataFolder(state) {
    if (state === 'gone') { hideReconnect(); showMissing(); return; }
    hideMissing();
    if (SH.settings.permission() !== 'prompt') { hideReconnect(); return; }
    showReconnect();
  }

  var missingBar = null;
  function showMissing() {
    if (missingBar) return;
    missingBar = SH.el('div', { class: 'reconnect bad' },
      SH.el('span', null,
        'The data folder ' + SH.APP_NAME + ' was using no longer exists. ' +
        'Company details, themes and sections are unavailable.'),
      SH.el('button', { class: 'btn sm', onClick: function () {
        SH.settings.chooseDataFolder()
          .then(function () { hideMissing(); })
          .catch(function (e) { if (e && e.name !== 'AbortError') err(e.message); });
      } }, 'Choose data folder…')
    );
    var content = document.getElementById('content');
    content.parentNode.insertBefore(missingBar, content);
  }
  function hideMissing() {
    if (missingBar && missingBar.parentNode) missingBar.parentNode.removeChild(missingBar);
    missingBar = null;
  }

  function showReconnect() {
    if (reconnectBar) return;
    reconnectBar = SH.el('div', { class: 'reconnect' },
      SH.el('span', null, 'Your ' + SH.APP_NAME + ' data folder is not connected. ' +
                          'Company details, themes and sections are unavailable.'),
      SH.el('button', { class: 'btn sm', onClick: function () {
        /* first statement of the click: re-granting needs the gesture */
        SH.settings.reconnectDataFolder().then(function (r) {
          if (r === 'granted') { hideReconnect(); }
          else if (r === 'none') { hideReconnect(); err('No folder is remembered on this machine. Choose one in Settings \u2192 Data & Storage.'); }
        }).catch(function (e) { err(e.message); });
      } }, 'Reconnect')
    );
    var content = document.getElementById('content');
    content.parentNode.insertBefore(reconnectBar, content);
  }

  function hideReconnect() {
    if (reconnectBar && reconnectBar.parentNode) reconnectBar.parentNode.removeChild(reconnectBar);
    reconnectBar = null;
  }

  /* ==============================================================
     Modal — small, dependency-free
     ============================================================== */
  function modal(title, bodyEl, actions) {
    var back = SH.el('div', { class: 'modal-back' });
    var box  = SH.el('div', { class: 'modal' });
    box.appendChild(SH.el('h2', { class: 'section' }, title));
    box.appendChild(bodyEl);

    var bar = SH.el('div', { class: 'modal-acts' });
    actions.forEach(function (a) {
      var attrs = { class: 'btn ' + (a.ghost ? 'ghost' : ''),
                    onClick: function () { a.onClick(close); } };
      if (a.title) attrs.title = a.title;
      bar.appendChild(SH.el('button', attrs, a.label));
    });
    box.appendChild(bar);
    back.appendChild(box);
    document.body.appendChild(back);

    function close() { if (back.parentNode) back.parentNode.removeChild(back); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    return close;
  }

  /* Exposed on SH so page controllers and tab files can open modals.
     Tabs cannot reach private app.js functions. */
  SH.modal = function (title, bodyEl, actions) { return modal(title, bodyEl, actions); };

  function field(label, id, placeholder) {
    return SH.el('div', { class: 'field' },
      SH.el('label', null, label),
      SH.el('input', { type: 'text', id: id, placeholder: placeholder || '' }));
  }

  function err(msg) {
    modal('Something went wrong',
      SH.el('p', { class: 'hint' }, msg),
      [{ label: 'Close', ghost: true, onClick: function (c) { c(); } }]);
  }

  /* ==============================================================
     New / Open flows
     ============================================================== */

  /* showDirectoryPicker() needs a live user gesture. Call it as the FIRST
     statement of a click handler, never after an await — hence a dedicated
     "Choose…" button rather than picking implicitly during Create. */

  function newProjectFlow() {
    var chosenRoot = null;                 // handle for THIS project

    var whereEl = SH.el('span', { class: 'loc-path' }, 'No location chosen');
    var pickBtn = SH.el('button', { class: 'btn ghost sm', onClick: function () {
      SH.store.pickRoot().then(function (h) {
        chosenRoot = h;
        whereEl.textContent = h.name;
        whereEl.classList.add('chosen');
        errEl.textContent = '';
      }).catch(function (e) {
        if (e && e.name !== 'AbortError') errEl.textContent = e.message;
      });
    } }, 'Choose…');

    var errEl = SH.el('div', { class: 'modal-err' }, '');

    var body = SH.el('div', null,
      SH.el('p', { class: 'hint' },
        'A folder is created for this project inside the location you choose, ' +
        'holding project.json and one file per safety function.'),
      field('Project name', 'np-name', 'e.g. DESMA kneader line'),
      field('Client', 'np-client', 'e.g. The Elastomers Pty Ltd'),
      field('Job number', 'np-job', 'optional — your internal job number'),
      SH.el('div', { class: 'field' },
        SH.el('label', null, 'Location'),
        SH.el('div', { class: 'loc-row' }, whereEl, pickBtn)),
      errEl
    );

    var close = modal('New project', body, [
      { label: 'Cancel', ghost: true, onClick: function (c) { c(); } },
      { label: 'Create', onClick: function (c) {
          var name = document.getElementById('np-name').value.trim();
          if (!name) { errEl.textContent = 'Give the project a name.';
                       document.getElementById('np-name').focus(); return; }
          if (!chosenRoot) { errEl.textContent = 'Choose a location for this project.'; return; }

          var meta = {
            name: name,
            client: document.getElementById('np-client').value.trim(),
            jobNumber: document.getElementById('np-job').value.trim()
          };
          SH.store.newProject(meta, { root: chosenRoot })
            .then(function () { c(); })
            .catch(function (e) { errEl.textContent = e.message; });
        } }
    ]);

    /* Offer the last-used folder as a shortcut, but never assume it. */
    if (SH.store.hasRoot()) {
      var last = SH.store.rootHandle;
      pickBtn.parentNode.insertBefore(
        SH.el('button', { class: 'btn ghost sm', onClick: function () {
          chosenRoot = last;
          whereEl.textContent = last.name;
          whereEl.classList.add('chosen');
          errEl.textContent = '';
        } }, 'Use ' + SH.esc(SH.store.rootName())),
        pickBtn);
    }

    document.getElementById('np-name').focus();
    return close;
  }

  /* ------------------------------------------------------------------
     Open project.

     Three ways in, in the order people actually want them:
       1. Recent projects        — one click, no file picker
       2. Projects in <root>     — the folder that CONTAINS your projects
       3. Open a project folder… — the folder that IS a project

     The old dialog offered (2) and (3) as "Browse to a folder…" and "Open
     this folder as a project". Both read as "find my project", and choosing
     the project folder in (2) made it the root — which then listed nothing,
     because a project folder has no project folders inside it.
     ------------------------------------------------------------------ */

  function recentRow(rec, closeIt, refresh) {
    var sub = [rec.rootName ? rec.rootName + ' / ' + rec.folder : rec.folder,
               rec.client,
               rec.jobNumber ? 'Job ' + rec.jobNumber : '',
               rec.lastOpened ? rec.lastOpened.slice(0, 10) : '']
      .filter(Boolean).join('  ·  ');

    var forget = SH.el('button', {
      class: 'pi-forget', title: 'Remove from this list',
      onClick: function (e) {
        e.stopPropagation();
        SH.store.forgetRecent(rec.id).then(refresh);
      }
    }, '\u00d7');

    var row = SH.el('button', {
      class: 'proj-item',
      onClick: function () {
        /* first statement of the click: re-granting the handle needs the gesture */
        SH.store.openRecent(rec.id)
          .then(function () { closeIt(); })
          .catch(function (e) {
            if (e.code === 'DENIED') { closeIt(); err(e.message); return; }
            if (e.code === 'GONE') {
              SH.store.forgetRecent(rec.id).then(refresh);
              err(e.message + ' It has been removed from the recent list.');
              return;
            }
            closeIt();                       // INVALID, or anything unforeseen
            err(e.message);
          });
      }
    },
      SH.el('span', { class: 'pi-name' }, rec.name),
      SH.el('span', { class: 'pi-sub' }, sub)
    );
    row.appendChild(forget);
    return row;
  }

  function openProjectFlow() {
    var body = SH.el('div');
    var closeIt;

    function refresh() {
      body.innerHTML = '';

      /* 1. recents */
      SH.store.listRecents().then(function (recents) {
        if (recents.length) {
          body.appendChild(SH.el('div', { class: 'subhead' }, 'Recent'));
          var ul = SH.el('div', { class: 'proj-list' });
          recents.forEach(function (r) { ul.appendChild(recentRow(r, function () { closeIt(); }, refresh)); });
          body.appendChild(ul);
        }

        /* 2. projects inside the current root */
        if (!SH.store.hasRoot()) {
          if (!recents.length) {
            body.appendChild(SH.el('p', { class: 'hint' },
              'Open a project folder, or point ' + SH.APP_NAME + ' at the folder that holds your projects.'));
          }
          return;
        }

        return SH.store.listProjects().then(function (list) {
          body.appendChild(SH.el('div', { class: 'subhead' },
            'In ' + SH.esc(SH.store.rootName())));
          if (!list.length) {
            body.appendChild(SH.el('p', { class: 'hint' },
              'No projects directly inside this folder. It should be the folder that ' +
              '\u2019contains\u2019 your projects, not a project itself.'));
            return;
          }
          var ul2 = SH.el('div', { class: 'proj-list' });
          list.forEach(function (p) {
            var sub = [p.client,
                       p.jobNumber ? 'Job ' + p.jobNumber : '',
                       p.documentNumber,
                       p.savedAt ? p.savedAt.slice(0, 10) : '']
              .filter(Boolean).join('  \u00b7  ');
            ul2.appendChild(SH.el('button', {
              class: 'proj-item',
              onClick: function () {
                SH.store.openProject(p.folder)
                  .then(function () { closeIt(); })
                  .catch(function (e) { closeIt(); err(e.message); });
              }
            },
              SH.el('span', { class: 'pi-name' }, p.name),
              SH.el('span', { class: 'pi-sub' }, sub || p.folder)
            ));
          });
          body.appendChild(ul2);
        });
      }).catch(function (e) { console.warn(SH.APP_NAME + ':', e); });
    }

    refresh();

    closeIt = modal('Open project', body, [
      { label: 'Cancel', ghost: true, onClick: function (c) { c(); } },
      { label: 'Set projects folder…', ghost: true, title:
          'The folder that CONTAINS your projects', onClick: function (c) {
          SH.store.pickRoot().then(function (h) {
            return SH.store.useRoot(h).then(refresh);
          }).catch(function (e) { if (e && e.name !== 'AbortError') err(e.message); });
        } },
      { label: 'Open a project folder…', onClick: function (c) {
          SH.store.openProjectFolder()
            .then(function () { c(); })
            .catch(function (e) { if (e && e.name !== 'AbortError') { c(); err(e.message); } });
        } }
    ]);
    return Promise.resolve(closeIt);
  }

  function buildHeader() {
    document.getElementById('btn-new').addEventListener('click', function () {
      newProjectFlow();
    });
    document.getElementById('btn-open').addEventListener('click', function () {
      Promise.resolve(openProjectFlow()).catch(function (e) {
        if (e && e.name !== 'AbortError') err(e.message);
      });
    });
  }

  /* ==============================================================
     Boot
     ============================================================== */

  /* A missing core script shows up as "Cannot read properties of undefined"
     deep inside whichever tab uses it first. Check up front and say which
     <script> tag is absent from index.html. */
  /* Core services are plain globals on SH, loaded by <script> tags in
     index.html. Two things go wrong, and both used to surface much later
     as something opaque:

       missing  the <script> tag or the file is absent  -> SH.theme is undefined
       stale    an older copy of the file is on disk    -> SH.settings exists but
                                                           has no listSections()

     So check each service exists AND exposes a method that only the
     current revision has. Feature detection, not version strings — a file
     can lie about its version, not about its methods. */
  var REQUIRED = [
    ['loader',   'js/loader.js',   'load'],
    ['store',    'js/store.js',    'chooseRoot'],
    ['settings', 'js/settings.js', 'listSections'],
    ['theme',    'js/theme.js',    'attach'],
    ['content',  'js/content.js',  'render'],
    ['docTabs',  'js/doc-tabs.js', 'report'],
    ['router',   'js/router.js',   'start']
  ];

  function missingServices() {
    return REQUIRED.filter(function (r) {
      var svc = SH[r[0]];
      return !svc || typeof svc[r[2]] !== 'function';
    }).map(function (r) {
      var svc = SH[r[0]];
      return { key: r[0], file: r[1], method: r[2], stale: !!svc };
    });
  }

  SH.boot = function () {
    var missing = missingServices();
    if (missing.length) {
      var list = missing.map(function (m) {
        return '<li><code>' + m.file + '</code> — ' +
               (m.stale
                  ? 'is an <b>older copy</b>. <code>SH.' + m.key + '.' + m.method +
                    '()</code> is missing.'
                  : 'is <b>not loaded</b>. Check the file exists and that ' +
                    '<code>index.html</code> has its &lt;script&gt; tag.') +
               '</li>';
      }).join('');
      console.error(SH.APP_NAME + ': core scripts missing or out of date: ' +
        missing.map(function (m) { return m.file + (m.stale ? ' (stale)' : ' (absent)'); }).join(', '));
      document.getElementById('content').innerHTML =
        '<div class="stub error" style="margin-top:24px">' +
        '<h2>' + SH.APP_NAME + ' cannot start</h2>' +
        '<ul>' + list + '</ul>' +
        '<p>Every ' + SH.APP_NAME + ' file names itself on line 3 of its header ' +
        '(<code>File:     js/&lt;name&gt;.js</code>). Check each one matches its filename, then ' +
        'hard-refresh with <b>Ctrl+Shift+R</b>.</p>' +
        '<p>Script order in <code>index.html</code>: core, loader, store, settings, theme, ' +
        'content, doc-tabs, router, app.</p></div>';
      return;
    }

    SH.settings.init();
    buildBrand();
    buildHeader();
    buildSidebar();
    updateHeader();
    SH.bus.on('project:changed', updateHeader);
    SH.bus.on('project:status', updateHeader);   // save chip: Saved / Saving / Unsaved
    SH.bus.on('project:root', updateHeader);
    SH.bus.on('settings:status', function () { paintDataFolder(); });
    SH.router.start();

    /* Re-attach the data folder. The handle is cached, so this is a
       once-ever act on a machine — unless Chrome drops the grant, in which
       case we offer a one-click reconnect rather than a picker. */
    /* Move any handles out of the pre-rename database FIRST. Both restores
       below read the new one, so this has to finish before either runs. */
    SH.migrateHandleDb().then(function () {

      SH.settings.restoreDataFolder().then(function (perm) {
        paintDataFolder(perm);
        if (perm === 'granted') updateHeader();
      }).catch(function (e) { console.warn(SH.APP_NAME + ': data folder not restored —', e); });

      /* Silently re-attach the projects folder if the browser still grants
         it. If not, the first New/Open click will ask. */
      if (SH.store.restoreRoot) {
        SH.store.restoreRoot().then(function (okRoot) {
          if (okRoot) updateHeader();
        }).catch(function () { /* no cached handle */ });
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', SH.boot);
  else SH.boot();

})(window.SH);
