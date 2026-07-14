const completedTaskStatuses = new Set([
  "done",
  "completed",
  "complete",
  "cancelled",
  "canceled",
  "archived",
  "closed"
]);

const activeTaskStatusOrder = new Map([
  ["in progress", 0],
  ["qa", 1],
  ["ready for customer", 2],
  ["ready for review", 3],
  ["not started", 4],
  ["to do", 5]
]);

export function arcadeOutputValue(response) {
  return response?.output?.value ?? response?.output ?? response ?? null;
}

export function notionPropertyValue(properties, names) {
  const requestedNames = Array.isArray(names) ? names : [names];
  const property = requestedNames
    .map((name) => properties?.[name])
    .find(Boolean);
  if (!property) return null;

  const value = property[property.type];
  switch (property.type) {
    case "title":
    case "rich_text":
      return richTextValue(value);
    case "status":
    case "select":
      return value?.name || "";
    case "multi_select":
      return Array.isArray(value) ? value.map((item) => item?.name).filter(Boolean) : [];
    case "relation":
      return Array.isArray(value) ? value.map((item) => item?.id).filter(Boolean) : [];
    case "people":
      return Array.isArray(value)
        ? value.map((person) => person?.name || person?.person?.email || person?.id).filter(Boolean)
        : [];
    case "date":
      return value ? { start: value.start || "", end: value.end || "" } : null;
    case "unique_id":
      return value ? [value.prefix, value.number].filter((part) => part !== null && part !== undefined && part !== "").join("-") : "";
    case "rollup":
      return value?.number ?? value?.array ?? null;
    default:
      return value ?? null;
  }
}

export function normalizeNotionSprintMetadata(metadata) {
  const properties = metadata?.properties || {};
  const status = notionPropertyValue(properties, ["Sprint status", "Status"]) || "";
  return {
    id: metadata?.id || "",
    title: notionPropertyValue(properties, ["Sprint name", "Name", "Title"]) || "Active sprint",
    status,
    current: status.toLowerCase() === "current",
    taskIds: notionPropertyValue(properties, ["Tasks", "Sprint tasks"]) || [],
    dates: notionPropertyValue(properties, ["Dates", "Date"]),
    url: metadata?.url || ""
  };
}

export function normalizeNotionTaskMetadata(metadata, {
  databaseId = "",
  activeSprintId = "",
  sprintTitle = "Active sprint",
  includeCompleted = false
} = {}) {
  if (!metadata?.id) return null;
  const parentDatabaseId = metadata?.parent?.database_id || "";
  if (databaseId && parentDatabaseId && parentDatabaseId !== databaseId) return null;

  const properties = metadata.properties || {};
  const sprintIds = notionPropertyValue(properties, ["Sprint", "Sprints"]) || [];
  if (activeSprintId && sprintIds.length && !sprintIds.includes(activeSprintId)) return null;

  const title = notionPropertyValue(properties, ["Task name", "Name", "Title"]) || metadata.title || "Untitled sprint task";
  const status = notionPropertyValue(properties, ["Status", "Backlog Status"]) || "Not started";
  if (!includeCompleted && completedTaskStatuses.has(status.toLowerCase())) return null;

  const taskId = notionPropertyValue(properties, ["Task ID", "ID"]) || "";
  const customer = notionPropertyValue(properties, ["Customer", "Account"]) || "";
  const workstream = notionPropertyValue(properties, ["Workstream", "Project", "Category"]) || "";
  const summary = notionPropertyValue(properties, ["Summary", "Notes", "Description"]) || "";
  const assignees = notionPropertyValue(properties, ["Assignee", "Assign", "Owner"]) || [];
  const namedAssignees = assignees.filter((assignee) => !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(assignee));
  const priority = notionPropertyValue(properties, ["Priority"]) || "";
  const dueDate = notionPropertyValue(properties, ["Due date", "Due Date", "Due", "Deadline", "Target date"]);
  const subtitle = [taskId, customer || workstream].filter(Boolean).join(" · ") || sprintTitle;
  const points = [
    status ? `Current board status: ${status}` : "",
    customer ? `Customer: ${customer}` : "",
    namedAssignees.length ? `Assigned to ${namedAssignees.join(", ")}` : ""
  ].filter(Boolean);

  return {
    id: `notion-${metadata.id}`,
    targetId: metadata.id,
    type: "task",
    title,
    subtitle,
    source: `notion · ${sprintTitle}`,
    sourceLabel: sprintTitle,
    eyebrow: [taskId, customer || workstream || sprintTitle].filter(Boolean).join(" · "),
    status,
    priority: /in progress|qa|ready/i.test(status) ? "active" : "",
    description: summary || `Sprint Board task in ${sprintTitle}. Open Notion for the full task context.`,
    points,
    docs: [taskId, sprintTitle].filter(Boolean),
    url: metadata.url || "",
    actionLabel: "Work with Cooper",
    actionNote: "Cooper will load this Notion task as the primary session context before the conversation starts.",
    callIntro: `I have ${title} and its current sprint context loaded.`,
    prompt: `Cooper, help me work through ${title}.`,
    metadata: {
      sprintId: activeSprintId,
      taskId,
      customer,
      workstream,
      assignees,
      priority,
      dueDate: dueDate?.start || "",
      dueDateEnd: dueDate?.end || "",
      updatedAt: metadata.last_edited_time || metadata.updatedAt || ""
    }
  };
}

