/* ==============================================================
   BroSafe — lazy script loader
   File:     js/loader.js
   Rev:      0.6.1
   Updated:  2026-07-09
   Requires: core.js
   --------------------------------------------------------------
   SH.loader.load(src) injects a classic <script> once and resolves a
   Promise. Classic injection works from file://; ES import does not.

   0.6.1 — a failed load is no longer cached. Previously the rejected
          promise was kept forever, so a page that failed once could
          never be retried without reloading the app.

   NOTE: a script that loads but throws still fires onload, so this
   resolves. The caller must verify what it expected got registered.
   ============================================================== */
(function (SH) {
  var cache = {};
  SH.loader = {
    load: function (src) {
      if (cache[src]) return cache[src];
      cache[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(src); };
        s.onerror = function () {
          delete cache[src];                 // allow a retry on next navigation
          reject(new Error('Could not load ' + src));
        };
        document.body.appendChild(s);
      });
      return cache[src];
    },
    loaded: function (src) { return !!cache[src]; }
  };
})(window.SH);