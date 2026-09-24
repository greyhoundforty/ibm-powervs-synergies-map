const PLAY_ID = document.body.dataset.play || "powervs-dr";
const PLAY_FILE = `../data/plays/${PLAY_ID}.json`;
const PRODUCTS_FILE = "../data/iaas/products.json";
const LAYOUT_KEY = `play-layout:${PLAY_ID}:v2`;

const state = {
  play: null,
  products: [],
  selectedId: null,
  groupFilter: null,
  backupOn: {},
  arrange: new URLSearchParams(location.search).has("arrange"),
  layout: emptyLayout(),
  view: null,
  drag: null,
  didDrag: false,
};

const els = {
  lede: document.getElementById("play-lede"),
  legend: document.getElementById("group-legend"),
  backups: document.getElementById("backup-toggles"),
  labels: document.getElementById("group-labels"),
  nodes: document.getElementById("nodes"),
  notes: document.getElementById("notes"),
  svg: document.getElementById("svg-connections"),
  map: document.getElementById("map-area"),
  sidebar: document.getElementById("sidebar-inner"),
  reset: document.getElementById("reset-btn"),
  theme: document.getElementById("theme-btn"),
  footer: document.getElementById("footer-stats"),
  footerHint: document.getElementById("footer-hint"),
  arrangeBtn: document.getElementById("arrange-btn"),
  arrangeTools: document.getElementById("arrange-tools"),
  addNoteBtn: document.getElementById("add-note-btn"),
  addBoxBtn: document.getElementById("add-box-btn"),
  copyLayoutBtn: document.getElementById("copy-layout-btn"),
  resetLayoutBtn: document.getElementById("reset-layout-btn"),
  arrangeStatus: document.getElementById("arrange-status"),
};

function emptyLayout() {
  return {
    version: 2,
    playId: PLAY_ID,
    workspace: null,
    nodes: {},
    labels: {},
    captions: {},
    notes: [],
    boxes: [],
  };
}

function visibleFlows(includeHidden = false) {
  return (state.play.flows || []).filter((flow) => includeHidden || state.backupOn[flow.id] !== false);
}

function flowNodeId(flowId, step) {
  if (step === state.play.hubId || step === state.play.lparId) return step;
  return `${flowId}::${step}`;
}

function groupById(id) {
  return state.play.groups.find((g) => g.id === id) || state.play.groups[0];
}

function nodeDef(productId) {
  return state.play.nodes?.[productId] || {};
}

function captionFor(id, fallback) {
  const value = state.layout.captions?.[id];
  return value == null || value === "" ? fallback : value;
}

function setCaption(id, text) {
  if (!state.layout.captions) state.layout.captions = {};
  const trimmed = String(text).replace(/\s+/g, " ").trim();
  if (!trimmed) delete state.layout.captions[id];
  else state.layout.captions[id] = trimmed;
  const box = state.layout.boxes?.find((entry) => entry.id === id);
  if (box && trimmed) box.text = trimmed;
  saveLayout();
  draw(true);
}

function playColor(playId) {
  return `var(--play-${playId})`;
}

function productById(id) {
  if (id === state.play.hubId) {
    return {
      id,
      label: captionFor(id, state.play.workspace.label),
      desc: state.play.workspace.summary,
    };
  }
  if (id === state.play.lparId) {
    return {
      id,
      label: captionFor(id, state.play.lpar.label),
      desc: state.play.lpar.summary,
    };
  }
  const item = allItems(true).find((entry) => entry.id === id);
  const productId = item?.productId || id;
  const catalog = state.products.find((p) => p.id === productId);
  const def = nodeDef(productId);
  const label = captionFor(id, def.label || catalog?.label || productId);
  if (catalog) return { ...catalog, label, desc: def.desc || def.summary || catalog.desc };
  if (!item && !def.label) return null;
  return {
    id: productId,
    label,
    desc: def.desc || def.summary || "",
  };
}

function allItems(includeHidden = false) {
  const items = [];
  for (const flow of visibleFlows(includeHidden)) {
    for (const step of flow.steps) {
      if (step === state.play.hubId || step === state.play.lparId) continue;
      const def = nodeDef(step);
      items.push({
        id: flowNodeId(flow.id, step),
        productId: step,
        flowId: flow.id,
        flow,
        ...def,
        group: groupById(def.group || "networking"),
      });
    }
  }
  return items;
}

function itemById(id) {
  if (id === state.play.hubId) {
    return { id, group: { id: "hub", label: "Workspace", playId: 1 }, role: "DR workspace" };
  }
  if (id === state.play.lparId) {
    return { id, group: { id: "hub", label: "Workspace", playId: 1 }, role: "DR LPAR" };
  }
  return allItems(true).find((item) => item.id === id);
}

function isHubFamily(id) {
  return id === state.play.hubId || id === state.play.lparId;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function kindLabel(kind, status) {
  if (status === "partner") return `${kind} · partner`;
  return kind;
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return emptyLayout();
    const parsed = JSON.parse(raw);
    return {
      ...emptyLayout(),
      ...parsed,
      nodes: parsed.nodes || {},
      labels: parsed.labels || {},
      captions: parsed.captions || {},
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      boxes: Array.isArray(parsed.boxes) ? parsed.boxes : [],
    };
  } catch {
    return emptyLayout();
  }
}

