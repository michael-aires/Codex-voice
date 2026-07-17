import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, model, css, main, server, openAI, index] = await Promise.all([
  readFile(new URL("../src/knowledgeStudio.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/knowledgeStudioModel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/knowledge-studio.css", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../server/knowledgeOpenAI.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/19-cooper-knowledge-studio-index.md", import.meta.url), "utf8")
]);

test("Docs uses the accepted naked launcher and an overlay workspace drawer", () => {
  assert.match(component, /Open Cooper AIRES workspace navigation/);
  assert.match(component, /knowledge-workspace-drawer\$\{open \? " open"/);
  assert.match(css, /The default canvas keeps only a naked mark/);
  assert.match(css, /\.knowledge-workspace-launcher:hover[\s\S]*width:\s*204px/);
  assert.match(css, /\.knowledge-workspace-drawer\s*\{\s*width:\s*min\(252px, 92vw\)/);
  assert.doesNotMatch(component.slice(component.indexOf("function KnowledgeLibrary"), component.indexOf("function QuickCreateMenu")), /SessionOsTopbar/);
});

test("the library exposes search, complete filters, templates, selection details, and direct mobile open", () => {
  for (const label of ["Search your knowledge", "Start from a template", "Recent versions"]) assert.match(component, new RegExp(label));
  for (const label of ["Documents", "Diagrams", "Published", "Mine"]) assert.match(model, new RegExp(label));
  for (const template of ["blank", "brief", "meeting", "decision", "diagram"]) {
    assert.match(model, new RegExp(`id: "${template}"`));
  }
  assert.match(component, /matchMedia\("\(max-width: 980px\)"\)/);
  assert.match(component, /deepLinkedDocumentId/);
});

test("one private-first editor surface supports writing, tools, blocks, versions, sharing, and Cooper", () => {
  assert.match(component, /contentEditable/);
  assert.match(component, /aria-label="Editable document"/);
  for (const control of ["Paragraph", "Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Add link"]) {
    assert.match(component, new RegExp(control));
  }
  for (const tab of ["Format", "Blocks", "Details"]) assert.match(component, new RegExp(tab));
  for (const block of ["Section", "Callout", "Comparison", "Checklist"]) assert.match(component, new RegExp(block));
  assert.match(component, /Start with Cooper/);
  assert.match(component, /End session/);
  assert.match(component, /aria-label=\{sessionActive \? "End Cooper session" : "Start with Cooper"\}/);
  assert.match(component, /Who can use this work\?/);
  assert.match(component, /Share with team/);
  assert.match(component, /Publish to workspace/);
  assert.match(component, /expectedVersionId/);
  for (const format of ["Markdown", "HTML", "PDF"]) assert.match(component, new RegExp(`Export ${format}`));
  assert.match(server, /if \(format === "pdf"\)[\s\S]*label: "KNOWLEDGE DOCUMENT"[\s\S]*application\/pdf/);
  assert.match(css, /button\.knowledge-open-tools\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(css, /\.knowledge-document-meta\.date,[\s\S]*\.knowledge-row-chevron\s*\{\s*display:\s*none/);
});

test("Session Canvas mounts the same editor and syncs saved exact text into live context", () => {
  assert.match(main, /<SessionKnowledgeCanvas/);
  assert.match(main, />Write<\/button>/);
  assert.match(component, /<KnowledgeEditor[\s\S]*embedded/);
  assert.match(component, /externalId: `knowledge-document:\$\{payload\.document\.id\}`/);
  assert.match(main, /async function addLiveContext\(\{ title, content, externalId = "" \}\)/);
  assert.match(server, /item\.externalId === externalId/);
});

test("diagram knowledge keeps graph JSON and deterministic text side by side", () => {
  assert.match(component, /Editable diagram canvas/);
  assert.match(component, /Add node/);
  assert.match(component, /Text summary/);
  assert.match(component, /Agent-readable diagram summary/);
  assert.match(model, /export function graphToMarkdown/);
  assert.match(model, /normalizeKnowledgeGraph/);
});

test("retrieval stays downstream of durable permissions and exact versions", () => {
  assert.match(server, /expectedVersionId && current\.currentVersionId !== expectedVersionId/);
  assert.match(server, /status\(409\)/);
  assert.match(server, /filter\(canRetrieveKnowledgeDocument\)\.map/);
  assert.match(openAI, /authorizedDocumentIds/);
  assert.match(openAI, /type: "in", key: "document_id"/);
  assert.match(openAI, /version_id: version\.id/);
  assert.match(server, /lifecycle: "archived"[\s\S]*visibility: "private"/);
  assert.match(server, /provider cleanup will need retrying/);
  assert.match(server, /\/index-status/);
  assert.match(component, /refreshIndexStatuses/);
});

test("the product index preserves the human-writing thesis and retrieval decision", () => {
  for (const phrase of ["Writing is the work", "Private by default", "Cooper is invited", "use retrieval-augmented generation", "embeddings as one part of retrieval"]) {
    assert.match(index, new RegExp(phrase, "i"));
  }
});
