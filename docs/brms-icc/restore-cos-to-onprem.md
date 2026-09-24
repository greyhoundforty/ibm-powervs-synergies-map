# Restore flow: Cloud Object Storage back to on-prem IBM i

How a full-system BRMS + ICC save in COS is put back onto an on-prem partition. Network picture: [plays/brms-icc-onprem-restore.html](../../plays/brms-icc-onprem-restore.html). Backup counterpart: [backup-onprem-to-cos.md](backup-onprem-to-cos.md).

You cannot IPL an IBM i from object storage. COS holds BRMS virtual volumes, not bootable media. A **running helper** must pull the QCLDBIPL optical set first. A **staging LPAR** (spare partition or rebuilt production) then installs from NFS or DVD. After ICC exists on staging, BRMS pulls the remaining QCLDBSYS volumes from COS itself.

PowerVS and Transit Gateway are not on this path. Keep NFS and D-mode on the on-prem LAN.

## What must already exist

1. The COS bucket from the save, HMAC keys, VPC VPN, COS VPE, and DNS so the private COS hostname still resolves to the VPE IP.
2. A **helper** that can reach COS today:
   - Preferred: a running on-prem IBM i with 5733-ICC (and enough IFS for the QCLDBIPL optical set), or
   - Fallback: a PC that downloads the QCLDBIPL objects and burns DVD/optical.
3. A **staging LPAR** with disk ≈ the full production system, IPv4, and the ability to ping the helper. This can be a spare LPAR or production after you scratch it.
4. The BRMS recovery report from the save (`STRRCYBRM … ACTION(*REPORT)`), so you know which volumes are IPL media vs tape.

Object-level restore (`CPYFRMCLD` / `RSTLIBBRM` onto a living IBM i) does **not** use this procedure. Stop here if the production OS is still up and you only need libraries or IFS.

## How the restore actually moves

```
2a  COS → VPE → VPC → VPC VPN → IPsec → on-prem VPN → NFS helper   (CPYFRMCLD, tcp/443)
2b  NFS helper → staging LPAR                                         (NFS / network install)
    or helper burns DVD → staging IPL from optical
2c  COS → VPE → … → on-prem VPN → staging LPAR                        (STRRCYBRM, tcp/443,
                                                                       only after ICC is on staging)
```

## Step-by-step

### 2a. Pull the boot set onto a running helper

On the helper IBM i (not the empty staging LPAR):

1. Recreate the same ICC S3 resource if this partition does not already have it (`CRTS3RICC`, private URI, HMAC, bucket).
2. `MKDIR DIR('/install')` then `MKDIR DIR('/install/sysipl')`.
3. In the COS bucket, find the QCLDBIPL volumes under `QBRMS_<source-system-name>`. Volume names are on the recovery report.
4. Copy each IPL volume down:

```
CPYFRMCLD
```

Use the ICC resource name, cloud file name = object name, local file = `/install/sysipl/<volume>`. Submit to batch if there are several; they can run together.

5. `WRKSTSICC STATUS(*ALL)` until every IPL volume is **Success**.

**Network:** helper → on-prem VPN → IPsec → VPC VPN gateway → VPC → COS VPE :443 → bucket.

If the helper is a PC instead of IBM i, download those same objects with the COS HMAC keys and skip to the optical branch of 2b.

### 2b. Make the staging LPAR bootable from that media

Pick one. Do not NFS-install across the VPN.

**NFS (typical when you have a second IBM i):**

On the helper:

```
CRTDEVOPT DEVD(INSTALL) RSRCNAME(*VRT) LCLINTNETA(*N)
CRTIMGCLG IMGCLG(SYSIPL) DIR('/install/sysipl')
```

Add each downloaded volume with `ADDIMGCLGE`, load the catalog on `INSTALL`, then:

```
VFYIMGCLG IMGCLG(SYSIPL) TYPE(*LIC) NFSSHR(*YES)
STRNFSSVR SERVER(*ALL)
CHGNFSEXP OPTIONS('-i -o ro') DIR('/install/sysipl')
```

On the staging LPAR, create a 632B-003 optical device pointed at the helper:

```
CRTDEVOPT DEVD(NFSRESTORE) RSRCNAME(*VRT)
  LCLINTNETA(*SRVLAN)
  RMTINTNETA('<helper-ipv4>')
  NETIMGDIR('/install/sysipl')
```

Vary it on. Network-install Licensed Internal Code:

```
STRNETINS DEV(NFSRESTORE) OPTION(*LIC) KEYLCKMOD(*MANUAL)
```

Work the install from the console (D-mode). Restore OS, then BRMS, TCP/IP Utilities, ICC, user profiles, and configuration — everything the recovery report says must come from **physical / optical** media before cloud restore can start. Helper and staging must ping each other on-prem. Helper disk only needs to hold the IPL image set.

**Optical / DVD (the procedure IBM writes for on-prem):**

Add a `.iso` suffix if the burner requires it. Burn the QCLDBIPL volumes. IPL staging from that optical. Same objects as NFS: LIC, OS, BRMS, TCP, ICC, config.

Until this step finishes, staging has no ICC, so it cannot be the COS client. That is why the helper exists.

### 2c. Pull the rest of the system from COS on the staging LPAR

Staging now has an OS and ICC. Remaining volumes (QCLDBSYS virtual tape, later incrementals) restore from the cloud.

1. Follow the recovery report from here. Register the cloud volumes with BRMS. IBM documents:

```
ADDLIBLE LIB(QICC)
CALL QICC/REGEXTPTS PARM('R')
```

(Exact register/volume-fix calls can also include `CALL QBRM/Q1AOLD PARM('CLOUD' 'FIXDRVOL' …)` with the volume names from the report.)

2. Recreate the ICC resource on staging if the save did not already restore it (`WRKCFGICC`). Same private URI and HMAC as production.

3. The system is still restricted. Start TCP only on the interface that can reach the VPE:

```
STRTCP STRSVR(*NO) STRIFC(*NO) STRPTPPRF(*NO) STRIP6(*YES)
STRTCPIFC INTNETADR('<staging-ipv4>')
```

4. Run the BRMS recovery against the cloud location, for example:

```
STRRCYBRM OPTION(*SYSTEM) ACTION(*RESTORE)
```

or continue stepping through the report. BRMS downloads QCLDBSYS (and USR/GRP if used) through ICC.

**Network:** staging → on-prem VPN → IPsec → VPC VPN gateway → VPC → COS VPE :443 → bucket.

5. When BRMS finishes, IBM’s cloud-recovery write-up has you `ENDTCP` so the system can verify, then `STRTCP` and IPL.

6. Rebuild TCP (and any `CLOUDINITn` lines) the way you documented them before the scratch install. Confirm the staging LPAR still resolves the COS private hostname to the VPE.

## What “done” looks like

- Staging IPLed on A or B side, not D.
- BRMS recovery report steps for optical media are complete; remaining steps used cloud volumes.
- `WRKSTSICC` on staging shows the SYS (and incremental) transfers **Success**.
- Users, config, IBM libraries, and IFS match the save. Time zone and system name are what you intended for this LPAR.
- No D-mode or NFS traffic left the on-prem LAN. No COS traffic used the public endpoint.
