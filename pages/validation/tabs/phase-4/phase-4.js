/* ==============================================================
   FS Workbench — Validation › Phase 4 — Category Verification
   File:     pages/validation/tabs/phase-4/phase-4.js
   Rev:      0.1.0
   Updated:  2026-07-09
   Requires: core.js, store.js
   --------------------------------------------------------------
   Stub — ready to develop. Replace the card with real UI.
   Any new schema keys must be declared in the CORE CHAT first.
   ============================================================== */
SH.registerTab('validation', 'phase-4', (function () {

  function render(host) {
    if (!SH.store.hasProject()) {
      host.innerHTML = '<div class="warnnote">No project is open.</div>';
      return;
    }
    host.innerHTML = '';
    var card = SH.el('div', { class: 'stub' });
    card.innerHTML =
      '<h2>Phase 4 — Category Verification</h2>' +
      '<p>Confirm the as-built system meets its required Category and PL. Cross-reference architecture against ISO 13849-1 Table 10: MTTFd per channel, DCavg, CCF measures, diagnostic test interval.</p>' +
      '<p class="hint"><strong>Fields to build:</strong> Required PLr vs achieved PL, required Category vs as-built, CCF checklist, DC checklist, conclusion, tester, date</p>' +
      '<p class="hint">Schema: ask the core chat to add ' +
      '<code>project.validation.phase4</code> before persisting anything.</p>';
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
