/* ==============================================================
   BroSafe — LOTO › Procedures
   File:     pages/loto/tabs/procedures/procedures.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('loto', 'procedures', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Procedures</h2>' +
      'Lockout / tagout procedure steps per asset, with sequence, verification step and sign-off.</div>';
  }
});
