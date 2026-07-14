import SwiftUI

struct SessionsView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""

    private var filteredSessions: [SessionRecord] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return model.sessions
        }
        return model.sessions.filter { session in
            session.title.localizedCaseInsensitiveContains(query)
                || session.projectTitle.localizedCaseInsensitiveContains(query)
                || session.transcript.contains { $0.text.localizedCaseInsensitiveContains(query) }
        }
    }

    var body: some View {
        Group {
            if model.sessions.isEmpty {
                EmptyContent(
                    icon: "waveform",
                    title: "No saved sessions",
                    message: "Ended Cooper calls will appear here with their transcript and project context."
                )
                .padding(24)
            } else {
                List(filteredSessions) { session in
                    NavigationLink(value: session) {
                        SessionRow(session: session)
                    }
                    .listRowBackground(Color.cooperCanvas)
                    .listRowSeparatorTint(Color.cooperLine)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Sessions")
        .searchable(text: $query, prompt: "Search sessions and transcripts")
        .navigationDestination(for: SessionRecord.self) { session in
            SessionDetailView(session: session)
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                NavigationLink {
                    ArtifactLibraryView()
                } label: {
                    Image(systemName: "books.vertical")
                }
                .accessibilityLabel("Open Library")
                .accessibilityIdentifier("open-artifact-library")

                Button {
                    Task { await model.refreshAll(forceToday: false) }
                } label: {
                    if model.isRefreshing { ProgressView() } else { Image(systemName: "arrow.clockwise") }
                }
                .accessibilityLabel("Refresh Sessions")
                .disabled(model.isRefreshing || model.isPreviewMode)
            }
        }
        .refreshable {
            await model.refreshAll(forceToday: false)
        }
    }
}

private struct SessionRow: View {
    let session: SessionRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(session.title)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                    .lineLimit(2)
                Spacer()
                StatusBadge(text: session.status, connected: session.status == "active")
            }
            HStack(spacing: 8) {
                Label(session.startedAt.cooperDateTime, systemImage: "calendar")
                Label(session.durationSeconds.cooperDuration, systemImage: "clock")
                Label("\(session.transcriptCount)", systemImage: "text.bubble")
            }
            .font(.caption)
            .foregroundStyle(Color.cooperMuted)

            if !session.projectTitle.isEmpty {
                Text(session.projectTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.cooperMuted)
            }

            if session.isImportedPlan {
                Label(session.sourceLabel.isEmpty ? "Imported plan" : session.sourceLabel, systemImage: "doc.badge.arrow.up")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.cooperInk)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct SessionDetailView: View {
    @Environment(AppModel.self) private var model
    let session: SessionRecord

    private var sessionArtifacts: [ArtifactRecord] {
        model.artifacts.filter { $0.callId == session.id }
    }

    private var sessionJobs: [ArtifactJob] {
        model.artifactJobs.filter { $0.callId == session.id }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                sessionHeader

                Rectangle().fill(Color.cooperLine).frame(height: 1)

                if !sessionArtifacts.isEmpty || !sessionJobs.isEmpty {
                    SectionHeading(
                        eyebrow: "Session output",
                        title: "Artifacts and work",
                        trailing: "\(sessionArtifacts.count) ready"
                    )

                    ForEach(sessionArtifacts) { artifact in
                        NavigationLink {
                            ArtifactDetailView(artifact: artifact)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: artifact.isHTML ? "safari" : "doc.text")
                                    .foregroundStyle(Color.cooperInk)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(artifact.title)
                                        .font(.subheadline.bold())
                                        .foregroundStyle(Color.cooperInk)
                                    Text(artifact.outputType.uppercased())
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(Color.cooperMuted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(Color.cooperMuted)
                            }
                            .padding(14)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                            .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(sessionJobs.filter { $0.artifactId.isEmpty }) { job in
                        HStack(spacing: 10) {
                            if job.isActive { ProgressView().controlSize(.small) }
                            Image(systemName: job.status == "failed" ? "exclamationmark.triangle" : "hammer")
                                .foregroundStyle(job.status == "failed" ? Color.red : Color.cooperMuted)
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

                    Rectangle().fill(Color.cooperLine).frame(height: 1)
                }

                SectionHeading(eyebrow: "Session memory", title: "Transcript", trailing: "\(session.transcriptCount) turns")

                if session.transcript.isEmpty {
                    EmptyContent(icon: "text.bubble", title: "No transcript captured", message: "This session has metadata but no saved conversation turns.")
                } else {
                    ForEach(session.transcript) { turn in
                        TranscriptTurn(turn: turn)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
            // Keep the mirrored mobile work surface composed if Simulator or browser
            // accessibility settings unexpectedly apply an extreme text category.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        }
        .background(Color.cooperCanvas)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var sessionHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            StatusBadge(text: session.status, connected: session.status == "active")

            Text(session.title)
                .font(.title2.bold())
                .foregroundStyle(Color.cooperInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            sessionMetadata

            if let usage = session.realtimeUsage, usage.totalTokens > 0 {
                Label(usageSummary(usage), systemImage: "gauge.with.dots.needle.50percent")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Color.cooperMuted)
            }

            if !session.projectTitle.isEmpty {
                Label(session.projectTitle, systemImage: "folder")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.cooperInk)
            }

            if session.isImportedPlan {
                Label(
                    "\(session.sourceLabel.isEmpty ? "Imported plan" : session.sourceLabel) · \(session.contextSourceCount) locked context source\(session.contextSourceCount == 1 ? "" : "s")",
                    systemImage: "doc.badge.arrow.up"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.cooperInk)
                .accessibilityIdentifier("imported-plan-context")
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    chatButton
                    voiceButton
                }
                VStack(spacing: 10) {
                    chatButton
                    voiceButton
                }
            }

            NavigationLink {
                SessionCanvasView(
                    session: session,
                    initialPacket: model.contextPackets.first { $0.id == session.contextPacketId }
                )
            } label: {
                Label("Open Session Canvas", systemImage: "rectangle.on.rectangle.angled")
                    .font(.subheadline.bold())
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .padding(.horizontal, 14)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.cooperInk)
            .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
            .accessibilityIdentifier("open-session-canvas")
        }
    }

    private var sessionMetadata: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) {
                sessionDateLabel
                sessionDurationLabel
            }
            VStack(alignment: .leading, spacing: 7) {
                sessionDateLabel
                sessionDurationLabel
            }
        }
        .font(.caption)
        .foregroundStyle(Color.cooperMuted)
    }

    private var sessionDateLabel: some View {
        Label(session.startedAt.cooperDateTime, systemImage: "calendar")
            .lineLimit(1)
            .minimumScaleFactor(0.85)
    }

    private var sessionDurationLabel: some View {
        Label(session.durationSeconds.cooperDuration, systemImage: "clock")
            .lineLimit(1)
    }

    private var chatButton: some View {
        Button {
            model.presentChatSession(resuming: session)
        } label: {
            Label("Chat", systemImage: "bubble.left.and.bubble.right.fill")
                .font(.subheadline.bold())
                .frame(maxWidth: .infinity, minHeight: 46)
                .padding(.horizontal, 12)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.cooperInk)
        .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityIdentifier("continue-session-chat")
    }

    private var voiceButton: some View {
        Button {
            model.presentVoiceSession(resuming: session)
        } label: {
            Label("Voice", systemImage: "waveform")
                .font(.subheadline.bold())
                .frame(maxWidth: .infinity, minHeight: 46)
                .padding(.horizontal, 12)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.cooperInk)
        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityIdentifier("continue-session-voice")
    }

    private func usageSummary(_ usage: RealtimeUsage) -> String {
        let cost = usage.costUsd < 0.01
            ? String(format: "$%.4f", usage.costUsd)
            : String(format: "$%.2f", usage.costUsd)
        return "\(usage.totalTokens.formatted()) tokens · \(cost)"
    }
}

private struct TranscriptTurn: View {
    let turn: TranscriptEntry

    private var isCooper: Bool {
        turn.speaker.localizedCaseInsensitiveContains("cooper")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(turn.speaker.uppercased())
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.6)
                Spacer()
                Text(turn.at.cooperDateTime)
                    .font(.caption2)
            }
            .foregroundStyle(Color.cooperMuted)
            Text(turn.text)
                .font(.body)
                .foregroundStyle(Color.cooperInk)
                .textSelection(.enabled)
        }
        .padding(14)
        .background(isCooper ? Color.cooperSoft : Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
    }
}

#Preview("Sessions") {
    NavigationStack { SessionsView() }
        .environment({
            let model = AppModel()
            model.sessions = SessionRecord.previews
            model.phase = .ready
            return model
        }())
}
