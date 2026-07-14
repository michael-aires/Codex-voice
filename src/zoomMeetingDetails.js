export function zoomMeetingDetailsFromItem(item = {}) {
  const source = item || {};
  const conference = source.conference || source.zoom || {};
  const providerText = [
    conference.provider,
    conference.type,
    conference.name,
    source.location,
    source.description
  ].filter(Boolean).join(" ");
  const joinUrl = conference.joinUrl || conference.url || findZoomJoinUrl([source.location, source.description, conference.notes].join(" "));
  const meetingNumber = conference.meetingNumber || extractZoomMeetingNumber(joinUrl) || "";
  const password = conference.password || conference.passcode || extractZoomPassword(joinUrl) || "";
  const isZoom = /zoom/i.test(providerText) || /zoom\.us/i.test(joinUrl) || Boolean(meetingNumber && /zoom/i.test(conference.source || ""));

  return {
    isZoom,
    source: conference.source || (joinUrl ? "calendar" : ""),
    joinUrl,
    meetingNumber,
    password,
    provider: isZoom ? "zoom" : ""
  };
}

export function findZoomJoinUrl(value = "") {
  const match = String(value || "").match(/https?:\/\/[^\s<>"']*zoom\.us\/j\/[^\s<>"']+/i);
  return match?.[0] || "";
}

export function extractZoomMeetingNumber(value = "") {
  const match = String(value || "").match(/zoom\.us\/j\/(\d+)/i);
  return match?.[1] || "";
}

export function extractZoomPassword(value = "") {
  try {
    const url = new URL(findZoomJoinUrl(value) || value);
    return url.searchParams.get("pwd") || "";
  } catch {
    return "";
  }
}
