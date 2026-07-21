/* ==============================================================
   BroSafe — Settings page
   File:     pages/settings/settings.js
   Rev:      0.6.2
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only. Tab logic lives in
   pages/settings/tabs/<tab>/<tab>.js
   ============================================================== */
SH.registerPage('settings', SH.tabbedPage({
  title: 'Settings',
  tabs: [
    { id: 'company', label: 'Company', src: 'pages/settings/tabs/company/company.js' },
    { id: 'report-theme', label: 'Report Theme', src: 'pages/settings/tabs/report-theme/report-theme.js' },
    { id: 'table-style',  label: 'Table Style',  src: 'pages/settings/tabs/table-style/table-style.js' },
    { id: 'report-layout', label: 'Report Layout', src: 'pages/settings/tabs/report-layout/report-layout.js' },
    { id: 'information-sections', label: 'Sections', src: 'pages/settings/tabs/information-sections/information-sections.js' },
    { id: 'libraries', label: 'Component Libraries', src: 'pages/settings/tabs/libraries/libraries.js' },
    { id: 'data-storage', label: 'Data & Storage', src: 'pages/settings/tabs/data-storage/data-storage.js' },
  ]
}));
