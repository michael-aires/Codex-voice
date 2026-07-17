import {
  applyKnowledgePatch,
  createKnowledgeDocument,
  createKnowledgeVersion,
  filterKnowledgeDocuments,
  knowledgeSeedData,
  normalizeKnowledgeDocument,
  restoreKnowledgeVersion,
  sortKnowledgeDocuments
} from "../src/knowledgeStudioModel.js";

export function hydrateKnowledgeState(db, now = new Date().toISOString()) {
  const hasKnowledgeShape = Array.isArray(db.knowledgeDocuments) && Array.isArray(db.knowledgeVersions);
  if (!hasKnowledgeShape || (!db.knowledgeDocuments.length && !db.knowledgeVersions.length)) {
    const seed = knowledgeSeedData(now);
    db.knowledgeDocuments = seed.documents;
    db.knowledgeVersions = seed.versions;
    db.knowledgeSessions = seed.sessions;
    db.knowledgeMessages = seed.messages;
    db.knowledgeIndexRecords = seed.indexRecords;
    db.knowledgeConfig = seed.config;
  } else {
    db.knowledgeDocuments = db.knowledgeDocuments.map(normalizeKnowledgeDocument);
    db.knowledgeVersions = Array.isArray(db.knowledgeVersions) ? db.knowledgeVersions : [];
    db.knowledgeSessions = Array.isArray(db.knowledgeSessions) ? db.knowledgeSessions : [];
    db.knowledgeMessages = Array.isArray(db.knowledgeMessages) ? db.knowledgeMessages : [];
    db.knowledgeIndexRecords = Array.isArray(db.knowledgeIndexRecords) ? db.knowledgeIndexRecords : [];
    db.knowledgeConfig = db.knowledgeConfig && typeof db.knowledgeConfig === "object" ? db.knowledgeConfig : {};
  }
  return db;
}

export function knowledgeLibrary(db, { query = "", filter = "all", sort = "updated", owner = "You" } = {}) {
  hydrateKnowledgeState(db);
  return sortKnowledgeDocuments(filterKnowledgeDocuments(db.knowledgeDocuments, { query, filter, owner }), sort)
    .map((document) => publicKnowledgeDocument(db, document));
}

export function publicKnowledgeDocument(db, document, { includeContent = true } = {}) {
  const versions = db.knowledgeVersions
    .filter((version) => version.documentId === document.id)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 50)
    .map(publicKnowledgeVersion);
  const session = db.knowledgeSessions.find((item) => item.id === document.sessionId && item.status === "active") || null;
  const messages = session
    ? db.knowledgeMessages.filter((item) => item.sessionId === session.id).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)).slice(-100)
    : [];
  const result = {
    ...document,
    versions,
    session: session ? publicKnowledgeSession(session) : null,
    messages: messages.map(publicKnowledgeMessage),
    versionCount: db.knowledgeVersions.filter((version) => version.documentId === document.id).length
  };
  if (!includeContent) {
    delete result.html;
    delete result.graph;
    delete result.markdown;
    delete result.plainText;
    delete result.messages;
  }
  return result;
}

export function findKnowledgeDocument(db, id) {
  hydrateKnowledgeState(db);
  return db.knowledgeDocuments.find((document) => document.id === id) || null;
}

export function createStoredKnowledgeDocument(db, input = {}, now = new Date().toISOString()) {
  hydrateKnowledgeState(db, now);
  const created = createKnowledgeDocument({
    templateId: input.templateId || (input.type === "diagram" ? "diagram" : "blank"),
    owner: input.owner || "You",
    project: input.project || "Personal",
    now,
    id: input.id
  });
  const document = applyKnowledgePatch(created.document, {
    title: input.title || created.document.title,
    html: input.html === undefined ? created.document.html : input.html,
    graph: input.graph === undefined ? created.document.graph : input.graph
  }, { now });
  const version = createKnowledgeVersion(document, { now, actor: input.owner || "You", id: created.version.id });
  document.currentVersionId = version.id;
  db.knowledgeDocuments.unshift(document);
  db.knowledgeVersions.unshift(version);
  return publicKnowledgeDocument(db, document);
}

export function updateStoredKnowledgeDocument(db, id, patch = {}, { now = new Date().toISOString(), actor = "You", saveVersion = true } = {}) {
  hydrateKnowledgeState(db, now);
  const index = db.knowledgeDocuments.findIndex((document) => document.id === id);
  if (index < 0) return null;
  const next = applyKnowledgePatch(db.knowledgeDocuments[index], patch, { now });
  const currentVersion = db.knowledgeVersions.find((version) => version.id === next.currentVersionId);
  const representationsChanged = !currentVersion
    || currentVersion.html !== next.html
    || JSON.stringify(currentVersion.graph) !== JSON.stringify(next.graph)
    || currentVersion.title !== next.title
    || currentVersion.lifecycle !== next.lifecycle
    || currentVersion.visibility !== next.visibility;
  if (saveVersion && representationsChanged) {
    const version = createKnowledgeVersion(next, { now, actor });
    next.currentVersionId = version.id;
    db.knowledgeVersions.unshift(version);
    trimDocumentVersions(db, id, 100);
  }
  db.knowledgeDocuments[index] = next;
  return publicKnowledgeDocument(db, next);
}

