const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  lockView: $("#lockView"),
  homeView: $("#homeView"),
  detailView: $("#detailView"),
  shellView: $("#shellView"),
  callView: $("#callView"),
  navButtons: $$("[data-nav-view]"),
  callModeButtons: $$("[data-call-mode]"),
  homeStartCall: $("#homeStartCall"),
  shellStartCall: $("#shellStartCall"),
  shellEyebrow: $("#shellEyebrow"),
  shellTitle: $("#shellTitle"),
  shellDescription: $("#shellDescription"),
  shellPrimaryAction: $("#shellPrimaryAction"),
  shellMetrics: $("#shellMetrics"),
  shellBody: $("#shellBody"),
  homeTabs: $$("[data-home-filter]"),
  homeMeetingsSection: $("#homeMeetingsSection"),
  homeTasksSection: $("#homeTasksSection"),
  homeMeetings: $("#homeMeetings"),
  homeTasks: $("#homeTasks"),
  detailBack: $("#detailBack"),
  detailSource: $("#detailSource"),
  detailEyebrow: $("#detailEyebrow"),
  detailTitle: $("#detailTitle"),
  detailMeta: $("#detailMeta"),
  detailDescription: $("#detailDescription"),
  detailContextLabel: $("#detailContextLabel"),
  detailPoints: $("#detailPoints"),
  detailDocs: $("#detailDocs"),
  detailStartCall: $("#detailStartCall"),
  detailActionLabel: $("#detailActionLabel"),
  detailSecondary: $("#detailSecondary"),
  detailActionNote: $("#detailActionNote"),
  callBackHome: $("#callBackHome"),
  callContextLabel: $("#callContextLabel"),
  startCall: $("#startCall"),
  endCall: $("#endCall"),
  muteCall: $("#muteCall"),
  interruptCall: $("#interruptCall"),
  askCooper: $("#askCooper"),
  postCallPanel: $("#postCallPanel"),
  postCallSummary: $("#postCallSummary"),
  postCallGenerateMarkdown: $("#postCallGenerateMarkdown"),
  postCallGenerateHtml: $("#postCallGenerateHtml"),
  postCallOpenLibrary: $("#postCallOpenLibrary"),
  connectionState: $("#connectionState"),
  micState: $("#micState"),
  callModeState: $("#callModeState"),
  callCostState: $("#callCostState"),
  workspaceState: $("#workspaceState"),
  modelLabel: $("#modelLabel"),
  errorBanner: $("#errorBanner"),
  eventLog: $("#eventLog"),
  canvasGrid: $("#canvasGrid"),
  canvasLayout: $("#canvasLayout"),
  canvasGroup: $("#canvasGroup"),
  canvasFilter: $("#canvasFilter"),
  cardCount: $("#cardCount"),
  transcriptList: $("#transcriptList"),
  callTimer: $("#callTimer")
};

const toolLabels = {
  canvas_show_card: "canvas.show_card",
  canvas_show_table: "canvas.show_table",
  local_search_files: "local.search_files",
  local_read_file: "local.read_file",
  search_workspace_context: "Workspace context",
  search_notion_workspace: "Notion search",
  fetch_notion_page: "Notion page",
  get_customer_context: "Customer context",
  inspect_engineering_context: "Engineering context",
  create_followup_action: "Follow-up actions",
  notion_search: "notion.search",
  notion_fetch_page: "notion.fetch_page",
  run_gstack_skill: "run_gstack_skill",
  open_chrome_tab: "open_chrome_tab",
  search_web: "search_web",
  click_link_with_vision: "click_link_with_vision",
  open_local_app: "open_local_app",
  open_web_app: "open_web_app",
  open_finder_location: "open_finder_location",
  open_terminal_workspace: "open_terminal_workspace",
  app_open_url: "app.open_url",
  app_copy_to_clipboard: "app.copy_to_clipboard"
};

const toolAliases = {
  ...toolLabels,
  "canvas.show_card": "canvas.show_card",
  "canvas.show_table": "canvas.show_table",
  "local.search_files": "local.search_files",
  "local.read_file": "local.read_file",
  "search_workspace_context": "search_workspace_context",
  "search_notion_workspace": "search_notion_workspace",
  "fetch_notion_page": "fetch_notion_page",
  "get_customer_context": "get_customer_context",
  "inspect_engineering_context": "inspect_engineering_context",
  "create_followup_action": "create_followup_action",
  "notion.search": "notion.search",
  "notion.fetch_page": "notion.fetch_page",
  "app.open_url": "app.open_url",
  "app.copy_to_clipboard": "app.copy_to_clipboard"
};

const localComputerToolNames = new Set([
  "open_chrome_tab",
  "search_web",
  "click_link_with_vision",
  "open_local_app",
  "open_web_app",
  "open_finder_location",
  "open_terminal_workspace"
]);

const arcadeToolNames = new Set([
  "search_workspace_context",
  "search_notion_workspace",
  "fetch_notion_page",
  "get_customer_context",
  "inspect_engineering_context",
  "create_followup_action"
]);

const storageKeys = {
  cardModes: "rda.canvas.cardModes.v1",
  layout: "rda.canvas.layout.v2",
  group: "rda.canvas.group.v2",
  callMode: "rda.call.mode.v1"
};

const state = {
  view: "home",
  homeFilter: "all",
  selectedTodayItem: null,
  health: null,
  store: defaultClientStore(),
  settingsStatus: null,
  manifestStatus: null,
  arcadeStatus: null,
  arcadeDiscovery: null,
  arcadeBusy: "",
  notificationStatus: null,
  lockStatus: { enabled: false, unlocked: true, ttlMinutes: 30, expiresAt: "" },
  storeMetadata: null,
  storeLoaded: false,
  storeSaveTimer: 0,
  storeSaveInFlight: false,
  storeSaveQueued: false,
  currentSessionId: "",
  currentSessionMeta: null,
  lastPostCallSessionId: "",
  selectedSessionId: "",
  sessionSearch: "",
  selectedProjectId: "",
  activeProjectId: "",
  activeProjectContextPacket: "",
  selectedArtifactId: "",
  artifactReaderMode: "preview",
  callMode: localStorage.getItem(storageKeys.callMode) || "free",
  transcriptTurns: [],
  callContext: "Free flow",
  peerConnection: null,
  dataChannel: null,
  localStream: null,
  muted: false,
  responseActive: false,
  assistantDraft: "",
  presentation: null,
  qaSeeded: false,
  callStartedAt: 0,
  callEndedAt: 0,
  timerId: 0,
  cards: [],
  cardModes: readJsonStorage(storageKeys.cardModes, {}),
  layout: localStorage.getItem(storageKeys.layout) || "auto",
  groupBy: localStorage.getItem(storageKeys.group) || "none",
  filter: "",
  mermaid: null
};

const todayMeetings = [
  {
    id: "m1",
    time: "09:30",
    duration: "45 min",
    title: "Rep velocity sprint review",
    people: "Sarah Chen \u00b7 Dev team +2",
    next: true,
    join: "Zoom",
    joinUrl: "https://zoom.us/j/0000000001",
    description: "Weekly review of the rep velocity workstream. The thesis is directionally right; today is about closing the gaps that block adoption.",
    points: [
      "Walk the updated rep velocity thesis",
      "Decide on automatic first-touch logging",
      "Lock sprint 14 scope with sales ops"
    ],
    docs: ["Rep velocity thesis", "JTBD canvas"]
  },
  {
    id: "m2",
    time: "11:00",
    duration: "30 min",
    title: "Super-prime pipeline sync",
    people: "Michael K \u00b7 Listings pod",
    join: "Google Meet",
    joinUrl: "https://meet.google.com/aaa-bbbb-ccc",
    description: "Standing sync on active super-prime inventory and where deals are stalling against forecast.",
    points: [
      "Review active super-prime units and stages",
      "Compare absorption against this month forecast",
      "Name blockers on vendor acceptance"
    ],
    docs: ["Q3 pipeline board"]
  },
  {
    id: "m3",
    time: "14:00",
    duration: "30 min",
    title: "Enrichment vendor call",
    people: "External \u00b7 Clearbit-alt",
    join: "Zoom",
    joinUrl: "https://zoom.us/j/0000000003",
    description: "Vendor walkthrough of their degradation policy and fallback terms ahead of the sales-ops decision.",
    points: [
      "Review degradation policy",
      "Clarify SLA and fallback commitments",
      "Confirm pricing per failed lookup"
    ],
    docs: ["Enrichment vendor SLA"]
  }
];

const todayTasks = [
  {
    id: "t1",
    title: "Scope requirements for first-touch logging",
    project: "Rep velocity",
    status: "In progress",
    description: "Turn the three thesis gaps into scoped, testable requirements the sales-ops team can build against.",
    points: [
      "Enforce first-touch logging within the hour",
      "Give managers passive visibility",
      "Define the enrichment fallback path"
    ],
    docs: ["Rep velocity thesis", "Scoped requirements v2"],
    deliver: "draft the scoped requirements"
  },
  {
    id: "t2",
    title: "Draft enrichment fallback map",
    project: "Data",
    status: "To do",
    description: "Map what happens to the rep workflow when each enrichment provider degrades or fails outright.",
    points: [
      "Capture each provider degradation behavior",
      "Compare manual-entry cost per failed lookup",
      "Recommend a default fallback lane"
    ],
    docs: ["Enrichment vendor SLA"],
    deliver: "draft the fallback map"
  },
  {
    id: "t3",
    title: "Add fallback lane to the service blueprint",
    project: "Ops",
    status: "To do",
    description: "Extend the service blueprint with the enrichment fallback lane Sarah flagged in review.",
    points: [
      "Insert the fallback lane end to end",
      "Show hand-offs when enrichment fails",
      "Keep it consistent with the thesis"
    ],
    docs: ["Service blueprint"],
    deliver: "update the service blueprint"
  },
  {
    id: "t4",
    title: "Refresh the JTBD canvas for the sales rep",
    project: "Rep velocity",
    status: "In progress",
    description: "Fold this week's call insights back into the jobs-to-be-done canvas for the field rep.",
    points: [
      "Update jobs with the logging friction",
      "Re-rank pains by adoption risk",
      "Note the manager visibility gap"
    ],
    docs: ["JTBD canvas"],
    deliver: "update the JTBD canvas"
  },
  {
    id: "t5",
    title: "Prep the sales-ops walkthrough deck",
    project: "Enablement",
    status: "To do",
    description: "Assemble tomorrow morning's sales-ops session deck from the latest published artifacts.",
    points: [
      "Pull the scoped requirements and fallback map",
      "Sequence a 10-minute walkthrough",
      "Flag the one decision you need from ops"
    ],
    docs: ["Scoped requirements v2", "Fallback map"],
    deliver: "build the walkthrough deck"
  }
];

const shellDestinations = {
  sessions: {
    eyebrow: "sessions",
    title: "Sessions",
    description: "Saved calls, transcript memory, and follow-up work will live here once the native store lands.",
    primaryLabel: "Start free-flow call",
    primaryAction: "call",
    metrics: [
      ["Current build", "Live call shell"],
      ["Persistence", "Sprint 2"],
      ["Transcript library", "Planned"]
    ],
    panels: [
      {
        title: "No saved sessions yet",
        body: "The next parity slice adds a local session store so ended calls, transcript turns, and canvas cards survive relaunch."
      },
      {
        title: "What will appear here",
        body: "Recent calls, active session memory, generated next actions, and links back into the call canvas."
      }
    ]
  },
  projects: {
    eyebrow: "projects",
    title: "Projects",
    description: "Project context will mirror the web app's workspace model while staying native to this app.",
    primaryLabel: "New project",
    primaryAction: "new-project",
    metrics: [
      ["Seed context", `${uniqueProjects().length} Today projects`],
      ["Source ingestion", "Sprint 3"],
      ["PDF/TXT/MD", "Ready"]
    ],
    panels: [
      {
        title: "Project model ready",
        body: "Project cards, source ingestion, source status, and Realtime context packets are available in the native store."
      },
      {
        title: "Current Today projects",
        body: uniqueProjects().join(", ")
      }
    ]
  },
  library: {
    eyebrow: "library",
    title: "Library",
    description: "Artifacts from calls, renderer cards, and post-call jobs will collect here.",
    primaryLabel: "Generate Markdown",
    primaryAction: "generate-markdown",
    metrics: [
      ["Canvas cards", "In call"],
      ["Saved artifacts", "Sprint 4"],
      ["HTML/Mermaid", "Renderer ready"]
    ],
    panels: [
      {
        title: "No durable artifacts yet",
        body: "The renderer registry is ready; Sprint 4 adds saved Markdown, HTML, Mermaid, MCP App JSON, and AIRES requirement artifacts."
      },
      {
        title: "Security baseline",
        body: "HTML is sanitized, Mermaid renders to SVG, embeds are allowlisted, and renderer failures fall back to text."
      }
    ]
  },
  operator: {
    eyebrow: "operator",
    title: "Operator",
    description: "Approval-gated task queue for local agent work, computer-use requests, logs, artifacts, and hard stops.",
    primaryLabel: "Queue task",
    primaryAction: "new-operator-task",
    metrics: [
      ["Queue", "Sprint 8"],
      ["Approvals", "Required"],
      ["Automation", "Gated"]
    ],
    panels: [
      {
        title: "No operator tasks yet",
        body: "Queue a task, approve it visibly, and watch status, logs, and artifacts persist in the native store."
      },
      {
        title: "Computer Use boundary",
        body: "Deterministic local actions can run after approval; longer-running arbitrary automation stays reserved for a supervised connector."
      }
    ]
  },
  settings: {
    eyebrow: "settings",
    title: "Settings",
    description: "Native settings will expose broker health, API-key status, workspace allowlists, and connector authorization.",
    primaryLabel: "Check broker",
    primaryAction: "health",
    metrics: [],
    panels: [
      {
        title: "Keychain and broker settings",
        body: "OpenAI key management already supports Keychain fallback in the host. Sprint 6 makes it user-editable from this screen."
      },
      {
        title: "Connector authorization",
        body: "Arcade, Notion, and write-capable tools stay disabled until approval and audit flows are implemented."
      }
    ]
  }
};
const shellViewIds = new Set(Object.keys(shellDestinations));

const rendererRegistry = {
  text: {
    label: "Text",
    render(card) {
      return { html: `<pre class="plain-text">${escapeHtml(sourceToText(card.source))}</pre>` };
    }
  },
  html: {
    label: "HTML",
    render(card) {
      return { html: sanitizeHTML(sourceToHTML(card.source)) };
    }
  },
  mermaid: {
    label: "Mermaid",
    async render(card) {
      const diagram = extractMermaidSource(card.source);
      if (!diagram) {
        throw new Error("No Mermaid diagram source found.");
      }
      const mermaid = await loadMermaid();
      const id = `mermaid-${card.id.replace(/[^\w-]/g, "")}`;
      const result = await mermaid.render(id, diagram);
      return { html: `<div class="mermaid-frame">${sanitizeSVG(result.svg)}</div>` };
    }
  },
  embed: {
    label: "Embed",
    render(card) {
      const url = extractEmbedURL(card.source);
      if (!url) {
        throw new Error("No allowlisted embed URL found.");
      }
      return {
        html: `<iframe class="canvas-embed" src="${escapeHtml(url)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-same-origin allow-popups allow-forms" allowfullscreen></iframe>`
      };
    }
  }
};

elements.homeStartCall.addEventListener("click", () => {
  enterCall("Free flow", { autoStart: true, newSession: true });
});
elements.shellStartCall.addEventListener("click", () => {
  enterCall("Free flow", { autoStart: true, newSession: true });
});
elements.shellPrimaryAction.addEventListener("click", handleShellPrimaryAction);
elements.navButtons.forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.navView || "home"));
});
elements.callModeButtons.forEach((button) => {
  button.addEventListener("click", () => setCallMode(button.dataset.callMode || "free"));
});
elements.homeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.homeFilter = tab.dataset.homeFilter || "all";
    renderHome();
  });
});
elements.detailBack.addEventListener("click", () => showView("home"));
elements.detailStartCall.addEventListener("click", () => {
  const selected = selectedTodayItem();
  enterCall(selected?.item.title || "Free flow", { autoStart: true, newSession: true });
});
elements.detailSecondary.addEventListener("click", () => {
  const selected = selectedTodayItem();
  if (selected.kind === "meeting") {
    openMeetingUrl(selected.item);
    return;
  }
  const route = elements.detailSecondary.dataset.route || (selected?.kind === "meeting" ? "sessions" : "projects");
  addEvent("Action", `${elements.detailSecondary.textContent} selected for ${selected?.item.title || "current card"}.`);
  navigate(route);
});
elements.callBackHome.addEventListener("click", () => showView("home"));
elements.startCall.addEventListener("click", startCall);
elements.endCall.addEventListener("click", endCall);
elements.muteCall.addEventListener("click", toggleMute);
elements.interruptCall.addEventListener("click", interruptResponse);
elements.askCooper.addEventListener("click", askCooper);
elements.postCallGenerateMarkdown.addEventListener("click", () => {
  createArtifactJob("markdown");
  showView("library");
});
elements.postCallGenerateHtml.addEventListener("click", () => {
  createArtifactJob("html");
  showView("library");
});
elements.postCallOpenLibrary.addEventListener("click", () => showView("library"));
elements.canvasLayout.addEventListener("change", () => {
  state.layout = elements.canvasLayout.value;
  localStorage.setItem(storageKeys.layout, state.layout);
  renderCanvas();
});
elements.canvasGroup.addEventListener("change", () => {
  state.groupBy = elements.canvasGroup.value;
  localStorage.setItem(storageKeys.group, state.groupBy);
  renderCanvas();
});
elements.canvasFilter.addEventListener("input", () => {
  state.filter = elements.canvasFilter.value.trim().toLowerCase();
  renderCanvas();
});

elements.canvasLayout.value = state.layout;
elements.canvasGroup.value = state.groupBy;

window.desktopAgentDebug = {
  addCard: (card) => addCanvasCard(card),
  cards: () => state.cards.map((card) => ({ ...card })),
  setMode: (id, mode) => setCardMode(id, mode),
  view: () => state.view,
  showView,
  openTodayItem,
  enterCall
};

window.cooperNativeNotificationStatus = (payload = {}) => {
  state.notificationStatus = payload && typeof payload === "object" ? payload : { authorizationStatus: "unknown" };
  if (state.view === "settings") {
    renderShellView("settings");
  }
};

window.addEventListener("keydown", (event) => {
  if (state.presentation) {
    if (event.key === "Escape") {
      closePresentation();
      return;
    }
    if (event.key === "ArrowRight") {
      movePresentation(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      movePresentation(-1);
      return;
    }
  }
  if (event.key === "Escape" && state.view !== "home") {
    showView("home");
  }
});

initializeApp();

async function initializeApp() {
  setCallMode(state.callMode, { silent: true });
  renderHome();
  await hydrateHealth();
  await hydrateLockStatus();
  if (isAppLocked()) {
    renderLockScreen();
    return;
  }
  const qaMode = new URLSearchParams(window.location.search).get("qa");
  continueUnlockedApp(qaMode === "canvas" ? "call" : "home");
}

function continueUnlockedApp(initialView = "home") {
  elements.lockView.hidden = true;
  showView(initialView);
  hydrateNativeStore();
  hydrateSettingsStatus();
  requestNativeNotificationStatus({ silent: true });
}

function navigate(view) {
  if (view === "call") {
    enterCall("Free flow", { autoStart: false });
    return;
  }
  showView(shellViewIds.has(view) ? view : "home");
}

function showView(view) {
  if (isAppLocked()) {
    renderLockScreen();
    return;
  }
  const nextView = shellViewIds.has(view) ? view : view === "detail" || view === "call" ? view : "home";
  state.view = nextView;
  elements.lockView.hidden = true;
  elements.homeView.hidden = nextView !== "home";
  elements.detailView.hidden = nextView !== "detail";
  elements.shellView.hidden = !shellViewIds.has(nextView);
  elements.callView.hidden = nextView !== "call";
  if (nextView === "detail") {
    renderDetail();
  }
  if (shellViewIds.has(nextView)) {
    renderShellView(nextView);
    if (["sessions", "projects", "library", "operator", "settings"].includes(nextView) && state.storeLoaded && !state.storeSaveInFlight) {
      hydrateNativeStore();
    }
  }
  updateNavState();
}

function isAppLocked() {
  return Boolean(state.lockStatus?.enabled && !state.lockStatus?.unlocked);
}

function renderLockScreen(message = "") {
  state.view = "lock";
  elements.homeView.hidden = true;
  elements.detailView.hidden = true;
  elements.shellView.hidden = true;
  elements.callView.hidden = true;
  elements.lockView.hidden = false;
  const lock = state.lockStatus || {};
  elements.lockView.innerHTML = `
    <div class="lock-shell">
      <span class="cooper-mark large" aria-hidden="true"></span>
      <p class="mono-label">local lock</p>
      <h1>Cooper is locked.</h1>
      <p>Unlock this local workspace to access sessions, projects, calls, tools, and settings.</p>
      <form id="lockUnlockForm" class="lock-form">
        <input id="lockPasswordInput" type="password" autocomplete="current-password" placeholder="Local password" autofocus>
        <button class="button-primary" type="submit">Unlock</button>
      </form>
      <span id="lockStatusText">${escapeHtml(message || lockStatusText(lock))}</span>
    </div>
  `;
  $("#lockUnlockForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    unlockLocalApp();
  });
  window.setTimeout(() => $("#lockPasswordInput")?.focus(), 0);
}

function lockStatusText(lock = state.lockStatus) {
  if (!lock?.enabled) return "Local lock is not enabled.";
  if (lock.unlocked && lock.expiresAt) return `Unlocked until ${formatDateTime(lock.expiresAt)}.`;
  return `Session expired. TTL: ${lock.ttlMinutes || 30} minutes.`;
}

async function hydrateLockStatus() {
  try {
    const response = await fetch("/api/lock", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Lock status failed: ${response.status}`);
    }
    const payload = await response.json();
    state.lockStatus = payload.lock || payload;
    if (state.view === "settings") {
      renderShellView("settings");
    }
  } catch (error) {
    addEvent("Lock", error.message || "Could not load local lock status.");
  }
}

async function unlockLocalApp() {
  const input = $("#lockPasswordInput");
  const password = input?.value || "";
  try {
    const response = await fetch("/api/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock", password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Unlock failed: ${response.status}`);
    }
    state.lockStatus = payload.lock || { enabled: false, unlocked: true };
    addEvent("Lock", payload.message || "Unlocked.");
    continueUnlockedApp("home");
  } catch (error) {
    renderLockScreen(error.message || "Unlock failed.");
  }
}

async function lockLocalApp() {
  try {
    const response = await fetch("/api/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" })
    });
    const payload = await response.json().catch(() => ({}));
    state.lockStatus = payload.lock || { enabled: true, unlocked: false };
    renderLockScreen(payload.message || "Locked.");
  } catch (error) {
    addEvent("Lock", error.message || "Could not lock Cooper.");
  }
}

function enterCall(context = "Free flow", options = {}) {
  if (options.newSession) {
    resetSessionWorkspace(context, options);
  }
  state.callContext = context || "Free flow";
  elements.callContextLabel.textContent = state.callContext;
  showView("call");
  addEvent("Session", `${state.callContext} context loaded.`);
  if (options.autoStart && !state.peerConnection && !elements.startCall.disabled) {
    window.setTimeout(() => startCall(), 0);
  }
}

function resetSessionWorkspace(context = "Free flow", options = {}) {
  state.currentSessionId = "";
  state.currentSessionMeta = null;
  state.transcriptTurns = [];
  state.cards = [];
  state.callContext = context || "Free flow";
  state.lastPostCallSessionId = "";
  state.callEndedAt = 0;
  state.activeProjectId = options.projectId || "";
  state.activeProjectContextPacket = options.projectContextPacket
    || (state.activeProjectId ? buildProjectContextPacket(state.activeProjectId) : "");
  hidePostCallPanel();
  elements.callCostState.textContent = "$0.00 est";
  renderTranscript();
  renderCanvas();
  if (state.health) {
    addWorkspaceStatusCard(state.health);
  }
}

function updateNavState() {
  const active = shellViewIds.has(state.view) ? state.view : "home";
  elements.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.navView === active);
  });
}

function setCallMode(mode, options = {}) {
  state.callMode = normalizeCallMode(mode);
  localStorage.setItem(storageKeys.callMode, state.callMode);
  elements.callModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.callMode === state.callMode);
  });
  updateCallModeUI();
  if (!options.silent) {
    addEvent("Call mode", callModeLabel());
  }
}

function callModeLabel() {
  return callModeLabelFor(state.callMode);
}

function callModeLabelFor(mode) {
  if (mode === "manual") return "Ask Cooper";
  if (mode === "wake") return "Wake phrase";
  return "Free flow";
}

function normalizeCallMode(mode) {
  return ["free", "manual", "wake"].includes(mode) ? mode : "free";
}

function updateCallModeUI() {
  elements.callModeState.textContent = callModeLabel();
  elements.askCooper.disabled = state.callMode === "free"
    || state.responseActive
    || !state.dataChannel
    || state.dataChannel.readyState !== "open";
}

function renderHome() {
  elements.homeTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.homeFilter === state.homeFilter);
  });

  const showMeetings = state.homeFilter === "all" || state.homeFilter === "meetings";
  const showTasks = state.homeFilter === "all" || state.homeFilter === "tasks";
  elements.homeMeetingsSection.hidden = !showMeetings;
  elements.homeTasksSection.hidden = !showTasks;

  elements.homeMeetings.replaceChildren(...todayMeetings.map(renderMeetingRow));
  elements.homeTasks.replaceChildren(...todayTasks.map(renderTaskRow));
}

