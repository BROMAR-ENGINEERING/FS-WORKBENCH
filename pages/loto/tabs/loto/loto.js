/* ==============================================================
   BroSafe — LOTO › LOTO
   File:     pages/loto/tabs/loto/loto.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('loto', 'loto', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>LOTO</h2>' +
      'Energy isolation points — electrical, pneumatic, hydraulic, gravity and stored energy — with isolation device, lock type and location.</div>';
  }
});
