# BroSafe — Data Model

**Rev 0.4.0 · 2026-07-09**

Defines what goes in the project documents. There are **three trees**, deliberately separate:

| Tree | What it holds | Written to? |
|---|---|---|
| **Install tree** | the app + shipped `libraries/` and `content/` | never |
| **BroSafe data folder** | app-level config: company, logo, themes, information sections, custom components | yes |
| **Project output tree** | one folder per job: `project.json` + per-SF JSON | yes |

Both writable trees are chosen once via the directory picker; their handles are cached in
IndexedDB. `SH.settings` owns the data folder; `SH.store` owns the project tree.

---

## BroSafe data folder

```
<BroSafe data folder>/
  settings.json          company details, theme, layout, section config
  components.json        custom (non-SISTEMA) component library
  assets/
    logo.png             company logo used on reports
    content/             images used by information sections
  content/
    <section-id>/
      <variant>.json     user-edited variants (override shipped defaults)
```

Shipped information sections live in the **install tree** (`content/sections/*.js`) and are
never modified. A user edit is saved here as an override and wins at load time.

## Output tree

```
<root chosen once>/
  <Project Name>/
    project.json              project meta, references, revision history, SF manifest
    sf/
      sf_A01-01.json          one file per safety function
      sf_A01-02.json
    risk/
      hazards.json            hazard register (Risk Assessment page)
    loto/
      isolation-points.json
    exports/                  generated PDFs
```

Rules:

- All internal paths are **relative to the project folder** — never store `Z:\...` or a
  machine-specific path, so a project written on one PC opens on another.
- Names are **sanitised into safe filenames** before use (`A01.01` → `sf_A01-01.json`).
- `project.json` is the index the app reads on open. Per-SF files are loaded on demand.

---

## `project.json`

Field groups are drawn from a real verification report's front matter (Document
Identification, Revision History, Document Reference).

```jsonc
{
  "schema": "brosafe.project/1",
  "appVersion": "0.2.0",              // BroSafe rev that last wrote this file
  "id": "TEJD-2271",
  "rev": 7,                            // increments on every save (change detection)
  "savedAt": "2026-07-09T04:12:33Z",
  "savedBy": "R. Menon",              // for the "updated by X" reload notice

  "meta": {
    "name": "Kneader line safety circuit verification",
    "documentNumber": "TEJD-2271_VER",
    "version": "2.0",                  // document version, not app version
    "date": "2026-02-19",
    "client": "The Elastomers Pty Ltd",
    "site": "",
    "machine": "Kneader line",
    "author": "",
    "reviewedBy": "",
    "status": "draft"                 // draft | issued | superseded
  },

  "revisions": [                       // Revision History table
    { "rev": "1.0", "description": "Creation of the document", "by": "", "date": "2026-02-04" },
    { "rev": "2.0", "description": "Additional mill safety function", "by": "", "date": "2026-02-19" }
  ],

  "references": [                      // Document Reference table
    { "type": "Electrical schematic",   "value": "Mill Safety Changes Pt1" },
    { "type": "Safety specification",   "value": "KNEADER_LINE_MIXER_20251118" },
    { "type": "Layout",                 "value": "Layout of YK55-02052025.dwg" },
    { "type": "Risk assessment report", "value": "Not reviewed" },
    { "type": "Hydraulic drawings",     "value": "" },
    { "type": "Pneumatic drawings",     "value": "Not reviewed" },
    { "type": "Standard",               "value": "EN 1417:2023 — two-roll mills" }
  ],

  "executiveSummary": [                // numbered recommendations / review items
    { "n": 1, "text": "Mill foot switch uses roller safety switch...", "remediation": "Discrepancy test added." }
  ],

  "areas": [                           // THE SHARED REGISTER — areas / machines / sub-locations.
                                       // Referenced by hazards, safety functions, LOTO points and
                                       // photos. Defined once (Risk Assessment > Areas & Assets).
    { "id": "A01", "name": "Kneaderline — Mixer", "parent": null, "type": "machine" },
    { "id": "A01.1", "name": "Infeed conveyor", "parent": "A01", "type": "sub-location" },
    { "id": "A02", "name": "Kneaderline — Mill", "parent": null, "type": "machine" }
  ],

  "documents": {                       // per-document revision history (shared Version Control tab)
    "risk-assessment": { "revisions": [ { "rev": "1.0", "description": "Initial", "by": "", "date": "" } ] },
    "srs":             { "revisions": [] },
    "verification":    { "revisions": [] },
    "validation":      { "revisions": [] },
    "loto":            { "revisions": [] }
  },

  "involvedParties": [                 // RACI table
    { "name": "", "role": "", "organisation": "", "email": "", "raci": "R" }
  ],

  "job": { "jobNumber": "", "purchaseOrders": [], "costCode": "" },

  "sfs": [                             // MANIFEST only — full data lives in sf/*.json
    { "id": "A01.01", "name": "Mixer Infeed Conveyor inlet flap safety interlock",
      "accessPoint": "A01", "plr": "d", "pl": "e", "pfh": "8.05e-09",
      "status": "verified", "file": "sf/sf_A01-01.json" }
  ],

  "lists": {                           // accumulated dropdown values (datalist sources)
    "manufacturers": ["Pilz GmbH & Co KG", "Rockwell Automation"],
    "sfTypes": ["Safety shutdown function initiated by a safeguard"],
    "missionTimes": ["20"]
  }
}
```

