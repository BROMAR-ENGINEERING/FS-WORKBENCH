/* ============================================================================
 * FS Workbench — LOTO › Procedures
 * File    : pages/loto/tabs/procedures/procedures.js
 * Rev     : 0.16.3
 * Updated : 2026-07-24
 *
 * Owns the Procedure Register: a grouped list view of procedures and a
 * single-procedure editor (cover metadata, isolation-point selection, and the
 * application / verification / removal step lists).
 *
 * Reads assets and isolation points from the Asset Register by id. Never
 * duplicates that data — the energy table below is a read-only preview.
 * Areas come from the shared SH.areas service — list/get for reads, pick()
 * for assignment. No LOTO-local area store, no dependency on Risk Assessment.
 * ---------------------------------------------------------------------------
 * ASSUMPTIONS — confirm these four against the codebase, each is a one-liner:
 *   A1  Tab export shape (bottom of file). Registers via SH.tabs.register if
 *       present, otherwise attaches to SH.tabs['loto.procedures'].
 *   A2  A step record is { id, text }. If _normalize() uses a different key,
 *       change STEP_TEXT_KEY below.
 *   A3  Isolation point fields are energyType, magnitude, sourceLocation,
 *       device, method, lotoDevice, photo. Change IP_FIELDS below if not.
 *   A4  projectAssetUrl(ref) is sync and returns a URL string. Handled
 *       defensively in assetUrl().
 * ==========================================================================*/

