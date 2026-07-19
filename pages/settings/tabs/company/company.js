/* ==============================================================
   FS Workbench — Settings › Company
   File:     pages/settings/tabs/company/company.js
   Rev:      0.10.0
   Updated:  2026-07-09
   Requires: core.js (>= 0.13.1: SH.modal, SH.APP_NAME),
             settings.js (>= 0.16.0: company.assets[], saveCompanyAsset,
                          companyAssetUrl, deleteCompanyAsset, setLogo)
   --------------------------------------------------------------
   REFERENCE IMPLEMENTATION — copy this pattern for new tabs.
   Shows: scoped CSS, SH.el rendering, reading/writing SH.settings,
   file-based image assets with blob-URL lifecycle, the
   mount/onShow/unmount lifecycle, and cleaning up listeners.

   The company here is the safety professional USING FS Workbench, not the
   client. It is stored in the data folder, never in a project.

   These details are one-time setup. The tab is READ-ONLY until Edit is
   pressed; Save writes every change in one pass, Cancel discards. The logo
   and the additional-image list are part of the same transaction, so Cancel
   can never leave a half-reverted form behind.

   Image storage: the logo and every additional asset are written to the data
   folder as real files (SH.settings.setLogo / saveCompanyAsset). settings.json
   holds only paths — never image bytes. Preview blob: URLs are revoked in
   unmount(). (A legacy company.logo.dataUrl is still rendered read-only for
   settings written before file-based storage existed.)

   Save state comes from SH.settings.status(), never from the return of
   set(). This tab does NOT offer a folder picker or reconnect prompt —
   Data & Storage owns the picker, js/app.js owns the Reconnect bar.

   Lifecycle (core v0.6.x): mount() runs ONCE. onShow() re-reads state
   unless an edit is in progress. unmount() runs only on page teardown.

   0.10.0 — added "Additional images" card (company.assets[]) with file-based
           storage; logo upload now writes the blob via setLogo() instead of
           holding a data URL; blob: URLs revoked on unmount.
   0.9.0 — FS Workbench rebrand (SH.APP_NAME); confirmations via SH.modal.
   0.8.0 — settings.js v0.10.0: status()-driven save state.
   0.7.0 — read-only view with Edit / Save / Cancel.
   0.6.0 — status chip stopped claiming "Saved" with no data folder.
   0.5.0 — v0.6.x lifecycle: onShow() repaint.
   0.4.x — address split; ACN + fax; company.show.* toggles.
   ============================================================== */
