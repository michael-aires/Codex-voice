import SwiftUI

private enum OperatorLane: String, CaseIterable, Identifiable {
    case all = "All"
    case operatorWork = "Operator"
    case computerUse = "Computer Use"

    var id: String { rawValue }
}

private enum OperatorSheet: Identifiable {
    case newTask(OperatorPreset)

    var id: String {
        switch self {
        case .newTask: "new-task"
        }
    }
}

private struct PendingOperatorApproval: Identifiable {
    let task: OperatorTask
    let approval: OperatorApproval

    var id: String { approval.id }
}

struct OperatorWorkspaceView: View {
    @Environment(AppModel.self) private var model
    @State private var lane: OperatorLane = .all
    @State private var presentedSheet: OperatorSheet?
    @State private var isStopConfirmationPresented = false

    private var filteredTasks: [OperatorTask] {
        switch lane {
        case .all:
            model.operatorState.tasks
        case .operatorWork:
            model.operatorState.tasks.filter { !$0.isComputerUse }
        case .computerUse:
            model.operatorState.tasks.filter(\.isComputerUse)
        }
    }

    private var pendingApprovals: [PendingOperatorApproval] {
        model.operatorState.tasks.flatMap { task in
            task.pendingApprovals.map { PendingOperatorApproval(task: task, approval: $0) }
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 26) {
                hero

                if let error = model.operatorError, !error.isEmpty {
                    InlineMessage(text: error, isError: true)
                } else if let message = model.operatorMessage, !message.isEmpty {
                    InlineMessage(text: message, isError: false)
                }

                if !pendingApprovals.isEmpty {
                    approvalsSection
                }

                presetsSection
                tasksSection
                runtimeSection
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 20)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Operator")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: OperatorTask.self) { task in
            OperatorTaskDetailView(taskID: task.id)
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

                Button {
                    Task { await model.refreshOperator() }
                } label: {
                    if model.isRefreshingOperator {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(model.isRefreshingOperator || model.isPreviewMode)
                .accessibilityLabel("Refresh Operator")
            }
        }
        .refreshable {
            await model.refreshOperator()
        }
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .newTask(let preset):
                OperatorTaskComposer(initialPreset: preset)
            }
        }
        .alert("Stop all supervised work?", isPresented: $isStopConfirmationPresented) {
            Button("Keep running", role: .cancel) {}
            Button("Stop all", role: .destructive) {
                Task { await model.stopAllOperatorTasks() }
            }
        } message: {
            Text("This stops every active Operator and Computer Use task and cancels its pending approvals. Completed artifacts remain available.")
        }
        .task {
            await pollOperatorState()
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("SUPERVISED LOCAL WORK")
                        .font(.caption.weight(.bold).monospaced())
                        .tracking(0.8)
                        .foregroundStyle(Color.cooperMuted)
                    Text("Delegate the work. Keep the gates visible.")
                        .font(.title.bold())
                        .foregroundStyle(Color.cooperInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 10)
                if model.isPreviewMode {
                    StatusBadge(text: "Simulator preview", emphasized: true)
                }
            }

            Text("Operator coordinates local Codex and artifact work. Computer Use stays visible, allow-listed, and paused before sensitive or external actions.")
                .font(.body)
                .foregroundStyle(Color.cooperMuted)

            HStack(spacing: 10) {
                OperatorMetric(value: model.operatorState.limits.activeTasks, label: "active", emphasized: model.operatorState.limits.activeTasks > 0)
                OperatorMetric(value: model.operatorState.limits.approvalQueue, label: "approvals", emphasized: model.operatorState.limits.approvalQueue > 0)
                OperatorMetric(value: model.operatorState.tasks.count, label: "tasks")
            }

            HStack(spacing: 10) {
                Button {
                    presentedSheet = .newTask(defaultPreset)
                } label: {
                    Label("New supervised task", systemImage: "plus")
                        .font(.subheadline.bold())
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.cooperInk)
                .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
                .accessibilityIdentifier("new-operator-task")

                if model.operatorState.limits.activeTasks > 0 {
                    Button(role: .destructive) {
                        isStopConfirmationPresented = true
                    } label: {
                        Label("Stop all", systemImage: "stop.fill")
                            .font(.subheadline.bold())
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.cooperDanger)
                    .accessibilityIdentifier("stop-all-operator-tasks")
                }
            }
        }
    }

    private var approvalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(
                eyebrow: "Human checkpoint",
                title: "Approval queue",
                trailing: "\(pendingApprovals.count) waiting"
            )

            ForEach(pendingApprovals) { item in
                VStack(alignment: .leading, spacing: 11) {
                    HStack(alignment: .firstTextBaseline) {
                        Label(item.approval.title, systemImage: "hand.raised.fill")
                            .font(.headline)
                            .foregroundStyle(Color.cooperInk)
                        Spacer()
                        StatusBadge(text: "Paused", emphasized: true)
                    }
                    Text(item.task.title)
                        .font(.caption.bold())
                        .foregroundStyle(Color.cooperMuted)
                    Text(item.approval.description)
                        .font(.subheadline)
                        .foregroundStyle(Color.cooperInk)

                    HStack {
                        NavigationLink(value: item.task) {
                            Text("Review task")
                        }
                        .buttonStyle(.bordered)
                        .tint(Color.cooperInk)

                        Button("Approve checkpoint") {
                            Task { await model.approveOperatorTask(item.task, approval: item.approval) }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.cooperInk)
                        .accessibilityIdentifier("approve-operator-\(item.approval.id)")
                    }
                    .font(.caption.bold())
                }
                .padding(15)
                .background(Color.cooperVolt.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperVolt) }
            }
        }
    }

    private var presetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(
                eyebrow: "Launch pad",
                title: "Start from a supervised recipe",
                trailing: model.operatorState.presets.isEmpty ? nil : "\(model.operatorState.presets.count) recipes"
            )

            if model.operatorState.presets.isEmpty {
                EmptyContent(
                    icon: "switch.2",
                    title: "No Operator recipes loaded",
                    message: "Refresh the Cooper host to load its current local-work capabilities."
                )
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(model.operatorState.presets) { preset in
                            Button {
                                presentedSheet = .newTask(preset)
                            } label: {
                                OperatorPresetCard(preset: preset)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("operator-preset-\(preset.id)")
                        }
                    }
                    .padding(.vertical, 1)
                }
                .contentMargins(.horizontal, 1, for: .scrollContent)
            }
        }
    }

    private var tasksSection: some View {
        VStack(alignment: .leading, spacing: 13) {
            SectionHeading(
                eyebrow: "Run history",
                title: "Operator tasks",
                trailing: filteredTasks.isEmpty ? nil : "\(filteredTasks.count)"
            )

            Picker("Task lane", selection: $lane) {
                ForEach(OperatorLane.allCases) { lane in
                    Text(lane.rawValue).tag(lane)
                }
            }
            .pickerStyle(.segmented)

            if filteredTasks.isEmpty {
                EmptyContent(
                    icon: lane == .computerUse ? "rectangle.and.hand.point.up.left" : "switch.2",
                    title: "No \(lane.rawValue.lowercased()) tasks",
                    message: "Start a supervised recipe and its checkpoints will remain observable here."
                )
            } else {
                ForEach(filteredTasks) { task in
                    NavigationLink(value: task) {
                        OperatorTaskRow(task: task)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var runtimeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(eyebrow: "Local runtime", title: "Capability boundary")

            VStack(spacing: 0) {
                OperatorRuntimeRow(label: "Visible browser", enabled: model.operatorState.runtime.visibleBrowser)
                OperatorRuntimeRow(label: "Browser launch", enabled: model.operatorState.runtime.browserLaunchEnabled)
                OperatorRuntimeRow(label: "Computer Use", enabled: model.operatorState.runtime.computerUseEnabled)
                OperatorRuntimeRow(label: "Codex app-server", enabled: model.operatorState.runtime.codexAppServerEnabled)
                OperatorRuntimeRow(label: "Codex MCP", enabled: model.operatorState.runtime.codexMcpEnabled)
            }
            .padding(.horizontal, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }

            Text("Runtime capability does not grant action authority. Operator still pauses at browser, desktop bridge, write, external communication, commit, push, and destructive checkpoints.")
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)
        }
    }

    private var defaultPreset: OperatorPreset {
        model.operatorState.presets.first { $0.id == "codex_local_planning" }
            ?? model.operatorState.presets.first
            ?? OperatorPreset()
    }

    private func pollOperatorState() async {
        await model.refreshOperator()
        guard !model.isPreviewMode else { return }

        while !Task.isCancelled {
            let seconds = model.operatorState.tasks.contains(where: \.isActive) ? 2 : 8
            do {
                try await Task.sleep(for: .seconds(seconds))
            } catch is CancellationError {
                return
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            await model.refreshOperator()
        }
    }
}

private struct OperatorMetric: View {
    let value: Int
    let label: String
    var emphasized = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value.formatted())
                .font(.title3.bold().monospacedDigit())
            Text(label.uppercased())
                .font(.caption2.weight(.bold).monospaced())
                .tracking(0.4)
        }
        .foregroundStyle(Color.cooperInk)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(emphasized ? Color.cooperVolt : Color.white, in: RoundedRectangle(cornerRadius: 9))
        .overlay { RoundedRectangle(cornerRadius: 9).stroke(emphasized ? Color.cooperVolt : Color.cooperLine) }
    }
}

