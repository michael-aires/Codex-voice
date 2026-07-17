import test from "node:test";
import assert from "node:assert/strict";
import {
  applyKnowledgePatch,
  buildKnowledgeSessionContext,
  canRetrieveKnowledgeDocument,
  createKnowledgeDocument,
  createKnowledgeVersion,
  filterKnowledgeDocuments,
  graphToMarkdown,
  htmlToMarkdown,
  htmlToPlainText,
  knowledgeSeedData,
  restoreKnowledgeVersion,
  sanitizeKnowledgeHtml,
  sortKnowledgeDocuments
} from "../src/knowledgeStudioModel.js";

test("knowledge HTML sanitization preserves writing markup and removes executable content", () => {
  const input = '<h1 onclick="steal()">A thought</h1><script>alert(1)</script><p><strong>Safe</strong> <a href="javascript:bad()">link</a></p><iframe src="x"></iframe>';
  const result = sanitizeKnowledgeHtml(input);
  assert.match(result, /<h1>A thought<\/h1>/);
  assert.match(result, /<strong>Safe<\/strong>/);
  assert.doesNotMatch(result, /onclick|script|iframe|javascript:/i);
});

test("rich text derives portable Markdown and normalized plain text", () => {
  const html = "<h1>Weekly brief</h1><p>Hello <strong>team</strong>.</p><h2>Next</h2><ul><li>Ship it</li></ul>";
  assert.equal(htmlToPlainText(html), "Weekly brief\nHello team.\nNext\n- Ship it");
  assert.equal(htmlToMarkdown(html), "# Weekly brief\n\nHello **team**.\n\n## Next\n\n- Ship it");
});

test("diagram projection is deterministic and agent-readable", () => {
  const markdown = graphToMarkdown({
    nodes: [{ id: "a", label: "Problem" }, { id: "b", label: "Experiment", notes: "Run with five teams" }],
    edges: [{ id: "e", source: "a", target: "b", label: "informs" }]
  });
  assert.match(markdown, /- Problem/);
  assert.match(markdown, /- Experiment — Run with five teams/);
  assert.match(markdown, /- Problem informs Experiment/);
});

test("new documents are private, versioned, and excluded from retrieval", () => {
  const { document, version } = createKnowledgeDocument({ id: "doc-1", templateId: "brief", now: "2026-07-16T00:00:00.000Z" });
  assert.equal(document.lifecycle, "private");
  assert.equal(document.visibility, "private");
  assert.equal(document.currentVersionId, version.id);
  assert.equal(canRetrieveKnowledgeDocument(document), false);
});

test("published retrieval requires non-private visibility and a ready index", () => {
  const { document } = createKnowledgeDocument({ id: "doc-2" });
  const notReady = applyKnowledgePatch(document, { lifecycle: "published", visibility: "workspace", indexStatus: "indexing" });
  const ready = applyKnowledgePatch(notReady, { indexStatus: "ready" });
  assert.equal(canRetrieveKnowledgeDocument(notReady), false);
  assert.equal(canRetrieveKnowledgeDocument(ready), true);
});

test("filtering and sorting cover type, publication, ownership, query, and dates", () => {
  const seed = knowledgeSeedData("2026-07-16T12:00:00.000Z").documents;
  assert.equal(filterKnowledgeDocuments(seed, { filter: "diagram" }).length, 1);
  assert.equal(filterKnowledgeDocuments(seed, { filter: "published" }).length, 2);
  assert.ok(filterKnowledgeDocuments(seed, { filter: "mine" }).every((document) => document.owner === "You"));
  assert.deepEqual(filterKnowledgeDocuments(seed, { query: "onboarding" }).map((document) => document.title), ["Customer onboarding principles"]);
  const sorted = sortKnowledgeDocuments(seed, "updated");
  assert.equal(sorted[0].title, "Weekly product brief");
});

test("restoring a version keeps current privacy state while recovering content", () => {
  const { document } = createKnowledgeDocument({ id: "doc-3", now: "2026-07-16T00:00:00.000Z" });
  const first = applyKnowledgePatch(document, { html: "<h1>First</h1><p>Original</p>" }, { now: "2026-07-16T01:00:00.000Z" });
  const version = createKnowledgeVersion(first, { id: "version-first", now: "2026-07-16T01:00:00.000Z" });
  const published = applyKnowledgePatch(first, { html: "<h1>Second</h1>", lifecycle: "published", visibility: "workspace" });
  const restored = restoreKnowledgeVersion(published, version);
  assert.equal(restored.title, "First");
  assert.match(restored.html, /Original/);
  assert.equal(restored.lifecycle, "published");
  assert.equal(restored.visibility, "workspace");
});

test("session context identifies the exact document and version", () => {
  const { document, version } = createKnowledgeDocument({ id: "doc-4", now: "2026-07-16T00:00:00.000Z" });
  const context = buildKnowledgeSessionContext(document, version);
  assert.match(context, /Document ID: doc-4/);
  assert.match(context, new RegExp(`Version ID: ${version.id}`));
  assert.match(context, /user-authored context/i);
});