function saveLayout() {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(state.layout));
  syncArrangeStatus();
  if (state.arrange) renderLayoutSidebar();
}

function mapSize() {
  const { width, height } = els.map.getBoundingClientRect();
  return { width, height };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function layoutPositions() {
  const { width, height } = mapSize();
  const flows = visibleFlows();
  const rows = Math.max(flows.length, 1);
  const stored = state.layout.workspace;
  const boxW = stored ? stored.w * width : Math.min(210, Math.max(168, width * 0.16));
  const boxH = stored ? stored.h * height : Math.min(168, Math.max(128, height * 0.22));
  const fsFlow = flows.find((flow) => flow.steps.includes(state.play.hubId));
  const fsRow = fsFlow ? flows.indexOf(fsFlow) : Math.floor(rows / 2);
  const fsCol = fsFlow ? Math.max(fsFlow.steps.indexOf(state.play.hubId), 0) : 0;
  const stepSpan = (count) => (width - 120) / Math.max(count - 1, 1);
  const rowY = (index) => height * ((index + 0.55) / (rows + 0.35));
  const colX = (index, count) => 88 + index * ((width - 176) / Math.max(count - 1, 1));

  let workspace = {
    x: Math.max(16, width * 0.03),
    y: height * 0.5 - boxH / 2,
    w: boxW,
    h: boxH,
  };
  if (fsFlow) {
    workspace = {
      x: clamp(colX(fsCol, fsFlow.steps.length) - boxW / 2, 12, width - boxW - 12),
      y: clamp(rowY(fsRow) - boxH / 2, 12, height - boxH - 12),
      w: boxW,
      h: boxH,
    };
  }
  if (stored) {
    workspace = {
      x: stored.x * width,
      y: stored.y * height,
      w: stored.w * width,
      h: stored.h * height,
    };
  }

  const origin = { x: workspace.x + workspace.w, y: workspace.y + workspace.h * 0.55 };
  const lparOrigin = { x: workspace.x + workspace.w * 0.5, y: workspace.y + workspace.h * 0.72 };
  const positions = {
    [state.play.hubId]: { x: workspace.x + workspace.w / 2, y: workspace.y + workspace.h / 2, playId: 1, groupId: "hub" },
    [state.play.lparId]: { x: lparOrigin.x, y: lparOrigin.y, playId: 1, groupId: "hub" },
  };
  const labelPos = {};

  flows.forEach((flow, row) => {
    const n = flow.steps.length;
    const y = rowY(row);
    labelPos[flow.id] = { x: 16, y: y - 28 };
    flow.steps.forEach((step, i) => {
      const id = flowNodeId(flow.id, step);
      if (id === state.play.hubId || id === state.play.lparId) return;
      positions[id] = {
        x: colX(i, n),
        y,
        playId: flow.playId,
        groupId: nodeDef(step).group || "networking",
        flowId: flow.id,
      };
    });
  });

  for (const [id, p] of Object.entries(state.layout.nodes || {})) {
    if (!positions[id]) continue;
    positions[id] = { ...positions[id], x: p.x * width, y: p.y * height };
  }
  for (const [id, p] of Object.entries(state.layout.labels || {})) {
    labelPos[id] = { x: p.x * width, y: p.y * height };
  }

  return { width, height, workspace, origin, lparOrigin, positions, labelPos };
}

function freezeVisible(layout) {
  const { width, height, workspace, positions, labelPos } = layout;
  if (!state.layout.workspace) {
    state.layout.workspace = {
      x: workspace.x / width,
      y: workspace.y / height,
      w: workspace.w / width,
      h: workspace.h / height,
    };
  }
  for (const [id, p] of Object.entries(positions)) {
    if (id === state.play.hubId || id === state.play.lparId) continue;
    if (!state.layout.nodes[id]) state.layout.nodes[id] = { x: p.x / width, y: p.y / height };
  }
  for (const [id, p] of Object.entries(labelPos)) {
    if (!state.layout.labels[id]) state.layout.labels[id] = { x: p.x / width, y: p.y / height };
  }
}

function exportLayout() {
  const layout = state.view || layoutPositions();
  const { width, height, workspace, positions, labelPos } = layout;
  const snapshot = {
    version: 2,
    playId: state.play.id,
    capturedAt: new Date().toISOString(),
    map: { width: Math.round(width), height: Math.round(height) },
    captions: { ...(state.layout.captions || {}) },
    workspace: {
      x: workspace.x / width,
      y: workspace.y / height,
      w: workspace.w / width,
      h: workspace.h / height,
      px: { x: Math.round(workspace.x), y: Math.round(workspace.y), w: Math.round(workspace.w), h: Math.round(workspace.h) },
    },
    nodes: Object.fromEntries(
      Object.entries(positions)
        .filter(([id]) => id !== state.play.hubId && id !== state.play.lparId)
        .map(([id, p]) => [id, { x: p.x / width, y: p.y / height, px: { x: Math.round(p.x), y: Math.round(p.y) } }])
    ),
    labels: Object.fromEntries(
      Object.entries(labelPos).map(([id, p]) => [id, { x: p.x / width, y: p.y / height, px: { x: Math.round(p.x), y: Math.round(p.y) } }])
    ),
    notes: (state.layout.notes || []).map((note) => ({
      ...note,
      px: {
        x: Math.round(note.x * width),
        y: Math.round(note.y * height),
        w: Math.round(note.w * width),
        h: Math.round(note.h * height),
      },
    })),
    boxes: (state.layout.boxes || []).map((box) => ({
      ...box,
      px: { x: Math.round(box.x * width), y: Math.round(box.y * height) },
    })),
  };
  return snapshot;
}

function anchorPoint(id, side, layout) {
  const { workspace, positions } = layout;
  if (id === state.play.hubId) {
    return {
      x: side === "in" ? workspace.x : workspace.x + workspace.w,
      y: workspace.y + workspace.h * 0.55,
    };
  }
  return positions[id];
}

function drawEdges(layout) {
  const { width, height } = layout;
  els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.svg.innerHTML = "";
  for (const flow of visibleFlows()) {
    for (let i = 0; i < flow.steps.length - 1; i += 1) {
      const from = flowNodeId(flow.id, flow.steps[i]);
      const to = flowNodeId(flow.id, flow.steps[i + 1]);
      const start = anchorPoint(from, "out", layout);
      const end = anchorPoint(to, "in", layout);
      if (!start || !end) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const midX = start.x + (end.x - start.x) * 0.5;
      path.setAttribute("d", `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`);
      path.setAttribute("class", "conn-path is-platform");
      path.dataset.from = from;
      path.dataset.to = to;
      path.dataset.group = nodeDef(flow.steps[i + 1]).group || "networking";
      path.dataset.flow = flow.id;
      path.style.setProperty("--edge-color", playColor(flow.playId));
      els.svg.appendChild(path);
    }
  }
}

function renderLabels(layout) {
  const { labelPos } = layout;
  els.labels.innerHTML = Object.entries(labelPos)
    .map(([id, p]) => {
      const flow = state.play.flows.find((entry) => entry.id === id);
      const text = captionFor(`flow:${id}`, flow?.label || id);
      return `<div class="group-label is-flow${state.arrange ? " is-movable" : ""}" data-kind="label" data-id="${id}" data-caption-id="flow:${id}" style="left:${p.x}px;top:${p.y}px;color:${playColor(flow?.playId || 2)}">${escapeHtml(text)}</div>`;
    })
    .join("");
  if (!state.arrange) return;
  for (const label of els.labels.querySelectorAll("[data-kind]")) {
    label.addEventListener("pointerdown", (event) => startDrag(event, label.dataset.kind, label.dataset.id));
    label.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      beginCaptionEdit(label, label.dataset.captionId, label.textContent);
    });
  }
}

