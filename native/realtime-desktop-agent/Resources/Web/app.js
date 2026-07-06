const $ = (selector) => document.querySelector(selector);

const elements = {
  startCall: $("#startCall"),
  endCall: $("#endCall"),
  muteCall: $("#muteCall"),
  interruptCall: $("#interruptCall"),
  connectionState: $("#connectionState"),
  micState: $("#micState"),
  workspaceState: $("#workspaceState"),
  modelLabel: $("#modelLabel"),
  errorBanner: $("#errorBanner"),
  eventLog: $("#eventLog"),
  canvasGrid: $("#canvasGrid"),
  cardCount: $("#cardCount"),
  transcriptList: $("#transcriptList"),
  callTimer: $("#callTimer")
};

const toolLabels = {
  canvas_show_card: "canvas.show_card",
  canvas_show_table: "canvas.show_table",
  local_search_files: "local.search_files",
  local_read_file: "local.read_file",
  app_open_url: "app.open_url",
  app_copy_to_clipboard: "app.copy_to_clipboard"
};

const state = {
  peerConnection: null,
  dataChannel: null,
  localStream: null,
  muted: false,
  responseActive: false,
  assistantDraft: "",
  callStartedAt: 0,
  timerId: 0,
  cardCount: 0
};

elements.startCall.addEventListener("click", startCall);
elements.endCall.addEventListener("click", endCall);
elements.muteCall.addEventListener("click", toggleMute);
elements.interruptCall.addEventListener("click", interruptResponse);

hydrateHealth();

async function hydrateHealth() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Broker health failed: ${response.status}`);
    }
    const health = await response.json();
    elements.connectionState.textContent = "Broker ready";
    elements.workspaceState.textContent = shortenPath(health.workspaceRoot || "Workspace");
    elements.workspaceState.title = health.workspaceRoot || "";
    elements.modelLabel.textContent = health.model || "gpt-realtime-2";
    addEvent("Broker", health.hasApiKey ? "OpenAI key loaded." : "OPENAI_API_KEY missing.");
    if (!health.hasApiKey) {
      showError("Missing OPENAI_API_KEY in the macOS app environment.");
    }
    renderCanvasCard("Session", `Workspace: \`${health.workspaceRoot || "unknown"}\`\n\nTools: ${health.tools.join(", ")}`);
  } catch (error) {
    elements.connectionState.textContent = "Broker unavailable";
    showError("Token broker unavailable. Restart the broker from the macOS toolbar.");
    addEvent("Broker", error.message || "Health check failed.");
  }
}

async function startCall() {
  clearError();
  setConnection("Requesting microphone");
  elements.startCall.disabled = true;

  try {
    const peerConnection = new RTCPeerConnection();
    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    peerConnection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0];
    };

    peerConnection.onconnectionstatechange = () => {
      const label = peerConnection.connectionState;
      setConnection(label.charAt(0).toUpperCase() + label.slice(1));
      if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
        if (peerConnection.connectionState === "failed") {
          showError("Realtime connection failed.");
        }
      }
    };

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    elements.micState.textContent = "Live";
    peerConnection.addTrack(localStream.getAudioTracks()[0], localStream);

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("open", () => {
      setConnection("Listening");
      addEvent("Session", "Realtime data channel open.");
      elements.interruptCall.disabled = false;
    });
    dataChannel.addEventListener("message", (event) => handleServerEvent(JSON.parse(event.data)));
    dataChannel.addEventListener("close", () => {
      addEvent("Session", "Realtime data channel closed.");
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sessionResponse = await fetch("/session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp
    });

    const answerSdp = await sessionResponse.text();
    if (!sessionResponse.ok) {
      throw new Error(answerSdp || "Realtime session creation failed.");
    }

    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

    state.peerConnection = peerConnection;
    state.dataChannel = dataChannel;
    state.localStream = localStream;
    state.callStartedAt = Date.now();
    state.timerId = window.setInterval(updateTimer, 1000);
    updateButtons(true);
    setConnection("Connecting");
    addEvent("Call", "Started.");
  } catch (error) {
    elements.startCall.disabled = false;
    endCall({ silent: true });
    const message = error?.name === "NotAllowedError"
      ? "Microphone denied. Enable microphone access for Realtime Desktop Agent in macOS Settings."
      : error.message || "Realtime connection failed.";
    elements.micState.textContent = error?.name === "NotAllowedError" ? "Denied" : "Idle";
    setConnection(error?.message?.includes("OPENAI_API_KEY") ? "Broker error" : "Failed");
    showError(message);
    addEvent("Error", message);
  }
}

