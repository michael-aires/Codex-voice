import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [prototype, serverSource] = await Promise.all([
  readFile(new URL("../docs/cooper-chat-micro-ui-prototype.html", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8")
]);

test("chat micro UI prototype has a stable localhost route", () => {
  assert.match(serverSource, /app\.get\("\/prototypes\/chat-micro-ui"/);
  assert.match(serverSource, /cooper-chat-micro-ui-prototype\.html/);
});

test("chat prototype keeps canvas work and decisions inside the conversation", () => {
  assert.match(prototype, /What Cooper knows/);
  assert.match(prototype, /Background work/);
  assert.match(prototype, /Requirements artifact preview/);
  assert.match(prototype, /Decision request/);
  assert.match(prototype, /Message Cooper/);
});

test("chat prototype includes mobile, source-search, approval, and typed-turn interactions", () => {
  assert.match(prototype, /stage\.mobile/);
  assert.match(prototype, /Search Notion, GitHub, meetings/);
  assert.match(prototype, /data-approve/);
  assert.match(prototype, /id="composer"/);
  assert.match(prototype, /new URLSearchParams\(window\.location\.search\)/);
});
