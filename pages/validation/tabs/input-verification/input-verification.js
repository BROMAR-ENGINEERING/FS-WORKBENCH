/* ==============================================================
   FS Workbench — Validation › Input Verification
   File:     pages/validation/tabs/input-verification/input-verification.js
   Rev:      0.1.0
   Updated:  2026-07-09
   Requires: core.js, store.js
   --------------------------------------------------------------
   Stub — ready to develop. Replace the card with real UI.
   Any new schema keys must be declared in the CORE CHAT first.
   ============================================================== */
SH.registerTab('validation', 'input-verification', (function () {

  function render(host) {
    if (!SH.store.hasProject()) {
      host.innerHTML = '<div class="warnnote">No project is open.</div>';
      return;
    }
    host.innerHTML = '';
    var card = SH.el('div', { class: 'stub' });
    card.innerHTML =
      '<h2>Input Verification</h2>' +
      '<p>Simplified method: for each input device record wiring checks, normal operation test and fault conditions in one consolidated record.</p>' +
      '<p class="hint"><strong>Fields to build:</strong> Device tag, device type, terminal, wiring result, normal operation result, fault result, tester, date</p>' +
      '<p class="hint">Schema: ask the core chat to add ' +
      '<code>project.validation.inputVerification</code> before persisting anything.</p>';
    host.appendChild(card);
  }

  return {
    _host: null,
    _pid:  null,
    _onProject: null,

    mount: function (host) {
      var self = this;
      this._host = host;
      this._pid  = SH.store.projectId();
      this._onProject = function () {
        var pid = SH.store.projectId();
        if (pid !== self._pid) { self._pid = pid; render(self._host); return; }
        if (!SH.store.hasProject()) { render(self._host); return; }
        if (host.contains(document.activeElement)) return;
        render(self._host);
      };
      SH.bus.on('project:changed', this._onProject);
      render(host);
    },

    onShow:  function () { render(this._host); },

    unmount: function () {
      if (this._onProject) SH.bus.off('project:changed', this._onProject);
    }
  };

}()));
