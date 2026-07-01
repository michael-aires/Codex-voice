import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AIRES_EXAMPLES_DIR =
  process.env.AIRES_EXAMPLES_DIR ||
  join(__dirname, "aires-examples");

export const AIRES_EXAMPLE_DOCUMENTS = Object.freeze([
  {
    id: "client_capability_matrix",
    title: "Client capability matrix",
    filename: "aires-client-capability-matrix.html",
    category: "Strategy",
    flow: "Compare client capabilities, gaps, and enablement paths.",
    description: "A matrix for turning messy customer or team capability context into a clear operating view.",
    recipeKind: "aires_requirements",
    promptHint: "Generate a client capability matrix for the current discussion using rows for capabilities and columns for current state, target state, evidence, gaps, owner, and next slice."
  },
  {
    id: "context_to_product_content",
    title: "Context to product content",
    filename: "aires-context-to-product-content.html",
    category: "Product narrative",
    flow: "Convert context dumps into product content, requirements language, and execution-ready framing.",
    description: "A structured path from raw notes and agent output into product language Michael can reuse.",
    recipeKind: "aires_requirements",
    promptHint: "Generate a context-to-product-content artifact from the active project and live transcript. Preserve vivid phrases and separate evidence from assumptions."
  },
  {
    id: "daily_rep_flow",
    title: "Daily rep flow",
    filename: "aires-daily-rep-flow.html",
    category: "Workflow",
    flow: "Map the day-in-the-life workflow for a sales or operations rep.",
    description: "A concrete daily workflow view for identifying operational friction, handoffs, and automation opportunities.",
    recipeKind: "html_prototype",
    promptHint: "Generate a mobile-first daily rep flow artifact for the current discussion, including steps, decision points, handoffs, and moments where Cooper or AIRES should assist."
  },
  {
    id: "data_flywheel",
    title: "Data flywheel",
    filename: "aires-data-flywheel.html",
    category: "System model",
    flow: "Show how captured work creates compounding product, CRM, and automation intelligence.",
    description: "A flywheel diagram for explaining how data, workflow, and product learning reinforce each other.",
    recipeKind: "mermaid_diagram",
    promptHint: "Generate a data flywheel for the current discussion. Show the loop from source context to structured CRM data, workflow automation, user feedback, product intelligence, and better execution."
  },
  {
    id: "jtbd_canvas",
    title: "Jobs to be done canvas",
    filename: "aires-jtbd-canvas-sales-rep.html",
    category: "Discovery",
    flow: "Clarify the user job, forces, pains, desired progress, and product implications.",
    description: "A JTBD canvas for turning user or customer discussion into sharper product requirements.",
    recipeKind: "aires_requirements",
    promptHint: "Generate a Jobs to be Done canvas for the current discussion. Include job statement, situation, desired progress, anxieties, current workaround, forces, success criteria, and first vertical slice."
  },
  {
    id: "personas_manager_rep",
    title: "Personas: manager and rep",
    filename: "aires-personas-manager-rep.html",
    category: "Personas",
    flow: "Separate manager and rep jobs, incentives, pain, metrics, and product needs.",
    description: "A persona comparison for product decisions that affect both managers and frontline users.",
    recipeKind: "aires_requirements",
    promptHint: "Generate manager and rep personas for the current discussion. Compare goals, pains, decisions, data needs, workflows, risks, and acceptance criteria."
  },
  {
    id: "scoped_requirements_rep_velocity",
    title: "Scoped requirements: rep velocity",
    filename: "aires-scoped-requirements-rep-velocity.html",
    category: "Requirements",
    flow: "Turn a product opportunity into scoped AIRES requirements with slices and acceptance criteria.",
    description: "The canonical AIRES scoped requirements example for converting context into pull-ready work.",
    recipeKind: "aires_requirements",
    promptHint: "Generate AIRES scoped requirements for the current discussion. Include problem, goal, scope boundaries, MoSCoW, vertical INVEST slices, Given/When/Then acceptance criteria, and Definition of Ready."
  },
  {
    id: "service_blueprint",
    title: "Service blueprint",
    filename: "aires-service-blueprint.html",
    category: "Blueprint",
    flow: "Map frontstage user actions, backstage operations, systems, data, and failure points.",
    description: "A service blueprint for seeing the whole operating system behind a user workflow.",
    recipeKind: "html_prototype",
    promptHint: "Generate a service blueprint for the current discussion. Include frontstage actions, backstage operations, systems, data objects, owner handoffs, failure modes, and automation opportunities."
  },
  {
    id: "thesis_rep_velocity",
    title: "Product thesis: rep velocity",
    filename: "aires-thesis-rep-velocity.html",
    category: "Thesis",
    flow: "Frame the product argument, wedge, target behavior change, proof points, and roadmap implications.",
    description: "A thesis artifact for sharpening why a product direction matters and what proof would validate it.",
    recipeKind: "aires_requirements",
    promptHint: "Generate a product thesis for the current discussion. State the wedge, core belief, target user, behavior change, proof points, risks, and next validation slice."
  }
]);

const EXAMPLE_ALIASES = Object.freeze({
  capability_matrix: "client_capability_matrix",
  client_matrix: "client_capability_matrix",
  product_content: "context_to_product_content",
  context_product: "context_to_product_content",
  daily_flow: "daily_rep_flow",
  rep_flow: "daily_rep_flow",
  flywheel: "data_flywheel",
  data_loop: "data_flywheel",
  jtbd: "jtbd_canvas",
  jobs_to_be_done: "jtbd_canvas",
  jobs: "jtbd_canvas",
  personas: "personas_manager_rep",
  manager_rep: "personas_manager_rep",
  requirements: "scoped_requirements_rep_velocity",
  scoped_requirements: "scoped_requirements_rep_velocity",
  rep_velocity: "scoped_requirements_rep_velocity",
  blueprint: "service_blueprint",
  service_map: "service_blueprint",
  thesis: "thesis_rep_velocity",
  product_thesis: "thesis_rep_velocity"
});

export function normalizeAiresExampleId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^aires[-_\s]+/, "")
    .replace(/\.html?$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return EXAMPLE_ALIASES[normalized] || normalized;
}

export function getAiresExampleList() {
  return AIRES_EXAMPLE_DOCUMENTS.map(({ filename: _filename, ...example }) => example);
}

export function findAiresExample(idOrAlias) {
  const id = normalizeAiresExampleId(idOrAlias);
  return AIRES_EXAMPLE_DOCUMENTS.find((example) => example.id === id) || null;
}

export async function getAiresExampleDocument(idOrAlias) {
  const example = findAiresExample(idOrAlias);
  if (!example) return null;

  const html = await readFile(join(AIRES_EXAMPLES_DIR, example.filename), "utf8");
  return {
    ...example,
    html
  };
}

export function buildAiresExamplePrompt(example, extraContext = "") {
  const context = String(extraContext || "").trim();
  return [
    example?.promptHint || `Generate ${example?.title || "the selected AIRES flow"} for the current discussion.`,
    `Use the AIRES example "${example?.title || "selected flow"}" as the structural model.`,
    "Use the active call transcript and loaded project context as source material.",
    example?.flow ? `Flow: ${example.flow}` : "",
    example?.description ? `Reference intent: ${example.description}` : "",
    context ? `Michael's additional instruction:\n${context}` : ""
  ].filter(Boolean).join("\n\n");
}
