export const DOCUMENT_PIPELINE_STAGES = Object.freeze([
  { id: "capture", label: "Capture evidence" },
  { id: "shape", label: "Shape the document" },
  { id: "generate", label: "Generate the artifact" },
  { id: "validate", label: "Validate quality" },
  { id: "publish", label: "Publish and notify" }
]);

const priorityWeights = Object.freeze({ low: 0, normal: 1, high: 2, urgent: 3 });

export function normalizeJobPriority(value) {
  const priority = String(value || "normal").trim().toLowerCase();
  return Object.hasOwn(priorityWeights, priority) ? priority : "normal";
}

export function sortDocumentQueue(jobs = []) {
  return [...jobs].sort((left, right) => {
    const priorityDelta = priorityWeights[normalizeJobPriority(right.priority)]
      - priorityWeights[normalizeJobPriority(left.priority)];
    if (priorityDelta) return priorityDelta;

    const sequenceDelta = Number(left.sequence || Number.MAX_SAFE_INTEGER)
      - Number(right.sequence || Number.MAX_SAFE_INTEGER);
    if (sequenceDelta) return sequenceDelta;

    return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
  });
}

export function pipelineStageForJob(job = {}, recipe = {}) {
  if (["completed"].includes(job.status)) return "publish";
  if (["failed", "canceled"].includes(job.status)) return job.pipelineStage || "validate";
  if (["validating", "repairing"].includes(job.apiStatus)) return "validate";

  const stepIndex = Number(job.stepIndex || 0);
  const stepCount = Number(job.stepCount || recipe.steps?.length || 1);
  if (job.status === "queued" && stepIndex === 0) return "capture";
  if (stepIndex >= Math.max(0, stepCount - 1)) return "generate";
  return "shape";
}

export function applyDocumentJobControl(job = {}, action, now = new Date().toISOString()) {
  const current = String(job.status || "queued");
  const next = { ...job };
  const result = { ok: true, changed: true, job: next, message: "" };

  if (action === "pause") {
    if (current === "queued") {
      next.status = "paused";
      next.apiStatus = "paused";
      next.progress = "Paused before the next model step.";
      next.pausedAt = now;
      next.pauseRequested = false;
      result.message = "Document generation paused.";
      return result;
    }
    if (current === "running") {
      next.status = "pausing";
      next.apiStatus = "pause_requested";
      next.progress = "Pausing after the current model step.";
      next.pauseRequested = true;
      result.message = "Pause requested. The current model step will finish safely.";
      return result;
    }
  }

  if (action === "resume" && current === "paused") {
    next.status = "queued";
    next.apiStatus = "queued";
    next.progress = `Queued to resume at step ${Number(next.stepIndex || 0) + 1}.`;
    next.pauseRequested = false;
    next.pausedAt = null;
    result.message = "Document generation resumed.";
    return result;
  }

  if (action === "cancel") {
    if (["queued", "paused"].includes(current)) {
      next.status = "canceled";
      next.apiStatus = "canceled";
      next.progress = "Canceled before another model step ran.";
      next.canceledAt = now;
      next.cancelRequested = false;
      result.message = "Document generation canceled.";
      return result;
    }
    if (["running", "pausing"].includes(current)) {
      next.status = "canceling";
      next.apiStatus = "cancel_requested";
      next.progress = "Canceling after the current model step.";
      next.cancelRequested = true;
      result.message = "Cancel requested. The current model step will finish safely.";
      return result;
    }
  }

  return {
    ok: false,
    changed: false,
    job,
    message: `Cannot ${action} a document job in ${current} state.`
  };
}

