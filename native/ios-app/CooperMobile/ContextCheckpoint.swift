import SwiftUI
import UniformTypeIdentifiers

enum SessionLaunchMode: String, CaseIterable, Hashable, Sendable, Identifiable {
    case chat
    case voice

    var id: String { rawValue }
    var label: String { self == .chat ? "Chat" : "Voice" }
    var systemImage: String { self == .chat ? "bubble.left.and.bubble.right.fill" : "waveform" }
}

struct ContextCheckpointSeed: Identifiable, Hashable, Sendable {
    let id = UUID()
    var focus: TodayItem?
    var resumedSession: SessionRecord?
    var dailyBrief: DailyBrief?
    var preferredLaunchMode: SessionLaunchMode = .voice

    var title: String {
        resumedSession?.title ?? dailyBrief?.title ?? focus?.title ?? "Fresh Cooper session"
    }

    var detail: String {
        if let resumedSession {
            return resumedSession.projectTitle.isEmpty
                ? "Continue from saved session memory"
                : "Continue in \(resumedSession.projectTitle)"
        }
        if let dailyBrief {
            return "\(dailyBrief.dateLabel) · Calendar + Notion · \(dailyBrief.slides.count) slides"
        }
        return focus?.subtitle.isEmpty == false
            ? focus?.subtitle ?? ""
            : focus?.description ?? "Start with a clean evidence boundary"
    }
}

private enum ContextCheckpointSheet: Identifiable {
    case provider(ContextProvider)
    case paste

    var id: String {
        switch self {
        case .provider(let provider): "provider-\(provider.rawValue)"
        case .paste: "paste"
        }
    }
}

