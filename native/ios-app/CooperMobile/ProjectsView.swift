import SwiftUI
import UniformTypeIdentifiers

private enum ProjectListSheet: String, Identifiable {
    case create
    var id: String { rawValue }
}

struct ProjectsView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var presentedSheet: ProjectListSheet?

    private var visibleProjects: [ProjectRecord] {
        let cleanQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanQuery.isEmpty else { return model.projects }
        return model.projects.filter {
            $0.title.localizedCaseInsensitiveContains(cleanQuery)
                || $0.description.localizedCaseInsensitiveContains(cleanQuery)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("DURABLE CONTEXT")
                        .font(.caption2.weight(.bold).monospaced())
                        .tracking(0.7)
                        .foregroundStyle(Color.cooperMuted)
                    Text("Projects keep evidence reusable across sessions.")
                        .font(.title.bold())
                        .foregroundStyle(Color.cooperInk)
                    Text("Paste plans or import Markdown, text, and PDF sources. Cooper loads the selected project through the shared server context contract.")
                        .font(.subheadline)
                        .foregroundStyle(Color.cooperMuted)
                }

                if visibleProjects.isEmpty {
                    EmptyContent(
                        icon: "folder",
                        title: query.isEmpty ? "No projects yet" : "No matching projects",
                        message: query.isEmpty
                            ? "Create a project to preserve context beyond one session."
                            : "Try another title or description."
                    )
                } else {
                    ForEach(visibleProjects) { project in
                        NavigationLink(value: project) {
                            ProjectCard(project: project)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Projects")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Search projects")
        .refreshable { await model.refreshProjects() }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    presentedSheet = .create
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Create project")
                .accessibilityIdentifier("create-project")
            }
        }
        .sheet(item: $presentedSheet) { _ in
            ProjectCreateView()
        }
    }
}

private struct ProjectCard: View {
    let project: ProjectRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                StatusBadge(text: project.status, connected: project.status == "active")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(Color.cooperMuted)
            }
            Text(project.title)
                .font(.title3.bold())
                .foregroundStyle(Color.cooperInk)
            if !project.description.isEmpty {
                Text(project.description)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperMuted)
                    .lineLimit(3)
            }
            HStack(spacing: 16) {
                Label("\(project.sourceCount) sources", systemImage: "doc.on.doc")
                Label(project.totalChars.formatted() + " chars", systemImage: "text.alignleft")
            }
            .font(.caption)
            .foregroundStyle(Color.cooperMuted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
    }
}

private enum ProjectDetailSheet: String, Identifiable {
    case paste
    var id: String { rawValue }
}

struct ProjectDetailView: View {
    @Environment(AppModel.self) private var model
    let projectID: String

    @State private var presentedSheet: ProjectDetailSheet?
    @State private var isFileImporterPresented = false
    @State private var isUploading = false
    @State private var errorMessage: String?

    private var project: ProjectRecord? {
        model.projects.first { $0.id == projectID }
    }

