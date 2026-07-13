/* ==============================================================
   FS Workbench — Risk Graph calculator (shared service)
   File:     js/risk-graph.js
   Rev:      0.1.0
   Updated:  2026-07-09
   Requires: core.js (SH.el, SH.modal)
   --------------------------------------------------------------
   ISO 13849-1 Annex A risk-graph PLr calculator.

     Severity S1/S2 -> Frequency F1/F2 -> Possibility P1/P2  -> PLr
       S1 F1 P1 = a     S1 F1 P2 = b     S1 F2 P1 = b     S1 F2 P2 = c
       S2 F1 P1 = c     S2 F1 P2 = d     S2 F2 P1 = d     S2 F2 P2 = e

   Opened from any tab that needs a PLr assignment. Returns
   { plr, s, f, p } via callback. Cancel returns null.

   USAGE
     SH.riskGraph.open({
       initial: { s: 'S1', f: 'F1', p: 'P1' },   // optional pre-fill
       onResult: function (r) {
         // r === null on cancel; otherwise { plr:'c', s:'S2', f:'F1', p:'P1' }
       }
     });

   The service owns the calculation, so if the ISO ever revises the
   graph, only this file changes.
   ============================================================== */
(function (SH) {

  var S_LABEL = {
    S1: 'S1 — Slight (normally reversible)',
    S2: 'S2 — Serious (normally irreversible / death)'
  };
  var F_LABEL = {
    F1: 'F1 — Seldom to less often, exposure time short',
    F2: 'F2 — Frequent to continuous, exposure time long'
  };
  var P_LABEL = {
    P1: 'P1 — Possible under specific conditions',
    P2: 'P2 — Scarcely possible'
  };

  /* PLr lookup — the ISO 13849-1 Annex A graph.
     Key: S + F + P (e.g. "S2F1P2"). Value: 'a'..'e'. */
  var PLR = {
    S1F1P1: 'a', S1F1P2: 'b',
    S1F2P1: 'b', S1F2P2: 'c',
    S2F1P1: 'c', S2F1P2: 'd',
    S2F2P1: 'd', S2F2P2: 'e'
  };

  function computePLr(s, f, p) {
    if (!s || !f || !p) return null;
    return PLR[s + f + p] || null;
  }

  /* Radio group builder. Renders a labelled pair of options and calls
     onChange with the selected value. */
  function radioGroup(name, options, initial, onChange) {
    var wrap = SH.el('div', { class: 'rg-group' });

    Object.keys(options).forEach(function (val) {
      var id = 'rg_' + name + '_' + val;
      var input = SH.el('input', {
        type: 'radio', name: name, id: id, value: val,
        onChange: function () { onChange(val); }
      });
      if (val === initial) input.checked = true;

      var label = SH.el('label', { 'for': id, class: 'rg-opt' });
      label.appendChild(input);
      label.appendChild(SH.el('span', { class: 'rg-code' }, val));
      label.appendChild(SH.el('span', { class: 'rg-desc' }, options[val].split(' — ')[1] || options[val]));

      wrap.appendChild(label);
    });

    return wrap;
  }

  /* Inject the scoped style once. Everything is scoped under .rg-body
     to keep the modal-agnostic. Uses only the CSS tokens from app.css. */
  var STYLE_ID = 'rg-style';
  var STYLE = ''
    + '.rg-body{display:flex;flex-direction:column;gap:16px;min-width:420px}'
    + '.rg-question{font-family:var(--sans);font-size:12.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}'
    + '.rg-group{display:flex;flex-direction:column;gap:6px}'
    + '.rg-opt{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;cursor:pointer;transition:all .12s ease;background:var(--paper)}'
    + '.rg-opt:hover{border-color:var(--line-dark)}'
    + '.rg-opt input[type=radio]{margin-top:2px;accent-color:var(--amber)}'
    + '.rg-opt input[type=radio]:checked ~ .rg-code,'
    + '.rg-opt input[type=radio]:checked ~ .rg-desc{color:var(--ink)}'
    + '.rg-opt:has(input:checked){background:var(--amber-soft);border-color:var(--amber-deep)}'
    + '.rg-code{flex:none;font-family:var(--mono);font-size:12px;font-weight:600;color:var(--graphite);min-width:22px}'
    + '.rg-desc{font-size:13px;color:var(--ink)}'
    + '.rg-result{padding:14px 16px;border-radius:6px;background:var(--card);border:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:12px}'
    + '.rg-result-label{font-family:var(--sans);font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}'
    + '.rg-result-value{font-family:var(--display);font-size:28px;font-weight:600;color:var(--amber-deep);line-height:1}'
    + '.rg-result-value.rg-empty{color:var(--muted);font-size:14px;font-weight:400;font-family:var(--sans)}'
  ;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = STYLE;
    document.head.appendChild(s);
  }

  /* Public API ------------------------------------------------------ */

  SH.riskGraph = {

    /* Compute PLr without opening the popup — useful for read-only display. */
    compute: computePLr,

    /* Descriptions of each level, so a tab can render "S1: Slight..."
       in a summary without duplicating strings. */
    labels: { s: S_LABEL, f: F_LABEL, p: P_LABEL },

    /* Open the calculator modal. Options:
         initial:  { s, f, p }   — pre-fill radio values (any subset)
         onResult: function(r)  — r === null on cancel */
    open: function (opts) {
      ensureStyle();
      opts = opts || {};
      var initial = opts.initial || {};
      var state = {
        s: initial.s || null,
        f: initial.f || null,
        p: initial.p || null
      };

      var body = SH.el('div', { class: 'rg-body' });

      /* Severity */
      body.appendChild(SH.el('div', null,
        SH.el('div', { class: 'rg-question' }, '1. Severity of injury'),
        radioGroup('s', S_LABEL, state.s, function (v) { state.s = v; refresh(); })
      ));
      /* Frequency */
      body.appendChild(SH.el('div', null,
        SH.el('div', { class: 'rg-question' }, '2. Frequency and duration of exposure'),
        radioGroup('f', F_LABEL, state.f, function (v) { state.f = v; refresh(); })
      ));
      /* Possibility */
      body.appendChild(SH.el('div', null,
        SH.el('div', { class: 'rg-question' }, '3. Possibility of avoiding hazard'),
        radioGroup('p', P_LABEL, state.p, function (v) { state.p = v; refresh(); })
      ));

      /* Result readout, updated live. */
      var resultBox = SH.el('div', { class: 'rg-result' });
      var resultVal = SH.el('div', { class: 'rg-result-value rg-empty' }, 'Select all three');
      resultBox.appendChild(SH.el('div', { class: 'rg-result-label' }, 'Required Performance Level'));
      resultBox.appendChild(resultVal);
      body.appendChild(resultBox);

      function refresh() {
        var plr = computePLr(state.s, state.f, state.p);
        if (plr) {
          resultVal.textContent = 'PL ' + plr;
          resultVal.classList.remove('rg-empty');
        } else {
          resultVal.textContent = 'Select all three';
          resultVal.classList.add('rg-empty');
        }
      }
      refresh();

      /* Modal wiring. Cancel returns null, Apply returns the tuple. */
      SH.modal('Risk Graph — ISO 13849-1', body, [
        { label: 'Cancel', ghost: true, onClick: function (close) {
            close();
            if (opts.onResult) opts.onResult(null);
        } },
        { label: 'Apply',                 onClick: function (close) {
            var plr = computePLr(state.s, state.f, state.p);
            if (!plr) return;   /* invalid — leave modal open */
            close();
            if (opts.onResult) opts.onResult({
              plr: plr, s: state.s, f: state.f, p: state.p
            });
        } }
      ]);
    }
  };

}(window.SH = window.SH || {}));
