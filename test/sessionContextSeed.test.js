import assert from "node:assert/strict";
import test from "node:test";
import { contextSourcesFromSessionSeed } from "../src/sessionContextSeed.js";

test("preselects a Notion sprint task as the locked primary session source", () => {
  const [source] = contextSourcesFromSessionSeed({
    id: "notion-39c5efcc-eccd-8038-a3b7-f874099756ba",
    targetId: "39c5efcc-eccd-8038-a3b7-f874099756ba",
    type: "task",
    title: "Corporate Demand Notes missing from UI",
    url: "https://app.notion.com/p/Corporate-Demand-Notes-39c5efcceccd8038a3b7f874099756ba",
    eyebrow: "PDD-4756 · Peterson",
    status: "In progress",
    metadata: { updatedAt: "2026-07-13T20:00:00.000Z" }
  });

  assert.deepEqual(source, {
    id: "39c5efcc-eccd-8038-a3b7-f874099756ba",
    provider: "notion",
    type: "page",
    title: "Corporate Demand Notes missing from UI",
    url: "https://app.notion.com/p/Corporate-Demand-Notes-39c5efcceccd8038a3b7f874099756ba",
    meta: "Primary sprint ticket · Full page + properties · PDD-4756 · Peterson · In progress",
    updatedAt: "2026-07-13T20:00:00.000Z",
    primary: true,
    locked: true
  });
});

test("does not invent an origin source for meetings or fresh sessions", () => {
  assert.deepEqual(contextSourcesFromSessionSeed({ type: "meeting", id: "meeting-1" }), []);
  assert.deepEqual(contextSourcesFromSessionSeed(null), []);
});

test("extracts a compact Notion object ID from the task URL when targetId is absent", () => {
  const [source] = contextSourcesFromSessionSeed({
    type: "task",
    title: "Ticket",
    url: "https://notion.so/Ticket-39c5efcceccd8038a3b7f874099756ba?source=copy_link"
  });
  assert.equal(source.id, "39c5efcc-eccd-8038-a3b7-f874099756ba");
});