export function restoreStoredKnowledgeVersion(db, id, versionId, { now = new Date().toISOString(), actor = "You" } = {}) {
  hydrateKnowledgeState(db, now);
  const index = db.knowledgeDocuments.findIndex((document) => document.id === id);
  if (index < 0) return null;
  const version = db.knowledgeVersions.find((item) => item.id === versionId && item.documentId === id);
  if (!version) return null;
  const restored = restoreKnowledgeVersion(db.knowledgeDocuments[index], version, { now });
  const restoreVersion = createKnowledgeVersion(restored, { now, actor });
  restored.currentVersionId = restoreVersion.id;
  db.knowledgeDocuments[index] = restored;
  db.knowledgeVersions.unshift(restoreVersion);
  trimDocumentVersions(db, id, 100);
  return publicKnowledgeDocument(db, restored);
}

export function setKnowledgeSession(db, id, active, { now = new Date().toISOString() } = {}) {
  hydrateKnowledgeState(db, now);
  const document = findKnowledgeDocument(db, id);
  if (!document) return null;
  const existing = db.knowledgeSessions.find((session) => session.id === document.sessionId && session.status === "active");
  if (active) {
    if (existing) return publicKnowledgeDocument(db, document);
    const session = {
      id: knowledgeRecordId("knowledge-session"),
      documentId: id,
      versionId: document.currentVersionId,
      status: "active",
      previousResponseId: "",
      startedAt: now,
      endedAt: ""
    };
    db.knowledgeSessions.unshift(session);
    document.sessionId = session.id;
    if (document.lifecycle === "private") document.lifecycle = "session-only";
    document.updatedAt = now;
  } else {
    if (existing) {
      existing.status = "ended";
      existing.endedAt = now;
    }
    document.sessionId = "";
    if (document.lifecycle === "session-only") document.lifecycle = "private";
    document.updatedAt = now;
  }
  return publicKnowledgeDocument(db, document);
}

export function addKnowledgeMessage(db, { documentId, sessionId, role, text, citations = [], responseId = "", now = new Date().toISOString() } = {}) {
  hydrateKnowledgeState(db, now);
  const message = {
    id: knowledgeRecordId("knowledge-message"),
    documentId,
    sessionId,
    role: role === "assistant" ? "assistant" : "user",
    text: String(text || "").slice(0, 50_000),
    citations: Array.isArray(citations) ? citations.slice(0, 20) : [],
    responseId: String(responseId || ""),
    createdAt: now
  };
  db.knowledgeMessages.push(message);
  return publicKnowledgeMessage(message);
}

export function setKnowledgeSessionResponse(db, sessionId, responseId, now = new Date().toISOString()) {
  const session = db.knowledgeSessions.find((item) => item.id === sessionId);
  if (!session) return null;
  session.previousResponseId = String(responseId || "");
  session.updatedAt = now;
  return session;
}

export function createKnowledgeIndexRecord(db, { documentId, versionId, status, vectorStoreId = "", fileId = "", vectorStoreFileId = "", error = "", now = new Date().toISOString() } = {}) {
  hydrateKnowledgeState(db, now);
  const active = db.knowledgeIndexRecords.find((record) => record.documentId === documentId && record.status !== "removed");
  if (active) active.status = "superseded";
  const record = {
    id: knowledgeRecordId("knowledge-index"),
    documentId,
    versionId,
    status,
    vectorStoreId,
    fileId,
    vectorStoreFileId,
    error: String(error || "").slice(0, 1_000),
    createdAt: now,
    updatedAt: now
  };
  db.knowledgeIndexRecords.unshift(record);
  const document = findKnowledgeDocument(db, documentId);
  if (document) {
    document.indexStatus = status;
    document.indexError = record.error;
    document.indexRecordId = record.id;
    if (vectorStoreId) db.knowledgeConfig.vectorStoreId = vectorStoreId;
  }
  return record;
}

export function activeKnowledgeIndexRecord(db, documentId) {
  return db.knowledgeIndexRecords.find((record) => record.documentId === documentId && !["removed", "superseded"].includes(record.status)) || null;
}

export function updateKnowledgeIndexRecord(db, recordId, { status, error = "", now = new Date().toISOString() } = {}) {
  hydrateKnowledgeState(db, now);
  const record = db.knowledgeIndexRecords.find((item) => item.id === recordId);
  if (!record) return null;
  record.status = status;
  record.error = String(error || "").slice(0, 1_000);
  record.updatedAt = now;
  const document = findKnowledgeDocument(db, record.documentId);
  if (document) {
    document.indexStatus = status;
    document.indexError = record.error;
    document.indexRecordId = record.id;
  }
  return document ? publicKnowledgeDocument(db, document) : null;
}

export function publicKnowledgeVersion(version) {
  return {
    id: version.id,
    documentId: version.documentId,
    title: version.title,
    lifecycle: version.lifecycle,
    visibility: version.visibility,
    actor: version.actor,
    createdAt: version.createdAt
  };
}

function publicKnowledgeSession(session) {
  return {
    id: session.id,
    documentId: session.documentId,
    versionId: session.versionId,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt || session.startedAt
  };
}

function publicKnowledgeMessage(message) {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    citations: message.citations || [],
    createdAt: message.createdAt
  };
}

function trimDocumentVersions(db, documentId, limit) {
  const keepIds = new Set(db.knowledgeVersions.filter((version) => version.documentId === documentId).slice(0, limit).map((version) => version.id));
  db.knowledgeVersions = db.knowledgeVersions.filter((version) => version.documentId !== documentId || keepIds.has(version.id));
}

function knowledgeRecordId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
