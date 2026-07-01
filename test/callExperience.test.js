import test from "node:test";
import assert from "node:assert/strict";
import {
  callModeLabel,
  callPromptPlaceholder,
  canvasStateLabel,
  wakeHint
} from "../src/callExperience.js";

test("callModeLabel prioritizes speaking, hearing, joining, then standby", () => {
  assert.equal(callModeLabel({ speaking: true, hearing: true, connected: true }), "Speaking");
  assert.equal(callModeLabel({ hearing: true, connected: true }), "Listening");
  assert.equal(callModeLabel({ connecting: true }), "Joining");
  assert.equal(callModeLabel({ connected: true }), "Standing by");
  assert.equal(callModeLabel(), "Ready");
});

test("wake hint makes Cooper the simple wake word when connected", () => {
  assert.deepEqual(wakeHint(true), {
    label: "Wake word",
    value: "Cooper",
    detail: "Typed asks speak back"
  });
  assert.equal(callPromptPlaceholder(true), "Cooper, what do you think?");
});

test("canvasStateLabel surfaces active work while the call continues", () => {
  assert.equal(canvasStateLabel({ connected: false, activeJobCount: 4 }), "Idle");
  assert.equal(canvasStateLabel({ connected: true, activeJobCount: 0 }), "Live");
  assert.equal(canvasStateLabel({ connected: true, activeJobCount: 1 }), "1 active");
  assert.equal(canvasStateLabel({ connected: true, activeJobCount: 3 }), "3 active");
});
