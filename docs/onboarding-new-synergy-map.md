# Building a New IBM Cloud Synergy Map — Onboarding Guide

This document is written for a new chat session that needs to build a second synergy map (e.g. **IBM Cloud VPC**) using the same codebase, tooling, and visual design as the existing **IBM Power Virtual Server Synergies Map**.

Read this before writing any code or data.

---

## 1. What this project is

A **zero-dependency, zero-build, static single-page application** deployed on Vercel. There is no bundler, no framework, no npm `start` script. The entire app is:

```
index.html          ← single shell; no logic
css/app.css         ← all styles (IBM Carbon design tokens, dark/light themes)
js/app.js           ← all application logic (~1,650 lines, vanilla JS ES modules)
data/               ← all content as plain JSON
fonts/              ← self-hosted IBM Plex Sans + IBM Plex Mono woff2 files
```

The browser fetches the JSON files at runtime. The app renders everything from those files — there is no compile step.

**To run locally:**
```bash
python3 -m http.server 4173
# or: mise run dev  (also runs the data validator first)
```

Open `http://localhost:4173`. All JSON fetches go to `./data/…` relative to the server root. Opening `index.html` directly as a `file://` URL will fail (CORS on fetch).

---

## 2. Four views — what each one does

The view switcher in the header bar has four tabs. The active tab is stored in `state.viewMode` and reflected in the URL hash (e.g. `#availability`).

| Tab | Hash | What it shows |
|---|---|---|
| **Grid** | *(none / default)* | Left column of OS buttons; integration category columns to the right. Click an OS to highlight compatible cards. Click a card to open the sidebar. |
| **OS Matrix** | `#matrix` | Same data, full-width. OS selector left; all cards in columns. No sidebar. |
| **Network** | `#network` | Hardcoded topology diagram for the PowerVS network path. Not driven by `products.json` — the nodes and edges are defined inline in `js/app.js` as `NET_NODES` / `NET_EDGES`. Has a sidebar. |
| **Availability** | `#availability` | Datacenter hardware availability grid, driven by `data/powervs/available-systems.json`. Filtered by machine type. No sidebar. |

For a **VPC map**, the Network view and Availability view could both be repurposed or replaced entirely. The Grid and Matrix views are the core reusable pattern.

---

## 3. Data architecture — the three content files

Every view except Network and Availability is driven by exactly three JSON files. All three live under `data/<view-id>/`.

### 3a. `plays.json` — lane definitions

Defines the **lanes** (visual columns / colour categories) and the view metadata.

```jsonc
{
  "view": {
    "id": "powervs",          // must match the directory name and views.json entry
    "label": "IBM Power Virtual Server",
    "short": "PowerVS",
    "mode": "mapped",
    "blurb": "One-sentence description shown in loading/error state."
  },
  "plays": {
    "0": { "id": 0, "name": "Power Virtual Server", "short": "PowerVS Core", "cat": "powervs", "varName": "--play-0" },
    "1": { "id": 1, "name": "Operating Systems",    "short": "OS",           "cat": "os",      "varName": "--play-1" },
    // ... up to --play-9 (10 colour slots defined in CSS)
  },
  "playOrder": [0, 1, 2, 3, 4, 5, 6],   // controls left-to-right order
  "categories": [
    { "id": "powervs", "label": "Power Virtual Server Core", "playId": 0 },
    { "id": "os",      "label": "Operating Systems",         "playId": 1 },
    // one entry per play — id must match cat values used in products.json
  ]
}
```

**CSS colour slots** (`--play-0` through `--play-9`) are already defined in `css/app.css` for both light and dark themes. You do not need to add new CSS to change lane colours — just pick which `--play-N` variable maps to which lane.

### 3b. `products.json` — nodes

Array of product/component objects. Each one becomes a card in Grid/Matrix view and a node in the sidebar.

```jsonc
{
  "id": "vpc_vsi",                        // unique snake_case, referenced by connections
  "label": "VPC Virtual Server Instance", // displayed name
  "cat": "compute",                       // must match a category id in plays.json
  "plays": [0],                           // array of play ids (usually just one)
  "os": ["linux", "windows"],             // OS tags — drives OS filter highlight logic
                                          // omit or use [] for OS-agnostic nodes
  "hub": true,                            // true = this is a central hub node
  "status": "ga",                         // ga | partner | restricted | deprecated | coming_soon
  "docsUrl": "https://cloud.ibm.com/docs/vpc?topic=vpc-about-vsi",
  "desc": "Full paragraph description shown in sidebar.",
  "value": "Seller value proposition — one strong sentence.",
  "questions": [                          // 2–5 discovery questions for sellers
    "Are you running Linux or Windows workloads today?",
    "Do you need bare-metal performance without shared-tenancy risk?"
  ],
  "differentiators": ["...", "..."],      // bullet list shown in sidebar
  "competitors": ["AWS EC2", "Azure VMs"] // alternatives, shown in sidebar
}
```