struct ContextCheckpointView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let seed: ContextCheckpointSeed
    @State private var intent: String
    @State private var sources: [ContextSource]
    @State private var presentedSheet: ContextCheckpointSheet?
    @State private var pendingFiles: [URL] = []
    @State private var preparationKinds = Set(SessionPreparationOption.all.map(\.kind))
    @State private var launchMode: SessionLaunchMode
    @State private var isFileImporterPresented = false
    @State private var isLaunching = false
    @State private var errorMessage: String?

    init(seed: ContextCheckpointSeed) {
        self.seed = seed
        let initialIntent = seed.dailyBrief?.summary.isEmpty == false
            ? seed.dailyBrief?.summary ?? ""
            : seed.focus?.description.isEmpty == false
            ? seed.focus?.description ?? ""
            : seed.focus?.prompt ?? ""
        _intent = State(initialValue: initialIntent)
        _sources = State(initialValue: Self.lockedSources(for: seed))
        _launchMode = State(initialValue: seed.preferredLaunchMode)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    checkpointProgress
                    focusCard
                    intentSection
                    if seed.resumedSession != nil, inheritedSourceCount > 0 {
                        inheritedContextSection
                    }
                    sourcesSection
                    preparationSection
                    evidenceBoundary

                    if let errorMessage {
                        InlineMessage(text: errorMessage, isError: true)
                    }
                }
                .padding(18)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
            .background(Color.cooperCanvas)
            .safeAreaInset(edge: .bottom) {
                launchActions
            }
            .navigationTitle("Context checkpoint")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .disabled(isLaunching)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    CooperMark(compact: true)
                }
            }
            .interactiveDismissDisabled(isLaunching)
            .sheet(item: $presentedSheet) { sheet in
                switch sheet {
                case .provider(let provider):
                    ContextSourcePicker(provider: provider, sources: $sources)
                case .paste:
                    PasteContextView(sources: $sources)
                }
            }
            .fileImporter(
                isPresented: $isFileImporterPresented,
                allowedContentTypes: [.pdf, .plainText, .text],
                allowsMultipleSelection: true
            ) { result in
                handleImportedFiles(result)
            }
        }
    }

    private var launchActions: some View {
        VStack(spacing: 8) {
            Picker("Session mode", selection: $launchMode) {
                ForEach(SessionLaunchMode.allCases) { mode in
                    Label(mode.label, systemImage: mode.systemImage).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("session-launch-mode")

            Button {
                Task { await launch(prepared: true) }
            } label: {
                HStack {
                    if isLaunching { ProgressView().tint(Color.cooperInk) }
                    Label(
                        isLaunching ? "Preparing context" : "Create and prepare session",
                        systemImage: "sparkles"
                    )
                    .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.cooperInk)
            .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 9))
            .disabled(isLaunching)
            .accessibilityIdentifier("start-prepared-session")

            Button("Enter without prep") {
                Task { await launch(prepared: false) }
            }
            .font(.subheadline.bold())
            .foregroundStyle(Color.cooperInk)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .disabled(isLaunching)
            .accessibilityIdentifier("start-session-without-prep")
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Divider()
        }
    }

    private var checkpointProgress: some View {
        HStack(spacing: 8) {
            CheckpointStep(number: "01", title: "Choose", complete: true)
            CheckpointStep(number: "02", title: "Context", active: true)
            CheckpointStep(number: "03", title: "Start")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step 2 of 3, load context")
    }

    private var focusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(seed.resumedSession == nil ? "SESSION FOCUS" : "CONTINUATION")
                .font(.caption2.weight(.bold).monospaced())
                .tracking(0.7)
                .foregroundStyle(Color.cooperMuted)
            Text(seed.title)
                .font(.title2.bold())
                .foregroundStyle(Color.cooperInk)
            if !seed.detail.isEmpty {
                Text(seed.detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperMuted)
            }
            if seed.resumedSession != nil {
                Label("The saved continuity packet will be refreshed before Realtime starts.", systemImage: "arrow.trianglehead.2.clockwise.rotate.90")
                    .font(.caption)
                    .foregroundStyle(Color.cooperInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
    }

    private var intentSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(eyebrow: "Outcome", title: "What should this session accomplish?")
            TextField(
                "Capture the decision, question, or output you want from this session.",
                text: $intent,
                axis: .vertical
            )
            .lineLimit(3...7)
            .padding(13)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
            .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
        }
    }

    private var inheritedPackets: [ContextPacket] {
        guard let session = seed.resumedSession else { return [] }
        let packetIDs = session.contextPacketIds.isEmpty
            ? [session.contextPacketId].filter { !$0.isEmpty }
            : session.contextPacketIds
        let packetsByID = Dictionary(uniqueKeysWithValues: model.contextPackets.map { ($0.id, $0) })
        return packetIDs.compactMap { packetsByID[$0] }
    }

    private var inheritedSources: [ContextSource] {
        var seen = Set<String>()
        return inheritedPackets.flatMap(\.sources).filter { source in
            seen.insert("\(source.provider):\(source.id)").inserted
        }
    }

    private var inheritedSourceCount: Int {
        max(seed.resumedSession?.contextSourceCount ?? 0, inheritedSources.count)
    }

    private var inheritedContextSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(
                eyebrow: "Inherited evidence",
                title: "\(inheritedSourceCount) locked source\(inheritedSourceCount == 1 ? "" : "s") continue"
            )
            Text("The Cooper host carries this bounded evidence into the continuation. New selections below form a separate current checkpoint; neither replaces the other.")
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)

            VStack(spacing: 0) {
                if inheritedSources.isEmpty {
                    HStack(spacing: 12) {
                        Image(systemName: "lock.doc")
                            .frame(width: 24)
                            .foregroundStyle(Color.cooperInk)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Saved session context")
                                .font(.subheadline.bold())
                                .foregroundStyle(Color.cooperInk)
                            Text("Metadata will refresh from the host when the continuation starts.")
                                .font(.caption)
                                .foregroundStyle(Color.cooperMuted)
                        }
                        Spacer()
                        StatusBadge(text: "Inherited", connected: true)
                    }
                    .padding(.vertical, 12)
                } else {
                    ForEach(inheritedSources) { source in
                        HStack(spacing: 12) {
                            Image(systemName: "lock.doc")
                                .frame(width: 24)
                                .foregroundStyle(Color.cooperInk)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(source.title)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(Color.cooperInk)
                                    .lineLimit(2)
                                Text([source.meta, source.type].first { !$0.isEmpty } ?? "Saved session evidence")
                                    .font(.caption)
                                    .foregroundStyle(Color.cooperMuted)
                                    .lineLimit(1)
                            }
                            Spacer()
                            StatusBadge(text: "Inherited", connected: true)
                        }
                        .padding(.vertical, 12)
                        if source.id != inheritedSources.last?.id {
                            Rectangle().fill(Color.cooperLine).frame(height: 1)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        }
        .accessibilityIdentifier("inherited-context-boundary")
    }

    private var sourcesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                SectionHeading(
                    eyebrow: "Evidence boundary",
                    title: sources.isEmpty && pendingFiles.isEmpty
                        ? "Add context"
                        : "\(sources.count + pendingFiles.count) selected sources"
                )
                Spacer()
                Menu {
                    Button("Notion", systemImage: ContextProvider.notion.systemImage) {
                        presentedSheet = .provider(.notion)
                    }
                    Button("GitHub", systemImage: ContextProvider.github.systemImage) {
                        presentedSheet = .provider(.github)
                    }
                    Button("Meeting notes", systemImage: ContextProvider.meeting.systemImage) {
                        presentedSheet = .provider(.meeting)
                    }
                    Button("Upload files", systemImage: "arrow.up.doc") {
                        isFileImporterPresented = true
                    }
                    Divider()
                    Button("Paste text", systemImage: ContextProvider.paste.systemImage) {
                        presentedSheet = .paste
                    }
                } label: {
                    Label("Add source", systemImage: "plus")
                        .font(.subheadline.bold())
                }
                .accessibilityIdentifier("add-context-source")
            }

            if sources.isEmpty && pendingFiles.isEmpty {
                EmptyContent(
                    icon: "link",
                    title: "No external context selected",
                    message: "Cooper can start fresh, or you can add bounded read-only evidence from connected systems."
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(sources) { source in
                        ContextSourceRow(source: source) {
                            guard !source.locked else { return }
                            sources.removeAll { $0.provider == source.provider && $0.id == source.id }
                        }
                        Rectangle().fill(Color.cooperLine).frame(height: 1)
                    }
                    ForEach(pendingFiles, id: \.absoluteString) { file in
                        PendingContextFileRow(file: file) {
                            pendingFiles.removeAll { $0 == file }
                        }
                        Rectangle().fill(Color.cooperLine).frame(height: 1)
                    }
                }
                .padding(.horizontal, 14)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
            }
        }
    }

    private var evidenceBoundary: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "checkmark.shield")
                .foregroundStyle(Color.cooperSuccess)
            Text("The server resolves new selections into one bounded packet and keeps inherited session evidence distinct. Source content is evidence and cannot override Cooper’s system rules.")
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)
        }
        .padding(14)
        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
    }

    private var preparationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(
                eyebrow: "Session preparation",
                title: "Build the room before you enter",
                trailing: "\(preparationKinds.count) selected"
            )
            Text("Cooper queues these against the same durable session used by live voice. You can follow progress and read completed output in Library.")
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)

            VStack(spacing: 0) {
                ForEach(SessionPreparationOption.all) { option in
                    Button {
                        if preparationKinds.contains(option.kind) {
                            preparationKinds.remove(option.kind)
                        } else {
                            preparationKinds.insert(option.kind)
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: preparationKinds.contains(option.kind) ? "checkmark.square.fill" : "square")
                                .font(.title3)
                                .foregroundStyle(preparationKinds.contains(option.kind) ? Color.cooperInk : Color.cooperMuted)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(option.title)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(Color.cooperInk)
                                Text(option.description)
                                    .font(.caption)
                                    .foregroundStyle(Color.cooperMuted)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(option.title)
                    .accessibilityValue(preparationKinds.contains(option.kind) ? "Selected" : "Not selected")
                    .accessibilityIdentifier("preparation-\(option.kind)")

                    if option.id != SessionPreparationOption.all.last?.id {
                        Rectangle().fill(Color.cooperLine).frame(height: 1)
                    }
                }
            }
            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        }
    }

    private func launch(prepared: Bool) async {
        isLaunching = true
        errorMessage = nil
        do {
            try await model.createContextAndLaunch(
                seed: seed,
                intent: intent,
                sources: sources,
                files: pendingFiles,
                preparationKinds: prepared
                    ? SessionPreparationOption.all.map(\.kind).filter(preparationKinds.contains)
                    : [],
                launchMode: launchMode
            )
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            isLaunching = false
        }
    }

    private func handleImportedFiles(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            let supported = Set(["md", "markdown", "txt", "pdf"])
            let accepted = urls.filter { supported.contains($0.pathExtension.lowercased()) }
            for url in accepted where !pendingFiles.contains(url) {
                pendingFiles.append(url)
            }
            if accepted.count != urls.count {
                errorMessage = "Only Markdown, text, and PDF files can be added to a Cooper context packet."
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    private static func lockedSources(for seed: ContextCheckpointSeed) -> [ContextSource] {
        if let brief = seed.dailyBrief {
            return [ContextSource(
                id: brief.id,
                provider: ContextProvider.paste.rawValue,
                type: "daily_brief",
                title: brief.title,
                meta: [brief.dateLabel, "Calendar + Notion", "\(brief.slides.count) presentation slides"]
                    .filter { !$0.isEmpty }
                    .joined(separator: " · "),
                content: brief.contextText,
                resolutionStatus: "completed",
                primary: true,
                locked: true
            )]
        }
        let focus = seed.focus
        guard let focus, focus.type == "task" else { return [] }
        let identifier = focus.targetId.isEmpty ? (focus.url.isEmpty ? focus.id : focus.url) : focus.targetId
        guard !identifier.isEmpty else { return [] }
        return [ContextSource(
            id: identifier,
            provider: ContextProvider.notion.rawValue,
            type: "page",
            title: focus.title,
            url: focus.url,
            meta: ["Primary sprint ticket", "Full page + properties", focus.eyebrow, focus.status]
                .filter { !$0.isEmpty }
                .joined(separator: " · "),
            primary: true,
            locked: true
        )]
    }
}

private struct PendingContextFileRow: View {
    let file: URL
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: file.pathExtension.lowercased() == "pdf" ? "doc.richtext" : "doc.text")
                .frame(width: 24)
                .foregroundStyle(Color.cooperInk)
            VStack(alignment: .leading, spacing: 3) {
                Text(file.lastPathComponent)
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.cooperInk)
                    .lineLimit(2)
                Text("Uploads when the context packet is created")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
            Spacer()
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.caption.bold())
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(file.lastPathComponent)")
        }
        .padding(.vertical, 12)
    }
}

