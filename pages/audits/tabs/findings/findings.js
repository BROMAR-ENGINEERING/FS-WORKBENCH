/* ==============================================================
   BroSafe — Audits › Findings
   File:     pages/audits/tabs/findings/findings.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('audits', 'findings', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Findings</h2>' +
      'Findings raised during an audit, with severity, recommended action, responsible party and close-out status.</div>';
  }
});