function renderShellView(view) {
  const destination = shellDestinations[view] || shellDestinations.sessions;
  elements.shellView.setAttribute("aria-label", destination.title);
  elements.shellEyebrow.textContent = destination.eyebrow;
  elements.shellTitle.textContent = destination.title;
  elements.shellDescription.textContent = destination.description;
  elements.shellPrimaryAction.textContent = destination.primaryLabel;
  elements.shellPrimaryAction.dataset.action = destination.primaryAction;

  const metrics = shellMetricsFor(view, destination);
  elements.shellMetrics.replaceChildren(...metrics.map(([label, value]) => {
    const metric = document.createElement("div");
    metric.className = "shell-metric";
    metric.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    return metric;
  }));

  elements.shellBody.classList.toggle("project-board", view === "projects");
  elements.shellBody.classList.toggle("sessions-board", view === "sessions");
  elements.shellBody.classList.toggle("library-board", view === "library");
  elements.shellBody.classList.toggle("operator-board", view === "operator");
  elements.shellBody.classList.toggle("settings-board", view === "settings");
  if (view === "sessions") {
    renderSessionsBody();
    return;
  }
  if (view === "projects") {
    renderProjectsBody();
    return;
  }
  if (view === "library") {
    renderLibraryBody();
    return;
  }
  if (view === "operator") {
    renderOperatorBody();
    return;
  }
  if (view === "settings") {
    renderSettingsBody();
    return;
  }

  elements.shellBody.replaceChildren(...shellPanelsFor(view, destination).map((panel) => {
    const article = document.createElement("article");
    article.className = panel.sessionId ? "shell-panel session-record" : "shell-panel";
    article.innerHTML = `
      <h2>${escapeHtml(panel.title)}</h2>
      <p>${escapeHtml(panel.body)}</p>
    `;
    if (panel.sessionId) {
      const action = document.createElement("button");
      action.className = "button-secondary shell-panel-action";
      action.type = "button";
      action.textContent = "Open session";
      action.addEventListener("click", () => restoreSession(panel.sessionId));
      article.append(action);
    }
    return article;
  }));
}

function shellMetricsFor(view, destination) {
  if (view === "settings") {
    return settingsMetrics();
  }
  if (view === "sessions") {
    const sessions = state.store.sessions || [];
    const latest = sessions[0];
    return [
      ["Saved sessions", String(sessions.length)],
      ["Latest", latest ? formatDateTime(latest.updatedAt || latest.startedAt) : "None"],
      ["Persistence", state.storeLoaded ? "File-backed" : "Loading"]
    ];
  }
  if (view === "projects") {
    const projects = projectRecords();
    const sourceCount = projects.reduce((sum, project) => sum + (project.sources?.length || 0), 0);
    return [
      ["Projects", String(projects.length)],
      ["Sources", String(sourceCount)],
      ["Active", activeProject()?.title || "None"],
      ["Context", activeProject()?.sources?.length ? "Ready" : "Needs sources"]
    ];
  }
  if (view === "library") {
    const artifacts = artifactRecords();
    const jobs = jobRecords();
    const latest = artifacts[0];
    return [
      ["Artifacts", String(artifacts.length)],
      ["Jobs", String(jobs.length)],
      ["Latest", latest ? formatDateTime(latest.updatedAt || latest.createdAt) : "None"],
      ["Preview", selectedArtifact() ? selectedArtifact().kind : "None"]
    ];
  }
  if (view === "operator") {
    const tasks = operatorTaskRecords();
    const active = tasks.filter((task) => ["queued", "approval_required", "running", "blocked"].includes(task.status));
    return [
      ["Tasks", String(tasks.length)],
      ["Active", String(active.length)],
      ["Approvals", String(tasks.filter((task) => task.status === "approval_required").length)],
      ["Running", String(tasks.filter((task) => task.status === "running").length)]
    ];
  }
  return destination.metrics;
}

function shellPanelsFor(view, destination) {
  return destination.panels;
}

function renderSessionsBody() {
  const sessions = sessionRecords();
  const selected = sessions.find((session) => session.id === state.selectedSessionId) || sessions[0] || null;
  if (selected && state.selectedSessionId !== selected.id) {
    state.selectedSessionId = selected.id;
  }

  elements.shellBody.replaceChildren();

  const search = document.createElement("section");
  search.className = "session-search-panel";
  search.innerHTML = `
    <h2>Saved sessions</h2>
    <input id="sessionSearchInput" type="search" placeholder="Search sessions, transcripts, cards" value="${escapeHtml(state.sessionSearch)}">
    <div class="session-search-meta">
      <span>${sessions.length} match${sessions.length === 1 ? "" : "es"}</span>
      <span>${state.store.sessions?.length || 0} saved</span>
    </div>
  `;

  const list = document.createElement("section");
  list.className = "session-list";
  if (!sessions.length) {
    const empty = document.createElement("article");
    empty.className = "session-record empty";
    empty.innerHTML = state.store.sessions?.length
      ? "<h2>No matching sessions</h2><p>Try a title, context, transcript phrase, or card title.</p>"
      : "<h2>No saved sessions yet</h2><p>End a call to save transcript and canvas state here.</p>";
    list.append(empty);
  } else {
    list.append(...sessions.map(renderSessionRecord));
  }

  const detail = document.createElement("section");
  detail.className = "session-detail-panel";
  detail.innerHTML = selected ? renderSessionDetail(selected) : `
    <header>
      <span>session detail</span>
      <h2>Select a saved session</h2>
    </header>
    <p class="session-empty">Saved transcripts, canvas cards, and session metadata reopen here.</p>
  `;

  elements.shellBody.append(search, list, detail);
  wireSessionControls(selected);
}

function renderSessionRecord(session) {
  const article = document.createElement("article");
  article.className = `session-record${session.id === state.selectedSessionId ? " selected" : ""}`;
  article.innerHTML = `
    <div>
      <h2>${escapeHtml(session.title || "Untitled session")}</h2>
      <p>${escapeHtml(session.summary || session.context || "Free flow")}</p>
      <span>${escapeHtml(session.status || "saved")} · ${formatDateTime(session.updatedAt || session.startedAt)} · ${session.transcriptTurns?.length || 0} turns · ${session.canvasCards?.length || 0} cards</span>
    </div>
    <button class="button-secondary compact" type="button">Open</button>
  `;
  article.addEventListener("click", () => {
    state.selectedSessionId = session.id;
    renderShellView("sessions");
  });
  article.querySelector("button")?.addEventListener("click", (event) => {
    event.stopPropagation();
    restoreSession(session.id);
  });
  return article;
}

function renderSessionDetail(session) {
  const turns = Array.isArray(session.transcriptTurns) ? session.transcriptTurns.slice(-8) : [];
  const cards = Array.isArray(session.canvasCards) ? session.canvasCards.slice(0, 6) : [];
  return `
    <header>
      <span>${escapeHtml(session.status || "saved")} · ${formatDateTime(session.updatedAt || session.startedAt)}</span>
      <h2>${escapeHtml(session.title || "Untitled session")}</h2>
      <p>${escapeHtml(session.summary || session.context || "Free flow")}</p>
      <div class="session-detail-actions">
        <button id="sessionRestoreButton" class="button-primary" type="button">Restore session</button>
        <button id="sessionFollowUpButton" class="button-secondary" type="button">Start follow-up</button>
        <button id="sessionLibraryButton" class="button-secondary" type="button">Open Library</button>
      </div>
    </header>
    <div class="session-detail-grid">
      ${settingsRow("Context", session.context || "Free flow")}
      ${settingsRow("Started", formatDateTime(session.startedAt))}
      ${settingsRow("Ended", session.endedAt ? formatDateTime(session.endedAt) : "Not ended")}
      ${settingsRow("Mode", callModeLabelFor(session.callMode || "free"))}
      ${settingsRow("Estimated cost", session.estimatedCost || "$0.00")}
      ${settingsRow("Project", session.projectId || "None")}
    </div>
    <section class="session-transcript-preview">
      <h3>Transcript</h3>
      ${turns.length ? turns.map(renderSessionTurnPreview).join("") : "<p>No transcript turns saved.</p>"}
    </section>
    <section class="session-card-preview">
      <h3>Canvas cards</h3>
      ${cards.length ? cards.map(renderSessionCardPreview).join("") : "<p>No canvas cards saved.</p>"}
    </section>
  `;
}

function renderSessionTurnPreview(turn) {
  return `
    <article>
      <strong>${escapeHtml(turn.speaker || turn.kind || "turn")}</strong>
      <p>${escapeHtml(turn.text || "")}</p>
    </article>
  `;
}

function renderSessionCardPreview(card) {
  const meta = [card.kind || "card", card.mode || card.defaultMode, ...(card.tags || [])].filter(Boolean).join(" · ");
  return `
    <article>
      <strong>${escapeHtml(card.title || "Untitled card")}</strong>
      <span>${escapeHtml(meta)}</span>
    </article>
  `;
}

