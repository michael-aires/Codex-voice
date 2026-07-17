import test from "node:test";
import assert from "node:assert/strict";
import {
  activeKnowledgeIndexRecord,
  addKnowledgeMessage,
  createKnowledgeIndexRecord,
  createStoredKnowledgeDocument,
  hydrateKnowledgeState,
  knowledgeLibrary,
  restoreStoredKnowledgeVersion,
  setKnowledgeSession,
  updateKnowledgeIndexRecord,
  updateStoredKnowledgeDocument
} from "../server/knowledgeStore.js";

function emptyDb() {
  return {};
}

test("knowledge hydration adds durable seed documents and version records", () => {
  const db = emptyDb();
  hydrateKnowledgeState(db, "2026-07-16T12:00:00.000Z");
  assert.equal(db.knowledgeDocuments.length, 6);
  assert.equal(db.knowledgeVersions.length, 6);
  assert.ok(db.knowledgeDocuments.every((document) => document.currentVersionId));
});

test("create and update persist canonical content with deduplicated versions", () => {
  const db = emptyDb();
  hydrateKnowledgeState(db, "2026-07-16T12:00:00.000Z");
  const created = createStoredKnowledgeDocument(db, { templateId: "blank", title: "Original thought" }, "2026-07-16T13:00:00.000Z");
  const initialVersionCount = db.knowledgeVersions.filter((version) => version.documentId === created.id).length;
  const updated = updateStoredKnowledgeDocument(db, created.id, { html: "<h1>Original thought</h1><p>Human-authored context.</p>" }, { now: "2026-07-16T13:01:00.000Z" });
  updateStoredKnowledgeDocument(db, created.id, { html: updated.html }, { now: "2026-07-16T13:02:00.000Z" });
  const finalVersionCount = db.knowledgeVersions.filter((version) => version.documentId === created.id).length;
  assert.equal(finalVersionCount, initialVersionCount + 1);
  assert.match(updated.markdown, /Human-authored context/);
});

test("version restore creates a new current version instead of mutating history", () => {
  const db = emptyDb();
  const created = createStoredKnowledgeDocument(db, { templateId: "blank", title: "Draft" }, "2026-07-16T10:00:00.000Z");
  const originalVersionId = created.currentVersionId;
  updateStoredKnowledgeDocument(db, created.id, { html: "<h1>Changed</h1><p>Later</p>" }, { now: "2026-07-16T11:00:00.000Z" });
  const restored = restoreStoredKnowledgeVersion(db, created.id, originalVersionId, { now: "2026-07-16T12:00:00.000Z" });
  assert.notEqual(restored.currentVersionId, originalVersionId);
  assert.equal(restored.title, "Draft");
  assert.ok(db.knowledgeVersions.some((version) => version.id === originalVersionId));
});

test("Cooper session binding is explicit and returns a private document to private on end", () => {
  const db = emptyDb();
  const created = createStoredKnowledgeDocument(db, { templateId: "blank" }, "2026-07-16T10:00:00.000Z");
  const active = setKnowledgeSession(db, created.id, true, { now: "2026-07-16T10:05:00.000Z" });
  assert.equal(active.lifecycle, "session-only");
  assert.equal(active.session.status, "active");
  addKnowledgeMessage(db, { documentId: created.id, sessionId: active.session.id, role: "user", text: "Challenge this." });
  const ended = setKnowledgeSession(db, created.id, false, { now: "2026-07-16T10:10:00.000Z" });
  assert.equal(ended.lifecycle, "private");
  assert.equal(ended.session, null);
});

test("index records supersede prior versions and update document retrieval status", () => {
  const db = emptyDb();
  const created = createStoredKnowledgeDocument(db, { templateId: "blank" }, "2026-07-16T10:00:00.000Z");
  const first = createKnowledgeIndexRecord(db, { documentId: created.id, versionId: created.currentVersionId, status: "indexing", fileId: "file-1" });
  const second = createKnowledgeIndexRecord(db, { documentId: created.id, versionId: created.currentVersionId, status: "ready", fileId: "file-2" });
  assert.equal(first.status, "superseded");
  assert.equal(activeKnowledgeIndexRecord(db, created.id).id, second.id);
  assert.equal(db.knowledgeDocuments.find((document) => document.id === created.id).indexStatus, "ready");
});

test("an in-flight index record can become ready without creating a fake document version", () => {
  const db = emptyDb();
  const created = createStoredKnowledgeDocument(db, { templateId: "blank" }, "2026-07-16T10:00:00.000Z");
  const record = createKnowledgeIndexRecord(db, { documentId: created.id, versionId: created.currentVersionId, status: "indexing", fileId: "file-1" });
  const versionCount = db.knowledgeVersions.length;
  const updated = updateKnowledgeIndexRecord(db, record.id, { status: "ready", now: "2026-07-16T10:01:00.000Z" });
  assert.equal(updated.indexStatus, "ready");
  assert.equal(activeKnowledgeIndexRecord(db, created.id).status, "ready");
  assert.equal(db.knowledgeVersions.length, versionCount);
});

test("library queries exclude archived work and return complete public metadata", () => {
  const db = emptyDb();
  hydrateKnowledgeState(db, "2026-07-16T12:00:00.000Z");
  const weekly = db.knowledgeDocuments.find((document) => document.title === "Weekly product brief");
  updateStoredKnowledgeDocument(db, weekly.id, { lifecycle: "archived" });
  const result = knowledgeLibrary(db, { query: "weekly" });
  assert.equal(result.length, 0);
  assert.ok(knowledgeLibrary(db, { filter: "all" })[0].versions);
});
