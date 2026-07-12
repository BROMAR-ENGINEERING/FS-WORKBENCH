/* ==============================================================
   BroSafe — hash router
   File:     js/router.js
   Rev:      0.6.1
   Updated:  2026-07-09
   Requires: core.js, loader.js, app.js (SH.MENU)
   --------------------------------------------------------------
   Resolves #/page/tab, lazy-loads the page controller, mounts it once,
   then delegates the tab id to the page's onTab().

   0.6.1 — a page that failed to load or register used to write its error
          into #content, which WIPED every other kept-alive page and left
          `built` holding detached nodes: navigating back to a working
          page showed a permanent blank screen. Errors now render inside
          the failing page's own container and never touch its siblings.
          Failed script loads are no longer cached, so navigating back
          retries instead of failing forever.
   0.6.0 — pages are KEPT ALIVE. Each page gets its own container that is
          hidden on navigation rather than destroyed, so a half-filled
          form still holds its input when you come back.
   ============================================================== */
(function (SH) {

  var current = { page: null, tab: null };
  var built = {};              // pageId -> { wrap, head, host }

  function parse() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    return { page: parts[0] || (SH.MENU[0] && SH.MENU[0].id), tab: parts[1] || null };
  }

  function setActiveMenu(pageId) {
    var items = document.querySelectorAll('#sidebar [data-page]');
    [].forEach.call(items, function (a) {
      a.classList.toggle('active', a.getAttribute('data-page') === pageId);
    });
  }

  function showOnly(pageId) {
    Object.keys(built).forEach(function (id) {
      built[id].wrap.style.display = (id === pageId) ? '' : 'none';
    });
  }

  /* Build (or reuse) a page's own container. Never clears #content, so a
     broken page can never take its siblings down with it. */
  function container(pageId, title) {
    if (built[pageId]) return built[pageId];
    var wrap = SH.el('div', { class: 'page-wrap', 'data-page': pageId });
    var head = SH.el('div', { class: 'page-head' }, SH.el('h1', null, title || pageId));
    var host = SH.el('div', { class: 'page' });
    wrap.appendChild(head);
    wrap.appendChild(host);
    document.getElementById('content').appendChild(wrap);
    built[pageId] = { wrap: wrap, head: head, host: host };
    return built[pageId];
  }

  function fail(pageId, title, html) {
    var b = container(pageId, title);
    b.host.innerHTML = '<div class="stub error">' + html + '</div>';
    showOnly(pageId);
  }

  function go() {
    var r = parse();
    var def = SH.MENU.filter(function (m) { return m.id === r.page; })[0];
    if (!def) { location.hash = '#/' + SH.MENU[0].id; return; }
    setActiveMenu(r.page);

    /* already mounted — reveal it and switch the tab, keeping its DOM */
    if (built[r.page] && SH.pages[r.page]) {
      showOnly(r.page);
      current = { page: r.page, tab: r.tab };
      var p = SH.pages[r.page];
      if (p.onTab) p.onTab(r.tab);
      return;
    }

    SH.loader.load(def.src).then(function () {
      if (built[r.page] && SH.pages[r.page]) { showOnly(r.page); return; }   // raced

      var page = SH.pages[r.page];
      if (!page) {
        console.error('BroSafe: ' + def.src + ' loaded but did not call ' +
          'SH.registerPage("' + r.page + '", …). Check that this file is the page ' +
          'controller and not another file of the same name.');
        fail(r.page, def.label,
          'Page <b>' + SH.esc(r.page) + '</b> did not register.<br>' +
          '<code>' + SH.esc(def.src) + '</code> loaded but never called ' +
          '<code>SH.registerPage(&quot;' + SH.esc(r.page) + '&quot;, …)</code>.');
        return;
      }

      var b = container(r.page, page.title || def.label);
      showOnly(r.page);
      page.mount(b.host, { page: r.page });
      current = { page: r.page, tab: r.tab };
      if (page.onTab) page.onTab(r.tab);
    }).catch(function (err) {
      console.error('BroSafe: failed to load ' + def.src, err);
      fail(r.page, def.label,
        'Failed to load <code>' + SH.esc(def.src) + '</code>.<br>' +
        SH.esc(err && err.message ? err.message : String(err)));
    });
  }

  SH.router = {
    start: function () {
      window.addEventListener('hashchange', go);
      if (!location.hash) location.hash = '#/' + SH.MENU[0].id;
      else go();
    },
    go: go,

    /* Drop a page's DOM and let its tabs release resources. Nothing calls
       this yet; it exists so "close project" can reset the workspace. */
    destroyPage: function (pageId) {
      var b = built[pageId];
      if (!b) return;
      var page = SH.pages[pageId];
      if (page && page.destroy) page.destroy();
      if (b.wrap.parentNode) b.wrap.parentNode.removeChild(b.wrap);
      delete built[pageId];
    },
    destroyAll: function () { Object.keys(built).forEach(SH.router.destroyPage); }
  };
})(window.SH);