/* ==============================================================
   BroSafe — Components › Library Browser
   File:     pages/components/tabs/library/library.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   Tab module. mount(host, ctx) renders into host only.
   ============================================================== */
SH.registerTab('components', 'library', {
  mount: function (host) {
    host.innerHTML =
      '<div class="stub"><h2>Library Browser</h2>' +
      'Search the loaded SISTEMA VDMA 66413 libraries and add parts to this job. Manage which libraries are loaded in Settings › Component Libraries.</div>';
  }
});
