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
  viewMode: "grid", // "network" | "grid" | "matrix" | "availability"
  // Network view state
  netSelected: null,   // id of selected node in network view
  // Matrix view state
  matrixOs: null,      // selected OS id in matrix view
  // Availability view state
  availSystems: null,  // parsed available-systems.json
  availFilter: null,   // selected machine type id, or null = all
};

const els = {
  legend: document.getElementById("play-legend"),
  osFilter: document.getElementById("os-filter"),
  sidebar: document.getElementById("sidebar-inner"),
  reset: document.getElementById("reset-btn"),
  search: document.getElementById("search"),
  searchClear: document.getElementById("search-clear"),
  searchCount: document.getElementById("search-count"),
  footer: document.getElementById("footer-stats"),
  footerHint: document.getElementById("footer-hint"),
  theme: document.getElementById("theme-btn"),
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

function selectProduct(id) {
  if (state.selectedId === id) {
    state.selectedId = null;
    state.laneFilter = null;
    if (OS_NODE_MAP[id]) state.osFilter = null;
  } else {
    state.selectedId = id;
    if (!OS_NODE_MAP[id]) state.osFilter = null;
  }
  renderLegend();
  renderOsFilter();
  renderSidebar();
  if (state.viewMode === "grid") applyGridHighlights();
}

// Returns the OS tag implied by the selected node (e.g. "os_aix" → "aix")
const OS_NODE_MAP = { os_aix: "aix", os_ibmi: "ibmi", os_linux: "linux", os_ocp: "ocp" };

function productMatchesOs(product, osTag) {
  if (!osTag) return true;
  const os = product.os;
  if (!os || os.length === 0) return true; // agnostic — always included
  return os.includes(osTag);
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
      if (state.selectedId && !OS_NODE_MAP[state.selectedId]) {
        state.selectedId = null;
      }
      renderOsFilter();
      renderLegend();
      renderSidebar();
      if (state.viewMode === "grid") applyGridHighlights();
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
      selected.supportedVersions && selected.supportedVersions.length > 0
        ? `
      <div class="sb-section">
        <div class="sb-section-title">
          Supported Versions
          <a class="sb-section-docs-link" href="${escapeHtml(selected.docsUrl)}" target="_blank" rel="noopener noreferrer" title="IBM Documentation">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2v1.5h2.44L6.97 9.03l1.06 1.06 5.47-5.47V7H15V2h-5z"/><path d="M13 13.5H3v-10h4.5V2H3a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 3 15h10a1.5 1.5 0 0 0 1.5-1.5V9h-1.5v4.5z"/></svg>
          </a>
        </div>
        <table class="sb-tier-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Min TL / TR</th>
              <th>Hardware</th>
              <th>Stock Image</th>
            </tr>
          </thead>
          <tbody>
            ${selected.supportedVersions.map((v) => `
              <tr>
                <td><span class="sb-tier-badge sb-version-badge">${escapeHtml(v.version)}</span></td>
                <td>${escapeHtml(v.tls)}</td>
                <td style="font-size:11px">${escapeHtml(v.hardware)}</td>
                <td>${v.stockImage ? '<span class="sb-version-yes">✓ Yes</span>' : '<span class="sb-version-no">BYOL</span>'}</td>
              </tr>
              <tr class="sb-tier-notes-row">
                <td colspan="4">${escapeHtml(v.notes)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
        : ""
    }

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
      if (state.viewMode === "grid") applyGridHighlights();
    });
  });
}

const VALID_VIEWS = new Set(["grid", "matrix", "network", "availability"]);