private struct CheckpointStep: View {
    let number: String
    let title: String
    var active = false
    var complete = false

    var body: some View {
        HStack(spacing: 7) {
            ZStack {
                Circle().fill(active ? Color.cooperVolt : Color.cooperSoft)
                if complete {
                    Image(systemName: "checkmark").font(.caption2.bold())
                } else {
                    Text(number).font(.system(size: 8, weight: .bold, design: .monospaced))
                }
            }
            .frame(width: 25, height: 25)
            Text(title)
                .font(.caption.weight(active ? .bold : .medium))
                .foregroundStyle(active ? Color.cooperInk : Color.cooperMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(active ? Color.cooperInk : Color.cooperLine) }
    }
}

private struct ContextSourceRow: View {
    let source: ContextSource
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ContextProvider(rawValue: source.provider)?.systemImage ?? "doc")
                .frame(width: 24)
                .foregroundStyle(Color.cooperInk)
            VStack(alignment: .leading, spacing: 3) {
                Text(source.title)
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.cooperInk)
                    .lineLimit(2)
                Text(source.type == "daily_brief"
                    ? "Calendar + Notion briefing · \(source.meta)"
                    : [ContextProvider(rawValue: source.provider)?.label, source.repository, source.meta, source.type]
                        .compactMap { $0 }
                        .first { !$0.isEmpty } ?? "Context source")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
                    .lineLimit(1)
            }
            Spacer()
            if source.locked {
                StatusBadge(text: "Primary", connected: true)
            } else {
                Button(action: remove) {
                    Image(systemName: "xmark")
                        .font(.caption.bold())
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove \(source.title)")
            }
        }
        .padding(.vertical, 12)
    }
}