function renderNodes(layout) {
  const { width, height, workspace, positions } = layout;
  const items = allItems();
  const resize = state.arrange ? `<span class="workspace-resize" data-kind="resize" aria-hidden="true"></span>` : "";
  const workspaceTitle = captionFor(state.play.hubId, state.play.workspace.label);
  const lparTitle = captionFor(state.play.lparId, state.play.lpar.label);
  const nodes = [
    `<div class="workspace${state.selectedId === state.play.hubId ? " selected" : ""}${state.arrange ? " is-movable" : ""}" data-id="${state.play.hubId}" data-kind="workspace" data-group="hub" style="left:${workspace.x}px;top:${workspace.y}px;width:${workspace.w}px;height:${workspace.h}px;--node-color:${playColor(1)}">
      <button type="button" class="workspace-hit" data-id="${state.play.hubId}">
        <span class="hub-kicker">${escapeHtml(state.play.workspace.kicker)}</span>
        <span class="workspace-title" data-caption-id="${state.play.hubId}">${escapeHtml(workspaceTitle)}</span>
      </button>
      <button type="button" class="lpar" data-id="${state.play.lparId}" data-group="hub">
        <span class="hub-kicker">${escapeHtml(state.play.lpar.kicker)}</span>
        <span data-caption-id="${state.play.lparId}">${escapeHtml(lparTitle)}</span>
        <span class="lpar-os">${escapeHtml(state.play.lpar.os)}</span>
      </button>
      ${resize}
    </div>`,
  ];
  for (const item of items) {
    const product = productById(item.id);
    const partner = item.status === "partner" ? `<span class="partner-flag">Partner</span>` : "";
    nodes.push(
      `<button type="button" class="pnode${state.arrange ? " is-movable" : ""}" data-kind="node" data-id="${item.id}" data-group="${item.group.id}" style="left:${positions[item.id].x}px;top:${positions[item.id].y}px;--node-color:${playColor(item.flow.playId)}">
        <span class="pnode-label" data-caption-id="${item.id}">${escapeHtml(product.label)}</span>${partner}
      </button>`
    );
  }
  for (const box of state.layout.boxes || []) {
    nodes.push(
      `<button type="button" class="pnode custom-box${state.arrange ? " is-movable" : ""}" data-kind="box" data-id="${box.id}" style="left:${box.x * width}px;top:${box.y * height}px;--node-color:var(--cds-text-helper)">
        <span class="pnode-label" data-caption-id="${box.id}">${escapeHtml(captionFor(box.id, box.text))}</span>
        ${state.arrange ? `<span class="box-delete" data-box-id="${box.id}" aria-label="Delete box">×</span>` : ""}
      </button>`
    );
  }
  els.nodes.innerHTML = nodes.join("");
  bindNodeEvents();
}

