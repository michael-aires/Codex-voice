import { AIRES_EXAMPLE_DOCUMENTS, findAiresExample } from "./airesExamples.js";

export const REQUIREMENTS_SUITE_ORDER = Object.freeze([
  "context_to_product_content",
  "jtbd_canvas",
  "personas_manager_rep",
  "thesis_rep_velocity",
  "client_capability_matrix",
  "daily_rep_flow",
  "service_blueprint",
  "data_flywheel",
  "scoped_requirements_rep_velocity"
]);

const STAGES = Object.freeze({
  context_to_product_content: "Capture",
  jtbd_canvas: "Distill",
  personas_manager_rep: "Distill",
  thesis_rep_velocity: "Scope",
  client_capability_matrix: "Scope",
  daily_rep_flow: "Model",
  service_blueprint: "Model",
  data_flywheel: "Model",
  scoped_requirements_rep_velocity: "Verify"
});

const SIGNALS = Object.freeze([
  {
    id: "jtbd_canvas",
    phrases: ["job to be done", "jobs to be done", "customer pain", "user pain", "workaround", "discovery", "desired progress", "struggling moment"],
    reason: "The discussion contains discovery signals that should be distilled into a user job, forces, pains, and desired progress."
  },
  {
    id: "personas_manager_rep",
    phrases: ["persona", "manager", "sales rep", "operator", "stakeholder", "role", "different users", "frontline"],
    reason: "The discussion spans roles or stakeholders whose goals, incentives, and information needs should be separated."
  },
  {
    id: "thesis_rep_velocity",
    phrases: ["thesis", "strategy", "wedge", "why now", "bet", "hypothesis", "positioning", "roadmap"],
    reason: "The discussion contains a product bet that would benefit from an explicit thesis, proof points, and validation path."
  },
  {
    id: "client_capability_matrix",
    phrases: ["capability", "gap", "client", "customer segment", "readiness", "maturity", "enablement"],
    reason: "The discussion compares capabilities or readiness and can be made decision-ready as a gap matrix."
  },
  {
    id: "daily_rep_flow",
    phrases: ["workflow", "day in the life", "daily", "step by step", "task flow", "process", "journey"],
    reason: "The discussion describes a concrete workflow that should be mapped step by step with decisions and friction."
  },
  {
    id: "service_blueprint",
    phrases: ["handoff", "frontstage", "backstage", "service blueprint", "service map", "operations", "failure point", "dependency"],
    reason: "The discussion contains handoffs, systems, or failure points that need a frontstage/backstage service view."
  },
  {
    id: "data_flywheel",
    phrases: ["flywheel", "data loop", "feedback loop", "system model", "intelligence", "learning loop", "automation"],
    reason: "The discussion describes a reinforcing data or learning loop that should be visualized as a system model."
  },
  {
    id: "context_to_product_content",
    phrases: ["notes", "context", "transcript", "research", "feedback", "synthesis", "raw output"],
    reason: "The source material is context-heavy and should first be distilled into reusable product language and evidence."
  },
  {
    id: "scoped_requirements_rep_velocity",
    phrases: ["requirement", "acceptance criteria", "scope", "build", "feature", "ticket", "implementation", "definition of ready", "moscow", "invest"],
    reason: "The discussion is converging on buildable work and should become scoped requirements, vertical slices, and acceptance criteria."
  }
]);

