import SwiftUI
import QuickLook
import WebKit

struct ArtifactLibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var isGeneratorPresented = false

    private var filteredArtifacts: [ArtifactRecord] {
        let cleanQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanQuery.isEmpty else { return model.artifacts }
        return model.artifacts.filter {
            $0.title.localizedCaseInsensitiveContains(cleanQuery)
                || $0.kind.localizedCaseInsensitiveContains(cleanQuery)
                || $0.workstream.localizedCaseInsensitiveContains(cleanQuery)
        }
    }

    private var activeJobSignature: String {
        model.artifactJobs.filter(\.isActive).map { "\($0.id):\($0.updatedAt)" }.joined(separator: "|")
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                libraryHeader

                if !model.artifactJobs.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading(
                            eyebrow: "Generation queue",
                            title: "Active and recent work",
                            trailing: "\(model.artifactJobs.count) jobs"
                        )
                        ForEach(model.artifactJobs.prefix(6)) { job in
                            ArtifactJobCard(job: job)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading(
                        eyebrow: "Session output",
                        title: "Artifacts",
                        trailing: "\(filteredArtifacts.count) files"
                    )
                    if filteredArtifacts.isEmpty {
                        EmptyContent(
                            icon: "doc.on.doc",
                            title: query.isEmpty ? "No generated artifacts" : "No matching artifacts",
                            message: query.isEmpty
                                ? "Prepare a session or generate an artifact from saved session memory."
                                : "Try a different title, recipe, or workstream."
                        )
                    } else {
                        ForEach(filteredArtifacts) { artifact in
                            NavigationLink {
                                ArtifactDetailView(artifact: artifact)
                            } label: {
                                ArtifactCard(artifact: artifact)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Search artifacts")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    isGeneratorPresented = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Generate artifact")
                .accessibilityIdentifier("generate-artifact")

                Button {
                    Task { await model.refreshWorkspace() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Refresh Library")
                .disabled(model.isPreviewMode)
            }
        }
        .refreshable { await model.refreshWorkspace() }
        .sheet(isPresented: $isGeneratorPresented) {
            ArtifactGenerationSheet()
        }
        .task(id: activeJobSignature) {
            guard !model.isPreviewMode, !activeJobSignature.isEmpty else { return }
            while !Task.isCancelled, model.artifactJobs.contains(where: \.isActive) {
                do {
                    try await Task.sleep(for: .seconds(2))
                } catch {
                    return
                }
                await model.refreshWorkspace()
            }
        }
    }

    private var libraryHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SESSION LIBRARY")
                .font(.caption.weight(.bold).monospaced())
                .tracking(0.8)
                .foregroundStyle(Color.cooperMuted)
            Text("Readable output, attached to its source session.")
                .font(.title.bold())
                .foregroundStyle(Color.cooperInk)
            Text("Markdown stays native. HTML opens in a static, script-free reader with source always available.")
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
        }
    }
}

private struct ArtifactCard: View {
    let artifact: ArtifactRecord

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: artifact.systemImageName)
                .font(.title3)
                .foregroundStyle(Color.cooperInk)
                .frame(width: 34, height: 34)
                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 5) {
                Text(artifact.title)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 8) {
                    Text(artifact.outputType.uppercased())
                    if !artifact.workstream.isEmpty {
                        Text(artifact.workstream.replacingOccurrences(of: "_", with: " "))
                    }
                    if !artifact.createdAt.isEmpty {
                        Text(artifact.createdAt.cooperDateTime)
                    }
                }
                .font(.caption2.monospaced())
                .foregroundStyle(Color.cooperMuted)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(Color.cooperMuted)
        }
        .padding(15)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        .accessibilityElement(children: .combine)
    }
}

private struct ArtifactJobCard: View {
    @Environment(AppModel.self) private var model
    let job: ArtifactJob

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(job.title)
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.cooperInk)
                    Text(job.status.replacingOccurrences(of: "_", with: " ").uppercased())
                        .font(.caption2.monospaced().bold())
                        .foregroundStyle(statusColor)
                }
                Spacer()
                if job.canRetry {
                    Button("Retry") {
                        Task { await model.retryArtifactJob(job) }
                    }
                    .font(.caption.bold())
                    .buttonStyle(.bordered)
                } else if job.isActive {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            ProgressView(value: job.progressFraction)
                .tint(job.status == "failed" ? Color.red : Color.cooperVolt)

            Text(job.error ?? (job.activeStepSummary.isEmpty ? job.progress : job.activeStepSummary))
                .font(.caption)
                .foregroundStyle(job.status == "failed" ? Color.red : Color.cooperMuted)
                .lineLimit(3)
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
    }

    private var statusColor: Color {
        switch job.status {
        case "completed": Color.cooperSuccess
        case "failed": .red
        default: Color.cooperMuted
        }
    }
}

