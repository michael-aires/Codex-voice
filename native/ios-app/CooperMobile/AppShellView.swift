import SwiftUI

struct AppRootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            Color.cooperCanvas.ignoresSafeArea()
            switch model.phase {
            case .checking:
                LaunchView()
            case .signedOut:
                LoginView()
            case .ready:
                AppShellView()
            case .unavailable(let message):
                UnavailableView(message: message)
            }
        }
        .tint(Color.cooperInk)
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 24) {
            CooperMark()
            ProgressView()
                .controlSize(.large)
            Text("Connecting to your Cooper workspace")
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
        }
        .padding(32)
    }
}

private struct LoginView: View {
    @Environment(AppModel.self) private var model
    @FocusState private var passwordFocused: Bool

    var body: some View {
        @Bindable var model = model

        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                CooperMark()
                    .padding(.top, 50)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Your sessions, wherever the work happens.")
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.cooperInk)
                    Text("Connect to the Cooper host already running your Calendar, Notion, Arcade, and saved session context.")
                        .font(.body)
                        .foregroundStyle(Color.cooperMuted)
                }

                VStack(spacing: 14) {
                    TextField("Cooper host", text: $model.serverAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textContentType(.URL)
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
                        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
                        .accessibilityLabel("Cooper server URL")

                    SecureField("App password", text: $model.password)
                        .textContentType(.password)
                        .focused($passwordFocused)
                        .submitLabel(.go)
                        .onSubmit { Task { await model.signIn() } }
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
                        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }

                    if let message = model.actionMessage {
                        InlineMessage(text: message, isError: true)
                    }

                    Button {
                        Task { await model.signIn() }
                    } label: {
                        HStack {
                            if model.isSigningIn { ProgressView().tint(Color.cooperInk) }
                            Text(model.isSigningIn ? "Connecting…" : "Open Cooper")
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                    .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(Color.cooperInk)
                    .disabled(model.isSigningIn)
                }

                Text("For Simulator, the default host is the local web server at 127.0.0.1:5000. A physical iPhone needs your Mac or deployed host address.")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

private struct UnavailableView: View {
    @Environment(AppModel.self) private var model
    let message: String

    var body: some View {
        VStack(spacing: 20) {
            CooperMark()
            Image(systemName: "network.slash")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(Color.cooperMuted)
            VStack(spacing: 8) {
                Text("Cooper host unavailable")
                    .font(.title2.bold())
                    .foregroundStyle(Color.cooperInk)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Color.cooperMuted)
                    .multilineTextAlignment(.center)
            }
            HStack {
                Button("Edit server") { model.showSignIn() }
                    .buttonStyle(.bordered)
                Button("Retry") { Task { await model.reconnect() } }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.cooperInk)
            }
        }
        .padding(32)
    }
}

private enum AppTab: Hashable {
    case today
    case sessions
    case projects
    case operatorWorkspace
    case more
}

private enum MoreRoute: Hashable {
    case library
    case artifact(String)
    case connections
    case settings
}

