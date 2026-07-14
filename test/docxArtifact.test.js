import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { renderArtifactDocx } from "../server/docxArtifact.js";

test("host renderer creates an editable Word package with real document structure", async () => {
  const buffer = await renderArtifactDocx({
    title: "Cooper Word delivery brief",
    content: `# Cooper Word delivery brief

## Decision

Ship one editable artifact across the host, web, and iOS clients.

1. Generate the Office Open XML bytes.
2. Preserve the authenticated download contract.

- [x] Shared worker
- [ ] Physical-device handoff

> External credentials remain a release gate.
`,
    createdAt: "2026-07-14T18:30:00Z"
  });

  assert.equal(buffer.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(buffer.length > 8_000);

  const archive = await JSZip.loadAsync(buffer);
  const [document, styles, numbering, footer, core] = await Promise.all([
    archive.file("word/document.xml").async("string"),
    archive.file("word/styles.xml").async("string"),
    archive.file("word/numbering.xml").async("string"),
    archive.file("word/footer1.xml").async("string"),
    archive.file("docProps/core.xml").async("string")
  ]);

  assert.match(document, /Cooper Word delivery brief/);
  assert.match(document, /Ship one editable artifact/);
  assert.match(document, /w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/);
  assert.match(styles, /w:styleId="CooperTitle"/);
  assert.match(numbering, /w:numFmt w:val="decimal"/);
  assert.match(numbering, /☒/);
  assert.match(numbering, /☐/);
  assert.match(footer, />PAGE</);
  assert.match(footer, />NUMPAGES</);
  assert.match(core, /Cooper by AIRES/);
});
