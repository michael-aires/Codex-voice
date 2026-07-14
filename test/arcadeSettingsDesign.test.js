import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mainSource, serverSource, stylesSource] = await Promise.all([
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8")
]);

test("Arcade provider cards expose a real connection action", () => {
  assert.match(mainSource, /data-testid={`arcade-service-connect-/);
  assert.match(mainSource, /onConnectService\(service\.service\)/);
  assert.match(serverSource, /app\.post\("\/api\/tools\/arcade\/connect"/);
  assert.match(serverSource, /client\.auth\.authorize\(/);
});

test("Arcade authorization does not send an unregistered local next URI", () => {
  assert.doesNotMatch(serverSource, /next_uri/);
  assert.doesNotMatch(serverSource, /requestOrigin\(/);
});

test("Arcade authorization reserves its popup before awaiting the API", () => {
  const handler = mainSource.slice(
    mainSource.indexOf("async function runAuthorization"),
    mainSource.indexOf("async function runAuthorizeAll")
  );

  assert.ok(handler.indexOf("window.open") >= 0);
  assert.ok(handler.indexOf("window.open") < handler.indexOf("await startAuthorization"));
  assert.match(handler, /Your browser blocked the authorization tab/);
});

test("Arcade actions render visible progress, success, error, and fallback links", () => {
  assert.match(mainSource, /settings-action-notice/);
  assert.match(mainSource, /role={actionNotice\.tone === "error" \? "alert" : "status"}/);
  assert.match(mainSource, /settings-action-links/);
  assert.match(stylesSource, /\.settings-action-notice\.success/);
  assert.match(stylesSource, /\.settings-action-notice\.error/);
});
