import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [prototype, specification, server] = await Promise.all([
  readFile(new URL("../docs/cooper-session-preparation-flow-prototype.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/19-session-preparation-current-and-target.md", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8")
]);

test("the session preparation prototype explains the current and target flows", () => {
  assert.match(prototype, /What happens today/);
  assert.match(prototype, /Let Cooper decide/);
  assert.match(prototype, /Choose documents/);
  assert.match(prototype, /Create and prepare session/);
  assert.match(prototype, /Enter session now/);
  assert.match(prototype, /Preparation continues in the background/);
  assert.match(prototype, /setScreen\("early"\)/);
  assert.match(prototype, /Cooper has the context, documents, and opening presentation/);
});

test("the preparation prototype simulates visible pipeline progress and readiness", () => {
  assert.match(prototype, /Resolve and verify sources/);
  assert.match(prototype, /Validate quality and lineage/);
  assert.match(prototype, /Assemble the presentation/);
  assert.match(prototype, /Load Cooper's session memory/);
  assert.match(prototype, /beginPreparation/);
  assert.match(prototype, /showReady/);
  assert.match(prototype, /prefers-reduced-motion/);
});

test("the current-state specification is source-grounded and names the readiness contract", () => {
  assert.match(specification, /Four preparation documents are selected by default/);
  assert.match(specification, /latest real run/i);
  assert.match(specification, /Let Cooper decide/);
  assert.match(specification, /Enter session now/);
  assert.match(specification, /Proposed state machine/);
  assert.match(specification, /Acceptance criteria/);
});

test("the prototype is available from the local Cooper server", () => {
  assert.match(server, /app\.get\("\/prototypes\/session-preparation-flow"/);
  assert.match(server, /cooper-session-preparation-flow-prototype\.html/);
});