**Special status values and their visual effects:**
- `partner` → orange "Partner" badge on the card
- `restricted` → yellow "Existing clients only" banner in sidebar

**OS tags and the filter system:**  
The OS filter chips (`AIX · IBM i · Linux · OpenShift`) are defined in the constant `OS_FILTERS` at the top of `js/app.js`. For a VPC map you would change these to whatever OS/runtime dimensions make sense (e.g. `Linux · Windows · Containers`). The four OS node IDs (`os_aix`, `os_ibmi`, etc.) in `OS_NODE_MAP` must also be updated to match your hub OS node IDs.

**Optional extended fields** (rendered as tables in the sidebar, only if present):
- `supportedVersions` — array of `{ version, tls, hardware, stockImage, notes }` rows
- `softwareTiers` — array of IBM i VST tier rows (IBM i specific, skip for VPC)

### 3c. `connections.json` — edges

Array of directed edges between product IDs.

```jsonc
{
  "from": "vpc_vsi",
  "to": "block_storage",
  "kind": "native",             // native | platform | optional
  "mechanism": "vpc_volume_attach",  // internal slug, any value, not displayed
  "lane": "storage",            // must match a category id in plays.json
  "status": "ga",               // same set as products
  "summary": "One sentence shown on the connection card in the sidebar.",
  "docsUrl": "https://cloud.ibm.com/docs/vpc?topic=vpc-creating-block-storage",
  "sellerNote": "Optional tip shown in italic below the summary."  // can omit
}
```

**Validation rules enforced by `scripts/validate-feed.mjs`:**
- `from` and `to` must be known product IDs
- No self-loops, no duplicate undirected edges
- `kind` must be `native | platform | optional`
- `status` must be a valid status value
- `lane` must match a known category ID
- `docsUrl` must be `http(s)://`

Run `node scripts/validate-feed.mjs` before every commit.

---

## 4. Registering a new view

Add an entry to `data/views.json`:

```json
{
  "default": "powervs",
  "views": [
    { "id": "powervs", "label": "Power Virtual Server", "hint": "OS · Storage · Backups · Replication · Migration", "path": "data/powervs" },
    { "id": "vpc",     "label": "VPC",                  "hint": "Compute · Networking · Storage · Security · AI",  "path": "data/vpc"     }
  ]
}
```

Then create `data/vpc/plays.json`, `data/vpc/products.json`, and `data/vpc/connections.json`.

> **Note:** The current `js/app.js` and `index.html` are hardwired to the `powervs` view — the `views.json` registry and multi-view switching logic were scaffolded but not yet activated. For a second map you have two options:
> 
> **Option A (recommended — separate repo/deployment):** Copy the whole repo, rename the `data/powervs/` directory to `data/vpc/`, update the three JSON files, and adjust the handful of hardcoded strings in `js/app.js` (the `load()` function fetch paths, the `GRID_INTEGRATION_CATS` constant, and the OS node constants). Fastest path to a working VPC map.
>
> **Option B (multi-view in one app):** Wire up the view registry properly so the same app serves multiple views via a URL param or dropdown. More work but lets you cross-link between maps.

---

## 5. Key constants to update in `js/app.js` for a new view

When forking for VPC, these are the sections to change:

| Constant / section | Location | What to change |
|---|---|---|
| `OS_FILTERS` | top of file (~line 3) | Replace AIX/IBM i/Linux/OpenShift with VPC-relevant OS or runtime dimensions |
| `OS_NODE_MAP` | ~line 107 | Map from OS hub node IDs to OS filter tag strings |
| `GRID_INTEGRATION_CATS` | ~line 442 | Array of category IDs that appear as columns in the Grid view (exclude the hub lane) |
| `MATRIX_OS` | ~line 704 | OS objects for the Matrix view left column |
| `NET_NODES` / `NET_EDGES` | ~line 880 | Replace the PowerVS network topology with your VPC topology, or remove the Network tab entirely |
| `MACHINE_META` / `CAP_META` | ~line 1316 | Replace with VPC instance profile families or remove the Availability tab |
| `load()` fetch paths | ~line 1588 | Update to `data/vpc/plays.json` etc. |
| Header product name | `index.html` line 17 | Change "Power Virtual Server Synergies Map" to "VPC Synergies Map" |
| Sidebar empty state copy | `renderSidebar()` ~line 140 | Update the description paragraph |

---

## 6. Suggested VPC lane structure

For a VPC synergies map, here is a starting lane structure that mirrors the PowerVS approach:

