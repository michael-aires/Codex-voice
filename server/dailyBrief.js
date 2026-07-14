const opaqueNotionId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export function buildDailyBrief({
  date,
  timeZone = "America/Vancouver",
  meetings = [],
  tasks = [],
  sprint = null,
  sources = {},
  assigneeSelectors = ["Michael Moll", "michael@aires.ai", "michael"],
  generatedAt = new Date().toISOString(),
  trigger = "manual"
} = {}) {
  const assignment = selectAssignedTasks(tasks, assigneeSelectors);
  const selectedTasks = assignment.tasks;
  const nextMeeting = meetings.find((meeting) => meeting.status === "next") || meetings[0] || null;
  const urgentTasks = selectedTasks.filter((task) => isDueSoon(task, date));
  const activeTasks = selectedTasks.filter((task) => /in progress|qa|ready/i.test(String(task.status || "")));
  const dateLabel = formatBriefDate(date, timeZone);
  const summary = summaryText({ meetings, tasks: selectedTasks, sprint, nextMeeting, urgentTasks, assignment });
  const highlights = [
    nextMeeting ? `Next: ${nextMeeting.time || "Today"} · ${nextMeeting.title}` : "No meetings are scheduled today.",
    selectedTasks.length ? `${selectedTasks.length} open sprint ticket${selectedTasks.length === 1 ? "" : "s"} in your brief.` : "No assigned open sprint tickets were found.",
    urgentTasks.length ? `${urgentTasks.length} ticket${urgentTasks.length === 1 ? " is" : "s are"} due today or overdue.` : "No dated sprint ticket is overdue."
  ];
  const slides = [
    overviewSlide({ dateLabel, meetings, tasks: selectedTasks, sprint, summary }),
    calendarSlide(meetings),
    sprintSlide(selectedTasks, sprint, assignment),
    focusSlide({ meetings, tasks: selectedTasks, nextMeeting, activeTasks, urgentTasks })
  ];

  return {
    id: `daily-brief-${date || generatedAt.slice(0, 10)}`,
    type: "daily_brief",
    date: date || generatedAt.slice(0, 10),
    dateLabel,
    timeZone,
    generatedAt,
    trigger,
    title: "Daily Catch Up",
    summary,
    highlights,
    meetings,
    tasks: selectedTasks,
    sprint,
    slides,
    assignment: {
      mode: assignment.mode,
      selectors: assigneeSelectors,
      matched: selectedTasks.length,
      available: tasks.length,
      message: assignment.message
    },
    sources,
    voicePrompt: [
      "Cooper, present my Daily Catch Up now.",
      "Talk through the prepared slides in order: overview, calendar, sprint priorities, and focus plan.",
      "Be concise, call out conflicts or overdue work, and end by asking what I want to tackle first.",
      `Brief summary: ${summary}`
    ].join(" ")
  };
}

export function selectAssignedTasks(tasks = [], selectors = []) {
  const normalizedSelectors = selectors.map(normalizeIdentity).filter(Boolean);
  const identifiable = tasks.filter((task) => namedAssignees(task).length > 0);
  if (!identifiable.length) {
    return {
      tasks: [...tasks],
      mode: tasks.length ? "unverified" : "empty",
      message: tasks.length
        ? "Arcade returned the active sprint, but Notion did not expose readable assignee names. All open sprint tickets are included."
        : "No open sprint tickets were returned."
    };
  }

  const matched = tasks.filter((task) => namedAssignees(task).some((assignee) => {
    const identity = normalizeIdentity(assignee);
    return normalizedSelectors.some((selector) => identity === selector || identity.includes(selector) || selector.includes(identity));
  }));

  return {
    tasks: matched,
    mode: "matched",
    message: `Filtered the active sprint to ${matched.length} ticket${matched.length === 1 ? "" : "s"} assigned to Michael Moll.`
  };
}

export function millisecondsUntilLocalHour(now = new Date(), timeZone = "America/Vancouver", hour = 7) {
  const start = new Date(Math.ceil(now.getTime() / 60000) * 60000);
  for (let minute = 0; minute <= 48 * 60; minute += 1) {
    const candidate = new Date(start.getTime() + minute * 60000);
    const parts = localParts(candidate, timeZone);
    if (parts.hour === hour && parts.minute === 0 && candidate.getTime() > now.getTime()) {
      return candidate.getTime() - now.getTime();
    }
  }
  return 24 * 60 * 60 * 1000;
}