function endCall(options = {}) {
  if (state.dataChannel && state.dataChannel.readyState === "open") {
    try {
      state.dataChannel.close();
    } catch {}
  }
  if (state.peerConnection) {
    state.peerConnection.close();
  }
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      track.stop();
    }
  }
  window.clearInterval(state.timerId);
  state.peerConnection = null;
  state.dataChannel = null;
  state.localStream = null;
  state.muted = false;
  state.responseActive = false;
  state.callStartedAt = 0;
  state.timerId = 0;
  state.assistantDraft = "";
  elements.micState.textContent = "Idle";
  elements.callTimer.textContent = "00:00";
  setConnection("Broker ready");
  updateButtons(false);
  if (!options.silent) {
    addEvent("Call", "Ended.");
  }
}

function toggleMute() {
  if (!state.localStream) return;
  state.muted = !state.muted;
  for (const track of state.localStream.getAudioTracks()) {
    track.enabled = !state.muted;
  }
  elements.muteCall.textContent = state.muted ? "Unmute" : "Mute";
  elements.micState.textContent = state.muted ? "Muted" : "Live";
}

function interruptResponse() {
  if (!sendEvent({ type: "response.cancel" })) {
    addEvent("Interrupt", "Data channel is closed.");
    return;
  }
  state.responseActive = false;
  addEvent("Interrupt", "Cancel sent.");
  setConnection("Listening");
}

function handleServerEvent(event) {
  switch (event.type) {
    case "session.created":
      addEvent("Session", "Created.");
      break;
    case "session.updated":
      setConnection("Listening");
      break;
    case "input_audio_buffer.speech_started":
      elements.micState.textContent = "Hearing";
      setConnection("Listening");
      break;
    case "input_audio_buffer.speech_stopped":
      elements.micState.textContent = state.muted ? "Muted" : "Live";
      setConnection("Processing");
      break;
    case "conversation.item.input_audio_transcription.completed":
      appendTranscript("user", "You", event.transcript || "");
      break;
    case "conversation.item.input_audio_transcription.failed":
      showError("Input transcription failed.");
      addEvent("Transcript", event.error?.message || "Input transcription failed.");
      break;
    case "response.created":
      state.responseActive = true;
      setConnection("Agent preparing");
      break;
    case "response.output_audio.delta":
    case "response.audio.delta":
      setConnection("Agent speaking");
      break;
    case "response.output_audio.done":
    case "response.audio.done":
      setConnection("Listening");
      break;
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
    case "response.output_text.delta":
      appendAssistantDelta(event.delta || "");
      break;
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      finalizeAssistant(event.transcript || state.assistantDraft);
      break;
    case "response.output_text.done":
      finalizeAssistant(event.text || state.assistantDraft);
      break;
    case "response.output_item.done":
      handleOutputItem(event.item);
      break;
    case "response.done":
      state.responseActive = false;
      setConnection("Listening");
      handleResponseDone(event.response);
      break;
    case "response.cancelled":
      state.responseActive = false;
      setConnection("Listening");
      addEvent("Response", "Cancelled.");
      break;
    case "error":
      showError(event.error?.message || "Realtime session error.");
      addEvent("Realtime", event.error?.message || "Error event.");
      break;
    default:
      if (event.type?.includes("function_call")) {
        addEvent("Realtime", event.type);
      }
  }
}

