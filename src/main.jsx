import React from "react";
import { createRoot } from "react-dom/client";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  CheckCircle2,
  Copy,
  Clock,
  Download,
  FileText,
  Files,
  Library,
  Pencil,
  LockKeyhole,
  LogIn,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Mic,
  Phone,
  PhoneOff,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Smartphone,
  Wand2
} from "lucide-react";
import { canvasItemDownload } from "./lib/canvas.js";
import "./styles.css";

let mermaidLoader = null;

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

const defaultFence = markdownRenderer.renderer.rules.fence;
markdownRenderer.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0].toLowerCase();
  if (language === "mermaid") {
    return `<div class="mermaid">${markdownRenderer.utils.escapeHtml(token.content)}</div>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

const toolDefinition = {
  type: "function",
  name: "check_calendar",
  description: "Check whether Michael is available at a requested date and time.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Requested meeting date, ideally YYYY-MM-DD."
      },
      time: {
        type: "string",
        description: "Requested meeting time, ideally HH:MM with timezone if known."
      }
    },
    required: ["date", "time"]
  }
};

const speedParam = {
  type: "string",
  enum: ["fast", "quality"],
  description:
    "Generation mode. 'fast' (default) returns in a few seconds for live conversation. 'quality' runs a slower multi-step refinement for production-grade output - use it only when Michael says take your time or make it production-grade."
};

const createDiagramTool = {
  type: "function",
  name: "create_diagram",
  description: "Draw a diagram on the shared canvas for Michael to see. Use for architectures, workflows, flows, sequences.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the diagram."
      },
      description: {
        type: "string",
        description: "What the diagram should show: the system, workflow, flow, or sequence to render."
      },
      diagram_type: {
        type: "string",
        description: "Optional diagram style: flowchart, sequence, class, state, er, or mindmap."
      },
      speed: speedParam
    },
    required: ["title", "description"]
  }
};

const createPrototypeTool = {
  type: "function",
  name: "create_prototype",
  description: "Build an HTML UI prototype on the shared canvas.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the prototype."
      },
      brief: {
        type: "string",
        description: "What the prototype should be: the screen, UI, or interaction to build."
      },
      speed: speedParam
    },
    required: ["title", "brief"]
  }
};

const createWireframeTool = {
  type: "function",
  name: "create_wireframe",
  description: "Build a low-fidelity HTML wireframe (grayscale, boxy, placeholder content) on the shared canvas to sketch layout structure.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the wireframe."
      },
      brief: {
        type: "string",
        description: "What the wireframe should show: the screen or layout structure to sketch."
      },
      speed: speedParam
    },
    required: ["title", "brief"]
  }
};

const updateCanvasItemTool = {
  type: "function",
  name: "update_canvas_item",
  description:
    "Iterate on an existing canvas item in place. Use when Michael asks to change, refine, or fix a diagram, prototype, or wireframe already on the canvas. Regenerates the same item from its current content plus the requested change.",
  parameters: {
    type: "object",
    properties: {
      item_id: {
        type: "string",
        description: "The id of the existing canvas item to update."
      },
      instruction: {
        type: "string",
        description: "The change to apply, e.g. 'add an error state', 'use a dark theme', 'split the auth service into two nodes'."
      },
      speed: speedParam
    },
    required: ["item_id", "instruction"]
  }
};

const searchKnowledgeTool = {
  type: "function",
  name: "search_knowledge",
  description: "Search the knowledge base (context Michael has added) for relevant information before answering.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to look up in the knowledge base."
      }
    },
    required: ["query"]
  }
};

const sessionUpdate = {
  type: "session.update",
  session: {
    type: "realtime",
    instructions: `
# Role and Objective
You are Cooper, an executive assistant to Michael at AIRES, who serves as CTO and CPO.
You support executive work, product leadership, engineering leadership, software delivery, architecture, planning, meetings, and SDLC decisions.

# Meeting Behavior
You may listen to meeting audio and use the meeting context when called on.
Do not speak just because people are talking. Speak only when someone clearly addresses Cooper, asks you directly, or the client explicitly asks you to respond.
When called on, answer with concise executive judgment: recommendation, tradeoff, risk, and next move.

# Expertise
Think like a strong C-suite partner across CTO, CPO, product strategy, architecture, developer experience, delivery operations, platform reliability, security posture, roadmap prioritization, and team execution.

# Style
Be calm, direct, commercially aware, technically grounded, and brief.

# Tools
Use check_calendar(date, time) for availability or scheduling questions. Ask for a missing date or time before calling the tool.
While talking, you can put visuals on the shared canvas Michael is looking at. Call create_diagram(title, description, diagram_type?, speed?) to draw a diagram (architecture, workflow, flow, sequence), create_prototype(title, brief, speed?) to build a polished HTML UI prototype, and create_wireframe(title, brief, speed?) to sketch a fast low-fidelity layout wireframe. These run in the background and appear on the canvas after a few seconds, so call the tool, briefly say it is coming, and keep the conversation going. Do not wait silently for the result.
Each canvas tool takes an optional speed: default "fast" for the live flow (a few seconds), or "quality" when Michael says take your time, make it production-grade, or polish it - quality runs a slower multi-step refinement and takes longer, so set expectations.
You can iterate on what is already on the canvas: call update_canvas_item(item_id, instruction, speed?) to apply a change to an existing item in place (e.g. "add an error state", "use a dark theme"). It regenerates the same item, preserving its id and type. Reference the item Michael is talking about by its id.
You have a knowledge base of context Michael has added (pasted notes, uploaded documents). Call search_knowledge(query) to look things up there before answering when a question might be covered by that context. Michael can add new context at any time, and short notes are injected directly into our conversation.
`,
    reasoning: { effort: "low" },
    audio: {
      input: {
        noise_reduction: { type: "far_field" },
        transcription: {
          model: "gpt-4o-mini-transcribe",
          prompt: "Meeting transcript for Cooper, AIRES, CTO, CPO, product, engineering, software delivery, roadmap, calendar."
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: false,
          interrupt_response: false
        }
      },
      output: {
        voice: "cedar"
      }
    },
    tools: [toolDefinition, createDiagramTool, createPrototypeTool, createWireframeTool, updateCanvasItemTool, searchKnowledgeTool],
    tool_choice: "auto"
  }
};

function App() {
  const [entered, setEntered] = React.useState(() => localStorage.getItem("cooper.entered") === "true");
  const [authChecked, setAuthChecked] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState("");
  const [view, setView] = React.useState("home");
  const [state, setState] = React.useState({ calls: [], artifacts: [], jobs: [], recipes: [], limits: {} });
  const [selectedCallId, setSelectedCallId] = React.useState(null);
  const [selectedArtifactId, setSelectedArtifactId] = React.useState(null);
  const [artifactContent, setArtifactContent] = React.useState("");
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");
  const [speaking, setSpeaking] = React.useState(false);
  const [hearing, setHearing] = React.useState(false);
  const [notificationPermission, setNotificationPermission] = React.useState(() => getNotificationPermission());
  const [prompt, setPrompt] = React.useState("");
  const [events, setEvents] = React.useState([]);
  const [transcripts, setTranscripts] = React.useState([]);
  const [knowledgeEntries, setKnowledgeEntries] = React.useState([]);
  const injectedKnowledgeRef = React.useRef(new Set());
  const pcRef = React.useRef(null);
  const dcRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const activeCallRef = React.useRef(null);
  const selectedCallIdRef = React.useRef(null);
  const callStartedAtRef = React.useRef(null);
  const transcriptsRef = React.useRef([]);
  const outputTranscriptBuffersRef = React.useRef(new Map());
  const textTranscriptBuffersRef = React.useRef(new Map());
  const persistedResponseIdsRef = React.useRef(new Set());
  const knownCompletedJobsRef = React.useRef(new Set());
  const canvasReadyAnnouncedRef = React.useRef(new Set());
  const didLoadStateRef = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setAuthenticated(Boolean(payload.authenticated));
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const knowledgeCallId = (connected || connecting ? activeCallRef.current?.id : null) || selectedCallId || null;

  React.useEffect(() => {
    selectedCallIdRef.current = selectedCallId;
  }, [selectedCallId]);

  React.useEffect(() => {
    if (!authenticated || !entered) return;
    refreshState();
    const id = window.setInterval(refreshState, 4000);
    return () => window.clearInterval(id);
  }, [authenticated, entered]);

  React.useEffect(() => {
    if (!authenticated || !entered) return;
    refreshKnowledge(knowledgeCallId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, entered, knowledgeCallId]);

  React.useEffect(() => {
    if (!authenticated || !selectedArtifactId) {
      setArtifactContent("");
      return;
    }
    fetch(`/api/artifacts/${selectedArtifactId}/content`, { credentials: "same-origin" })
      .then((response) => {
        if (response.status === 401) {
          setAuthenticated(false);
          return "";
        }
        if (!response.ok) throw new Error("Unable to load artifact.");
        return response.text();
      })
      .then(setArtifactContent)
      .catch(() => setArtifactContent("Unable to load artifact."));
  }, [authenticated, selectedArtifactId]);

  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    if (!authenticated || !entered || !("EventSource" in window)) return undefined;
    const source = new EventSource("/api/events", { withCredentials: true });
    source.addEventListener("state.updated", () => {
      refreshState();
    });
    source.addEventListener("canvas.item.created", (event) => {
      const item = parseSseData(event.data);
      if (item) applyCanvasItem(item);
    });
    source.addEventListener("canvas.item.updated", (event) => {
      const item = parseSseData(event.data);
      if (item) applyCanvasItem(item);
    });
    source.addEventListener("knowledge.updated", (event) => {
      const payload = parseSseData(event.data);
      const targetId = activeCallRef.current?.id || selectedCallIdRef.current;
      if (!payload || !payload.callId || payload.callId === targetId) {
        refreshKnowledge(targetId);
      }
    });
    return () => source.close();
  }, [authenticated, entered]);

  function applyCanvasItem(item) {
    if (!item || !item.callId || !item.id) return;
    const alreadyReady = canvasReadyAnnouncedRef.current.has(item.id);

    setState((current) => {
      const calls = (current.calls || []).map((call) => {
        if (call.id !== item.callId) return call;
        const items = Array.isArray(call.canvasItems) ? call.canvasItems : [];
        const index = items.findIndex((existing) => existing.id === item.id);
        const nextItems = index >= 0
          ? items.map((existing, i) => (i === index ? { ...existing, ...item } : existing))
          : [...items, item];
        return { ...call, canvasItems: nextItems };
      });
      return { ...current, calls };
    });

    if (item.status === "ready" && !alreadyReady) {
      canvasReadyAnnouncedRef.current.add(item.id);
      announceCanvasReady(item);
    }
  }

  function announceCanvasReady(item) {
    const title = String(item.title || "Canvas item").trim();
    addEvent("Canvas", `${title} is ready.`);

    if (connected && dcRef.current?.readyState === "open") {
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `[Canvas] ${title} is ready` }]
        }
      });
      sendEvent({
        type: "response.create",
        response: {
          instructions: `Briefly tell Michael the ${title} is ready on the canvas.`
        }
      });
    }

    if (getNotificationPermission() === "granted") {
      try {
        new Notification("Canvas ready", {
          body: `${title} is ready on the canvas.`,
          icon: "/icons/cooper.svg",
          badge: "/icons/cooper.svg",
          tag: `cooper-canvas-${item.id}`
        });
      } catch {
        // best-effort
      }
    }
  }

  async function refreshKnowledge(callId) {
    const id = callId || activeCallRef.current?.id || selectedCallIdRef.current;
    if (!id) {
      setKnowledgeEntries([]);
      return;
    }
    try {
      const response = await fetch(`/api/calls/${id}/knowledge`, { credentials: "same-origin" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error("Knowledge refresh failed.");
      const payload = await response.json();
      setKnowledgeEntries(Array.isArray(payload.entries) ? payload.entries : []);
    } catch {
      // best-effort
    }
  }

  function injectKnowledgeEntry(entry) {
    if (!entry || entry.mode !== "prompt") return;
    if (!connected || dcRef.current?.readyState !== "open") return;
    if (injectedKnowledgeRef.current.has(entry.id)) return;
    const text = String(entry.text || "").trim();
    if (!text) return;
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `[Context: ${entry.name || "note"}]\n${text}` }]
      }
    });
    injectedKnowledgeRef.current.add(entry.id);
    addEvent("Context", `Injected "${entry.name || "note"}" into the session.`);
  }

  async function injectExistingPromptEntries(callId) {
    if (!callId) return;
    try {
      const response = await fetch(`/api/calls/${callId}/knowledge?full=1`, { credentials: "same-origin" });
      if (!response.ok) return;
      const payload = await response.json();
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      for (const entry of entries) {
        if (entry.mode === "prompt" && entry.text) injectKnowledgeEntry(entry);
      }
    } catch {
      // best-effort
    }
  }

  async function addKnowledge({ name, text, mode }) {
    const id = activeCallRef.current?.id || selectedCallIdRef.current;
    let targetId = id;
    if (!targetId) {
      try {
        const call = await createCall();
        targetId = call?.id;
        if (call?.id) setSelectedCallId(call.id);
      } catch {
        addEvent("Context", "Could not create a call to hold context.");
        return;
      }
    }
    if (!targetId) return;

    const body = { name, text };
    if (mode && mode !== "auto") body.mode = mode;

    try {
      const response = await fetch(`/api/calls/${targetId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not add context.");
      }
      const payload = await response.json();
      const entry = payload.entry;
      addEvent("Context", `Added "${entry?.name || name || "note"}" (${entry?.mode || "?"}).`);
      if (entry && entry.mode === "prompt") {
        injectKnowledgeEntry({ ...entry, text: entry.text ?? text });
      }
      await refreshKnowledge(targetId);
    } catch (error) {
      addEvent("Context", error.message || "Could not add context.");
    }
  }

  async function deleteKnowledge(entryId) {
    const id = activeCallRef.current?.id || selectedCallIdRef.current;
    if (!id || !entryId) return;
    try {
      const response = await fetch(`/api/calls/${id}/knowledge/${entryId}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error("Could not delete context.");
      injectedKnowledgeRef.current.delete(entryId);
      await refreshKnowledge(id);
    } catch (error) {
      addEvent("Context", error.message || "Could not delete context.");
    }
  }

  async function refreshState() {
    try {
      const response = await fetch("/api/state", { credentials: "same-origin" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error("State refresh failed.");
      const next = await response.json();
      setState(next);
      handleWorkNotifications(next);
      if (!selectedCallId && next.calls.length) {
        setSelectedCallId(next.calls[0].id);
      }
      if (!selectedArtifactId && next.artifacts.length) {
        setSelectedArtifactId(next.artifacts[0].id);
      }
    } catch {
      addEvent("Sync", "State refresh failed.");
    }
  }

  async function login(password) {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not unlock Cooper.");
      }
      setAuthenticated(true);
      setAuthError("");
    } catch (error) {
      setAuthenticated(false);
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    if (connected || connecting) {
      await endCall({ failed: true });
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    localStorage.removeItem("cooper.entered");
    setAuthenticated(false);
    setEntered(false);
    setView("home");
    setState({ calls: [], artifacts: [], jobs: [], recipes: [], limits: {} });
    setSelectedCallId(null);
    setSelectedArtifactId(null);
    setArtifactContent("");
    setEvents([]);
    setTranscripts([]);
    setKnowledgeEntries([]);
    injectedKnowledgeRef.current = new Set();
    didLoadStateRef.current = false;
    knownCompletedJobsRef.current = new Set();
    canvasReadyAnnouncedRef.current = new Set();
  }

  function enterApp() {
    localStorage.setItem("cooper.entered", "true");
    setEntered(true);
  }

  function addEvent(label, detail) {
    setEvents((current) => [
      { id: uid(), label, detail, at: new Date().toLocaleTimeString() },
      ...current
    ].slice(0, 12));
  }

  function handleWorkNotifications(next) {
    const completed = next.jobs.filter((job) => job.status === "completed");
    if (!didLoadStateRef.current) {
      knownCompletedJobsRef.current = new Set(completed.map((job) => job.id));
      didLoadStateRef.current = true;
      return;
    }

    for (const job of completed) {
      if (knownCompletedJobsRef.current.has(job.id)) continue;
      knownCompletedJobsRef.current.add(job.id);
      notifyWorkDone(job);
    }
  }

  async function notifyWorkDone(job) {
    addEvent("Work done", `${job.title} is ready.`);
    if (getNotificationPermission() !== "granted") return;

    const options = {
      body: `${job.title} is ready in Cooper.`,
      icon: "/icons/cooper.svg",
      badge: "/icons/cooper.svg",
      tag: `cooper-job-${job.id}`
    };

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification("Cooper work is ready", options);
      } else {
        new Notification("Cooper work is ready", options);
      }
    } catch {
      // Notification delivery is best-effort; the in-app event log still records completion.
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      addEvent("Notifications", "This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      addEvent("Notifications", "Enabled for completed Cooper work.");
    }
  }

  function sendEvent(event) {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      addEvent("Not sent", "Data channel is closed.");
      return false;
    }
    dc.send(JSON.stringify(event));
    return true;
  }

  function checkCalendar(date, time) {
    const busyBlocks = [
      { date: "2026-05-12", start: "09:00", end: "10:30" },
      { date: "2026-05-12", start: "14:00", end: "15:00" },
      { date: "2026-05-13", start: "11:00", end: "12:00" }
    ];
    const normalizedTime = normalizeTime(time);
    const isBusy = busyBlocks.some((block) => block.date === date && normalizedTime >= block.start && normalizedTime < block.end);

    return {
      date,
      time,
      available: !isBusy,
      message: isBusy ? "That slot is currently blocked on the sample calendar." : "That slot is available on the sample calendar.",
      source: "local sample calendar"
    };
  }

  function handleFunctionCall(call) {
    let args = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      args = {};
    }

    if (call.name === "check_calendar") {
      const result = checkCalendar(args.date, args.time);
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result)
        }
      });
      sendEvent({ type: "response.create" });
      addEvent("Tool", `check_calendar(${args.date || "?"}, ${args.time || "?"})`);
      return;
    }

    if (call.name === "create_diagram") {
      startCanvasItem(call, {
        type: "mermaid",
        title: args.title,
        brief: args.diagram_type ? `${args.description}\n\nPreferred diagram type: ${args.diagram_type}.` : args.description,
        speed: normalizeSpeed(args.speed)
      });
      return;
    }

    if (call.name === "create_prototype") {
      startCanvasItem(call, {
        type: "html",
        title: args.title,
        brief: args.brief,
        speed: normalizeSpeed(args.speed)
      });
      return;
    }

    if (call.name === "create_wireframe") {
      startCanvasItem(call, {
        type: "wireframe",
        title: args.title,
        brief: args.brief,
        speed: normalizeSpeed(args.speed)
      });
      return;
    }

    if (call.name === "update_canvas_item") {
      updateCanvasItem(call, {
        itemId: args.item_id,
        instruction: args.instruction,
        speed: normalizeSpeed(args.speed)
      });
      return;
    }

    if (call.name === "search_knowledge") {
      searchKnowledge(call, args.query);
      return;
    }
  }

  async function searchKnowledge(call, query) {
    const activeCallId = activeCallRef.current?.id;
    const safeQuery = String(query || "").trim();

    if (!activeCallId) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "No active call, cannot search the knowledge base right now.",
        results: []
      });
      return;
    }

    if (!safeQuery) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "Missing a search query.",
        results: []
      });
      return;
    }

    try {
      const response = await fetch(`/api/calls/${activeCallId}/knowledge/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ query: safeQuery })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Knowledge search failed.");
      }
      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results : [];
      replyFunctionOutput(call.call_id, {
        status: "ok",
        query: safeQuery,
        results
      });
      addEvent("Knowledge", `search_knowledge("${safeQuery}") - ${results.length} result(s)`);
    } catch (error) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: error.message || "Knowledge search failed.",
        results: []
      });
      addEvent("Knowledge", error.message || "Knowledge search failed.");
    }
  }

  function replyFunctionOutput(callId, output) {
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output)
      }
    });
    sendEvent({ type: "response.create" });
  }

  async function startCanvasItem(call, { type, title, brief, speed = "fast" }) {
    const activeCallId = activeCallRef.current?.id;
    const safeTitle = String(title || "").trim() || canvasDefaultTitle(type);
    const safeSpeed = normalizeSpeed(speed);

    if (!activeCallId) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "No active call, cannot use the canvas right now."
      });
      addEvent("Canvas", "Tool call with no active call.");
      return;
    }

    if (!String(brief || "").trim()) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "Missing a description for the canvas item."
      });
      return;
    }

    try {
      const response = await fetch(`/api/calls/${activeCallId}/canvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type, title: safeTitle, brief, speed: safeSpeed })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not start the canvas item.");
      }
      replyFunctionOutput(call.call_id, {
        status: "started",
        message:
          safeSpeed === "quality"
            ? `Started ${safeTitle} in quality mode - it runs a slower refinement and will appear on the canvas shortly.`
            : `Started ${safeTitle} - it will appear on the canvas in a few seconds.`
      });
      addEvent("Canvas", `${canvasDefaultTitle(type)}: ${safeTitle}${safeSpeed === "quality" ? " (quality)" : ""}`);
    } catch (error) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: error.message || "Could not start the canvas item."
      });
      addEvent("Canvas", error.message || "Canvas start failed.");
    }
  }

  async function updateCanvasItem(call, { itemId, instruction, speed = "fast" }) {
    const activeCallId = activeCallRef.current?.id;
    const safeInstruction = String(instruction || "").trim();
    const safeSpeed = normalizeSpeed(speed);

    if (!activeCallId) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "No active call, cannot update the canvas right now."
      });
      return;
    }

    if (!itemId) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "Missing the id of the canvas item to update."
      });
      return;
    }

    if (!safeInstruction) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: "Missing an instruction describing the change to apply."
      });
      return;
    }

    try {
      const response = await fetch(`/api/calls/${activeCallId}/canvas/${itemId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ instruction: safeInstruction, speed: safeSpeed })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not update the canvas item.");
      }
      replyFunctionOutput(call.call_id, {
        status: "started",
        message: "Updating the item now - the change will appear on the canvas shortly."
      });
      addEvent("Canvas", `Update: ${safeInstruction.slice(0, 60)}`);
    } catch (error) {
      replyFunctionOutput(call.call_id, {
        status: "error",
        message: error.message || "Could not update the canvas item."
      });
      addEvent("Canvas", error.message || "Canvas update failed.");
    }
  }

  async function startCanvasManual(callId, { type, title, brief, speed = "fast" }) {
    if (!callId) return;
    const safeTitle = String(title || "").trim() || canvasDefaultTitle(type);
    const safeSpeed = normalizeSpeed(speed);
    try {
      const response = await fetch(`/api/calls/${callId}/canvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type, title: safeTitle, brief, speed: safeSpeed })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not start the canvas item.");
      }
      await refreshState();
      addEvent("Canvas", `${canvasDefaultTitle(type)}: ${safeTitle}${safeSpeed === "quality" ? " (quality)" : ""}`);
    } catch (error) {
      addEvent("Canvas", error.message || "Canvas start failed.");
    }
  }

  async function updateCanvasManual(callId, itemId, { instruction, speed = "fast" }) {
    if (!callId || !itemId) return;
    const safeInstruction = String(instruction || "").trim();
    if (!safeInstruction) return;
    const safeSpeed = normalizeSpeed(speed);
    try {
      const response = await fetch(`/api/calls/${callId}/canvas/${itemId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ instruction: safeInstruction, speed: safeSpeed })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not update the canvas item.");
      }
      await refreshState();
      addEvent("Canvas", `Update: ${safeInstruction.slice(0, 60)}`);
    } catch (error) {
      addEvent("Canvas", error.message || "Canvas update failed.");
    }
  }

  function requestCooper(text = "") {
    const userText = text.trim();
    if (userText) {
      const sentUserText = sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: userText }]
        }
      });
      if (sentUserText) {
        commitTranscriptEntry({ speaker: "Michael", text: userText, source: "typed" });
      }
    }

    const sent = sendEvent({
      type: "response.create",
      response: {
        instructions: "Respond now as Cooper because you have been called on. Use the meeting context if useful."
      }
    });

    if (sent) addEvent("Cooper", userText || "Called by voice.");
  }

  function handleServerEvent(event) {
    if (event.type === "session.created") {
      setStatus("Session created");
      return;
    }

    if (event.type === "session.updated") {
      setStatus("Listening");
      addEvent("Session", "Cooper is online.");
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      setHearing(true);
      setStatus("Listening");
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      setHearing(false);
      setStatus("Processing");
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = event.transcript || "";
      commitTranscriptEntry({
        at: new Date().toISOString(),
        speaker: "Michael",
        text,
        source: "mic",
        itemId: event.item_id
      });

      if (/\b(cooper|hey cooper|ok cooper|okay cooper)\b/i.test(text)) {
        requestCooper();
      } else {
        setStatus("Listening");
      }
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.failed") {
      addEvent("Transcript", event.error?.message || "Input transcription failed.");
      setStatus("Listening");
      return;
    }

    if (event.type === "response.created") {
      setStatus("Cooper preparing");
      return;
    }

    if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
      setSpeaking(true);
      setStatus("Cooper speaking");
      return;
    }

    if (event.type === "response.output_audio.done" || event.type === "response.audio.done") {
      setSpeaking(false);
      return;
    }

    if (event.type === "response.output_audio_transcript.delta" || event.type === "response.audio_transcript.delta") {
      appendTranscriptDelta(outputTranscriptBuffersRef.current, event, event.delta);
      return;
    }

    if (event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") {
      finalizeCooperTranscript(event, event.transcript, outputTranscriptBuffersRef.current);
      return;
    }

    if (event.type === "response.output_text.delta") {
      appendTranscriptDelta(textTranscriptBuffersRef.current, event, event.delta);
      return;
    }

    if (event.type === "response.output_text.done") {
      appendTranscriptDelta(textTranscriptBuffersRef.current, event, event.text, { replace: true });
      return;
    }

    if (event.type === "response.done") {
      setSpeaking(false);
      setStatus("Listening");
      const calls = event.response?.output?.filter((item) => item.type === "function_call") || [];
      calls.forEach(handleFunctionCall);
      finalizeResponseTranscriptFallback(event.response);
      return;
    }

    if (event.type === "error") {
      const message = event.error?.message || "Realtime error";
      setStatus("Error");
      addEvent("Error", message);
    }
  }

  async function connect() {
    setConnecting(true);
    setStatus("Starting");
    setSpeaking(false);
    setHearing(false);
    setEvents([]);
    setTranscripts([]);
    transcriptsRef.current = [];
    outputTranscriptBuffersRef.current = new Map();
    textTranscriptBuffersRef.current = new Map();
    persistedResponseIdsRef.current = new Set();
    injectedKnowledgeRef.current = new Set();
    setView("call");

    try {
      const call = await createCall();
      activeCallRef.current = call;
      selectedCallIdRef.current = call?.id || selectedCallIdRef.current;
      callStartedAtRef.current = Date.now();
      refreshKnowledge(call?.id);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      setStatus("Microphone");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setConnected(true);
        setConnecting(false);
        setStatus("Configuring");
        sendEvent(sessionUpdate);
        injectedKnowledgeRef.current = new Set();
        injectExistingPromptEntries(activeCallRef.current?.id);
      };
      dc.onmessage = (message) => {
        try {
          handleServerEvent(JSON.parse(message.data));
        } catch {
          addEvent("Event", "Received a non-JSON data channel message.");
        }
      };
      dc.onclose = () => {
        setConnected(false);
        setSpeaking(false);
        setHearing(false);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("/session", {
        method: "POST",
        body: offer.sdp,
        headers: {
          "Content-Type": "application/sdp"
        }
      });

      const answerSdp = await sdpResponse.text();
      if (!sdpResponse.ok) throw new Error(answerSdp || "Failed to create session.");

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      addEvent("Connected", "WebRTC established.");
    } catch (error) {
      setStatus("Failed");
      addEvent("Connection", error.message);
      await endCall({ failed: true });
    }
  }

  async function createCall() {
    const response = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Cooper call ${new Date().toLocaleString()}`,
        startedAt: new Date().toISOString()
      })
    });

    if (!response.ok) throw new Error("Could not create local call record.");
    const payload = await response.json();
    await refreshState();
    return payload.call;
  }

  function saveTranscriptEntry(entry) {
    const call = activeCallRef.current;
    if (!call?.id || !entry.text) return;
    fetch(`/api/calls/${call.id}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }).catch(() => addEvent("Transcript", "Save failed."));
  }

  function commitTranscriptEntry(partial) {
    const entry = {
      id: partial.id || uid(),
      at: partial.at || new Date().toISOString(),
      speaker: normalizeSpeaker(partial.speaker),
      text: String(partial.text || "").trim(),
      source: partial.source || "",
      responseId: partial.responseId || "",
      itemId: partial.itemId || ""
    };

    if (!entry.text) return null;

    const existingIndex = transcriptsRef.current.findIndex((item) => sameTranscriptTurn(item, entry));
    if (existingIndex >= 0) {
      const next = [...transcriptsRef.current];
      next[existingIndex] = { ...next[existingIndex], ...entry };
      transcriptsRef.current = next;
    } else {
      transcriptsRef.current = [...transcriptsRef.current, entry];
    }

    setTranscripts(transcriptsRef.current);
    saveTranscriptEntry(entry);
    return entry;
  }

  function appendTranscriptDelta(buffer, event, value = "", { replace = false } = {}) {
    const text = String(value || "");
    if (!text) return;
    const key = transcriptKey(event);
    const current = buffer.get(key) || {
      text: "",
      responseId: event.response_id || "",
      itemId: event.item_id || ""
    };
    buffer.set(key, {
      ...current,
      text: replace ? text : `${current.text}${text}`,
      responseId: event.response_id || current.responseId,
      itemId: event.item_id || current.itemId
    });
  }

  function finalizeCooperTranscript(event, transcript, buffer) {
    const key = transcriptKey(event);
    const buffered = buffer.get(key);
    const responseId = event.response_id || buffered?.responseId || key;
    if (responseId && persistedResponseIdsRef.current.has(responseId)) return;

    const text = String(transcript || buffered?.text || "").trim();
    if (!text) return;

    commitTranscriptEntry({
      speaker: "Cooper",
      text,
      source: "cooper_audio",
      responseId,
      itemId: event.item_id || buffered?.itemId || ""
    });
    if (responseId) persistedResponseIdsRef.current.add(responseId);
    buffer.delete(key);
  }

  function finalizeResponseTranscriptFallback(response) {
    const responseId = response?.id;
    if (!responseId || persistedResponseIdsRef.current.has(responseId)) return;

    const bufferedAudio = findBufferedTranscript(outputTranscriptBuffersRef.current, responseId);
    const bufferedText = findBufferedTranscript(textTranscriptBuffersRef.current, responseId);
    const text = bufferedAudio?.text || extractRealtimeResponseText(response) || bufferedText?.text || "";
    if (!text.trim()) return;

    commitTranscriptEntry({
      speaker: "Cooper",
      text,
      source: bufferedAudio ? "cooper_audio_fallback" : "cooper_response_done",
      responseId,
      itemId: bufferedAudio?.itemId || bufferedText?.itemId || ""
    });
    persistedResponseIdsRef.current.add(responseId);
  }

  async function endCall({ failed = false } = {}) {
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    audioRef.current = null;

    const call = activeCallRef.current;
    const durationSeconds = callStartedAtRef.current ? Math.round((Date.now() - callStartedAtRef.current) / 1000) : 0;

    if (call?.id) {
      await fetch(`/api/calls/${call.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptsRef.current,
          endedAt: new Date().toISOString(),
          durationSeconds
        })
      }).catch(() => {});
      setSelectedCallId(call.id);
    }

    activeCallRef.current = null;
    callStartedAtRef.current = null;
    setConnected(false);
    setConnecting(false);
    setSpeaking(false);
    setHearing(false);
    setStatus(failed ? "Failed" : "Ready");
    await refreshState();
    if (!failed) setView("library");
  }

  function submitPrompt(event) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    requestCooper(text);
    setPrompt("");
  }

  async function generateArtifact(callId, kind, customPrompt = "") {
    const response = await fetch(`/api/calls/${callId}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, customPrompt })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      addEvent("Artifact", payload.error || "Could not queue Cooper work.");
      return;
    }

    await refreshState();
    setView("artifacts");
  }

  async function retryJob(jobId) {
    const response = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    if (!response.ok) {
      addEvent("Retry", "Could not retry job.");
      return;
    }
    await refreshState();
  }

  const activeCallId = activeCallRef.current?.id;
  const activeCanvasCall = state.calls.find((call) => call.id === activeCallId) || null;
  const selectedCall = state.calls.find((call) => call.id === selectedCallId) || state.calls[0] || null;
  const selectedArtifact = state.artifacts.find((artifact) => artifact.id === selectedArtifactId) || state.artifacts[0] || null;
  const latestCall = state.calls.find((call) => call.status === "ended") || state.calls[0] || null;
  const activeJobs = state.jobs.filter((job) => ["queued", "running"].includes(job.status));

  if (!authChecked) {
    return <LockScreen busy error="" onLogin={login} checking />;
  }

  if (!authenticated) {
    return <LockScreen busy={authBusy} error={authError} onLogin={login} />;
  }

  if (!entered) {
    return <Splash onEnter={enterApp} />;
  }

  if (connected || connecting || view === "call") {
    return (
      <CallScreen
        connected={connected}
        connecting={connecting}
        status={status}
        speaking={speaking}
        hearing={hearing}
        transcripts={transcripts}
        events={events}
        prompt={prompt}
        setPrompt={setPrompt}
        onSubmitPrompt={submitPrompt}
        onConnect={connect}
        onEndCall={() => endCall()}
        onCallCooper={() => requestCooper()}
        onBack={() => setView("home")}
        canvasCall={activeCanvasCall}
        onGenerateCanvas={startCanvasManual}
        onUpdateCanvas={updateCanvasManual}
        knowledgeEntries={knowledgeEntries}
        onAddKnowledge={addKnowledge}
        onDeleteKnowledge={deleteKnowledge}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => setView("home")}>
          <span className="brand-mark">C</span>
          <span>Cooper</span>
        </button>
        <nav className="nav">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>
            <Sparkles size={18} />
            <span>Home</span>
          </button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>
            <Library size={18} />
            <span>Calls</span>
          </button>
          <button className={view === "artifacts" ? "active" : ""} onClick={() => setView("artifacts")}>
            <Files size={18} />
            <span>Work</span>
          </button>
        </nav>
        <button className="icon-button" onClick={logout} aria-label="Lock Cooper">
          <LogOut size={18} />
        </button>
      </header>

      {view === "home" && (
        <HomeView
          calls={state.calls}
          artifacts={state.artifacts}
          jobs={state.jobs}
          activeJobs={activeJobs}
          limits={state.limits}
          notificationPermission={notificationPermission}
          latestCall={latestCall}
          onStartCall={connect}
          onOpenCalls={() => setView("library")}
          onOpenWork={() => setView("artifacts")}
          onGenerate={generateArtifact}
          onEnableNotifications={enableNotifications}
          onRetryJob={retryJob}
          knowledgeEntries={knowledgeEntries}
          onAddKnowledge={addKnowledge}
          onDeleteKnowledge={deleteKnowledge}
        />
      )}

      {view === "library" && (
        <LibraryView
          calls={state.calls}
          artifacts={state.artifacts}
          jobs={state.jobs}
          selectedCall={selectedCall}
          onSelectCall={setSelectedCallId}
          onGenerate={generateArtifact}
          onRetryJob={retryJob}
          onGenerateCanvas={startCanvasManual}
          onUpdateCanvas={updateCanvasManual}
        />
      )}

      {view === "artifacts" && (
        <ArtifactView
          artifacts={state.artifacts}
          jobs={state.jobs}
          calls={state.calls}
          selectedArtifact={selectedArtifact}
          artifactContent={artifactContent}
          onSelectArtifact={setSelectedArtifactId}
          onGenerate={generateArtifact}
          onRefresh={refreshState}
          onRetryJob={retryJob}
        />
      )}
    </main>
  );
}