// Shared function that switches the active view, updates the URL hash,
// and re-renders. Safe to call before or after load().
function switchToView(viewId) {
  if (!VALID_VIEWS.has(viewId)) viewId = "grid";
  if (state.viewMode === viewId) return;
  state.viewMode = viewId;

  // Update hash without adding a browser history entry
  history.replaceState(null, "", `#${viewId === "grid" ? "" : viewId}`);

  const main = document.getElementById("main");
  renderViewSwitch();
  // Tear down previous view area
  ["grid-area", "network-area", "matrix-area", "avail-area"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  main.classList.remove("is-grid-mode", "is-network-mode", "is-matrix-mode", "is-avail-mode");
  document.getElementById("sidebar").classList.remove("is-open");
  if (viewId === "grid") {
    main.classList.add("is-grid-mode");
    renderGridView();
  } else if (viewId === "matrix") {
    main.classList.add("is-matrix-mode");
    renderMatrixView();
  } else if (viewId === "availability") {
    main.classList.add("is-avail-mode");
    renderAvailabilityView();
  } else {
    main.classList.add("is-network-mode");
    renderNetworkView();
  }
}

function renderViewSwitch() {
  if (!els.viewSwitch) return;
  const modes = [
    { id: "grid",         label: "Grid"         },
    { id: "matrix",       label: "OS Matrix"    },
    { id: "network",      label: "Network"      },
    { id: "availability", label: "Availability" },
  ];
  els.viewSwitch.innerHTML = modes.map(({ id, label }) => {
    const active = state.viewMode === id;
    return `<button type="button" class="view-btn${active ? " is-active" : ""}" data-view="${id}" aria-pressed="${active}">${label}</button>`;
  }).join("");

  els.viewSwitch.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchToView(btn.dataset.view));
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
    { id: "aix",   label: "AIX",       color: "#3ddbd9", nodeId: "os_aix"   },
    { id: "ibmi",  label: "IBM i",     color: "#4589ff", nodeId: "os_ibmi"  },
    { id: "linux", label: "Linux",     color: "#42be65", nodeId: "os_linux" },
    { id: "ocp",   label: "OpenShift", color: "#ff832b", nodeId: "os_ocp"   },
  ];

  ALL_OS.forEach(({ id, label, color, nodeId }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "grid-os-btn";
    btn.dataset.os = id;
    btn.style.setProperty("--os-color", color);
    btn.setAttribute("aria-pressed", state.osFilter === id ? "true" : "false");
    if (state.osFilter === id) btn.classList.add("is-active");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const toggling = state.osFilter === id;
      state.osFilter = toggling ? null : id;
      // Select the OS product node to open its detail in the sidebar
      state.selectedId = toggling ? null : nodeId;
      applyGridHighlights();
      renderSidebar();
      // Show/hide sidebar panel based on selection
      document.getElementById("sidebar").classList.toggle("is-open", !toggling);
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

      card.addEventListener("click", () => {
        selectProduct(product.id);
        document.getElementById("sidebar").classList.add("is-open");
      });
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
  const q = state.query ? state.query.trim().toLowerCase() : "";

  // When searching, find matched products and collect the OSes they support
  let queryMatchIds = null;
  let queryMatchOses = null;
  if (q) {
    const matched = state.products.filter((p) => matchesQuery(p, q));
    queryMatchIds = new Set(matched.map((p) => p.id));
    queryMatchOses = new Set(matched.flatMap((p) => p.os || []));
  }

  // Update OS button highlight states
  grid.querySelectorAll(".grid-os-btn").forEach((btn) => {
    const osId = btn.dataset.os;
    // Active = toggled on via click
    const isActive = osId === activeOs;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    // Query hit = one of the matched products supports this OS
    const isQueryHit = Boolean(q && queryMatchOses && queryMatchOses.has(osId));
    btn.classList.toggle("is-query-hit", isQueryHit);
    btn.classList.toggle("is-dimmed", Boolean(q && !isQueryHit));
  });

  // Update card highlight states
  grid.querySelectorAll(".grid-card").forEach((card) => {
    const id = card.dataset.id;
    const product = productById(id);
    if (!product) return;

    if (q) {
      // Search mode: highlight matched cards, dim everything else
      const isHit = queryMatchIds.has(id);
      card.classList.toggle("is-highlighted", isHit);
      card.classList.toggle("is-dimmed", !isHit);
      card.classList.toggle("is-query-hit", isHit);
    } else {
      // OS filter mode (or idle)
      card.classList.remove("is-query-hit");
      const matches = !activeOs || productMatchesOs(product, activeOs);
      card.classList.toggle("is-highlighted", Boolean(activeOs && matches));
      card.classList.toggle("is-dimmed", Boolean(activeOs && !matches));
    }
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
    state.netSelected = null;
    renderLegend();
    renderOsFilter();
    renderSidebar();
    document.getElementById("sidebar").classList.remove("is-open");
    if (state.viewMode === "grid") applyGridHighlights();
    if (state.viewMode === "network") applyNetworkHighlights();
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
    if (state.viewMode === "grid") applyGridHighlights();
  });

  els.searchClear.addEventListener("click", () => {
    els.search.value = "";
    state.query = "";
    els.searchClear.classList.remove("is-visible");
    els.searchCount.hidden = true;
    if (state.viewMode === "grid") applyGridHighlights();
    els.search.focus();
  });
}

// ---------------------------------------------------------------------------
// Matrix view — OS × Integration columns, no lines
// ---------------------------------------------------------------------------
//
// Full-width view. Left column = OS selectors. Right = integration categories
// rendered as columns of cards. Clicking an OS highlights supported cards and
// dims unsupported ones. No sidebar, no lines — pure visual matrix.
// ---------------------------------------------------------------------------

const MATRIX_OS = [
  { id: "aix",   label: "AIX",       color: "#3ddbd9" },
  { id: "ibmi",  label: "IBM i",     color: "#4589ff" },
  { id: "linux", label: "Linux",     color: "#42be65" },
  { id: "ocp",   label: "OpenShift", color: "#ff832b" },
];

function renderMatrixView() {
  const main = document.getElementById("main");
  let area = document.getElementById("matrix-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "matrix-area";
    const sidebar = document.getElementById("sidebar");
    main.insertBefore(area, sidebar);
  }
  area.innerHTML = "";

  // --- Left: OS selector column ---
  const osCol = document.createElement("div");
  osCol.className = "matrix-os-col";

  const osHeading = document.createElement("div");
  osHeading.className = "matrix-col-heading";
  osHeading.textContent = "Operating System";
  osCol.appendChild(osHeading);

  const osBody = document.createElement("div");
  osBody.className = "matrix-os-body";

  MATRIX_OS.forEach(({ id, label, color }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "matrix-os-btn";
    btn.dataset.os = id;
    btn.style.setProperty("--os-color", color);
    if (state.matrixOs === id) btn.classList.add("is-active");
    btn.setAttribute("aria-pressed", state.matrixOs === id ? "true" : "false");

    const swatch = document.createElement("span");
    swatch.className = "matrix-os-swatch";
    btn.appendChild(swatch);

    const text = document.createElement("span");
    text.textContent = label;
    btn.appendChild(text);

    const count = document.createElement("span");
    count.className = "matrix-os-count";
    const n = state.products.filter(
      (p) => GRID_INTEGRATION_CATS.includes(p.cat) && productMatchesOs(p, id) && (p.os && p.os.length > 0)
    ).length;
    count.textContent = n;
    btn.appendChild(count);

    btn.addEventListener("click", () => {
      state.matrixOs = state.matrixOs === id ? null : id;
      applyMatrixHighlights();
    });
    osBody.appendChild(btn);
  });

  osCol.appendChild(osBody);
  area.appendChild(osCol);

  // --- Right: integration columns ---
  const integCols = document.createElement("div");
  integCols.className = "matrix-integ-cols";

  GRID_INTEGRATION_CATS.forEach((catId) => {
    const cat = state.categories.find((c) => c.id === catId);
    if (!cat) return;
    const play = Object.values(state.plays).find((p) => p.cat === catId);
    const products = state.products.filter((p) => p.cat === catId);
    if (products.length === 0) return;

    const col = document.createElement("div");
    col.className = "matrix-cat-col";
    col.dataset.cat = catId;

    const heading = document.createElement("div");
    heading.className = "matrix-col-heading";
    if (play) heading.style.setProperty("--col-color", `var(--play-${play.id})`);
    heading.innerHTML = `<span class="matrix-col-dot" style="background:var(--col-color)"></span>${escapeHtml(cat.label)}`;
    col.appendChild(heading);

    const body = document.createElement("div");
    body.className = "matrix-col-body";

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "matrix-card";
      card.dataset.id = product.id;
      if (play) card.style.setProperty("--card-color", `var(--play-${play.id})`);

      const name = document.createElement("div");
      name.className = "matrix-card-name";
      name.textContent = product.label;
      card.appendChild(name);

      // OS support pips
      if (product.os && product.os.length > 0) {
        const osPips = document.createElement("div");
        osPips.className = "matrix-card-os";
        const OS_COLOR = { aix: "#3ddbd9", ibmi: "#4589ff", linux: "#42be65", ocp: "#ff832b" };
        const OS_SHORT = { aix: "AIX", ibmi: "i", linux: "Lin", ocp: "OCP" };
        product.os.forEach((o) => {
          const pip = document.createElement("span");
          pip.className = "matrix-card-os-pip";
          pip.style.color = OS_COLOR[o] || "currentColor";
          pip.style.borderColor = OS_COLOR[o] || "currentColor";
          pip.dataset.os = o;
          pip.textContent = OS_SHORT[o] || o;
          osPips.appendChild(pip);
        });
        card.appendChild(osPips);
      }

      body.appendChild(card);
    });

    col.appendChild(body);
    integCols.appendChild(col);
  });

  area.appendChild(integCols);
  applyMatrixHighlights();
}

