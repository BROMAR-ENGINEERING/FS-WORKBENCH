/* ==============================================================
   FS Workbench — LOTO page
   File:     pages/loto/loto.js
   Rev:      0.2.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller. Sub-tabs are declared here; each is built by
   its own tab chat.
   ============================================================== */
SH.registerPage('loto', SH.tabbedPage({
  title: 'LOTO',
  tabs: [
    { id: 'asset-register',  label: 'Asset Register',  src: 'pages/loto/tabs/asset-register/asset-register.js' },
    { id: 'version-control', label: 'Version Control', src: 'pages/loto/tabs/version-control/version-control.js' },
    { id: 'report',          label: 'Report',          src: 'pages/loto/tabs/report/report.js' }
  ]
}));
