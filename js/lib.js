/* ==============================================================
   BroSafe — SISTEMA VDMA 66413 library service
   File:     js/lib.js
   Rev:      0.2.0
   Updated:  2026-07-09
   Requires: core.js, settings.js (>= 0.8.0)
   --------------------------------------------------------------
   Parser + I/O. Parse is pure (XML text in, object out). I/O reads
   and writes <data folder>/libraries/<slug>/ via SH.settings.
   Lazy-loaded with SH.loader.load('js/lib.js') — never in index.html.
   ============================================================== */
(function () {
  'use strict';

  var ROOT = 'libraries';
  var LANG_FALLBACK = ['en'];
  var cache = Object.create(null);   // slug -> parsed library (session only)

  /* ==============================================================
     PART 1 — PARSER (pure)
     ============================================================== */

  function kid(el, tag) {
    if (!el) return null;
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (n.nodeName === tag) return n;
    }
    return null;
  }

  function kids(el, tag) {
    var out = [];
    if (!el) return out;
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (!tag || n.nodeName === tag) out.push(n);
    }
    return out;
  }

  function txt(el) {
    return el && el.textContent != null ? el.textContent.trim() : '';
  }

  function attr(el, name) {
    return el && el.getAttribute ? el.getAttribute(name) : null;
  }

  /* Numbers. Vendors are inconsistent, sometimes within one file:
       Pilz      PFH_d "1,51E-10"   B10d "1,00E+5"
       Schneider PFH_d "1,01E-07"   B10d "1000000"
       Rockwell  PFH_d "1,1E-8"     B10  "1E+6"
     parseFloat("1,00E+5") silently returns 1. Fail loudly instead.
     A value carrying BOTH separators is ambiguous — reject it. */
  function num(raw, warnings, where) {
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      if (warnings) warnings.push('Ambiguous number "' + s + '" at ' + where + ' — ignored.');
      return null;
    }
    var n = Number(s.replace(',', '.'));
    if (!isFinite(n)) {
      if (warnings) warnings.push('Unparseable number "' + s + '" at ' + where + ' — ignored.');
      return null;
    }
    return n;
  }

  /* Paths. "./PNG/x.png" and ".\png\x.PNG" both -> segments ['PNG','x.png'].
     Rockwell's DocFileName resolves to an absolute https:// URL instead. */
  function path(raw) {
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return { raw: s, url: s, isUrl: true, segments: [] };
    var parts = s.replace(/\\/g, '/').split('/').filter(function (p) {
      return p && p !== '.';
    });
    if (!parts.length) return null;
    return { raw: s, isUrl: false, segments: parts, file: parts[parts.length - 1] };
  }

  /* Language. Every @Key is a lookup into <Language>; keys are not display
     text (Pilz key "Dual channel" -> English "Dual-channel"). Rockwell puts
     inline text on <Information> instead of using a key. */
  function pickText(el, prefs) {
    if (!el) return '';
    var texts = kids(el, 'Text');
    if (!texts.length) return txt(el);
    var byLang = {}, first = null, i, lk;
    for (i = 0; i < texts.length; i++) {
      lk = attr(texts[i], 'LanguageKey') || '';
      if (first === null) first = txt(texts[i]);
      if (!byLang[lk]) byLang[lk] = txt(texts[i]);
    }
    for (i = 0; i < prefs.length; i++) if (byLang[prefs[i]]) return byLang[prefs[i]];
    return first || '';
  }

  function table(langEl, containerTag, childTag, prefs) {
    var out = Object.create(null);
    var c = kid(langEl, containerTag);
    if (!c) return out;
    var list = kids(c, childTag), i, key;
    for (i = 0; i < list.length; i++) {
      key = attr(list[i], 'Key');
      if (key != null) out[key] = pickText(list[i], prefs);
    }
    return out;
  }

  function resolveKey(el, tbl, warnings, where) {
    if (!el) return null;
    var inline = txt(el);
    if (inline) return inline;
    var key = attr(el, 'Key');
    if (key == null) return null;
    if (Object.prototype.hasOwnProperty.call(tbl, key)) return tbl[key];
    if (warnings) warnings.push('Unresolved key "' + key + '" at ' + where + '.');
    return key;
  }

  var DT_FIELDS = ['PL', 'SILCL', 'PFH_d', 'MTTF_d', 'B10d', 'B10', 'RDF', 'TM_T1'];

  function readUseCase(ucEl, tbls, warnings, where) {
    var uc = {
      index: 0, hierarchy: [], functions: [], category: null, info: null,
      deviceType: null, pl: null, sil: null,
      pfhd: null, mttfd: null, b10: null, b10d: null, rdf: null, tm: null,
      b10dDerived: false, basis: 'none'
    };

    // Rockwell supplies only Hierarchy1 on 379 of 420 use cases. Optional.
    var cons = kids(kid(ucEl, 'Constraints'));
    cons.sort(function (a, b) { return a.nodeName.localeCompare(b.nodeName); });
    for (var i = 0; i < cons.length; i++) {
      if (!/^Hierarchy\d$/.test(cons[i].nodeName)) continue;
      var key = attr(cons[i], 'Key');
      if (!key || key === '#NotApplicable') continue;
      uc.hierarchy.push(resolveKey(cons[i], tbls.constraints, warnings, where));
    }

    var fns = kids(kid(ucEl, 'Function'));
    for (i = 0; i < fns.length; i++) {
      if (txt(fns[i]) !== 'true') continue;
      if (fns[i].nodeName === 'InputFunction') uc.functions.push('input');
      else if (fns[i].nodeName === 'LogicFunction') uc.functions.push('logic');
      else if (fns[i].nodeName === 'OutputFunction') uc.functions.push('output');
    }

    var cat = txt(kid(ucEl, 'InfoConfig'));
    if (cat && cat.indexOf('CAT_') === 0) {
      var c = cat.slice(4);
      uc.category = (c === 'na') ? null : c;
    }

    var infoEl = kid(ucEl, 'Info');
    if (infoEl) uc.info = resolveKey(infoEl, tbls.infos, warnings, where);

    var dt = kids(kid(ucEl, 'Parameter'))[0];
    if (!dt) { warnings.push('No Parameter at ' + where + '.'); return uc; }
    var m = /^DeviceType([1-4])$/.exec(dt.nodeName);
    if (!m) {
      warnings.push('Unknown parameter block "' + dt.nodeName + '" at ' + where + '.');
      return uc;
    }
    uc.deviceType = Number(m[1]);

    var vals = {};
    for (i = 0; i < DT_FIELDS.length; i++) {
      var f = DT_FIELDS[i], el = kid(dt, f);
      if (el) vals[f] = (f === 'PL' || f === 'SILCL')
        ? txt(el) : num(txt(el), warnings, where + '/' + f);
    }
    uc.pl = vals.PL || null;
    uc.sil = vals.SILCL || null;
    uc.pfhd = vals.PFH_d != null ? vals.PFH_d : null;
    uc.mttfd = vals.MTTF_d != null ? vals.MTTF_d : null;
    uc.b10d = vals.B10d != null ? vals.B10d : null;
    uc.b10 = vals.B10 != null ? vals.B10 : null;
    uc.rdf = vals.RDF != null ? vals.RDF : null;
    uc.tm = vals.TM_T1 != null ? vals.TM_T1 : null;

    /* RDF derives the dangerous fraction from B10 only. B10d and MTTF_d are
       ALREADY dangerous-failure values — re-applying RDF would inflate MTTFd
       2-10x in the optimistic direction. Evidence: Rockwell DT3 has B10+RDF
       (12) and B10d alone (64), disjoint. Pilz carries RDF alongside B10d on
       375 of 465. Schneider DT2 never carries RDF at all. */
    if (uc.b10d == null && uc.b10 != null) {
      if (uc.rdf != null && uc.rdf > 0) {
        uc.b10d = uc.b10 / (uc.rdf / 100);
        uc.b10dDerived = true;
      } else {
        warnings.push('B10 without usable RDF at ' + where + ' — cannot derive B10d.');
      }
    }

    if (uc.pfhd != null) uc.basis = 'pfhd';
    else if (uc.mttfd != null) uc.basis = 'mttfd';
    else if (uc.b10d != null) uc.basis = 'b10d';
    else uc.basis = 'none';   // DeviceType4: claimed PL/SIL, no probability

    return uc;
  }

  // Identity of a use case, for collapsing genuinely identical entries.
  function ucSignature(u) {
    return [u.deviceType, u.category, u.pl, u.sil, u.pfhd, u.mttfd,
      u.b10d, u.tm, u.functions.join('+'), u.hierarchy.join('>')].join('|');
  }

  function readDevice(dEl, tbls, warnings) {
    var partNumber = txt(kid(dEl, 'PartNumber'));
    var revision = txt(kid(dEl, 'Revision'));
    if (/^(n\/a|na|-)$/i.test(revision)) revision = '';   // Schneider stamps N/A on all 133

    var where = partNumber || txt(kid(dEl, 'Identifier'));

    /* uid, not Identifier. Identifier is unusable as a key:
         Schneider "ASISE | As-i safety at work", Rockwell "440G-EZ* Series A",
         Pilz trailing whitespace on 135 devices (txt() already trims it). */
    var dev = {
      uid: partNumber + (revision ? '@' + revision : ''),
      identifier: txt(kid(dEl, 'Identifier')),
      partNumber: partNumber,
      revision: revision || null,
      name: resolveKey(kid(dEl, 'Name'), tbls.names, warnings, where),
      group: resolveKey(kid(dEl, 'Group'), tbls.groups, warnings, where) || null,
      description: resolveKey(kid(dEl, 'Description'), tbls.descriptions, warnings, where) || null,
      icon: path(txt(kid(dEl, 'IconFileName'))),
      doc: null,
      archived: txt(kid(dEl, 'Archive')) === 'true',
      merged: false,
      useCases: []
    };

    // DocFileName is a KEY into Language/DocFiles: a relative path for
    // Schneider (.\pdf\x.pdf), an absolute https:// URL for Rockwell.
    var docEl = kid(dEl, 'DocFileName');
    if (docEl) {
      var docVal = resolveKey(docEl, tbls.docs, warnings, where);
      if (docVal) dev.doc = path(docVal);
    }

    var ucs = kids(kid(dEl, 'UseCases'), 'UseCase');
    for (var i = 0; i < ucs.length; i++) {
      dev.useCases.push(readUseCase(ucs[i], tbls, warnings, where + '#' + i));
    }
    return dev;
  }

  /* Merge devices sharing a uid.

     Pilz ships 1485 <Device> elements but only 1483 distinct uids. 777525
     (PNOZ XV3.1P) and 8176540 (PMCprotego D.12) each appear twice — and the
     pairs are NOT duplicates. 8176540 entry 1 is single-channel, Cat 3, PL_d,
     PFHd 7.05e-8; entry 2 is dual-channel, Cat 4, PL_e, PFHd 1.04e-9. Pilz
     simply modelled two use cases as two Device elements.

     Discarding the later entry would hide a valid, 68x better use case and
     nothing would look wrong. So: concatenate use cases, collapse only those
     that are byte-identical, reindex. Indices stay stable across runs of the
     same file, so {uid, useCaseIndex} provenance holds; crc32 catches the
     library being updated underneath it. */
  function mergeDuplicates(devices, warnings) {
    var byUid = Object.create(null);
    var order = [];

    devices.forEach(function (d) {
      var seen = byUid[d.uid];
      if (!seen) { byUid[d.uid] = d; order.push(d.uid); return; }

      seen.merged = true;
      var sigs = {};
      seen.useCases.forEach(function (u) { sigs[ucSignature(u)] = true; });

      var added = 0, dropped = 0;
      d.useCases.forEach(function (u) {
        var s = ucSignature(u);
        if (sigs[s]) { dropped++; return; }
        sigs[s] = true;
        seen.useCases.push(u);
        added++;
      });

      // Fill gaps the first entry left blank.
      if (!seen.group && d.group) seen.group = d.group;
      if (!seen.description && d.description) seen.description = d.description;
      if (!seen.icon && d.icon) seen.icon = d.icon;
      if (!seen.doc && d.doc) seen.doc = d.doc;

      warnings.push('Device "' + d.uid + '" appears more than once — merged ' +
        added + ' extra use case' + (added === 1 ? '' : 's') +
        (dropped ? ', dropped ' + dropped + ' identical' : '') + '.');
    });

    var out = order.map(function (uid) { return byUid[uid]; });
    out.forEach(function (d) {
      d.useCases.forEach(function (u, i) { u.index = i; });
    });
    return out;
  }

  function parse(xmlText, opts) {
    opts = opts || {};
    var prefs = (opts.languages || LANG_FALLBACK).slice();
    if (prefs.indexOf('en') < 0) prefs.push('en');

    var doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Not valid XML.');

    var root = doc.documentElement;
    if (!root || root.nodeName !== 'VDMA66413') {
      throw new Error('Not a VDMA 66413 library (root element is <' +
        (root ? root.nodeName : '?') + '>).');
    }
    var mfr = kid(root, 'Manufacturer');
    if (!mfr) throw new Error('Library has no <Manufacturer> element.');

    var warnings = [];
    var langEl = kid(mfr, 'Language');
    if (!langEl) warnings.push('Library has no <Language> block — keys shown raw.');

    var tbls = {
      names:        table(langEl, 'Names', 'Name', prefs),
      groups:       table(langEl, 'Groups', 'Group', prefs),
      descriptions: table(langEl, 'Descriptions', 'Description', prefs),
      constraints:  table(langEl, 'Constraints', 'Constraint', prefs),
      docs:         table(langEl, 'DocFiles', 'DocFile', prefs),
      infos:        table(langEl, 'Infos', 'Info', prefs),
      informations: table(langEl, 'Informations', 'Information', prefs)
    };

    var lib = {
      crc32: attr(root, 'Crc32') || null,
      schemaVersion: attr(root, 'Version') || null,
      manufacturer: {
        name: txt(kid(mfr, 'Name')),
        version: attr(mfr, 'Version') || null,
        dbFileName: txt(kid(mfr, 'DBFileName')) || null,
        url: txt(kid(mfr, 'URL')) || null,
        info: resolveKey(kid(mfr, 'Information'), tbls.informations, null, 'Manufacturer') || null,
        icon: path(txt(kid(mfr, 'IconFileName')))
      },
      languages: kids(kid(langEl, 'LanguageKeys'), 'LanguageDef').map(function (d) {
        return attr(d, 'LanguageKey');
      }),
      language: prefs[0],
      slug: null,      // set by the I/O layer
      file: null,      // set by the I/O layer
      devices: [],
      warnings: warnings
    };

    var raw = kids(kid(mfr, 'Devices'), 'Device').map(function (d) {
      return readDevice(d, tbls, warnings);
    });
    lib.devices = mergeDuplicates(raw, warnings);
    lib.counts = summarise(lib);
    return lib;
  }

  function summarise(lib) {
    var c = {
      devices: lib.devices.length, archived: 0, merged: 0, useCases: 0,
      byDeviceType: { 1: 0, 2: 0, 3: 0, 4: 0 },
      byBasis: { pfhd: 0, mttfd: 0, b10d: 0, none: 0 },
      derivedB10d: 0, withIcon: 0, withDoc: 0
    };
    lib.devices.forEach(function (d) {
      if (d.archived) c.archived++;
      if (d.merged) c.merged++;
      if (d.icon) c.withIcon++;
      if (d.doc) c.withDoc++;
      d.useCases.forEach(function (u) {
        c.useCases++;
        if (u.deviceType) c.byDeviceType[u.deviceType]++;
        c.byBasis[u.basis]++;
        if (u.b10dDerived) c.derivedB10d++;
      });
    });
    return c;
  }

  /* Search never filters on hierarchy: Rockwell supplies only Hierarchy1 on
     90% of its use cases, so a hierarchy filter would hide a whole vendor.
     Function and category are populated by every vendor. */
  function search(lib, q) {
    q = q || {};
    var term = (q.text || '').trim().toLowerCase();
    var out = [];
    lib.devices.forEach(function (d) {
      if (d.archived && !q.includeArchived) return;
      if (term) {
        var hay = (d.partNumber + ' ' + d.name + ' ' + (d.group || '') + ' ' +
                   (d.description || '')).toLowerCase();
        if (hay.indexOf(term) < 0) return;
      }
      d.useCases.forEach(function (u) {
        if (q.fn && u.functions.indexOf(q.fn) < 0) return;
        if (q.category && u.category !== q.category) return;
        if (q.pl && u.pl !== q.pl) return;
        if (q.basis && u.basis !== q.basis) return;
        out.push({ device: d, useCase: u });
      });
    });
    return out;
  }

  function device(lib, uid) {
    for (var i = 0; i < lib.devices.length; i++) {
      if (lib.devices[i].uid === uid) return lib.devices[i];
    }
    return null;
  }

  function useCase(lib, uid, index) {
    var d = device(lib, uid);
    return d && d.useCases[index] ? d.useCases[index] : null;
  }

  /* Provenance stamp for sf_<id>.json. The component's VALUES are snapshotted
     by the caller; this records only where they came from. */
  function ref(lib, uid, index) {
    return {
      slug: lib.slug, file: lib.file, crc32: lib.crc32,
      uid: uid, useCaseIndex: index
    };
  }

  /* ==============================================================
     PART 2 — I/O.  All paths relative to the BroSafe data folder.
     ============================================================== */

  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'library';
  }

  function rel() {
    return [ROOT].concat([].slice.call(arguments)).join('/');
  }

  // Installed slugs. Cheap: no XML is read.
  async function slugs() {
    if (!(await SH.settings.exists(ROOT))) return [];
    var entries = await SH.settings.listDir(ROOT);
    return entries.filter(function (e) { return e.kind === 'directory'; })
      .map(function (e) { return e.name; })
      .sort();
  }

  async function xmlFilesIn(slug) {
    return (await SH.settings.listDir(rel(slug)))
      .filter(function (e) { return e.kind === 'file' && /\.xml$/i.test(e.name); });
  }

  // Parse and cache. Reparsing Pilz costs ~300ms, so hold it for the session.
  async function load(slug, opts) {
    if (cache[slug] && !(opts && opts.force)) return cache[slug];

    var files = await xmlFilesIn(slug);
    if (!files.length) throw new Error('No .xml file in ' + rel(slug) + '.');
    var name = files[0].name;   // DATA_MODEL: exactly one XML per slug

    var lib = parse(await SH.settings.readText(rel(slug, name)), { languages: ['en'] });
    lib.slug = slug;
    lib.file = name;
    if (files.length > 1) {
      lib.warnings.push('Folder contains ' + files.length + ' XML files — using ' + name + '.');
    }
    cache[slug] = lib;
    return lib;
  }

  // [{slug, lib, error}] — one entry per installed folder. Never throws.
  async function list() {
    var out = [];
    var names = await slugs();
    for (var i = 0; i < names.length; i++) {
      try {
        out.push({ slug: names[i], lib: await load(names[i]), error: null });
      } catch (e) {
        out.push({ slug: names[i], lib: null, error: e.message || String(e) });
      }
    }
    return out;
  }

  async function remove(slug) {
    await SH.settings.deleteEntry(rel(slug), { recursive: true });
    delete cache[slug];
  }

  function clearCache(slug) {
    if (slug) delete cache[slug]; else cache = Object.create(null);
  }

  /* Icons and datasheets live under the data folder, which is not beneath
     index.html — a relative <img src> cannot reach it. fileUrl() folds case,
     which matters: vendors ship PNG/ and png/, .png and .PNG.
     Caller must URL.revokeObjectURL() the result. Rockwell ships no device
     icons at all (0 of 301), so null is a normal answer, not an error. */
  async function assetUrl(lib, p) {
    if (!p) return null;
    if (p.isUrl) return p.url;
    var target = rel(lib.slug, p.segments.join('/'));
    if (!(await SH.settings.exists(target))) return null;
    return await SH.settings.fileUrl(target);
  }

  function iconUrl(lib, dev) { return assetUrl(lib, dev.icon); }
  function docUrl(lib, dev) { return assetUrl(lib, dev.doc); }

  /* ---------- install ------------------------------------------------------
     srcDir is a FileSystemDirectoryHandle from showDirectoryPicker(), which
     the CALLER must obtain as the first statement of a click handler.

     Parse before writing: a wrong folder fails clean, and the manufacturer
     name inside the XML — not whatever the vendor called their zip — decides
     the slug.

     Throws an Error with .code === 'EXISTS' when the manufacturer is already
     installed and opts.replace is not set. Catch it, confirm, call again.
  ------------------------------------------------------------------------ */
  async function findXml(dir) {
    for await (var e of dir.values()) {
      if (e.kind === 'file' && /\.xml$/i.test(e.name)) return e;
    }
    return null;
  }

  async function countFiles(dir, wantPdf) {
    var n = 0;
    for await (var e of dir.values()) {
      if (e.kind === 'file') { if (/\.xml$/i.test(e.name)) n++; continue; }
      var ln = e.name.toLowerCase();
      if (ln === 'png' || (ln === 'pdf' && wantPdf)) {
        for await (var f of e.values()) if (f.kind === 'file') n++;
      }
    }
    return n;
  }

  async function install(srcDir, opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    var token = opts.token || {};

    var xmlEntry = await findXml(srcDir);
    if (!xmlEntry) throw new Error('No .xml file found in that folder.');

    var xmlFile = await xmlEntry.getFile();
    var parsed = parse(await xmlFile.text(), { languages: ['en'] });   // throws if not VDMA
    var slug = slugify(parsed.manufacturer.name);

    if (await SH.settings.exists(rel(slug))) {
      if (!opts.replace) {
        var err = new Error(parsed.manufacturer.name + ' is already installed.');
        err.code = 'EXISTS';
        err.library = parsed;
        throw err;
      }
      await SH.settings.deleteEntry(rel(slug), { recursive: true });
    }

    var total = (await countFiles(srcDir, opts.pdf)) || 1;
    var done = 0;
    function tick() { onProgress(++done, total); }

    try {
      await SH.settings.ensureDir(rel(slug));
      await SH.settings.writeBlob(rel(slug, xmlEntry.name), xmlFile);
      tick();

      for await (var d of srcDir.values()) {
        if (token.cancelled) throw new Error('Cancelled.');
        if (d.kind !== 'directory') continue;
        var ln = d.name.toLowerCase();
        if (ln !== 'png' && !(ln === 'pdf' && opts.pdf)) continue;

        await SH.settings.ensureDir(rel(slug, d.name));
        for await (var f of d.values()) {
          if (token.cancelled) throw new Error('Cancelled.');
          if (f.kind !== 'file') continue;
          await SH.settings.writeBlob(rel(slug, d.name, f.name), await f.getFile());
          tick();
        }
      }
    } catch (e) {
      // Never leave half a library on disk.
      try { await SH.settings.deleteEntry(rel(slug), { recursive: true }); } catch (e2) {}
      throw e;
    }

    parsed.slug = slug;
    parsed.file = xmlEntry.name;
    cache[slug] = parsed;
    return parsed;
  }

  SH.lib = {
    // parser
    parse: parse, summarise: summarise, search: search,
    device: device, useCase: useCase, ref: ref,
    parseNumber: function (s) { return num(s, null, ''); },
    parsePath: path, slugify: slugify,
    // i/o
    slugs: slugs, list: list, load: load, install: install, remove: remove,
    iconUrl: iconUrl, docUrl: docUrl, clearCache: clearCache
  };
})();