`sfs[]` is deliberately a **summary manifest**: it holds exactly the columns the "PLr Summary
by Access Point" table needs, so that table renders without opening every SF file.

---

## `sf/sf_<id>.json` — one safety function

```jsonc
{
  "schema": "brosafe.sf/1",
  "id": "A01.01",
  "name": "Mixer Infeed Conveyor inlet flap safety interlock",
  "accessPoint": "A01",
  "sfType": "Safety shutdown function initiated by a safeguard",
  "triggeringEvent": "Actuation of belly bar",
  "nop": 8760,                          // operations per year

  "plr": {
    "mode": "graph",                    // "graph" | "direct"
    "s": 2, "f": 2, "p": 1,             // ISO 13849-1 risk graph inputs
    "value": "d",
    "category": "3",
    "note": "PLr was directly assigned."
  },

  "selectedCategory": "3",

  "subsystems": [
    {
      "role": "Input",                  // Input | Logic | Output
      "desc": "PSEN cs3.1n",
      "manufacturer": "Pilz GmbH & Co KG",
      "reference": "541003",
      "pl": "e",
      "category": "4",
      "pfh": "2.62e-9",
      "missionTime": "20",
      "deviceType": "DeviceType1",      // from the VDMA 66413 library
      "source": "Pilz_VDMA66413_25-03-31.xml",

      // present only for wear parts / bottom-up calc (VDMA DeviceType 2 & 3)
      "mttfd": null, "b10d": null, "dcAvg": null, "ccf": null, "t10d": null,

      "faultExclusion": false,
      "dcReasoning": ""
    }
  ],

  "result": {                           // computed, stored for the summary table
    "sumPfh": "8.05e-09",
    "pl": "e",
    "limitingSubsystemPl": "e",
    "pass": true
  },

  "diagram": {                          // captions under the INPUT/LOGIC/OUTPUT blocks
    "input":  "Dual channel with fault tolerance",
    "logic":  "Outputs enabled only after dual-channel inputs are healthy and a manual reset",
    "output": "Dual contactor arrangement with feedback loop on mechanically linked NC contacts"
  },

  "notes": ""
}
```

## Notes on the schema

- `schema` + `appVersion` on every file so a future BroSafe can migrate old projects.
- `result` is **derived** data, cached for fast summary rendering. The calc engine remains
  the source of truth; recompute on load and correct silently if it differs.
- `subsystems[].source` records which manufacturer library a part came from — useful when a
  library is updated and PFh values change.
- Fault-exclusion rows (report shows "Fault exclusion" instead of a PFh) set
  `faultExclusion: true` and leave `pfh` null.

---

## `settings.json` (BroSafe data folder)

App-level configuration. Never stored in `project.json` — it outlives any single job.

