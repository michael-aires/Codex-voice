import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextPacket,
  composeRealtimeSessionContext,
  extractNotionObjectId,
  filterContextRecords,
  formatNotionMetadataContext,
  formatNotionResolvedContext,
  normalizeContextSearchResults,
  normalizeSelectedContextSource
} from "../server/contextCheckpoint.js";

test("extracts compact Notion IDs without absorbing hexadecimal slug characters", () => {
  assert.equal(
    extractNotionObjectId("https://app.notion.com/p/Peterson-Corporate-Demand-Notes-missing-from-UI-Permissions-page-39c5efcceccd8038a3b7f874099756ba?source=copy_link"),
    "39c5efcc-eccd-8038-a3b7-f874099756ba"
  );
  assert.equal(
    extractNotionObjectId("39C5EFCC-ECCD-8038-A3B7-F874099756BA"),
    "39c5efcc-eccd-8038-a3b7-f874099756ba"
  );
});

test("formats Notion task metadata as usable Realtime evidence when page blocks fail", () => {
  const context = formatNotionMetadataContext({
    id: "39c5efcc-eccd-8038-a3b7-f874099756ba",
    url: "https://app.notion.com/p/task-39c5efcceccd8038a3b7f874099756ba",
    properties: {
      "Task name": { type: "title", title: [{ plain_text: "Corporate Demand Notes missing from UI" }] },
      Status: { type: "status", status: { name: "In progress" } },
      Summary: { type: "rich_text", rich_text: [{ plain_text: "The menu entry was commented out, removing the page and permission controls from the UI." }] },
      "Task ID": { type: "unique_id", unique_id: { prefix: "PDD", number: 4756 } }
    }
  });

  assert.match(context, /Corporate Demand Notes missing from UI/);
  assert.match(context, /menu entry was commented out/);
  assert.match(context, /Status: In progress/);
  assert.match(context, /Task ID: PDD-4756/);
  assert.match(context, /metadata fallback/);
});

test("combines Notion ticket properties and page blocks into one session evidence source", () => {
  const context = formatNotionResolvedContext({
    page: {
      id: "39c5efcc-eccd-8038-a3b7-f874099756ba",
      url: "https://notion.so/task",
      properties: {
        "Task name": { type: "title", title: [{ plain_text: "Corporate Demand Notes missing from UI" }] },
        Status: { type: "status", status: { name: "In progress" } },
        Summary: { type: "rich_text", rich_text: [{ plain_text: "Restore the permission surface." }] },
        "Task ID": { type: "unique_id", unique_id: { prefix: "PDD", number: 4756 } }
      }
    },
    content: "## Acceptance criteria\n- The menu entry is visible for authorized roles."
  }, {
    title: "Fallback ticket title",
    url: "https://notion.so/task"
  });

  assert.match(context, /Loaded from Notion as the primary session source/);
  assert.match(context, /Status: In progress/);
  assert.match(context, /Task ID: PDD-4756/);
  assert.match(context, /Acceptance criteria/);
  assert.match(context, /menu entry is visible/);
});

test("composes context packet evidence into the initial Realtime session", () => {
  const context = composeRealtimeSessionContext(
    "Project context",
    "# Cooper Session Context Packet\n## Source: Corporate Demand Notes\nThe menu entry was commented out."
  );

  assert.match(context, /already loaded into this Realtime session/);
  assert.match(context, /Project context/);
  assert.match(context, /Corporate Demand Notes/);
  assert.match(context, /Do not say you cannot open a selected source/);
});

test("normalizes Notion Arcade and direct API results into picker records", () => {
  const records = normalizeContextSearchResults("notion", {
    query: "rep velocity",
    results: [
      {
        id: "page-1",
        object: "page",
        title: "Rep velocity thesis",
        url: "https://notion.so/page-1",
        lastEditedAt: "2026-07-12T18:00:00.000Z"
      },
      {
        id: "db-1",
        object: "data_source",
        title: "Sprint 14",
        url: "https://notion.so/db-1",
        last_edited_time: "2026-07-11T18:00:00.000Z"
      }
    ]
  });

  assert.deepEqual(records.map(({ id, provider, type, title }) => ({ id, provider, type, title })), [
    { id: "page-1", provider: "notion", type: "page", title: "Rep velocity thesis" },
    { id: "db-1", provider: "notion", type: "database", title: "Sprint 14" }
  ]);
  assert.equal(records[0].url, "https://notion.so/page-1");
  assert.equal(records[0].freshness, "current");
});