struct ArtifactDetailView: View {
    @Environment(AppModel.self) private var model
    let artifact: ArtifactRecord
    @State private var content = ""
    @State private var fileURL: URL?
    @State private var errorMessage: String?
    @State private var showsSource = false

    var body: some View {
        Group {
            if let errorMessage {
                ContentUnavailableView(
                    "Artifact unavailable",
                    systemImage: "exclamationmark.triangle",
                    description: Text(errorMessage)
                )
            } else if artifact.prefersNativePreview, let fileURL {
                QuickLookArtifactView(fileURL: fileURL)
            } else if artifact.prefersNativePreview {
                ProgressView("Preparing \(artifact.title)")
            } else if content.isEmpty {
                ProgressView("Loading artifact")
            } else if showsSource || artifact.isMCPApp {
                ArtifactSourceView(content: content)
            } else if artifact.isHTML {
                SafeArtifactHTMLView(content: content)
            } else {
                ArtifactMarkdownView(content: content)
            }
        }
        .background(Color.cooperCanvas)
        .navigationTitle(artifact.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if artifact.isHTML || artifact.isMCPApp {
                    Button(showsSource ? "Preview" : "Source") {
                        showsSource.toggle()
                    }
                    .disabled(artifact.isMCPApp)
                }
                if let fileURL {
                    ShareLink(
                        item: fileURL,
                        subject: Text(artifact.title),
                        preview: SharePreview(artifact.title, image: Image(systemName: artifact.systemImageName))
                    ) {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
        .task(id: artifact.id) {
            content = ""
            fileURL = nil
            errorMessage = nil
            showsSource = false
            do {
                fileURL = try await model.artifactFile(for: artifact)
                if artifact.isTextArtifact {
                    content = try await model.artifactContent(for: artifact)
                }
            } catch is CancellationError {
                return
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct QuickLookArtifactView: UIViewControllerRepresentable {
    let fileURL: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(fileURL: fileURL)
    }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
        guard context.coordinator.fileURL != fileURL else { return }
        context.coordinator.fileURL = fileURL
        controller.reloadData()
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var fileURL: URL

        init(fileURL: URL) {
            self.fileURL = fileURL
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            fileURL as NSURL
        }
    }
}

struct ArtifactMarkdownView: View {
    let content: String

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ForEach(MarkdownDisplayBlock.parse(content)) { block in
                    MarkdownDisplayBlockView(block: block)
                }
            }
                .textSelection(.enabled)
                .frame(maxWidth: 720, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
        }
    }
}

private struct MarkdownDisplayBlock: Identifiable {
    enum Kind {
        case heading(level: Int, text: String)
        case prose(String)
        case bullet(text: String, checked: Bool?)
        case code(language: String, text: String)
    }

    let id: Int
    let kind: Kind

    static func parse(_ markdown: String) -> [MarkdownDisplayBlock] {
        let lines = markdown.components(separatedBy: .newlines)
        var blocks: [MarkdownDisplayBlock] = []
        var prose: [String] = []
        var code: [String] = []
        var codeLanguage = ""
        var isInCodeFence = false

        func append(_ kind: Kind) {
            blocks.append(MarkdownDisplayBlock(id: blocks.count, kind: kind))
        }

        func flushProse() {
            guard !prose.isEmpty else { return }
            append(.prose(prose.joined(separator: " ")))
            prose.removeAll(keepingCapacity: true)
        }

        for line in lines {
            if line.hasPrefix("```") {
                if isInCodeFence {
                    append(.code(language: codeLanguage, text: code.joined(separator: "\n")))
                    code.removeAll(keepingCapacity: true)
                    codeLanguage = ""
                    isInCodeFence = false
                } else {
                    flushProse()
                    codeLanguage = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                    isInCodeFence = true
                }
                continue
            }

            if isInCodeFence {
                code.append(line)
                continue
            }

            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                flushProse()
            } else if trimmed.hasPrefix("#") {
                flushProse()
                let level = min(6, trimmed.prefix { $0 == "#" }.count)
                let text = trimmed.dropFirst(level).trimmingCharacters(in: .whitespaces)
                append(.heading(level: level, text: text))
            } else if trimmed.hasPrefix("- [x] ") || trimmed.hasPrefix("- [X] ") {
                flushProse()
                append(.bullet(text: String(trimmed.dropFirst(6)), checked: true))
            } else if trimmed.hasPrefix("- [ ] ") {
                flushProse()
                append(.bullet(text: String(trimmed.dropFirst(6)), checked: false))
            } else if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                flushProse()
                append(.bullet(text: String(trimmed.dropFirst(2)), checked: nil))
            } else {
                prose.append(trimmed)
            }
        }
        flushProse()
        if isInCodeFence {
            append(.code(language: codeLanguage, text: code.joined(separator: "\n")))
        }
        return blocks
    }
}

private struct MarkdownDisplayBlockView: View {
    let block: MarkdownDisplayBlock

