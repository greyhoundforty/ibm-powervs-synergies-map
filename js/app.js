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
  const padX = 130;
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
    if (cat) {
      const label = document.createElement("div");
      label.className = "lane-label";
      label.style.top = `${top + 8}px`;
      label.textContent = cat.label;
      els.lanes.appendChild(label);
    }

    const inLane = state.products.filter((p) => p.cat === cat?.id);
    const n = inLane.length;
    
    if (n === 1) {
      positions.set(inLane[0].id, { x: width / 2, y: top + laneH / 2 + 6 });
    } else if (n === 2) {
      positions.set(inLane[0].id, { x: width * 0.34, y: top + laneH / 2 + 6 });
      positions.set(inLane[1].id, { x: width * 0.66, y: top + laneH / 2 + 6 });
    } else {
      const avail = width - padX * 2;
      const step = avail / (n - 1);
      inLane.forEach((p, idx) => {
        const x = padX + idx * step;
        const y = top + laneH / 2 + 6;
        positions.set(p.id, { x, y });
      });
    }
  });

  els.nodes.innerHTML = "";
  for (const product of state.products) {
    const pos = positions.get(product.id);
    if (!pos) continue;
    const node = document.createElement("div");
    node.className = `pnode${product.hub ? " is-hub" : ""}`;
    node.dataset.id = product.id;
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    const cat = catFor(product);
    if (cat) {
      node.style.setProperty("--node-color", playColor(cat.playId));
    }
    const titleSpan = document.createElement("span");
    titleSpan.textContent = product.label;
    node.appendChild(titleSpan);

    if (product.status === "partner") {
      const badge = document.createElement("span");
      badge.className = "partner-badge";
      badge.textContent = "Partner";
      node.appendChild(badge);
    }

    node.addEventListener("click", () => selectProduct(product.id));
    els.nodes.appendChild(node);
  }

  drawConnections(positions);
  applyHighlights();
}

function drawConnections(positions) {
  els.svg.innerHTML = "";
  const frag = document.createDocumentFragment();

  state.connections.forEach((conn, index) => {
    const p1 = positions.get(conn.from);
    const p2 = positions.get(conn.to);
    if (!p1 || !p2) return;

    const fromProd = productById(conn.from);
    const toProd = productById(conn.to);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const cy1 = p1.y + dy * 0.5;
    const cy2 = p1.y + dy * 0.5;
    const d = `M ${p1.x} ${p1.y} C ${p1.x + dx * 0.05} ${cy1}, ${p2.x - dx * 0.05} ${cy2}, ${p2.x} ${p2.y}`;

    path.setAttribute("d", d);
    path.setAttribute(
      "class",
      `conn-path is-${conn.kind}${conn.status === "partner" ? " is-partner" : ""}`
    );
    path.dataset.from = conn.from;
    path.dataset.to = conn.to;
    path.dataset.index = index;

    const dash = dashFor(conn.kind);
    if (dash) path.setAttribute("stroke-dasharray", dash);

    path.addEventListener("click", () => {
      selectProduct(conn.from);
    });

    frag.appendChild(path);
  });

  els.svg.appendChild(frag);
}

function selectProduct(id) {
  if (state.selectedId === id) {
    state.selectedId = null;
    state.laneFilter = null;
  } else {
    state.selectedId = id;
  }
  renderLegend();
  renderSidebar();
  applyHighlights();
}

function applyHighlights() {
  const selected = state.selectedId;
  const q = state.query.trim().toLowerCase();
  const relevantConns = selected ? connectionsFor(selected, state.laneFilter) : [];
  const neighborIds = new Set(
    relevantConns.flatMap((c) => [c.from, c.to]).filter((id) => id !== selected)
  );

  const nodes = els.nodes.querySelectorAll(".pnode");
  nodes.forEach((node) => {
    const id = node.dataset.id;
    const product = productById(id);
    const isSel = id === selected;
    const isNbr = neighborIds.has(id);
    const isHit = q && matchesQuery(product, q);
    const inLane = !state.laneFilter || product.cat === state.laneFilter;

    node.classList.toggle("is-selected", isSel);
    node.classList.toggle("is-neighbor", isNbr);
    node.classList.toggle("is-query-hit", Boolean(isHit));

    let dimmed = false;
    if (selected) {
      dimmed = !isSel && !isNbr;
    } else if (state.laneFilter) {
      dimmed = !inLane;
    }
    if (q && !isHit && !isSel) {
      dimmed = true;
    }

    node.classList.toggle("is-dimmed", dimmed);
  });

  const paths = els.svg.querySelectorAll(".conn-path");
  paths.forEach((path) => {
    const from = path.dataset.from;
    const to = path.dataset.to;
    const matches =
      selected &&
      ((from === selected && neighborIds.has(to)) ||
        (to === selected && neighborIds.has(from)));

    path.classList.toggle("is-lit", Boolean(matches));
    path.classList.toggle("is-dimmed", selected ? !matches : false);
  });
}

