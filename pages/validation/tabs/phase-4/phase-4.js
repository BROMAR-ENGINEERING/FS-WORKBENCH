/* File:     pages/validation/tabs/phase-4/phase-4.js
   Rev:      0.1.0
   Updated:  2026-07-21
   Requires: SH.store, SH.el, SH.bus, SH.modal
   Purpose:  Validation Phase 4 — Category Verification.
             Section 1: per-SF category confirmation checklists.
             Section 2: per-device-type component installation checklists.
*/
(function () {
  'use strict';

  /* ---- category confirmation items (ISO 13849-1) --------------------- */

  var CAT_ITEMS = {
    '1': [
      { key: 'wellTried',     text: 'Well-tried components used (confirmed)' },
      { key: 'singleChannel', text: 'Single channel architecture verified' },
      { key: 'safeState',     text: 'Safe state on de-energisation confirmed' }
    ],
    '2': [
      { key: 'singleChanMon',    text: 'Single channel with monitoring verified' },
      { key: 'testBeforeDemand', text: 'Test function operates correctly before each demand' },
      { key: 'safeState',        text: 'Safe state on de-energisation confirmed' }
    ],
    '3': [
      { key: 'dualChannel',    text: 'Dual channel architecture verified — two independent signal paths confirmed' },
      { key: 'singleFault',    text: 'Single fault does not cause loss of safety function — verified' },
      { key: 'faultDetection', text: 'Fault detection within the discrepancy time — verified' },
      { key: 'safeState',      text: 'Safe state on de-energisation confirmed' },
      { key: 'forcedGuided',   text: 'Forced guided / mechanically linked contacts used where applicable' }
    ]
  };
  CAT_ITEMS['4'] = CAT_ITEMS['3'].concat([
    { key: 'shortCircuit', text: 'Short circuit detection verified (channel to channel)' },
    { key: 'highDC',       text: 'High diagnostic coverage confirmed' },
    { key: 'faultAccum',   text: 'Accumulation of faults does not compromise safety — verified' }
  ]);

  /* ---- built-in component checklist templates ------------------------ */

  var COMP_TEMPLATES = {
    estop: { label: 'E-Stop', items: [
      'Actuator colour is red on yellow background',
      'Direct opening action confirmed (not reliant on spring)',
      'Latching mechanism — cannot reset without deliberate action',
      'Located within reach of operator at point of danger',
      'Dual channel wiring confirmed — both channels independent',
      'Cable separation between channels confirmed'
    ]},
    interlock: { label: 'Interlock / Safety Gate', items: [
      'Guard cannot be opened from inside without defeating',
      'Actuator positively operated (not reliant on spring return alone)',
      'Dual channel wiring confirmed where required by category',
      'Cable separation between channels confirmed',
      'Guard held closed during hazardous motion'
    ]},
    reset: { label: 'Reset / Enable', items: [
      'Reset requires deliberate action (falling edge detection)',
      'Reset cannot be initiated from a position where hazard is not visible',
      'Reset indicator (flashing) confirmed operational'
    ]},
    edm: { label: 'EDM', items: [
      'Feedback circuit wired in series with output device NC contacts',
      'EDM monitoring enabled in safety controller configuration',
      'System cannot reset with EDM circuit open'
    ]},
    output: { label: 'Output / Contactor', items: [
      'Mechanically linked contacts confirmed (where applicable)',
      'Feedback contacts wired correctly for EDM',
      'Dual channel output confirmed where required by category'
    ]},
    other: { label: 'Other', items: [] }
  };

  /* ---- small helpers ------------------------------------------------- */

  var SECTION = 'sfs';   // 'sfs' | 'components' — remembered while the tab lives

  function uid()  { return 'p4_' + Math.random().toString(36).slice(2, 9); }
  function slug(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
                       .replace(/^-+|-+$/g, '') || 'group'; }

  function elx(tag, attrs, kids) { return SH.el.apply(null, [tag, attrs].concat(kids || [])); }

  function getSfConf()      { return SH.store.get('validation.phase4.sfConfirmations', []); }
  function setSfConf(a)     { SH.store.set('validation.phase4.sfConfirmations', a); }
  function getCompChecks()  { return SH.store.get('validation.phase4.componentChecks', []); }
  function setCompChecks(a) { SH.store.set('validation.phase4.componentChecks', a); }

  function catItemsFor(cat) { return CAT_ITEMS[cat] || []; }
  function allChecked(entry) {
    var items = catItemsFor(entry.category);
    if (!items.length) return false;
    for (var i = 0; i < items.length; i++) { if (!entry.checks[items[i].key]) return false; }
    return true;
  }

  /* ---- generate actions --------------------------------------------- */

  function generateSfConfirmations(host) {
    var sfs  = SH.store.get('sfs', []);
    var conf = getSfConf();
    var have = {};
    conf.forEach(function (c) { have[c.sfId] = true; });

    var toAdd = sfs.filter(function (s) { return !have[s.id]; });
    if (!toAdd.length) { render(host); return; }

    var loads = toAdd.map(function (s) {
      return SH.store.loadSF(s.id).then(function (full) {
        var cat = (full && full.plr && full.plr.category) || (full && full.selectedCategory) || '';
        var pl  = s.pl || (full && full.result && full.result.pl) || (full && full.plr && full.plr.value) || '';
        conf.push(mkSfEntry(s.id, s.name || (full && full.name) || s.id, String(cat || ''), String(pl || '')));
      }, function () {
        conf.push(mkSfEntry(s.id, s.name || s.id, '', s.pl || ''));
      });
    });
    Promise.all(loads).then(function () { setSfConf(conf); render(host); });
  }

  function mkSfEntry(id, name, cat, pl) {
    return { sfId: id, name: name, category: cat, pl: pl,
             checks: {}, result: null, comment: '', initial: '', date: '' };
  }

  function generateCompChecks(host) {
    var devices = SH.store.get('devices', []);
    var groups  = getCompChecks();
    var have = {};
    groups.forEach(function (g) { have[g.deviceType] = true; });

    var seen = {};
    devices.forEach(function (d) { if (d.type) seen[d.type] = true; });

    Object.keys(seen).forEach(function (t) {
      if (have[t]) return;
      var tpl = COMP_TEMPLATES[t] || { label: t, items: [] };
      groups.push({
        deviceType: t,
        label: tpl.label,
        items: tpl.items.map(function (txt) {
          return { id: uid(), text: txt, builtin: true, checked: false, comment: '' };
        })
      });
    });
    setCompChecks(groups);
    render(host);
  }

  /* ---- render root --------------------------------------------------- */

  function render(host) {
    host.innerHTML = '';

    if (!SH.store.hasProject()) {
      host.appendChild(SH.el('div', { class: 'stub' },
        SH.el('p', null, 'No project open. Open or create a project to run Phase 4.')));
      return;
    }

    var wrap = SH.el('div', { class: 'p4' });

    // section toggle
    wrap.appendChild(elx('div', { class: 'p4-toggle' }, [
      toggleBtn('sfs', 'Safety Functions', host),
      toggleBtn('components', 'Components', host)
    ]));

    wrap.appendChild(SECTION === 'sfs' ? renderSfSection(host) : renderCompSection(host));
    host.appendChild(wrap);
  }

  function toggleBtn(id, label, host) {
    var b = SH.el('button', { class: 'p4-tab' + (SECTION === id ? ' active' : '') }, label);
    b.onclick = function () { SECTION = id; render(host); };
    return b;
  }

  /* ---- section 1: safety functions ---------------------------------- */

  function renderSfSection(host) {
    var box  = SH.el('div', null);
    var conf = getSfConf();

    var gen = SH.el('button', { class: 'btn' }, 'Generate from Safety Functions');
    gen.onclick = function () { generateSfConfirmations(host); };
    box.appendChild(SH.el('div', { class: 'p4-bar' }, gen));

    if (!conf.length) {
      box.appendChild(SH.el('p', { class: 'hint' },
        'No confirmations yet. Click Generate to pull in your safety functions.'));
      return box;
    }

    conf.forEach(function (entry, i) { box.appendChild(renderSfCard(host, entry, i)); });
    return box;
  }

  function renderSfCard(host, entry, i) {
    var card = SH.el('div', { class: 'card p4-card' });

    // header
    var head = SH.el('div', { class: 'p4-head' });
    head.appendChild(SH.el('div', { class: 'p4-title' },
      SH.el('strong', null, entry.sfId), SH.el('span', null, '  ' + (entry.name || ''))));

    var meta = SH.el('div', { class: 'p4-meta' });
    if (entry.category) {
      meta.appendChild(SH.el('span', { class: 'pill' }, 'Cat ' + entry.category));
    } else {
      var sel = SH.el('select', { class: 'p4-catsel' },
        SH.el('option', { value: '' }, 'Set category…'),
        SH.el('option', { value: '1' }, 'Cat 1'),
        SH.el('option', { value: '2' }, 'Cat 2'),
        SH.el('option', { value: '3' }, 'Cat 3'),
        SH.el('option', { value: '4' }, 'Cat 4'));
      sel.onchange = function () {
        var c = getSfConf(); c[i].category = sel.value; c[i].result = null; setSfConf(c); render(host);
      };
      meta.appendChild(sel);
    }
    if (entry.pl) meta.appendChild(SH.el('span', { class: 'pill' }, 'PL ' + entry.pl));

    var rm = SH.el('button', { class: 'btn ghost sm p4-x' }, '×');
    rm.title = 'Remove';
    rm.onclick = function () {
      SH.modal('Remove confirmation', SH.el('p', null, 'Remove the Phase 4 confirmation for ' + entry.sfId + '?'), [
        { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
        { label: 'Remove', onClick: function (close) {
            var c = getSfConf(); c.splice(i, 1); setSfConf(c); close(); render(host);
          } }
      ]);
    };
    meta.appendChild(rm);
    head.appendChild(meta);
    card.appendChild(head);

    // checklist
    var items = catItemsFor(entry.category);
    if (!items.length && !entry.category) {
      card.appendChild(SH.el('p', { class: 'hint' }, 'Set the designed category to show the confirmation checklist.'));
    } else {
      var list = SH.el('div', { class: 'p4-checks' });
      items.forEach(function (it) {
        var row  = SH.el('label', { class: 'p4-chk' });
        var cb   = SH.el('input', { type: 'checkbox' });
        cb.checked = !!entry.checks[it.key];
        cb.onchange = function () {
          var c = getSfConf(); c[i].checks[it.key] = cb.checked;
          if (!cb.checked && c[i].result === 'pass') c[i].result = null;  // pass no longer valid
          setSfConf(c); render(host);
        };
        row.appendChild(cb);
        row.appendChild(SH.el('span', null, it.text));
        list.appendChild(row);
      });
      card.appendChild(list);
    }

    // result PASS / FAIL
    var passOk = allChecked(entry);
    var res = SH.el('div', { class: 'p4-result' });
    res.appendChild(SH.el('span', { class: 'p4-rlabel' }, 'Overall result'));

    var pass = SH.el('button', { class: 'p4-res-btn pass' + (entry.result === 'pass' ? ' active' : '') }, 'PASS');
    if (!passOk) { pass.disabled = true; pass.title = 'All items must be checked first'; }
    pass.onclick = function () { var c = getSfConf(); c[i].result = 'pass'; setSfConf(c); render(host); };

    var fail = SH.el('button', { class: 'p4-res-btn fail' + (entry.result === 'fail' ? ' active' : '') }, 'FAIL');
    fail.onclick = function () { var c = getSfConf(); c[i].result = 'fail'; setSfConf(c); render(host); };

    res.appendChild(pass);
    res.appendChild(fail);
    card.appendChild(res);

    // comment / initial / date
    card.appendChild(metaFields(getSfConf, setSfConf, i));
    return card;
  }

  /* ---- section 2: components ---------------------------------------- */

  function renderCompSection(host) {
    var box    = SH.el('div', null);
    var groups = getCompChecks();

    var gen = SH.el('button', { class: 'btn' }, 'Generate from Device Register');
    gen.onclick = function () { generateCompChecks(host); };
    var add = SH.el('button', { class: 'btn ghost' }, 'Add device type group');
    add.onclick = function () { addGroup(host); };
    box.appendChild(SH.el('div', { class: 'p4-bar' }, gen, add));

    if (!groups.length) {
      box.appendChild(SH.el('p', { class: 'hint' },
        'No component checks yet. Generate from your Device Register, or add a group manually.'));
      return box;
    }

    groups.forEach(function (g, gi) { box.appendChild(renderCompGroup(host, g, gi)); });
    return box;
  }

  function renderCompGroup(host, group, gi) {
    var card = SH.el('div', { class: 'card p4-card' });
    card.appendChild(SH.el('div', { class: 'p4-head' },
      SH.el('div', { class: 'p4-title' }, SH.el('strong', null, group.label))));

    var list = SH.el('div', { class: 'p4-checks' });
    (group.items || []).forEach(function (it, ii) { list.appendChild(renderCompItem(host, gi, ii)); });
    card.appendChild(list);

    var add = SH.el('button', { class: 'btn ghost sm' }, '+ Add item');
    add.onclick = function () { addItem(host, gi); };
    card.appendChild(add);
    return card;
  }

  function renderCompItem(host, gi, ii) {
    var groups = getCompChecks();
    var it = groups[gi].items[ii];

    var row = SH.el('div', { class: 'p4-item' });
    var top = SH.el('label', { class: 'p4-chk' });
    var cb  = SH.el('input', { type: 'checkbox' });
    cb.checked = !!it.checked;
    cb.onchange = function () { var g = getCompChecks(); g[gi].items[ii].checked = cb.checked; setCompChecks(g); };
    top.appendChild(cb);
    top.appendChild(SH.el('span', null, it.text));
    row.appendChild(top);

    var tools = SH.el('div', { class: 'p4-itools' });
    var note = SH.el('button', { class: 'p4-note' }, it.comment ? '✎ note' : '+ note');
    var open = !!it.comment;
    var ta = SH.el('textarea', { class: 'p4-comment', placeholder: 'Comment (optional)' });
    ta.value = it.comment || '';
    ta.style.display = open ? 'block' : 'none';
    ta.oninput = function () { var g = getCompChecks(); g[gi].items[ii].comment = ta.value; setCompChecks(g); };
    note.onclick = function () { open = !open; ta.style.display = open ? 'block' : 'none'; if (open) ta.focus(); };
    tools.appendChild(note);

    if (!it.builtin) {
      var rm = SH.el('button', { class: 'p4-note danger' }, '× remove');
      rm.onclick = function () { var g = getCompChecks(); g[gi].items.splice(ii, 1); setCompChecks(g); render(host); };
      tools.appendChild(rm);
    }
    row.appendChild(tools);
    row.appendChild(ta);
    return row;
  }

  /* ---- add group / item modals -------------------------------------- */

  function addGroup(host) {
    var input = SH.el('input', { class: 'field', placeholder: 'Device type label (e.g. Light Curtain)' });
    SH.modal('Add device type group', SH.el('div', null, input), [
      { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
      { label: 'Add', onClick: function (close) {
          var label = (input.value || '').trim();
          if (!label) { close(); return; }
          var g = getCompChecks();
          var dt = slug(label), n = dt, k = 2;
          while (g.some(function (x) { return x.deviceType === n; })) { n = dt + '-' + (k++); }
          g.push({ deviceType: n, label: label, items: [] });
          setCompChecks(g); close(); render(host);
        } }
    ]);
  }

  function addItem(host, gi) {
    var input = SH.el('input', { class: 'field', placeholder: 'Checklist item text' });
    SH.modal('Add checklist item', SH.el('div', null, input), [
      { label: 'Cancel', ghost: true, onClick: function (close) { close(); } },
      { label: 'Add', onClick: function (close) {
          var text = (input.value || '').trim();
          if (!text) { close(); return; }
          var g = getCompChecks();
          g[gi].items.push({ id: uid(), text: text, builtin: false, checked: false, comment: '' });
          setCompChecks(g); close(); render(host);
        } }
    ]);
  }

  /* ---- shared comment / initial / date row -------------------------- */

  function metaFields(getArr, setArr, i) {
    var row = SH.el('div', { class: 'p4-fields' });
    var arr = getArr();
    var e = arr[i];

    var comment = SH.el('textarea', { class: 'p4-comment', placeholder: 'Comment' });
    comment.value = e.comment || '';
    comment.oninput = function () { var a = getArr(); a[i].comment = comment.value; setArr(a); };

    var initial = SH.el('input', { class: 'field', placeholder: 'Initial' });
    initial.value = e.initial || '';
    initial.oninput = function () { var a = getArr(); a[i].initial = initial.value; setArr(a); };

    var date = SH.el('input', { class: 'field', type: 'date' });
    date.value = e.date || '';
    date.oninput = function () { var a = getArr(); a[i].date = date.value; setArr(a); };

    row.appendChild(SH.el('div', { class: 'p4-cwrap' },
      SH.el('span', { class: 'hint' }, 'Comment'), comment));
    row.appendChild(SH.el('div', { class: 'p4-idwrap' },
      SH.el('div', null, SH.el('span', { class: 'hint' }, 'Initial'), initial),
      SH.el('div', null, SH.el('span', { class: 'hint' }, 'Date'), date)));
    return row;
  }

  /* ---- scoped styles ------------------------------------------------- */

  function injectStyle() {
    if (document.getElementById('p4-style')) return;
    var css =
      '.p4-toggle{display:flex;gap:2px;margin-bottom:16px;border-bottom:1px solid var(--line)}' +
      '.p4-tab{background:none;border:none;padding:8px 16px;cursor:pointer;color:var(--muted);' +
        'border-bottom:2px solid transparent;font:inherit}' +
      '.p4-tab.active{color:var(--ink);border-bottom-color:var(--amber)}' +
      '.p4-bar{display:flex;gap:8px;margin-bottom:16px}' +
      '.p4-card{margin-bottom:14px}' +
      '.p4-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}' +
      '.p4-title strong{font-family:var(--mono)}' +
      '.p4-meta{display:flex;gap:8px;align-items:center}' +
      '.p4-catsel{padding:4px 6px}' +
      '.p4-x{line-height:1;padding:2px 8px}' +
      '.p4-checks{margin:12px 0;display:flex;flex-direction:column;gap:8px}' +
      '.p4-chk{display:flex;gap:8px;align-items:flex-start;cursor:pointer}' +
      '.p4-chk input{margin-top:3px}' +
      '.p4-item{padding:6px 0;border-bottom:1px solid var(--line)}' +
      '.p4-itools{display:flex;gap:12px;margin:4px 0 0 24px}' +
      '.p4-note{background:none;border:none;color:var(--steel);cursor:pointer;font-size:.85em;padding:0}' +
      '.p4-note.danger{color:var(--fail)}' +
      '.p4-comment{width:100%;min-height:44px;margin-top:6px;padding:6px;font:inherit;' +
        'border:1px solid var(--line);border-radius:4px;resize:vertical}' +
      '.p4-result{display:flex;gap:8px;align-items:center;margin:12px 0}' +
      '.p4-rlabel{margin-right:8px;color:var(--muted)}' +
      '.p4-res-btn{padding:6px 18px;border:1px solid var(--line);background:var(--card);' +
        'cursor:pointer;border-radius:4px;font:inherit}' +
      '.p4-res-btn:disabled{opacity:.4;cursor:not-allowed}' +
      '.p4-res-btn.pass.active{background:var(--pass-soft);border-color:var(--pass);color:var(--pass)}' +
      '.p4-res-btn.fail.active{background:var(--fail-soft);border-color:var(--fail);color:var(--fail)}' +
      '.p4-fields{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:8px}' +
      '.p4-idwrap{display:flex;gap:8px}' +
      '.p4-idwrap>div{flex:1}' +
      '@media(max-width:640px){.p4-fields{grid-template-columns:1fr}}';
    var s = document.createElement('style');
    s.id = 'p4-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---- registration -------------------------------------------------- */

  SH.registerTab('validation', 'phase-4', {
    mount: function (host) {
      var self = this;
      this._host = host;
      injectStyle();
      this._pid = SH.store.projectId ? SH.store.projectId() : null;
      render(host);
      this._onProject = function () {
        var pid = SH.store.projectId ? SH.store.projectId() : null;
        if (pid !== self._pid) { self._pid = pid; render(host); }   // only redraw on identity change
      };
      SH.bus.on('project:changed', this._onProject);
    },
    onShow: function () { if (this._host) render(this._host); },
    unmount: function () { if (this._onProject) SH.bus.off('project:changed', this._onProject); }
  });

})();