private struct ContextSourcePicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let provider: ContextProvider
    @Binding var sources: [ContextSource]
    @State private var query = ""
    @State private var results: [ContextSource] = []
    @State private var selectedKeys: Set<String> = []
    @State private var selectedSources: [ContextSource] = []
    @State private var databaseId = ""
    @State private var databaseTitle = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if !databaseId.isEmpty {
                    Section {
                        Button {
                            databaseId = ""
                            databaseTitle = ""
                        } label: {
                            Label("All Notion databases", systemImage: "chevron.left")
                        }
                    } header: {
                        Text(databaseTitle)
                    }
                }

                if let errorMessage {
                    Section { InlineMessage(text: errorMessage, isError: true) }
                }

                Section {
                    if isLoading {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else if results.isEmpty {
                        EmptyContent(
                            icon: provider.systemImage,
                            title: query.isEmpty ? "Browse \(provider.label)" : "No matching context",
                            message: provider == .github && query.isEmpty
                                ? "Enter a repository, branch, pull request, or issue."
                                : "Try another search or verify the provider in Connections."
                        )
                    } else {
                        ForEach(results) { source in
                            resultRow(source)
                        }
                    }
                } header: {
                    Text(databaseId.isEmpty ? provider.label : "Pages")
                }
            }
            .navigationTitle("Add from \(provider.label)")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: searchPrompt)
            .task(id: searchKey) { await load() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add \(selectedKeys.count)") { addSelected() }
                        .disabled(selectedKeys.isEmpty)
                }
            }
        }
    }

    private func resultRow(_ source: ContextSource) -> some View {
        HStack(spacing: 10) {
            Button {
                toggle(source)
            } label: {
                HStack(spacing: 11) {
                    Image(systemName: selectedKeys.contains(key(source)) ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selectedKeys.contains(key(source)) ? Color.cooperSuccess : Color.cooperMuted)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(source.title)
                            .font(.subheadline.bold())
                            .foregroundStyle(Color.cooperInk)
                            .lineLimit(2)
                        Text([source.repository, source.meta, source.type].first { !$0.isEmpty } ?? provider.label)
                            .font(.caption)
                            .foregroundStyle(Color.cooperMuted)
                            .lineLimit(1)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            if provider == .notion, source.type == "database" {
                Button("Browse") {
                    databaseTitle = source.title
                    databaseId = source.id
                    query = ""
                }
                .font(.caption.bold())
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
    }

    private var searchPrompt: String {
        switch provider {
        case .notion: databaseId.isEmpty ? "Search databases" : "Search pages"
        case .github: "PRs, branches, issues"
        case .meeting: "Past Cooper sessions"
        case .paste: "Context"
        }
    }

    private var searchKey: String {
        "\(provider.rawValue)|\(databaseId)|\(query)"
    }

    private func load() async {
        let cleanQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if provider == .github, cleanQuery.isEmpty {
            results = []
            errorMessage = nil
            return
        }

        if !cleanQuery.isEmpty {
            try? await Task.sleep(for: .milliseconds(280))
            guard !Task.isCancelled else { return }
        }

        isLoading = true
        errorMessage = nil
        do {
            let response = try await model.searchContextSources(
                provider: provider,
                query: cleanQuery,
                databaseId: databaseId
            )
            guard !Task.isCancelled else { return }
            results = response.results
        } catch is CancellationError {
            return
        } catch {
            results = []
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func toggle(_ source: ContextSource) {
        let sourceKey = key(source)
        if selectedKeys.contains(sourceKey) {
            selectedKeys.remove(sourceKey)
            selectedSources.removeAll { key($0) == sourceKey }
        } else {
            selectedKeys.insert(sourceKey)
            selectedSources.append(source)
        }
    }

    private func addSelected() {
        for source in selectedSources where !sources.contains(where: { key($0) == key(source) }) {
            sources.append(source)
        }
        dismiss()
    }

    private func key(_ source: ContextSource) -> String {
        "\(source.provider):\(source.id)"
    }
}

private struct PasteContextView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var sources: [ContextSource]
    @State private var title = ""
    @State private var content = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Source") {
                    TextField("Sprint plan or agent output", text: $title)
                    TextField("Paste notes, Markdown, requirements, or generated output", text: $content, axis: .vertical)
                        .lineLimit(8...16)
                }
                Section {
                    Text("Pasted content is stored inside the bounded session packet and treated as evidence, never as system instructions.")
                        .font(.caption)
                        .foregroundStyle(Color.cooperMuted)
                }
            }
            .navigationTitle("Paste context")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { add() }
                        .disabled(content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func add() {
        let cleanContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        sources.append(ContextSource(
            provider: ContextProvider.paste.rawValue,
            type: "note",
            title: cleanTitle.isEmpty ? "Pasted context" : cleanTitle,
            meta: "\(cleanContent.count) characters",
            content: cleanContent
        ))
        dismiss()
    }
}

#Preview("Context checkpoint") {
    ContextCheckpointView(seed: ContextCheckpointSeed(focus: TodayResponse.preview.tasks.first))
        .environment({
            let model = AppModel()
            model.today = .preview
            model.phase = .ready
            return model
        }())
}
