/* ==============================================================
   BroSafe — Settings › Company
   File:     pages/settings/tabs/company/company.js
   Rev:      0.8.0
   Updated:  2026-07-09
   Requires: core.js, settings.js (>= 0.10.0)
   --------------------------------------------------------------
   REFERENCE IMPLEMENTATION — copy this pattern for new tabs.
   Shows: scoped CSS, SH.el rendering, reading/writing SH.settings,
   the mount/onShow/unmount lifecycle, and cleaning up listeners.

   The company here is the safety professional USING BroSafe, not the
   client. It is stored in the BroSafe data folder, never in a project.

   These details are one-time setup. The tab is READ-ONLY until Edit is
   pressed; Save writes every changed path in one pass, Cancel discards.
   The logo is part of the same transaction, so Cancel cannot leave a
   half-reverted form behind.

   Save state comes from SH.settings.status(), never from the return of
   set(). This tab does NOT offer a folder picker or a reconnect prompt —
   Data & Storage owns the picker, js/app.js owns the Reconnect bar.

   Lifecycle (core v0.6.x): mount() runs ONCE. onShow() re-reads state,
   unless an edit is in progress. unmount() runs only on page teardown.

   0.8.0 — settings.js v0.10.0: read status() instead of feature-detecting
          the data folder; save chip bound to settings:status; removed this
          tab's "Choose data folder…" button.
   0.7.0 — read-only view with Edit / Save / Cancel. One write on Save.
   0.6.0 — status chip no longer claims "Saved" with no data folder open.
   0.5.0 — v0.6.x lifecycle: added onShow() to repaint from settings.
   0.4.1 — removed the "name only" master switch; Fax label tidied.
   0.4.0 — address split into street/suburb/state/postcode; added ACN and
          fax; removed preparedByDefault; added company.show.*.
   ============================================================== */