function wireSessionControls(selected) {
  $("#sessionSearchInput")?.addEventListener("input", (event) => {
    const cursor = event.currentTarget.selectionStart || 0;
    state.sessionSearch = event.currentTarget.value || "";
    renderShellView("sessions");
    queueMicrotask(() => {
      const input = $("#sessionSearchInput");
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
  });
  $("#sessionRestoreButton")?.addEventListener("click", () => {
    if (selected) {
      restoreSession(selected.id);
    }
  });
  $("#sessionFollowUpButton")?.addEventListener("click", () => {
    if (selected) {
      state.activeProjectId = selected.projectId || "";
      state.activeProjectContextPacket = selected.projectContextPacket || "";
      enterCall(selected.context || selected.title || "Follow-up session", { autoStart: true });
    }
  });
  $("#sessionLibraryButton")?.addEventListener("click", () => showView("library"));
}

function sessionRecords() {
  const query = state.sessionSearch.trim().toLowerCase();
  const sessions = Array.isArray(state.store.sessions) ? [...state.store.sessions].sort(compareSessions) : [];
  if (!query) {
    return sessions;
  }
  return sessions.filter((session) => sessionSearchText(session).includes(query));
}

function selectedSession() {
  return (Array.isArray(state.store.sessions) ? state.store.sessions : []).find((session) => session.id === state.selectedSessionId) || null;
}

function sessionSearchText(session) {
  return [
    session.title,
    session.context,
    session.summary,
    session.status,
    session.callMode,
    ...(session.transcriptTurns || []).map((turn) => `${turn.speaker || ""} ${turn.text || ""}`),
    ...(session.canvasCards || []).map((card) => `${card.title || ""} ${card.kind || ""} ${card.source || card.body || ""}`)
  ].join(" ").toLowerCase();
}

function renderProjectsBody() {
  const projects = projectRecords();
  const selected = selectedProject() || (state.selectedProjectId === "__new__" ? null : projects[0] || null);
  if (selected && state.selectedProjectId !== selected.id) {
    state.selectedProjectId = selected.id;
  }

  elements.shellBody.replaceChildren();
  elements.shellBody.classList.add("project-board");

  const composer = document.createElement("section");
  composer.className = "project-composer";
  composer.innerHTML = `
    <h2>Project context</h2>
    <input id="projectTitleInput" type="text" placeholder="Project name" value="${escapeHtml(selected?.title || "")}">
    <textarea id="projectSummaryInput" rows="4" placeholder="Brief context">${escapeHtml(selected?.summary || "")}</textarea>
    <div class="project-actions">
      <button id="projectSaveButton" class="button-primary" type="button">${selected ? "Save project" : "Create project"}</button>
      <button id="projectCallButton" class="button-secondary" type="button" ${selected ? "" : "disabled"}>Start with context</button>
    </div>
  `;

  const sourceComposer = document.createElement("section");
  sourceComposer.className = "project-composer source-composer";
  sourceComposer.innerHTML = `
    <h2>Sources</h2>
    <input id="sourceTitleInput" type="text" placeholder="Source title">
    <select id="sourceKindInput" aria-label="Source kind">
      <option value="paste">Paste</option>
      <option value="markdown">Markdown</option>
      <option value="txt">TXT</option>
      <option value="pdf">PDF</option>
    </select>
    <textarea id="sourceContentInput" rows="6" placeholder="Paste context, notes, Markdown, or TXT content"></textarea>
    <input id="sourceFileInput" type="file" accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf">
    <button id="sourceAddButton" class="button-primary" type="button" ${selected ? "" : "disabled"}>Add source</button>
  `;

  const list = document.createElement("section");
  list.className = "project-list";
  list.append(...projects.map(renderProjectRecord));

  const sources = document.createElement("section");
  sources.className = "project-sources";
  sources.innerHTML = `<h2>${escapeHtml(selected?.title || "No project selected")}</h2>`;
  if (!selected?.sources?.length) {
    const empty = document.createElement("p");
    empty.className = "project-empty";
    empty.textContent = "No sources yet.";
    sources.append(empty);
  } else {
    for (const source of selected.sources) {
      sources.append(renderSourceRecord(source));
    }
  }

  elements.shellBody.append(composer, sourceComposer, list, sources);
  wireProjectControls(selected);
}

function renderLibraryBody() {
  const artifacts = artifactRecords();
  const selected = selectedArtifact() || artifacts[0] || null;
  if (selected && state.selectedArtifactId !== selected.id) {
    state.selectedArtifactId = selected.id;
  }

  elements.shellBody.replaceChildren();
  const controls = document.createElement("section");
  controls.className = "artifact-controls";
  controls.innerHTML = `
    <h2>Create artifact</h2>
    <p>Generate a saved artifact from the active session, restored session, or selected project context.</p>
    <div class="artifact-actions">
      <button class="button-primary" type="button" data-artifact-kind="markdown">Markdown</button>
      <button class="button-secondary" type="button" data-artifact-kind="html">HTML</button>
      <button class="button-secondary" type="button" data-artifact-kind="mermaid">Mermaid</button>
      <button class="button-secondary" type="button" data-artifact-kind="mcp_app">MCP App</button>
    </div>
    <div class="aires-mode-panel">
      <h3>AIRES requirements</h3>
      <p>Run the framework as a focused artifact mode.</p>
      <div class="aires-mode-grid">
        ${airesRequirementModes().map((mode) => `
          <button class="button-secondary" type="button" data-aires-mode="${escapeHtml(mode.id)}">
            <strong>${escapeHtml(mode.label)}</strong>
            <span>${escapeHtml(mode.short)}</span>
          </button>
        `).join("")}
      </div>
      <div class="aires-live-actions">
        <button class="button-primary" type="button" data-aires-live="workshop">Start workshop call</button>
        <button class="button-secondary" type="button" data-aires-live="interview">Start interview call</button>
      </div>
    </div>
  `;

  const list = document.createElement("section");
  list.className = "artifact-list";
  if (!artifacts.length) {
    const empty = document.createElement("article");
    empty.className = "artifact-record";
    empty.innerHTML = "<h2>No artifacts yet</h2><p>Generate Markdown or HTML from a session to create the first durable Library item.</p>";
    list.append(empty);
  } else {
    list.append(...artifacts.map(renderArtifactRecord));
  }

  const preview = document.createElement("section");
  preview.className = "artifact-preview";
  const readerMode = artifactReaderMode();
  preview.innerHTML = selected
    ? `
      <header>
        <div>
          <span>${escapeHtml(selected.kind)}</span>
          <h2>${escapeHtml(selected.title)}</h2>
        </div>
        <div class="artifact-preview-actions">
          <div class="artifact-reader-tabs" aria-label="Artifact reader mode">
            ${artifactReaderModes().map((mode) => `
              <button class="${mode.id === readerMode ? "is-active" : ""}" type="button" data-artifact-reader="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}</button>
            `).join("")}
          </div>
          <button id="artifactPresent" class="button-secondary" type="button">Present</button>
          <button id="artifactAddToCanvas" class="button-secondary" type="button">Add to canvas</button>
        </div>
      </header>
      <div id="artifactPreviewBody" class="artifact-preview-body">Rendering</div>
    `
    : `
      <header><div><span>library</span><h2>Select an artifact</h2></div></header>
      <div class="artifact-preview-body empty">Saved artifacts reopen here.</div>
    `;

  const jobs = document.createElement("section");
  jobs.className = "job-list";
  jobs.innerHTML = "<h2>Recent jobs</h2>";
  const records = jobRecords().slice(0, 6);
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "project-empty";
    empty.textContent = "No jobs yet.";
    jobs.append(empty);
  } else {
    jobs.append(...records.map(renderJobRecord));
  }

  elements.shellBody.append(controls, list, preview, jobs);
  controls.querySelectorAll("[data-artifact-kind]").forEach((button) => {
    button.addEventListener("click", () => createArtifactJob(button.dataset.artifactKind || "markdown"));
  });
  controls.querySelectorAll("[data-aires-mode]").forEach((button) => {
    button.addEventListener("click", () => createArtifactJob("aires_requirements", { mode: button.dataset.airesMode || "list" }));
  });
  controls.querySelectorAll("[data-aires-live]").forEach((button) => {
    button.addEventListener("click", () => startAiresFacilitation(button.dataset.airesLive || "workshop"));
  });
  $("#artifactAddToCanvas")?.addEventListener("click", () => {
    if (selected) {
      addCanvasCard(artifactToCard(selected));
      addEvent("Library", `${selected.title} added to canvas.`);
    }
  });
  $("#artifactPresent")?.addEventListener("click", () => {
    if (selected) {
      startArtifactPresentation(selected);
    }
  });
  preview.querySelectorAll("[data-artifact-reader]").forEach((button) => {
    button.addEventListener("click", () => {
      state.artifactReaderMode = button.dataset.artifactReader || "preview";
      renderShellView("library");
    });
  });
  if (selected) {
    queueMicrotask(() => renderArtifactPreview(selected));
  }
}

function renderArtifactRecord(artifact) {
  const article = document.createElement("article");
  article.className = `artifact-record${artifact.id === state.selectedArtifactId ? " selected" : ""}`;
  article.innerHTML = `
    <h2>${escapeHtml(artifact.title)}</h2>
    <p>${escapeHtml(artifact.summary || artifact.kind)}</p>
    <span>${escapeHtml(artifact.kind)}${artifact.mode ? ` · ${escapeHtml(airesModeLabel(artifact.mode))}` : ""} · ${formatDateTime(artifact.updatedAt || artifact.createdAt)}</span>
  `;
  const actions = document.createElement("div");
  actions.className = "artifact-record-actions";
  const open = document.createElement("button");
  open.className = "button-secondary";
  open.type = "button";
  open.textContent = "Open";
  open.addEventListener("click", () => {
    state.selectedArtifactId = artifact.id;
    renderShellView("library");
  });
  const canvas = document.createElement("button");
  canvas.className = "button-primary compact";
  canvas.type = "button";
  canvas.textContent = "Canvas";
  canvas.addEventListener("click", () => {
    addCanvasCard(artifactToCard(artifact));
    addEvent("Library", `${artifact.title} added to canvas.`);
  });
  const present = document.createElement("button");
  present.className = "button-secondary compact";
  present.type = "button";
  present.textContent = "Present";
  present.addEventListener("click", () => startArtifactPresentation(artifact));
  actions.append(open, canvas, present);
  article.append(actions);
  return article;
}

function renderJobRecord(job) {
  const article = document.createElement("article");
  article.className = `job-record ${job.status}`;
  article.innerHTML = `
    <strong>${escapeHtml(job.title)}</strong>
    <span>${escapeHtml(job.status)} · ${job.mode ? `${escapeHtml(airesModeLabel(job.mode))} · ` : ""}${escapeHtml(job.progress || job.kind)} · ${escapeHtml(job.provider || "pending")} · ${formatDateTime(job.updatedAt || job.createdAt)}</span>
  `;
  if (canRetryResponsesJob(job)) {
    const actions = document.createElement("div");
    actions.className = "job-record-actions";
    const retry = document.createElement("button");
    retry.className = "button-secondary compact";
    retry.type = "button";
    retry.textContent = "Retry Responses";
    retry.addEventListener("click", () => retryResponsesJob(job.id));
    actions.append(retry);
    article.append(actions);
  }
  return article;
}

async function renderArtifactPreview(artifact) {
  const body = $("#artifactPreviewBody");
  if (!body) return;
  body.innerHTML = "";
  const readerMode = artifactReaderMode();
  if (readerMode === "source") {
    body.innerHTML = renderArtifactSource(artifact);
    return;
  }
  if (readerMode === "metadata") {
    body.innerHTML = renderArtifactMetadata(artifact);
    return;
  }
  if (artifact.kind === "mcp_app") {
    body.innerHTML = renderMcpAppPreview(artifact);
    return;
  }
  const card = artifactToCard(artifact);
  const mode = artifact.kind === "mermaid" ? "mermaid" : artifact.kind === "html" || artifact.kind === "aires_requirements" ? "html" : "text";
  const renderer = rendererRegistry[mode] || rendererRegistry.text;
  try {
    const output = await renderer.render(card);
    body.innerHTML = output.html;
  } catch (error) {
    body.innerHTML = `
      <div class="render-error">${escapeHtml(error.message || "Rendering failed.")}</div>
      ${rendererRegistry.text.render(card).html}
    `;
  }
}

function artifactReaderModes() {
  return [
    { id: "preview", label: "Preview" },
    { id: "source", label: "Source" },
    { id: "metadata", label: "Metadata" }
  ];
}

function artifactReaderMode() {
  return artifactReaderModes().some((mode) => mode.id === state.artifactReaderMode)
    ? state.artifactReaderMode
    : "preview";
}

function renderArtifactSource(artifact) {
  const source = sourceToText(artifact.source);
  return `
    <article class="artifact-source-reader">
      <header>
        <span>${escapeHtml(artifact.source?.format || artifact.outputType || artifact.kind || "source")}</span>
        <h3>Canonical source</h3>
      </header>
      <pre class="plain-text artifact-source-view">${escapeHtml(source || "No source saved.")}</pre>
    </article>
  `;
}

function renderArtifactMetadata(artifact) {
  const rows = [
    ["Kind", artifact.kind || ""],
    ["Mode", artifact.mode ? airesModeLabel(artifact.mode) : "Default"],
    ["Output", artifact.outputType || artifact.source?.format || ""],
    ["Provider", artifact.generationProvider || "local"],
    ["Response model", artifact.responseModel || "None"],
    ["Response request", artifact.responseRequestId || "None"],
    ["Job", artifact.jobId || "None"],
    ["Session", artifact.sessionId || "None"],
    ["Project", artifact.projectId || "None"],
    ["Tags", Array.isArray(artifact.tags) ? artifact.tags.join(", ") : ""],
    ["Created", formatDateTime(artifact.createdAt)],
    ["Updated", formatDateTime(artifact.updatedAt || artifact.createdAt)],
    ["Usage", artifact.responseUsage ? JSON.stringify(artifact.responseUsage) : "None"]
  ];
  return `
    <article class="artifact-metadata-reader">
      <h3>Artifact metadata</h3>
      <div class="artifact-meta-grid">
        ${rows.map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || "None")}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function startArtifactPresentation(artifact) {
  const slides = artifactPresentationSlides(artifact);
  state.presentation = {
    artifactId: artifact.id,
    title: artifact.title,
    index: 0,
    slides
  };
  renderPresentationOverlay();
  recordAudit("presentation", "Presentation opened", `${artifact.title} · ${slides.length} slide${slides.length === 1 ? "" : "s"}`);
}

function artifactPresentationSlides(artifact) {
  const source = artifact.source?.format === "html"
    ? htmlToPlainText(sourceToText(artifact.source))
    : sourceToText(artifact.source);
  const text = String(source || artifact.summary || artifact.title || "Untitled artifact").trim();
  const sections = text
    .split(/(?=^#{1,2}\s+)/m)
    .map((section) => section.trim())
    .filter(Boolean);
  const rawSlides = sections.length > 1 ? sections : chunkPresentationText(text);
  const slides = rawSlides.map((section, index) => {
    const lines = section.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const heading = lines[0]?.match(/^#{1,2}\s+(.+)$/)?.[1] || (index === 0 ? artifact.title : `Slide ${index + 1}`);
    const body = lines[0]?.match(/^#{1,2}\s+/) ? lines.slice(1).join("\n") : lines.join("\n");
    return {
      title: heading || artifact.title || `Slide ${index + 1}`,
      body: body || artifact.summary || "No slide content."
    };
  }).slice(0, 18);
  return slides.length ? slides : [{ title: artifact.title || "Artifact", body: "No presentation content." }];
}

function chunkPresentationText(text) {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return ["No presentation content."];
  }
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current.length + paragraph.length) > 720 && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  return doc.body.textContent || "";
}

function renderPresentationOverlay() {
  const presentation = state.presentation;
  if (!presentation) return;
  let overlay = $("#presentationOverlay");
  if (!overlay) {
    overlay = document.createElement("section");
    overlay.id = "presentationOverlay";
    overlay.className = "presentation-overlay";
    overlay.setAttribute("aria-label", "Artifact presentation");
    document.body.append(overlay);
  }
  const slide = presentation.slides[presentation.index] || presentation.slides[0];
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="presentation-stage">
      <header>
        <div>
          <span>${escapeHtml(presentation.title)}</span>
          <h2>${escapeHtml(slide.title)}</h2>
        </div>
        <button class="button-secondary compact" type="button" data-presentation-close>Close</button>
      </header>
      <article class="presentation-slide">
        ${sanitizeHTML(markdownToHTML(slide.body))}
      </article>
      <footer>
        <button class="button-secondary" type="button" data-presentation-prev ${presentation.index <= 0 ? "disabled" : ""}>Previous</button>
        <span>${presentation.index + 1} / ${presentation.slides.length}</span>
        <button class="button-primary" type="button" data-presentation-next ${presentation.index >= presentation.slides.length - 1 ? "disabled" : ""}>Next</button>
      </footer>
    </div>
  `;
  overlay.querySelector("[data-presentation-close]")?.addEventListener("click", closePresentation);
  overlay.querySelector("[data-presentation-prev]")?.addEventListener("click", () => movePresentation(-1));
  overlay.querySelector("[data-presentation-next]")?.addEventListener("click", () => movePresentation(1));
}

function movePresentation(delta) {
  if (!state.presentation) return;
  const lastIndex = state.presentation.slides.length - 1;
  state.presentation.index = Math.min(lastIndex, Math.max(0, state.presentation.index + delta));
  renderPresentationOverlay();
}

function closePresentation() {
  state.presentation = null;
  const overlay = $("#presentationOverlay");
  if (overlay) {
    overlay.hidden = true;
    overlay.innerHTML = "";
  }
}

function renderMcpAppPreview(artifact) {
  const raw = sourceToText(artifact.source);
  try {
    const manifest = JSON.parse(raw);
    const app = manifest.app && typeof manifest.app === "object" ? manifest.app : {};
    const tools = Array.isArray(manifest.tools) ? manifest.tools.slice(0, 8) : [];
    const resources = Array.isArray(manifest.resources) ? manifest.resources.slice(0, 8) : [];
    const approvals = Array.isArray(manifest.approvals) ? manifest.approvals.slice(0, 8) : [];
    return `
      <article class="mcp-preview">
        <header>
          <span>${escapeHtml(manifest.schema || "mcp-app-preview")}</span>
          <h1>${escapeHtml(app.name || artifact.title)}</h1>
          <p>${escapeHtml(app.description || "Preview-only MCP App artifact generated from native Cooper context.")}</p>
        </header>
        <section>
          <h2>Runtime boundary</h2>
          <div class="mcp-grid">
            ${mcpMeta("Execution", app.execution || "preview_only_no_network")}
            ${mcpMeta("Permission", (app.permissions || ["read_context"]).join(", "))}
            ${mcpMeta("Generated", app.generatedAt || artifact.createdAt || "")}
          </div>
        </section>
        <section>
          <h2>Tools</h2>
          ${tools.length ? tools.map(renderMcpTool).join("") : `<p class="mcp-empty">No tools declared.</p>`}
        </section>
        <section>
          <h2>Resources</h2>
          ${resources.length ? resources.map(renderMcpResource).join("") : `<p class="mcp-empty">No resources declared.</p>`}
        </section>
        <section>
          <h2>Approvals</h2>
          <ul>${htmlList(approvals.length ? approvals : ["External execution is disabled in this preview artifact."])}</ul>
        </section>
        <details>
          <summary>Source JSON</summary>
          <pre class="plain-text">${escapeHtml(raw)}</pre>
        </details>
      </article>
    `;
  } catch (error) {
    return `
      <div class="render-error">${escapeHtml(error.message || "Invalid MCP App JSON.")}</div>
      <pre class="plain-text">${escapeHtml(raw)}</pre>
    `;
  }
}

function mcpMeta(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not declared")}</strong></div>`;
}

function renderMcpTool(tool) {
  const inputSchema = tool.inputSchema && typeof tool.inputSchema === "object" ? JSON.stringify(tool.inputSchema) : "No input schema";
  return `
    <article class="mcp-item">
      <strong>${escapeHtml(tool.name || "tool")}</strong>
      <p>${escapeHtml(tool.description || "No description.")}</p>
      <span>${escapeHtml(tool.safety || tool.approval || "approval required")} · ${escapeHtml(inputSchema.slice(0, 160))}</span>
    </article>
  `;
}

function renderMcpResource(resource) {
  return `
    <article class="mcp-item">
      <strong>${escapeHtml(resource.name || resource.uri || "resource")}</strong>
      <p>${escapeHtml(resource.description || resource.text || "No description.")}</p>
      <span>${escapeHtml(resource.uri || resource.type || "context")}</span>
    </article>
  `;
}

function artifactRecords() {
  return (Array.isArray(state.store.artifacts) ? state.store.artifacts : []).sort(compareArtifacts);
}

function jobRecords() {
  return (Array.isArray(state.store.jobs) ? state.store.jobs : []).sort(compareArtifacts);
}

function selectedArtifact() {
  return artifactRecords().find((artifact) => artifact.id === state.selectedArtifactId) || null;
}

function compareArtifacts(a, b) {
  return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function renderOperatorBody() {
  const tasks = operatorTaskRecords();
  elements.shellBody.replaceChildren();

  const composer = document.createElement("section");
  composer.className = "operator-composer";
  composer.innerHTML = `
    <h2>Queue task</h2>
    <p>Automation cannot begin until you approve the queued task.</p>
    <label>
      <span>Task</span>
      <input id="operatorTaskTitle" type="text" placeholder="Draft a follow-up plan from the current session">
    </label>
    <label>
      <span>Lane</span>
      <select id="operatorTaskKind">
        <option value="operator">Operator</option>
        <option value="computer_use">Computer Use</option>
        <option value="push_to_talk">Push-to-talk routing</option>
      </select>
    </label>
    <label>
      <span>Risk</span>
      <select id="operatorTaskRisk">
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="high">High</option>
      </select>
    </label>
    <div class="operator-actions">
      <button id="operatorQueueTask" class="button-primary" type="button">Queue</button>
      <button id="operatorStopAll" class="button-secondary" type="button">Stop all</button>
    </div>
  `;

  const lane = document.createElement("section");
  lane.className = "operator-lane";
  lane.innerHTML = "<h2>Task queue</h2>";
  if (!tasks.length) {
    const empty = document.createElement("article");
    empty.className = "operator-task";
    empty.innerHTML = "<strong>No queued work</strong><p>Queue an Operator or Computer Use task to create the first approval record.</p>";
    lane.append(empty);
  } else {
    lane.append(...tasks.map(renderOperatorTask));
  }

  const logPanel = document.createElement("section");
  logPanel.className = "operator-log-panel";
  logPanel.innerHTML = "<h2>Latest activity</h2>";
  const logs = tasks.flatMap((task) => (task.logs || []).map((log) => ({ ...log, taskTitle: task.title }))).sort(compareArtifacts).slice(0, 10);
  if (!logs.length) {
    const empty = document.createElement("p");
    empty.className = "project-empty";
    empty.textContent = "No operator logs yet.";
    logPanel.append(empty);
  } else {
    logPanel.append(...logs.map((log) => {
      const row = document.createElement("article");
      row.className = `operator-log ${log.level || "info"}`;
      row.innerHTML = `
        <strong>${escapeHtml(log.taskTitle || "Operator")}</strong>
        <span>${escapeHtml(log.level || "info")} · ${formatDateTime(log.createdAt)}</span>
        <p>${escapeHtml(log.message || "")}</p>
      `;
      return row;
    }));
  }

  const boundary = document.createElement("section");
  boundary.className = "operator-boundary";
  boundary.innerHTML = `
    <h2>Automation boundary</h2>
    <p>Computer Use can run deterministic approved local actions such as opening apps, browser tabs, Finder, and Terminal. Longer-running desktop automation still requires a future supervised connector.</p>
  `;

  elements.shellBody.append(composer, lane, logPanel, boundary);
  $("#operatorQueueTask")?.addEventListener("click", queueOperatorTask);
  $("#operatorStopAll")?.addEventListener("click", stopAllOperatorTasks);
}

function renderOperatorTask(task) {
  const article = document.createElement("article");
  article.className = `operator-task ${task.status}`;
  article.innerHTML = `
    <div>
      <span>${escapeHtml(operatorKindLabel(task.kind))} · ${escapeHtml(task.risk || "medium")} risk</span>
      <strong>${escapeHtml(task.title)}</strong>
      <p>${escapeHtml(task.summary || operatorStatusCopy(task))}</p>
    </div>
    <div class="operator-status">
      <span>${escapeHtml(task.status.replaceAll("_", " "))}</span>
      <small>${escapeHtml(formatDateTime(task.updatedAt || task.createdAt))}</small>
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "operator-actions";
  if (task.status === "approval_required") {
    actions.append(operatorActionButton("Approve", "button-primary compact", () => approveOperatorTask(task.id)));
    actions.append(operatorActionButton("Reject", "button-secondary compact", () => stopOperatorTask(task.id, "rejected before automation began")));
  }
  if (["queued", "approval_required", "running", "blocked"].includes(task.status)) {
    actions.append(operatorActionButton("Stop", "button-secondary compact", () => stopOperatorTask(task.id, "stopped by user")));
  }
  if (task.artifacts?.length) {
    actions.append(operatorActionButton("Library", "button-secondary compact", () => {
      state.selectedArtifactId = task.artifacts[0].artifactId;
      renderShellView("library");
    }));
  }
  article.append(actions);
  return article;
}

function operatorActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function queueOperatorTask() {
  const title = $("#operatorTaskTitle")?.value?.trim() || "Review current session and propose next actions";
  const kind = $("#operatorTaskKind")?.value || "operator";
  const risk = $("#operatorTaskRisk")?.value || "medium";
  const now = new Date().toISOString();
  const task = {
    id: `operator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    kind,
    risk,
    status: "approval_required",
    summary: operatorQueuedSummary(kind),
    logs: [operatorLog("approval", `Queued and waiting for approval: ${title}`)],
    artifacts: [],
    createdAt: now,
    updatedAt: now
  };
  upsertOperatorTask(task);
  recordAudit("operator", "Operator task queued", `${operatorKindLabel(kind)}: ${title}`);
  addEvent("Operator", `${title} queued for approval.`);
  notifyNative("Approval needed", `${operatorKindLabel(kind)} task queued: ${title}`, "operator");
  renderShellView("operator");
}

async function approveOperatorTask(id) {
  const task = operatorTaskById(id);
  if (!task) return;
  const now = new Date().toISOString();
  const approved = appendOperatorLog({
    ...task,
    status: "running",
    approvedAt: now,
    updatedAt: now
  }, "approval", "Approved by user. Automation gate opened.");

  if (approved.kind === "computer_use") {
    upsertOperatorTask(approved);
    renderShellView("operator");
    const executed = await executeComputerUseOperatorTask(approved);
    upsertOperatorTask(executed);
    const ok = executed.status === "completed";
    recordAudit("operator", ok ? "Computer Use task completed" : "Computer Use task failed", executed.title);
    addEvent("Operator", `${executed.title} ${ok ? "complete" : "failed"}.`);
    notifyNative(ok ? "Computer Use complete" : "Computer Use failed", executed.summary, "operator");
    renderShellView("operator");
    return;
  }

  if (approved.kind === "push_to_talk") {
    const blocked = appendOperatorLog({
      ...approved,
      status: "blocked",
      summary: "Push-to-talk note is queued; desktop commands are routed as Computer Use tasks.",
      updatedAt: new Date().toISOString()
    }, "warning", "Blocked before execution. This utterance was not classified as a desktop command.");
    upsertOperatorTask(blocked);
    recordAudit("operator", "Operator task blocked", blocked.title);
    addEvent("Operator", `${blocked.title} blocked before execution.`);
    notifyNative("Operator blocked", blocked.summary, "operator");
    renderShellView("operator");
    return;
  }

  const artifact = createOperatorPlanArtifact(approved);
  const completed = appendOperatorLog({
    ...approved,
    status: "completed",
    completedAt: new Date().toISOString(),
    summary: "Completed locally and saved a plan artifact.",
    artifacts: [{ id: `opartifact-${Date.now()}`, title: artifact.title, artifactId: artifact.id, kind: artifact.kind, createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString()
  }, "info", `Completed locally. Saved ${artifact.title}.`);
  upsertOperatorTask(completed);
  recordAudit("operator", "Operator task completed", completed.title);
  addEvent("Operator", `${completed.title} complete.`);
  notifyNative("Operator complete", `${completed.title} saved a plan artifact.`, "operator");
  renderShellView("operator");
}

async function executeComputerUseOperatorTask(task) {
  const intent = computerUseIntentFromTask(task);
  if (!intent) {
    return appendOperatorLog({
      ...task,
      status: "blocked",
      summary: "No deterministic Computer Use action could be inferred from this task.",
      updatedAt: new Date().toISOString()
    }, "warning", "No supported Computer Use intent was detected.");
  }

  try {
    const response = await fetch("/api/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: intent.name, arguments: intent.arguments })
    });
    const payload = await response.json().catch(() => ({}));
    if (await handleLockedResponse(response, payload)) {
      return appendOperatorLog({
        ...task,
        status: "failed",
        error: "Local lock expired.",
        summary: "Local lock expired before Computer Use execution.",
        updatedAt: new Date().toISOString()
      }, "error", "Local lock expired before execution.");
    }
    const output = payload.output || { status: "error", message: "Computer Use tool failed." };
    const success = response.ok && ["completed", "ok"].includes(output.status);
    renderComputerUseResult(intent.name, intent.arguments, output);
    return appendOperatorLog({
      ...task,
      status: success ? "completed" : output.status === "blocked" ? "blocked" : "failed",
      completedAt: success ? new Date().toISOString() : task.completedAt,
      error: success ? "" : output.message || "Computer Use tool failed.",
      summary: output.message || `${toolLabels[intent.name] || intent.name} returned ${output.status || "unknown"}.`,
      updatedAt: new Date().toISOString()
    }, success ? "info" : "error", output.message || JSON.stringify(output).slice(0, 300));
  } catch (error) {
    return appendOperatorLog({
      ...task,
      status: "failed",
      error: error.message || "Computer Use execution failed.",
      summary: error.message || "Computer Use execution failed.",
      updatedAt: new Date().toISOString()
    }, "error", error.message || "Computer Use execution failed.");
  }
}

function computerUseIntentFromTask(task) {
  const text = [
    task.title,
    task.summary,
    ...(task.logs || []).map((log) => log.message)
  ].join(" ").replace(/^Computer Use:\s*/i, " ").trim();
  const lower = text.toLowerCase();
  const url = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (/\b(search|google|duckduckgo)\b/.test(lower)) {
    return { name: "search_web", arguments: { query: cleanComputerIntentText(text.replace(/^(search|google|duckduckgo)\s*/i, "")) } };
  }
  if (url) {
    return { name: "open_chrome_tab", arguments: { url } };
  }
  if (/\b(finder|folder)\b/.test(lower) || /\/Users\//.test(text)) {
    const path = text.match(/\/Users\/[^\n\r"'<>]+/)?.[0] || "";
    return { name: "open_finder_location", arguments: { path } };
  }
  if (/\bterminal\b/.test(lower)) {
    const path = text.match(/\/Users\/[^\n\r"'<>]+/)?.[0] || "";
    return { name: "open_terminal_workspace", arguments: { path } };
  }
  const webApp = ["gmail", "google drive", "drive", "docs", "sheets", "calendar", "github", "notion", "claude", "chatgpt"]
    .find((name) => lower.includes(name));
  if (webApp) {
    return { name: "open_web_app", arguments: { app: webApp } };
  }
  const appMatch = text.match(/\b(?:open|launch|start|show)\s+([A-Za-z][A-Za-z0-9 .-]{1,48})/i);
  if (appMatch) {
    return { name: "open_local_app", arguments: { app_name: cleanComputerIntentText(appMatch[1]) } };
  }
  if (/\bclick\b/.test(lower)) {
    return { name: "click_link_with_vision", arguments: { description: cleanComputerIntentText(text.replace(/^click\s*/i, "")) } };
  }
  return null;
}

function cleanComputerIntentText(value) {
  return String(value || "")
    .replace(/Queued from push-to-talk:/gi, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function stopOperatorTask(id, reason = "stopped by user") {
  const task = operatorTaskById(id);
  if (!task) return;
  const stopped = appendOperatorLog({
    ...task,
    status: "stopped",
    stoppedAt: new Date().toISOString(),
    summary: reason,
    updatedAt: new Date().toISOString()
  }, "warning", `Stopped: ${reason}`);
  upsertOperatorTask(stopped);
  recordAudit("operator", "Operator task stopped", `${task.title}: ${reason}`);
  addEvent("Operator", `${task.title} stopped.`);
  notifyNative("Operator stopped", `${task.title}: ${reason}`, "operator");
  renderShellView("operator");
}

function stopAllOperatorTasks() {
  const stoppable = operatorTaskRecords().filter((task) => ["queued", "approval_required", "running", "blocked"].includes(task.status));
  for (const task of stoppable) {
    const stopped = appendOperatorLog({
      ...task,
      status: "stopped",
      stoppedAt: new Date().toISOString(),
      summary: "stopped by hard stop",
      updatedAt: new Date().toISOString()
    }, "warning", "Hard stop requested from Operator workspace.");
    upsertOperatorTask(stopped);
  }
  recordAudit("operator", "Operator hard stop", `${stoppable.length} task(s) stopped.`);
  addEvent("Operator", `Stop all requested for ${stoppable.length} task(s).`);
  if (stoppable.length) {
    notifyNative("Operator hard stop", `${stoppable.length} task(s) stopped.`, "operator");
  }
  renderShellView("operator");
}

function createOperatorPlanArtifact(task) {
  const now = new Date().toISOString();
  const artifact = {
    id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `${task.title} Operator plan`,
    kind: "markdown",
    outputType: "markdown",
    sessionId: state.currentSessionId || latestSession()?.id || "",
    projectId: state.activeProjectId || state.selectedProjectId || "",
    tags: ["operator", task.kind],
    source: {
      format: "markdown",
      value: [
        `# ${task.title}`,
        "",
        `Lane: ${operatorKindLabel(task.kind)}`,
        `Risk: ${task.risk}`,
        "",
        "## Status",
        "Completed locally after explicit approval.",
        "",
        "## Next actions",
        "- Review the generated plan.",
        "- Attach the plan to the current session if useful.",
        "- Keep desktop automation disabled until the native connector is ready."
      ].join("\n")
    },
    createdAt: now,
    updatedAt: now,
    summary: "Operator plan generated after approval."
  };
  upsertArtifact(artifact);
  return artifact;
}

function operatorTaskRecords() {
  return (Array.isArray(state.store.operatorTasks) ? state.store.operatorTasks : []).sort(compareArtifacts);
}

function operatorTaskById(id) {
  return operatorTaskRecords().find((task) => task.id === id) || null;
}

function upsertOperatorTask(task) {
  const tasks = (state.store.operatorTasks || []).filter((item) => item.id !== task.id);
  state.store = {
    ...state.store,
    operatorTasks: [task, ...tasks].sort(compareArtifacts).slice(0, 250),
    updatedAt: task.updatedAt || new Date().toISOString()
  };
  scheduleStoreSave();
  return task;
}

function appendOperatorLog(task, level, message) {
  return {
    ...task,
    logs: [operatorLog(level, message), ...(task.logs || [])].slice(0, 80),
    updatedAt: new Date().toISOString()
  };
}

function operatorLog(level, message) {
  return {
    id: `oplog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    createdAt: new Date().toISOString()
  };
}

function operatorKindLabel(kind) {
  if (kind === "computer_use") return "Computer Use";
  if (kind === "push_to_talk") return "Push-to-talk";
  return "Operator";
}

function operatorQueuedSummary(kind) {
  if (kind === "computer_use") return "Requires approval; deterministic local actions can run after approval.";
  if (kind === "push_to_talk") return "Requires approval; desktop commands are routed as Computer Use tasks when detected.";
  return "Requires approval before local operator work can begin.";
}

function operatorStatusCopy(task) {
  if (task.status === "approval_required") return "Waiting for visible approval.";
  if (task.status === "running") return "Running after approval.";
  if (task.status === "blocked") return "Blocked before automation started.";
  if (task.status === "stopped") return "Stopped by user or hard stop.";
  if (task.status === "completed") return "Completed and saved output.";
  if (task.status === "failed") return task.error || "Failed.";
  return "Queued.";
}

function createArtifactJob(kind = "markdown", options = {}) {
  const now = new Date().toISOString();
  const mode = kind === "aires_requirements" ? normalizeAiresMode(options.mode) : "";
  const job = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `${artifactKindLabel(kind, mode)} artifact`,
    kind,
    mode,
    status: "running",
    progress: kind === "mcp_app" ? "Generating local artifact" : "Generating with Responses API",
    artifactId: "",
    logs: [
      "Queued from native Library",
      kind === "mcp_app" ? "Provider: local preview" : "Provider: OpenAI Responses API with local fallback",
      mode ? `Mode: ${airesModeLabel(mode)}` : ""
    ].filter(Boolean),
    createdAt: now,
    updatedAt: now
  };
  upsertJob(job);
  renderShellView("library");
  window.setTimeout(async () => {
    try {
      let generated = null;
      const logs = [...job.logs];
      if (kind !== "mcp_app") {
        try {
          generated = await requestResponsesArtifact(kind, { mode });
          logs.push(`Responses generated with ${generated.model || "configured model"}.`);
        } catch (error) {
          logs.push(`Responses unavailable: ${error.message || "generation failed"}.`);
          logs.push("Saved local fallback artifact.");
        }
      }
      const artifact = buildArtifact(kind, job.id, { mode, generated });
      upsertArtifact(artifact);
      upsertJob({
        ...job,
        status: "completed",
        progress: generated ? "Saved from Responses API" : "Saved local fallback",
        artifactId: artifact.id,
        provider: artifact.generationProvider,
        responseModel: artifact.responseModel,
        responseRequestId: artifact.responseRequestId,
        logs: [...logs, `Saved ${artifact.title}`],
        updatedAt: new Date().toISOString()
      });
      state.selectedArtifactId = artifact.id;
      scheduleStoreSave();
      renderShellView("library");
      addEvent("Library", `${artifact.title} saved.`);
      notifyNative("Artifact saved", `${artifact.title} is available in Library.`, "library");
    } catch (error) {
      upsertJob({
        ...job,
        status: "failed",
        progress: "Generation failed",
        error: error.message || "Generation failed",
        logs: [...job.logs, error.message || "Generation failed"],
        updatedAt: new Date().toISOString()
      });
      scheduleStoreSave();
      renderShellView("library");
      addEvent("Library", error.message || "Artifact generation failed.");
      notifyNative("Artifact failed", error.message || "Artifact generation failed.", "library");
    }
  }, 160);
}

async function retryResponsesJob(jobId) {
  const job = jobRecords().find((candidate) => candidate.id === jobId);
  if (!job || !canRetryResponsesJob(job)) {
    return;
  }
  const startedAt = new Date().toISOString();
  const running = {
    ...job,
    status: "running",
    progress: "Retrying Responses API",
    logs: [
      `Retry queued at ${formatDateTime(startedAt)}`,
      ...(job.logs || [])
    ].slice(0, 20),
    updatedAt: startedAt
  };
  upsertJob(running);
  renderShellView("library");

  try {
    const generated = await requestResponsesArtifact(job.kind, { mode: job.mode || "" });
    const artifact = buildArtifact(job.kind, job.id, { mode: job.mode || "", generated });
    upsertArtifact(artifact);
    upsertJob({
      ...running,
      status: "completed",
      progress: "Saved from Responses API retry",
      artifactId: artifact.id,
      provider: artifact.generationProvider,
      responseModel: artifact.responseModel,
      responseRequestId: artifact.responseRequestId,
      retryCount: Number(job.retryCount || 0) + 1,
      logs: [
        `Responses retry generated with ${generated.model || "configured model"}.`,
        ...(running.logs || [])
      ].slice(0, 20),
      updatedAt: new Date().toISOString()
    });
    state.selectedArtifactId = artifact.id;
    scheduleStoreSave();
    renderShellView("library");
    addEvent("Library", `${artifact.title} saved from Responses retry.`);
    notifyNative("Artifact retry saved", `${artifact.title} is available in Library.`, "library");
  } catch (error) {
    upsertJob({
      ...running,
      status: "failed",
      progress: "Responses retry failed",
      error: error.message || "Responses retry failed",
      retryCount: Number(job.retryCount || 0) + 1,
      logs: [
        `Responses retry failed: ${error.message || "generation failed"}.`,
        ...(running.logs || [])
      ].slice(0, 20),
      updatedAt: new Date().toISOString()
    });
    scheduleStoreSave();
    renderShellView("library");
    addEvent("Library", error.message || "Responses retry failed.");
    notifyNative("Artifact retry failed", error.message || "Responses retry failed.", "library");
  }
}

function canRetryResponsesJob(job) {
  return Boolean(
    job &&
    job.kind &&
    job.kind !== "mcp_app" &&
    !job.responseRequestId &&
    job.status !== "running"
  );
}

function buildArtifact(kind, jobId, options = {}) {
  const now = new Date().toISOString();
  const mode = kind === "aires_requirements" ? normalizeAiresMode(options.mode) : "";
  const generated = options.generated || null;
  const title = generated?.title || artifactTitle(kind, mode);
  const source = generated
    ? {
      format: generated.outputType === "json" ? "json" : generated.outputType || artifactSource(kind, { mode }).format,
      value: generated.content || ""
    }
    : artifactSource(kind, { mode });
  return {
    id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    kind,
    mode,
    outputType: source.format,
    sessionId: state.currentSessionId || latestSession()?.id || "",
    projectId: state.activeProjectId || state.selectedProjectId || "",
    tags: ["library", kind, mode].filter(Boolean),
    source,
    createdAt: now,
    updatedAt: now,
    summary: generated
      ? `${artifactKindLabel(kind, mode)} generated with OpenAI Responses API.`
      : `${artifactKindLabel(kind, mode)} generated from native Cooper context.`,
    jobId,
    generationProvider: generated?.provider || "local",
    responseModel: generated?.model || "",
    responseRequestId: generated?.requestId || "",
    responseUsage: generated?.usage || null
  };
}

async function requestResponsesArtifact(kind, options = {}) {
  const mode = kind === "aires_requirements" ? normalizeAiresMode(options.mode) : "";
  const response = await fetch("/api/artifacts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      mode,
      title: artifactTitle(kind, mode),
      context: artifactGenerationContext(),
      customPrompt: options.customPrompt || ""
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (await handleLockedResponse(response, payload)) {
    throw new Error("Local lock expired.");
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Responses generation failed: ${response.status}`);
  }
  return payload;
}

function artifactGenerationContext() {
  const context = artifactContext();
  return {
    ...context,
    transcriptTurns: sessionTurnsForArtifact().slice(-12).map((turn) => ({
      speaker: turn.speaker || "Speaker",
      text: String(turn.text || "").slice(0, 500)
    })),
    canvasCards: state.cards.slice(0, 8).map((card) => ({
      title: card.title,
      type: card.type,
      text: sourceToText(card.source).slice(0, 500)
    }))
  };
}

function artifactTitle(kind, mode = "") {
  const base = state.callContext || activeProject()?.title || selectedProject()?.title || "Cooper session";
  return `${base} ${artifactKindLabel(kind, mode)}`;
}

function artifactSource(kind, options = {}) {
  if (kind === "html") {
    return { format: "html", value: buildHTMLArtifact() };
  }
  if (kind === "aires_requirements") {
    return { format: "html", value: buildAiresRequirementsArtifact(options.mode) };
  }
  if (kind === "mermaid") {
    return { format: "markdown", value: buildMermaidArtifact() };
  }
  if (kind === "mcp_app") {
    return { format: "json", value: buildMcpAppArtifact() };
  }
  return { format: "markdown", value: buildMarkdownArtifact() };
}

function buildMarkdownArtifact() {
  const turns = sessionTurnsForArtifact();
  const cards = state.cards.slice(0, 5);
  const project = activeProject() || selectedProject();
  return [
    `# ${escapeMarkdown(state.callContext || project?.title || "Cooper Session")}`,
    "",
    project ? `Project: ${project.title}` : "",
    project?.summary ? `\n${project.summary}` : "",
    "## Transcript Notes",
    turns.length ? turns.map((turn) => `- **${turn.speaker}:** ${turn.text}`).join("\n") : "- No transcript turns saved yet.",
    "",
    "## Canvas Cards",
    cards.length ? cards.map((card) => `- ${card.title} (${card.type})`).join("\n") : "- No canvas cards saved yet."
  ].filter(Boolean).join("\n");
}

function buildHTMLArtifact() {
  const markdown = buildMarkdownArtifact();
  const body = markdownToHTML(markdown);
  return `
    <article class="aires-artifact">
      <header>
        <strong>Cooper</strong>
        <h1>${escapeHtml(state.callContext || "Cooper Session")}</h1>
        <p>Generated locally in the macOS Library.</p>
      </header>
      <section>${body}</section>
    </article>
  `;
}

function buildMcpAppArtifact() {
  const context = artifactContext();
  const project = activeProject() || selectedProject();
  const resources = [
    project ? {
      uri: `cooper://project/${project.id}`,
      name: project.title,
      type: "project",
      description: project.summary || "Selected native project context."
    } : null,
    ...context.facts.slice(0, 5).map((fact, index) => ({
      uri: `cooper://context/fact-${index + 1}`,
      name: `Context fact ${index + 1}`,
      type: "fact",
      text: fact
    }))
  ].filter(Boolean);
  return JSON.stringify({
    schema: "cooper.mcp_app.preview.v1",
    app: {
      name: `${context.subject} Context App`,
      description: "Preview-only MCP App manifest generated from the native Cooper Library.",
      generatedAt: new Date().toISOString(),
      execution: "preview_only_no_network",
      permissions: ["read_context"]
    },
    tools: [
      {
        name: "context.search",
        description: "Search saved session, project, and artifact context already present in the native store.",
        safety: "read-only",
        inputSchema: { query: "string" }
      },
      {
        name: "artifact.queue",
        description: "Queue a local artifact from selected context after visible user approval.",
        approval: "required",
        inputSchema: { kind: "markdown | html | mermaid | aires_requirements" }
      }
    ],
    resources,
    approvals: [
      "No remote app execution is performed by this preview.",
      "No external writes are allowed without a separate connector authorization flow.",
      "Rendered JSON is escaped and displayed inside the native Library preview."
    ]
  }, null, 2);
}

function buildAiresRequirementsArtifact(mode = "list") {
  const context = artifactContext();
  const safeMode = normalizeAiresMode(mode);
  const modeSpec = airesModeSpec(safeMode, context);
  const facts = context.facts.length ? context.facts : ["No detailed source evidence captured yet."];
  const assumptions = [
    "Stakeholder names, success metrics, and non-functional thresholds need owner confirmation.",
    "The first useful slice should prove the workflow with local/native data before broader connector automation."
  ];
  const inScope = [
    `Turn ${context.subject} into scoped, testable requirements.`,
    "Preserve source context and open questions.",
    "Produce vertical slices and Given/When/Then acceptance criteria."
  ];
  const outNow = [
    "Full connector write-back automation.",
    "Unapproved external data mutation.",
    "Deep compliance or procurement review beyond captured context."
  ];
  const nonGoals = [
    "Replace product discovery with generated requirements.",
    "Treat assumptions as facts.",
    "Build every future variant in the first slice."
  ];
  const slices = [
    ["Capture source context", "Data/input variation", "Save the source packet and identify evidence versus assumptions."],
    ["Draft scoped requirements", "Workflow step", "Generate the nine-section requirements artifact from the active session/project."],
    ["Review and refine", "Persona slice", "Let the owner confirm scope, success metrics, and deferred boundaries."],
    ["Create first build ticket", "Workflow step", "Convert the thinnest useful slice into acceptance-ready work."],
    ["Handle missing context", "Failure mode", "Show clear assumptions and questions when source evidence is thin."]
  ];

  return `
    <article class="aires-artifact requirements-artifact">
      <header>
        <strong>Aires</strong>
        <h1>${escapeHtml(context.subject)} ${escapeHtml(aireModeTitleFragment(safeMode))}</h1>
        <p>${escapeHtml(modeSpec.description)}</p>
      </header>
      <section class="requirements-intro">
        <p>This artifact follows the AIRES scoped requirements framework: problem before solution, visible boundaries, thin vertical slices, and testable acceptance criteria.</p>
      </section>
      ${requirementsSection(modeSpec.kicker, modeSpec.title, modeSpec.body)}
      ${requirementsSection("01", "Problem and goal", `
        <p><strong>Problem.</strong> ${escapeHtml(context.problem)}</p>
        <p><strong>Goal.</strong> Turn the current context into requirements the team can pull without redoing discovery.</p>
        <p><strong>Success metric.</strong> The next slice has named users, explicit scope boundaries, source-backed assumptions, and acceptance criteria that QA can verify.</p>
        <ol class="why-list">
          <li>Why now? ${escapeHtml(context.whyNow)}</li>
          <li>Why this user? The active context names this workflow as the next Cooper-assisted task.</li>
          <li>Why this artifact? Requirements make the buildable slice visible before implementation.</li>
        </ol>
      `)}
      ${requirementsSection("02", "Users and stakeholders", `
        <ul>${htmlList([
          "Primary user: Michael / product operator using Cooper.",
          "Decision owner: product lead for the active workflow.",
          "Build team: engineering and design implementing the next vertical slice.",
          "Verifier: QA or the acceptance owner confirming Given/When/Then behavior."
        ])}</ul>
      `)}
      ${requirementsSection("03", "Current state to desired state", `
        <div class="requirements-two-col">
          <div><h3>Current state</h3><ul>${htmlList(facts)}</ul></div>
          <div><h3>Desired state</h3><ul>${htmlList([
            "A single scoped artifact captures the problem, boundaries, slices, and readiness gate.",
            "Assumptions are visible instead of hidden inside the generated output.",
            "The first slice can be pulled and verified independently."
          ])}</ul></div>
        </div>
      `)}
      ${requirementsSection("04", "Scope", `
        <div class="scope-grid">
          ${scopeCard("In scope", inScope)}
          ${scopeCard("Out of scope now", outNow)}
          ${scopeCard("Non-goals", nonGoals)}
        </div>
      `)}
      ${requirementsSection("05", "Data, edge cases, and constraints", `
        <ul>${htmlList([
          `Source of truth: ${context.sourceLabel}.`,
          "Data retained locally in the native Library artifact store.",
          "Connector output must pass through renderer sanitization before display.",
          "Edge case: thin source context should produce assumptions and questions, not invented facts.",
          "Failure mode: missing connector auth should produce a recoverable card and audit event."
        ])}</ul>
      `)}
      ${requirementsSection("06", "MoSCoW prioritization", `
        <div class="moscow-list">
          ${moscowRow("Must", "Produce a nine-section scoped requirements artifact from active context.")}
          ${moscowRow("Should", "Link generated requirements back to source session/project evidence.")}
          ${moscowRow("Could", "Export to standalone HTML/PDF with editable content cells.")}
          ${moscowRow("Won't", "Auto-save or mutate external systems without explicit approval.")}
        </div>
      `)}
      ${requirementsSection("07", "Vertical INVEST slices", `
        <table class="slice-table">
          <thead><tr><th>Slice</th><th>Pattern</th><th>Why this slice</th></tr></thead>
          <tbody>
            ${slices.map((slice) => `<tr><td>${escapeHtml(slice[0])}</td><td>${escapeHtml(slice[1])}</td><td>${escapeHtml(slice[2])}</td></tr>`).join("")}
          </tbody>
        </table>
      `)}
      ${requirementsSection("08", "Sample acceptance criteria", `
        ${gwtBlock("Given an active Cooper session or selected project, when the user creates an AIRES requirements artifact, then the Library saves a durable artifact with all nine required sections.")}
        ${gwtBlock("Given source context is thin, when the artifact is generated, then assumptions are labeled clearly and no customer-specific facts are invented.")}
        ${gwtBlock("Given connector output is unavailable, when a requirements artifact references it, then the UI shows a recoverable connector card and preserves audit history.")}
      `)}
      ${requirementsSection("09", "Definition of Ready", `
        <ul class="ready-list">${htmlList([
          "Problem, goal, and success metric are written down.",
          "Affected users and sign-off owner are named or marked as assumptions.",
          "In scope, out of scope now, and non-goals are explicit.",
          "Data, edge cases, failure modes, and constraints are captured.",
          "Acceptance criteria are testable.",
          "The first slice is vertical, small, and valuable."
        ])}</ul>
      `)}
      ${requirementsSection("Assumptions", "Needs confirmation", `
        <ul>${htmlList(assumptions)}</ul>
      `)}
    </article>
  `;
}

function startAiresFacilitation(mode = "workshop") {
  const safeMode = normalizeAiresMode(mode) === "interview" ? "interview" : "workshop";
  const context = artifactContext();
  const project = activeProject() || selectedProject();
  const title = `AIRES ${airesModeLabel(safeMode)}: ${context.subject}`;
  setCallMode("manual");
  enterCall(title, {
    autoStart: true,
    newSession: true,
    projectId: project?.id || "",
    projectContextPacket: buildAiresFacilitationPacket(safeMode, context)
  });
  addCanvasCard({
    title,
    tags: ["aires", "requirements", safeMode],
    type: "aires_facilitation",
    source: {
      format: "markdown",
      value: buildAiresFacilitationMarkdown(safeMode, context)
    },
    supportedModes: ["text", "html"]
  });
  addEvent("AIRES", `${airesModeLabel(safeMode)} facilitation call started.`);
}

function buildAiresFacilitationPacket(mode, context) {
  const spec = airesModeSpec(mode, context);
  return [
    `AIRES ${airesModeLabel(mode)} facilitation`,
    `Subject: ${context.subject}`,
    `Problem: ${context.problem}`,
    `Source: ${context.sourceLabel}`,
    `Why now: ${context.whyNow}`,
    "",
    "Facilitation rules:",
    "- Stay in Ask Cooper/manual mode until the user asks you to respond.",
    "- Ask one question at a time.",
    "- Separate evidence from assumptions.",
    "- Keep scope boundaries visible before suggesting implementation.",
    "- End by summarizing MoSCoW, first vertical slice, Given/When/Then criteria, and open questions.",
    "",
    `Mode goal: ${spec.description}`,
    "",
    "Known facts:",
    ...(context.facts.length ? context.facts.map((fact) => `- ${fact}`) : ["- No detailed source evidence captured yet."])
  ].join("\n").slice(0, 6500);
}

function buildAiresFacilitationMarkdown(mode, context) {
  const prompts = mode === "interview"
    ? [
      "What outcome makes this worth doing now?",
      "Who accepts done, and who is affected downstream?",
      "What data is source-of-truth, stale, missing, or sensitive?",
      "What should fail safely rather than silently?",
      "What is deliberately out of scope for this slice?"
    ]
    : [
      "Capture: what phrases, constraints, and evidence must survive?",
      "Distill: what job is underneath the proposed solution?",
      "Scope: what is explicitly not in this pass?",
      "Slice: what can ship in 1-2 days with visible value?",
      "Verify: how will QA know it works?"
    ];
  return [
    `# AIRES ${airesModeLabel(mode)} facilitation`,
    "",
    `Subject: ${context.subject}`,
    `Source: ${context.sourceLabel}`,
    "",
    "## Prompts",
    prompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
    "",
    "## Closeout",
    "- Problem and goal",
    "- In scope / out now / non-goals",
    "- MoSCoW",
    "- First vertical INVEST slice",
    "- Given/When/Then acceptance criteria",
    "- Open questions"
  ].join("\n");
}

function airesModeSpec(mode, context) {
  const sharedQueue = [
    "Confirm owner and success metric",
    "Review scope boundaries",
    "Select thinnest useful first slice",
    "Convert accepted slice into implementation ticket"
  ];
  const specs = {
    list: {
      kicker: "mode",
      title: "Requirements list",
      description: "Generated as a concise requirements inventory before deeper workshop or implementation work.",
      body: `
        <ul class="mode-list">${htmlList([
          `Problem to scope: ${context.problem}`,
          "Scope boundary: in, out now, and non-goals must stay visible.",
          "Priority boundary: include Must, Should, Could, and a real Won't.",
          "Slice boundary: every ticket should be vertical and testable.",
          "Ready boundary: do not pull until assumptions are reviewed."
        ])}</ul>
      `
    },
    explain: {
      kicker: "mode",
      title: "Framework explainer",
      description: "Generated as an explanation of how the requirements artifact should be read and reviewed.",
      body: `
        <ol class="mode-list">${htmlList([
          "Read the problem before debating solutions.",
          "Check facts versus assumptions before accepting scope.",
          "Use MoSCoW to make tradeoffs explicit.",
          "Pull slices only when Given/When/Then criteria are observable.",
          "Treat Definition of Ready as the handoff gate."
        ])}</ol>
      `
    },
    workshop: {
      kicker: "mode",
      title: "Workshop run of show",
      description: "Generated as a working session guide for turning raw context into scoped requirements.",
      body: `
        <table class="queue-table">
          <thead><tr><th>Block</th><th>Prompt</th><th>Output</th></tr></thead>
          <tbody>
            <tr><td>Capture</td><td>What phrases, constraints, and evidence must survive?</td><td>Source packet</td></tr>
            <tr><td>Distill</td><td>What job is underneath the proposed solution?</td><td>Problem and goal</td></tr>
            <tr><td>Scope</td><td>What is explicitly not in this pass?</td><td>In/out/non-goals</td></tr>
            <tr><td>Slice</td><td>What can ship in 1-2 days with visible value?</td><td>INVEST ticket</td></tr>
            <tr><td>Verify</td><td>How will QA know it works?</td><td>Given/When/Then</td></tr>
          </tbody>
        </table>
      `
    },
    interview: {
      kicker: "mode",
      title: "Interview script",
      description: "Generated as a discovery interview guide for closing missing facts before implementation.",
      body: `
        <ol class="mode-list">${htmlList([
          "What outcome makes this worth doing now?",
          "Who accepts done, and who is affected downstream?",
          "What data is source-of-truth, stale, missing, or sensitive?",
          "What should fail safely rather than silently?",
          "What is deliberately out of scope for this slice?"
        ])}</ol>
      `
    },
    queue: {
      kicker: "mode",
      title: "Artifact queue",
      description: "Generated as a queue-ready artifact plan for the next requirements outputs.",
      body: `
        <table class="queue-table">
          <thead><tr><th>Queued artifact</th><th>Purpose</th><th>Status</th></tr></thead>
          <tbody>
            ${sharedQueue.map((item, index) => `<tr><td>${escapeHtml(item)}</td><td>${escapeHtml(index === 0 ? "Close missing facts" : index === 1 ? "Lock boundaries" : index === 2 ? "Choose build path" : "Prepare delivery")}</td><td>queued</td></tr>`).join("")}
          </tbody>
        </table>
      `
    }
  };
  return specs[mode] || specs.list;
}

function aireModeTitleFragment(mode) {
  if (mode === "list") return "requirements list";
  if (mode === "explain") return "requirements explainer";
  if (mode === "workshop") return "workshop guide";
  if (mode === "interview") return "interview guide";
  if (mode === "queue") return "artifact queue";
  return "scoped requirements";
}

function artifactContext() {
  const project = activeProject() || selectedProject();
  const turns = sessionTurnsForArtifact();
  const cards = state.cards.slice(0, 5);
  const subject = state.callContext || project?.title || latestSession()?.title || "Cooper session";
  const projectFacts = [
    project?.summary,
    ...(project?.sources || []).slice(0, 4).map((source) => `${source.title}: ${sourcePreviewText(source)}`)
  ].filter(Boolean);
  const turnFacts = turns.slice(-4).map((turn) => `${turn.speaker}: ${turn.text.slice(0, 180)}`);
  const cardFacts = cards.map((card) => `${card.title} (${card.type})`);
  return {
    subject,
    problem: project?.summary || latestSession()?.summary || `${subject} needs to be converted into scoped, testable work.`,
    whyNow: turns.length || projectFacts.length ? "There is active source context available in the native session." : "The user requested a requirements-ready artifact from the current workspace.",
    sourceLabel: project ? `Project: ${project.title}` : latestSession()?.title ? `Session: ${latestSession().title}` : "Active native context",
    facts: [...projectFacts, ...turnFacts, ...cardFacts].slice(0, 10)
  };
}

function requirementsSection(kicker, title, body) {
  return `
    <section class="requirements-section">
      <span>${escapeHtml(kicker)}</span>
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

function scopeCard(title, items) {
  return `
    <article class="scope-card">
      <h3>${escapeHtml(title)}</h3>
      <ul>${htmlList(items)}</ul>
    </article>
  `;
}

function moscowRow(label, text) {
  return `
    <article>
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function gwtBlock(text) {
  const [given, when, then] = text.split(/, when |, then /i);
  return `
    <div class="gwt-block">
      <p><strong>Given</strong> ${escapeHtml(given.replace(/^Given /i, ""))}</p>
      <p><strong>When</strong> ${escapeHtml(when || "")}</p>
      <p><strong>Then</strong> ${escapeHtml(then || "")}</p>
    </div>
  `;
}

function htmlList(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function buildMermaidArtifact() {
  const project = activeProject() || selectedProject();
  const sourceCount = project?.sources?.length || 0;
  const turnCount = sessionTurnsForArtifact().length;
  return [
    "```mermaid",
    "flowchart LR",
    `  Project[${mermaidLabel(project?.title || "Session")}] --> Context[${sourceCount} sources]`,
    `  Context --> Call[${turnCount} transcript turns]`,
    "  Call --> Artifact[Saved Library artifact]",
    "```"
  ].join("\n");
}

function sessionTurnsForArtifact() {
  if (state.transcriptTurns.length) {
    return state.transcriptTurns.slice(-12);
  }
  return latestSession()?.transcriptTurns?.slice(-12) || [];
}

function latestSession() {
  return (state.store.sessions || [])[0] || null;
}

function artifactKindLabel(kind, mode = "") {
  const labels = {
    markdown: "Markdown",
    html: "HTML",
    mermaid: "Mermaid",
    mcp_app: "MCP App",
    aires_requirements: mode ? `AIRES ${airesModeLabel(mode)}` : "AIRES Requirements"
  };
  return labels[kind] || "Artifact";
}

function airesRequirementModes() {
  return [
    { id: "list", label: "List", short: "Inventory" },
    { id: "explain", label: "Explain", short: "How to read" },
    { id: "workshop", label: "Workshop", short: "Run of show" },
    { id: "interview", label: "Interview", short: "Discovery script" },
    { id: "queue", label: "Queue", short: "Next artifacts" }
  ];
}

function normalizeAiresMode(mode) {
  const value = String(mode || "").trim();
  return airesRequirementModes().some((item) => item.id === value) ? value : "list";
}

function airesModeLabel(mode) {
  return airesRequirementModes().find((item) => item.id === normalizeAiresMode(mode))?.label || "List";
}

function upsertArtifact(artifact) {
  const artifacts = (state.store.artifacts || []).filter((item) => item.id !== artifact.id);
  state.store = {
    ...state.store,
    artifacts: [artifact, ...artifacts].sort(compareArtifacts).slice(0, 250),
    updatedAt: artifact.updatedAt || new Date().toISOString()
  };
  return artifact;
}

function upsertJob(job) {
  const jobs = (state.store.jobs || []).filter((item) => item.id !== job.id);
  state.store = {
    ...state.store,
    jobs: [job, ...jobs].sort(compareArtifacts).slice(0, 250),
    updatedAt: job.updatedAt || new Date().toISOString()
  };
  scheduleStoreSave();
  return job;
}

function artifactToCard(artifact) {
  return {
    id: `card-${artifact.id}-${Date.now()}`,
    title: artifact.title,
    tags: artifact.tags || ["library"],
    type: artifact.kind,
    source: artifact.source,
    defaultMode: artifact.kind === "html" || artifact.kind === "aires_requirements" ? "html" : artifact.kind === "mermaid" ? "mermaid" : "text",
    supportedModes: artifact.kind === "mcp_app" ? ["text"] : artifact.kind === "mermaid" ? ["text", "html", "mermaid"] : artifact.kind === "html" || artifact.kind === "aires_requirements" ? ["text", "html"] : ["text", "html"],
    lastEdited: artifact.updatedAt || artifact.createdAt
  };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}

function mermaidLabel(value) {
  return String(value || "Node").replace(/[\[\]{}()|"]/g, "").slice(0, 48);
}

function renderProjectRecord(project) {
  const article = document.createElement("article");
  article.className = `project-record${project.id === state.selectedProjectId ? " selected" : ""}`;
  article.innerHTML = `
    <div>
      <h2>${escapeHtml(project.title)}</h2>
      <p>${escapeHtml(project.summary || "No summary")}</p>
      <span>${project.sources?.length || 0} sources · ${formatDateTime(project.updatedAt)}</span>
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "project-record-actions";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "button-secondary";
  open.textContent = "Open";
  open.addEventListener("click", () => {
    state.selectedProjectId = project.id;
    renderShellView("projects");
  });
  const call = document.createElement("button");
  call.type = "button";
  call.className = "button-primary compact";
  call.textContent = "Call";
  call.addEventListener("click", () => startProjectCall(project.id));
  actions.append(open, call);
  article.append(actions);
  return article;
}

function renderSourceRecord(source) {
  const article = document.createElement("article");
  article.className = "source-record";
  article.innerHTML = `
    <strong>${escapeHtml(source.title)}</strong>
    <span>${escapeHtml(source.kind)} · ${escapeHtml(sourceStatusLabel(source))} · ${formatDateTime(source.createdAt)}</span>
    <p>${escapeHtml(sourcePreviewText(source))}</p>
  `;
  return article;
}

function wireProjectControls(selected) {
  $("#projectSaveButton")?.addEventListener("click", () => {
    const title = $("#projectTitleInput")?.value?.trim() || "Untitled project";
    const summary = $("#projectSummaryInput")?.value?.trim() || "";
    const project = upsertProject({
      ...(selected || {}),
      title,
      summary,
      tags: selected?.tags || inferProjectTags(title),
      sources: selected?.sources || []
    });
    state.selectedProjectId = project.id;
    scheduleStoreSave();
    renderShellView("projects");
  });

  $("#projectCallButton")?.addEventListener("click", () => {
    if (selected) {
      startProjectCall(selected.id);
    }
  });

  $("#sourceFileInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $("#sourceTitleInput").value = file.name.replace(/\.[^.]+$/, "");
    const extension = file.name.split(".").pop()?.toLowerCase();
    $("#sourceKindInput").value = extension === "md" || extension === "markdown" ? "markdown" : extension === "pdf" ? "pdf" : "txt";
    if (extension === "pdf" || file.type === "application/pdf") {
      $("#sourceContentInput").value = "";
      return;
    }
    $("#sourceContentInput").value = await file.text();
  });

  $("#sourceAddButton")?.addEventListener("click", async () => {
    if (!selected) return;
    const button = $("#sourceAddButton");
    const file = $("#sourceFileInput")?.files?.[0] || null;
    const kind = $("#sourceKindInput")?.value || "paste";
    const title = $("#sourceTitleInput")?.value?.trim() || file?.name || "Untitled source";
    const content = $("#sourceContentInput")?.value?.trim() || "";
    const source = {
      id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      kind,
      status: kind === "pdf" && !content ? "pending_pdf_extraction" : "ready",
      content: kind === "pdf" ? content : content,
      fileName: file?.name || "",
      byteLength: file?.size || content.length,
      extractor: "",
      error: "",
      truncated: false,
      createdAt: new Date().toISOString()
    };
    if (kind === "pdf" && file) {
      try {
        if (button) {
          button.disabled = true;
          button.textContent = "Extracting PDF";
        }
        const extracted = await extractPdfFile(file);
        source.status = extracted.status || "ready";
        source.content = extracted.content || "";
        source.byteLength = extracted.byteLength || file.size;
        source.extractor = extracted.extractor || "macos-pdfkit";
        source.truncated = Boolean(extracted.truncated);
        source.error = extracted.status === "extraction_empty" ? "No selectable text found in this PDF." : "";
        addEvent("Projects", source.content ? `${title} extracted with PDFKit.` : `${title} did not contain selectable PDF text.`);
      } catch (error) {
        source.status = "extraction_failed";
        source.content = "";
        source.error = error.message || "PDF extraction failed.";
        addEvent("Projects", source.error);
        notifyNative("PDF extraction failed", `${title}: ${source.error}`, "project");
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "Add source";
        }
      }
    }
    upsertProject({
      ...selected,
      sources: [source, ...(selected.sources || [])],
      updatedAt: new Date().toISOString()
    });
    state.selectedProjectId = selected.id;
    scheduleStoreSave();
    renderShellView("projects");
  });
}

async function extractPdfFile(file) {
  const data = await readFileAsDataURL(file);
  const response = await fetch("/api/project-sources/extract-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      data
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `PDF extraction failed with ${response.status}.`);
  }
  return payload;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read the selected file.")));
    reader.readAsDataURL(file);
  });
}

function sourceStatusLabel(source) {
  if (source.status === "pending_pdf_extraction") return "waiting for PDF extraction";
  if (source.status === "extraction_empty") return "extracted empty";
  if (source.status === "extraction_failed") return "extraction failed";
  return source.status || "ready";
}

function sourcePreviewText(source) {
  if (source.status === "pending_pdf_extraction") {
    return "PDF captured. Add the file again to extract selectable text with native PDFKit.";
  }
  if (source.status === "extraction_failed") {
    return source.error || "PDF extraction failed.";
  }
  if (source.status === "extraction_empty") {
    return "PDF extracted, but no selectable text was found.";
  }
  const text = source.content || "";
  if (!text) {
    return "No source text captured yet.";
  }
  return `${text.slice(0, 180)}${source.truncated ? "..." : ""}`;
}

function projectRecords() {
  const projects = Array.isArray(state.store.projects) ? state.store.projects : [];
  return projects.sort(compareProjects);
}

function compareProjects(a, b) {
  return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function selectedProject() {
  return projectRecords().find((project) => project.id === state.selectedProjectId) || null;
}

function activeProject() {
  return projectRecords().find((project) => project.id === state.activeProjectId) || null;
}

function upsertProject(project) {
  const now = new Date().toISOString();
  const safe = {
    id: project.id || `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: project.title || "Untitled project",
    summary: project.summary || "",
    tags: Array.isArray(project.tags) ? project.tags : inferProjectTags(project.title || ""),
    status: project.status || "active",
    createdAt: project.createdAt || now,
    updatedAt: now,
    sources: Array.isArray(project.sources) ? project.sources : []
  };
  const projects = (state.store.projects || []).filter((item) => item.id !== safe.id);
  state.store = {
    ...state.store,
    projects: [safe, ...projects].sort(compareProjects),
    updatedAt: now
  };
  return safe;
}

function seedProjectsFromToday() {
  if ((state.store.projects || []).length) {
    return;
  }
  const now = new Date().toISOString();
  const projects = uniqueProjects().map((title) => {
    const tasks = todayTasks.filter((task) => task.project === title);
    return {
      id: `project-${statusToClass(title) || Date.now()}`,
      title,
      summary: tasks.map((task) => task.description).join(" "),
      tags: inferProjectTags(title),
      status: "seeded",
      createdAt: now,
      updatedAt: now,
      sources: tasks.map((task) => ({
        id: `source-${task.id}`,
        title: task.title,
        kind: "note",
        status: "ready",
        content: [task.description, ...task.points].join("\n"),
        fileName: "",
        byteLength: task.description.length,
        createdAt: now
      }))
    };
  });
  state.store = {
    ...state.store,
    projects,
    updatedAt: now
  };
  state.selectedProjectId = projects[0]?.id || "";
  scheduleStoreSave();
}

function inferProjectTags(title) {
  return String(title || "")
    .split(/\s+/)
    .map((part) => statusToClass(part))
    .filter(Boolean)
    .slice(0, 4);
}

function buildProjectContextPacket(projectId) {
  const project = projectRecords().find((candidate) => candidate.id === projectId);
  if (!project) return "";
  const sourceBlocks = (project.sources || [])
    .filter((source) => source.status === "ready" && source.content)
    .slice(0, 8)
    .map((source, index) => [
      `Source ${index + 1}: ${source.title} (${source.kind})`,
      source.content.slice(0, 1800)
    ].join("\n"))
    .join("\n\n");
  return [
    `Project: ${project.title}`,
    project.summary ? `Summary: ${project.summary}` : "",
    project.tags?.length ? `Tags: ${project.tags.join(", ")}` : "",
    sourceBlocks ? `Sources:\n${sourceBlocks}` : "Sources: No extracted text sources yet."
  ].filter(Boolean).join("\n\n").slice(0, 6500);
}

function startProjectCall(projectId) {
  const project = projectRecords().find((candidate) => candidate.id === projectId);
  if (!project) return;
  state.selectedProjectId = project.id;
  state.activeProjectId = project.id;
  state.activeProjectContextPacket = buildProjectContextPacket(project.id);
  enterCall(project.title, { autoStart: true, newSession: true, projectId: project.id });
}

function handleShellPrimaryAction() {
  switch (elements.shellPrimaryAction.dataset.action) {
    case "call":
      enterCall("Free flow", { autoStart: true, newSession: true });
      break;
    case "new-project":
      state.selectedProjectId = "__new__";
      renderShellView("projects");
      break;
    case "generate-markdown":
      createArtifactJob("markdown");
      break;
    case "new-operator-task":
      queueOperatorTask();
      break;
    case "health":
      addEvent("Settings", "Broker health refresh requested.");
      hydrateHealth();
      hydrateSettingsStatus();
      break;
    case "home":
    default:
      showView("home");
      break;
  }
}

function renderSettingsBody() {
  const settings = settingsModel();
  const runtime = state.settingsStatus?.runtime || {};
  const manifest = state.manifestStatus || {};
  elements.shellBody.replaceChildren();

  const secret = document.createElement("section");
  secret.className = "settings-panel secret-panel";
  secret.innerHTML = `
    <h2>OpenAI key</h2>
    <p>${(runtime.hasApiKey ?? state.health?.hasApiKey) ? "A key is loaded for this broker." : "No key is loaded for this broker."}</p>
    <input id="settingsApiKeyInput" type="password" autocomplete="off" placeholder="sk-...">
    <div class="settings-actions">
      <button id="settingsSaveKey" class="button-primary" type="button">Save key</button>
      <button id="settingsDeleteKey" class="button-secondary" type="button">Delete key</button>
      <button id="settingsRefresh" class="button-secondary" type="button">Refresh</button>
      <button id="settingsExportDiagnostics" class="button-secondary" type="button">Export diagnostics</button>
    </div>
    <span>Service: ${escapeHtml(runtime.keychainService || "RealtimeDesktopAgent.OPENAI_API_KEY")}</span>
  `;

  const lock = state.lockStatus || state.settingsStatus?.lock || {};
  const lockPanel = document.createElement("section");
  lockPanel.className = "settings-panel lock-panel";
  lockPanel.innerHTML = `
    <h2>Local lock</h2>
    <p>Protect this local Cooper workspace with a broker-verified password and session TTL.</p>
    ${settingsRow("Status", lock.enabled ? (lock.unlocked ? "Unlocked" : "Locked") : "Disabled")}
    ${settingsRow("TTL", `${lock.ttlMinutes || 30} minutes`)}
    ${settingsRow("Expires", lock.expiresAt ? formatDateTime(lock.expiresAt) : "Not active")}
    <input id="localLockCurrentInput" type="password" autocomplete="current-password" placeholder="Current password for update or disable">
    <input id="localLockNewInput" type="password" autocomplete="new-password" placeholder="New local password">
    <input id="localLockTtlInput" type="number" min="5" max="720" step="5" value="${escapeHtml(lock.ttlMinutes || 30)}" aria-label="Unlock TTL in minutes">
    <div class="settings-actions">
      <button id="localLockSave" class="button-primary" type="button">${lock.enabled ? "Update lock" : "Enable lock"}</button>
      <button id="localLockDisable" class="button-secondary" type="button" ${lock.enabled ? "" : "disabled"}>Disable</button>
      <button id="localLockNow" class="button-secondary" type="button" ${lock.enabled ? "" : "disabled"}>Lock now</button>
    </div>
  `;

  const notification = state.notificationStatus || {};
  const notificationPanel = document.createElement("section");
  notificationPanel.className = "settings-panel notification-panel";
  notificationPanel.innerHTML = `
    <h2>Notifications</h2>
    ${settingsRow("Permission", notification.authorizationStatus || "Unknown")}
    ${settingsRow("Alerts", notification.alertSetting || "Unknown")}
    ${settingsRow("Sound", notification.soundSetting || "Unknown")}
    ${settingsRow("Center", notification.notificationCenterSetting || "Unknown")}
    <div class="settings-actions">
      <button id="notificationsRefresh" class="button-secondary" type="button">Refresh status</button>
      <button id="notificationsRequest" class="button-primary" type="button">Request permission</button>
    </div>
  `;

  const runtimePanel = document.createElement("section");
  runtimePanel.className = "settings-panel";
  runtimePanel.innerHTML = `
    <h2>Runtime</h2>
    ${settingsRow("Model", runtime.model || state.health?.model || "Unknown")}
    ${settingsRow("Artifact model", runtime.artifactModel || manifest.runtime?.artifactModel || "Unknown")}
    ${settingsRow("Voice", runtime.voice || "Unknown")}
    ${settingsRow("Workspace", runtime.workspaceRoot || state.health?.workspaceRoot || "Not loaded")}
    ${settingsRow("Store", runtime.storePath || state.storeMetadata?.storePath || "Not loaded")}
    ${settingsRow("Call modes", (runtime.supportsCallModes || ["free", "manual"]).join(", "))}
  `;

  const capabilityPanel = document.createElement("section");
  capabilityPanel.className = "settings-panel capability-panel";
  const capabilityCount = Object.values(manifest.capabilities || {}).filter(Boolean).length;
  const activeConnectors = (manifest.connectors || settings.connectors || []).filter((connector) => connector.status === "authorized" || connector.status === "local_only");
  capabilityPanel.innerHTML = `
    <h2>Capability manifest</h2>
    ${settingsRow("Schema", manifest.schema || runtime.manifestSchema || "Not loaded")}
    ${settingsRow("Capabilities", capabilityCount ? String(capabilityCount) : "Not loaded")}
    ${settingsRow("Routes", String(manifest.routes?.length || 0))}
    ${settingsRow("Tools", String(manifest.tools?.length || 0))}
    ${settingsRow("Connectors", activeConnectors.length ? activeConnectors.map((connector) => connector.label || connector.id).join(", ") : "None active")}
    <div class="settings-list manifest-tool-list">
      ${(manifest.tools || []).slice(0, 6).map((tool) => `<span>${escapeHtml(tool.toolId || tool.name)} · ${escapeHtml(tool.risk || "low")}</span>`).join("")}
    </div>
  `;

  const storePanel = document.createElement("section");
  storePanel.className = "settings-panel store-debug-panel";
  storePanel.innerHTML = `
    <h2>Local store</h2>
    <p>Export or import the native JSON store for debugging, backup, and parity checks.</p>
    ${settingsRow("Sessions", String(state.store.sessions?.length || 0))}
    ${settingsRow("Projects", String(state.store.projects?.length || 0))}
    ${settingsRow("Artifacts", String(state.store.artifacts?.length || 0))}
    ${settingsRow("Store path", runtime.storePath || state.storeMetadata?.storePath || "Not loaded")}
    <div class="settings-actions">
      <button id="settingsExportStore" class="button-secondary" type="button">Export store</button>
      <button id="settingsImportStore" class="button-secondary" type="button">Import store</button>
      <input id="settingsImportStoreInput" class="hidden" type="file" accept="application/json,.json">
    </div>
  `;

  const allowlist = document.createElement("section");
  allowlist.className = "settings-panel";
  allowlist.innerHTML = `
    <h2>Workspace allowlist</h2>
    <p>Local file tools remain confined to the approved broker workspace. Additional roots are persisted for the native allowlist surface.</p>
    <div class="settings-list" id="workspaceAllowlist">
      ${settings.workspaceAllowlist.map((root) => `<span>${escapeHtml(root)}</span>`).join("")}
    </div>
    <input id="workspaceRootInput" type="text" placeholder="/Users/.../Project">
    <div class="settings-actions">
      <button id="workspaceAddRoot" class="button-primary" type="button">Add root</button>
      <button id="workspaceResetRoots" class="button-secondary" type="button">Reset</button>
    </div>
  `;

  const arcadePanel = renderArcadeSettingsPanel();

  const connectors = document.createElement("section");
  connectors.className = "settings-panel connectors-panel";
  connectors.innerHTML = `
    <h2>Connectors</h2>
    <p>Authorization state is tracked locally. Connector tools still require a per-request approval prompt, and every approval, rejection, result, or recoverable error is saved to the tool audit.</p>
    <div class="connector-list">
      ${settings.connectors.map(renderConnectorRow).join("")}
    </div>
  `;

  const audit = document.createElement("section");
  audit.className = "settings-panel audit-panel";
  const auditRows = settings.toolAudit.slice(0, 10).map((event) => `
    <article>
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.kind)} · ${formatDateTime(event.createdAt)}</span>
      <p>${escapeHtml(event.detail || "")}</p>
    </article>
  `).join("");
  audit.innerHTML = `
    <h2>Tool audit</h2>
    ${auditRows || "<p>No audit events yet.</p>"}
  `;

  elements.shellBody.append(secret, lockPanel, notificationPanel, runtimePanel, capabilityPanel, storePanel, allowlist, arcadePanel, connectors, audit);
  wireSettingsControls();
}

function renderArcadeSettingsPanel() {
  const arcade = arcadeSettingsModel();
  const discovery = state.arcadeDiscovery || {};
  const tools = Array.isArray(arcade.tools) ? arcade.tools : [];
  const mappedTools = tools.filter((tool) => tool.mapped);
  const authorizedTools = tools.filter((tool) => ["completed", "active", "authorized"].includes(tool.status));
  const services = Array.isArray(discovery.services) ? discovery.services : [];
  const connectedServices = services.filter((service) => service.connected);
  const sdkError = arcade.sdk?.error || discovery.sdk?.error || "";
  const busy = state.arcadeBusy || "";
  const rows = tools.map((tool) => {
    const authorizationUrl = tool.authorization?.authorizationUrl || "";
    return `
      <article class="arcade-tool-row">
        <div>
          <span class="status-pill ${statusToClass(tool.status)}">${escapeHtml(arcadeStatusLabel(tool.status))}</span>
          <strong>${escapeHtml(tool.label || tool.name)}</strong>
          <p>${escapeHtml(tool.arcadeToolName || tool.mappingEnv || "No mapping configured")}</p>
        </div>
        <div class="arcade-actions">
          <button class="button-secondary" type="button" data-arcade-authorize="${escapeHtml(tool.name)}" ${tool.mapped && tool.configured && !busy ? "" : "disabled"}>
            ${busy === `authorize-${tool.name}` ? "Starting..." : tool.status === "completed" ? "Re-auth" : "Connect"}
          </button>
          <button class="button-secondary" type="button" data-arcade-check="${escapeHtml(tool.name)}" ${tool.authorization?.authorizationId && tool.configured && !busy ? "" : "disabled"}>
            ${busy === `check-${tool.name}` ? "Checking..." : "Check"}
          </button>
          ${authorizationUrl && tool.status !== "completed"
            ? `<a class="button-secondary" href="${escapeHtml(authorizationUrl)}" target="_blank" rel="noreferrer">Open</a>`
            : ""}
        </div>
        ${tool.authorization?.error ? `<small class="tool-error">${escapeHtml(tool.authorization.error)}</small>` : ""}
      </article>
    `;
  }).join("");

  const serviceRows = services.slice(0, 8).map((service) => `
    <article class="arcade-service-row">
      <div>
        <span class="status-pill ${service.connected ? "authorized" : statusToClass(service.status)}">${escapeHtml(service.connected ? "Connected" : arcadeStatusLabel(service.status))}</span>
        <strong>${escapeHtml(service.service)}</strong>
        <p>${escapeHtml(service.providerId || "Connect through Arcade")} · ${Number(service.toolCount || 0)} tool${Number(service.toolCount || 0) === 1 ? "" : "s"}</p>
      </div>
      <button class="button-secondary" type="button" data-arcade-connect-service="${escapeHtml(service.service)}" ${arcade.configured && service.connectable && !busy ? "" : "disabled"}>
        ${busy === `service-${service.service}` ? "Starting..." : service.connected ? "Reconnect" : "Connect"}
      </button>
    </article>
  `).join("");

  const panel = document.createElement("section");
  panel.className = "settings-panel arcade-panel";
  panel.innerHTML = `
    <h2>Arcade</h2>
    <p>Pre-authorize mapped Arcade tools for realtime calls. Provider tokens stay in Arcade; this app stores only authorization IDs, URLs, scopes, status, and timestamps.</p>
    <div class="settings-summary compact">
      ${settingsRow("API key", arcade.configured ? "On" : "Off")}
      ${settingsRow("Mapped", String(mappedTools.length))}
      ${settingsRow("Authorized", String(authorizedTools.length))}
      ${settingsRow("Services", String(connectedServices.length))}
      ${settingsRow("SDK", arcade.sdk?.available ? "Loaded" : arcade.sdk?.attempted ? "Unavailable" : "Deferred")}
      ${settingsRow("Writes", arcade.writesEnabled ? "On" : "Off")}
    </div>
    <div class="settings-actions">
      <button id="arcadeRefreshStatus" class="button-secondary" type="button" ${busy ? "disabled" : ""}>Refresh status</button>
      <button id="arcadeRefreshDiscovery" class="button-secondary" type="button" ${arcade.configured && !busy ? "" : "disabled"}>Discover services</button>
      <button id="arcadeAuthorizeAll" class="button-primary" type="button" ${arcade.configured && mappedTools.length && !busy ? "" : "disabled"}>
        ${busy === "authorize-all" ? "Preparing..." : "Pre-auth all"}
      </button>
    </div>
    <div class="settings-note-grid">
      <span>User: <b>${escapeHtml(arcade.userId || "No user")}</b></span>
      <span>Gateway: <b>${escapeHtml(arcade.gatewayUrl || discovery.gatewayUrl || "Not configured")}</b></span>
      <span>Pattern: <b>Settings pre-auth, per-call approval.</b></span>
    </div>
    ${arcade.error ? `<p class="tool-error">${escapeHtml(arcade.error)}</p>` : ""}
    ${discovery.error ? `<p class="tool-error">${escapeHtml(discovery.error)}</p>` : ""}
    ${sdkError ? `<p class="tool-error">${escapeHtml(sdkError)}</p>` : ""}
    ${Array.isArray(discovery.errors) && discovery.errors.length
      ? `<div class="settings-warning-list">${discovery.errors.map((error) => `<span>${escapeHtml(error)}</span>`).join("")}</div>`
      : ""}
    <div class="arcade-tool-list">
      ${rows || "<p>No Arcade mapped tools are configured yet.</p>"}
    </div>
    <div class="arcade-service-list">
      ${serviceRows || "<p>Service discovery has not run yet.</p>"}
    </div>
  `;
  return panel;
}

function settingsRow(label, value) {
  return `
    <div class="settings-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderConnectorRow(connector) {
  const statuses = ["not_configured", "pending", "authorized", "error", "local_only"];
  const scopes = Array.isArray(connector.scopes) ? connector.scopes.join(", ") : "";
  const tools = Array.isArray(connector.toolIds) ? connector.toolIds.join(", ") : "";
  return `
    <article class="connector-row">
      <div>
        <strong>${escapeHtml(connector.label)}</strong>
        <p>${escapeHtml(connector.note || "")}</p>
        <span>${escapeHtml(connector.risk || "medium")} risk · ${escapeHtml(connector.authMode || "not_configured")}${scopes ? ` · ${escapeHtml(scopes)}` : ""}</span>
        ${tools ? `<small>Approval-gated tools: ${escapeHtml(tools)}</small>` : ""}
      </div>
      <select data-connector-status="${escapeHtml(connector.id)}" aria-label="${escapeHtml(connector.label)} status">
        ${statuses.map((status) => `<option value="${status}" ${status === connector.status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
      </select>
    </article>
  `;
}

function wireSettingsControls() {
  $("#settingsRefresh")?.addEventListener("click", () => {
    hydrateHealth();
    hydrateSettingsStatus();
    recordAudit("settings", "Settings refreshed", "Runtime and store settings refreshed.");
  });
  $("#settingsSaveKey")?.addEventListener("click", saveSettingsApiKey);
  $("#settingsDeleteKey")?.addEventListener("click", deleteSettingsApiKey);
  $("#localLockSave")?.addEventListener("click", configureLocalLock);
  $("#localLockDisable")?.addEventListener("click", disableLocalLock);
  $("#localLockNow")?.addEventListener("click", lockLocalApp);
  $("#notificationsRefresh")?.addEventListener("click", () => requestNativeNotificationStatus());
  $("#notificationsRequest")?.addEventListener("click", () => requestNativeNotificationStatus({ requestPermission: true }));
  $("#settingsExportDiagnostics")?.addEventListener("click", exportDiagnostics);
  $("#settingsExportStore")?.addEventListener("click", exportNativeStore);
  $("#settingsImportStore")?.addEventListener("click", () => $("#settingsImportStoreInput")?.click());
  $("#settingsImportStoreInput")?.addEventListener("change", importNativeStoreFromFile);
  $("#arcadeRefreshStatus")?.addEventListener("click", () => hydrateArcadeStatus({ render: true, notice: true }));
  $("#arcadeRefreshDiscovery")?.addEventListener("click", () => hydrateArcadeDiscovery({ render: true, notice: true }));
  $("#arcadeAuthorizeAll")?.addEventListener("click", authorizeAllArcadeTools);
  $$("[data-arcade-authorize]").forEach((button) => {
    button.addEventListener("click", () => authorizeArcadeTool(button.dataset.arcadeAuthorize));
  });
  $$("[data-arcade-check]").forEach((button) => {
    button.addEventListener("click", () => checkArcadeTool(button.dataset.arcadeCheck));
  });
  $$("[data-arcade-connect-service]").forEach((button) => {
    button.addEventListener("click", () => connectArcadeService(button.dataset.arcadeConnectService));
  });
  $("#workspaceAddRoot")?.addEventListener("click", () => {
    const value = $("#workspaceRootInput")?.value?.trim();
    if (!value) return;
    const settings = settingsModel();
    persistSettingsPatch({
      workspaceAllowlist: [...settings.workspaceAllowlist, value]
    }, "Workspace allowlist updated", value);
  });
  $("#workspaceResetRoots")?.addEventListener("click", () => {
    const root = state.settingsStatus?.runtime?.workspaceRoot || state.health?.workspaceRoot || "";
    persistSettingsPatch({ workspaceAllowlist: root ? [root] : [] }, "Workspace allowlist reset", root || "No runtime root");
  });
  $$("[data-connector-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.connectorStatus;
      const settings = settingsModel();
      const connectors = settings.connectors.map((connector) => connector.id === id
        ? { ...connector, status: select.value, updatedAt: new Date().toISOString(), note: connectorNoteForStatus(select.value) }
        : connector);
      persistSettingsPatch({ connectors }, "Connector status updated", `${id}: ${select.value}`);
    });
  });
}

function connectorNoteForStatus(status) {
  if (status === "authorized") return "Marked authorized locally. Each connector run still asks for approval and requires configured credentials.";
  if (status === "pending") return "Authorization requested from native Settings.";
  if (status === "error") return "Connector needs attention before use.";
  if (status === "local_only") return "Available as a local/native capability only.";
  return "Not configured in the native app yet.";
}

function settingsModel() {
  return {
    ...defaultSettingsModel(),
    ...(state.settingsStatus?.settings || state.store.settings || {}),
    connectors: mergeClientConnectors(state.settingsStatus?.settings?.connectors || state.store.settings?.connectors),
    workspaceAllowlist: normalizeClientRoots(state.settingsStatus?.settings?.workspaceAllowlist || state.store.settings?.workspaceAllowlist),
    toolAudit: Array.isArray(state.settingsStatus?.settings?.toolAudit || state.store.settings?.toolAudit)
      ? [...(state.settingsStatus?.settings?.toolAudit || state.store.settings?.toolAudit)].sort(compareArtifacts)
      : []
  };
}

function arcadeSettingsModel() {
  const runtime = state.settingsStatus?.runtime || {};
  const storedAuthorizations = Array.isArray(state.store.arcadeAuthorizations) ? state.store.arcadeAuthorizations : [];
  const fallbackTools = [...arcadeToolNames].map((name) => ({
    name,
    label: toolLabels[name] || name,
    arcadeToolName: "",
    mappingEnv: arcadeMappingEnvName(name),
    mapped: false,
    configured: Boolean(runtime.arcadeConfigured || state.health?.arcadeConfigured),
    status: runtime.arcadeConfigured || state.health?.arcadeConfigured ? "missing_mapping" : "missing_api_key",
    authorization: storedAuthorizations.find((item) => item.toolName === name) || null
  }));
  const status = state.arcadeStatus || state.settingsStatus?.arcade || {};
  return {
    configured: Boolean(status.configured ?? runtime.arcadeConfigured ?? state.health?.arcadeConfigured),
    userId: status.userId || runtime.arcadeUserId || "michael",
    gatewayUrl: status.gatewayUrl || runtime.arcadeGatewayUrl || "",
    writesEnabled: Boolean(status.writesEnabled ?? runtime.arcadeWritesEnabled),
    sdk: status.sdk || { attempted: false, available: false, error: "" },
    error: status.error || "",
    tools: Array.isArray(status.tools) && status.tools.length ? status.tools : fallbackTools,
    mappings: status.mappings || {},
    authorizations: Array.isArray(status.authorizations) ? status.authorizations : storedAuthorizations
  };
}

function arcadeMappingEnvName(name) {
  return {
    search_workspace_context: "ARCADE_SEARCH_WORKSPACE_TOOL",
    search_notion_workspace: "ARCADE_NOTION_SEARCH_TOOL",
    fetch_notion_page: "ARCADE_NOTION_FETCH_PAGE_TOOL",
    get_customer_context: "ARCADE_CUSTOMER_CONTEXT_TOOL",
    inspect_engineering_context: "ARCADE_ENGINEERING_CONTEXT_TOOL",
    create_followup_action: "ARCADE_CREATE_FOLLOWUP_TOOL"
  }[name] || "";
}

function arcadeStatusLabel(status) {
  return String(status || "unknown").replaceAll("_", " ");
}

function defaultSettingsModel() {
  return {
    workspaceAllowlist: normalizeClientRoots([state.settingsStatus?.runtime?.workspaceRoot || state.health?.workspaceRoot || ""]),
    connectors: [
      {
        id: "notion",
        label: "Notion",
        status: "not_configured",
        risk: "medium",
        authMode: "env_token",
        scopes: ["search", "read_page"],
        toolIds: ["notion.search", "notion.fetch_page"],
        note: "Authorization not connected in the native app yet."
      },
      {
        id: "arcade",
        label: "Arcade",
        status: "not_configured",
        risk: "medium",
        authMode: "arcade_oauth",
        scopes: ["pre_authorization", "tool_execution"],
        toolIds: [...arcadeToolNames],
        note: "Authorize mapped tools from native Settings. Tokens stay with Arcade; Cooper stores only non-secret authorization metadata."
      },
      {
        id: "aires_requirements",
        label: "AIRES Requirements",
        status: "local_only",
        risk: "low",
        authMode: "local",
        scopes: ["artifact_generation"],
        toolIds: ["library.aires_requirements"],
        note: "Available once artifact/tool parity is enabled."
      }
    ],
    toolAudit: []
  };
}

function mergeClientConnectors(values) {
  const base = new Map(defaultSettingsModel().connectors.map((connector) => [connector.id, connector]));
  if (Array.isArray(values)) {
    for (const connector of values) {
      if (base.has(connector.id)) {
        base.set(connector.id, { ...base.get(connector.id), ...connector });
      }
    }
  }
  return [...base.values()];
}

function normalizeClientRoots(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

async function hydrateSettingsStatus() {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Settings load failed: ${response.status}`);
    }
    state.settingsStatus = await response.json();
    state.lockStatus = state.settingsStatus.lock || state.lockStatus;
    state.store = {
      ...state.store,
      settings: state.settingsStatus.settings || state.store.settings
    };
    await hydrateManifestStatus({ render: false });
    await hydrateArcadeStatus({ render: false });
    if (state.view === "settings") {
      renderShellView("settings");
    }
  } catch (error) {
    addEvent("Settings", error.message || "Could not load settings.");
  }
}

async function hydrateManifestStatus(options = {}) {
  try {
    const response = await fetch("/api/manifest", { cache: "no-store" });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Manifest load failed: ${response.status}`);
    }
    state.manifestStatus = await response.json();
    if (options.render !== false && state.view === "settings") {
      renderShellView("settings");
    }
  } catch (error) {
    addEvent("Settings", error.message || "Could not load capability manifest.");
  }
}

async function hydrateArcadeStatus(options = {}) {
  try {
    const response = await fetch("/api/tools/arcade/status", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (await handleLockedResponse(response, payload)) return null;
      throw new Error(payload.error || `Arcade status failed: ${response.status}`);
    }
    state.arcadeStatus = payload;
    if (Array.isArray(payload.authorizations)) {
      state.store = { ...state.store, arcadeAuthorizations: payload.authorizations };
    }
    if (options.notice) {
      addEvent("Arcade", "Arcade status refreshed.");
    }
    if (options.render !== false && state.view === "settings") {
      renderShellView("settings");
    }
    return payload;
  } catch (error) {
    addEvent("Arcade", error.message || "Could not load Arcade status.");
    return null;
  }
}

async function hydrateArcadeDiscovery(options = {}) {
  state.arcadeBusy = options.notice ? "discovery" : state.arcadeBusy;
  if (options.render !== false && state.view === "settings") renderShellView("settings");
  try {
    const response = await fetch("/api/tools/arcade/discovery", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (await handleLockedResponse(response, payload)) return null;
      throw new Error(payload.error || `Arcade discovery failed: ${response.status}`);
    }
    state.arcadeDiscovery = payload;
    if (options.notice) {
      const count = (payload.services || []).filter((service) => service.connected).length;
      addEvent("Arcade", `Service discovery refreshed. ${count} connected.`);
    }
    if (options.render !== false && state.view === "settings") {
      renderShellView("settings");
    }
    return payload;
  } catch (error) {
    addEvent("Arcade", error.message || "Could not discover Arcade services.");
    return null;
  } finally {
    if (state.arcadeBusy === "discovery") {
      state.arcadeBusy = "";
      if (options.render !== false && state.view === "settings") renderShellView("settings");
    }
  }
}

async function authorizeArcadeTool(name) {
  await runArcadeAction({
    busy: `authorize-${name}`,
    path: "/api/tools/arcade/authorize",
    body: { name },
    auditTitle: `${toolLabels[name] || name} authorization started`,
    auditDetail: `Arcade tool: ${name}`
  });
}

async function authorizeAllArcadeTools() {
  await runArcadeAction({
    busy: "authorize-all",
    path: "/api/tools/arcade/authorize-all",
    body: {},
    auditTitle: "Arcade pre-auth all started",
    auditDetail: "Requested pre-authorization for all mapped Arcade tools."
  });
}

async function checkArcadeTool(name) {
  await runArcadeAction({
    busy: `check-${name}`,
    path: "/api/tools/arcade/check",
    body: { name },
    auditTitle: `${toolLabels[name] || name} authorization checked`,
    auditDetail: `Arcade tool: ${name}`
  });
}

async function connectArcadeService(service) {
  await runArcadeAction({
    busy: `service-${service}`,
    path: "/api/tools/arcade/connect",
    body: { service },
    auditTitle: `${service} Arcade connection started`,
    auditDetail: `Arcade service: ${service}`,
    refreshDiscovery: true
  });
}

async function runArcadeAction({ busy, path, body, auditTitle, auditDetail, refreshDiscovery = false }) {
  state.arcadeBusy = busy;
  if (state.view === "settings") renderShellView("settings");
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || (payload.ok === false && !Array.isArray(payload.results))) {
      if (await handleLockedResponse(response, payload)) return null;
      throw new Error(payload.error || `Arcade action failed: ${response.status}`);
    }
    if (payload.arcade) state.arcadeStatus = { ok: true, ...payload.arcade };
    if (payload.authorization?.authorizationUrl) {
      window.open(payload.authorization.authorizationUrl, "_blank", "noopener,noreferrer");
      addEvent("Arcade", "Authorization opened in the browser.");
    }
    if (Array.isArray(payload.results)) {
      const links = payload.results.filter((item) => item.authorization?.authorizationUrl);
      for (const item of links.slice(0, 6)) {
        window.open(item.authorization.authorizationUrl, "_blank", "noopener,noreferrer");
      }
      const failed = payload.results.filter((item) => !item.ok).length;
      addEvent("Arcade", `${links.length} authorization link${links.length === 1 ? "" : "s"} prepared${failed ? `; ${failed} failed` : ""}.`);
    }
    recordAudit("settings", auditTitle, auditDetail);
    await hydrateArcadeStatus({ render: false });
    if (refreshDiscovery) await hydrateArcadeDiscovery({ render: false });
    if (state.view === "settings") renderShellView("settings");
    return payload;
  } catch (error) {
    showError(error.message || "Arcade action failed.");
    addEvent("Arcade", error.message || "Arcade action failed.");
    return null;
  } finally {
    state.arcadeBusy = "";
    if (state.view === "settings") renderShellView("settings");
  }
}

async function persistSettingsPatch(patch, auditTitle, auditDetail) {
  const settings = {
    ...settingsModel(),
    ...patch
  };
  settings.toolAudit = auditEvent("settings", auditTitle, auditDetail, settings.toolAudit);
  state.store = {
    ...state.store,
    settings,
    updatedAt: new Date().toISOString()
  };
  scheduleStoreSave();
  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings })
    });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Settings save failed: ${response.status}`);
    }
    state.settingsStatus = await response.json();
    state.lockStatus = state.settingsStatus.lock || state.lockStatus;
    state.store = { ...state.store, settings: state.settingsStatus.settings };
    renderShellView("settings");
  } catch (error) {
    addEvent("Settings", error.message || "Could not save settings.");
  }
}

async function configureLocalLock() {
  const password = $("#localLockNewInput")?.value || "";
  const currentPassword = $("#localLockCurrentInput")?.value || "";
  const ttlMinutes = Number($("#localLockTtlInput")?.value || 30);
  try {
    const payload = await postLocalLock({
      action: "configure",
      password,
      currentPassword,
      ttlMinutes
    });
    state.lockStatus = payload.lock;
    recordAudit("settings", "Local lock configured", `TTL ${payload.lock.ttlMinutes} minutes.`);
    renderShellView("settings");
  } catch (error) {
    showError(error.message || "Could not configure local lock.");
  }
}

async function disableLocalLock() {
  const password = $("#localLockCurrentInput")?.value || "";
  try {
    const payload = await postLocalLock({ action: "disable", password });
    state.lockStatus = payload.lock;
    recordAudit("settings", "Local lock disabled", "Local product lock disabled.");
    renderShellView("settings");
  } catch (error) {
    showError(error.message || "Could not disable local lock.");
  }
}

async function postLocalLock(body) {
  const response = await fetch("/api/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Local lock update failed: ${response.status}`);
  }
  return payload;
}