(function () {
  'use strict';

  var STEP_TEXT_KEY = 'text';                                        // A2
  var IP_FIELDS = {                                                  // A3
    energyType: 'energyType',
    magnitude: 'magnitude',
    source: 'sourceLocation',
    device: 'device',
    method: 'method',
    lotoDevice: 'lotoDevice',
    photo: 'photo'
  };

  /* -- standard step text, taken from the reference procedure sheets ------ */
  var STANDARD = {
    application: [
      'Notify affected personnel.',
      'Properly shut down the machine using normal operating controls.',
      'Isolate all energy sources.',
      'Apply lockout devices, locks and tags.',
      'Verify total de-energisation of all sources.'
    ],
    verification: [
      'Attempt to start the machine using the normal operating controls and observe for movement. Return all controls to neutral or OFF after the test.',
      'Where exposed electrical conductors are involved, verify de-energisation with a suitably rated meter on all phases of the load side (live-dead-live).'
    ],
    removal: [
      'Ensure all tools and items have been removed.',
      'Confirm that all employees are safely located.',
      'Verify that controls are in neutral.',
      'Remove lockout devices and re-energise the machine.',
      'Notify affected employees that servicing is complete.'
    ]
  };

  var SECTIONS = [
    { key: 'application', label: 'Lockout application process' },
    { key: 'verification', label: 'Verification of energy isolation' },
    { key: 'removal', label: 'Lockout removal process' }
  ];

  /* == state ============================================================== */
  var root = null;
  var unsub = null;
  var saveTimer = null;
  var blobUrls = [];
  var state = { view: 'list', procId: null, unlocked: false, dirty: false, collapsed: {} };

  /* == tiny DOM helper ==================================================== */
  function h(tag, props, kids) {
    var node = (typeof SH !== 'undefined' && typeof SH.el === 'function')
      ? SH.el(tag) : document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') node[k] = v;
      else node.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function askConfirm(title, message, onYes) {
    if (typeof SH !== 'undefined' && SH.modal) {
      var body = h('div', {}, [h('p', { text: message })]);
      SH.modal({
        title: title,
        content: body,
        actions: [
          { label: 'Cancel' },
          { label: 'Confirm', primary: true, onClick: onYes }
        ]
      });
      return;
    }
    if (window.confirm(message)) onYes();
  }

  function askText(title, message, initial, onDone) {
    var value = window.prompt(message, initial || '');
    if (value != null) onDone(value);
  }

  function assetUrl(ref) {                                            // A4
    if (!ref) return '';
    var fn = (typeof projectAssetUrl === 'function') ? projectAssetUrl
      : (typeof SH !== 'undefined' && SH.projectAssetUrl) || null;
    if (!fn) return '';
    var url;
    try { url = fn(ref); } catch (e) { return ''; }
    if (typeof url !== 'string') return '';
    if (url.indexOf('blob:') === 0) blobUrls.push(url);
    return url;
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function uid(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  /* == data access ======================================================== */
  function procs() { return SH.store.get('loto.procedures', []) || []; }
  function assets() { return SH.store.get('loto.assets', []) || []; }
  /* Areas come from the shared SH.areas service (v0.16.2), never from a
     LOTO-local store key. Ids are generated centrally and never reused. */
  function areas() { return (SH.areas && SH.areas.list()) || []; }

  function assetById(id) {
    var found = null;
    assets().forEach(function (a) { if (a.id === id) found = a; });
    return found;
  }

  function areaName(id) {
    if (!id || !SH.areas) return 'Unassigned area';
    var a = SH.areas.get(id);
    return (a && a.name) || 'Unassigned area';
  }

  function pickArea(initial, onPicked) {
    if (!SH.areas || typeof SH.areas.pick !== 'function') return;
    SH.areas.pick({
      initial: initial || undefined,
      onResult: function (id) {
        if (id === null) return;            // cancelled
        onPicked(id);
      }
    });
  }

  function assetName(a) {
    if (!a) return 'Unknown asset';
    return a.name || a.title || a.assetNo || a.id;
  }

  function currentProc() {
    var found = null;
    procs().forEach(function (p) { if (p.id === state.procId) found = p; });
    return found;
  }

  function saveProc(proc) {
    var list = procs();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === proc.id) { SH.store.set('loto.procedures.' + i, proc); return; }
    }
    SH.store.set('loto.procedures.' + list.length, proc);
  }

  function replaceAll(list) { SH.store.set('loto.procedures', list); }

  function autosave(proc) {
    state.dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveProc(proc); }, 400);
  }

  function flush(proc) {
    clearTimeout(saveTimer);
    if (proc) saveProc(proc);
  }

  /* == isolation points ==================================================== */
  function pointsFor(proc) {
    var out = [];
    (proc.assetIds || []).forEach(function (aid) {
      var a = assetById(aid);
      if (!a) return;
      (a.isolationPoints || []).forEach(function (ip) {
        if (proc.isolationPointIds && proc.isolationPointIds.indexOf(ip.id) === -1) return;
        out.push({ point: ip, asset: a });
      });
    });
    return out;
  }

  function allPointsFor(proc) {
    var out = [];
    (proc.assetIds || []).forEach(function (aid) {
      var a = assetById(aid);
      if (!a) return;
      (a.isolationPoints || []).forEach(function (ip) { out.push({ point: ip, asset: a }); });
    });
    return out;
  }

  /* == list view =========================================================== */
  function renderList() {
    var wrap = h('div', { class: 'pr-page' });

    wrap.appendChild(h('div', { class: 'pr-head' }, [
      h('h2', { class: 'pr-h2', text: 'Procedure register' }),
      h('span', { class: 'pr-muted', text: procs().length + ' procedure' + (procs().length === 1 ? '' : 's') })
    ]));

    var inProgress = [], completed = [];
    procs().forEach(function (p) {
      (p.status === 'completed' ? completed : inProgress).push(p);
    });

    wrap.appendChild(renderSection('In progress', inProgress, 'pr-sec-wip'));
    wrap.appendChild(renderSection('Completed', completed, 'pr-sec-done'));

    /* Assets with no procedure yet — the entry point for creating one. */
    wrap.appendChild(renderNewFrom());
    return wrap;
  }

  function renderSection(label, list, cls) {
    var sec = h('section', { class: 'pr-sec ' + cls });
    sec.appendChild(h('h3', { class: 'pr-h3', text: label + ' (' + list.length + ')' }));

    if (!list.length) {
      sec.appendChild(h('p', { class: 'pr-empty', text: label === 'In progress'
        ? 'Nothing in progress. Start one from an asset below.'
        : 'No completed procedures yet.' }));
      return sec;
    }

    /* group by area → then by primary asset, rolling sub-assets up to parent */
    var byArea = {};
    list.forEach(function (p) {
      var primary = assetById((p.assetIds || [])[0]);
      var parent = primary && primary.parentId ? assetById(primary.parentId) : null;
      var machine = parent || primary;
      var aKey = p.areaId || (primary && primary.areaId) || '_none';
      var mKey = (machine && machine.id) || '_none';
      byArea[aKey] = byArea[aKey] || {};
      byArea[aKey][mKey] = byArea[aKey][mKey] || { machine: machine, own: [], sub: {} };
      if (parent) {
        var sKey = primary.id;
        byArea[aKey][mKey].sub[sKey] = byArea[aKey][mKey].sub[sKey] || { asset: primary, items: [] };
        byArea[aKey][mKey].sub[sKey].items.push(p);
      } else {
        byArea[aKey][mKey].own.push(p);
      }
    });

    Object.keys(byArea).forEach(function (aKey) {
      sec.appendChild(h('div', { class: 'pr-area', text: areaName(aKey) }));
      Object.keys(byArea[aKey]).forEach(function (mKey) {
        var grp = byArea[aKey][mKey];
        var key = aKey + '/' + mKey;
        var open = !state.collapsed[key];

        sec.appendChild(h('button', {
          class: 'pr-machine', type: 'button',
          onclick: function () { state.collapsed[key] = open; render(); }
        }, [
          h('span', { class: 'pr-caret', text: open ? '▾' : '▸' }),
          h('span', { text: assetName(grp.machine) }),
          h('span', { class: 'pr-count', text: String(grp.own.length + Object.keys(grp.sub).reduce(function (n, k) { return n + grp.sub[k].items.length; }, 0)) })
        ]));

        if (!open) return;
        grp.own.forEach(function (p) { sec.appendChild(procRow(p)); });
        Object.keys(grp.sub).forEach(function (sKey) {
          var sub = grp.sub[sKey];
          sec.appendChild(h('div', { class: 'pr-sub', text: assetName(sub.asset) }));
          sub.items.forEach(function (p) { sec.appendChild(procRow(p, true)); });
        });
      });
    });
    return sec;
  }

  function procRow(p, nested) {
    var pts = pointsFor(p).length;
    return h('button', {
      class: 'pr-row' + (nested ? ' pr-row-sub' : ''), type: 'button',
      onclick: function () { state.procId = p.id; state.view = 'editor'; state.unlocked = p.status !== 'completed'; render(); }
    }, [
      h('span', { class: 'pr-title', text: p.title || 'Untitled procedure' }),
      h('span', { class: 'pr-tags' }, [
        h('span', { class: 'pr-badge', text: pts + ' point' + (pts === 1 ? '' : 's') }),
        h('span', { class: 'pr-badge', text: p.status === 'completed' ? 'Rev ' + p.version : 'Draft' }),
        p.cover && p.cover.nextAudit ? h('span', { class: 'pr-badge pr-audit', text: 'Audit ' + p.cover.nextAudit }) : null
      ])
    ]);
  }

  function renderNewFrom() {
    var sec = h('section', { class: 'pr-sec' });
    sec.appendChild(h('h3', { class: 'pr-h3', text: 'Start a new procedure' }));
    var list = assets();
    if (!list.length) {
      sec.appendChild(h('p', { class: 'pr-empty', text: 'Add assets in the Asset Register first — procedures are built from their isolation points.' }));
      return sec;
    }
    var picker = h('select', { class: 'pr-input' }, [h('option', { value: '', text: 'Choose an asset…' })].concat(
      list.map(function (a) {
        return h('option', { value: a.id, text: (a.parentId ? '— ' : '') + assetName(a) });
      })
    ));
    sec.appendChild(h('div', { class: 'pr-inline' }, [
      picker,
      h('button', { class: 'pr-btn pr-primary', type: 'button', text: '+ New procedure', onclick: function () {
        if (!picker.value) return;
        createProcedure(picker.value);
      } })
    ]));
    return sec;
  }

  /* == lifecycle =========================================================== */
  function createProcedure(assetId) {
    var a = assetById(assetId);
    var rec = {
      id: 'proc_' + Date.now().toString(36),
      title: a ? assetName(a) : '',
      assetIds: [assetId],
      isolationPointIds: null,
      areaId: a ? a.areaId : null,
      status: 'in-progress',
      version: 0,
      revisions: [],
      cover: { revisedDate: today(), nextAudit: '', approvedBy: '', authorisedBy: '', specialPrecaution: '' },
      steps: {
        application: STANDARD.application.map(mkStep),
        verification: STANDARD.verification.map(mkStep),
        removal: STANDARD.removal.map(mkStep)
      }
    };
    saveProc(rec);
    state.procId = rec.id; state.view = 'editor'; state.unlocked = true;
    render();
    /* Asset carries no area (LOTO-only job, Risk Assessment never opened) —
       ask once now rather than leaving it unsorted. */
    if (!rec.areaId) {
      pickArea(null, function (id) { rec.areaId = id; flush(rec); render(); });
    }
  }

  function mkStep(text) {
    var s = { id: uid('st_') };
    s[STEP_TEXT_KEY] = text;
    return s;
  }

  function markComplete(proc) {
    askConfirm('Mark complete', 'Release this procedure as revision 1? It becomes read-only until you choose to edit it.', function () {
      flush(proc);
      proc.status = 'completed';
      proc.version = 1;
      proc.revisions = (proc.revisions || []).concat([{
        version: 1, date: today(),
        by: SH.settings.get('company.author', ''), reason: 'Initial release'
      }]);
      if (!proc.cover.revisedDate) proc.cover.revisedDate = today();
      saveProc(proc);
      state.unlocked = false; state.dirty = false;
      render();
    });
  }

  function saveEdits(proc) {
    flush(proc);
    state.dirty = false;
    askConfirm('Save changes', 'Is this a version bump? Choose Confirm for a new revision, Cancel to save without bumping.', function () {
      askText('New revision', 'Reason for this revision:', '', function (reason) {
        proc.version = (proc.version || 1) + 1;
        proc.cover.revisedDate = today();
        proc.revisions = (proc.revisions || []).concat([{
          version: proc.version, date: today(),
          by: SH.settings.get('company.author', ''), reason: reason || 'Revised'
        }]);
        saveProc(proc);
        state.unlocked = false;
        render();
      });
    });
    state.unlocked = false;
    render();
  }

  function deleteProcedure(proc) {
    askConfirm('Delete procedure', 'Delete "' + (proc.title || 'Untitled procedure') + '" permanently?', function () {
      replaceAll(procs().filter(function (p) { return p.id !== proc.id; }));
      state.view = 'list'; state.procId = null;
      render();
    });
  }

  /* == editor ============================================================== */
  function renderEditor() {
    var proc = currentProc();
    if (!proc) { state.view = 'list'; return renderList(); }
    var locked = proc.status === 'completed' && !state.unlocked;

    var wrap = h('div', { class: 'pr-page' });

    /* toolbar */
    wrap.appendChild(h('div', { class: 'pr-bar' }, [
      h('button', { class: 'pr-btn', type: 'button', text: '← Register', onclick: function () {
        flush(proc); state.view = 'list'; state.dirty = false; render();
      } }),
      h('span', { class: 'pr-badge ' + (proc.status === 'completed' ? 'pr-ok' : 'pr-wip'),
        text: proc.status === 'completed' ? 'Completed · Rev ' + proc.version : 'In progress' }),
      h('span', { class: 'pr-spacer' }),
      proc.status !== 'completed'
        ? h('button', { class: 'pr-btn pr-primary', type: 'button', text: 'Mark complete', onclick: function () { markComplete(proc); } })
        : (locked
          ? h('button', { class: 'pr-btn', type: 'button', text: 'Edit', onclick: function () { state.unlocked = true; render(); } })
          : h('button', { class: 'pr-btn pr-primary', type: 'button', text: 'Save changes', onclick: function () { saveEdits(proc); } })),
      h('button', { class: 'pr-btn pr-danger', type: 'button', text: 'Delete', onclick: function () { deleteProcedure(proc); } })
    ]));

    /* cover */
    var cover = h('section', { class: 'pr-card' });
    cover.appendChild(h('h3', { class: 'pr-h3', text: 'Cover details' }));
    cover.appendChild(field('Procedure title', textInput(proc.title, locked, function (v) { proc.title = v; autosave(proc); }), true));

    var grid = h('div', { class: 'pr-grid' });
    grid.appendChild(field('Last revised', dateInput(proc.cover.revisedDate, locked, function (v) { proc.cover.revisedDate = v; autosave(proc); })));
    grid.appendChild(field('Next audit', dateInput(proc.cover.nextAudit, locked, function (v) { proc.cover.nextAudit = v; autosave(proc); })));
    grid.appendChild(field('Approved by', textInput(proc.cover.approvedBy, locked, function (v) { proc.cover.approvedBy = v; autosave(proc); })));
    grid.appendChild(field('Authorised by', textInput(proc.cover.authorisedBy, locked, function (v) { proc.cover.authorisedBy = v; autosave(proc); })));
    cover.appendChild(grid);
    cover.appendChild(field('Special precaution', areaInput(proc.cover.specialPrecaution, locked, function (v) { proc.cover.specialPrecaution = v; autosave(proc); }), true));

    var primary = assetById((proc.assetIds || [])[0]);
    cover.appendChild(field('Area', h('div', { class: 'pr-inline' }, [
      h('span', { class: 'pr-areaval' + (proc.areaId ? '' : ' pr-muted'), text: areaName(proc.areaId) }),
      !locked ? h('button', { class: 'pr-btn', type: 'button',
        text: proc.areaId ? 'Change' : 'Set area',
        onclick: function () {
          pickArea(proc.areaId, function (id) { proc.areaId = id; flush(proc); render(); });
        } }) : null
    ]), true));
    cover.appendChild(h('p', { class: 'pr-muted', text:
      'Asset: ' + assetName(primary) + (primary && primary.assetNo ? ' · ' + primary.assetNo : '') }));
    wrap.appendChild(cover);

    /* isolation points */
    wrap.appendChild(renderPoints(proc, locked));

    /* steps */
    SECTIONS.forEach(function (s) { wrap.appendChild(renderSteps(proc, s, locked)); });

    /* revision history */
    if ((proc.revisions || []).length) {
      var rev = h('section', { class: 'pr-card' });
      rev.appendChild(h('h3', { class: 'pr-h3', text: 'Revision history' }));
      proc.revisions.forEach(function (r) {
        rev.appendChild(h('div', { class: 'pr-rev', text:
          'Rev ' + r.version + ' · ' + r.date + ' · ' + (r.by || '—') + ' · ' + (r.reason || '') }));
      });
      wrap.appendChild(rev);
    }
    return wrap;
  }

  function renderPoints(proc, locked) {
    var sec = h('section', { class: 'pr-card' });
    sec.appendChild(h('h3', { class: 'pr-h3', text: 'Isolation points' }));

    var all = allPointsFor(proc);
    var includeAll = proc.isolationPointIds == null;

    var cb = h('input', { type: 'checkbox', checked: includeAll, disabled: locked, onchange: function () {
      proc.isolationPointIds = cb.checked ? null : all.map(function (e) { return e.point.id; });
      flush(proc); render();
    } });
    sec.appendChild(h('label', { class: 'pr-check' }, [cb, h('span', { text: 'Include all isolation points from this asset' })]));

    if (!includeAll) {
      var picks = h('div', { class: 'pr-picks' });
      all.forEach(function (entry) {
        var on = proc.isolationPointIds.indexOf(entry.point.id) !== -1;
        var box = h('input', { type: 'checkbox', checked: on, disabled: locked, onchange: function () {
          var ids = proc.isolationPointIds.slice();
          if (box.checked) { if (ids.indexOf(entry.point.id) === -1) ids.push(entry.point.id); }
          else { ids = ids.filter(function (i) { return i !== entry.point.id; }); }
          proc.isolationPointIds = ids;
          autosave(proc);
        } });
        picks.appendChild(h('label', { class: 'pr-check' }, [box,
          h('span', { text: (entry.point[IP_FIELDS.energyType] || 'Energy') + ' — ' + (entry.point[IP_FIELDS.device] || entry.point.id) })]));
      });
      sec.appendChild(picks);
    }

    var rows = pointsFor(proc);
    sec.appendChild(h('p', { class: 'pr-muted', text: rows.length + ' lockout point' + (rows.length === 1 ? '' : 's') + ' · edit these in the Asset Register' }));

    if (rows.length) {
      var table = h('table', { class: 'pr-table' });
      table.appendChild(h('tr', {}, ['Energy', 'Source location', 'Device', 'Method', 'LOTO device', 'Photo'].map(function (t) {
        return h('th', { text: t });
      })));
      rows.forEach(function (entry) {
        var ip = entry.point;
        var url = assetUrl(ip[IP_FIELDS.photo]);
        table.appendChild(h('tr', {}, [
          h('td', { text: (ip[IP_FIELDS.energyType] || '') + (ip[IP_FIELDS.magnitude] ? ' ' + ip[IP_FIELDS.magnitude] : '') }),
          h('td', { text: ip[IP_FIELDS.source] || '' }),
          h('td', { text: ip[IP_FIELDS.device] || '' }),
          h('td', { text: ip[IP_FIELDS.method] || '' }),
          h('td', { text: ip[IP_FIELDS.lotoDevice] || '' }),
          h('td', {}, [url ? h('img', { class: 'pr-thumb', src: url, alt: '' }) : h('span', { class: 'pr-muted', text: '—' })])
        ]));
      });
      sec.appendChild(table);
    }
    return sec;
  }

  function renderSteps(proc, section, locked) {
    var list = (proc.steps && proc.steps[section.key]) || [];
    var sec = h('section', { class: 'pr-card' });
    sec.appendChild(h('div', { class: 'pr-head' }, [
      h('h3', { class: 'pr-h3', text: section.label }),
      !locked ? h('button', { class: 'pr-btn', type: 'button', text: 'Use standard steps', onclick: function () {
        proc.steps[section.key] = STANDARD[section.key].map(mkStep);
        flush(proc); render();
      } }) : null
    ]));

    if (!list.length) {
      sec.appendChild(h('p', { class: 'pr-empty', text: 'No steps yet. Add one, or drop in the standard set.' }));
    }

    list.forEach(function (step, i) {
      var row = h('div', { class: 'pr-step' });
      row.appendChild(h('span', { class: 'pr-num', text: String(i + 1) }));
      row.appendChild(areaInput(step[STEP_TEXT_KEY], locked, function (v) { step[STEP_TEXT_KEY] = v; autosave(proc); }));
      if (!locked) {
        row.appendChild(h('div', { class: 'pr-steptools' }, [
          h('button', { class: 'pr-icon', type: 'button', text: '↑', title: 'Move up', disabled: i === 0, onclick: function () { move(proc, section.key, i, -1); } }),
          h('button', { class: 'pr-icon', type: 'button', text: '↓', title: 'Move down', disabled: i === list.length - 1, onclick: function () { move(proc, section.key, i, 1); } }),
          h('button', { class: 'pr-icon pr-danger', type: 'button', text: '✕', title: 'Remove step', onclick: function () {
            proc.steps[section.key].splice(i, 1); flush(proc); render();
          } })
        ]));
      }
      sec.appendChild(row);
    });

    if (!locked) {
      sec.appendChild(h('button', { class: 'pr-btn', type: 'button', text: '+ Add step', onclick: function () {
        proc.steps[section.key] = list.concat([mkStep('')]);
        flush(proc); render();
      } }));
    }
    return sec;
  }

  function move(proc, key, i, delta) {
    var arr = proc.steps[key];
    var j = i + delta;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    flush(proc); render();
  }

  /* == field helpers ======================================================= */
  function field(label, control, wide) {
    return h('label', { class: 'pr-field' + (wide ? ' pr-wide' : '') }, [
      h('span', { class: 'pr-label', text: label }), control
    ]);
  }
  function textInput(value, locked, onChange) {
    var el = h('input', { class: 'pr-input', type: 'text', value: value || '', disabled: locked });
    el.addEventListener('input', function () { onChange(el.value); });
    return el;
  }
  function dateInput(value, locked, onChange) {
    var el = h('input', { class: 'pr-input', type: 'date', value: value || '', disabled: locked });
    el.addEventListener('input', function () { onChange(el.value); });
    return el;
  }
  function areaInput(value, locked, onChange) {
    var el = h('textarea', { class: 'pr-input pr-area', rows: '2', disabled: locked });
    el.value = value || '';
    el.addEventListener('input', function () { onChange(el.value); });
    return el;
  }

  /* == render ============================================================== */
  function render() {
    if (!root) return;
    releaseBlobs();
    root.textContent = '';
    root.appendChild(state.view === 'editor' ? renderEditor() : renderList());
  }

  /* caret guard — never redraw under an active cursor */
  function editorHasFocus() {
    var a = document.activeElement;
    return !!(root && a && root.contains(a) &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  function onProjectChanged() {
    if (editorHasFocus()) return;
    render();
  }

  function releaseBlobs() {
    blobUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    blobUrls = [];
  }

  /* == styles ============================================================== */
  var CSS = [
    '.pr-page{display:flex;flex-direction:column;gap:14px}',
    '.pr-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.pr-h2{margin:0;font-size:1.15rem}.pr-h3{margin:0;font-size:.95rem}',
    '.pr-muted{opacity:.65;font-size:.82rem}',
    '.pr-empty{opacity:.65;font-size:.85rem;margin:6px 0}',
    '.pr-sec{display:flex;flex-direction:column;gap:6px}',
    '.pr-card{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid rgba(128,128,128,.28);border-radius:8px}',
    '.pr-area{margin-top:8px;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;opacity:.6}',
    '.pr-machine{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:rgba(128,128,128,.10);border:0;border-radius:6px;font:inherit;font-weight:600;text-align:left;cursor:pointer}',
    '.pr-caret{width:12px}.pr-count{margin-left:auto;opacity:.6;font-weight:400}',
    '.pr-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;background:transparent;border:1px solid rgba(128,128,128,.25);border-radius:6px;font:inherit;text-align:left;cursor:pointer}',
    '.pr-row:hover{background:rgba(128,128,128,.08)}',
    '.pr-row-sub{margin-left:18px}',
    '.pr-sub{margin-left:18px;font-size:.78rem;opacity:.7}',
    '.pr-title{flex:1}',
    '.pr-tags{display:flex;gap:6px;flex-wrap:wrap}',
    '.pr-badge{padding:2px 7px;border-radius:99px;background:rgba(128,128,128,.16);font-size:.72rem;white-space:nowrap}',
    '.pr-ok{background:rgba(40,150,90,.20)}.pr-wip{background:rgba(210,150,30,.22)}.pr-audit{background:rgba(60,120,200,.18)}',
    '.pr-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pr-spacer{flex:1}',
    '.pr-btn{padding:6px 11px;border:1px solid rgba(128,128,128,.35);border-radius:6px;background:transparent;font:inherit;font-size:.85rem;cursor:pointer}',
    '.pr-btn:hover{background:rgba(128,128,128,.10)}',
    '.pr-primary{border-color:transparent;background:rgba(40,110,200,.85);color:#fff}',
    '.pr-danger{color:#c0392b}',
    '.pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}',
    '.pr-field{display:flex;flex-direction:column;gap:4px}.pr-wide{width:100%}',
    '.pr-label{font-size:.75rem;opacity:.7}',
    '.pr-input{width:100%;padding:6px 8px;border:1px solid rgba(128,128,128,.35);border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:.88rem}',
    '.pr-input:disabled{opacity:.7}',
    'textarea.pr-area{resize:vertical;min-height:44px}',
    '.pr-inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '.pr-areaval{font-size:.88rem}',
    '.pr-check{display:flex;align-items:center;gap:8px;font-size:.85rem;padding:2px 0}',
    '.pr-picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:2px}',
    '.pr-table{width:100%;border-collapse:collapse;font-size:.8rem}',
    '.pr-table th,.pr-table td{border:1px solid rgba(128,128,128,.28);padding:5px 7px;text-align:left;vertical-align:top}',
    '.pr-table th{background:rgba(128,128,128,.12)}',
    '.pr-thumb{width:74px;height:56px;object-fit:cover;border-radius:4px}',
    '.pr-step{display:flex;align-items:flex-start;gap:8px}',
    '.pr-num{min-width:20px;padding-top:7px;font-size:.8rem;opacity:.6}',
    '.pr-steptools{display:flex;gap:2px}',
    '.pr-icon{width:26px;height:26px;border:1px solid rgba(128,128,128,.3);border-radius:5px;background:transparent;color:inherit;cursor:pointer;font-size:.8rem}',
    '.pr-icon:disabled{opacity:.35;cursor:default}',
    '.pr-rev{font-size:.8rem;opacity:.8}',
    '@media (max-width:520px){.pr-row{flex-direction:column;align-items:flex-start}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('pr-styles')) return;
    var tag = document.createElement('style');
    tag.id = 'pr-styles';
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  /* == mount / unmount ===================================================== */
  function mount(container) {
    root = container;
    injectStyles();
    state.view = 'list'; state.procId = null; state.unlocked = false; state.dirty = false;
    render();
    if (SH.on) unsub = SH.on('project:changed', onProjectChanged);
    else if (SH.bus && SH.bus.on) unsub = SH.bus.on('project:changed', onProjectChanged);
  }

  function unmount() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (typeof unsub === 'function') unsub();
    else if (SH.off) SH.off('project:changed', onProjectChanged);
    unsub = null;
    releaseBlobs();
    if (root) root.textContent = '';
    root = null;
  }

  /* == export (A1) ========================================================= */
  var TAB = { id: 'loto.procedures', mount: mount, unmount: unmount };
  if (typeof SH !== 'undefined') {
    if (SH.tabs && typeof SH.tabs.register === 'function') SH.tabs.register(TAB);
    else { SH.tabs = SH.tabs || {}; SH.tabs['loto.procedures'] = TAB; }
  }
  window.LOTOProceduresTab = TAB;
})();
