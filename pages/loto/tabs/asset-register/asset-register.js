/* File:     pages/loto/tabs/asset-register/asset-register.js
   Rev:      0.1.0
   Updated:  2026-07-24
   Requires: SH.el · SH.esc · SH.modal · SH.store · SH.bus · SH.LOTO_ENERGY (js/core.js)
             SH.store.saveProjectAsset / projectAssetUrl / deleteProjectAsset (v0.16.0)
   Purpose:  LOTO Asset Register — view assets grouped by area, add and edit asset
             records with isolation points, energy types, drawing refs and photos.
*/
(function () {
  'use strict';

  var PAGE  = 'loto';
  var TAB   = 'asset-register';
  var MAXPX = 1600;          /* longest edge for stored photos */
  var JPEGQ = 0.75;

  /* ------------------------------------------------------------------ helpers */

  function E() { return SH.el.apply(SH, arguments); }

  function box(cls) {
    var kids = Array.prototype.slice.call(arguments, 1);
    var node = E('div', cls ? { class: cls } : null);
    for (var i = 0; i < kids.length; i++) { if (kids[i]) node.appendChild(kids[i]); }
    return node;
  }

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8);
  }

  function input(type, value, onInput, attrs) {
    var a = attrs || {};
    a.type = type;
    var n = E('input', a);
    n.value = (value == null) ? '' : String(value);
    n.addEventListener('input', function () { onInput(n.value); });
    return n;
  }

  function textarea(value, onInput, rows) {
    var t = E('textarea', { rows: rows || 3 });
    t.value = (value == null) ? '' : String(value);
    t.addEventListener('input', function () { onInput(t.value); });
    return t;
  }

  function select(options, value, onChange) {
    var s = E('select', null);
    for (var i = 0; i < options.length; i++) {
      var o = E('option', { value: options[i].id }, options[i].label);
      if (options[i].id === value) { o.selected = true; }
      s.appendChild(o);
    }
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function field(label, ctrl, hint) {
    var f = box('field', E('label', null, label), ctrl);
    if (hint) { f.appendChild(E('div', { class: 'hint' }, hint)); }
    return f;
  }

  function btn(label, onClick, cls) {
    return E('button', { class: 'btn ' + (cls || ''), onClick: onClick }, label);
  }

  /* ---------------------------------------------------- energy types (core.js) */

  function energyList() {
    var l = SH.LOTO_ENERGY;
    return (l && l.length) ? l : [];
  }

  function energyLabel(id) {
    var l = energyList();
    for (var i = 0; i < l.length; i++) {
      if (l[i].id === id) { return l[i].label || l[i].name || l[i].id; }
    }
    return id || '';
  }

  /* Signal tokens only — no literal colours. Unknown ids fall back to muted. */
  var ENERGY_TOKEN = {
    electrical:       '--amber',
    pneumatic:        '--steel',
    'stored-pressure':'--steel',
    hydraulic:        '--orange',
    water:            '--steel',
    gas:              '--orange',
    steam:            '--fail',
    thermal:          '--fail',
    chemical:         '--orange',
    gravity:          '--muted',
    mechanical:       '--muted',
    other:            '--muted'
  };

  function energySwatch(id) {
    var tok = ENERGY_TOKEN[id] || '--muted';
    return E('span', {
      class: 'ar-chip',
      style: 'border-color:var(' + tok + ');color:var(' + tok + ')'
    }, energyLabel(id));
  }

  /* ------------------------------------------------------------ photo pipeline */

  function resizePhoto(file, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, MAXPX / Math.max(w, h));
      var nw = Math.max(1, Math.round(w * scale));
      var nh = Math.max(1, Math.round(h * scale));
      var cv = document.createElement('canvas');
      cv.width = nw; cv.height = nh;
      cv.getContext('2d').drawImage(img, 0, 0, nw, nh);
      URL.revokeObjectURL(url);
      cv.toBlob(function (blob) { cb(blob || file, nw, nh); }, 'image/jpeg', JPEGQ);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(file, 0, 0); };
    img.src = url;
  }

  function asFile(blob, name) {
    try { return new File([blob], name, { type: blob.type || 'image/jpeg' }); }
    catch (e) { return blob; }
  }

  function jpgName(original) {
    var base = String(original || 'photo').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '-');
    return (base || 'photo') + '.jpg';
  }

  /* --------------------------------------------------------------- data access */

  function assets()  { return SH.store.get('loto.assets', []) || []; }
  function areas()   { return SH.store.get('areas', []) || []; }

  function areaName(id) {
    var a = areas();
    for (var i = 0; i < a.length; i++) { if (a[i].id === id) { return a[i].name || a[i].id; } }
    return '';
  }

  function blankAsset() {
    return {
      id: uid('ast_'),
      assetNumber: '', description: '', areaId: '',
      procedureId: '', procedureDesc: '',
      drawingRefs: [], specialPrecaution: '',
      lastRevised: '', nextAudit: '',
      approvedBy: '', authorisedBy: '',
      lockDevices: [], photos: [],
      isolationPoints: []
    };
  }

  function blankPoint(seq) {
    return {
      id: uid('ip_'), seq: seq, kind: 'isolation',
      energy: (energyList()[0] || {}).id || '',
      magnitude: '', label: '', deviceRef: '',
      location: '', method: '', lotoDevice: '',
      verificationMeans: '', photo: null
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function overdue(dateStr) {
    if (!dateStr) { return false; }
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) { return false; }
    return d.getTime() < Date.now();
  }

  /* -------------------------------------------------------------- scoped style */

  var CSS = [
    '.loto-ar .ar-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}',
    '.loto-ar .ar-seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}',
    '.loto-ar .ar-seg button{background:none;border:0;padding:6px 16px;color:var(--muted);',
      'font:inherit;cursor:pointer}',
    '.loto-ar .ar-seg button.on{background:var(--amber-soft);color:var(--ink)}',
    '.loto-ar .ar-search{flex:1;min-width:160px;max-width:320px}',
    '.loto-ar .ar-group{margin-bottom:18px}',
    '.loto-ar .ar-group>h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;',
      'color:var(--muted);margin:0 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}',
    '.loto-ar .ar-card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;',
      'margin-bottom:8px;display:flex;gap:12px;align-items:flex-start}',
    '.loto-ar .ar-card:hover{border-color:var(--amber)}',
    '.loto-ar .ar-card .ar-main{flex:1;min-width:0}',
    '.loto-ar .ar-num{font-family:var(--mono);font-weight:600;color:var(--ink)}',
    '.loto-ar .ar-desc{color:var(--ink);margin:2px 0 6px}',
    '.loto-ar .ar-meta{font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}',
    '.loto-ar .ar-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.loto-ar .ar-chip{font-size:11px;border:1px solid var(--line);border-radius:10px;',
      'padding:1px 8px;white-space:nowrap}',
    '.loto-ar .ar-due{color:var(--fail);font-weight:600}',
    '.loto-ar .ar-acts{display:flex;gap:6px;flex-shrink:0}',
    '.loto-ar .ar-pt{border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px}',
    '.loto-ar .ar-pt-head{display:flex;gap:8px;align-items:center;margin-bottom:10px}',
    '.loto-ar .ar-pt-seq{font-family:var(--mono);font-weight:600;background:var(--card);',
      'border:1px solid var(--line);border-radius:4px;padding:2px 8px}',
    '.loto-ar .ar-pt-head .sp{flex:1}',
    '.loto-ar .ar-photo{display:flex;gap:10px;align-items:center;margin-top:8px}',
    '.loto-ar .ar-photo img{max-width:160px;max-height:120px;border:1px solid var(--line);',
      'border-radius:4px;display:block}',
    '.loto-ar .ar-empty{color:var(--muted);padding:24px 0;text-align:center}',
    '.loto-ar .ar-lockrow{display:flex;gap:8px;align-items:center;margin-bottom:6px}',
    '.loto-ar .ar-lockrow input[type=number]{width:80px}',
    '.loto-ar .ar-foot{display:flex;gap:8px;margin-top:16px;padding-top:14px;',
      'border-top:1px solid var(--line)}'
  ].join('');

  /* ================================================================== the tab */

  SH.registerTab(PAGE, TAB, {

    mount: function (host, ctx) {
      this._host    = host;
      this._mode    = 'list';        /* list | form */
      this._draft   = null;
      this._isNew   = false;
      this._newAssets = [];          /* relPaths written this editing session */
      this._urls    = [];            /* blob URLs to revoke */
      this._filter  = '';
      this._writing = false;
      this._pending = false;

      host.classList.add('loto-ar');
      host.appendChild(E('style', { html: CSS }));
      this._body = box('');
      host.appendChild(this._body);

      var self = this;
      this._onProject = function () {
        if (self._writing) { return; }
        if (self._mode === 'form') { self._pending = true; return; }  /* never nuke a form */
        self._render();
      };
      SH.bus.on('project:changed', this._onProject);

      this._render();
    },

    onShow: function () {
      if (this._mode === 'list' || this._pending) {
        this._pending = false;
        if (this._mode === 'list') { this._render(); }
      }
    },

    unmount: function () {
      SH.bus.off('project:changed', this._onProject);
      this._revokeAll();
    },

    /* ------------------------------------------------------------ url pooling */

    _revokeAll: function () {
      for (var i = 0; i < this._urls.length; i++) {
        try { URL.revokeObjectURL(this._urls[i]); } catch (e) {}
      }
      this._urls = [];
    },

    _trackUrl: function (u) { if (u) { this._urls.push(u); } return u; },

    /* ----------------------------------------------------------------- render */

    _render: function () {
      this._revokeAll();
      this._body.innerHTML = '';

      if (!SH.store.hasProject()) {
        this._body.appendChild(E('div', { class: 'stub' },
          'No project open. Open or create a project to build its LOTO asset register.'));
        return;
      }

      this._body.appendChild(this._toolbar());
      if (this._mode === 'form') { this._body.appendChild(this._form()); }
      else { this._body.appendChild(this._list()); }
    },

    _toolbar: function () {
      var self = this;
      var seg  = box('ar-seg');
      var view = E('button', { class: this._mode === 'list' ? 'on' : '', onClick: function () {
        if (self._mode === 'form') { self._confirmDiscard(function () { self._toList(); }); }
        else { self._toList(); }
      } }, 'View');
      var add  = E('button', { class: this._mode === 'form' ? 'on' : '', onClick: function () {
        if (self._mode === 'form') { return; }
        self._openForm(null);
      } }, 'Add');
      seg.appendChild(view); seg.appendChild(add);

      var bar = box('ar-bar', seg);

      if (this._mode === 'list') {
        var search = input('search', this._filter, function (v) {
          self._filter = v;
          self._applyFilter();
        }, { class: 'ar-search', placeholder: 'Filter by asset, description or procedure…' });
        bar.appendChild(search);
        bar.appendChild(E('span', { class: 'hint' }, assets().length + ' asset(s)'));
      }
      return bar;
    },

    _toList: function () {
      this._mode  = 'list';
      this._draft = null;
      this._newAssets = [];
      this._render();
    },

    /* ------------------------------------------------------------------- list */

    _list: function () {
      var self = this;
      var wrap = box('');
      var all  = assets();

      if (!all.length) {
        wrap.appendChild(E('div', { class: 'ar-empty' },
          'No assets registered yet. Use Add to create the first LOTO procedure record.'));
        return wrap;
      }

      this._rows = [];

      var groups = [], i, j;
      var ars = areas();
      for (i = 0; i < ars.length; i++) { groups.push({ id: ars[i].id, name: ars[i].name || ars[i].id, items: [] }); }
      var loose = { id: '', name: 'Unassigned', items: [] };

      for (i = 0; i < all.length; i++) {
        var placed = false;
        for (j = 0; j < groups.length; j++) {
          if (groups[j].id === all[i].areaId) { groups[j].items.push(all[i]); placed = true; break; }
        }
        if (!placed) { loose.items.push(all[i]); }
      }
      groups.push(loose);

      for (i = 0; i < groups.length; i++) {
        if (!groups[i].items.length) { continue; }
        var g = box('ar-group', E('h3', null, groups[i].name));
        for (j = 0; j < groups[i].items.length; j++) {
          g.appendChild(this._card(groups[i].items[j]));
        }
        wrap.appendChild(g);
      }
      return wrap;
    },

    _card: function (a) {
      var self = this;

      var energies = [], seen = {}, i;
      for (i = 0; i < (a.isolationPoints || []).length; i++) {
        var en = a.isolationPoints[i].energy;
        if (en && !seen[en]) { seen[en] = 1; energies.push(en); }
      }

      var chips = box('ar-chips');
      for (i = 0; i < energies.length; i++) { chips.appendChild(energySwatch(energies[i])); }

      var meta = box('ar-meta');
      if (a.procedureId)   { meta.appendChild(E('span', null, 'Procedure ' + a.procedureId)); }
      meta.appendChild(E('span', null, (a.isolationPoints || []).length + ' lockout point(s)'));
      if (a.drawingRefs && a.drawingRefs.length) {
        meta.appendChild(E('span', null, 'Dwg ' + a.drawingRefs.join(', ')));
      }
      if (a.nextAudit) {
        meta.appendChild(E('span', { class: overdue(a.nextAudit) ? 'ar-due' : '' },
          'Next audit ' + a.nextAudit));
      }
      if (a.specialPrecaution) { meta.appendChild(E('span', null, 'Special precaution')); }

      var main = box('ar-main',
        E('div', { class: 'ar-num' }, a.assetNumber || '(no asset number)'),
        E('div', { class: 'ar-desc' }, a.description || ''),
        meta);
      if (energies.length) { main.appendChild(chips); }

      var acts = box('ar-acts',
        btn('Edit', function () { self._openForm(a.id); }, 'ghost sm'),
        btn('Duplicate', function () { self._duplicate(a); }, 'ghost sm'),
        btn('Delete', function () { self._confirmDelete(a); }, 'danger sm'));

      var card = box('ar-card', main, acts);
      card.setAttribute('data-search',
        ((a.assetNumber || '') + ' ' + (a.description || '') + ' ' +
         (a.procedureId || '') + ' ' + (a.procedureDesc || '')).toLowerCase());
      this._rows.push(card);
      return card;
    },

    _applyFilter: function () {
      var q = (this._filter || '').toLowerCase().trim();
      var rows = this._rows || [], i;
      for (i = 0; i < rows.length; i++) {
        var hit = !q || (rows[i].getAttribute('data-search') || '').indexOf(q) !== -1;
        rows[i].style.display = hit ? '' : 'none';
      }
    },

    /* ---------------------------------------------------------------- actions */

    _duplicate: function (a) {
      var copy = clone(a);
      copy.id = uid('ast_');
      copy.assetNumber = (copy.assetNumber || '') + ' (copy)';
      copy.photos = [];
      for (var i = 0; i < (copy.isolationPoints || []).length; i++) {
        copy.isolationPoints[i].id = uid('ip_');
        copy.isolationPoints[i].photo = null;   /* photos are not copied on disk */
      }
      this._openForm(null, copy);
    },

    _confirmDelete: function (a) {
      var self = this;
      var body = box('',
        E('p', null, 'Delete "' + (a.assetNumber || 'this asset') + '"? ' +
          'Its lockout points and photos are removed with it.'),
        E('p', { class: 'hint' }, 'This cannot be undone.'));
      SH.modal('Delete asset', body, [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Delete', onClick: function (close) { close(); self._deleteAsset(a); } }
      ]);
    },

    _deleteAsset: function (a) {
      var self = this;
      var pts = a.isolationPoints || [], i;
      for (i = 0; i < pts.length; i++) {
        if (pts[i].photo && pts[i].photo.relPath) {
          try { SH.store.deleteProjectAsset(pts[i].photo.relPath); } catch (e) {}
        }
      }
      var list = assets(), out = [];
      for (i = 0; i < list.length; i++) { if (list[i].id !== a.id) { out.push(list[i]); } }
      this._commit(out);
      this._render();
    },

    _commit: function (arr) {
      var self = this;
      this._writing = true;
      SH.store.set('loto.assets', arr);
      setTimeout(function () { self._writing = false; }, 0);
    },

    /* ------------------------------------------------------------------- form */

    _openForm: function (id, preset) {
      var list = assets(), i;
      this._isNew = true;
      this._draft = preset || blankAsset();
      if (id) {
        for (i = 0; i < list.length; i++) {
          if (list[i].id === id) { this._draft = clone(list[i]); this._isNew = false; break; }
        }
      }
      this._newAssets = [];
      this._mode = 'form';
      this._render();
    },

    _confirmDiscard: function (then) {
      var self = this;
      var body = E('p', null, 'Discard the changes to this asset?');
      SH.modal('Discard changes', body, [
        { label: 'Keep editing', ghost: true, onClick: function (close) { close(); } },
        { label: 'Discard', onClick: function (close) {
            close();
            self._cleanupNewPhotos();
            then();
          } }
      ]);
    },

    _cleanupNewPhotos: function () {
      for (var i = 0; i < this._newAssets.length; i++) {
        try { SH.store.deleteProjectAsset(this._newAssets[i]); } catch (e) {}
      }
      this._newAssets = [];
    },

    _form: function () {
      var self = this, d = this._draft;
      var wrap = box('');

      /* --- identification --- */
      var areaOpts = [{ id: '', label: '— unassigned —' }];
      var ars = areas();
      for (var i = 0; i < ars.length; i++) { areaOpts.push({ id: ars[i].id, label: ars[i].name || ars[i].id }); }

      var id1 = box('card',
        E('h2', { class: 'section' }, 'Identification'),
        box('grid2',
          field('Asset number', input('text', d.assetNumber, function (v) { d.assetNumber = v; },
            { placeholder: 'LRS 125' })),
          field('Area / location', select(areaOpts, d.areaId, function (v) { d.areaId = v; }),
            ars.length ? '' : 'No areas defined — add them in Risk Assessment › Areas & Assets.')),
        field('Asset description', input('text', d.description, function (v) { d.description = v; },
          { placeholder: 'LRS 1 Cooling Water' })),
        box('grid2',
          field('Procedure ID', input('text', d.procedureId, function (v) { d.procedureId = v; },
            { placeholder: 'LOTO/00008' })),
          field('Procedure description', input('text', d.procedureDesc, function (v) { d.procedureDesc = v; },
            { placeholder: 'LRS 1 Zone 2A Cooling Water LOTO' }))),
        field('Drawing references',
          input('text', (d.drawingRefs || []).join(', '), function (v) {
            var parts = v.split(','), out = [], k;
            for (k = 0; k < parts.length; k++) {
              var t = parts[k].replace(/^\s+|\s+$/g, '');
              if (t) { out.push(t); }
            }
            d.drawingRefs = out;
          }, { placeholder: 'E19142, W18607' }),
          'Comma separated.'));
      wrap.appendChild(id1);

      /* --- control --- */
      wrap.appendChild(box('card',
        E('h2', { class: 'section' }, 'Document control'),
        box('grid2',
          field('Last revised', input('date', d.lastRevised, function (v) { d.lastRevised = v; })),
          field('Next audit', input('date', d.nextAudit, function (v) { d.nextAudit = v; }))),
        box('grid2',
          field('Approved by', input('text', d.approvedBy, function (v) { d.approvedBy = v; })),
          field('Authorised by', input('text', d.authorisedBy, function (v) { d.authorisedBy = v; })))));

      /* --- precautions + lock devices --- */
      this._lockHost = box('');
      this._renderLocks();
      wrap.appendChild(box('card',
        E('h2', { class: 'section' }, 'Precautions & lockout devices'),
        field('Special precaution',
          textarea(d.specialPrecaution, function (v) { d.specialPrecaution = v; }, 2),
          'Printed in the Special Precaution panel. Leave blank for none.'),
        E('label', null, 'Lockout devices required'),
        this._lockHost,
        btn('+ Device', function () {
          d.lockDevices = d.lockDevices || [];
          d.lockDevices.push({ type: '', qty: 1 });
          self._renderLocks();
        }, 'ghost sm')));

      /* --- isolation points --- */
      this._ptsHost = box('');
      this._renderPoints();
      wrap.appendChild(box('card',
        E('h2', { class: 'section' }, 'Lockout points'),
        E('div', { class: 'hint' },
          'Listed in order. Verification steps are numbered in the same sequence as isolations.'),
        this._ptsHost,
        btn('+ Lockout point', function () {
          d.isolationPoints = d.isolationPoints || [];
          d.isolationPoints.push(blankPoint(d.isolationPoints.length + 1));
          self._renderPoints();
        }, 'ghost')));

      /* --- footer --- */
      wrap.appendChild(box('ar-foot',
        btn('Save asset', function () { self._save(); }),
        btn('Cancel', function () { self._confirmDiscard(function () { self._toList(); }); }, 'ghost')));

      return wrap;
    },

    _renderLocks: function () {
      var self = this, d = this._draft;
      this._lockHost.innerHTML = '';
      var locks = d.lockDevices || [];
      if (!locks.length) {
        this._lockHost.appendChild(E('div', { class: 'hint' }, 'None recorded.'));
        return;
      }
      for (var i = 0; i < locks.length; i++) {
        (function (idx) {
          var row = box('ar-lockrow',
            input('text', locks[idx].type, function (v) { locks[idx].type = v; },
              { placeholder: 'Padlock / Hasp / Ball valve device' }),
            input('number', locks[idx].qty, function (v) { locks[idx].qty = parseInt(v, 10) || 0; },
              { min: '0' }),
            btn('Remove', function () { locks.splice(idx, 1); self._renderLocks(); }, 'ghost sm'));
          self._lockHost.appendChild(row);
        }(i));
      }
    },

    _renderPoints: function () {
      var self = this, d = this._draft;
      this._ptsHost.innerHTML = '';
      var pts = d.isolationPoints || [];
      if (!pts.length) {
        this._ptsHost.appendChild(E('div', { class: 'ar-empty' },
          'No lockout points yet.'));
        return;
      }
      for (var i = 0; i < pts.length; i++) {
        this._ptsHost.appendChild(this._pointCard(pts, i));
      }
    },

    _pointCard: function (pts, idx) {
      var self = this, p = pts[idx];
      p.seq = idx + 1;

      var kindOpts = [
        { id: 'isolation',    label: 'Isolation' },
        { id: 'verification', label: 'Verification' }
      ];
      var enOpts = [];
      var el = energyList();
      for (var i = 0; i < el.length; i++) {
        enOpts.push({ id: el[i].id, label: el[i].label || el[i].name || el[i].id });
      }
      if (!enOpts.length) { enOpts.push({ id: '', label: '(SH.LOTO_ENERGY not loaded)' }); }

      var head = box('ar-pt-head',
        E('span', { class: 'ar-pt-seq' }, String(p.seq)),
        E('strong', null, p.label || ('Point ' + p.seq)),
        box('sp'),
        btn('↑', function () {
          if (idx === 0) { return; }
          var t = pts[idx - 1]; pts[idx - 1] = pts[idx]; pts[idx] = t;
          self._renderPoints();
        }, 'ghost sm'),
        btn('↓', function () {
          if (idx >= pts.length - 1) { return; }
          var t = pts[idx + 1]; pts[idx + 1] = pts[idx]; pts[idx] = t;
          self._renderPoints();
        }, 'ghost sm'),
        btn('Remove', function () { self._removePoint(pts, idx); }, 'danger sm'));

      var card = box('ar-pt', head,
        box('grid3',
          field('Type', select(kindOpts, p.kind, function (v) { p.kind = v; })),
          field('Energy', select(enOpts, p.energy, function (v) { p.energy = v; })),
          field('Magnitude', input('text', p.magnitude, function (v) { p.magnitude = v; },
            { placeholder: '480V / 120 PSI' }))),
        box('grid3',
          field('Point label', input('text', p.label, function (v) { p.label = v; },
            { placeholder: 'E-1 / W-3 / V-1' })),
          field('Device reference', input('text', p.deviceRef, function (v) { p.deviceRef = v; },
            { placeholder: 'E19142' })),
          field('Lockout device', input('text', p.lotoDevice, function (v) { p.lotoDevice = v; },
            { placeholder: 'Hasp + padlock' }))),
        field('Location', textarea(p.location, function (v) { p.location = v; }, 2),
          'Where it is, in words a stranger could follow.'),
        field('Isolation method / step', textarea(p.method, function (v) { p.method = v; }, 3)),
        field('Verification means', textarea(p.verificationMeans, function (v) { p.verificationMeans = v; }, 2),
          'How zero energy is proven at this point.'));

      card.appendChild(this._photoRow(p));
      return card;
    },

    _removePoint: function (pts, idx) {
      var self = this;
      var p = pts[idx];
      if (p.photo && p.photo.relPath) {
        try { SH.store.deleteProjectAsset(p.photo.relPath); } catch (e) {}
      }
      pts.splice(idx, 1);
      this._renderPoints();
    },

    _photoRow: function (p) {
      var self = this;
      var row = box('ar-photo');
      var status = E('span', { class: 'hint' }, '');

      var file = E('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) { return; }
        status.textContent = 'Processing…';
        resizePhoto(f, function (blob, w, h) {
          var name = jpgName(f.name);
          SH.store.saveProjectAsset('loto/' + self._draft.id, asFile(blob, name))
            .then(function (relPath) {
              if (p.photo && p.photo.relPath) {
                try { SH.store.deleteProjectAsset(p.photo.relPath); } catch (e) {}
              }
              p.photo = { relPath: relPath, name: name, w: w, h: h };
              self._newAssets.push(relPath);
              status.textContent = '';
              self._renderPoints();
            })['catch'](function (err) {
              status.textContent = 'Could not save photo: ' + (err && err.message ? err.message : err);
            });
        });
        file.value = '';
      });

      row.appendChild(file);

      if (p.photo && p.photo.relPath) {
        var img = E('img', { alt: p.photo.name || 'photo' });
        SH.store.projectAssetUrl(p.photo.relPath).then(function (url) {
          if (!url) { return; }
          self._trackUrl(url);
          img.src = url;                      /* never assign '' or null */
        })['catch'](function () {});
        row.appendChild(img);
        row.appendChild(btn('Replace', function () { file.click(); }, 'ghost sm'));
        row.appendChild(btn('Remove', function () {
          try { SH.store.deleteProjectAsset(p.photo.relPath); } catch (e) {}
          p.photo = null;
          self._renderPoints();
        }, 'ghost sm'));
      } else {
        row.appendChild(btn('Add photo', function () { file.click(); }, 'ghost sm'));
      }
      row.appendChild(status);
      return row;
    },

    /* ------------------------------------------------------------------- save */

    _save: function () {
      var d = this._draft, i;

      if (!d.assetNumber && !d.description) {
        SH.modal('Nothing to save',
          E('p', null, 'Give the asset a number or a description first.'),
          [{ label: 'OK', onClick: function (close) { close(); } }]);
        return;
      }

      d.isolationPoints = d.isolationPoints || [];
      for (i = 0; i < d.isolationPoints.length; i++) { d.isolationPoints[i].seq = i + 1; }

      var list = assets(), found = false, out = [];
      for (i = 0; i < list.length; i++) {
        if (list[i].id === d.id) { out.push(clone(d)); found = true; }
        else { out.push(list[i]); }
      }
      if (!found) { out.push(clone(d)); }

      this._commit(out);
      this._newAssets = [];      /* photos are now referenced by a saved record */
      this._toList();
    }
  });

}());
