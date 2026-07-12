/* ==============================================================
   FS Workbench — Validation › Phase 1 — I/O Verification
   File:     pages/validation/tabs/phase-1/phase-1.js
   Rev:      0.1.0
   Updated:  2026-07-09
   Requires: core.js, store.js
   --------------------------------------------------------------
   Stub — ready to develop. Replace the card with real UI.
   Any new schema keys must be declared in the CORE CHAT first.
   ============================================================== */
SH.registerTab('validation', 'phase-1', (function () {

  function render(host) {
    if (!SH.store.hasProject()) {
      host.innerHTML = '<div class="warnnote">No project is open.</div>';
      return;
    }
    host.innerHTML = '';
    var card = SH.el('div', { class: 'stub' });
    card.innerHTML =
      '<h2>Phase 1 — I/O Verification</h2>' +
      '<p>Verify every input and output is correctly wired before functional testing. For each I/O point: confirm signal type, terminal number, device tag, address and observed state match the electrical drawings.</p>' +
      '<p class="hint"><strong>Fields to build:</strong> I/O point tag, terminal, type, address, expected state, observed state, result, discrepancy, tester, date</p>' +
      '<p class="hint">Schema: ask the core chat to add ' +
      '<code>project.validation.phase1</code> before persisting anything.</p>';
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
