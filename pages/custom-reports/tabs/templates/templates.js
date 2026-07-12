/* ==============================================================
   BroSafe — Custom Reports › Templates
   File:     pages/custom-reports/tabs/templates/templates.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('custom-reports', 'templates', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Templates</h2>' +
      'Saved report structures that can be reused across jobs. A template records which sections are included and in what order.</div>';
  }
});
