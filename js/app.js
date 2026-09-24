const KIND_ORDER = ["native", "platform", "optional"];

const OS_FILTERS = [
  { id: "aix",   label: "AIX" },
  { id: "ibmi",  label: "IBM i" },
  { id: "linux", label: "Linux" },
  { id: "ocp",   label: "OpenShift" },
];

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
  osFilter: null,
  chromeBound: false,
  viewMode: "grid", // "map" | "grid"
};

const els = {
  legend: document.getElementById("play-legend"),
  osFilter: document.getElementById("os-filter"),
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
  const padX = 180;  // symmetric margin — accommodates lane labels left, badges right
  const width = rect.width;
  const height = rect.height;
  const laneCount = state.playOrder.length || 1;

  // Lane 0 (hub+hw) gets extra height; remaining lanes share the rest equally.
  const hubLaneWeight = 1.6;
  const totalWeight = hubLaneWeight + (laneCount - 1);
  const baseH = height / totalWeight;
  const laneHeights = state.playOrder.map((_, i) => i === 0 ? baseH * hubLaneWeight : baseH);
  const laneTops = laneHeights.reduce((acc, h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + laneHeights[i - 1]);
    return acc;
  }, []);

  const positions = new Map();

  els.lanes.innerHTML = "";
  state.playOrder.forEach((playId, i) => {
    const top = laneTops[i];
    const laneH = laneHeights[i];
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
    const hubNode = inLane.find((p) => p.hub);
    const nonHub = inLane.filter((p) => !p.hub);
    const n = inLane.length;

    if (hubNode && nonHub.length > 0) {
      // Hub gets its own centered row at top of lane; siblings spread on a lower row.
      const yHub = top + laneH * 0.28;
      const yNodes = top + laneH * 0.72;
      positions.set(hubNode.id, { x: width / 2, y: yHub });
      const hwAvail = width - padX * 2;
      const hwStep = nonHub.length > 1 ? hwAvail / (nonHub.length - 1) : 0;
      nonHub.forEach((p, idx) => {
        const x = nonHub.length === 1 ? width / 2 : padX + idx * hwStep;
        positions.set(p.id, { x, y: yNodes });
      });
    } else if (n === 1) {
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
    node.dataset.cat = product.cat;
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
    if (product.status === "restricted") {
      const badge = document.createElement("span");
      badge.className = "restricted-badge";
      badge.textContent = "Existing clients only";
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
    const dy = p2.y - p1.y;
    // Vertical bezier: handles drop straight down from each endpoint.
    // This keeps cross-lane curves clean regardless of horizontal distance.
    const bend = Math.abs(dy) * 0.5;
    const d = `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + bend}, ${p2.x} ${p2.y - bend}, ${p2.x} ${p2.y}`;

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
    // If deselecting an OS node, also clear the implicit OS scope
    if (OS_NODE_MAP[id]) state.osFilter = null;
  } else {
    state.selectedId = id;
    // Selecting a non-OS node clears any active OS chip filter
    if (!OS_NODE_MAP[id]) state.osFilter = null;
  }
  renderLegend();
  renderOsFilter();
  renderSidebar();
  applyHighlights();
}

// Returns the OS tag implied by the selected node (e.g. "os_aix" → "aix")
const OS_NODE_MAP = { os_aix: "aix", os_ibmi: "ibmi", os_linux: "linux", os_ocp: "ocp" };

function productMatchesOs(product, osTag) {
  if (!osTag) return true;
  const os = product.os;
  if (!os || os.length === 0) return true; // agnostic — always included
  return os.includes(osTag);
}

function applyHighlights() {
  const selected = state.selectedId;
  const q = state.query.trim().toLowerCase();

  // Determine effective OS scope: explicit chip filter OR OS node selection
  const selectedOsTag = selected ? OS_NODE_MAP[selected] : null;
  const activeOs = state.osFilter || selectedOsTag || null;

  // The OS node id for the active OS (e.g. "os_aix" when activeOs = "aix")
  const OS_ID_FOR_TAG = { aix: "os_aix", ibmi: "os_ibmi", linux: "os_linux", ocp: "os_ocp" };
  const activeOsNodeId = activeOs ? OS_ID_FOR_TAG[activeOs] : null;

  // Build neighbor set from graph edges (used when no OS-node is selected)
  const graphConns = selected && !selectedOsTag
    ? connectionsFor(selected, null)
    : [];
  const graphNeighborIds = new Set(
    graphConns.flatMap((c) => [c.from, c.to]).filter((id) => id !== selected)
  );

  // When an OS node is selected or a chip is active, "neighbors" = all products
  // sharing that OS tag (excluding the OS node itself).
  // If laneFilter is also active, further restrict to that lane
  // (and also exclude powervs-cat nodes — they sit above the OS ceiling).
  const osNeighborIds = activeOs
    ? new Set(
        state.products
          .filter((p) => {
            if (p.id === selected) return false;
            if (p.cat === "powervs") return false; // above OS ceiling
            if (!productMatchesOs(p, activeOs)) return false;
            if (state.laneFilter && p.cat !== state.laneFilter) return false;
            return true;
          })
          .map((p) => p.id)
      )
    : null;

  // For graph-based selection, also apply lane filter
  const filteredGraphNeighborIds = state.laneFilter && !activeOs
    ? new Set([...graphNeighborIds].filter((id) => productById(id)?.cat === state.laneFilter))
    : graphNeighborIds;

  const neighborIds = osNeighborIds ?? filteredGraphNeighborIds;

  // Default-view edge set: only hub→hw edges shown when nothing is selected.
  // hub→os lines cross the hw row and look tangled; OS connections revealed on interaction.
  const defaultEdgePairs = new Set(
    state.connections
      .filter((c) => {
        const fromCat = productById(c.from)?.cat;
        const toCat = productById(c.to)?.cat;
        // Both ends must be powervs-cat (hub↔hw within the top lane only)
        return fromCat === "powervs" && toCat === "powervs";
      })
      .map((c) => `${c.from}::${c.to}`)
  );

  const nodes = els.nodes.querySelectorAll(".pnode");
  nodes.forEach((node) => {
    const id = node.dataset.id;
    const product = productById(id);
    const isSel = id === selected;
    const isNbr = neighborIds.has(id);
    const isHit = q && matchesQuery(product, q);
    const inLane = !state.laneFilter || product.cat === state.laneFilter;
    const inOs = !activeOs || productMatchesOs(product, activeOs);

    node.classList.toggle("is-selected", isSel);
    node.classList.toggle("is-neighbor", isNbr);
    node.classList.toggle("is-query-hit", Boolean(isHit));

    let dimmed = false;
    if (activeOs && state.laneFilter) {
      dimmed = !isSel && !isNbr;
    } else if (activeOs) {
      // OS only: show OS node + its OS-tagged peers; dim powervs-cat above it
      dimmed = !isSel && !inOs;
    } else if (selected) {
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

    let lit = false;
    let dimmed = false;

    // powervs-cat nodes are hub/hw — above the OS ceiling.
    const isRelay = (id) => productById(id)?.cat === "powervs";

    if (activeOs) {
      if (state.laneFilter) {
        // Lane + OS: a path lights if one end is a visible lane node and the
        // other end is the active OS node (the ceiling). No hub above that.
        const fromInLane = neighborIds.has(from);
        const toInLane = neighborIds.has(to);
        const fromIsOsNode = from === activeOsNodeId || from === selected;
        const toIsOsNode = to === activeOsNodeId || to === selected;
        lit = (fromInLane && toIsOsNode) || (toInLane && fromIsOsNode);
      } else {
        // OS only: light edges from the OS node to each OS-tagged peer.
        // No relay through powervs hub — lines terminate at the OS node.
        const fromIsOsNode = from === activeOsNodeId || from === selected;
        const toIsOsNode = to === activeOsNodeId || to === selected;
        const fromInOs = neighborIds.has(from);
        const toInOs = neighborIds.has(to);
        lit = (fromIsOsNode && toInOs) || (toIsOsNode && fromInOs);
      }
      dimmed = !lit;
    } else if (selected) {
      // Graph-edge mode: light all direct edges of the selected node.
      // Only suppress hub as a relay when it is NOT a direct neighbor of the selection.
      const selectedCat = productById(selected)?.cat;
      const isDirectHubEdge = (from === selected && isRelay(to)) || (to === selected && isRelay(from));
      const suppressHub = selectedCat !== "powervs" && !isDirectHubEdge;
      const fromHub = suppressHub && isRelay(from);
      const toHub = suppressHub && isRelay(to);
      lit = !fromHub && !toHub && (
        (from === selected && filteredGraphNeighborIds.has(to)) ||
        (to === selected && filteredGraphNeighborIds.has(from))
      );
      dimmed = !lit;
    } else {
      // Default idle view: only show hub→hw and hub→os edges; hide everything else.
      const edgeKey = `${from}::${to}`;
      const inDefault = defaultEdgePairs.has(edgeKey);
      if (q) {
        // Search overrides: don't hide/show based on default set
        lit = false;
        dimmed = false;
      } else {
        lit = false;
        dimmed = !inDefault;
      }
    }

    path.classList.toggle("is-lit", lit);
    path.classList.toggle("is-dimmed", dimmed);
    // Idle-visible paths: visible but not "lit" (blue). Only in default, no-selection state.
    const isIdle = !selected && !state.osFilter && !q &&
      defaultEdgePairs.has(`${from}::${to}`) && !lit && !dimmed;
    path.classList.toggle("is-idle", isIdle);
  });
}

function renderOsFilter() {
  if (!els.osFilter) return;
  els.osFilter.innerHTML = OS_FILTERS.map(({ id, label }) => {
    const active = state.osFilter === id;
    return `<button type="button" class="os-chip${active ? " is-active" : ""}" data-os="${id}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
  }).join("");

  els.osFilter.querySelectorAll(".os-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const os = chip.dataset.os;
      state.osFilter = state.osFilter === os ? null : os;
      // Clear any non-OS node selection to avoid conflicts
      if (state.selectedId && !OS_NODE_MAP[state.selectedId]) {
        state.selectedId = null;
      }
      renderOsFilter();
      renderLegend();
      renderSidebar();
      applyHighlights();
    });
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

  const OS_LABEL = { aix: "AIX", ibmi: "IBM i", linux: "Linux", ocp: "OpenShift" };
  const osTags = (selected.os || [])
    .map((o) => `<span class="play-pill os-pill os-pill--${o}">${OS_LABEL[o] || o}</span>`)
    .join("");

  els.sidebar.innerHTML = `
    <div class="sb-category">${escapeHtml(cat?.label || "")}</div>
    <div class="sb-title">${escapeHtml(selected.label)}</div>
    <div class="sb-tags">
      <span class="play-pill"><span class="dot" style="--play-color:${playColor(cat?.playId)}"></span>${escapeHtml(cat?.label || "")}</span>
      ${selected.hub ? `<span class="play-pill">Core Hub</span>` : ""}
      ${selected.status === "partner" ? `<span class="play-pill" style="color:var(--play-4)">Partner Offering</span>` : ""}
      ${selected.status === "restricted" ? `<span class="play-pill restricted-pill">⚠ Existing clients only — new deployments must use Power10 or Power11</span>` : ""}
      ${osTags}
    </div>

    <div class="sb-section">
      <div class="sb-section-title">Description</div>
      <div class="sb-description">${escapeHtml(selected.desc)}</div>
    </div>

    ${
      selected.softwareTiers && selected.softwareTiers.length > 0
        ? `
      <div class="sb-section">
        <div class="sb-section-title">
          IBM i Software Tiers (Virtual Software Tiers)
          <a class="sb-section-docs-link" href="https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-ibmi-vsw-tiers" target="_blank" rel="noopener noreferrer" title="IBM Documentation">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2v1.5h2.44L6.97 9.03l1.06 1.06 5.47-5.47V7H15V2h-5z"/><path d="M13 13.5H3v-10h4.5V2H3a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 3 15h10a1.5 1.5 0 0 0 1.5-1.5V9h-1.5v4.5z"/></svg>
          </a>
        </div>
        <table class="sb-tier-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Max vCPUs</th>
              <th>Max RAM</th>
              <th>Licensing</th>
            </tr>
          </thead>
          <tbody>
            ${selected.softwareTiers.map((t) => `
              <tr>
                <td><span class="sb-tier-badge">${escapeHtml(t.id)}</span></td>
                <td>${escapeHtml(t.maxVcpu)}</td>
                <td>${escapeHtml(t.maxRam)}</td>
                <td>${escapeHtml(t.licensing)}</td>
              </tr>
              <tr class="sb-tier-notes-row">
                <td colspan="4">${escapeHtml(t.notes)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
        : ""
    }

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
  const selectedOsTag = selected ? OS_NODE_MAP[selected] : null;
  const activeOs = state.osFilter || selectedOsTag || null;
  const counts = new Map();

  if (activeOs) {
    // Count per lane: how many products match this OS (excluding the OS nodes themselves)
    for (const p of state.products) {
      if (OS_NODE_MAP[p.id]) continue; // skip the OS nodes themselves
      if (!productMatchesOs(p, activeOs)) continue;
      counts.set(p.cat, (counts.get(p.cat) || 0) + 1);
    }
  } else if (selected) {
    const all = neighborsOf(selected);
    for (const c of all) {
      const cat = neighborCat(c, selected);
      if (cat) counts.set(cat, (counts.get(cat) || 0) + 1);
    }
  }

  const showCounts = Boolean(activeOs || selected);

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
          ${showCounts ? `<span class="chip-count">${count}</span>` : ""}
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

function renderViewSwitch() {
  if (!els.viewSwitch) return;
  const modes = [
    { id: "map",  label: "Map" },
    { id: "grid", label: "Grid" },
  ];
  els.viewSwitch.innerHTML = modes.map(({ id, label }) => {
    const active = state.viewMode === id;
    return `<button type="button" class="view-btn${active ? " is-active" : ""}" data-view="${id}" aria-pressed="${active}">${label}</button>`;
  }).join("");

  els.viewSwitch.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.viewMode = btn.dataset.view;
      renderViewSwitch();
      if (state.viewMode === "grid") {
        document.getElementById("main").classList.add("is-grid-mode");
        renderGridView();
      } else {
        document.getElementById("main").classList.remove("is-grid-mode");
        layout();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Grid view
// ---------------------------------------------------------------------------

// Categories shown as integration columns (skip powervs hub lane)
const GRID_INTEGRATION_CATS = ["storage", "backups", "replication", "migration", "cloud_services"];

function renderGridView() {
  const main = document.getElementById("main");
  // Remove old grid area if present
  let grid = document.getElementById("grid-area");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "grid-area";
    // Insert before sidebar
    const sidebar = document.getElementById("sidebar");
    main.insertBefore(grid, sidebar);
  }
  grid.innerHTML = "";

  // --- Left: OS column ---
  const osCol = document.createElement("div");
  osCol.className = "grid-os-col";

  const osHeading = document.createElement("div");
  osHeading.className = "grid-col-heading";
  osHeading.textContent = "Operating System";
  osCol.appendChild(osHeading);

  const osBody = document.createElement("div");
  osBody.className = "grid-os-body";

  const ALL_OS = [
    { id: "aix",   label: "AIX",       color: "#3ddbd9" },
    { id: "ibmi",  label: "IBM i",     color: "#4589ff" },
    { id: "linux", label: "Linux",     color: "#42be65" },
    { id: "ocp",   label: "OpenShift", color: "#ff832b" },
  ];

  ALL_OS.forEach(({ id, label, color }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "grid-os-btn";
    btn.dataset.os = id;
    btn.style.setProperty("--os-color", color);
    btn.setAttribute("aria-pressed", state.osFilter === id ? "true" : "false");
    if (state.osFilter === id) btn.classList.add("is-active");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.osFilter = state.osFilter === id ? null : id;
      state.selectedId = null;
      applyGridHighlights();
      // Sync the OS chips in the header bar too
      renderOsFilter();
    });
    osBody.appendChild(btn);
  });

  osCol.appendChild(osBody);
  grid.appendChild(osCol);

  // --- Right: integration columns ---
  const integCols = document.createElement("div");
  integCols.className = "grid-integ-cols";

  GRID_INTEGRATION_CATS.forEach((catId) => {
    const cat = state.categories.find((c) => c.id === catId);
    if (!cat) return;
    const play = Object.values(state.plays).find((p) => p.cat === catId);
    const products = state.products.filter((p) => p.cat === catId);
    if (products.length === 0) return;

    const col = document.createElement("div");
    col.className = "grid-cat-col";
    col.dataset.cat = catId;

    const heading = document.createElement("div");
    heading.className = "grid-col-heading";
    if (play) {
      heading.style.setProperty("--col-color", `var(--play-${play.id})`);
    }
    heading.innerHTML = `<span class="grid-col-dot" style="background:var(--col-color)"></span>${escapeHtml(cat.label)}`;
    col.appendChild(heading);

    const body = document.createElement("div");
    body.className = "grid-col-body";

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "grid-card";
      card.dataset.id = product.id;
      card.dataset.cat = catId;
      if (play) card.style.setProperty("--card-color", `var(--play-${play.id})`);

      const name = document.createElement("div");
      name.className = "grid-card-name";
      name.textContent = product.label;
      card.appendChild(name);

      if (product.status === "partner") {
        const badge = document.createElement("span");
        badge.className = "grid-card-badge";
        badge.textContent = "Partner";
        card.appendChild(badge);
      }
      if (product.status === "restricted") {
        const badge = document.createElement("span");
        badge.className = "grid-card-badge is-restricted";
        badge.textContent = "Existing clients";
        card.appendChild(badge);
      }

      // Show which OSes this card supports as mini pills
      if (product.os && product.os.length > 0) {
        const osPills = document.createElement("div");
        osPills.className = "grid-card-os";
        const OS_COLOR = { aix: "#3ddbd9", ibmi: "#4589ff", linux: "#42be65", ocp: "#ff832b" };
        const OS_SHORT = { aix: "AIX", ibmi: "i", linux: "Lin", ocp: "OCP" };
        product.os.forEach((o) => {
          const pip = document.createElement("span");
          pip.className = "grid-card-os-pip";
          pip.style.color = OS_COLOR[o] || "currentColor";
          pip.style.borderColor = OS_COLOR[o] || "currentColor";
          pip.textContent = OS_SHORT[o] || o;
          osPills.appendChild(pip);
        });
        card.appendChild(osPills);
      }

      card.addEventListener("click", () => selectProduct(product.id));
      body.appendChild(card);
    });

    col.appendChild(body);
    integCols.appendChild(col);
  });

  grid.appendChild(integCols);
  applyGridHighlights();
}

function applyGridHighlights() {
  const grid = document.getElementById("grid-area");
  if (!grid) return;

  const activeOs = state.osFilter;

  // Update OS button pressed states
  grid.querySelectorAll(".grid-os-btn").forEach((btn) => {
    const active = btn.dataset.os === activeOs;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  // Update card highlight states
  grid.querySelectorAll(".grid-card").forEach((card) => {
    const id = card.dataset.id;
    const product = productById(id);
    if (!product) return;

    const matches = !activeOs || productMatchesOs(product, activeOs);
    card.classList.toggle("is-highlighted", Boolean(activeOs && matches));
    card.classList.toggle("is-dimmed", Boolean(activeOs && !matches));
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
    state.osFilter = null;
    renderLegend();
    renderOsFilter();
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

  window.addEventListener("resize", () => {
    if (state.viewMode === "map") layout();
  });
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
  renderViewSwitch();
  renderLegend();
  renderOsFilter();
  renderFooter();
  renderSidebar();
  // Default view is grid; map is rendered on demand when switching to it
  document.getElementById("main").classList.add("is-grid-mode");
  renderGridView();
}

load().catch((err) => {
  els.sidebar.innerHTML = `<p class="sb-description">Could not load catalog: ${escapeHtml(err.message)}. Serve this folder over HTTP so the JSON feed can load.</p>`;
});
