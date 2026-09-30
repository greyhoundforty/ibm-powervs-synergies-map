# IBM Power Virtual Server Synergies Map

An interactive synergy and architectural relationship map for IBM Power Virtual Server (PowerVS) in IBM Cloud. Visualises how PowerVS connects across hardware generations, operating systems, storage, backups, replication, migration, and IBM Cloud platform services.

**Live site:** [pvs-synergy-map.vercel.app](https://pvs-synergy-map.vercel.app)

![IBM Power Virtual Server Synergies Map — Grid view](docs/screenshot.png)

## Architecture Layers

| Lane | Components |
|---|---|
| **Power Virtual Server Core** | IBM Power Virtual Server (hub) · Power11 · Power10 · Power9 _(existing clients only)_ |
| **Operating Systems** | IBM AIX · IBM i (AS/400) · Linux on Power (RHEL / SLES) · Red Hat OpenShift on Power |
| **Storage** | Tier 0 (Ultra-High IOPS, 25 IOPS/GB) · Tier 1 (High IOPS, 10 IOPS/GB) · Tier 3 (Standard IOPS, 3 IOPS/GB) · Shared Volumes & Volume Groups · Virtual Persistent Memory (vPMEM) · Cloud Object Storage |
| **Backups** | Compass BaaS (Cobalt Iron) · FalconStor StorSafe VTL · BRMS & 5733-ICC · AIX mksysb / IBM Storage Protect · PowerVS Snapshots & Clones · Veeam Agent for AIX |
| **Replication** | Global Replication Services (GRS) · PowerHA SystemMirror for AIX · PowerHA for i & Geographic Mirroring · Db2 Q-Replication · ISV Logical Replication (MIMIX / Maxava) |
| **Migration** | FalconStor Migration · BRMS/ICC Cloud Save & Restore · AIX mksysb & NIM · PowerVC OVA Export · IBM Lab Services & Migration Factory · IBM Aspera High-Speed Transfer |
| **IBM Cloud Integrations** | Transit Gateway · IBM Cloud VPC · Direct Link 2.0 · Key Protect · IBM Cloud Logs & Monitoring · VPC VPN Gateways · IBM Cloud Security & Compliance Center |

## Features

### Views

- **Grid view** _(default)_ — OS column on the left; integration categories (Storage, Backups, Replication, Migration, IBM Cloud Integrations) span right in columns. Click an OS button to highlight all supported integration cards for that OS.
- **OS Matrix view** — Full-width grid with OS selectors on the left and all integration cards shown across columns. Click an OS to highlight supported cards and dim the rest.
- **Network view** — Layered connectivity topology showing the PowerVS network path from workspace through connection intent, entry mechanism, routing & gateway, and security controls. Click any node to trace its full path.
- **Availability view** — Hardware availability across all 26 active PowerVS datacenters, grouped by geography. Shows which machine types (e1050, e1080, e1150, e1180, s1022, s1122) are available as shared or dedicated hosts, plus datacenter capability flags.

### Navigation & Filtering

- **OS filter chips** — Header chips (AIX · IBM i · Linux · OpenShift) filter the Grid and OS Matrix views to show only nodes relevant to that OS.
- **Lane filter** — With an OS selected in grid view, click any lane chip to drill down to the intersection of that OS and lane.
- **Machine type filter** — In the Availability view, filter all 26 datacenter cards by machine type. Cards for datacenters that don't offer the selected machine type are hidden; matching machine type rows inside remaining cards are highlighted.

### Search

- **Full-text search** across labels, descriptions, discovery questions, competitors, and differentiators.
- **Grid search highlights** — Matching integration cards are highlighted; the OS buttons for their supported OSes are lit up. Non-matching items are dimmed.
- **Match count** — The search bar shows the number of matching components in real time.

### Sidebar detail panel

- **Node selection** — Click any node or card to see its direct connections, seller value proposition, discovery questions, key differentiators, and documentation links.
- **OS compatibility pills** — Each node displays colour-coded OS compatibility badges (AIX · IBM i · Linux · OpenShift).
- **Supported versions table** — AIX and IBM i nodes show a version table (Version / Min TL-TR / Hardware / Stock Image).
- **IBM i Software Tiers table** — IBM i node shows VST tier details (P05–P30: max vCPU, max RAM, licensing model, notes).
- **Network node detail** — In Network view the sidebar shows a full description of the selected node, its upstream dependencies, and downstream connections.

### Visual details

- **Power9 restriction notice** — Power9 nodes carry an `EXISTING CLIENTS ONLY` badge; new deployments must use Power10 or Power11.
- **Power10 / Power11 colour coding** — Machine types are colour-coded blue (Power10) and purple (Power11) throughout the Availability view.
- **Shared vs Dedicated badges** — Each datacenter card shows whether a machine type is available as a shared host, a dedicated host, or both.
- **Datacenter capability flags** — Each card shows abbreviated capability pills (CC, DH, DR, NSG, vPM) with full names on hover.
- **Partner / ISV badges** — Partner and restricted-status cards carry labelled badges.
- **Dark / light theme** toggle.

## Data Files

```
data/
  views.json                        # View registry
  powervs/
    plays.json                      # Lane definitions and play order
    products.json                   # All nodes (id, label, cat, os[], hub, status, desc, …)
    connections.json                # All edges (from, to, kind, mechanism, lane, status, summary, …)
    available-systems.json          # Hardware availability snapshot (datacenters, machine types, capabilities)
```

### `available-systems.json` schema

Fetched from the IBM Cloud PowerVS catalog API and committed as a static snapshot. Refresh manually by re-running the fetch script and committing the updated file.

| Field | Description |
|---|---|
| `generated_at` | ISO 8601 timestamp of when the snapshot was pulled |
| `datacenter_count` | Total number of active datacenters |
| `all_machine_types` | Sorted list of all machine type IDs across all datacenters |
| `datacenters[].region` | Datacenter region identifier (e.g. `dal12`, `eu-de-1`) |
| `datacenters[].status` | Datacenter status (`active`) |
| `datacenters[].systems.general` | Machine types available as shared (multi-tenant) hosts |
| `datacenters[].systems.dedicated` | Machine types available as dedicated hosts |
| `datacenters[].capabilities` | Boolean flags: `cloud_connections`, `dedicated_hosts`, `disaster_recovery`, `network_security_groups`, `vpmem` |

### Product `status` values

| Value | Meaning |
|---|---|
| `ga` | Generally available |
| `partner` | Partner / ISV offering |
| `restricted` | Available to existing clients only (e.g. Power9) |
| `deprecated` | No longer recommended |
| `coming_soon` | In preview or planned |

### Connection `kind` values

| Value | Rendering | Meaning |
|---|---|---|
| `native` | Solid line | Built-in, automatic relationship |
| `platform` | Dashed line | First-class IBM Cloud integration |
| `optional` | Dotted line | Seller or architect choice |

### Extended product fields

| Field | Type | Description |
|---|---|---|
| `supportedVersions` | array | OS version rows rendered as a table in the sidebar (Version, Min TL-TR, Hardware, Stock Image) |
| `softwareTiers` | array | IBM i VST tier rows (P05–P30) rendered as a table with licensing details |

## Local Development

This project uses [`mise`](https://mise.jdx.dev/) for task running.

```bash
# Validate data feed integrity and start local server on http://localhost:4173
mise run dev

# Stage all files and commit to git
mise run git:commit -- "feat: your commit message"

# Deploy preview to Vercel
mise run deploy:preview

# Deploy production release to Vercel
mise run deploy:prod
```

### Validation

The [`scripts/validate-feed.mjs`](scripts/validate-feed.mjs) script checks:
- All product `id`, `label`, `cat`, `status`, `hub`, `desc`, `value`, `docsUrl` fields are present and valid
- All connection endpoints reference known product IDs
- No duplicate undirected edges
- No disconnected products (products with zero edges are flagged as warnings)
- Connection `kind`, `status`, and `lane` values are within allowed sets

```bash
node scripts/validate-feed.mjs
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment workflows.
