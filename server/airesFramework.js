import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const AIRES_REQUIREMENTS_FRAMEWORK_DIR =
  process.env.AIRES_REQUIREMENTS_FRAMEWORK_DIR ||
  "/Users/michaelmoll/.codex/skills/aires-requirements-framework";

export const AIRES_FRAMEWORK_DOCUMENTS = Object.freeze([
  {
    key: "skill",
    title: "SKILL.md",
    type: "Skill operating contract",
    path: "SKILL.md",
    purpose: "Defines when to use the AIRES Requirements Framework, the required workflow, output modes, content contract, design guardrails, and validation checks.",
    useWhen: "Michael asks what the skill is, what Cooper is allowed to produce, or how requirements work should be governed.",
    coreIdeas: [
      "Problem before solution.",
      "Scope must include inclusion, exclusion, and non-goals.",
      "Default output is scoped requirements; presentable output is self-contained AIRES HTML.",
      "Missing facts must be labeled as assumptions instead of invented."
    ],
    inputs: ["Product context", "Notion tickets", "Meeting notes", "Research", "Discovery notes", "Raw feature ideas"],
    outputs: ["Markdown requirements thinking", "AIRES-branded scoped requirements HTML/PDF artifact"],
    workshopQuestions: [
      "Which source material should Cooper treat as evidence?",
      "Is the target a spoken explanation, a Markdown working draft, or a presentable HTML artifact?",
      "What facts are known versus assumptions?"
    ]
  },
  {
    key: "requirements_framework",
    title: "references/requirements-framework.md",
    type: "Requirements document structure",
    path: "references/requirements-framework.md",
    purpose: "Turns raw product context into scoped, sliceable work that a team can pull without redoing discovery.",
    useWhen: "Michael wants scoped requirements, MoSCoW, vertical INVEST slices, acceptance criteria, or a Definition of Ready.",
    coreIdeas: [
      "Use the nine-section order from problem and goal through Definition of Ready.",
      "Use MoSCoW with real Won't boundaries.",
      "Break work into vertical INVEST slices, not horizontal architecture layers.",
      "Acceptance criteria should be observable Given/When/Then tests."
    ],
    inputs: ["Raw idea", "Ticket", "Discovery note", "Customer request", "Product thesis", "Partially formed feature"],
    outputs: ["Scoped requirements document", "Vertical slice table", "Given/When/Then acceptance criteria", "Definition of Ready checklist"],
    workshopQuestions: [
      "What is the real problem and outcome in the user's own words?",
      "Who accepts done and who verifies quality?",
      "What is in scope, out of scope now, and explicitly a non-goal?",
      "What is the thinnest vertical slice that ships observable value?"
    ]
  },
  {
    key: "pipeline",
    title: "references/pipeline.md",
    type: "Context-to-requirements pipeline",
    path: "references/pipeline.md",
    purpose: "Provides the Capture -> Distill -> Scope -> Slice -> Verify flow for turning unstructured context into scoped requirements.",
    useWhen: "Michael starts with a messy context dump, agent output, transcript, thesis, discovery note, or product narrative.",
    coreIdeas: [
      "Capture evidence before reshaping it.",
      "Distill one core job or problem.",
      "Make facts and assumptions visibly separate.",
      "Stop when the next slice is ready to pull."
    ],
    inputs: ["Unstructured notes", "Agent-generated output", "Transcripts", "Feature narratives", "Discovery dumps"],
    outputs: ["Captured source notes", "Distilled problem", "Scoped boundaries", "Pull-ready slices", "Ready gate"],
    workshopQuestions: [
      "What source path, page, file, or transcript should be cited?",
      "What vivid phrases or constraints must be preserved?",
      "What is the single core job hidden inside the context dump?",
      "Which assumptions would materially change scope?"
    ]
  },
  {
    key: "design_system",
    title: "references/design-system.md",
    type: "AIRES visual and voice rules",
    path: "references/design-system.md",
    purpose: "Defines the AIRES artifact brand: architectural, monochrome, precise, flat, and sparing with Volt accents.",
    useWhen: "Michael wants presentable HTML, PDF-exportable documents, visual artifacts, or an AIRES-branded output review.",
    coreIdeas: [
      "Use Urbanist, Inter, Instrument Serif, and IBM Plex Mono.",
      "Use soft black, warm grey, white, and sparse Volt; never pure black or decorative gradients.",
      "Use sharp radii, hairline borders, restrained shadows, and sentence case.",
      "Use the Converge mark, AIRES header/footer, and PDF export affordance for artifacts."
    ],
    inputs: ["Artifact draft", "HTML prototype", "PDF/report requirements", "Brand-sensitive document"],
    outputs: ["Design critique", "AIRES visual recipe", "HTML styling guidance", "Brand-compliant artifact rules"],
    workshopQuestions: [
      "Is the artifact a document, matrix, blueprint, flow, or product UI?",
      "What is the one thing that deserves Volt emphasis?",
      "Does the draft avoid gradients, pure black, emoji, and unrelated brand colors?",
      "Does the voice sound precise and domain-native?"
    ]
  },
  {
    key: "artifact_catalog",
    title: "references/artifact-catalog.md",
    type: "Artifact form selector",
    path: "references/artifact-catalog.md",
    purpose: "Defines the default scoped requirements artifact, required sections, HTML visual recipe, editable regions, and filename conventions.",
    useWhen: "Michael wants to choose or explain the document form before creating an artifact.",
    coreIdeas: [
      "The default catalog item is a scoped requirements document.",
      "Required sections mirror the nine-section requirements framework.",
      "HTML should start from the AIRES template and inline AIRES tokens.",
      "Editable regions are only for practical tuning, not brand/static chrome."
    ],
    inputs: ["Artifact goal", "Output format preference", "Audience", "Context source"],
    outputs: ["Artifact recommendation", "Required section checklist", "HTML visual recipe", "Stable filename plan"],
    workshopQuestions: [
      "Is the audience internal execution, customer-facing, or leadership review?",
      "Should the output be Markdown working notes or AIRES HTML/PDF?",
      "Which sections are missing from the source context?",
      "What should remain editable for direct tuning?"
    ]
  },
  {
    key: "template",
    title: "assets/aires-template.html",
    type: "AIRES HTML scaffold",
    path: "assets/aires-template.html",
    purpose: "Provides the self-contained document shell with AIRES header, Converge mark, content body, footer, and Export PDF behavior.",
    useWhen: "Michael asks for a presentable, PDF-exportable, AIRES-branded HTML artifact.",
    coreIdeas: [
      "Use a warm grey page with a white document card.",
      "Use a soft-black header with a 3px Volt rule.",
      "Keep document width around 900px unless the artifact needs a wide format.",
      "Wire Export PDF from the artifact shell."
    ],
    inputs: ["Artifact title", "Artifact type", "Date", "Subtitle", "Body sections", "Filename"],
    outputs: ["Standalone HTML document shell", "PDF-exportable artifact structure"],
    workshopQuestions: [
      "What is the artifact title, subtitle, and filename?",
      "Which body sections need to be inserted into the template?",
      "Should this be portrait or a wide matrix/blueprint?",
      "Does the PDF export behavior need to be browser-native or html2pdf-based?"
    ]
  },
  {
    key: "tokens",
    title: "assets/aires-tokens.css",
    type: "AIRES CSS token source",
    path: "assets/aires-tokens.css",
    purpose: "Defines reusable AIRES colors, type stacks, radii, shadows, focus ring, and layout tokens for generated artifacts.",
    useWhen: "Michael asks Cooper to style, audit, or revise an AIRES artifact or prototype.",
    coreIdeas: [
      "Soft black is #2D2C2D, not pure black.",
      "Volt is #F0DE4A and should be used sparingly.",
      "Cards and controls should stay sharp with small radii.",
      "Typography should use the AIRES display, body, serif, and mono stacks."
    ],
    inputs: ["HTML or CSS draft", "Artifact design goal", "Brand compliance issue"],
    outputs: ["Tokenized CSS guidance", "Brand audit", "Inline CSS corrections"],
    workshopQuestions: [
      "Which CSS values are drifting from the AIRES tokens?",
      "Is Volt being overused or used as body text?",
      "Are radii, borders, and shadows still architectural and restrained?",
      "Are font roles mapped correctly?"
    ]
  },
  {
    key: "agent_manifest",
    title: "agents/openai.yaml",
    type: "Skill agent manifest",
    path: "agents/openai.yaml",
    purpose: "Names the skill for OpenAI surfaces and provides its short description and default invocation prompt.",
    useWhen: "Michael asks how the skill should appear, be invoked, or be described to an agent.",
    coreIdeas: [
      "Display name is AIRES Requirements Framework.",
      "Short description is scoped AIRES requirements artifacts.",
      "Default prompt tells the agent to turn product context into an AIRES scoped requirements artifact."
    ],
    inputs: ["Agent surface", "Invocation copy", "Skill description"],
    outputs: ["Display metadata", "Default prompt guidance"],
    workshopQuestions: [
      "How should Cooper introduce the skill in conversation?",
      "What default prompt should be used for this context?",
      "Does the agent-facing description match the actual artifact goal?"
    ]
  }
]);