export function sortNotionTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const leftRank = activeTaskStatusOrder.get(String(left.status || "").toLowerCase()) ?? 99;
    const rightRank = activeTaskStatusOrder.get(String(right.status || "").toLowerCase()) ?? 99;
    return leftRank - rightRank || left.title.localeCompare(right.title);
  });
}

export function normalizeCalendarEvents(payload, { now = new Date(), timeZone = "UTC" } = {}) {
  const events = Array.isArray(payload?.events)
    ? payload.events
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  const normalized = events
    .filter((event) => event?.status !== "cancelled")
    .map((event) => normalizeCalendarEvent(event, { timeZone }))
    .filter(Boolean)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const nextEvent = normalized.find((event) => new Date(event.endsAt || event.startsAt).getTime() >= now.getTime());
  return normalized.map((event) => ({
    ...event,
    status: event.id === nextEvent?.id ? "next" : ""
  }));
}

export function normalizeLocalProjects(projects = []) {
  return [...projects]
    .filter((project) => String(project?.status || "active").toLowerCase() !== "archived")
    .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
    .map((project) => ({
      id: `project-${project.id}`,
      targetId: project.id,
      type: "project",
      title: project.title || "Untitled project",
      subtitle: project.status || "active",
      source: "Cooper projects",
      sourceLabel: "Projects",
      eyebrow: "Project workspace",
      status: project.status || "active",
      priority: project.status === "active" ? "active" : "",
      description: conciseText(project.description, 520) || "Open this project with Cooper and continue from its saved context.",
      points: [
        project.sourceCount ? `${project.sourceCount} saved context source${project.sourceCount === 1 ? "" : "s"}` : "Saved project context",
        "Available to new and resumed sessions"
      ],
      docs: [],
      actionLabel: "Open with Cooper",
      actionNote: "Cooper will load the project context into a new session.",
      callIntro: `I have the ${project.title || "project"} context loaded.`,
      prompt: `Cooper, help me continue ${project.title || "this project"}.`,
      updatedAt: project.updatedAt || project.createdAt || ""
    }));
}

export function normalizePastSessions(calls = [], { limit = 8, timeZone = "UTC" } = {}) {
  return [...calls]
    .filter((call) => call?.status === "ended")
    .sort((left, right) => String(right.endedAt || right.startedAt || "").localeCompare(String(left.endedAt || left.startedAt || "")))
    .slice(0, limit)
    .map((call) => {
      const startedAt = call.startedAt || call.createdAt || "";
      const transcriptCount = Array.isArray(call.transcript) ? call.transcript.length : Number(call.transcriptCount || 0);
      return {
        id: `session-${call.id}`,
        targetId: call.id,
        type: "session",
        title: call.title || "Cooper session",
        subtitle: call.projectTitle || `${transcriptCount} transcript entr${transcriptCount === 1 ? "y" : "ies"}`,
        source: "Cooper sessions",
        sourceLabel: "Past sessions",
        eyebrow: formatDateTime(startedAt, timeZone),
        status: "Ended",
        description: call.summary || "Resume this saved conversation with its transcript, decisions, artifacts, and project context.",
        points: [
          `${transcriptCount} transcript entr${transcriptCount === 1 ? "y" : "ies"}`,
          call.projectTitle ? `Project: ${call.projectTitle}` : "No project attached"
        ],
        docs: [],
        actionLabel: "Resume with Cooper",
        actionNote: "Cooper will prepare a continuation packet from this saved session.",
        callIntro: `Continuing ${call.title || "the saved session"}.`,
        prompt: "Cooper, pick up where we left off.",
        startedAt,
        endedAt: call.endedAt || ""
      };
    });
}

