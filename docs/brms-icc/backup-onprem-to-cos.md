# Backup flow: on-prem IBM i to Cloud Object Storage

How a full-system BRMS + ICC save leaves the production LPAR and lands in IBM Cloud Object Storage. Network picture: [plays/brms-icc-onprem-restore.html](../../plays/brms-icc-onprem-restore.html).

This is not a FalconStor VTL. BRMS writes **virtual tape and virtual optical** on local disk. IBM Cloud Storage Solutions for i (5733-ICC) then copies those volumes into a COS bucket over HTTPS.

## What must already exist

1. Production IBM i with 5770-BR1 (BRMS), 5733-ICC, and Media and Storage Extensions (option 18). Current PTF groups.
2. COS bucket in the same region as the VPC, HMAC service credentials (`access_key_id` + `secret_access_key`).
3. Customer VPC with a **site-to-site VPN gateway** and a **COS VPE**. The VPE reserved IP is the only COS address the IBM i should use.
4. On-prem VPN peer. Interesting traffic: IBM i subnet(s) ↔ VPC subnet that holds the VPE. UDP 500/4500 and ESP between peers.
5. IBM i DNS or a host-table entry so the COS **private or direct** hostname resolves to the VPE IP. Do not point ICC at the public COS endpoint.
6. Free local disk on the IBM i roughly equal to the size of the save. BRMS writes virtual media to disk **before** ICC transfers it.

If ICC 1.2.0 compression or encryption is on, IBM documents that you **cannot** recover the system from the cloud. Leave those off for a DR save.

## How the save actually moves

```
IBM i disk (virtual media)
    → ICC HTTPS tcp/443
    → on-prem VPN
    → IPsec
    → VPC VPN gateway
    → VPC
    → COS VPE
    → COS bucket  QBRMS_<system-name>/
```

PowerVS and Transit Gateway are not on this path.

## Step-by-step

### 1. Create the ICC cloud resource (once)

On the production IBM i, create an S3 resource that names the COS bucket and the **private** endpoint URI (`https://` plus the private or direct COS hostname).

```
CRTS3RICC
```

Use:

- Access key / secret from the COS HMAC service credential
- Bucket name from the COS instance
- Resource URI from the bucket’s **private** or **direct** endpoint, not public

Confirm the resource with `WRKCFGICC`.

### 2. Confirm BRMS can see the cloud location

```
WRKLOCBRM
```

The location that BRMS created for this ICC connector must be available. The BRMS control groups `QCLDBSYSnn` and `QCLDBIPLnn` are tied to that connector (`nn` is assigned by BRMS).

### 3. Sign on at the console and go restricted

Full-system cloud control groups run in a restricted state. Use HMC or LAN console. You cannot do other work on the partition while these saves run.

### 4. Save the bulk of the system to virtual tape first

```
STRBKUBRM CTLGRP(QCLDBSYS01) SBMJOB(*NO)
```

`QCLDBSYS01` writes `*IBM`, `*ALLUSR`, DLOs, and IFS to **virtual tape**. Default volume size is 30 GB (can be raised, up to 100 GB). This is the large data set. It stays on local disk as virtual media until ICC moves it.

**Run this control group before the IPL group.** BRMS records tape-volume metadata that the optical set must carry, or recovery cannot find the rest of the save.

### 5. Save the bootable set to virtual optical second

```
STRBKUBRM CTLGRP(QCLDBIPL01) SBMJOB(*NO)
```

(IBM’s tutorial also uses `OMITS(*IGNORE)` on this call when the control group has been edited.)

`QCLDBIPL01` does SAVSYS plus the IBM libraries and IFS objects needed to scratch-install far enough that the recovered system can talk to COS: Licensed Internal Code, operating system, BRMS, TCP/IP, ICC, and configuration. Output is **virtual optical**, which later becomes NFS install media or DVDs.

Optional later the same day, for incrementals (not the first full):

```
STRBKUBRM CTLGRP(QCLDBUSR01) SBMJOB(*NO)
STRBKUBRM CTLGRP(QCLDBGRP01) SBMJOB(*NO)
```

Sunday full = SYS then IPL. Monday–Saturday = USR then GRP. Wrong order means the recovery report is missing media information.

### 6. ICC copies the virtual volumes to COS

Control groups whose names begin with `QCLD` transfer automatically. Otherwise copy with `CPYTOCLD`.

Watch the copy:

```
WRKSTSICC STATUS(*ALL)
```

Each volume must show **Success** before you call the save complete. BRMS stores objects in the bucket under `QBRMS_<source-system-name>`, with file names equal to the volume identifiers.

**This is the only step that uses the WAN.** Packets are HTTPS (tcp/443) from the IBM i, through the on-prem VPN, IPsec to the VPC VPN gateway, then to the COS VPE. Confirm `WRKSTSICC` failures against VPN, DNS → VPE IP, and HMAC keys before rerunning a 4 TB save.

### 7. Prove you can recover from this save

On a system that still has BRMS:

```
STRRCYBRM OPTION(*CTLGRP) ACTION(*REPORT)
  CTLGRP((QCLDBSYS01 1) (QCLDBIPL01 2) (QCLDBUSR01 3) (QCLDBGRP01 4))
  PERIOD(())
```

Keep that report with the save. The QCLDBIPL volume names on it are what the helper LPAR must download first during a restore.

Optional but documented: copy QCLDBIPL (and QCLDBGRP) to physical optical and store it off-site so a restore does not have to wait on the ICC download of the boot set.

## What “done” looks like

- Job logs for both control groups are clean enough to trust (some informational errors are normal).
- `WRKSTSICC` shows every volume **Success**.
- The COS bucket contains the `QBRMS_<system>` prefix and both the tape (SYS) and optical (IPL) volume files.
- The recovery report lists those same volume IDs.
- No IBM i traffic went to the public COS endpoint.
