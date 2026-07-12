/* ==============================================================
   BroSafe — Audits page
   File:     pages/audits/audits.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only. Tab logic lives in
   pages/audits/tabs/<tab>/<tab>.js
   ============================================================== */
SH.registerPage('audits', SH.tabbedPage({
  title: 'Audits',
  tabs: [
    { id: 'checklists', label: 'Checklists', src: 'pages/audits/tabs/checklists/checklists.js' },
    { id: 'findings', label: 'Findings', src: 'pages/audits/tabs/findings/findings.js' },
  ]
}));
