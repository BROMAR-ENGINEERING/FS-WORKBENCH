/* ==============================================================
   BroSafe — Components › Custom Components
   File:     pages/components/tabs/custom/custom.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('components', 'custom', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Custom Components</h2>' +
      'Create parts that are not in any SISTEMA library. Saved to your custom component library in the BroSafe data folder, so they are reusable across jobs.</div>';
  }
});
