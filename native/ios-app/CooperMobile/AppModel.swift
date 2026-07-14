import Foundation
import Observation
import UIKit
import UserNotifications

enum AppPhase: Equatable {
    case checking
    case signedOut
    case ready
    case unavailable(String)
}

@MainActor
@Observable
final class AppModel {
    private static let serverDefaultsKey = "cooper.serverURL"
    private static let notificationsEnabledKey = "cooper.notifications.enabled"
    private static let pushInstallationKey = "cooper.push.installation"

    var phase: AppPhase = .checking
    var serverAddress: String
    var password = ""
    var today: TodayResponse = .empty
    var dailyBrief: DailyBrief?
    var sessions: [SessionRecord] = []
    var projects: [ProjectRecord] = []
    var contextPackets: [ContextPacket] = []
    var artifacts: [ArtifactRecord] = []
    var artifactJobs: [ArtifactJob] = []
    var toolCalls: [ToolCallRecord] = []
    var artifactRecipes: [ArtifactRecipe] = []
    var airesExamples: [AiresExample] = []
    var operatorState: OperatorStateResponse = .empty
    var arcade: ArcadeStatus = .empty
    var arcadeDiscovery: ArcadeDiscovery = .empty
    var isRefreshing = false
    var isRefreshingDailyBrief = false
    var isRefreshingOperator = false
    var isSigningIn = false
    var actionMessage: String?
    var operatorMessage: String?
    var operatorError: String?
    var dailyBriefError: String?
    var lastRefreshErrors: [String] = []
    var contextSeed: ContextCheckpointSeed?
    var voiceSeed: VoiceSessionSeed?
    var chatSeed: VoiceSessionSeed?
    var previewLiveCanvasSession: SessionRecord?
    var pendingRoute: CooperRoute?
    var notificationAuthorization: CooperNotificationAuthorization = .unknown
    var notificationsEnabled: Bool
    var mobilePush = MobilePushStatus()
    var deviceReadiness = MobileDeviceReadiness()
    var deviceReadinessError: String?
    var isRemotePushRegistered = false
    var remotePushRegistrationError: String?
    private(set) var isPreviewMode = false
    private var artifactContentCache: [String: String] = [:]
    private var artifactDataCache: [String: Data] = [:]
    private var contextPacketCache: [String: ContextPacketResponse] = [:]
    private var airesExampleHTMLCache: [String: String] = [:]
    private var hasLoadedOperatorNotificationBaseline = false
    private var hasLoadedWorkspaceNotificationBaseline = false
    private var remoteDeviceToken = ""
    private let pushInstallationId: String

    private let client: CooperAPIClient
    let voice = VoiceSessionController()

    var serverURL: URL? { Self.normalizedURL(serverAddress) }
    var appAPNSEnvironment: String { Self.apnsEnvironment }

    init() {
        let savedAddress = UserDefaults.standard.string(forKey: Self.serverDefaultsKey)
            ?? "http://127.0.0.1:5000"
        serverAddress = savedAddress
        notificationsEnabled = UserDefaults.standard.bool(forKey: Self.notificationsEnabledKey)
        if let existingInstallation = UserDefaults.standard.string(forKey: Self.pushInstallationKey),
           !existingInstallation.isEmpty {
            pushInstallationId = existingInstallation
        } else {
            let installation = UUID().uuidString
            UserDefaults.standard.set(installation, forKey: Self.pushInstallationKey)
            pushInstallationId = installation
        }
        client = CooperAPIClient(baseURL: Self.normalizedURL(savedAddress) ?? URL(string: "http://127.0.0.1:5000")!)
    }

    func start() async {
        await refreshNotificationAuthorization()
        if ProcessInfo.processInfo.arguments.contains("--preview-data") {
            loadPreviewData()
            return
        }
        await reconnect()
        if notificationsEnabled, notificationAuthorization == .authorized, phase == .ready {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func reconnect() async {
        guard let url = Self.normalizedURL(serverAddress) else {
            phase = .unavailable(CooperAPIError.invalidServerURL.localizedDescription)
            return
        }

        phase = .checking
        await client.configure(baseURL: url)
        do {
            let auth = try await client.authStatus()
            if auth.authenticated {
                phase = .ready
                await refreshAll(forceToday: false)
            } else {
                phase = .signedOut
            }
        } catch {
            phase = .unavailable(error.localizedDescription)
        }
    }

    func signIn() async {
        guard let url = Self.normalizedURL(serverAddress) else {
            actionMessage = CooperAPIError.invalidServerURL.localizedDescription
            return
        }
        guard !password.isEmpty else {
            actionMessage = "Enter the app password configured on your Cooper host."
            return
        }

        isSigningIn = true
        actionMessage = nil
        await client.configure(baseURL: url)
        do {
            let result = try await client.login(password: password)
            guard result.authenticated else {
                actionMessage = "The Cooper host did not create an authenticated session."
                isSigningIn = false
                return
            }
            UserDefaults.standard.set(serverAddress, forKey: Self.serverDefaultsKey)
            password = ""
            phase = .ready
            isSigningIn = false
            await refreshAll(forceToday: false)
        } catch {
            actionMessage = error.localizedDescription
            isSigningIn = false
        }
    }

    func signOut() async {
        guard !isPreviewMode else {
            phase = .signedOut
            return
        }
        await unregisterRemotePushDevice()
        UIApplication.shared.unregisterForRemoteNotifications()
        _ = try? await client.logout()
        password = ""
        clearArtifactCache()
        resetNotificationBaselines()
        phase = .signedOut
    }

    func showSignIn() {
        actionMessage = nil
        phase = .signedOut
    }

    func open(_ url: URL) {
        let directRoute = CooperRoute(url: url)
        let universalRoute: CooperRoute? = if directRoute == nil,
                                ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                                url.host?.lowercased() == serverURL?.host?.lowercased(),
                                url.port == serverURL?.port {
            CooperRoute(universalURL: url)
        } else {
            nil
        }
        guard let route = directRoute ?? universalRoute else {
            actionMessage = "Cooper could not open this app link."
            return
        }
        pendingRoute = route
    }

    func open(_ route: CooperRoute) {
        pendingRoute = route
    }

    func refreshNotificationAuthorization() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            notificationAuthorization = .authorized
        case .denied:
            notificationAuthorization = .denied
            notificationsEnabled = false
            UserDefaults.standard.set(false, forKey: Self.notificationsEnabledKey)
        case .notDetermined:
            notificationAuthorization = .notDetermined
        @unknown default:
            notificationAuthorization = .unknown
        }
    }

    func enableNotifications() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            notificationsEnabled = granted
            UserDefaults.standard.set(granted, forKey: Self.notificationsEnabledKey)
            await refreshNotificationAuthorization()
            if granted {
                remotePushRegistrationError = nil
                UIApplication.shared.registerForRemoteNotifications()
            }
            actionMessage = granted
                ? "Cooper alerts are enabled. Registering this iPhone for remote delivery."
                : "Notifications remain blocked. You can enable them in iOS Settings."
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    func disableNotifications() async {
        await unregisterRemotePushDevice()
        notificationsEnabled = false
        UserDefaults.standard.set(false, forKey: Self.notificationsEnabledKey)
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UIApplication.shared.unregisterForRemoteNotifications()
        isRemotePushRegistered = false
        actionMessage = "Cooper alerts are paused on this iPhone."
    }

