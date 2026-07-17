import test from "node:test";
import assert from "node:assert/strict";
import { createKnowledgeOpenAIClient, KnowledgeOpenAIError } from "../server/knowledgeOpenAI.js";
import { createKnowledgeDocument } from "../src/knowledgeStudioModel.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

test("knowledge client leaves publication durable when OpenAI indexing is not configured", async () => {
  const client = createKnowledgeOpenAIClient({ apiKey: "", fetchImpl: async () => { throw new Error("should not fetch"); } });
  const { document, version } = createKnowledgeDocument({ id: "doc-no-key" });
  const result = await client.indexVersion({ document, version });
  assert.deepEqual(result, { status: "not-configured", vectorStoreId: "", fileId: "", vectorStoreFileId: "" });
});

test("indexing creates a vector store, uploads Markdown, and attaches permission metadata", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ id: "vs-1" }),
    jsonResponse({ id: "file-1" }),
    jsonResponse({ id: "file-1", status: "completed" })
  ];
  const client = createKnowledgeOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    }
  });
  const { document, version } = createKnowledgeDocument({ id: "doc-index" });
  document.project = "Platform";
  document.visibility = "workspace";
  const result = await client.indexVersion({ document, version });
  assert.equal(result.status, "ready");
  assert.equal(result.vectorStoreId, "vs-1");
  assert.match(calls[0].url, /\/vector_stores$/);
  assert.match(calls[1].url, /\/files$/);
  const attachBody = JSON.parse(calls[2].options.body);
  assert.equal(attachBody.attributes.document_id, "doc-index");
  assert.equal(attachBody.attributes.visibility, "workspace");
  assert.equal(attachBody.attributes.lifecycle, "published");
});

test("index polling maps provider completion and failure into durable retrieval states", async () => {
  const responses = [
    jsonResponse({ id: "file-1", status: "completed" }),
    jsonResponse({ id: "file-2", status: "failed", last_error: { message: "Unsupported content" } })
  ];
  const client = createKnowledgeOpenAIClient({ apiKey: "test-key", fetchImpl: async () => responses.shift() });
  const ready = await client.getIndexStatus({ record: { vectorStoreId: "vs-1", vectorStoreFileId: "file-1" } });
  const failed = await client.getIndexStatus({ record: { vectorStoreId: "vs-1", vectorStoreFileId: "file-2" } });
  assert.deepEqual(ready, { status: "ready", error: "" });
  assert.deepEqual(failed, { status: "failed", error: "Unsupported content" });
});

test("document chat sends exact current context and enables published knowledge search", async () => {
  let request;
  const client = createKnowledgeOpenAIClient({
    apiKey: "test-key",
    vectorStoreId: "vs-known",
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return jsonResponse({
        id: "resp-1",
        output: [{ type: "message", content: [{ type: "output_text", text: "The strongest argument is clarity.", annotations: [{ type: "file_citation", file_id: "file-2", filename: "principles.md" }] }] }]
      });
    }
  });
  const { document, version } = createKnowledgeDocument({ id: "doc-chat", templateId: "brief" });
  const result = await client.chat({ document, version, message: "Challenge this", previousResponseId: "resp-0", authorizedDocumentIds: ["doc-published"] });
  assert.equal(result.text, "The strongest argument is clarity.");
  assert.deepEqual(result.citations, [{ fileId: "file-2", filename: "principles.md" }]);
  assert.equal(request.body.previous_response_id, "resp-0");
  assert.equal(request.body.tools[0].type, "file_search");
  assert.deepEqual(request.body.tools[0].filters.filters[1], { type: "in", key: "document_id", value: ["doc-published"] });
  assert.match(request.body.input[0].content[0].text, /Document ID: doc-chat/);
});

test("document chat cannot search a vector store without an application-authorized document set", async () => {
  let body;
  const client = createKnowledgeOpenAIClient({
    apiKey: "test-key",
    vectorStoreId: "vs-known",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ id: "resp-private", output_text: "Only the direct draft was used." });
    }
  });
  const { document, version } = createKnowledgeDocument({ id: "doc-private" });
  await client.chat({ document, version, message: "Help", authorizedDocumentIds: [] });
  assert.equal(body.tools, undefined);
  assert.equal(body.include, undefined);
});

test("OpenAI errors preserve status and provider message", async () => {
  const client = createKnowledgeOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async () => jsonResponse({ error: { message: "Rate limited", code: "rate_limit" } }, 429)
  });
  const { document, version } = createKnowledgeDocument({ id: "doc-error" });
  await assert.rejects(
    () => client.chat({ document, version, message: "Help" }),
    (error) => error instanceof KnowledgeOpenAIError && error.status === 429 && error.code === "rate_limit"
  );
});
