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
  FileText,
  Files,
  Library,
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
    tools: [toolDefinition],
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
  const pcRef = React.useRef(null);
  const dcRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const activeCallRef = React.useRef(null);
  const callStartedAtRef = React.useRef(null);
  const transcriptsRef = React.useRef([]);
  const outputTranscriptBuffersRef = React.useRef(new Map());
  const textTranscriptBuffersRef = React.useRef(new Map());
  const persistedResponseIdsRef = React.useRef(new Set());
  const knownCompletedJobsRef = React.useRef(new Set());
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
    didLoadStateRef.current = false;
    knownCompletedJobsRef.current = new Set();
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
    if (call.name !== "check_calendar") return;

    let args = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      args = {};
    }

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
    setView("call");

    try {
      const call = await createCall();
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
  onBack
}) {
  const mode = speaking ? "speaking" : hearing ? "hearing" : connected ? "listening" : "idle";

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
        <button className="icon-button inverted danger-text" onClick={onEndCall} aria-label="End call">
          <PhoneOff size={20} />
        </button>
      </header>

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

function LibraryView({ calls, artifacts, jobs, selectedCall, onSelectCall, onGenerate, onRetryJob }) {
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
  await mermaid.run({ nodes });
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

createRoot(document.getElementById("root")).render(<App />);
