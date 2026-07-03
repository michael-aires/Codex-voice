import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const OPERATOR_BUDGET_DEFAULTS = {
  maxSteps: 40,
  maxCodexInvocations: 3,
  maxWallClockMs: 15 * 60 * 1000
};

export const OPERATOR_PRESETS = [
  {
    id: "operator_document_suite",
    title: "Operator document suite",
    description: "Generate PRD, execution plan, AIRES requirements, diagram, wireframe, and prototype artifacts from the spoken context.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["product_requirements", "execution_plan", "aires_requirements", "mermaid_diagram", "ui_wireframe", "html_prototype"]
  },
  {
    id: "aires_template_suite",
    title: "All AIRES template documents",
    description: "Generate the full AIRES template set: capability matrix, JTBD, blueprint, personas, thesis, flywheel, daily flow, and scoped requirements.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    templateIds: ["all"]
  },
  {
    id: "landing_page",
    title: "Landing page",
    description: "Create a polished standalone landing page from the spoken product, offer, or campaign context.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["landing_page"]
  },
  {
    id: "mini_app",
    title: "Mini application prototype",
    description: "Create an interactive single-file HTML/CSS/JS mini app from the requested workflow.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["mini_app"]
  },
  {
    id: "large_report",
    title: "Large executive report",
    description: "Create a long-form executive report with professional HTML rendering and print export.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["executive_report"]
  },
  {
    id: "html_prototype",
    title: "HTML prototype",
    description: "Create a mobile-first interactive HTML prototype from the conversation context.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["html_prototype"]
  },
  {
    id: "aires_requirements",
    title: "AIRES scoped requirements",
    description: "Create an AIRES-branded scoped requirements artifact with slices and acceptance criteria.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["aires_requirements"]
  },
  {
    id: "product_requirements",
    title: "Product requirements doc",
    description: "Create a pragmatic PRD from the conversation context.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["product_requirements"]
  },
  {
    id: "mermaid_diagram",
    title: "Mermaid diagram",
    description: "Create a workflow, architecture, data, or decision diagram.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["mermaid_diagram"]
  },
  {
    id: "sendgrid_sender_auth",
    title: "SendGrid sender authentication",
    description: "Open a supervised browser task to prepare sender authentication and DNS records.",
    targetUrl: "https://app.sendgrid.com/",
    defaultDomains: ["app.sendgrid.com", "sendgrid.com"],
    riskLevel: "write"
  },
  {
    id: "github_repo_debug",
    title: "GitHub repo read-only debugging",
    description: "Inspect repository context and produce a debugging brief without write access.",
    targetUrl: "https://github.com/",
    defaultDomains: ["github.com"],
    riskLevel: "read"
  },
  {
    id: "codex_local_planning",
    title: "Local Codex planning run",
    description: "Use the local operator workspace to draft a plan, checklist, implementation notes, and next-step artifact.",
    targetUrl: "",
    defaultDomains: [],
    riskLevel: "read",
    artifactKinds: ["execution_plan"]
  }
];

export function operatorRuntimeInfo(env = process.env) {
  const home = env.HOME || homedir();
  return {
    mode: "local",
    browserProfile: env.COOPER_OPERATOR_BROWSER_PROFILE || join(home, ".cooper", "profiles", "operator"),
    codexWorkspace: env.COOPER_OPERATOR_WORKSPACE || join(home, ".cooper", "operator-workspace"),
    codexRuntime: env.COOPER_OPERATOR_CODEX_RUNTIME || "codex exec",
    visibleBrowser: true,
    browserLaunchEnabled:
      env.COOPER_OPERATOR_LAUNCH_BROWSER === "true" ||
      (env.COOPER_OPERATOR_LAUNCH_BROWSER !== "false" && env.NODE_ENV !== "production"),
    computerUseEnabled: env.COOPER_OPERATOR_COMPUTER_USE === "true",
    defaultAllowedDomains: normalizeAllowedDomains(
      env.COOPER_OPERATOR_ALLOWED_DOMAINS ||
        "github.com,app.sendgrid.com,sendgrid.com,notion.so,linear.app,dashboard.stripe.com"
    ),
    budgets: { ...OPERATOR_BUDGET_DEFAULTS }
  };
}

export function normalizeAllowedDomains(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return [...new Set(raw.map((item) => normalizeDomain(item)).filter(Boolean))];
}