```jsonc
{
  "schema": "brosafe.settings/1",
  "appVersion": "0.3.0",

  "company": {                        // the safety professional using BroSafe, NOT the client
    "name": "", "abn": "", "address": "", "phone": "", "email": "", "website": "",
    "licence": "",
    "logo": { "file": "assets/logo.png", "width": 0, "height": 0 },
    "preparedByDefault": ""
  },

  "theme": {
    "name": "Default",
    "colors": { "accent": "#f57c00", "heading": "#14171a", "text": "#14171a",
                "rule": "#d8dcdf", "tableHead": "#f2f3f4", "pass": "#1f7a44", "fail": "#c0392b" },
    "fonts":  { "heading": "Arial, sans-serif", "body": "Calibri, sans-serif",
                "mono": "Consolas, monospace", "baseSize": 10 },
    "page":   { "size": "A4", "margin": 15 }
  },

  "layout": {
    "titlePage": { "show": true, "showLogo": true, "logoWidth": 60,
                   "title": "{{documentType}}", "subtitle": "{{project.machine}}",
                   "fields": ["client","documentNumber","version","date","author","reviewedBy"] },
    "header":    { "show": true, "left": "{{company.name}}", "center": "",
                   "right": "{{project.name}}", "showLogo": false, "rule": true },
    "footer":    { "show": true, "left": "{{document.number}} Rev {{document.version}}",
                   "center": "", "right": "Page {{page}} of {{pages}}" }
  },

  "informationSections": {
    "common-cause-failure":  { "include": true,  "variant": "default" },
    "category-architectures":{ "include": true,  "variant": "default",
                               "overrides": { "default": { "label": "Standard", "html": "<h2>…edited…</h2>" } } }
  },

  "prefs": { "lastRootPath": "", "confirmBeforeDelete": true }
}
```

**Tokens** available to `layout` strings: `{{company.*}}`, `{{project.*}}`, `{{document.number}}`,
`{{document.version}}`, `{{documentType}}`, `{{page}}`, `{{pages}}`, `{{date}}`.

---

## `components.json` (BroSafe data folder)

Custom, non-SISTEMA components. Reusable across every job — that is why they live here rather
than in a project.

```jsonc
{
  "schema": "brosafe.components/1",
  "components": [
    { "id": "cc_k3m1x", "source": "custom",
      "desc": "Custom contactor block", "manufacturer": "", "reference": "",
      "role": "Output", "pl": "d", "category": "3",
      "pfh": null, "b10d": "1.3e6", "mttfd": null, "dcAvg": "90", "ccf": "65",
      "missionTime": "20", "faultExclusion": false,
      "justification": "Manufacturer data sheet rev C, clause 4.2"
    }
  ]
}
```

A project references a component by `id` + `source`, and **copies** the values it used into
`sf_<id>.json` at the time of verification — so a later library update never silently changes
a signed-off report.

---

## Information sections

Shipped defaults: `content/sections/<id>.js` (install tree, read-only). Each registers a title,
category and one or more **variants**:

```js
SH.content.register('common-cause-failure', {
  title: 'Common Cause Failure (CCF)', category: 'ISO 13849-1',
  variants: { default: { label: 'Standard', html: '…' }, brief: { label: 'Brief', html: '…' } }
});
```

- Sections are lazy-loaded via `SH.content.load(id)` — they **cannot** be `fetch()`ed on `file://`.
- Images use a relative `<img src="assets/content/x.png">`. `<img src>` works from `file://`.
- A user edit is written to the data folder as an override; the shipped file is never touched.


---

## Report settings (in `settings.json`)

Each document type keeps its own report inclusions, written by the shared Report tab
(`js/doc-tabs.js`). Styling is global (`theme`, `layout`); inclusions are per document.

```jsonc
"reports": {
  "srs": {
    "include": { "titlePage": true, "revisionTable": true, "references": true,
                 "execSummary": true, "appendices": false },
    "sections": { "common-cause-failure": { "include": true, "variant": "default" } }
  },
  "verification": { "include": { ... }, "sections": { ... } }
}
```

`docId` values: `risk-assessment`, `srs`, `verification`, `validation`, `loto`.

---

## The shared Areas & Assets register

`project.areas[]` is the spine of the app. Hazards, safety functions, LOTO isolation points and
photo references all store an `areaId` rather than duplicating a location string.

- **Defined once** in Risk Assessment → Areas & Assets.
- **LOTO → Asset Register** is a *view* of the same list filtered to isolatable plant — not a
  second register.
- Deleting an area must be blocked (or cascade-warned) if anything references it.
