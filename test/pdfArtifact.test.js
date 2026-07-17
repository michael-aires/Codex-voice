import assert from "node:assert/strict";
import test from "node:test";
import { PDFParse } from "pdf-parse";
import { markdownPdfBlocks, renderArtifactPdf } from "../server/pdfArtifact.js";

test("PDF block parser preserves document hierarchy and bounded checklist state", () => {
  const blocks = markdownPdfBlocks(`# Delivery brief

## Decision
Ship the shared artifact path.

- [x] Binary delivery
- [ ] Physical-device verification

> External credentials remain a release gate.
`);
  assert.deepEqual(blocks.map((block) => block.type), [
    "heading1",
    "heading2",
    "paragraph",
    "list",
    "list",
    "quote"
  ]);
  assert.equal(blocks[3].checked, true);
  assert.equal(blocks[4].checked, false);
});

test("host renderer creates a readable multi-page PDF binary", async () => {
  const repeated = Array.from({ length: 36 }, (_, index) => (
    `## Milestone ${index + 1}\nThis section records evidence, decisions, risks, and the next observable verification checkpoint.`
  )).join("\n\n");
  const buffer = await renderArtifactPdf({
    title: "Cooper delivery brief",
    content: `# Executive summary\n\nThe native and web clients share one durable artifact for José.\n\n${repeated}`,
    createdAt: "2026-07-14T18:00:00Z"
  });
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(buffer.length > 4_000);

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    assert.match(result.text, /Cooper delivery brief/);
    assert.match(result.text, /native and web clients share one durable artifact/i);
    assert.match(result.text, /José/);
    assert.ok((result.total ?? result.pages?.length ?? 0) >= 2);
  } finally {
    await parser.destroy();
  }
});

test("PDF renderer can label a Knowledge Studio document export", async () => {
  const buffer = await renderArtifactPdf({
    title: "Customer onboarding principles",
    content: "# Start with the customer\n\nBuild the plan around the outcome they need.",
    createdAt: "2026-07-16T07:30:00Z",
    label: "KNOWLEDGE DOCUMENT",
    subject: "Exported Cooper knowledge document"
  });
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    assert.match(result.text, /KNOWLEDGE DOCUMENT/);
    assert.match(result.text, /Customer onboarding principles/);
    assert.match(result.text, /Build the plan around the outcome they need/);
  } finally {
    await parser.destroy();
  }
});
