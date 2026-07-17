import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionPresentationVoicePrompt,
  buildSessionPreparationPrompt,
  createSessionPresentation,
  createPreparedSessionOverview,
  createManualPreparationPlan,
  deriveSessionPreparationState,
  normalizePreparationKinds,
  recommendSessionPreparation,
  SESSION_PREPARATION_OPTIONS
} from "../src/sessionPreparation.js";

test("normalizes preparation selections to supported recipes without duplicates", () => {
  assert.deepEqual(
    normalizePreparationKinds(["executive_report", "qa_checklist", "executive_report", "unknown"]),
    ["executive_report", "qa_checklist"]
  );
  assert.equal(SESSION_PREPARATION_OPTIONS.length, 6);
  assert.deepEqual(SESSION_PREPARATION_OPTIONS.slice(-2).map((option) => option.kind), [
    "architecture_decision_record",
    "html_prototype"
  ]);
});

test("Cooper recommends a bounded document set from the session evidence", () => {
  const plan = recommendSessionPreparation({
    focus: { title: "Permissions UI bug", description: "Review an API permission failure and prototype the missing settings page." },
    sessionContext: "The room needs QA evidence and an architecture decision for the role guard."
  });
  assert.equal(plan.mode, "cooper");
  assert.ok(plan.kinds.includes("executive_report"));
  assert.ok(plan.kinds.includes("aires_requirements"));
  assert.ok(plan.kinds.includes("qa_checklist"));
  assert.ok(plan.kinds.includes("architecture_decision_record"));
  assert.ok(plan.kinds.includes("html_prototype"));
  assert.ok(plan.kinds.length <= 5);
});

test("manual preparation preserves an explicit no-document choice", () => {
  assert.deepEqual(createManualPreparationPlan([]), {
    mode: "manual",
    kinds: [],
    reasons: {},
    rationale: "No documents were requested before entry."
  });
});

test("session readiness waits for required outputs but lets optional work continue", () => {
  const jobs = [
    { id: "brief", callId: "call-1", kind: "executive_report", workstream: "session_preparation", status: "completed" },
    { id: "requirements", callId: "call-1", kind: "aires_requirements", workstream: "session_preparation", status: "completed" },
    { id: "qa", callId: "call-1", kind: "qa_checklist", workstream: "session_preparation", status: "running" }
  ];
  const artifacts = [
    { id: "brief-artifact", jobId: "brief", callId: "call-1", kind: "executive_report", workstream: "session_preparation" },
    { id: "requirements-artifact", jobId: "requirements", callId: "call-1", kind: "aires_requirements", workstream: "session_preparation" }
  ];
  const readiness = deriveSessionPreparationState({
    callId: "call-1",
    kinds: ["executive_report", "aires_requirements", "qa_checklist"],
    jobs,
    artifacts
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.completedCount, 2);
  assert.equal(readiness.outputs.find((output) => output.kind === "qa_checklist").status, "running");
});

test("failed required work produces a degraded but enterable session", () => {
  const readiness = deriveSessionPreparationState({
    callId: "call-1",
    kinds: ["executive_report"],
    jobs: [{ id: "brief", callId: "call-1", kind: "executive_report", workstream: "session_preparation", status: "failed" }]
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.degraded, true);
  assert.equal(readiness.failedCount, 1);
});

test("builds a prepared overview from the bounded context packet", () => {
  const packet = {
    id: "packet-1",
    intent: "Agree on the permissions contract and implementation path.",
    sources: [
      { id: "notion-1", provider: "notion", type: "page", title: "PDD-4756 · Corporate Demand Notes", meta: "Notion page", resolutionStatus: "completed" },
      { id: "pr-482", provider: "github", type: "pull_request", title: "PR #482 · permissions read path", meta: "aires/crm", resolutionStatus: "completed" }
    ]
  };
  const sessionContext = [
    "# Cooper Session Context Packet",
    "## Source: PDD-4756 · Corporate Demand Notes",
    "Corporate demand notes exist, but expected roles cannot find the UI entry.",
    "## Source: PR #482 · permissions read path",
    "The pull request restores the read path and adds permission checks."
  ].join("\n\n");

  const overview = createPreparedSessionOverview({
    packet,
    sessionContext,
    focus: { title: "Corporate Demand Notes", description: "Review the UI and permissions gap." },
    jobs: [{ id: "job-1", kind: "executive_report", title: "Shared context brief", status: "running", workstream: "session_preparation" }],
    artifacts: []
  });

  assert.equal(overview.title, "Corporate Demand Notes");
  assert.match(overview.goal, /permissions contract/);
  assert.equal(overview.coverage, 100);
  assert.equal(overview.evidence.length, 2);
  assert.match(overview.evidence[0].summary, /expected roles/);
  assert.equal(overview.preparedArtifacts[0].status, "running");
});

test("preparation prompts keep the selected packet as the evidence boundary", () => {
  const prompt = buildSessionPreparationPrompt("qa_checklist", {
    focus: { title: "Permissions review" },
    sessionContext: "# Packet\nOnly selected evidence belongs here."
  });

  assert.match(prompt, /Permissions review/);
  assert.match(prompt, /Only selected evidence belongs here/);
  assert.match(prompt, /Do not invent/);
  assert.match(prompt, /verification/);
});

test("every prepared session produces a four-slide opening presentation", () => {
  const packet = {
    id: "packet-1",
    intent: "Agree on the permissions contract.",
    sources: [{ id: "notion-1", provider: "notion", type: "page", title: "PDD-4756", resolutionStatus: "completed" }]
  };
  const presentation = createSessionPresentation({
    packet,
    sessionContext: "## Source: PDD-4756\nThe permission menu is missing for expected roles.",
    focus: { id: "task-1", title: "Corporate Demand Notes", description: "Review the permissions gap." }
  });

  assert.equal(presentation.slides.length, 4);
  assert.deepEqual(presentation.slides.map((slide) => slide.id), [
    "session-brief",
    "shared-understanding",
    "questions",
    "recommended-path"
  ]);
  assert.match(presentation.slides[1].items[0].detail, /permission menu is missing/);
  assert.match(presentation.slides[3].items.at(-1).title, /owner and verification/i);
});

test("session presentation narration stays bounded to loaded context", () => {
  const prompt = buildSessionPresentationVoicePrompt({
    packet: { id: "packet-1", intent: "Decide scope.", sources: [] },
    focus: { title: "Permissions review" }
  });
  assert.match(prompt, /opening session brief/);
  assert.match(prompt, /only the context already loaded/);
  assert.match(prompt, /facts from hypotheses/);
  assert.match(prompt, /under two minutes/);
});
