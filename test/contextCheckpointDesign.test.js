import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mainSource, componentSource, stylesSource, serverSource, overviewPrototypeSource, seedSource] = await Promise.all([
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/contextCheckpoint.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/session-os.css", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/cooper-session-context-overview-prototype.html", import.meta.url), "utf8"),
  readFile(new URL("../src/sessionContextSeed.js", import.meta.url), "utf8")
]);

test("all Cooper new-session entry points open the context checkpoint", () => {
  assert.match(mainSource, /function openContextCheckpoint/);
  assert.match(mainSource, /<SessionContextCheckpoint/);
  assert.match(mainSource, /onStartCall={openContextCheckpoint}/);
  assert.match(mainSource, /contextPacketId/);
});

test("the checkpoint exposes provider search, multi-select, upload, and paste controls", () => {
  assert.match(componentSource, /Search pages, tickets, and databases/);
  assert.match(componentSource, /Search pull requests, branches, and issues/);
  assert.match(componentSource, /All repositories/);
  assert.match(componentSource, /type="checkbox"/);
  assert.match(componentSource, /type="file"/);
  assert.match(componentSource, /Add selected/);
  assert.match(componentSource, /Start session/);
  assert.match(componentSource, /All databases/);
  assert.match(componentSource, /All pages/);
  assert.match(componentSource, /NOTION_ALL_PAGES/);
  assert.match(componentSource, /onOpenNotionDatabase/);
  assert.match(componentSource, /Browse/);
  assert.match(componentSource, /event\.key !== "Enter"/);
});

test("the Notion picker loads databases without requiring a search term", () => {
  assert.match(componentSource, /nextProvider === "meeting" \|\| nextProvider === "notion"/);
  assert.match(serverSource, /provider !== "notion"/);
  assert.match(serverSource, /databaseId: extractNotionId/);
  assert.match(stylesSource, /\.context-result-copy \{\s*min-width: 0;/);
});

test("the Notion picker can list every page or drill into one database", () => {
  assert.match(componentSource, /limit: providerOverride === "notion" \? "-1" : "50"/);
  assert.match(componentSource, /databaseId !== NOTION_ALL_PAGES/);
  assert.match(componentSource, /Search all pages/);
  assert.match(serverSource, /requestedLimit === -1/);
  assert.match(serverSource, /page_size: options\.limit/);
});

test("context search and packet endpoints are server-backed and persisted", () => {
  assert.match(serverSource, /app\.get\("\/api\/context-sources\/search"/);
  assert.match(serverSource, /app\.post\("\/api\/context-packets"/);
  assert.match(serverSource, /app\.post\("\/api\/context-packets\/:id\/uploads"/);
  assert.match(serverSource, /contextPackets/);
});

test("the initial Realtime call receives the persisted context packet", () => {
  assert.match(serverSource, /contextPacketsForCall\(db, call\)/);
  assert.match(serverSource, /boundedContextPacketContext\(/);
  assert.match(serverSource, /composeRealtimeSessionContext\([\s\S]*projectContext,[\s\S]*resumeContext,[\s\S]*contextPacketContext/);
  assert.match(componentSource, /unresolvedSources/);
});

test("the production checkpoint keeps the approved minimal responsive design", () => {
  assert.match(stylesSource, /\.context-checkpoint-backdrop/);
  assert.match(stylesSource, /\.context-provider-dialog/);
  assert.match(stylesSource, /@media \(max-width: 700px\)/);
  assert.doesNotMatch(stylesSource, /context-checkpoint[^}]*gradient/s);
});

test("a task or project launched from Today remains the primary session context", () => {
  assert.match(componentSource, /seedMeeting\?\.id && !meetings\.some/);
  assert.match(componentSource, /return \[freshSession, \.\.\.seededItem, \.\.\.meetings\]/);
});

test("a Notion sprint task is preselected and deeply resolved as the locked primary source", () => {
  assert.match(componentSource, /setSources\(contextSourcesFromSessionSeed\(seedMeeting\)\)/);
  assert.match(componentSource, /Primary ticket/);
  assert.match(seedSource, /seed\.type !== "task"/);
  assert.match(seedSource, /provider: "notion"/);
  assert.match(seedSource, /Full page \+ properties/);
  assert.match(serverSource, /formatNotionResolvedContext\(execution\.value, source\)/);
});

test("the prepared-session overview prototype has a launchable localhost route", () => {
  assert.match(serverSource, /app\.get\("\/prototypes\/session-context-overview"/);
  assert.match(overviewPrototypeSource, /Create and prepare session/);
  assert.match(overviewPrototypeSource, /What Cooper knows/);
  assert.match(overviewPrototypeSource, /Ready to review/);
});
