/* ==============================================================
   BroSafe — Risk Assessment › Document References
   File:     pages/risk-assessment/tabs/document-references/document-references.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('risk-assessment', 'document-references', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Document References</h2>' +
      'Documents referenced by this risk assessment, drawn from the project Document Control register.</div>';
  }
});
