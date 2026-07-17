import {
  buildKnowledgeChatInstructions,
  buildKnowledgeSessionContext,
  extractResponseCitations,
  extractResponseOutputText
} from "../src/knowledgeStudioModel.js";

const OPENAI_API_ROOT = "https://api.openai.com/v1";

export function createKnowledgeOpenAIClient({
  apiKey = process.env.OPENAI_API_KEY || "",
  model = process.env.OPENAI_KNOWLEDGE_MODEL || "gpt-5.4-mini",
  vectorStoreId = process.env.COOPER_KNOWLEDGE_VECTOR_STORE_ID || "",
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  async function request(path, options = {}) {
    if (!apiKey) throw new KnowledgeOpenAIError("OpenAI is not configured for Knowledge Studio.", 503, "missing_api_key");
    const response = await fetchImpl(`${OPENAI_API_ROOT}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });
    const contentType = response.headers?.get?.("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => "");
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || String(payload || "OpenAI request failed.");
      throw new KnowledgeOpenAIError(message, response.status, payload?.error?.code || "openai_error");
    }
    return payload;
  }

  async function ensureVectorStore(preferredId = "") {
    const existing = preferredId || vectorStoreId;
    if (existing) return existing;
    const store = await request("/vector_stores", {
      method: "POST",
      body: JSON.stringify({ name: "Cooper knowledge studio" })
    });
    return store.id;
  }

  async function indexVersion({ document, version, currentVectorStoreId = "" }) {
    if (!apiKey) {
      return { status: "not-configured", vectorStoreId: currentVectorStoreId || vectorStoreId, fileId: "", vectorStoreFileId: "" };
    }
    const resolvedVectorStoreId = await ensureVectorStore(currentVectorStoreId);
    const filename = safeFilename(`${document.title}-${version.id}.md`);
    const form = new FormData();
    form.set("purpose", "assistants");
    form.set("file", new Blob([version.markdown || version.plainText || ""], { type: "text/markdown" }), filename);
    const file = await request("/files", { method: "POST", body: form });
    const vectorFile = await request(`/vector_stores/${encodeURIComponent(resolvedVectorStoreId)}/files`, {
      method: "POST",
      body: JSON.stringify({
        file_id: file.id,
        attributes: {
          document_id: document.id.slice(0, 256),
          version_id: version.id.slice(0, 256),
          project: document.project.slice(0, 256),
          visibility: document.visibility,
          lifecycle: "published"
        }
      })
    });
    return {
      status: vectorFile.status === "completed" ? "ready" : "indexing",
      vectorStoreId: resolvedVectorStoreId,
      fileId: file.id,
      vectorStoreFileId: vectorFile.id || file.id
    };
  }

  async function getIndexStatus({ record, currentVectorStoreId = "" }) {
    if (!apiKey) return { status: "not-configured", error: "" };
    const resolvedVectorStoreId = currentVectorStoreId || record?.vectorStoreId || vectorStoreId;
    const vectorStoreFileId = record?.vectorStoreFileId || record?.fileId;
    if (!resolvedVectorStoreId || !vectorStoreFileId) {
      return { status: "failed", error: "The retrieval index record is incomplete." };
    }
    const vectorFile = await request(`/vector_stores/${encodeURIComponent(resolvedVectorStoreId)}/files/${encodeURIComponent(vectorStoreFileId)}`);
    const status = vectorFile.status === "completed"
      ? "ready"
      : ["failed", "cancelled"].includes(vectorFile.status)
        ? "failed"
        : "indexing";
    return {
      status,
      error: status === "failed" ? String(vectorFile.last_error?.message || "OpenAI could not index this document.") : ""
    };
  }

  async function removeIndexedVersion({ record, currentVectorStoreId = "" }) {
    const resolvedVectorStoreId = currentVectorStoreId || vectorStoreId;
    if (!apiKey || !resolvedVectorStoreId || !record?.fileId) return { status: "removed" };
    await request(`/vector_stores/${encodeURIComponent(resolvedVectorStoreId)}/files/${encodeURIComponent(record.fileId)}`, { method: "DELETE" })
      .catch((error) => {
        if (error.status !== 404) throw error;
      });
    await request(`/files/${encodeURIComponent(record.fileId)}`, { method: "DELETE" })
      .catch((error) => {
        if (error.status !== 404) throw error;
      });
    return { status: "removed" };
  }

  async function chat({ document, version, message, previousResponseId = "", currentVectorStoreId = "", authorizedDocumentIds = [] }) {
    const resolvedVectorStoreId = currentVectorStoreId || vectorStoreId;
    const body = {
      model,
      reasoning: { effort: "low" },
      instructions: buildKnowledgeChatInstructions(document),
      input: [
        { role: "developer", content: [{ type: "input_text", text: buildKnowledgeSessionContext(document, version) }] },
        { role: "user", content: [{ type: "input_text", text: String(message || "").slice(0, 12_000) }] }
      ],
      store: true
    };
    if (previousResponseId) body.previous_response_id = previousResponseId;
    const authorizedIds = [...new Set(authorizedDocumentIds.map(String).filter(Boolean))].slice(0, 100);
    if (resolvedVectorStoreId && authorizedIds.length) {
      body.tools = [{
        type: "file_search",
        vector_store_ids: [resolvedVectorStoreId],
        max_num_results: 5,
        filters: {
          type: "and",
          filters: [
            { type: "eq", key: "lifecycle", value: "published" },
            { type: "in", key: "document_id", value: authorizedIds }
          ]
        }
      }];
      body.include = ["file_search_call.results"];
    }
    const response = await request("/responses", { method: "POST", body: JSON.stringify(body) });
    const text = extractResponseOutputText(response);
    if (!text) throw new KnowledgeOpenAIError("Cooper returned no document response.", 502, "empty_response");
    return { id: response.id, text, citations: extractResponseCitations(response), raw: response };
  }

  return {
    configured: Boolean(apiKey),
    model,
    vectorStoreId,
    chat,
    ensureVectorStore,
    getIndexStatus,
    indexVersion,
    removeIndexedVersion
  };
}

export class KnowledgeOpenAIError extends Error {
  constructor(message, status = 500, code = "openai_error") {
    super(message);
    this.name = "KnowledgeOpenAIError";
    this.status = status;
    this.code = code;
  }
}

function safeFilename(value) {
  return String(value || "knowledge.md")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "knowledge.md";
}