async function saveSettingsApiKey() {
  const input = $("#settingsApiKeyInput");
  const apiKey = input?.value?.trim() || "";
  if (!apiKey) return;
  try {
    const response = await fetch("/api/settings/openai-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", apiKey })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      if (await handleLockedResponse(response, payload)) return;
      throw new Error(payload.error || `Key save failed: ${response.status}`);
    }
    input.value = "";
    recordAudit("settings", "OpenAI key saved", payload.message || "Key updated for broker.");
    await hydrateHealth();
    await hydrateSettingsStatus();
  } catch (error) {
    showError(error.message || "Could not save OpenAI key.");
  }
}

async function deleteSettingsApiKey() {
  try {
    const response = await fetch("/api/settings/openai-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      if (await handleLockedResponse(response, payload)) return;
      throw new Error(payload.error || `Key delete failed: ${response.status}`);
    }
    recordAudit("settings", "OpenAI key deleted", payload.message || "Key removed from broker.");
    await hydrateHealth();
    await hydrateSettingsStatus();
  } catch (error) {
    showError(error.message || "Could not delete OpenAI key.");
  }
}

async function exportDiagnostics() {
  try {
    const response = await fetch("/api/diagnostics", { cache: "no-store" });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Diagnostics export failed: ${response.status}`);
    }
    const payload = await response.json();
    const body = JSON.stringify(payload, null, 2);
    downloadJson(`realtime-desktop-agent-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, body);
    recordAudit("settings", "Diagnostics exported", "User-safe broker diagnostics JSON exported.");
    addEvent("Settings", "Diagnostics exported.");
  } catch (error) {
    showError(error.message || "Could not export diagnostics.");
  }
}