const CONTENT_CONTRACT = Object.freeze([
  "Problem, underlying job, goal, success metric, and 5-whys check",
  "Users and stakeholders",
  "Current state and desired state",
  "In scope, out of scope now, and non-goals",
  "Data, edge cases, failure modes, constraints, and non-functional requirements",
  "MoSCoW prioritization",
  "Vertical INVEST slices",
  "Given/When/Then acceptance criteria",
  "Definition of Ready"
]);

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function evidenceLines(context) {
  return String(context || "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20)
    .slice(0, 4);
}

export function requirementsSuitePlan(templateIds = REQUIREMENTS_SUITE_ORDER) {
  const requested = Array.isArray(templateIds) && templateIds.length ? templateIds : REQUIREMENTS_SUITE_ORDER;
  const selected = new Set(requested);

  return REQUIREMENTS_SUITE_ORDER
    .filter((id) => selected.has(id))
    .map((id, index) => {
      const template = findAiresExample(id);
      return {
        id,
        title: template?.title || id,
        category: template?.category || "Requirements",
        stage: STAGES[id] || "Scope",
        order: index + 1,
        description: template?.description || ""
      };
    });
}

export function recommendRequirementsArtifacts({ context = "", maxRecommendations = 4 } = {}) {
  const text = normalizedText(context);
  const limit = Math.max(1, Math.min(Number(maxRecommendations) || 4, 9));
  const scored = SIGNALS.map((signal) => {
    const matches = signal.phrases.filter((phrase) => text.includes(phrase));
    return { ...signal, score: matches.length, matches };
  }).filter((signal) => signal.score > 0);

  if (!scored.length) {
    scored.push(
      { ...SIGNALS.find((signal) => signal.id === "context_to_product_content"), score: 1, matches: [] },
      { ...SIGNALS.find((signal) => signal.id === "jtbd_canvas"), score: 1, matches: [] },
      { ...SIGNALS.find((signal) => signal.id === "scoped_requirements_rep_velocity"), score: 1, matches: [] }
    );
  } else if (!scored.some((signal) => signal.id === "scoped_requirements_rep_velocity")) {
    scored.push({
      ...SIGNALS.find((signal) => signal.id === "scoped_requirements_rep_velocity"),
      score: 0.5,
      matches: [],
      reason: "Use scoped requirements as the delivery artifact once the problem and workflow are sufficiently clear."
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || REQUIREMENTS_SUITE_ORDER.indexOf(a.id) - REQUIREMENTS_SUITE_ORDER.indexOf(b.id))
    .slice(0, limit)
    .map((signal, index) => {
      const template = findAiresExample(signal.id);
      return {
        id: signal.id,
        title: template?.title || signal.id,
        category: template?.category || "Requirements",
        stage: STAGES[signal.id] || "Scope",
        priority: index + 1,
        confidence: signal.score >= 2 ? "high" : signal.score >= 1 ? "medium" : "foundation",
        reason: signal.reason,
        evidenceSignals: signal.matches
      };
    });
}

export function buildRequirementsDraftOutline({ topic = "", context = "", documentId = "" } = {}) {
  const recommendations = recommendRequirementsArtifacts({ context, maxRecommendations: 3 });
  const selected = findAiresExample(documentId) || findAiresExample(recommendations[0]?.id);
  const text = normalizedText(context);
  const missing = [];

  if (!/(metric|measure|success|increase|reduce|faster|rate|percent|%)/.test(text)) missing.push("What measurable outcome would prove this worked?");
  if (!/(user|customer|manager|rep|operator|admin|team|stakeholder)/.test(text)) missing.push("Who is the primary user, and who else is affected?");
  if (!/(today|currently|current state|now|workaround|manual)/.test(text)) missing.push("How does the workflow work today, including the current workaround?");
  if (!/(constraint|must|cannot|permission|security|latency|compliance|deadline)/.test(text)) missing.push("Which constraints, permissions, failure modes, or non-functionals are real boundaries?");
  if (!/(data|record|field|object|source of truth|integration|sync)/.test(text)) missing.push("Which data objects and systems of record are involved?");

  return {
    topic: topic || "Current discussion",
    recommendedDocument: selected ? {
      id: selected.id,
      title: selected.title,
      reason: recommendations.find((item) => item.id === selected.id)?.reason || selected.description
    } : null,
    gist: `Shape ${topic || "the current discussion"} from source evidence into the thinnest useful, testable product decision without inventing missing facts.`,
    evidence: evidenceLines(context),
    assumptions: [
      "Anything not established in the source context remains an assumption or decision gate.",
      "The first delivery slice should prove the riskiest workflow or data assumption before broadening scope."
    ],
    sections: CONTENT_CONTRACT,
    missingQuestions: missing.slice(0, 4),
    recommendations
  };
}

export function isRequirementsWorkshopJob(job) {
  return Boolean(job && (
    job.workstream === "aires_requirements" ||
    job.requirementsRunId ||
    job.templateId ||
    job.kind === "aires_requirements"
  ));
}

export function allRequirementsTemplateIds() {
  return AIRES_EXAMPLE_DOCUMENTS.map((template) => template.id);
}
