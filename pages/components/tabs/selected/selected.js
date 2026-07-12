/* ==============================================================
   BroSafe — Components › Selected Components
   File:     pages/components/tabs/selected/selected.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('components', 'selected', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Selected Components</h2>' +
      'The components chosen for this job — the register that Verification draws subsystems from. Grouped by role (Input / Logic / Output) with PL, Category and PFh.</div>';
  }
});
