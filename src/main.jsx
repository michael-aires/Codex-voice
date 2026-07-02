import React from "react";
import { createRoot } from "react-dom/client";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { cooperInstructions } from "../cooperPrompt.js";
import { cooperToolDefinitions } from "../cooperTools.js";
import { createAudioResponseEvent } from "./realtimeEvents.js";
import { isCooperWakePhrase } from "./wakeWords.js";
import { buildCanvasCustomPrompt } from "./canvasPrompt.js";
import { resolveSelectedProject } from "./projectSelection.js";
import {
  collectJobLogs,
  jobApiLine,
  jobOpenArtifactId,
  jobStatusLine,
  progressPercent
} from "./jobTelemetry.js";
import {
  callModeLabel,
  callPromptPlaceholder,
  canvasStateLabel,
  wakeHint
} from "./callExperience.js";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  CheckCircle2,
  Copy,
  Clock,
  FileText,
  Files,
  ExternalLink,
  FolderKanban,
  Library,
  LockKeyhole,
  LogIn,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Mic,
  Phone,
  PhoneOff,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Upload,
  Wand2
} from "lucide-react";
import "./styles.css";

let mermaidLoader = null;

const canvasQuickActions = [
  { kind: "mermaid_diagram", label: "Diagram", icon: Files },
  { kind: "ui_wireframe", label: "Wireframe", icon: MonitorSmartphone },
  { kind: "html_prototype", label: "Prototype", icon: Wand2 },
  { kind: "aires_requirements", label: "Requirements", icon: FileText }
];

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

const realtimeSession = {
  type: "realtime",
  model: "gpt-realtime-2",
  instructions: cooperInstructions,
  reasoning: { effort: "low" },
  audio: {
    input: {
      noise_reduction: { type: "far_field" },
      transcription: {
        model: "gpt-4o-mini-transcribe",
        prompt: "Meeting transcript for Cooper, AIRES, CTO, CPO, product, engineering, software delivery, roadmap, calendar."
      },
      turn_detection: {
        type: "semantic_vad",
        eagerness: "low",
        create_response: false,
        interrupt_response: false
      }
    },
    output: {
      voice: "cedar"
    }
  },
  tools: cooperToolDefinitions,
  tool_choice: "auto"
};

function buildSessionUpdate(projectContext = "") {
  return {
    type: "session.update",
    session: {
      ...realtimeSession,
      instructions: projectContext ? `${cooperInstructions}\n\n${projectContext}` : cooperInstructions
    }
  }
}