function renderSidebar() {
  const selected = state.selectedId ? productById(state.selectedId) : null;
  if (!selected) {
    els.sidebar.innerHTML = `
      <div class="sb-empty">
        <p><strong>IBM Power Virtual Server Synergies Map</strong></p>
        <p style="margin-top: 8px;">Explore how PowerVS integrates across Operating Systems, Storage Tiers, Enterprise Backups, DR Replication, Workload Migration, and IBM Cloud Platform Services.</p>
        <p style="margin-top: 12px;">Click any component node on the map to inspect its architecture details, sales positioning, discovery questions, and active integrations.</p>
      </div>
    `;
    return;
  }

  const cat = catFor(selected);
  const conns = connectionsFor(selected.id, null);

  let connsHtml = "";
  if (conns.length > 0) {
    connsHtml = `
      <div class="sb-section">
        <div class="sb-section-title">Integrations (${conns.length})</div>
        <div class="sb-connections">
          ${conns
            .map((c) => {
              const otherId = otherEnd(c, selected.id);
              const other = productById(otherId);
              const otherCat = catFor(other);
              return `
                <div class="sb-conn-card" data-target="${otherId}">
                  <div class="sb-conn-head">
                    <span class="sb-conn-name">${escapeHtml(other.label)}</span>
                    <span class="sb-conn-badge">${c.kind}</span>
                  </div>
                  <div class="sb-conn-summary">${escapeHtml(c.summary)}</div>
                  ${c.sellerNote ? `<div class="sb-conn-note">${escapeHtml(c.sellerNote)}</div>` : ""}
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  els.sidebar.innerHTML = `
    <div class="sb-category">${escapeHtml(cat?.label || "")}</div>
    <div class="sb-title">${escapeHtml(selected.label)}</div>
    <div class="sb-tags">
      <span class="play-pill"><span class="dot" style="--play-color:${playColor(cat?.playId)}"></span>${escapeHtml(cat?.label || "")}</span>
      ${selected.hub ? `<span class="play-pill">Core Hub</span>` : ""}
      ${selected.status === "partner" ? `<span class="play-pill" style="color:var(--play-4)">Partner Offering</span>` : ""}
    </div>

    <div class="sb-section">
      <div class="sb-section-title">Description</div>
      <div class="sb-description">${escapeHtml(selected.desc)}</div>
    </div>

    <div class="sb-section">
      <div class="sb-section-title">Seller Value Proposition</div>
      <div class="sb-value">${escapeHtml(selected.value)}</div>
    </div>

    ${
      selected.questions && selected.questions.length > 0
        ? `
      <div class="sb-section">
        <div class="sb-section-title">Discovery Questions</div>
        <ul class="sb-list">
          ${selected.questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}
        </ul>
      </div>
    `
        : ""
    }

    ${
      selected.differentiators && selected.differentiators.length > 0
        ? `
      <div class="sb-section">
        <div class="sb-section-title">Key Differentiators</div>
        <ul class="sb-list">
          ${selected.differentiators.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
        </ul>
      </div>
    `
        : ""
    }

    ${
      selected.competitors && selected.competitors.length > 0
        ? `
      <div class="sb-section">
        <div class="sb-section-title">Alternatives & Competitors</div>
        <ul class="sb-list">
          ${selected.competitors.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
        </ul>
      </div>
    `
        : ""
    }

    ${connsHtml}

    <div class="sb-section">
      <a class="sb-link" href="${escapeHtml(selected.docsUrl)}" target="_blank" rel="noopener noreferrer">
        <span>IBM Documentation</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2v1.5h2.44L6.97 9.03l1.06 1.06 5.47-5.47V7H15V2h-5z"/><path d="M13 13.5H3v-10h4.5V2H3a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 3 15h10a1.5 1.5 0 0 0 1.5-1.5V9h-1.5v4.5z"/></svg>
      </a>
    </div>
  `;

  els.sidebar.querySelectorAll(".sb-conn-card").forEach((card) => {
    card.addEventListener("click", () => {
      const target = card.dataset.target;
      if (target) selectProduct(target);
    });
  });
}

function renderLegend() {
  const selected = state.selectedId;
  const counts = new Map();

  if (selected) {
    const all = neighborsOf(selected);
    for (const c of all) {
      const cat = neighborCat(c, selected);
      if (cat) counts.set(cat, (counts.get(cat) || 0) + 1);
    }
  }

  els.legend.innerHTML = state.playOrder
    .map((playId) => {
      const play = state.plays[playId];
      if (!play) return "";
      const cat = play.cat;
      const count = counts.get(cat) || 0;
      const active = state.laneFilter === cat;
      return `
        <button type="button" class="legend-chip" data-cat="${cat}" aria-pressed="${active}">
          <span class="dot" style="--play-color:${playColor(play.id)}"></span>
          <span>${escapeHtml(play.name)}</span>
          ${selected ? `<span class="chip-count">${count}</span>` : ""}
        </button>
      `;
    })
    .join("");

  els.legend.querySelectorAll(".legend-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cat = chip.dataset.cat;
      state.laneFilter = state.laneFilter === cat ? null : cat;
      renderLegend();
      applyHighlights();
    });
  });
}

function renderFooter() {
  const nProd = state.products.length;
  const nConn = state.connections.length;
  const nHub = state.products.filter((p) => p.hub).length;
  els.footer.textContent = `${nProd} components · ${nHub} hubs · ${nConn} connections`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindChrome() {
  if (state.chromeBound) return;
  state.chromeBound = true;

  els.theme.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
  });

  els.reset.addEventListener("click", () => {
    state.selectedId = null;
    state.laneFilter = null;
    renderLegend();
    renderSidebar();
    applyHighlights();
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
}

async function load() {
  const [playsDoc, products, connections] = await Promise.all([
    fetch("./data/powervs/plays.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("./data/powervs/products.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("./data/powervs/connections.json", { cache: "no-store" }).then((r) => r.json()),
  ]);

  state.viewId = "powervs";
  state.viewMeta = playsDoc.view;
  state.plays = playsDoc.plays;
  state.playOrder = playsDoc.playOrder;
  state.categories = playsDoc.categories;
  state.products = products;
  state.connections = connections;
  state.selectedId = null;
  state.laneFilter = null;

  bindChrome();
  renderLegend();
  renderFooter();
  renderSidebar();
  layout();
}

load().catch((err) => {
  els.sidebar.innerHTML = `<p class="sb-description">Could not load catalog: ${escapeHtml(err.message)}. Serve this folder over HTTP so the JSON feed can load.</p>`;
});