function applyMatrixHighlights() {
  const area = document.getElementById("matrix-area");
  if (!area) return;

  const activeOs = state.matrixOs;

  // Update OS button states
  area.querySelectorAll(".matrix-os-btn").forEach((btn) => {
    const isActive = btn.dataset.os === activeOs;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  // Update card highlight states
  area.querySelectorAll(".matrix-card").forEach((card) => {
    const id = card.dataset.id;
    const product = productById(id);
    if (!product) return;
    const matches = !activeOs || productMatchesOs(product, activeOs);
    card.classList.toggle("is-highlighted", Boolean(activeOs && matches));
    card.classList.toggle("is-dimmed", Boolean(activeOs && !matches));
  });

  // Highlight matching OS pips on cards
  area.querySelectorAll(".matrix-card-os-pip").forEach((pip) => {
    pip.classList.toggle("is-active-os", pip.dataset.os === activeOs);
  });
}

// ---------------------------------------------------------------------------
// Network view — PowerVS connectivity topology
// ---------------------------------------------------------------------------
//
// Self-contained layered diagram. Data does NOT come from products.json —
// this topology is specific to the network path view. Rows flow top-to-bottom:
//   Row 0 — Workload anchor (PowerVS workspace + built-in Juniper vSRX ports)
//   Row 1 — Connection intent  (Secure / Public)
//   Row 2 — Entry mechanisms   (Direct Link, VPN, Classic GW, Firewall,
//                               VPC Public Gateway, VPC NLB Routing Mode)
//   Row 3 — Routing & gateway  (TGW, VPC Route Tables)
//   Row 4 — Security controls, split by plane:
//             VPC plane  — VPC Network ACLs, VPC Security Groups
//             PowerVS plane — PowerVS NSGs
//
// Clicking a node highlights it + all ancestors and descendants in the path.
// ---------------------------------------------------------------------------

const NET_NODES = [
  // Row 0 — anchor
  {
    id: "pvs", row: 0, label: "PowerVS Workload", icon: "⬡", color: "#0f62fe",
    sub: "IBM Power Virtual Server workspace",
    desc: "Your AIX, IBM i, Linux, or OpenShift workload running inside an IBM Power Virtual Server workspace. " +
          "VLAN isolation between tenants is enforced at the Virtual I/O Server (VIOS) and physical switch/router layer. " +
          "A Juniper vSRX firewall sits at the PowerVS network edge with the following ports open by default: " +
          "22 (SSH), 443 (HTTPS), 992 (IBM i 5250 SSL), ICMP, and IBM i LPAR ports 2005/2007/2010/2012/9470/9475/9476. " +
          "Port 6443 is also open (except WDC04 and DAL13). Extra ports require a customer-managed firewall connected via Direct Link Connect.",
    docsUrl: "https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-network-architecture-diagrams",
  },

  // Row 1 — intent
  {
    id: "secure", row: 1, label: "Secure Connections", icon: "🔒", color: "#007d79",
    sub: "Private / dedicated path",
    desc: "Private, encrypted, or dedicated connectivity to PowerVS. " +
          "Includes IBM Cloud Direct Link (dedicated private WAN bypassing the internet entirely), " +
          "VPC site-to-site VPN (IPSec-encrypted tunnel over the internet), " +
          "Classic Network Gateway appliances (Juniper vSRX / FortiGate / ASAv), " +
          "and VPC-hosted firewall / proxy appliances (Palo Alto VM-Series, Fortinet, Check Point). " +
          "Note: Classic Network Gateway and VPC Firewall / Proxy are dual-purpose — they also handle " +
          "public internet (HTTP/HTTPS/IBM i ports) north-south traffic and appear under Public Connections too. " +
          "All secure paths route through Transit Gateway into the PowerVS workspace.",
  },
  {
    id: "public", row: 1, label: "Public Connections", icon: "🌐", color: "#ff832b",
    sub: "Internet-facing path",
    desc: "Internet connectivity for PowerVS instances is not direct — PowerVS does not support attaching public subnets " +
          "directly to an LPAR. Instead, VPC infrastructure is used as the internet on-ramp. " +
          "Outbound traffic flows: PowerVS → TGW → VPC → NLB (routing mode) → Public Gateway → internet. " +
          "Inbound traffic flows: internet → Public Address Range → VPC routing table → NLB → TGW → PowerVS. " +
          "VPC Security Groups on the NLB control what traffic is permitted in both directions.",
    docsUrl: "https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup",
  },

  // Row 2 — entry mechanism (secure branch)
  {
    id: "direct_link", row: 2, label: "IBM Cloud Direct Link 2.0", icon: "⇌", color: "#007d79",
    sub: "Dedicated private WAN",
    desc: "A dedicated, private, high-bandwidth connection between your on-premises network and IBM Cloud. " +
          "Available in Connect (via network provider), Dedicated (your own cross-connect), and Dedicated Hosting flavors. " +
          "Bypasses the public internet entirely — the only path that satisfies strict data-residency or regulatory requirements. " +
          "Requires Transit Gateway on the IBM Cloud side to route into the PowerVS workspace. " +
          "If you need ports beyond the default PowerVS firewall set, use a customer Vyatta/vSRX/FortiGate firewall connected via Direct Link Connect.",
    docsUrl: "https://cloud.ibm.com/docs/dl?topic=dl-getting-started",
  },
  {
    id: "vpc_vpn", row: 2, label: "VPC VPN (Site-to-Site)", icon: "⊕", color: "#007d79",
    sub: "IPSec tunnel over internet",
    desc: "IPSec site-to-site tunnels between your on-premises gateway and an IBM Cloud VPC VPN Gateway. " +
          "Traffic is encrypted over the public internet. Lower cost than Direct Link but with higher latency and shared bandwidth. " +
          "Requires Transit Gateway to route traffic from the VPC VPN termination point into the PowerVS workspace. " +
          "Route Tables in the VPC direct post-VPN traffic toward the TGW. " +
          "Typical use: smaller workloads, dev/test environments, or as a redundant backup alongside Direct Link.",
    docsUrl: "https://cloud.ibm.com/docs/vpc?topic=vpc-vpn-overview",
  },
  {
    id: "classic_gw", row: 2, label: "Classic Network Gateway", icon: "⇒", color: "#6929c4",
    sub: "Secure + Public · Classic infrastructure gateway appliance",
    desc: "IBM Cloud Classic Infrastructure Gateway appliances — Juniper vSRX, Fortinet vFSA, or Cisco ASAv — providing " +
          "stateful firewall, NAT, and routing at the Classic network edge. " +
          "Serves both secure (private WAN) and public internet traffic: the appliance can front public ports (HTTP/HTTPS, IBM i 5250, SSH) " +
          "as well as terminate private connectivity from on-premises networks via Direct Link Connect. " +
          "Used when a PowerVS workspace is connected to Classic Infrastructure via a classic link rather than directly into VPC. " +
          "The gateway provides full custom port flexibility beyond the fixed default PowerVS firewall ports, " +
          "including any ports required by IBM i LPARs or custom applications.",
    docsUrl: "https://cloud.ibm.com/docs/gateway-appliance?topic=gateway-appliance-getting-started",
  },
  {
    id: "vpc_fw", row: 2, label: "VPC Firewall / Proxy", icon: "🛡", color: "#6929c4",
    sub: "Secure + Public · Virtual network function in transit VPC",
    desc: "A virtual firewall or proxy appliance (VNF) deployed in a transit VPC handles both secure and public internet traffic. " +
          "For public north-south traffic: internet traffic enters via a Floating IP on the firewall's untrust interface, " +
          "is inspected and NAT'd, then exits through a Public Gateway on the outside subnet. " +
          "Flow: Internet → FIP → PA untrust NIC → PA trust NIC → TGW → PowerVS. " +
          "For private/secure traffic: on-premises traffic arrives via Direct Link or VPN and is inspected before routing to PowerVS. " +
          "East-west traffic between spoke VPCs bypasses the firewall and is secured by VPC Security Groups and Network ACLs. " +
          "Options include Palo Alto VM-Series (single or HA pair with NLB route mode), Fortinet FortiGate, Check Point CloudGuard. " +
          "HA: Two firewall VSIs fronted by an NLB in route mode provide active/active redundancy with sub-second failover. " +
          "IBM Cloud VPC fabric constraint: only TCP/UDP/ICMP are supported — ESP/AH/GRE/VRRP/OSPF are dropped; IPsec requires NAT-T (UDP 4500).",
    docsUrl: "https://cloud.ibm.com/docs/vpc?topic=vpc-about-vnf",
  },

  // Row 2 — entry mechanism (public branch)
  {
    id: "managed_public", row: 2, label: "Managed Public Network", icon: "⊙", color: "#ff832b",
    sub: "Per-instance public VLAN · IBM-managed Juniper vSRX",
    desc: "Enable a public network directly on the PowerVS instance at provisioning time using the 'Public networks' toggle " +
          "(visible in Network interfaces during instance creation). " +
          "IBM attaches a public VLAN to the instance and routes traffic through an IBM-managed Juniper vSRX firewall. " +
          "No Transit Gateway, VPC, or NLB is required — this is the simplest public option. " +
          "Fixed firewall ports open inbound: 22 (SSH), 443 (HTTPS), 992 (IBM i 5250 SSL), ICMP. " +
          "Additional IBM i LPAR ports open: 2005, 2007, 2010, 2012, 9470, 9475, 9476. " +
          "Port 6443 is open in most data centers (not WDC04 or DAL13). " +
          "The port set is fixed — extra ports require a customer-managed firewall appliance connected via Direct Link Connect instead.",
    docsUrl: "https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-network-security",
  },
  {
    id: "public_gw", row: 2, label: "VPC Public Gateway", icon: "↗", color: "#ff832b",
    sub: "VPC outbound-only public egress",
    desc: "A Public Gateway attached to a VPC subnet provides outbound-only public internet access for the VPC/NLB-based public path. " +
          "No inbound connections are permitted through a Public Gateway — only return traffic for outbound-initiated flows. " +
          "For PowerVS outbound internet: the LPAR sends traffic to its default gateway → TGW → VPC → NLB (routing mode) → Public Gateway → internet. " +
          "The NLB in routing mode acts as the routing gateway between the TGW and the public-gateway-attached subnet.",
    docsUrl: "https://cloud.ibm.com/docs/vpc?topic=vpc-about-networking-for-vpc#public-gateway-for-external-connectivity",
  },
  {
    id: "vpc_nlb", row: 2, label: "VPC NLB (Routing Mode)", icon: "⇅", color: "#ff832b",
    sub: "Network load balancer as routing gateway",
    desc: "A private Network Load Balancer configured in routing mode (VNF routing mode) acts as the internet on-ramp for PowerVS. " +
          "For outbound: the VPC routing table directs TGW-arriving traffic to the NLB, which forwards it through the Public Gateway subnet to the internet. " +
          "For inbound: internet traffic for a bound Public Address Range arrives at the NLB's private IP via a VPC ingress routing table, " +
          "and the NLB forwards it through the TGW to the PowerVS workspace. " +
          "VPC Security Groups attached to the NLB are the primary inbound/outbound traffic filter for the public path — " +
          "configure them to allow only the required TCP/UDP ports. Note: PowerVS does not support NAT; the public IP must be configured as a secondary interface inside the guest OS.",
    docsUrl: "https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup",
  },

  // Row 3 — routing & gateway
  {
    id: "tgw", row: 3, label: "Transit Gateway", icon: "⬡", color: "#6929c4",
    sub: "Hub-and-spoke network fabric",
    desc: "IBM Cloud Transit Gateway connects VPCs, PowerVS workspaces, and Classic Infrastructure " +
          "across regions using a hub-and-spoke model. Required for any path between a VPC and a PowerVS workspace. " +
          "Connections can be local (same region, no extra charge) or global (cross-region). " +
          "GRE enhanced route propagation should be disabled when used with public connectivity. " +
          "Every secure path (Direct Link, VPN, Classic GW, VPC Firewall) and every public path " +
          "(outbound via Public Gateway, inbound via NLB) require a Transit Gateway.",
    docsUrl: "https://cloud.ibm.com/docs/transit-gateway?topic=transit-gateway-getting-started",
  },
  {
    id: "route_tables", row: 3, label: "VPC Route Tables", icon: "⇢", color: "#6929c4",
    sub: "VPC traffic steering rules",
    desc: "Custom VPC route tables control how traffic is directed within a VPC. " +
          "For outbound public traffic: a routing table with Transit Gateway as traffic source advertises PowerVS CIDR routes; " +
          "a default route (0.0.0.0/0) pointing to the NLB's private IP steers internet-bound traffic to the NLB. " +
          "For inbound public traffic: a separate ingress routing table (traffic source = Internet) routes the bound Public Address Range to the NLB. " +
          "For VPN: route tables steer post-VPN traffic toward the TGW. " +
          "Advertise flag must be set to On for routes that need to be visible across the TGW to PowerVS.",
    docsUrl: "https://cloud.ibm.com/docs/vpc?topic=vpc-about-custom-routes",
  },

  // Row 4 — security controls (VPC plane)
  {
    id: "vpc_nacl", row: 4, label: "VPC Network ACLs", icon: "≡", color: "#9f1853",
    sub: "VPC · subnet-level · stateless",
    desc: "VPC Network Access Control Lists (NACLs) are stateless subnet-level firewalls. " +
          "Every VPC subnet has exactly one ACL; the default ACL allows all inbound and outbound traffic. " +
          "Rules are evaluated in priority order (lowest number first); unmatched traffic is implicitly denied. " +
          "Because NACLs are stateless, you must define explicit rules for both directions of any allowed flow — " +
          "e.g. both the outbound TCP SYN and the inbound TCP SYN-ACK for a connection. " +
          "Use NACLs as a coarse perimeter defence at the subnet boundary, and Security Groups for fine-grained instance-level control.",
    docsUrl: "https://cloud.ibm.com/docs/vpc?topic=vpc-using-acls",
  },
  {
    id: "vpc_sg", row: 4, label: "VPC Security Groups", icon: "🔐", color: "#9f1853",
    sub: "VPC · instance / NLB / VPN · stateful",
    desc: "VPC Security Groups are stateful, instance-level firewalls attached to VPC resources: " +
          "virtual server network interfaces, NLBs, VPN gateways, and endpoint gateways. " +
          "Rules are allow-only — unmatched traffic is denied by default. Because they are stateful, " +
          "a single inbound rule automatically permits the corresponding return traffic. " +
          "Security groups can reference other security groups as sources, enabling micro-segmentation. " +
          "In the PowerVS public connectivity pattern, Security Groups on the NLB are the primary control point " +
          "for which ports (e.g. 22, 443) are permitted from the internet to the PowerVS instance. " +
          "Multiple security groups can be attached to a single resource; rules are unioned (least-restrictive wins).",
    docsUrl: "https://cloud.ibm.com/docs/vpc?topic=vpc-using-security-groups",
  },

  // Row 4 — security controls (PowerVS plane)
  {
    id: "pvs_nsg", row: 4, label: "PowerVS NSGs", icon: "⬧", color: "#6929c4",
    sub: "PowerVS · NIC-level · inbound deny-by-default",
    desc: "PowerVS Network Security Groups (NSGs) are native to the PowerVS network plane — distinct from VPC Security Groups. " +
          "They control inbound traffic at the network interface (NIC) level within a PER-enabled PowerVS workspace. " +
          "All outbound traffic is automatically permitted. Inbound traffic is denied by default unless an explicit allow rule matches. " +
          "Deny rules are evaluated first and take highest precedence; allow rules are evaluated after. " +
          "Traffic is matched against Network Address Groups (NAGs) — custom named CIDR collections — rather than raw IPs, " +
          "and matches the most specific CIDR first. The default NAG (0.0.0.0/0) is bypassed if a more specific custom NAG matches. " +
          "NSGs are available at no extra cost, require PER-enabled workspaces (CRN-based metering), " +
          "and are supported on AIX, IBM i, Linux, and OpenShift workloads.",
    docsUrl: "https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-nsg",
  },
];

// Which nodes are children of which (determines highlight propagation)
const NET_EDGES = [
  // pvs → intent
  { from: "pvs",         to: "secure"      },
  { from: "pvs",         to: "public"      },
  // secure → entry
  { from: "secure",      to: "direct_link" },
  { from: "secure",      to: "vpc_vpn"     },
  { from: "secure",      to: "classic_gw"  },
  { from: "secure",      to: "vpc_fw"      },
  // public → entry
  // classic_gw and vpc_fw serve BOTH secure and public — also reachable from public intent
  { from: "public",      to: "managed_public" },
  { from: "public",      to: "classic_gw"     },
  { from: "public",      to: "vpc_fw"         },
  { from: "public",      to: "public_gw"      },
  { from: "public",      to: "vpc_nlb"        },
  // managed public → PowerVS NSG only (no VPC layer; vSRX is IBM-managed)
  { from: "managed_public", to: "pvs_nsg"     },
  // entry → routing
  { from: "direct_link", to: "tgw"         },
  { from: "direct_link", to: "route_tables"},
  { from: "vpc_vpn",     to: "tgw"         },
  { from: "vpc_vpn",     to: "route_tables"},
  { from: "classic_gw",  to: "tgw"         },
  { from: "classic_gw",  to: "route_tables"},
  { from: "vpc_fw",      to: "tgw"         },
  { from: "vpc_fw",      to: "route_tables"},
  { from: "public_gw",   to: "tgw"         },
  { from: "public_gw",   to: "route_tables"},
  { from: "vpc_nlb",     to: "tgw"         },
  { from: "vpc_nlb",     to: "route_tables"},
  { from: "vpc_nlb",     to: "public_gw"   },
  // routing → security controls
  { from: "tgw",          to: "vpc_nacl"   },
  { from: "tgw",          to: "vpc_sg"     },
  { from: "tgw",          to: "pvs_nsg"    },
  { from: "route_tables", to: "vpc_nacl"   },
  { from: "route_tables", to: "vpc_sg"     },
  // NLB also enforced by VPC SGs
  { from: "vpc_nlb",      to: "vpc_sg"     },
];

// For a clicked node, collect all nodes that should light up:
// ancestors (everything upstream to pvs) + descendants (everything downstream).
function netReachable(clickedId) {
  const reachable = new Set([clickedId]);

  // Walk descendants
  const queue = [clickedId];
  while (queue.length) {
    const cur = queue.shift();
    NET_EDGES.forEach((e) => {
      if (e.from === cur && !reachable.has(e.to)) {
        reachable.add(e.to);
        queue.push(e.to);
      }
    });
  }

  // Walk ancestors
  const aQueue = [clickedId];
  const visited = new Set([clickedId]);
  while (aQueue.length) {
    const cur = aQueue.shift();
    NET_EDGES.forEach((e) => {
      if (e.to === cur && !visited.has(e.from)) {
        visited.add(e.from);
        reachable.add(e.from);
        aQueue.push(e.from);
      }
    });
  }

  return reachable;
}

function renderNetworkView() {
  const main = document.getElementById("main");
  let area = document.getElementById("network-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "network-area";
    const sidebar = document.getElementById("sidebar");
    main.insertBefore(area, sidebar);
  }
  area.innerHTML = "";

  // Group nodes by row
  const rows = {};
  NET_NODES.forEach((n) => {
    if (!rows[n.row]) rows[n.row] = [];
    rows[n.row].push(n);
  });

  const ROW_LABELS = [
    "PowerVS Workspace",
    "Connection Intent",
    "Entry Mechanism",
    "Routing & Gateway",
    "Security Controls (VPC + PowerVS)",
  ];

  const maxRow = Math.max(...NET_NODES.map((n) => n.row));
  for (let r = 0; r <= maxRow; r++) {
    const rowNodes = rows[r] || [];

    const rowEl = document.createElement("div");
    rowEl.className = "net-row";
    rowEl.dataset.row = r;

    const rowLabel = document.createElement("div");
    rowLabel.className = "net-row-label";
    rowLabel.textContent = ROW_LABELS[r] || `Row ${r}`;
    rowEl.appendChild(rowLabel);

    const rowCards = document.createElement("div");
    rowCards.className = "net-row-cards";

    // For Row 4, insert a divider between VPC-plane and PowerVS-plane cards
    const vpcPlaneIds  = new Set(["vpc_nacl", "vpc_sg"]);
    const pvsPlanIds   = new Set(["pvs_nsg"]);
    let dividerInserted = false;

    rowNodes.forEach((node) => {
      // Insert plane divider before first PowerVS-plane card in Row 4
      if (r === 4 && pvsPlanIds.has(node.id) && !dividerInserted) {
        dividerInserted = true;
        const divider = document.createElement("div");
        divider.className = "net-plane-divider";
        divider.textContent = "PowerVS plane";
        rowCards.appendChild(divider);
      }

      const card = document.createElement("div");
      card.className = "net-card";
      card.dataset.id = node.id;
      card.dataset.row = node.row;
      // Stamp plane for styling
      if (vpcPlaneIds.has(node.id))  card.dataset.plane = "vpc";
      if (pvsPlanIds.has(node.id))   card.dataset.plane = "pvs";
      card.style.setProperty("--net-color", node.color);

      const icon = document.createElement("div");
      icon.className = "net-card-icon";
      icon.textContent = node.icon;
      card.appendChild(icon);

      const body = document.createElement("div");
      body.className = "net-card-body";

      const label = document.createElement("div");
      label.className = "net-card-label";
      label.textContent = node.label;
      body.appendChild(label);

      const sub = document.createElement("div");
      sub.className = "net-card-sub";
      sub.textContent = node.sub;
      body.appendChild(sub);

      card.appendChild(body);

      card.addEventListener("click", () => {
        if (state.netSelected === node.id) {
          state.netSelected = null;
        } else {
          state.netSelected = node.id;
        }
        applyNetworkHighlights();
        renderNetworkSidebar(node.id);
      });

      rowCards.appendChild(card);
    });

    rowEl.appendChild(rowCards);
    area.appendChild(rowEl);
  }

  applyNetworkHighlights();
}

function applyNetworkHighlights() {
  const area = document.getElementById("network-area");
  if (!area) return;

  const sel = state.netSelected;
  const reachable = sel ? netReachable(sel) : null;

  area.querySelectorAll(".net-card").forEach((card) => {
    const id = card.dataset.id;
    const isSelected = id === sel;
    const isReachable = reachable ? reachable.has(id) : false;

    card.classList.toggle("is-selected", isSelected);
    card.classList.toggle("is-reachable", !isSelected && isReachable);
    card.classList.toggle("is-dimmed", Boolean(reachable && !isReachable));
  });
}

function renderNetworkSidebar(nodeId) {
  const node = NET_NODES.find((n) => n.id === nodeId);
  if (!node) return;

  const sidebar = document.getElementById("sidebar");
  sidebar.classList.add("is-open");

  const children = NET_EDGES
    .filter((e) => e.from === nodeId)
    .map((e) => NET_NODES.find((n) => n.id === e.to))
    .filter(Boolean);

  const parents = NET_EDGES
    .filter((e) => e.to === nodeId)
    .map((e) => NET_NODES.find((n) => n.id === e.from))
    .filter(Boolean);

  const docsLink = node.docsUrl
    ? `<a class="sb-link" href="${escapeHtml(node.docsUrl)}" target="_blank" rel="noopener noreferrer">
        <span>IBM Documentation</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2v1.5h2.44L6.97 9.03l1.06 1.06 5.47-5.47V7H15V2h-5z"/><path d="M13 13.5H3v-10h4.5V2H3a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 3 15h10a1.5 1.5 0 0 0 1.5-1.5V9h-1.5v4.5z"/></svg>
       </a>`
    : "";

  const relatedHtml = (label, items) => items.length === 0 ? "" : `
    <div class="sb-section">
      <div class="sb-section-title">${label}</div>
      <ul class="sb-list">
        ${items.map((n) => `<li><strong>${escapeHtml(n.label)}</strong> — ${escapeHtml(n.sub)}</li>`).join("")}
      </ul>
    </div>`;

  els.sidebar.innerHTML = `
    <div class="sb-category">${escapeHtml(node.sub)}</div>
    <div class="sb-title">${escapeHtml(node.label)}</div>
    <div class="sb-section">
      <div class="sb-section-title">Overview</div>
      <div class="sb-description">${escapeHtml(node.desc)}</div>
    </div>
    ${relatedHtml("Requires / Connects To", children)}
    ${relatedHtml("Part of", parents)}
    ${docsLink ? `<div class="sb-section">${docsLink}</div>` : ""}
  `;
}

// ---------------------------------------------------------------------------
// Availability view — hardware availability by datacenter + machine type filter
// ---------------------------------------------------------------------------

// Human-readable labels and categories for each machine type
const MACHINE_META = {
  e1050: { label: "e1050",  family: "Power10", arch: "POWER10", desc: "Entry Power10 scale-up" },
  e1080: { label: "e1080",  family: "Power10", arch: "POWER10", desc: "Mid-range Power10 scale-up" },
  e1150: { label: "e1150",  family: "Power11", arch: "POWER11", desc: "Entry Power11 scale-up" },
  e1180: { label: "e1180",  family: "Power11", arch: "POWER11", desc: "Mid-range Power11 scale-up" },
  s1022: { label: "s1022",  family: "Power10", arch: "POWER10", desc: "Power10 scale-out 2-socket" },
  s1122: { label: "s1122",  family: "Power11", arch: "POWER11", desc: "Power11 scale-out 2-socket" },
};

const CAP_META = {
  cloud_connections:       { label: "Cloud Connections",        abbr: "CC"  },
  dedicated_hosts:         { label: "Dedicated Hosts",          abbr: "DH"  },
  disaster_recovery:       { label: "Disaster Recovery",        abbr: "DR"  },
  network_security_groups: { label: "Network Security Groups",  abbr: "NSG" },
  vpmem:                   { label: "Virtual Persistent Memory",abbr: "vPM" },
};

// Region prefix → geographic label mapping for display grouping
function regionGeo(region) {
  if (/^us-east|wdc/.test(region))      return "US East";
  if (/^us-south|dal/.test(region))     return "US South";
  if (/^mon|tor/.test(region))          return "Canada";
  if (/^sao/.test(region))              return "Brazil";
  if (/^eu-de|fra/.test(region))        return "Germany";
  if (/^lon/.test(region))              return "UK";
  if (/^mad/.test(region))              return "Spain";
  if (/^osa|tok/.test(region))          return "Japan";
  if (/^syd/.test(region))              return "Australia";
  if (/^che/.test(region))              return "India (Chennai)";
  if (/^in-mum/.test(region))           return "India (Mumbai)";
  return "Other";
}

const GEO_ORDER = [
  "US East", "US South", "Canada", "Brazil",
  "Germany", "UK", "Spain",
  "India (Chennai)", "India (Mumbai)", "Japan", "Australia",
  "Other",
];

function renderAvailabilityView() {
  const main = document.getElementById("main");
  let area = document.getElementById("avail-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "avail-area";
    const sidebar = document.getElementById("sidebar");
    main.insertBefore(area, sidebar);
  }
  area.innerHTML = "";

  const data = state.availSystems;
  if (!data) {
    area.innerHTML = `<div class="avail-loading">Hardware availability data not loaded.</div>`;
    return;
  }

  // --- Header bar ---
  const header = document.createElement("div");
  header.className = "avail-header";

  const titleEl = document.createElement("div");
  titleEl.className = "avail-title";
  const genAt = new Date(data.generated_at);
  const genStr = genAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  titleEl.innerHTML = `<strong>${data.datacenter_count} datacenters</strong> &nbsp;·&nbsp; <span class="avail-gen-date">Refreshed ${genStr}</span>`;
  header.appendChild(titleEl);

  // Machine type filter chips
  const filterWrap = document.createElement("div");
  filterWrap.className = "avail-filter";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `avail-chip${!state.availFilter ? " is-active" : ""}`;
  allBtn.textContent = "All hardware";
  allBtn.setAttribute("aria-pressed", !state.availFilter ? "true" : "false");
  allBtn.addEventListener("click", () => {
    state.availFilter = null;
    applyAvailabilityFilter();
  });
  filterWrap.appendChild(allBtn);

  data.all_machine_types.forEach((mt) => {
    const meta = MACHINE_META[mt] || { label: mt, family: "", desc: mt };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `avail-chip${state.availFilter === mt ? " is-active" : ""}`;
    btn.dataset.mt = mt;
    btn.setAttribute("aria-pressed", state.availFilter === mt ? "true" : "false");

    const nameEl = document.createElement("span");
    nameEl.className = "avail-chip-name";
    nameEl.textContent = meta.label;
    btn.appendChild(nameEl);

    if (meta.family) {
      const fam = document.createElement("span");
      fam.className = `avail-chip-fam avail-chip-fam--${meta.family.toLowerCase().replace(/\s+/g, "")}`;
      fam.textContent = meta.family;
      btn.appendChild(fam);
    }

    btn.addEventListener("click", () => {
      state.availFilter = state.availFilter === mt ? null : mt;
      applyAvailabilityFilter();
    });
    filterWrap.appendChild(btn);
  });

  header.appendChild(filterWrap);
  area.appendChild(header);

  // --- Cards grid ---
  const grid = document.createElement("div");
  grid.className = "avail-grid";
  grid.id = "avail-grid";

  // Group datacenters by geography
  const geoGroups = {};
  data.datacenters.forEach((dc) => {
    const geo = regionGeo(dc.region);
    if (!geoGroups[geo]) geoGroups[geo] = [];
    geoGroups[geo].push(dc);
  });

  GEO_ORDER.forEach((geo) => {
    const dcs = geoGroups[geo];
    if (!dcs || dcs.length === 0) return;

    const group = document.createElement("div");
    group.className = "avail-geo-group";

    const geoLabel = document.createElement("div");
    geoLabel.className = "avail-geo-label";
    geoLabel.textContent = geo;
    group.appendChild(geoLabel);

    const cardsRow = document.createElement("div");
    cardsRow.className = "avail-cards-row";

    dcs.forEach((dc) => {
      const card = buildDcCard(dc);
      cardsRow.appendChild(card);
    });

    group.appendChild(cardsRow);
    grid.appendChild(group);
  });

  area.appendChild(grid);
  applyAvailabilityFilter();
}

function buildDcCard(dc) {
  const card = document.createElement("div");
  card.className = "avail-card";
  card.dataset.region = dc.region;

  // All machine types this DC supports (union of general + dedicated)
  const allMts = new Set([...dc.systems.general, ...dc.systems.dedicated]);
  card.dataset.mts = [...allMts].join(",");

  // Region name
  const regionEl = document.createElement("div");
  regionEl.className = "avail-card-region";
  regionEl.textContent = dc.region;
  card.appendChild(regionEl);

  // Machine type availability rows
  const mtSection = document.createElement("div");
  mtSection.className = "avail-card-mts";

  const allTypes = Object.keys(MACHINE_META);
  allTypes.forEach((mt) => {
    const meta = MACHINE_META[mt];
    const inGeneral   = dc.systems.general.includes(mt);
    const inDedicated = dc.systems.dedicated.includes(mt);
    if (!inGeneral && !inDedicated) return;

    const row = document.createElement("div");
    row.className = "avail-mt-row";
    row.dataset.mt = mt;

    const nameSpan = document.createElement("span");
    nameSpan.className = `avail-mt-name avail-mt-name--${meta.family.toLowerCase().replace(/\s+/g, "")}`;
    nameSpan.textContent = mt;
    row.appendChild(nameSpan);

    const badges = document.createElement("span");
    badges.className = "avail-mt-badges";

    if (inGeneral) {
      const b = document.createElement("span");
      b.className = "avail-badge avail-badge--general";
      b.textContent = "Shared";
      badges.appendChild(b);
    }
    if (inDedicated) {
      const b = document.createElement("span");
      b.className = "avail-badge avail-badge--dedicated";
      b.textContent = "Dedicated";
      badges.appendChild(b);
    }

    row.appendChild(badges);
    mtSection.appendChild(row);
  });

  card.appendChild(mtSection);

  // Capability badges
  const capSection = document.createElement("div");
  capSection.className = "avail-card-caps";

  Object.entries(CAP_META).forEach(([key, meta]) => {
    const pill = document.createElement("span");
    const enabled = dc.capabilities[key];
    pill.className = `avail-cap-pill${enabled ? " is-enabled" : " is-disabled"}`;
    pill.title = meta.label;
    pill.textContent = meta.abbr;
    capSection.appendChild(pill);
  });

  card.appendChild(capSection);
  return card;
}

function applyAvailabilityFilter() {
  const area = document.getElementById("avail-area");
  if (!area) return;

  const mt = state.availFilter;

  // Update chips
  area.querySelectorAll(".avail-chip").forEach((chip) => {
    const chipMt = chip.dataset.mt || null;
    const isActive = chipMt === mt;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  // Update cards — hide those that don't have the selected machine type
  area.querySelectorAll(".avail-card").forEach((card) => {
    const mts = card.dataset.mts ? card.dataset.mts.split(",") : [];
    const visible = !mt || mts.includes(mt);
    card.classList.toggle("is-hidden", !visible);
    card.classList.toggle("is-highlighted", Boolean(mt && visible));
  });

  // Highlight the matching MT rows inside visible cards
  area.querySelectorAll(".avail-mt-row").forEach((row) => {
    row.classList.toggle("is-focused", Boolean(mt && row.dataset.mt === mt));
    row.classList.toggle("is-dimmed", Boolean(mt && row.dataset.mt !== mt));
  });

  // Update geo group visibility — hide groups where all cards are hidden
  area.querySelectorAll(".avail-geo-group").forEach((group) => {
    const hasVisible = group.querySelectorAll(".avail-card:not(.is-hidden)").length > 0;
    group.classList.toggle("is-empty", !hasVisible);
  });
}

async function load() {
  const [playsDoc, products, connections, availSystems] = await Promise.all([
    fetch("./data/powervs/plays.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("./data/powervs/products.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("./data/powervs/connections.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("./data/powervs/available-systems.json", { cache: "no-store" }).then((r) => r.json()),
  ]);

  state.viewId = "powervs";
  state.viewMeta = playsDoc.view;
  state.plays = playsDoc.plays;
  state.playOrder = playsDoc.playOrder;
  state.categories = playsDoc.categories;
  state.products = products;
  state.connections = connections;
  state.availSystems = availSystems;
  state.selectedId = null;
  state.laneFilter = null;

  bindChrome();
  renderViewSwitch();
  renderLegend();
  renderOsFilter();
  renderFooter();
  renderSidebar();

  // Read initial view from URL hash (e.g. #availability, #network)
  const initialView = VALID_VIEWS.has(location.hash.slice(1)) ? location.hash.slice(1) : "grid";
  const main = document.getElementById("main");
  main.classList.add(`is-${initialView === "grid" ? "grid" : initialView === "matrix" ? "matrix" : initialView === "availability" ? "avail" : "network"}-mode`);
  if (initialView === "grid")         renderGridView();
  else if (initialView === "matrix")  renderMatrixView();
  else if (initialView === "availability") renderAvailabilityView();
  else                                renderNetworkView();

  // Keep hash in sync when user navigates back/forward
  window.addEventListener("hashchange", () => {
    const viewId = VALID_VIEWS.has(location.hash.slice(1)) ? location.hash.slice(1) : "grid";
    switchToView(viewId);
  });

  if (els.footerHint) els.footerHint.textContent = "Grid: click an OS to highlight integrations · Network: click a node to trace the connection path · Availability: filter by machine type";
}

load().catch((err) => {
  els.sidebar.innerHTML = `<p class="sb-description">Could not load catalog: ${escapeHtml(err.message)}. Serve this folder over HTTP so the JSON feed can load.</p>`;
});
