/* ==============================================================
   BroSafe — Verification › Safety Functions
   File:     pages/verification/tabs/safety-functions/safety-functions.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('verification', 'safety-functions', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Safety Functions</h2>' +
      'The working page: PL calculation for each safety function. Sums subsystem PFh, applies the lowest-PL cap, derives PLr from the risk graph and reports the achieved PL and category.</div>';
  }
});