function overviewSlide({ dateLabel, meetings, tasks, sprint, summary }) {
  return {
    id: "overview",
    eyebrow: dateLabel,
    title: "Your day, in one view",
    narrative: summary,
    metrics: [
      { label: "Meetings", value: String(meetings.length) },
      { label: "Open tickets", value: String(tasks.length) },
      { label: "Sprint", value: sprint?.title || "Current" }
    ],
    items: []
  };
}

function calendarSlide(meetings) {
  return {
    id: "calendar",
    eyebrow: "Calendar",
    title: meetings.length ? "The rooms you need to be in" : "A clear meeting day",
    narrative: meetings.length
      ? "Cooper has the schedule and can open any meeting as a context-rich working session."
      : "There are no calendar events in today’s connected view.",
    metrics: [],
    items: meetings.map((meeting) => ({
      lead: meeting.time || "Today",
      title: meeting.title,
      detail: [meeting.duration, meeting.subtitle].filter(Boolean).join(" · "),
      status: meeting.status || (meeting.conference?.provider === "zoom" ? "Zoom" : "")
    }))
  };
}

function sprintSlide(tasks, sprint, assignment) {
  return {
    id: "sprint",
    eyebrow: sprint?.title || "Current sprint",
    title: tasks.length
      ? assignment.mode === "matched" ? "Work assigned to Michael" : "Open work in the current sprint"
      : "No assigned sprint work found",
    narrative: assignment.message,
    metrics: [],
    items: tasks.map((task) => ({
      lead: task.metadata?.taskId || task.status || "Task",
      title: task.title,
      detail: [task.status, task.metadata?.dueDate ? `Due ${task.metadata.dueDate}` : ""].filter(Boolean).join(" · "),
      status: task.metadata?.priority || ""
    }))
  };
}

function focusSlide({ meetings, tasks, nextMeeting, activeTasks, urgentTasks }) {
  const items = [];
  if (urgentTasks[0]) items.push({ lead: "01", title: `Resolve ${urgentTasks[0].title}`, detail: "Due today or overdue", status: "Attention" });
  if (activeTasks[0] && activeTasks[0] !== urgentTasks[0]) items.push({ lead: String(items.length + 1).padStart(2, "0"), title: `Advance ${activeTasks[0].title}`, detail: activeTasks[0].status, status: "In motion" });
  if (nextMeeting) items.push({ lead: String(items.length + 1).padStart(2, "0"), title: `Prepare for ${nextMeeting.title}`, detail: `${nextMeeting.time || "Today"} · ${nextMeeting.duration || "Calendar"}`, status: "Next" });
  if (!items.length && tasks[0]) items.push({ lead: "01", title: `Start ${tasks[0].title}`, detail: tasks[0].status || "Open sprint work", status: "Focus" });
  if (!items.length && meetings.length === 0) items.push({ lead: "01", title: "Protect a focus block", detail: "No meetings or assigned sprint tickets need attention.", status: "Clear" });

  return {
    id: "focus",
    eyebrow: "Recommended focus",
    title: "A practical order for the day",
    narrative: "This is a suggested sequence, not an automatic commitment. Ask Cooper to reprioritize it with you.",
    metrics: [],
    items
  };
}

function summaryText({ meetings, tasks, sprint, nextMeeting, urgentTasks, assignment }) {
  const meetingText = meetings.length
    ? `${meetings.length} meeting${meetings.length === 1 ? "" : "s"}${nextMeeting ? `, with ${nextMeeting.title} next` : ""}`
    : "no meetings";
  const ownership = assignment?.mode === "matched" ? " assigned to you" : "";
  const taskText = tasks.length
    ? `${tasks.length} open ticket${tasks.length === 1 ? "" : "s"}${ownership} in ${sprint?.title || "the current sprint"}`
    : `no assigned open tickets in ${sprint?.title || "the current sprint"}`;
  const urgency = urgentTasks.length ? ` ${urgentTasks.length} need${urgentTasks.length === 1 ? "s" : ""} date attention.` : "";
  return `Today has ${meetingText} and ${taskText}.${urgency}`;
}

function namedAssignees(task) {
  return (task?.metadata?.assignees || []).filter((assignee) => assignee && !opaqueNotionId.test(String(assignee)));
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function isDueSoon(task, date) {
  const dueDate = task?.metadata?.dueDate;
  return Boolean(dueDate && date && dueDate.slice(0, 10) <= date);
}

function formatBriefDate(date, timeZone) {
  if (!date) return "Today";
  const parsed = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone
  }).format(parsed);
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}