function applyPositions(layout) {
  const { workspace, positions, labelPos, onprem } = layout;
  const workspaceEl = els.nodes.querySelector(".workspace");
  if (workspaceEl) {
    workspaceEl.style.left = `${workspace.x}px`;
    workspaceEl.style.top = `${workspace.y}px`;
    workspaceEl.style.width = `${workspace.w}px`;
    workspaceEl.style.height = `${workspace.h}px`;
  }
  for (const node of els.nodes.querySelectorAll(".pnode")) {
    const p = positions[node.dataset.id];
    if (!p) continue;
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
  }
  for (const label of els.labels.querySelectorAll(".group-label")) {
    const p = labelPos[label.dataset.id];
    if (!p) continue;
    label.style.left = `${p.x}px`;
    label.style.top = `${p.y}px`;
  }
  const onpremEl = els.labels.querySelector(".onprem-note");
  if (onpremEl && layout.onprem) {
    onpremEl.style.left = `${layout.onprem.x}px`;
    onpremEl.style.top = `${layout.onprem.y}px`;
  }
  const { width, height } = layout;
  for (const box of state.layout.boxes || []) {
    const el = els.nodes.querySelector(`.custom-box[data-id="${box.id}"]`);
    if (!el) continue;
    el.style.left = `${box.x * width}px`;
    el.style.top = `${box.y * height}px`;
  }
}

function beginCaptionEdit(target, id, fallback) {
  if (!state.arrange || target.querySelector(".caption-input")) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "caption-input";
  input.value = captionFor(id, fallback || "");
  const original = target.innerHTML;
  target.replaceChildren(input);
  input.focus();
  input.select();
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    setCaption(id, input.value || fallback || "");
  };
  const cancel = () => {
    if (committed) return;
    committed = true;
    target.innerHTML = original;
  };
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("mousedown", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
}

function addBoxAt(fracX = 0.5, fracY = 0.5) {
  const box = {
    id: `box-${Date.now()}`,
    x: fracX,
    y: fracY,
    text: "New box",
  };
  state.layout.boxes = state.layout.boxes || [];
  state.layout.boxes.push(box);
  saveLayout();
  draw(true);
  const el = els.nodes.querySelector(`[data-id="${box.id}"] .pnode-label`);
  if (el) beginCaptionEdit(el, box.id, box.text);
}

function bindNodeEvents() {
  const workspaceEl = els.nodes.querySelector(".workspace");
  workspaceEl?.addEventListener("click", (event) => {
    if (state.didDrag) return;
    if (event.target.closest(".lpar")) return;
    select(state.play.hubId);
  });
  for (const node of els.nodes.querySelectorAll("[data-id]")) {
    if (node.classList.contains("workspace")) continue;
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.didDrag) return;
      if (event.target.closest(".box-delete")) return;
      select(node.dataset.id);
    });
  }
  if (!state.arrange) return;
  workspaceEl?.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".lpar")) return;
    if (event.target.closest(".workspace-resize")) {
      startDrag(event, "resize", state.play.hubId);
      return;
    }
    startDrag(event, "workspace", state.play.hubId);
  });
  workspaceEl?.querySelector(".workspace-title")?.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    beginCaptionEdit(event.currentTarget, state.play.hubId, state.play.workspace.label);
  });
  workspaceEl?.querySelector(".lpar [data-caption-id]")?.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    beginCaptionEdit(event.currentTarget, state.play.lparId, state.play.lpar.label);
  });
  for (const node of els.nodes.querySelectorAll(".pnode")) {
    const kind = node.dataset.kind === "box" ? "box" : "node";
    node.addEventListener("pointerdown", (event) => startDrag(event, kind, node.dataset.id));
    node.querySelector(".pnode-label")?.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      const fallback = node.classList.contains("custom-box")
        ? state.layout.boxes.find((box) => box.id === node.dataset.id)?.text
        : productById(node.dataset.id)?.label;
      beginCaptionEdit(event.currentTarget, node.dataset.id, fallback);
    });
    node.querySelector(".box-delete")?.addEventListener("click", (event) => {
      event.stopPropagation();
      state.layout.boxes = state.layout.boxes.filter((box) => box.id !== node.dataset.id);
      delete state.layout.captions[node.dataset.id];
      saveLayout();
      draw(true);
    });
  }
}

