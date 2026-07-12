/* ==============================================================
   BroSafe — Risk Assessment › Risk Assessment
   File:     pages/risk-assessment/tabs/risk-assessment/risk-assessment.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('risk-assessment', 'risk-assessment', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Risk Assessment</h2>' +
      'The working page: hazard identification, risk estimation, existing controls and residual risk, per area or asset.</div>';
  }
});