async function exportNativeStore() {
  try {
    if (state.storeSaveInFlight || state.storeSaveQueued) {
      await saveNativeStore();
    }
    const response = await fetch("/api/store", { cache: "no-store" });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Store export failed: ${response.status}`);
    }
    const payload = await response.json();
    const body = JSON.stringify(payload, null, 2);
    downloadJson(`realtime-desktop-agent-store-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, body);
    recordAudit("settings", "Store exported", "Native JSON store exported from Settings.");
    addEvent("Store", "Native store exported.");
  } catch (error) {
    showError(error.message || "Could not export native store.");
  }
}

async function importNativeStoreFromFile(event) {
  const input = event.currentTarget;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const importedStore = payload.store && typeof payload.store === "object" ? payload.store : payload;
    const response = await fetch("/api/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: importedStore })
    });
    const saved = await response.json().catch(() => ({}));
    if (!response.ok || !saved.store) {
      if (await handleLockedResponse(response, saved)) return;
      throw new Error(saved.error || `Store import failed: ${response.status}`);
    }
    state.store = normalizeClientStore(saved.store);
    state.storeMetadata = saved.metadata || state.storeMetadata;
    state.storeLoaded = true;
    state.settingsStatus = null;
    state.manifestStatus = null;
    await hydrateSettingsStatus();
    recordAudit("settings", "Store imported", `Imported ${file.name}.`);
    renderShellView(state.view);
    addEvent("Store", `Imported ${file.name}.`);
  } catch (error) {
    showError(error.message || "Could not import native store.");
  } finally {
    if (input) {
      input.value = "";
    }
  }
}

