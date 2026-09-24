# IBM Power Virtual Server Synergies Map

An interactive synergy and architectural relationship map for IBM Power Virtual Server (PowerVS) in IBM Cloud. Visualises how PowerVS connects across hardware generations, operating systems, storage, backups, replication, migration, and IBM Cloud platform services.

## Architecture Layers

| Lane | Components |
|---|---|
| **Power Virtual Server Core** | IBM Power Virtual Server (hub) · Power11 · Power10 · Power9 _(existing clients only)_ |
| **Operating Systems** | IBM AIX · IBM i (AS/400) · Linux on Power (RHEL / SLES) · Red Hat OpenShift on Power |
| **Storage** | Tier 1 (High IOPS) · Tier 3 (Standard IOPS) · Shared Volumes & Volume Groups · vPMEM · Cloud Object Storage |
| **Backups** | Compass BaaS (Cobalt Iron) · FalconStor StorSafe VTL · BRMS & 5733-ICC · AIX mksysb / IBM Storage Protect · PowerVS Snapshots & Clones · Veeam Agent for AIX |
| **Replication** | Global Replication Services (GRS) · PowerHA SystemMirror for AIX · PowerHA for i & Geographic Mirroring · Db2 Q-Replication · ISV Logical Replication (MIMIX / Maxava) |
| **Migration** | FalconStor Migration · BRMS/ICC Cloud Save & Restore · AIX mksysb & NIM · PowerVC OVA Export · IBM Lab Services & Migration Factory · IBM Aspera High-Speed Transfer |
| **IBM Cloud Integrations** | Transit Gateway · IBM Cloud VPC · Direct Link 2.0 · Key Protect · IBM Cloud Logs & Monitoring · VPC VPN Gateways |

## Features

- **OS filter chips** — Filter the entire map to AIX, IBM i, Linux, or OpenShift. Click a chip in the header to highlight only the nodes and connections relevant to that OS across every lane.
- **Lane filter** — With an OS selected, click any lane chip (Backups, Replication, etc.) to drill down to the intersection of that OS and lane — e.g. all IBM i backup options.
- **Node selection** — Click any node to see its direct connections, seller value proposition, discovery questions, key differentiators, and documentation links in the sidebar.
- **OS tags in sidebar** — Each node displays colour-coded OS compatibility pills (AIX · IBM i · Linux · OpenShift).
- **Power9 restriction notice** — Power9 nodes carry a yellow `EXISTING CLIENTS ONLY` badge; new deployments must use Power10 or Power11.
- **Connection types** — Solid lines = native, dashed = platform integration, dotted = optional/partner.
- **Search** — Full-text search across labels, descriptions, discovery questions, competitors, and differentiators.
- **Dark / light theme** toggle.

## Data Files

```
data/
  views.json               # View registry
  powervs/
    plays.json             # Lane definitions and play order
    products.json          # All nodes (id, label, cat, os[], hub, status, desc, …)
    connections.json       # All edges (from, to, kind, mechanism, lane, status, summary, …)
```

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
