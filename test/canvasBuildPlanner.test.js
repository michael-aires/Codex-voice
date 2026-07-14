import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanvasBuildRequest,
  buildConversationOpportunities,
  canvasBuildTypes,
  createTranscriptSections
} from "../src/canvasBuildPlanner.js";
import { getAiresExampleList } from "../server/airesExamples.js";

const transcript = [
  { speaker: "Michael", text: "We need a workflow for first-touch logging and manager visibility.", at: "2026-07-07T20:00:00.000Z" },
  { speaker: "Cooper", text: "The risk is adoption if logging stays manual.", at: "2026-07-07T20:00:15.000Z" },
  { speaker: "Sarah", text: "Can we scope the requirements and acceptance criteria for sprint 14?", at: "2026-07-07T20:01:00.000Z" },
  { speaker: "Michael", text: "Also sketch a mobile screen for the rep dashboard.", at: "2026-07-07T20:02:00.000Z" }
];

test("creates selectable transcript sections newest first", () => {
  const sections = createTranscriptSections(transcript, { entriesPerSection: 2 });

  assert.equal(sections.length, 2);
  assert.match(sections[0].text, /Sarah:/);
  assert.match(sections[0].text, /mobile screen/);
  assert.equal(sections[0].count, 2);
});

test("suggests build opportunities from conversation language", () => {
  const opportunities = buildConversationOpportunities({
    transcripts: transcript,
    examples: [{ id: "aires-scoped", title: "Scoped requirements", category: "Requirements" }]
  });

  assert.ok(opportunities.some((item) => item.kind === "mermaid_diagram"));
  assert.ok(opportunities.some((item) => item.kind === "ui_wireframe"));
  assert.ok(opportunities.some((item) => item.kind === "aires_requirements"));
});

test("build request can include selected transcript section and template", () => {
  const sections = createTranscriptSections(transcript, { entriesPerSection: 2 });
  const request = buildCanvasBuildRequest({
    kind: "aires_requirements",
    typedPrompt: "Make this implementation-ready.",
    contextMode: "selected_section",
    selectedSectionId: sections[0].id,
    transcriptSections: sections,
    transcripts: transcript,
    selectedTemplate: {
      title: "Scoped requirements",
      category: "Requirements",
      description: "Slices and acceptance criteria."
    }
  });

  assert.match(request, /Build type: Requirements/);
  assert.match(request, /Michael's instruction/);
  assert.match(request, /Selected AIRES template: Scoped requirements/);
  assert.match(request, /Selected conversation section/);
  assert.match(request, /mobile screen/);
});

test("canvas build catalog covers every shared live build mode", () => {
  assert.deepEqual(canvasBuildTypes.map((type) => type.id), [
    "mermaid_diagram",
    "ui_wireframe",
    "html_prototype",
    "aires_requirements",
    "pdf_brief",
    "word_brief",
    "powerpoint_deck",
    "excel_action_register"
  ]);
});

test("build request supports every live build mode with typed context", () => {
  for (const type of canvasBuildTypes) {
    const request = buildCanvasBuildRequest({
      kind: type.id,
      typedPrompt: `Create a ${type.shortLabel} from this typed context.`,
      contextMode: "typed_only",
      transcripts: transcript
    });

    assert.match(request, new RegExp(`Build type: ${escapeRegExp(type.label)}\\.`));
    assert.match(request, /Michael's instruction/);
    assert.doesNotMatch(request, /Recent conversation context/);
    assert.doesNotMatch(request, /Full meeting transcript/);
  }
});

test("build request supports each context mode used by the call canvas", () => {
  const sections = createTranscriptSections(transcript, { entriesPerSection: 2 });
  const sessionFocus = {
    title: "Rep velocity sprint review",
    description: "Close sprint scope for first-touch logging.",
    points: ["Confirm slices", "Define acceptance criteria"],
    docs: ["Rep velocity thesis"]
  };

  const smartRequest = buildCanvasBuildRequest({
    kind: "mermaid_diagram",
    contextMode: "smart",
    transcriptSections: sections,
    transcripts: transcript,
    sessionFocus
  });
  assert.match(smartRequest, /Recent conversation context/);
  assert.match(smartRequest, /Selected meeting\/task: Rep velocity sprint review/);

  const recentRequest = buildCanvasBuildRequest({
    kind: "ui_wireframe",
    contextMode: "recent_transcript",
    transcriptSections: sections,
    transcripts: transcript,
    sessionFocus
  });
  assert.match(recentRequest, /Recent conversation context/);

  const fullRequest = buildCanvasBuildRequest({
    kind: "html_prototype",
    contextMode: "full_transcript",
    transcriptSections: sections,
    transcripts: transcript,
    sessionFocus
  });
  assert.match(fullRequest, /Full meeting transcript/);
  assert.match(fullRequest, /first-touch logging/);

  const focusRequest = buildCanvasBuildRequest({
    kind: "aires_requirements",
    contextMode: "meeting_focus",
    transcriptSections: sections,
    transcripts: transcript,
    sessionFocus
  });
  assert.match(focusRequest, /Selected meeting\/task: Rep velocity sprint review/);
  assert.match(focusRequest, /Known goals/);

  const selectedRequest = buildCanvasBuildRequest({
    kind: "aires_requirements",
    contextMode: "selected_section",
    selectedSectionId: sections[1].id,
    transcriptSections: sections,
    transcripts: transcript,
    sessionFocus
  });
  assert.match(selectedRequest, /Selected conversation section/);
  assert.match(selectedRequest, /first-touch logging/);
});

test("requirements build request can use every AIRES template from the template library", () => {
  const examples = getAiresExampleList();

  assert.equal(examples.length, 9);
  for (const example of examples) {
    const request = buildCanvasBuildRequest({
      kind: "aires_requirements",
      typedPrompt: "Generate this from the active conversation.",
      contextMode: "meeting_focus",
      sessionFocus: {
        title: "Rep velocity work session",
        description: "Discussing sprint tickets and feature epics."
      },
      selectedTemplate: example
    });

    assert.match(request, /Build type: Requirements/);
    assert.match(request, new RegExp(`Selected AIRES template: ${escapeRegExp(example.title)}\\.`));
    assert.match(request, new RegExp(`Category: ${escapeRegExp(example.category)}\\.`));
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
