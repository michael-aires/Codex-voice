export const canvasBuildTypes = [
  {
    id: "mermaid_diagram",
    label: "Diagram",
    shortLabel: "Diagram",
    description: "Workflow maps, architecture diagrams, service maps, and decision flows."
  },
  {
    id: "ui_wireframe",
    label: "Wireframe",
    shortLabel: "Wireframe",
    description: "Low-fidelity screens, layout flows, and mobile-first interaction sketches."
  },
  {
    id: "html_prototype",
    label: "Prototype",
    shortLabel: "Prototype",
    description: "Interactive HTML/CSS prototypes that can render directly on the canvas."
  },
  {
    id: "aires_requirements",
    label: "Requirements",
    shortLabel: "Requirements",
    description: "AIRES scoped requirements, product thesis, JTBD, blueprints, and related product docs."
  }
];

export function buildTypeLabel(kind) {
  return canvasBuildTypes.find((type) => type.id === kind)?.label || "Artifact";
}

export function transcriptToText(transcripts = []) {
  return transcripts
    .map((entry) => {
      const speaker = cleanText(entry.speaker) || "Speaker";
      const text = cleanText(entry.text);
      return text ? `${speaker}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function createTranscriptSections(transcripts = [], { entriesPerSection = 4, maxSections = 6 } = {}) {
  const cleanEntries = transcripts
    .map((entry) => ({
      ...entry,
      speaker: cleanText(entry.speaker) || "Speaker",
      text: cleanText(entry.text)
    }))
    .filter((entry) => entry.text);

  const sections = [];
  for (let index = cleanEntries.length; index > 0; index -= entriesPerSection) {
    const start = Math.max(0, index - entriesPerSection);
    const entries = cleanEntries.slice(start, index);
    const first = entries[0];
    const last = entries[entries.length - 1];
    const sectionText = transcriptToText(entries);
    const title = summarizeSectionTitle(entries);
    sections.push({
      id: `section-${start}-${index}`,
      title,
      subtitle: [formatEntryTime(first), formatEntryTime(last)].filter(Boolean).join(" - "),
      text: sectionText,
      excerpt: truncate(sectionText.replace(/\s+/g, " "), 220),
      count: entries.length
    });
    if (sections.length >= maxSections) break;
  }
  return sections;
}

export function buildConversationOpportunities({ transcripts = [], sessionFocus = null, examples = [], max = 5 } = {}) {
  const sections = createTranscriptSections(transcripts);
  const recentText = sections[0]?.text || "";
  const fullText = [transcriptToText(transcripts), sessionFocus?.title, sessionFocus?.description]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const scopedTemplate = findTemplate(examples, ["scoped", "requirements"]) || examples[0] || null;
  const jtbdTemplate = findTemplate(examples, ["jobs", "jtbd"]) || null;
  const serviceTemplate = findTemplate(examples, ["service", "blueprint"]) || null;
  const suggestions = [];

  const add = (suggestion) => {
    if (suggestions.some((item) => item.kind === suggestion.kind && item.title === suggestion.title)) return;
    suggestions.push({
      id: `${suggestion.kind}-${suggestions.length + 1}`,
      sectionId: sections[0]?.id || "",
      contextMode: sections[0] ? "recent_transcript" : "meeting_focus",
      confidence: sections[0] ? "live context" : "meeting context",
      ...suggestion
    });
  };

  if (matchesAny(fullText, ["flow", "workflow", "journey", "process", "handoff", "integration", "sync", "architecture", "system"])) {
    add({
      kind: "mermaid_diagram",
      title: "Map the workflow we are discussing",
      description: "Turn the current conversation into a clean Mermaid workflow, architecture, or service map.",
      prompt: "Create a Mermaid diagram from the selected conversation context. Focus on workflow, dependencies, handoffs, states, and open decision points."
    });
  }

  if (matchesAny(fullText, ["screen", "ui", "interface", "mobile", "page", "form", "dashboard", "wireframe", "user experience", "ux"])) {
    add({
      kind: "ui_wireframe",
      title: "Sketch the screen flow",
      description: "Create a mobile-first wireframe from the product discussion and key workflow steps.",
      prompt: "Create a mobile-first UI wireframe from the selected conversation context. Include primary screens, controls, states, and the core user path."
    });
  }

  if (matchesAny(fullText, ["prototype", "html", "interactive", "click", "demo", "landing page", "app"])) {
    add({
      kind: "html_prototype",
      title: "Build an interactive HTML prototype",
      description: "Produce a single-file prototype that can be rendered and iterated on inside the canvas.",
      prompt: "Build an interactive, mobile-first HTML prototype from the selected conversation context. Use inline CSS and small inline JavaScript only when useful."
    });
  }

  if (matchesAny(fullText, ["requirement", "scope", "acceptance", "ticket", "sprint", "epic", "prd", "definition of ready"])) {
    add({
      kind: "aires_requirements",
      title: "Draft scoped requirements",
      description: "Convert the discussion into AIRES scoped requirements with slices and acceptance criteria.",
      templateId: scopedTemplate?.id || "",
      prompt: "Draft implementation-ready AIRES scoped requirements from the selected conversation context. Preserve source phrases, assumptions, slices, acceptance criteria, and readiness criteria."
    });
  }

  if (matchesAny(fullText, ["job to be done", "jtbd", "persona", "pain", "desired progress"])) {
    add({
      kind: "aires_requirements",
      title: "Build a JTBD canvas",
      description: "Extract jobs, forces, pains, desired progress, and product implications.",
      templateId: jtbdTemplate?.id || scopedTemplate?.id || "",
      prompt: "Create a Jobs to be Done canvas from the selected conversation context. Extract the job, forces, pains, desired progress, anxieties, habits, and product implications."
    });
  }

  if (matchesAny(fullText, ["service blueprint", "frontstage", "backstage", "operations", "failure point"])) {
    add({
      kind: "aires_requirements",
      title: "Create a service blueprint",
      description: "Map frontstage actions, backstage operations, systems, data, and failure points.",
      templateId: serviceTemplate?.id || scopedTemplate?.id || "",
      prompt: "Create a service blueprint from the selected conversation context. Separate frontstage user actions, backstage operations, systems, data, handoffs, and failure points."
    });
  }

  if (!suggestions.length) {
    add({
      kind: "aires_requirements",
      title: "Create a working requirements draft",
      description: "Use the current meeting or task context as the seed for a scoped product artifact.",
      templateId: scopedTemplate?.id || "",
      prompt: "Create a practical requirements draft from the available context. Ask Cooper to mark assumptions and call out missing information."
    });
    add({
      kind: "mermaid_diagram",
      title: "Draw the current idea",
      description: "Start with a simple diagram so the room has something visual to react to.",
      prompt: "Create a simple Mermaid diagram from the available context. If context is thin, map the likely workflow and mark assumptions clearly."
    });
    add({
      kind: "ui_wireframe",
      title: "Sketch a first-pass wireframe",
      description: "Create a first-pass UI structure from the meeting or task context.",
      prompt: "Create a first-pass mobile wireframe from the available context. Mark assumptions and likely missing product details."
    });
  }

  return suggestions.slice(0, max).map((suggestion, index) => ({
    ...suggestion,
    id: suggestion.id || `${suggestion.kind}-${index + 1}`,
    sourcePreview: recentText ? truncate(recentText.replace(/\s+/g, " "), 180) : cleanText(sessionFocus?.description)
  }));
}

export function buildCanvasBuildRequest({
  kind,
  typedPrompt = "",
  contextMode = "smart",
  transcriptSections = [],
  selectedSectionId = "",
  transcripts = [],
  sessionFocus = null,
  selectedTemplate = null
} = {}) {
  const parts = [`Build type: ${buildTypeLabel(kind)}.`];
  const cleanPrompt = cleanText(typedPrompt);
  if (cleanPrompt) parts.push(`Michael's instruction:\n${cleanPrompt}`);

  if (selectedTemplate) {
    parts.push([
      `Selected AIRES template: ${selectedTemplate.title || selectedTemplate.name || "Template"}.`,
      selectedTemplate.category ? `Category: ${selectedTemplate.category}.` : "",
      selectedTemplate.description ? `Template description: ${selectedTemplate.description}` : ""
    ].filter(Boolean).join("\n"));
  }

  const selectedSection = transcriptSections.find((section) => section.id === selectedSectionId) || transcriptSections[0] || null;
  const contextText = buildContextText({
    contextMode,
    selectedSection,
    transcriptSections,
    transcripts,
    sessionFocus
  });
  if (contextText) parts.push(contextText);

  if (parts.length === 1) {
    parts.push("Use the current live conversation and selected project context. If information is missing, mark assumptions clearly.");
  }

  return parts.join("\n\n");
}

function buildContextText({ contextMode, selectedSection, transcriptSections, transcripts, sessionFocus }) {
  if (contextMode === "typed_only") return "";
  if (contextMode === "selected_section" && selectedSection) {
    return `Selected conversation section:\n${selectedSection.text}`;
  }
  if (contextMode === "full_transcript") {
    const full = transcriptToText(transcripts);
    return full ? `Full meeting transcript:\n${full}` : "";
  }
  if (contextMode === "meeting_focus") {
    return meetingFocusText(sessionFocus);
  }
  const recent = selectedSection || transcriptSections[0];
  return [
    recent ? `Recent conversation context:\n${recent.text}` : "",
    meetingFocusText(sessionFocus)
  ].filter(Boolean).join("\n\n");
}

function meetingFocusText(sessionFocus) {
  if (!sessionFocus) return "";
  const points = Array.isArray(sessionFocus.points) ? sessionFocus.points.map((point) => `- ${point}`).join("\n") : "";
  const docs = Array.isArray(sessionFocus.docs) ? sessionFocus.docs.join(", ") : "";
  return [
    `Selected meeting/task: ${sessionFocus.title || "Untitled"}`,
    sessionFocus.description ? `Description: ${sessionFocus.description}` : "",
    points ? `Known goals:\n${points}` : "",
    docs ? `Loaded docs/templates: ${docs}` : ""
  ].filter(Boolean).join("\n");
}

function findTemplate(examples, terms) {
  return examples.find((example) => {
    const text = `${example.id || ""} ${example.title || ""} ${example.category || ""} ${example.description || ""}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  }) || null;
}

function summarizeSectionTitle(entries) {
  const text = cleanText(entries.find((entry) => entry.speaker !== "Cooper")?.text || entries[0]?.text || "");
  if (!text) return "Conversation moment";
  return truncate(text.replace(/[.!?].*$/, ""), 54);
}

function formatEntryTime(entry) {
  if (!entry?.at) return "";
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function matchesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function truncate(value, limit) {
  const text = cleanText(value);
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
}

function cleanText(value) {
  return String(value || "").trim();
}
