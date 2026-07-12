/* ==============================================================
   BroSafe — report theme service
   File:     js/theme.js
   Rev:      0.6.0
   Updated:  2026-07-09
   Requires: core.js, settings.js
   --------------------------------------------------------------
   ONE source of truth for the active report theme, so every preview in
   the app (Report Layout, Sections, Custom Reports, and eventually
   js/report.js) renders with the same colours and type.

   The theme editor (Settings › Report Theme) owns the editing UI and
   writes to settings 'themes.list' and 'themes.activeId'. This service
   only READS those, normalises them, and turns a theme into CSS.

   Typical use in a preview tab:

       var detach = SH.theme.attach(host, '.t-sections .preview');
       // ...render report-ish HTML inside .preview...
       // in unmount():  detach();

   attach() injects a scoped <style>, then re-writes it whenever the
   theme changes, so previews track the editor live.

   NOTE: these are REPORT DOCUMENT colours (theme data). App chrome
   still comes from the CSS variables in css/app.css.
   ============================================================== */
(function (SH) {

  var SANS  = 'Arial, Helvetica, sans-serif';
  var SERIF = 'Georgia, "Times New Roman", serif';

  var ROLES = ['title', 'subtitle', 'heading', 'subheading', 'body', 'quote', 'header', 'footer'];
  var BANDS = ['header', 'footer'];

  /* Neutral shipped default. Must match the editor's defaultTheme(). */
  function defaultTheme() {
    return {
      id: 'default', nickname: 'Default', rev: 1, builtin: true,
      page: {
        headerBg: '#F2F2F2', headerBg2: '#F2F2F2', headerGradient: false,
        footerBg: '#F2F2F2', footerBg2: '#F2F2F2', footerGradient: false
      },
      text: {
        title:      { color: '#111111', font: SANS,  size: 26,   weight: 700 },
        subtitle:   { color: '#5A5A5A', font: SANS,  size: 14,   weight: 400 },
        heading:    { color: '#1A1A1A', font: SANS,  size: 15,   weight: 700 },
        subheading: { color: '#3C3C3C', font: SANS,  size: 12,   weight: 600 },
        body:       { color: '#222222', font: SERIF, size: 10.5, weight: 400 },
        quote:      { color: '#4A4A4A', font: SERIF, size: 10.5, weight: 400 },
        header:     { color: '#555555', font: SANS,  size: 8,    weight: 400 },
        footer:     { color: '#555555', font: SANS,  size: 8,    weight: 400 }
      }
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Back-fill keys added after a theme was saved. Never overwrites. */
  function normalize(t) {
    var d = defaultTheme();
    if (!t || typeof t !== 'object') return d;
    t.page = t.page || {};
    BANDS.forEach(function (k) {
      var bg = k + 'Bg';
      if (!t.page[bg]) t.page[bg] = d.page[bg];
      if (!t.page[bg + '2']) t.page[bg + '2'] = t.page[bg];
      if (typeof t.page[k + 'Gradient'] !== 'boolean') t.page[k + 'Gradient'] = false;
    });
    t.text = t.text || {};
    ROLES.forEach(function (r) { if (!t.text[r]) t.text[r] = clone(d.text[r]); });
    return t;
  }

  function decl(spec) {
    return 'color:' + spec.color + ';' +
           'font-family:' + spec.font + ';' +
           'font-size:' + spec.size + 'pt;' +
           'font-weight:' + spec.weight + ';';
  }

  SH.theme = {

    ROLES: ROLES,
    defaultTheme: defaultTheme,
    normalize: normalize,

    /* every saved theme, normalised */
    list: function () {
      var l = SH.settings ? SH.settings.get('themes.list', null) : null;
      if (!Array.isArray(l) || !l.length) return [defaultTheme()];
      return l.map(function (t) { return normalize(clone(t)); });
    },

    activeId: function () {
      return (SH.settings && SH.settings.get('themes.activeId', null)) || null;
    },

    /* the theme previews and reports should use */
    active: function () {
      var id = this.activeId();
      var l = this.list();
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return l[0];
    },

    get: function (id) {
      var l = this.list();
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return null;
    },

    setActive: function (id) { if (SH.settings) SH.settings.set('themes.activeId', id); },

    /* solid colour, or a left-to-right two-stop gradient */
    bandCss: function (theme, key) {
      var p = (theme || this.active()).page;
      var a = p[key + 'Bg'], b = p[key + 'Bg2'];
      return p[key + 'Gradient'] ? 'linear-gradient(90deg,' + a + ',' + b + ')' : a;
    },

    /* inline style string for one text role, e.g. style="…" */
    textStyle: function (role, theme) {
      var t = theme || this.active();
      return decl(t.text[role] || t.text.body);
    },

    /* apply a role's type to a real element */
    styleEl: function (el, role, theme) {
      var t = theme || this.active();
      var s = t.text[role] || t.text.body;
      el.style.color = s.color;
      el.style.fontFamily = s.font;
      el.style.fontSize = s.size + 'pt';
      el.style.fontWeight = s.weight;
      return el;
    },

    /* ------------------------------------------------------------
       CSS for a preview region. `scope` is any selector, e.g.
       '.t-sections .preview'. Covers both semantic classes
       (.bs-title …) and the plain tags that renderBlocks() emits.
       ------------------------------------------------------------ */
    css: function (scope, theme) {
      var t = theme || this.active();
      var x = t.text;
      var s = scope;
      var out = [];

      out.push(s + '{' + decl(x.body) + 'line-height:1.4;}');
      out.push(s + ' p{' + decl(x.body) + 'line-height:1.4;margin:0 0 .6em;}');
      out.push(s + ' h1,' + s + ' .bs-title{' + decl(x.title) + 'margin:0 0 .3em;line-height:1.2;}');
      out.push(s + ' .bs-subtitle{' + decl(x.subtitle) + 'margin:0 0 1em;}');
      out.push(s + ' h2,' + s + ' .bs-heading{' + decl(x.heading) + 'margin:1.1em 0 .4em;line-height:1.25;}');
      out.push(s + ' h3,' + s + ' h4,' + s + ' h5,' + s + ' h6,' + s + ' .bs-subheading{' +
        decl(x.subheading) + 'margin:.9em 0 .35em;line-height:1.3;}');
      out.push(s + ' blockquote,' + s + ' .bs-quote{' + decl(x.quote) +
        'margin:1em 0;padding:2px 0 2px 14px;border-left:3px solid currentColor;}');

      /* tables emitted by SH.content.renderBlocks() */
      out.push(s + ' table{border-collapse:collapse;width:100%;margin:.8em 0;}');
      out.push(s + ' th{' + decl(x.subheading) + 'border:1px solid #C9C9C9;padding:5px 8px;text-align:left;}');
      out.push(s + ' td{' + decl(x.body) + 'border:1px solid #C9C9C9;padding:5px 8px;}');
      out.push(s + ' caption{' + decl(x.subtitle) + 'text-align:left;margin-bottom:.3em;}');

      /* figures */
      out.push(s + ' figure{margin:1em 0;}');
      out.push(s + ' figure img{max-width:100%;height:auto;display:block;}');
      out.push(s + ' figcaption{' + decl(x.subtitle) + 'margin-top:.35em;}');

      /* page bands */
      out.push(s + ' .bs-header-band{background:' + this.bandCss(t, 'header') + ';}');
      out.push(s + ' .bs-footer-band{background:' + this.bandCss(t, 'footer') + ';}');
      out.push(s + ' .bs-header-band,' + s + ' .bs-header-band *{' + decl(x.header) + '}');
      out.push(s + ' .bs-footer-band,' + s + ' .bs-footer-band *{' + decl(x.footer) + '}');

      return out.join('\n');
    },

    /* ------------------------------------------------------------
       Inject a scoped <style> into `host` and keep it in step with the
       active theme. Returns a detach() to call from unmount().
       ------------------------------------------------------------ */
    attach: function (host, scope, opts) {
      if (!host) return function () {};
      var themeId = opts && opts.themeId;
      var style = SH.el('style', { 'data-bs-theme': scope });
      host.appendChild(style);

      var self = this;
      function paint() {
        var t = themeId ? (self.get(themeId) || self.active()) : self.active();
        style.textContent = self.css(scope, t);
      }
      paint();

      SH.bus.on('settings:changed', paint);
      return function detach() {
        SH.bus.off('settings:changed', paint);
        if (style.parentNode) style.parentNode.removeChild(style);
      };
    },

    /* convenience: subscribe to theme changes without attaching CSS */
    onChange: function (fn) {
      SH.bus.on('settings:changed', fn);
      return function () { SH.bus.off('settings:changed', fn); };
    }
  };

})(window.SH);