function App() {
  const [entered, setEntered] = React.useState(() => localStorage.getItem("cooper.entered") === "true");
  const [authChecked, setAuthChecked] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState("");
  const [view, setView] = React.useState("home");
  const [state, setState] = React.useState({ calls: [], projects: [], artifacts: [], jobs: [], recipes: [], limits: {}, arcade: emptyArcadeState(), mcpApps: { servers: [] } });
  const [selectedCallId, setSelectedCallId] = React.useState(null);
  const [selectedProjectId, setSelectedProjectId] = React.useState(null);
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
  const pcRef = React.useRef(null);
  const dcRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const activeCallRef = React.useRef(null);
  const callStartedAtRef = React.useRef(null);
  const activeProjectContextRef = React.useRef("");
  const transcriptsRef = React.useRef([]);
  const outputTranscriptBuffersRef = React.useRef(new Map());
  const textTranscriptBuffersRef = React.useRef(new Map());
  const persistedResponseIdsRef = React.useRef(new Set());
  const responseInProgressRef = React.useRef(false);
  const pendingResponseRef = React.useRef(null);
  const lastResponseEventRef = React.useRef(null);
  const knownCompletedJobsRef = React.useRef(new Set());
  const didLoadStateRef = React.useRef(false);
  const selectedCallIdRef = React.useRef(null);
  const selectedProjectIdRef = React.useRef(null);
  const selectedArtifactIdRef = React.useRef(null);

  React.useEffect(() => {
    selectedCallIdRef.current = selectedCallId;
  }, [selectedCallId]);

  React.useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  React.useEffect(() => {
    selectedArtifactIdRef.current = selectedArtifactId;
  }, [selectedArtifactId]);

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

  React.useEffect(() => {
    if (!authenticated || !entered) return;
    refreshState();
    const id = window.setInterval(refreshState, 4000);
    return () => window.clearInterval(id);
  }, [authenticated, entered]);

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
    return () => source.close();
  }, [authenticated, entered]);

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
      if (!selectedCallIdRef.current && next.calls.length) {
        selectedCallIdRef.current = next.calls[0].id;
        setSelectedCallId(next.calls[0].id);
      }
      if (!selectedArtifactIdRef.current && next.artifacts.length) {
        selectArtifact(next.artifacts[0].id);
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
    setState({ calls: [], projects: [], artifacts: [], jobs: [], recipes: [], limits: {}, arcade: emptyArcadeState(), mcpApps: { servers: [] } });
    setSelectedCallId(null);
    setSelectedProjectId(null);
    selectArtifact(null);
    selectedCallIdRef.current = null;
    selectedProjectIdRef.current = null;
    setArtifactContent("");
    setEvents([]);
    setTranscripts([]);
    didLoadStateRef.current = false;
    knownCompletedJobsRef.current = new Set();
  }

  function enterApp() {
    localStorage.setItem("cooper.entered", "true");
    setEntered(true);
  }

  function selectArtifact(id) {
    selectedArtifactIdRef.current = id;
    setSelectedArtifactId(id);
  }

  function selectCall(id) {
    selectedCallIdRef.current = id;
    setSelectedCallId(id);
  }

  function selectProject(id) {
    selectedProjectIdRef.current = id;
    setSelectedProjectId(id);
  }

  function openCall(id) {
    selectCall(id);
    setView("library");
  }

  function openArtifact(id) {
    selectArtifact(id);
    setView("artifacts");
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

  async function handleFunctionCall(call) {
    let args = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      args = {};
    }

    addEvent("Tool", `${call.name} started.`);
    const result = await executeCooperTool(call.name, args);
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      }
    });
    const toolResponseEvent = createAudioResponseEvent("tool_result");
    lastResponseEventRef.current = toolResponseEvent;
    if (sendEvent(toolResponseEvent)) {
      responseInProgressRef.current = true;
      setStatus("Cooper preparing");
    }
    addEvent("Tool", `${call.name} returned.`);
  }

  async function executeCooperTool(name, args) {
    try {
      const response = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name,
          arguments: args,
          callId: activeCallRef.current?.id || ""
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return payload.output || {
          status: "error",
          tool: name,
          message: payload.error || "Cooper tool execution failed."
        };
      }
      if (payload.output?.artifactId) {
        selectArtifact(payload.output.artifactId);
        await refreshState();
      }
      return payload.output;
    } catch (error) {
      return {
        status: "error",
        tool: name,
        message: error.message || "Cooper tool execution failed."
      };
    }
  }

  function requestCooper(text = "", reason = "manual") {
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

    const responseEvent = createAudioResponseEvent(userText ? "typed_prompt" : reason);
    if (responseInProgressRef.current) {
      pendingResponseRef.current = responseEvent;
      addEvent("Cooper", userText ? "Queued after current response." : "Ask queued after current response.");
      return;
    }

    lastResponseEventRef.current = responseEvent;
    const sent = sendEvent(responseEvent);

    if (sent) {
      responseInProgressRef.current = true;
      setStatus("Cooper preparing");
      addEvent("Cooper", userText || "Called by voice.");
    }
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

      if (isCooperWakePhrase(text)) {
        addEvent("Wake", "Cooper was directly invited.");
        requestCooper("", "wake_phrase");
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
      responseInProgressRef.current = true;
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
      responseInProgressRef.current = false;
      setSpeaking(false);
      setStatus("Listening");
      const calls = event.response?.output?.filter((item) => item.type === "function_call") || [];
      if (calls.length) {
        responseInProgressRef.current = true;
      }
      calls.forEach(handleFunctionCall);
      finalizeResponseTranscriptFallback(event.response);
      if (calls.length) return;
      const pending = pendingResponseRef.current;
      pendingResponseRef.current = null;
      if (pending) {
        window.setTimeout(() => {
          lastResponseEventRef.current = pending;
          if (sendEvent(pending)) {
            responseInProgressRef.current = true;
            setStatus("Cooper preparing");
            addEvent("Cooper", "Queued ask sent.");
          }
        }, 80);
      }
      return;
    }

    if (event.type === "error") {
      const message = event.error?.message || "Realtime error";
      if (/active response/i.test(message)) {
        if (lastResponseEventRef.current) {
          pendingResponseRef.current = lastResponseEventRef.current;
        }
        responseInProgressRef.current = true;
        setStatus("Cooper preparing");
        addEvent("Cooper", "Already answering; queued the latest ask.");
        return;
      } else {
        responseInProgressRef.current = false;
      }
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
    responseInProgressRef.current = false;
    pendingResponseRef.current = null;
    setView("call");

    try {
      setStatus("Microphone");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      const projectId = selectedProject?.id || "";
      const projectContext = await fetchProjectContext(projectId);
      activeProjectContextRef.current = projectContext;
      const call = await createCall(projectId);
      activeCallRef.current = call;
      callStartedAtRef.current = Date.now();

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setConnected(true);
        setConnecting(false);
        setStatus("Configuring");
        sendEvent(buildSessionUpdate(activeProjectContextRef.current));
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

      const sessionUrl = projectId ? `/session?projectId=${encodeURIComponent(projectId)}` : "/session";
      const sdpResponse = await fetch(sessionUrl, {
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
      addEvent("Connection", describeConnectionError(error));
      await endCall({ failed: true });
    }
  }

  async function createCall(projectId = "") {
    const response = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Cooper call ${new Date().toLocaleString()}`,
        startedAt: new Date().toISOString(),
        projectId
      })
    });

    if (!response.ok) throw new Error("Could not create local call record.");
    const payload = await response.json();
    await refreshState();
    return payload.call;
  }

  async function fetchProjectContext(projectId = "") {
    if (!projectId) return "";
    try {
      const response = await fetch(`/api/projects/${projectId}/context`, { credentials: "same-origin" });
      if (!response.ok) return "";
      const payload = await response.json();
      return payload.context || "";
    } catch {
      return "";
    }
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
    activeProjectContextRef.current = "";
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
    requestCooper(text, "typed_prompt");
    setPrompt("");
  }

  async function generateArtifact(callId, kind, customPrompt = "", options = {}) {
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
    if (options.stay) {
      addEvent("Canvas", `${artifactLabel(kind)} queued.`);
    } else {
      setView("artifacts");
    }
  }

  async function generateLiveCanvasArtifact(kind, request = "") {
    const call = activeCallRef.current;
    if (!call?.id) {
      addEvent("Canvas", "Join the call before creating canvas work.");
      return;
    }

    const customPrompt = buildCanvasCustomPrompt({
      request,
      projectContext: activeProjectContextRef.current,
      transcriptEntries: transcriptsRef.current,
      fallbackPrompt: defaultCanvasPrompt(kind)
    });

    await generateArtifact(call.id, kind, customPrompt, { stay: true });
  }

  async function presentAiresExample(exampleId, options = {}) {
    const call = activeCallRef.current;
    if (!call?.id) {
      addEvent("Canvas", "Join the call before presenting an AIRES example.");
      return;
    }

    try {
      const response = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: "present_aires_example",
          arguments: {
            example_id: exampleId,
            mode: options.mode || "show",
            reason: options.reason || "Michael opened this AIRES example from the live canvas.",
            context: options.context || transcriptsRef.current.slice(-6).map((entry) => `${entry.speaker}: ${entry.text}`).join("\n")
          },
          callId: call.id
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not present AIRES example.");
      if (payload.output?.artifactId) selectArtifact(payload.output.artifactId);
      await refreshState();
      addEvent("Canvas", payload.output?.message || "AIRES example is on the canvas.");
    } catch (error) {
      addEvent("Canvas", error.message);
    }
  }

  async function ensureLiveContextProject() {
    if (selectedProject?.id) return selectedProject.id;

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        title: "Live Cooper context",
        description: "Context added during a live Cooper call."
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not create a live context project.");
    selectProject(payload.project.id);
    return payload.project.id;
  }

  async function refreshLiveContext(projectId) {
    const response = await fetch(`/api/projects/${projectId}/context`, { credentials: "same-origin" });
    if (!response.ok) return "";
    const payload = await response.json().catch(() => ({}));
    const context = payload.context || "";
    if (context) {
      activeProjectContextRef.current = context;
      if (dcRef.current?.readyState === "open") {
        sendEvent(buildSessionUpdate(context));
      }
    }
    return context;
  }

  async function addLiveContext({ title, content }) {
    const text = String(content || "").trim();
    if (!text) return;

    try {
      const projectId = await ensureLiveContextProject();
      const response = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: title || "Live call context",
          content: text,
          sourceType: "live_call"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not add live context.");
      await refreshLiveContext(projectId);
      await refreshState();
      addEvent("Context", `${payload.source?.title || "Context"} added to Cooper.`);
    } catch (error) {
      addEvent("Context", error.message);
    }
  }

  async function uploadLiveContext(file) {
    if (!file) return;

    try {
      const projectId = await ensureLiveContextProject();
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(`/api/projects/${projectId}/uploads`, {
        method: "POST",
        credentials: "same-origin",
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not upload live context.");
      await refreshLiveContext(projectId);
      await refreshState();
      addEvent("Context", `${payload.source?.title || file.name} added to Cooper.`);
    } catch (error) {
      addEvent("Context", error.message);
    }
  }

  async function retryJob(jobId) {
    const response = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    if (!response.ok) {
      addEvent("Retry", "Could not retry job.");
      return;
    }
    await refreshState();
  }

  async function createProject({ title, description }) {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title, description })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create project.");
      selectProject(payload.project.id);
      addEvent("Project", `${payload.project.title} created.`);
      await refreshState();
    } catch (error) {
      addEvent("Project", error.message);
    }
  }

  async function addProjectText(projectId, { title, content }) {
    try {
      const response = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title, content, sourceType: "paste" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not add project context.");
      addEvent("Project", `${payload.source.title} ingested.`);
      await refreshState();
    } catch (error) {
      addEvent("Project", error.message);
    }
  }

  async function uploadProjectFile(projectId, file) {
    if (!file) return;
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(`/api/projects/${projectId}/uploads`, {
        method: "POST",
        credentials: "same-origin",
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not ingest file.");
      addEvent("Project", `${payload.source.title} uploaded.`);
      await refreshState();
    } catch (error) {
      addEvent("Project", error.message);
    }
  }

  async function authorizeArcadeTool(name) {
    try {
      const response = await fetch("/api/tools/arcade/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not start Arcade authorization.");
      if (payload.arcade) setState((current) => ({ ...current, arcade: payload.arcade }));
      if (payload.authorization?.authorizationUrl) {
        window.open(payload.authorization.authorizationUrl, "_blank", "noopener,noreferrer");
      }
      addEvent("Arcade", `${toolLabel(name)} authorization ${payload.authorization?.status || "started"}.`);
      await refreshState();
    } catch (error) {
      addEvent("Arcade", error.message);
    }
  }

  async function authorizeAllArcadeTools() {
    try {
      const response = await fetch("/api/tools/arcade/authorize-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not start Arcade authorizations.");
      if (payload.arcade) setState((current) => ({ ...current, arcade: payload.arcade }));
      const pending = (payload.results || []).filter((item) => item.authorization?.authorizationUrl);
      addEvent("Arcade", pending.length ? `${pending.length} Arcade connection link${pending.length === 1 ? "" : "s"} ready.` : "Arcade tools checked.");
      await refreshState();
    } catch (error) {
      addEvent("Arcade", error.message);
    }
  }

  async function checkArcadeTool(name) {
    try {
      const response = await fetch("/api/tools/arcade/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.arcade) setState((current) => ({ ...current, arcade: payload.arcade }));
      if (!response.ok) throw new Error(payload.error || "Could not check Arcade authorization.");
      addEvent("Arcade", `${toolLabel(name)} is ${payload.authorization?.status || "unknown"}.`);
      await refreshState();
    } catch (error) {
      addEvent("Arcade", error.message);
    }
  }

  const selectedCall = state.calls.find((call) => call.id === selectedCallId) || state.calls[0] || null;
  const selectedProject = resolveSelectedProject(state.projects, selectedProjectId);
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
        project={selectedProject}
        speaking={speaking}
        hearing={hearing}
        transcripts={transcripts}
        events={events}
        activeCall={activeCallRef.current}
        artifacts={state.artifacts}
        jobs={state.jobs}
        selectedArtifact={selectedArtifact}
        artifactContent={artifactContent}
        prompt={prompt}
        setPrompt={setPrompt}
        onSubmitPrompt={submitPrompt}
        onConnect={connect}
        onEndCall={() => endCall()}
        onCallCooper={() => requestCooper("", "manual_ask")}
        onSelectArtifact={selectArtifact}
        onGenerateCanvas={generateLiveCanvasArtifact}
        onPresentExample={presentAiresExample}
        onAddContext={addLiveContext}
        onUploadContext={uploadLiveContext}
        onRetryJob={retryJob}
        onBack={() => setView("home")}
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
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")} aria-label="Home">
            <Sparkles size={18} />
            <span>Home</span>
          </button>
          <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")} aria-label="Projects">
            <FolderKanban size={18} />
            <span>Projects</span>
          </button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")} aria-label="Calls">
            <Library size={18} />
            <span>Calls</span>
          </button>
          <button className={view === "artifacts" ? "active" : ""} onClick={() => setView("artifacts")} aria-label="Work">
            <Files size={18} />
            <span>Work</span>
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")} aria-label="Settings">
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </nav>
        <button className="icon-button" onClick={logout} aria-label="Lock Cooper">
          <LogOut size={18} />
        </button>
      </header>

      {view === "home" && (
        <HomeView
          calls={state.calls}
          projects={state.projects}
          artifacts={state.artifacts}
          jobs={state.jobs}
          activeJobs={activeJobs}
          limits={state.limits}
          notificationPermission={notificationPermission}
          latestCall={latestCall}
          activeProject={selectedProject}
          onStartCall={connect}
          onOpenProjects={() => setView("projects")}
          onOpenCalls={() => setView("library")}
          onOpenWork={() => setView("artifacts")}
          onOpenCall={openCall}
          onOpenArtifact={openArtifact}
          onGenerate={generateArtifact}
          onEnableNotifications={enableNotifications}
          onRetryJob={retryJob}
        />
      )}

      {view === "projects" && (
        <ProjectsView
          projects={state.projects}
          selectedProject={selectedProject}
          onSelectProject={selectProject}
          onCreateProject={createProject}
          onAddText={addProjectText}
          onUploadFile={uploadProjectFile}
          onStartCall={connect}
        />
      )}

      {view === "library" && (
        <LibraryView
          calls={state.calls}
          artifacts={state.artifacts}
          jobs={state.jobs}
          selectedCall={selectedCall}
          onSelectCall={selectCall}
          onOpenArtifact={openArtifact}
          onGenerate={generateArtifact}
          onRetryJob={retryJob}
        />
      )}

      {view === "artifacts" && (
        <ArtifactView
          artifacts={state.artifacts}
          jobs={state.jobs}
          calls={state.calls}
          selectedArtifact={selectedArtifact}
          artifactContent={artifactContent}
          onSelectArtifact={selectArtifact}
          onGenerate={generateArtifact}
          onRefresh={refreshState}
          onRetryJob={retryJob}
        />
      )}

      {view === "settings" && (
        <SettingsView
          arcade={state.arcade || emptyArcadeState()}
          onAuthorize={authorizeArcadeTool}
          onAuthorizeAll={authorizeAllArcadeTools}
          onCheck={checkArcadeTool}
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

function SettingsView({ arcade, onAuthorize, onAuthorizeAll, onCheck }) {
  const mappedTools = arcade.tools.filter((tool) => tool.mapped);

  return (
    <section className="settings-view">
      <div className="settings-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Arcade MCPs</h1>
        </div>
        <button className="primary-action" onClick={onAuthorizeAll} disabled={!arcade.configured || !mappedTools.length}>
          <ShieldCheck size={20} />
          <span>Pre-auth All</span>
        </button>
      </div>

      <section className="settings-summary">
        <Metric label="API Key" value={arcade.configured ? "On" : "Off"} />
        <Metric label="Mapped" value={mappedTools.length} />
        <Metric label="Writes" value={arcade.writesEnabled ? "On" : "Off"} />
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>Tool Access</h2>
          <span className="settings-user">{arcade.userId || "No user"}</span>
        </div>
        <div className="arcade-tool-list">
          {arcade.tools.map((tool) => (
            <article className="arcade-tool" key={tool.name}>
              <div className="arcade-tool-main">
                <div>
                  <span className={`status-pill ${statusClass(tool.status)}`}>{statusLabel(tool.status)}</span>
                  <h3>{tool.label}</h3>
                </div>
                <small>{tool.arcadeToolName || tool.mappingEnv}</small>
              </div>
              <p>{tool.description}</p>
              <div className="arcade-actions">
                <button className="secondary-action" onClick={() => onAuthorize(tool.name)} disabled={!tool.mapped || !tool.configured}>
                  <ShieldCheck size={18} />
                  <span>{tool.status === "completed" ? "Re-auth" : "Connect"}</span>
                </button>
                <button
                  className="secondary-action"
                  onClick={() => onCheck(tool.name)}
                  disabled={!tool.authorization?.authorizationId || !tool.configured}
                >
                  <RefreshCw size={18} />
                  <span>Check</span>
                </button>
                {tool.authorization?.authorizationUrl && tool.status !== "completed" && (
                  <a className="secondary-link" href={tool.authorization.authorizationUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={18} />
                    <span>Open</span>
                  </a>
                )}
              </div>
              {tool.authorization?.error && <small className="tool-error">{tool.authorization.error}</small>}
            </article>
          ))}
          {!arcade.tools.length && <p className="muted">No Arcade tools configured.</p>}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>Recent Tool Calls</h2>
          <Activity size={18} />
        </div>
        <div className="tool-call-list">
          {(arcade.recentToolCalls || []).map((call) => (
            <article className="tool-call-row" key={call.id}>
              <div>
                <strong>{toolLabel(call.toolName)}</strong>
                <span>{call.arcadeToolName || call.toolName}</span>
              </div>
              <span className={`status-pill ${statusClass(call.status)}`}>{statusLabel(call.status)}</span>
            </article>
          ))}
          {!arcade.recentToolCalls?.length && <p className="muted">No tool calls yet.</p>}
        </div>
      </section>
    </section>
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
  projects,
  artifacts,
  jobs,
  activeJobs,
  limits,
  notificationPermission,
  latestCall,
  activeProject,
  onStartCall,
  onOpenProjects,
  onOpenCalls,
  onOpenWork,
  onOpenCall,
  onOpenArtifact,
  onGenerate,
  onEnableNotifications,
  onRetryJob
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
          <button className="ghost-action" onClick={onOpenProjects}>
            <FolderKanban size={20} />
            <span>{activeProject ? activeProject.title : "Projects"}</span>
          </button>
          <button className="ghost-action" onClick={onEnableNotifications}>
            {notificationPermission === "granted" ? <BellRing size={20} /> : <Bell size={20} />}
            <span>{notificationPermission === "granted" ? "Notifications On" : "Notify Me"}</span>
          </button>
        </div>
      </div>

      <div className="metric-strip">
        <Metric label="Calls" value={calls.length} />
        <Metric label="Projects" value={projects.length} />
        <Metric label="Artifacts" value={artifacts.length} />
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
            <CallRow key={call.id} call={call} onOpen={onOpenCall} />
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
        <JobList jobs={jobs.slice(0, 5)} onRetry={onRetryJob} onOpenArtifact={onOpenArtifact} />
        <ActivityStream jobs={jobs} />
      </section>
    </section>
  );
}

function CallScreen({
  connected,
  connecting,
  status,
  project,
  speaking,
  hearing,
  transcripts,
  events,
  activeCall,
  artifacts,
  jobs,
  selectedArtifact,
  artifactContent,
  prompt,
  setPrompt,
  onSubmitPrompt,
  onConnect,
  onEndCall,
  onCallCooper,
  onSelectArtifact,
  onGenerateCanvas,
  onPresentExample,
  onAddContext,
  onUploadContext,
  onRetryJob,
  onBack
  }) {
    const mode = speaking ? "speaking" : hearing ? "hearing" : connected ? "listening" : "idle";
    const modeLabel = callModeLabel({ speaking, hearing, connecting, connected });
    const hint = wakeHint(connected);

    return (
      <main className={`call-screen ${mode}`}>
      <section className="call-rail" aria-label="Cooper call controls">
        <header className="call-topbar">
          <button className="icon-button inverted" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="call-status">
            <Radio size={18} />
            <span>{status}</span>
          </div>
          <button className="icon-button inverted danger-text" onClick={onEndCall} aria-label="End call">
            <PhoneOff size={20} />
          </button>
        </header>

          <section className="wave-stage">
            <div className="call-label">Cooper</div>
            {project && <div className="call-project">{project.title}</div>}
            <SoundWave active={speaking || hearing || connecting} speaking={speaking} />
            <p>{modeLabel}</p>
            <div className="wake-strip" aria-label="Cooper wake behavior">
              <span>{hint.label}</span>
              <strong>{hint.value}</strong>
              <span>{hint.detail}</span>
            </div>
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
                <span>Wake Cooper</span>
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
                placeholder={callPromptPlaceholder(connected)}
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
      </section>

      <CallCanvas
        activeCall={activeCall}
        project={project}
        connected={connected}
        artifacts={artifacts}
        jobs={jobs}
        selectedArtifact={selectedArtifact}
        artifactContent={artifactContent}
        onSelectArtifact={onSelectArtifact}
        onGenerateCanvas={onGenerateCanvas}
        onPresentExample={onPresentExample}
        onAddContext={onAddContext}
        onUploadContext={onUploadContext}
        onRetryJob={onRetryJob}
      />
    </main>
  );
}

function CallCanvas({
  activeCall,
  project,
  connected,
  artifacts,
  jobs,
  selectedArtifact,
  artifactContent,
  onSelectArtifact,
  onGenerateCanvas,
  onPresentExample,
  onAddContext,
  onUploadContext,
  onRetryJob
}) {
  const [activeTab, setActiveTab] = React.useState("preview");
  const [artifactMode, setArtifactMode] = React.useState("rendered");
  const [buildKind, setBuildKind] = React.useState("mermaid_diagram");
  const [canvasPrompt, setCanvasPrompt] = React.useState("");
  const [contextTitle, setContextTitle] = React.useState("");
  const [contextText, setContextText] = React.useState("");
  const [examples, setExamples] = React.useState([]);
  const [selectedExampleId, setSelectedExampleId] = React.useState("");
  const [exampleHtml, setExampleHtml] = React.useState("");
  const [examplesStatus, setExamplesStatus] = React.useState("idle");
  const fileInputRef = React.useRef(null);
  const callId = activeCall?.id || "";
    const callArtifacts = artifacts.filter((artifact) => artifact.callId === callId);
    const callJobs = jobs.filter((job) => job.callId === callId);
    const activeJobCount = callJobs.filter((job) => ["queued", "running"].includes(job.status)).length;
    const visibleArtifact = selectedArtifact?.callId === callId ? selectedArtifact : callArtifacts[0] || null;
    const visibleContent = visibleArtifact?.id === selectedArtifact?.id ? artifactContent : "";
    const selectedExample = examples.find((example) => example.id === selectedExampleId) || examples[0] || null;
    const hasTypedBuildContext = Boolean(canvasPrompt.trim());
    const sourceTitle = hasTypedBuildContext
      ? "Typed context is primary"
      : project?.title
        ? `Fallback: ${project.title}`
        : "Fallback: live transcript only";
    const sourceDetail = hasTypedBuildContext
      ? "Cooper will build from this text first. Selected project context and transcript are only supporting material."
      : project?.title
        ? "Leave the prompt blank to use this selected project plus the current call transcript."
        : "Paste context, add live context, or select a project if this artifact needs more than the conversation.";

  React.useEffect(() => {
    if (visibleArtifact?.id && selectedArtifact?.id !== visibleArtifact.id) {
      onSelectArtifact(visibleArtifact.id);
    }
  }, [visibleArtifact?.id, selectedArtifact?.id, onSelectArtifact]);

  React.useEffect(() => {
    setArtifactMode(visibleArtifact?.outputType === "html" ? "preview" : visibleArtifact?.outputType === "mcp_app" ? "app" : "rendered");
  }, [visibleArtifact?.id, visibleArtifact?.outputType]);

  React.useEffect(() => {
    let active = true;
    setExamplesStatus("loading");
    fetch("/api/aires/examples", { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load AIRES examples.");
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        const nextExamples = Array.isArray(payload.examples) ? payload.examples : [];
        setExamples(nextExamples);
        setSelectedExampleId((current) => current || nextExamples[0]?.id || "");
        setExamplesStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setExamplesStatus(error.message || "Could not load AIRES examples.");
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!selectedExample?.id) {
      setExampleHtml("");
      return undefined;
    }

    let active = true;
    setExamplesStatus("loading");
    fetch(`/api/aires/examples/${selectedExample.id}`, { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the selected AIRES example.");
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        setExampleHtml(payload.example?.html || "");
        setExamplesStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setExampleHtml("");
        setExamplesStatus(error.message || "Could not load the selected AIRES example.");
      });
    return () => {
      active = false;
    };
  }, [selectedExample?.id]);

  function submitCanvas(event) {
    event.preventDefault();
    queueCanvasBuild(buildKind, canvasPrompt);
    setCanvasPrompt("");
  }

  function queueCanvasBuild(kind, request = "") {
    setBuildKind(kind);
    onGenerateCanvas(kind, request);
    setActiveTab("activity");
  }

  function generateSelectedExample() {
    if (!selectedExample) return;
    queueCanvasBuild(selectedExample.recipeKind || "aires_requirements", buildExamplePrompt(selectedExample, canvasPrompt));
  }

  function presentSelectedExample() {
    if (!selectedExample || !onPresentExample) return;
    onPresentExample(selectedExample.id, {
      mode: "show",
      reason: `Michael opened ${selectedExample.title} from the live canvas.`,
      context: canvasPrompt
    });
    setActiveTab("preview");
  }

  function submitContext(event) {
    event.preventDefault();
    if (!contextText.trim()) return;
    onAddContext({
      title: contextTitle || "Live call context",
      content: contextText
    });
    setContextTitle("");
    setContextText("");
  }

  function uploadContext(event) {
    const file = event.target.files?.[0];
    if (file) onUploadContext(file);
    event.target.value = "";
  }

  return (
    <aside className="call-canvas" aria-label="Cooper collaboration canvas">
      <div className="canvas-head">
        <div>
          <p className="eyebrow">Live Canvas</p>
          <h2>{visibleArtifact?.title || "Collaborate visually"}</h2>
        </div>
          <span className={connected ? "canvas-state live" : "canvas-state"}>{canvasStateLabel({ connected, activeJobCount })}</span>
        </div>

      <div className="canvas-tabs" role="tablist" aria-label="Canvas sections">
        <button className={activeTab === "preview" ? "active" : ""} onClick={() => setActiveTab("preview")} role="tab">
          Preview
        </button>
        <button className={activeTab === "build" ? "active" : ""} onClick={() => setActiveTab("build")} role="tab">
          Build
        </button>
        <button className={activeTab === "context" ? "active" : ""} onClick={() => setActiveTab("context")} role="tab">
          Context
        </button>
        <button className={activeTab === "examples" ? "active" : ""} onClick={() => setActiveTab("examples")} role="tab">
          Examples
        </button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} role="tab">
          Activity
        </button>
      </div>

      {activeTab === "preview" && (
        <div className="canvas-body">
          <div className="canvas-preview-grid">
            <section className="canvas-preview-main">
              {callArtifacts.length > 0 && (
                <div className="canvas-artifact-tabs">
                  {callArtifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      className={visibleArtifact?.id === artifact.id ? "active" : ""}
                      onClick={() => onSelectArtifact(artifact.id)}
                    >
                      {artifact.title}
                    </button>
                  ))}
                </div>
              )}

              {visibleArtifact ? (
                <ArtifactDocument
                  artifact={visibleArtifact}
                  mode={artifactMode}
                  onModeChange={setArtifactMode}
                  content={visibleContent}
                  title={visibleArtifact.title}
                />
                ) : (
                  <div className="canvas-empty large">
                    <Files size={28} />
                    <strong>Nothing on the canvas yet.</strong>
                    <p>Cooper can bring diagrams, prototypes, requirements, or AIRES examples forward while the call keeps moving.</p>
                    <div className="quick-canvas-actions" aria-label="Canvas quick actions">
                      {canvasQuickActions.map(({ kind, label, icon: Icon }) => (
                        <button key={kind} onClick={() => queueCanvasBuild(kind)} disabled={!callId}>
                          <Icon size={17} />
                          <span>{label}</span>
                        </button>
                      ))}
                      <button onClick={() => setActiveTab("examples")} disabled={!callId}>
                        <Library size={17} />
                        <span>Examples</span>
                      </button>
                    </div>
                  </div>
                )}
            </section>

            <aside className="canvas-preview-side">
              <div className="canvas-section-head">
                <Activity size={17} />
                <strong>Running work</strong>
              </div>
              <JobList jobs={callJobs} onRetry={onRetryJob} />
              <ActivityStream jobs={callJobs} compact />
            </aside>
          </div>
        </div>
      )}

      {activeTab === "build" && (
        <div className="canvas-body">
          <div className="canvas-section-head">
            <Wand2 size={17} />
            <strong>Select what Cooper should build</strong>
          </div>

          <div className="canvas-actions">
            <button className={buildKind === "mermaid_diagram" ? "active" : ""} onClick={() => setBuildKind("mermaid_diagram")} disabled={!callId}>
              <Files size={17} />
              <span>Diagram</span>
            </button>
            <button className={buildKind === "ui_wireframe" ? "active" : ""} onClick={() => setBuildKind("ui_wireframe")} disabled={!callId}>
              <MonitorSmartphone size={17} />
              <span>Wireframe</span>
            </button>
            <button className={buildKind === "html_prototype" ? "active" : ""} onClick={() => setBuildKind("html_prototype")} disabled={!callId}>
              <Wand2 size={17} />
              <span>Prototype</span>
            </button>
            <button className={buildKind === "aires_requirements" ? "active" : ""} onClick={() => setBuildKind("aires_requirements")} disabled={!callId}>
              <FileText size={17} />
              <span>Requirements</span>
            </button>
          </div>

          <form className="canvas-prompt-form expanded" onSubmit={submitCanvas}>
            <textarea
              value={canvasPrompt}
              onChange={(event) => setCanvasPrompt(event.target.value)}
              placeholder="Paste the exact context or ask for the artifact. Typed text is primary. Leave blank to use the live transcript and any explicitly selected project."
              rows={5}
            />
            <button type="submit" disabled={!callId}>
              <Send size={17} />
              <span>Generate</span>
            </button>
          </form>

          <div className="context-mode-card source-card">
            <strong>{sourceTitle}</strong>
            <span>{sourceDetail}</span>
          </div>

          <div className="flow-grid">
            {examples.map((example) => (
              <button
                className={selectedExampleId === example.id ? "flow-card active" : "flow-card"}
                key={example.id}
                onClick={() => {
                  setSelectedExampleId(example.id);
                  setBuildKind(example.recipeKind || "aires_requirements");
                }}
              >
                <span>{example.category}</span>
                <strong>{example.title}</strong>
                <small>{example.flow}</small>
              </button>
            ))}
          </div>

          {selectedExample && (
            <div className="context-mode-card">
              <strong>{selectedExample.title}</strong>
              <span>{selectedExample.description}</span>
              <div className="inline-actions">
                <button className="primary-action compact" onClick={generateSelectedExample} disabled={!callId}>
                  <Wand2 size={17} />
                  <span>Generate this flow</span>
                </button>
                <button className="secondary-action compact" onClick={() => setActiveTab("examples")}>
                  <ExternalLink size={17} />
                  <span>Preview example</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "context" && (
        <div className="canvas-body">
          <div className="context-mode-card">
            <strong>{project?.title || "Live context"}</strong>
            <span>Paste or upload sprint tickets, feature epics, agent output, requirements drafts, PDFs, and notes. Cooper refreshes the live session context after ingestion.</span>
          </div>

          <form className="live-context-form" onSubmit={submitContext}>
            <input
              value={contextTitle}
              onChange={(event) => setContextTitle(event.target.value)}
              placeholder="Context title"
            />
            <textarea
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
              placeholder="Paste sprint tickets, feature epics, agent output, customer notes, architecture notes, PRD fragments, or AI-generated research"
              rows={10}
            />
            <button className="primary-action" type="submit" disabled={!contextText.trim()}>
              <FileText size={18} />
              <span>Add Context</span>
            </button>
          </form>

          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
            onChange={uploadContext}
          />
          <button className="secondary-action upload-action" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} />
            <span>Upload Markdown, Text, or PDF</span>
          </button>
        </div>
      )}

      {activeTab === "examples" && (
        <div className="canvas-body">
          <div className="example-layout">
            <aside className="example-list">
              {examples.map((example) => (
                <button
                  className={selectedExampleId === example.id ? "example-button active" : "example-button"}
                  key={example.id}
                  onClick={() => setSelectedExampleId(example.id)}
                >
                  <span>{example.category}</span>
                  <strong>{example.title}</strong>
                </button>
              ))}
              {!examples.length && <p className="muted">{examplesStatus === "loading" ? "Loading examples." : "No examples found."}</p>}
            </aside>

            <section className="example-preview">
              <div className="example-preview-head">
                <div>
                  <p className="eyebrow">{selectedExample?.category || "AIRES example"}</p>
                  <h3>{selectedExample?.title || "Example"}</h3>
                  {selectedExample && <p>{selectedExample.description}</p>}
                </div>
                <div className="inline-actions">
                  <button className="secondary-action compact" onClick={presentSelectedExample} disabled={!callId || !selectedExample}>
                    <Files size={17} />
                    <span>Present</span>
                  </button>
                  <button className="primary-action compact" onClick={generateSelectedExample} disabled={!callId || !selectedExample}>
                    <Wand2 size={17} />
                    <span>Generate</span>
                  </button>
                </div>
              </div>
              {exampleHtml ? (
                <iframe
                  className="example-frame"
                  title={selectedExample?.title || "AIRES example"}
                  srcDoc={exampleHtml}
                  sandbox="allow-forms allow-modals allow-popups allow-scripts"
                />
              ) : (
                <div className="canvas-empty">
                  <Files size={24} />
                  <p>{examplesStatus === "loading" ? "Loading selected example." : examplesStatus}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="canvas-body">
          <section className="canvas-work expanded">
            <JobList jobs={callJobs} onRetry={onRetryJob} />
          </section>
          <ActivityStream jobs={callJobs} />
        </div>
      )}
    </aside>
  );
}

function ProjectsView({ projects, selectedProject, onSelectProject, onCreateProject, onAddText, onUploadFile, onStartCall }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [sourceTitle, setSourceTitle] = React.useState("");
  const [sourceText, setSourceText] = React.useState("");
  const fileInputRef = React.useRef(null);

  function submitProject(event) {
    event.preventDefault();
    if (!title.trim()) return;
    onCreateProject({ title, description });
    setTitle("");
    setDescription("");
  }

  function submitSource(event) {
    event.preventDefault();
    if (!selectedProject || !sourceText.trim()) return;
    onAddText(selectedProject.id, {
      title: sourceTitle || "Pasted agent output",
      content: sourceText
    });
    setSourceTitle("");
    setSourceText("");
  }

  function uploadSelectedFile(event) {
    const file = event.target.files?.[0];
    if (selectedProject && file) {
      onUploadFile(selectedProject.id, file);
    }
    event.target.value = "";
  }

  return (
    <section className="split-view projects-view">
      <aside className="list-rail">
        <div className="rail-head">
          <h1>Projects</h1>
          <FolderKanban size={20} />
        </div>
        <form className="project-create-form" onSubmit={submitProject}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Feature epic or sprint"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional context"
            rows={3}
          />
          <button className="primary-action" type="submit" disabled={!title.trim()}>
            <Plus size={18} />
            <span>Create</span>
          </button>
        </form>
        <div className="rail-list spaced">
          {projects.map((project) => (
            <button
              key={project.id}
              className={selectedProject?.id === project.id ? "rail-item active" : "rail-item"}
              onClick={() => onSelectProject(project.id)}
            >
              <span>{project.title}</span>
              <small>{project.sourceCount} sources - {formatCompactNumber(project.totalChars)} chars</small>
            </button>
          ))}
          {!projects.length && <p className="muted">Create a project for sprint tickets, feature epics, or agent output.</p>}
        </div>
      </aside>

      <section className="detail-pane">
        {selectedProject ? (
          <>
            <div className="detail-head">
              <div>
                <p className="eyebrow">Active call context</p>
                <h1>{selectedProject.title}</h1>
              </div>
              <button className="primary-action" onClick={onStartCall}>
                <Phone size={20} />
                <span>Start Call</span>
              </button>
            </div>
            {selectedProject.description && <p className="project-description">{selectedProject.description}</p>}

            <div className="two-column">
              <section className="panel project-ingest-panel">
                <h2>Paste Agent Output</h2>
                <form className="project-source-form" onSubmit={submitSource}>
                  <input
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="Source title"
                  />
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder="Paste tickets, PRDs, feature epics, implementation plans, or agent output"
                    rows={10}
                  />
                  <button className="primary-action" type="submit" disabled={!sourceText.trim()}>
                    <FileText size={18} />
                    <span>Ingest Text</span>
                  </button>
                </form>
              </section>

              <section className="panel project-ingest-panel">
                <h2>Upload Context</h2>
                <p className="muted">Markdown, plain text, and PDFs are extracted into Cooper's project memory.</p>
                <input
                  ref={fileInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
                  onChange={uploadSelectedFile}
                />
                <button className="secondary-action upload-action" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={18} />
                  <span>Choose File</span>
                </button>
                <div className="source-list">
                  {selectedProject.sources.map((source) => (
                    <article className="source-card" key={source.id}>
                      <div>
                        <strong>{source.title}</strong>
                        <span>{source.sourceType} - {formatCompactNumber(source.storedCharCount)} chars</span>
                      </div>
                      <p>{source.preview}</p>
                      {source.truncated && <small>Stored excerpt truncated from original upload.</small>}
                    </article>
                  ))}
                  {!selectedProject.sources.length && <p className="muted">No project context yet.</p>}
                </div>
              </section>
            </div>
          </>
        ) : (
          <p className="muted">Create or select a project to attach context to Cooper calls.</p>
        )}
      </section>
    </section>
  );
}

function LibraryView({ calls, artifacts, jobs, selectedCall, onSelectCall, onOpenArtifact, onGenerate, onRetryJob }) {
  const callArtifacts = artifacts.filter((artifact) => artifact.callId === selectedCall?.id);
  const callJobs = jobs.filter((job) => job.callId === selectedCall?.id);
  const selectedTranscriptCount = selectedCall?.transcript?.length || 0;

  return (
    <section className="split-view calls-view">
      <aside className="list-rail">
        <div className="rail-head">
          <div>
            <p className="eyebrow">Call library</p>
            <h1>Calls</h1>
          </div>
          <span className="rail-count">{calls.length}</span>
        </div>
        <div className="rail-list">
          {calls.map((call) => (
            <CallLibraryRow
              key={call.id}
              call={call}
              artifactCount={artifacts.filter((artifact) => artifact.callId === call.id).length}
              jobCount={jobs.filter((job) => job.callId === call.id).length}
              active={selectedCall?.id === call.id}
              onSelect={onSelectCall}
            />
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
                {selectedCall.projectTitle && <p className="project-link-line">{selectedCall.projectTitle}</p>}
              </div>
              <div className="detail-actions">
                <span className="time-pill">{formatDuration(selectedCall.durationSeconds)}</span>
              </div>
            </div>

            <div className="call-kpi-strip">
              <Metric label="Turns" value={selectedTranscriptCount} />
              <Metric label="Artifacts" value={callArtifacts.length} />
              <Metric label="Work items" value={callJobs.length} />
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
                <div className="panel-head tight">
                  <h2>Transcript</h2>
                  <span className="section-count">{selectedTranscriptCount}</span>
                </div>
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
                <div className="panel-head tight">
                  <h2>Artifacts</h2>
                  <span className="section-count">{callArtifacts.length + callJobs.length}</span>
                </div>
                <ArtifactMiniList artifacts={callArtifacts} jobs={callJobs} onRetry={onRetryJob} onOpenArtifact={onOpenArtifact} />
              </section>
            </div>
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
  const isMcpAppArtifact = selectedArtifact?.outputType === "mcp_app";
  const canPrototypeFromArtifact = selectedArtifact && ["execution_plan", "product_requirements", "code_sketch"].includes(selectedArtifact.kind);

  React.useEffect(() => {
    setArtifactMode(isHtmlArtifact ? "preview" : isMcpAppArtifact ? "app" : "rendered");
  }, [isHtmlArtifact, isMcpAppArtifact, selectedArtifact?.id]);

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
        <JobList
          jobs={jobs}
          onRetry={onRetryJob}
          onOpenArtifact={onSelectArtifact}
          selectedArtifactId={selectedArtifact?.id}
        />
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
                  {isHtmlArtifact ? "HTML" : isMcpAppArtifact ? "JSON" : "Markdown"}
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
  if (artifact?.outputType === "mcp_app") {
    return (
      <McpAppDocument
        mode={mode}
        onModeChange={onModeChange}
        content={content}
        title={title}
      />
    );
  }

  if (artifact?.outputType === "html") {
    return (
      <HtmlPrototypeDocument
        artifactKind={artifact?.kind}
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
  const [articleNode, setArticleNodeState] = React.useState(null);
  const articleRef = React.useRef(null);
  const renderRequestRef = React.useRef(0);
  const renderedHtml = React.useMemo(() => renderArtifactHtml(markdown), [markdown]);

  const renderArticleMermaid = React.useCallback((node) => {
    if (!node) return;
    const requestId = renderRequestRef.current + 1;
    renderRequestRef.current = requestId;
    const nodes = Array.from(node.querySelectorAll(".mermaid")).filter(
      (mermaidNode) => !["true", "pending", "error"].includes(mermaidNode.dataset.rendered || "")
    );
    if (!nodes.length) return;
    nodes.forEach((mermaidNode) => {
      mermaidNode.dataset.renderRequested = "true";
    });
    renderMermaid(nodes).catch(() => {
      if (renderRequestRef.current === requestId) {
        markMermaidNodesUnavailable(nodes);
      }
    });
  }, []);

  const setArticleNode = React.useCallback((node) => {
    articleRef.current = node;
    setArticleNodeState(node);
  }, []);

  React.useEffect(() => {
    if (mode !== "rendered" || !articleNode) return undefined;

    let disposed = false;
    const renderPendingMermaid = () => {
      if (disposed) return;
      renderArticleMermaid(articleNode);
    };

    renderPendingMermaid();
    const observer = new MutationObserver(renderPendingMermaid);
    observer.observe(articleNode, { childList: true, subtree: true });
    const interval = window.setInterval(renderPendingMermaid, 150);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 5000);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [mode, renderedHtml, articleNode, renderArticleMermaid]);

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
        <article className="rendered-artifact" ref={setArticleNode} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      ) : (
        <pre className="markdown-preview">{markdown}</pre>
      )}
    </section>
  );
}

function McpAppDocument({ mode, onModeChange, content, title }) {
  const [copied, setCopied] = React.useState(false);
  const [iframeEvents, setIframeEvents] = React.useState([]);
  const payload = React.useMemo(() => parseMcpAppPayload(content, title), [content, title]);
  const appHtml = payload.html || mcpAppFallbackHtml(payload);
  const events = React.useMemo(
    () => [...(payload.aguiEvents || []), ...iframeEvents].slice(-12),
    [payload.aguiEvents, iframeEvents]
  );

  React.useEffect(() => {
    setIframeEvents([]);
    function handleMessage(event) {
      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "cooper-mcp-app") return;
      setIframeEvents((current) => [
        {
          type: data.type || "APP_MESSAGE",
          snapshot: data.snapshot || data.state || {},
          at: new Date().toISOString()
        },
        ...current
      ].slice(0, 8));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [payload.resourceUri, payload.title]);

  async function copyApp() {
    try {
      await navigator.clipboard.writeText(mode === "metadata" ? formatJson(payload) : appHtml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="artifact-document mcp-app-document">
      <div className="artifact-toolbar">
        <div className="artifact-tabs" role="tablist" aria-label={`${title} MCP App view`}>
          <button className={mode === "app" ? "active" : ""} onClick={() => onModeChange("app")} role="tab">
            App
          </button>
          <button className={mode === "metadata" ? "active" : ""} onClick={() => onModeChange("metadata")} role="tab">
            Metadata
          </button>
        </div>
        <button className="copy-action" onClick={copyApp}>
          {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
          <span>{copied ? "Copied" : mode === "metadata" ? "Copy JSON" : "Copy HTML"}</span>
        </button>
      </div>

      {mode === "metadata" ? (
        <div className="mcp-app-meta">
          <section>
            <p className="eyebrow">MCP App</p>
            <dl>
              <dt>Server</dt>
              <dd>{payload.serverId || "Not configured"}</dd>
              <dt>Transport</dt>
              <dd>{payload.transport || "Unknown"}</dd>
              <dt>Resource</dt>
              <dd>{payload.resourceUri || "Inline HTML"}</dd>
              <dt>Source</dt>
              <dd>{payload.source || "canvas"}</dd>
              <dt>Status</dt>
              <dd>{payload.resourceStatus || "ready"}</dd>
            </dl>
          </section>
          <section>
            <p className="eyebrow">State Snapshot</p>
            <pre>{formatJson(payload.state || {})}</pre>
          </section>
          <section>
            <p className="eyebrow">AG-UI Events</p>
            <div className="mcp-event-list">
              {events.map((event, index) => (
                <article key={`${event.type}-${event.at || index}-${index}`}>
                  <strong>{event.type || "EVENT"}</strong>
                  <span>{event.at ? formatTime(event.at) : "Now"}</span>
                  <pre>{formatJson(event.snapshot || event.delta || event)}</pre>
                </article>
              ))}
              {!events.length && <p className="muted">No AG-UI events recorded yet.</p>}
            </div>
          </section>
        </div>
      ) : (
        <div className="mcp-app-stage">
          <iframe
            className="mcp-app-frame"
            title={title}
            srcDoc={appHtml}
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        </div>
      )}
    </section>
  );
}

function HtmlPrototypeDocument({ artifactKind, mode, onModeChange, html, title }) {
  const [copied, setCopied] = React.useState(false);
  const isDocumentArtifact = String(artifactKind || "").toLowerCase() === "aires_requirements";
  const [viewport, setViewport] = React.useState(isDocumentArtifact ? "document" : "mobile");
  const previewHtml = React.useMemo(
    () => isDocumentArtifact ? enhanceDocumentPreviewHtml(html) : html,
    [html, isDocumentArtifact]
  );

  React.useEffect(() => {
    setViewport(isDocumentArtifact ? "document" : "mobile");
  }, [isDocumentArtifact, title]);

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
          {mode === "preview" && !isDocumentArtifact && (
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
            srcDoc={previewHtml || "<!doctype html><html><body></body></html>"}
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        </div>
      ) : (
        <pre className="markdown-preview">{html}</pre>
      )}
    </section>
  );
}

function enhanceDocumentPreviewHtml(html = "") {
  if (!html.trim()) return html;

  const previewCss = `
<style id="cooper-document-preview-fit">
  html,
  body {
    width: 100% !important;
    min-width: 0 !important;
    overflow-x: hidden !important;
  }

  body {
    margin: 0 !important;
  }

  .page {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .document {
    width: 100% !important;
    min-height: 100vh !important;
    border-left: 0 !important;
    border-right: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
</style>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${previewCss}\n</head>`);
  }

  return `${previewCss}\n${html}`;
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

function CallRow({ call, onOpen }) {
  const content = (
    <>
      <Phone size={18} />
      <div>
        <strong>{call.title}</strong>
        <span>{formatDate(call.startedAt)} - {formatDuration(call.durationSeconds)} - {call.transcript?.length || 0} turns</span>
        {call.projectTitle && <span>{call.projectTitle}</span>}
      </div>
    </>
  );

  if (!onOpen) {
    return <article className="compact-row">{content}</article>;
  }

  return (
    <button className="compact-row compact-row-button" type="button" onClick={() => onOpen(call.id)} aria-label={`Open ${call.title}`}>
      {content}
    </button>
  );
}

function CallLibraryRow({ call, artifactCount, jobCount, active, onSelect }) {
  const transcriptCount = call.transcript?.length || 0;

  return (
    <button
      type="button"
      className={active ? "call-library-row active" : "call-library-row"}
      onClick={() => onSelect(call.id)}
      aria-current={active ? "true" : undefined}
    >
      <span className="call-row-icon">
        <Phone size={16} />
      </span>
      <span className="call-row-main">
        <strong>{call.title}</strong>
        <small>{formatDate(call.startedAt)} - {formatDuration(call.durationSeconds)}</small>
        {call.projectTitle && <small>{call.projectTitle}</small>}
      </span>
      <span className={`status-pill mini ${statusClass(call.status)}`}>{statusLabel(call.status)}</span>
      <span className="call-row-meta">
        <span>{transcriptCount} turns</span>
        <span>{artifactCount} artifacts</span>
        <span>{jobCount} work</span>
      </span>
    </button>
  );
}

function JobList({ jobs, onRetry, onOpenArtifact, selectedArtifactId }) {
  const hasActiveJobs = jobs.some((job) => ["queued", "running"].includes(job.status));
  const now = useNow(hasActiveJobs);
  if (!jobs.length) return <p className="muted">Queue is clear.</p>;

  return (
    <div className="job-list">
      {jobs.map((job) => {
        const artifactId = jobOpenArtifactId(job);
        const isOpenable = Boolean(artifactId && onOpenArtifact);
        const rowClassName = [
          "job-row",
          isOpenable ? "job-row-button" : "",
          artifactId && selectedArtifactId === artifactId ? "active" : ""
        ].filter(Boolean).join(" ");
        const icon = job.status === "completed"
          ? <CheckCircle2 size={18} />
          : job.status === "failed"
            ? <AlertTriangle size={18} />
            : <Clock size={18} />;
        const content = (
          <>
            {icon}
            <div>
              <strong>{job.title}</strong>
              <span>{jobStatusLine(job, now)}</span>
              <div className="job-progress" aria-label={`${job.title} progress`}>
                <span style={{ width: `${progressPercent(job)}%` }} />
              </div>
              {job.progress && <small>{job.progress}</small>}
              {job.activeStepSummary && <small>Step: {job.activeStepSummary}</small>}
              {jobApiLine(job, now) && <small>{jobApiLine(job, now)}</small>}
              {job.draftCharCount ? <small>Draft: {Number(job.draftCharCount).toLocaleString()} chars captured.</small> : null}
              {job.error && <small>{job.error}</small>}
              {job.status === "failed" && onRetry && (
                <button className="inline-action" onClick={() => onRetry(job.id)}>
                  <RotateCcw size={16} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          </>
        );

        if (isOpenable) {
          return (
            <button
              type="button"
              className={rowClassName}
              key={job.id}
              onClick={() => onOpenArtifact(artifactId)}
              aria-current={selectedArtifactId === artifactId ? "true" : undefined}
              aria-label={`Open ${job.title} artifact`}
            >
              {content}
            </button>
          );
        }

        return (
          <article className={rowClassName} key={job.id}>
            {content}
          </article>
        );
      })}
    </div>
  );
}

function useNow(enabled) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return enabled ? now : Date.now();
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

function ArtifactMiniList({ artifacts, jobs, onRetry, onOpenArtifact }) {
  return (
    <div className="compact-list">
      {artifacts.map((artifact) => (
        <button
          className="compact-row compact-row-button"
          key={artifact.id}
          type="button"
          onClick={() => onOpenArtifact?.(artifact.id)}
          disabled={!onOpenArtifact}
          aria-label={`Open ${artifact.title}`}
        >
          <FileText size={18} />
          <div>
            <strong>{artifact.title}</strong>
            <span>{artifactLabel(artifact.kind)} - {formatDate(artifact.createdAt)}</span>
          </div>
        </button>
      ))}
      <JobList jobs={jobs} onRetry={onRetry} />
      {!artifacts.length && !jobs.length && <p className="muted">No work generated for this call.</p>}
    </div>
  );
}

function callTitle(calls, callId) {
  return calls.find((call) => call.id === callId)?.title || "Unknown call";
}

function artifactLabel(kind) {
  return {
    mermaid_diagram: "Mermaid diagram",
    ui_wireframe: "UI wireframe",
    html_prototype: "HTML prototype",
    mcp_app: "MCP App",
    aires_requirements: "AIRES scoped requirements",
    product_requirements: "PRD",
    execution_plan: "Execution plan",
    post_call_kit: "Post-call kit",
    follow_up: "Follow-up summary",
    code_sketch: "Code sketch"
  }[kind] || String(kind || "Artifact").replace(/_/g, " ");
}

function defaultCanvasPrompt(kind) {
  return {
    mermaid_diagram: "Create the most useful Mermaid diagram for the architecture, workflow, user journey, or decision flow we are discussing.",
    ui_wireframe: "Create a mobile-first low-fidelity UI wireframe for the product experience we are discussing.",
    html_prototype: "Create a mobile-first interactive HTML prototype for the product workflow we are discussing.",
    aires_requirements: "Create an AIRES scoped requirements artifact from the current conversation and project context. Include problem, goal, scope boundaries, MoSCoW, vertical INVEST slices, Given/When/Then criteria, and Definition of Ready."
  }[kind] || "Create a visual artifact for what we are discussing.";
}

function buildExamplePrompt(example, instruction = "") {
  if (!example) return defaultCanvasPrompt("aires_requirements");
  return [
    example.promptHint || `Generate ${example.title} for the current discussion.`,
    `Use the active project context and live transcript as the source of truth.`,
    `Use the AIRES example "${example.title}" as the structural model.`,
    example.flow ? `Flow: ${example.flow}` : "",
    example.description ? `Reference intent: ${example.description}` : "",
    instruction.trim() ? `Michael's additional instruction:\n${instruction.trim()}` : ""
  ].filter(Boolean).join("\n\n");
}

function renderArtifactHtml(markdown = "") {
  const readingMarkdown = markdown
    .replace(/<!--\s*Cooper step[^>]*-->/gi, "\n\n---\n\n")
    .replace(/\n{3,}/g, "\n\n");

  return DOMPurify.sanitize(markdownRenderer.render(readingMarkdown), {
    ADD_ATTR: ["target", "rel"]
  });
}

function parseMcpAppPayload(content = "", title = "MCP App") {
  try {
    const payload = JSON.parse(content || "{}");
    return {
      version: payload.version || "cooper-mcp-app-1",
      title: payload.title || title,
      description: payload.description || "",
      serverId: payload.serverId || "",
      transport: payload.transport || "",
      resourceUri: payload.resourceUri || "",
      toolName: payload.toolName || "",
      source: payload.source || "",
      resourceStatus: payload.resourceStatus || "",
      state: payload.state && typeof payload.state === "object" ? payload.state : {},
      html: typeof payload.html === "string" ? payload.html : "",
      htmlMimeType: payload.htmlMimeType || "text/html",
      aguiEvents: Array.isArray(payload.aguiEvents) ? payload.aguiEvents : [],
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      createdAt: payload.createdAt || ""
    };
  } catch {
    return {
      version: "cooper-mcp-app-1",
      title,
      description: "Recovered MCP App artifact content that was not valid JSON.",
      serverId: "",
      transport: "",
      resourceUri: "",
      toolName: "",
      source: "raw_content",
      resourceStatus: "raw_content",
      state: {},
      html: /^<!doctype html|<html[\s>]/i.test(content || "") ? content : "",
      htmlMimeType: "text/html",
      aguiEvents: [],
      messages: []
    };
  }
}

function mcpAppFallbackHtml(payload) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(payload.title || "MCP App")}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, system-ui, sans-serif; background: #f4f5f1; color: #1b2421; }
    main { width: min(720px, calc(100vw - 32px)); padding: 24px; border: 1px solid #dce2dc; border-radius: 8px; background: white; }
    h1 { margin: 0 0 10px; font-size: clamp(1.6rem, 5vw, 3rem); line-height: 1.05; }
    p { color: #66736c; line-height: 1.5; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtmlText(payload.title || "MCP App")}</h1>
    <p>${escapeHtmlText(payload.description || "No MCP App HTML was available for this artifact.")}</p>
    <p><strong>Resource:</strong> <code>${escapeHtmlText(payload.resourceUri || "inline/pending")}</code></p>
  </main>
</body>
</html>`;
}

function formatJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value || "");
  }
}

function escapeHtmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function renderMermaid(nodes) {
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

  const mermaid = await mermaidLoader;
  await Promise.all(
    Array.from(nodes).map(async (node, index) => {
      if (!node || node.dataset.rendered === "true") return;

      const source = (node.dataset.mermaidSource || node.textContent || "").trim();
      if (!source) return;

      node.dataset.mermaidSource = source;
      node.dataset.rendered = "pending";
      node.classList.remove("mermaid-error");
      node.setAttribute("aria-busy", "true");

      try {
        const renderId = `cooper-mermaid-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
        const { svg, bindFunctions } = await mermaid.render(renderId, source);
        node.innerHTML = svg;
        bindFunctions?.(node);
        node.dataset.rendered = "true";
      } catch (error) {
        node.dataset.rendered = "error";
        node.classList.add("mermaid-error");
        node.innerHTML = [
          "<strong>Diagram preview failed</strong>",
          `<small>${escapeHtmlText(error?.message || "Mermaid could not render this diagram.")}</small>`,
          `<pre>${escapeHtmlText(source)}</pre>`
        ].join("");
      } finally {
        node.removeAttribute("aria-busy");
      }
    })
  );
}

