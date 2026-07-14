import test from "node:test";
import assert from "node:assert/strict";
import {
  generateZoomMeetingSdkSignature,
  normalizeZoomMeetingNumber
} from "../server/zoomMeetingSdk.js";

function decodeJwtPayload(jwt) {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

test("normalizes common Zoom meeting number formats", () => {
  assert.equal(normalizeZoomMeetingNumber("123 456 7890"), "1234567890");
  assert.equal(normalizeZoomMeetingNumber("123-456-7890"), "1234567890");
  assert.equal(normalizeZoomMeetingNumber("abc"), "");
  assert.equal(normalizeZoomMeetingNumber("123"), "");
});

test("generates a Zoom Meeting SDK JWT with stable claims", () => {
  const signature = generateZoomMeetingSdkSignature({
    meetingNumber: "123 456 7890",
    role: 0,
    sdkKey: "zoom-client-id",
    sdkSecret: "zoom-client-secret",
    now: Date.UTC(2026, 6, 7, 20, 0, 0)
  });

  const parts = signature.split(".");
  assert.equal(parts.length, 3);

  const payload = decodeJwtPayload(signature);
  assert.equal(payload.appKey, "zoom-client-id");
  assert.equal(payload.sdkKey, "zoom-client-id");
  assert.equal(payload.mn, "1234567890");
  assert.equal(payload.role, 0);
  assert.equal(payload.exp, payload.tokenExp);
  assert.equal(payload.exp - payload.iat, 7200);
});