export function operatorSkillSteps(skill) {
  const preset = OPERATOR_PRESETS.find((item) => item.id === cleanText(skill));
  if (preset?.artifactKinds?.length || preset?.templateIds?.length) {
    return [
      "Capture Michael's voice goal and source context.",
      "Queue real Cooper work jobs in the background.",
      "Monitor model execution, retries, token budgets, and artifact readiness.",
      "Present generated artifacts, open approvals, and next actions."
    ];
  }

  switch (skill) {
    case "sendgrid_sender_auth":
      return [
        "Prepare local browser profile and confirm allowed domains.",
        "Open the target system in a visible headed browser.",
        "Navigate to sender authentication and collect required setup state.",
        "Pause before any account-changing action or external submission.",
        "Return DNS records, screenshots, and a replayable summary."
      ];
    case "github_repo_debug":
      return [
        "Prepare a read-only repository inspection run.",
        "Collect relevant files, issues, and recent activity from approved sources.",
        "Ask local Codex to synthesize debugging hypotheses and next checks.",
        "Return a sourced debugging brief with follow-up questions."
      ];
    case "codex_local_planning":
      return [
        "Create or reuse the local operator workspace.",
        "Write the task brief and acceptance criteria for the Codex worker.",
        "Run the Codex planning pass within budget limits.",
        "Return the plan, risks, and next approvals."
      ];
    default:
      return [
        "Capture the user goal and available context.",
        "Prepare the local runtime and approved workspace.",
        "Run the supervised operator loop within budget.",
        "Return artifacts, checkpoints, and next approvals."
      ];
  }
}

export function riskForOperatorTask(input = {}) {
  const skill = cleanText(input.skill);
  const targetUrl = cleanText(input.targetUrl).toLowerCase();
  const presetRisk = OPERATOR_PRESETS.find((preset) => preset.id === skill)?.riskLevel;
  if (presetRisk) return presetRisk;
  if (targetUrl.includes("sendgrid") || targetUrl.includes("mail") || targetUrl.includes("slack")) return "write";
  if (targetUrl.includes("github.com") || targetUrl.includes("notion.so")) return "read";
  return "write";
}

export function createOperatorTask(input = {}, now = new Date().toISOString()) {
  const skill = cleanText(input.skill) || "codex_local_planning";
  const preset = OPERATOR_PRESETS.find((item) => item.id === skill);
  const goal = cleanText(input.goal) || preset?.description || "Run a supervised local Operator task.";
  const targetUrl = cleanText(input.targetUrl || preset?.targetUrl || "");
  const allowedDomains = normalizeAllowedDomains(input.allowedDomains?.length ? input.allowedDomains : preset?.defaultDomains || targetUrl);
  const steps = operatorSkillSteps(skill);

  return hydrateOperatorTask({
    id: randomUUID(),
    title: cleanText(input.title) || preset?.title || titleFromGoal(goal),
    goal,
    skill,
    targetUrl,
    allowedDomains,
    riskLevel: riskForOperatorTask({ skill, targetUrl }),
    artifactKinds: Array.isArray(input.artifactKinds) && input.artifactKinds.length
      ? input.artifactKinds.map(cleanText).filter(Boolean)
      : preset?.artifactKinds || [],
    templateIds: Array.isArray(input.templateIds) && input.templateIds.length
      ? input.templateIds.map(cleanText).filter(Boolean)
      : preset?.templateIds || [],
    relatedCallId: cleanText(input.relatedCallId),
    jobIds: Array.isArray(input.jobIds) ? input.jobIds.map(cleanText).filter(Boolean) : [],
    jobsQueuedAt: cleanText(input.jobsQueuedAt),
    status: "queued",
    budgets: { ...OPERATOR_BUDGET_DEFAULTS, ...(input.budgets || {}) },
    steps,
    stepIndex: 0,
    codexInvocations: 0,
    approvals: [],
    artifacts: [],
    logs: [
      createOperatorLog("queued", "Task queued", "Operator accepted the task and is waiting for the local runner.")
    ],
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    stoppedAt: null,
    error: ""
  });
}