    var body: some View {
        ScrollView {
            if let project {
                LazyVStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 11) {
                        StatusBadge(text: project.status, connected: project.status == "active")
                        Text(project.title)
                            .font(.title.bold())
                            .foregroundStyle(Color.cooperInk)
                        if !project.description.isEmpty {
                            Text(project.description)
                                .font(.body)
                                .foregroundStyle(Color.cooperMuted)
                        }
                        HStack(spacing: 10) {
                            Button {
                                model.presentVoiceSession(project: project)
                            } label: {
                                Label("Work with Cooper", systemImage: "waveform")
                                    .font(.subheadline.bold())
                                    .padding(.horizontal, 13)
                                    .padding(.vertical, 10)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(Color.cooperInk)
                            .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))

                            Menu {
                                Button("Paste text", systemImage: "doc.on.clipboard") {
                                    presentedSheet = .paste
                                }
                                Button("Upload file", systemImage: "arrow.up.doc") {
                                    isFileImporterPresented = true
                                }
                            } label: {
                                Label(isUploading ? "Uploading" : "Add source", systemImage: "plus")
                                    .font(.subheadline.bold())
                                    .padding(.horizontal, 13)
                                    .padding(.vertical, 10)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(Color.cooperInk)
                            .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                            .disabled(isUploading)
                        }
                    }

                    if let errorMessage {
                        InlineMessage(text: errorMessage, isError: true)
                    }

                    SectionHeading(
                        eyebrow: "Project context",
                        title: "Sources",
                        trailing: "\(project.sourceCount)"
                    )

                    if project.sources.isEmpty {
                        EmptyContent(
                            icon: "doc.badge.plus",
                            title: "No project sources",
                            message: "Paste working context or import Markdown, text, or PDF."
                        )
                    } else {
                        ForEach(project.sources) { source in
                            ProjectSourceCard(source: source)
                        }
                    }
                }
                .padding(18)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            } else {
                EmptyContent(icon: "folder.badge.questionmark", title: "Project unavailable", message: "Refresh Projects and try again.")
                    .padding(24)
            }
        }
        .background(Color.cooperCanvas)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $presentedSheet) { _ in
            ProjectPasteSourceView(projectID: projectID)
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.pdf, .plainText, .text],
            allowsMultipleSelection: true
        ) { result in
            Task { await upload(result) }
        }
    }

    private func upload(_ result: Result<[URL], Error>) async {
        switch result {
        case .success(let files):
            let supported = Set(["md", "markdown", "txt", "pdf"])
            let accepted = files.filter { supported.contains($0.pathExtension.lowercased()) }
            guard !accepted.isEmpty else {
                errorMessage = "Choose Markdown, text, or PDF files."
                return
            }
            isUploading = true
            errorMessage = nil
            do {
                for file in accepted {
                    try await model.uploadProjectFile(projectId: projectID, fileURL: file)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            isUploading = false
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }
}

private struct ProjectSourceCard: View {
    let source: ProjectSourceRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Image(systemName: source.sourceType == "pdf" ? "doc.richtext" : "doc.text")
                Text(source.title)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                Spacer()
                Text(source.sourceType.uppercased())
                    .font(.caption2.weight(.bold).monospaced())
                    .foregroundStyle(Color.cooperMuted)
            }
            if !source.preview.isEmpty {
                Text(source.preview)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperMuted)
                    .lineLimit(4)
            }
            HStack(spacing: 12) {
                Text(source.storedCharCount.formatted() + " characters")
                if source.truncated { Text("Stored excerpt") }
                if !source.originalName.isEmpty { Text(source.originalName) }
            }
            .font(.caption2.monospaced())
            .foregroundStyle(Color.cooperMuted)
        }
        .padding(15)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
        .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
    }
}

private struct ProjectCreateView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Project title", text: $title)
                    TextField("What should Cooper retain across sessions?", text: $description, axis: .vertical)
                        .lineLimit(3...7)
                }
                if let errorMessage {
                    Section { InlineMessage(text: errorMessage, isError: true) }
                }
            }
            .navigationTitle("New project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Creating" : "Create") {
                        Task { await save() }
                    }
                    .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        do {
            try await model.createProject(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                description: description.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}

private struct ProjectPasteSourceView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let projectID: String

    @State private var title = ""
    @State private var content = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Project source") {
                    TextField("Source title", text: $title)
                    TextField("Paste plans, requirements, notes, or agent output", text: $content, axis: .vertical)
                        .lineLimit(8...18)
                }
                if let errorMessage {
                    Section { InlineMessage(text: errorMessage, isError: true) }
                }
            }
            .navigationTitle("Paste project context")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Adding" : "Add") {
                        Task { await save() }
                    }
                    .disabled(isSaving || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        do {
            try await model.addProjectSource(
                projectId: projectID,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Pasted context" : title,
                content: content.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}

#Preview("Projects") {
    NavigationStack { ProjectsView() }
        .environment({
            let model = AppModel()
            model.projects = ProjectRecord.previews
            model.phase = .ready
            return model
        }())
}
