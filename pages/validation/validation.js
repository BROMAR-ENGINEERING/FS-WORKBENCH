/* ==============================================================
   BroSafe — Validation page
   File:     pages/validation/validation.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('validation', SH.tabbedPage({
  title: 'Validation',
  tabs: [
    { id: 'phase-1', label: 'Phase 1 — I/O Verification', src: 'pages/validation/tabs/phase-1/phase-1.js' },
    { id: 'phase-2', label: 'Phase 2 — Normal Operation', src: 'pages/validation/tabs/phase-2/phase-2.js' },
    { id: 'phase-3', label: 'Phase 3 — Fault Injection', src: 'pages/validation/tabs/phase-3/phase-3.js' },
    { id: 'phase-4', label: 'Phase 4 — Category Verification', src: 'pages/validation/tabs/phase-4/phase-4.js' },
    { id: 'version-control', label: 'Version Control', src: 'pages/validation/tabs/version-control/version-control.js' },
    { id: 'report', label: 'Report', src: 'pages/validation/tabs/report/report.js' },
  ]
}));
