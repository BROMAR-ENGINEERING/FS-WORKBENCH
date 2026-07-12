/* ==============================================================
   BroSafe — LOTO page
   File:     pages/loto/loto.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('loto', SH.tabbedPage({
  title: 'LOTO',
  tabs: [
    { id: 'asset-register', label: 'Asset Register', src: 'pages/loto/tabs/asset-register/asset-register.js' },
    { id: 'procedures', label: 'Procedures', src: 'pages/loto/tabs/procedures/procedures.js' },
    { id: 'loto', label: 'LOTO', src: 'pages/loto/tabs/loto/loto.js' },
    { id: 'report', label: 'Report', src: 'pages/loto/tabs/report/report.js' },
  ]
}));
