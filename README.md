# IBM Power Virtual Server Synergies Map

An interactive synergy and architectural relationship map for IBM Power Virtual Server (PowerVS) in IBM Cloud.

## Architecture Layers
- **Core Hubs**: PowerVS (IBM Data Center - Power10/Power11 standard, Power9 grandfathered) & PowerVS Private Cloud (On-Prem Pod)
- **Operating Systems**: AIX, IBM i (AS/400), Linux on Power (RHEL/SLES), Red Hat OpenShift on Power
- **Storage**: Tier 1 (High IOPS Tier), Tier 3 (Standard IOPS Tier) — all running on common IBM FlashSystem hardware, Shared Volumes, vPMEM, Cloud Object Storage
- **Backups**: Compass BaaS, FalconStor StorSafe VTL, BRMS & 5733-ICC, AIX mksysb / Storage Protect, Snapshots & Clones, Veeam
- **Replication**: Global Replication Services (GRS), PowerHA for AIX, PowerHA for i, Db2 Q-Replication, ISV Logical Replication (MIMIX/Maxava)
- **Migration**: FalconStor Migration, BRMS/ICC Cloud Save/Restore, AIX mksysb/NIM, PowerVC OVA, IBM Lab Services, Aspera High-Speed Transfer
- **IBM Cloud Integrations**: Transit Gateway, VPC, Key Protect, IBM Cloud Logs & Monitoring, VPC VPN Gateways

## Local Tasks with Mise

This project uses [`mise`](https://mise.jdx.dev/) for task running and environment management.

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

See [DEPLOYMENT.md](DEPLOYMENT.md) for manual deployment workflows.
