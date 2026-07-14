import { createHmac } from "node:crypto";

export function normalizeZoomMeetingNumber(value) {
  const digits = String(value || "").trim().replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

export function generateZoomMeetingSdkSignature({ meetingNumber, role = 0, sdkKey, sdkSecret, now = Date.now() }) {
  if (!sdkKey || !sdkSecret) {
    throw new Error("Zoom SDK key and secret are required.");
  }

  const normalizedMeetingNumber = normalizeZoomMeetingNumber(meetingNumber);
  if (!normalizedMeetingNumber) {
    throw new Error("A valid Zoom meeting number is required.");
  }

  const safeRole = Number(role) === 1 ? 1 : 0;
  const iat = Math.round(now / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    appKey: sdkKey,
    sdkKey,
    mn: normalizedMeetingNumber,
    role: safeRole,
    iat,
    exp,
    tokenExp: exp
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", sdkSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