test("filters Notion pages by their parent database for drill-down navigation", () => {
  const records = normalizeContextSearchResults("notion", {
    results: [
      { id: "task-1", object: "page", title: "Corporate Demand Notes", parent: { type: "database_id", database_id: "tasks-db" } },
      { id: "prd-1", object: "page", title: "Demand Notes PRD", parent: { type: "database_id", database_id: "prds-db" } }
    ]
  });

  assert.equal(records[0].parentId, "tasks-db");
  assert.deepEqual(filterContextRecords(records, { parentId: "tasks-db" }).map((record) => record.id), ["task-1"]);
});

test("keeps the full Notion page collection when an unlimited picker search is requested", () => {
  const records = normalizeContextSearchResults("notion", {
    results: Array.from({ length: 140 }, (_, index) => ({
      id: `task-${index + 1}`,
      object: "page",
      title: `Sprint task ${index + 1}`,
      parent: { type: "database_id", database_id: "sprint-db" }
    }))
  });

  assert.equal(filterContextRecords(records, { type: "page", limit: -1 }).length, 140);
  assert.equal(filterContextRecords(records, { parentId: "sprint-db", limit: -1 }).length, 140);
});

test("normalizes mixed GitHub Arcade results and applies repository, type, and text filters", () => {
  const records = normalizeContextSearchResults("github", {
    pull_requests: [
      {
        id: 842,
        number: 842,
        title: "First-touch event model",
        html_url: "https://github.com/aires/aires-crm/pull/842",
        repository: { full_name: "aires/aires-crm" },
        updated_at: "2026-07-12T17:00:00.000Z"
      }
    ],
    branches: [
      {
        name: "feature/resumable-context",
        repository: "aires/cooper-session-os",
        url: "https://github.com/aires/cooper-session-os/tree/feature/resumable-context"
      }
    ],
    issues: [
      {
        id: 94,
        number: 94,
        title: "Context freshness gate",
        html_url: "https://github.com/aires/cooper-session-os/issues/94",
        repository_url: "https://api.github.com/repos/aires/cooper-session-os"
      }
    ]
  });

  assert.equal(records.length, 3);
  assert.deepEqual(
    filterContextRecords(records, {
      query: "resumable",
      type: "branch",
      repository: "aires/cooper-session-os"
    }).map((record) => record.title),
    ["feature/resumable-context"]
  );
  assert.equal(records.find((record) => record.type === "pull_request")?.repository, "aires/aires-crm");
  assert.equal(records.find((record) => record.type === "issue")?.repository, "aires/cooper-session-os");
});

test("selected sources are bounded to safe metadata and preserve direct pasted context", () => {
  const remote = normalizeSelectedContextSource({
    provider: "github",
    id: "gh-842",
    title: "PR #842 · First-touch event model",
    type: "pull_request",
    repository: "aires/aires-crm",
    url: "https://github.com/aires/aires-crm/pull/842",
    content: "client content must not be trusted"
  });
  const pasted = normalizeSelectedContextSource({
    provider: "paste",
    id: "paste-1",
    title: "Leadership context",
    type: "note",
    content: "Keep the first release read-only."
  });

  assert.equal(remote.content, "");
  assert.equal(remote.repository, "aires/aires-crm");
  assert.equal(pasted.content, "Keep the first release read-only.");
});

test("builds a deduplicated, bounded context packet for the Realtime session", () => {
  const packet = buildContextPacket({
    id: "packet-1",
    meeting: {
      id: "meeting-1",
      title: "Rep velocity sprint review",
      time: "09:30",
      location: "Zoom"
    },
    intent: "Decide the first-touch logging scope.",
    sources: [
      {
        provider: "notion",
        id: "page-1",
        title: "Rep velocity thesis",
        type: "page",
        content: "The rep should get the highest impact in the least time.",
        updatedAt: "2026-07-12T18:00:00.000Z"
      },
      {
        provider: "notion",
        id: "page-1",
        title: "Rep velocity thesis duplicate",
        type: "page",
        content: "duplicate"
      },
      {
        provider: "github",
        id: "pr-842",
        title: "PR #842",
        type: "pull_request",
        repository: "aires/aires-crm",
        content: "Adds first-touch event persistence and tests."
      }
    ]
  }, { maxChars: 1800 });

  assert.equal(packet.sourceCount, 2);
  assert.match(packet.context, /# Cooper Session Context Packet/);
  assert.match(packet.context, /Rep velocity sprint review/);
  assert.match(packet.context, /Decide the first-touch logging scope/);
  assert.match(packet.context, /Adds first-touch event persistence and tests/);
  assert.ok(packet.context.length <= 1800);
});
