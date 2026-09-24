#!/usr/bin/env node
/**
 * Validate each view in the PowerVS synergies feed.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "data/views.json"), "utf8"));

const KINDS = new Set(["native", "platform", "optional"]);
const STATUSES = new Set(["ga", "coming_soon", "partner", "deprecated", "placeholder", "restricted"]);

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
    for (const field of ["desc", "value", "docsUrl"]) {
      if (!p[field]) fail(`${prefix} product ${p.id} missing ${field}`);
    }
    if (!Array.isArray(p.questions) || p.questions.length < 2) {
      warn(`${prefix} product ${p.id} has fewer than 2 discovery questions`);
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
  });

  for (const p of products) {
    if (!connected.has(p.id)) {
      warn(`${prefix} product ${p.id} is disconnected (no edges)`);
    }
  }

  console.log(
    `${prefix} OK: ${products.length} products, ${playsDoc.playOrder.length} lanes, ${connections.length} connections.`
  );
}

for (const view of catalog.views) {
  validateView(view);
}

if (warnings.length) {
  console.log("\nWarnings:\n" + warnings.map((w) => `  ! ${w}`).join("\n"));
}

if (errors.length) {
  console.error("\nErrors:\n" + errors.map((e) => `  x ${e}`).join("\n"));
  process.exit(1);
} else {
  console.log("\nAll views passed validation.");
}
