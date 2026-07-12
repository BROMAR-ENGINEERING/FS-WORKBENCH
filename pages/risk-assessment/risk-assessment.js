/* ==============================================================
   BroSafe — Risk Assessment page
   File:     pages/risk-assessment/risk-assessment.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('risk-assessment', SH.tabbedPage({
  title: 'Risk Assessment',
  tabs: [
    { id: 'areas', label: 'Areas &amp; Assets', src: 'pages/risk-assessment/tabs/areas/areas.js' },
    { id: 'photo-references', label: 'Photo References', src: 'pages/risk-assessment/tabs/photo-references/photo-references.js' },
    { id: 'document-references', label: 'Document References', src: 'pages/risk-assessment/tabs/document-references/document-references.js' },
    { id: 'risk-assessment', label: 'Risk Assessment', src: 'pages/risk-assessment/tabs/risk-assessment/risk-assessment.js' },
    { id: 'corrections', label: 'Corrections &amp; Recommendations', src: 'pages/risk-assessment/tabs/corrections/corrections.js' },
    { id: 'version-control', label: 'Version Control', src: 'pages/risk-assessment/tabs/version-control/version-control.js' },
    { id: 'report', label: 'Report', src: 'pages/risk-assessment/tabs/report/report.js' },
  ]
}));