SH.registerTab('settings', 'company', {

  mount: function (host) {

    var self = this;
    this._host = host;

    /* --- 1. scoped styles: prefix every rule with the tab class --- */
    host.appendChild(SH.el('style', { html:
      '.t-company{max-width:820px}' +
      '.t-company .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}' +
      '.t-company .acts{display:flex;gap:8px;flex-shrink:0}' +
      '.t-company .field-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}' +
      '.t-company .vis{margin:0}' +
      /* reset the global label treatment (uppercase/tracked/block) for the toggle */
      '.t-company .vis-lbl{display:inline-flex;align-items:center;gap:5px;font-size:11px;' +
        'font-weight:400;text-transform:none;letter-spacing:normal;color:var(--muted);' +
        'user-select:none;white-space:nowrap;margin:0}' +
      '.t-company.editing .vis-lbl,.t-company.editing .vis{cursor:pointer}' +
      '.t-company .field.off{opacity:.5}' +
      /* read-only fields stay full contrast: a colleague must be able to copy the ABN */
      '.t-company input[readonly]{background:var(--paper);border-color:var(--line);cursor:default}' +
      '.t-company select:disabled{background:var(--paper);color:var(--ink);opacity:1}' +
      '.t-company .subhead{font-size:11px;letter-spacing:.06em;text-transform:uppercase;' +
        'color:var(--muted);margin:22px 0 10px;display:flex;align-items:center;' +
        'justify-content:space-between;gap:8px}' +
      '.t-company .addr-row{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px}' +
      '@media(max-width:640px){.t-company .addr-row{grid-template-columns:1fr}}' +
      '.t-company .nofolder{display:none;margin-bottom:16px}' +
      '.t-company .nofolder.on{display:block}' +
      '.t-company .logo-box{display:flex;gap:18px;align-items:center}' +
      '.t-company .logo-prev{width:150px;height:90px;border:1px dashed var(--line);' +
        'border-radius:6px;display:flex;align-items:center;justify-content:center;' +
        'background:var(--paper);color:var(--muted);font-size:11px;overflow:hidden}' +
      '.t-company .logo-prev img{max-width:100%;max-height:100%}' +
      '.t-company .stat{font-size:12px;font-weight:600;min-height:16px;display:block;margin-top:12px}' +
      '.t-company .stat.ok{color:var(--pass)}' +
      '.t-company .stat.busy{color:var(--muted)}' +
      '.t-company .stat.warn{color:var(--warn)}' +
      '.t-company .stat.bad{color:var(--fail)}' +
      '.t-company .hidden{display:none}'
    }));

    var wrap = SH.el('div', { class: 't-company' });
    host.appendChild(wrap);

    var STATES = ['', 'ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

    /* Nothing reaches disk in either of these states. 'memory' = never chose
       a folder or refused permission; 'none' = no folder at all. */
    function memoryOnly() {
      var st = SH.settings.status();
      return st === 'memory' || st === 'none';
    }

    /* --- 2. migrate the legacy flat address string (one-off, non-destructive) --- */
    (function migrateAddress() {
      var legacy = SH.settings.get('company.address', null);
      if (typeof legacy === 'string') {
        SH.settings.set('company.address', {
          street: legacy.trim(), suburb: '', state: '', postcode: ''
        });
      }
    })();

    /* --- 3. save state. Read from SH.settings.status(); never inferred from
           the return of set(), which cannot fail. Repainted on
           settings:status, which is what that event is for. --- */
    var statEl = SH.el('span', { class: 'stat' }, '');
    function paintStatus() {
      var st = SH.settings.status();
      statEl.className = 'stat';
      if (st === 'memory' || st === 'none') {
        statEl.textContent = 'Held in memory only — these details will be lost on reload.';
        statEl.classList.add('bad');
      } else if (st === 'saving') {
        statEl.textContent = 'Saving…';
        statEl.classList.add('busy');
      } else if (st === 'unsaved') {
        statEl.textContent = 'Unsaved changes';
        statEl.classList.add('warn');
      } else {                                   // 'saved'
        var p = SH.settings.path();
        statEl.textContent = p ? 'Saved to ' + p : 'Saved';
        statEl.classList.add('ok');
      }
    }

    /* --- 4. the controls register themselves. One list drives painting,
           dirty-checking and committing — so a field cannot be added to the
           form and forgotten by Save. --- */
    var CTRL = [];   // { path, def, el, kind: 'text'|'select'|'check' }

    function stored(c) { return SH.settings.get(c.path, c.def); }
    function elGet(c) {
      if (c.kind === 'check') return !!c.el.checked;
      return c.el.value.trim();
    }
    function elSet(c, v) {
      if (c.kind === 'check') c.el.checked = (v !== false);
      else c.el.value = (v == null ? '' : v);
    }
    function differs(c) {
      var a = elGet(c), b = stored(c);
      if (c.kind === 'check') return a !== (b !== false);
      return a !== (b == null ? '' : String(b));
    }

    /* --- 5. report visibility. Company name is always shown, so it has no
           toggle. Everything else stores company.show.<key>, default true. --- */
    function visToggle(key, boxEl) {
      var cb = SH.el('input', { type: 'checkbox', class: 'vis' });
      var c = { path: 'company.show.' + key, def: true, el: cb, kind: 'check' };
      CTRL.push(c);
      elSet(c, stored(c));
      c.dim = function () { boxEl.classList.toggle('off', !cb.checked); };
      c.dim();
      cb.addEventListener('change', c.dim);      // draft only — no write until Save
      return SH.el('label', { class: 'vis-lbl', title: 'Include this on reports' }, cb, 'On reports');
    }

    /* --- 6. field builders. `visKey` is optional; omit it for a field that
           is always shown, or one covered by another field's toggle. --- */
    function field(path, label, type, visKey, attrs) {
      var input = SH.el('input', { type: type });
      if (attrs && attrs.maxlength) input.maxLength = attrs.maxlength;
      if (attrs && attrs.inputmode) input.setAttribute('inputmode', attrs.inputmode);

      var c = { path: path, def: '', el: input, kind: 'text' };
      CTRL.push(c);
      elSet(c, stored(c));

      var box = SH.el('div', { class: 'field' });
      var head = SH.el('div', { class: 'field-head' }, SH.el('label', null, label));
      if (visKey) head.appendChild(visToggle(visKey, box));
      box.appendChild(head);
      box.appendChild(input);
      return box;
    }

    function stateField(path, label) {
      var sel = SH.el('select');
      STATES.forEach(function (s) { sel.appendChild(SH.el('option', { value: s }, s || '—')); });

      var c = { path: path, def: '', el: sel, kind: 'select' };
      CTRL.push(c);
      elSet(c, stored(c));

      var box = SH.el('div', { class: 'field' });
      box.appendChild(SH.el('div', { class: 'field-head' }, SH.el('label', null, label)));
      box.appendChild(sel);
      return box;
    }

    /* --- 7. memory-only warnnote. No picker and no reconnect prompt here:
           Data & Storage owns the picker, js/app.js owns the Reconnect bar.
           A per-tab picker trains users to re-pick the folder. --- */
    var banner = SH.el('div', { class: 'warnnote nofolder', html:
      'No BroSafe data folder is open, so these details are being held in memory only and ' +
      'will be lost when the page reloads. Choose a folder in <b>Settings › Data &amp; Storage</b>.'
    });

    /* --- 8. fields --- */
    var nameField = field('company.name', 'Company name', 'text');

    var grid = SH.el('div', { class: 'grid2' },
      field('company.abn',     'ABN',                  'text', 'abn'),
      field('company.acn',     'ACN',                  'text', 'acn'),
      field('company.licence', 'Licence / REC number', 'text', 'licence'),
      field('company.phone',   'Phone',                'text', 'phone'),
      field('company.fax',     'Fax',                  'text', 'fax'),
      field('company.email',   'Email',                'email', 'email'),
      field('company.website', 'Website',              'text', 'website')
    );

    var addrHead = SH.el('div', { class: 'subhead' }, SH.el('span', null, 'Address'));
    var street = field('company.address.street', 'Street address', 'text');
    addrHead.appendChild(visToggle('address', street));   // one toggle covers the block

    var addrRow = SH.el('div', { class: 'addr-row' },
      field('company.address.suburb', 'Suburb', 'text'),
      stateField('company.address.state', 'State'),
      field('company.address.postcode', 'Postcode', 'text',
            null, { maxlength: 4, inputmode: 'numeric' })
    );

    /* --- 9. logo. `logoDraft`: undefined = untouched, null = remove,
            object = replace. Committed by Save, thrown away by Cancel. --- */
    var logoDraft;
    var preview = SH.el('div', { class: 'logo-prev' }, 'No logo');

    function currentLogo() {
      return (logoDraft !== undefined) ? logoDraft : SH.settings.get('company.logo', null);
    }
    function paintLogo() {
      var logo = currentLogo();
      preview.innerHTML = '';
      if (logo && logo.dataUrl) preview.appendChild(SH.el('img', { src: logo.dataUrl, alt: 'Company logo' }));
      else preview.textContent = 'No logo';
    }

    var picker = SH.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    picker.addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        // Scaffold: hold as a data URL. Once SH.settings exposes setLogo(file)
        // this should write assets/logo.png and store the path instead.
        logoDraft = { file: f.name, dataUrl: r.result };
        paintLogo();
      };
      r.readAsDataURL(f);
      e.target.value = '';
    });

    var uploadBtn = SH.el('button', { class: 'btn', onClick: function () { picker.click(); } }, 'Upload logo');
    var removeBtn = SH.el('button', { class: 'btn danger', onClick: function () {
      if (!currentLogo()) return;
      if (SH.settings.get('prefs.confirmBeforeDelete', true) &&
          !confirm('Remove the company logo? It is removed when you press Save.')) return;
      logoDraft = null; paintLogo();
    } }, 'Remove logo');

    /* --- 10. edit / save / cancel --- */
    var editing = false;

    var editBtn   = SH.el('button', { class: 'btn' }, 'Edit');
    var saveBtn   = SH.el('button', { class: 'btn hidden' }, 'Save');
    var cancelBtn = SH.el('button', { class: 'btn ghost hidden' }, 'Cancel');

    function isDirty() {
      if (logoDraft !== undefined) return true;
      for (var i = 0; i < CTRL.length; i++) if (differs(CTRL[i])) return true;
      return false;
    }

    /* Repaint every control from SH.settings. Used on entry, Cancel, onShow
       and any external settings:changed — never while editing. */
    function paintAll() {
      CTRL.forEach(function (c) { elSet(c, stored(c)); if (c.dim) c.dim(); });
      paintLogo();
      banner.classList.toggle('on', memoryOnly());
      paintStatus();
    }

    function setEditing(on) {
      editing = on;
      wrap.classList.toggle('editing', on);
      CTRL.forEach(function (c) {
        if (c.kind === 'text') c.el.readOnly = !on;
        else c.el.disabled = !on;
      });
      uploadBtn.disabled = !on;
      removeBtn.disabled = !on;
      editBtn.classList.toggle('hidden', on);
      saveBtn.classList.toggle('hidden', !on);
      cancelBtn.classList.toggle('hidden', !on);
    }

    editBtn.addEventListener('click', function () {
      setEditing(true);
      CTRL[0].el.focus();
    });

    cancelBtn.addEventListener('click', function () {
      if (isDirty() && !confirm('Discard your changes to the company details?')) return;
      logoDraft = undefined;
      setEditing(false);
      paintAll();                                  // also picks up anything changed elsewhere
    });

    saveBtn.addEventListener('click', function () {
      // set() never throws and never fails. Write only what actually changed,
      // so a Save with no edits emits nothing.
      CTRL.forEach(function (c) {
        if (differs(c)) SH.settings.set(c.path, elGet(c));
      });
      if (logoDraft !== undefined) {
        if (logoDraft === null) SH.settings.clearLogo();
        else SH.settings.set('company.logo', logoDraft);
        logoDraft = undefined;
      }
      setEditing(false);
      paintAll();          // status() now reports the truth, whatever it is
    });

    /* --- 11. assemble --- */
    wrap.appendChild(SH.el('div', { class: 'card' },
      SH.el('div', { class: 'card-head' },
        SH.el('div', null,
          SH.el('h2', { class: 'section' }, 'Your company'),
          SH.el('p', { class: 'hint', html:
            'Entered once and applied to every report. Stored in the BroSafe data folder — ' +
            'not in any project. Client details belong in <b>Project Details</b>.' })
        ),
        SH.el('div', { class: 'acts' }, editBtn, cancelBtn, saveBtn)
      ),
      banner,
      nameField,
      grid,
      addrHead,
      street,
      addrRow,
      statEl
    ));

    wrap.appendChild(SH.el('div', { class: 'card', style: 'margin-top:16px' },
      SH.el('h2', { class: 'section' }, 'Report logo'),
      SH.el('div', { class: 'logo-box' },
        preview,
        SH.el('div', null,
          uploadBtn, ' ', removeBtn,
          SH.el('p', { class: 'hint', style: 'margin-top:8px', html:
            'PNG or SVG with a transparent background works best. Appears on the title page ' +
            'and, if enabled, in the report header. Press <b>Edit</b> to change it.' })
        )
      ),
      picker
    ));

    paintAll();
    setEditing(false);

    /* --- 12. two events, two jobs. `settings:changed` = the data moved, so
            repaint the form — but never over an open edit; the form is the
            source of truth until Save or Cancel. `settings:status` = only
            the save state moved, so repaint the chip and the warnnote. --- */
    this._paintAll = paintAll;
    this._isEditing = function () { return editing; };

    this._onChanged = function () { if (!editing) paintAll(); };
    this._onStatus  = function () {
      banner.classList.toggle('on', memoryOnly());
      paintStatus();
    };

    SH.bus.on('settings:changed', this._onChanged);
    SH.bus.on('settings:status',  this._onStatus);
  },

  /* --- 13. revealed again: re-read, unless the user left an edit open. --- */
  onShow: function () {
    if (this._paintAll && this._isEditing && !this._isEditing()) this._paintAll();
  },

  /* --- 14. teardown: page is being discarded. No blob: URLs and no timers
          here (the logo is a data URL in settings), so only the two bus
          listeners need releasing. --- */
  unmount: function () {
    if (this._onChanged) SH.bus.off('settings:changed', this._onChanged);
    if (this._onStatus)  SH.bus.off('settings:status',  this._onStatus);
    this._onChanged = null; this._onStatus = null;
    this._paintAll = null; this._isEditing = null;
  }
});