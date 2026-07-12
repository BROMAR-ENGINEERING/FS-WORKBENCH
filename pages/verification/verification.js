/* ==============================================================
   BroSafe — Verification page
   File:     pages/verification/verification.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('verification', SH.tabbedPage({
  title: 'Verification',
  tabs: [
    { id: 'safety-functions', label: 'Safety Functions', src: 'pages/verification/tabs/safety-functions/safety-functions.js' },
    { id: 'version-control', label: 'Version Control', src: 'pages/verification/tabs/version-control/version-control.js' },
    { id: 'report', label: 'Report', src: 'pages/verification/tabs/report/report.js' },
  ]
}));
