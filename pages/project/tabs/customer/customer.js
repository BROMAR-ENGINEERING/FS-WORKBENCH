/* ==============================================================
   BroSafe — Project Details › Customer Details
   File:     pages/project/tabs/customer/customer.js
   Rev:      0.9.0
   Updated:  2026-07-09
   Requires: core.js, store.js (>= 0.7.0)
   Optional: SH.customers (customer library service — see NOTE below)
   --------------------------------------------------------------
   Tab module. Captures the client for this job: company identity,
   site address, site contacts, administration contact and an
   optional client logo. Reads/writes project.customer via SH.store.
   Renders into host only.
   --------------------------------------------------------------
   NOTE — client logo persistence (PROVISIONAL — see core chat)
   SH.store.set() writes JSON only, and there is no confirmed API
   for writing a binary file into the project folder. The logo is
   therefore stored inline as a base64 data URL on
   project.customer.logo, capped at ~500 KB so project.json stays
   sane. If core adds a project assets folder + binary write API,
   switch this to store logo.path and blob-load it (as the company
   logo and section images already do).
   --------------------------------------------------------------
   NOTE — lifecycle (core 0.6.0)
   mount() runs once; DOM is kept alive across tab switches, so the
   tab subscribes to project:changed and repaints on open/close/edit.
   A change while hidden marks it stale — onShow() repaints. unmount()
   flushes the pending write, clears timers, revokes blob: URLs and
   drops the listener. Our own writes echo back as project:changed;
   selfWrite suppresses that echo and clears on the next tick.
   --------------------------------------------------------------
   NOTE — customer library
   Save customer / Load customer use SH.customers.{list,get,save}
   when that service exists; otherwise they file a single .json to
   disk (Blob download + FileReader). No localStorage either way.
   ============================================================== */
