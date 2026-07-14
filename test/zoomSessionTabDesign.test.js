import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = new URL("../src/main.jsx", import.meta.url);
const stylesPath = new URL("../src/styles.css", import.meta.url);

test("every Cooper session exposes the embedded Zoom tab", async () => {
  const [source, styles] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);

  assert.match(source, /const canvasToolTabs = \[\s*\["zoom", "Zoom"\]/);
  assert.match(source, /<ZoomMeetingPanel sessionFocus=\{sessionFocus\} zoomDetails=\{zoomDetails\} \/>/);
  assert.match(source, /Zoom is available in every Cooper session\./);
  assert.doesNotMatch(source, /hasZoomMeeting/);
  assert.match(styles, /\.call-canvas-tools\s*\{[\s\S]*?opacity:\s*1;/);
});