function markMermaidNodesUnavailable(nodes) {
  for (const node of Array.from(nodes || [])) {
    if (!node || node.dataset.rendered === "true") continue;
    const source = (node.dataset.mermaidSource || node.textContent || "").trim();
    node.dataset.mermaidSource = source;
    node.dataset.rendered = "error";
    node.classList.add("mermaid-error");
    node.removeAttribute("aria-busy");
    node.innerHTML = [
      "<strong>Diagram preview failed</strong>",
      "<small>Mermaid could not load in this browser session. The source is preserved below.</small>",
      `<pre>${escapeHtmlText(source)}</pre>`
    ].join("");
  }
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

function emptyArcadeState() {
  return {
    configured: false,
    userId: "",
    gatewayUrl: null,
    writesEnabled: false,
    tools: [],
    mappings: {},
    recentToolCalls: []
  };
}

function toolLabel(name) {
  return {
    search_workspace_context: "Workspace context",
    search_notion_workspace: "Notion search",
    fetch_notion_page: "Notion page",
    get_customer_context: "Customer context",
    inspect_engineering_context: "Engineering context",
    create_followup_action: "Follow-up actions",
    check_calendar: "Calendar check",
    create_canvas_artifact: "Canvas artifact",
    render_mcp_app: "MCP App canvas",
    present_aires_example: "AIRES example canvas",
    run_gstack_skill: "GStack skill",
    run_aires_requirements_framework: "AIRES requirements"
  }[name] || String(name || "Tool").replace(/_/g, " ");
}

function describeConnectionError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  if (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    /permission denied|permission dismissed|not allowed/i.test(message)
  ) {
    return `Microphone permission was blocked. Allow microphone access for ${window.location.host || "localhost:5000"}, then press Join again.`;
  }
  if (name === "NotFoundError" || /requested device not found|no media devices/i.test(message)) {
    return "No microphone was found. Connect or select a microphone, then press Join again.";
  }
  if (name === "NotReadableError" || /could not start audio source|device in use/i.test(message)) {
    return "The microphone is already in use by another app. Close the other app or pick another input, then press Join again.";
  }
  if (/missing openai_api_key/i.test(message)) {
    return "The server is missing OPENAI_API_KEY.";
  }
  return message || "Could not start the call.";
}

function statusLabel(status) {
  return {
    completed: "Connected",
    ended: "Ended",
    active: "Active",
    pending: "Pending",
    failed: "Failed",
    not_started: "Not started",
    missing_api_key: "API key missing",
    missing_mapping: "Mapping missing",
    executed: "Executed",
    pending_approval: "Approval",
    error: "Error"
  }[status] || String(status || "Unknown").replace(/_/g, " ");
}

function statusClass(status) {
  if (["completed", "ended", "executed"].includes(status)) return "good";
  if (["active", "pending", "pending_approval", "not_started"].includes(status)) return "waiting";
  if (["missing_api_key", "missing_mapping", "failed", "error"].includes(status)) return "bad";
  return "";
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

function formatCompactNumber(value = 0) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

createRoot(document.getElementById("root")).render(<App />);