function pointFromEvent(event) {
  const rect = els.map.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startDrag(event, kind, id) {
  if (!state.arrange || event.button !== 0) return;
  if (event.target.closest("textarea, button.note-delete, .caption-input, .box-delete")) return;
  event.preventDefault();
  const layout = layoutPositions();
  if (kind === "node" || kind === "label" || kind === "onprem") freezeVisible(layout);
  if ((kind === "workspace" || kind === "resize") && !state.layout.workspace) {
    const { width, height, workspace } = layout;
    state.layout.workspace = {
      x: workspace.x / width,
      y: workspace.y / height,
      w: workspace.w / width,
      h: workspace.h / height,
    };
  }
  const start = pointFromEvent(event);
  state.didDrag = false;
  state.drag = {
    kind,
    id,
    start,
    originLayout: {
      ...layout,
      notes: state.layout.notes.map((note) => ({ ...note })),
      boxes: (state.layout.boxes || []).map((box) => ({ ...box })),
    },
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.drag) return;
  const { width, height } = mapSize();
  const now = pointFromEvent(event);
  const dx = now.x - state.drag.start.x;
  const dy = now.y - state.drag.start.y;
  if (Math.hypot(dx, dy) > 3) state.didDrag = true;
  const src = state.drag.originLayout;

  if (state.drag.kind === "workspace") {
    const x = clamp(src.workspace.x + dx, 8, width - src.workspace.w - 8);
    const y = clamp(src.workspace.y + dy, 8, height - src.workspace.h - 8);
    state.layout.workspace = { x: x / width, y: y / height, w: src.workspace.w / width, h: src.workspace.h / height };
  } else if (state.drag.kind === "resize") {
    const w = clamp(src.workspace.w + dx, 180, Math.min(420, width - src.workspace.x - 8));
    const h = clamp(src.workspace.h + dy, 160, Math.min(420, height - src.workspace.y - 8));
    state.layout.workspace = {
      x: src.workspace.x / width,
      y: src.workspace.y / height,
      w: w / width,
      h: h / height,
    };
  } else if (state.drag.kind === "node") {
    const p = src.positions[state.drag.id];
    state.layout.nodes[state.drag.id] = {
      x: clamp(p.x + dx, 24, width - 24) / width,
      y: clamp(p.y + dy, 24, height - 24) / height,
    };
  } else if (state.drag.kind === "label") {
    const p = src.labelPos[state.drag.id];
    state.layout.labels[state.drag.id] = {
      x: clamp(p.x + dx, 8, width - 40) / width,
      y: clamp(p.y + dy, 12, height - 12) / height,
    };
  } else if (state.drag.kind === "box") {
    const box = src.boxes.find((entry) => entry.id === state.drag.id);
    if (box) {
      const next = {
        ...box,
        x: clamp(box.x * width + dx, 24, width - 24) / width,
        y: clamp(box.y * height + dy, 24, height - 24) / height,
      };
      state.layout.boxes = state.layout.boxes.map((entry) => (entry.id === box.id ? next : entry));
    }
  } else if (state.drag.kind === "note") {
    const note = src.notes.find((n) => n.id === state.drag.id);
    if (note) {
      const next = {
        ...note,
        x: clamp(note.x * width + dx, 8, width - note.w * width - 8) / width,
        y: clamp(note.y * height + dy, 8, height - note.h * height - 8) / height,
      };
      state.layout.notes = state.layout.notes.map((n) => (n.id === note.id ? next : n));
    }
  } else if (state.drag.kind === "note-resize") {
    const note = src.notes.find((n) => n.id === state.drag.id);
    if (note) {
      const next = {
        ...note,
        w: clamp(note.w * width + dx, 140, 420) / width,
        h: clamp(note.h * height + dy, 72, 280) / height,
      };
      state.layout.notes = state.layout.notes.map((n) => (n.id === note.id ? next : n));
    }
  }

  const layout = layoutPositions();
  layout.notes = state.layout.notes;
  state.view = layout;
  drawEdges(layout);
  applyPositions(layout);
  syncNotes(layout, false);
}

function onPointerUp(event) {
  if (!state.drag) return;
  onPointerMove(event);
  state.drag = null;
  saveLayout();
  window.setTimeout(() => {
    state.didDrag = false;
  }, 0);
}

function addNoteAt(fracX = 0.55, fracY = 0.42) {
  const note = {
    id: `note-${Date.now()}`,
    x: fracX,
    y: fracY,
    w: 0.16,
    h: 0.14,
    text: "Note",
  };
  state.layout.notes.push(note);
  const layout = layoutPositions();
  state.view = layout;
  syncNotes(layout, true);
  saveLayout();
  const textarea = els.notes.querySelector(`[data-note-id="${note.id}"] textarea`);
  textarea?.focus();
  textarea?.select();
}

function syncNotes(layout, rebuild = true) {
  const { width, height } = layout;
  if (!rebuild) {
    for (const note of state.layout.notes) {
      const el = els.notes.querySelector(`[data-note-id="${note.id}"]`);
      if (!el) continue;
      el.style.left = `${note.x * width}px`;
      el.style.top = `${note.y * height}px`;
      el.style.width = `${note.w * width}px`;
      el.style.height = `${note.h * height}px`;
    }
    return;
  }
  const focused = document.activeElement?.closest?.("[data-note-id]")?.dataset.noteId;
  const caret = focused && document.activeElement?.selectionStart;
  els.notes.innerHTML = state.arrange
    ? state.layout.notes
        .map(
          (note) => `<article class="note-box" data-kind="note" data-note-id="${note.id}" style="left:${note.x * width}px;top:${note.y * height}px;width:${note.w * width}px;height:${note.h * height}px">
            <header class="note-handle">
              <span>Text</span>
              <button type="button" class="note-delete" data-note-id="${note.id}" aria-label="Delete note">×</button>
            </header>
            <textarea rows="3">${escapeHtml(note.text)}</textarea>
            <span class="note-resize" data-kind="note-resize" data-note-id="${note.id}"></span>
          </article>`
        )
        .join("")
    : state.layout.notes
        .map(
          (note) => `<article class="note-box is-static" style="left:${note.x * width}px;top:${note.y * height}px;width:${note.w * width}px;height:${note.h * height}px">
            <p>${escapeHtml(note.text)}</p>
          </article>`
        )
        .join("");
  if (!state.arrange) return;
  for (const box of els.notes.querySelectorAll(".note-box")) {
    box.querySelector(".note-handle").addEventListener("pointerdown", (event) => startDrag(event, "note", box.dataset.noteId));
    box.querySelector(".note-resize").addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      startDrag(event, "note-resize", box.dataset.noteId);
    });
    box.querySelector(".note-delete").addEventListener("click", (event) => {
      event.stopPropagation();
      state.layout.notes = state.layout.notes.filter((n) => n.id !== box.dataset.noteId);
      saveLayout();
      syncNotes(layoutPositions(), true);
    });
    box.querySelector("textarea").addEventListener("input", (event) => {
      const id = box.dataset.noteId;
      state.layout.notes = state.layout.notes.map((n) => (n.id === id ? { ...n, text: event.target.value } : n));
      saveLayout();
    });
  }
  if (focused) {
    const next = els.notes.querySelector(`[data-note-id="${focused}"] textarea`);
    if (next) {
      next.focus();
      if (typeof caret === "number") next.setSelectionRange(caret, caret);
    }
  }
}

