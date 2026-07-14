import assert from "node:assert/strict";
import test from "node:test";
import {
  cooperRouteFromOpenPath,
  enqueueMobilePushEvents,
  mobilePushConfigFromEnv,
  mobilePushEvents,
  mobilePushPayload,
  mobilePushSnapshot,
  normalizeDeviceToken,
  registerMobilePushDevice,
  unregisterMobilePushDevice
} from "../server/mobilePush.js";

const token = "ab".repeat(32);

test("mobile push registration replaces rotated tokens by installation", () => {
  assert.equal(normalizeDeviceToken(`<${token.match(/.{1,8}/g).join(" ")}>`), token);
  const first = registerMobilePushDevice([], {
    token,
    installationId: "installation-1",
    environment: "sandbox",
    bundleId: "ai.aires.cooper.mobile",
    deviceName: "Michael's iPhone"
  }, "2026-07-14T18:00:00Z");
  assert.equal(first.devices.length, 1);
  assert.equal(first.device.tokenHash.length, 24);

  const rotated = registerMobilePushDevice(first.devices, {
    token: "cd".repeat(32),
    installationId: "installation-1",
    environment: "sandbox"
  }, "2026-07-14T19:00:00Z");
  assert.equal(rotated.devices.length, 1);
  assert.equal(rotated.device.token, "cd".repeat(32));
  assert.equal(rotated.device.createdAt, "2026-07-14T18:00:00Z");

  const removed = unregisterMobilePushDevice(rotated.devices, { installationId: "installation-1" });
  assert.equal(removed.removed, 1);
  assert.deepEqual(removed.devices, []);
});

test("mobile push transitions produce exact routes once", () => {
  const beforeDb = {
    operatorTasks: [{ id: "task-1", title: "Inspect dashboard", status: "running", approvals: [] }],
    jobs: [{ id: "job-1", title: "Delivery brief", status: "running" }],
    artifacts: []
  };
  const afterDb = {
    operatorTasks: [{
      id: "task-1",
      title: "Inspect dashboard",
      status: "waiting_approval",
      approvals: [{ id: "approval-1", title: "Open browser", status: "pending" }]
    }],
    jobs: [{ id: "job-1", title: "Delivery brief", status: "completed" }],
    artifacts: [{ id: "artifact-1", jobId: "job-1" }]
  };
  const events = mobilePushEvents(mobilePushSnapshot(beforeDb), afterDb, "2026-07-14T18:00:00Z");
  assert.equal(events.length, 2);
  assert.equal(events[0].route, "cooper://operator/tasks/task-1?approval=approval-1");
  assert.equal(events[1].route, "cooper://library/artifacts/artifact-1");
  assert.deepEqual(mobilePushEvents(mobilePushSnapshot(afterDb), afterDb), []);
  assert.equal(enqueueMobilePushEvents(events, events).length, 2);
});

test("remote payload keeps routing outside aps and below the APNs limit", () => {
  const event = mobilePushEvents(mobilePushSnapshot({ jobs: [{ id: "j", status: "running" }] }), {
    jobs: [{ id: "j", title: "Brief", status: "failed" }],
    artifacts: []
  })[0];
  const payload = mobilePushPayload(event);
  assert.equal(payload.aps["content-available"], 1);
  assert.equal(payload.aps.alert.title, "Cooper generation needs attention");
  assert.equal(payload.cooperRoute, "cooper://library");
  assert.equal(payload.aps.cooperRoute, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 4096);
});

test("APNs configuration is explicit and defaults to sandbox", () => {
  const missing = mobilePushConfigFromEnv({});
  assert.equal(missing.configured, false);
  assert.equal(missing.environment, "sandbox");
  assert.match(missing.endpoint, /development/);

  const configured = mobilePushConfigFromEnv({
    COOPER_APNS_KEY_ID: "KEY1234567",
    COOPER_APNS_TEAM_ID: "TEAM123456",
    COOPER_APNS_PRIVATE_KEY: "private-key",
    COOPER_APNS_ENVIRONMENT: "production"
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.environment, "production");
  assert.equal(configured.endpoint, "https://api.push.apple.com");
});

test("HTTPS fallback paths map to the same typed Cooper destinations", () => {
  assert.equal(
    cooperRouteFromOpenPath("/open/operator/tasks/operator-1", "approval-1"),
    "cooper://operator/tasks/operator-1?approval=approval-1"
  );
  assert.equal(
    cooperRouteFromOpenPath("/open/library/artifacts/artifact%201"),
    "cooper://library/artifacts/artifact%201"
  );
  assert.equal(cooperRouteFromOpenPath("/open/unknown/path"), "cooper://today");
});