export function hydrateOperatorTask(task = {}) {
  const skill = cleanText(task.skill) || "codex_local_planning";
  const createdAt = cleanText(task.createdAt) || new Date().toISOString();
  return {
    id: cleanText(task.id) || randomUUID(),
    title: cleanText(task.title) || titleFromGoal(task.goal),
    goal: cleanText(task.goal) || "Run a supervised local Operator task.",
    skill,
    targetUrl: cleanText(task.targetUrl),
    allowedDomains: normalizeAllowedDomains(task.allowedDomains),
    riskLevel: cleanText(task.riskLevel) || riskForOperatorTask(task),
    artifactKinds: Array.isArray(task.artifactKinds) ? task.artifactKinds.map(cleanText).filter(Boolean) : [],
    templateIds: Array.isArray(task.templateIds) ? task.templateIds.map(cleanText).filter(Boolean) : [],
    relatedCallId: cleanText(task.relatedCallId),
    jobIds: Array.isArray(task.jobIds) ? task.jobIds.map(cleanText).filter(Boolean) : [],
    jobsQueuedAt: cleanText(task.jobsQueuedAt),
    status: cleanText(task.status) || "queued",
    budgets: { ...OPERATOR_BUDGET_DEFAULTS, ...(task.budgets || {}) },
    steps: Array.isArray(task.steps) && task.steps.length ? task.steps.map(cleanText).filter(Boolean) : operatorSkillSteps(skill),
    stepIndex: Number(task.stepIndex || 0),
    codexInvocations: Number(task.codexInvocations || 0),
    approvals: Array.isArray(task.approvals) ? task.approvals.map(hydrateApproval) : [],
    artifacts: Array.isArray(task.artifacts) ? task.artifacts.map(hydrateArtifact) : [],
    logs: Array.isArray(task.logs) && task.logs.length ? task.logs.map(hydrateLog) : [createOperatorLog("recovered", "Task recovered", "Operator recovered this task from local persistence.")],
    createdAt,
    updatedAt: cleanText(task.updatedAt) || createdAt,
    startedAt: cleanText(task.startedAt),
    completedAt: cleanText(task.completedAt),
    stoppedAt: cleanText(task.stoppedAt),
    error: cleanText(task.error)
  };
}

export function operatorTaskPublic(task) {
  const hydrated = hydrateOperatorTask(task);
  return {
    ...hydrated,
    progress: operatorProgress(hydrated),
    logs: hydrated.logs.slice(-80),
    approvals: hydrated.approvals.slice(-20),
    artifacts: hydrated.artifacts.slice(-20)
  };
}

export function operatorProgress(task) {
  if (task.status === "completed") return 100;
  if (task.status === "failed" || task.status === "stopped" || task.status === "cancelled") {
    return Math.max(8, Math.min(100, Math.round((Number(task.stepIndex || 0) / Math.max(1, task.steps?.length || 1)) * 100)));
  }
  if (task.status === "queued") return 5;
  return Math.max(12, Math.min(95, Math.round((Number(task.stepIndex || 0) / Math.max(1, task.steps?.length || 1)) * 100)));
}

export function createOperatorLog(type, title, detail = "", at = new Date().toISOString()) {
  return {
    id: randomUUID(),
    type: cleanText(type) || "activity",
    title: cleanText(title) || "Operator activity",
    detail: cleanText(detail),
    at
  };
}

export function createOperatorApproval(input = {}, at = new Date().toISOString()) {
  return {
    id: randomUUID(),
    type: cleanText(input.type) || "operator_approval",
    title: cleanText(input.title) || "Approval required",
    description: cleanText(input.description) || "Approve this checkpoint before Operator continues.",
    status: "pending",
    requestedAt: at,
    resolvedAt: null
  };
}

export function createOperatorArtifact(input = {}, at = new Date().toISOString()) {
  return {
    id: randomUUID(),
    type: cleanText(input.type) || "summary",
    title: cleanText(input.title) || "Operator artifact",
    content: cleanText(input.content),
    createdAt: at
  };
}

export function isOperatorTaskActive(task) {
  return ["queued", "running", "waiting_approval"].includes(cleanText(task?.status));
}

export function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hydrateLog(log) {
  return {
    id: cleanText(log.id) || randomUUID(),
    type: cleanText(log.type) || "activity",
    title: cleanText(log.title) || "Operator activity",
    detail: cleanText(log.detail),
    at: cleanText(log.at) || new Date().toISOString()
  };
}

function hydrateApproval(approval) {
  return {
    id: cleanText(approval.id) || randomUUID(),
    type: cleanText(approval.type) || "operator_approval",
    title: cleanText(approval.title) || "Approval required",
    description: cleanText(approval.description) || "Approve this checkpoint before Operator continues.",
    status: cleanText(approval.status) || "pending",
    requestedAt: cleanText(approval.requestedAt) || new Date().toISOString(),
    resolvedAt: cleanText(approval.resolvedAt)
  };
}

function hydrateArtifact(artifact) {
  return {
    id: cleanText(artifact.id) || randomUUID(),
    type: cleanText(artifact.type) || "summary",
    title: cleanText(artifact.title) || "Operator artifact",
    content: cleanText(artifact.content),
    createdAt: cleanText(artifact.createdAt) || new Date().toISOString()
  };
}

function normalizeDomain(value) {
  const text = cleanText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
  return /^[a-z0-9.-]+$/.test(text) ? text : "";
}

function titleFromGoal(goal) {
  const clean = cleanText(goal);
  if (!clean) return "Operator task";
  return clean.length > 62 ? `${clean.slice(0, 59)}...` : clean;
}