function draw(rebuild = true) {
  const layout = layoutPositions();
  state.view = layout;
  drawEdges(layout);
  if (rebuild) renderNodes(layout);
  else applyPositions(layout);
  renderLabels(layout);
  syncNotes(layout, true);
  applyHighlights();
}

function select(id) {
  if (id === state.play.hubId) {
    state.selectedId = state.play.hubId;
  } else if (id === state.play.lparId) {
    state.selectedId = state.selectedId === id ? state.play.hubId : id;
  } else {
    state.selectedId = state.selectedId === id ? state.play.hubId : id;
    const item = itemById(id);
    if (item?.group?.id && item.group.id !== "hub") state.groupFilter = item.group.id;
  }
  syncLegend();
  renderSidebar();
  applyHighlights();
}

function showWholePlay() {
  state.selectedId = state.play.hubId;
  state.groupFilter = null;
  syncLegend();
  renderSidebar();
  applyHighlights();
}

function relatedIds(selected) {
  const related = new Set([selected]);
  if (isHubFamily(selected)) {
    related.add(state.play.hubId);
    related.add(state.play.lparId);
    for (const item of allItems()) related.add(item.id);
    return related;
  }
  const item = itemById(selected);
  if (!item?.flow) return related;
  for (const step of item.flow.steps) related.add(flowNodeId(item.flow.id, step));
  return related;
}

function applyHighlights() {
  const selected = state.selectedId;
  const spokeSelected = selected && !isHubFamily(selected);
  const group = state.arrange ? null : state.groupFilter;
  els.map.classList.toggle("is-focused", !state.arrange && (Boolean(spokeSelected) || Boolean(group)));
  els.map.classList.toggle("is-arranging", state.arrange);
  els.reset.classList.toggle("is-visible", !state.arrange && (Boolean(spokeSelected) || Boolean(group)));
  const related = relatedIds(selected);

  const workspaceEl = els.nodes.querySelector(".workspace");
  if (workspaceEl) {
    workspaceEl.classList.toggle("selected", selected === state.play.hubId);
    workspaceEl.classList.toggle("highlighted", spokeSelected && related.has(state.play.hubId));
    workspaceEl.classList.toggle("dimmed", Boolean(group) && group !== "hub" && !spokeSelected);
  }
  const lparEl = els.nodes.querySelector(".lpar");
  if (lparEl) {
    lparEl.classList.toggle("selected", selected === state.play.lparId);
    lparEl.classList.toggle("highlighted", spokeSelected && related.has(state.play.lparId));
  }

  for (const node of els.nodes.querySelectorAll(".pnode")) {
    const id = node.dataset.id;
    const inGroup = !group || node.dataset.group === group;
    const isSelected = id === selected;
    const isLinked = spokeSelected && related.has(id) && !isSelected;
    node.classList.toggle("selected", isSelected);
    node.classList.toggle("highlighted", isLinked);
    const dim = spokeSelected ? !related.has(id) : Boolean(group) && !inGroup;
    node.classList.toggle("dimmed", dim);
  }

  for (const path of els.svg.querySelectorAll(".conn-path")) {
    const inGroup = !group || path.dataset.group === group || (spokeSelected && related.has(path.dataset.to) && related.has(path.dataset.from));
    const live = spokeSelected
      ? related.has(path.dataset.from) && related.has(path.dataset.to)
      : inGroup;
    path.classList.toggle("active", live);
  }

  for (const label of els.labels.querySelectorAll(".group-label")) {
    label.style.opacity = !group || label.dataset.group === group ? "1" : "0.28";
  }
}

function renderLegend() {
  els.legend.innerHTML = state.play.groups
    .map(
      (g) => `<button type="button" class="legend-chip" data-group="${g.id}" aria-pressed="false">
        <span class="dot" style="background:${playColor(g.playId)}"></span>
        ${escapeHtml(g.label)}
      </button>`
    )
    .join("");
  for (const chip of els.legend.querySelectorAll(".legend-chip")) {
    chip.addEventListener("click", () => {
      const id = chip.dataset.group;
      state.groupFilter = state.groupFilter === id ? null : id;
      if (state.groupFilter && !isHubFamily(state.selectedId)) {
        const item = itemById(state.selectedId);
        if (item?.group?.id !== state.groupFilter) state.selectedId = state.play.hubId;
      }
      syncLegend();
      renderSidebar();
      applyHighlights();
    });
  }
  syncLegend();
}