(function () {
  'use strict';

  var STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
  var LOGO_MAX = 512 * 1024;   // ~500 KB cap on the base64 data URL

  /* Scoped to this tab. The global h2.section colour belongs in app.css. */
  var STYLE =
    '<style>' +
    '.t-customer h2.section{color:var(--ink);}' +
    '.t-customer .pill{margin-top:6px;}' +
    '.t-customer .cd-logo{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}' +
    '.t-customer .cd-logo-frame{width:160px;height:96px;border:1px solid var(--line);' +
      'border-radius:6px;background:var(--paper);display:flex;align-items:center;' +
      'justify-content:center;overflow:hidden;}' +
    '.t-customer .cd-logo-frame img{max-width:100%;max-height:100%;}' +
    '.t-customer .cd-logo-frame .cd-logo-empty{color:var(--muted);font-size:12px;padding:0 8px;text-align:center;}' +
    '</style>';

  /* ---------- helpers ------------------------------------------------ */

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* .pill sets `display`, which beats the [hidden] attribute. */
  function show(el, on) {
    if (el) el.style.display = on ? '' : 'none';
  }

  function blankContact() {
    return { id: uid(), name: '', role: '', email: '', phone: '' };
  }

  function blankCustomer() {
    return {
      company: '',
      abn: '',
      hasAcn: false,
      acn: '',
      address: { street: '', suburb: '', postcode: '', state: '' },
      contacts: [blankContact()],
      admin: { email: '', phone: '' },
      logo: null
    };
  }

  function normaliseLogo(raw) {
    if (!raw || typeof raw !== 'object' || !raw.dataUrl) return null;
    return {
      dataUrl: String(raw.dataUrl),
      name: raw.name || 'logo',
      type: raw.type || '',
      w: raw.w || 0,
      h: raw.h || 0
    };
  }

  /* Merge a stored (possibly partial) customer onto the blank shape. */
  function normalise(raw) {
    var c = blankCustomer();
    if (!raw || typeof raw !== 'object') return c;
    c.company = raw.company || '';
    c.abn = raw.abn || '';
    c.hasAcn = !!raw.hasAcn;
    c.acn = raw.acn || '';
    if (raw.address) {
      c.address.street = raw.address.street || '';
      c.address.suburb = raw.address.suburb || '';
      c.address.postcode = raw.address.postcode || '';
      c.address.state = raw.address.state || '';
    }
    if (raw.admin) {
      c.admin.email = raw.admin.email || '';
      c.admin.phone = raw.admin.phone || '';
    }
    c.logo = normaliseLogo(raw.logo);
    if (Object.prototype.toString.call(raw.contacts) === '[object Array]' && raw.contacts.length) {
      c.contacts = raw.contacts.map(function (k) {
        return {
          id: k.id || uid(),
          name: k.name || '',
          role: k.role || '',
          email: k.email || '',
          phone: k.phone || ''
        };
      });
    }
    return c;
  }

  /* ---------- ABN / ACN checksums (ATO / ASIC published algorithms) --- */

  function digits(v) { return String(v || '').replace(/\D/g, ''); }

  function abnValid(v) {
    var d = digits(v);
    if (d.length !== 11) return false;
    var w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19], sum = 0, i, n;
    for (i = 0; i < 11; i++) {
      n = parseInt(d.charAt(i), 10) - (i === 0 ? 1 : 0);
      sum += n * w[i];
    }
    return sum % 89 === 0;
  }

  function acnValid(v) {
    var d = digits(v);
    if (d.length !== 9) return false;
    var w = [8, 7, 6, 5, 4, 3, 2, 1], sum = 0, i;
    for (i = 0; i < 8; i++) sum += parseInt(d.charAt(i), 10) * w[i];
    return ((10 - (sum % 10)) % 10) === parseInt(d.charAt(8), 10);
  }

  /* ---------- store --------------------------------------------------- */

  function projectOpen() { return SH.store.hasProject(); }

  function readCustomer() { return normalise(SH.store.get('customer', null)); }

  /* set() owns autosave, the dirty flag and project:changed. */
  function writeCustomer(obj) {
    if (!projectOpen()) return;
    SH.store.set('customer', obj);
  }

  /* ---------- library service (optional) ------------------------------ */

  function lib() {
    var l = SH.customers;
    return (l && l.list && l.get && l.save) ? l : null;
  }

  function slug(s) {
    return String(s || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '').slice(0, 60) || 'customer';
  }

  /* ================================================================== */

  SH.registerTab('project', 'customer', {

    mount: function (host, ctx) {
      var cust = readCustomer();
      var selfWrite = false;
      var selfWriteTimer = null;
      var saveTimer = null;
      var stale = false;
      var blobUrls = [];
      var open = projectOpen();

      host.classList.add('t-customer');

      function hidden() { return !host.offsetParent; }

      /* Write, suppressing the project:changed echo. Flag clears next tick. */
      function push(obj) {
        selfWrite = true;
        if (selfWriteTimer) clearTimeout(selfWriteTimer);
        selfWriteTimer = setTimeout(function () {
          selfWriteTimer = null;
          selfWrite = false;
        }, 0);
        writeCustomer(obj);
      }

      /* -- render ----------------------------------------------------- */

      function contactRows() {
        return cust.contacts.map(function (k, i) {
          var d = open ? '' : ' disabled';
          return '' +
            '<tr data-row="' + i + '">' +
            '<td><input type="text" data-c="name" value="' + SH.esc(k.name) + '" placeholder="Full name"' + d + '></td>' +
            '<td><input type="text" data-c="role" value="' + SH.esc(k.role) + '" placeholder="Position / role"' + d + '></td>' +
            '<td><input type="email" data-c="email" value="' + SH.esc(k.email) + '" placeholder="name@example.com"' + d + '></td>' +
            '<td><input type="tel" data-c="phone" value="' + SH.esc(k.phone) + '" placeholder="04xx xxx xxx"' + d + '></td>' +
            '<td><button class="btn danger" data-act="del-contact" title="Remove contact"' +
            (open && cust.contacts.length > 1 ? '' : ' disabled') + '>Remove</button></td>' +
            '</tr>';
        }).join('');
      }

      function stateOptions() {
        return '<option value="">—</option>' + STATES.map(function (s) {
          return '<option value="' + s + '"' + (cust.address.state === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
      }

      function logoCard() {
        var d = open ? '' : ' disabled';
        var has = !!cust.logo;
        var frame = has
          ? '<img src="' + SH.esc(cust.logo.dataUrl) + '" alt="Client logo">'
          : '<span class="cd-logo-empty">No logo</span>';
        return '' +
          '<h2 class="section">Client logo</h2>' +
          '<div class="card">' +
            '<div class="cd-logo">' +
              '<div class="cd-logo-frame">' + frame + '</div>' +
              '<div>' +
                '<p>' +
                  '<button class="btn" data-act="logo-pick"' + d + '>' + (has ? 'Replace logo' : 'Upload logo') + '</button> ' +
                  '<button class="btn danger" data-act="logo-clear"' + (has && open ? '' : ' disabled') + '>Remove</button>' +
                '</p>' +
                '<p class="hint">' + (has
                  ? SH.esc(cust.logo.name) + (cust.logo.w ? ' — ' + cust.logo.w + '×' + cust.logo.h + ' px' : '')
                  : 'PNG, JPG or SVG, up to about 500 KB. Used on reports where a client logo is shown.') +
                '</p>' +
              '</div>' +
            '</div>' +
            '<input type="file" id="cd-logo-file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>' +
          '</div>';
      }

      function libraryCard() {
        var d = open ? '' : ' disabled';
        var hasLib = !!lib();
        return '' +
          '<h2 class="section">Customer library</h2>' +
          '<div class="card">' +
            (hasLib
              ? '<div class="field"><label for="cd-lib">Saved customers</label>' +
                  '<select id="cd-lib"' + d + '><option value="">—</option></select></div>'
              : '<div class="warnnote">The customer library is not installed yet. ' +
                '<strong>Save customer</strong> writes a <code>.json</code> file to a location you choose; ' +
                '<strong>Load customer</strong> reads one back.</div>') +
            '<p>' +
              '<button class="btn" data-act="save"' + d + '>Save customer</button> ' +
              '<button class="btn ghost" data-act="load"' + d + '>Load customer</button>' +
            '</p>' +
            '<input type="file" id="cd-file" accept="application/json,.json" hidden>' +
            '<p class="hint">Loading replaces every field on this tab, including the logo. Customers are stored as JSON files on disk, never in the browser.</p>' +
          '</div>';
      }

      function html() {
        var d = open ? '' : ' disabled';
        return STYLE +
          (open ? '' : '<div class="warnnote">No project is open. Open or create a project first.</div>') +

          '<h2 class="section">Company</h2>' +
          '<div class="card">' +
            '<div class="field"><label for="cd-company">Company name</label>' +
              '<input id="cd-company" type="text" value="' + SH.esc(cust.company) + '" placeholder="Client company name"' + d + '></div>' +
            '<div class="grid2">' +
              '<div class="field"><label for="cd-abn">ABN</label>' +
                '<input id="cd-abn" type="text" inputmode="numeric" maxlength="14" value="' + SH.esc(cust.abn) + '" placeholder="11 digits"' + d + '>' +
                '<span class="pill" id="cd-abn-chk"></span></div>' +
              '<div class="field"><label class="chk"><input type="checkbox" id="cd-hasacn"' +
                (cust.hasAcn ? ' checked' : '') + d + '> Company has an ACN</label>' +
                '<div id="cd-acn-wrap">' +
                  '<input id="cd-acn" type="text" inputmode="numeric" maxlength="12" value="' + SH.esc(cust.acn) + '" placeholder="9 digits"' + d + '>' +
                  '<span class="pill" id="cd-acn-chk"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<h2 class="section">Site address</h2>' +
          '<div class="card">' +
            '<div class="field"><label for="cd-street">Street address</label>' +
              '<input id="cd-street" type="text" value="' + SH.esc(cust.address.street) + '" placeholder="Unit / number and street"' + d + '></div>' +
            '<div class="grid2">' +
              '<div class="field"><label for="cd-suburb">Suburb</label>' +
                '<input id="cd-suburb" type="text" value="' + SH.esc(cust.address.suburb) + '"' + d + '></div>' +
              '<div class="field"><label for="cd-postcode">Postcode</label>' +
                '<input id="cd-postcode" type="text" inputmode="numeric" maxlength="4" value="' + SH.esc(cust.address.postcode) + '"' + d + '></div>' +
            '</div>' +
            '<div class="grid2">' +
              '<div class="field"><label for="cd-state">State</label>' +
                '<select id="cd-state"' + d + '>' + stateOptions() + '</select></div>' +
              '<div class="field"></div>' +
            '</div>' +
          '</div>' +

          logoCard() +

          '<h2 class="section">Site contacts</h2>' +
          '<div class="card">' +
            '<table class="tbl">' +
              '<thead><tr><th>Name</th><th>Position / role</th><th>Email</th><th>Phone</th><th></th></tr></thead>' +
              '<tbody id="cd-contacts">' + contactRows() + '</tbody>' +
            '</table>' +
            '<p><button class="btn" data-act="add-contact"' + d + '>Add contact</button></p>' +
            '<p class="hint">People on site who can be approached about the plant covered by this assessment.</p>' +
          '</div>' +

          '<h2 class="section">Administration contact</h2>' +
          '<div class="card">' +
            '<div class="grid2">' +
              '<div class="field"><label for="cd-adm-email">Email</label>' +
                '<input id="cd-adm-email" type="email" value="' + SH.esc(cust.admin.email) + '" placeholder="accounts@example.com"' + d + '></div>' +
              '<div class="field"><label for="cd-adm-phone">Phone</label>' +
                '<input id="cd-adm-phone" type="tel" value="' + SH.esc(cust.admin.phone) + '"' + d + '></div>' +
            '</div>' +
            '<p class="hint">Where reports and invoices are sent, if that differs from the site contacts.</p>' +
          '</div>' +

          libraryCard();
      }

      function paint() {
        host.innerHTML = html();
        show(host.querySelector('#cd-acn-wrap'), cust.hasAcn);
        checkAbn();
        checkAcn();
        fillLibrary();
      }

      /* -- read DOM back into the model -------------------------------- */

      function val(id) {
        var el = host.querySelector('#' + id);
        return el ? el.value.trim() : '';
      }

      function readForm() {
        var c = {
          company: val('cd-company'),
          abn: val('cd-abn'),
          hasAcn: !!(host.querySelector('#cd-hasacn') || {}).checked,
          acn: val('cd-acn'),
          address: {
            street: val('cd-street'),
            suburb: val('cd-suburb'),
            postcode: val('cd-postcode'),
            state: val('cd-state')
          },
          contacts: [],
          admin: { email: val('cd-adm-email'), phone: val('cd-adm-phone') },
          logo: cust.logo               // logo is not a form field — carried through
        };
        var rows = host.querySelectorAll('#cd-contacts tr');
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var idx = parseInt(r.getAttribute('data-row'), 10);
          var src = cust.contacts[idx] || blankContact();
          c.contacts.push({
            id: src.id,
            name: r.querySelector('[data-c="name"]').value.trim(),
            role: r.querySelector('[data-c="role"]').value.trim(),
            email: r.querySelector('[data-c="email"]').value.trim(),
            phone: r.querySelector('[data-c="phone"]').value.trim()
          });
        }
        if (!c.contacts.length) c.contacts = [blankContact()];
        return c;
      }

      function commit() {
        if (!projectOpen()) return;
        cust = readForm();
        push(cust);
      }

      function queueCommit() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { saveTimer = null; commit(); }, 350);
      }

      function flush() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; commit(); }
      }

      /* -- checksum pills ---------------------------------------------- */

      function pill(el, on, ok, okText, badText) {
        if (!el) return;
        show(el, on);
        el.textContent = ok ? okText : badText;
      }

      function checkAbn() {
        var v = val('cd-abn');
        pill(host.querySelector('#cd-abn-chk'), !!v, abnValid(v), 'ABN checksum valid', 'ABN checksum fails');
      }

      function checkAcn() {
        var wrap = host.querySelector('#cd-acn-wrap');
        var on = !!(wrap && wrap.style.display !== 'none');
        var v = val('cd-acn');
        pill(host.querySelector('#cd-acn-chk'), on && !!v, acnValid(v), 'ACN checksum valid', 'ACN checksum fails');
      }

      /* -- logo ---------------------------------------------------------- */

      function pickLogo() {
        var f = host.querySelector('#cd-logo-file');
        if (f) f.click();
      }

      function clearLogo() {
        flush();
        cust.logo = null;
        push(cust);
        paint();
      }

      function readLogo(file) {
        if (file.size > LOGO_MAX) {
          alert('That image is larger than 500 KB. Please use a smaller logo — it is stored inside the project file.');
          return;
        }
        flush();
        var fr = new FileReader();
        fr.onload = function () {
          var dataUrl = fr.result;
          // measure raster images; SVG has no intrinsic pixel size
          if (/^data:image\/svg\+xml/.test(dataUrl)) {
            setLogo(file, dataUrl, 0, 0);
            return;
          }
          var img = new Image();
          img.onload = function () { setLogo(file, dataUrl, img.naturalWidth, img.naturalHeight); };
          img.onerror = function () { setLogo(file, dataUrl, 0, 0); };
          img.src = dataUrl;
        };
        fr.onerror = function () { alert('That image could not be read.'); };
        fr.readAsDataURL(file);
      }

      function setLogo(file, dataUrl, w, h) {
        cust.logo = { dataUrl: dataUrl, name: file.name || 'logo', type: file.type || '', w: w, h: h };
        push(cust);
        paint();
      }

      /* -- save / load --------------------------------------------------- */

      function fillLibrary() {
        var l = lib(), sel = host.querySelector('#cd-lib');
        if (!l || !sel) return;
        Promise.resolve(l.list()).then(function (items) {
          if (!host.contains(sel)) return;
          sel.innerHTML = '<option value="">—</option>' + (items || []).map(function (it) {
            return '<option value="' + SH.esc(it.id) + '">' + SH.esc(it.name || it.company || it.id) + '</option>';
          }).join('');
        })['catch'](function () { /* library unavailable — leave the picker empty */ });
      }

      function apply(raw) {
        cust = normalise(raw && raw.customer ? raw.customer : raw);
        push(cust);
        paint();
      }

      function releaseUrl(url) {
        var i = blobUrls.indexOf(url);
        if (i > -1) blobUrls.splice(i, 1);
        URL.revokeObjectURL(url);
      }

      function saveCustomer() {
        flush();
        if (!cust.company) { alert('Enter a company name before saving this customer.'); return; }

        var l = lib();
        if (l) {
          Promise.resolve(l.save({ id: slug(cust.company), name: cust.company, customer: cust }))
            .then(fillLibrary)['catch'](function () { alert('The customer could not be saved.'); });
          return;
        }

        var payload = { type: 'brosafe.customer', rev: 1, customer: cust };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        blobUrls.push(url);
        var a = document.createElement('a');
        a.href = url;
        a.download = slug(cust.company) + '.customer.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { releaseUrl(url); }, 0);
      }

      function loadCustomer() {
        var l = lib(), sel = host.querySelector('#cd-lib'), f;
        if (l) {
          if (!sel || !sel.value) { alert('Choose a saved customer first.'); return; }
          Promise.resolve(l.get(sel.value)).then(function (rec) {
            if (rec) apply(rec);
          })['catch'](function () { alert('That customer could not be loaded.'); });
          return;
        }
        f = host.querySelector('#cd-file');
        if (f) f.click();
      }

      function loadFile(file) {
        var fr = new FileReader();
        fr.onload = function () {
          var data;
          try { data = JSON.parse(fr.result); }
          catch (e) { alert('That file is not valid JSON.'); return; }
          apply(data);
        };
        fr.onerror = function () { alert('That file could not be read.'); };
        fr.readAsText(file);
      }

      /* -- events -------------------------------------------------------- */

      function onInput(e) {
        var t = e.target;
        if (t.id === 'cd-abn') checkAbn();
        if (t.id === 'cd-acn') checkAcn();
        queueCommit();
      }

      function onChange(e) {
        var t = e.target;
        if (t.id === 'cd-hasacn') {
          show(host.querySelector('#cd-acn-wrap'), t.checked);
          checkAcn();
          queueCommit();
          return;
        }
        if (t.id === 'cd-lib') return;              // loading is explicit
        if (t.id === 'cd-logo-file') {
          if (t.files && t.files[0]) readLogo(t.files[0]);
          t.value = '';
          return;
        }
        if (t.id === 'cd-file') {
          if (t.files && t.files[0]) loadFile(t.files[0]);
          t.value = '';
          return;
        }
        queueCommit();
      }

      function onClick(e) {
        var btn = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-act');

        if (act === 'add-contact') {
          flush();
          cust.contacts.push(blankContact());
          push(cust);
          paint();
          var rows = host.querySelectorAll('#cd-contacts tr');
          var last = rows[rows.length - 1];
          if (last) last.querySelector('[data-c="name"]').focus();
        } else if (act === 'del-contact') {
          flush();
          var row = btn.closest('tr');
          var idx = parseInt(row.getAttribute('data-row'), 10);
          cust.contacts.splice(idx, 1);
          if (!cust.contacts.length) cust.contacts = [blankContact()];
          push(cust);
          paint();
        } else if (act === 'logo-pick') {
          pickLogo();
        } else if (act === 'logo-clear') {
          clearLogo();
        } else if (act === 'save') {
          saveCustomer();
        } else if (act === 'load') {
          loadCustomer();
        }
      }

      function onProject() {
        if (selfWrite) return;
        if (hidden()) { stale = true; return; }
        refresh();
      }

      function refresh() {
        stale = false;
        open = projectOpen();
        cust = readCustomer();
        paint();
      }

      /* -- wire up ------------------------------------------------------- */

      paint();
      host.addEventListener('input', onInput);
      host.addEventListener('change', onChange);
      host.addEventListener('click', onClick);
      SH.bus.on('project:changed', onProject);

      this._onShow = function () {
        if (stale || open !== projectOpen()) refresh();
      };

      this._teardown = function () {
        flush();
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (selfWriteTimer) { clearTimeout(selfWriteTimer); selfWriteTimer = null; }
        blobUrls.slice().forEach(releaseUrl);
        host.removeEventListener('input', onInput);
        host.removeEventListener('change', onChange);
        host.removeEventListener('click', onClick);
        SH.bus.off('project:changed', onProject);
        host.classList.remove('t-customer');
      };
    },

    onShow: function () {
      if (this._onShow) this._onShow();
    },

    unmount: function () {
      if (this._teardown) { this._teardown(); this._teardown = null; }
      this._onShow = null;
    }
  });
})();
