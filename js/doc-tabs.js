/* ==============================================================
   BroSafe — shared document tabs
   File:     js/doc-tabs.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js, settings.js, content.js
   --------------------------------------------------------------
   Several pages (Risk Assessment, SRS, Verification, Validation,
   LOTO) each need the SAME two tabs: "Version Control" and "Report".
   Rather than five near-identical copies that drift apart, those tab
   files are three-liners that call these factories:

       SH.registerTab('srs', 'version-control',
         SH.docTabs.versionControl('srs', { title:'Safety Requirement Specification' }));

   Each document keeps its own revision history and report settings,
   keyed by docId.

     project.json  -> documents[docId].revisions[]
     settings.json -> reports[docId].sections{}   (report inclusions)
   ============================================================== */
(function (SH) {

  function docTitle(docId, opts) {
    return (opts && opts.title) || docId;
  }

  SH.docTabs = {

    /* ---------- Version Control ---------- */
    versionControl: function (docId, opts) {
      return {
        mount: function (host) {
          var title = docTitle(docId, opts);
          var doc = SH.store.project && SH.store.project.documents && SH.store.project.documents[docId];
          var revs = (doc && doc.revisions) || [];

          var rows = revs.length
            ? revs.map(function (r) {
                return '<tr><td>' + SH.esc(r.rev) + '</td><td>' + SH.esc(r.description) +
                       '</td><td>' + SH.esc(r.by || '') + '</td><td>' + SH.esc(r.date || '') + '</td></tr>';
              }).join('')
            : '<tr><td colspan="4" class="hint" style="padding:14px">No revisions recorded yet.</td></tr>';

          host.innerHTML =
            '<div class="card">' +
              '<h2 class="section">Revision history — ' + SH.esc(title) + '</h2>' +
              '<p class="hint">Each document carries its own revision history. It is written to ' +
              '<code>project.json</code> under <code>documents.' + SH.esc(docId) + '.revisions</code> ' +
              'and printed in the report front matter.</p>' +
              '<table class="tbl"><thead><tr><th>Rev</th><th>Description</th><th>By</th><th>Date</th></tr></thead>' +
              '<tbody>' + rows + '</tbody></table>' +
              '<div style="margin-top:14px"><button class="btn" disabled>Add revision</button></div>' +
              '<p class="hint" style="margin-top:10px">Wiring pending: needs <code>SH.store</code> persistence.</p>' +
            '</div>';
        }
      };
    },

    /* ---------- Report settings (what to include) ---------- */
    report: function (docId, opts) {
      return {
        mount: function (host) {
          var title = docTitle(docId, opts);
          var wrap = SH.el('div', { class: 'card' });
          wrap.appendChild(SH.el('h2', { class: 'section' }, 'Report — ' + title));
          wrap.appendChild(SH.el('p', { class: 'hint', html:
            'Choose what this report includes. Styling (colours, fonts, title page, header and ' +
            'footer) is set once in <b>Settings → Report Theme / Report Layout</b> and applies to ' +
            'every report.' }));

          /* --- standard front/back matter --- */
          var STD = [
            ['titlePage',    'Title page'],
            ['revisionTable','Revision history table'],
            ['references',   'Document references'],
            ['execSummary',  'Executive summary'],
            ['appendices',   'Appendices']
          ];
          var stdBox = SH.el('div');
          stdBox.appendChild(SH.el('h2', { class: 'section', style: 'margin-top:6px' }, 'Sections'));
          STD.forEach(function (s) {
            var path = 'reports.' + docId + '.include.' + s[0];
            var cb = SH.el('input', { type: 'checkbox' });
            cb.checked = SH.settings.get(path, true);
            cb.addEventListener('change', function () { SH.settings.set(path, cb.checked); });
            stdBox.appendChild(SH.el('label', { class: 'chk' }, cb, SH.el('span', null, s[1])));
          });
          wrap.appendChild(stdBox);

          /* --- reusable information sections --- */
          var infoBox = SH.el('div');
          infoBox.appendChild(SH.el('h2', { class: 'section', style: 'margin-top:16px' }, 'Information sections'));
          infoBox.appendChild(SH.el('p', { class: 'hint', html:
            'Reusable boilerplate. Edit the text and keep variants in ' +
            '<b>Settings → Information Sections</b>.' }));

          SH.content.all().forEach(function (sec) {
            var base = 'reports.' + docId + '.sections.' + sec.id;
            var cb = SH.el('input', { type: 'checkbox' });
            cb.checked = SH.settings.get(base + '.include', false);
            cb.addEventListener('change', function () { SH.settings.set(base + '.include', cb.checked); });
            infoBox.appendChild(SH.el('label', { class: 'chk' },
              cb,
              SH.el('span', null, sec.title),
              SH.el('span', { class: 'pill', style: 'margin-left:8px' }, sec.category)
            ));
          });
          wrap.appendChild(infoBox);

          wrap.appendChild(SH.el('div', { style: 'margin-top:16px' },
            SH.el('button', { class: 'btn', disabled: 'disabled' }, 'Generate report')));
          wrap.appendChild(SH.el('p', { class: 'hint', style: 'margin-top:10px', html:
            'Wiring pending: needs <code>js/report.js</code>.' }));

          host.appendChild(wrap);
        }
      };
    }
  };

})(window.SH);
