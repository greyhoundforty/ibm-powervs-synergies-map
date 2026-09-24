const KIND_ORDER = ["native", "platform", "optional"];

const state = {
  views: [],
  viewId: null,
  viewMeta: null,
  plays: {},
  playOrder: [],
  categories: [],
  products: [],
  connections: [],
  selectedId: null,
  query: "",
  laneFilter: null,
  chromeBound: false,
};

const els = {
  legend: document.getElementById("play-legend"),
  lanes: document.getElementById("lanes"),
  nodes: document.getElementById("nodes"),
  svg: document.getElementById("svg-connections"),
  sidebar: document.getElementById("sidebar-inner"),
  reset: document.getElementById("reset-btn"),
  search: document.getElementById("search"),
  searchClear: document.getElementById("search-clear"),
  searchCount: document.getElementById("search-count"),
  footer: document.getElementById("footer-stats"),
  footerHint: document.getElementById("footer-hint"),
  theme: document.getElementById("theme-btn"),
  map: document.getElementById("map-area"),
  viewSwitch: document.getElementById("view-switch"),
  metaText: document.getElementById("meta-text"),
};

function playColor(playId) {
  return `var(--play-${playId})`;
}

function productById(id) {
  return state.products.find((p) => p.id === id);
}

function catFor(product) {
  return state.categories.find((c) => c.id === product.cat);
}

function isPlaceholderView() {
  return state.viewMeta?.mode === "placeholder";
}

function isOverlayView() {
  return state.viewMeta?.mode === "overlay";
}

function isVisualOnly() {
  return isPlaceholderView() || (isOverlayView() && state.connections.length === 0);
}

