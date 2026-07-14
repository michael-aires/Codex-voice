import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var model

    private var sources: [SourceStatus] {
        [model.today.sources.calendar, model.today.sources.notion, model.today.sources.projects, model.today.sources.sessions]
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 30) {
                hero

                if !model.lastRefreshErrors.isEmpty {
                    InlineMessage(text: model.lastRefreshErrors.joined(separator: "\n"), isError: true)
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(sources) { source in
                            SourceStatusPill(source: source)
                        }
                    }
                }
                .contentMargins(.horizontal, 1, for: .scrollContent)

                DailyBriefSummaryCard()
                meetingsSection
                tasksSection
                projectsSection
                sessionsSection
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 20)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshToday() }
                } label: {
                    if model.isRefreshing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .accessibilityLabel("Refresh Today")
                .disabled(model.isRefreshing || model.isPreviewMode)
            }
        }
        .refreshable {
            await model.refreshToday()
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(model.today.date.isEmpty ? "CONNECTED WORKSPACE" : model.today.date)
                    .font(.caption.weight(.bold).monospaced())
                    .tracking(0.8)
                    .foregroundStyle(Color.cooperMuted)
                Spacer()
                if model.isPreviewMode {
                    StatusBadge(text: "Simulator preview", emphasized: true)
                }
            }

            Text("Your operating picture, already in context.")
                .font(.largeTitle.bold())
                .foregroundStyle(Color.cooperInk)
                .fixedSize(horizontal: false, vertical: true)

            Text("Calendar, active Notion work, and session memory stay separate at the source and come together here for the next conversation.")
                .font(.body)
                .foregroundStyle(Color.cooperMuted)

            Button {
                model.presentVoiceSession()
            } label: {
                Label("New voice session", systemImage: "waveform")
                    .font(.subheadline.bold())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.cooperInk)
            .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
            .accessibilityIdentifier("new-voice-session")
        }
    }

    @ViewBuilder
    private var meetingsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(
                eyebrow: "Calendar",
                title: "Meetings",
                trailing: model.today.meetings.isEmpty ? nil : "\(model.today.meetings.count) today"
            )

            if model.today.meetings.isEmpty {
                EmptyContent(icon: "calendar", title: "No meetings loaded", message: model.today.sources.calendar.message)
            } else {
                ForEach(model.today.meetings) { meeting in
                    MeetingRow(
                        meeting: meeting,
                        onStart: { model.presentVoiceSession(focus: meeting) }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(
                eyebrow: "Workspace",
                title: "Active projects",
                trailing: model.today.projects.isEmpty ? nil : "\(model.today.projects.count) available"
            )

            if model.today.projects.isEmpty {
                EmptyContent(icon: "folder", title: "No active projects", message: model.today.sources.projects.message)
            } else {
                ForEach(model.today.projects.prefix(4)) { project in
                    TodayProjectRow(
                        project: project,
                        onOpen: { model.open(.project(project.targetId)) },
                        onStart: { model.presentVoiceSession(focus: project) }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var tasksSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(
                eyebrow: "Notion",
                title: model.today.sprint?.title ?? "Sprint priorities",
                trailing: model.today.tasks.isEmpty ? nil : "\(model.today.tasks.count) open"
            )

            if model.today.tasks.isEmpty {
                EmptyContent(icon: "checklist", title: "No sprint work loaded", message: model.today.sources.notion.message)
            } else {
                ForEach(model.today.tasks) { task in
                    TaskRow(task: task) {
                        model.presentVoiceSession(focus: task)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var sessionsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(
                eyebrow: "Memory",
                title: "Continue a session",
                trailing: model.today.sessions.isEmpty ? nil : "Recent"
            )

            if model.today.sessions.isEmpty {
                EmptyContent(icon: "waveform", title: "No ended sessions yet", message: model.today.sources.sessions.message)
            } else {
                ForEach(model.today.sessions.prefix(3)) { session in
                    TodaySessionRow(
                        session: session,
                        onOpen: { model.open(.session(session.targetId)) },
                        onResume: {
                            if let saved = model.sessions.first(where: { $0.id == session.targetId }) {
                                model.presentVoiceSession(resuming: saved)
                            } else {
                                model.open(.session(session.targetId))
                            }
                        }
                    )
                }
            }
        }
    }
}

private struct MeetingRow: View {
    let meeting: TodayItem
    let onStart: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 2) {
                Text(meeting.time.isEmpty ? "TODAY" : meeting.time)
                    .font(.subheadline.weight(.bold).monospacedDigit())
                Text(meeting.duration)
                    .font(.caption2)
                    .foregroundStyle(Color.cooperMuted)
            }
            .frame(width: 58)

            Rectangle()
                .fill(meeting.status == "next" ? Color.cooperVolt : Color.cooperLine)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(meeting.title)
                        .font(.headline)
                        .foregroundStyle(Color.cooperInk)
                    Spacer()
                    if meeting.status == "next" {
                        StatusBadge(text: "Next", emphasized: true)
                    }
                }
                Text(meeting.subtitle)
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
                Text(meeting.description)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperInk)
                    .lineLimit(3)

                HStack(spacing: 9) {
                    Button("Start with Cooper", action: onStart)
                        .font(.caption.bold())
                        .buttonStyle(.bordered)
                        .tint(Color.cooperInk)

                    if let joinURL = meeting.conference.joinURL {
                        Link(destination: joinURL) {
                            Label(meeting.conference.joinLabel, systemImage: "video")
                        }
                        .font(.caption.bold())
                        .buttonStyle(.borderedProminent)
                        .tint(Color.cooperInk)
                    } else if let sourceURL = meeting.sourceURL {
                        Link("Open calendar", destination: sourceURL)
                            .font(.caption.bold())
                    }
                }
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
    }
}

private struct TaskRow: View {
    let task: TodayItem
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(task.eyebrow.isEmpty ? task.sourceLabel : task.eyebrow)
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.5)
                    .foregroundStyle(Color.cooperMuted)
                    .lineLimit(1)
                Spacer()
                StatusBadge(text: task.status, connected: task.priority == "active")
            }
            Text(task.title)
                .font(.headline)
                .foregroundStyle(Color.cooperInk)
            Text(task.description)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
                .lineLimit(3)

            if let detail = task.points.first {
                Label(detail, systemImage: "circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
                    .symbolRenderingMode(.hierarchical)
            }

            Button(task.actionLabel.isEmpty ? "Work with Cooper" : task.actionLabel, action: onStart)
                .font(.caption.bold())
                .buttonStyle(.bordered)
                .tint(Color.cooperInk)

            if let sourceURL = task.sourceURL {
                Link(destination: sourceURL) {
                    Label("Open in Notion", systemImage: "arrow.up.right")
                }
                .font(.caption.bold())
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
    }
}

private struct TodayProjectRow: View {
    let project: TodayItem
    let onOpen: () -> Void
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                StatusBadge(text: project.status, connected: project.priority == "active")
                Spacer()
                Text(project.subtitle)
                    .font(.caption2.monospaced())
                    .foregroundStyle(Color.cooperMuted)
            }
            Text(project.title)
                .font(.headline)
                .foregroundStyle(Color.cooperInk)
            Text(project.description)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
                .lineLimit(3)
            if let detail = project.points.first {
                Label(detail, systemImage: "doc.on.doc")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
            HStack(spacing: 9) {
                Button("Open project", action: onOpen)
                    .font(.caption.bold())
                    .buttonStyle(.bordered)
                    .tint(Color.cooperInk)
                Button(project.actionLabel.isEmpty ? "Work with Cooper" : project.actionLabel, action: onStart)
                    .font(.caption.bold())
                    .buttonStyle(.borderedProminent)
                    .tint(Color.cooperInk)
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
    }
}

private struct TodaySessionRow: View {
    let session: TodayItem
    let onOpen: () -> Void
    let onResume: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                Text(session.title)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                Spacer()
                Text(session.eyebrow)
                    .font(.caption2.monospaced())
                    .foregroundStyle(Color.cooperMuted)
            }
            Text(session.description)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
                .lineLimit(2)
            if let detail = session.points.first {
                Label(detail, systemImage: "text.bubble")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
            HStack(spacing: 9) {
                Button("Open session", action: onOpen)
                    .font(.caption.bold())
                    .buttonStyle(.bordered)
                    .tint(Color.cooperInk)
                Button(session.actionLabel.isEmpty ? "Resume with Cooper" : session.actionLabel, action: onResume)
                    .font(.caption.bold())
                    .buttonStyle(.borderedProminent)
                    .tint(Color.cooperInk)
            }
        }
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.cooperLine).frame(height: 1)
        }
    }
}

#Preview("Today") {
    NavigationStack { TodayView() }
        .environment({
            let model = AppModel()
            model.today = .preview
            model.dailyBrief = .preview
            model.sessions = SessionRecord.previews
            model.phase = .ready
            return model
        }())
}
