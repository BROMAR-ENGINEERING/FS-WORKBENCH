/* ==============================================================
   BroSafe — LOTO › Asset Register
   File:     pages/loto/tabs/asset-register/asset-register.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('loto', 'asset-register', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Asset Register</h2>' +
      'Assets requiring isolation. <b>Shares the Areas &amp; Assets register</b> — add plant here or in Risk Assessment and it appears in both.</div>';
  }
});
