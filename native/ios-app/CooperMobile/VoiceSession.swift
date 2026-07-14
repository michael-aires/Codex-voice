import Foundation
import Observation
import SwiftUI
import WebKit
import AVFAudio

struct VoiceSessionSeed: Identifiable, Hashable, Sendable {
    let id = UUID()
    var focus: TodayItem?
    var resumedFromCallId = ""
    var contextPacketId = ""
    var resumePacket: SessionResumePacket?
    var title = ""
    var precreatedCall: SessionRecord?
    var contextPacket: ContextPacket?
    var sessionContext = ""
    var dailyBrief: DailyBrief?

    static func blank() -> VoiceSessionSeed {
        VoiceSessionSeed(title: "Cooper session")
    }
}

private enum VoiceSessionSheet: Identifiable {
    case canvas(SessionRecord)
    case dailyBrief(DailyBrief)

    var id: String {
        switch self {
        case .canvas(let session): "canvas-\(session.id)"
        case .dailyBrief(let brief): "daily-brief-\(brief.id)"
        }
    }
}

struct VoiceFunctionCall: Hashable, Sendable {
    let callId: String
    let name: String
    let arguments: String
}

enum VoiceConnectionState: String, Sendable {
    case idle
    case preparing
    case microphone
    case connecting
    case reconnecting
    case listening
    case hearing
    case thinking
    case speaking
    case ended
    case failed

    var label: String {
        switch self {
        case .idle: "Ready"
        case .preparing: "Preparing session"
        case .microphone: "Requesting microphone"
        case .connecting: "Connecting"
        case .reconnecting: "Reconnecting"
        case .listening: "Cooper is listening"
        case .hearing: "Hearing you"
        case .thinking: "Cooper is thinking"
        case .speaking: "Cooper is speaking"
        case .ended: "Session ended"
        case .failed: "Connection failed"
        }
    }

    var isLive: Bool {
        [.listening, .hearing, .thinking, .speaking].contains(self)
    }
}