private struct OperatorPresetCard: View {
    let preset: OperatorPreset

    private var icon: String {
        if preset.isComputerUse { return "rectangle.and.hand.point.up.left" }
        if preset.isCodex { return "terminal" }
        if preset.artifactKinds?.isEmpty == false || preset.templateIds?.isEmpty == false { return "doc.badge.gearshape" }
        return "switch.2"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon)
                    .font(.headline)
                Spacer()
                StatusBadge(text: preset.riskLevel == "read" ? "Read" : "Gated")
            }
            Text(preset.title)
                .font(.headline)
                .foregroundStyle(Color.cooperInk)
                .lineLimit(2)
            Text(preset.description)
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)
                .lineLimit(3)
            Spacer(minLength: 0)
            Label("Configure task", systemImage: "arrow.up.right")
                .font(.caption.bold())
                .foregroundStyle(Color.cooperInk)
        }
        .padding(14)
        .frame(width: 235, height: 190, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
    }
}

private struct OperatorTaskRow: View {
    let task: OperatorTask

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Label(task.isComputerUse ? "Computer Use" : "Operator", systemImage: task.isComputerUse ? "rectangle.and.hand.point.up.left" : "switch.2")
                    .font(.caption.bold())
                    .foregroundStyle(Color.cooperMuted)
                Spacer()
                StatusBadge(text: task.status.replacingOccurrences(of: "_", with: " "), connected: task.status == "running", emphasized: task.status == "waiting_approval")
            }
            Text(task.title)
                .font(.headline)
                .foregroundStyle(Color.cooperInk)
                .lineLimit(2)
            Text(task.goal)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
                .lineLimit(2)

            ProgressView(value: Double(task.progress), total: 100)
                .tint(task.status == "waiting_approval" ? Color.cooperVolt : Color.cooperInk)

            HStack {
                Text("\(task.progress)%")
                if !task.pendingApprovals.isEmpty {
                    Text("· \(task.pendingApprovals.count) approval waiting")
                        .foregroundStyle(Color.cooperDanger)
                }
                Spacer()
                Image(systemName: "chevron.right")
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(Color.cooperMuted)
        }
        .padding(15)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(task.status == "waiting_approval" ? Color.cooperVolt : Color.cooperLine) }
    }
}

