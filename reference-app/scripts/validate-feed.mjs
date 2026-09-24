#!/usr/bin/env node
/**
 * Validate each view in the IBM Cloud synergies feed.
 *
 * Mapped views (Infrastructure):
 * - unique undirected edges
 * - no orphan products
 * - every connection endpoint exists
 * - coming_soon cannot be native
 * - PowerVS backup edges name Compass/COS/BRMS
 * - HPCS is deprecated
 *
 * Overlay views (Data & AI, Automation):
 * - IaaS compute hubs on the top lane
 * - connections to view products are validated when present
 * - unmapped view chips may remain disconnected
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "data/views.json"), "utf8"));

const KINDS = new Set(["native", "platform", "optional"]);
const STATUSES = new Set(["ga", "coming_soon", "partner", "deprecated", "placeholder"]);
const BACKUP_NAMES = /\b(compass|brms|5733-icc|storage protect|cobalt iron|mksysb|icc|falconstor|storsafe)\b/i;

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function validateView(view) {
  const prefix = `[${view.id}]`;
  const playsDoc = JSON.parse(readFileSync(join(root, view.path, "plays.json"), "utf8"));
  const products = JSON.parse(readFileSync(join(root, view.path, "products.json"), "utf8"));
  const connections = JSON.parse(readFileSync(join(root, view.path, "connections.json"), "utf8"));
  const mode = playsDoc.view?.mode || "mapped";
  const LANES = new Set(playsDoc.categories.map((c) => c.id));

  const productById = new Map();
  for (const p of products) {
    if (!p.id) fail(`${prefix} product missing id`);
    if (productById.has(p.id)) fail(`${prefix} duplicate product id: ${p.id}`);
    productById.set(p.id, p);
    if (!p.label) fail(`${prefix} product ${p.id} missing label`);
    if (!LANES.has(p.cat)) fail(`${prefix} product ${p.id} has unknown cat ${p.cat}`);
    if (!Array.isArray(p.plays) || p.plays.length === 0) fail(`${prefix} product ${p.id} missing plays`);
    if (p.status && !STATUSES.has(p.status)) fail(`${prefix} product ${p.id} bad status ${p.status}`);
    if (typeof p.hub !== "boolean") fail(`${prefix} product ${p.id} missing hub boolean`);
    if (mode === "placeholder") continue;
    if (mode === "overlay" && p.status === "placeholder") continue;
    for (const field of ["desc", "value", "docsUrl"]) {
      if (!p[field]) fail(`${prefix} product ${p.id} missing ${field}`);
    }
    if (!Array.isArray(p.questions) || p.questions.length < 3) {
      warn(`${prefix} product ${p.id} has fewer than 3 discovery questions`);
    }
  }

  if (view.id === "iaas") {
    const hubs = products.filter((p) => p.hub).map((p) => p.id);
    if (hubs.length !== 5) fail(`${prefix} expected 5 hubs, found ${hubs.length}: ${hubs.join(", ")}`);
    const hpcs = productById.get("hpcs");
    if (!hpcs) warn(`${prefix} HPCS product missing`);
    else if (hpcs.status !== "deprecated") fail(`${prefix} HPCS must be status deprecated`);
    if (products.some((p) => p.cat === "data_ai")) fail(`${prefix} Data & AI products must live in the data-ai view`);
  }

  if (mode === "placeholder") {
    if (connections.length) warn(`${prefix} placeholder view has ${connections.length} connections; expected none until mapping is vetted`);
    console.log(`${prefix} placeholder OK: ${products.length} products, ${playsDoc.playOrder.length} lanes, ${connections.length} connections.`);
    return;
  }

  if (mode === "overlay") {
    const iaasCat = playsDoc.categories.find((c) => c.id === "iaas");
    if (!iaasCat) fail(`${prefix} overlay view must have an iaas category as the top lane`);
    else if (playsDoc.playOrder[0] !== iaasCat.playId) fail(`${prefix} iaas lane must be first in playOrder`);
    const overlayHubs = products.filter((p) => p.hub).map((p) => p.id);
    const expectedHubs = ["vpc", "iks", "roks", "code_engine", "powervs"];
    for (const id of expectedHubs) {
      if (!overlayHubs.includes(id)) fail(`${prefix} overlay missing IaaS hub ${id}`);
    }
  }

  const seenUndirected = new Map();
  const connected = new Set();

  connections.forEach((c, i) => {
    const loc = `${prefix} connection[${i}] ${c.from}->${c.to}`;
    for (const field of ["from", "to", "kind", "mechanism", "lane", "status", "summary", "docsUrl"]) {
      if (!c[field]) fail(`${loc} missing ${field}`);
    }
    if (!productById.has(c.from)) fail(`${loc} unknown from ${c.from}`);
    if (!productById.has(c.to)) fail(`${loc} unknown to ${c.to}`);
    if (c.from === c.to) fail(`${loc} self-loop`);
    if (!KINDS.has(c.kind)) fail(`${loc} bad kind ${c.kind}`);
    if (!STATUSES.has(c.status)) fail(`${loc} bad status ${c.status}`);
    if (!LANES.has(c.lane)) fail(`${loc} bad lane ${c.lane}`);
    if (!/^https?:\/\//.test(c.docsUrl)) fail(`${loc} docsUrl is not http(s)`);

    if (c.status === "coming_soon" && c.kind === "native") {
      fail(`${loc} coming_soon cannot be native`);
    }

    const [a, b] = [c.from, c.to].sort();
    const key = `${a}::${b}`;
    if (seenUndirected.has(key)) {
      fail(`${prefix} duplicate undirected edge ${a}—${b} (also ${seenUndirected.get(key)})`);
    } else {
      seenUndirected.set(key, loc);
    }

    connected.add(c.from);
    connected.add(c.to);

    const involvesPower = c.from === "powervs" || c.to === "powervs";
    const involvesBackup = c.from === "backup_recovery" || c.to === "backup_recovery";
    if (involvesPower && involvesBackup) {
      if (c.status !== "coming_soon") {
        fail(`${loc} PowerVS—Backup and Recovery must be coming_soon until the service is GA`);
      }
      if (c.kind === "native") {
        fail(`${loc} PowerVS backup must not be native`);
      }
      if (!BACKUP_NAMES.test(`${c.summary} ${c.sellerNote || ""}`)) {
        fail(`${loc} PowerVS backup copy must name Compass, COS/BRMS, Storage Protect, or 5733-ICC`);
      }
    }

    if (involvesPower && (c.kind === "native" || c.kind === "platform") && /backup and recovery/i.test(c.summary) && !involvesBackup) {
      fail(`${loc} PowerVS live backup copy must not name Backup and Recovery as the product`);
    }
  });

  for (const p of products) {
    if (!connected.has(p.id)) {
      if (mode === "overlay" && p.status === "placeholder") continue;
      if (mode === "overlay" && p.hub && connections.length === 0) continue;
      fail(`${prefix} orphan product with no connections: ${p.id}`);
    }
  }

  const hubs = products.filter((p) => p.hub).map((p) => p.id);
  if (mode !== "overlay") {
    for (const hub of hubs) {
      const degree = connections.filter((c) => c.from === hub || c.to === hub).length;
      if (degree < 8) warn(`${prefix} hub ${hub} has only ${degree} connections; expected a dense first-run row`);
    }
  }

  console.log(
    `${prefix} Feed OK: ${products.length} products, ${connections.length} connections, ${hubs.length} hubs, ${seenUndirected.size} undirected edges.`
  );
}

for (const view of catalog.views) {
  validateView(view);
}

if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length) {
  console.error(`\nFeed invalid (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