function matchesQuery(product, q) {
  if (!q) return true;
  const blob = [
    product.label,
    product.desc,
    product.value,
    ...(product.questions || []),
    ...(product.competitors || []),
    ...(product.differentiators || []),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

function neighborsOf(id) {
  return state.connections.filter((c) => c.from === id || c.to === id);
}

function otherEnd(conn, id) {
  return conn.from === id ? conn.to : conn.from;
}

function neighborCat(conn, id) {
  return productById(otherEnd(conn, id))?.cat;
}

function connectionsFor(id, cat = state.laneFilter) {
  const all = neighborsOf(id);
  if (!cat) return all;
  return all.filter((c) => neighborCat(c, id) === cat);
}

function dashFor(kind) {
  if (kind === "platform") return "6 4";
  if (kind === "optional") return "2 3";
  return "";
}

function layout() {
  const rect = els.map.getBoundingClientRect();
  const padX = 56;
  const width = rect.width;
  const height = rect.height;
  const laneCount = state.playOrder.length || 1;
  const laneH = height / laneCount;
  const positions = new Map();

  els.lanes.innerHTML = "";
  state.playOrder.forEach((playId, i) => {
    const top = i * laneH;
    if (i % 2 === 1) {
      const strip = document.createElement("div");
      strip.className = "lane-strip";
      strip.style.top = `${top}px`;
      strip.style.height = `${laneH}px`;
      els.lanes.appendChild(strip);
    }
    if (i > 0) {
      const div = document.createElement("div");
      div.className = "lane-divider";
      div.style.top = `${top}px`;
      els.lanes.appendChild(div);
    }

    const cat = state.categories.find((c) => c.playId === playId);
    if (cat?.id === "iaas") {
      const tag = document.createElement("div");
      tag.className = "lane-label";
      tag.textContent = "IaaS";
      tag.style.top = `${top + 8}px`;
      els.lanes.appendChild(tag);
    }
    const inLane = state.products.filter((p) => p.cat === cat.id);
    const hubs = inLane.filter((p) => p.hub);
    const spokes = inLane.filter((p) => !p.hub);
    const ordered = [...hubs, ...spokes];
    const n = ordered.length;
    ordered.forEach((p, idx) => {
      const x = padX + ((width - padX * 2) * (idx + 1)) / (n + 1);
      const y = top + laneH / 2;
      positions.set(p.id, { x, y, playId });
    });
  });

  els.nodes.innerHTML = "";
  for (const product of state.products) {
    const pos = positions.get(product.id);
    if (!pos) continue;
    const node = document.createElement("button");
    node.type = "button";
    node.className = `pnode${product.hub ? " is-hub" : ""}${product.status === "deprecated" ? " is-deprecated" : ""}`;
    node.dataset.id = product.id;
    const label = document.createElement("span");
    label.className = "pnode-label";
    label.textContent = product.label;
    node.appendChild(label);
    if (product.status === "deprecated") {
      const flag = document.createElement("span");
      flag.className = "deprecated-flag";
      flag.textContent = "Deprecated";
      node.appendChild(flag);
    }
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    node.style.setProperty("--node-color", playColor(pos.playId));
    node.addEventListener("click", () => select(product.id));
    els.nodes.appendChild(node);
  }

  drawEdges(positions);
  applyHighlights();
}

function curve(x1, y1, x2, y2) {
  const start = insetToward(x1, y1, x2, y2, 22);
  const end = insetToward(x2, y2, x1, y1, 22);
  const dy = end.y - start.y;
  const dx = end.x - start.x;
  if (Math.abs(dy) < 8) {
    const bow = dx > 0 ? -28 : 28;
    return `M ${start.x} ${start.y} C ${start.x + dx * 0.35} ${start.y + bow}, ${end.x - dx * 0.35} ${end.y + bow}, ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + dy * 0.38}, ${end.x} ${end.y - dy * 0.38}, ${end.x} ${end.y}`;
}

function insetToward(x, y, ox, oy, dist) {
  const dx = ox - x;
  const dy = oy - y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: x + (dx / len) * dist, y: y + (dy / len) * dist };
}

function drawEdges(positions) {
  const rect = els.map.getBoundingClientRect();
  els.svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  els.svg.innerHTML = "";
  for (const conn of state.connections) {
    const a = positions.get(conn.from);
    const b = positions.get(conn.to);
    if (!a || !b) continue;
    const fromProd = productById(conn.from);
    const toProd = productById(conn.to);
    const deprecated = fromProd?.status === "deprecated" || toProd?.status === "deprecated" || conn.status === "deprecated";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", curve(a.x, a.y, b.x, b.y));
    path.setAttribute(
      "class",
      `conn-path is-${conn.kind}${conn.status === "coming_soon" ? " is-coming" : ""}${deprecated ? " is-deprecated" : ""}`
    );
    path.dataset.from = conn.from;
    path.dataset.to = conn.to;
    path.dataset.fromPlay = String(a.playId);
    path.dataset.toPlay = String(b.playId);
    const dash = deprecated ? "1 5" : dashFor(conn.kind);
    if (dash) path.setAttribute("stroke-dasharray", dash);
    els.svg.appendChild(path);
  }
}

function select(id) {
  state.selectedId = state.selectedId === id ? null : id;
  renderSidebar();
  syncLegend();
  applyHighlights();
}

function clearSelection() {
  state.selectedId = null;
  renderSidebar();
  syncLegend();
  applyHighlights();
}

function applyHighlights() {
  const q = state.query.trim().toLowerCase();
  const selected = state.selectedId;
  const related = new Set();
  const liveEnds = new Set();
  if (selected) {
    related.add(selected);
    for (const c of connectionsFor(selected)) {
      const other = otherEnd(c, selected);
      related.add(other);
      liveEnds.add(other);
    }
  }
  els.map.classList.toggle("is-focused", Boolean(selected));

  for (const node of els.nodes.querySelectorAll(".pnode")) {
    const id = node.dataset.id;
    const product = productById(id);
    const inLane = !state.laneFilter || product.cat === state.laneFilter;
    const inSearch = matchesQuery(product, q);
    const isSelected = id === selected;
    const isLinked = Boolean(selected) && related.has(id) && !isSelected;
    node.classList.toggle("selected", isSelected);
    node.classList.toggle("highlighted", isLinked);
    const dim = selected
      ? !related.has(id)
      : Boolean(q)
        ? !inSearch
        : Boolean(state.laneFilter) && !inLane;
    node.classList.toggle("dimmed", dim);
  }

  const active = [];
  for (const path of els.svg.querySelectorAll(".conn-path")) {
    const touches = Boolean(selected) && (path.dataset.from === selected || path.dataset.to === selected);
    const other = selected && touches ? (path.dataset.from === selected ? path.dataset.to : path.dataset.from) : null;
    const live = touches && (!state.laneFilter || liveEnds.has(other));
    path.classList.toggle("active", live);
    if (live) {
      const otherPlay = path.dataset.from === selected ? path.dataset.toPlay : path.dataset.fromPlay;
      path.style.setProperty("--edge-color", playColor(otherPlay));
      if (!path.classList.contains("is-deprecated")) path.removeAttribute("stroke-dasharray");
      active.push(path);
    } else {
      path.style.removeProperty("--edge-color");
      if (path.classList.contains("is-deprecated")) {
        path.setAttribute("stroke-dasharray", "1 5");
      } else {
        const kind = [...path.classList].find((c) => c.startsWith("is-") && c !== "is-coming" && c !== "is-deprecated");
        const dash = dashFor(kind ? kind.replace("is-", "") : "native");
        if (dash) path.setAttribute("stroke-dasharray", dash);
        else path.removeAttribute("stroke-dasharray");
      }
    }
  }
  for (const path of active) els.svg.appendChild(path);
}

function kindLabel(kind, status) {
  if (status === "coming_soon") return `${kind} · coming soon`;
  if (status === "partner") return `${kind} · partner`;
  if (status === "deprecated") return `${kind} · deprecated`;
  return kind;
}

function renderSidebar() {
  const id = state.selectedId;
  els.reset.classList.toggle("is-visible", Boolean(id));
  if (!id) {
    const empty = isVisualOnly()
      ? `<p>${escapeHtml(state.viewMeta.blurb || "Visual placeholder. Mapping will be filled later.")}</p>
         <div class="empty-hint">No selection</div>
         <p class="sb-description">${isOverlayView() ? "IaaS compute is on the top lane. View-specific tie-ins will be drawn when that mapping is vetted." : "Boxes are the product set only. Connections are intentionally empty until this view is vetted."}</p>`
      : `<p>${escapeHtml(isOverlayView() ? (state.viewMeta.blurb || "IaaS compute on top, then this view's tie-ins.") : "Select a service to highlight its default connections and possible integrations across the IBM Cloud lanes.")}</p>
         <div class="empty-hint">No selection</div>
         <div class="kind-key">
           <div class="k-native">Native — exists because you chose the hub</div>
           <div class="k-platform">Platform — first-class IBM Cloud integration, not auto-created</div>
           <div class="k-optional">Optional — seller or architect choice</div>
         </div>`;
    els.sidebar.innerHTML = `<div class="sidebar-empty">${empty}</div>`;
    return;
  }

  const product = productById(id);
  const cat = catFor(product);
  const allConns = neighborsOf(id);
  const conns = connectionsFor(id).slice().sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (ka !== 0) return ka;
    return productById(otherEnd(a, id)).label.localeCompare(productById(otherEnd(b, id)).label);
  });
  const lane = state.laneFilter ? state.categories.find((c) => c.id === state.laneFilter) : null;
  const connHeading = lane
    ? `${conns.length} of ${allConns.length} connection${allConns.length === 1 ? "" : "s"} · ${lane.label}`
    : `${conns.length} connection${conns.length === 1 ? "" : "s"}`;

  const questions = (product.questions || [])
    .map((q, i) => `<div class="sb-question-item"><span class="sb-question-icon">${i + 1}</span><span class="sb-question-text">${escapeHtml(q)}</span></div>`)
    .join("");
  const competitors = (product.competitors || [])
    .map((c) => `<span class="competitor-tag">${escapeHtml(c)}</span>`)
    .join("");
  const diffs = (product.differentiators || [])
    .map((d) => `<div class="differentiator-item"><span class="diff-icon">✓</span><span class="diff-text">${escapeHtml(d)}</span></div>`)
    .join("");
  const connRows = conns
    .map((c) => {
      const other = productById(otherEnd(c, id));
      const otherCat = catFor(other);
      return `<button type="button" class="conn-row" data-target="${other.id}">
        <span class="conn-accent is-${c.kind}" style="--accent-color:${playColor(otherCat.playId)}"></span>
        <span class="conn-info">
          <span class="conn-name">${escapeHtml(other.label)}</span>
          <span class="conn-play">${escapeHtml(kindLabel(c.kind, c.status))} · ${escapeHtml(otherCat.label)}</span>
          <span class="conn-explanation">${escapeHtml(c.summary)}</span>
        </span>
        <span class="conn-arrow">›</span>
      </button>`;
    })
    .join("");

  const hub = product.hub ? `<span class="status-pill">Hub</span>` : "";
  const status =
    product.status && product.status !== "ga"
      ? `<span class="status-pill is-${product.status}">${product.status === "placeholder" ? "visual only" : product.status.replaceAll("_", " ")}</span>`
      : "";

  const extra =
    product.status === "deprecated"
      ? `<div class="sb-deprecation">Deprecated offering. Prefer Key Protect Dedicated for new KYOK/KMIP work. Existing instances are supported until 28 March 2027.</div>`
      : product.status === "placeholder"
        ? `<div class="sb-deprecation is-placeholder">Placeholder chip. No mapping or seller copy yet.</div>`
        : "";

  els.sidebar.innerHTML = `
    <div class="sb-tag">Service</div>
    <div class="sb-product-name">${escapeHtml(product.label)}${hub}${status}</div>
    <div class="sb-category">${escapeHtml(cat.label)}</div>
    ${extra}
    <div class="sb-section-label">Featured in lanes</div>
    <div>
      <span class="play-pill"><span class="dot" style="--play-color:${playColor(cat.playId)}"></span>${escapeHtml(cat.label)}</span>
    </div>
    <div class="sb-section-label">Description</div>
    <p class="sb-description">${escapeHtml(product.desc)}</p>
    <div class="sb-section-label">Value proposition</div>
    <p class="sb-value">${escapeHtml(product.value)}</p>
    ${product.docsUrl ? `<a class="sb-link" href="${escapeHtml(product.docsUrl)}" target="_blank" rel="noopener">Docs</a>` : ""}
    ${competitors ? `<div class="sb-section-label">Competes with</div><div class="sb-competitors">${competitors}</div>` : ""}
    ${diffs ? `<div class="sb-section-label">Key differentiators</div><div class="sb-differentiators">${diffs}</div>` : ""}
    ${questions ? `<div class="sb-section-label">Discovery questions</div><div class="sb-questions">${questions}</div>` : ""}
    <div class="sb-section-label">${escapeHtml(connHeading)}</div>
    <div class="conn-list">${connRows || `<div class="conn-empty">${isVisualOnly() ? "No edges in this view yet." : isOverlayView() ? "No IaaS tie-in for this chip in this view." : lane ? `No ${escapeHtml(lane.label)} integrations for this service.` : "No connections in the feed."}</div>`}</div>
  `;

  for (const row of els.sidebar.querySelectorAll(".conn-row")) {
    row.addEventListener("click", () => select(row.dataset.target));
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLegend() {
  els.legend.innerHTML = state.playOrder
    .map((playId) => {
      const play = state.plays[playId];
      return `<button type="button" class="legend-chip" data-cat="${play.cat}" aria-pressed="false">
        <span class="dot" style="background:${playColor(playId)}"></span>
        ${escapeHtml(state.playOrder.length > 6 ? play.short : play.name)}
        <span class="legend-count" hidden></span>
      </button>`;
    })
    .join("");
  for (const chip of els.legend.querySelectorAll(".legend-chip")) {
    chip.addEventListener("click", () => {
      const cat = chip.dataset.cat;
      state.laneFilter = state.laneFilter === cat ? null : cat;
      syncLegend();
      if (state.selectedId) renderSidebar();
      applyHighlights();
    });
  }
  syncLegend();
}

function syncLegend() {
  const selected = state.selectedId;
  const counts = new Map();
  if (selected) {
    for (const c of neighborsOf(selected)) {
      const cat = neighborCat(c, selected);
      if (cat) counts.set(cat, (counts.get(cat) || 0) + 1);
    }
  }
  for (const chip of els.legend.querySelectorAll(".legend-chip")) {
    const n = counts.get(chip.dataset.cat) || 0;
    const active = chip.dataset.cat === state.laneFilter;
    chip.classList.toggle("is-active", active);
    chip.classList.toggle("is-idle", Boolean(selected) && n === 0);
    chip.setAttribute("aria-pressed", String(active));
    const badge = chip.querySelector(".legend-count");
    if (!badge) continue;
    if (selected) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
  }
}

function renderFooter() {
  const native = state.connections.filter((c) => c.kind === "native").length;
  const platform = state.connections.filter((c) => c.kind === "platform").length;
  const optional = state.connections.filter((c) => c.kind === "optional").length;
  els.footer.innerHTML = `
    <span class="footer-stat"><strong>${state.playOrder.length}</strong> lanes</span>
    <span class="footer-stat"><strong>${state.products.length}</strong> services</span>
    <span class="footer-stat"><strong>${state.connections.length}</strong> links</span>
    ${state.connections.length ? `<span class="footer-stat"><strong>${native}</strong> native</span>
    <span class="footer-stat"><strong>${platform}</strong> platform</span>
    <span class="footer-stat"><strong>${optional}</strong> optional</span>` : `<span class="footer-stat">visual only</span>`}
  `;
  if (els.footerHint) {
    els.footerHint.textContent = isVisualOnly()
      ? "IaaS layer on top · view mapping later"
      : isOverlayView()
        ? "IaaS layer on top · click a hub for this view's tie-ins"
        : "Search services · click a hub, then a lane to filter its integrations";
  }
}

function renderViewSwitch() {
  els.viewSwitch.innerHTML = state.views
    .map((view) => {
      const active = view.id === state.viewId;
      const placeholder = view.id === "data-ai";
      return `<button type="button" class="view-tab${active ? " is-active" : ""}" data-view="${view.id}" aria-pressed="${active}">
        <span class="view-tab__label">${escapeHtml(view.label)}</span>
        <span class="view-tab__hint">${escapeHtml(view.hint)}</span>
        ${placeholder ? `<span class="view-tab__wip">WIP</span>` : ""}
      </button>`;
    })
    .join("");
  for (const btn of els.viewSwitch.querySelectorAll(".view-tab")) {
    btn.addEventListener("click", () => {
      if (btn.dataset.view !== state.viewId) switchView(btn.dataset.view);
    });
  }
}

function bindChrome() {
  if (state.chromeBound) return;
  state.chromeBound = true;
  els.reset.addEventListener("click", clearSelection);
  els.theme.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
  });
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    els.searchClear.classList.toggle("is-visible", Boolean(state.query));
    const q = state.query.trim().toLowerCase();
    if (q) {
      const n = state.products.filter((p) => matchesQuery(p, q)).length;
      els.searchCount.hidden = false;
      els.searchCount.textContent = `${n} match${n === 1 ? "" : "es"}`;
    } else {
      els.searchCount.hidden = true;
    }
    applyHighlights();
  });
  els.searchClear.addEventListener("click", () => {
    els.search.value = "";
    state.query = "";
    els.searchClear.classList.remove("is-visible");
    els.searchCount.hidden = true;
    applyHighlights();
    els.search.focus();
  });
  window.addEventListener("resize", () => layout());
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("view");
    if (id && id !== state.viewId) switchView(id, { skipHistory: true });
  });
}