function renderBackupToggles() {
  els.backups.innerHTML = state.play.backupToggles
    .map((opt) => {
      const on = state.backupOn[opt.id] !== false;
      return `<button type="button" class="toggle-chip${on ? " is-on" : ""}" data-backup="${opt.id}" aria-pressed="${on}" title="${escapeHtml(opt.label)}">
        <span class="toggle-switch" aria-hidden="true"></span>
        ${escapeHtml(opt.label)}
      </button>`;
    })
    .join("");
  for (const chip of els.backups.querySelectorAll(".toggle-chip")) {
    chip.addEventListener("click", () => {
      const id = chip.dataset.backup;
      state.backupOn[id] = state.backupOn[id] === false;
      if (state.backupOn[id] === false && state.selectedId === id) state.selectedId = state.play.hubId;
      renderBackupToggles();
      renderSidebar();
      renderFooter();
      draw(true);
    });
  }
}

function syncLegend() {
  for (const chip of els.legend.querySelectorAll(".legend-chip")) {
    const active = chip.dataset.group === state.groupFilter;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  }
}

function renderLayoutSidebar() {
  const json = JSON.stringify(exportLayout(), null, 2);
  els.sidebar.innerHTML = `
    <div class="sb-tag">Arrange mode</div>
    <div class="sb-product-name">Layout sandbox</div>
    <div class="sb-category">Drag boxes, rename them, add notes, then copy this JSON</div>
    <p class="sb-description">Double-click any box or row label to change the text. Positions and captions are saved in this browser. Copy the JSON and paste it in chat when you want the coded layout to match.</p>
    <div class="sb-value">Each backup toggle is one left-to-right path. Add box creates an extra chip you can name. Add text box is a freeform note.</div>
    <button type="button" class="sb-copy" id="sidebar-copy-layout">Copy layout JSON</button>
    <pre class="layout-json">${escapeHtml(json)}</pre>
  `;
  els.sidebar.querySelector("#sidebar-copy-layout")?.addEventListener("click", copyLayout);
}

function renderSidebar() {
  if (state.arrange) {
    renderLayoutSidebar();
    return;
  }
  const id = state.selectedId;
  const hub = productById(state.play.hubId);
  const items = allItems().filter((item) => !state.groupFilter || item.group.id === state.groupFilter);

  if (!id || id === state.play.hubId) {
    const rows = items
      .map((item) => {
        const product = productById(item.id);
        return `<button type="button" class="conn-row" data-target="${item.id}">
          <span class="conn-accent is-${item.kind}" style="--accent-color:${playColor(item.group.playId)}"></span>
          <span class="conn-info">
            <span class="conn-name">${escapeHtml(product.label)}</span>
            <span class="conn-play">${escapeHtml(item.flow?.label || kindLabel(item.kind, item.status))} · ${escapeHtml(item.group.label)} · ${escapeHtml(item.role || "")}</span>
            <span class="conn-explanation">${escapeHtml(item.summary)}</span>
          </span>
          <span class="conn-arrow">›</span>
        </button>`;
      })
      .join("");
    els.sidebar.innerHTML = `
      <div class="sb-tag">Workspace</div>
      <div class="sb-product-name">${escapeHtml(hub.label)}</div>
      <div class="sb-category">${escapeHtml(state.play.workspace.kicker)} · ${escapeHtml(state.play.title)}</div>
      <p class="sb-description">${escapeHtml(state.play.workspace.summary)}</p>
      <p class="sb-note">${escapeHtml(state.play.blurb)}</p>
      ${state.play.docsUrl ? `<a class="sb-link" href="${escapeHtml(state.play.docsUrl)}" target="_blank" rel="noopener">Play docs</a>` : ""}
      <div class="sb-section-label">${items.length} resources in this play</div>
      <div class="conn-list">${rows}</div>
    `;
    for (const row of els.sidebar.querySelectorAll(".conn-row")) {
      row.addEventListener("click", () => select(row.dataset.target));
    }
    return;
  }

  if (id === state.play.lparId) {
    const lpar = state.play.lpar;
    els.sidebar.innerHTML = `
      <div class="sb-tag">DR LPAR</div>
      <div class="sb-product-name">${escapeHtml(captionFor(lpar.id, lpar.label))}</div>
      <div class="sb-category">${escapeHtml(lpar.os)}</div>
      <p class="sb-description">${escapeHtml(lpar.summary)}</p>
      ${lpar.sellerNote ? `<div class="sb-value">${escapeHtml(lpar.sellerNote)}</div>` : ""}
      ${lpar.docsUrl ? `<a class="sb-link" href="${escapeHtml(lpar.docsUrl)}" target="_blank" rel="noopener">Docs</a>` : ""}
    `;
    return;
  }

  const item = itemById(id);
  const product = productById(id);
  const custom = state.layout.boxes?.find((box) => box.id === id);
  if (custom) {
    els.sidebar.innerHTML = `
      <div class="sb-tag">Custom box</div>
      <div class="sb-product-name">${escapeHtml(captionFor(custom.id, custom.text))}</div>
      <p class="sb-description">Extra chip added in Arrange mode. Double-click it to rename.</p>
    `;
    return;
  }
  if (!item || !product) return;
  const partner = item.status === "partner" ? `<span class="status-pill">Partner</span>` : "";
  els.sidebar.innerHTML = `
    <div class="sb-tag">${escapeHtml(item.group.label)}</div>
    <div class="sb-product-name">${escapeHtml(product.label)}${partner}</div>
    <div class="sb-category">${escapeHtml(item.role)}</div>
    <p class="sb-description">${escapeHtml(item.summary)}</p>
    ${item.sellerNote ? `<div class="sb-value">${escapeHtml(item.sellerNote)}</div>` : ""}
    ${item.docsUrl ? `<a class="sb-link" href="${escapeHtml(item.docsUrl)}" target="_blank" rel="noopener">Docs</a>` : ""}
    ${product.desc && product.desc !== item.summary ? `<div class="sb-section-label">Catalog copy</div><p class="sb-note">${escapeHtml(product.desc)}</p>` : ""}
  `;
}