function downloadJson(filename, body) {
  const blob = new Blob([`${body}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function recordAudit(kind, title, detail) {
  const settings = settingsModel();
  settings.toolAudit = auditEvent(kind, title, detail, settings.toolAudit);
  state.store = {
    ...state.store,
    settings,
    updatedAt: new Date().toISOString()
  };
  scheduleStoreSave();
  persistAuditTrail(settings.toolAudit);
  if (state.view === "settings") {
    renderShellView("settings");
  }
}

function auditEvent(kind, title, detail, existing = []) {
  const event = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    detail,
    createdAt: new Date().toISOString()
  };
  return [event, ...(Array.isArray(existing) ? existing : [])].slice(0, 200);
}

async function persistAuditTrail(toolAudit) {
  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolAudit })
    });
    if (!response.ok) {
      throw new Error(`Audit save failed: ${response.status}`);
    }
    const payload = await response.json();
    state.settingsStatus = payload;
    state.store = {
      ...state.store,
      settings: payload.settings || state.store.settings
    };
    if (state.view === "settings") {
      renderShellView("settings");
    }
  } catch (error) {
    addEvent("Audit", error.message || "Could not persist audit event.");
  }
}

function settingsMetrics() {
  const health = state.health || {};
  const runtime = state.settingsStatus?.runtime || {};
  const settings = settingsModel();
  const brokerState = health.error
    ? "Unavailable"
    : (runtime.model || health.hasApiKey !== undefined) ? "Ready" : "Checking";
  return [
    ["Broker", brokerState],
    ["OpenAI key", (runtime.hasApiKey ?? health.hasApiKey) ? "Loaded" : "Missing"],
    ["Model", runtime.model || health.model || "Unknown"],
    ["Workspace", shortenPath(runtime.workspaceRoot || health.workspaceRoot || "Not loaded")],
    ["Call mode", callModeLabel()],
    ["Local lock", state.lockStatus?.enabled ? (state.lockStatus.unlocked ? "Unlocked" : "Locked") : "Disabled"],
    ["Notifications", state.notificationStatus?.authorizationStatus || "Unknown"],
    ["Store", state.storeLoaded ? `${state.store.sessions.length} sessions` : "Loading"],
    ["Allowlist", `${settings.workspaceAllowlist.length} roots`],
    ["Connectors", `${settings.connectors.filter((item) => item.status === "authorized").length} authorized`],
    ["Manifest", state.manifestStatus?.schema ? "Loaded" : "Checking"]
  ];
}

function uniqueProjects() {
  return [...new Set(todayTasks.map((task) => task.project).filter(Boolean))];
}

async function hydrateNativeStore() {
  try {
    const response = await fetch("/api/store", { cache: "no-store" });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Store load failed: ${response.status}`);
    }
    const payload = await response.json();
    state.store = normalizeClientStore(payload.store);
    state.storeMetadata = payload.metadata || null;
    state.storeLoaded = true;
    seedProjectsFromToday();
    if (state.storeSaveQueued) {
      state.storeSaveQueued = false;
      scheduleStoreSave();
    }
    if (state.currentSessionId) {
      scheduleSessionSave("active");
    }
    if (state.store.recovery?.reason) {
      addEvent("Store", "Recovered from a corrupt local store.");
    } else {
      addEvent("Store", `${state.store.sessions.length} saved session${state.store.sessions.length === 1 ? "" : "s"} loaded.`);
    }
    if (["sessions", "projects", "library", "operator", "settings"].includes(state.view)) {
      renderShellView(state.view);
    }
  } catch (error) {
    state.storeLoaded = false;
    addEvent("Store", error.message || "Could not load native store.");
  }
}

async function handleLockedResponse(response, payload = null) {
  if (response.status !== 423) {
    return false;
  }
  payload = payload || await response.json().catch(() => ({}));
  state.lockStatus = payload.lock || { enabled: true, unlocked: false };
  renderLockScreen(payload.error || "Local lock expired.");
  return true;
}

function defaultClientStore() {
  return {
    schemaVersion: 1,
    sessions: [],
    projects: [],
    artifacts: [],
    jobs: [],
    operatorTasks: [],
    arcadeAuthorizations: [],
    settings: {},
    updatedAt: new Date().toISOString()
  };
}

function normalizeClientStore(input = {}) {
  return {
    ...defaultClientStore(),
    ...input,
    sessions: Array.isArray(input.sessions) ? input.sessions.filter((session) => session?.id).sort(compareSessions) : [],
    projects: Array.isArray(input.projects) ? input.projects.filter((project) => project?.id).sort(compareProjects) : [],
    artifacts: Array.isArray(input.artifacts) ? input.artifacts.filter((artifact) => artifact?.id).sort(compareArtifacts) : [],
    jobs: Array.isArray(input.jobs) ? input.jobs.filter((job) => job?.id).sort(compareArtifacts) : [],
    operatorTasks: Array.isArray(input.operatorTasks) ? input.operatorTasks.filter((task) => task?.id).sort(compareArtifacts) : [],
    arcadeAuthorizations: Array.isArray(input.arcadeAuthorizations) ? input.arcadeAuthorizations.filter((authorization) => authorization?.id).sort(compareArtifacts) : [],
    settings: input.settings && typeof input.settings === "object" ? input.settings : {}
  };
}

function compareSessions(a, b) {
  return String(b.updatedAt || b.startedAt || "").localeCompare(String(a.updatedAt || a.startedAt || ""));
}

function ensureCurrentSession(context = state.callContext) {
  if (state.currentSessionId) {
    return state.currentSessionId;
  }
  const now = new Date().toISOString();
  state.currentSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.currentSessionMeta = {
    id: state.currentSessionId,
    title: context || "Free flow",
    context: context || "Free flow",
    projectId: state.activeProjectId,
    projectContextPacket: state.activeProjectContextPacket,
    callMode: state.callMode,
    status: "active",
    startedAt: now,
    updatedAt: now
  };
  return state.currentSessionId;
}

function currentSessionSnapshot(status = "active") {
  ensureCurrentSession(state.callContext);
  const now = new Date().toISOString();
  const startedAt = state.currentSessionMeta?.startedAt || now;
  const endedAt = status === "ended" ? now : state.currentSessionMeta?.endedAt || "";
  const title = state.currentSessionMeta?.title || state.callContext || "Free flow";
  return {
    id: state.currentSessionId,
    title,
    context: state.currentSessionMeta?.context || state.callContext || "Free flow",
    status,
    projectId: state.activeProjectId,
    projectContextPacket: state.activeProjectContextPacket,
    callMode: state.callMode,
    estimatedCost: elements.callCostState.textContent,
    startedAt,
    endedAt,
    updatedAt: now,
    transcriptTurns: state.transcriptTurns.slice(-500),
    canvasCards: state.cards.slice(0, 250),
    cardModes: { ...state.cardModes },
    summary: summarizeSession(title)
  };
}

function summarizeSession(title) {
  const lastTurn = [...state.transcriptTurns].reverse().find((turn) => turn.kind !== "tool");
  return lastTurn?.text?.slice(0, 180) || `${title} session`;
}

function upsertSessionSnapshot(status = "active") {
  if (!state.currentSessionId) {
    return null;
  }
  const snapshot = currentSessionSnapshot(status);
  state.currentSessionMeta = {
    ...state.currentSessionMeta,
    ...snapshot
  };
  const sessions = (state.store.sessions || []).filter((session) => session.id !== snapshot.id);
  state.store = {
    ...state.store,
    sessions: [snapshot, ...sessions].sort(compareSessions).slice(0, 100),
    updatedAt: snapshot.updatedAt
  };
  if (state.view === "sessions") {
    renderShellView("sessions");
  }
  return snapshot;
}

function scheduleSessionSave(status = "active") {
  if (!state.currentSessionId) {
    return;
  }
  upsertSessionSnapshot(status);
  scheduleStoreSave();
}

function scheduleStoreSave() {
  window.clearTimeout(state.storeSaveTimer);
  state.storeSaveTimer = window.setTimeout(() => {
    saveNativeStore();
  }, 450);
}

async function saveNativeStore() {
  if (!state.storeLoaded) {
    state.storeSaveQueued = true;
    return;
  }
  if (state.storeSaveInFlight) {
    state.storeSaveQueued = true;
    return;
  }
  state.storeSaveInFlight = true;
  try {
    const response = await fetch("/api/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: state.store, merge: true })
    });
    if (!response.ok) {
      if (await handleLockedResponse(response)) return;
      throw new Error(`Store save failed: ${response.status}`);
    }
    const payload = await response.json();
    state.store = normalizeClientStore(payload.store);
    state.storeMetadata = payload.metadata || state.storeMetadata;
    if (state.view === "sessions" || state.view === "settings") {
      renderShellView(state.view);
    }
  } catch (error) {
    addEvent("Store", error.message || "Could not save native store.");
  } finally {
    state.storeSaveInFlight = false;
    if (state.storeSaveQueued) {
      state.storeSaveQueued = false;
      saveNativeStore();
    }
  }
}

function restoreSession(id) {
  const session = state.store.sessions.find((candidate) => candidate.id === id);
  if (!session) {
    addEvent("Store", "Saved session could not be found.");
    return;
  }
  state.currentSessionId = session.id;
  state.currentSessionMeta = {
    ...session,
    status: "restored"
  };
  state.callContext = session.context || session.title || "Restored session";
  setCallMode(session.callMode || "free", { silent: true });
  state.activeProjectId = session.projectId || "";
  state.activeProjectContextPacket = session.projectContextPacket || (state.activeProjectId ? buildProjectContextPacket(state.activeProjectId) : "");
  state.transcriptTurns = Array.isArray(session.transcriptTurns) ? session.transcriptTurns.map((turn) => ({ ...turn })) : [];
  state.cards = Array.isArray(session.canvasCards) ? session.canvasCards.map((card) => ({ ...card })) : [];
  state.cardModes = session.cardModes && typeof session.cardModes === "object" ? { ...session.cardModes } : {};
  writeJsonStorage(storageKeys.cardModes, state.cardModes);
  renderTranscript();
  renderCanvas();
  elements.callContextLabel.textContent = state.callContext;
  showView("call");
  addEvent("Store", `Restored ${session.title || "saved session"}.`);
}

function renderMeetingRow(meeting) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "today-row meeting-row";
  row.innerHTML = `
    <span class="meeting-time">
      <strong>${escapeHtml(meeting.time)}</strong>
      <span>${escapeHtml(meeting.duration)}</span>
    </span>
    <span class="meeting-divider" aria-hidden="true"></span>
    <span class="row-copy">
      <strong>${escapeHtml(meeting.title)}</strong>
      <span>${escapeHtml(meeting.people)}</span>
    </span>
    ${meeting.next ? `<span class="status-pill next">next</span>` : ""}
    <span class="chevron" aria-hidden="true"></span>
  `;
  row.addEventListener("click", () => openTodayItem("meeting", meeting.id));
  return row;
}

function renderTaskRow(task) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "today-row task-row";
  const statusClass = statusToClass(task.status);
  row.innerHTML = `
    <span class="task-dot ${statusClass}" aria-hidden="true"></span>
    <span class="row-copy">
      <strong>${escapeHtml(task.title)}</strong>
      <span>${escapeHtml(task.project)}</span>
    </span>
    <span class="status-pill ${statusClass}">${escapeHtml(task.status)}</span>
    <span class="chevron" aria-hidden="true"></span>
  `;
  row.addEventListener("click", () => openTodayItem("task", task.id));
  return row;
}

function openTodayItem(kind, id) {
  state.selectedTodayItem = { kind, id };
  renderDetail();
  showView("detail");
}

function selectedTodayItem() {
  const selected = state.selectedTodayItem || { kind: "task", id: "t1" };
  const source = selected.kind === "meeting" ? todayMeetings : todayTasks;
  const item = source.find((candidate) => candidate.id === selected.id) || todayTasks[0];
  return { kind: selected.kind, item };
}