function handleOutputItem(item) {
  if (!item) return;
  if (item.type === "message") {
    const text = (item.content || [])
      .filter((part) => part.type === "output_text" || part.type === "output_audio_transcript")
      .map((part) => part.text || part.transcript || "")
      .join("");
    if (text && !state.assistantDraft) {
      finalizeAssistant(text);
    }
  }
}

function handleResponseDone(response) {
  const calls = (response?.output || []).filter((item) => item.type === "function_call");
  if (calls.length) {
    state.responseActive = true;
    for (const call of calls) {
      handleFunctionCall(call);
    }
  }

  if (state.assistantDraft && calls.length === 0) {
    finalizeAssistant(state.assistantDraft);
  }
}

async function handleFunctionCall(call) {
  const label = toolLabels[call.name] || call.name;
  const args = safeJson(call.arguments || "{}");
  appendTranscript("tool", label, "Running");
  addEvent("Tool", `${label} started.`);

  let output;
  try {
    output = await executeTool(call.name, args);
  } catch (error) {
    output = { status: "error", tool: label, message: error.message || "Tool failed." };
    showError(`Tool failed: ${label}`);
  }

  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(output)
    }
  });
  sendEvent({ type: "response.create" });

  appendTranscript("tool", label, output.status === "error" ? output.message : "Returned");
  addEvent("Tool", `${label} returned.`);
}

async function executeTool(name, args) {
  switch (name) {
    case "canvas_show_card":
      renderCanvasCard(args.title || "Card", args.markdown || "");
      return { status: "ok", tool: "canvas.show_card", rendered: true };

    case "canvas_show_table":
      renderCanvasTable(args.title || "Table", args.columns || [], args.rows || []);
      return { status: "ok", tool: "canvas.show_table", rendered: true };

    case "app_open_url": {
      const url = String(args.url || "");
      if (!/^https?:\/\//i.test(url)) {
        return { status: "error", tool: "app.open_url", message: "Only http and https URLs are supported." };
      }
      if (!window.confirm(`Open ${url}?`)) {
        return { status: "rejected", tool: "app.open_url" };
      }
      window.open(url, "_blank", "noopener,noreferrer");
      return { status: "ok", tool: "app.open_url", url };
    }

    case "app_copy_to_clipboard":
      await navigator.clipboard.writeText(String(args.text || ""));
      return { status: "ok", tool: "app.copy_to_clipboard" };

    case "local_search_files":
    case "local_read_file":
      return executeBrokerTool(name, args);

    default:
      return { status: "error", tool: name, message: "Unknown tool." };
  }
}

async function executeBrokerTool(name, args) {
  const response = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.output?.status === "error") {
    showError(`Tool failed: ${toolLabels[name] || name}`);
    return payload.output || { status: "error", tool: name, message: "Tool failed." };
  }

  if (name === "local_search_files") {
    renderSearchResults(args.query, payload.output.results || []);
  }

  if (name === "local_read_file") {
    renderCanvasCard(payload.output.path || args.path, `\`\`\`\n${payload.output.content || ""}\n\`\`\``);
  }

  return payload.output;
}

function renderSearchResults(query, results) {
  renderCanvasTable(`Search: ${query}`, ["path", "snippet"], results.map((result) => ({
    path: result.path,
    snippet: result.snippet
  })));
}

function renderCanvasCard(title, markdown) {
  state.cardCount += 1;
  const card = document.createElement("article");
  card.className = "canvas-card";
  card.innerHTML = `
    <header>
      <h3>${escapeHtml(title)}</h3>
      <time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </header>
    <div class="canvas-body">${renderMarkdown(markdown)}</div>
  `;
  elements.canvasGrid.prepend(card);
  updateCardCount();
}