    func registerRemotePushDevice(token: String) async {
        guard !isPreviewMode, notificationsEnabled, notificationAuthorization == .authorized else { return }
        remoteDeviceToken = token
        do {
            let response = try await client.registerMobilePushDevice(
                token: token,
                installationId: pushInstallationId,
                environment: Self.apnsEnvironment,
                bundleId: Bundle.main.bundleIdentifier ?? "ai.aires.cooper.mobile",
                deviceName: UIDevice.current.name,
                locale: Locale.current.identifier
            )
            mobilePush = response.mobilePush
            deviceReadiness.apns = response.mobilePush
            isRemotePushRegistered = true
            remotePushRegistrationError = response.mobilePush.configured
                ? nil
                : "The iPhone is registered, but the Cooper host still needs APNs credentials. Local foreground alerts remain active."
            actionMessage = response.mobilePush.configured
                ? "This iPhone is registered for remote Cooper alerts."
                : "This iPhone is registered with Cooper. Add APNs credentials on the host to deliver while the app is away."
        } catch {
            isRemotePushRegistered = false
            remotePushRegistrationError = error.localizedDescription
            actionMessage = "Remote alert registration failed. Local foreground alerts remain active."
        }
    }

    func remotePushRegistrationFailed(_ message: String) {
        isRemotePushRegistered = false
        remotePushRegistrationError = message
        actionMessage = "APNs registration failed. Local foreground alerts remain active."
    }

    func refreshFromRemoteNotification() async -> UIBackgroundFetchResult {
        guard !isPreviewMode, phase == .ready else { return .noData }
        let previousSignature = remoteRefreshSignature
        await refreshAll(forceToday: false)
        return previousSignature == remoteRefreshSignature ? .noData : .newData
    }

    func refreshDeviceReadiness() async {
        await refreshNotificationAuthorization()
        guard !isPreviewMode else { return }
        do {
            let readiness = try await client.mobileDeviceReadiness()
            deviceReadiness = readiness
            mobilePush = readiness.apns
            deviceReadinessError = nil
        } catch {
            deviceReadinessError = error.localizedDescription
        }
    }

    private func unregisterRemotePushDevice() async {
        guard !isPreviewMode else {
            isRemotePushRegistered = false
            remoteDeviceToken = ""
            return
        }
        if !remoteDeviceToken.isEmpty || !pushInstallationId.isEmpty {
            if let response = try? await client.unregisterMobilePushDevice(
                token: remoteDeviceToken,
                installationId: pushInstallationId
            ) {
                mobilePush = response.mobilePush
                deviceReadiness.apns = response.mobilePush
            }
        }
        remoteDeviceToken = ""
        isRemotePushRegistered = false
    }

    private var remoteRefreshSignature: String {
        let jobs = artifactJobs.map { "\($0.id):\($0.status):\($0.updatedAt)" }.joined(separator: "|")
        let tasks = operatorState.tasks.map { "\($0.id):\($0.status):\($0.updatedAt)" }.joined(separator: "|")
        return "\(today.updatedAt)|\(dailyBrief?.generatedAt ?? "")|\(sessions.count)|\(artifacts.count)|\(jobs)|\(tasks)"
    }

    private static var apnsEnvironment: String {
#if DEBUG
        "sandbox"
#else
        "production"
#endif
    }

