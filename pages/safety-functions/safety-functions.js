/* ==============================================================
   BroSafe — Safety Functions page
   File:     pages/safety-functions/safety-functions.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('safety-functions', SH.tabbedPage({
  title: 'Safety Functions',
  tabs: [
    { id: 'functions', label: 'Functions', src: 'pages/safety-functions/tabs/functions/functions.js' },
    { id: 'components', label: 'Components', src: 'pages/safety-functions/tabs/components/components.js' },
  ]
}));