const AIRES_DOCUMENT_ALIASES = new Map([
  ["all", "all"],
  ["docs", "all"],
  ["documents", "all"],
  ["framework", "requirements_framework"],
  ["requirements", "requirements_framework"],
  ["requirements_framework_md", "requirements_framework"],
  ["requirements_framework", "requirements_framework"],
  ["pipeline", "pipeline"],
  ["context_pipeline", "pipeline"],
  ["design", "design_system"],
  ["design_system", "design_system"],
  ["brand", "design_system"],
  ["catalog", "artifact_catalog"],
  ["artifact_catalog", "artifact_catalog"],
  ["artifacts", "artifact_catalog"],
  ["skill", "skill"],
  ["skill_md", "skill"],
  ["template", "template"],
  ["html_template", "template"],
  ["aires_template", "template"],
  ["tokens", "tokens"],
  ["css_tokens", "tokens"],
  ["aires_tokens", "tokens"],
  ["agent", "agent_manifest"],
  ["agent_manifest", "agent_manifest"],
  ["openai_yaml", "agent_manifest"]
]);

export function normalizeAiresDocumentKey(value = "all") {
  const key = String(value || "all")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return AIRES_DOCUMENT_ALIASES.get(key) || key || "all";
}

export function getAiresFrameworkDocument(documentKey = "requirements_framework") {
  const key = normalizeAiresDocumentKey(documentKey);
  if (key === "all") return null;
  return AIRES_FRAMEWORK_DOCUMENTS.find((document) => document.key === key) || null;
}