    func saveServerAndReconnect() async {
        guard let url = Self.normalizedURL(serverAddress) else {
            actionMessage = CooperAPIError.invalidServerURL.localizedDescription
            return
        }
        await unregisterRemotePushDevice()
        UIApplication.shared.unregisterForRemoteNotifications()
        UserDefaults.standard.set(serverAddress, forKey: Self.serverDefaultsKey)
        clearArtifactCache()
        resetNotificationBaselines()
        await client.configure(baseURL: url)
        await reconnect()
        if notificationsEnabled, notificationAuthorization == .authorized, phase == .ready {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func refreshAll(forceToday: Bool) async {
        guard !isPreviewMode else { return }
        isRefreshing = true
        lastRefreshErrors = []

        do {
            today = try await client.today(forceRefresh: forceToday)
        } catch {
            handleRefreshError(error, label: "Today")
        }

        isRefreshingDailyBrief = true
        do {
            dailyBrief = try await client.dailyBrief()
            dailyBriefError = nil
        } catch {
            dailyBriefError = error.localizedDescription
            handleRefreshError(error, label: "Daily Catch Up")
        }
        isRefreshingDailyBrief = false

        do {
            sessions = try await client.calls().calls
        } catch {
            handleRefreshError(error, label: "Sessions")
        }

        do {
            let workspace = try await client.workspaceState()
            apply(workspace)
        } catch {
            handleRefreshError(error, label: "Workspace")
        }

        do {
            applyOperatorState(try await client.operatorState())
        } catch {
            handleRefreshError(error, label: "Operator")
        }

        do {
            arcade = try await client.arcadeStatus()
        } catch {
            handleRefreshError(error, label: "Arcade status")
        }

        do {
            arcadeDiscovery = try await client.arcadeDiscovery()
        } catch {
            handleRefreshError(error, label: "Arcade discovery")
        }

        await refreshDeviceReadiness()

        isRefreshing = false
    }

    func refreshToday() async {
        guard !isPreviewMode else { return }
        isRefreshing = true
        var refreshedToday = false
        var refreshedBrief = false
        do {
            today = try await client.today(forceRefresh: true)
            refreshedToday = true
        } catch {
            handleRefreshError(error, label: "Today")
        }
        isRefreshingDailyBrief = true
        do {
            dailyBrief = try await client.refreshDailyBrief()
            dailyBriefError = nil
            refreshedBrief = true
        } catch {
            dailyBriefError = error.localizedDescription
            handleRefreshError(error, label: "Daily Catch Up")
        }
        isRefreshingDailyBrief = false
        actionMessage = if refreshedToday && refreshedBrief {
            "Calendar, Notion, and Daily Catch Up refreshed."
        } else if refreshedToday {
            "Calendar and Notion refreshed; the saved Daily Catch Up could not be rebuilt."
        } else if refreshedBrief {
            "Daily Catch Up refreshed; the raw Today view could not be refreshed."
        } else {
            "Today could not be refreshed."
        }
        isRefreshing = false
    }

    func refreshDailyBrief(force: Bool = true) async {
        guard !isPreviewMode else { return }
        isRefreshingDailyBrief = true
        do {
            dailyBrief = force ? try await client.refreshDailyBrief() : try await client.dailyBrief()
            dailyBriefError = nil
            actionMessage = force ? "Daily Catch Up refreshed from Calendar and Notion." : nil
        } catch {
            dailyBriefError = error.localizedDescription
            handleRefreshError(error, label: "Daily Catch Up")
        }
        isRefreshingDailyBrief = false
    }

    func refreshConnections() async {
        guard !isPreviewMode else { return }
        isRefreshing = true
        do {
            arcade = try await client.arcadeStatus()
            arcadeDiscovery = try await client.arcadeDiscovery()
            actionMessage = "Connection status refreshed."
        } catch {
            handleRefreshError(error, label: "Connections")
            actionMessage = error.localizedDescription
        }
        isRefreshing = false
    }

    func presentVoiceSession(focus: TodayItem? = nil) {
        contextSeed = ContextCheckpointSeed(focus: focus, preferredLaunchMode: .voice)
    }

    func presentChatSession(focus: TodayItem? = nil) {
        contextSeed = ContextCheckpointSeed(focus: focus, preferredLaunchMode: .chat)
    }

    func presentDailyBrief(_ brief: DailyBrief) {
        contextSeed = ContextCheckpointSeed(focus: brief.sessionFocus, dailyBrief: brief, preferredLaunchMode: .voice)
    }

    func presentVoiceSession(resuming session: SessionRecord) {
        contextSeed = ContextCheckpointSeed(
            focus: nil,
            resumedSession: session,
            preferredLaunchMode: .voice
        )
    }

    func presentChatSession(resuming session: SessionRecord) {
        contextSeed = ContextCheckpointSeed(
            focus: nil,
            resumedSession: session,
            preferredLaunchMode: .chat
        )
    }

    func presentVoiceSession(project: ProjectRecord) {
        presentVoiceSession(focus: TodayItem(
            id: "project-\(project.id)",
            targetId: project.id,
            type: "project",
            title: project.title,
            subtitle: "\(project.sourceCount) project sources",
            source: "Cooper projects",
            sourceLabel: "Project",
            eyebrow: "PROJECT CONTEXT",
            status: project.status,
            description: project.description,
            points: ["\(project.sourceCount) sources", "\(project.totalChars) characters"],
            actionLabel: "Work with Cooper"
        ))
    }

    func refreshProjects() async {
        guard !isPreviewMode else { return }
        isRefreshing = true
        do {
            apply(try await client.workspaceState())
        } catch {
            actionMessage = error.localizedDescription
        }
        isRefreshing = false
    }

    func refreshWorkspace() async {
        guard !isPreviewMode else { return }
        do {
            apply(try await client.workspaceState())
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    func artifactContent(for artifact: ArtifactRecord) async throws -> String {
        if let cached = artifactContentCache[artifact.id] { return cached }
        let data = try await artifactData(for: artifact)
        guard let content = String(data: data, encoding: .utf8) else {
            throw CooperAPIError.invalidResponse
        }
        artifactContentCache[artifact.id] = content
        return content
    }

    func artifactData(for artifact: ArtifactRecord) async throws -> Data {
        if let cached = artifactDataCache[artifact.id] { return cached }
        let data: Data
        if isPreviewMode {
            if artifact.id == "artifact-delivery-pdf" {
                data = Self.previewPDFData()
            } else if artifact.id == "artifact-delivery-docx" {
                guard let resource = Bundle.main.url(forResource: "Cooper-Word-Brief", withExtension: "docx") else {
                    throw CooperAPIError.invalidResponse
                }
                data = try Data(contentsOf: resource)
            } else if artifact.id == "artifact-delivery-pptx" {
                guard let resource = Bundle.main.url(forResource: "Cooper-PowerPoint-Decision-Deck", withExtension: "pptx") else {
                    throw CooperAPIError.invalidResponse
                }
                data = try Data(contentsOf: resource)
            } else if artifact.id == "artifact-delivery-xlsx" {
                guard let resource = Bundle.main.url(forResource: "Cooper-Excel-Action-Register", withExtension: "xlsx") else {
                    throw CooperAPIError.invalidResponse
                }
                data = try Data(contentsOf: resource)
            } else {
                let content = Self.previewArtifactContent[artifact.id]
                    ?? "No preview content is available for this artifact."
                data = Data(content.utf8)
            }
        } else {
            data = try await client.artifactData(id: artifact.id)
        }
        artifactDataCache[artifact.id] = data
        return data
    }

    func artifactFile(for artifact: ArtifactRecord) async throws -> URL {
        let data = try await artifactData(for: artifact)
        let directory = Self.artifactExportDirectory
            .appendingPathComponent(Self.safeFileComponent(artifact.id), isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let fileName = Self.safeFileComponent(artifact.title).isEmpty
            ? "Cooper-artifact"
            : Self.safeFileComponent(artifact.title)
        let fileExtension = Self.safeFileExtension(artifact.normalizedFileExtension)
        let url = directory
            .appendingPathComponent(fileName)
            .appendingPathExtension(fileExtension)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return url
    }

    func contextPacket(id: String) async throws -> ContextPacketResponse {
        if let cached = contextPacketCache[id] { return cached }
        let response: ContextPacketResponse
        if isPreviewMode {
            let packet = contextPackets.first { $0.id == id }
                ?? ContextPacket(id: id, contextPreview: "No preview context is available for this session.")
            response = ContextPacketResponse(
                packet: packet,
                sessionContext: "# Cooper Session Context Packet\n\n\(packet.contextPreview)"
            )
        } else {
            response = try await client.contextPacket(id: id)
        }
        contextPacketCache[id] = response
        upsert(response.packet)
        return response
    }

    func loadAiresExamples() async {
        guard airesExamples.isEmpty, !isPreviewMode else { return }
        do {
            airesExamples = try await client.airesExamples()
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    func airesExampleHTML(for example: AiresExample) async throws -> String {
        if !example.html.isEmpty { return example.html }
        if let cached = airesExampleHTMLCache[example.id] { return cached }
        let html: String
        if isPreviewMode {
            html = AiresExample.previews.first { $0.id == example.id }?.html
                ?? "<!doctype html><html><body><h1>\(example.title)</h1><p>\(example.description)</p></body></html>"
        } else {
            html = try await client.airesExample(id: example.id).html
        }
        airesExampleHTMLCache[example.id] = html
        return html
    }

    func refreshOperator() async {
        guard !isPreviewMode else { return }
        isRefreshingOperator = true
        defer { isRefreshingOperator = false }
        do {
            applyOperatorState(try await client.operatorState())
            operatorError = nil
        } catch is CancellationError {
            return
        } catch {
            operatorError = error.localizedDescription
        }
    }

    @discardableResult
    func startOperatorTask(
        preset: OperatorPreset,
        goal: String,
        targetURL: String,
        allowedDomains: [String]
    ) async throws -> OperatorTask {
        let task: OperatorTask
        if isPreviewMode {
            let now = ISO8601DateFormatter().string(from: Date())
            task = OperatorTask(
                id: "preview-operator-\(UUID().uuidString.lowercased())",
                title: preset.title,
                goal: goal,
                skill: preset.id,
                targetUrl: targetURL,
                allowedDomains: allowedDomains,
                riskLevel: preset.riskLevel,
                artifactKinds: preset.artifactKinds ?? [],
                templateIds: preset.templateIds ?? [],
                computerIntent: OperatorComputerIntent(
                    mode: preset.isComputerUse ? (preset.id == "computer_use_desktop" ? "desktop" : "browser") : "",
                    target: goal,
                    targetUrl: targetURL,
                    requestedBy: "Cooper iOS"
                ),
                status: "queued",
                steps: Self.previewOperatorSteps(for: preset),
                logs: [OperatorLog(type: "queued", title: "Task queued", detail: "Operator accepted the task from iOS and is waiting for the local runner.", at: now)],
                createdAt: now,
                updatedAt: now,
                progress: 5
            )
        } else {
            task = try await client.startOperatorTask(
                preset: preset,
                goal: goal,
                targetURL: targetURL,
                allowedDomains: allowedDomains
            )
        }
        upsert(task)
        operatorError = nil
        operatorMessage = "\(task.title) is queued in the supervised Operator workspace."
        return task
    }

    func approveOperatorTask(_ task: OperatorTask, approval: OperatorApproval) async {
        do {
            let updated: OperatorTask
            if isPreviewMode {
                var preview = task
                let now = ISO8601DateFormatter().string(from: Date())
                if let index = preview.approvals.firstIndex(where: { $0.id == approval.id }) {
                    preview.approvals[index].status = "approved"
                    preview.approvals[index].resolvedAt = now
                }
                preview.status = "running"
                preview.progress = max(25, preview.progress)
                preview.updatedAt = now
                preview.logs.append(OperatorLog(type: "approval.approved", title: "Approval granted", detail: approval.title, at: now))
                updated = preview
            } else {
                updated = try await client.approveOperatorTask(id: task.id, approvalId: approval.id)
            }
            upsert(updated)
            if !isPreviewMode { await refreshOperator() }
            operatorError = nil
            operatorMessage = "Approved \(approval.title). Operator can continue."
        } catch {
            operatorError = error.localizedDescription
        }
    }

    func cancelOperatorTask(_ task: OperatorTask) async {
        do {
            let updated: OperatorTask
            if isPreviewMode {
                var preview = task
                let now = ISO8601DateFormatter().string(from: Date())
                preview.status = "cancelled"
                preview.stoppedAt = now
                preview.updatedAt = now
                for index in preview.approvals.indices where preview.approvals[index].status == "pending" {
                    preview.approvals[index].status = "cancelled"
                    preview.approvals[index].resolvedAt = now
                }
                preview.logs.append(OperatorLog(type: "cancelled", title: "Task cancelled", detail: "The task was cancelled from Cooper iOS.", at: now))
                updated = preview
            } else {
                updated = try await client.cancelOperatorTask(id: task.id)
            }
            upsert(updated)
            if !isPreviewMode { await refreshOperator() }
            operatorError = nil
            operatorMessage = "\(task.title) was cancelled."
        } catch {
            operatorError = error.localizedDescription
        }
    }

    func stopAllOperatorTasks() async {
        do {
            if isPreviewMode {
                let now = ISO8601DateFormatter().string(from: Date())
                for index in operatorState.tasks.indices where operatorState.tasks[index].isActive {
                    operatorState.tasks[index].status = "stopped"
                    operatorState.tasks[index].stoppedAt = now
                    operatorState.tasks[index].updatedAt = now
                    operatorState.tasks[index].logs.append(
                        OperatorLog(type: "stopped", title: "STOP ALL pressed", detail: "All active local Operator work was stopped from Cooper iOS.", at: now)
                    )
                }
                recalculateOperatorLimits()
            } else {
                let stopped = try await client.stopAllOperatorTasks()
                for task in stopped { upsert(task) }
                await refreshOperator()
            }
            operatorError = nil
            operatorMessage = "All active Operator and Computer Use tasks were stopped."
        } catch {
            operatorError = error.localizedDescription
        }
    }

    @discardableResult
    func queueArtifact(
        callId: String,
        kind: String,
        customPrompt: String = "",
        title: String = "",
        workstream: String = ""
    ) async throws -> ArtifactJob {
        let job: ArtifactJob
        if isPreviewMode {
            let recipe = artifactRecipes.first { $0.kind == kind }
            let now = ISO8601DateFormatter().string(from: Date())
            job = ArtifactJob(
                id: "preview-job-\(UUID().uuidString.lowercased())",
                callId: callId,
                kind: kind,
                title: title.isEmpty ? recipe?.title ?? "Cooper artifact" : title,
                workstream: workstream,
                status: "queued",
                stepCount: recipe?.stepCount ?? 1,
                maxAttempts: 3,
                apiStatus: "queued",
                progress: "Queued for generation.",
                createdAt: now,
                updatedAt: now
            )
        } else {
            job = try await client.queueArtifact(
                callId: callId,
                kind: kind,
                customPrompt: customPrompt,
                title: title,
                workstream: workstream
            )
        }
        merge(job)
        return job
    }

    func retryArtifactJob(_ job: ArtifactJob) async {
        do {
            let replacement: ArtifactJob
            if isPreviewMode {
                replacement = ArtifactJob(
                    id: job.id,
                    callId: job.callId,
                    kind: job.kind,
                    title: job.title,
                    workstream: job.workstream,
                    status: "queued",
                    stepCount: max(1, job.stepCount),
                    attempts: job.attempts,
                    failures: job.failures,
                    maxAttempts: max(3, job.maxAttempts),
                    apiStatus: "queued",
                    progress: "Retry queued.",
                    logs: job.logs,
                    createdAt: job.createdAt,
                    updatedAt: ISO8601DateFormatter().string(from: Date())
                )
            } else {
                replacement = try await client.retryArtifactJob(id: job.id)
            }
            merge(replacement)
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    func createProject(title: String, description: String) async throws {
        if isPreviewMode {
            projects.insert(ProjectRecord(title: title, description: description), at: 0)
            return
        }
        let project = try await client.createProject(title: title, description: description)
        projects.insert(project, at: 0)
    }

    func addProjectSource(projectId: String, title: String, content: String) async throws {
        if isPreviewMode {
            addPreviewProjectSource(
                projectId: projectId,
                title: title,
                sourceType: "paste",
                originalName: "",
                preview: content
            )
            return
        }
        _ = try await client.addProjectSource(projectId: projectId, title: title, content: content)
        try await refreshProject(id: projectId)
    }

    func uploadProjectFile(projectId: String, fileURL: URL) async throws {
        if isPreviewMode {
            addPreviewProjectSource(
                projectId: projectId,
                title: fileURL.lastPathComponent,
                sourceType: fileURL.pathExtension.lowercased() == "pdf" ? "pdf" : "text",
                originalName: fileURL.lastPathComponent,
                preview: "Preview imported project context."
            )
            return
        }
        _ = try await client.uploadProjectFile(projectId: projectId, fileURL: fileURL)
        try await refreshProject(id: projectId)
    }

    func loadLiveSessionContext(for session: SessionRecord) async throws -> LiveSessionContextResponse {
        if isPreviewMode {
            let call = voice.activeCall?.id == session.id ? voice.activeCall ?? session : session
            let project = projects.first { $0.id == call.projectId }
            return previewLiveContext(call: call, project: project)
        }
        return try await client.liveSessionContext(callId: session.id)
    }

    func addLiveContext(
        to session: SessionRecord,
        title: String,
        content: String
    ) async throws -> LiveSessionContextResponse {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            throw CooperAPIError.server(status: 400, message: "Add some context before saving.")
        }
        let sourceTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let (call, project) = try await ensureLiveContextProject(for: session)

        if isPreviewMode {
            addPreviewProjectSource(
                projectId: project.id,
                title: sourceTitle.isEmpty ? "Live call context" : sourceTitle,
                sourceType: "live_call",
                originalName: "",
                preview: text
            )
        } else {
            _ = try await client.addProjectSource(
                projectId: project.id,
                title: sourceTitle.isEmpty ? "Live call context" : sourceTitle,
                content: text,
                sourceType: "live_call"
            )
        }

        return try await completeLiveContextMutation(call: call)
    }

    func uploadLiveContext(
        to session: SessionRecord,
        fileURL: URL
    ) async throws -> LiveSessionContextResponse {
        let (call, project) = try await ensureLiveContextProject(for: session)
        if isPreviewMode {
            addPreviewProjectSource(
                projectId: project.id,
                title: fileURL.lastPathComponent,
                sourceType: fileURL.pathExtension.lowercased() == "pdf" ? "pdf" : "text",
                originalName: fileURL.lastPathComponent,
                preview: "Preview context imported during the active Cooper session."
            )
        } else {
            _ = try await client.uploadProjectFile(projectId: project.id, fileURL: fileURL)
        }
        return try await completeLiveContextMutation(call: call)
    }

    func searchContextSources(
        provider: ContextProvider,
        query: String,
        databaseId: String = ""
    ) async throws -> ContextSearchResponse {
        try await client.searchContextSources(
            provider: provider,
            query: query,
            type: provider == .notion ? (databaseId.isEmpty ? "database" : "page") : "all",
            databaseId: databaseId,
            limit: provider == .notion ? -1 : 50
        )
    }

    func createContextAndLaunch(
        seed: ContextCheckpointSeed,
        intent: String,
        sources: [ContextSource],
        files: [URL] = [],
        preparationKinds: [String] = [],
        launchMode: SessionLaunchMode = .voice
    ) async throws {
        let packet: ContextPacket
        let sessionContext: String
        var resumePacket: SessionResumePacket?

        if isPreviewMode {
            let previewFiles = files.map { file in
                ContextSource(
                    id: file.lastPathComponent,
                    provider: "file",
                    type: "file",
                    title: file.lastPathComponent,
                    meta: "Preview upload"
                )
            }
            packet = ContextPacket(
                id: "preview-context-packet",
                intent: intent,
                sources: sources + previewFiles,
                sourceCount: sources.count + previewFiles.count,
                contextPreview: "Preview evidence packet with \(sources.count + previewFiles.count) selected sources."
            )
            sessionContext = "# Evidence packet\n\n\(packet.contextPreview)"
        } else {
            var response = try await client.createContextPacket(
                focus: seed.focus,
                intent: intent,
                sources: sources
            )
            for file in files {
                response = try await client.uploadContextFile(packetId: response.packet.id, fileURL: file)
            }
            let unresolved = response.packet.sources.filter { $0.resolutionStatus != "completed" }
            if !unresolved.isEmpty {
                throw CooperAPIError.server(
                    status: 422,
                    message: "Cooper could not load \(unresolved.map(\.title).joined(separator: ", ")). Remove the source or reconnect its provider before starting."
                )
            }
            packet = response.packet
            sessionContext = response.sessionContext
            if let session = seed.resumedSession {
                resumePacket = try await client.resumeCall(id: session.id).resumePacket
            }
        }
        upsert(packet)
        contextPacketCache[packet.id] = ContextPacketResponse(packet: packet, sessionContext: sessionContext)

        let title: String
        if let session = seed.resumedSession {
            title = "Continue: \(session.title)"
        } else if let focus = seed.focus {
            title = "Cooper session: \(focus.title)"
        } else {
            title = "Cooper session"
        }

        var precreatedCall: SessionRecord?
        let selectedOptions = SessionPreparationOption.all.filter { preparationKinds.contains($0.kind) }
        if !selectedOptions.isEmpty || launchMode == .chat {
            if isPreviewMode {
                precreatedCall = SessionRecord(
                    id: "preview-prepared-\(UUID().uuidString.lowercased())",
                    title: title,
                    status: "active",
                    startedAt: ISO8601DateFormatter().string(from: Date()),
                    projectId: seed.focus?.type == "project" ? seed.focus?.targetId ?? "" : "",
                    contextPacketId: packet.id,
                    contextSourceCount: packet.sourceCount
                )
            } else {
                precreatedCall = try await client.createCall(
                    title: title,
                    projectId: seed.focus?.type == "project" ? seed.focus?.targetId ?? "" : "",
                    resumedFromCallId: seed.resumedSession?.id ?? "",
                    contextPacketId: packet.id
                )
            }

            if let call = precreatedCall {
                var preparationFailures: [String] = []
                for option in selectedOptions {
                    let prompt = Self.preparationPrompt(
                        option: option,
                        title: title,
                        intent: intent,
                        sessionContext: sessionContext
                    )
                    do {
                        try await queueArtifact(
                            callId: call.id,
                            kind: option.kind,
                            customPrompt: prompt,
                            title: option.title,
                            workstream: "session_preparation"
                        )
                    } catch {
                        preparationFailures.append("\(option.title): \(error.localizedDescription)")
                    }
                }
                if !preparationFailures.isEmpty {
                    actionMessage = "The session is ready, but some preparation jobs could not be queued: \(preparationFailures.joined(separator: " "))"
                }
            }
        }

        let nextSessionSeed = VoiceSessionSeed(
            focus: seed.focus,
            resumedFromCallId: seed.resumedSession?.id ?? "",
            contextPacketId: packet.id,
            resumePacket: resumePacket,
            title: title,
            precreatedCall: precreatedCall,
            contextPacket: packet,
            sessionContext: sessionContext,
            dailyBrief: seed.dailyBrief
        )
        contextSeed = nil
        try? await Task.sleep(for: .milliseconds(250))
        if launchMode == .chat {
            chatSeed = nextSessionSeed
        } else {
            voiceSeed = nextSessionSeed
        }
    }

    func prepareChatSession(_ seed: VoiceSessionSeed) async throws -> SessionRecord {
        if let call = seed.precreatedCall { return call }
        if isPreviewMode {
            return SessionRecord(
                id: "preview-chat-\(UUID().uuidString.lowercased())",
                title: seed.title.isEmpty ? seed.focus?.title ?? "Cooper session" : seed.title,
                status: "active",
                startedAt: ISO8601DateFormatter().string(from: Date()),
                projectId: seed.focus?.type == "project" ? seed.focus?.targetId ?? "" : "",
                transcript: [],
                contextPacketId: seed.contextPacketId
            )
        }
        return try await client.createCall(
            title: seed.title.isEmpty ? seed.focus?.title ?? "Cooper session" : seed.title,
            projectId: seed.focus?.type == "project" ? seed.focus?.targetId ?? "" : "",
            resumedFromCallId: seed.resumedFromCallId,
            contextPacketId: seed.contextPacketId
        )
    }

    func sessionChatEvents(
        callId: String,
        message: String,
        messageId: String
    ) async throws -> AsyncThrowingStream<SessionChatEvent, Error> {
        try await client.chatEvents(callId: callId, message: message, messageId: messageId)
    }

    func refreshSessionWork() async {
        guard !isPreviewMode else { return }
        do { sessions = try await client.calls().calls } catch { handleRefreshError(error, label: "Sessions") }
        do { apply(try await client.workspaceState()) } catch { handleRefreshError(error, label: "Workspace") }
    }

    func endChatSession(_ call: SessionRecord, startedAt: Date?) async {
        if !isPreviewMode {
            let duration = startedAt.map { max(0, Int(Date().timeIntervalSince($0))) } ?? call.durationSeconds
            do {
                _ = try await client.endTextCall(callId: call.id, durationSeconds: duration)
                await refreshSessionWork()
            } catch {
                actionMessage = "The chat session could not be ended on the Cooper host: \(error.localizedDescription)"
            }
        }
        chatSeed = nil
    }

    func handoffChatToVoice(seed: VoiceSessionSeed, call: SessionRecord) async {
        let latestCall = if isPreviewMode {
            call
        } else {
            (try? await client.call(id: call.id)) ?? call
        }
        chatSeed = nil
        try? await Task.sleep(for: .milliseconds(250))
        voiceSeed = VoiceSessionSeed(
            focus: seed.focus,
            resumedFromCallId: seed.resumedFromCallId,
            contextPacketId: seed.contextPacketId,
            resumePacket: seed.resumePacket,
            title: seed.title,
            precreatedCall: latestCall,
            contextPacket: seed.contextPacket,
            sessionContext: seed.sessionContext,
            dailyBrief: seed.dailyBrief
        )
    }

    func handoffVoiceToChat(seed: VoiceSessionSeed) async {
        guard var call = voice.activeCall else { return }
        call.transcript = voice.transcript
        if !isPreviewMode {
            let duration = voice.startedAt.map { max(0, Int(Date().timeIntervalSince($0))) } ?? call.durationSeconds
            call = (try? await client.updateActiveCall(
                callId: call.id,
                transcript: voice.transcript,
                durationSeconds: duration,
                realtimeUsage: voice.usage
            )) ?? call
        }
        voice.stop()
        voiceSeed = nil
        try? await Task.sleep(for: .milliseconds(250))
        chatSeed = VoiceSessionSeed(
            focus: seed.focus,
            resumedFromCallId: seed.resumedFromCallId,
            contextPacketId: seed.contextPacketId,
            resumePacket: seed.resumePacket,
            title: seed.title,
            precreatedCall: call,
            contextPacket: seed.contextPacket,
            sessionContext: seed.sessionContext,
            dailyBrief: seed.dailyBrief
        )
    }

    func startVoiceSession(_ seed: VoiceSessionSeed) async {
        guard voice.state == .idle || voice.state == .ended || voice.state == .failed else { return }
        if isPreviewMode {
            voice.startPreview(seed: seed)
            return
        }
        guard let serverURL else {
            voice.fail(CooperAPIError.invalidServerURL.localizedDescription)
            return
        }

        do {
            var resumePacket = seed.resumePacket
            if !seed.resumedFromCallId.isEmpty, resumePacket == nil {
                let continuity = try await client.resumeCall(id: seed.resumedFromCallId)
                resumePacket = continuity.resumePacket
            }
            let call = if let precreatedCall = seed.precreatedCall {
                precreatedCall
            } else {
                try await client.createCall(
                    title: seed.title.isEmpty ? seed.focus?.title ?? "Cooper session" : seed.title,
                    projectId: seed.focus?.type == "project" ? seed.focus?.targetId ?? "" : "",
                    resumedFromCallId: seed.resumedFromCallId,
                    contextPacketId: seed.contextPacketId
                )
            }
            voice.onTranscript = { [weak self] entry in
                guard let self, let callId = self.voice.activeCall?.id else { return }
                Task {
                    try? await self.client.appendTranscript(callId: callId, entry: entry)
                }
            }
            voice.onFunctionCall = { [weak self] functionCall in
                Task { await self?.executeVoiceTool(functionCall) }
            }
            await voice.start(serverURL: serverURL, call: call, resumePacket: resumePacket)
        } catch {
            voice.fail(error.localizedDescription)
        }
    }

    func endVoiceSession() async {
        let call = voice.activeCall
        let transcript = voice.transcript
        let realtimeUsage = voice.usage
        let duration = voice.startedAt.map { max(0, Int(Date().timeIntervalSince($0))) } ?? 0
        voice.stop()

        if !isPreviewMode, let callId = call?.id {
            do {
                _ = try await client.endCall(
                    callId: callId,
                    transcript: transcript,
                    durationSeconds: duration,
                    realtimeUsage: realtimeUsage
                )
                sessions = try await client.calls().calls
            } catch {
                actionMessage = "The voice session ended locally, but its final server save failed: \(error.localizedDescription)"
            }
        }
        voiceSeed = nil
    }

    private func executeVoiceTool(_ functionCall: VoiceFunctionCall) async {
        let arguments: JSONValue
        if let data = functionCall.arguments.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(JSONValue.self, from: data) {
            arguments = decoded
        } else {
            arguments = .emptyObject
        }

        guard let callId = voice.activeCall?.id else { return }
        do {
            let output = try await client.executeTool(
                name: functionCall.name,
                callId: callId,
                arguments: arguments
            )
            voice.completeFunctionCall(functionCall, output: output)
        } catch {
            voice.completeFunctionCall(
                functionCall,
                output: .object([
                    "status": .string("error"),
                    "tool": .string(functionCall.name),
                    "message": .string(error.localizedDescription)
                ])
            )
        }
    }

    func beginConnection(for service: ArcadeService) async -> URL? {
        guard !isPreviewMode else {
            actionMessage = "Preview mode does not start external authorization."
            return nil
        }
        do {
            let result = try await client.connectArcade(service: service.service)
            guard let url = URL(string: result.authorization.authorizationUrl), !result.authorization.authorizationUrl.isEmpty else {
                actionMessage = "Arcade did not return an authorization URL for \(service.service)."
                return nil
            }
            actionMessage = "Finish connecting \(service.service) in the browser, then refresh status."
            return url
        } catch {
            actionMessage = error.localizedDescription
            return nil
        }
    }

    func beginAuthorization(for tool: ArcadeTool) async -> URL? {
        guard !isPreviewMode else {
            actionMessage = "Preview mode does not start external authorization."
            return nil
        }
        do {
            let result = try await client.authorizeArcade(tool: tool.name)
            if let updated = result.arcade { arcade = updated }
            let address = result.authorization.authorizationUrl
            guard let url = URL(string: address), !address.isEmpty else {
                actionMessage = "Arcade started authorization, but no browser URL was returned. Refresh its status."
                return nil
            }
            actionMessage = "Finish authorizing \(tool.label) in the browser, then check its status."
            return url
        } catch {
            actionMessage = error.localizedDescription
            return nil
        }
    }

    func prepareAllArcadeAuthorizations() async -> [ArcadeAuthorizationResult] {
        guard !isPreviewMode else {
            actionMessage = "Preview mode does not start external authorization."
            return []
        }
        do {
            let result = try await client.authorizeAllArcadeTools()
            if let updated = result.arcade { arcade = updated }
            let ready = result.results.filter { $0.ok && !($0.authorization?.authorizationUrl.isEmpty ?? true) }
            let failedCount = result.results.filter { !$0.ok }.count
            let completedCount = result.results.filter {
                $0.ok && ["active", "completed", "authorized"].contains($0.authorization?.status ?? "")
            }.count

            if !ready.isEmpty {
                actionMessage = "\(ready.count) Arcade authorization link\(ready.count == 1 ? " is" : "s are") ready below. Open each link, then refresh Connections."
            } else if failedCount > 0 {
                actionMessage = "\(failedCount) mapped Arcade tool authorization\(failedCount == 1 ? "" : "s") could not be started."
            } else {
                let count = completedCount > 0 ? completedCount : result.results.count
                actionMessage = "\(count) mapped Arcade tool\(count == 1 ? " is" : "s are") already authorized."
            }
            return ready
        } catch {
            actionMessage = error.localizedDescription
            return []
        }
    }

    func checkAuthorization(for tool: ArcadeTool) async {
        guard !isPreviewMode else { return }
        do {
            let result = try await client.checkArcade(tool: tool.name)
            if let updated = result.arcade { arcade = updated }
            actionMessage = result.authorization.status == "completed"
                ? "\(tool.label) is connected."
                : "\(tool.label) status: \(result.authorization.status.replacingOccurrences(of: "_", with: " "))."
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    private func loadPreviewData() {
        isPreviewMode = true
        today = .preview
        dailyBrief = .preview
        sessions = SessionRecord.previews
        projects = ProjectRecord.previews
        contextPackets = ContextPacket.previews
        artifacts = ArtifactRecord.previews
        artifactJobs = ArtifactJob.previews
        toolCalls = [
            ToolCallRecord(
                id: "tool-call-preview",
                callId: "session-1",
                toolName: "search_notion_workspace",
                arcadeToolName: "NotionToolkit.SearchByTitle",
                riskLevel: "read",
                status: "completed",
                resultSummary: "Returned the approved iOS parity sources.",
                durationMs: 684,
                createdAt: "2026-07-14T18:04:00Z",
                updatedAt: "2026-07-14T18:04:01Z"
            )
        ]
        artifactRecipes = ArtifactRecipe.previews
        airesExamples = AiresExample.previews
        operatorState = .preview
        arcade = .preview
        arcadeDiscovery = .preview
        mobilePush = .preview
        deviceReadiness = .preview
        notificationAuthorization = .authorized
        notificationsEnabled = true
        isRemotePushRegistered = false
        phase = .ready
        if ProcessInfo.processInfo.arguments.contains("--open-preview-live-context"),
           var session = sessions.first {
            session.status = "active"
            if let project = projects.first {
                session.projectId = project.id
                session.projectTitle = project.title
            }
            let seed = VoiceSessionSeed(
                title: session.title,
                precreatedCall: session,
                contextPacket: contextPackets.first { $0.id == session.contextPacketId },
                sessionContext: contextPackets.first { $0.id == session.contextPacketId }?.contextPreview ?? ""
            )
            voice.startPreview(seed: seed)
            previewLiveCanvasSession = session
        }
        if ProcessInfo.processInfo.arguments.contains("--open-preview-chat"),
           var session = sessions.first {
            session.status = "active"
            chatSeed = VoiceSessionSeed(
                title: session.title,
                precreatedCall: session,
                contextPacket: contextPackets.first { $0.id == session.contextPacketId },
                sessionContext: contextPackets.first { $0.id == session.contextPacketId }?.contextPreview ?? ""
            )
        }
        if ProcessInfo.processInfo.arguments.contains("--open-daily-brief-context") {
            presentDailyBrief(.preview)
        }
        if ProcessInfo.processInfo.arguments.contains("--open-operator-approval") {
            pendingRoute = .operatorTask(taskID: "operator-browser-approval", approvalID: "approval-browser")
        } else if ProcessInfo.processInfo.arguments.contains("--open-preview-artifact") {
            pendingRoute = .artifact("artifact-context-brief")
        } else if ProcessInfo.processInfo.arguments.contains("--open-preview-document") {
            pendingRoute = .artifact("artifact-delivery-docx")
        } else if ProcessInfo.processInfo.arguments.contains("--open-preview-presentation") {
            pendingRoute = .artifact("artifact-delivery-pptx")
        } else if ProcessInfo.processInfo.arguments.contains("--open-preview-workbook") {
            pendingRoute = .artifact("artifact-delivery-xlsx")
        } else if ProcessInfo.processInfo.arguments.contains("--open-preview-session") {
            pendingRoute = .session("session-1")
        } else if ProcessInfo.processInfo.arguments.contains("--open-daily-brief-route") {
            pendingRoute = .dailyBrief
        } else if ProcessInfo.processInfo.arguments.contains("--open-settings-route") {
            pendingRoute = .settings
        }
        if ProcessInfo.processInfo.arguments.contains("--preview-notification") {
            scheduleNotification(
                identifier: "preview-operator-approval",
                title: "Operator approval required",
                body: "Computer Use is paused before opening the supervised browser.",
                route: .operatorTask(taskID: "operator-browser-approval", approvalID: "approval-browser"),
                delay: 1
            )
        }
    }

    private func refreshProject(id: String) async throws {
        let updated = try await client.projectContext(id: id).project
        upsert(updated)
    }

    private func ensureLiveContextProject(
        for session: SessionRecord
    ) async throws -> (SessionRecord, ProjectRecord) {
        var call = voice.activeCall?.id == session.id ? voice.activeCall ?? session : session

        if !call.projectId.isEmpty {
            if let project = projects.first(where: { $0.id == call.projectId }) {
                return (call, project)
            }
            if isPreviewMode {
                let project = ProjectRecord(
                    id: call.projectId,
                    title: call.projectTitle.isEmpty ? "Live Cooper context" : call.projectTitle,
                    description: "Context added during an active Cooper session."
                )
                upsert(project)
                return (call, project)
            }
            let project = try await client.projectContext(id: call.projectId).project
            upsert(project)
            return (call, project)
        }

        let project: ProjectRecord
        if isPreviewMode {
            project = ProjectRecord(
                id: "preview-live-context-\(call.id)",
                title: "Live Cooper context",
                description: "Context added during an active Cooper session.",
                createdAt: ISO8601DateFormatter().string(from: Date()),
                updatedAt: ISO8601DateFormatter().string(from: Date())
            )
            call.projectId = project.id
            call.projectTitle = project.title
        } else {
            project = try await client.createProject(
                title: "Live Cooper context",
                description: "Context added during an active Cooper session."
            )
            call = try await client.attachProject(callId: call.id, projectId: project.id)
        }
        upsert(project)
        upsert(call)
        return (call, project)
    }

    private func completeLiveContextMutation(
        call: SessionRecord
    ) async throws -> LiveSessionContextResponse {
        let response: LiveSessionContextResponse
        if isPreviewMode {
            let currentCall = voice.activeCall?.id == call.id ? voice.activeCall ?? call : call
            response = previewLiveContext(
                call: currentCall,
                project: projects.first { $0.id == currentCall.projectId }
            )
        } else {
            response = try await client.liveSessionContext(callId: call.id)
        }
        if let project = response.project { upsert(project) }
        upsert(response.call)
        if voice.activeCall?.id == response.call.id {
            voice.updateRealtimeSession(response.realtimeSession)
        }
        actionMessage = "Live context is attached to \(response.call.title) and available to Cooper now."
        return response
    }

    private func previewLiveContext(
        call: SessionRecord,
        project: ProjectRecord?
    ) -> LiveSessionContextResponse {
        let projectContext = project.map { project in
            let sourceText = project.sources.map { source in
                "## Source: \(source.title)\n\(source.preview)"
            }.joined(separator: "\n\n")
            return "# Active Project Context\n\nProject: \(project.title)\nSources loaded: \(project.sourceCount)\n\n\(sourceText)"
        } ?? ""
        let packetContext = contextPacketCache[call.contextPacketId]?.sessionContext ?? ""
        let sections = [projectContext, packetContext].filter { !$0.isEmpty }
        let sessionContext = sections.isEmpty
            ? ""
            : "# Cooper Loaded Session Context\n\nThe following evidence is already loaded into this Realtime session.\n\n\(sections.joined(separator: "\n\n"))"
        return LiveSessionContextResponse(
            call: call,
            project: project,
            projectContext: projectContext,
            sessionContext: sessionContext,
            realtimeSession: .object([
                "type": .string("realtime"),
                "instructions": .string(sessionContext)
            ])
        )
    }

    private func apply(_ workspace: ProjectStateResponse) {
        let previousJobs = artifactJobs
        let shouldNotify = hasLoadedWorkspaceNotificationBaseline
        projects = workspace.projects
        contextPackets = workspace.contextPackets
        artifacts = workspace.artifacts
        artifactJobs = workspace.jobs
        toolCalls = workspace.toolCalls
        artifactRecipes = workspace.recipes
        if shouldNotify {
            notifyWorkspaceTransitions(from: previousJobs, to: workspace.jobs, artifacts: workspace.artifacts)
        }
        hasLoadedWorkspaceNotificationBaseline = true
    }

    private func applyOperatorState(_ nextState: OperatorStateResponse) {
        let previousTasks = operatorState.tasks
        let shouldNotify = hasLoadedOperatorNotificationBaseline
        operatorState = nextState
        if shouldNotify {
            notifyOperatorTransitions(from: previousTasks, to: nextState.tasks)
        }
        hasLoadedOperatorNotificationBaseline = true
    }

    private func notifyOperatorTransitions(from previous: [OperatorTask], to current: [OperatorTask]) {
        for alert in CooperNotificationPlanner.operatorAlerts(from: previous, to: current) {
            scheduleNotification(
                identifier: alert.id,
                title: alert.title,
                body: alert.body,
                route: alert.route
            )
        }
    }

    private func notifyWorkspaceTransitions(
        from previous: [ArtifactJob],
        to current: [ArtifactJob],
        artifacts: [ArtifactRecord]
    ) {
        for alert in CooperNotificationPlanner.artifactAlerts(
            from: previous,
            to: current,
            artifacts: artifacts
        ) {
            scheduleNotification(
                identifier: alert.id,
                title: alert.title,
                body: alert.body,
                route: alert.route
            )
        }
    }

    private func scheduleNotification(
        identifier: String,
        title: String,
        body: String,
        route: CooperRoute,
        delay: TimeInterval = 0
    ) {
        guard notificationsEnabled,
              notificationAuthorization == .authorized,
              !isRemotePushRegistered else { return }
        Task {
            await CooperNotifications.schedule(
                identifier: identifier,
                title: title,
                body: body,
                route: route,
                delay: delay
            )
        }
    }

    private func resetNotificationBaselines() {
        hasLoadedOperatorNotificationBaseline = false
        hasLoadedWorkspaceNotificationBaseline = false
    }

    private func clearArtifactCache() {
        artifactContentCache.removeAll()
        artifactDataCache.removeAll()
        try? FileManager.default.removeItem(at: Self.artifactExportDirectory)
    }

    private static var artifactExportDirectory: URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("CooperArtifactExports", isDirectory: true)
    }

    private static func safeFileComponent(_ value: String) -> String {
        let words = value
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
        return String(words.joined(separator: "-").prefix(80))
    }

    private static func safeFileExtension(_ value: String) -> String {
        let clean = value.filter { $0.isLetter || $0.isNumber }
        return clean.isEmpty ? "data" : clean.lowercased()
    }

    private func upsert(_ packet: ContextPacket) {
        if let index = contextPackets.firstIndex(where: { $0.id == packet.id }) {
            contextPackets[index] = packet
        } else {
            contextPackets.insert(packet, at: 0)
        }
    }

    private func upsert(_ project: ProjectRecord) {
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        } else {
            projects.insert(project, at: 0)
        }
    }

    private func upsert(_ session: SessionRecord) {
        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[index] = session
        } else {
            sessions.insert(session, at: 0)
        }
        if voice.activeCall?.id == session.id {
            voice.activeCall = session
        }
    }

    private func merge(_ job: ArtifactJob) {
        if let index = artifactJobs.firstIndex(where: { $0.id == job.id }) {
            artifactJobs[index] = job
        } else {
            artifactJobs.insert(job, at: 0)
        }
    }

    private func upsert(_ task: OperatorTask) {
        if let index = operatorState.tasks.firstIndex(where: { $0.id == task.id }) {
            operatorState.tasks[index] = task
        } else {
            operatorState.tasks.insert(task, at: 0)
        }
        operatorState.activeTask = operatorState.tasks.first(where: \.isActive)
        recalculateOperatorLimits()
    }

    private func recalculateOperatorLimits() {
        operatorState.limits.activeTasks = operatorState.tasks.filter(\.isActive).count
        operatorState.limits.approvalQueue = operatorState.tasks.reduce(0) { partial, task in
            partial + task.pendingApprovals.count
        }
        operatorState.activeTask = operatorState.tasks.first(where: \.isActive)
    }

    private static func previewOperatorSteps(for preset: OperatorPreset) -> [String] {
        if preset.isComputerUse {
            return [
                "Confirm the visible supervised runtime and allow-listed targets.",
                "Capture the current UI state and propose the next action.",
                "Pause before sensitive, write, or external actions.",
                "Return the replayable trace and final state."
            ]
        }
        return [
            "Capture the outcome and available source context.",
            "Prepare the local runtime and shared work queue.",
            "Run the supervised task within budget and approval gates.",
            "Return artifacts, checkpoints, and next actions."
        ]
    }

    private static func preparationPrompt(
        option: SessionPreparationOption,
        title: String,
        intent: String,
        sessionContext: String
    ) -> String {
        let goal = intent.trimmingCharacters(in: .whitespacesAndNewlines)
        let boundedContext = sessionContext.trimmingCharacters(in: .whitespacesAndNewlines)
        return """
        Prepare this artifact before the live Cooper session begins.

        Session: \(title)
        Session goal: \(goal.isEmpty ? "Clarify the outcome with the user during the session." : goal)

        \(option.instruction)

        Use only the bounded session context below. Clearly label missing evidence rather than inventing it.

        \(boundedContext.isEmpty ? "No source content was selected. Produce a gap-aware outline for the live session." : boundedContext)
        """
    }

    private static let previewArtifactContent: [String: String] = [
        "artifact-decision-map": """
        # Mobile parity decision map

        ```mermaid
        flowchart TD
          Context[Bounded context] --> Prep[Preparation jobs]
          Prep --> Voice[Live voice session]
          Voice --> Memory[Saved session memory]
          Memory --> Library[Artifact library]
        ```

        The native reader keeps Mermaid source readable until diagram rendering is added.
        """,
        "artifact-context-brief": """
        <!doctype html><html><head><style>body{font-family:-apple-system;padding:24px;color:#171815;background:#f7f7f2}h1{font-size:28px}section{background:white;border:1px solid #d9d9cf;border-radius:12px;padding:18px;margin:14px 0}</style></head><body><h1>Shared context brief</h1><section><h2>Known</h2><p>The connected session foundation is running across Calendar, Notion, Arcade, saved sessions, projects, and bounded context.</p></section><section><h2>Decision</h2><p>Preparation jobs remain attached to the same durable session used for live voice.</p></section><script>document.body.dataset.scriptExecuted='true'</script></body></html>
        """,
        "artifact-qa": """
        # Connected foundation QA checklist

        - [x] Calendar and Notion load into Today
        - [x] Context packets reject unresolved sources
        - [x] Voice sessions persist transcript and usage
        - [ ] Verify authenticated microphone and speaker audio on a credentialed host
        """
    ]

    private static func previewPDFData() -> Data {
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        return UIGraphicsPDFRenderer(bounds: page).pdfData { renderer in
            renderer.beginPage()
            UIColor(red: 0.97, green: 0.97, blue: 0.94, alpha: 1).setFill()
            renderer.cgContext.fill(page)
            UIColor(red: 0.98, green: 0.88, blue: 0.15, alpha: 1).setFill()
            renderer.cgContext.fill(CGRect(x: 48, y: 48, width: 56, height: 8))

            let title = NSAttributedString(
                string: "Cooper delivery brief",
                attributes: [
                    .font: UIFont.systemFont(ofSize: 34, weight: .bold),
                    .foregroundColor: UIColor(red: 0.10, green: 0.10, blue: 0.09, alpha: 1)
                ]
            )
            title.draw(in: CGRect(x: 48, y: 82, width: 516, height: 54))

            let body = NSAttributedString(
                string: "Native document delivery\n\n• Binary-safe host transport\n• Sandboxed, named file export\n• Quick Look for PDF and Office formats\n• Existing script-disabled HTML boundary preserved\n\nGenerated as Simulator-only evidence for the iOS delivery milestone.",
                attributes: [
                    .font: UIFont.systemFont(ofSize: 18, weight: .regular),
                    .foregroundColor: UIColor(red: 0.25, green: 0.25, blue: 0.23, alpha: 1),
                    .paragraphStyle: {
                        let style = NSMutableParagraphStyle()
                        style.lineSpacing = 7
                        return style
                    }()
                ]
            )
            body.draw(in: CGRect(x: 48, y: 162, width: 516, height: 420))
        }
    }

    private func addPreviewProjectSource(
        projectId: String,
        title: String,
        sourceType: String,
        originalName: String,
        preview: String
    ) {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        let source = ProjectSourceRecord(
            projectId: projectId,
            title: title,
            sourceType: sourceType,
            originalName: originalName,
            charCount: preview.count,
            storedCharCount: preview.count,
            preview: preview
        )
        projects[index].sources.insert(source, at: 0)
        projects[index].sourceCount = projects[index].sources.count
        projects[index].totalChars += preview.count
        projects[index].updatedAt = ISO8601DateFormatter().string(from: Date())
    }

    private func handleRefreshError(_ error: Error, label: String) {
        if case CooperAPIError.unauthorized = error {
            phase = .signedOut
        }
        lastRefreshErrors.append("\(label): \(error.localizedDescription)")
    }

    private static func normalizedURL(_ address: String) -> URL? {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              components.host != nil else {
            return nil
        }
        components.path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return components.url
    }
}
