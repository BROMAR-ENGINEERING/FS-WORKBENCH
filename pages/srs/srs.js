/* ==============================================================
   BroSafe — Safety Requirement Spec page
   File:     pages/srs/srs.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('srs', SH.tabbedPage({
  title: 'Safety Requirement Spec',
  tabs: [
    { id: 'srs', label: 'SRS', src: 'pages/srs/tabs/srs/srs.js' },
    { id: 'version-control', label: 'Version Control', src: 'pages/srs/tabs/version-control/version-control.js' },
    { id: 'report', label: 'Report', src: 'pages/srs/tabs/report/report.js' },
  ]
}));