export function zonedDayBounds(now = new Date(), timeZone = "UTC") {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const date = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const nextDateValue = new Date(Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day) + 1));
  const nextDate = nextDateValue.toISOString().slice(0, 10);
  return {
    date,
    start: `${date}T00:00:00${timeZoneOffset(date, timeZone)}`,
    end: `${nextDate}T00:00:00${timeZoneOffset(nextDate, timeZone)}`
  };
}

function normalizeCalendarEvent(event, { timeZone }) {
  const startsAt = event?.start?.dateTime || event?.start?.date || "";
  const endsAt = event?.end?.dateTime || event?.end?.date || startsAt;
  if (!startsAt) return null;
  const allDay = Boolean(event?.start?.date && !event?.start?.dateTime);
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const organizer = event?.organizer?.displayName || event?.organizer?.email || event?.creator?.displayName || event?.creator?.email || "Calendar";
  const attendeeCount = attendees.filter((attendee) => !attendee?.self).length;
  const meetingUrl = findMeetingUrl(event);
  const isZoom = /zoom\.us/i.test(meetingUrl);
  const title = event.summary || "Untitled meeting";
  const description = stripHtml(event.description || "") || (event.location ? `Location: ${event.location}` : "Calendar meeting ready to open with Cooper.");

  return {
    id: `calendar-${event.id || startsAt}-${title}`,
    targetId: event.id || "",
    type: "meeting",
    time: allDay ? "All day" : formatTime(startsAt, timeZone),
    duration: allDay ? "All day" : formatDuration(startsAt, endsAt),
    startsAt,
    endsAt,
    title,
    subtitle: attendeeCount ? `${organizer} · +${attendeeCount}` : organizer,
    source: "Google Calendar",
    sourceLabel: "Google Calendar",
    eyebrow: formatDateTime(startsAt, timeZone),
    description: conciseText(description, 720),
    points: [
      event.location ? `Location: ${event.location}` : "",
      attendeeCount ? `${attendeeCount} other attendee${attendeeCount === 1 ? "" : "s"}` : "",
      meetingUrl ? "Conference link available" : ""
    ].filter(Boolean),
    docs: [],
    url: event.htmlLink || meetingUrl || "",
    conference: {
      provider: isZoom ? "zoom" : meetingUrl ? "web" : "",
      source: "calendar",
      joinUrl: meetingUrl,
      meetingNumber: zoomMeetingNumber(meetingUrl),
      password: ""
    },
    actionLabel: meetingUrl ? "Join with Cooper" : "Open with Cooper",
    actionNote: "Cooper will start with this calendar event and any context you attach at the session checkpoint.",
    callIntro: `Ready for ${title}.`,
    prompt: `Cooper, join ${title}.`
  };
}

function findMeetingUrl(event) {
  const direct = event?.hangoutLink || event?.conferenceData?.entryPoints?.find((entry) => entry?.entryPointType === "video")?.uri || "";
  if (direct) return direct;
  const text = `${event?.location || ""}\n${event?.description || ""}`;
  return text.match(/https?:\/\/[^\s<>"']+(?:zoom\.us|meet\.google\.com)[^\s<>"']*/i)?.[0]
    || text.match(/https?:\/\/[^\s<>"']+/i)?.[0]
    || "";
}

function zoomMeetingNumber(url) {
  if (!/zoom\.us/i.test(url)) return "";
  return url.match(/\/j\/(\d+)/)?.[1] || url.match(/\/wc\/(\d+)/)?.[1] || "";
}

function richTextValue(items) {
  if (!Array.isArray(items)) return "";
  return items.map((item) => item?.plain_text || item?.text?.content || "").join("");
}

function formatTime(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateTime(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDuration(start, end) {
  const durationMinutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return "";
  if (durationMinutes < 60) return `${durationMinutes} min`;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function timeZoneOffset(date, timeZone) {
  const probe = new Date(`${date}T12:00:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset"
  }).formatToParts(probe).find((part) => part.type === "timeZoneName")?.value || "GMT+00:00";
  const match = offsetName.match(/GMT([+-]\d{2}:\d{2})/);
  return match?.[1] || "+00:00";
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function conciseText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}