function Splash({ onEnter }) {
  return (
    <main className="splash">
      <section className="splash-card">
        <div className="splash-mark">C</div>
        <p className="eyebrow">AIRES</p>
        <h1>Cooper</h1>
        <p className="splash-line">Executive operator for calls, plans, follow-ups, and software delivery.</p>
        <button className="primary-action" onClick={onEnter}>
          <LogIn size={20} />
          <span>Enter</span>
        </button>
      </section>
    </main>
  );
}

function LockScreen({ busy, checking = false, error, onLogin }) {
  const [password, setPassword] = React.useState("");

  function submit(event) {
    event.preventDefault();
    if (!password.trim() || busy || checking) return;
    onLogin(password);
  }

  return (
    <main className="splash lock-screen">
      <section className="splash-card lock-card">
        <div className="splash-mark">
          <LockKeyhole size={28} />
        </div>
        <p className="eyebrow">Private access</p>
        <h1>Cooper</h1>
        <p className="splash-line">Unlock the AIRES executive workspace.</p>
        <form className="lock-form" onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={checking ? "Checking session" : "Password"}
            autoComplete="current-password"
            disabled={busy || checking}
          />
          <button className="primary-action" type="submit" disabled={!password.trim() || busy || checking}>
            <LogIn size={20} />
            <span>{checking ? "Checking" : busy ? "Unlocking" : "Unlock"}</span>
          </button>
        </form>
        {error && <p className="lock-error">{error}</p>}
      </section>
    </main>
  );
}

