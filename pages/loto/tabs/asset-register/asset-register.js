/* File:     pages/loto/tabs/asset-register/asset-register.js
   Rev:      0.2.0
   Updated:  2026-07-24
   Requires: SH.el · SH.esc · SH.modal · SH.store · SH.bus · SH.LOTO_ENERGY (js/core.js)
             SH.store.saveProjectAsset / projectAssetUrl / deleteProjectAsset (v0.16.0)
   Purpose:  LOTO Asset Register — view assets as an area/parent tree, add and edit asset
             records with isolation points, energy types, drawing refs and photos.
             Deletes are guarded against references from project.loto.procedures[].
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
    for (var i = 0; i < kids.length; i++) { if (kids[i]) { node.appendChild(kids[i]); } }
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

  function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

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
    electrical:        '--amber',
    pneumatic:         '--steel',
    'stored-pressure': '--steel',
    hydraulic:         '--orange',
    water:             '--steel',
    gas:               '--orange',
    steam:             '--fail',
    thermal:           '--fail',
    chemical:          '--orange',
    gravity:           '--muted',
    mechanical:        '--muted',
    other:             '--muted'
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

  function assets()     { return SH.store.get('loto.assets', []) || []; }
  function procedures() { return SH.store.get('loto.procedures', []) || []; }
  function areas()      { return SH.store.get('areas', []) || []; }

  function blankAsset() {
    return {
      id: uid('ast_'),
      assetNumber: '', description: '', areaId: '', parentId: null,
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

  function procTitle(p) { return p.title || p.id || '(untitled procedure)'; }

  /* ------------------------------------------------------- reference scanning
     project.loto.procedures[] references assets two ways:
       assetIds[]          — which assets the procedure covers
       isolationPointIds   — null means EVERY point on those assets (an implicit
                             reference), an array means only those point ids.
     A null-scoped procedure therefore references points it never names. A guard
     that only inspects the array will happily delete a point that is printed on
     a live procedure.                                                          */

  function procsForAsset(assetId) {
    var all = procedures(), out = [], i, j;
    for (i = 0; i < all.length; i++) {
      var ids = all[i].assetIds || [];
      for (j = 0; j < ids.length; j++) {
        if (ids[j] === assetId) { out.push(all[i]); break; }
      }
    }
    return out;
  }

  /* -> { explicit:[proc], implicit:[proc] } */
  function procsForPoint(assetId, pointId) {
    var scoped = procsForAsset(assetId), out = { explicit: [], implicit: [] }, i, j;
    for (i = 0; i < scoped.length; i++) {
      var pts = scoped[i].isolationPointIds;
      if (pts === null || pts === undefined) { out.implicit.push(scoped[i]); continue; }
      for (j = 0; j < pts.length; j++) {
        if (pts[j] === pointId) { out.explicit.push(scoped[i]); break; }
      }
    }
    return out;
  }

  function childrenOf(parentId) {
    var all = assets(), out = [], i;
    for (i = 0; i < all.length; i++) {
      if ((all[i].parentId || null) === parentId) { out.push(all[i]); }
    }
    return out;
  }

  function descendantsOf(id) {
    var out = [], stack = childrenOf(id), i;
    while (stack.length) {
      var a = stack.pop();
      out.push(a);
      var kids = childrenOf(a.id);
      for (i = 0; i < kids.length; i++) { stack.push(kids[i]); }
    }
    return out;
  }

  function listOf(items, render) {
    var ul = E('ul', { class: 'ar-reflist' }), i;
    for (i = 0; i < items.length; i++) { ul.appendChild(E('li', null, render(items[i]))); }
    return ul;
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
    '.loto-ar .ar-card.ar-child{border-left:3px solid var(--line-dark)}',
    '.loto-ar .ar-card .ar-main{flex:1;min-width:0}',
    '.loto-ar .ar-num{font-family:var(--mono);font-weight:600;color:var(--ink)}',
    '.loto-ar .ar-kid{font-size:11px;color:var(--muted);margin-left:6px}',
    '.loto-ar .ar-desc{color:var(--ink);margin:2px 0 6px}',
    '.loto-ar .ar-meta{font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}',
    '.loto-ar .ar-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.loto-ar .ar-chip{font-size:11px;border:1px solid var(--line);border-radius:10px;',
      'padding:1px 8px;white-space:nowrap}',
    '.loto-ar .ar-due{color:var(--fail);font-weight:600}',
    '.loto-ar .ar-acts{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}',
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
      'border-top:1px solid var(--line)}',
    '.loto-ar .ar-reflist{margin:6px 0 12px;padding-left:20px}',
    '.loto-ar .ar-reflist li{margin-bottom:3px}'
  ].join('');

  /* ================================================================== the tab */

  SH.registerTab(PAGE, TAB, {

    mount: function (host, ctx) {
      this._host      = host;
      this._mode      = 'list';        /* list | form */
      this._draft     = null;
      this._isNew     = false;
      this._newAssets = [];            /* relPaths written this editing session */
      this._urls      = [];            /* blob URLs to revoke */
      this._filter    = '';
      this._writing   = false;
      this._pending   = false;

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
      if (this._mode === 'list') { this._pending = false; this._render(); }
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
      seg.appendChild(E('button', { class: this._mode === 'list' ? 'on' : '', onClick: function () {
        if (self._mode === 'form') { self._confirmDiscard(function () { self._toList(); }); }
        else { self._toList(); }
      } }, 'View'));
      seg.appendChild(E('button', { class: this._mode === 'form' ? 'on' : '', onClick: function () {
        if (self._mode === 'form') { return; }
        self._openForm(null);
      } }, 'Add'));

      var bar = box('ar-bar', seg);

      if (this._mode === 'list') {
        bar.appendChild(input('search', this._filter, function (v) {
          self._filter = v;
          self._applyFilter();
        }, { class: 'ar-search', placeholder: 'Filter by asset, description or procedure…' }));
        bar.appendChild(E('span', { class: 'hint' }, assets().length + ' asset(s)'));
      }
      return bar;
    },

    _toList: function () {
      this._mode      = 'list';
      this._draft     = null;
      this._newAssets = [];
      this._render();
    },

    /* --------------------------------------------------------- list (as tree) */

    _list: function () {
      var wrap = box('');
      var all  = assets();

      if (!all.length) {
        wrap.appendChild(E('div', { class: 'ar-empty' },
          'No assets registered yet. Use Add to create the first LOTO asset record.'));
        return wrap;
      }

      this._cards = [];   /* [{el, id, parentId, search}] */

      /* Only top-level assets are grouped by area; children hang off their parent
         wherever that parent sits, so a machine and its motors stay together. */
      var byId = {}, i, j;
      for (i = 0; i < all.length; i++) { byId[all[i].id] = all[i]; }

      var roots = [];
      for (i = 0; i < all.length; i++) {
        var pid = all[i].parentId || null;
        if (!pid || !byId[pid]) { roots.push(all[i]); }   /* orphan -> treated as root */
      }

      var groups = [], ars = areas();
      for (i = 0; i < ars.length; i++) {
        groups.push({ id: ars[i].id, name: ars[i].name || ars[i].id, items: [] });
      }
      var loose = { id: '', name: 'Unassigned', items: [] };

      for (i = 0; i < roots.length; i++) {
        var placed = false;
        for (j = 0; j < groups.length; j++) {
          if (groups[j].id === roots[i].areaId) { groups[j].items.push(roots[i]); placed = true; break; }
        }
        if (!placed) { loose.items.push(roots[i]); }
      }
      groups.push(loose);

      for (i = 0; i < groups.length; i++) {
        if (!groups[i].items.length) { continue; }
        var g = box('ar-group', E('h3', null, groups[i].name));
        for (j = 0; j < groups[i].items.length; j++) {
          this._branch(g, groups[i].items[j], 0);
        }
        wrap.appendChild(g);
      }
      return wrap;
    },

    _branch: function (host, asset, depth) {
      host.appendChild(this._card(asset, depth));
      var kids = childrenOf(asset.id);
      for (var i = 0; i < kids.length; i++) { this._branch(host, kids[i], depth + 1); }
    },

    _card: function (a, depth) {
      var self = this, i;

      var energies = [], seen = {};
      for (i = 0; i < (a.isolationPoints || []).length; i++) {
        var en = a.isolationPoints[i].energy;
        if (en && !seen[en]) { seen[en] = 1; energies.push(en); }
      }

      var chips = box('ar-chips');
      for (i = 0; i < energies.length; i++) { chips.appendChild(energySwatch(energies[i])); }

      var meta = box('ar-meta');
      if (a.procedureId) { meta.appendChild(E('span', null, 'Procedure ' + a.procedureId)); }
      meta.appendChild(E('span', null, (a.isolationPoints || []).length + ' lockout point(s)'));
      if (a.drawingRefs && a.drawingRefs.length) {
        meta.appendChild(E('span', null, 'Dwg ' + a.drawingRefs.join(', ')));
      }
      if (a.nextAudit) {
        meta.appendChild(E('span', { class: overdue(a.nextAudit) ? 'ar-due' : '' },
          'Next audit ' + a.nextAudit));
      }
      if (a.specialPrecaution) { meta.appendChild(E('span', null, 'Special precaution')); }
      var refs = procsForAsset(a.id).length;
      if (refs) { meta.appendChild(E('span', null, refs + ' procedure(s)')); }

      var title = box('', E('span', { class: 'ar-num' }, a.assetNumber || '(no asset number)'));
      var kidCount = childrenOf(a.id).length;
      if (kidCount) { title.appendChild(E('span', { class: 'ar-kid' }, kidCount + ' sub-asset(s)')); }

      var main = box('ar-main', title, E('div', { class: 'ar-desc' }, a.description || ''), meta);
      if (energies.length) { main.appendChild(chips); }

      var acts = box('ar-acts',
        btn('Edit', function () { self._openForm(a.id); }, 'ghost sm'),
        btn('+ Sub-asset', function () { self._addSub(a); }, 'ghost sm'),
        btn('Duplicate', function () { self._duplicate(a); }, 'ghost sm'),
        btn('Delete', function () { self._confirmDelete(a); }, 'danger sm'));

      var card = box('ar-card' + (depth ? ' ar-child' : ''), main, acts);
      if (depth) { card.style.marginLeft = (depth * 22) + 'px'; }

      var search = ((a.assetNumber || '') + ' ' + (a.description || '') + ' ' +
                    (a.procedureId || '') + ' ' + (a.procedureDesc || '')).toLowerCase();
      this._cards.push({ el: card, id: a.id, parentId: a.parentId || null, search: search });
      return card;
    },

    /* Filtering a tree: show matches, then re-reveal every ancestor of a match so
       a child never appears detached from its parent. */
    _applyFilter: function () {
      var q = trim(this._filter).toLowerCase();
      var cards = this._cards || [], byId = {}, i;
      for (i = 0; i < cards.length; i++) { byId[cards[i].id] = cards[i]; }

      var show = {};
      for (i = 0; i < cards.length; i++) {
        if (!q || cards[i].search.indexOf(q) !== -1) {
          show[cards[i].id] = true;
          var p = cards[i].parentId;
          while (p && byId[p] && !show[p]) { show[p] = true; p = byId[p].parentId; }
        }
      }
      for (i = 0; i < cards.length; i++) {
        cards[i].el.style.display = show[cards[i].id] ? '' : 'none';
      }
    },

    /* ---------------------------------------------------------------- actions */

    _addSub: function (parent) {
      var a = blankAsset();
      a.parentId = parent.id;
      a.areaId   = parent.areaId || '';
      this._openForm(null, a);
    },

    _duplicate: function (a) {
      var copy = clone(a), i;
      copy.id = uid('ast_');
      copy.assetNumber = (copy.assetNumber || '') + ' (copy)';
      copy.photos = [];
      /* Sub-assets are not copied; the duplicate lands as a sibling. New point ids
         so no procedure can accidentally resolve to the copy. */
      for (i = 0; i < (copy.isolationPoints || []).length; i++) {
        copy.isolationPoints[i].id = uid('ip_');
        copy.isolationPoints[i].photo = null;   /* photos are not copied on disk */
      }
      this._openForm(null, copy);
    },

    /* ------------------------------------------------------------ delete guard */

    _confirmDelete: function (a) {
      var self  = this;
      var procs = procsForAsset(a.id);
      var kids  = descendantsOf(a.id);

      /* Blocked: a procedure document points at this asset. Deleting it would
         leave a live LOTO procedure referencing nothing. */
      if (procs.length) {
        SH.modal('Cannot delete asset', box('',
          E('p', null, '"' + (a.assetNumber || 'This asset') + '" cannot be deleted — ' +
            procs.length + ' procedure(s) reference it:'),
          listOf(procs, procTitle),
          E('p', { class: 'hint' },
            'Delete or re-point those procedures in LOTO › Procedures first.')
        ), [{ label: 'OK', onClick: function (close) { close(); } }]);
        return;
      }

      /* Children: a descendant may itself be referenced, so check the branch. */
      var blockedKids = [], i;
      for (i = 0; i < kids.length; i++) {
        if (procsForAsset(kids[i].id).length) { blockedKids.push(kids[i]); }
      }

      var body = box('',
        E('p', null, 'Delete "' + (a.assetNumber || 'this asset') + '"? ' +
          'Its lockout points and photos are removed with it.'));

      var actions = [{ label: 'Cancel', ghost: true, onClick: function (close) { close(); } }];

      if (kids.length) {
        body.appendChild(E('p', null, 'It has ' + kids.length + ' sub-asset(s):'));
        body.appendChild(listOf(kids, function (k) {
          return (k.assetNumber || '(no asset number)') +
                 (procsForAsset(k.id).length ? '  — referenced by a procedure' : '');
        }));
        if (blockedKids.length) {
          body.appendChild(E('div', { class: 'warnnote' },
            blockedKids.length + ' sub-asset(s) are referenced by procedures and cannot be ' +
            'deleted. Promote them instead, or clear those procedures first.'));
        }
        body.appendChild(E('p', { class: 'hint' },
          'Promoting moves the sub-assets up a level and keeps their data.'));

        actions.push({ label: 'Promote & delete parent', onClick: function (close) {
          close(); self._deleteAsset(a, 'promote');
        } });
        if (!blockedKids.length) {
          actions.push({ label: 'Delete whole branch', onClick: function (close) {
            close(); self._deleteAsset(a, 'branch');
          } });
        }
      } else {
        body.appendChild(E('p', { class: 'hint' }, 'This cannot be undone.'));
        actions.push({ label: 'Delete', onClick: function (close) {
          close(); self._deleteAsset(a, 'promote');
        } });
      }

      SH.modal('Delete asset', body, actions);
    },

    _deleteAsset: function (a, mode) {
      var doomed = {}, i, j;
      doomed[a.id] = true;

      if (mode === 'branch') {
        var kids = descendantsOf(a.id);
        for (i = 0; i < kids.length; i++) { doomed[kids[i].id] = true; }
      }

      var list = assets(), out = [];
      for (i = 0; i < list.length; i++) {
        var rec = list[i];
        if (doomed[rec.id]) {
          var pts = rec.isolationPoints || [];
          for (j = 0; j < pts.length; j++) {
            if (pts[j].photo && pts[j].photo.relPath) {
              try { SH.store.deleteProjectAsset(pts[j].photo.relPath); } catch (e) {}
            }
          }
          continue;
        }
        if (mode === 'promote' && rec.parentId === a.id) {
          rec = clone(rec);
          rec.parentId = a.parentId || null;   /* lift to the grandparent, or top level */
        }
        out.push(rec);
      }

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
      if (this._draft.parentId === undefined) { this._draft.parentId = null; }
      this._newAssets = [];
      this._mode = 'form';
      this._render();
    },

    _confirmDiscard: function (then) {
      var self = this;
      SH.modal('Discard changes', E('p', null, 'Discard the changes to this asset?'), [
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

    /* Parent options exclude the asset itself and everything beneath it, so the
       tree can never be given a cycle. */
    _parentOptions: function () {
      var d = this._draft, opts = [{ id: '', label: '— top level —' }];
      var all = assets(), banned = {}, i;
      banned[d.id] = true;
      var kids = descendantsOf(d.id);
      for (i = 0; i < kids.length; i++) { banned[kids[i].id] = true; }
      for (i = 0; i < all.length; i++) {
        if (banned[all[i].id]) { continue; }
        opts.push({
          id: all[i].id,
          label: (all[i].assetNumber || '(no asset number)') +
                 (all[i].description ? ' — ' + all[i].description : '')
        });
      }
      return opts;
    },

    _form: function () {
      var self = this, d = this._draft, i;
      var wrap = box('');

      var areaOpts = [{ id: '', label: '— unassigned —' }];
      var ars = areas();
      for (i = 0; i < ars.length; i++) {
        areaOpts.push({ id: ars[i].id, label: ars[i].name || ars[i].id });
      }

      wrap.appendChild(box('card',
        E('h2', { class: 'section' }, 'Identification'),
        box('grid2',
          field('Asset number', input('text', d.assetNumber, function (v) { d.assetNumber = v; },
            { placeholder: 'LRS 125' })),
          field('Area / location', select(areaOpts, d.areaId, function (v) { d.areaId = v; }),
            ars.length ? '' : 'No areas defined — add them in Risk Assessment › Areas & Assets.')),
        field('Asset description', input('text', d.description, function (v) { d.description = v; },
          { placeholder: 'LRS 1 Cooling Water' })),
        field('Parent asset',
          select(this._parentOptions(), d.parentId || '', function (v) { d.parentId = v || null; }),
          'Nest this under a machine — e.g. a motor under the line it drives. ' +
          'Leave at top level if it stands alone.'),
        box('grid2',
          field('Procedure ID', input('text', d.procedureId, function (v) { d.procedureId = v; },
            { placeholder: 'LOTO/00008' })),
          field('Procedure description', input('text', d.procedureDesc, function (v) { d.procedureDesc = v; },
            { placeholder: 'LRS 1 Zone 2A Cooling Water LOTO' }))),
        field('Drawing references',
          input('text', (d.drawingRefs || []).join(', '), function (v) {
            var parts = v.split(','), out = [], k;
            for (k = 0; k < parts.length; k++) {
              var t = trim(parts[k]);
              if (t) { out.push(t); }
            }
            d.drawingRefs = out;
          }, { placeholder: 'E19142, W18607' }),
          'Comma separated.')));

      wrap.appendChild(box('card',
        E('h2', { class: 'section' }, 'Document control'),
        box('grid2',
          field('Last revised', input('date', d.lastRevised, function (v) { d.lastRevised = v; })),
          field('Next audit', input('date', d.nextAudit, function (v) { d.nextAudit = v; }))),
        box('grid2',
          field('Approved by', input('text', d.approvedBy, function (v) { d.approvedBy = v; })),
          field('Authorised by', input('text', d.authorisedBy, function (v) { d.authorisedBy = v; })))));

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

      this._ptsHost = box('');
      this._renderPoints();
      wrap.appendChild(box('card',
        E('h2', { class: 'section' }, 'Lockout points'),
        E('div', { class: 'hint' },
          'Listed in order. Procedures reference these points by id — reordering is safe, ' +
          'deleting one is checked against the procedure register.'),
        this._ptsHost,
        btn('+ Lockout point', function () {
          d.isolationPoints = d.isolationPoints || [];
          d.isolationPoints.push(blankPoint(d.isolationPoints.length + 1));
          self._renderPoints();
        }, 'ghost')));

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
          self._lockHost.appendChild(box('ar-lockrow',
            input('text', locks[idx].type, function (v) { locks[idx].type = v; },
              { placeholder: 'Padlock / Hasp / Ball valve device' }),
            input('number', locks[idx].qty, function (v) { locks[idx].qty = parseInt(v, 10) || 0; },
              { min: '0' }),
            btn('Remove', function () { locks.splice(idx, 1); self._renderLocks(); }, 'ghost sm')));
        }(i));
      }
    },

    _renderPoints: function () {
      var d = this._draft;
      this._ptsHost.innerHTML = '';
      var pts = d.isolationPoints || [];
      if (!pts.length) {
        this._ptsHost.appendChild(E('div', { class: 'ar-empty' }, 'No lockout points yet.'));
        return;
      }
      for (var i = 0; i < pts.length; i++) {
        this._ptsHost.appendChild(this._pointCard(pts, i));
      }
    },

    _pointCard: function (pts, idx) {
      var self = this, p = pts[idx], i;
      p.seq = idx + 1;

      var kindOpts = [
        { id: 'isolation',    label: 'Isolation' },
        { id: 'verification', label: 'Verification' }
      ];
      var enOpts = [], el = energyList();
      for (i = 0; i < el.length; i++) {
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
        btn('Remove', function () { self._confirmRemovePoint(pts, idx); }, 'danger sm'));

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

    /* A point may be referenced explicitly by id, or implicitly by a procedure
       whose isolationPointIds is null (= every point on the asset). Both are real
       references; only the explicit one is visible in the data. */
    _confirmRemovePoint: function (pts, idx) {
      var self = this, p = pts[idx];
      var refs = this._isNew ? { explicit: [], implicit: [] }
                             : procsForPoint(this._draft.id, p.id);

      var body = box('',
        E('p', null, 'Remove lockout point ' + p.seq +
          (p.label ? ' (' + p.label + ')' : '') + '?'));

      if (refs.explicit.length) {
        body.appendChild(E('div', { class: 'warnnote' },
          refs.explicit.length + ' procedure(s) name this point directly. Removing it leaves ' +
          'those procedures referencing a point that no longer exists.'));
        body.appendChild(listOf(refs.explicit, procTitle));
      }
      if (refs.implicit.length) {
        body.appendChild(E('div', { class: 'warnnote' },
          refs.implicit.length + ' procedure(s) include all points on this asset. This step ' +
          'will disappear from them at the next print, with no other warning.'));
        body.appendChild(listOf(refs.implicit, procTitle));
      }
      if (!refs.explicit.length && !refs.implicit.length) {
        body.appendChild(E('p', { class: 'hint' },
          'No procedure references this point. Its photo is deleted with it.'));
      }

      SH.modal('Remove lockout point', body, [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Remove', onClick: function (close) { close(); self._removePoint(pts, idx); } }
      ]);
    },

    _removePoint: function (pts, idx) {
      var p = pts[idx];
      if (p.photo && p.photo.relPath) {
        try { SH.store.deleteProjectAsset(p.photo.relPath); } catch (e) {}
      }
      pts.splice(idx, 1);
      this._renderPoints();
    },

    _photoRow: function (p) {
      var self = this;
      var row    = box('ar-photo');
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
              /* Same point id, new relPath — every procedure that renders this
                 point picks up the new image with no further work. */
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
        row.appendChild(btn('Remove photo', function () {
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

      if (!trim(d.assetNumber) && !trim(d.description)) {
        SH.modal('Nothing to save',
          E('p', null, 'Give the asset a number or a description first.'),
          [{ label: 'OK', onClick: function (close) { close(); } }]);
        return;
      }

      d.isolationPoints = d.isolationPoints || [];
      for (i = 0; i < d.isolationPoints.length; i++) { d.isolationPoints[i].seq = i + 1; }
      if (d.parentId === '') { d.parentId = null; }

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
