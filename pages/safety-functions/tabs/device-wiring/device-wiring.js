/* File    : pages/safety-functions/tabs/device-wiring/device-wiring.js
   Rev     : 0.1.0
   Updated : 2026-07-13
   Requires: SH.store, SH.bus, SH.el
   Purpose : Edit wiring entries for a selected device in project.devices[] */

SH.registerTab('safety-functions', 'device-wiring', {

  _deviceId: null,
  _pending:  false,
  _onProject: null,
  _onFocusOut: null,

  _style: null,

  _device: function () {
    var devices = SH.store.get('devices', []);
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].id === this._deviceId) return devices[i];
    }
    return null;
  },

  _save: function (wiring) {
    var devices = SH.store.get('devices', []);
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].id === this._deviceId) {
        devices[i].wiring = wiring;
        break;
      }
    }
    SH.store.set('devices', devices);
  },

  _render: function (host) {
    var self = this;
    host.innerHTML = '';

    if (!this._deviceId) {
      host.appendChild(SH.el('p', { class: 'hint' }, 'No device selected.'));
      return;
    }

    var dev = this._device();
    if (!dev) {
      host.appendChild(SH.el('p', { class: 'hint' }, 'Device not found.'));
      return;
    }

    var wiring = (dev.wiring || []).map(function (w) {
      return { label: w.label, wire: w.wire };
    });

    /* datalist */
    var suggestions = ['CH1 IN','CH1 OUT','CH2 IN','CH2 OUT','EDM IN','EDM OUT',
                       'SUPPLY','INPUT','OUTPUT','COMMON','RESET IN','FEEDBACK'];
    var dl = SH.el('datalist', { id: 'dw-label-list' });
    suggestions.forEach(function (s) {
      dl.appendChild(SH.el('option', { value: s }));
    });
    host.appendChild(dl);

    /* rows */
    var list = SH.el('div', { class: 'dw-list' });

    if (wiring.length === 0) {
      list.appendChild(SH.el('p', { class: 'hint' }, 'No wiring entries yet. Click + Add Wire to begin.'));
    } else {
      wiring.forEach(function (entry, idx) {
        var lblInput = SH.el('input', {
          type: 'text',
          class: 'field dw-label',
          value: entry.label,
          list: 'dw-label-list',
          placeholder: 'Label'
        });
        var wireInput = SH.el('input', {
          type: 'text',
          class: 'field dw-wire',
          value: entry.wire,
          placeholder: 'Wire no.'
        });
        var removeBtn = SH.el('button', {
          class: 'btn ghost btn-sm dw-remove',
          title: 'Remove row',
          onClick: function () {
            wiring.splice(idx, 1);
            self._save(wiring);
          }
        }, '\u00d7');

        var onChange = function () {
          wiring[idx].label = lblInput.value;
          wiring[idx].wire  = wireInput.value;
          self._save(wiring);
        };
        lblInput.addEventListener('change', onChange);
        wireInput.addEventListener('change', onChange);

        list.appendChild(SH.el('div', { class: 'dw-row' }, lblInput, wireInput, removeBtn));
      });
    }

    host.appendChild(list);

    host.appendChild(SH.el('button', {
      class: 'btn ghost dw-add',
      onClick: function () {
        wiring.push({ label: '', wire: '' });
        self._save(wiring);
      }
    }, '+ Add Wire'));
  },

  mount: function (host, ctx) {
    var self = this;

    this._deviceId = (ctx && ctx.selected && ctx.selected.kind === 'device')
      ? ctx.selected.id : null;

    /* scoped styles */
    var style = document.createElement('style');
    style.textContent = [
      '.dw-list { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }',
      '.dw-row  { display:flex; gap:6px; align-items:center; }',
      '.dw-label { flex:1.2; }',
      '.dw-wire  { flex:1; }',
      '.dw-remove { flex:0 0 auto; min-width:32px; color:var(--fail); }',
      '.dw-add  { margin-top:4px; }'
    ].join('\n');
    host.appendChild(style);
    this._style = style;

    this._render(host);

    this._onProject = function () {
      if (host.contains(document.activeElement)) {
        self._pending = true;
        return;
      }
      self._render(host);
    };
    SH.bus.on('project:changed', this._onProject);

    this._onFocusOut = function () {
      if (self._pending) {
        self._pending = false;
        self._render(host);
      }
    };
    host.addEventListener('focusout', this._onFocusOut);

    this._host = host;
  },

  onShow: function () {
    /* page controller should update ctx.selected before calling onShow;
       re-render so the correct device is shown */
    if (this._host) this._render(this._host);
  },

  unmount: function () {
    if (this._onProject) SH.bus.off('project:changed', this._onProject);
    if (this._host && this._onFocusOut) {
      this._host.removeEventListener('focusout', this._onFocusOut);
    }
  }

});
