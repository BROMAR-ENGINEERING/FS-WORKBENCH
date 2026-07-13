# FS Workbench — Data Model

**Rev 0.14.0 · 2026-07-09**

Defines what goes in the project documents. There are **three trees**, deliberately separate:

| Tree | What it holds | Written to? |
|---|---|---|
| **Install tree** | the app itself + read-only section seeds in `content/sections/*.js` | never |
| **data folder** | app-level config: company, logo, themes, information sections, custom components | yes |
| **Project output tree** | one folder per job: `project.json` + per-SF JSON | yes |

Both writable trees are chosen once via the directory picker; their handles are cached in
IndexedDB. `SH.settings` owns the data folder; `SH.store` owns the project tree.

---

## data folder

```
<data folder>/
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
  "schema": "fsworkbench.project/1",
  "appVersion": "0.2.0",              // FS Workbench rev that last wrote this file
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

  "devices": [                         // shared Device Register (0.14.0)
    { "id": "dev_k3m1x",                 // generated uid
      "tag": "EST-001",                  // user-entered, free format
      "description": "Front Door E-Stop",
      "type": "estop",                   // estop|interlock|reset|edm|output|other
      "manufacturer": "",
      "model": "",
      "source": "manual",                // manual|library|import
      "libraryRef": null,                // when source="library": { slug, uid, useCaseIndex }
      "wiring": [                        // dynamic — as many entries as needed
        { "label": "CH1 IN",  "wire": "ES30A" },
        { "label": "CH1 OUT", "wire": "ES30"  },
        { "label": "CH2 IN",  "wire": "ES31A" },
        { "label": "CH2 OUT", "wire": "ES31"  }
      ]
    }
  ],

  "sfs": [                             // MANIFEST only — full data lives in sf/*.json
    { "id": "A01.01", "name": "Mixer Infeed Conveyor inlet flap safety interlock",
      "accessPoint": "A01", "plr": "d", "pl": "e", "pfh": "8.05e-09",
      "status": "verified", "file": "sf/sf_A01-01.json",
      "inputs":  ["dev_k3m1x"],          // device ids from project.devices[] (0.14.0)
      "logic":   ["dev_abc123"],
      "outputs": ["dev_def456"] }
  ],

  "validation": {                      // per-project validation state (MINOR — 0.9.2)
    "method": null                       // null | 'comprehensive' | 'simplified'
  },

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
  "schema": "fsworkbench.sf/1",
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

## The shared Device Register

`project.devices[]` is the spine of everything to do with physical safety devices. It is
defined once per project and referenced by id from Safety Functions, Validation records
and LOTO. This is the same pattern as `project.areas[]` for locations — one register,
referenced everywhere, never duplicated.

A device is:

| Field | Purpose |
|---|---|
| `id` | Generated uid; stable across renames of the tag. |
| `tag` | The user's device tag. **Free-format** — varies per project and client convention. Do not validate against a pattern; whatever the drawings say, the tag says. |
| `description` | Human-readable name (e.g. "Front Door E-Stop"). |
| `type` | One of `estop` · `interlock` · `reset` · `edm` · `output` · `other`. |
| `manufacturer`, `model` | Optional identifying data. |
| `source` | `manual` (user-entered), `library` (from SISTEMA), `import` (from a JSON import). |
| `libraryRef` | When `source === "library"`, provenance for the SISTEMA use case: `{ slug, uid, useCaseIndex }`. **Values are still snapshotted at verification time** — this is provenance only. |
| `wiring[]` | Terminal labels and wire numbers. Length is not fixed — a two-channel E-stop has four entries, a single-channel reset button has two. |

Referenced from `project.sfs[]` via three arrays: `inputs[]`, `logic[]`, `outputs[]`.
Each contains device ids from `project.devices[]`. A device can appear in multiple
safety functions (e.g. one E-stop covers three zones).

Deleting a device from the register must be blocked (or cascade-warned) if any safety
function or validation record still references it. The pattern is identical to the
areas register.

---

## Notes on the schema

- `schema` + `appVersion` on every file so a future FS Workbench can migrate old projects.
- `result` is **derived** data, cached for fast summary rendering. The calc engine remains
  the source of truth; recompute on load and correct silently if it differs.
- `subsystems[].source` records which manufacturer library a part came from — useful when a
  library is updated and PFh values change.
- Fault-exclusion rows (report shows "Fault exclusion" instead of a PFh) set
  `faultExclusion: true` and leave `pfh` null.

---

## `settings.json` (data folder)

App-level configuration. Never stored in `project.json` — it outlives any single job.

```jsonc
{
  "schema": "fsworkbench.settings/1",
  "appVersion": "0.3.0",

  "company": {                        // the safety professional using FS Workbench, NOT the client
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

## `components.json` (data folder)

Custom, non-SISTEMA components. Reusable across every job — that is why they live here rather
than in a project.

```jsonc
{
  "schema": "fsworkbench.components/1",
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


---

## Component libraries (data folder)

```
<data folder>/
  libraries/
    <slug>/
      <Vendor>_VDMA66413_<date>.xml     exactly ONE .xml per slug folder
      PNG/                              optional — Rockwell ships none
      PDF/                              optional
```

**The filesystem is the registry.** Libraries are discovered by scanning `libraries/`; there is no
`"libraries": []` array in `settings.json`. Installing = create a slug folder and drop the files
in; removing = delete the folder. This is a **MINOR** change: no existing schema is altered.

Rules:

- **Exactly one `.xml` per slug folder.** More than one is ambiguous — the loader takes the first
  and records a warning.
- Asset folders must be resolved **case-insensitively** (`PNG/` vs `png/`). Use
  `SH.settings.resolve()` / `fileUrl()`, which fold case.
- `SH.lib.parse()` exposes `crc32` and `manufacturer.version`. Record them on install so a library
  update is detectable.

### Referencing a library component from a project

Values are **snapshotted** into `sf/sf_<id>.json` at the time of verification, so a later library
update can never silently change a signed-off report. The library reference is **provenance only**:

```jsonc
"subsystems": [{
  "role": "Input",
  "desc": "PSEN cs3.1n",
  "pfh": "2.62e-9", "pl": "e", "category": "4",   // snapshot — the report's source of truth
  "source": {
    "kind": "library",
    "slug": "pilz",
    "file": "Pilz_VDMA66413_25-03-31.xml",
    "crc32": "…",            // from SH.lib.parse()
    "uid": "541003",         // PartNumber@Revision
    "useCaseIndex": 0        // a device may expose several use cases
  }
}]
```

`uid` alone does not identify a *use case* — a device can expose several (input, logic, output),
each with its own PFHd. `useCaseIndex` selects one.

**A repeated `uid` is not a duplicate — it is extra use cases.** The Pilz library ships `777525` and
`8176540` as two `<Device>` elements each, and the pairs *differ*: `8176540` is Cat 3 / PL d /
PFHd 7.05e-8 in one and Cat 4 / PL e / PFHd 1.04e-9 in the other. `SH.lib.parse()` merges them into a
single device, concatenating use cases, collapsing only byte-identical ones, and reindexing.
Dropping the later entry would hide a valid 68× better option. `useCaseIndex` therefore addresses the
*merged* device, and is stable for a given file — `crc32` is what detects the file changing beneath
it.

### Optional, if you want to hide a library rather than delete it

Enable/disable state *is* app config, so it would live in `settings.json` keyed by slug — additive,
absent means enabled, still MINOR:

```jsonc
"libraries": { "pilz": { "enabled": false } }
```

Not required by the scan-based design. Add it only if the Component Libraries tab needs it.
