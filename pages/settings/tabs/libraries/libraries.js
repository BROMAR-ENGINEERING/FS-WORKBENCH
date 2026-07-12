/* ==============================================================
   BroSafe — Settings › Component Libraries
   File:     pages/settings/tabs/libraries/libraries.js
   Rev:      0.5.1
   Updated:  2026-07-09
   Requires: core.js, settings.js (>= 0.8.0); lazy-loads js/lib.js
   --------------------------------------------------------------
   Tab module. Installs, lists, browses and removes SISTEMA VDMA
   66413 libraries under <data folder>/libraries/<slug>/, and
   exports or imports the custom component library. All filesystem
   work goes through SH.lib. Reads settings only — never SH.store.
   mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('settings', 'libraries', (function () {
  'use strict';

  var host = null;
  var records = [];         // [{slug, lib, error}]
  var busy = false;
  var token = { cancelled: false };
  var onSettings = null;

  /* Blob URLs are tracked in two pools because they have different lifetimes.
     Tabs are kept alive since v0.6.0 — mount() runs once and unmount() may not
     run for hours — so anything created per-render must be revoked per-render,
     not left for unmount(). The icon pool is redrawn on every keystroke in the
     View filter; 200 icons x N keystrokes would otherwise pin every PNG in
     memory for the life of the session. */
  var iconUrls = [];        // recreated on each rows() render
  var tempUrls = [];        // export downloads, revoked on unmount

  /* ---------- helpers ----------------------------------------------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function revoke(pool) {
    pool.forEach(function (u) { URL.revokeObjectURL(u); });
    pool.length = 0;
  }

  function sGet(path, dflt) {
    try { return SH.settings.get(path, dflt); } catch (e) { return dflt; }
  }
  function sSet(path, val) {
    try { SH.settings.set(path, val); return true; } catch (e) { return false; }
  }

  async function ensureLib() {
    if (SH.lib) return;
    await SH.loader.load('js/lib.js');
    for (var i = 0; i < 60 && !SH.lib; i++) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    if (!SH.lib) throw new Error('js/lib.js failed to load.');
  }

  function $(sel) { return host ? host.querySelector(sel) : null; }

  /* ---------- render ------------------------------------------------------ */

  function render() {
    if (!host) return;
    revoke(iconUrls);
    revoke(tempUrls);

    if (!window.showDirectoryPicker) {
      host.innerHTML = '<h2 class="section">Component Libraries</h2>' +
        '<div class="warnnote">This browser cannot read folders. Component libraries ' +
        'need Microsoft Edge or Google Chrome — Firefox and Safari do not support the ' +
        'File System Access API.</div>';
      return;
    }

    host.innerHTML =
      '<h2 class="section">Component Libraries</h2>' +

      '<div class="card">' +
      '<p class="hint">SISTEMA libraries are VDMA 66413 XML files published by each ' +
      'manufacturer. Point BroSafe at a vendor folder and it is copied into your data ' +
      'folder under <code>libraries/</code>. Nothing is downloaded; nothing leaves this ' +
      'machine.</p>' +
      '<div id="libs-body"><p class="hint">Reading…</p></div>' +
      '<p>' +
      '<button class="btn" id="btn-add">Add library…</button> ' +
      '<button class="btn" id="btn-rescan">Rescan</button>' +
      '<label class="chk" style="margin-left:1rem"><input type="checkbox" id="chk-pdf"> ' +
      'also copy datasheets (PDF folder — can be very large)</label>' +
      '</p>' +
      '<div id="libs-progress"></div>' +
      '<div id="lib-detail"></div>' +
      '</div>' +

      '<div class="card">' +
      '<h2 class="section">Custom component library</h2>' +
      '<p class="hint">Your own components — the ones no manufacturer publishes. Export to ' +
      'share them with a colleague, or import a file they sent you.</p>' +
      '<p><button class="btn" id="btn-export">Export…</button> ' +
      '<button class="btn" id="btn-import">Import…</button>' +
      '<input type="file" id="file-import" accept="application/json,.json" hidden></p>' +
      '<div id="custom-msg"></div>' +
      '</div>';

    $('#btn-add').onclick = onAdd;
    $('#btn-rescan').onclick = function () { if (SH.lib) SH.lib.clearCache(); refresh(); };
    $('#btn-export').onclick = onExport;
    $('#btn-import').onclick = function () { $('#file-import').click(); };
    $('#file-import').onchange = onImport;

    refresh();
  }

  async function refresh() {
    var body = $('#libs-body');
    if (!body) return;

    // Any open detail panel is about to be stale; close it and drop its icons.
    var detail = $('#lib-detail');
    if (detail) detail.innerHTML = '';
    revoke(iconUrls);

    body.innerHTML = '<p class="hint">Reading…</p>';

    try {
      await ensureLib();
    } catch (e) {
      body.innerHTML = '<div class="warnnote">' + esc(e.message) + '</div>';
      return;
    }

    try {
      records = await SH.lib.list();
    } catch (e) {
      body.innerHTML = '<div class="warnnote">No BroSafe data folder is connected. ' +
        'Choose one in <strong>Settings › Data &amp; Storage</strong>, then come back.</div>';
      return;
    }

    if (!host) return;   // unmounted while we were awaiting

    if (!records.length) {
      body.innerHTML = '<p class="hint">No libraries installed. Use <strong>Add library…</strong> ' +
        'and pick a manufacturer folder — the one containing the <code>.xml</code> file.</p>';
      return;
    }

    body.innerHTML =
      '<table class="tbl"><thead><tr>' +
      '<th>Manufacturer</th><th>Version</th><th>Contents</th><th>Notes</th><th></th>' +
      '</tr></thead><tbody>' + records.map(row).join('') + '</tbody></table>';

    body.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function () { onRemove(b.getAttribute('data-remove')); };
    });
    body.querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = function () { onView(b.getAttribute('data-view')); };
    });
    body.querySelectorAll('[data-warn]').forEach(function (b) {
      b.onclick = function () { onWarnings(b.getAttribute('data-warn')); };
    });
  }

  function row(rec) {
    if (rec.error) {
      return '<tr><td colspan="4"><strong>' + esc(rec.slug) + '</strong><br>' +
        '<span class="warnnote">' + esc(rec.error) + '</span></td>' +
        '<td><button class="btn" data-remove="' + esc(rec.slug) + '">Remove</button></td></tr>';
    }
    var c = rec.lib.counts, m = rec.lib.manufacturer, notes = '';
    if (c.archived) notes += '<span class="pill">' + c.archived + ' discontinued</span> ';
    if (c.merged) notes += '<span class="pill">' + c.merged + ' merged</span> ';
    if (c.derivedB10d) notes += '<span class="pill">' + c.derivedB10d + ' B10d derived</span> ';
    if (!c.withIcon) notes += '<span class="pill">no icons</span> ';
    if (rec.lib.warnings.length) {
      notes += '<button class="btn" data-warn="' + esc(rec.slug) + '">' +
        rec.lib.warnings.length + ' warnings</button> ';
    }
    return '<tr>' +
      '<td><strong>' + esc(m.name) + '</strong><br><span class="hint">' + esc(rec.lib.file) + '</span></td>' +
      '<td>' + esc(m.version || '—') + '<br><span class="hint">' + esc(rec.lib.crc32 || '') + '</span></td>' +
      '<td>' + c.devices + ' devices<br><span class="hint">' + c.useCases + ' use cases</span></td>' +
      '<td>' + (notes || '<span class="hint">—</span>') + '</td>' +
      '<td><button class="btn" data-view="' + esc(rec.slug) + '">View</button> ' +
      '<button class="btn" data-remove="' + esc(rec.slug) + '">Remove</button></td>' +
      '</tr>';
  }

  /* ---------- add --------------------------------------------------------- */

  function onAdd() {
    if (busy) return;
    var wantPdf = $('#chk-pdf').checked;
    var prog = $('#libs-progress');

    /* The picker MUST be the first statement in this handler. Await anything
       beforehand and the user gesture is lost — Chrome rejects the call. */
    var picking = window.showDirectoryPicker({ id: 'brosafe-lib-src', mode: 'read' });

    busy = true;
    token = { cancelled: false };
    prog.innerHTML = '<p class="hint">Copying… <progress id="pg" value="0" max="1"></progress> ' +
      '<span id="pg-txt"></span> <button class="btn" id="btn-cancel">Cancel</button></p>';
    prog.querySelector('#btn-cancel').onclick = function () { token.cancelled = true; };

    function progress(done, total) {
      var pg = prog.querySelector('#pg'), tx = prog.querySelector('#pg-txt');
      if (pg) { pg.value = done; pg.max = total; }
      if (tx) tx.textContent = done + ' / ' + total + ' files';
    }

    picking
      .then(function (src) {
        return ensureLib().then(function () {
          return SH.lib.install(src, { pdf: wantPdf, token: token, onProgress: progress })
            .catch(function (err) {
              if (err.code !== 'EXISTS') throw err;
              var ask = sGet('prefs.confirmBeforeDelete', true);
              if (ask && !window.confirm(err.message + '\n\nReplace it? The existing folder ' +
                'and its icons will be deleted.')) throw new Error('Cancelled.');
              return SH.lib.install(src, {
                pdf: wantPdf, token: token, replace: true, onProgress: progress
              });
            });
        });
      })
      .then(function (parsed) {
        if (!host) return;
        prog.innerHTML = '<p class="hint">Installed ' + esc(parsed.manufacturer.name) + ' — ' +
          parsed.counts.devices + ' devices, ' + parsed.counts.useCases + ' use cases.</p>';
        refresh();
      })
      .catch(function (err) {
        if (!host) return;
        // AbortError = the user closed the picker. Not worth a warning.
        if (err && err.name === 'AbortError') prog.innerHTML = '';
        else prog.innerHTML = '<div class="warnnote">' + esc(err.message || String(err)) + '</div>';
      })
      .then(function () { busy = false; });
  }

  /* ---------- remove ------------------------------------------------------ */

  async function onRemove(slug) {
    if (busy) return;
    var rec = records.filter(function (r) { return r.slug === slug; })[0];
    var label = (rec && rec.lib) ? rec.lib.manufacturer.name : slug;

    if (sGet('prefs.confirmBeforeDelete', true)) {
      if (!window.confirm('Remove ' + label + '?\n\nThe folder and its icons are deleted ' +
        'from your data folder. Existing reports keep their snapshotted values, but parts ' +
        'will show as unresolved when you next edit a safety function.')) return;
    }

    try {
      await SH.lib.remove(slug);
    } catch (e) {
      if ($('#libs-progress')) {
        $('#libs-progress').innerHTML =
          '<div class="warnnote">Could not remove: ' + esc(e.message) + '</div>';
      }
    }
    refresh();
  }

  /* ---------- warnings ---------------------------------------------------- */

  function onWarnings(slug) {
    var rec = records.filter(function (r) { return r.slug === slug; })[0];
    if (!rec || !rec.lib) return;
    revoke(iconUrls);
    var box = $('#lib-detail');
    box.innerHTML = '<div class="card"><h2 class="section">' +
      esc(rec.lib.manufacturer.name) + ' — parse warnings</h2>' +
      '<p class="hint">These come from the vendor file, not from BroSafe. The library is ' +
      'usable; the notes record what was ambiguous or unusual.</p><ul>' +
      rec.lib.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
      '</ul><button class="btn" id="w-close">Close</button></div>';
    box.querySelector('#w-close').onclick = function () { box.innerHTML = ''; };
  }

  /* ---------- view --------------------------------------------------------
     Read-only, purely to confirm an import worked. Choosing a component for a
     safety function belongs on the Components page, not in Settings.
  ------------------------------------------------------------------------ */

  function onView(slug) {
    var rec = records.filter(function (r) { return r.slug === slug; })[0];
    if (!rec || !rec.lib) return;
    var box = $('#lib-detail');

    box.innerHTML = '<div class="card">' +
      '<h2 class="section">' + esc(rec.lib.manufacturer.name) + '</h2>' +
      '<div class="grid2">' +
      '<div class="field"><label>Filter</label>' +
      '<input type="text" id="lib-filter" placeholder="part number, name or group"></div>' +
      '<div class="field"><label>Function</label><select id="lib-fn">' +
      '<option value="">any</option><option value="input">input</option>' +
      '<option value="logic">logic</option><option value="output">output</option>' +
      '</select></div></div>' +
      '<label class="chk"><input type="checkbox" id="lib-arch"> show discontinued</label>' +
      '<div id="lib-rows"></div>' +
      '<p><button class="btn" id="lib-close">Close</button></p></div>';

    var f = box.querySelector('#lib-filter');
    var fn = box.querySelector('#lib-fn');
    var arch = box.querySelector('#lib-arch');

    box.querySelector('#lib-close').onclick = function () {
      revoke(iconUrls);
      box.innerHTML = '';
    };
    f.oninput = rows; fn.onchange = rows; arch.onchange = rows;
    rows();

    function value(u) {
      if (u.pfhd != null) return u.pfhd.toExponential(2) + ' /h';
      if (u.mttfd != null) return 'MTTFd ' + u.mttfd + ' y';
      if (u.b10d != null) return 'B10d ' + u.b10d.toExponential(2) + (u.b10dDerived ? ' *' : '');
      return '—';
    }

    function rows() {
      // Previous render's icons die here, not at unmount(). See the note at the
      // top: this runs on every keystroke and the tab is never torn down.
      revoke(iconUrls);

      var res = SH.lib.search(rec.lib, {
        text: f.value, fn: fn.value || null, includeArchived: arch.checked
      });
      var shown = res.slice(0, 200);
      var out = box.querySelector('#lib-rows');

      out.innerHTML =
        '<p class="hint">' + res.length + ' use case' + (res.length === 1 ? '' : 's') +
        (res.length > shown.length ? ' — showing the first ' + shown.length : '') + '</p>' +
        '<table class="tbl"><thead><tr><th></th><th>Part</th><th>Name</th>' +
        '<th>Function</th><th>Cat</th><th>PL</th><th>Data</th></tr></thead><tbody>' +
        shown.map(function (r, i) {
          var u = r.useCase, d = r.device;
          return '<tr><td><img data-icon="' + i + '" width="28" height="28" alt=""></td>' +
            '<td>' + esc(d.partNumber) +
            (d.revision ? ' <span class="hint">' + esc(d.revision) + '</span>' : '') + '</td>' +
            '<td>' + esc(d.name) + '<br><span class="hint">' + esc(d.group || '') + '</span></td>' +
            '<td>' + esc(u.functions.join(', ') || '—') + '</td>' +
            '<td>' + esc(u.category || '—') + '</td>' +
            '<td>' + esc(u.pl || '—') + '</td>' +
            '<td>' + esc(value(u)) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        (shown.some(function (r) { return r.useCase.b10dDerived; })
          ? '<p class="hint">* B10d derived from B10 and RDF.</p>' : '');

      // Icons resolve through the data folder, which is not under index.html —
      // a relative <img src> cannot reach it, so blob URLs it is. Rockwell ships
      // no device icons at all (0 of 301); null is a normal answer.
      shown.forEach(function (r, i) {
        var img = out.querySelector('[data-icon="' + i + '"]');
        if (!img || !r.device.icon) return;
        SH.lib.iconUrl(rec.lib, r.device).then(function (u) {
          if (!u) return;
          // The filter may have re-rendered while we awaited: don't leak the URL.
          if (!img.isConnected) { URL.revokeObjectURL(u); return; }
          iconUrls.push(u);
          img.src = u;
        }).catch(function () { /* missing icon: the alt text stands */ });
      });
    }
  }

  /* ---------- custom component library ------------------------------------ */

  function onExport() {
    var msg = $('#custom-msg');
    var items = sGet('components', null);
    if (!items || !items.length) {
      msg.innerHTML = '<p class="hint">No custom components to export.</p>';
      return;
    }
    var payload = {
      type: 'brosafe-components', version: 1,
      exported: new Date().toISOString(), components: items
    };
    var url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)],
      { type: 'application/json' }));
    tempUrls.push(url);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'brosafe-components.json';
    a.click();
    msg.innerHTML = '<p class="hint">Exported ' + items.length + ' components.</p>';
  }

  function onImport(e) {
    var msg = $('#custom-msg');
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    file.text().then(function (t) {
      var data = JSON.parse(t);
      if (data.type !== 'brosafe-components' || !Array.isArray(data.components)) {
        throw new Error('Not a BroSafe component export.');
      }
      var byId = {};
      (sGet('components', []) || []).concat(data.components).forEach(function (c) {
        byId[c.id || c.partNumber] = c;   // later wins
      });
      var merged = Object.keys(byId).map(function (k) { return byId[k]; });
      if (!sSet('components', merged)) throw new Error('Settings would not accept the import.');
      if (msg) msg.innerHTML = '<p class="hint">Imported. ' + merged.length + ' components in total.</p>';
    }).catch(function (err) {
      if (msg) msg.innerHTML = '<div class="warnnote">' + esc(err.message || String(err)) + '</div>';
    });
  }

  /* ---------- lifecycle ----------------------------------------------------
     This tab reads SH.settings only — never SH.store — so it does not
     subscribe to project:changed. A library is app config, not project data.
  ------------------------------------------------------------------------ */

  return {
    mount: function (h) {
      host = h;
      onSettings = function () { refresh(); };
      SH.bus.on('settings:changed', onSettings);
      render();
    },

    // Tabs are kept alive: catches a data folder connected in another tab.
    onShow: function () {
      if (host && !busy) refresh();
    },

    unmount: function () {
      if (onSettings) SH.bus.off('settings:changed', onSettings);
      onSettings = null;
      token.cancelled = true;
      revoke(iconUrls);
      revoke(tempUrls);
      records = [];
      host = null;
    }
  };
})());