function HomeView({
  calls,
  artifacts,
  jobs,
  activeJobs,
  limits,
  notificationPermission,
  latestCall,
  onStartCall,
  onOpenCalls,
  onOpenWork,
  onGenerate,
  onEnableNotifications,
  onRetryJob,
  knowledgeEntries,
  onAddKnowledge,
  onDeleteKnowledge
}) {
  return (
    <section className="home-grid">
      <div className="hero-slab">
        <p className="eyebrow">Executive mode</p>
        <h1>Quiet in the room. Useful on command.</h1>
        <div className="hero-actions">
          <button className="primary-action" onClick={onStartCall}>
            <Phone size={20} />
            <span>Start Call</span>
          </button>
          <button className="ghost-action" onClick={onOpenCalls}>
            <Library size={20} />
            <span>Library</span>
          </button>
          <button className="ghost-action" onClick={onEnableNotifications}>
            {notificationPermission === "granted" ? <BellRing size={20} /> : <Bell size={20} />}
            <span>{notificationPermission === "granted" ? "Notifications On" : "Notify Me"}</span>
          </button>
        </div>
      </div>

      <div className="metric-strip">
        <Metric label="Calls" value={calls.length} />
        <Metric label="Artifacts" value={artifacts.length} />
        <Metric label="Running" value={activeJobs.length} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Cooper Suggestions</h2>
          <button className="icon-button" onClick={onOpenWork} aria-label="Open work">
            <Files size={18} />
          </button>
        </div>
        <div className="suggestion-grid">
          {(latestCall?.suggestions || []).map((suggestion) => (
            <button
              className="suggestion"
              key={suggestion.kind}
              onClick={() => onGenerate(latestCall.id, suggestion.kind)}
              disabled={!latestCall || !latestCall.transcript?.length}
            >
              <Wand2 size={18} />
              <span>{suggestion.label}</span>
            </button>
          ))}
          {!latestCall && <p className="muted">No calls yet.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent Calls</h2>
          <button className="icon-button" onClick={onOpenCalls} aria-label="Open calls">
            <Library size={18} />
          </button>
        </div>
        <div className="compact-list">
          {calls.slice(0, 4).map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
          {!calls.length && <p className="muted">Call transcripts will appear here.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Work Queue</h2>
          <button className="icon-button" onClick={onOpenWork} aria-label="Open artifacts">
            <RefreshCw size={18} />
          </button>
        </div>
        <p className="engine-line">
          {limits.workModel || "model"} - {limits.jobMaxOutputTokens || 0} tokens - {Math.round((limits.jobDelayMs || 0) / 1000)}s cadence
        </p>
        <JobList jobs={jobs.slice(0, 5)} onRetry={onRetryJob} />
        <ActivityStream jobs={jobs} />
      </section>

      <KnowledgePanel
        entries={knowledgeEntries}
        onAdd={onAddKnowledge}
        onDelete={onDeleteKnowledge}
      />
    </section>
  );
}

function CallScreen({
  connected,
  connecting,
  status,
  speaking,
  hearing,
  transcripts,
  events,
  prompt,
  setPrompt,
  onSubmitPrompt,
  onConnect,
  onEndCall,
  onCallCooper,
  onBack,
  canvasCall,
  onGenerateCanvas,
  onUpdateCanvas,
  knowledgeEntries,
  onAddKnowledge,
  onDeleteKnowledge
}) {
  const mode = speaking ? "speaking" : hearing ? "hearing" : connected ? "listening" : "idle";
  const [canvasOpen, setCanvasOpen] = React.useState(false);
  const canvasCount = canvasCall?.canvasItems?.length || 0;

  React.useEffect(() => {
    if (canvasCount > 0) setCanvasOpen(true);
  }, [canvasCount]);

  return (
    <main className={`call-screen ${mode}`}>
      <header className="call-topbar">
        <button className="icon-button inverted" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="call-status">
          <Radio size={18} />
          <span>{status}</span>
        </div>
        <div className="call-topbar-actions">
          <button
            className={canvasOpen ? "icon-button inverted active" : "icon-button inverted"}
            onClick={() => setCanvasOpen((open) => !open)}
            aria-label="Toggle canvas"
            aria-pressed={canvasOpen}
          >
            <MonitorSmartphone size={20} />
            {canvasCount > 0 && <span className="canvas-count">{canvasCount}</span>}
          </button>
          <button className="icon-button inverted danger-text" onClick={onEndCall} aria-label="End call">
            <PhoneOff size={20} />
          </button>
        </div>
      </header>

      {canvasOpen && (
        <aside className="canvas-drawer">
          <div className="canvas-drawer-head">
            <strong>Shared Canvas</strong>
            <button className="icon-button inverted" onClick={() => setCanvasOpen(false)} aria-label="Close canvas">
              <ArrowLeft size={18} />
            </button>
          </div>
          <CanvasPanel call={canvasCall} onGenerate={onGenerateCanvas} onUpdate={onUpdateCanvas} variant="drawer" />
          <KnowledgePanel
            entries={knowledgeEntries}
            onAdd={onAddKnowledge}
            onDelete={onDeleteKnowledge}
            variant="drawer"
          />
        </aside>
      )}

      <section className="wave-stage">
        <div className="call-label">Cooper</div>
        <SoundWave active={speaking || hearing || connecting} speaking={speaking} />
        <p>{speaking ? "Speaking" : hearing ? "Listening" : connected ? "Standing by" : "Ready"}</p>
      </section>

      <section className="call-dock">
        <div className="dock-actions">
          {!connected && !connecting && (
            <button className="primary-action" onClick={onConnect}>
              <Phone size={20} />
              <span>Join</span>
            </button>
          )}
          <button className="secondary-action" onClick={onCallCooper} disabled={!connected}>
            <Mic size={20} />
            <span>Call Cooper</span>
          </button>
          <button className="danger-action" onClick={onEndCall}>
            <PhoneOff size={20} />
            <span>End</span>
          </button>
        </div>

        <form className="call-prompt" onSubmit={onSubmitPrompt}>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask Cooper"
            disabled={!connected}
          />
          <button type="submit" disabled={!connected || !prompt.trim()} aria-label="Send">
            <Send size={19} />
          </button>
        </form>

        <div className="live-feed">
          <section>
            <h2>Transcript</h2>
            <div className="feed-list">
              {transcripts.slice(-4).reverse().map((entry) => (
                <div className={`feed-turn ${speakerClass(entry.speaker)}`} key={entry.id}>
                  <span>{normalizeSpeaker(entry.speaker)}</span>
                  <p>{entry.text}</p>
                </div>
              ))}
              {!transcripts.length && <p className="muted">Waiting for speech.</p>}
            </div>
          </section>
          <section>
            <h2>Events</h2>
            <div className="feed-list">
              {events.slice(0, 4).map((event) => (
                <p key={event.id}>{event.label}: {event.detail}</p>
              ))}
              {!events.length && <p className="muted">No events yet.</p>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function LibraryView({ calls, artifacts, jobs, selectedCall, onSelectCall, onGenerate, onRetryJob, onGenerateCanvas, onUpdateCanvas }) {
  const callArtifacts = artifacts.filter((artifact) => artifact.callId === selectedCall?.id);
  const callJobs = jobs.filter((job) => job.callId === selectedCall?.id);

  return (
    <section className="split-view">
      <aside className="list-rail">
        <h1>Calls</h1>
        <div className="rail-list">
          {calls.map((call) => (
            <button
              key={call.id}
              className={selectedCall?.id === call.id ? "rail-item active" : "rail-item"}
              onClick={() => onSelectCall(call.id)}
            >
              <span>{call.title}</span>
              <small>{formatDate(call.startedAt)}</small>
            </button>
          ))}
          {!calls.length && <p className="muted">No saved calls.</p>}
        </div>
      </aside>

      <section className="detail-pane">
        {selectedCall ? (
          <>
            <div className="detail-head">
              <div>
                <p className="eyebrow">{selectedCall.status}</p>
                <h1>{selectedCall.title}</h1>
              </div>
              <span className="time-pill">{formatDuration(selectedCall.durationSeconds)}</span>
            </div>

            <div className="suggestion-grid horizontal">
              {(selectedCall.suggestions || []).map((suggestion) => (
                <button
                  className="suggestion"
                  key={suggestion.kind}
                  onClick={() => onGenerate(selectedCall.id, suggestion.kind)}
                  disabled={!selectedCall.transcript?.length}
                >
                  <Wand2 size={18} />
                  <span>{suggestion.label}</span>
                </button>
              ))}
            </div>

            <div className="two-column">
              <section className="panel">
                <h2>Transcript</h2>
                <div className="transcript-list">
                  {(selectedCall.transcript || []).map((entry) => (
                    <article className={`transcript-row ${speakerClass(entry.speaker)}`} key={entry.id}>
                      <span>{formatTime(entry.at)}</span>
                      <div>
                        <strong>{normalizeSpeaker(entry.speaker)}</strong>
                        <p>{entry.text}</p>
                      </div>
                    </article>
                  ))}
                  {!selectedCall.transcript?.length && <p className="muted">No transcript captured.</p>}
                </div>
              </section>

              <section className="panel">
                <h2>Artifacts</h2>
                <ArtifactMiniList artifacts={callArtifacts} jobs={callJobs} onRetry={onRetryJob} />
              </section>
            </div>

            <CanvasPanel call={selectedCall} onGenerate={onGenerateCanvas} onUpdate={onUpdateCanvas} />
          </>
        ) : (
          <p className="muted">No call selected.</p>
        )}
      </section>
    </section>
  );
}

function ArtifactView({ artifacts, jobs, calls, selectedArtifact, artifactContent, onSelectArtifact, onGenerate, onRefresh, onRetryJob }) {
  const [artifactMode, setArtifactMode] = React.useState("rendered");
  const latestCall = calls.find((call) => call.status === "ended") || calls[0] || null;
  const isHtmlArtifact = selectedArtifact?.outputType === "html";
  const canPrototypeFromArtifact = selectedArtifact && ["execution_plan", "product_requirements", "code_sketch"].includes(selectedArtifact.kind);

  React.useEffect(() => {
    setArtifactMode(isHtmlArtifact ? "preview" : "rendered");
  }, [isHtmlArtifact, selectedArtifact?.id]);

  function prototypeFromArtifact() {
    if (!selectedArtifact) return;
    onGenerate(
      selectedArtifact.callId,
      "html_prototype",
      `Use this existing ${selectedArtifact.title} as the source plan for the prototype:\n\n${artifactContent}`
    );
  }

  return (
    <section className="split-view">
      <aside className="list-rail">
        <div className="rail-head">
          <h1>Work</h1>
          <button className="icon-button" onClick={onRefresh} aria-label="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
        <JobList jobs={jobs} onRetry={onRetryJob} />
        <ActivityStream jobs={jobs} compact />
        {latestCall && (
          <section className="work-launcher">
            <strong>Start From Latest Call</strong>
            <small>{latestCall.title}</small>
            <div className="work-launcher-grid">
              {(latestCall.suggestions || []).map((suggestion) => (
                <button
                  className="suggestion"
                  key={suggestion.kind}
                  onClick={() => onGenerate(latestCall.id, suggestion.kind)}
                  disabled={!latestCall.transcript?.length}
                >
                  <Wand2 size={17} />
                  <span>{suggestion.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="rail-list spaced">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              className={selectedArtifact?.id === artifact.id ? "rail-item active" : "rail-item"}
              onClick={() => onSelectArtifact(artifact.id)}
            >
              <span>{artifact.title}</span>
              <small>{callTitle(calls, artifact.callId)}</small>
            </button>
          ))}
          {!artifacts.length && <p className="muted">No artifacts yet.</p>}
        </div>
      </aside>

      <section className="detail-pane">
        {selectedArtifact ? (
          <>
            <div className="detail-head">
              <div>
                <p className="eyebrow">{selectedArtifact.kind}</p>
                <h1>{selectedArtifact.title}</h1>
              </div>
              <div className="detail-actions">
                {canPrototypeFromArtifact && (
                  <button className="secondary-link" onClick={prototypeFromArtifact} disabled={!artifactContent.trim()}>
                    <MonitorSmartphone size={18} />
                    <span>Prototype</span>
                  </button>
                )}
                <a className="secondary-link" href={`/api/artifacts/${selectedArtifact.id}/content`} target="_blank" rel="noreferrer">
                  {isHtmlArtifact ? "HTML" : "Markdown"}
                </a>
              </div>
            </div>
            <ArtifactDocument
              artifact={selectedArtifact}
              mode={artifactMode}
              onModeChange={setArtifactMode}
              content={artifactContent}
              title={selectedArtifact.title}
            />
          </>
        ) : (
          <p className="muted">No artifact selected.</p>
        )}
      </section>
    </section>
  );
}

function ArtifactDocument({ artifact, mode, onModeChange, content, title }) {
  if (artifact?.outputType === "html") {
    return (
      <HtmlPrototypeDocument
        mode={mode}
        onModeChange={onModeChange}
        html={content}
        title={title}
      />
    );
  }

  return (
    <MarkdownArtifactDocument
      mode={mode}
      onModeChange={onModeChange}
      markdown={content}
      title={title}
    />
  );
}

function MarkdownArtifactDocument({ mode, onModeChange, markdown, title }) {
  const [copied, setCopied] = React.useState(false);
  const articleRef = React.useRef(null);
  const renderedHtml = React.useMemo(() => renderArtifactHtml(markdown), [markdown]);

  React.useEffect(() => {
    if (mode !== "rendered" || !articleRef.current) return;
    const nodes = articleRef.current.querySelectorAll(".mermaid");
    if (!nodes.length) return;
    renderMermaid(nodes).catch(() => {});
  }, [mode, renderedHtml]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="artifact-document">
      <div className="artifact-toolbar">
        <div className="artifact-tabs" role="tablist" aria-label={`${title} view`}>
          <button className={mode === "rendered" ? "active" : ""} onClick={() => onModeChange("rendered")} role="tab">
            Read
          </button>
          <button className={mode === "markdown" ? "active" : ""} onClick={() => onModeChange("markdown")} role="tab">
            Markdown
          </button>
        </div>
        <button className="copy-action" onClick={copyMarkdown}>
          {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {mode === "rendered" ? (
        <article className="rendered-artifact" ref={articleRef} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      ) : (
        <pre className="markdown-preview">{markdown}</pre>
      )}
    </section>
  );
}

function HtmlPrototypeDocument({ mode, onModeChange, html, title }) {
  const [copied, setCopied] = React.useState(false);
  const [viewport, setViewport] = React.useState("mobile");

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="artifact-document">
      <div className="artifact-toolbar">
        <div className="artifact-tabs" role="tablist" aria-label={`${title} prototype view`}>
          <button className={mode === "preview" ? "active" : ""} onClick={() => onModeChange("preview")} role="tab">
            Preview
          </button>
          <button className={mode === "html" ? "active" : ""} onClick={() => onModeChange("html")} role="tab">
            HTML
          </button>
        </div>
        <div className="artifact-actions">
          {mode === "preview" && (
            <div className="viewport-toggle" aria-label="Prototype viewport">
              <button className={viewport === "mobile" ? "active" : ""} onClick={() => setViewport("mobile")} aria-label="Mobile viewport">
                <Smartphone size={17} />
                <span>Mobile</span>
              </button>
              <button className={viewport === "desktop" ? "active" : ""} onClick={() => setViewport("desktop")} aria-label="Desktop viewport">
                <Monitor size={17} />
                <span>Desktop</span>
              </button>
            </div>
          )}
          <button className="copy-action" onClick={copyHtml}>
            {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className={`prototype-stage ${viewport}`}>
          <iframe
            className="prototype-frame"
            title={title}
            srcDoc={html || "<!doctype html><html><body></body></html>"}
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        </div>
      ) : (
        <pre className="markdown-preview">{html}</pre>
      )}
    </section>
  );
}

function KnowledgePanel({ entries, onAdd, onDelete, variant = "panel" }) {
  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState("auto");
  const [busy, setBusy] = React.useState(false);
  const fileInputRef = React.useRef(null);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
      if (!name.trim()) setName(file.name);
    } catch {
      // ignore read failures
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submit(event) {
    event.preventDefault();
    const body = String(text || "").trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onAdd({ name: name.trim() || "Context", text: body, mode });
      setName("");
      setText("");
      setMode("auto");
    } finally {
      setBusy(false);
    }
  }

  const sorted = React.useMemo(() => {
    const list = Array.isArray(entries) ? [...entries] : [];
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [entries]);

  return (
    <section className={variant === "drawer" ? "knowledge-panel drawer" : "knowledge-panel"}>
      <div className="knowledge-head">
        <h2>Knowledge</h2>
        <span className="muted">{sorted.length} item{sorted.length === 1 ? "" : "s"}</span>
      </div>

      <form className="knowledge-form" onSubmit={submit}>
        <input
          className="knowledge-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Context name (e.g. Q3 roadmap)"
          aria-label="Context name"
        />
        <textarea
          className="knowledge-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste context, notes, or a document for Cooper to use."
          aria-label="Context content"
          rows={4}
        />
        <div className="knowledge-controls">
          <label className="knowledge-file">
            <FileText size={16} />
            <span>Upload</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,text/plain"
              onChange={handleFile}
              hidden
            />
          </label>
          <select
            className="knowledge-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            aria-label="Ingest mode"
          >
            <option value="auto">Auto</option>
            <option value="prompt">Inject now</option>
            <option value="indexed">Index for retrieval</option>
          </select>
          <button type="submit" className="knowledge-add" disabled={!text.trim() || busy}>
            <Sparkles size={16} />
            <span>{busy ? "Adding" : "Add context"}</span>
          </button>
        </div>
      </form>

      <div className="knowledge-list">
        {sorted.map((entry) => (
          <article className="knowledge-row" key={entry.id}>
            <div className="knowledge-row-main">
              <strong>{entry.name || "Context"}</strong>
              <div className="knowledge-meta">
                <span className={`knowledge-badge ${entry.mode === "indexed" ? "indexed" : "injected"}`}>
                  {entry.mode === "indexed" ? "indexed" : "injected"}
                </span>
                <span className="muted">{entry.chars || 0} chars</span>
                {entry.status && entry.status !== "ready" && (
                  <span className="knowledge-status">{entry.status}</span>
                )}
              </div>
              {entry.error && <small className="knowledge-error">{entry.error}</small>}
            </div>
            <button
              className="knowledge-delete"
              onClick={() => onDelete(entry.id)}
              aria-label={`Delete ${entry.name || "context"}`}
            >
              <AlertTriangle size={15} />
            </button>
          </article>
        ))}
        {!sorted.length && <p className="muted">No context added yet.</p>}
      </div>
    </section>
  );
}

function CanvasPanel({ call, onGenerate, onUpdate, variant = "panel" }) {
  const items = React.useMemo(() => {
    const list = Array.isArray(call?.canvasItems) ? [...call.canvasItems] : [];
    return list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }, [call?.canvasItems]);

  const [activeId, setActiveId] = React.useState(null);
  const [composerType, setComposerType] = React.useState("mermaid");
  const [composerText, setComposerText] = React.useState("");
  const [composerSpeed, setComposerSpeed] = React.useState("fast");
  const [readyMessage, setReadyMessage] = React.useState("");
  const tabRefs = React.useRef(new Map());
  const announcedRef = React.useRef(new Set());

  const activeItem = items.find((item) => item.id === activeId) || items[items.length - 1] || null;

  React.useEffect(() => {
    if (!items.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!items.some((item) => item.id === activeId)) {
      setActiveId(items[items.length - 1].id);
    }
  }, [items, activeId]);

  // Local aria-live announcement when an item finishes rendering on this panel.
  React.useEffect(() => {
    for (const item of items) {
      if (item.status === "ready" && !announcedRef.current.has(item.id)) {
        announcedRef.current.add(item.id);
        setReadyMessage(`${item.title || canvasDefaultTitle(item.type)} is ready on the canvas.`);
      }
    }
  }, [items]);

  function focusTabAt(index) {
    if (!items.length) return;
    const wrapped = (index + items.length) % items.length;
    const target = items[wrapped];
    if (!target) return;
    setActiveId(target.id);
    const node = tabRefs.current.get(target.id);
    if (node) node.focus();
  }

  function onTabKeyDown(event, index) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTabAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTabAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTabAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTabAt(items.length - 1);
    }
  }

  function submitComposer(event) {
    event.preventDefault();
    const brief = composerText.trim();
    if (!brief || !call?.id) return;
    onGenerate(call.id, { type: composerType, title: deriveTitle(brief), brief, speed: composerSpeed });
    setComposerText("");
  }

  function handleUpdate(itemId, instruction, speed) {
    if (!call?.id || !onUpdate) return;
    onUpdate(call.id, itemId, { instruction, speed });
  }

  const panelId = call?.id || "canvas";

  return (
    <section className={variant === "drawer" ? "canvas-panel drawer" : "canvas-panel"}>
      <div className="canvas-head">
        <h2>Canvas</h2>
        <div className="canvas-tabs" role="tablist" aria-label="Canvas items">
          {items.map((item, index) => {
            const selected = item.id === activeItem?.id;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(item.id, node);
                  else tabRefs.current.delete(item.id);
                }}
                role="tab"
                id={`canvas-tab-${panelId}-${item.id}`}
                aria-selected={selected}
                aria-controls={`canvas-tabpanel-${panelId}`}
                tabIndex={selected ? 0 : -1}
                className={`canvas-tab ${selected ? "active" : ""} ${item.status}`}
                onClick={() => setActiveId(item.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                title={item.title}
              >
                {item.status === "generating" && <Clock size={14} aria-hidden="true" />}
                {item.status === "failed" && <AlertTriangle size={14} aria-hidden="true" />}
                <span>{item.title || canvasDefaultTitle(item.type)}</span>
              </button>
            );
          })}
          {!items.length && <span className="muted">No canvas items yet.</span>}
        </div>
      </div>

      <div
        className="canvas-stage"
        role="tabpanel"
        id={`canvas-tabpanel-${panelId}`}
        aria-labelledby={activeItem ? `canvas-tab-${panelId}-${activeItem.id}` : undefined}
        tabIndex={0}
      >
        {activeItem ? (
          <>
            <CanvasItemToolbar item={activeItem} onUpdate={handleUpdate} canUpdate={Boolean(onUpdate)} />
            <CanvasItemView item={activeItem} />
          </>
        ) : (
          <p className="muted">Ask Cooper to diagram or prototype something, or use the box below.</p>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {readyMessage}
      </p>

      <form className="canvas-composer" onSubmit={submitComposer}>
        <div className="canvas-composer-type" role="group" aria-label="Canvas item type">
          <button
            type="button"
            className={composerType === "mermaid" ? "active" : ""}
            onClick={() => setComposerType("mermaid")}
          >
            Diagram
          </button>
          <button
            type="button"
            className={composerType === "html" ? "active" : ""}
            onClick={() => setComposerType("html")}
          >
            Prototype
          </button>
          <button
            type="button"
            className={composerType === "wireframe" ? "active" : ""}
            onClick={() => setComposerType("wireframe")}
          >
            Wireframe
          </button>
        </div>
        <input
          value={composerText}
          onChange={(event) => setComposerText(event.target.value)}
          placeholder={composerPlaceholder(composerType)}
          disabled={!call?.id}
          aria-label={composerPlaceholder(composerType)}
        />
        <select
          className="canvas-speed"
          value={composerSpeed}
          onChange={(event) => setComposerSpeed(event.target.value)}
          aria-label="Generation mode"
          disabled={!call?.id}
        >
          <option value="fast">Fast</option>
          <option value="quality">Quality</option>
        </select>
        <button type="submit" disabled={!call?.id || !composerText.trim()}>
          <Wand2 size={17} aria-hidden="true" />
          <span>{composerSubmitLabel(composerType)}</span>
        </button>
      </form>
    </section>
  );
}

function CanvasItemToolbar({ item, onUpdate, canUpdate }) {
  const [editing, setEditing] = React.useState(false);
  const [instruction, setInstruction] = React.useState("");
  const [speed, setSpeed] = React.useState("fast");
  const inputRef = React.useRef(null);
  const generating = item.status === "generating";
  const typeLabel = canvasDefaultTitle(item.type);

  React.useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  function applyEdit(event) {
    event.preventDefault();
    const change = instruction.trim();
    if (!change || generating) return;
    onUpdate(item.id, change, speed);
    setInstruction("");
    setEditing(false);
  }

  return (
    <div className="canvas-item-toolbar">
      <div className="canvas-item-meta">
        <span className="canvas-item-type">{typeLabel}</span>
        {generating && <span className="canvas-item-state">regenerating…</span>}
        {item.status === "failed" && <span className="canvas-item-state failed">failed</span>}
      </div>
      <div className="canvas-item-actions">
        {canUpdate && (
          <button
            type="button"
            className="canvas-icon-action"
            onClick={() => setEditing((open) => !open)}
            aria-label={`Edit ${item.title || typeLabel}`}
            aria-expanded={editing}
            disabled={generating}
          >
            <Pencil size={15} aria-hidden="true" />
            <span>Edit</span>
          </button>
        )}
        <CanvasDownloadMenu item={item} />
      </div>
      {editing && canUpdate && (
        <form className="canvas-edit-form" onSubmit={applyEdit}>
          <label className="sr-only" htmlFor={`canvas-edit-${item.id}`}>
            Change to apply to {item.title || typeLabel}
          </label>
          <input
            id={`canvas-edit-${item.id}`}
            ref={inputRef}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={`Change this ${typeLabel.toLowerCase()} (e.g. add a dark theme)`}
          />
          <select
            value={speed}
            onChange={(event) => setSpeed(event.target.value)}
            aria-label="Update mode"
          >
            <option value="fast">Fast</option>
            <option value="quality">Quality</option>
          </select>
          <button type="submit" disabled={!instruction.trim() || generating}>
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

function CanvasDownloadMenu({ item }) {
  const [busy, setBusy] = React.useState(false);
  const ready = item.status === "ready";

  function triggerDownload(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadSource() {
    if (busy) return;
    const { filename, mimeType } = canvasItemDownload(item);
    // mermaid + markdown carry their source inline; html/wireframe fetch the rendered document.
    if (item.type === "mermaid" || item.type === "markdown") {
      triggerDownload(filename, mimeType, item.content || "");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/canvas/${item.id}/content`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("download failed");
      const text = await response.text();
      triggerDownload(filename, mimeType, text);
    } catch {
      // best-effort
    } finally {
      setBusy(false);
    }
  }

  function downloadSvg() {
    const svg = document.querySelector(`#canvas-svg-${item.id} svg`);
    if (!svg) return;
    const { filename } = canvasItemDownload(item);
    const svgName = filename.replace(/\.[^.]+$/, "") + ".svg";
    triggerDownload(svgName, "image/svg+xml", svg.outerHTML);
  }

  if (!ready) return null;

  return (
    <div className="canvas-download-group">
      <button
        type="button"
        className="canvas-icon-action"
        onClick={downloadSource}
        aria-label={`Download ${item.title || canvasDefaultTitle(item.type)}`}
        disabled={busy}
      >
        <Download size={15} aria-hidden="true" />
        <span>Download</span>
      </button>
      {item.type === "mermaid" && (
        <button
          type="button"
          className="canvas-icon-action subtle"
          onClick={downloadSvg}
          aria-label={`Download ${item.title || "diagram"} as SVG`}
        >
          <Download size={15} aria-hidden="true" />
          <span>SVG</span>
        </button>
      )}
    </div>
  );
}

function CanvasItemView({ item }) {
  if (item.status === "generating") {
    return (
      <div className="canvas-skeleton">
        <div className="canvas-spinner" />
        <p>{item.title || "Canvas item"} - generating...</p>
      </div>
    );
  }

  if (item.status === "failed") {
    return (
      <div className="canvas-failed">
        <div className="canvas-failed-head">
          <AlertTriangle size={18} />
          <strong>{item.title || "Canvas item"} failed</strong>
        </div>
        {item.error && <p className="canvas-error">{item.error}</p>}
        {item.content && <pre className="markdown-preview">{item.content}</pre>}
      </div>
    );
  }

  if (item.type === "html" || item.type === "wireframe") {
    const isWireframe = item.type === "wireframe";
    return (
      <div className={`prototype-stage desktop canvas-html${isWireframe ? " canvas-wireframe" : ""}`}>
        <iframe
          className="prototype-frame"
          title={item.title || (isWireframe ? "Wireframe" : "Prototype")}
          src={`/api/canvas/${item.id}/content`}
          sandbox="allow-forms allow-modals allow-popups allow-scripts"
        />
      </div>
    );
  }

  if (item.type === "mermaid") {
    return <CanvasMermaid item={item} />;
  }

  return <CanvasMarkdown item={item} />;
}

function CanvasMermaid({ item }) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;
    if (!node) return undefined;
    node.innerHTML = "";

    renderMermaidSource(item.content || "", `canvas-${item.id}`)
      .then((svg) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true }
        });
      })
      .catch(() => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        const pre = document.createElement("pre");
        pre.className = "markdown-preview";
        pre.textContent = item.content || "Unable to render diagram.";
        containerRef.current.appendChild(pre);
      });

    return () => {
      cancelled = true;
    };
  }, [item.id, item.content]);

  return <div className="canvas-mermaid" id={`canvas-svg-${item.id}`} ref={containerRef} />;
}

function CanvasMarkdown({ item }) {
  const articleRef = React.useRef(null);
  const renderedHtml = React.useMemo(() => renderArtifactHtml(item.content || ""), [item.content]);

  React.useEffect(() => {
    if (!articleRef.current) return;
    const nodes = articleRef.current.querySelectorAll(".mermaid");
    if (!nodes.length) return;
    renderMermaid(nodes).catch(() => {});
  }, [renderedHtml]);

  return <article className="rendered-artifact canvas-markdown" ref={articleRef} dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}

function SoundWave({ active, speaking }) {
  return (
    <div className={speaking ? "sound-wave speaking" : active ? "sound-wave active" : "sound-wave"}>
      {Array.from({ length: 31 }).map((_, index) => (
        <span key={index} style={{ "--i": index }} />
      ))}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CallRow({ call }) {
  return (
    <article className="compact-row">
      <FileText size={18} />
      <div>
        <strong>{call.title}</strong>
        <span>{formatDate(call.startedAt)} - {call.transcript?.length || 0} turns</span>
      </div>
    </article>
  );
}

function JobList({ jobs, onRetry }) {
  if (!jobs.length) return <p className="muted">Queue is clear.</p>;

  return (
    <div className="job-list">
      {jobs.map((job) => (
        <article className="job-row" key={job.id}>
          {job.status === "completed" ? <CheckCircle2 size={18} /> : job.status === "failed" ? <AlertTriangle size={18} /> : <Clock size={18} />}
          <div>
            <strong>{job.title}</strong>
            <span>
              {job.status} - step {Math.min(job.stepIndex + 1, job.stepCount)}/{job.stepCount}
              {job.attempts ? ` - calls ${job.attempts}` : ""}
              {job.maxAttempts ? ` - retries ${job.failures || 0}/${job.maxAttempts}` : ""}
            </span>
            <div className="job-progress" aria-label={`${job.title} progress`}>
              <span style={{ width: `${progressPercent(job)}%` }} />
            </div>
            {job.progress && <small>{job.progress}</small>}
            {job.error && <small>{job.error}</small>}
            {job.status === "failed" && onRetry && (
              <button className="inline-action" onClick={() => onRetry(job.id)}>
                <RotateCcw size={16} />
                <span>Retry</span>
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function ActivityStream({ jobs, compact = false }) {
  const logs = collectJobLogs(jobs).slice(0, compact ? 6 : 8);

  return (
    <section className={compact ? "activity-stream compact" : "activity-stream"}>
      <div className="activity-head">
        <Activity size={17} />
        <strong>Execution Stream</strong>
      </div>
      <div className="activity-list">
        {logs.map((log) => (
          <article className={`activity-row ${log.type}`} key={`${log.jobId}-${log.id}`}>
            <span>{formatTime(log.at)}</span>
            <div>
              <strong>{log.jobTitle}</strong>
              <p>{log.message}</p>
            </div>
          </article>
        ))}
        {!logs.length && <p className="muted">No execution activity yet.</p>}
      </div>
    </section>
  );
}

function ArtifactMiniList({ artifacts, jobs, onRetry }) {
  return (
    <div className="compact-list">
      {artifacts.map((artifact) => (
        <article className="compact-row" key={artifact.id}>
          <FileText size={18} />
          <div>
            <strong>{artifact.title}</strong>
            <span>{formatDate(artifact.createdAt)}</span>
          </div>
        </article>
      ))}
      <JobList jobs={jobs} onRetry={onRetry} />
      {!artifacts.length && !jobs.length && <p className="muted">No work generated for this call.</p>}
    </div>
  );
}

function callTitle(calls, callId) {
  return calls.find((call) => call.id === callId)?.title || "Unknown call";
}

function collectJobLogs(jobs) {
  return jobs
    .flatMap((job) =>
      (job.logs || []).map((log) => ({
        ...log,
        jobId: job.id,
        jobTitle: job.title
      }))
    )
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

function progressPercent(job) {
  if (job.status === "completed") return 100;
  if (job.status === "failed") return Math.max(8, Math.round((Number(job.stepIndex || 0) / Math.max(1, Number(job.stepCount || 1))) * 100));
  const stepCount = Math.max(1, Number(job.stepCount || 1));
  const base = (Number(job.stepIndex || 0) / stepCount) * 100;
  return Math.min(96, Math.max(8, Math.round(base + (job.status === "running" ? 18 / stepCount : 0))));
}

function renderArtifactHtml(markdown = "") {
  const readingMarkdown = markdown
    .replace(/<!--\s*Cooper step[^>]*-->/gi, "\n\n---\n\n")
    .replace(/\n{3,}/g, "\n\n");

  return DOMPurify.sanitize(markdownRenderer.render(readingMarkdown), {
    ADD_ATTR: ["target", "rel"]
  });
}

async function renderMermaid(nodes) {
  const mermaid = await loadMermaid();
  await mermaid.run({ nodes });
}

async function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then((module) => {
      const mermaid = module.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          primaryColor: "#f8faf7",
          primaryTextColor: "#1b2421",
          primaryBorderColor: "#dce2dc",
          lineColor: "#69766f",
          secondaryColor: "#fff7db",
          tertiaryColor: "#f3f4ef"
        }
      });
      return mermaid;
    });
  }
  return mermaidLoader;
}

async function renderMermaidSource(source, id) {
  const mermaid = await loadMermaid();
  const safeId = `mmd-${String(id || "").replace(/[^a-zA-Z0-9_-]/g, "")}-${Math.random().toString(16).slice(2)}`;
  const { svg } = await mermaid.render(safeId, String(source || ""));
  return svg;
}

function composerPlaceholder(type) {
  if (type === "html") return "Describe a UI to prototype";
  if (type === "wireframe") return "Describe a layout to wireframe";
  return "Describe a diagram to draw";
}

function composerSubmitLabel(type) {
  if (type === "html") return "Ask Cooper to prototype this";
  if (type === "wireframe") return "Ask Cooper to wireframe this";
  return "Ask Cooper to diagram this";
}

function canvasDefaultTitle(type) {
  if (type === "html") return "Prototype";
  if (type === "wireframe") return "Wireframe";
  if (type === "markdown") return "Note";
  return "Diagram";
}

function normalizeSpeed(value) {
  return value === "quality" ? "quality" : "fast";
}

function deriveTitle(text = "") {
  const clean = String(text).trim().replace(/\s+/g, " ");
  if (!clean) return "Canvas item";
  return clean.length > 48 ? `${clean.slice(0, 45)}...` : clean;
}

function normalizeTime(value = "") {
  const clean = String(value).trim().toLowerCase();
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return clean;

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const suffix = match[3];

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function normalizeSpeaker(value) {
  const speaker = String(value || "").trim();
  if (!speaker || speaker === "speaker" || speaker.toLowerCase() === "user") return "Michael";
  if (speaker.toLowerCase() === "assistant") return "Cooper";
  return speaker;
}

function sameTranscriptTurn(left, right) {
  if (left.id && right.id && left.id === right.id) return true;
  if (left.responseId && right.responseId && left.responseId === right.responseId && left.speaker === right.speaker) return true;
  if (left.itemId && right.itemId && left.itemId === right.itemId && left.speaker === right.speaker) return true;
  return false;
}

function transcriptKey(event) {
  return [
    event.response_id || "response",
    event.item_id || "item",
    event.output_index ?? "output",
    event.content_index ?? "content"
  ].join(":");
}

function findBufferedTranscript(buffer, responseId) {
  for (const value of buffer.values()) {
    if (value.responseId === responseId && value.text?.trim()) return value;
  }
  return null;
}

function extractRealtimeResponseText(response) {
  const chunks = [];
  for (const item of response?.output || []) {
    if (item.type === "function_call") continue;
    for (const content of item.content || []) {
      if (typeof content.transcript === "string" && content.transcript.trim()) {
        chunks.push(content.transcript.trim());
      } else if (typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }
  return chunks.join("\n\n").trim();
}

function speakerClass(speaker = "") {
  return normalizeSpeaker(speaker).toLowerCase() === "cooper" ? "cooper-turn" : "michael-turn";
}

function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseSseData(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

createRoot(document.getElementById("root")).render(<App />);
