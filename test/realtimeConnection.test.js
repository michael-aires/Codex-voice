import assert from "node:assert/strict";
import test from "node:test";
import {
  isRetryableRealtimeError,
  REALTIME_RECONNECT_LIMIT,
  realtimeReconnectDelay,
  shouldReconnectRealtime
} from "../src/realtimeConnection.js";

test("Realtime reconnect delay uses bounded exponential backoff", () => {
  assert.equal(realtimeReconnectDelay(1), 750);
  assert.equal(realtimeReconnectDelay(2), 1500);
  assert.equal(realtimeReconnectDelay(3), 3000);
  assert.equal(realtimeReconnectDelay(99), 8000);
});

test("microphone permission failures remain actionable and are not retried", () => {
  const error = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  assert.equal(isRetryableRealtimeError(error), false);
  assert.equal(shouldReconnectRealtime({ attempt: 0, error }), false);
});

test("transient transport failures retry only within the bounded budget", () => {
  const error = new Error("Realtime data channel closed unexpectedly.");
  assert.equal(shouldReconnectRealtime({ attempt: 0, error }), true);
  assert.equal(shouldReconnectRealtime({ attempt: REALTIME_RECONNECT_LIMIT, error }), false);
  assert.equal(shouldReconnectRealtime({ manual: true, attempt: 0, error }), false);
});