function openMeetingUrl(meeting) {
  const url = String(meeting?.joinUrl || "").trim();
  const label = meeting?.join || "meeting";
  if (!/^https?:\/\//i.test(url)) {
    showError("Meeting URL is not configured.");
    recordAudit("meeting", "Meeting join unavailable", meeting?.title || "Untitled meeting");
    return;
  }
  if (!window.confirm(`Open ${label} for "${meeting.title}"?`)) {
    recordAudit("meeting", "Meeting join rejected", `${label}: ${meeting.title}`);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  recordAudit("meeting", "Meeting join opened", `${label}: ${meeting.title}`);
  addEvent("Meeting", `${label} opened for ${meeting.title}.`);
}

function renderDetail() {
  const selected = selectedTodayItem();
  const item = selected.item;
  const isMeeting = selected.kind === "meeting";
  const detail = isMeeting
    ? {
      source: "from your calendar",
      eyebrow: `meeting \u00b7 ${item.time}`,
      meta: [`${item.time} \u00b7 ${item.duration}`, item.people, item.join],
      contextLabel: "what cooper has loaded",
      actionLabel: "Join with Cooper",
      secondaryLabel: `Join ${item.join || "meeting"}`,
      secondaryRoute: "meeting",
      actionNote: "Cooper joins listening, and speaks only when you name it."
    }
    : {
      source: "from notion \u00b7 sprint 14",
      eyebrow: `${item.project} \u00b7 sprint 14`,
      meta: [item.project, item.status],
      contextLabel: "what cooper will do",
      actionLabel: "Get to work",
      secondaryLabel: "Open project",
      secondaryRoute: "projects",
      actionNote: `Cooper will ${item.deliver} with you, and pause before anything is saved.`
    };

  elements.detailSource.textContent = detail.source;
  elements.detailEyebrow.textContent = detail.eyebrow;
  elements.detailTitle.textContent = item.title;
  elements.detailDescription.textContent = item.description;
  elements.detailContextLabel.textContent = detail.contextLabel;
  elements.detailActionLabel.textContent = detail.actionLabel;
  elements.detailSecondary.textContent = detail.secondaryLabel;
  elements.detailSecondary.dataset.route = detail.secondaryRoute;
  elements.detailSecondary.dataset.meetingUrl = isMeeting ? item.joinUrl || "" : "";
  elements.detailActionNote.textContent = detail.actionNote;

  elements.detailMeta.replaceChildren(...detail.meta.map((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    return span;
  }));
  elements.detailPoints.replaceChildren(...item.points.map((point) => {
    const row = document.createElement("div");
    row.className = "detail-point";
    row.textContent = point;
    return row;
  }));
  elements.detailDocs.replaceChildren(...item.docs.map((doc) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "doc-chip";
    chip.textContent = doc;
    chip.addEventListener("click", () => navigate("library"));
    return chip;
  }));
}

function statusToClass(status) {
  return String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function hydrateHealth() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Broker health failed: ${response.status}`);
    }
    const health = await response.json();
    state.health = health;
    elements.connectionState.textContent = "Broker ready";
    elements.workspaceState.textContent = shortenPath(health.workspaceRoot || "Workspace");
    elements.workspaceState.title = health.workspaceRoot || "";
    elements.modelLabel.textContent = health.model || "gpt-realtime-2";
    addEvent("Broker", health.hasApiKey ? "OpenAI key loaded." : "OPENAI_API_KEY missing.");
    if (!health.hasApiKey) {
      showError("Missing OPENAI_API_KEY in the macOS app environment.");
    }
    addWorkspaceStatusCard(health);
    seedCanvasQA();
    if (state.view === "settings") {
      renderShellView("settings");
    }
  } catch (error) {
    state.health = { error: error.message || "Health check failed." };
    elements.connectionState.textContent = "Broker unavailable";
    showError("Token broker unavailable. Restart the broker from the macOS toolbar.");
    addEvent("Broker", error.message || "Health check failed.");
    if (state.view === "settings") {
      renderShellView("settings");
    }
  }
}

function addWorkspaceStatusCard(health) {
  addCanvasCard({
    title: "Session",
    tags: ["session", "system"],
    type: "session",
    source: {
      format: "markdown",
      value: `Workspace: \`${health.workspaceRoot || "unknown"}\`\n\nTools: ${(health.tools || []).join(", ")}`
    }
  });
}

function seedCanvasQA() {
  if (state.qaSeeded || new URLSearchParams(window.location.search).get("qa") !== "canvas") {
    return;
  }
  state.qaSeeded = true;
  addCanvasCard({
    id: "qa-mermaid",
    title: "Renderer Pipeline",
    tags: ["diagram", "canvas"],
    type: "diagram",
    source: {
      format: "markdown",
      value: "```mermaid\nflowchart LR\n  Source[Canonical source] --> Registry[Renderer registry]\n  Registry --> Text[Text]\n  Registry --> HTML[HTML]\n  Registry --> Mermaid[Mermaid SVG]\n```"
    },
    supportedModes: ["text", "html", "mermaid"]
  });
  addCanvasCard({
    id: "qa-html",
    title: "Sanitized HTML",
    tags: ["html", "security"],
    type: "html",
    source: {
      format: "html",
      value: "<h3>Allowed heading</h3><p onclick=\"alert(1)\"><strong>Allowed</strong> body</p><script>window.__bad = true</script><a href=\"javascript:alert(1)\">bad link</a><img src=\"http://not-secure.test/image.png\" onerror=\"alert(1)\">"
    },
    supportedModes: ["text", "html"]
  });
  addCanvasCard({
    id: "qa-embed",
    title: "Allowlisted Embed",
    tags: ["embed", "media"],
    type: "embed",
    source: {
      format: "embed",
      value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    },
    supportedModes: ["text", "embed"]
  });
}

async function startCall() {
  clearError();
  hidePostCallPanel();
  if (state.currentSessionMeta?.status === "ended") {
    resetSessionWorkspace(state.callContext);
  }
  setConnection("Requesting microphone");
  elements.startCall.disabled = true;

  try {
    const peerConnection = new RTCPeerConnection();
    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    peerConnection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0];
    };

    peerConnection.onconnectionstatechange = () => {
      const label = peerConnection.connectionState;
      setConnection(label.charAt(0).toUpperCase() + label.slice(1));
      if (peerConnection.connectionState === "failed") {
        showError("Realtime connection failed.");
      }
    };

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    elements.micState.textContent = "Live";
    peerConnection.addTrack(localStream.getAudioTracks()[0], localStream);

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("open", () => {
      setConnection("Listening");
      addEvent("Session", "Realtime data channel open.");
      elements.interruptCall.disabled = false;
      updateCallModeUI();
    });
    dataChannel.addEventListener("message", (event) => handleServerEvent(JSON.parse(event.data)));
    dataChannel.addEventListener("close", () => {
      addEvent("Session", "Realtime data channel closed.");
      updateCallModeUI();
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sessionHeaders = {
      "Content-Type": "application/sdp",
      "X-Cooper-Call-Mode": state.callMode
    };
    if (state.activeProjectContextPacket) {
      sessionHeaders["X-Cooper-Project-Title"] = encodeURIComponent(activeProject()?.title || state.callContext);
      sessionHeaders["X-Cooper-Project-Context"] = encodeURIComponent(state.activeProjectContextPacket);
    }

    const sessionResponse = await fetch("/session", {
      method: "POST",
      headers: sessionHeaders,
      body: offer.sdp
    });

    if (await handleLockedResponse(sessionResponse)) {
      throw new Error("Local lock expired.");
    }
    const answerSdp = await sessionResponse.text();
    if (!sessionResponse.ok) {
      throw new Error(answerSdp || "Realtime session creation failed.");
    }

    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

    ensureCurrentSession(state.callContext);
    state.peerConnection = peerConnection;
    state.dataChannel = dataChannel;
    state.localStream = localStream;
    state.callStartedAt = Date.now();
    state.callEndedAt = 0;
    state.timerId = window.setInterval(updateTimer, 1000);
    updateButtons(true);
    setConnection("Connecting");
    addEvent("Call", "Started.");
    scheduleSessionSave("active");
  } catch (error) {
    elements.startCall.disabled = false;
    endCall({ silent: true });
    const message = error?.name === "NotAllowedError"
      ? "Microphone denied. Enable microphone access for Realtime Desktop Agent in macOS Settings."
      : error.message || "Realtime connection failed.";
    elements.micState.textContent = error?.name === "NotAllowedError" ? "Denied" : "Idle";
    setConnection(error?.message?.includes("OPENAI_API_KEY") ? "Broker error" : "Failed");
    showError(message);
    addEvent("Error", message);
    notifyNative("Call failed", message, "call");
  }
}

function endCall(options = {}) {
  if (state.dataChannel && state.dataChannel.readyState === "open") {
    try {
      state.dataChannel.close();
    } catch {}
  }
  if (state.peerConnection) {
    state.peerConnection.close();
  }
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      track.stop();
    }
  }
  state.callEndedAt = Date.now();
  window.clearInterval(state.timerId);
  state.peerConnection = null;
  state.dataChannel = null;
  state.localStream = null;
  state.muted = false;
  state.responseActive = false;
  state.timerId = 0;
  state.assistantDraft = "";
  elements.micState.textContent = "Idle";
  elements.callTimer.textContent = "00:00";
  setConnection("Broker ready");
  updateButtons(false);
  if (!options.silent) {
    addEvent("Call", "Ended.");
    completePostCallWorkflow();
    scheduleSessionSave("ended");
    notifyNative("Call ended", `${state.callContext || "Session"} saved to Sessions.`, "call");
  }
  state.callStartedAt = 0;
}

function completePostCallWorkflow() {
  ensureCurrentSession(state.callContext);
  if (state.lastPostCallSessionId === state.currentSessionId) {
    showPostCallPanel(buildPostCallSummary());
    return;
  }
  state.lastPostCallSessionId = state.currentSessionId;
  const summary = buildPostCallSummary();
  addCanvasCard({
    title: "Post-call next actions",
    tags: ["post-call", "session"],
    type: "post_call",
    source: {
      format: "markdown",
      value: [
        `## ${summary.title}`,
        "",
        summary.body,
        "",
        "### Suggested next actions",
        "- Generate a Markdown artifact for notes",
        "- Generate an HTML artifact for a shareable brief",
        "- Review saved session memory in Sessions"
      ].join("\n")
    },
    supportedModes: ["text", "html"]
  });
  showPostCallPanel(summary);
}

function buildPostCallSummary() {
  const elapsedSeconds = state.callStartedAt
    ? Math.max(0, Math.floor(((state.callEndedAt || Date.now()) - state.callStartedAt) / 1000))
    : 0;
  const turns = state.transcriptTurns.length;
  const cards = state.cards.length;
  return {
    title: state.callContext || "Cooper session",
    body: `${turns} transcript turn${turns === 1 ? "" : "s"}, ${cards} canvas card${cards === 1 ? "" : "s"}, ${formatDuration(elapsedSeconds)} elapsed.`
  };
}

function showPostCallPanel(summary) {
  elements.postCallPanel.hidden = false;
  elements.postCallSummary.textContent = `${summary.title}: ${summary.body}`;
}

function hidePostCallPanel() {
  elements.postCallPanel.hidden = true;
  elements.postCallSummary.textContent = "";
}

function toggleMute() {
  if (!state.localStream) return;
  state.muted = !state.muted;
  for (const track of state.localStream.getAudioTracks()) {
    track.enabled = !state.muted;
  }
  elements.muteCall.textContent = state.muted ? "Unmute" : "Mute";
  elements.micState.textContent = state.muted ? "Muted" : "Live";
}

function interruptResponse() {
  if (!sendEvent({ type: "response.cancel" })) {
    addEvent("Interrupt", "Data channel is closed.");
    return;
  }
  state.responseActive = false;
  addEvent("Interrupt", "Cancel sent.");
  setConnection("Listening");
}

function askCooper() {
  if (state.callMode === "free") {
    addEvent("Ask Cooper", "Switch to Ask Cooper or Wake phrase mode first.");
    return;
  }
  if (!sendEvent({ type: "response.create" })) {
    addEvent("Ask Cooper", "Data channel is closed.");
    return;
  }
  addEvent("Ask Cooper", "Response requested.");
  setConnection("Agent preparing");
}

function handleServerEvent(event) {
  switch (event.type) {
    case "session.created":
      addEvent("Session", "Created.");
      break;
    case "session.updated":
      setConnection("Listening");
      break;
    case "input_audio_buffer.speech_started":
      elements.micState.textContent = "Hearing";
      setConnection("Listening");
      break;
    case "input_audio_buffer.speech_stopped":
      elements.micState.textContent = state.muted ? "Muted" : "Live";
      setConnection("Processing");
      break;
    case "conversation.item.input_audio_transcription.completed":
      handleUserTranscript(event.transcript || "");
      break;
    case "conversation.item.input_audio_transcription.failed":
      showError("Input transcription failed.");
      addEvent("Transcript", event.error?.message || "Input transcription failed.");
      break;
    case "response.created":
      state.responseActive = true;
      setConnection("Agent preparing");
      updateCallModeUI();
      break;
    case "response.output_audio.delta":
    case "response.audio.delta":
      setConnection("Agent speaking");
      break;
    case "response.output_audio.done":
    case "response.audio.done":
      setConnection("Listening");
      break;
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
    case "response.output_text.delta":
      appendAssistantDelta(event.delta || "");
      break;
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      finalizeAssistant(event.transcript || state.assistantDraft);
      break;
    case "response.output_text.done":
      finalizeAssistant(event.text || state.assistantDraft);
      break;
    case "response.output_item.done":
      handleOutputItem(event.item);
      break;
    case "response.done":
      state.responseActive = false;
      setConnection("Listening");
      handleResponseDone(event.response);
      updateCallModeUI();
      break;
    case "response.cancelled":
      state.responseActive = false;
      setConnection("Listening");
      addEvent("Response", "Cancelled.");
      break;
    case "error":
      showError(event.error?.message || "Realtime session error.");
      addEvent("Realtime", event.error?.message || "Error event.");
      break;
    default:
      if (event.type?.includes("function_call")) {
        addEvent("Realtime", event.type);
      }
  }
}

function handleUserTranscript(text) {
  appendTranscript("user", "You", text);
  if (state.callMode === "wake" && hasWakePhrase(text) && !state.responseActive) {
    if (sendEvent({ type: "response.create" })) {
      addEvent("Wake phrase", "Cooper heard the wake phrase.");
      setConnection("Agent preparing");
    }
  }
}

function hasWakePhrase(text) {
  return /\b(?:hey\s+cooper|ok(?:ay)?\s+cooper|cooper)\b/i.test(String(text || ""));
}

function handleOutputItem(item) {
  if (!item) return;
  if (item.type === "message") {
    const text = (item.content || [])
      .filter((part) => part.type === "output_text" || part.type === "output_audio_transcript")
      .map((part) => part.text || part.transcript || "")
      .join("");
    if (text && !state.assistantDraft) {
      finalizeAssistant(text);
    }
  }
}

function handleResponseDone(response) {
  const calls = (response?.output || []).filter((item) => item.type === "function_call");
  if (calls.length) {
    state.responseActive = true;
    for (const call of calls) {
      handleFunctionCall(call);
    }
  }

  if (state.assistantDraft && calls.length === 0) {
    finalizeAssistant(state.assistantDraft);
  }
}

async function handleFunctionCall(call) {
  const label = toolLabels[call.name] || call.name;
  const args = safeJson(call.arguments || "{}");
  appendTranscript("tool", label, "Running");
  addEvent("Tool", `${label} started.`);
  recordAudit("tool", `${label} started`, "Realtime function call started.");

  let output;
  try {
    output = await executeTool(call.name, args);
  } catch (error) {
    output = { status: "error", tool: label, message: error.message || "Tool failed." };
    showError(`Tool failed: ${label}`);
  }

  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(output)
    }
  });
  sendEvent({ type: "response.create" });

  const outcome = output.status === "error" ? "failed" : output.status === "rejected" ? "rejected" : "returned";
  appendTranscript("tool", label, output.status === "error" ? output.message : outcome === "rejected" ? "Rejected" : "Returned");
  addEvent("Tool", `${label} ${outcome}.`);
  recordAudit("tool", `${label} ${outcome}`, output.status === "error" ? output.message : summarizeToolOutput(call.name, args, output));
}

async function executeTool(name, args) {
  switch (name) {
    case "canvas_show_card": {
      const card = addCanvasCard({
        title: args.title || "Card",
        tags: normalizeTags(args.tags),
        type: args.type || "card",
        source: {
          format: args.format || "markdown",
          value: args.markdown || args.html || args.content || ""
        },
        defaultMode: args.default_mode || "text",
        supportedModes: args.supported_render_modes
      });
      return { status: "ok", tool: "canvas.show_card", rendered: true, cardId: card.id };
    }

    case "canvas_show_table": {
      const card = addCanvasCard({
        title: args.title || "Table",
        tags: normalizeTags(args.tags),
        type: args.type || "table",
        source: {
          format: "table",
          value: {
            columns: Array.isArray(args.columns) ? args.columns : [],
            rows: Array.isArray(args.rows) ? args.rows : []
          }
        },
        supportedModes: ["text", "html"]
      });
      return { status: "ok", tool: "canvas.show_table", rendered: true, cardId: card.id };
    }

    case "app_open_url": {
      const url = String(args.url || "");
      if (!/^https?:\/\//i.test(url)) {
        return { status: "error", tool: "app.open_url", message: "Only http and https URLs are supported." };
      }
      if (!window.confirm(`Open ${url}?`)) {
        recordAudit("tool", "External URL rejected", url);
        return { status: "rejected", tool: "app.open_url" };
      }
      window.open(url, "_blank", "noopener,noreferrer");
      recordAudit("tool", "External URL opened", url);
      return { status: "ok", tool: "app.open_url", url };
    }

    case "app_copy_to_clipboard":
      await navigator.clipboard.writeText(String(args.text || ""));
      recordAudit("tool", "Copied to clipboard", `${String(args.text || "").length} characters copied.`);
      return { status: "ok", tool: "app.copy_to_clipboard" };

    case "local_search_files":
    case "local_read_file":
    case "search_workspace_context":
    case "search_notion_workspace":
    case "fetch_notion_page":
    case "get_customer_context":
    case "inspect_engineering_context":
    case "create_followup_action":
    case "notion_search":
    case "notion_fetch_page":
    case "run_gstack_skill":
    case "open_chrome_tab":
    case "search_web":
    case "click_link_with_vision":
    case "open_local_app":
    case "open_web_app":
    case "open_finder_location":
    case "open_terminal_workspace":
      return executeBrokerTool(name, args);

    default:
      return { status: "error", tool: name, message: "Unknown tool." };
  }
}

async function executeBrokerTool(name, args) {
  const approval = approveBrokerTool(name, args);
  if (!approval.approved) {
    recordAudit("approval", approval.rejectedTitle, approval.detail);
    return { status: "rejected", tool: toolAliases[name] || name, message: "User rejected tool approval." };
  }
  recordAudit("approval", approval.approvedTitle, approval.detail);

  const response = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args })
  });
  const payload = await response.json().catch(() => ({}));
  if (await handleLockedResponse(response, payload)) {
    return { status: "error", tool: name, message: "Local lock expired." };
  }
  if (!response.ok || payload.output?.status === "error") {
    showError(`Tool failed: ${toolLabels[name] || name}`);
    renderRecoverableToolError(name, args, payload.output || { message: "Tool failed." });
    return payload.output || { status: "error", tool: name, message: "Tool failed." };
  }

  if (name === "local_search_files") {
    renderSearchResults(args.query, payload.output.results || []);
  }

  if (name === "local_read_file") {
    addCanvasCard({
      title: payload.output.path || args.path,
      tags: ["file"],
      type: "file",
      source: {
        format: "markdown",
        value: `\`\`\`\n${payload.output.content || ""}\n\`\`\``
      }
    });
  }

  if (name === "notion_search") {
    renderNotionSearchResults(args.query, payload.output.results || []);
  }

  if (name === "notion_fetch_page") {
    addCanvasCard({
      title: payload.output.title || args.title || "Notion page",
      tags: ["notion", "context"],
      type: "notion",
      source: {
        format: "markdown",
        value: payload.output.content || "# Notion page\n\nNo content returned."
      },
      supportedModes: ["text", "html"]
    });
  }

  if (arcadeToolNames.has(name)) {
    renderArcadeToolResult(name, args, payload.output);
  }

  if (name === "run_gstack_skill") {
    renderGstackSkillResult(args, payload.output);
  }

  if (localComputerToolNames.has(name)) {
    renderComputerUseResult(name, args, payload.output);
  }

  return payload.output;
}

function approveBrokerTool(name, args) {
  const label = toolLabels[name] || name;
  if (name === "local_search_files") {
    const query = String(args.query || "").trim();
    const detail = query ? `Query: ${query}` : "No query provided.";
    const approved = window.confirm(`Allow Cooper to search allowlisted workspace roots for "${query || "this query"}"?`);
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail
    };
  }

  if (name === "local_read_file") {
    const path = String(args.path || "").trim();
    const detail = path ? `Path: ${path}` : "No path provided.";
    const approved = window.confirm(`Allow Cooper to read "${path || "this file"}" from allowlisted workspace roots?`);
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail
    };
  }

  if (name === "notion_search") {
    const query = String(args.query || "").trim();
    const detail = connectorApprovalDetail("notion", query ? `Query: ${query}` : "No query provided.");
    const approved = window.confirm(connectorApprovalPrompt("notion", `search Notion for "${query || "this query"}"`));
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail
    };
  }

  if (name === "notion_fetch_page") {
    const pageId = String(args.page_id || args.pageId || args.id || "").trim();
    const detail = connectorApprovalDetail("notion", pageId ? `Page: ${pageId}` : "No page id provided.");
    const approved = window.confirm(connectorApprovalPrompt("notion", "fetch this Notion page into the canvas"));
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail
    };
  }

  if (arcadeToolNames.has(name)) {
    const requestDetail = arcadeApprovalDetail(name, args);
    const approved = window.confirm(connectorApprovalPrompt("arcade", `${arcadeToolVerb(name)} through Arcade`));
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail: connectorApprovalDetail("arcade", requestDetail)
    };
  }

  if (name === "run_gstack_skill") {
    const skill = String(args.skill || "").trim() || "advisory";
    const mode = String(args.mode || "advisory").trim() || "advisory";
    const inputLength = String(args.input || "").length;
    const contextLength = String(args.context || "").length;
    const approved = window.confirm([
      `Run the ${skill.replaceAll("_", " ")} advisory skill?`,
      "",
      "This is read-only/advisory. It cannot mutate files, deploy, create PRs, or access private repo content beyond the text you provide.",
      `Mode: ${mode}`,
      `Input: ${inputLength} characters`,
      `Context: ${contextLength} characters`,
      "",
      "This will be saved to the tool audit."
    ].join("\n"));
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail: `Skill: ${skill} · Mode: ${mode} · Input: ${inputLength} chars · Context: ${contextLength} chars · Advisory only`
    };
  }

  if (localComputerToolNames.has(name)) {
    const detail = computerUseApprovalDetail(name, args);
    const approved = window.confirm([
      `Allow Cooper Computer Use to run ${toolLabels[name] || name}?`,
      "",
      detail,
      "",
      "This may open apps, browser tabs, Finder, Terminal, or click visible UI on this Mac.",
      "This will be saved to the tool audit."
    ].join("\n"));
    return {
      approved,
      approvedTitle: `${label} approved`,
      rejectedTitle: `${label} rejected`,
      detail
    };
  }

  return {
    approved: true,
    approvedTitle: `${label} approved`,
    rejectedTitle: `${label} rejected`,
    detail: "No explicit approval required."
  };
}

function connectorApprovalPrompt(connectorId, action) {
  const connector = connectorApprovalMeta(connectorId);
  const scopes = connector.scopes.length ? connector.scopes.join(", ") : "none declared";
  return [
    `Allow Cooper to ${action}?`,
    "",
    `Connector: ${connector.label}`,
    `Status: ${connector.status}`,
    `Risk: ${connector.risk}`,
    `Auth: ${connector.authMode}`,
    `Scopes: ${scopes}`,
    "",
    "This will be saved to the tool audit."
  ].join("\n");
}

function connectorApprovalDetail(connectorId, requestDetail) {
  const connector = connectorApprovalMeta(connectorId);
  const scopes = connector.scopes.length ? connector.scopes.join(", ") : "none";
  const tools = connector.toolIds.length ? connector.toolIds.join(", ") : "none";
  return [
    `Connector: ${connector.label}`,
    `Status: ${connector.status}`,
    `Risk: ${connector.risk}`,
    `Auth: ${connector.authMode}`,
    `Scopes: ${scopes}`,
    `Tools: ${tools}`,
    requestDetail
  ].filter(Boolean).join(" · ");
}

function connectorApprovalMeta(connectorId) {
  const fallback = defaultSettingsModel().connectors.find((connector) => connector.id === connectorId) || {};
  const connector = settingsModel().connectors.find((item) => item.id === connectorId) || fallback;
  return {
    id: connector.id || connectorId,
    label: connector.label || connectorId,
    status: connector.status || "not_configured",
    risk: connector.risk || "medium",
    authMode: connector.authMode || "not_configured",
    scopes: Array.isArray(connector.scopes) ? connector.scopes : [],
    toolIds: Array.isArray(connector.toolIds) ? connector.toolIds : []
  };
}