export async function explainAiresFrameworkDocuments(options = {}) {
  const documentKey = normalizeAiresDocumentKey(options.documentKey || options.document_key || "all");
  const detailLevel = normalizeDetailLevel(options.detailLevel || options.detail_level || "summary");
  const selected = documentKey === "all"
    ? AIRES_FRAMEWORK_DOCUMENTS
    : AIRES_FRAMEWORK_DOCUMENTS.filter((document) => document.key === documentKey);

  if (!selected.length) {
    return {
      status: "error",
      tool: "run_aires_requirements_framework",
      message: `Unknown AIRES framework document: ${documentKey}.`,
      availableDocuments: AIRES_FRAMEWORK_DOCUMENTS.map(({ key, title }) => ({ key, title })),
      retryable: false
    };
  }

  const documents = await Promise.all(selected.map((document) => documentExplanation(document, detailLevel)));

  return {
    status: "completed",
    tool: "run_aires_requirements_framework",
    riskLevel: "advisory",
    value: {
      name: "AIRES Requirements Framework document library",
      sourceRoot: AIRES_REQUIREMENTS_FRAMEWORK_DIR,
      requestedDocument: documentKey,
      detailLevel,
      documents,
      frameworkMap: [
        "SKILL.md governs when and how Cooper should use the skill.",
        "pipeline.md turns messy source context into requirements-ready material.",
        "requirements-framework.md defines the scoped requirements document and slice discipline.",
        "artifact-catalog.md selects the artifact form and required sections.",
        "design-system.md, aires-template.html, and aires-tokens.css make the output AIRES-branded and PDF-exportable.",
        "agents/openai.yaml describes how the skill appears and is invoked by an agent."
      ],
      workshopModes: [
        "explain_documents: explain one or all framework documents.",
        "workshop_document: use a selected document as a lens over provided context or a draft.",
        "interview: ask focused discovery questions.",
        "queue_artifact: create the AIRES scoped requirements artifact in Cooper's work queue."
      ],
      voice_summary: buildExplainVoiceSummary(documentKey, documents)
    }
  };
}