private struct AppShellView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedTab: AppTab = .today
    @State private var sessionPath = NavigationPath()
    @State private var projectPath = NavigationPath()
    @State private var operatorPath = NavigationPath()
    @State private var morePath = NavigationPath()
    @State private var routedBrief: DailyBrief?

    var body: some View {
        @Bindable var model = model

        TabView(selection: $selectedTab) {
            NavigationStack {
                TodayView()
            }
            .tabItem { Label("Today", systemImage: "sun.max") }
            .tag(AppTab.today)

            NavigationStack(path: $sessionPath) {
                SessionsView()
            }
            .tabItem { Label("Sessions", systemImage: "waveform") }
            .tag(AppTab.sessions)

            NavigationStack(path: $projectPath) {
                ProjectsView()
                    .navigationDestination(for: ProjectRecord.self) { project in
                        ProjectDetailView(projectID: project.id)
                    }
            }
            .tabItem { Label("Projects", systemImage: "folder") }
            .tag(AppTab.projects)

            NavigationStack(path: $operatorPath) {
                OperatorWorkspaceView()
            }
            .tabItem { Label("Operator", systemImage: "switch.2") }
            .tag(AppTab.operatorWorkspace)

            NavigationStack(path: $morePath) {
                MoreView()
                    .navigationDestination(for: MoreRoute.self) { route in
                        moreDestination(route)
                    }
            }
            .tabItem { Label("More", systemImage: "ellipsis") }
            .tag(AppTab.more)
        }
        .tint(Color.cooperInk)
        .fullScreenCover(item: $model.contextSeed) { seed in
            ContextCheckpointView(seed: seed)
        }
        .fullScreenCover(item: $model.voiceSeed) { seed in
            VoiceSessionView(seed: seed)
        }
        .fullScreenCover(item: $model.chatSeed) { seed in
            SessionChatView(seed: seed)
        }
        .fullScreenCover(item: $model.previewLiveCanvasSession) { session in
            NavigationStack {
                SessionCanvasView(
                    session: session,
                    initialPacket: model.contextPackets.first { $0.id == session.contextPacketId },
                    initialSessionContext: model.contextPackets.first { $0.id == session.contextPacketId }?.contextPreview ?? "",
                    isLive: true
                )
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close", systemImage: "xmark") {
                            model.previewLiveCanvasSession = nil
                            model.voice.stop()
                        }
                    }
                }
            }
        }
        .sheet(item: $routedBrief) { brief in
            NavigationStack {
                DailyBriefDeckView(
                    brief: model.dailyBrief ?? brief,
                    onRefresh: { await model.refreshDailyBrief() },
                    onPresent: { model.presentDailyBrief(model.dailyBrief ?? brief) }
                )
            }
        }
        .task(id: model.pendingRoute) {
            guard let route = model.pendingRoute else { return }
            await apply(route)
            model.pendingRoute = nil
        }
    }

    @ViewBuilder
    private func moreDestination(_ route: MoreRoute) -> some View {
        switch route {
        case .library:
            ArtifactLibraryView()
        case .artifact(let id):
            if let artifact = model.artifacts.first(where: { $0.id == id }) {
                ArtifactDetailView(artifact: artifact)
            } else {
                EmptyContent(
                    icon: "doc.questionmark",
                    title: "Artifact not found",
                    message: "This result may have been removed or belongs to another Cooper host."
                )
                .padding(24)
                .navigationTitle("Library")
            }
        case .connections:
            ConnectionsView()
        case .settings:
            SettingsView()
        }
    }

    private func apply(_ route: CooperRoute) async {
        switch route {
        case .today:
            selectedTab = .today
        case .dailyBrief:
            selectedTab = .today
            if model.dailyBrief == nil { await model.refreshDailyBrief(force: false) }
            routedBrief = model.dailyBrief
        case .sessions:
            selectedTab = .sessions
            sessionPath = NavigationPath()
        case .session(let id):
            selectedTab = .sessions
            if !model.isPreviewMode, !model.sessions.contains(where: { $0.id == id }) {
                await model.refreshAll(forceToday: false)
            }
            sessionPath = NavigationPath()
            if let session = model.sessions.first(where: { $0.id == id }) {
                sessionPath.append(session)
            } else {
                model.actionMessage = "The linked session is not available on this Cooper host."
            }
        case .projects:
            selectedTab = .projects
            projectPath = NavigationPath()
        case .project(let id):
            selectedTab = .projects
            if !model.isPreviewMode, !model.projects.contains(where: { $0.id == id }) {
                await model.refreshProjects()
            }
            projectPath = NavigationPath()
            if let project = model.projects.first(where: { $0.id == id }) {
                projectPath.append(project)
            } else {
                model.actionMessage = "The linked project is not available on this Cooper host."
            }
        case .operatorWorkspace:
            selectedTab = .operatorWorkspace
            operatorPath = NavigationPath()
        case .operatorTask(let taskID, _):
            selectedTab = .operatorWorkspace
            if !model.isPreviewMode, !model.operatorState.tasks.contains(where: { $0.id == taskID }) {
                await model.refreshOperator()
            }
            operatorPath = NavigationPath()
            if let task = model.operatorState.tasks.first(where: { $0.id == taskID }) {
                operatorPath.append(task)
            } else {
                model.operatorError = "The linked Operator task is not available on this Cooper host."
            }
        case .library:
            selectedTab = .more
            morePath = NavigationPath()
            morePath.append(MoreRoute.library)
        case .artifact(let id):
            selectedTab = .more
            if !model.isPreviewMode, !model.artifacts.contains(where: { $0.id == id }) {
                await model.refreshWorkspace()
            }
            morePath = NavigationPath()
            morePath.append(MoreRoute.artifact(id))
        case .connections:
            selectedTab = .more
            morePath = NavigationPath()
            morePath.append(MoreRoute.connections)
        case .settings:
            selectedTab = .more
            morePath = NavigationPath()
            morePath.append(MoreRoute.settings)
        }
    }
}
