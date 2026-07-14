import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [serviceWorker, html] = await Promise.all([
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

test("service worker ignores browser-extension and other non-web requests", () => {
  assert.match(serviceWorker, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
});

test("web shell declares the current installable mobile capability meta", () => {
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
});