async function switchView(id, { skipHistory = false } = {}) {
  const view = state.views.find((v) => v.id === id) || state.views[0];
  const [playsDoc, products, connections] = await Promise.all([
    fetch(`./${view.path}/plays.json`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`./${view.path}/products.json`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`./${view.path}/connections.json`, { cache: "no-store" }).then((r) => r.json()),
  ]);
  state.viewId = view.id;
  state.viewMeta = playsDoc.view || { id: view.id, label: view.label, mode: "mapped" };
  state.plays = playsDoc.plays;
  state.playOrder = playsDoc.playOrder;
  state.categories = playsDoc.categories;
  state.products = products;
  state.connections = connections;
  state.selectedId = null;
  state.laneFilter = null;
  if (els.metaText) els.metaText.textContent = state.viewMeta.short || view.label;

  if (!skipHistory) {
    const url = new URL(location.href);
    url.searchParams.set("view", view.id);
    history.replaceState({ view: view.id }, "", url);
  }

  renderViewSwitch();
  renderLegend();
  renderFooter();
  renderSidebar();
  layout();
}

async function load() {
  const catalog = await fetch("./data/views.json", { cache: "no-store" }).then((r) => r.json());
  state.views = catalog.views;
  bindChrome();
  const requested = new URLSearchParams(location.search).get("view");
  await switchView(requested || catalog.default || "iaas");
}

load().catch((err) => {
  els.sidebar.innerHTML = `<p class="sb-description">Could not load catalog: ${escapeHtml(err.message)}. Serve this folder over HTTP so the JSON feed can load.</p>`;
});
