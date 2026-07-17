export const SESSION_NAV_ITEMS = Object.freeze([
  { id: "today", label: "Today", legacyView: "home" },
  { id: "sessions", label: "Sessions", legacyView: "library" },
  { id: "projects", label: "Projects", legacyView: "projects" },
  { id: "docs", label: "Docs", legacyView: "docs" },
  { id: "settings", label: "Settings", legacyView: "settings" }
]);

const DECISION_SIGNAL = /\b(decid(?:e|ed|ing)|agree(?:d)?|recommend(?:ed|ation)?|approve(?:d)?|commit(?:ted)?|the direction|we will|we should)\b/i;

export function sessionNavKey(view = "home") {
  if (view === "today-detail") return "today";
  return SESSION_NAV_ITEMS.find((item) => item.legacyView === view)?.id || "today";
}

export function legacyViewForSessionNav(id = "today") {
  return SESSION_NAV_ITEMS.find((item) => item.id === id)?.legacyView || "home";
}

export function deriveSessionMemory({
  transcripts = [],
  jobs = [],
  artifacts = [],
  sessionFocus = null
} = {}) {
  const safeTranscripts = Array.isArray(transcripts) ? transcripts.filter((entry) => entry?.text?.trim()) : [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeArtifacts = Array.isArray(artifacts) ? artifacts : [];
  const firstTurn = safeTranscripts[0] || null;
  const midpointTurn = safeTranscripts.length >= 3
    ? safeTranscripts[Math.max(1, Math.floor((safeTranscripts.length - 1) / 2))]
    : safeTranscripts[1] || null;
  const decisionTurn = [...safeTranscripts].reverse().find((entry) => DECISION_SIGNAL.test(entry.text))
    || [...safeTranscripts].reverse().find((entry) => normalizeSpeaker(entry.speaker) !== "Cooper")
    || safeTranscripts.at(-1)
    || null;
  const latestArtifact = newestByDate(safeArtifacts, "createdAt");
  const latestJob = newestByDate(safeJobs, "updatedAt") || newestByDate(safeJobs, "createdAt");

  const chapters = [
    {
      id: "brief",
      label: "Brief",
      time: chapterTime(firstTurn?.createdAt || sessionFocus?.start || sessionFocus?.time),
      title: sessionFocus?.title || "Session brief",
      summary: cleanSummary(sessionFocus?.description || sessionFocus?.prompt || firstTurn?.text, "The session is ready for context."),
      artifactId: "",
      complete: Boolean(sessionFocus || firstTurn)
    },
    {
      id: "debate",
      label: "Debate",
      time: chapterTime(midpointTurn?.createdAt),
      title: midpointTurn ? "Discussion and tradeoffs" : "Debate",
      summary: cleanSummary(midpointTurn?.text, "Tradeoffs will appear as the conversation develops."),
      artifactId: "",
      complete: Boolean(midpointTurn)
    },
    {
      id: "decision",
      label: "Decision",
      time: chapterTime(decisionTurn?.createdAt),
      title: decisionTurn ? "Latest decision signal" : "Decision",
      summary: cleanSummary(decisionTurn?.text, "Decisions will be captured from the public transcript."),
      artifactId: "",
      complete: Boolean(decisionTurn)
    },
    {
      id: "build",
      label: "Build",
      time: chapterTime(latestArtifact?.createdAt || latestJob?.updatedAt || latestJob?.createdAt),
      title: latestArtifact?.title || latestJob?.title || "Build",
      summary: cleanSummary(
        latestArtifact?.description || latestJob?.summary || latestJob?.statusLine,
        latestJob ? `${latestJob.title || "Background work"} is ${latestJob.status || "queued"}.` : "Generated work will appear here."
      ),
      artifactId: latestArtifact?.id || latestJob?.artifactId || "",
      complete: Boolean(latestArtifact || latestJob)
    }
  ];

  const activeIndex = lastCompletedIndex(chapters);
  return chapters.map((chapter, index) => ({
    ...chapter,
    active: index === activeIndex,
    status: index === activeIndex ? "active" : chapter.complete ? "complete" : "upcoming"
  }));
}

function newestByDate(items, field) {
  let newest = null;
  let newestTime = -1;
  for (const item of items) {
    const value = Date.parse(item?.[field] || "");
    if (!Number.isNaN(value) && value > newestTime) {
      newest = item;
      newestTime = value;
    }
  }
  return newest || items.at(-1) || null;
}

function lastCompletedIndex(chapters) {
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    if (chapters[index].complete) return index;
  }
  return 0;
}

function normalizeSpeaker(value = "") {
  return String(value || "").trim().toLowerCase() === "cooper" ? "Cooper" : "Michael";
}

function cleanSummary(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text;
}

function chapterTime(value) {
  if (!value) return "--:--";
  if (/^\d{1,2}:\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