export function qualityReportForArtifact({
  kind = "",
  outputType = "markdown",
  content = "",
  sourceManifest = {},
  minimumScore = 80
} = {}) {
  const text = String(content || "").trim();
  const lower = text.toLowerCase();
  const checks = [];
  const add = (id, label, passed, { required = true, repairable = true } = {}) => {
    checks.push({ id, label, passed: Boolean(passed), required, repairable });
  };

  add("content", "Substantial content was generated", text.length >= 240);
  add(
    "lineage",
    "Source evidence is attached",
    Number(sourceManifest.transcriptTurnCount || 0) > 0
      || Number(sourceManifest.contextSourceCount || 0) > 0
      || Number(sourceManifest.instructionCharCount || 0) > 0,
    { repairable: false }
  );
  add("complete", "The model did not report an incomplete response", !lower.includes("cooper note: this step ended incomplete"));
  add("private_reasoning", "No private reasoning trace is present", !/(chain[- ]of[- ]thought|hidden reasoning|private reasoning)/i.test(text));

  if (outputType === "html") {
    add("doctype", "Standalone HTML document", /^\s*<!doctype html>/i.test(text));
    add("inline_style", "Includes an inline style system", /<style[\s>]/i.test(text));
    add("no_external_scripts", "Contains no external scripts", !/<script[^>]+src\s*=/i.test(text));
    add("no_fences", "Contains no Markdown fences", !text.includes("```"));
  } else {
    add("heading", "Readable document hierarchy", /^#{1,3}\s+\S/m.test(text));
    const fences = text.match(/```/g)?.length || 0;
    add("balanced_fences", "Code fences are balanced", fences % 2 === 0);
  }

  if (kind === "mermaid_diagram") {
    add("mermaid", "Includes a Mermaid diagram", /```mermaid[\s\S]+?```/i.test(text));
  }

  if (["aires_requirements", "product_requirements"].includes(kind)) {
    add("problem_goal", "Defines the problem and goal", /(problem|current state)[\s\S]{0,1500}(goal|desired state)/i.test(text));
    add("scope", "Defines scope and exclusions", /(in scope|scope)[\s\S]{0,1800}(out of scope|non-goal|won.t)/i.test(text));
    add("acceptance", "Includes acceptance criteria", /(acceptance criteria|given[\s\S]{0,400}when[\s\S]{0,400}then)/i.test(text));
    if (kind === "aires_requirements") {
      add("moscow", "Includes MoSCoW prioritization", /moscow|must have|should have|could have/i.test(text));
      add("ready", "Includes Definition of Ready", /definition of ready/i.test(text));
    }
  }

  if (kind === "architecture_decision_record") {
    add("decision", "Records a clear decision", /decision/i.test(text));
    add("options", "Compares options or alternatives", /(options|alternatives|considered)/i.test(text));
    add("consequences", "Captures consequences", /(consequences|tradeoffs|trade-offs)/i.test(text));
  }

  if (kind === "sprint_recap") {
    add("outcomes", "Summarizes sprint outcomes", /(outcomes|completed|shipped)/i.test(text));
    add("carryover", "Calls out carryover or blockers", /(carryover|blockers|not completed|remaining)/i.test(text));
    add("next", "Recommends the next sprint move", /(next sprint|next steps|recommendation)/i.test(text));
  }

  const required = checks.filter((check) => check.required);
  const passed = required.filter((check) => check.passed).length;
  const score = required.length ? Math.round((passed / required.length) * 100) : 100;
  const failedChecks = checks.filter((check) => check.required && !check.passed);
  const status = score >= Number(minimumScore || 80) && failedChecks.every((check) => check.id !== "content")
    ? "passed"
    : "needs_review";

  return {
    status,
    score,
    minimumScore: Number(minimumScore || 80),
    checks,
    warnings: failedChecks.map((check) => check.label),
    repairable: failedChecks.some((check) => check.repairable),
    summary: status === "passed"
      ? `Quality gate passed at ${score}%.`
      : `Quality gate needs review at ${score}%: ${failedChecks.map((check) => check.label).join(", ")}.`
  };
}

export function qualityRepairInstruction(report = {}, { kind = "document", outputType = "markdown" } = {}) {
  const failures = (report.checks || [])
    .filter((check) => check.required && !check.passed && check.repairable)
    .map((check) => `- ${check.label}`)
    .join("\n");

  return `Revise the current ${kind} artifact so it passes these public quality checks:\n${failures || "- Improve completeness and structure"}\n\nPreserve supported facts and source fidelity. Do not invent owners, dates, metrics, customer claims, or implementation details. Return only the complete corrected ${outputType === "html" ? "standalone HTML document" : "Markdown document"}.`;
}

export function nextArtifactVersion(artifacts = [], job = {}) {
  const related = artifacts.filter((artifact) => artifact.callId === job.callId && artifact.kind === job.kind);
  return related.reduce((max, artifact) => Math.max(max, Number(artifact.version || 1)), 0) + 1;
}
