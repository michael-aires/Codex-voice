import { createHash, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connect } from "node:http2";

const APNS_SANDBOX = "https://api.development.push.apple.com";
const APNS_PRODUCTION = "https://api.push.apple.com";
const tokenCache = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function compact(value, max = 180) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex").slice(0, 24);
}

export function normalizeDeviceToken(value) {
  const token = clean(value).replace(/[<>\s]/g, "").toLowerCase();
  return /^[a-f0-9]{32,256}$/.test(token) ? token : "";
}

export function mobilePushConfigFromEnv(env = process.env) {
  const keyId = clean(env.COOPER_APNS_KEY_ID);
  const teamId = clean(env.COOPER_APNS_TEAM_ID);
  const bundleId = clean(env.COOPER_APNS_BUNDLE_ID) || "ai.aires.cooper.mobile";
  const privateKey = clean(env.COOPER_APNS_PRIVATE_KEY).replace(/\\n/g, "\n");
  const privateKeyPath = clean(env.COOPER_APNS_PRIVATE_KEY_PATH);
  const environment = clean(env.COOPER_APNS_ENVIRONMENT).toLowerCase() === "production"
    ? "production"
    : "sandbox";
  const missing = [
    !keyId && "COOPER_APNS_KEY_ID",
    !teamId && "COOPER_APNS_TEAM_ID",
    !(privateKey || privateKeyPath) && "COOPER_APNS_PRIVATE_KEY or COOPER_APNS_PRIVATE_KEY_PATH"
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    missing,
    keyId,
    teamId,
    bundleId,
    privateKey,
    privateKeyPath,
    environment,
    endpoint: environment === "production" ? APNS_PRODUCTION : APNS_SANDBOX
  };
}

export function registerMobilePushDevice(devices = [], input = {}, now = new Date().toISOString()) {
  const token = normalizeDeviceToken(input.token);
  if (!token) return { error: "Enter a valid APNs device token." };
  const installationId = compact(input.installationId, 120);
  if (!installationId) return { error: "A stable installation identifier is required." };
  const environment = clean(input.environment).toLowerCase() === "production" ? "production" : "sandbox";
  const existing = (Array.isArray(devices) ? devices : []).find((device) =>
    device.installationId === installationId || device.token === token
  );
  const device = {
    id: existing?.id || `ios-${tokenHash(token)}`,
    installationId,
    token,
    tokenHash: tokenHash(token),
    platform: "ios",
    environment,
    bundleId: compact(input.bundleId, 160) || "ai.aires.cooper.mobile",
    deviceName: compact(input.deviceName, 120) || "iPhone",
    locale: compact(input.locale, 32),
    enabled: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSeenAt: now,
    lastDeliveryAt: existing?.lastDeliveryAt || null,
    lastError: ""
  };
  return {
    device,
    devices: [
      ...(Array.isArray(devices) ? devices : []).filter((candidate) =>
        candidate.id !== device.id
          && candidate.installationId !== installationId
          && candidate.token !== token
      ),
      device
    ]
  };
}

export function unregisterMobilePushDevice(devices = [], input = {}) {
  const token = normalizeDeviceToken(input.token);
  const installationId = compact(input.installationId, 120);
  const current = Array.isArray(devices) ? devices : [];
  const devicesNext = current.filter((device) =>
    !(token && device.token === token) && !(installationId && device.installationId === installationId)
  );
  return { devices: devicesNext, removed: current.length - devicesNext.length };
}

export function mobilePushSnapshot(db = {}) {
  return {
    tasks: new Map((db.operatorTasks || []).map((task) => [task.id, {
      status: task.status,
      approvalIds: new Set((task.approvals || []).filter((approval) => approval.status === "pending").map((approval) => approval.id))
    }])),
    jobs: new Map((db.jobs || []).map((job) => [job.id, { status: job.status }]))
  };
}

export function mobilePushEvents(before, db = {}, now = new Date().toISOString()) {
  const events = [];
  const artifactByJob = new Map((db.artifacts || []).map((artifact) => [artifact.jobId, artifact]));

  for (const task of db.operatorTasks || []) {
    const previous = before?.tasks?.get(task.id);
    const previousApprovalIds = previous?.approvalIds || new Set();
    for (const approval of (task.approvals || []).filter((item) => item.status === "pending")) {
      if (previousApprovalIds.has(approval.id)) continue;
      events.push(createPushEvent({
        id: `operator-approval-${approval.id}`,
        kind: "operator_approval",
        title: "Operator approval required",
        body: `${compact(task.title, 90) || "Operator task"} is paused: ${compact(approval.title, 90) || "Approval required"}`,
        route: operatorRoute(task.id, approval.id),
        threadId: "operator",
        now
      }));
    }

    if (previous?.status === task.status) continue;
    if (task.status === "completed") {
      events.push(createPushEvent({
        id: `operator-completed-${task.id}`,
        kind: "operator_completed",
        title: "Operator task completed",
        body: compact(task.title, 180) || "Cooper completed an Operator task.",
        route: operatorRoute(task.id),
        threadId: "operator",
        now
      }));
    } else if (task.status === "failed") {
      events.push(createPushEvent({
        id: `operator-failed-${task.id}`,
        kind: "operator_failed",
        title: "Operator task needs attention",
        body: compact(task.title, 180) || "A Cooper Operator task needs attention.",
        route: operatorRoute(task.id),
        threadId: "operator",
        now
      }));
    }
  }

  for (const job of db.jobs || []) {
    const previous = before?.jobs?.get(job.id);
    if (previous?.status === job.status) continue;
    if (job.status === "completed") {
      const artifact = artifactByJob.get(job.id);
      events.push(createPushEvent({
        id: `artifact-completed-${job.id}`,
        kind: "artifact_completed",
        title: "Cooper artifact ready",
        body: compact(job.title, 180) || "Generated work is ready.",
        route: artifact?.id
          ? `cooper://library/artifacts/${encodeURIComponent(artifact.id)}`
          : "cooper://library",
        threadId: "artifacts",
        now
      }));
    } else if (job.status === "failed") {
      events.push(createPushEvent({
        id: `artifact-failed-${job.id}`,
        kind: "artifact_failed",
        title: "Cooper generation needs attention",
        body: compact(job.title, 180) || "Generated work needs attention.",
        route: "cooper://library",
        threadId: "artifacts",
        now
      }));
    }
  }

  return events;
}

