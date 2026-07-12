/* ==============================================================
   BroSafe — Safety Functions › Components
   File:     pages/safety-functions/tabs/components/components.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('safety-functions', 'components', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Components</h2>' +
      'Assign components to each safety function and set the subsystem role (Input / Logic / Output). Parts are drawn from the job component register.</div>';
  }
});