@MainActor
@Observable
final class VoiceSessionController: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var state: VoiceConnectionState = .idle
    var transcript: [TranscriptEntry] = []
    var activeCall: SessionRecord?
    var isMuted = false
    var lastError: String?
    var latestEvent = ""
    var startedAt: Date?
    var resumePacket: SessionResumePacket?
    var reconnectAttempt = 0
    var usage = RealtimeUsage()
    var isSessionConfigured = false
    private(set) var isPreview = false

    var canReconnect: Bool {
        !isPreview && activeCall != nil && state == .failed
    }

    @ObservationIgnored private let contentController: WKUserContentController
    @ObservationIgnored private let messageProxy: VoiceMessageProxy
    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private var serverURL: URL?
    @ObservationIgnored private var trustedHost = ""
    @ObservationIgnored private var outputBuffers: [String: String] = [:]
    @ObservationIgnored private var persistedOutputKeys: Set<String> = []
    @ObservationIgnored private var recordedUsageKeys: Set<String> = []
    @ObservationIgnored private var reconnectTask: Task<Void, Never>?
    @ObservationIgnored var onTranscript: ((TranscriptEntry) -> Void)?
    @ObservationIgnored var onFunctionCall: ((VoiceFunctionCall) -> Void)?

    override init() {
        let contentController = WKUserContentController()
        let messageProxy = VoiceMessageProxy()
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        self.contentController = contentController
        self.messageProxy = messageProxy
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        messageProxy.target = self
        contentController.add(messageProxy, name: "cooperVoice")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
    }

    func start(serverURL: URL, call: SessionRecord, resumePacket: SessionResumePacket? = nil) async {
        reset()
        self.serverURL = serverURL
        trustedHost = serverURL.host?.lowercased() ?? ""
        activeCall = call
        transcript = call.transcript
        self.resumePacket = resumePacket
        state = .preparing
        startedAt = Date()
        await loadTransport(serverURL: serverURL, callId: call.id)
    }

    private func loadTransport(serverURL: URL, callId: String) async {
        do {
            try activateAudioSession()
        } catch {
            fail("The iPhone audio session could not start: \(error.localizedDescription)")
            return
        }
        await synchronizeCookies(for: serverURL)

        let transportURL = serverURL
            .appendingPathComponent("ios-voice-transport.html")
            .appending(queryItems: [
                URLQueryItem(name: "session", value: callId),
                URLQueryItem(name: "attempt", value: String(reconnectAttempt))
            ])
        webView.load(URLRequest(url: transportURL, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    func startPreview(seed: VoiceSessionSeed) {
        reset()
        isPreview = true
        state = .listening
        isSessionConfigured = true
        startedAt = Date()
        resumePacket = seed.resumePacket
        activeCall = seed.precreatedCall ?? SessionRecord(
            id: "preview-live-session",
            title: seed.title.isEmpty ? seed.focus?.title ?? "Cooper session" : seed.title,
            status: "active",
            startedAt: ISO8601DateFormatter().string(from: Date()),
            transcript: []
        )
        transcript = activeCall?.transcript ?? []
        appendTranscript(
            speaker: "Cooper",
            text: seed.focus.map { "I have \($0.title) and its connected context ready. What should we work through first?" }
                ?? "I’m online. What should we work through?",
            source: "preview"
        )
        usage.addResponse(RealtimeUsageTotals(
            totalTokens: 462,
            inputTokens: 308,
            outputTokens: 154,
            inputTextTokens: 190,
            inputAudioTokens: 118,
            outputTextTokens: 54,
            outputAudioTokens: 100
        ))
    }

    func ask(_ text: String = "", reason: String = "manual", appendUserTranscript: Bool = true) {
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if isPreview {
            if !cleanText.isEmpty, appendUserTranscript {
                appendTranscript(speaker: "Michael", text: cleanText, source: "typed")
            }
            state = .thinking
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(450))
                guard let self else { return }
                self.state = .speaking
                self.appendTranscript(
                    speaker: "Cooper",
                    text: cleanText.isEmpty
                        ? "I’m with you. The connected foundation is ready for the next decision."
                        : "I’ve captured that in this session. The next step is to keep the evidence boundary explicit and move one milestone at a time.",
                    source: "preview"
                )
                try? await Task.sleep(for: .milliseconds(650))
                self.state = .listening
            }
            return
        }

        guard state.isLive else {
            latestEvent = "The Realtime data channel is not ready yet."
            return
        }

        if !cleanText.isEmpty {
            send([
                "type": "conversation.item.create",
                "item": [
                    "type": "message",
                    "role": "user",
                    "content": [["type": "input_text", "text": cleanText]]
                ]
            ])
            if appendUserTranscript {
                appendTranscript(speaker: "Michael", text: cleanText, source: "typed")
            }
        }

        let purpose = reason
            .replacingOccurrences(of: "[^A-Za-z0-9_.-]", with: "_", options: .regularExpression)
            .prefix(64)
        send([
            "type": "response.create",
            "response": [
                "output_modalities": ["audio"],
                "metadata": ["response_purpose": String(purpose)]
            ]
        ])
        state = .thinking
    }

    func presentDailyBrief(_ brief: DailyBrief) {
        guard isSessionConfigured else {
            latestEvent = "Cooper is still loading the Daily Catch Up context."
            return
        }
        if isPreview {
            state = .speaking
            Task { @MainActor [weak self] in
                for (index, slide) in brief.slides.enumerated() {
                    if index > 0 { try? await Task.sleep(for: .milliseconds(1_100)) }
                    guard let self, self.state != .ended else { return }
                    self.appendTranscript(
                        id: "preview-daily-brief-\(slide.id)",
                        speaker: "Cooper",
                        text: slide.narration,
                        source: "preview_presentation"
                    )
                }
                self?.state = .listening
            }
            return
        }
        ask(brief.voicePrompt, reason: "session_presentation", appendUserTranscript: false)
    }

    func toggleMute() {
        isMuted.toggle()
        guard !isPreview else { return }
        evaluate("window.CooperTransport?.setMuted(\(isMuted ? "true" : "false"))")
    }

    func interrupt() {
        guard !isPreview else {
            state = .listening
            return
        }
        send(["type": "response.cancel"])
        state = .listening
    }

    func completeFunctionCall(_ call: VoiceFunctionCall, output: JSONValue) {
        guard let data = try? JSONEncoder().encode(output) else { return }
        let outputJSON = String(decoding: data, as: UTF8.self)
        send([
            "type": "conversation.item.create",
            "item": [
                "type": "function_call_output",
                "call_id": call.callId,
                "output": outputJSON
            ]
        ])
        latestEvent = "\(call.name) returned."
        ask(reason: "tool_result")
    }

    func updateRealtimeSession(_ session: JSONValue) {
        if isPreview {
            latestEvent = "Live context updated in this preview session."
            return
        }
        guard isSessionConfigured else {
            latestEvent = "Cooper is still loading the session. Try adding context again when the connection is ready."
            return
        }
        guard case .object(let values) = session, !values.isEmpty else {
            latestEvent = "The Cooper host did not return a Realtime session update."
            return
        }
        send([
            "type": "session.update",
            "session": session.foundationValue
        ])
        latestEvent = "Live context sent to the active Cooper session."
    }

    func stop() {
        reconnectTask?.cancel()
        reconnectTask = nil
        if !isPreview {
            evaluate("window.CooperTransport?.stop(true)")
            deactivateAudioSession()
        }
        state = .ended
        latestEvent = "Session transport stopped."
    }

    func fail(_ message: String) {
        reconnectTask?.cancel()
        reconnectTask = nil
        if !isPreview {
            deactivateAudioSession()
        }
        lastError = message
        latestEvent = message
        state = .failed
    }

    func reconnect() {
        reconnectAttempt = 0
        scheduleReconnect("Retrying the existing Cooper session.", delay: false)
    }

    private func scheduleReconnect(_ message: String, delay: Bool = true) {
        guard !isPreview, reconnectTask == nil, let serverURL, let callId = activeCall?.id else { return }
        guard reconnectAttempt < 3 else {
            fail("The voice connection stopped after three retry attempts. Your transcript remains saved; retry when the network is stable.")
            return
        }

        reconnectAttempt += 1
        state = .reconnecting
        lastError = message
        latestEvent = "Reconnect attempt \(reconnectAttempt) of 3"
        evaluate("window.CooperTransport?.stop(true)")
        deactivateAudioSession()
        let delayMilliseconds = 700 * reconnectAttempt

        reconnectTask = Task { @MainActor [weak self] in
            if delay {
                try? await Task.sleep(for: .milliseconds(delayMilliseconds))
            }
            guard let self, !Task.isCancelled, self.state == .reconnecting else { return }
            self.reconnectTask = nil
            await self.loadTransport(serverURL: serverURL, callId: callId)
        }
    }

    private func activateAudioSession() throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP]
        )
        try audioSession.setActive(true)
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    private func reset() {
        transcript = []
        activeCall = nil
        isMuted = false
        lastError = nil
        latestEvent = ""
        startedAt = nil
        isPreview = false
        resumePacket = nil
        reconnectAttempt = 0
        reconnectTask?.cancel()
        reconnectTask = nil
        outputBuffers = [:]
        persistedOutputKeys = []
        recordedUsageKeys = []
        usage = RealtimeUsage()
        isSessionConfigured = false
        state = .idle
    }

    private func synchronizeCookies(for url: URL) async {
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
        for cookie in cookies {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                cookieStore.setCookie(cookie) {
                    continuation.resume()
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                _ = try await webView.evaluateJavaScript(Self.transportScript)
                try await self.startInjectedTransport()
            } catch {
                self.fail("The iOS WebRTC transport could not start: \(error.localizedDescription)")
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        fail("The Cooper voice transport page could not load: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        fail("The Cooper voice transport could not connect to the configured host: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
    ) {
        let sameHost = origin.host.lowercased() == trustedHost
        let microphoneOnly = type == .microphone
        decisionHandler(sameHost && microphoneOnly ? .grant : .deny)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "cooperVoice",
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String else { return }

        switch kind {
        case "state":
            handleTransportState(body["value"] as? String ?? "")
        case "event":
            handleRealtimeJSON(body["json"] as? String ?? "")
        case "error":
            fail(body["message"] as? String ?? "Realtime transport failed.")
        case "disconnected":
            scheduleReconnect(body["message"] as? String ?? "The voice connection was interrupted.")
        case "ready":
            latestEvent = "WebRTC transport loaded."
        default:
            break
        }
    }

    private func startInjectedTransport() async throws {
        guard let serverURL, let callId = activeCall?.id else {
            throw CooperAPIError.invalidServerURL
        }
        var components = URLComponents(
            url: serverURL.appendingPathComponent("session"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "callId", value: callId)]
        guard let sessionURL = components?.url else { throw CooperAPIError.invalidServerURL }

        let configData = try JSONSerialization.data(withJSONObject: ["sessionURL": sessionURL.absoluteString])
        let configJSON = String(decoding: configData, as: UTF8.self)
        _ = try await webView.evaluateJavaScript("window.CooperTransport.start(\(configJSON))")
    }

    private func handleTransportState(_ value: String) {
        switch value {
        case "microphone": state = .microphone
        case "connecting": state = .connecting
        case "listening":
            state = .listening
            reconnectAttempt = 0
            lastError = nil
        case "ended":
            if state != .reconnecting { state = .ended }
        case "failed": state = .failed
        default: break
        }
        latestEvent = state.label
    }

    private func handleRealtimeJSON(_ json: String) {
        guard let data = json.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = event["type"] as? String else { return }

        latestEvent = type.replacingOccurrences(of: "_", with: " ")
        switch type {
        case "session.created":
            state = .connecting
        case "session.updated":
            isSessionConfigured = true
            state = .listening
        case "input_audio_buffer.speech_started":
            state = .hearing
        case "input_audio_buffer.speech_stopped":
            state = .thinking
        case "conversation.item.input_audio_transcription.completed":
            let text = event["transcript"] as? String ?? ""
            if let rawUsage = event["usage"] as? [String: Any] {
                let usageKey = "transcription:\(event["item_id"] as? String ?? UUID().uuidString)"
                if recordedUsageKeys.insert(usageKey).inserted {
                    usage.addTranscription(Self.usageTotals(rawUsage, transcription: true))
                }
            }
            appendTranscript(
                id: event["item_id"] as? String,
                speaker: "Michael",
                text: text,
                source: "mic",
                itemId: event["item_id"] as? String ?? ""
            )
            if CooperWakePhrase.matches(text) {
                ask(reason: "wake_phrase")
            } else {
                state = .listening
            }
        case "conversation.item.input_audio_transcription.failed":
            let error = event["error"] as? [String: Any]
            latestEvent = error?["message"] as? String ?? "The last utterance could not be transcribed."
            state = .listening
        case "response.created":
            state = .thinking
        case "response.output_audio.delta", "response.audio.delta":
            state = .speaking
        case "response.output_audio.done", "response.audio.done":
            state = .listening
        case "response.output_audio_transcript.delta", "response.audio_transcript.delta":
            let key = transcriptKey(event)
            outputBuffers[key, default: ""] += event["delta"] as? String ?? ""
        case "response.output_audio_transcript.done", "response.audio_transcript.done":
            let key = transcriptKey(event)
            let text = (event["transcript"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? outputBuffers[key, default: ""]
            guard !persistedOutputKeys.contains(key) else { return }
            appendTranscript(
                id: key,
                speaker: "Cooper",
                text: text,
                source: "cooper_audio",
                responseId: event["response_id"] as? String ?? "",
                itemId: event["item_id"] as? String ?? ""
            )
            persistedOutputKeys.insert(key)
            outputBuffers.removeValue(forKey: key)
        case "response.done":
            state = .listening
            if let response = event["response"] as? [String: Any],
               let rawUsage = response["usage"] as? [String: Any] {
                let usageKey = "response:\(response["id"] as? String ?? event["event_id"] as? String ?? UUID().uuidString)"
                if recordedUsageKeys.insert(usageKey).inserted {
                    usage.addResponse(Self.usageTotals(rawUsage, transcription: false))
                }
            }
            handleFunctionCalls(event)
        case "error":
            let error = event["error"] as? [String: Any]
            fail(error?["message"] as? String ?? "Realtime returned an error.")
        default:
            break
        }
    }

    private func transcriptKey(_ event: [String: Any]) -> String {
        (event["response_id"] as? String)
            ?? (event["item_id"] as? String)
            ?? UUID().uuidString
    }

    private static func usageTotals(_ raw: [String: Any], transcription: Bool) -> RealtimeUsageTotals {
        let input = raw["input_token_details"] as? [String: Any] ?? [:]
        let cached = input["cached_tokens_details"] as? [String: Any] ?? [:]
        let output = raw["output_token_details"] as? [String: Any] ?? [:]
        let inputTokens = integer(raw["input_tokens"])
        let outputTokens = integer(raw["output_tokens"])

        var totals = RealtimeUsageTotals(
            totalTokens: integer(raw["total_tokens"]),
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            inputTextTokens: integer(input["text_tokens"]),
            inputAudioTokens: integer(input["audio_tokens"]),
            inputImageTokens: integer(input["image_tokens"]),
            cachedTokens: integer(input["cached_tokens"]),
            cachedTextTokens: integer(cached["text_tokens"]),
            cachedAudioTokens: integer(cached["audio_tokens"]),
            cachedImageTokens: integer(cached["image_tokens"]),
            outputTextTokens: transcription ? outputTokens : integer(output["text_tokens"]),
            outputAudioTokens: transcription ? 0 : integer(output["audio_tokens"])
        )
        if totals.inputTextTokens == 0 && totals.inputAudioTokens == 0 && inputTokens > 0 {
            if transcription {
                totals.inputAudioTokens = inputTokens
            } else {
                totals.inputTextTokens = inputTokens
            }
        }
        if !transcription, totals.outputTextTokens == 0, totals.outputAudioTokens == 0, outputTokens > 0 {
            totals.outputTextTokens = outputTokens
        }
        return totals
    }

    private static func integer(_ value: Any?) -> Int {
        (value as? NSNumber)?.intValue ?? 0
    }

    private func handleFunctionCalls(_ event: [String: Any]) {
        guard let response = event["response"] as? [String: Any],
              let output = response["output"] as? [[String: Any]] else { return }
        let calls = output.filter { $0["type"] as? String == "function_call" }
        guard !calls.isEmpty else { return }

        for call in calls {
            guard let callId = call["call_id"] as? String else { continue }
            let name = call["name"] as? String ?? "tool"
            let functionCall = VoiceFunctionCall(
                callId: callId,
                name: name,
                arguments: call["arguments"] as? String ?? "{}"
            )
            latestEvent = "\(name) requested."
            if let onFunctionCall {
                onFunctionCall(functionCall)
            } else {
                completeFunctionCall(
                    functionCall,
                    output: .object([
                        "status": .string("unavailable"),
                        "message": .string("\(name) is not available in this iOS session.")
                    ])
                )
            }
        }
    }

    private func appendTranscript(
        id: String? = nil,
        speaker: String,
        text: String,
        source: String,
        responseId: String = "",
        itemId: String = ""
    ) {
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty else { return }
        let entry = TranscriptEntry(
            id: id ?? UUID().uuidString,
            at: ISO8601DateFormatter().string(from: Date()),
            speaker: speaker,
            text: cleanText,
            source: source,
            responseId: responseId,
            itemId: itemId
        )
        if let index = transcript.firstIndex(where: { $0.id == entry.id }) {
            transcript[index] = entry
        } else {
            transcript.append(entry)
        }
        onTranscript?(entry)
    }

    private func send(_ event: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(event),
              let data = try? JSONSerialization.data(withJSONObject: event) else { return }
        let json = String(decoding: data, as: UTF8.self)
        evaluate("window.CooperTransport?.send(\(json))")
    }

    private func evaluate(_ script: String) {
        webView.evaluateJavaScript(script) { _, _ in }
    }

    private static let transportScript = #"""
    (() => {
      if (window.CooperTransport) {
        window.webkit.messageHandlers.cooperVoice.postMessage({ kind: "ready" });
        return;
      }

      let pc = null;
      let dc = null;
      let stream = null;
      let audio = null;

      const post = (payload) => window.webkit.messageHandlers.cooperVoice.postMessage(payload);
      const state = (value) => post({ kind: "state", value });

      async function start(config) {
        try {
          state("microphone");
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });

          state("connecting");
          pc = new RTCPeerConnection();
          audio = document.createElement("audio");
          audio.autoplay = true;
          audio.setAttribute("playsinline", "");
          audio.style.display = "none";
          document.body.appendChild(audio);

          pc.ontrack = (event) => {
            audio.srcObject = event.streams[0];
            audio.play().catch(() => {});
          };
          pc.onconnectionstatechange = () => {
            if (["failed", "disconnected"].includes(pc.connectionState)) {
              post({ kind: "disconnected", message: `WebRTC ${pc.connectionState}.` });
            }
          };

          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          dc = pc.createDataChannel("oai-events");
          dc.onopen = () => state("listening");
          dc.onclose = () => state("ended");
          dc.onmessage = (message) => post({ kind: "event", json: String(message.data || "") });

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const response = await fetch(config.sessionURL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/sdp" },
            body: offer.sdp
          });
          const answerSdp = await response.text();
          if (!response.ok) throw new Error(answerSdp || `Session request failed (${response.status}).`);
          await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        } catch (error) {
          state("failed");
          post({ kind: "error", message: String(error?.message || error || "WebRTC failed.") });
        }
      }

      function send(event) {
        if (!dc || dc.readyState !== "open") {
          post({ kind: "error", message: "Realtime data channel is not open." });
          return false;
        }
        dc.send(JSON.stringify(event));
        return true;
      }

      function setMuted(muted) {
        stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      }

      function stop(silent = false) {
        try { dc?.close(); } catch {}
        try { pc?.close(); } catch {}
        stream?.getTracks().forEach((track) => track.stop());
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          audio.remove();
        }
        pc = null;
        dc = null;
        stream = null;
        audio = null;
        if (!silent) state("ended");
      }

      window.CooperTransport = { start, send, setMuted, stop };
      post({ kind: "ready" });
    })();
    """#
}

@MainActor
private final class VoiceMessageProxy: NSObject, WKScriptMessageHandler {
    weak var target: VoiceSessionController?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

private struct VoiceTransportView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct VoiceSessionView: View {
    @Environment(AppModel.self) private var model
    @State private var prompt = ""
    @State private var presentedSheet: VoiceSessionSheet?
    @State private var didStartDailyBriefPresentation = false
    let seed: VoiceSessionSeed

    var body: some View {
        @Bindable var voice = model.voice

        ZStack {
            Color.cooperCanvas.ignoresSafeArea()
            VoiceTransportView(webView: voice.webView)
                .frame(width: 2, height: 2)
                .opacity(0.01)
                .accessibilityHidden(true)

            VStack(spacing: 0) {
                sessionHeader(voice: voice)
                sessionBody(voice: voice)
                sessionControls(voice: voice)
            }
        }
        .task(id: seed.id) {
            await model.startVoiceSession(seed)
        }
        .onChange(of: voice.isSessionConfigured) { _, configured in
            guard configured,
                  !didStartDailyBriefPresentation,
                  let brief = seed.dailyBrief else { return }
            didStartDailyBriefPresentation = true
            presentedSheet = .dailyBrief(brief)
            voice.presentDailyBrief(brief)
        }
        .interactiveDismissDisabled(
            voice.state.isLive
                || voice.state == .connecting
                || voice.state == .reconnecting
                || voice.state == .microphone
        )
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .canvas(let session):
                NavigationStack {
                    SessionCanvasView(
                        session: session,
                        focus: seed.focus,
                        initialPacket: seed.contextPacket,
                        initialSessionContext: seed.sessionContext,
                        isLive: true
                    )
                }
            case .dailyBrief(let brief):
                NavigationStack {
                    DailyBriefDeckView(
                        brief: brief,
                        playbackText: voice.transcript.map(\.text).joined(separator: " "),
                        isLive: true
                    )
                }
            }
        }
    }

    private func sessionHeader(voice: VoiceSessionController) -> some View {
        HStack(spacing: 12) {
            CooperMark(compact: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(voice.activeCall?.title ?? seed.title)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                    .lineLimit(1)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    HStack(spacing: 5) {
                        Text(elapsedLabel(at: context.date, startedAt: voice.startedAt))
                        if voice.usage.totalTokens > 0 {
                            Text("·")
                            Text(telemetryLabel(voice.usage))
                        }
                    }
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Color.cooperMuted)
                }
            }
            Spacer()
            if let brief = seed.dailyBrief {
                Button {
                    presentedSheet = .dailyBrief(brief)
                } label: {
                    Image(systemName: "rectangle.stack.fill")
                        .frame(width: 34, height: 34)
                        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.cooperInk)
                .accessibilityLabel("Open Daily Catch Up")
                .accessibilityIdentifier("open-live-daily-brief")
            }
            if let call = voice.activeCall {
                Button {
                    Task { await model.handoffVoiceToChat(seed: seed) }
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .frame(width: 34, height: 34)
                        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.cooperInk)
                .accessibilityLabel("Continue this session in chat")
                .accessibilityIdentifier("handoff-voice-to-chat")

                Button {
                    presentedSheet = .canvas(call)
                } label: {
                    Image(systemName: "rectangle.on.rectangle.angled")
                        .frame(width: 34, height: 34)
                        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.cooperInk)
                .accessibilityLabel("Open Session Canvas")
                .accessibilityIdentifier("open-live-canvas")
            }
            StatusBadge(text: voice.state.label, connected: voice.state.isLive, emphasized: voice.state == .speaking)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(Color.white)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.cooperLine).frame(height: 1) }
    }

    private func sessionBody(voice: VoiceSessionController) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 20) {
                    VStack(spacing: 14) {
                        VoiceWaveform(state: voice.state)
                            .frame(height: 82)
                        Text(voice.state.label)
                            .font(.title2.bold())
                            .foregroundStyle(Color.cooperInk)
                        if let error = voice.lastError {
                            VStack(spacing: 10) {
                                InlineMessage(text: error, isError: voice.state == .failed)
                                if voice.canReconnect {
                                    Button {
                                        voice.reconnect()
                                    } label: {
                                        Label("Reconnect session", systemImage: "arrow.clockwise")
                                            .font(.subheadline.bold())
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        } else if !voice.latestEvent.isEmpty {
                            Text(voice.latestEvent)
                                .font(.caption.monospaced())
                                .foregroundStyle(Color.cooperMuted)
                                .lineLimit(2)
                        }
                    }
                    .padding(.vertical, 20)

                    if let packet = voice.resumePacket {
                        ResumeContextCard(packet: packet)
                    }

                    if voice.transcript.isEmpty {
                        EmptyContent(
                            icon: "waveform",
                            title: "The session is ready",
                            message: "Speak naturally, say Cooper to invite a response, or use Ask Cooper below."
                        )
                    } else {
                        ForEach(voice.transcript) { turn in
                            LiveTranscriptTurn(turn: turn)
                                .id(turn.id)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 20)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
            .onChange(of: voice.transcript.count) {
                guard let id = voice.transcript.last?.id else { return }
                withAnimation { proxy.scrollTo(id, anchor: .bottom) }
            }
        }
    }

    private func sessionControls(voice: VoiceSessionController) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                TextField("Ask Cooper", text: $prompt, axis: .vertical)
                    .lineLimit(1...3)
                    .submitLabel(.send)
                    .onSubmit { sendPrompt(voice: voice) }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))

                Button {
                    sendPrompt(voice: voice)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.headline)
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.cooperInk)
                .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
                .accessibilityLabel("Send to Cooper")
                .disabled(!voice.state.isLive || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            HStack(spacing: 10) {
                CallControlButton(
                    title: voice.isMuted ? "Unmute" : "Mute",
                    systemImage: voice.isMuted ? "mic.slash.fill" : "mic.fill",
                    active: voice.isMuted,
                    action: voice.toggleMute
                )
                CallControlButton(
                    title: voice.state == .speaking ? "Interrupt" : "Ask",
                    systemImage: voice.state == .speaking ? "hand.raised.fill" : "sparkles",
                    active: voice.state == .speaking,
                    action: voice.state == .speaking ? voice.interrupt : { voice.ask() }
                )
                Button {
                    Task { await model.endVoiceSession() }
                } label: {
                    Label("End", systemImage: "phone.down.fill")
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(Color.cooperDanger, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(Color.cooperLine).frame(height: 1) }
    }

    private func sendPrompt(voice: VoiceSessionController) {
        let value = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        voice.ask(value, reason: "typed_prompt")
        prompt = ""
    }

    private func elapsedLabel(at date: Date, startedAt: Date?) -> String {
        guard let startedAt else { return "00:00" }
        let seconds = max(0, Int(date.timeIntervalSince(startedAt)))
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    private func telemetryLabel(_ usage: RealtimeUsage) -> String {
        let tokens = usage.totalTokens >= 1_000
            ? String(format: "%.1fk", Double(usage.totalTokens) / 1_000)
            : String(usage.totalTokens)
        let cost = usage.costUsd < 0.01
            ? String(format: "$%.4f", usage.costUsd)
            : String(format: "$%.2f", usage.costUsd)
        return "\(tokens) tok · \(cost)"
    }
}

private struct ResumeContextCard: View {
    let packet: SessionResumePacket

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("CONTINUITY PACKET")
                        .font(.caption2.weight(.bold).monospaced())
                        .tracking(0.7)
                        .foregroundStyle(Color.cooperMuted)
                    Text("Where this session left off")
                        .font(.headline)
                        .foregroundStyle(Color.cooperInk)
                }
                Spacer()
                StatusBadge(text: "Loaded", connected: true)
            }

            if !packet.summary.isEmpty {
                Text(packet.summary)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperInk)
            }

            if let question = packet.openQuestions.last {
                ResumeContextLine(label: "Open", text: question.text)
            }
            if let action = packet.nextActions.last {
                ResumeContextLine(label: "Next", text: action.text)
            }
        }
        .padding(15)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        .accessibilityElement(children: .combine)
    }
}

private struct ResumeContextLine: View {
    let label: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Text(label.uppercased())
                .font(.caption2.weight(.bold).monospaced())
                .foregroundStyle(Color.cooperMuted)
                .frame(width: 34, alignment: .leading)
            Text(text)
                .font(.caption)
                .foregroundStyle(Color.cooperInk)
        }
    }
}

private struct VoiceWaveform: View {
    let state: VoiceConnectionState

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { context in
            let phase = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 5) {
                ForEach(0..<17, id: \.self) { index in
                    let active = state.isLive
                    let amplitude = active ? 18 + abs(sin(phase * 3.4 + Double(index) * 0.62)) * 46 : 12
                    Capsule()
                        .fill(state == .speaking ? Color.cooperVolt : Color.cooperInk)
                        .frame(width: 4, height: amplitude)
                }
            }
            .animation(.easeInOut(duration: 0.18), value: state)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.label)
    }
}

private struct LiveTranscriptTurn: View {
    let turn: TranscriptEntry

    private var isCooper: Bool { turn.speaker.localizedCaseInsensitiveContains("cooper") }

    var body: some View {
        HStack {
            if !isCooper { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                Text(turn.speaker.uppercased())
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.6)
                    .foregroundStyle(Color.cooperMuted)
                Text(turn.text)
                    .font(.body)
                    .foregroundStyle(Color.cooperInk)
                    .textSelection(.enabled)
            }
            .padding(13)
            .background(isCooper ? Color.cooperSoft : Color.white, in: RoundedRectangle(cornerRadius: 8))
            .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
            if isCooper { Spacer(minLength: 40) }
        }
    }
}

private struct CallControlButton: View {
    let title: String
    let systemImage: String
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.cooperInk)
        .background(active ? Color.cooperVolt : Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
    }
}

#Preview("Voice session") {
    VoiceSessionView(seed: VoiceSessionSeed(focus: TodayResponse.preview.meetings.first, title: "Product & Engineering Roadmap"))
        .environment({
            let model = AppModel()
            model.today = .preview
            model.phase = .ready
            return model
        }())
}
