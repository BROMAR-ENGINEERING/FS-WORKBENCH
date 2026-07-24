/* ==============================================================
   FS Workbench — Areas (shared service)
   File:     js/areas.js
   Rev:      0.1.0
   Updated:  2026-07-09
   Requires: core.js (SH.el, SH.modal), store.js
   --------------------------------------------------------------
   Any page that needs an area picks or creates one through here,
   so id generation lives in one place. project.areas[] is the
   shared register — no schema change; it already exists.

   USAGE

     SH.areas.list();
       // -> [{ id: 'A01', name: 'Kneader Line' }, ...]

     SH.areas.create('Chiller Room');
       // -> 'A03'  (next available slot; ids never reuse deleted numbers)

     SH.areas.pick({
       initial:  'A01',                    // optional pre-selection
       onResult: function (id) { ... }     // id === null on cancel
     });
       // opens a modal with a dropdown of existing areas plus an inline
       // "+ New area" input. Cancel returns null.

   NO PARENTS, NO TYPES.
     Areas are locations ("Kneader Line", "Chiller Room"). Things
     at those locations — motors, valves, machines — belong in the
     Asset Register (project.loto.assets[]) or the SF register, not
     here. If Risk Assessment ever needs sub-areas or typed areas
     it can extend the shape; every other page just needs list,
     create, and pick.
   ============================================================== */
(function (SH) {

  /* ---- id generation --------------------------------------------
     Pattern is 'A' + 2-digit zero-padded number: A01, A02, ... A99,
     then A100+. Numbers are ALWAYS the highest existing + 1, never
     reused after delete — an old report that references A03 must
     never suddenly point at a different area created later. */
  function nextId() {
    var areas = SH.store.get('areas', []) || [];
    var max = 0;
    for (var i = 0; i < areas.length; i++) {
      var m = /^A(\d+)$/i.exec(areas[i] && areas[i].id);
      if (m) {
        var n = parseInt(m[1], 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    var next = max + 1;
    return 'A' + (next < 10 ? '0' + next : String(next));
  }

  /* ---- public API ------------------------------------------------ */

  SH.areas = {

    list: function () {
      return (SH.store.get('areas', []) || []).slice();
    },

    get: function (id) {
      var areas = SH.store.get('areas', []) || [];
      for (var i = 0; i < areas.length; i++) {
        if (areas[i] && areas[i].id === id) return areas[i];
      }
      return null;
    },

    /* Create a new area with a fresh id. Returns the new id. Trims
       the name; blank names are rejected. Throws with no project
       open — same contract as SH.store.set. */
    create: function (name) {
      if (!SH.store.hasProject()) {
        throw new Error('No project is open.');
      }
      var trimmed = String(name || '').trim();
      if (!trimmed) throw new Error('Area name is required.');

      var areas = (SH.store.get('areas', []) || []).slice();
      var id = nextId();
      areas.push({ id: id, name: trimmed });
      SH.store.set('areas', areas);
      return id;
    },

    /* Rename an area. Silent no-op if the id doesn't exist so callers
       don't have to guard. Trims; refuses empty names. */
    rename: function (id, name) {
      var trimmed = String(name || '').trim();
      if (!trimmed) throw new Error('Area name is required.');
      var areas = (SH.store.get('areas', []) || []).slice();
      var changed = false;
      for (var i = 0; i < areas.length; i++) {
        if (areas[i] && areas[i].id === id) {
          areas[i] = { id: id, name: trimmed };
          changed = true;
          break;
        }
      }
      if (changed) SH.store.set('areas', areas);
      return changed;
    },

    /* Open the picker modal. Cancel returns null via onResult. */
    pick: function (opts) {
      opts = opts || {};
      var onResult = opts.onResult || function () {};

      if (!SH.store.hasProject()) {
        SH.modal('No project open', SH.el('p', null,
          'Open or create a project before picking an area.'), [
            { label: 'OK', onClick: function (close) { close(); } }
          ]);
        return;
      }

      var areas = SH.areas.list();
      var body  = SH.el('div');

      /* --- existing-area dropdown --- */
      var selWrap = SH.el('div', { class: 'field' });
      selWrap.appendChild(SH.el('label', null, 'Existing area'));
      var sel = SH.el('select');
      sel.appendChild(SH.el('option', { value: '' }, '— Select —'));
      areas.forEach(function (a) {
        var opt = SH.el('option', { value: a.id }, a.id + ' — ' + a.name);
        if (a.id === opts.initial) opt.selected = true;
        sel.appendChild(opt);
      });
      selWrap.appendChild(sel);
      body.appendChild(selWrap);

      /* --- OR-divider + inline create --- */
      var divider = SH.el('div', { class: 'hint',
        style: 'text-align:center;margin:12px 0;font-size:12px;color:var(--muted)' },
        'or');
      body.appendChild(divider);

      var newWrap = SH.el('div', { class: 'field' });
      newWrap.appendChild(SH.el('label', null, 'New area'));
      var input = SH.el('input', { type: 'text', placeholder: 'e.g. Chiller Room' });
      newWrap.appendChild(input);
      body.appendChild(newWrap);

      var errEl = SH.el('div', { class: 'modal-err', style: 'display:none' });
      body.appendChild(errEl);

      /* Focus the input if nothing is preselected, otherwise the
         dropdown so the current selection is obvious. */
      setTimeout(function () {
        (opts.initial ? sel : input).focus();
      }, 0);

      SH.modal('Choose an area', body, [
        { label: 'Cancel', ghost: true, onClick: function (close) {
            close(); onResult(null);
          }
        },
        { label: 'Use area', onClick: function (close) {
            errEl.style.display = 'none';
            errEl.textContent = '';

            var newName = input.value.trim();
            var pickedId = sel.value;

            /* Rule: if the user typed a new name, that wins — creating a
               new area is a clearer intent than the dropdown selection
               they may have forgotten was there. */
            if (newName) {
              try {
                var id = SH.areas.create(newName);
                close();
                onResult(id);
              } catch (e) {
                errEl.textContent = e.message || 'Could not create area.';
                errEl.style.display = '';
              }
              return;
            }

            if (!pickedId) {
              errEl.textContent = 'Select an existing area or type a new one.';
              errEl.style.display = '';
              return;
            }

            close();
            onResult(pickedId);
          }
        }
      ]);
    }
  };

}(window.SH = window.SH || {}));
