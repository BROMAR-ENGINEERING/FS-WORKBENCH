/* ==============================================================
   BroSafe — information section registry
   File:     js/content.js
   Rev:      0.5.0
   Updated:  2026-07-09
   Requires: core.js, loader.js, settings.js
   --------------------------------------------------------------
   Information sections are reusable blocks of boilerplate inserted
   into generated reports — Common Cause Failure, Category
   Architectures, standard extracts, and anything the user writes.

   TWO ORIGINS, ONE LIST
     shipped  read-only seeds in content/sections/<id>.js (install tree)
     user     folders in the BroSafe data folder, owned by SH.settings

   There is NO override mechanism. A user section is an ordinary
   section with its own id and a `rev` that bumps on save; it shadows
   nothing. Editing a shipped section means saving a copy as a user
   section — the seed stays put as a fallback. Deleting a user section
   removes only that section.

   file:// constraints
     - Shipped sections CANNOT be fetch()ed. They ship as classic
       scripts loaded on demand via SH.loader.
     - Shipped images use a relative <img src="assets/content/x.png">.
       That resolves, because they live under the app root.
     - User images live in the data folder, which may be a NAS path
       outside the app root, so a relative src will NOT resolve. They
       are emitted as <img data-asset="…"> and hydrated to blob: URLs
       via SH.settings.sectionAssetUrl(). The caller revokes them.

   0.5.0 — merged shipped + user sections; variants removed; block
          rendering (heading/text/table/image); hydrateAssets().
   0.3.0 — initial registry with variants and inline overrides.
   ============================================================== */
