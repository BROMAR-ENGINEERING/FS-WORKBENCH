/* ==============================================================
   BroSafe — Safety Functions › Functions
   File:     pages/safety-functions/tabs/functions/functions.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('safety-functions', 'functions', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Functions</h2>' +
      'Define each safety function — id, name, the area or asset it protects, and its description. Safety functions defined here flow through to the SRS, Verification and Validation.</div>';
  }
});