private struct OperatorRuntimeRow: View {
    let label: String
    let enabled: Bool

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
            Spacer()
            Circle()
                .fill(enabled ? Color.cooperSuccess : Color.cooperMuted.opacity(0.35))
                .frame(width: 7, height: 7)
            Text(enabled ? "Available" : "Unavailable")
                .font(.caption.bold())
                .foregroundStyle(enabled ? Color.cooperSuccess : Color.cooperMuted)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.cooperLine).frame(height: 1) }
    }
}

private struct OperatorTaskComposer: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPresetID: String
    @State private var goal: String
    @State private var targetURL: String
    @State private var allowedDomains: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(initialPreset: OperatorPreset) {
        _selectedPresetID = State(initialValue: initialPreset.id)
        _goal = State(initialValue: initialPreset.description)
        _targetURL = State(initialValue: initialPreset.targetUrl)
        _allowedDomains = State(initialValue: initialPreset.defaultDomains.joined(separator: ", "))
    }

    private var selectedPreset: OperatorPreset {
        model.operatorState.presets.first { $0.id == selectedPresetID }
            ?? OperatorPreset()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Supervised recipe") {
                    Picker("Recipe", selection: $selectedPresetID) {
                        ForEach(model.operatorState.presets) { preset in
                            Text(preset.title).tag(preset.id)
                        }
                    }

                    LabeledContent("Risk boundary", value: selectedPreset.riskLevel == "read" ? "Read-only" : "Approval gated")
                    if selectedPreset.isComputerUse {
                        LabeledContent("Harness", value: selectedPreset.id == "computer_use_desktop" ? "Desktop" : "Browser")
                    }
                }

                Section {
                    TextEditor(text: $goal)
                        .frame(minHeight: 120)
                        .accessibilityLabel("Operator task goal")
                } header: {
                    Text("Outcome")
                } footer: {
                    Text("Describe the observable result. Operator will expose its checkpoints and will not treat this text as approval for a later sensitive action.")
                }

                Section("Target boundary") {
                    TextField("Target URL or local destination", text: $targetURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    TextField("Allowed domains, comma separated", text: $allowedDomains)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Budget") {
                    LabeledContent("Maximum steps", value: selectedPresetBudget.maxSteps.formatted())
                    LabeledContent("Codex invocations", value: selectedPresetBudget.maxCodexInvocations.formatted())
                    LabeledContent("Wall clock", value: "\(selectedPresetBudget.maxWallClockMs / 60_000) min")
                }

                if let errorMessage {
                    Section {
                        InlineMessage(text: errorMessage, isError: true)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.cooperCanvas)
            .navigationTitle("New Operator task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Queuing…" : "Queue") {
                        Task { await submit() }
                    }
                    .fontWeight(.bold)
                    .disabled(isSaving || goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("queue-operator-task")
                }
            }
            .onChange(of: selectedPresetID) { _, _ in
                let preset = selectedPreset
                goal = preset.description
                targetURL = preset.targetUrl
                allowedDomains = preset.defaultDomains.joined(separator: ", ")
            }
        }
    }

    private var selectedPresetBudget: OperatorBudget {
        model.operatorState.runtime.budgets
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        do {
            _ = try await model.startOperatorTask(
                preset: selectedPreset,
                goal: goal.trimmingCharacters(in: .whitespacesAndNewlines),
                targetURL: targetURL.trimmingCharacters(in: .whitespacesAndNewlines),
                allowedDomains: parsedDomains
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }

    private var parsedDomains: [String] {
        allowedDomains
            .components(separatedBy: CharacterSet(charactersIn: ",\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

private struct OperatorTaskDetailView: View {
    @Environment(AppModel.self) private var model
    let taskID: String
    @State private var isCancelConfirmationPresented = false

    private var task: OperatorTask? {
        model.operatorState.tasks.first { $0.id == taskID }
    }

    var body: some View {
        Group {
            if let task {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        detailHeader(task)

                        if !task.pendingApprovals.isEmpty {
                            detailApprovals(task)
                        }

                        checkpoints(task)
                        generatedWork(task)
                        operatorArtifacts(task)
                        activity(task)

                        if task.isActive {
                            Button(role: .destructive) {
                                isCancelConfirmationPresented = true
                            } label: {
                                Label("Cancel this task", systemImage: "xmark.circle")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(Color.cooperDanger)
                            .accessibilityIdentifier("cancel-operator-task")
                        }
                    }
                    .padding(20)
                    .frame(maxWidth: 720)
                    .frame(maxWidth: .infinity)
                }
                .background(Color.cooperCanvas)
                .alert("Cancel this task?", isPresented: $isCancelConfirmationPresented) {
                    Button("Keep running", role: .cancel) {}
                    Button("Cancel task", role: .destructive) {
                        Task { await model.cancelOperatorTask(task) }
                    }
                } message: {
                    Text("Pending approvals will be cancelled. Any completed artifact remains in the shared Library.")
                }
            } else {
                EmptyContent(icon: "questionmark.folder", title: "Task unavailable", message: "Refresh Operator to load this task again.")
                    .padding(24)
            }
        }
        .navigationTitle(task?.isComputerUse == true ? "Computer Use" : "Operator task")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func detailHeader(_ task: OperatorTask) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                StatusBadge(text: task.status.replacingOccurrences(of: "_", with: " "), connected: task.status == "running", emphasized: task.status == "waiting_approval")
                StatusBadge(text: task.riskLevel == "read" ? "Read-only" : "Approval gated")
                Spacer()
                Text("\(task.progress)%")
                    .font(.headline.monospacedDigit())
            }
            Text(task.title)
                .font(.title.bold())
                .foregroundStyle(Color.cooperInk)
            Text(task.goal)
                .font(.body)
                .foregroundStyle(Color.cooperMuted)

            ProgressView(value: Double(task.progress), total: 100)
                .tint(task.status == "waiting_approval" ? Color.cooperVolt : Color.cooperInk)

            if !task.targetUrl.isEmpty {
                Label(task.targetUrl, systemImage: "link")
                    .font(.caption)
                    .foregroundStyle(Color.cooperInk)
                    .textSelection(.enabled)
            }
            if !task.allowedDomains.isEmpty {
                Label(task.allowedDomains.joined(separator: " · "), systemImage: "checkmark.shield")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
            if !task.error.isEmpty {
                InlineMessage(text: task.error, isError: true)
            }
        }
    }

    private func detailApprovals(_ task: OperatorTask) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(eyebrow: "Paused safely", title: "Approval required", trailing: "\(task.pendingApprovals.count)")
            ForEach(task.pendingApprovals) { approval in
                VStack(alignment: .leading, spacing: 10) {
                    Label(approval.title, systemImage: "hand.raised.fill")
                        .font(.headline)
                    Text(approval.description)
                        .font(.subheadline)
                        .foregroundStyle(Color.cooperMuted)
                    Button("Approve this checkpoint") {
                        Task { await model.approveOperatorTask(task, approval: approval) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.cooperInk)
                    .accessibilityIdentifier("approve-detail-\(approval.id)")
                }
                .padding(15)
                .background(Color.cooperVolt.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperVolt) }
            }
        }
    }

    private func checkpoints(_ task: OperatorTask) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(eyebrow: "Execution contract", title: "Checkpoints", trailing: "\(min(task.stepIndex, task.steps.count))/\(task.steps.count)")
            VStack(spacing: 0) {
                ForEach(task.steps.indices, id: \.self) { index in
                    let isComplete = index < task.stepIndex || task.status == "completed"
                    let isCurrent = index == task.stepIndex && task.isActive
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: isComplete ? "checkmark.circle.fill" : isCurrent ? "circle.inset.filled" : "circle")
                            .foregroundStyle(isComplete ? Color.cooperSuccess : isCurrent ? Color.cooperVolt : Color.cooperMuted)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(index + 1, format: .number.precision(.integerLength(2)))")
                                .font(.caption2.monospaced())
                                .foregroundStyle(Color.cooperMuted)
                            Text(task.steps[index])
                                .font(.subheadline)
                                .foregroundStyle(Color.cooperInk)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 11)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color.cooperLine).frame(height: 1) }
                }
            }
            .padding(.horizontal, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        }
    }

    @ViewBuilder
    private func generatedWork(_ task: OperatorTask) -> some View {
        if !task.generatedArtifactList.isEmpty || !task.generatedJobList.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading(eyebrow: "Shared work model", title: "Generated work", trailing: "\(task.generatedArtifactList.count) ready")

                ForEach(task.generatedArtifactList) { artifact in
                    NavigationLink {
                        ArtifactDetailView(artifact: artifact)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: artifact.isHTML ? "safari" : "doc.text")
                            VStack(alignment: .leading, spacing: 3) {
                                Text(artifact.title).font(.subheadline.bold())
                                Text(artifact.outputType.uppercased()).font(.caption2.monospaced())
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .foregroundStyle(Color.cooperInk)
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                        .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                    }
                    .buttonStyle(.plain)
                }

                ForEach(task.generatedJobList.filter { $0.artifactId.isEmpty }) { job in
                    HStack(spacing: 10) {
                        if job.isActive { ProgressView().controlSize(.small) }
                        Image(systemName: job.status == "failed" ? "exclamationmark.triangle" : "hammer")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(job.title).font(.subheadline.bold())
                            Text(job.progress.isEmpty ? job.status : job.progress)
                                .font(.caption)
                                .foregroundStyle(Color.cooperMuted)
                        }
                        Spacer()
                    }
                    .padding(13)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 9))
                }
            }
        }
    }

    @ViewBuilder
    private func operatorArtifacts(_ task: OperatorTask) -> some View {
        if !task.artifacts.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading(eyebrow: "Operator result", title: "Run summaries")
                ForEach(task.artifacts) { artifact in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(artifact.title)
                            .font(.headline)
                        Text(artifact.content)
                            .font(.subheadline)
                            .foregroundStyle(Color.cooperMuted)
                            .textSelection(.enabled)
                    }
                    .padding(14)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperLine) }
                }
            }
        }
    }

    private func activity(_ task: OperatorTask) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(eyebrow: "Audit trail", title: "Activity", trailing: "\(task.logs.count) events")

            if task.logs.isEmpty {
                EmptyContent(icon: "waveform.path.ecg", title: "No activity yet", message: "The runner has not published a checkpoint for this task.")
            } else {
                ForEach(task.logs.reversed()) { log in
                    HStack(alignment: .top, spacing: 12) {
                        Circle()
                            .fill(log.type.contains("approval") ? Color.cooperVolt : log.type.contains("failed") ? Color.cooperDanger : Color.cooperInk)
                            .frame(width: 8, height: 8)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(log.title).font(.subheadline.bold())
                                Spacer()
                                Text(log.at.cooperDateTime).font(.caption2)
                            }
                            Text(log.detail)
                                .font(.caption)
                                .foregroundStyle(Color.cooperMuted)
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
        }
    }
}

#Preview("Operator workspace") {
    NavigationStack { OperatorWorkspaceView() }
        .environment({
            let model = AppModel()
            model.operatorState = .preview
            model.artifacts = ArtifactRecord.previews
            model.artifactJobs = ArtifactJob.previews
            model.phase = .ready
            return model
        }())
}
