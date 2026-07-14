import test from "node:test";
import assert from "node:assert/strict";
import {
  extractZoomMeetingNumber,
  extractZoomPassword,
  findZoomJoinUrl,
  zoomMeetingDetailsFromItem
} from "../src/zoomMeetingDetails.js";

test("fresh calls without a meeting do not produce Zoom details", () => {
  assert.deepEqual(zoomMeetingDetailsFromItem(null), {
    isZoom: false,
    source: "",
    joinUrl: "",
    meetingNumber: "",
    password: "",
    provider: ""
  });
});

test("calendar Zoom links parse meeting number and passcode", () => {
  const url = "https://aires.zoom.us/j/1234567890?pwd=abc123";
  const details = zoomMeetingDetailsFromItem({
    type: "meeting",
    description: `Join here: ${url}`,
    conference: { provider: "Zoom", source: "calendar" }
  });

  assert.equal(findZoomJoinUrl(`Join here ${url}`), url);
  assert.equal(extractZoomMeetingNumber(url), "1234567890");
  assert.equal(extractZoomPassword(url), "abc123");
  assert.equal(details.isZoom, true);
  assert.equal(details.provider, "zoom");
  assert.equal(details.meetingNumber, "1234567890");
  assert.equal(details.password, "abc123");
});
