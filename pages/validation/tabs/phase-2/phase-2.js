/* ==============================================================
   BroSafe — Validation › Phase 2 — Normal Operation
   File:     pages/validation/tabs/phase-2/phase-2.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('validation', 'phase-2', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Phase 2 — Normal Operation</h2>' +
      'Confirm each safety function behaves correctly under normal operation, including reset and restart behaviour.</div>';
  }
});