(function (SH) {

  var registry = {};   // shipped id -> { id, title, category, variants|blocks }

  SH.content = {

    /* --- sections that ship with BroSafe (install tree) --- */
    MANIFEST: [
      { id: 'common-cause-failure',  title: 'Common Cause Failure (CCF)', category: 'ccf',                   src: 'content/sections/common-cause-failure.js' },
      { id: 'category-architectures', title: 'Category Architectures',    category: 'category-architecture', src: 'content/sections/category-architectures.js' }
    ],

    /* called by each content/sections/<id>.js */
    register: function (id, def) {
      registry[id] = Object.assign({ id: id, source: 'shipped' }, def);
    },

    /* ------------------------------------------------------------
       Listing
       ------------------------------------------------------------ */

    /* Shipped seeds + user sections, in one list. doc-tabs.js relies on
       each entry having { id, title, category }. Safe with no data
       folder open: listSections() returns []. */
    all: function () {
      var user = (SH.settings && SH.settings.listSections) ? SH.settings.listSections() : [];
      var shipped = this.MANIFEST.map(function (m) {
        return { id: m.id, title: m.title, category: m.category, source: 'shipped', src: m.src };
      });
      return shipped.concat(user.map(function (s) {
        return {
          id: s.id, title: s.title, category: s.category,
          nickname: s.nickname, rev: s.rev, updated: s.updated, source: 'user'
        };
      }));
    },

    shipped: function () { return this.MANIFEST.slice(); },
    user: function () { return (SH.settings && SH.settings.listSections) ? SH.settings.listSections() : []; },

    isShipped: function (id) {
      return this.MANIFEST.some(function (m) { return m.id === id; });
    },

    /* ------------------------------------------------------------
       Resolving
       ------------------------------------------------------------ */

    /* Loaded shipped definition, or a user section from the cache. */
    get: function (id) {
      if (registry[id]) return registry[id];
      return (SH.settings && SH.settings.getSection) ? SH.settings.getSection(id) : null;
    },

    /* Resolve a section by id. User sections come straight from the
       settings cache; shipped ones lazy-load their script. */
    load: function (id) {
      var user = (SH.settings && SH.settings.getSection) ? SH.settings.getSection(id) : null;
      if (user) return Promise.resolve(user);

      if (registry[id]) return Promise.resolve(registry[id]);

      var entry = this.MANIFEST.filter(function (m) { return m.id === id; })[0];
      if (!entry) return Promise.reject(new Error('Unknown information section: ' + id));

      return SH.loader.load(entry.src).then(function () {
        if (!registry[id]) throw new Error('Section "' + id + '" did not register');
        return registry[id];
      });
    },

    /* Sections a given report includes, in manifest order.
       docId ∈ risk-assessment | srs | verification | validation | loto */
    selected: function (docId) {
      var cfg = (SH.settings && SH.settings.get('reports.' + docId + '.sections', {})) || {};
      return SH.content.all().filter(function (s) {
        return cfg[s.id] && cfg[s.id].include;
      });
    },

    /* ------------------------------------------------------------
       Rendering
       ------------------------------------------------------------ */

    /* Returns an HTML string for either shape:
         user     section.blocks[]
         shipped  section.variants.default.html   (legacy, still supported)
       User images become <img data-asset="path"> — call hydrateAssets()
       on the mounted element to swap in blob: URLs. */
    render: function (section) {
      if (!section) return '';
      if (Array.isArray(section.blocks)) return renderBlocks(section.blocks);

      var v = section.variants && (section.variants.default || firstVariant(section.variants));
      return (v && v.html) || '';
    },

    renderBlocks: function (blocks) { return renderBlocks(blocks); },

    /* Swap every <img data-asset> for a blob: URL read through the data
       folder handle. Resolves with the URLs created, so the caller can
       URL.revokeObjectURL() each one on unmount. */
    hydrateAssets: function (rootEl) {
      if (!rootEl || !SH.settings || !SH.settings.sectionAssetUrl) return Promise.resolve([]);
      var imgs = [].slice.call(rootEl.querySelectorAll('img[data-asset]'));
      if (!imgs.length) return Promise.resolve([]);

      return Promise.all(imgs.map(function (img) {
        var path = img.getAttribute('data-asset');
        return SH.settings.sectionAssetUrl(path).then(function (url) {
          img.src = url;
          img.removeAttribute('data-asset');
          return url;
        }).catch(function (e) {
          console.warn('BroSafe: image not found —', path, e.message);
          img.setAttribute('alt', (img.getAttribute('alt') || '') + ' (image missing)');
          return null;
        });
      })).then(function (urls) {
        return urls.filter(Boolean);
      });
    },

    /* Deprecated. Variants were removed in 0.5.0; a "brief" section is
       now just a separate section. Kept so old callers do not throw. */
    variant: function (id) {
      var s = this.get(id);
      if (!s) return null;
      if (Array.isArray(s.blocks)) return { label: s.title, html: renderBlocks(s.blocks) };
      return s.variants ? (s.variants.default || firstVariant(s.variants)) : null;
    }
  };

  /* ==============================================================
     Block rendering
     ============================================================== */

  function esc(s) { return SH.esc(s); }

  function firstVariant(v) {
    var k = Object.keys(v || {});
    return k.length ? v[k[0]] : null;
  }

  /* A blank line separates paragraphs. */
  function paragraphs(text) {
    return String(text || '')
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean)
      .map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  function renderBlocks(blocks) {
    if (!Array.isArray(blocks)) return '';
    return blocks.map(function (b) {
      if (!b || !b.type) return '';

      if (b.type === 'heading') {
        var lvl = Math.min(6, Math.max(2, parseInt(b.level, 10) || 3));
        return '<h' + lvl + '>' + esc(b.text) + '</h' + lvl + '>';
      }

      if (b.type === 'text') return paragraphs(b.text);

      if (b.type === 'table') {
        var head = Array.isArray(b.header) && b.header.length
          ? '<thead><tr>' + b.header.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>'
          : '';
        var body = (Array.isArray(b.rows) ? b.rows : []).map(function (r) {
          return '<tr>' + (Array.isArray(r) ? r : []).map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
        }).join('');
        var cap = b.caption ? '<caption>' + esc(b.caption) + '</caption>' : '';
        return '<table class="tbl">' + cap + head + '<tbody>' + body + '</tbody></table>';
      }

      if (b.type === 'image') {
        // data-asset, not src: the file lives in the data folder and must
        // be hydrated to a blob: URL. See hydrateAssets().
        var img = '<img data-asset="' + esc(b.path) + '" alt="' + esc(b.alt || '') + '">';
        return b.caption
          ? '<figure>' + img + '<figcaption>' + esc(b.caption) + '</figcaption></figure>'
          : '<figure>' + img + '</figure>';
      }

      return '';
    }).join('\n');
  }

})(window.SH);