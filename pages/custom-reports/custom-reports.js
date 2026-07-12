/* ==============================================================
   BroSafe — Custom Reports page
   File:     pages/custom-reports/custom-reports.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only. Tab logic lives in
   pages/custom-reports/tabs/<tab>/<tab>.js
   ============================================================== */
SH.registerPage('custom-reports', SH.tabbedPage({
  title: 'Custom Reports',
  tabs: [
    { id: 'builder', label: 'Report Builder', src: 'pages/custom-reports/tabs/builder/builder.js' },
    { id: 'templates', label: 'Templates', src: 'pages/custom-reports/tabs/templates/templates.js' },
  ]
}));