function renderFooter() {
  const n = allItems().length;
  const backupsOn = state.play.backupToggles.filter((opt) => state.backupOn[opt.id] !== false).length;
  const notes = state.layout.notes.length;
  els.footer.innerHTML = `<span class="footer-stat"><strong>1</strong> workspace</span><span class="footer-stat"><strong>${n}</strong> resources</span><span class="footer-stat"><strong>${backupsOn}/${state.play.backupToggles.length}</strong> backup options</span>${notes ? `<span class="footer-stat"><strong>${notes}</strong> notes</span>` : ""}`;
  els.footerHint.textContent = state.arrange
    ? "Drag to arrange · double-click a box to rename it · copy JSON when it looks right"
    : state.play.footerHint;
}

function syncArrangeUi() {
  els.arrangeBtn?.classList.toggle("is-current", state.arrange);
  els.arrangeBtn?.setAttribute("aria-pressed", String(state.arrange));
  els.arrangeTools?.toggleAttribute("hidden", !state.arrange);
  els.map.classList.toggle("is-arranging", state.arrange);
  document.body.classList.toggle("is-arranging", state.arrange);
  syncArrangeStatus();
}

function syncArrangeStatus() {
  if (!els.arrangeStatus) return;
  const notes = state.layout.notes.length;
  const boxes = state.layout.boxes?.length || 0;
  const moved = Boolean(state.layout.workspace) || Object.keys(state.layout.nodes).length > 0 || Object.keys(state.layout.captions || {}).length > 0;
  els.arrangeStatus.textContent = moved || notes || boxes ? "Saved in this browser" : "Default layout";
}

async function copyLayout() {
  const json = JSON.stringify(exportLayout(), null, 2);
  try {
    await navigator.clipboard.writeText(json);
    if (els.arrangeStatus) els.arrangeStatus.textContent = "Copied — paste it in chat";
  } catch {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${PLAY_ID}-layout.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (els.arrangeStatus) els.arrangeStatus.textContent = `Downloaded ${PLAY_ID}-layout.json`;
  }
}

function resetLayout() {
  state.layout = emptyLayout();
  localStorage.removeItem(LAYOUT_KEY);
  draw(true);
  renderFooter();
  renderSidebar();
  syncArrangeStatus();
}

function setArrange(on) {
  state.arrange = on;
  const url = new URL(location.href);
  if (on) url.searchParams.set("arrange", "1");
  else url.searchParams.delete("arrange");
  history.replaceState({}, "", url);
  syncArrangeUi();
  renderSidebar();
  renderFooter();
  draw(true);
}

function bindArrangeChrome() {
  els.arrangeBtn?.addEventListener("click", () => setArrange(!state.arrange));
  els.addNoteBtn?.addEventListener("click", () => addNoteAt());
  els.addBoxBtn?.addEventListener("click", () => addBoxAt());
  els.copyLayoutBtn?.addEventListener("click", copyLayout);
  els.resetLayoutBtn?.addEventListener("click", resetLayout);
  els.map.addEventListener("dblclick", (event) => {
    if (!state.arrange) return;
    if (event.target.closest(".pnode, .workspace, .note-box, .group-label, .lpar, .caption-input")) return;
    const pt = pointFromEvent(event);
    const { width, height } = mapSize();
    addNoteAt(pt.x / width, pt.y / height);
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

async function init() {
  const [play, products] = await Promise.all([
    fetch(PLAY_FILE, { cache: "no-store" }).then((r) => r.json()),
    fetch(PRODUCTS_FILE, { cache: "no-store" }).then((r) => r.json()),
  ]);
  state.play = play;
  state.products = products;
  state.selectedId = play.hubId;
  state.backupOn = Object.fromEntries(play.backupToggles.map((opt) => [opt.id, true]));
  state.layout = loadLayout();
  els.lede.textContent = `${play.kicker} · ${play.title}`;
  document.title = `${play.title} · IBM Cloud Synergies Map`;
  renderLegend();
  renderBackupToggles();
  bindArrangeChrome();
  syncArrangeUi();
  renderSidebar();
  renderFooter();
  draw(true);
  els.reset.addEventListener("click", showWholePlay);
  els.theme.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
  });
  const ro = new ResizeObserver(() => draw(false));
  ro.observe(els.map);
}

init();
