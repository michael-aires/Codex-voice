import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum SessionCanvasSection: String, CaseIterable, Identifiable {
    case presentation
    case overview
    case preview
    case build
    case templates
    case context
    case activity

    var id: String { rawValue }

    var label: String {
        switch self {
        case .presentation: "Presentation"
        case .overview: "Overview"
        case .preview: "Preview"
        case .build: "Build"
        case .templates: "Templates"
        case .context: "Context"
        case .activity: "Activity"
        }
    }

    var systemImage: String {
        switch self {
        case .presentation: "rectangle.on.rectangle.angled"
        case .overview: "list.bullet.rectangle"
        case .preview: "doc.richtext"
        case .build: "hammer"
        case .templates: "square.grid.2x2"
        case .context: "link"
        case .activity: "waveform.path.ecg"
        }
    }
}

struct SessionCanvasView: View {
    @Environment(AppModel.self) private var model

    let session: SessionRecord
    let focus: TodayItem?
    let isLive: Bool

    @State private var selectedSection: SessionCanvasSection = .presentation
    @State private var packet: ContextPacket?
    @State private var sessionContext: String
    @State private var selectedArtifactId = ""
    @State private var selectedBuildKind = CanvasBuildType.all[0].id
    @State private var selectedContextMode: CanvasContextMode = .smart
    @State private var selectedTranscriptSectionId = ""
    @State private var selectedTemplateId = ""
    @State private var buildPrompt = ""
    @State private var isQueuing = false
    @State private var generationError: String?

    init(
        session: SessionRecord,
        focus: TodayItem? = nil,
        initialPacket: ContextPacket? = nil,
        initialSessionContext: String = "",
        isLive: Bool = false
    ) {
        self.session = session
        self.focus = focus
        self.isLive = isLive
        _selectedSection = State(
            initialValue: ProcessInfo.processInfo.arguments.contains("--open-preview-live-context")
                ? .context
                : .presentation
        )
        _packet = State(initialValue: initialPacket)
        _sessionContext = State(initialValue: initialSessionContext)
    }

    private var transcripts: [TranscriptEntry] {
        if isLive, model.voice.activeCall?.id == session.id {
            return model.voice.transcript
        }
        return session.transcript
    }

    private var callArtifacts: [ArtifactRecord] {
        model.artifacts.filter { $0.callId == session.id }
    }

    private var callJobs: [ArtifactJob] {
        model.artifactJobs.filter { $0.callId == session.id }
    }

    private var transcriptSections: [CanvasTranscriptSection] {
        CanvasTranscriptSection.make(from: transcripts)
    }

    private var presentation: CanvasPresentation {
        CanvasPresentation.make(
            session: session,
            focus: focus,
            packet: packet,
            artifacts: callArtifacts,
            jobs: callJobs
        )
    }

    private var activeJobSignature: String {
        callJobs.filter(\.isActive).map { "\($0.id):\($0.updatedAt)" }.joined(separator: "|")
    }

    private var artifactSignature: String {
        callArtifacts.map(\.id).joined(separator: "|")
    }

    var body: some View {
        VStack(spacing: 0) {
            CanvasSectionPicker(selection: $selectedSection, jobs: callJobs)
            Divider()
            sectionContent
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Session Canvas")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshWorkspace() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Refresh Canvas")
                .disabled(model.isPreviewMode)
            }
        }
        .task {
            if selectedArtifactId.isEmpty { selectedArtifactId = callArtifacts.first?.id ?? "" }
            if selectedTranscriptSectionId.isEmpty { selectedTranscriptSectionId = transcriptSections.first?.id ?? "" }
            await model.loadAiresExamples()
            if selectedTemplateId.isEmpty { selectedTemplateId = model.airesExamples.first?.id ?? "" }
            await loadContextPacketIfNeeded()
        }
        .task(id: activeJobSignature) {
            guard !model.isPreviewMode, !activeJobSignature.isEmpty else { return }
            while !Task.isCancelled, model.artifactJobs.contains(where: { $0.callId == session.id && $0.isActive }) {
                do {
                    try await Task.sleep(for: .seconds(2))
                } catch {
                    return
                }
                await model.refreshWorkspace()
            }
        }
        .onChange(of: artifactSignature) {
            guard let newest = callArtifacts.first else { return }
            if selectedArtifactId.isEmpty { selectedArtifactId = newest.id }
            if newest.workstream != "session_preparation" {
                selectedArtifactId = newest.id
                selectedSection = .preview
            }
        }
        .onChange(of: transcriptSections.map(\.id)) {
            if selectedTranscriptSectionId.isEmpty {
                selectedTranscriptSectionId = transcriptSections.first?.id ?? ""
            }
        }
    }

    @ViewBuilder
    private var sectionContent: some View {
        switch selectedSection {
        case .presentation:
            CanvasPresentationView(presentation: presentation)
        case .overview:
            CanvasOverviewView(
                presentation: presentation,
                packet: packet,
                artifacts: callArtifacts,
                jobs: callJobs,
                openArtifact: openArtifact
            )
        case .preview:
            CanvasArtifactPreview(
                artifacts: callArtifacts,
                jobs: callJobs,
                selectedArtifactId: $selectedArtifactId,
                openBuild: { selectedSection = .build }
            )
        case .build:
            CanvasBuildView(
                buildKind: $selectedBuildKind,
                contextMode: $selectedContextMode,
                prompt: $buildPrompt,
                selectedTranscriptSectionId: $selectedTranscriptSectionId,
                selectedTemplateId: $selectedTemplateId,
                transcriptSections: transcriptSections,
                templates: model.airesExamples,
                isQueuing: isQueuing,
                errorMessage: generationError,
                generate: queueBuild
            )
        case .templates:
            CanvasTemplatesView(
                templates: model.airesExamples,
                selectedTemplateId: $selectedTemplateId,
                isQueuing: isQueuing,
                useInBuild: useTemplateInBuild,
                generate: queueTemplate
            )
        case .context:
            CanvasContextView(
                session: model.voice.activeCall?.id == session.id ? model.voice.activeCall ?? session : session,
                packet: packet,
                sessionContext: sessionContext,
                isLive: isLive,
                onUpdated: { response in
                    sessionContext = response.sessionContext
                }
            )
        case .activity:
            CanvasActivityView(jobs: callJobs)
        }
    }

    private func loadContextPacketIfNeeded() async {
        guard packet == nil, !session.contextPacketId.isEmpty else { return }
        do {
            let response = try await model.contextPacket(id: session.contextPacketId)
            packet = response.packet
            sessionContext = response.sessionContext
        } catch is CancellationError {
            return
        } catch {
            generationError = "The session context packet could not be loaded: \(error.localizedDescription)"
        }
    }

    private func openArtifact(_ id: String) {
        selectedArtifactId = id
        selectedSection = .preview
    }

    private func useTemplateInBuild(_ template: AiresExample) {
        selectedTemplateId = template.id
        selectedBuildKind = template.recipeKind
        buildPrompt = template.promptHint
        selectedSection = .build
    }

    private func queueTemplate(_ template: AiresExample) async {
        selectedTemplateId = template.id
        selectedBuildKind = template.recipeKind
        await queueBuild(
            CanvasBuildType.resolve(template.recipeKind),
            .smart,
            template.promptHint,
            template,
            transcriptSections.first
        )
    }

    private func queueBuild(
        _ type: CanvasBuildType,
        _ mode: CanvasContextMode,
        _ prompt: String,
        _ template: AiresExample?,
        _ transcriptSection: CanvasTranscriptSection?
    ) async {
        guard !isQueuing else { return }
        isQueuing = true
        generationError = nil
        let request = CanvasBuildRequestBuilder.build(
            type: type,
            mode: mode,
            typedPrompt: prompt,
            selectedSection: transcriptSection,
            transcripts: transcripts,
            focus: focus,
            packet: packet,
            template: template
        )
        do {
            try await model.queueArtifact(
                callId: session.id,
                kind: type.id,
                customPrompt: request,
                title: template?.title ?? type.label,
                workstream: "canvas"
            )
            buildPrompt = ""
            selectedSection = .activity
        } catch is CancellationError {
            return
        } catch {
            generationError = error.localizedDescription
        }
        isQueuing = false
    }
}

