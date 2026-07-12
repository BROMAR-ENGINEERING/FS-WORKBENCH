/* ==============================================================
   BroSafe — Components page
   File:     pages/components/components.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only. Tab logic lives in
   pages/components/tabs/<tab>/<tab>.js
   ============================================================== */
SH.registerPage('components', SH.tabbedPage({
  title: 'Components',
  tabs: [
    { id: 'selected', label: 'Selected Components', src: 'pages/components/tabs/selected/selected.js' },
    { id: 'library', label: 'Library Browser', src: 'pages/components/tabs/library/library.js' },
    { id: 'custom', label: 'Custom Components', src: 'pages/components/tabs/custom/custom.js' },
  ]
}));
