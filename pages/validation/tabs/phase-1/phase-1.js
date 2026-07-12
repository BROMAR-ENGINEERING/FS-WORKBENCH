/* ==============================================================
   BroSafe — Validation › Phase 1 — I/O Verification
   File:     pages/validation/tabs/phase-1/phase-1.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('validation', 'phase-1', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Phase 1 — I/O Verification</h2>' +
      'Verify each input and output against the wiring: signal, terminal, device tag and observed state.</div>';
  }
});