export function enqueueMobilePushEvents(events = [], pending = []) {
  const known = new Set((pending || []).map((event) => event.id));
  return [
    ...(pending || []),
    ...events.filter((event) => event?.id && !known.has(event.id))
  ].slice(-250);
}

export function mobilePushPayload(event) {
  return {
    aps: {
      alert: { title: event.title, body: event.body },
      sound: "default",
      "thread-id": event.threadId || "cooper",
      "content-available": 1
    },
    cooperRoute: event.route,
    cooperEventId: event.id,
    cooperEventKind: event.kind
  };
}

export function cooperRouteFromOpenPath(path, approval = "") {
  const parts = String(path || "")
    .split("/")
    .filter(Boolean)
    .slice(1)
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    });
  const root = String(parts[0] || "").toLowerCase();
  if (!["today", "sessions", "projects", "operator", "library", "connections", "settings"].includes(root)) {
    return "cooper://today";
  }
  const route = `cooper://${[root, ...parts.slice(1)].join("/")}`;
  const approvalId = clean(approval);
  return root === "operator" && approvalId
    ? `${route}?approval=${encodeURIComponent(approvalId)}`
    : route;
}

export async function sendMobilePush({ device, event, config = mobilePushConfigFromEnv() }) {
  if (!config.configured) {
    return { ok: false, retryable: true, status: 0, reason: `APNs is not configured: ${config.missing.join(", ")}` };
  }
  if (device.environment !== config.environment) {
    return { ok: false, retryable: false, status: 0, reason: `Device is registered for ${device.environment}, but APNs is configured for ${config.environment}.` };
  }

  const privateKey = config.privateKey || await readFile(config.privateKeyPath, "utf8");
  const authorization = providerAuthorization({ ...config, privateKey });
  const payload = JSON.stringify(mobilePushPayload(event));
  const collapseId = compact(event.id, 64).replace(/[^A-Za-z0-9._-]/g, "-");

  return new Promise((resolve) => {
    let settled = false;
    const client = connect(config.endpoint);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };
    client.once("error", (error) => finish({ ok: false, retryable: true, status: 0, reason: error.message }));
    client.setTimeout(15_000, () => {
      finish({ ok: false, retryable: true, status: 0, reason: "APNs connection timed out." });
      client.destroy();
    });

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${device.token}`,
      authorization,
      "apns-topic": device.bundleId || config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": "0",
      "apns-collapse-id": collapseId
    });
    let status = 0;
    let body = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => { status = Number(headers[":status"] || 0); });
    request.on("data", (chunk) => { body += chunk; });
    request.once("error", (error) => finish({ ok: false, retryable: true, status, reason: error.message }));
    request.on("end", () => {
      const reason = parseApnsReason(body) || (status === 200 ? "Delivered to APNs." : `APNs returned ${status}.`);
      finish({
        ok: status === 200,
        retryable: status === 429 || status >= 500,
        status,
        reason,
        invalidateDevice: status === 410 || ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason)
      });
    });
    request.end(payload);
  });
}

function createPushEvent({ id, kind, title, body, route, threadId, now }) {
  return {
    id,
    kind,
    title,
    body,
    route,
    threadId,
    status: "pending",
    attempts: 0,
    deliveries: [],
    createdAt: now,
    updatedAt: now
  };
}

function operatorRoute(taskId, approvalId = "") {
  const route = `cooper://operator/tasks/${encodeURIComponent(taskId)}`;
  return approvalId ? `${route}?approval=${encodeURIComponent(approvalId)}` : route;
}

function providerAuthorization(config) {
  const bucket = Math.floor(Date.now() / (50 * 60 * 1000));
  const cacheKey = `${config.teamId}:${config.keyId}:${bucket}`;
  if (tokenCache.has(cacheKey)) return `bearer ${tokenCache.get(cacheKey)}`;
  tokenCache.clear();
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }));
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363"
  });
  const token = `${input}.${base64url(signature)}`;
  tokenCache.set(cacheKey, token);
  return `bearer ${token}`;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function parseApnsReason(body) {
  if (!body) return "";
  try {
    return clean(JSON.parse(body).reason);
  } catch {
    return compact(body, 180);
  }
}