    var body: some View {
        switch block.kind {
        case .heading(let level, let text):
            Text(text)
                .font(headingFont(level))
                .foregroundStyle(Color.cooperInk)
                .padding(.top, level == 1 ? 4 : 0)
        case .prose(let text):
            Text(inlineMarkdown(text))
                .font(.body)
                .foregroundStyle(Color.cooperInk)
        case .bullet(let text, let checked):
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Image(systemName: checked.map { $0 ? "checkmark.square.fill" : "square" } ?? "circle.fill")
                    .font(checked == nil ? .system(size: 5) : .body)
                    .foregroundStyle(checked == true ? Color.cooperSuccess : Color.cooperMuted)
                Text(inlineMarkdown(text))
                    .font(.body)
                    .foregroundStyle(Color.cooperInk)
            }
        case .code(let language, let text):
            VStack(alignment: .leading, spacing: 8) {
                if !language.isEmpty {
                    Text(language.uppercased())
                        .font(.caption2.monospaced().bold())
                        .foregroundStyle(Color.cooperMuted)
                }
                ScrollView(.horizontal) {
                    Text(text)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(Color.cooperInk)
                        .fixedSize(horizontal: true, vertical: false)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
            .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: .title.bold()
        case 2: .title2.bold()
        case 3: .title3.bold()
        default: .headline
        }
    }

    private func inlineMarkdown(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text)) ?? AttributedString(text)
    }
}

struct ArtifactSourceView: View {
    let content: String

    var body: some View {
        ScrollView {
            Text(content)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(Color.cooperInk)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
        }
    }
}

struct SafeArtifactHTMLView: UIViewRepresentable {
    let content: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Color.cooperCanvas)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loadedContent != content else { return }
        context.coordinator.loadedContent = content
        webView.loadHTMLString(Self.hardened(content), baseURL: nil)
    }

    private static func hardened(_ html: String) -> String {
        let policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; script-src 'none'; connect-src 'none'; frame-src 'none';\">"
        if let range = html.range(of: "<head>", options: [.caseInsensitive]) {
            return html.replacingCharacters(in: range, with: "<head>\(policy)")
        }
        return "<!doctype html><html><head>\(policy)</head><body>\(html)</body></html>"
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedContent = ""

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            let isInitialDocument = navigationAction.navigationType == .other
                && (navigationAction.request.url?.scheme == "about" || navigationAction.request.url == nil)
            decisionHandler(isInitialDocument ? .allow : .cancel)
        }
    }
}

private struct ArtifactGenerationSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var callId = ""
    @State private var recipeKind = ""
    @State private var prompt = ""
    @State private var isQueuing = false
    @State private var errorMessage: String?

    private var selectedSession: SessionRecord? {
        model.sessions.first { $0.id == callId }
    }

    private var canQueue: Bool {
        guard !callId.isEmpty, !recipeKind.isEmpty else { return false }
        return selectedSession?.transcript.isEmpty == false
            || !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Saved session") {
                    Picker("Session", selection: $callId) {
                        Text("Choose a session").tag("")
                        ForEach(model.sessions.filter { $0.status != "active" }) { session in
                            Text(session.title).tag(session.id)
                        }
                    }
                }

                Section("Recipe") {
                    Picker("Output", selection: $recipeKind) {
                        Text("Choose a recipe").tag("")
                        ForEach(model.artifactRecipes) { recipe in
                            Text(recipe.title).tag(recipe.kind)
                        }
                    }
                }

                Section("Optional direction") {
                    TextField("Emphasize a decision, audience, or format…", text: $prompt, axis: .vertical)
                        .lineLimit(3...7)
                    if selectedSession?.transcript.isEmpty == true && prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("This session has no transcript. Add a prompt before generating.")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Generate artifact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isQueuing)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isQueuing ? "Queuing…" : "Queue") {
                        Task { await queue() }
                    }
                    .disabled(!canQueue || isQueuing)
                }
            }
            .task {
                if callId.isEmpty {
                    callId = model.sessions.first { $0.status != "active" }?.id ?? ""
                }
                if recipeKind.isEmpty {
                    recipeKind = model.artifactRecipes.first?.kind ?? ""
                }
            }
        }
    }

    private func queue() async {
        isQueuing = true
        errorMessage = nil
        do {
            let recipe = model.artifactRecipes.first { $0.kind == recipeKind }
            try await model.queueArtifact(
                callId: callId,
                kind: recipeKind,
                customPrompt: prompt,
                title: recipe?.title ?? "Cooper artifact"
            )
            dismiss()
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
            isQueuing = false
        }
    }
}

#Preview("Artifact library") {
    NavigationStack { ArtifactLibraryView() }
        .environment({
            let model = AppModel()
            model.artifacts = ArtifactRecord.previews
            model.artifactJobs = ArtifactJob.previews
            model.artifactRecipes = ArtifactRecipe.previews
            model.sessions = SessionRecord.previews
            model.phase = .ready
            return model
        }())
}
