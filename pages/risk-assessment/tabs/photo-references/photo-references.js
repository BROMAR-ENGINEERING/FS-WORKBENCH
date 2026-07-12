/* ==============================================================
   BroSafe — Risk Assessment › Photo References
   File:     pages/risk-assessment/tabs/photo-references/photo-references.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('risk-assessment', 'photo-references', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Photo References</h2>' +
      'Upload site photos and reference them to an area or asset. Photos can be embedded in the risk assessment report.</div>';
  }
});