export function workshopAiresFrameworkDocument(options = {}) {
  const documentKey = normalizeAiresDocumentKey(options.documentKey || options.document_key || "requirements_framework");
  const document = getAiresFrameworkDocument(documentKey) || getAiresFrameworkDocument("requirements_framework");
  const sourceContext = cleanWorkshopText(options.sourceContext || options.source_context);
  const currentDraft = cleanWorkshopText(options.currentDraft || options.current_draft);
  const goal = cleanWorkshopText(options.goal);
  const requestedOutput = cleanWorkshopText(options.requestedOutput || options.requested_output);
  const focus = normalizeWorkshopFocus(options.workshopFocus || options.workshop_focus || "shape");

  return {
    status: "completed",
    tool: "run_aires_requirements_framework",
    riskLevel: "advisory",
    value: {
      selectedDocument: summarizeDocument(document),
      focus,
      goal: goal || "Workshop the provided context into a stronger AIRES requirements artifact.",
      requestedOutput: requestedOutput || defaultRequestedOutput(document.key),
      sourceContextStatus: sourceContext ? "provided" : "missing",
      currentDraftStatus: currentDraft ? "provided" : "not_provided",
      contextPreview: sourceContext ? truncate(sourceContext, 900) : "",
      draftPreview: currentDraft ? truncate(currentDraft, 900) : "",
      workshopAgenda: buildWorkshopAgenda(document.key, focus),
      documentLens: buildDocumentLens(document.key),
      questions: buildWorkshopQuestions(document, focus, Boolean(sourceContext), Boolean(currentDraft)),
      nextMoves: buildWorkshopNextMoves(document.key, Boolean(sourceContext), Boolean(currentDraft)),
      voice_summary: buildWorkshopVoiceSummary(document, sourceContext, currentDraft, focus)
    }
  };
}

function summarizeDocument(document) {
  return {
    key: document.key,
    title: document.title,
    type: document.type,
    sourcePath: join(AIRES_REQUIREMENTS_FRAMEWORK_DIR, document.path),
    purpose: document.purpose,
    useWhen: document.useWhen
  };
}

async function documentExplanation(document, detailLevel) {
  const explanation = {
    ...summarizeDocument(document),
    coreIdeas: document.coreIdeas,
    inputs: document.inputs,
    outputs: document.outputs,
    workshopQuestions: document.workshopQuestions
  };

  if (detailLevel === "detailed" || detailLevel === "source") {
    explanation.sourceExcerpt = await readDocumentExcerpt(document, detailLevel === "source" ? 6000 : 2400);
  }

  return explanation;
}

async function readDocumentExcerpt(document, maxChars) {
  try {
    const text = await readFile(join(AIRES_REQUIREMENTS_FRAMEWORK_DIR, document.path), "utf8");
    return truncate(text, maxChars);
  } catch (error) {
    return `Source unavailable: ${error.message || "could not read document."}`;
  }
}

function buildExplainVoiceSummary(documentKey, documents) {
  if (documentKey !== "all" && documents[0]) {
    return `${documents[0].title} is the ${documents[0].type}. Its job is to ${documents[0].purpose.toLowerCase()}`;
  }

  return "The AIRES Requirements Framework has eight working documents: the skill contract, the requirements structure, the capture-to-scope pipeline, the design system, the artifact catalog, the HTML template, the CSS tokens, and the agent manifest.";
}

function buildWorkshopAgenda(documentKey, focus) {
  const shared = [
    "Confirm the source context and the intended audience.",
    "Separate sourced facts from assumptions.",
    "Use the selected AIRES document as the review lens.",
    "Identify what is missing, overloaded, or too broad.",
    "End with a concrete next output Cooper can draft or queue."
  ];

  const byDocument = {
    skill: ["Choose output mode: spoken guidance, Markdown, or AIRES HTML.", "Check the output against the skill's content contract and validation rules."],
    requirements_framework: ["Fill the nine requirements sections in order.", "Convert broad work into vertical INVEST slices and Given/When/Then tests."],
    pipeline: ["Run Capture, Distill, Scope, Slice, Verify.", "Preserve vivid phrases and cite source material before reshaping it."],
    design_system: ["Audit brand fit: type, color, spacing, radii, borders, and voice.", "Choose one Volt emphasis and remove decorative styling."],
    artifact_catalog: ["Confirm the artifact form and required sections.", "Decide which regions should be editable for tuning."],
    template: ["Map content into the AIRES header, body, footer, and export shell.", "Check portrait versus wide format and PDF behavior."],
    tokens: ["Map CSS values back to AIRES tokens.", "Correct font roles, color drift, radii, borders, shadows, and focus states."],
    agent_manifest: ["Sharpen the display name, short description, and default invocation prompt.", "Make sure invocation copy matches the desired Cooper behavior."]
  };

  return [...shared, ...(byDocument[documentKey] || byDocument.requirements_framework), `Current focus: ${focus}.`];
}