function renderCanvasTable(title, columns, rows) {
  state.cardCount += 1;
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const card = document.createElement("article");
  card.className = "canvas-card";
  const header = safeColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = safeRows.map((row) => `
    <tr>
      ${safeColumns.map((column) => `<td>${escapeHtml(String(row?.[column] ?? ""))}</td>`).join("")}
    </tr>
  `).join("");
  card.innerHTML = `
    <header>
      <h3>${escapeHtml(title)}</h3>
      <time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </header>
    <div class="canvas-body">
      <table class="canvas-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body || `<tr><td colspan="${Math.max(1, safeColumns.length)}">No rows</td></tr>`}</tbody>
      </table>
    </div>
  `;
  elements.canvasGrid.prepend(card);
  updateCardCount();
}

function updateCardCount() {
  elements.cardCount.textContent = `${state.cardCount} ${state.cardCount === 1 ? "card" : "cards"}`;
}

function appendAssistantDelta(delta) {
  if (!delta) return;
  state.assistantDraft += delta;
  upsertDraftTurn(state.assistantDraft);
}

function finalizeAssistant(text) {
  const finalText = (text || "").trim();
  removeDraftTurn();
  state.assistantDraft = "";
  if (finalText) {
    appendTranscript("assistant", "Agent", finalText);
  }
}

function appendTranscript(kind, speaker, text) {
  if (!text) return;
  const row = document.createElement("article");
  row.className = `turn ${kind}`;
  row.innerHTML = `
    <div class="turn-header">
      <strong>${escapeHtml(speaker)}</strong>
      <span>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    <p>${escapeHtml(text)}</p>
  `;
  elements.transcriptList.append(row);
  elements.transcriptList.scrollTop = elements.transcriptList.scrollHeight;
}

function upsertDraftTurn(text) {
  let row = $("#assistantDraft");
  if (!row) {
    row = document.createElement("article");
    row.id = "assistantDraft";
    row.className = "turn assistant";
    row.innerHTML = `
      <div class="turn-header">
        <strong>Agent</strong>
        <span>Live</span>
      </div>
      <p></p>
    `;
    elements.transcriptList.append(row);
  }
  row.querySelector("p").textContent = text;
  elements.transcriptList.scrollTop = elements.transcriptList.scrollHeight;
}

function removeDraftTurn() {
  $("#assistantDraft")?.remove();
}

function sendEvent(event) {
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
    return false;
  }
  state.dataChannel.send(JSON.stringify(event));
  return true;
}

function updateButtons(active) {
  elements.startCall.disabled = active;
  elements.endCall.disabled = !active;
  elements.muteCall.disabled = !active;
  elements.interruptCall.disabled = !active;
  elements.muteCall.textContent = "Mute";
}

function updateTimer() {
  if (!state.callStartedAt) return;
  const elapsed = Math.floor((Date.now() - state.callStartedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  elements.callTimer.textContent = `${minutes}:${seconds}`;
}

function setConnection(label) {
  elements.connectionState.textContent = label;
}

function showError(message) {
  elements.errorBanner.hidden = false;
  elements.errorBanner.textContent = message;
}

function clearError() {
  elements.errorBanner.hidden = true;
  elements.errorBanner.textContent = "";
}

function addEvent(title, body) {
  const item = document.createElement("div");
  item.className = "event-item";
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(body)}`;
  elements.eventLog.prepend(item);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function shortenPath(path) {
  if (!path) return "Workspace";
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

function renderMarkdown(markdown) {
  const escaped = escapeHtml(markdown || "");
  const lines = escaped.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!lines.length) return "<p></p>";
  return lines.map((block) => {
    if (block.startsWith("```")) {
      return `<pre><code>${block.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "")}</code></pre>`;
    }
    if (/^[-*] /m.test(block)) {
      const items = block.split("\n")
        .filter((line) => /^[-*] /.test(line))
        .map((line) => `<li>${line.replace(/^[-*] /, "")}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${block
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
