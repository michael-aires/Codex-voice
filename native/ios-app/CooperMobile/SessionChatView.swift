import SwiftUI

private enum SessionChatSheet: Identifiable {
    case canvas(SessionRecord)

    var id: String {
        switch self {
        case .canvas(let call): "canvas-\(call.id)"
        }
    }
}

struct SessionChatView: View {
    @Environment(AppModel.self) private var model
    @FocusState private var composerFocused: Bool

    let seed: VoiceSessionSeed
    @State private var call: SessionRecord?
    @State private var transcript: [TranscriptEntry] = []
    @State private var activities: [SessionChatActivity] = []
    @State private var draft = ""
    @State private var isPreparing = true
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var startedAt: Date?
    @State private var presentedSheet: SessionChatSheet?

    private var sessionJobs: [ArtifactJob] {
        guard let call else { return [] }
        return model.artifactJobs.filter { $0.callId == call.id }.prefix(4).map { $0 }
    }

    private var sessionArtifacts: [ArtifactRecord] {
        guard let call else { return [] }
        return model.artifacts.filter { $0.callId == call.id }.prefix(4).map { $0 }
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        sessionFoundation

                        if isPreparing {
                            HStack(spacing: 10) {
                                ProgressView()
                                Text("Opening the durable session")
                                    .font(.subheadline.weight(.semibold))
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                        } else if transcript.isEmpty {
                            EmptyContent(
                                icon: "bubble.left.and.bubble.right",
                                title: "Chat is ready",
                                message: "Message Cooper now. Calendar, Notion, Arcade tools, approvals, canvas work, and artifacts use this same session without microphone access."
                            )
                        } else {
                            ForEach(transcript) { entry in
                                SessionChatBubble(entry: entry)
                                    .id(entry.id)
                            }
                        }

                        if !activities.isEmpty {
                            inlineActivities
                        }
                        if !sessionJobs.isEmpty || !sessionArtifacts.isEmpty {
                            inlineWork
                        }
                        if let errorMessage {
                            InlineMessage(text: errorMessage, isError: true)
                        }
                        Color.clear.frame(height: 1).id("chat-bottom")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 18)
                    .frame(maxWidth: 760)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: transcript.map(\.id)) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo("chat-bottom", anchor: .bottom)
                    }
                }
            }
            .background(Color.cooperCanvas)
            .safeAreaInset(edge: .bottom) { composer }
            .navigationTitle(call?.title ?? seed.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", systemImage: "xmark") {
                        model.chatSeed = nil
                        Task { await model.refreshSessionWork() }
                    }
                    .disabled(isSending)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if let call {
                        Button {
                            presentedSheet = .canvas(callWithCurrentTranscript(call))
                        } label: {
                            Image(systemName: "rectangle.on.rectangle.angled")
                        }
                        .accessibilityLabel("Open Session Canvas")
                        .accessibilityIdentifier("open-chat-canvas")

                        Button {
                            Task {
                                await model.handoffChatToVoice(
                                    seed: seed,
                                    call: callWithCurrentTranscript(call)
                                )
                            }
                        } label: {
                            Image(systemName: "waveform")
                        }
                        .disabled(isSending || isPreparing)
                        .accessibilityLabel("Add voice to this session")
                        .accessibilityIdentifier("handoff-chat-to-voice")

                        Menu {
                            Button("End session", systemImage: "checkmark.circle") {
                                Task {
                                    await model.endChatSession(
                                        callWithCurrentTranscript(call),
                                        startedAt: startedAt
                                    )
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .disabled(isSending)
                    }
                }
            }
        }
        .task(id: seed.id) { await prepare() }
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .canvas(let call):
                NavigationStack {
                    SessionCanvasView(
                        session: call,
                        focus: seed.focus,
                        initialPacket: seed.contextPacket,
                        initialSessionContext: seed.sessionContext,
                        isLive: true
                    )
                }
            }
        }
    }

    private var sessionFoundation: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lock.shield")
                .font(.title3)
                .foregroundStyle(Color.cooperInk)
            VStack(alignment: .leading, spacing: 4) {
                Text("SHARED SESSION")
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.7)
                    .foregroundStyle(Color.cooperMuted)
                Text("Chat now. Add voice when useful.")
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                Text("Every typed and spoken turn uses one transcript, context boundary, tool history, canvas, and artifact queue.")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
            Spacer(minLength: 0)
            StatusBadge(
                text: isSending ? "Cooper typing" : isPreparing ? "Opening" : "Chat ready",
                connected: !isPreparing && errorMessage == nil,
                emphasized: isSending
            )
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        .accessibilityIdentifier("shared-session-chat-foundation")
    }

    private var inlineActivities: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(eyebrow: "Live activity", title: "Tools and approvals")
            ForEach(activities) { activity in
                HStack(spacing: 11) {
                    if activity.status == "running" {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: activity.status == "approval_required" ? "hand.raised.fill" : activity.status == "error" ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(activity.status == "error" ? Color.cooperDanger : Color.cooperInk)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(activity.label)
                            .font(.subheadline.bold())
                            .foregroundStyle(Color.cooperInk)
                        Text(activity.message.isEmpty ? activity.status.replacingOccurrences(of: "_", with: " ") : activity.message)
                            .font(.caption)
                            .foregroundStyle(Color.cooperMuted)
                            .lineLimit(3)
                    }
                    Spacer()
                    StatusBadge(text: activity.status.replacingOccurrences(of: "_", with: " "), connected: activity.status == "completed")
                }
                .padding(13)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
            }
        }
        .accessibilityIdentifier("chat-tool-activity")
    }

    private var inlineWork: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(eyebrow: "Session work", title: "Artifacts and background jobs")
            ForEach(sessionJobs) { job in
                HStack(spacing: 10) {
                    if job.isActive { ProgressView().controlSize(.small) }
                    Image(systemName: job.status == "failed" ? "exclamationmark.triangle" : "hammer")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(job.title).font(.subheadline.bold())
                        Text(job.status.replacingOccurrences(of: "_", with: " "))
                            .font(.caption)
                            .foregroundStyle(Color.cooperMuted)
                    }
                    Spacer()
                }
                .padding(12)
                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
            }
            ForEach(sessionArtifacts) { artifact in
                NavigationLink {
                    ArtifactDetailView(artifact: artifact)
                } label: {
                    HStack(spacing: 11) {
                        Image(systemName: artifact.isHTML ? "safari" : "doc.text")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(artifact.title).font(.subheadline.bold())
                            Text(artifact.outputType.uppercased())
                                .font(.caption2.monospaced())
                                .foregroundStyle(Color.cooperMuted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.bold())
                    }
                    .foregroundStyle(Color.cooperInk)
                    .padding(12)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                }
                .buttonStyle(.plain)
            }
        }
        .accessibilityIdentifier("chat-inline-work")
    }

    private var composer: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message Cooper", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .submitLabel(.send)
                    .onSubmit { send() }
                    .focused($composerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
                    .disabled(isPreparing || isSending)

                Button(action: send) {
                    Group {
                        if isSending {
                            ProgressView().tint(Color.cooperInk)
                        } else {
                            Image(systemName: "arrow.up").font(.headline)
                        }
                    }
                    .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.cooperInk)
                .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 9))
                .disabled(isPreparing || isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send to Cooper")
                .accessibilityIdentifier("send-session-chat")
            }
            Text("Microphone access is optional. Typed turns use the same Cooper tools and durable session state.")
                .font(.caption2)
                .foregroundStyle(Color.cooperMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    private func prepare() async {
        guard call == nil else { return }
        isPreparing = true
        errorMessage = nil
        do {
            let preparedCall = try await model.prepareChatSession(seed)
            call = preparedCall
            transcript = preparedCall.transcript
            startedAt = Date()
            isPreparing = false
            composerFocused = true
            await model.refreshSessionWork()
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            isPreparing = false
        }
    }

    private func send() {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let call, !message.isEmpty, !isSending else { return }
        draft = ""
        composerFocused = true
        Task { await send(message, to: call) }
    }

    private func send(_ message: String, to call: SessionRecord) async {
        let messageId = UUID().uuidString.lowercased()
        let streamEntryId = "stream-\(messageId)"
        isSending = true
        defer { isSending = false }
        errorMessage = nil
        activities.removeAll()

        if model.isPreviewMode {
            let user = TranscriptEntry(
                id: messageId,
                at: ISO8601DateFormatter().string(from: Date()),
                speaker: "Michael",
                text: message,
                source: "typed_chat"
            )
            upsert(user)
            try? await Task.sleep(for: .milliseconds(350))
            let response = TranscriptEntry(
                id: UUID().uuidString,
                at: ISO8601DateFormatter().string(from: Date()),
                speaker: "Cooper",
                text: "I have the shared session context and your typed request. We can keep working here, open the canvas, or add voice without losing this turn.",
                source: "typed_chat"
            )
            upsert(response)
            self.call = callWithCurrentTranscript(call)
            return
        }

        do {
            let events = try await model.sessionChatEvents(callId: call.id, message: message, messageId: messageId)
            var streamedText = ""
            for try await event in events {
                try Task.checkCancellation()
                switch event.type {
                case "message.accepted":
                    if let entry = event.entry { upsert(entry) }
                    if let eventCall = event.call { self.call = eventCall }
                case "message.delta":
                    streamedText += event.delta
                    upsert(TranscriptEntry(
                        id: streamEntryId,
                        at: ISO8601DateFormatter().string(from: Date()),
                        speaker: "Cooper",
                        text: streamedText,
                        source: "typed_chat_stream"
                    ))
                case "message.completed":
                    transcript.removeAll { $0.id == streamEntryId }
                    if let entry = event.entry { upsert(entry) }
                    if let eventCall = event.call { self.call = eventCall }
                case "activity.started", "activity.completed":
                    if let activity = event.activity { upsert(activity) }
                case "session.snapshot":
                    if let eventCall = event.call { self.call = eventCall }
                case "error":
                    throw CooperAPIError.server(status: 500, message: event.error.isEmpty ? "Cooper chat failed." : event.error)
                default:
                    break
                }
            }
            await model.refreshSessionWork()
        } catch is CancellationError {
            return
        } catch {
            transcript.removeAll { $0.id == streamEntryId }
            errorMessage = error.localizedDescription
        }
    }

    private func upsert(_ entry: TranscriptEntry) {
        if let index = transcript.firstIndex(where: { $0.id == entry.id }) {
            transcript[index] = entry
        } else {
            transcript.append(entry)
        }
    }

    private func upsert(_ activity: SessionChatActivity) {
        if let index = activities.firstIndex(where: { $0.id == activity.id }) {
            activities[index] = activity
        } else {
            activities.append(activity)
        }
    }

    private func callWithCurrentTranscript(_ value: SessionRecord) -> SessionRecord {
        var next = value
        next.transcript = transcript
        return next
    }
}