function buildDocumentLens(documentKey) {
  return {
    skill: ["When to use the skill", "Output mode", "Content contract", "Design guardrails", "Validation"],
    requirements_framework: ["Problem and goal", "Stakeholders", "Current to desired state", "Scope lanes", "Data and constraints", "MoSCoW", "INVEST slices", "Acceptance criteria", "Definition of Ready"],
    pipeline: ["Capture", "Distill", "Scope", "Slice", "Verify"],
    design_system: ["Typeface roles", "Color discipline", "Flat layout", "Header/footer", "Converge mark", "Voice", "Do/don't rules"],
    artifact_catalog: ["Purpose", "Orientation", "Required sections", "HTML visual recipe", "Editable regions", "Naming"],
    template: ["Document shell", "AIRES header", "Content insertion point", "Footer", "Export PDF script"],
    tokens: ["Brand colors", "Type stacks", "Radii", "Shadows", "Focus ring", "Layout tokens"],
    agent_manifest: ["Display name", "Short description", "Default prompt"]
  }[documentKey] || [];
}

function buildWorkshopQuestions(document, focus, hasContext, hasDraft) {
  const questions = [...document.workshopQuestions];

  if (!hasContext) {
    questions.unshift("What context should Cooper use as source material?");
  }

  if (!hasDraft && ["critique", "revise", "brand"].includes(focus)) {
    questions.unshift("What existing draft should Cooper critique or revise?");
  }

  if (focus === "scope") {
    questions.push("What is the smallest useful version, and what is explicitly deferred?");
  } else if (focus === "slice") {
    questions.push("Which slice pattern best fits the first pullable ticket?");
  } else if (focus === "acceptance") {
    questions.push("Which user action or system event should become the first Given/When/Then test?");
  } else if (focus === "brand") {
    questions.push("Which element should carry the single Volt emphasis?");
  }

  return [...new Set(questions)].slice(0, 8);
}

function buildWorkshopNextMoves(documentKey, hasContext, hasDraft) {
  const moves = [];
  if (!hasContext) moves.push("Paste or upload source context before Cooper drafts from it.");
  if (!hasDraft && ["design_system", "template", "tokens"].includes(documentKey)) {
    moves.push("Provide the HTML/CSS or artifact draft Cooper should audit.");
  }

  const defaults = {
    requirements_framework: "Queue an AIRES scoped requirements artifact once the problem, scope, and first slice are clear.",
    pipeline: "Run an interview pass if the context is still messy, then queue the scoped requirements artifact.",
    artifact_catalog: "Pick Markdown for working notes or AIRES HTML for a presentable/PDF artifact.",
    design_system: "Apply the AIRES design system to the artifact draft before exporting or sharing.",
    template: "Map the approved body sections into the template shell.",
    tokens: "Patch the CSS values back to AIRES tokens.",
    skill: "Choose whether Cooper should explain, interview, queue, or workshop next.",
    agent_manifest: "Use the manifest copy to describe or invoke the skill consistently."
  };

  moves.push(defaults[documentKey] || defaults.requirements_framework);
  return moves;
}

function buildWorkshopVoiceSummary(document, sourceContext, currentDraft, focus) {
  const contextState = sourceContext ? "I have source context to work from" : "I need source context before drafting confidently";
  const draftState = currentDraft ? "and I can compare it to the current draft" : "and there is no draft attached yet";
  return `${contextState}, ${draftState}. I would use ${document.title} as the lens and focus on ${focus}, then end with the next pullable AIRES output.`;
}

function defaultRequestedOutput(documentKey) {
  return {
    requirements_framework: "Scoped requirements working draft",
    pipeline: "Capture-to-scope workshop brief",
    design_system: "AIRES brand/design critique",
    artifact_catalog: "Artifact form recommendation",
    template: "HTML scaffold plan",
    tokens: "CSS token audit",
    skill: "Skill usage plan",
    agent_manifest: "Agent invocation guidance"
  }[documentKey] || "AIRES requirements workshop brief";
}

function normalizeDetailLevel(value = "summary") {
  const level = String(value || "summary").toLowerCase();
  return ["summary", "detailed", "source"].includes(level) ? level : "summary";
}

function normalizeWorkshopFocus(value = "shape") {
  const focus = String(value || "shape").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return ["shape", "critique", "revise", "scope", "slice", "acceptance", "brand", "artifact"].includes(focus)
    ? focus
    : "shape";
}

function cleanWorkshopText(value) {
  return String(value || "").trim();
}

function truncate(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 24)).trimEnd()}\n...[truncated]`;
}
