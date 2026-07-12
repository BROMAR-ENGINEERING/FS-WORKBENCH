/* ==============================================================
   BroSafe — Safety Requirement Spec › SRS
   File:     pages/srs/tabs/srs/srs.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('srs', 'srs', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>SRS</h2>' +
      'The working page: assign a required performance level (PLr) and category to each safety function, with the operating mode, reaction and triggering event.</div>';
  }
});
