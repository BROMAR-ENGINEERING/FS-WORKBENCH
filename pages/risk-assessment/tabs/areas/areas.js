/* ==============================================================
   BroSafe — Risk Assessment › Areas &amp; Assets
   File:     pages/risk-assessment/tabs/areas/areas.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('risk-assessment', 'areas', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Areas &amp; Assets</h2>' +
      'Break the project into areas, machines and sub-locations. <b>This register is shared across the whole app</b> — hazards, safety functions, LOTO points and photos all reference these entries, so define them once here.</div>';
  }
});