private struct CanvasSectionPicker: View {
    @Binding var selection: SessionCanvasSection
    let jobs: [ArtifactJob]

    var body: some View {
        HStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(SessionCanvasSection.allCases) { section in
                            Button {
                                selection = section
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: section.systemImage)
                                    Text(section.label)
                                    if section == .activity, jobs.contains(where: \.isActive) {
                                        Circle().fill(Color.cooperVolt).frame(width: 7, height: 7)
                                    }
                                }
                                .font(.caption.bold())
                                .foregroundStyle(Color.cooperInk)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 8)
                                .background(selection == section ? Color.cooperVolt : Color.cooperSoft, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("canvas-\(section.rawValue)")
                            .id(section.id)
                        }
                    }
                    .padding(.leading, 14)
                    .padding(.trailing, 8)
                    .padding(.vertical, 10)
                }
                .onChange(of: selection) {
                    withAnimation { proxy.scrollTo(selection.id, anchor: .center) }
                }
                .onAppear {
                    proxy.scrollTo(selection.id, anchor: .center)
                }
            }

            Menu {
                ForEach(SessionCanvasSection.allCases) { section in
                    Button {
                        selection = section
                    } label: {
                        Label(section.label, systemImage: section.systemImage)
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                    .frame(width: 42, height: 42)
            }
            .accessibilityLabel("All Canvas sections")
            .accessibilityIdentifier("canvas-section-menu")
            .padding(.trailing, 6)
        }
        .background(Color.white)
    }
}

private struct CanvasPresentationView: View {
    let presentation: CanvasPresentation
    @State private var selectedSlide = 0

    var body: some View {
        VStack(spacing: 12) {
            TabView(selection: $selectedSlide) {
                ForEach(Array(presentation.slides.enumerated()), id: \.element.id) { index, slide in
                    CanvasSlideCard(slide: slide)
                        .tag(index)
                        .padding(.horizontal, 16)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))

            HStack {
                Button("Previous", systemImage: "chevron.left") {
                    selectedSlide = max(0, selectedSlide - 1)
                }
                .disabled(selectedSlide == 0)
                Spacer()
                Text("\(selectedSlide + 1) / \(presentation.slides.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Color.cooperMuted)
                Spacer()
                Button("Next", systemImage: "chevron.right") {
                    selectedSlide = min(presentation.slides.count - 1, selectedSlide + 1)
                }
                .labelStyle(.titleAndIcon)
                .disabled(selectedSlide == presentation.slides.count - 1)
            }
            .font(.caption.bold())
            .padding(.horizontal, 20)
            .padding(.bottom, 10)
        }
    }
}

private struct CanvasSlideCard: View {
    let slide: CanvasPresentationSlide

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(slide.eyebrow.uppercased())
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.8)
                    .foregroundStyle(Color.cooperMuted)
                Text(slide.title)
                    .font(.title.bold())
                    .foregroundStyle(Color.cooperInk)
                Text(slide.narrative)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperMuted)

                if !slide.metrics.isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(slide.metrics) { metric in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(metric.value).font(.title2.bold()).foregroundStyle(Color.cooperInk)
                                Text(metric.label).font(.caption2).foregroundStyle(Color.cooperMuted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
                        }
                    }
                }

                ForEach(slide.items) { item in
                    HStack(alignment: .top, spacing: 12) {
                        Text(item.lead)
                            .font(.caption.monospaced().bold())
                            .foregroundStyle(Color.cooperMuted)
                            .frame(width: 28, alignment: .leading)
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(item.title).font(.headline).foregroundStyle(Color.cooperInk)
                                Spacer()
                                Text(item.status.uppercased())
                                    .font(.caption2.weight(.bold).monospaced())
                                    .foregroundStyle(Color.cooperMuted)
                            }
                            Text(item.detail).font(.caption).foregroundStyle(Color.cooperMuted)
                        }
                    }
                    .padding(14)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
                }
            }
            .padding(.vertical, 18)
        }
    }
}

