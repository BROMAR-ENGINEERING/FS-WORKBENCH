/* ==============================================================
   BroSafe — Custom Reports › Report Builder
   File:     pages/custom-reports/tabs/builder/builder.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('custom-reports', 'builder', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Report Builder</h2>' +
      'Assemble a report from project data and information sections. Choose the sections, order them, and apply a report theme from Settings.</div>';
  }
});
