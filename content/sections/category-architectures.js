/* ==============================================================
   BroSafe — information section: Category Architectures
   File:     content/sections/category-architectures.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: content.js
   --------------------------------------------------------------
   Shipped default. Images use a RELATIVE <img src> path — this works
   from file://, unlike fetch(). Place figures in assets/content/.
   ============================================================== */
SH.content.register('category-architectures', {
  title: 'Category Architectures',
  category: 'ISO 13849-1',
  variants: {
    default: {
      label: 'Standard',
      html:
        '<h2>Category Architectures</h2>' +
        '<p>ISO 13849-1 defines five designated architectures (B, 1, 2, 3 and 4). The category ' +
        'describes the structure of the safety-related part of the control system and its ' +
        'behaviour under fault conditions.</p>' +
        '<ul>' +
        '<li><b>Category B / 1</b> — single channel. A single fault can lead to loss of the safety function.</li>' +
        '<li><b>Category 2</b> — single channel with periodic testing by the machine control system.</li>' +
        '<li><b>Category 3</b> — redundant channels. A single fault does not lead to loss of the safety function, ' +
        'but not all faults are detected.</li>' +
        '<li><b>Category 4</b> — redundant channels with high diagnostic coverage. Faults are detected in time ' +
        'to prevent loss of the safety function.</li>' +
        '</ul>' +
        '<figure>' +
        '  <img src="assets/content/category-3-architecture.png" alt="Category 3 designated architecture">' +
        '  <figcaption>Figure — Category 3 designated architecture.</figcaption>' +
        '</figure>'
    }
  }
});
