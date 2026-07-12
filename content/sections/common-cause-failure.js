/* ==============================================================
   BroSafe — information section: Common Cause Failure
   File:     content/sections/common-cause-failure.js
   Rev:      0.3.0
   Updated:  2026-07-09
   Requires: content.js
   --------------------------------------------------------------
   Shipped default. User edits are saved as overrides in the BroSafe
   data folder and never modify this file.
   ============================================================== */
SH.content.register('common-cause-failure', {
  title: 'Common Cause Failure (CCF)',
  category: 'ISO 13849-1',
  variants: {
    default: {
      label: 'Standard',
      html:
        '<h2>Common Cause Failure (CCF)</h2>' +
        '<p>A common cause failure is a single event that causes the failure of more than one ' +
        'channel in a redundant safety-related control system, defeating the benefit of redundancy. ' +
        'Typical causes include shared power supplies, shared cabling routes, temperature, ' +
        'vibration, contamination and systematic design faults.</p>' +
        '<p>For Categories 2, 3 and 4, ISO 13849-1 requires that measures against CCF are assessed ' +
        'using the scoring table in Annex F. A minimum score of 65 points must be achieved.</p>'
    },
    brief: {
      label: 'Brief',
      html:
        '<h2>Common Cause Failure (CCF)</h2>' +
        '<p>A single event that fails multiple channels at once, defeating redundancy. ' +
        'Categories 2, 3 and 4 require a CCF score of at least 65 points per ISO 13849-1 Annex F.</p>'
    }
  }
});
