/* File:     pages/safety-functions/tabs/device-overview/device-overview.js
 * Rev:      0.1.0
 * Updated:  2026-07-13
 * Requires: SH.store, SH.bus, SH.el, SH.modal, SH.loader, SH.lib (lazy)
 * Purpose:  Overview + edit for one device from project.devices[]; library picker; delete.
 */
(function () {
  'use strict';

  var CSS =
    '.dov{max-width:640px}' +
    '.dov .field{margin-bottom:12px;display:flex;flex-direction:column;gap:4px}' +
    '.dov label{font-size:12px;color:var(--muted)}' +
    '.dov input,.dov select{padding:6px 8px;background:var(--card);border:1px solid var(--line);' +
      'color:var(--ink);border-radius:4px;font:inherit}' +
    '.dov .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;' +
      'background:var(--line);color:var(--ink);text-transform:uppercase;letter-spacing:.04em}' +
    '.dov .row{display:flex;gap:8px;margin-top:16px}' +
    '.dov-picker input,.dov-picker select{width:100%;margin-bottom:8px}' +
    '.dov-results{max-height:280px;overflow:auto;margin-top:4px;border:1px solid var(--line);border-radius:4px}' +
    '.dov-hit{padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--line)}' +
    '.dov-hit:hover{background:var(--line-dark)}' +
    '.dov-hit.sel{background:var(--amber-soft,var(--line))}' +
    '.dov-hit small{color:var(--muted)}';

  function E() { return SH.el.apply(null, arguments); }
  function EC(tag, attrs, kids) { return SH.el.apply(null, [tag, attrs].concat(kids || [])); }
  function hint(t) { return E('p', { class: 'hint' }, t); }

  // ---- store helpers -------------------------------------------------------
  function findDevice(id) {
    var d = SH.store.get('devices', []);
    for (var i = 0; i < d.length; i++) { if (d[i].id === id) return d[i]; }
    return null;
  }
  function writeDevice(id, mutate) {
    var arr = SH.store.get('devices', []).slice();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) {
        var copy = {}; for (var k in arr[i]) { copy[k] = arr[i][k]; }
        mutate(copy); arr[i] = copy; SH.store.set('devices', arr); return;
      }
    }
  }
  function addToList(key, value) {
    value = (value || '').replace(/^\s+|\s+$/g, '');
    if (!value) return;
    var list = SH.store.get('lists.' + key, []).slice();
    for (var i = 0; i < list.length; i++) { if (list[i] === value) return; }
    list.push(value); SH.store.set('lists.' + key, list);
  }
  function inArr(a, id) { a = a || []; for (var i = 0; i < a.length; i++) { if (a[i] === id) return true; } return false; }
  function without(a, id) { var o = []; a = a || []; for (var i = 0; i < a.length; i++) { if (a[i] !== id) o.push(a[i]); } return o; }
  function isReferenced(id) {
    var sfs = SH.store.get('sfs', []);
    for (var i = 0; i < sfs.length; i++) {
      var s = sfs[i];
      if (inArr(s.inputs, id) || inArr(s.logic, id) || inArr(s.outputs, id)) return true;
    }
    return false;
  }
  function purgeFromSfs(id) {
    var sfs = SH.store.get('sfs', []).slice();
    for (var i = 0; i < sfs.length; i++) {
      var s = {}; for (var k in sfs[i]) { s[k] = sfs[i][k]; }
      s.inputs = without(s.inputs, id); s.logic = without(s.logic, id); s.outputs = without(s.outputs, id);
      sfs[i] = s;
    }
    SH.store.set('sfs', sfs);
  }

  // ---- datalist ------------------------------------------------------------
  function datalist(dlId, values) {
    var opts = [];
    for (var i = 0; i < values.length; i++) { opts.push(E('option', { value: values[i] })); }
    return EC('datalist', { id: dlId }, opts);
  }

  // ---- tab -----------------------------------------------------------------
  SH.registerTab('safety-functions', 'device-overview', {

    mount: function (host, ctx) {
      var self = this;
      this._host = host;
      this._deviceId = ctx && ctx.selected && ctx.selected.id;
      this._pending = false;

      this._onProject = function () { self._render(); };
      SH.bus.on('project:changed', this._onProject);

      this._onFocusOut = function () {
        setTimeout(function () {
          if (self._host && !self._host.contains(document.activeElement) && self._pending) {
            self._pending = false; self._render();
          }
        }, 0);
      };
      host.addEventListener('focusout', this._onFocusOut);

      this._render();
    },

    onShow: function () { this._render(); },

    unmount: function () {
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
      if (this._host && this._onFocusOut) this._host.removeEventListener('focusout', this._onFocusOut);
    },

    _render: function () {
      var host = this._host;
      if (!host) return;
      if (host.contains(document.activeElement)) { this._pending = true; return; } // caret guard

      host.innerHTML = '';
      host.appendChild(E('style', { html: CSS }));

      if (!SH.store.hasProject()) { host.appendChild(hint('No project open.')); return; }
      var dev = this._deviceId ? findDevice(this._deviceId) : null;
      if (!dev) { host.appendChild(hint('Select a device from the list.')); return; }

      host.appendChild(this._form(dev));
    },

    _form: function (dev) {
      var self = this, id = this._deviceId;
      var types = SH.store.get('lists.deviceTypes', ['estop', 'interlock', 'reset', 'edm', 'output', 'other']);
      var mnfs = SH.store.get('lists.manufacturers', []);

      function field(labelText, value, onInput, onChange, listId) {
        var inp = E('input', { type: 'text', value: value || '' });
        if (listId) inp.setAttribute('list', listId);
        inp.addEventListener('input', function () { onInput(inp.value); });
        if (onChange) inp.addEventListener('change', function () { onChange(inp.value); });
        return E('div', { class: 'field' }, E('label', null, labelText), inp);
      }

      var tag = field('Tag', dev.tag, function (v) { writeDevice(id, function (d) { d.tag = v; }); });
      var desc = field('Description', dev.description, function (v) { writeDevice(id, function (d) { d.description = v; }); });
      var type = field('Type', dev.type,
        function (v) { writeDevice(id, function (d) { d.type = v; }); },
        function (v) { addToList('deviceTypes', v); }, 'dov-type-list');
      var mnf = field('Manufacturer', dev.manufacturer,
        function (v) { writeDevice(id, function (d) { d.manufacturer = v; }); },
        function (v) { addToList('manufacturers', v); }, 'dov-mnf-list');
      var model = field('Model', dev.model, function (v) { writeDevice(id, function (d) { d.model = v; }); });

      var source = E('div', { class: 'field' },
        E('label', null, 'Source'),
        E('div', null, E('span', { class: 'badge' }, dev.source || 'manual')));

      var pick = E('button', { class: 'btn', onClick: function () { self._openLibrary(); } }, 'Pick from Library');
      var del = E('button', { class: 'btn danger', onClick: function () { self._delete(); } }, 'Delete device');

      return E('div', { class: 'dov' },
        datalist('dov-type-list', types),
        datalist('dov-mnf-list', mnfs),
        tag, desc, type, mnf, model, source,
        E('div', { class: 'row' }, pick),
        E('div', { class: 'row' }, del));
    },

    // ---- library picker ----------------------------------------------------
    _noLib: function () {
      SH.modal('Pick from Library', hint('No libraries installed. Add libraries in Settings.'),
        [{ label: 'Close', ghost: true, onClick: function (c) { c(); } }]);
    },

    _openLibrary: function () {
      var self = this;
      SH.loader.load('js/lib.js').then(function () {
        if (!SH.lib || !SH.lib.slugs) { self._noLib(); return; }
        SH.lib.slugs().then(function (slugs) {
          if (!slugs || !slugs.length) { self._noLib(); return; }
          self._pickerModal(slugs);
        }, function () { self._noLib(); });
      }, function () { self._noLib(); });
    },

    _pickerModal: function (slugs) {
      var self = this;
      var state = { lib: null, slug: '', pending: null };

      var slugSel = E('select', null, E('option', { value: '' }, 'Select library\u2026'));
      for (var i = 0; i < slugs.length; i++) { slugSel.appendChild(E('option', { value: slugs[i] }, slugs[i])); }
      var search = E('input', { type: 'text', placeholder: 'Search devices\u2026' });
      var results = E('div', { class: 'dov-results' }, hint('Select a library.'));

      function renderResults() {
        results.innerHTML = '';
        if (!state.lib) { results.appendChild(hint('Select a library.')); return; }
        var hits = SH.lib.search(state.lib, { text: search.value || '' }) || [];
        if (!hits.length) { results.appendChild(hint('No matches.')); return; }
        for (var h = 0; h < hits.length; h++) {
          var d = hits[h], ucs = d.useCases || [];
          for (var u = 0; u < ucs.length; u++) { results.appendChild(row(d, ucs[u])); }
        }
      }
      function row(d, uc) {
        var el = E('div', { class: 'dov-hit' },
          E('div', null, d.name || d.identifier || d.uid),
          E('small', null, ((state.lib.manufacturer && state.lib.manufacturer.name) || '') +
            '  \u00b7  PL ' + (uc.pl || '-') + '  \u00b7  Cat ' + (uc.category || '-')));
        el.addEventListener('click', function () {
          var prev = results.querySelector('.dov-hit.sel');
          if (prev) prev.className = 'dov-hit';
          el.className = 'dov-hit sel';
          state.pending = { device: d, uc: uc };
        });
        return el;
      }

      slugSel.addEventListener('change', function () {
        state.slug = slugSel.value; state.pending = null;
        if (!state.slug) { state.lib = null; renderResults(); return; }
        results.innerHTML = ''; results.appendChild(hint('Loading\u2026'));
        SH.lib.load(state.slug).then(function (lib) { state.lib = lib; renderResults(); },
          function () { state.lib = null; results.innerHTML = ''; results.appendChild(hint('Could not load library.')); });
      });
      search.addEventListener('input', renderResults);

      var body = E('div', { class: 'dov-picker' }, slugSel, search, results);

      SH.modal('Pick from Library', body, [
        { label: 'Cancel', ghost: true, onClick: function (c) { c(); } },
        { label: 'Use selection', onClick: function (c) { if (state.pending) self._applyLibrary(state); c(); } }
      ]);
    },

    _applyLibrary: function (state) {
      var d = state.pending.device, uc = state.pending.uc, lib = state.lib;
      var name = (lib.manufacturer && lib.manufacturer.name) || '';
      var model = d.partNumber || d.identifier || d.name || '';
      writeDevice(this._deviceId, function (dev) {
        dev.manufacturer = name;
        dev.model = model;
        dev.source = 'library';
        dev.libraryRef = { slug: state.slug, uid: d.uid, useCaseIndex: uc.index };
      });
      if (name) addToList('manufacturers', name);
      this._render();
    },

    // ---- delete ------------------------------------------------------------
    _delete: function () {
      var self = this, id = this._deviceId;
      if (!id) return;
      var msg = isReferenced(id)
        ? 'This device is assigned to one or more safety functions. Removing it will clear those assignments. Continue?'
        : 'Delete this device?';
      var cascade = isReferenced(id);
      SH.modal('Remove device', E('p', null, msg), [
        { label: 'Cancel', ghost: true, onClick: function (c) { c(); } },
        { label: 'Delete', onClick: function (c) { self._doDelete(cascade); c(); } }
      ]);
    },

    _doDelete: function (cascade) {
      var id = this._deviceId;
      if (cascade) purgeFromSfs(id);
      SH.store.set('devices', without ? SH.store.get('devices', []).filter(function (x) { return x.id !== id; }) : []);
      this._deviceId = null;
      this._render();
    }

  });
})();