private struct CanvasOverviewView: View {
    let presentation: CanvasPresentation
    let packet: ContextPacket?
    let artifacts: [ArtifactRecord]
    let jobs: [ArtifactJob]
    let openArtifact: (String) -> Void
    @State private var copied = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("PREPARED SESSION")
                            .font(.caption2.weight(.bold).monospaced())
                            .tracking(0.7)
                            .foregroundStyle(Color.cooperMuted)
                        Text(presentation.title).font(.title.bold()).foregroundStyle(Color.cooperInk)
                        Text(presentation.goal).font(.subheadline).foregroundStyle(Color.cooperMuted)
                    }
                    Spacer()
                    Button(copied ? "Copied" : "Copy brief", systemImage: copied ? "checkmark" : "doc.on.doc") {
                        UIPasteboard.general.string = presentation.copyBrief
                        copied = true
                    }
                    .font(.caption.bold())
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Context coverage").font(.subheadline.bold())
                        Spacer()
                        Text("\(presentation.coverage)%").font(.caption.monospacedDigit())
                    }
                    ProgressView(value: Double(presentation.coverage), total: 100).tint(Color.cooperVolt)
                    Text("\(packet?.sourceCount ?? 0) selected sources · evidence remains bounded to this packet")
                        .font(.caption)
                        .foregroundStyle(Color.cooperMuted)
                }
                .padding(14)
                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 10))

                SectionHeading(eyebrow: "Shared understanding", title: "What Cooper knows")
                ForEach(presentation.evidence) { evidence in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(evidence.title).font(.headline).foregroundStyle(Color.cooperInk)
                        Text(evidence.summary).font(.caption).foregroundStyle(Color.cooperMuted)
                        Text(evidence.citation).font(.caption2.monospaced()).foregroundStyle(Color.cooperMuted)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                }

                SectionHeading(eyebrow: "Decision gates", title: "Questions for the room")
                ForEach(Array(presentation.questions.enumerated()), id: \.offset) { index, question in
                    HStack(alignment: .top, spacing: 10) {
                        Text(String(index + 1).leftPadded(to: 2))
                            .font(.caption.monospaced().bold())
                            .foregroundStyle(Color.cooperMuted)
                        Text(question).font(.subheadline).foregroundStyle(Color.cooperInk)
                    }
                }

                if !artifacts.isEmpty || !jobs.isEmpty {
                    SectionHeading(eyebrow: "Prepared documents", title: "Ready and building")
                    ForEach(artifacts) { artifact in
                        Button { openArtifact(artifact.id) } label: {
                            HStack {
                                Image(systemName: artifact.isHTML ? "safari" : "doc.text")
                                Text(artifact.title).font(.subheadline.bold())
                                Spacer()
                                Text("READY").font(.caption2.monospaced().bold())
                                Image(systemName: "chevron.right").font(.caption.bold())
                            }
                            .padding(13)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                        }
                        .buttonStyle(.plain)
                    }
                    ForEach(jobs.filter { $0.artifactId.isEmpty }) { job in
                        CanvasJobSummary(job: job)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct CanvasArtifactPreview: View {
    @Environment(AppModel.self) private var model
    let artifacts: [ArtifactRecord]
    let jobs: [ArtifactJob]
    @Binding var selectedArtifactId: String
    let openBuild: () -> Void
    @State private var content = ""
    @State private var fileURL: URL?
    @State private var errorMessage: String?
    @State private var showsSource = false

    private var artifact: ArtifactRecord? {
        artifacts.first { $0.id == selectedArtifactId } ?? artifacts.first
    }

    var body: some View {
        VStack(spacing: 0) {
            if !artifacts.isEmpty {
                HStack {
                    Picker("Artifact", selection: $selectedArtifactId) {
                        ForEach(artifacts) { artifact in Text(artifact.title).tag(artifact.id) }
                    }
                    .pickerStyle(.menu)
                    Spacer()
                    if artifact?.isHTML == true {
                        Button(showsSource ? "Preview" : "Source") { showsSource.toggle() }
                            .font(.caption.bold())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.white)
            }

            if let artifact {
                Group {
                    if let errorMessage {
                        ContentUnavailableView("Artifact unavailable", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
                    } else if artifact.prefersNativePreview, let fileURL {
                        QuickLookArtifactView(fileURL: fileURL)
                    } else if artifact.prefersNativePreview {
                        ProgressView("Preparing \(artifact.title)")
                    } else if content.isEmpty {
                        ProgressView("Loading \(artifact.title)")
                    } else if showsSource || artifact.isMCPApp {
                        ArtifactSourceView(content: content)
                    } else if artifact.isHTML {
                        SafeArtifactHTMLView(content: content)
                    } else {
                        ArtifactMarkdownView(content: content)
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
            } else {
                ContentUnavailableView {
                    Label("Nothing on the Canvas yet", systemImage: "doc.on.doc")
                } description: {
                    Text(jobs.contains(where: \.isActive)
                         ? "Cooper is building the first artifact. Follow progress in Activity."
                         : "Build a diagram, wireframe, prototype, or requirements artifact from this session.")
                } actions: {
                    Button("Open Build", systemImage: "hammer", action: openBuild)
                }
            }
        }
    }
}

private struct CanvasBuildView: View {
    @Binding var buildKind: String
    @Binding var contextMode: CanvasContextMode
    @Binding var prompt: String
    @Binding var selectedTranscriptSectionId: String
    @Binding var selectedTemplateId: String
    let transcriptSections: [CanvasTranscriptSection]
    let templates: [AiresExample]
    let isQueuing: Bool
    let errorMessage: String?
    let generate: (CanvasBuildType, CanvasContextMode, String, AiresExample?, CanvasTranscriptSection?) async -> Void

    private var selectedType: CanvasBuildType { CanvasBuildType.resolve(buildKind) }
    private var selectedTemplate: AiresExample? {
        selectedType.id == "aires_requirements" ? templates.first { $0.id == selectedTemplateId } : nil
    }
    private var selectedTranscriptSection: CanvasTranscriptSection? {
        transcriptSections.first { $0.id == selectedTranscriptSectionId } ?? transcriptSections.first
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                SectionHeading(eyebrow: "Build from context", title: "Choose what Cooper should create")

                VStack(alignment: .leading, spacing: 14) {
                    Picker("Build", selection: $buildKind) {
                        ForEach(CanvasBuildType.all) { type in Text(type.label).tag(type.id) }
                    }
                    Picker("Context", selection: $contextMode) {
                        ForEach(CanvasContextMode.allCases) { mode in Text(mode.label).tag(mode) }
                    }
                    if selectedType.id == "aires_requirements", !templates.isEmpty {
                        Picker("AIRES template", selection: $selectedTemplateId) {
                            ForEach(templates) { template in Text(template.title).tag(template.id) }
                        }
                    }
                    if contextMode == .selectedSection, !transcriptSections.isEmpty {
                        Picker("Transcript section", selection: $selectedTranscriptSectionId) {
                            ForEach(transcriptSections) { section in Text(section.title).tag(section.id) }
                        }
                    }
                    TextField("Optional: tell Cooper exactly what to build…", text: $prompt, axis: .vertical)
                        .lineLimit(4...8)
                        .padding(12)
                        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                    CanvasContextModeCard(mode: contextMode, hasTypedPrompt: !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let errorMessage { InlineMessage(text: errorMessage, isError: true) }
                    Button {
                        Task { await generate(selectedType, contextMode, prompt, selectedTemplate, selectedTranscriptSection) }
                    } label: {
                        HStack {
                            if isQueuing { ProgressView().tint(Color.cooperInk) }
                            Label(isQueuing ? "Queuing build" : "Generate", systemImage: "sparkles")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.cooperInk)
                    .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 9))
                    .disabled(isQueuing)
                    .accessibilityIdentifier("canvas-generate")
                }
                .padding(15)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 11))
                .overlay { RoundedRectangle(cornerRadius: 11).stroke(Color.cooperLine) }

                SectionHeading(eyebrow: "Conversation moments", title: "Buildable transcript sections")
                if transcriptSections.isEmpty {
                    EmptyContent(icon: "text.bubble", title: "No transcript yet", message: "Use the session focus, bounded context, or typed direction to begin the first artifact.")
                } else {
                    ForEach(transcriptSections) { section in
                        Button {
                            selectedTranscriptSectionId = section.id
                            contextMode = .selectedSection
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(section.title).font(.subheadline.bold()).foregroundStyle(Color.cooperInk)
                                Text(section.subtitle).font(.caption2.monospaced()).foregroundStyle(Color.cooperMuted)
                                Text(section.excerpt).font(.caption).foregroundStyle(Color.cooperMuted).lineLimit(3)
                            }
                            .padding(13)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(selectedTranscriptSectionId == section.id && contextMode == .selectedSection ? Color.cooperSoft : Color.white, in: RoundedRectangle(cornerRadius: 9))
                            .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct CanvasContextModeCard: View {
    let mode: CanvasContextMode
    let hasTypedPrompt: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(hasTypedPrompt ? "Typed direction is primary" : mode.sourceTitle)
                .font(.subheadline.bold())
                .foregroundStyle(Color.cooperInk)
            Text(hasTypedPrompt
                 ? "The typed instruction leads; the selected mode supplies supporting session evidence."
                 : mode.detail)
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct CanvasTemplatesView: View {
    let templates: [AiresExample]
    @Binding var selectedTemplateId: String
    let isQueuing: Bool
    let useInBuild: (AiresExample) -> Void
    let generate: (AiresExample) async -> Void

    private var selected: AiresExample? {
        templates.first { $0.id == selectedTemplateId } ?? templates.first
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                SectionHeading(eyebrow: "Template library", title: "AIRES output shapes", trailing: "\(templates.count) templates")
                if templates.isEmpty {
                    ProgressView("Loading templates")
                        .frame(maxWidth: .infinity)
                        .padding(40)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(templates) { template in
                                Button {
                                    selectedTemplateId = template.id
                                } label: {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(template.category.uppercased()).font(.caption2.monospaced().bold()).foregroundStyle(Color.cooperMuted)
                                        Text(template.title).font(.subheadline.bold()).foregroundStyle(Color.cooperInk).lineLimit(2)
                                    }
                                    .frame(width: 180, height: 72, alignment: .topLeading)
                                    .padding(12)
                                    .background(selectedTemplateId == template.id ? Color.cooperVolt : Color.white, in: RoundedRectangle(cornerRadius: 9))
                                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if let selected {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(selected.title).font(.title2.bold()).foregroundStyle(Color.cooperInk)
                            Text(selected.description).font(.subheadline).foregroundStyle(Color.cooperMuted)
                            Text(selected.flow).font(.caption).foregroundStyle(Color.cooperInk)
                            HStack {
                                Button("Use in Build", systemImage: "hammer") { useInBuild(selected) }
                                    .buttonStyle(.bordered)
                                Button {
                                    Task { await generate(selected) }
                                } label: {
                                    if isQueuing { ProgressView() } else { Label("Generate", systemImage: "sparkles") }
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(Color.cooperInk)
                                .disabled(isQueuing)
                            }
                            CanvasTemplatePreview(template: selected)
                                .frame(height: 360)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
                        }
                        .padding(15)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 11))
                        .overlay { RoundedRectangle(cornerRadius: 11).stroke(Color.cooperLine) }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct CanvasTemplatePreview: View {
    @Environment(AppModel.self) private var model
    let template: AiresExample
    @State private var html = ""
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let errorMessage {
                ContentUnavailableView("Preview unavailable", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
            } else if html.isEmpty {
                ProgressView("Loading template")
            } else {
                SafeArtifactHTMLView(content: html)
            }
        }
        .task(id: template.id) {
            html = ""
            errorMessage = nil
            do {
                html = try await model.airesExampleHTML(for: template)
            } catch is CancellationError {
                return
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct CanvasContextView: View {
    @Environment(AppModel.self) private var model
    let session: SessionRecord
    let packet: ContextPacket?
    let sessionContext: String
    let isLive: Bool
    let onUpdated: (LiveSessionContextResponse) -> Void

    @State private var liveContext: LiveSessionContextResponse?
    @State private var isPastePresented = false
    @State private var isFileImporterPresented = false
    @State private var sourceTitle = ""
    @State private var sourceContent = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                SectionHeading(eyebrow: "Evidence boundary", title: "Context Cooper can use", trailing: "\(packet?.sourceCount ?? 0) sources")

                if isLive {
                    liveMutationPanel
                } else {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "lock")
                        Text("Saved session evidence is read-only here. Continue the session with Cooper to add durable context while Realtime is active.")
                    }
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
                }

                if let project = liveContext?.project {
                    liveProjectSection(project)
                }

                if let packet {
                    if !packet.intent.isEmpty {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("SESSION INTENT").font(.caption2.monospaced().bold()).foregroundStyle(Color.cooperMuted)
                            Text(packet.intent).font(.headline).foregroundStyle(Color.cooperInk)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.cooperVolt.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
                    }

                    ForEach(packet.sources) { source in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: sourceIcon(source))
                                .foregroundStyle(Color.cooperInk)
                                .frame(width: 28, height: 28)
                                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 7))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(source.title).font(.subheadline.bold()).foregroundStyle(Color.cooperInk)
                                Text("\(source.provider) · \(source.type)").font(.caption2.monospaced()).foregroundStyle(Color.cooperMuted)
                                if !source.meta.isEmpty { Text(source.meta).font(.caption).foregroundStyle(Color.cooperMuted) }
                            }
                            Spacer()
                            Image(systemName: source.resolutionStatus == "completed" ? "checkmark.circle.fill" : "exclamationmark.circle")
                                .foregroundStyle(source.resolutionStatus == "completed" ? Color.cooperSuccess : Color.cooperDanger)
                        }
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                        .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                    }

                    VStack(alignment: .leading, spacing: 7) {
                        Label("Loaded packet preview", systemImage: "lock.shield")
                            .font(.subheadline.bold())
                        Text(sessionContext.isEmpty ? packet.contextPreview : String(sessionContext.prefix(2_400)))
                            .font(.caption.monospaced())
                            .foregroundStyle(Color.cooperMuted)
                            .textSelection(.enabled)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
                } else {
                    EmptyContent(icon: "link", title: "No saved context packet", message: "This session can still build from its transcript and typed direction. A continuation will pass through the context checkpoint again.")
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .task(id: session.id) {
            guard isLive else { return }
            do {
                let response = try await model.loadLiveSessionContext(for: session)
                liveContext = response
                onUpdated(response)
            } catch is CancellationError {
                return
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.pdf, .plainText, .text],
            allowsMultipleSelection: true
        ) { result in
            Task { await importFiles(result) }
        }
        .sheet(isPresented: $isPastePresented) {
            NavigationStack {
                Form {
                    Section("Live context") {
                        TextField("Source title", text: $sourceTitle)
                        TextField(
                            "Paste a decision, requirement, plan, note, or source excerpt",
                            text: $sourceContent,
                            axis: .vertical
                        )
                        .lineLimit(10...20)
                    }
                    Section {
                        Text("This becomes a durable project source attached to this exact call, then Cooper’s active Realtime context is refreshed.")
                            .font(.caption)
                            .foregroundStyle(Color.cooperMuted)
                    }
                    if let errorMessage {
                        Section { InlineMessage(text: errorMessage, isError: true) }
                    }
                }
                .navigationTitle("Add live context")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { isPastePresented = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(isSaving ? "Adding" : "Add") {
                            Task { await savePaste() }
                        }
                        .disabled(isSaving || sourceContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .presentationDetents([.large])
        }
    }

    private var liveMutationPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "bolt.horizontal.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color.cooperInk)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Add evidence while the call continues")
                        .font(.headline)
                        .foregroundStyle(Color.cooperInk)
                    Text("New context is stored on the Cooper host, attached to this session, and applied to Realtime without creating a second call.")
                        .font(.caption)
                        .foregroundStyle(Color.cooperMuted)
                }
            }
            HStack(spacing: 10) {
                Button {
                    errorMessage = nil
                    isPastePresented = true
                } label: {
                    Label("Paste context", systemImage: "doc.on.clipboard")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.cooperInk)
                .accessibilityIdentifier("add-live-context")

                Button {
                    errorMessage = nil
                    isFileImporterPresented = true
                } label: {
                    Label("Import file", systemImage: "arrow.up.doc")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("upload-live-context")
            }
            .disabled(isSaving)

            if isSaving {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Updating the durable call and Realtime context…")
                }
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)
            }
            if let errorMessage, !isPastePresented {
                InlineMessage(text: errorMessage, isError: true)
            }
        }
        .padding(15)
        .background(Color.cooperVolt.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
    }

    @ViewBuilder
    private func liveProjectSection(_ project: ProjectRecord) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(
                eyebrow: "Live project context",
                title: project.title,
                trailing: "\(project.sourceCount) sources"
            )
            if project.sources.isEmpty {
                Text("This call is attached to the project. Add the first source above.")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            } else {
                ForEach(project.sources.prefix(8)) { source in
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: source.sourceType == "pdf" ? "doc.richtext" : "doc.text")
                            .frame(width: 27, height: 27)
                            .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 7))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(source.title)
                                .font(.subheadline.bold())
                                .foregroundStyle(Color.cooperInk)
                            Text("\(source.sourceType.replacingOccurrences(of: "_", with: " ")) · \(source.storedCharCount.formatted()) characters")
                                .font(.caption2.monospaced())
                                .foregroundStyle(Color.cooperMuted)
                            if !source.preview.isEmpty {
                                Text(source.preview)
                                    .font(.caption)
                                    .foregroundStyle(Color.cooperMuted)
                                    .lineLimit(3)
                            }
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.cooperSuccess)
                    }
                    .padding(13)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                }
            }
        }
    }

    private func savePaste() async {
        isSaving = true
        errorMessage = nil
        do {
            let response = try await model.addLiveContext(
                to: session,
                title: sourceTitle,
                content: sourceContent
            )
            liveContext = response
            onUpdated(response)
            sourceTitle = ""
            sourceContent = ""
            isPastePresented = false
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func importFiles(_ result: Result<[URL], Error>) async {
        switch result {
        case .success(let files):
            let supported = Set(["md", "markdown", "txt", "pdf"])
            let accepted = files.filter { supported.contains($0.pathExtension.lowercased()) }
            guard !accepted.isEmpty else {
                errorMessage = "Choose Markdown, text, or PDF files."
                return
            }
            isSaving = true
            errorMessage = nil
            do {
                for file in accepted {
                    let hasAccess = file.startAccessingSecurityScopedResource()
                    defer { if hasAccess { file.stopAccessingSecurityScopedResource() } }
                    let response = try await model.uploadLiveContext(to: session, fileURL: file)
                    liveContext = response
                    onUpdated(response)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    private func sourceIcon(_ source: ContextSource) -> String {
        switch source.provider {
        case "notion": "doc.text"
        case "github": "chevron.left.forwardslash.chevron.right"
        case "meeting": "person.2.wave.2"
        case "file": "doc"
        default: "text.quote"
        }
    }
}

private struct CanvasActivityView: View {
    @Environment(AppModel.self) private var model
    let jobs: [ArtifactJob]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                SectionHeading(eyebrow: "Execution trace", title: "Canvas activity", trailing: "\(jobs.count) jobs")
                if jobs.isEmpty {
                    EmptyContent(icon: "waveform.path.ecg", title: "No Canvas work yet", message: "Generated work will remain observable here after leaving the screen or relaunching the app.")
                } else {
                    ForEach(jobs) { job in
                        VStack(alignment: .leading, spacing: 11) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(job.title).font(.headline).foregroundStyle(Color.cooperInk)
                                    Text(job.status.uppercased()).font(.caption2.monospaced().bold()).foregroundStyle(job.status == "failed" ? Color.red : Color.cooperMuted)
                                }
                                Spacer()
                                if job.canRetry {
                                    Button("Retry") { Task { await model.retryArtifactJob(job) } }
                                        .buttonStyle(.bordered)
                                        .font(.caption.bold())
                                } else if job.isActive {
                                    ProgressView().controlSize(.small)
                                }
                            }
                            ProgressView(value: job.progressFraction).tint(job.status == "failed" ? Color.red : Color.cooperVolt)
                            if !job.activeStepSummary.isEmpty || !job.progress.isEmpty {
                                Text(job.activeStepSummary.isEmpty ? job.progress : job.activeStepSummary)
                                    .font(.caption)
                                    .foregroundStyle(Color.cooperMuted)
                            }
                            ForEach(job.logs.suffix(4)) { log in
                                HStack(alignment: .top, spacing: 9) {
                                    Circle().fill(log.type == "completed" ? Color.cooperSuccess : Color.cooperMuted).frame(width: 6, height: 6).padding(.top, 5)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(log.message).font(.caption).foregroundStyle(Color.cooperInk)
                                        if !log.at.isEmpty { Text(log.at.cooperDateTime).font(.caption2).foregroundStyle(Color.cooperMuted) }
                                    }
                                }
                            }
                        }
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct CanvasJobSummary: View {
    let job: ArtifactJob

    var body: some View {
        HStack(spacing: 10) {
            if job.isActive { ProgressView().controlSize(.small) }
            Image(systemName: job.status == "failed" ? "exclamationmark.triangle" : "hammer")
                .foregroundStyle(job.status == "failed" ? Color.red : Color.cooperMuted)
            VStack(alignment: .leading, spacing: 2) {
                Text(job.title).font(.subheadline.bold())
                Text(job.status.replacingOccurrences(of: "_", with: " ")).font(.caption).foregroundStyle(Color.cooperMuted)
            }
            Spacer()
        }
        .padding(12)
        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
    }
}

struct CanvasBuildType: Identifiable, Hashable {
    let id: String
    let label: String
    let description: String

    static let all = [
        CanvasBuildType(id: "mermaid_diagram", label: "Diagram", description: "Workflow maps, architecture diagrams, service maps, and decision flows."),
        CanvasBuildType(id: "ui_wireframe", label: "Wireframe", description: "Low-fidelity screens, layout flows, and mobile-first interaction sketches."),
        CanvasBuildType(id: "html_prototype", label: "Prototype", description: "Interactive HTML/CSS prototypes rendered in the safe Canvas reader."),
        CanvasBuildType(id: "aires_requirements", label: "Requirements", description: "AIRES scoped requirements, product theses, JTBD, and service blueprints."),
        CanvasBuildType(id: "pdf_brief", label: "PDF brief", description: "A polished portrait brief saved as a real PDF for preview, export, and sharing."),
        CanvasBuildType(id: "word_brief", label: "Word brief", description: "An editable Word brief saved as a real DOCX for native preview, export, and sharing."),
        CanvasBuildType(id: "powerpoint_deck", label: "PowerPoint deck", description: "A concise decision deck saved as a real PPTX for native preview, export, and sharing."),
        CanvasBuildType(id: "excel_action_register", label: "Excel action register", description: "An editable workbook with formulas, validation, and session-backed action rows.")
    ]

    static func resolve(_ id: String) -> CanvasBuildType {
        all.first { $0.id == id } ?? CanvasBuildType(id: id, label: "Artifact", description: "Generated session output.")
    }
}

enum CanvasContextMode: String, CaseIterable, Identifiable {
    case smart
    case recentTranscript = "recent_transcript"
    case selectedSection = "selected_section"
    case fullTranscript = "full_transcript"
    case meetingFocus = "meeting_focus"
    case typedOnly = "typed_only"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .smart: "Smart context"
        case .recentTranscript: "Recent transcript"
        case .selectedSection: "Selected transcript section"
        case .fullTranscript: "Full transcript"
        case .meetingFocus: "Meeting or task brief"
        case .typedOnly: "Typed text only"
        }
    }
    var sourceTitle: String {
        switch self {
        case .smart: "Smart session context"
        case .recentTranscript: "Recent conversation"
        case .selectedSection: "Selected conversation moment"
        case .fullTranscript: "Full meeting transcript"
        case .meetingFocus: "Meeting or task context"
        case .typedOnly: "Typed direction only"
        }
    }
    var detail: String {
        switch self {
        case .smart: "Cooper combines recent transcript, the session focus, and the bounded context packet."
        case .recentTranscript: "The newest conversation section is the primary source."
        case .selectedSection: "The highlighted conversation moment is the primary source."
        case .fullTranscript: "Every captured transcript turn is included."
        case .meetingFocus: "The selected meeting, task, or project brief leads the artifact."
        case .typedOnly: "Only your typed direction is used; session evidence is excluded."
        }
    }
}

struct CanvasTranscriptSection: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let text: String
    let excerpt: String

    static func make(from transcript: [TranscriptEntry], entriesPerSection: Int = 4) -> [CanvasTranscriptSection] {
        let entries = transcript.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        var sections: [CanvasTranscriptSection] = []
        var end = entries.count
        while end > 0, sections.count < 6 {
            let start = max(0, end - entriesPerSection)
            let slice = Array(entries[start..<end])
            let text = slice.map { "\($0.speaker): \($0.text)" }.joined(separator: "\n")
            let participantTurn = slice.last { !$0.speaker.localizedCaseInsensitiveContains("cooper") } ?? slice.last
            let rawTitle = participantTurn?.text ?? "Conversation section"
            let title = rawTitle.count > 58 ? "\(rawTitle.prefix(55))…" : rawTitle
            let subtitle = [slice.first?.at.cooperDateTime, slice.last?.at.cooperDateTime].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " – ")
            sections.append(CanvasTranscriptSection(
                id: "section-\(start)-\(end)",
                title: title,
                subtitle: subtitle,
                text: text,
                excerpt: text.count > 220 ? "\(text.prefix(217))…" : text
            ))
            end = start
        }
        return sections
    }
}

private enum CanvasBuildRequestBuilder {
    static func build(
        type: CanvasBuildType,
        mode: CanvasContextMode,
        typedPrompt: String,
        selectedSection: CanvasTranscriptSection?,
        transcripts: [TranscriptEntry],
        focus: TodayItem?,
        packet: ContextPacket?,
        template: AiresExample?
    ) -> String {
        var parts = ["Build type: \(type.label)."]
        let cleanPrompt = typedPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanPrompt.isEmpty { parts.append("Michael's instruction:\n\(cleanPrompt)") }
        if let template {
            parts.append([
                "Selected AIRES template: \(template.title).",
                "Category: \(template.category).",
                template.promptHint,
                template.description
            ].filter { !$0.isEmpty }.joined(separator: "\n"))
        }

        let transcriptText = transcripts.map { "\($0.speaker): \($0.text)" }.joined(separator: "\n")
        let recent = selectedSection ?? CanvasTranscriptSection.make(from: transcripts).first
        let focusText = [
            focus.map { "Selected meeting/task: \($0.title)" } ?? "",
            focus?.description ?? "",
            packet.map { "Session intent: \($0.intent)\nContext preview: \($0.contextPreview)" } ?? ""
        ].filter { !$0.isEmpty }.joined(separator: "\n")

        let context: String
        switch mode {
        case .typedOnly: context = ""
        case .selectedSection: context = recent.map { "Selected conversation section:\n\($0.text)" } ?? ""
        case .fullTranscript: context = transcriptText.isEmpty ? "" : "Full meeting transcript:\n\(transcriptText)"
        case .meetingFocus: context = focusText
        case .recentTranscript: context = recent.map { "Recent conversation context:\n\($0.text)" } ?? ""
        case .smart:
            context = [recent.map { "Recent conversation context:\n\($0.text)" } ?? "", focusText].filter { !$0.isEmpty }.joined(separator: "\n\n")
        }
        if !context.isEmpty { parts.append(context) }
        if parts.count == 1 {
            parts.append("Use the current session context. Mark missing information and assumptions clearly.")
        }
        return parts.joined(separator: "\n\n")
    }
}

struct CanvasPresentation {
    let title: String
    let goal: String
    let coverage: Int
    let evidence: [CanvasEvidence]
    let questions: [String]
    let slides: [CanvasPresentationSlide]

    var copyBrief: String {
        ([title, goal, ""]
         + evidence.flatMap { [$0.title, $0.summary, $0.citation, ""] }
         + ["Questions for the room"]
         + questions.map { "- \($0)" }).joined(separator: "\n")
    }

    static func make(
        session: SessionRecord,
        focus: TodayItem?,
        packet: ContextPacket?,
        artifacts: [ArtifactRecord],
        jobs: [ArtifactJob]
    ) -> CanvasPresentation {
        let title = focus?.title ?? session.title
        let goal = [packet?.intent, focus?.description, focus?.prompt]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
            ?? "Align on the selected evidence, resolve the open decisions, and leave with clear next work."
        let sources = packet?.sources ?? []
        let resolved = sources.filter { $0.resolutionStatus.isEmpty || $0.resolutionStatus == "completed" }.count
        let coverage = sources.isEmpty ? 0 : Int((Double(resolved) / Double(sources.count) * 100).rounded())
        let evidence = sources.isEmpty
            ? [CanvasEvidence(id: "focus", title: "Session focus", summary: focus?.description ?? packet?.contextPreview ?? "Use the opening discussion to establish the evidence boundary.", citation: "Session brief")]
            : sources.enumerated().map { index, source in
                CanvasEvidence(
                    id: "\(source.provider):\(source.id)",
                    title: source.title,
                    summary: source.meta.isEmpty ? "\(source.title) is part of the shared session evidence." : source.meta,
                    citation: source.provider.isEmpty ? "Source \(index + 1)" : source.provider.capitalized
                )
            }
        var questions = [
            "Which facts in the loaded context are established, and which are still assumptions?",
            "What decision must this room make before implementation can move forward?",
            "What observable outcome will prove the chosen direction works?"
        ]
        if sources.contains(where: { $0.provider == "github" }) {
            questions[1] = "Does the current code change match the intended product and permission behavior?"
        }
        if sources.contains(where: { $0.type == "database" }) {
            questions[0] = "Which database records define the current scope, and which should be excluded?"
        }

        let ready = artifacts.count
        let active = jobs.filter(\.isActive)
        let recommendationThree: CanvasPresentationItem
        if let artifact = artifacts.first {
            recommendationThree = CanvasPresentationItem(id: "review", lead: "03", title: "Review \(artifact.title)", detail: "Use the prepared artifact as a working draft and revise it in the room.", status: "Ready")
        } else if let job = active.first {
            recommendationThree = CanvasPresentationItem(id: "building", lead: "03", title: "\(job.title) is being prepared", detail: "Keep talking while Cooper finishes the draft, then review it on the Canvas.", status: "Building")
        } else {
            recommendationThree = CanvasPresentationItem(id: "create", lead: "03", title: "Choose the first useful artifact", detail: "Build a diagram, requirements draft, prototype, or decision brief from the conversation.", status: "Create")
        }

        let slides = [
            CanvasPresentationSlide(
                id: "brief",
                eyebrow: "Session brief",
                title: title,
                narrative: goal,
                metrics: [
                    CanvasMetric(id: "sources", value: "\(sources.count)", label: "connected sources"),
                    CanvasMetric(id: "coverage", value: "\(coverage)%", label: "resolved context"),
                    CanvasMetric(id: "ready", value: "\(ready)", label: "documents ready")
                ],
                items: [CanvasPresentationItem(id: "purpose", lead: "01", title: "Begin from the same evidence", detail: sources.isEmpty ? "No external source is loaded yet. Establish the problem and evidence boundary first." : "Cooper has a bounded context packet and will separate established facts from assumptions.", status: sources.isEmpty ? "Needs context" : "Context loaded")]
            ),
            CanvasPresentationSlide(
                id: "understanding",
                eyebrow: "What Cooper understands",
                title: "The shared starting point",
                narrative: "The strongest evidence-backed signals Cooper can bring into the conversation right now.",
                items: evidence.prefix(5).enumerated().map { index, item in
                    CanvasPresentationItem(id: item.id, lead: String(index + 1).leftPadded(to: 2), title: item.title, detail: item.summary, status: item.citation)
                }
            ),
            CanvasPresentationSlide(
                id: "questions",
                eyebrow: "Questions for the room",
                title: "What still needs a decision",
                narrative: "Use these questions to challenge assumptions and keep the session moving toward a useful outcome.",
                items: questions.enumerated().map { index, question in
                    CanvasPresentationItem(id: "question-\(index)", lead: String(index + 1).leftPadded(to: 2), title: question, detail: index == 0 ? "Clarify this first; it shapes the rest of the discussion." : "Resolve or explicitly defer this before closing the session.", status: "Open")
                }
            ),
            CanvasPresentationSlide(
                id: "path",
                eyebrow: "Recommended session flow",
                title: "A practical way through the work",
                narrative: "This sequence is a suggestion, not an automatic commitment. Ask Cooper to change it as the conversation develops.",
                items: [
                    CanvasPresentationItem(id: "align", lead: "01", title: "Confirm the shared understanding", detail: "Correct missing or stale facts before debating solutions.", status: "Align"),
                    CanvasPresentationItem(id: "decide", lead: "02", title: questions[0], detail: "Resolve the highest-leverage uncertainty before expanding scope.", status: "Decide"),
                    recommendationThree,
                    CanvasPresentationItem(id: "commit", lead: "04", title: "Close with an owner and verification step", detail: "Capture the decision, next action, and the evidence that will prove the work is done.", status: "Commit")
                ]
            )
        ]
        return CanvasPresentation(title: title, goal: goal, coverage: coverage, evidence: evidence, questions: questions, slides: slides)
    }
}

struct CanvasEvidence: Identifiable {
    let id: String
    let title: String
    let summary: String
    let citation: String
}

struct CanvasPresentationSlide: Identifiable {
    let id: String
    let eyebrow: String
    let title: String
    let narrative: String
    var metrics: [CanvasMetric] = []
    var items: [CanvasPresentationItem] = []
}

struct CanvasMetric: Identifiable {
    let id: String
    let value: String
    let label: String
}

struct CanvasPresentationItem: Identifiable {
    let id: String
    let lead: String
    let title: String
    let detail: String
    let status: String
}

private extension String {
    func leftPadded(to width: Int) -> String {
        String(repeating: "0", count: max(0, width - count)) + self
    }
}

#Preview("Session Canvas") {
    NavigationStack {
        SessionCanvasView(
            session: SessionRecord.previews[0],
            focus: TodayResponse.preview.tasks.first,
            initialPacket: ContextPacket.previews.first
        )
    }
    .environment({
        let model = AppModel()
        model.sessions = SessionRecord.previews
        model.contextPackets = ContextPacket.previews
        model.artifacts = ArtifactRecord.previews
        model.artifactJobs = ArtifactJob.previews
        model.artifactRecipes = ArtifactRecipe.previews
        model.airesExamples = AiresExample.previews
        model.phase = .ready
        return model
    }())
}
