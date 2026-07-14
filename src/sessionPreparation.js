export const SESSION_PREPARATION_OPTIONS = Object.freeze([
  {
    kind: "executive_report",
    title: "Shared context brief",
    description: "Facts, hypotheses, source citations, and missing context.",
    instruction: "Create a concise executive context brief that attendees can read in three minutes."
  },
  {
    kind: "mermaid_diagram",
    title: "Decision map",
    description: "The choices, dependencies, and gates the room needs to resolve.",
    instruction: "Create a decision map that shows the choices, dependencies, and unresolved gates."
  },
  {
    kind: "aires_requirements",
    title: "Requirements first pass",
    description: "A scoped draft using the AIRES Requirements Framework.",
    instruction: "Create a first-pass scoped requirements artifact using the AIRES Requirements Framework."
  },
  {
    kind: "qa_checklist",
    title: "QA checklist",
    description: "Acceptance evidence, regression coverage, and verification checkpoints.",
    instruction: "Create a practical QA and verification checklist with observable evidence for each check."
  }
]);

const OPTION_BY_KIND = new Map(SESSION_PREPARATION_OPTIONS.map((option) => [option.kind, option]));

export function normalizePreparationKinds(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    if (!OPTION_BY_KIND.has(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function buildSessionPreparationPrompt(kind, { focus = null, sessionContext = "" } = {}) {
  const option = OPTION_BY_KIND.get(kind);
  if (!option) return "";
  const title = clean(focus?.title) || "Prepared Cooper session";
  return [
    `Prepare this artifact before the live Cooper session: ${option.title}.`,
    `Session: ${title}`,
    clean(focus?.description || focus?.prompt) ? `Session goal: ${clean(focus?.description || focus?.prompt)}` : "",
    option.instruction,
    "Use only the bounded context packet below as evidence. Separate established facts from hypotheses. Do not invent product behavior, commitments, owners, or technical details that are not present. Make missing context and decisions explicit.",
    "",
    clean(sessionContext) || "No resolved source content was available. Produce only a gap-aware outline."
  ].filter(Boolean).join("\n\n");
}

export function createPreparedSessionOverview({
  packet = null,
  sessionContext = "",
  focus = null,
  jobs = [],
  artifacts = []
} = {}) {
  const sources = Array.isArray(packet?.sources) ? packet.sources : [];
  const resolvedCount = sources.filter((source) => source.resolutionStatus !== "failed").length;
  const evidenceSections = parseSourceSections(sessionContext);
  const evidence = sources.slice(0, 5).map((source, index) => ({
    id: source.id || `source-${index + 1}`,
    title: evidenceClaim(source, index),
    summary: evidenceSections.get(clean(source.title).toLowerCase()) || clean(source.meta) || "This source is loaded in the bounded session packet.",
    citation: `${providerLabel(source.provider)} - ${source.title || source.type || "source"}`
  }));
  const preparationJobs = (Array.isArray(jobs) ? jobs : []).filter((job) => job.workstream === "session_preparation");
  const preparedArtifacts = SESSION_PREPARATION_OPTIONS.map((option) => {
    const job = [...preparationJobs].reverse().find((item) => item.kind === option.kind) || null;
    const artifact = (Array.isArray(artifacts) ? artifacts : []).find((item) => (
      item.workstream === "session_preparation" && (item.jobId === job?.id || item.kind === option.kind)
    )) || null;
    return {
      ...option,
      jobId: job?.id || "",
      artifactId: artifact?.id || job?.artifactId || "",
      status: artifact ? "ready" : job?.status || "not_started",
      progress: job?.progress || (artifact ? "Artifact ready." : "Available to prepare."),
      outputType: artifact?.outputType || (option.kind === "executive_report" || option.kind === "aires_requirements" ? "html" : "markdown")
    };
  });

  const title = clean(focus?.title || packet?.meeting?.title || sources[0]?.title) || "Prepared Cooper session";
  const goal = clean(packet?.intent || focus?.description || focus?.prompt)
    || "Align on the selected evidence, resolve the open decisions, and leave with clear next work.";

  return {
    title,
    goal,
    sourceCount: sources.length,
    resolvedCount,
    coverage: sources.length ? Math.round((resolvedCount / sources.length) * 100) : 0,
    evidence: evidence.length ? evidence : [{
      id: "session-focus",
      title: "The session focus is loaded.",
      summary: clean(focus?.description || focus?.prompt) || "Add context sources to give Cooper a stronger evidence boundary.",
      citation: "Session focus"
    }],
    questions: sessionQuestions(sources, goal),
    sources,
    preparedArtifacts,
    activity: preparationActivity(preparationJobs)
  };
}

export function createSessionPresentation({
  packet = null,
  sessionContext = "",
  focus = null,
  jobs = [],
  artifacts = []
} = {}) {
  const overview = createPreparedSessionOverview({ packet, sessionContext, focus, jobs, artifacts });
  const readyArtifacts = overview.preparedArtifacts.filter((artifact) => ["ready", "completed"].includes(artifact.status));
  const activeArtifacts = overview.preparedArtifacts.filter((artifact) => ["queued", "running"].includes(artifact.status));

  return {
    id: `session-presentation-${clean(packet?.id || focus?.id || overview.title)}`,
    title: overview.title,
    summary: overview.goal,
    slides: [
      {
        id: "session-brief",
        eyebrow: "Session brief",
        title: overview.title,
        narrative: overview.goal,
        metrics: [
          { value: overview.sourceCount, label: "connected sources" },
          { value: `${overview.coverage}%`, label: "resolved context" },
          { value: readyArtifacts.length, label: "documents ready" }
        ],
        items: [{
          lead: "Purpose",
          title: "Begin from the same evidence",
          detail: overview.sourceCount
            ? "Cooper has a bounded context packet and will separate established facts from assumptions."
            : "No external source is loaded yet. Use the opening discussion to establish the problem and evidence boundary.",
          status: overview.sourceCount ? "Context loaded" : "Needs context"
        }]
      },
      {
        id: "shared-understanding",
        eyebrow: "What Cooper understands",
        title: "The shared starting point",
        narrative: "These are the strongest evidence-backed signals Cooper can bring into the conversation right now.",
        items: overview.evidence.slice(0, 5).map((evidence, index) => ({
          lead: String(index + 1).padStart(2, "0"),
          title: evidence.title,
          detail: evidence.summary,
          status: evidence.citation
        }))
      },
      {
        id: "questions",
        eyebrow: "Questions for the room",
        title: "What still needs a decision",
        narrative: "Cooper will use these questions to challenge assumptions and keep the session moving toward a useful outcome.",
        items: overview.questions.slice(0, 4).map((question, index) => ({
          lead: String(index + 1).padStart(2, "0"),
          title: question,
          detail: index === 0 ? "Clarify this first; it shapes the rest of the discussion." : "Resolve or explicitly defer this before closing the session.",
          status: "Open"
        }))
      },
      {
        id: "recommended-path",
        eyebrow: "Recommended session flow",
        title: "A practical way through the work",
        narrative: "This sequence is a suggestion, not an automatic commitment. Ask Cooper to change it as the conversation develops.",
        items: sessionRecommendations({ overview, readyArtifacts, activeArtifacts })
      }
    ]
  };
}

export function buildSessionPresentationVoicePrompt({ packet = null, sessionContext = "", focus = null } = {}) {
  const presentation = createSessionPresentation({ packet, sessionContext, focus });
  return [
    `Present the opening session brief for: ${presentation.title}.`,
    "Use only the context already loaded into this Realtime session.",
    "In under two minutes, walk through the purpose, what you understand from the evidence, the most important open questions, and your recommended path through the session.",
    "Clearly distinguish facts from hypotheses. Do not invent owners, deadlines, product behavior, or technical details.",
    "Finish by asking Michael which question or artifact the room should tackle first."
  ].join(" ");
}

function parseSourceSections(value) {
  const sections = new Map();
  const sourcePattern = /## Source:\s*(.+)\n([\s\S]*?)(?=\n## Source:|$)/g;
  for (const match of String(value || "").replace(/\r\n/g, "\n").matchAll(sourcePattern)) {
    const title = clean(match[1]).toLowerCase();
    const body = match[2]
      .split("\n")
      .map((line) => clean(line))
      .filter((line) => line && !/^(Provider|Type|Repository|URL|Updated|Resolution):/i.test(line))
      .join(" ");
    if (title && body) sections.set(title, truncate(body, 240));
  }
  return sections;
}

function evidenceClaim(source, index) {
  const title = clean(source?.title) || `Selected source ${index + 1}`;
  if (source?.type === "pull_request") return `${title} defines the current code change.`;
  if (source?.type === "database") return `${title} establishes the workspace boundary.`;
  if (source?.provider === "meeting") return `${title} captures the prior discussion.`;
  return `${title} is part of the shared evidence.`;
}

function sessionQuestions(sources, goal) {
  const questions = [
    "Which facts in the loaded context are established, and which are still assumptions?",
    "What decision must this room make before implementation can move forward?",
    "What observable outcome will prove the chosen direction works?"
  ];
  if (sources.some((source) => source.provider === "github")) {
    questions[1] = "Does the current code change match the intended product and permission behavior?";
  }
  if (sources.some((source) => source.type === "database")) {
    questions[0] = "Which database records define the current scope, and which should be excluded?";
  }
  if (!sources.length && goal) questions[0] = "What source evidence should Cooper load before the room commits to this direction?";
  return questions;
}

function preparationActivity(jobs) {
  const logs = jobs.flatMap((job) => (job.logs || []).map((log) => ({
    id: log.id || `${job.id}-${log.at}-${log.type}`,
    at: log.at || job.updatedAt || job.createdAt || "",
    message: log.message || job.progress || job.title,
    status: job.status
  })));
  if (logs.length) return logs.sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0));
  return [{ id: "context-ready", at: "", message: "The bounded context packet is ready for Cooper.", status: "completed" }];
}

function sessionRecommendations({ overview, readyArtifacts, activeArtifacts }) {
  const recommendations = [
    {
      lead: "01",
      title: "Confirm the shared understanding",
      detail: "Correct missing or stale facts before debating solutions.",
      status: "Align"
    },
    {
      lead: "02",
      title: overview.questions[0] || "Name the decision this session must make",
      detail: "Resolve the highest-leverage uncertainty before expanding scope.",
      status: "Decide"
    }
  ];

  if (readyArtifacts.length) {
    recommendations.push({
      lead: "03",
      title: `Review ${readyArtifacts[0].title}`,
      detail: "Use the prepared artifact as a working draft and revise it in the room.",
      status: "Ready"
    });
  } else if (activeArtifacts.length) {
    recommendations.push({
      lead: "03",
      title: `${activeArtifacts[0].title} is being prepared`,
      detail: "Keep talking while Cooper finishes the draft, then review it on the canvas.",
      status: "Building"
    });
  } else {
    recommendations.push({
      lead: "03",
      title: "Choose the first useful artifact",
      detail: "Build a diagram, requirements draft, prototype, or decision brief from the conversation.",
      status: "Create"
    });
  }

  recommendations.push({
    lead: "04",
    title: "Close with an owner and verification step",
    detail: "Capture the decision, next action, and the evidence that will prove the work is done.",
    status: "Commit"
  });
  return recommendations;
}

function providerLabel(value) {
  const provider = clean(value).toLowerCase();
  if (provider === "github") return "GitHub";
  if (provider === "notion") return "Notion";
  if (provider === "meeting") return "Meeting notes";
  if (provider === "file") return "Uploaded file";
  return provider || "Context";
}

function truncate(value, maxLength) {
  const text = clean(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