function summarizeToolOutput(name, args, output) {
  if (output?.status === "rejected") {
    return output.message || "Tool approval was rejected.";
  }
  if (name === "local_search_files") {
    const count = Array.isArray(output?.results) ? output.results.length : 0;
    return `${count} result${count === 1 ? "" : "s"} for "${String(args.query || "").trim()}".`;
  }
  if (name === "local_read_file") {
    return `Read ${output?.path || args.path || "file"}${output?.truncated ? " (truncated)" : ""}.`;
  }
  if (name === "notion_search") {
    const count = Array.isArray(output?.results) ? output.results.length : 0;
    return `${count} Notion result${count === 1 ? "" : "s"} for "${String(args.query || "").trim()}".`;
  }
  if (name === "notion_fetch_page") {
    return `Fetched ${output?.title || args.title || "Notion page"}${output?.truncated ? " (truncated)" : ""}.`;
  }
  if (arcadeToolNames.has(name)) {
    return output?.message || `${toolLabels[name] || name} returned ${output?.status || "success"} through Arcade.`;
  }
  if (name === "run_gstack_skill") {
    const skill = output?.skill || args.skill || "advisory";
    return `${String(skill).replaceAll("_", " ")} advisory returned${output?.result?.summary ? `: ${output.result.summary.slice(0, 120)}` : "."}`;
  }
  if (localComputerToolNames.has(name)) {
    return output?.message || `${toolLabels[name] || name} returned ${output?.status || "success"}.`;
  }
  if (name === "app_open_url") {
    return output?.url || String(args.url || "");
  }
  if (name === "app_copy_to_clipboard") {
    return `${String(args.text || "").length} characters copied.`;
  }
  return "Tool returned successfully.";
}

function renderArcadeToolResult(name, args, output = {}) {
  if (output.status !== "completed") return;
  const label = toolLabels[name] || name;
  const value = output.value;
  const renderedValue = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  addCanvasCard({
    title: `${label} result`,
    tags: ["arcade", "connector", name],
    type: "arcade_result",
    source: {
      format: "markdown",
      value: [
        `# ${label}`,
        "",
        `Arcade tool: \`${output.arcadeToolName || name}\``,
        output.executionId ? `Execution: \`${output.executionId}\`` : "",
        "",
        "```json",
        renderedValue,
        "```"
      ].filter(Boolean).join("\n")
    },
    supportedModes: ["text", "html"]
  });
}

function arcadeToolVerb(name) {
  return {
    search_workspace_context: "search workspace context",
    search_notion_workspace: "search Notion",
    fetch_notion_page: "fetch a Notion page",
    get_customer_context: "load customer context",
    inspect_engineering_context: "inspect engineering context",
    create_followup_action: "create a follow-up action"
  }[name] || `run ${toolLabels[name] || name}`;
}

function arcadeApprovalDetail(name, args = {}) {
  if (name === "fetch_notion_page") {
    return `Page: ${String(args.page_id_or_url || args.page_id || args.id || "unknown").trim()}`;
  }
  if (name === "get_customer_context") {
    return `Customer: ${String(args.customer_name || "unknown").trim()}`;
  }
  if (name === "create_followup_action") {
    return `Action: ${String(args.action_type || "follow-up").trim()} · Title: ${String(args.title || "untitled").trim()}`;
  }
  const query = String(args.query || args.customer_or_account || args.ticket_id || "").trim();
  return query ? `Query: ${query}` : `Tool: ${name}`;
}

function renderGstackSkillResult(args, output = {}) {
  const result = output.result || {};
  const skill = output.skill || result.skill || args.skill || "advisory";
  const label = output.label || String(skill).replaceAll("_", " ");
  const lines = [
    `# ${label}`,
    "",
    output.advisoryOnly ? "_Advisory only. No files, deployments, PRs, or external systems were changed._" : "",
    "",
    result.summary || "No summary returned.",
    "",
    markdownListSection("Key findings", result.key_findings),
    markdownListSection("Risks", result.risks),
    markdownListSection("Recommendations", result.recommendations),
    markdownListSection("Questions", result.questions),
    markdownListSection("Next actions", result.next_actions),
    "",
    output.model ? `Model: \`${output.model}\`` : "",
    output.requestId ? `Request: \`${output.requestId}\`` : ""
  ].filter(Boolean);

  addCanvasCard({
    title: `${label} advisory`,
    tags: ["gstack", "advisory", String(skill)],
    type: "gstack_advisory",
    source: {
      format: "markdown",
      value: lines.join("\n")
    },
    supportedModes: ["text", "html"]
  });
}

function markdownListSection(title, values) {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!items.length) return "";
  return [`## ${title}`, "", ...items.map((item) => `- ${String(item)}`)].join("\n");
}

function renderComputerUseResult(name, args, output = {}) {
  const status = output.status || "unknown";
  const lines = [
    `# ${toolLabels[name] || name}`,
    "",
    output.message || `Computer Use returned ${status}.`,
    "",
    `- Status: ${status}`,
    output.browser ? `- Browser: ${output.browser}` : "",
    output.url ? `- URL: ${output.url}` : "",
    output.query ? `- Query: ${output.query}` : "",
    output.appName ? `- App: ${output.appName}` : "",
    output.path ? `- Path: ${output.path}` : "",
    output.cwd ? `- Workspace: ${output.cwd}` : "",
    output.commandPrepared ? `- Command prepared: yes` : "",
    output.commandExecuted ? `- Command executed: yes` : "",
    output.dryRun ? "- Dry run: yes" : "",
    output.confidence !== undefined ? `- Confidence: ${output.confidence}` : "",
    output.reason ? `- Reason: ${output.reason}` : "",
    "",
    "This action was approval-gated and recorded in the local audit trail."
  ].filter(Boolean);
  addCanvasCard({
    title: `${toolLabels[name] || name} result`,
    tags: ["computer-use", status],
    type: "computer_use_result",
    source: {
      format: "markdown",
      value: lines.join("\n")
    },
    supportedModes: ["text", "html"]
  });
}

function computerUseApprovalDetail(name, args = {}) {
  if (name === "open_chrome_tab") return `URL: ${String(args.url || args.target_url || args.targetUrl || "about:blank")}`;
  if (name === "search_web") return `Query: ${String(args.query || args.q || args.text || "")} · Browser: ${String(args.browser || "chrome")}`;
  if (name === "click_link_with_vision") return `Visible target: ${String(args.link_description || args.description || args.target || args.text || "")}`;
  if (name === "open_local_app") return `App: ${String(args.app_name || args.appName || args.name || args.app || "")}`;
  if (name === "open_web_app") return `Web app/URL: ${String(args.app || args.web_app || args.webApp || args.name || args.url || "")}`;
  if (name === "open_finder_location") return `Finder path: ${String(args.path || args.location || args.folder || "")}`;
  if (name === "open_terminal_workspace") {
    const command = String(args.command || "");
    return `Terminal path: ${String(args.cwd || args.path || args.working_directory || args.workingDirectory || "")}${command ? ` · Command: ${command} · Execute: ${Boolean(args.execute || args.confirmed)}` : ""}`;
  }
  return JSON.stringify(args).slice(0, 500);
}

function renderSearchResults(query, results) {
  addCanvasCard({
    title: `Search: ${query}`,
    tags: ["search", "files"],
    type: "search",
    source: {
      format: "table",
      value: {
        columns: ["path", "snippet"],
        rows: results.map((result) => ({
          path: result.path,
          snippet: result.snippet
        }))
      }
    },
    supportedModes: ["text", "html"]
  });
}

function renderNotionSearchResults(query, results) {
  addCanvasCard({
    title: `Notion: ${query || "search"}`,
    tags: ["notion", "search"],
    type: "notion_search",
    source: {
      format: "table",
      value: {
        columns: ["title", "object", "last edited", "id"],
        rows: results.map((result) => ({
          title: result.title,
          object: result.object,
          "last edited": result.lastEditedTime,
          id: result.id
        }))
      }
    },
    supportedModes: ["text", "html"]
  });
}

function renderRecoverableToolError(name, args, output = {}) {
  if (!output.recoverable && !output.connector) {
    return;
  }
  const label = toolLabels[name] || name;
  const detail = output.message || "The connector could not complete this request.";
  if (name === "run_gstack_skill") {
    addCanvasCard({
      title: `${label} needs OpenAI`,
      tags: ["gstack", "advisory", "error"],
      type: "gstack_error",
      source: {
        format: "markdown",
        value: [
          `# ${label} needs OpenAI`,
          "",
          detail,
          "",
          `- Code: ${output.code || "gstack_error"}`,
          `- Skill: ${args.skill || "unknown"}`,
          `- Mode: ${args.mode || "advisory"}`,
          "",
          "Open Settings and save an OpenAI API key, then retry the advisory skill."
        ].join("\n")
      },
      supportedModes: ["text", "html"]
    });
    return;
  }
  const meta = output.connectorMeta || {};
  const scopes = Array.isArray(meta.scopes) ? meta.scopes.join(", ") : "";
  addCanvasCard({
    title: `${label} needs attention`,
    tags: ["connector", "error", output.connector || "tool"],
    type: "connector_error",
    source: {
      format: "markdown",
      value: [
        `# ${label} needs attention`,
        "",
        detail,
        "",
        `- Code: ${output.code || "connector_error"}`,
        `- Connector: ${output.connector || "unknown"}`,
        meta.risk ? `- Risk: ${meta.risk}` : "",
        meta.authMode ? `- Auth mode: ${meta.authMode}` : "",
        scopes ? `- Scopes: ${scopes}` : "",
        args.query ? `- Query: ${args.query}` : "",
        args.page_id ? `- Page: ${args.page_id}` : "",
        "",
        "Open Settings to authorize the connector, then retry the request."
      ].filter(Boolean).join("\n")
    },
    supportedModes: ["text", "html"]
  });
}

function addCanvasCard(input) {
  const now = new Date().toISOString();
  const source = normalizeSource(input.source ?? { format: "markdown", value: input.markdown ?? "" });
  const card = {
    id: input.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(input.title || "Untitled"),
    tags: normalizeTags(input.tags),
    type: String(input.type || source.format || "card"),
    source,
    defaultMode: input.defaultMode || "text",
    supportedModes: normalizeModes(input.supportedModes, source),
    lastEdited: input.lastEdited || now
  };

  if (!card.supportedModes.includes(card.defaultMode)) {
    card.defaultMode = card.supportedModes[0] || "text";
  }

  state.cards.unshift(card);
  renderCanvas();
  scheduleSessionSave("active");
  return card;
}

function renderCanvas() {
  elements.canvasGrid.className = `canvas-grid layout-${state.layout}`;
  elements.canvasGrid.replaceChildren();

  const cards = filteredCards();
  updateCardCount(cards.length, state.cards.length);

  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-empty";
    empty.textContent = "No cards match the current filter.";
    elements.canvasGrid.append(empty);
    return;
  }

  if (state.groupBy === "none") {
    for (const card of cards) {
      elements.canvasGrid.append(renderCardShell(card));
    }
    return;
  }

  const groups = groupCards(cards, state.groupBy);
  for (const [group, groupCardsList] of groups) {
    const section = document.createElement("section");
    section.className = "canvas-group";
    const title = document.createElement("h3");
    title.className = "canvas-group-title";
    title.textContent = group;
    section.append(title);
    for (const card of groupCardsList) {
      section.append(renderCardShell(card));
    }
    elements.canvasGrid.append(section);
  }
}

function renderCardShell(card) {
  const selectedMode = selectedModeForCard(card);
  const article = document.createElement("article");
  article.className = "canvas-card";
  article.dataset.cardId = card.id;

  const header = document.createElement("header");
  const titleStack = document.createElement("div");
  titleStack.className = "card-title-stack";
  const visibleTags = card.tags.filter((tag) => tag !== card.type).slice(0, 3);
  titleStack.innerHTML = `
    <h3>${escapeHtml(card.title)}</h3>
    <div class="card-meta">
      <span class="card-chip">${escapeHtml(card.type)}</span>
      ${visibleTags.map((tag) => `<span class="card-chip">${escapeHtml(tag)}</span>`).join("")}
      <span class="card-chip">${formatTime(card.lastEdited)}</span>
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const select = document.createElement("select");
  select.className = "card-mode-select";
  select.setAttribute("aria-label", "Render mode");
  for (const mode of card.supportedModes) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = rendererRegistry[mode]?.label || mode;
    option.selected = mode === selectedMode;
    select.append(option);
  }
  select.addEventListener("change", () => {
    setCardMode(card.id, select.value);
    renderCardBody(card, body);
  });

  const reset = document.createElement("button");
  reset.className = "card-reset";
  reset.type = "button";
  reset.textContent = "R";
  reset.title = "Reset render mode";
  reset.setAttribute("aria-label", "Reset render mode");
  reset.addEventListener("click", () => {
    delete state.cardModes[card.id];
    writeJsonStorage(storageKeys.cardModes, state.cardModes);
    select.value = card.defaultMode;
    renderCardBody(card, body);
  });

  actions.append(select, reset);
  header.append(titleStack, actions);

  const body = document.createElement("div");
  body.className = "canvas-body";
  body.textContent = "Rendering";
  article.append(header, body);
  queueMicrotask(() => renderCardBody(card, body));
  return article;
}

async function renderCardBody(card, body) {
  const mode = selectedModeForCard(card);
  const renderer = rendererRegistry[mode] || rendererRegistry.text;
  body.innerHTML = "";
  try {
    const output = await renderer.render(card);
    body.innerHTML = output.html;
  } catch (error) {
    body.innerHTML = `
      <div class="render-error">${escapeHtml(error.message || "Rendering failed.")}</div>
      ${rendererRegistry.text.render(card).html}
    `;
  }
}

function selectedModeForCard(card) {
  const persisted = state.cardModes[card.id];
  if (persisted && card.supportedModes.includes(persisted)) {
    return persisted;
  }
  return card.defaultMode;
}

function setCardMode(id, mode) {
  const card = state.cards.find((candidate) => candidate.id === id);
  if (!card || !card.supportedModes.includes(mode)) {
    return false;
  }
  if (mode === card.defaultMode) {
    delete state.cardModes[id];
  } else {
    state.cardModes[id] = mode;
  }
  writeJsonStorage(storageKeys.cardModes, state.cardModes);
  renderCanvas();
  scheduleSessionSave("active");
  return true;
}

function filteredCards() {
  if (!state.filter) {
    return state.cards;
  }
  return state.cards.filter((card) => {
    const haystack = [
      card.title,
      card.type,
      ...card.tags,
      sourceToText(card.source).slice(0, 500)
    ].join(" ").toLowerCase();
    return haystack.includes(state.filter);
  });
}

function groupCards(cards, groupBy) {
  const groups = new Map();
  for (const card of cards) {
    const key = groupBy === "tag" ? (card.tags[0] || "untagged") : (card.type || "card");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(card);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function updateCardCount(visible, total) {
  const label = visible === total ? `${total}` : `${visible} of ${total}`;
  elements.cardCount.textContent = `${label} ${total === 1 ? "card" : "cards"}`;
}

function normalizeSource(source) {
  if (typeof source === "string") {
    return { format: "markdown", value: source };
  }
  const format = String(source.format || "markdown");
  return {
    format,
    value: source.value ?? "",
    ast: source.ast || null
  };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeModes(modes, source) {
  const inferred = ["text", "html"];
  if (extractMermaidSource(source)) {
    inferred.push("mermaid");
  }
  if (extractEmbedURL(source)) {
    inferred.push("embed");
  }
  const requested = Array.isArray(modes) ? modes : inferred;
  const safeModes = [...new Set(requested)]
    .filter((mode) => rendererRegistry[mode])
    .filter((mode) => mode !== "mermaid" || extractMermaidSource(source))
    .filter((mode) => mode !== "embed" || extractEmbedURL(source));
  return safeModes.length ? safeModes : ["text"];
}

function sourceToText(source) {
  if (source.format === "table") {
    return tableToMarkdown(source.value);
  }
  if (source.format === "blocks" && Array.isArray(source.ast)) {
    return source.ast.map((block) => block.text || JSON.stringify(block)).join("\n\n");
  }
  return String(source.value ?? "");
}

function sourceToHTML(source) {
  if (source.format === "table") {
    return tableToHTML(source.value);
  }
  if (source.format === "html") {
    return String(source.value ?? "");
  }
  return markdownToHTML(sourceToText(source));
}

function tableToMarkdown(value) {
  const columns = Array.isArray(value?.columns) ? value.columns : [];
  const rows = Array.isArray(value?.rows) ? value.rows : [];
  if (!columns.length) {
    return "No columns";
  }
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(row?.[column] ?? "")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function tableToHTML(value) {
  const columns = Array.isArray(value?.columns) ? value.columns : [];
  const rows = Array.isArray(value?.rows) ? value.rows : [];
  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows.map((row) => `
    <tr>
      ${columns.map((column) => `<td>${escapeHtml(String(row?.[column] ?? ""))}</td>`).join("")}
    </tr>
  `).join("");
  return `
    <table class="canvas-table">
      <thead><tr>${header}</tr></thead>
      <tbody>${body || `<tr><td colspan="${Math.max(1, columns.length)}">No rows</td></tr>`}</tbody>
    </table>
  `;
}

function extractMermaidSource(source) {
  const text = sourceToText(source).trim();
  const fence = text.match(/```mermaid\s+([\s\S]*?)```/i);
  if (fence?.[1]?.trim()) {
    return fence[1].trim();
  }
  if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline)\b/i.test(text)) {
    return text;
  }
  return "";
}

function extractEmbedURL(source) {
  const text = sourceToText(source);
  const iframeSrc = text.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
  const urlMatch = iframeSrc || text.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || "";
  if (!urlMatch) {
    return "";
  }
  try {
    const url = new URL(urlMatch);
    if (!isSafeURL(url.href)) {
      return "";
    }
    return allowedEmbedURL(url);
  } catch {
    return "";
  }
}

function allowedEmbedURL(url) {
  const host = url.hostname.toLowerCase();
  const allowedHosts = new Set([
    "www.youtube.com",
    "youtube.com",
    "www.youtube-nocookie.com",
    "youtube-nocookie.com",
    "player.vimeo.com",
    "open.spotify.com",
    "www.figma.com",
    "embed.figma.com",
    "www.google.com",
    "maps.google.com"
  ]);
  if (!allowedHosts.has(host)) {
    return "";
  }

  if (host.includes("youtube.com") && url.pathname.startsWith("/watch")) {
    const videoId = url.searchParams.get("v");
    return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : "";
  }

  return url.href;
}

async function loadMermaid() {
  if (state.mermaid) {
    return state.mermaid;
  }
  const module = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
  const mermaid = module.default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  state.mermaid = mermaid;
  return mermaid;
}

function markdownToHTML(markdown) {
  const text = String(markdown || "");
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) {
    return "<p></p>";
  }
  return blocks.map((block) => {
    const codeFence = block.match(/^```(\w+)?\n?([\s\S]*?)```$/);
    if (codeFence) {
      return `<pre><code>${escapeHtml(codeFence[2] || "")}</code></pre>`;
    }
    if (/^#{1,4}\s/.test(block)) {
      const level = Math.min(4, block.match(/^#+/)?.[0].length || 2);
      return `<h${level}>${escapeHtml(block.replace(/^#{1,4}\s/, ""))}</h${level}>`;
    }
    if (/^[-*] /m.test(block)) {
      const items = block.split("\n")
        .filter((line) => /^[-*] /.test(line))
        .map((line) => `<li>${inlineMarkdown(line.replace(/^[-*] /, ""))}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${inlineMarkdown(block).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function sanitizeHTML(input) {
  const doc = new DOMParser().parseFromString(`<body>${input}</body>`, "text/html");
  const output = document.createElement("div");
  for (const child of [...doc.body.childNodes]) {
    const safe = sanitizeNode(child);
    if (safe) {
      output.append(safe);
    }
  }
  return output.innerHTML;
}

function sanitizeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const allowedTags = new Set([
    "a", "article", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4",
    "hr", "i", "img", "li", "ol", "p", "pre", "section", "span", "strong", "table",
    "tbody", "td", "th", "thead", "tr", "ul"
  ]);
  const allowedClasses = new Set([
    "aires-artifact", "requirements-artifact", "requirements-intro", "requirements-section",
    "why-list", "requirements-two-col", "scope-grid", "scope-card", "moscow-list",
    "slice-table", "gwt-block", "ready-list", "mode-list", "queue-table",
    "canvas-table", "render-error"
  ]);
  const tag = node.tagName.toLowerCase();
  const blockedTags = new Set([
    "script", "style", "iframe", "object", "embed", "link", "meta", "form", "input",
    "button", "textarea", "select", "option"
  ]);

  if (blockedTags.has(tag)) {
    return null;
  }

  if (!allowedTags.has(tag)) {
    const fragment = document.createDocumentFragment();
    for (const child of [...node.childNodes]) {
      const safe = sanitizeNode(child);
      if (safe) {
        fragment.append(safe);
      }
    }
    return fragment;
  }

  const element = document.createElement(tag);
  for (const attr of [...node.attributes]) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name.startsWith("on") || name === "style") {
      continue;
    }
    if (name === "class") {
      const classes = value.split(/\s+/).filter((item) => allowedClasses.has(item));
      if (classes.length) {
        element.setAttribute("class", classes.join(" "));
      }
    }
    if (tag === "a" && name === "href" && isSafeURL(value)) {
      element.setAttribute("href", value);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
    if (tag === "img" && name === "src" && /^https:\/\//i.test(value)) {
      element.setAttribute("src", value);
    }
    if (tag === "img" && ["alt", "title", "width", "height"].includes(name)) {
      element.setAttribute(name, value);
    }
    if (["colspan", "rowspan"].includes(name) && /^\d+$/.test(value)) {
      element.setAttribute(name, value);
    }
  }

  for (const child of [...node.childNodes]) {
    const safe = sanitizeNode(child);
    if (safe) {
      element.append(safe);
    }
  }
  return element;
}

function sanitizeSVG(svg) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  doc.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function isSafeURL(value) {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function appendAssistantDelta(delta) {
  if (!delta) return;
  state.assistantDraft += delta;
  upsertDraftTurn(state.assistantDraft);
}

function finalizeAssistant(text) {
  const finalText = (text || "").trim();
  removeDraftTurn();
  state.assistantDraft = "";
  if (finalText) {
    appendTranscript("assistant", "Agent", finalText);
  }
}

function appendTranscript(kind, speaker, text) {
  if (!text) return;
  const turn = createTranscriptTurn(kind, speaker, text);
  state.transcriptTurns.push(turn);
  renderTranscriptTurn(turn);
  scheduleSessionSave("active");
}

function createTranscriptTurn(kind, speaker, text) {
  return {
    id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    speaker,
    text,
    createdAt: new Date().toISOString()
  };
}

function renderTranscript() {
  elements.transcriptList.replaceChildren();
  for (const turn of state.transcriptTurns) {
    renderTranscriptTurn(turn);
  }
}

function renderTranscriptTurn(turn) {
  const row = document.createElement("article");
  row.className = `turn ${turn.kind}`;
  row.innerHTML = `
    <div class="turn-header">
      <strong>${escapeHtml(turn.speaker)}</strong>
      <span>${formatTime(turn.createdAt)}</span>
    </div>
    <p>${escapeHtml(turn.text)}</p>
  `;
  elements.transcriptList.append(row);
  elements.transcriptList.scrollTop = elements.transcriptList.scrollHeight;
}

function upsertDraftTurn(text) {
  let row = $("#assistantDraft");
  if (!row) {
    row = document.createElement("article");
    row.id = "assistantDraft";
    row.className = "turn assistant";
    row.innerHTML = `
      <div class="turn-header">
        <strong>Agent</strong>
        <span>Live</span>
      </div>
      <p></p>
    `;
    elements.transcriptList.append(row);
  }
  row.querySelector("p").textContent = text;
  elements.transcriptList.scrollTop = elements.transcriptList.scrollHeight;
}

function removeDraftTurn() {
  $("#assistantDraft")?.remove();
}

function sendEvent(event) {
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
    return false;
  }
  state.dataChannel.send(JSON.stringify(event));
  return true;
}

function updateButtons(active) {
  elements.startCall.disabled = active;
  elements.endCall.disabled = !active;
  elements.muteCall.disabled = !active;
  elements.interruptCall.disabled = !active;
  elements.muteCall.textContent = "Mute";
  updateCallModeUI();
}

function updateTimer() {
  if (!state.callStartedAt) return;
  const elapsed = Math.floor((Date.now() - state.callStartedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  elements.callTimer.textContent = `${minutes}:${seconds}`;
  elements.callCostState.textContent = estimatedCallCost(elapsed);
}

function estimatedCallCost(elapsedSeconds = 0) {
  const dollars = Math.max(0, elapsedSeconds) * 0.00035;
  return `$${dollars.toFixed(2)} est`;
}

function setConnection(label) {
  elements.connectionState.textContent = label;
}

function showError(message) {
  elements.errorBanner.hidden = false;
  elements.errorBanner.textContent = message;
}

function clearError() {
  elements.errorBanner.hidden = true;
  elements.errorBanner.textContent = "";
}

function addEvent(title, body) {
  const item = document.createElement("div");
  item.className = "event-item";
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(body)}`;
  elements.eventLog.prepend(item);
}

function notifyNative(title, body, category = "status") {
  const handler = window.webkit?.messageHandlers?.nativeNotification;
  if (!handler) {
    return false;
  }
  try {
    handler.postMessage({
      title: redactNotificationText(title),
      body: redactNotificationText(body),
      category: redactNotificationText(category)
    });
    return true;
  } catch {
    return false;
  }
}

function requestNativeNotificationStatus(options = {}) {
  const handlerName = options.requestPermission ? "nativeNotificationPermission" : "nativeNotificationStatus";
  const handler = window.webkit?.messageHandlers?.[handlerName];
  if (!handler) {
    state.notificationStatus = {
      authorizationStatus: "unavailable",
      alertSetting: "unavailable",
      soundSetting: "unavailable",
      notificationCenterSetting: "unavailable"
    };
    if (!options.silent && state.view === "settings") {
      renderShellView("settings");
    }
    return false;
  }
  try {
    handler.postMessage({
      requestId: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
    return true;
  } catch {
    return false;
  }
}

function redactNotificationText(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_\-]{12,}/g, "[redacted-openai-key]")
    .slice(0, 180);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function shortenPath(path) {
  if (!path) return "Workspace";
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso) {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