| Play # | Lane `cat` id | Display name | Example components |
|---|---|---|---|
| 0 | `vpc` | VPC Core | IBM Cloud VPC (hub) · Virtual Private Cloud |
| 1 | `compute` | Compute | VSI · Bare Metal · Instance Profiles · Dedicated Hosts |
| 2 | `networking` | Networking | Subnets · Security Groups · Network ACLs · Public Gateway · Floating IP · NLB · ALB |
| 3 | `storage` | Storage | Block Storage · File Storage (Shares) · Cloud Object Storage |
| 4 | `security` | Security & Compliance | Key Protect · HPCS · Security & Compliance Center · Secrets Manager · Flow Logs |
| 5 | `connectivity` | Connectivity | Transit Gateway · Direct Link 2.0 · VPN Gateway · VPC Peering |
| 6 | `platform` | IBM Cloud Platform | IAM · Activity Tracker · Cloud Monitoring · Log Analysis · Container Registry |

The hub node (`hub: true`) would be the VPC itself, connecting outward to every other lane.

---

## 7. Visual system — what you get for free

All of the following are already implemented in `css/app.css` and `js/app.js` and require zero CSS changes for a new view:

- **Dark / light theme** — IBM Carbon design tokens, toggled via `data-theme` on `<html>`
- **10 lane colour slots** — `--play-0` through `--play-9`, light and dark values both defined
- **Card highlight / dim states** — `is-highlighted`, `is-dimmed`, `is-query-hit`, `is-active` classes wired to all interaction modes
- **Sidebar panel** — slides open/closed; renders all the product fields automatically
- **Full-text search** — searches `label`, `desc`, `value`, `questions`, `competitors`, `differentiators`
- **URL hash permalinks** — `#grid`, `#matrix`, `#network`, `#availability` — active on load and synced on tab switch
- **Connection type styling** — `native` (solid), `platform` (dashed), `optional` (dotted)
- **Status badges** — `partner` (orange), `restricted` (yellow warning)
- **IBM Plex Sans + IBM Plex Mono** — self-hosted, no Google Fonts, works offline

---

## 8. Workflow for authoring content

The recommended content authoring flow for a new map:

1. **Define your lanes first** — write `plays.json`. Get the `cat` IDs right because every product and connection references them.
2. **Write hub node(s) in `products.json`** — the central hub (e.g. VPC itself) with `hub: true`.
3. **Add one lane at a time** — add all products for a lane, then add their connections to the hub and to each other.
4. **Validate frequently** — `node scripts/validate-feed.mjs` catches broken references, duplicates, and missing fields immediately.
5. **Check in the browser** — click every card, verify the sidebar populates, test OS filter and search.
6. **Commit and push** — Vercel auto-deploys on push to `main`.

---

## 9. File checklist for a new VPC map

```
data/vpc/
  plays.json          ← lanes, categories, view metadata
  products.json       ← all nodes
  connections.json    ← all edges

index.html            ← update title, product name string
js/app.js             ← update OS_FILTERS, GRID_INTEGRATION_CATS, load() paths, etc.
```

No changes needed to `css/app.css`, `fonts/`, `vercel.json`, or `mise.toml`.

---

## 10. Quick reference — product field schema

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | ✅ | string | Unique, snake_case |
| `label` | ✅ | string | Display name |
| `cat` | ✅ | string | Must match a `categories[].id` in plays.json |
| `plays` | ✅ | number[] | Usually `[N]` matching the lane's play id |
| `hub` | ✅ | boolean | `true` for central hub nodes only |
| `status` | ✅ | string | `ga \| partner \| restricted \| deprecated \| coming_soon` |
| `docsUrl` | ✅ | string | Must be `https://` |
| `desc` | ✅ | string | Paragraph shown in sidebar description section |
| `value` | ✅ | string | Seller value proposition |
| `os` | — | string[] | OS tags — omit for OS-agnostic nodes |
| `questions` | — | string[] | 2–5 discovery questions (warned if fewer than 2) |
| `differentiators` | — | string[] | Bullet list |
| `competitors` | — | string[] | Alternatives list |
| `supportedVersions` | — | object[] | Version table rows (PowerVS / OS specific) |
| `softwareTiers` | — | object[] | IBM i VST tier rows (IBM i specific) |

---

## 11. Quick reference — connection field schema

| Field | Required | Type | Notes |
|---|---|---|---|
| `from` | ✅ | string | Source product id |
| `to` | ✅ | string | Target product id |
| `kind` | ✅ | string | `native \| platform \| optional` |
| `mechanism` | ✅ | string | Internal slug (any value, not displayed) |
| `lane` | ✅ | string | Must match a category id |
| `status` | ✅ | string | Same set as product status |
| `summary` | ✅ | string | One-sentence description shown on connection card |
| `docsUrl` | ✅ | string | Must be `https://` |
| `sellerNote` | — | string | Italic tip shown below summary in sidebar |