private struct SessionChatBubble: View {
    let entry: TranscriptEntry

    private var isCooper: Bool {
        entry.speaker.localizedCaseInsensitiveContains("cooper")
    }

    var body: some View {
        HStack {
            if !isCooper { Spacer(minLength: 42) }
            VStack(alignment: .leading, spacing: 6) {
                Text(isCooper ? "COOPER" : "MICHAEL")
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.6)
                    .foregroundStyle(Color.cooperMuted)
                Text(entry.text)
                    .font(.body)
                    .foregroundStyle(Color.cooperInk)
                    .textSelection(.enabled)
            }
            .padding(13)
            .background(isCooper ? Color.white : Color.cooperVolt.opacity(0.42), in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(isCooper ? Color.cooperLine : Color.cooperVolt) }
            if isCooper { Spacer(minLength: 42) }
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview("Session chat") {
    SessionChatView(seed: VoiceSessionSeed(
        focus: TodayResponse.preview.tasks.first,
        title: "Shared Cooper session",
        precreatedCall: SessionRecord(
            id: "preview-chat",
            title: "Shared Cooper session",
            status: "active",
            startedAt: ISO8601DateFormatter().string(from: Date()),
            transcript: [
                TranscriptEntry(speaker: "Michael", text: "Turn this plan into a phased implementation."),
                TranscriptEntry(speaker: "Cooper", text: "I’ll preserve the evidence boundary and start with the first vertical milestone.")
            ]
        )
    ))
    .environment({
        let model = AppModel()
        model.phase = .ready
        return model
    }())
}
