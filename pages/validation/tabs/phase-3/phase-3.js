/* ==============================================================
   BroSafe — Validation › Phase 3 — Fault Injection
   File:     pages/validation/tabs/phase-3/phase-3.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('validation', 'phase-3', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Phase 3 — Fault Injection</h2>' +
      'Inject faults channel by channel and record the detected response — the evidence for the claimed diagnostic coverage.</div>';
  }
});