SH.registerTab('settings', 'company', {

  mount: function (host) {

    var self = this;
    this._host = host;

    /* blob: URLs created for previews; revoked wholesale on unmount and
       drained/rebuilt whenever the asset list repaints. */
    var blobUrls = [];
    function trackUrl(u) { if (u) blobUrls.push(u); return u; }
    function drainUrls() {
      blobUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      blobUrls = [];
    }

    /* --- 1. scoped styles: prefix every rule with the tab class --- */
    host.appendChild(SH.el('style', { html:
      '.t-company{max-width:820px}' +
      '.t-company .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}' +
      '.t-company .acts{display:flex;gap:8px;flex-shrink:0}' +
      '.t-company .field-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}' +
      '.t-company .vis{margin:0}' +
      '.t-company .vis-lbl{display:inline-flex;align-items:center;gap:5px;font-size:11px;' +
        'font-weight:400;text-transform:none;letter-spacing:normal;color:var(--muted);' +
        'user-select:none;white-space:nowrap;margin:0}' +
      '.t-company.editing .vis-lbl,.t-company.editing .vis{cursor:pointer}' +
      '.t-company .field.off{opacity:.5}' +
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
      '.t-company .img-prev{width:150px;height:90px;border:1px dashed var(--line);' +
        'border-radius:6px;display:flex;align-items:center;justify-content:center;' +
        'background:var(--paper);color:var(--muted);font-size:11px;overflow:hidden;flex-shrink:0}' +
      '.t-company .img-prev img{max-width:100%;max-height:100%}' +
      '.t-company .img-prev.sm{width:96px;height:60px}' +
      /* additional-images list */
      '.t-company .asset-row{display:flex;gap:14px;align-items:center;padding:12px 0;' +
        'border-top:1px solid var(--line)}' +
      '.t-company .asset-row:first-child{border-top:0}' +
      '.t-company .asset-main{flex:1;min-width:0}' +
      '.t-company .asset-main input{width:100%}' +
      '.t-company .asset-lbl-ro{font-weight:600;color:var(--ink)}' +
      '.t-company .asset-file{font-size:11px;color:var(--muted);margin-top:2px;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.t-company .asset-empty{color:var(--muted);font-size:13px;padding:6px 0}' +
      '.t-company .asset-add{margin-top:12px}' +
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

    function memoryOnly() {
      var st = SH.settings.status();
      return st === 'memory' || st === 'none';
    }
    function uid(p) { return p + Math.random().toString(36).slice(2, 8); }

    /* --- 2. migrate the legacy flat address string (one-off, non-destructive) --- */
    (function migrateAddress() {
      var legacy = SH.settings.get('company.address', null);
      if (typeof legacy === 'string') {
        SH.settings.set('company.address', {
          street: legacy.trim(), suburb: '', state: '', postcode: ''
        });
      }
    })();

    /* --- 3. save-state chip, from status() --- */
    var statEl = SH.el('span', { class: 'stat' }, '');
    function paintStatus() {
      var st = SH.settings.status();
      statEl.className = 'stat';
      if (st === 'memory' || st === 'none') {
        statEl.textContent = 'Held in memory only — these details will be lost on reload.';
        statEl.classList.add('bad');
      } else if (st === 'saving') {
        statEl.textContent = 'Saving…'; statEl.classList.add('busy');
      } else if (st === 'unsaved') {
        statEl.textContent = 'Unsaved changes'; statEl.classList.add('warn');
      } else {
        var p = SH.settings.path();
        statEl.textContent = p ? 'Saved to ' + p : 'Saved';
        statEl.classList.add('ok');
      }
    }

    /* --- 4. text/select/checkbox controls register themselves --- */
    var CTRL = [];
    function stored(c) { return SH.settings.get(c.path, c.def); }
    function elGet(c) { return c.kind === 'check' ? !!c.el.checked : c.el.value.trim(); }
    function elSet(c, v) {
      if (c.kind === 'check') c.el.checked = (v !== false);
      else c.el.value = (v == null ? '' : v);
    }
    function differs(c) {
      var a = elGet(c), b = stored(c);
      if (c.kind === 'check') return a !== (b !== false);
      return a !== (b == null ? '' : String(b));
    }

    function visToggle(key, boxEl) {
      var cb = SH.el('input', { type: 'checkbox', class: 'vis' });
      var c = { path: 'company.show.' + key, def: true, el: cb, kind: 'check' };
      CTRL.push(c);
      elSet(c, stored(c));
      c.dim = function () { boxEl.classList.toggle('off', !cb.checked); };
      c.dim();
      cb.addEventListener('change', c.dim);
      return SH.el('label', { class: 'vis-lbl', title: 'Include this on reports' }, cb, 'On reports');
    }

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

    /* --- 5. memory-only warnnote (no picker here) --- */
    var banner = SH.el('div', { class: 'warnnote nofolder', html:
      'No ' + SH.APP_NAME + ' data folder is open, so these details are being held in memory ' +
      'only and will be lost when the page reloads. Choose a folder in ' +
      '<b>Settings › Data &amp; Storage</b>.'
    });

    /* --- 6. text fields --- */
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
    addrHead.appendChild(visToggle('address', street));
    var addrRow = SH.el('div', { class: 'addr-row' },
      field('company.address.suburb', 'Suburb', 'text'),
      stateField('company.address.state', 'State'),
      field('company.address.postcode', 'Postcode', 'text', null, { maxlength: 4, inputmode: 'numeric' })
    );

    /* ============================================================
       7. LOGO — file-based. logoDraft:
          undefined = untouched · null = remove · File = replace
       ============================================================ */
    var logoDraft;
    var logoPrev = SH.el('div', { class: 'img-prev' }, 'No logo');

    // Synchronous read of the persisted logo path/legacy dataUrl.
    function persistedLogo() { return SH.settings.get('company.logo', null); }

    function paintLogo() {
      logoPrev.innerHTML = '';
      if (logoDraft instanceof File) {
        logoPrev.appendChild(SH.el('img', { src: trackUrl(URL.createObjectURL(logoDraft)), alt: 'Company logo' }));
        return;
      }
      if (logoDraft === null) { logoPrev.textContent = 'No logo'; return; }

      var logo = persistedLogo();
      if (!logo) { logoPrev.textContent = 'No logo'; return; }
      // Preferred: a real file, read as a blob URL. Fallback: legacy dataUrl.
      if (logo.file && typeof SH.settings.logoUrl === 'function') {
        Promise.resolve(SH.settings.logoUrl()).then(function (u) {
          if (u) logoPrev.appendChild(SH.el('img', { src: trackUrl(u), alt: 'Company logo' }));
          else if (logo.dataUrl) logoPrev.appendChild(SH.el('img', { src: logo.dataUrl, alt: 'Company logo' }));
          else logoPrev.textContent = 'No logo';
        }, function () { logoPrev.textContent = 'No logo'; });
      } else if (logo.dataUrl) {
        logoPrev.appendChild(SH.el('img', { src: logo.dataUrl, alt: 'Company logo' }));
      } else {
        logoPrev.textContent = 'No logo';
      }
    }

    var logoPicker = SH.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    logoPicker.addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      logoDraft = f; paintLogo();
      e.target.value = '';
    });

    var logoUpload = SH.el('button', { class: 'btn', onClick: function () { logoPicker.click(); } }, 'Upload logo');
    var logoRemove = SH.el('button', { class: 'btn danger', onClick: function () {
      var has = (logoDraft instanceof File) || (logoDraft === undefined && persistedLogo());
      if (!has) return;
      function drop() { logoDraft = null; paintLogo(); }
      if (!SH.settings.get('prefs.confirmBeforeDelete', true)) { drop(); return; }
      SH.modal('Remove logo',
        SH.el('p', null, 'Remove the company logo? It is removed when you press Save.'),
        [ { label: 'Keep', ghost: true, onClick: function (c) { c(); } },
          { label: 'Remove',            onClick: function (c) { drop(); c(); } } ]);
    } }, 'Remove logo');

    /* ============================================================
       8. ADDITIONAL IMAGES — company.assets[]
          Draft model held entirely in memory until Save:
            assetDraft = [{ id, label, path?, file?, remove? }]
          path  = already persisted · file = new upload (not yet written)
          remove = true = delete on Save
       ============================================================ */
    var assetDraft = null;   // null until first edit read; array while editing/dirty

    function persistedAssets() {
      var a = SH.settings.get('company.assets', []);
      return Array.isArray(a) ? a : [];
    }
    function assetsSnapshot() {
      return persistedAssets().map(function (a) {
        return { id: a.id, label: a.label || '', path: a.file || '', file: null, remove: false };
      });
    }
    function workingAssets() { return assetDraft || assetsSnapshot(); }

    var assetList = SH.el('div', { class: 'asset-list' });
    var assetAddBtn = SH.el('button', { class: 'btn sm asset-add' }, '+ Add image');

    function rowPreview(a) {
      var box = SH.el('div', { class: 'img-prev sm' }, '…');
      if (a.file instanceof File) {
        box.innerHTML = '';
        box.appendChild(SH.el('img', { src: trackUrl(URL.createObjectURL(a.file)), alt: a.label || 'Image' }));
      } else if (a.path && typeof SH.settings.companyAssetUrl === 'function') {
        Promise.resolve(SH.settings.companyAssetUrl(a.path)).then(function (u) {
          box.innerHTML = '';
          if (u) box.appendChild(SH.el('img', { src: trackUrl(u), alt: a.label || 'Image' }));
          else box.textContent = 'No preview';
        }, function () { box.textContent = 'No preview'; });
      } else {
        box.textContent = 'No preview';
      }
      return box;
    }

    function paintAssets() {
      assetList.innerHTML = '';
      var rows = workingAssets().filter(function (a) { return !a.remove; });

      if (!rows.length) {
        assetList.appendChild(SH.el('div', { class: 'asset-empty' },
          editing ? 'No additional images yet. Use “Add image”.'
                  : 'No additional images.'));
      }

      rows.forEach(function (a) {
        var main;
        if (editing) {
          var lbl = SH.el('input', { type: 'text', value: a.label || '', placeholder: 'Label (e.g. Approval mark)' });
          lbl.addEventListener('input', function () { a.label = lbl.value; });
          main = SH.el('div', { class: 'asset-main' }, lbl);
        } else {
          main = SH.el('div', { class: 'asset-main' },
            SH.el('div', { class: 'asset-lbl-ro' }, a.label || 'Untitled image'),
            a.path ? SH.el('div', { class: 'asset-file', title: a.path }, a.path) : null);
        }

        var row = SH.el('div', { class: 'asset-row' }, rowPreview(a), main);

        if (editing) {
          var rm = SH.el('button', { class: 'btn danger sm', onClick: function () {
            function drop() {
              if (a.path) a.remove = true;                 // persisted -> mark for delete on Save
              else {                                        // never-saved upload -> just forget it
                var i = assetDraft.indexOf(a);
                if (i >= 0) assetDraft.splice(i, 1);
              }
              paintAssets();
            }
            if (!SH.settings.get('prefs.confirmBeforeDelete', true)) { drop(); return; }
            SH.modal('Remove image',
              SH.el('p', null, 'Remove “' + (a.label || 'this image') + '”? It is removed when you press Save.'),
              [ { label: 'Keep', ghost: true, onClick: function (c) { c(); } },
                { label: 'Remove',            onClick: function (c) { drop(); c(); } } ]);
          } }, 'Remove');
          row.appendChild(rm);
        }
        assetList.appendChild(row);
      });

      assetAddBtn.disabled = !editing || memoryOnly();
      assetAddBtn.classList.toggle('hidden', !editing);
    }

    var assetPicker = SH.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    assetPicker.addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!assetDraft) assetDraft = assetsSnapshot();
      assetDraft.push({ id: uid('casset_'), label: '', path: '', file: f, remove: false });
      paintAssets();
      e.target.value = '';
    });
    assetAddBtn.addEventListener('click', function () {
      if (memoryOnly()) { alert('Choose a data folder in Settings › Data & Storage before adding images.'); return; }
      assetPicker.click();
    });

    /* --- 9. edit / save / cancel --- */
    var editing = false;
    var editBtn   = SH.el('button', { class: 'btn' }, 'Edit');
    var saveBtn   = SH.el('button', { class: 'btn hidden' }, 'Save');
    var cancelBtn = SH.el('button', { class: 'btn ghost hidden' }, 'Cancel');

    function assetsDirty() {
      if (!assetDraft) return false;
      var base = assetsSnapshot();
      var live = assetDraft.filter(function (a) { return !a.remove; });
      if (live.length !== base.length) return true;
      for (var i = 0; i < assetDraft.length; i++) {
        var a = assetDraft[i];
        if (a.file || a.remove) return true;
        var b = base.filter(function (x) { return x.id === a.id; })[0];
        if (!b || b.label !== a.label) return true;
      }
      return false;
    }
    function isDirty() {
      if (logoDraft !== undefined) return true;
      if (assetsDirty()) return true;
      for (var i = 0; i < CTRL.length; i++) if (differs(CTRL[i])) return true;
      return false;
    }

    function paintAll() {
      CTRL.forEach(function (c) { elSet(c, stored(c)); if (c.dim) c.dim(); });
      drainUrls();
      paintLogo();
      paintAssets();
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
      logoUpload.disabled = !on;
      logoRemove.disabled = !on;
      editBtn.classList.toggle('hidden', on);
      saveBtn.classList.toggle('hidden', !on);
      cancelBtn.classList.toggle('hidden', !on);
      paintAssets();
    }

    function doCancel() {
      logoDraft = undefined;
      assetDraft = null;
      setEditing(false);
      paintAll();
    }

    editBtn.addEventListener('click', function () {
      assetDraft = assetsSnapshot();   // take a working copy up front
      setEditing(true);
      paintAssets();
      CTRL[0].el.focus();
    });

    cancelBtn.addEventListener('click', function () {
      if (!isDirty()) { doCancel(); return; }
      SH.modal('Discard changes',
        SH.el('p', null, 'Discard your changes to the company details?'),
        [ { label: 'Keep editing', ghost: true, onClick: function (c) { c(); } },
          { label: 'Discard',                   onClick: function (c) { c(); doCancel(); } } ]);
    });

    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      Promise.resolve()
        .then(commitText)
        .then(commitLogo)
        .then(commitAssets)
        .then(function () {
          logoDraft = undefined;
          assetDraft = null;
          setEditing(false);
          paintAll();
        })
        .catch(function (err) {
          console.error(err);
          alert('Could not save everything: ' + (err && err.message ? err.message : err) +
                '\nYour entries are still here — check Settings › Data & Storage.');
          paintStatus();
        })
        .then(function () { saveBtn.disabled = false; });
    });

    // set() never throws; these are synchronous.
    function commitText() {
      CTRL.forEach(function (c) { if (differs(c)) SH.settings.set(c.path, elGet(c)); });
    }

    function commitLogo() {
      if (logoDraft === undefined) return;
      if (logoDraft === null) return SH.settings.clearLogo();
      if (logoDraft instanceof File && typeof SH.settings.setLogo === 'function') {
        return SH.settings.setLogo(logoDraft);            // writes blob, stores { file }
      }
      // Fallback if setLogo isn't present: keep the old scaffold behaviour.
      return new Promise(function (res) {
        var r = new FileReader();
        r.onload = function () { SH.settings.set('company.logo', { file: logoDraft.name, dataUrl: r.result }); res(); };
        r.readAsDataURL(logoDraft);
      });
    }

    function commitAssets() {
      if (!assetDraft) return;
      var work = assetDraft.slice();
      return work.reduce(function (chain, a) {
        return chain.then(function () {
          if (a.remove) { if (a.path) return SH.settings.deleteCompanyAsset(a.path); return; }
          if (a.file instanceof File) {
            return Promise.resolve(SH.settings.saveCompanyAsset(a.file)).then(function (p) { a.path = p; });
          }
        });
      }, Promise.resolve()).then(function () {
        // Rebuild the persisted array from the surviving rows, in order.
        var out = work.filter(function (a) { return !a.remove && a.path; })
                      .map(function (a) { return { id: a.id, label: (a.label || '').trim(), file: a.path }; });
        SH.settings.set('company.assets', out);
      });
    }

    /* --- 10. assemble --- */
    wrap.appendChild(SH.el('div', { class: 'card' },
      SH.el('div', { class: 'card-head' },
        SH.el('div', null,
          SH.el('h2', { class: 'section' }, 'Your company'),
          SH.el('p', { class: 'hint', html:
            'Entered once and applied to every report. Stored in the ' + SH.APP_NAME +
            ' data folder — not in any project. Client details belong in <b>Project Details</b>.' })
        ),
        SH.el('div', { class: 'acts' }, editBtn, cancelBtn, saveBtn)
      ),
      banner,
      nameField, grid, addrHead, street, addrRow,
      statEl
    ));

    wrap.appendChild(SH.el('div', { class: 'card', style: 'margin-top:16px' },
      SH.el('h2', { class: 'section' }, 'Report logo'),
      SH.el('div', { class: 'logo-box' },
        logoPrev,
        SH.el('div', null,
          logoUpload, ' ', logoRemove,
          SH.el('p', { class: 'hint', style: 'margin-top:8px', html:
            'PNG or SVG with a transparent background works best. Appears on the title page ' +
            'and, if enabled, in the report header. Press <b>Edit</b> to change it.' })
        )
      ),
      logoPicker
    ));

    wrap.appendChild(SH.el('div', { class: 'card', style: 'margin-top:16px' },
      SH.el('h2', { class: 'section' }, 'Additional images'),
      SH.el('p', { class: 'hint', html:
        'Extra branding marks — approval ticks, secondary logos — available to place on report ' +
        'title pages and other sections. Give each a clear label. Press <b>Edit</b> to change these.' }),
      assetList,
      assetAddBtn,
      assetPicker
    ));

    paintAll();
    setEditing(false);

    /* --- 11. bus wiring --- */
    this._paintAll = paintAll;
    this._drain = drainUrls;
    this._isEditing = function () { return editing; };
    this._onChanged = function () { if (!editing) paintAll(); };
    this._onStatus  = function () {
      banner.classList.toggle('on', memoryOnly());
      paintStatus();
      if (editing) paintAssets();   // Add button enablement tracks folder state
    };
    SH.bus.on('settings:changed', this._onChanged);
    SH.bus.on('settings:status',  this._onStatus);
  },

  onShow: function () {
    if (this._paintAll && this._isEditing && !this._isEditing()) this._paintAll();
  },

  /* Page teardown: revoke every preview blob: URL, drop both listeners. */
  unmount: function () {
    if (this._onChanged) SH.bus.off('settings:changed', this._onChanged);
    if (this._onStatus)  SH.bus.off('settings:status',  this._onStatus);
    if (this._drain) this._drain();          // revoke tracked object URLs
    this._onChanged = null; this._onStatus = null;
    this._paintAll = null; this._isEditing = null; this._drain = null;
  }
});
