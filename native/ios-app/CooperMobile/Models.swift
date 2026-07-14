import Foundation

struct AuthResponse: Decodable, Sendable {
    let authenticated: Bool
}

enum CooperWakePhrase {
    private static let mentionPattern = #"\bcooper\b"#
    private static let negatedPattern = #"\b(let'?s|let\s+s)\s+not\s+ask\s+cooper\b|\b(do\s+not|don't|dont|not)\s+(ask|call|wake|invite)\s+cooper\b|\bnot\s+cooper\b|\bcooper\s+should\s+(not|never)\b|\bcooper\s+(do\s+not|don't|dont|never)\b"#

    static func matches(_ value: String) -> Bool {
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: #"[’‘`]"#, with: "'", options: .regularExpression)
            .replacingOccurrences(of: #"[^\w\s']"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard normalized.range(of: mentionPattern, options: .regularExpression) != nil else { return false }
        return normalized.range(of: negatedPattern, options: .regularExpression) == nil
    }
}

enum CooperRoute: Hashable, Sendable {
    case today
    case dailyBrief
    case sessions
    case session(String)
    case projects
    case project(String)
    case operatorWorkspace
    case operatorTask(taskID: String, approvalID: String?)
    case library
    case artifact(String)
    case connections
    case settings

    init?(url: URL) {
        guard url.scheme?.lowercased() == "cooper" else { return nil }
        let host = url.host?.lowercased() ?? ""
        let parts = url.pathComponents
            .filter { $0 != "/" }
            .map { $0.removingPercentEncoding ?? $0 }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let approvalID = query.first { $0.name == "approval" }?.value

        switch host {
        case "today":
            self = parts.first == "daily-brief" ? .dailyBrief : .today
        case "sessions":
            self = parts.first.map(CooperRoute.session) ?? .sessions
        case "projects":
            self = parts.first.map(CooperRoute.project) ?? .projects
        case "operator":
            let taskID = parts.first == "tasks" ? parts.dropFirst().first : parts.first
            self = taskID.map { .operatorTask(taskID: $0, approvalID: approvalID) } ?? .operatorWorkspace
        case "library":
            let artifactID = parts.first == "artifacts" ? parts.dropFirst().first : nil
            self = artifactID.map(CooperRoute.artifact) ?? .library
        case "connections":
            self = .connections
        case "settings":
            self = .settings
        default:
            return nil
        }
    }

    init?(universalURL url: URL) {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        let parts = url.pathComponents
            .filter { $0 != "/" }
            .map { $0.removingPercentEncoding ?? $0 }
        guard parts.first?.lowercased() == "open", parts.count >= 2 else { return nil }
        var components = URLComponents()
        components.scheme = "cooper"
        components.host = parts[1]
        if parts.count > 2 {
            components.path = "/" + parts.dropFirst(2).joined(separator: "/")
        }
        components.queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        guard let cooperURL = components.url else { return nil }
        self.init(url: cooperURL)
    }

    var url: URL {
        var components = URLComponents()
        components.scheme = "cooper"
        switch self {
        case .today:
            components.host = "today"
        case .dailyBrief:
            components.host = "today"
            components.path = "/daily-brief"
        case .sessions:
            components.host = "sessions"
        case .session(let id):
            components.host = "sessions"
            components.path = "/\(id)"
        case .projects:
            components.host = "projects"
        case .project(let id):
            components.host = "projects"
            components.path = "/\(id)"
        case .operatorWorkspace:
            components.host = "operator"
        case .operatorTask(let taskID, let approvalID):
            components.host = "operator"
            components.path = "/tasks/\(taskID)"
            if let approvalID, !approvalID.isEmpty {
                components.queryItems = [URLQueryItem(name: "approval", value: approvalID)]
            }
        case .library:
            components.host = "library"
        case .artifact(let id):
            components.host = "library"
            components.path = "/artifacts/\(id)"
        case .connections:
            components.host = "connections"
        case .settings:
            components.host = "settings"
        }
        return components.url ?? URL(string: "cooper://today")!
    }
}

struct MobilePushStatusResponse: Decodable, Sendable {
    var mobilePush = MobilePushStatus()
}

struct MobileDeviceReadinessResponse: Decodable, Sendable {
    var readiness = MobileDeviceReadiness()
}

struct MobileDeviceReadiness: Decodable, Hashable, Sendable {
    var generatedAt = ""
    var host = MobileHostReadiness()
    var apns = MobilePushStatus()
    var universalLinks = MobileUniversalLinkReadiness()
    var meetings = MobileMeetingReadiness()

    static let preview = MobileDeviceReadiness(
        generatedAt: "2026-07-14T18:00:00Z",
        host: MobileHostReadiness(authenticated: true, openAIConfigured: true),
        apns: .preview,
        universalLinks: MobileUniversalLinkReadiness(
            hostAssociationConfigured: true,
            associatedAppId: "TEAMID.ai.aires.cooper.mobile"
        ),
        meetings: MobileMeetingReadiness(
            calendarHandoffMode: "external_url",
            webZoomSDKConfigured: true,
            hostRoleEnabled: false,
            nativeEmbeddedSDKConfigured: false
        )
    )
}

struct MobileHostReadiness: Decodable, Hashable, Sendable {
    var authenticated = false
    var openAIConfigured = false
}

struct MobileUniversalLinkReadiness: Decodable, Hashable, Sendable {
    var hostAssociationConfigured = false
    var associatedAppId = ""
}

struct MobileMeetingReadiness: Decodable, Hashable, Sendable {
    var calendarHandoffMode = "external_url"
    var webZoomSDKConfigured = false
    var hostRoleEnabled = false
    var nativeEmbeddedSDKConfigured = false
}

struct MobilePushStatus: Decodable, Hashable, Sendable {
    var configured = false
    var environment = "sandbox"
    var bundleId = "ai.aires.cooper.mobile"
    var missing: [String] = []
    var associatedAppId = ""
    var registeredDevices = 0
    var pendingEvents = 0
    var lastEvent: MobilePushEventSummary?

    var providerLabel: String { configured ? "APNs \(environment)" : "Local fallback" }
    static let preview = MobilePushStatus(
        configured: true,
        environment: "sandbox",
        associatedAppId: "TEAMID.ai.aires.cooper.mobile",
        registeredDevices: 1,
        lastEvent: MobilePushEventSummary(
            id: "operator-approval-1",
            kind: "operator_approval",
            title: "Operator approval required",
            route: "cooper://operator/tasks/operator-browser-approval?approval=approval-browser",
            status: "delivered",
            attempts: 1,
            createdAt: "2026-07-14T18:00:00Z",
            updatedAt: "2026-07-14T18:00:01Z"
        )
    )
}

struct MobilePushEventSummary: Decodable, Hashable, Sendable {
    var id = ""
    var kind = ""
    var title = ""
    var route = ""
    var status = ""
    var attempts = 0
    var createdAt = ""
    var updatedAt = ""
}

struct MobilePushDeviceResponse: Decodable, Sendable {
    var device = MobilePushDevice()
    var mobilePush = MobilePushStatus()
}

struct MobilePushDevice: Decodable, Hashable, Sendable {
    var id = ""
    var installationId = ""
    var tokenHash = ""
    var platform = "ios"
    var environment = "sandbox"
    var bundleId = ""
    var deviceName = "iPhone"
    var locale = ""
    var enabled = true
    var updatedAt = ""
    var lastDeliveryAt: String?
    var lastError = ""
}

struct MobilePushUnregisterResponse: Decodable, Sendable {
    var removed = 0
    var mobilePush = MobilePushStatus()
}

struct TodayResponse: Decodable, Sendable {
    var updatedAt = ""
    var expiresAt = ""
    var timeZone = ""
    var date = ""
    var meetings: [TodayItem] = []
    var tasks: [TodayItem] = []
    var projects: [TodayItem] = []
    var sessions: [TodayItem] = []
    var sprint: SprintSummary?
    var sources = TodaySources()

    static let empty = TodayResponse()
}

struct TodaySources: Decodable, Hashable, Sendable {
    var calendar = SourceStatus(label: "Google Calendar")
    var notion = SourceStatus(label: "Notion Sprint Board")
    var projects = SourceStatus(label: "Cooper projects")
    var sessions = SourceStatus(label: "Cooper sessions")
}

struct SourceStatus: Decodable, Hashable, Sendable, Identifiable {
    var status = "unknown"
    var label = "Source"
    var count = 0
    var message = ""

    var id: String { label }
    var isConnected: Bool { status == "connected" }
}

struct SprintSummary: Decodable, Hashable, Sendable {
    var id = ""
    var title = "Active sprint"
    var status = ""
    var url = ""
    var totalTasks = 0
    var visibleTasks = 0
    var databaseId = ""
}

struct TodayItem: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var targetId = ""
    var type = ""
    var title = "Untitled"
    var subtitle = ""
    var source = ""
    var sourceLabel = ""
    var eyebrow = ""
    var status = ""
    var priority = ""
    var description = ""
    var points: [String] = []
    var docs: [String] = []
    var url = ""
    var actionLabel = ""
    var actionNote = ""
    var callIntro = ""
    var prompt = ""
    var time = ""
    var duration = ""
    var startsAt = ""
    var endsAt = ""
    var conference = TodayConference()

    var sourceURL: URL? {
        guard let value = URL(string: url), ["http", "https"].contains(value.scheme?.lowercased() ?? "") else {
            return nil
        }
        return value
    }
}

struct TodayConference: Decodable, Hashable, Sendable {
    var provider = ""
    var source = ""
    var joinUrl = ""
    var meetingNumber = ""
    var password = ""

    var joinURL: URL? {
        guard let value = URL(string: joinUrl), ["http", "https"].contains(value.scheme?.lowercased() ?? "") else {
            return nil
        }
        return value
    }

    var joinLabel: String {
        provider.localizedCaseInsensitiveContains("zoom") ? "Join Zoom" : "Join meeting"
    }
}

struct DailyBriefResponse: Decodable, Sendable {
    let brief: DailyBrief
}

struct DailyBrief: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var type = "daily_brief"
    var date = ""
    var dateLabel = "Today"
    var timeZone = ""
    var generatedAt = ""
    var trigger = "manual"
    var title = "Daily Catch Up"
    var summary = ""
    var highlights: [String] = []
    var meetings: [TodayItem] = []
    var tasks: [TodayItem] = []
    var sprint: SprintSummary?
    var slides: [DailyBriefSlide] = []
    var assignment = DailyBriefAssignment()
    var sources = TodaySources()
    var voicePrompt = ""

    var sessionFocus: TodayItem {
        TodayItem(
            id: id,
            targetId: id,
            type: type,
            title: title,
            subtitle: dateLabel,
            source: "Google Calendar + Notion",
            sourceLabel: "Daily Catch Up",
            eyebrow: dateLabel,
            status: "Ready",
            priority: "active",
            description: summary,
            points: highlights,
            actionLabel: "Present with Cooper",
            actionNote: assignment.message,
            callIntro: slides.first?.narration ?? "",
            prompt: voicePrompt
        )
    }

    var contextText: String {
        var lines = [
            "# \(title)",
            "Date: \(dateLabel)",
            "Generated: \(generatedAt)",
            "Time zone: \(timeZone)",
            "",
            "## Summary",
            summary
        ]
        if !highlights.isEmpty {
            lines += ["", "## Highlights"] + highlights.map { "- \($0)" }
        }
        if !assignment.message.isEmpty {
            lines += ["", "## Assignment boundary", assignment.message]
        }
        for (index, slide) in slides.enumerated() {
            lines += [
                "",
                "## Slide \(index + 1): \(slide.title)",
                "Eyebrow: \(slide.eyebrow)",
                slide.narrative,
                "Narration: \(slide.narration)"
            ]
            if !slide.metrics.isEmpty {
                lines += slide.metrics.map { "- \($0.label): \($0.value)" }
            }
            if !slide.items.isEmpty {
                lines += slide.items.map { item in
                    "- \([item.lead, item.title, item.detail, item.status].filter { !$0.isEmpty }.joined(separator: " · "))"
                }
            }
        }
        return lines.joined(separator: "\n")
    }
}

struct DailyBriefSlide: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var eyebrow = ""
    var title = ""
    var narrative = ""
    var voiceCue = ""
    var narration = ""
    var metrics: [DailyBriefMetric] = []
    var items: [DailyBriefSlideItem] = []
}

struct DailyBriefMetric: Decodable, Hashable, Sendable, Identifiable {
    var label = ""
    var value = ""
    var id: String { label }
}

struct DailyBriefSlideItem: Decodable, Hashable, Sendable, Identifiable {
    var lead = ""
    var title = ""
    var detail = ""
    var status = ""
    var id: String { "\(lead)|\(title)|\(detail)" }
}

struct DailyBriefAssignment: Decodable, Hashable, Sendable {
    var mode = "empty"
    var selectors: [String] = []
    var matched = 0
    var available = 0
    var message = ""
}

enum DailyBriefPresentation {
    static func slideIndex(
        slides: [DailyBriefSlide],
        transcript: String,
        currentIndex: Int = 0
    ) -> Int {
        guard !slides.isEmpty else { return 0 }
        let lastIndex = slides.count - 1
        var matchedIndex = min(lastIndex, max(0, currentIndex))
        let normalizedTranscript = normalizeSpeech(transcript)
        let fallbacks: [String: [String]] = [
            "calendar": ["on your calendar"],
            "sprint": ["in the sprint"],
            "focus": ["your focus for today"]
        ]

        for (index, slide) in slides.enumerated() where index > matchedIndex {
            let cues = ([slide.voiceCue] + (fallbacks[slide.id] ?? []))
                .map(normalizeSpeech)
                .filter { !$0.isEmpty }
            if cues.contains(where: normalizedTranscript.contains) {
                matchedIndex = index
            }
        }
        return matchedIndex
    }

    private static func normalizeSpeech(_ value: String) -> String {
        let normalizedApostrophes = value.lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "‘", with: "'")
        let characters = normalizedApostrophes.map { character -> Character in
            character.isLetter || character.isNumber || character == "'" ? character : " "
        }
        return String(characters)
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}

struct CallsResponse: Decodable, Sendable {
    let calls: [SessionRecord]
}

struct SessionResponse: Decodable, Sendable {
    let call: SessionRecord
}

struct ResumeResponse: Decodable, Sendable {
    let call: SessionRecord
    let resumePacket: SessionResumePacket
}

struct SessionRecord: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var title = "Cooper session"
    var status = "unknown"
    var source = "session"
    var sourceLabel = ""
    var sourceDetail = ""
    var startedAt = ""
    var endedAt: String?
    var durationSeconds = 0
    var projectId = ""
    var projectTitle = ""
    var transcript: [TranscriptEntry] = []
    var realtimeUsage: RealtimeUsage?
    var createdAt = ""
    var updatedAt = ""
    var resumedFromCallId = ""
    var threadId = ""
    var continuationIndex = 0
    var contextPacketId = ""
    var contextPacketIds: [String] = []
    var contextSourceCount = 0

    var transcriptCount: Int { transcript.count }
    var isImportedPlan: Bool { source == "plan_ingest" || sourceLabel.localizedCaseInsensitiveContains("imported plan") }
}

struct RealtimeUsageTotals: Codable, Hashable, Sendable {
    var totalTokens = 0
    var inputTokens = 0
    var outputTokens = 0
    var inputTextTokens = 0
    var inputAudioTokens = 0
    var inputImageTokens = 0
    var cachedTokens = 0
    var cachedTextTokens = 0
    var cachedAudioTokens = 0
    var cachedImageTokens = 0
    var outputTextTokens = 0
    var outputAudioTokens = 0

    mutating func add(_ value: RealtimeUsageTotals) {
        totalTokens += value.totalTokens
        inputTokens += value.inputTokens
        outputTokens += value.outputTokens
        inputTextTokens += value.inputTextTokens
        inputAudioTokens += value.inputAudioTokens
        inputImageTokens += value.inputImageTokens
        cachedTokens += value.cachedTokens
        cachedTextTokens += value.cachedTextTokens
        cachedAudioTokens += value.cachedAudioTokens
        cachedImageTokens += value.cachedImageTokens
        outputTextTokens += value.outputTextTokens
        outputAudioTokens += value.outputAudioTokens
    }
}

struct RealtimeCostBreakdown: Codable, Hashable, Sendable {
    var realtimeUsd = 0.0
    var transcriptionUsd = 0.0
}

struct RealtimeUsage: Codable, Hashable, Sendable {
    var model = "gpt-realtime-2"
    var transcriptionModel = "gpt-4o-mini-transcribe"
    var startedAt = ISO8601DateFormatter().string(from: Date())
    var updatedAt = ISO8601DateFormatter().string(from: Date())
    var responses = 0
    var transcriptionEvents = 0
    var response = RealtimeUsageTotals()
    var transcription = RealtimeUsageTotals()
    var costUsd = 0.0
    var costSource = "no_usage"
    var costBreakdown = RealtimeCostBreakdown()

    var totalTokens: Int {
        let recorded = response.totalTokens + transcription.totalTokens
        return recorded > 0
            ? recorded
            : response.inputTokens + response.outputTokens + transcription.inputTokens + transcription.outputTokens
    }

    mutating func addResponse(_ totals: RealtimeUsageTotals) {
        responses += 1
        response.add(totals)
        summarize()
    }

    mutating func addTranscription(_ totals: RealtimeUsageTotals) {
        transcriptionEvents += 1
        transcription.add(totals)
        summarize()
    }

    private mutating func summarize() {
        let million = 1_000_000.0
        let regularTextInput = max(0, response.inputTextTokens - response.cachedTextTokens)
        let regularAudioInput = max(0, response.inputAudioTokens - response.cachedAudioTokens)
        let regularImageInput = max(0, response.inputImageTokens - response.cachedImageTokens)
        let realtime = (
            Double(regularTextInput) * 4
                + Double(response.cachedTextTokens) * 0.4
                + Double(regularAudioInput) * 32
                + Double(response.cachedAudioTokens) * 0.4
                + Double(regularImageInput) * 5
                + Double(response.cachedImageTokens) * 0.5
                + Double(response.outputTextTokens) * 24
                + Double(response.outputAudioTokens) * 64
        ) / million
        let transcriptionCost = (
            Double(transcription.inputTokens) * 1.25
                + Double(transcription.outputTokens) * 5
        ) / million
        costBreakdown = RealtimeCostBreakdown(
            realtimeUsd: Self.money(realtime),
            transcriptionUsd: Self.money(transcriptionCost)
        )
        costUsd = Self.money(realtime + transcriptionCost)
        costSource = totalTokens > 0 ? "actual_usage" : "no_usage"
        updatedAt = ISO8601DateFormatter().string(from: Date())
    }

    private static func money(_ value: Double) -> Double {
        (value * 1_000_000).rounded() / 1_000_000
    }
}

struct TranscriptEntry: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var at = ""
    var speaker = "Participant"
    var text = ""
    var source = ""
    var responseId = ""
    var itemId = ""
}

struct TranscriptResponse: Decodable, Sendable {
    let entry: TranscriptEntry
    let call: SessionRecord
}

struct SessionChatActivity: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var name = ""
    var status = "running"
    var label = "Cooper tool"
    var message = ""
    var recordId = ""
}

struct SessionChatEvent: Decodable, Sendable {
    var type = "message"
    var delta = ""
    var error = ""
    var retryable = false
    var entry: TranscriptEntry?
    var activity: SessionChatActivity?
    var call: SessionRecord?
    var jobs: [ArtifactJob] = []
    var artifacts: [ArtifactRecord] = []
}

struct SessionResumePacket: Decodable, Hashable, Sendable {
    var version = 1
    var generatedAt = ""
    var sourceCallId = ""
    var rootCallId = ""
    var continuationIndex = 0
    var title = "Cooper session"
    var projectId = ""
    var projectTitle = ""
    var summary = ""
    var decisions: [ResumeSignal] = []
    var openQuestions: [ResumeSignal] = []
    var nextActions: [ResumeSignal] = []
    var recentTurns: [ResumeTurn] = []
    var artifacts: [ResumeArtifact] = []
    var activeWork: [ResumeWorkItem] = []
}

struct ResumeSignal: Decodable, Hashable, Sendable, Identifiable {
    var text = ""
    var speaker = ""
    var at = ""

    var id: String { "\(at)|\(speaker)|\(text)" }
}

struct ResumeTurn: Decodable, Hashable, Sendable, Identifiable {
    var speaker = "Participant"
    var text = ""
    var at = ""

    var id: String { "\(at)|\(speaker)|\(text)" }
}

struct ResumeArtifact: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var title = "Artifact"
    var kind = ""
    var outputType = ""
    var createdAt = ""
}

struct ResumeWorkItem: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var title = "Background work"
    var status = "unknown"
    var statusLine = ""
    var artifactId = ""
    var updatedAt = ""
}

enum ContextProvider: String, CaseIterable, Codable, Hashable, Sendable, Identifiable {
    case notion
    case github
    case meeting
    case paste

    var id: String { rawValue }

    var label: String {
        switch self {
        case .notion: "Notion"
        case .github: "GitHub"
        case .meeting: "Meeting notes"
        case .paste: "Pasted text"
        }
    }

    var systemImage: String {
        switch self {
        case .notion: "doc.text"
        case .github: "chevron.left.forwardslash.chevron.right"
        case .meeting: "bubble.left.and.text.bubble.right"
        case .paste: "doc.on.clipboard"
        }
    }
}

struct ContextSource: Codable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var provider = "paste"
    var type = "note"
    var title = "Untitled context"
    var url = ""
    var repository = ""
    var parentId = ""
    var meta = ""
    var updatedAt = ""
    var freshness = ""
    var content = ""
    var resolutionStatus = "completed"
    var primary = false
    var locked = false
}

struct ContextSearchResponse: Decodable, Sendable {
    var provider = ""
    var query = ""
    var source = ""
    var results: [ContextSource] = []
    var repositories: [String] = []
}

struct ContextPacket: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var intent = ""
    var sources: [ContextSource] = []
    var sourceCount = 0
    var contextPreview = ""
    var createdAt: String?
    var updatedAt: String?
}

struct ContextPacketResponse: Decodable, Sendable {
    let packet: ContextPacket
    let sessionContext: String
}

struct ProjectStateResponse: Decodable, Sendable {
    var projects: [ProjectRecord] = []
    var contextPackets: [ContextPacket] = []
    var artifacts: [ArtifactRecord] = []
    var jobs: [ArtifactJob] = []
    var toolCalls: [ToolCallRecord] = []
    var recipes: [ArtifactRecipe] = []
}

struct ToolCallRecord: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var callId = ""
    var userId = ""
    var toolName = "Cooper tool"
    var arcadeToolName: String?
    var riskLevel = "read"
    var status = "unknown"
    var resultSummary = ""
    var error: String?
    var durationMs: Int?
    var createdAt = ""
    var updatedAt = ""

    var isSuccessful: Bool { ["active", "completed", "executed", "success"].contains(status) }
}

struct OperatorStateResponse: Decodable, Sendable {
    var runtime = OperatorRuntime()
    var presets: [OperatorPreset] = []
    var tasks: [OperatorTask] = []
    var activeTask: OperatorTask?
    var limits = OperatorLimits()

    static let empty = OperatorStateResponse()
}

struct OperatorTaskResponse: Decodable, Sendable {
    let task: OperatorTask
}

struct OperatorStopResponse: Decodable, Sendable {
    var stopped: [OperatorTask] = []
}

struct OperatorRuntime: Decodable, Hashable, Sendable {
    var mode = "local"
    var browserProfile = ""
    var codexWorkspace = ""
    var codexRuntime = ""
    var visibleBrowser = false
    var browserLaunchEnabled = false
    var computerUseEnabled = false
    var computerUseBridge = ""
    var codexAppServerEnabled = false
    var codexMcpEnabled = false
    var agentsSdkEnabled = false
    var sandboxAgentsEnabled = false
    var defaultAllowedDomains: [String] = []
    var budgets = OperatorBudget()
}

struct OperatorLimits: Decodable, Hashable, Sendable {
    var activeTasks = 0
    var approvalQueue = 0
}

struct OperatorBudget: Codable, Hashable, Sendable {
    var maxSteps = 40
    var maxCodexInvocations = 3
    var maxWallClockMs = 900_000
}

struct OperatorPreset: Decodable, Hashable, Sendable, Identifiable {
    var id = "codex_local_planning"
    var title = "Local Codex planning run"
    var description = "Run supervised local work."
    var targetUrl = ""
    var defaultDomains: [String] = []
    var riskLevel = "read"
    var artifactKinds: [String]?
    var templateIds: [String]?
    var harness: String?
    var openaiTools: [String]?

    var isComputerUse: Bool {
        id.hasPrefix("computer_use")
    }

    var isCodex: Bool {
        id.hasPrefix("codex_") || id == "openai_tool_stack_plan"
    }
}

struct OperatorTask: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var title = "Operator task"
    var goal = "Run a supervised local Operator task."
    var skill = "codex_local_planning"
    var targetUrl = ""
    var allowedDomains: [String] = []
    var riskLevel = "read"
    var artifactKinds: [String] = []
    var templateIds: [String] = []
    var computerIntent = OperatorComputerIntent()
    var relatedCallId = ""
    var jobIds: [String] = []
    var jobsQueuedAt = ""
    var status = "queued"
    var budgets = OperatorBudget()
    var steps: [String] = []
    var stepIndex = 0
    var codexInvocations = 0
    var approvals: [OperatorApproval] = []
    var artifacts: [OperatorArtifact] = []
    var logs: [OperatorLog] = []
    var createdAt = ""
    var updatedAt = ""
    var startedAt = ""
    var completedAt = ""
    var stoppedAt = ""
    var error = ""
    var progress = 0
    var generatedJobs: [ArtifactJob]?
    var generatedArtifacts: [ArtifactRecord]?

    var isActive: Bool {
        ["queued", "running", "waiting_approval"].contains(status)
    }

    var isComputerUse: Bool {
        skill.hasPrefix("computer_use")
    }

    var pendingApprovals: [OperatorApproval] {
        approvals.filter { $0.status == "pending" }
    }

    var generatedJobList: [ArtifactJob] {
        generatedJobs ?? []
    }

    var generatedArtifactList: [ArtifactRecord] {
        generatedArtifacts ?? []
    }
}

struct OperatorComputerIntent: Decodable, Hashable, Sendable {
    var mode = ""
    var appName = ""
    var target = ""
    var targetUrl = ""
    var requestedBy = ""
}

struct OperatorApproval: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var type = "operator_approval"
    var title = "Approval required"
    var description = "Approve this checkpoint before Operator continues."
    var status = "pending"
    var requestedAt = ""
    var resolvedAt = ""
}

struct OperatorArtifact: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var type = "summary"
    var title = "Operator artifact"
    var content = ""
    var createdAt = ""
}

struct OperatorLog: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var type = "activity"
    var title = "Operator activity"
    var detail = ""
    var at = ""
}

struct ProjectResponse: Decodable, Sendable {
    let project: ProjectRecord
}

struct ProjectContextResponse: Decodable, Sendable {
    let context: String
    let project: ProjectRecord
}

struct ProjectSourceResponse: Decodable, Sendable {
    let source: ProjectSourceRecord
}

struct LiveSessionContextResponse: Decodable, Sendable {
    let call: SessionRecord
    let project: ProjectRecord?
    let projectContext: String
    let sessionContext: String
    let realtimeSession: JSONValue
}

struct ProjectRecord: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var title = "Untitled project"
    var description = ""
    var status = "active"
    var sourceCount = 0
    var totalChars = 0
    var sources: [ProjectSourceRecord] = []
    var createdAt = ""
    var updatedAt = ""
    var lastUsedAt: String?
}

struct ProjectSourceRecord: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var projectId = ""
    var title = "Project context"
    var sourceType = "text"
    var mimeType = ""
    var originalName = ""
    var charCount = 0
    var storedCharCount = 0
    var truncated = false
    var preview = ""
    var createdAt = ""
    var updatedAt = ""
}

struct ArtifactRecipe: Decodable, Hashable, Sendable, Identifiable {
    var kind = ""
    var title = "Artifact"
    var outputType = "markdown"
    var stepCount = 1

    var id: String { kind }
}

struct ArtifactRecord: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var callId = ""
    var jobId = ""
    var kind = ""
    var title = "Cooper artifact"
    var workstream = ""
    var outputType = "markdown"
    var fileExtension = "md"
    var mimeType = "text/markdown"
    var file = ""
    var createdAt = ""

    var normalizedFileExtension: String {
        fileExtension.trimmingCharacters(in: CharacterSet(charactersIn: ". ")).lowercased()
    }

    var isHTML: Bool { outputType == "html" || ["html", "htm"].contains(normalizedFileExtension) }
    var isMCPApp: Bool { outputType == "mcp_app" || normalizedFileExtension == "json" }
    var isTextArtifact: Bool {
        mimeType.lowercased().hasPrefix("text/")
            || ["markdown", "html", "mcp_app", "text", "json", "mermaid"].contains(outputType.lowercased())
            || ["md", "markdown", "html", "htm", "json", "txt", "csv", "svg", "mmd"].contains(normalizedFileExtension)
    }
    var prefersNativePreview: Bool { !isTextArtifact }
    var systemImageName: String {
        switch normalizedFileExtension {
        case "pdf": "doc.richtext"
        case "doc", "docx", "rtf": "doc.text"
        case "ppt", "pptx", "key": "rectangle.on.rectangle.angled"
        case "xls", "xlsx", "numbers", "csv": "tablecells"
        case "png", "jpg", "jpeg", "heic", "gif", "webp": "photo"
        default: isHTML ? "safari" : isMCPApp ? "app.badge" : "doc.text"
        }
    }
}

struct ArtifactJob: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var callId = ""
    var kind = ""
    var title = "Cooper work"
    var workstream = ""
    var status = "queued"
    var stepIndex = 0
    var stepCount = 1
    var attempts = 0
    var failures = 0
    var maxAttempts = 0
    var model = ""
    var apiStatus = ""
    var activeStepSummary = ""
    var draftCharCount = 0
    var artifactId = ""
    var error: String?
    var retryAt: String?
    var progress = ""
    var logs: [ArtifactJobLog] = []
    var createdAt = ""
    var updatedAt = ""

    var isActive: Bool { ["queued", "running"].contains(status) }
    var canRetry: Bool { status == "failed" }
    var progressFraction: Double {
        switch status {
        case "completed": 1
        case "failed": max(0.05, min(0.95, Double(stepIndex) / Double(max(1, stepCount))))
        default: max(0.04, min(0.95, Double(stepIndex) / Double(max(1, stepCount))))
        }
    }
}

struct ArtifactJobLog: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var at = ""
    var type = "event"
    var message = ""
}

struct CooperAlert: Hashable, Sendable, Identifiable {
    let id: String
    let title: String
    let body: String
    let route: CooperRoute
}

enum CooperNotificationPlanner {
    static func operatorAlerts(from previous: [OperatorTask], to current: [OperatorTask]) -> [CooperAlert] {
        let previousByID = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
        var alerts: [CooperAlert] = []
        for task in current {
            let oldTask = previousByID[task.id]
            let oldApprovalIDs = Set(oldTask?.pendingApprovals.map(\.id) ?? [])
            alerts += task.pendingApprovals
                .filter { !oldApprovalIDs.contains($0.id) }
                .map { approval in
                    CooperAlert(
                        id: "operator-approval-\(approval.id)",
                        title: "Operator approval required",
                        body: "\(task.title) is paused: \(approval.title)",
                        route: .operatorTask(taskID: task.id, approvalID: approval.id)
                    )
                }

            guard oldTask?.status != task.status else { continue }
            switch task.status {
            case "completed":
                alerts.append(CooperAlert(
                    id: "operator-completed-\(task.id)",
                    title: "Operator task completed",
                    body: task.title,
                    route: .operatorTask(taskID: task.id, approvalID: nil)
                ))
            case "failed":
                alerts.append(CooperAlert(
                    id: "operator-failed-\(task.id)",
                    title: "Operator task needs attention",
                    body: task.error.isEmpty ? task.title : "\(task.title): \(task.error)",
                    route: .operatorTask(taskID: task.id, approvalID: nil)
                ))
            default:
                break
            }
        }
        return alerts
    }

    static func artifactAlerts(
        from previous: [ArtifactJob],
        to current: [ArtifactJob],
        artifacts: [ArtifactRecord]
    ) -> [CooperAlert] {
        let previousByID = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
        return current.compactMap { job in
            guard previousByID[job.id]?.status != job.status else { return nil }
            switch job.status {
            case "completed":
                let artifactID = job.artifactId.isEmpty
                    ? artifacts.first { $0.jobId == job.id }?.id
                    : job.artifactId
                return CooperAlert(
                    id: "artifact-completed-\(job.id)",
                    title: "Cooper artifact ready",
                    body: job.title,
                    route: artifactID.map(CooperRoute.artifact) ?? .library
                )
            case "failed":
                return CooperAlert(
                    id: "artifact-failed-\(job.id)",
                    title: "Cooper generation needs attention",
                    body: job.error?.isEmpty == false ? "\(job.title): \(job.error ?? "")" : job.title,
                    route: .library
                )
            default:
                return nil
            }
        }
    }
}

struct ArtifactJobResponse: Decodable, Sendable {
    let job: ArtifactJob
}

struct AiresExamplesResponse: Decodable, Sendable {
    let examples: [AiresExample]
}

struct AiresExampleResponse: Decodable, Sendable {
    let example: AiresExample
}

struct AiresExample: Decodable, Hashable, Sendable, Identifiable {
    var id = ""
    var title = "AIRES template"
    var category = "Template"
    var flow = ""
    var description = ""
    var recipeKind = "aires_requirements"
    var promptHint = ""
    var html = ""
}

struct SessionPreparationOption: Hashable, Sendable, Identifiable {
    let kind: String
    let title: String
    let description: String
    let instruction: String

    var id: String { kind }

    static let all: [SessionPreparationOption] = [
        SessionPreparationOption(
            kind: "executive_report",
            title: "Shared context brief",
            description: "Facts, hypotheses, source citations, and missing context.",
            instruction: "Create a concise executive context brief that attendees can read in three minutes."
        ),
        SessionPreparationOption(
            kind: "mermaid_diagram",
            title: "Decision map",
            description: "Choices, dependencies, and gates the room needs to resolve.",
            instruction: "Create a decision map that shows the choices, dependencies, and unresolved gates."
        ),
        SessionPreparationOption(
            kind: "aires_requirements",
            title: "Requirements first pass",
            description: "A scoped draft using the AIRES Requirements Framework.",
            instruction: "Create a first-pass scoped requirements artifact using the AIRES Requirements Framework."
        ),
        SessionPreparationOption(
            kind: "qa_checklist",
            title: "QA checklist",
            description: "Acceptance evidence, regression coverage, and verification checkpoints.",
            instruction: "Create a practical QA and verification checklist with observable evidence for each check."
        )
    ]
}

struct ArcadeStatus: Decodable, Sendable {
    var configured = false
    var userId = ""
    var gatewayUrl: String?
    var writesEnabled = false
    var tools: [ArcadeTool] = []
    var mappings: [String: Bool] = [:]

    static let empty = ArcadeStatus()
}

struct ArcadeTool: Decodable, Hashable, Sendable, Identifiable {
    var name = ""
    var label = "Arcade tool"
    var description = ""
    var arcadeToolName = ""
    var mappingEnv = ""
    var mapped = false
    var configured = false
    var status = "not_started"
    var riskLevel = "read"
    var authorization: ArcadeAuthorization?

    var id: String { name }
    var isConnected: Bool { ["active", "completed", "authorized"].contains(status) }
}

struct ArcadeAuthorization: Decodable, Hashable, Sendable {
    var id = ""
    var toolName = ""
    var arcadeToolName = ""
    var userId = ""
    var authorizationId = ""
    var authorizationUrl = ""
    var providerId = ""
    var scopes: [String] = []
    var status = "not_started"
    var error: String?
    var lastCheckedAt = ""
    var updatedAt = ""
}

struct ArcadeDiscovery: Decodable, Sendable {
    var configured = false
    var userId = ""
    var gatewayUrl: String?
    var services: [ArcadeService] = []
    var errors: [String] = []
    var error: String?

    static let empty = ArcadeDiscovery()
}

struct ArcadeService: Decodable, Hashable, Sendable, Identifiable {
    var service = "Provider"
    var connected = false
    var status = "not_connected"
    var providerId = ""
    var providerType = "oauth2"
    var scopes: [String] = []
    var connectable = false
    var toolCount = 0
    var writeToolCount = 0
    var capabilities: [ArcadeCapability] = []

    var id: String { service }
}

struct ArcadeCapability: Decodable, Hashable, Sendable {
    var capability = ""
    var kind = "read"
    var toolName = ""
    var authorizationStatus = ""
}

struct ArcadeConnectResponse: Decodable, Sendable {
    let service: String
    let authorization: ProviderAuthorization
}

struct ArcadeAuthorizeResponse: Decodable, Sendable {
    let authorization: ArcadeAuthorization
    let arcade: ArcadeStatus?
}

struct ArcadeAuthorizeAllResponse: Decodable, Sendable {
    var results: [ArcadeAuthorizationResult] = []
    var arcade: ArcadeStatus?
}

struct ArcadeAuthorizationResult: Decodable, Hashable, Sendable, Identifiable {
    var name = ""
    var ok = false
    var authorization: ArcadeAuthorization?
    var error: String?

    var id: String { name }
}

struct ProviderAuthorization: Decodable, Sendable {
    var id = ""
    var authorizationUrl = ""
    var providerId = ""
    var scopes: [String] = []
    var status = "not_started"
}

enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    static let emptyObject = JSONValue.object([:])

    var foundationValue: Any {
        switch self {
        case .null: NSNull()
        case .bool(let value): value
        case .number(let value): value
        case .string(let value): value
        case .array(let values): values.map(\.foundationValue)
        case .object(let values): values.mapValues(\.foundationValue)
        }
    }
}

struct ToolExecutionResponse: Decodable, Sendable {
    let output: JSONValue
}

extension TodayItem {
    private enum CodingKeys: String, CodingKey {
        case id, targetId, type, title, subtitle, source, sourceLabel, eyebrow, status, priority
        case description, points, docs, url, actionLabel, actionNote, callIntro, prompt
        case time, duration, startsAt, endsAt, conference
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        targetId = values.string(.targetId)
        type = values.string(.type)
        title = values.string(.title, fallback: "Untitled")
        subtitle = values.string(.subtitle)
        source = values.string(.source)
        sourceLabel = values.string(.sourceLabel)
        eyebrow = values.string(.eyebrow)
        status = values.string(.status)
        priority = values.string(.priority)
        description = values.string(.description)
        points = values.array(.points)
        docs = values.array(.docs)
        url = values.string(.url)
        actionLabel = values.string(.actionLabel)
        actionNote = values.string(.actionNote)
        callIntro = values.string(.callIntro)
        prompt = values.string(.prompt)
        time = values.string(.time)
        duration = values.string(.duration)
        startsAt = values.string(.startsAt)
        endsAt = values.string(.endsAt)
        conference = (try? values.decodeIfPresent(TodayConference.self, forKey: .conference)) ?? TodayConference()
    }
}

extension TodayConference {
    private enum CodingKeys: String, CodingKey {
        case provider, source, joinUrl, meetingNumber, password
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        provider = values.string(.provider)
        source = values.string(.source)
        joinUrl = values.string(.joinUrl)
        meetingNumber = values.string(.meetingNumber)
        password = values.string(.password)
    }
}

extension SessionRecord {
    private enum CodingKeys: String, CodingKey {
        case id, title, status, source, sourceLabel, sourceDetail, startedAt, endedAt, durationSeconds, projectId, projectTitle
        case transcript, realtimeUsage, createdAt, updatedAt, resumedFromCallId, threadId, continuationIndex
        case contextPacketId, contextPacketIds, contextSourceCount
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        title = values.string(.title, fallback: "Cooper session")
        status = values.string(.status, fallback: "unknown")
        source = values.string(.source, fallback: "session")
        sourceLabel = values.string(.sourceLabel)
        sourceDetail = values.string(.sourceDetail)
        startedAt = values.string(.startedAt)
        endedAt = try values.decodeIfPresent(String.self, forKey: .endedAt)
        durationSeconds = values.integer(.durationSeconds)
        projectId = values.string(.projectId)
        projectTitle = values.string(.projectTitle)
        transcript = values.array(.transcript)
        realtimeUsage = try values.decodeIfPresent(RealtimeUsage.self, forKey: .realtimeUsage)
        createdAt = values.string(.createdAt)
        updatedAt = values.string(.updatedAt)
        resumedFromCallId = values.string(.resumedFromCallId)
        threadId = values.string(.threadId, fallback: id)
        continuationIndex = values.integer(.continuationIndex)
        contextPacketId = values.string(.contextPacketId)
        contextPacketIds = values.array(.contextPacketIds)
        contextSourceCount = values.integer(.contextSourceCount)
    }
}

extension TranscriptEntry {
    private enum CodingKeys: String, CodingKey {
        case id, at, speaker, text, source, responseId, itemId
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        at = values.string(.at)
        speaker = values.string(.speaker, fallback: "Participant")
        text = values.string(.text)
        source = values.string(.source)
        responseId = values.string(.responseId)
        itemId = values.string(.itemId)
    }
}

extension SessionChatActivity {
    private enum CodingKeys: String, CodingKey {
        case id, name, status, label, message, recordId
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        name = values.string(.name)
        status = values.string(.status, fallback: "running")
        label = values.string(.label, fallback: name.isEmpty ? "Cooper tool" : name)
        message = values.string(.message)
        recordId = values.string(.recordId)
    }
}

extension SessionChatEvent {
    private enum CodingKeys: String, CodingKey {
        case type, delta, error, retryable, entry, activity, call, jobs, artifacts
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        type = values.string(.type, fallback: "message")
        delta = values.string(.delta)
        error = values.string(.error)
        retryable = (try? values.decodeIfPresent(Bool.self, forKey: .retryable)) ?? false
        entry = try? values.decodeIfPresent(TranscriptEntry.self, forKey: .entry)
        activity = try? values.decodeIfPresent(SessionChatActivity.self, forKey: .activity)
        call = try? values.decodeIfPresent(SessionRecord.self, forKey: .call)
        jobs = values.array(.jobs)
        artifacts = values.array(.artifacts)
    }
}

extension SessionResumePacket {
    private enum CodingKeys: String, CodingKey {
        case version, generatedAt, sourceCallId, rootCallId, continuationIndex, title
        case projectId, projectTitle, summary, decisions, openQuestions, nextActions
        case recentTurns, artifacts, activeWork
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        version = values.integer(.version, fallback: 1)
        generatedAt = values.string(.generatedAt)
        sourceCallId = values.string(.sourceCallId)
        rootCallId = values.string(.rootCallId)
        continuationIndex = values.integer(.continuationIndex)
        title = values.string(.title, fallback: "Cooper session")
        projectId = values.string(.projectId)
        projectTitle = values.string(.projectTitle)
        summary = values.string(.summary)
        decisions = values.array(.decisions)
        openQuestions = values.array(.openQuestions)
        nextActions = values.array(.nextActions)
        recentTurns = values.array(.recentTurns)
        artifacts = values.array(.artifacts)
        activeWork = values.array(.activeWork)
    }
}

extension ResumeSignal {
    private enum CodingKeys: String, CodingKey { case text, speaker, at }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        text = values.string(.text)
        speaker = values.string(.speaker)
        at = values.string(.at)
    }
}

extension ResumeTurn {
    private enum CodingKeys: String, CodingKey { case speaker, text, at }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        speaker = values.string(.speaker, fallback: "Participant")
        text = values.string(.text)
        at = values.string(.at)
    }
}

extension ResumeArtifact {
    private enum CodingKeys: String, CodingKey { case id, title, kind, outputType, createdAt }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id)
        title = values.string(.title, fallback: "Artifact")
        kind = values.string(.kind)
        outputType = values.string(.outputType)
        createdAt = values.string(.createdAt)
    }
}

extension ResumeWorkItem {
    private enum CodingKeys: String, CodingKey { case id, title, status, statusLine, artifactId, updatedAt }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id)
        title = values.string(.title, fallback: "Background work")
        status = values.string(.status, fallback: "unknown")
        statusLine = values.string(.statusLine)
        artifactId = values.string(.artifactId)
        updatedAt = values.string(.updatedAt)
    }
}

extension ContextSource {
    private enum CodingKeys: String, CodingKey {
        case id, provider, type, title, url, repository, parentId, meta, updatedAt
        case freshness, content, resolutionStatus, primary, locked
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        provider = values.string(.provider, fallback: "paste")
        type = values.string(.type, fallback: "note")
        title = values.string(.title, fallback: "Untitled context")
        url = values.string(.url)
        repository = values.string(.repository)
        parentId = values.string(.parentId)
        meta = values.string(.meta)
        updatedAt = values.string(.updatedAt)
        freshness = values.string(.freshness)
        content = values.string(.content)
        resolutionStatus = values.string(.resolutionStatus, fallback: "completed")
        primary = values.boolean(.primary)
        locked = values.boolean(.locked)
    }
}

extension ContextSearchResponse {
    private enum CodingKeys: String, CodingKey { case provider, query, source, results, repositories }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        provider = values.string(.provider)
        query = values.string(.query)
        source = values.string(.source)
        results = values.array(.results)
        repositories = values.array(.repositories)
    }
}

extension ContextPacket {
    private enum CodingKeys: String, CodingKey {
        case id, intent, sources, sourceCount, contextPreview, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id)
        intent = values.string(.intent)
        sources = values.array(.sources)
        sourceCount = values.integer(.sourceCount, fallback: sources.count)
        contextPreview = values.string(.contextPreview)
        createdAt = try values.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try values.decodeIfPresent(String.self, forKey: .updatedAt)
    }
}

extension ProjectStateResponse {
    private enum CodingKeys: String, CodingKey { case projects, contextPackets, artifacts, jobs, toolCalls, recipes }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        projects = values.array(.projects)
        contextPackets = values.array(.contextPackets)
        artifacts = values.array(.artifacts)
        jobs = values.array(.jobs)
        toolCalls = values.array(.toolCalls)
        recipes = values.array(.recipes)
    }
}

extension ToolCallRecord {
    private enum CodingKeys: String, CodingKey {
        case id, callId, userId, toolName, arcadeToolName, riskLevel, status
        case resultSummary, error, durationMs, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        callId = values.string(.callId)
        userId = values.string(.userId)
        toolName = values.string(.toolName, fallback: "Cooper tool")
        arcadeToolName = try values.decodeIfPresent(String.self, forKey: .arcadeToolName)
        riskLevel = values.string(.riskLevel, fallback: "read")
        status = values.string(.status, fallback: "unknown")
        resultSummary = values.string(.resultSummary)
        error = try values.decodeIfPresent(String.self, forKey: .error)
        durationMs = try values.decodeIfPresent(Int.self, forKey: .durationMs)
        createdAt = values.string(.createdAt)
        updatedAt = values.string(.updatedAt)
    }
}

extension AiresExample {
    private enum CodingKeys: String, CodingKey {
        case id, title, category, flow, description, recipeKind, promptHint, html
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id)
        title = values.string(.title, fallback: "AIRES template")
        category = values.string(.category, fallback: "Template")
        flow = values.string(.flow)
        description = values.string(.description)
        recipeKind = values.string(.recipeKind, fallback: "aires_requirements")
        promptHint = values.string(.promptHint)
        html = values.string(.html)
    }
}

extension ArtifactRecipe {
    private enum CodingKeys: String, CodingKey { case kind, title, outputType, stepCount }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        kind = values.string(.kind)
        title = values.string(.title, fallback: "Artifact")
        outputType = values.string(.outputType, fallback: "markdown")
        stepCount = values.integer(.stepCount, fallback: 1)
    }
}

extension ArtifactRecord {
    private enum CodingKeys: String, CodingKey {
        case id, callId, jobId, kind, title, workstream, outputType, mimeType, file, createdAt
        case extensionKey = "extension"
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        callId = values.string(.callId)
        jobId = values.string(.jobId)
        kind = values.string(.kind)
        title = values.string(.title, fallback: "Cooper artifact")
        workstream = values.string(.workstream)
        outputType = values.string(.outputType, fallback: "markdown")
        let fallbackExtension = switch outputType.lowercased() {
        case "html": "html"
        case "pdf": "pdf"
        case "docx": "docx"
        case "pptx": "pptx"
        case "xlsx": "xlsx"
        case "mcp_app": "json"
        default: "md"
        }
        let fallbackMimeType = switch outputType.lowercased() {
        case "html": "text/html"
        case "pdf": "application/pdf"
        case "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "mcp_app": "application/json"
        default: "text/markdown"
        }
        fileExtension = values.string(.extensionKey, fallback: fallbackExtension)
        mimeType = values.string(.mimeType, fallback: fallbackMimeType)
        file = values.string(.file)
        createdAt = values.string(.createdAt)
    }
}

extension ArtifactJob {
    private enum CodingKeys: String, CodingKey {
        case id, callId, kind, title, workstream, status, stepIndex, stepCount, attempts
        case failures, maxAttempts, model, apiStatus, activeStepSummary, draftCharCount
        case artifactId, error, retryAt, progress, logs, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        callId = values.string(.callId)
        kind = values.string(.kind)
        title = values.string(.title, fallback: "Cooper work")
        workstream = values.string(.workstream)
        status = values.string(.status, fallback: "queued")
        stepIndex = values.integer(.stepIndex)
        stepCount = values.integer(.stepCount, fallback: 1)
        attempts = values.integer(.attempts)
        failures = values.integer(.failures)
        maxAttempts = values.integer(.maxAttempts)
        model = values.string(.model)
        apiStatus = values.string(.apiStatus)
        activeStepSummary = values.string(.activeStepSummary)
        draftCharCount = values.integer(.draftCharCount)
        artifactId = values.string(.artifactId)
        error = try values.decodeIfPresent(String.self, forKey: .error)
        retryAt = try values.decodeIfPresent(String.self, forKey: .retryAt)
        progress = values.string(.progress)
        logs = values.array(.logs)
        createdAt = values.string(.createdAt)
        updatedAt = values.string(.updatedAt)
    }
}

extension ArtifactJobLog {
    private enum CodingKeys: String, CodingKey { case id, at, type, message }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        at = values.string(.at)
        type = values.string(.type, fallback: "event")
        message = values.string(.message)
    }
}

extension ProjectRecord {
    private enum CodingKeys: String, CodingKey {
        case id, title, description, status, sourceCount, totalChars, sources
        case createdAt, updatedAt, lastUsedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        title = values.string(.title, fallback: "Untitled project")
        description = values.string(.description)
        status = values.string(.status, fallback: "active")
        sourceCount = values.integer(.sourceCount)
        totalChars = values.integer(.totalChars)
        sources = values.array(.sources)
        createdAt = values.string(.createdAt)
        updatedAt = values.string(.updatedAt)
        lastUsedAt = try values.decodeIfPresent(String.self, forKey: .lastUsedAt)
    }
}

extension ProjectSourceRecord {
    private enum CodingKeys: String, CodingKey {
        case id, projectId, title, sourceType, mimeType, originalName, charCount
        case storedCharCount, truncated, preview, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = values.string(.id, fallback: UUID().uuidString)
        projectId = values.string(.projectId)
        title = values.string(.title, fallback: "Project context")
        sourceType = values.string(.sourceType, fallback: "text")
        mimeType = values.string(.mimeType)
        originalName = values.string(.originalName)
        charCount = values.integer(.charCount)
        storedCharCount = values.integer(.storedCharCount)
        truncated = values.boolean(.truncated)
        preview = values.string(.preview)
        createdAt = values.string(.createdAt)
        updatedAt = values.string(.updatedAt)
    }
}

extension ArcadeDiscovery {
    private enum CodingKeys: String, CodingKey {
        case configured, userId, gatewayUrl, services, errors, error
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        configured = values.boolean(.configured)
        userId = values.string(.userId)
        gatewayUrl = try values.decodeIfPresent(String.self, forKey: .gatewayUrl)
        services = values.array(.services)
        errors = values.array(.errors)
        error = try values.decodeIfPresent(String.self, forKey: .error)
    }
}

private extension KeyedDecodingContainer {
    func string(_ key: Key, fallback: String = "") -> String {
        (try? decodeIfPresent(String.self, forKey: key)) ?? fallback
    }

    func integer(_ key: Key, fallback: Int = 0) -> Int {
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Double.self, forKey: key) { return Int(value) }
        if let value = try? decodeIfPresent(String.self, forKey: key), let number = Int(value) { return number }
        return fallback
    }

    func boolean(_ key: Key, fallback: Bool = false) -> Bool {
        if let value = try? decodeIfPresent(Bool.self, forKey: key) { return value }
        return fallback
    }

    func array<Element: Decodable>(_ key: Key) -> [Element] {
        (try? decodeIfPresent([Element].self, forKey: key)) ?? []
    }
}

extension TodayResponse {
    static let preview = TodayResponse(
        updatedAt: "2026-07-14T16:05:00Z",
        expiresAt: "2026-07-14T16:10:00Z",
        timeZone: "America/Vancouver",
        date: "2026-07-14",
        meetings: [
            TodayItem(
                id: "meeting-roadmap",
                targetId: "roadmap",
                type: "meeting",
                title: "Product & Engineering Roadmap",
                subtitle: "AIRES leadership · +5",
                source: "Google Calendar",
                sourceLabel: "Google Calendar",
                eyebrow: "09:30",
                status: "next",
                description: "Align the mobile delivery sequence, current sprint risks, and the next customer-ready milestone.",
                points: ["Conference link available", "45 min"],
                url: "https://calendar.google.com/calendar/event?eid=roadmap",
                actionLabel: "Join with Cooper",
                time: "09:30",
                duration: "45 min",
                startsAt: "2026-07-14T09:30:00-07:00",
                endsAt: "2026-07-14T10:15:00-07:00",
                conference: TodayConference(
                    provider: "zoom",
                    source: "calendar",
                    joinUrl: "https://zoom.us/j/123456789?pwd=preview",
                    meetingNumber: "123456789",
                    password: "preview"
                )
            ),
            TodayItem(
                id: "meeting-design",
                targetId: "design",
                type: "meeting",
                title: "Session OS Design Review",
                subtitle: "Product design · +3",
                source: "Google Calendar",
                sourceLabel: "Google Calendar",
                eyebrow: "13:00",
                description: "Review the iPhone information architecture and connected-session entry points.",
                actionLabel: "Open with Cooper",
                time: "13:00",
                duration: "30 min",
                startsAt: "2026-07-14T13:00:00-07:00",
                endsAt: "2026-07-14T13:30:00-07:00"
            )
        ],
        tasks: [
            TodayItem(
                id: "notion-ios",
                targetId: "ios-parity",
                type: "task",
                title: "Ship connected iOS foundation",
                subtitle: "AIRES-421 · Cooper",
                source: "notion · Sprint 14",
                sourceLabel: "Sprint 14",
                eyebrow: "AIRES-421 · MOBILE",
                status: "In progress",
                priority: "active",
                description: "Deliver native Today, sessions, and Arcade connection visibility with simulator proof.",
                points: ["Current board status: In progress", "Assigned to Michael"],
                url: "https://www.notion.so/aires/ios-parity",
                actionLabel: "Work with Cooper"
            ),
            TodayItem(
                id: "notion-voice",
                targetId: "voice-session",
                type: "task",
                title: "Native realtime session spike",
                subtitle: "AIRES-428 · Cooper",
                source: "notion · Sprint 14",
                sourceLabel: "Sprint 14",
                eyebrow: "AIRES-428 · VOICE",
                status: "Not started",
                description: "Define the audio, WebRTC, and session persistence boundary for Milestone 2.",
                points: ["Current board status: Not started"],
                actionLabel: "Work with Cooper"
            )
        ],
        projects: [
            TodayItem(
                id: "project-project-cooper-ios",
                targetId: "project-cooper-ios",
                type: "project",
                title: "Cooper iOS parity",
                subtitle: "active",
                source: "Cooper projects",
                sourceLabel: "Projects",
                eyebrow: "Project workspace",
                status: "active",
                priority: "active",
                description: "Native Session OS delivery across Today, voice, context, and artifacts.",
                points: ["2 saved context sources", "Available to new and resumed sessions"],
                actionLabel: "Open with Cooper"
            )
        ],
        sessions: [
            TodayItem(
                id: "session-parity",
                targetId: "session-1",
                type: "session",
                title: "macOS parity review",
                subtitle: "6 transcript entries",
                source: "Cooper sessions",
                sourceLabel: "Past sessions",
                eyebrow: "Jul 13, 4:10 PM",
                status: "Ended",
                description: "Resume the desktop parity decisions and open integration questions.",
                points: ["6 transcript entries", "Project: Cooper"],
                actionLabel: "Resume with Cooper"
            )
        ],
        sprint: SprintSummary(id: "sprint-14", title: "Sprint 14", status: "Current", totalTasks: 12, visibleTasks: 2),
        sources: TodaySources(
            calendar: SourceStatus(status: "connected", label: "Google Calendar", count: 2, message: "2 calendar events loaded for today."),
            notion: SourceStatus(status: "connected", label: "Notion Sprint Board", count: 2, message: "2 unfinished tasks loaded from Sprint 14."),
            projects: SourceStatus(status: "connected", label: "Cooper projects", count: 3, message: "Saved project context is available."),
            sessions: SourceStatus(status: "connected", label: "Cooper sessions", count: 4, message: "Saved sessions are available to resume.")
        )
    )
}

extension DailyBrief {
    static let preview = DailyBrief(
        id: "daily-brief-2026-07-14",
        date: "2026-07-14",
        dateLabel: "Tuesday, July 14",
        timeZone: "America/Vancouver",
        generatedAt: "2026-07-14T14:00:00Z",
        trigger: "startup",
        summary: "Today has 2 meetings, with Product & Engineering Roadmap next, and 2 open tickets assigned to you in Sprint 14. Nothing is overdue.",
        highlights: [
            "Next: 09:30 · Product & Engineering Roadmap",
            "2 open sprint tickets in your brief.",
            "No dated sprint ticket is overdue."
        ],
        meetings: TodayResponse.preview.meetings,
        tasks: TodayResponse.preview.tasks,
        sprint: TodayResponse.preview.sprint,
        slides: [
            DailyBriefSlide(
                id: "overview",
                eyebrow: "Tuesday, July 14",
                title: "Your day, in one view",
                narrative: "Today has 2 meetings and 2 open tickets assigned to you in Sprint 14.",
                voiceCue: "Good morning. Here's your daily update.",
                narration: "Good morning. Here's your daily update. Today has 2 meetings and 2 open tickets assigned to you in Sprint 14.",
                metrics: [
                    DailyBriefMetric(label: "Meetings", value: "2"),
                    DailyBriefMetric(label: "Open tickets", value: "2"),
                    DailyBriefMetric(label: "Sprint", value: "Sprint 14")
                ]
            ),
            DailyBriefSlide(
                id: "calendar",
                eyebrow: "Calendar",
                title: "The rooms you need to be in",
                narrative: "Cooper has the schedule and can open any meeting as a context-rich working session.",
                voiceCue: "On your calendar",
                narration: "On your calendar: 2 meetings. Next up is 09:30, Product & Engineering Roadmap.",
                items: TodayResponse.preview.meetings.map { meeting in
                    DailyBriefSlideItem(
                        lead: meeting.time,
                        title: meeting.title,
                        detail: [meeting.duration, meeting.subtitle].filter { !$0.isEmpty }.joined(separator: " · "),
                        status: meeting.status
                    )
                }
            ),
            DailyBriefSlide(
                id: "sprint",
                eyebrow: "Sprint 14",
                title: "Work assigned to Michael",
                narrative: "Filtered the active sprint to 2 tickets assigned to Michael Moll.",
                voiceCue: "In the sprint",
                narration: "In the sprint: 2 open tickets assigned to you. Nothing is overdue.",
                items: TodayResponse.preview.tasks.map { task in
                    DailyBriefSlideItem(
                        lead: task.eyebrow,
                        title: task.title,
                        detail: task.status,
                        status: task.priority == "active" ? "In motion" : "Open"
                    )
                }
            ),
            DailyBriefSlide(
                id: "focus",
                eyebrow: "Recommended focus",
                title: "A practical order for the day",
                narrative: "This is a suggested sequence, not an automatic commitment. Ask Cooper to reprioritize it with you.",
                voiceCue: "Your focus for today",
                narration: "Your focus for today: advance Ship connected iOS foundation, then prepare for Product & Engineering Roadmap. What do you want to tackle first?",
                items: [
                    DailyBriefSlideItem(lead: "01", title: "Advance Ship connected iOS foundation", detail: "In progress", status: "In motion"),
                    DailyBriefSlideItem(lead: "02", title: "Prepare for Product & Engineering Roadmap", detail: "09:30 · 45 min", status: "Next")
                ]
            )
        ],
        assignment: DailyBriefAssignment(
            mode: "matched",
            selectors: ["Michael Moll", "michael@aires.ai", "michael"],
            matched: 2,
            available: 2,
            message: "Filtered the active sprint to 2 tickets assigned to Michael Moll."
        ),
        sources: TodayResponse.preview.sources,
        voicePrompt: """
        Present my Daily Catch Up as a crisp, upbeat spoken update.
        Say these four lines in order, using the wording as written and only a brief natural breath between lines.
        Do not add an introduction, headings, filler, or a recap. The opening and transition cues keep the presentation slides synchronized.
        1. Good morning. Here's your daily update. Today has 2 meetings and 2 open tickets assigned to you in Sprint 14.
        2. On your calendar: 2 meetings. Next up is 09:30, Product & Engineering Roadmap.
        3. In the sprint: 2 open tickets assigned to you. Nothing is overdue.
        4. Your focus for today: advance Ship connected iOS foundation, then prepare for Product & Engineering Roadmap. What do you want to tackle first?
        """
    )
}

extension RealtimeUsage {
    static var preview: RealtimeUsage {
        var usage = RealtimeUsage()
        usage.addResponse(RealtimeUsageTotals(
            totalTokens: 3_842,
            inputTokens: 2_510,
            outputTokens: 1_332,
            inputTextTokens: 1_180,
            inputAudioTokens: 1_330,
            cachedTextTokens: 420,
            outputTextTokens: 312,
            outputAudioTokens: 1_020
        ))
        usage.addTranscription(RealtimeUsageTotals(
            totalTokens: 280,
            inputTokens: 220,
            outputTokens: 60,
            inputAudioTokens: 220,
            outputTextTokens: 60
        ))
        return usage
    }
}

extension SessionRecord {
    static let previews: [SessionRecord] = [
        SessionRecord(
            id: "session-1",
            title: "iOS parity implementation plan",
            status: "ended",
            source: "plan_ingest",
            sourceLabel: "Imported plan · Codex-voice",
            sourceDetail: "claude-code/chat-with-plan",
            startedAt: "2026-07-13T23:10:00Z",
            endedAt: "2026-07-13T23:42:00Z",
            durationSeconds: 1920,
            projectId: "cooper",
            projectTitle: "Cooper",
            transcript: [
                TranscriptEntry(id: "turn-1", at: "2026-07-13T23:10:03Z", speaker: "Michael", text: "Let’s make the mobile app feel like the same Session OS, not a smaller website."),
                TranscriptEntry(id: "turn-2", at: "2026-07-13T23:10:09Z", speaker: "Cooper", text: "I’ll preserve the shared session model and make Today the native entry point."),
                TranscriptEntry(id: "turn-3", at: "2026-07-13T23:28:00Z", speaker: "Michael", text: "Calendar, Notion, Arcade, and saved sessions are the first connected milestone."),
                TranscriptEntry(id: "turn-4", at: "2026-07-13T23:28:07Z", speaker: "Cooper", text: "Document generation can follow after the connected session foundation is running."),
            ],
            realtimeUsage: .preview,
            createdAt: "2026-07-13T23:10:00Z",
            updatedAt: "2026-07-13T23:42:00Z",
            threadId: "session-1",
            contextPacketId: "preview-context-mobile-parity",
            contextPacketIds: ["preview-context-mobile-parity"],
            contextSourceCount: 3
        ),
        SessionRecord(
            id: "session-2",
            title: "Sprint 14 daily catch up",
            status: "ended",
            startedAt: "2026-07-13T15:00:00Z",
            endedAt: "2026-07-13T15:18:00Z",
            durationSeconds: 1080,
            transcript: [
                TranscriptEntry(id: "turn-5", at: "2026-07-13T15:00:02Z", speaker: "Cooper", text: "You have two customer meetings and three active sprint priorities today.")
            ],
            createdAt: "2026-07-13T15:00:00Z",
            updatedAt: "2026-07-13T15:18:00Z",
            threadId: "session-2"
        )
    ]
}

extension ContextPacket {
    static let previews: [ContextPacket] = [
        ContextPacket(
            id: "preview-context-mobile-parity",
            intent: "Bring the native iOS Session OS to functional parity with the desktop and web application.",
            sources: [
                ContextSource(
                    id: "notion-ios-parity",
                    provider: "notion",
                    type: "page",
                    title: "Cooper iOS parity",
                    meta: "Primary sprint ticket · In progress",
                    resolutionStatus: "completed",
                    primary: true,
                    locked: true
                ),
                ContextSource(
                    id: "repo-codex-voice",
                    provider: "github",
                    type: "repository",
                    title: "Codex-voice",
                    repository: "aires/Codex-voice",
                    meta: "Shared web, macOS, and iOS implementation",
                    resolutionStatus: "completed"
                ),
                ContextSource(
                    id: "roadmap-notes",
                    provider: "meeting",
                    type: "note",
                    title: "Product and engineering roadmap",
                    meta: "Mobile milestone decisions and open verification gates",
                    resolutionStatus: "completed"
                )
            ],
            sourceCount: 3,
            contextPreview: "The native iOS app must preserve the shared Session OS lifecycle, bounded evidence, prepared artifacts, live Canvas, and safe output readers.",
            createdAt: "2026-07-14T16:00:00Z",
            updatedAt: "2026-07-14T17:08:00Z"
        )
    ]
}

extension AiresExample {
    static let previews: [AiresExample] = [
        AiresExample(
            id: "scoped_requirements_rep_velocity",
            title: "Scoped requirements: rep velocity",
            category: "Requirements",
            flow: "Turn a product opportunity into scoped AIRES requirements with slices and acceptance criteria.",
            description: "The canonical AIRES scoped requirements example for converting context into pull-ready work.",
            recipeKind: "aires_requirements",
            promptHint: "Generate AIRES scoped requirements from the current discussion.",
            html: "<!doctype html><html><head><style>body{font-family:-apple-system;padding:24px;background:#f7f7f2;color:#171815}article{background:white;border:1px solid #ddd;border-radius:12px;padding:18px}</style></head><body><article><p>AIRES REQUIREMENTS</p><h1>Rep velocity</h1><h2>Outcome</h2><p>Convert bounded evidence into vertical, verifiable delivery slices.</p></article></body></html>"
        ),
        AiresExample(
            id: "jtbd_canvas",
            title: "Jobs to be done canvas",
            category: "Discovery",
            flow: "Clarify the user job, forces, pains, desired progress, and product implications.",
            description: "A JTBD canvas for turning customer discussion into sharper requirements.",
            recipeKind: "aires_requirements",
            promptHint: "Generate a Jobs to be Done canvas for the current discussion."
        ),
        AiresExample(
            id: "service_blueprint",
            title: "Service blueprint",
            category: "Blueprint",
            flow: "Map frontstage actions, backstage operations, systems, data, and failure points.",
            description: "See the operating system behind a user workflow.",
            recipeKind: "html_prototype",
            promptHint: "Generate a service blueprint for the current discussion."
        )
    ]
}

extension ProjectRecord {
    static let previews: [ProjectRecord] = [
        ProjectRecord(
            id: "project-cooper-ios",
            title: "Cooper iOS parity",
            description: "Native Session OS delivery across Today, voice, context, and artifacts.",
            status: "active",
            sourceCount: 2,
            totalChars: 14_820,
            sources: [
                ProjectSourceRecord(
                    id: "source-roadmap",
                    projectId: "project-cooper-ios",
                    title: "iOS parity roadmap",
                    sourceType: "markdown",
                    mimeType: "text/markdown",
                    originalName: "ios-parity-roadmap.md",
                    charCount: 8_400,
                    storedCharCount: 8_400,
                    preview: "Milestone sequence for connected context, voice, projects, and documents.",
                    createdAt: "2026-07-14T16:05:00Z",
                    updatedAt: "2026-07-14T16:05:00Z"
                ),
                ProjectSourceRecord(
                    id: "source-decisions",
                    projectId: "project-cooper-ios",
                    title: "Mobile product decisions",
                    sourceType: "paste",
                    charCount: 6_420,
                    storedCharCount: 6_420,
                    preview: "The native app preserves the shared session lifecycle and server authorization boundary.",
                    createdAt: "2026-07-14T16:12:00Z",
                    updatedAt: "2026-07-14T16:12:00Z"
                )
            ],
            createdAt: "2026-07-14T16:00:00Z",
            updatedAt: "2026-07-14T16:12:00Z"
        ),
        ProjectRecord(
            id: "project-session-os",
            title: "Session OS",
            description: "Shared web, macOS, and iOS session memory and artifact workflows.",
            status: "active",
            sourceCount: 1,
            totalChars: 5_720,
            sources: [
                ProjectSourceRecord(
                    id: "source-session-contract",
                    projectId: "project-session-os",
                    title: "Session lifecycle contract",
                    sourceType: "text",
                    charCount: 5_720,
                    storedCharCount: 5_720,
                    preview: "A Session is the durable center of the product.",
                    createdAt: "2026-07-13T18:00:00Z",
                    updatedAt: "2026-07-13T18:00:00Z"
                )
            ],
            createdAt: "2026-07-13T18:00:00Z",
            updatedAt: "2026-07-13T18:00:00Z"
        )
    ]
}

extension ArtifactRecipe {
    static let previews: [ArtifactRecipe] = [
        ArtifactRecipe(kind: "post_call_kit", title: "Post-call kit", outputType: "markdown", stepCount: 3),
        ArtifactRecipe(kind: "execution_plan", title: "Execution plan", outputType: "markdown", stepCount: 3),
        ArtifactRecipe(kind: "qa_checklist", title: "QA checklist", outputType: "markdown", stepCount: 2),
        ArtifactRecipe(kind: "product_requirements", title: "Product requirements doc", outputType: "markdown", stepCount: 3),
        ArtifactRecipe(kind: "mermaid_diagram", title: "Mermaid diagram", outputType: "markdown", stepCount: 2),
        ArtifactRecipe(kind: "ui_wireframe", title: "UI wireframe", outputType: "html", stepCount: 2),
        ArtifactRecipe(kind: "html_prototype", title: "HTML prototype", outputType: "html", stepCount: 3),
        ArtifactRecipe(kind: "executive_report", title: "Executive report", outputType: "html", stepCount: 3),
        ArtifactRecipe(kind: "aires_requirements", title: "AIRES scoped requirements", outputType: "html", stepCount: 3),
        ArtifactRecipe(kind: "pdf_brief", title: "PDF brief", outputType: "pdf", stepCount: 2),
        ArtifactRecipe(kind: "word_brief", title: "Word brief", outputType: "docx", stepCount: 2),
        ArtifactRecipe(kind: "powerpoint_deck", title: "PowerPoint decision deck", outputType: "pptx", stepCount: 2),
        ArtifactRecipe(kind: "excel_action_register", title: "Excel action register", outputType: "xlsx", stepCount: 2)
    ]
}

extension ArtifactRecord {
    static let previews: [ArtifactRecord] = [
        ArtifactRecord(
            id: "artifact-decision-map",
            callId: "session-1",
            jobId: "job-decision-map",
            kind: "mermaid_diagram",
            title: "Mobile parity decision map",
            workstream: "session_preparation",
            outputType: "markdown",
            fileExtension: "md",
            mimeType: "text/markdown",
            file: "data/artifacts/artifact-decision-map.md",
            createdAt: "2026-07-14T17:05:00Z"
        ),
        ArtifactRecord(
            id: "artifact-context-brief",
            callId: "session-1",
            jobId: "job-context-brief",
            kind: "executive_report",
            title: "Shared context brief",
            workstream: "session_preparation",
            outputType: "html",
            fileExtension: "html",
            mimeType: "text/html",
            file: "data/artifacts/artifact-context-brief.html",
            createdAt: "2026-07-14T17:03:00Z"
        ),
        ArtifactRecord(
            id: "artifact-delivery-pdf",
            callId: "session-1",
            jobId: "job-delivery-pdf",
            kind: "delivery_report",
            title: "Cooper delivery brief",
            workstream: "document_delivery",
            outputType: "pdf",
            fileExtension: "pdf",
            mimeType: "application/pdf",
            file: "data/artifacts/artifact-delivery-pdf.pdf",
            createdAt: "2026-07-14T17:04:00Z"
        ),
        ArtifactRecord(
            id: "artifact-delivery-docx",
            callId: "session-1",
            jobId: "job-delivery-docx",
            kind: "word_brief",
            title: "Cooper Word delivery brief",
            workstream: "document_delivery",
            outputType: "docx",
            fileExtension: "docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            file: "data/artifacts/artifact-delivery-docx.docx",
            createdAt: "2026-07-14T18:30:00Z"
        ),
        ArtifactRecord(
            id: "artifact-delivery-pptx",
            callId: "session-1",
            jobId: "job-delivery-pptx",
            kind: "powerpoint_deck",
            title: "Cooper PowerPoint decision deck",
            workstream: "document_delivery",
            outputType: "pptx",
            fileExtension: "pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file: "data/artifacts/artifact-delivery-pptx.pptx",
            createdAt: "2026-07-14T20:00:00Z"
        ),
        ArtifactRecord(
            id: "artifact-delivery-xlsx",
            callId: "session-1",
            jobId: "job-delivery-xlsx",
            kind: "excel_action_register",
            title: "Cooper Excel action register",
            workstream: "document_delivery",
            outputType: "xlsx",
            fileExtension: "xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            file: "data/artifacts/artifact-delivery-xlsx.xlsx",
            createdAt: "2026-07-14T20:05:00Z"
        ),
        ArtifactRecord(
            id: "artifact-qa",
            callId: "session-2",
            jobId: "job-qa",
            kind: "qa_checklist",
            title: "Connected foundation QA checklist",
            outputType: "markdown",
            fileExtension: "md",
            mimeType: "text/markdown",
            file: "data/artifacts/artifact-qa.md",
            createdAt: "2026-07-13T18:30:00Z"
        )
    ]
}

extension ArtifactJob {
    static let previews: [ArtifactJob] = [
        ArtifactJob(
            id: "job-decision-map",
            callId: "session-1",
            kind: "mermaid_diagram",
            title: "Decision map",
            workstream: "session_preparation",
            status: "completed",
            stepIndex: 2,
            stepCount: 2,
            attempts: 1,
            maxAttempts: 3,
            model: "gpt-5.4",
            apiStatus: "completed",
            draftCharCount: 1_840,
            artifactId: "artifact-decision-map",
            progress: "Artifact ready.",
            logs: [ArtifactJobLog(at: "2026-07-14T17:05:00Z", type: "completed", message: "Markdown artifact saved: Decision map.")],
            createdAt: "2026-07-14T17:02:00Z",
            updatedAt: "2026-07-14T17:05:00Z"
        ),
        ArtifactJob(
            id: "job-requirements",
            callId: "session-1",
            kind: "aires_requirements",
            title: "Requirements first pass",
            workstream: "session_preparation",
            status: "running",
            stepIndex: 1,
            stepCount: 3,
            attempts: 1,
            maxAttempts: 3,
            model: "gpt-5.4",
            apiStatus: "waiting_response",
            activeStepSummary: "Structuring scope and acceptance evidence",
            draftCharCount: 920,
            progress: "Building the scoped requirements draft.",
            logs: [ArtifactJobLog(at: "2026-07-14T17:07:00Z", type: "step", message: "Step 2 of 3 is running.")],
            createdAt: "2026-07-14T17:06:00Z",
            updatedAt: "2026-07-14T17:07:00Z"
        ),
        ArtifactJob(
            id: "job-qa-failed",
            callId: "session-2",
            kind: "qa_checklist",
            title: "QA checklist",
            status: "failed",
            stepIndex: 1,
            stepCount: 2,
            attempts: 3,
            failures: 3,
            maxAttempts: 3,
            model: "gpt-5.4",
            apiStatus: "failed",
            error: "The generation request timed out.",
            progress: "Failed. Manual retry is available.",
            createdAt: "2026-07-13T18:20:00Z",
            updatedAt: "2026-07-13T18:25:00Z"
        )
    ]
}

extension OperatorStateResponse {
    static let preview = OperatorStateResponse(
        runtime: OperatorRuntime(
            mode: "local",
            browserProfile: "~/.cooper/profiles/operator",
            codexWorkspace: "~/.cooper/operator-workspace",
            codexRuntime: "codex exec",
            visibleBrowser: true,
            browserLaunchEnabled: true,
            computerUseEnabled: true,
            computerUseBridge: "OpenAI Computer Use",
            codexAppServerEnabled: true,
            codexMcpEnabled: true,
            agentsSdkEnabled: true,
            sandboxAgentsEnabled: false,
            defaultAllowedDomains: ["github.com", "notion.so", "linear.app"],
            budgets: OperatorBudget()
        ),
        presets: [
            OperatorPreset(
                id: "operator_document_suite",
                title: "Operator document suite",
                description: "Generate a PRD, execution plan, AIRES requirements, diagram, wireframe, and prototype from the active context.",
                riskLevel: "read",
                artifactKinds: ["product_requirements", "execution_plan", "aires_requirements", "mermaid_diagram", "ui_wireframe", "html_prototype"]
            ),
            OperatorPreset(
                id: "computer_use_browser",
                title: "Computer Use browser harness",
                description: "Run a supervised browser task with screenshots, action logs, allow-listed domains, and approval gates.",
                riskLevel: "write",
                harness: "computer_use",
                openaiTools: ["responses", "computer_use"]
            ),
            OperatorPreset(
                id: "computer_use_desktop",
                title: "Computer Use desktop app",
                description: "Prepare a supervised desktop-app run with app allow-lists and approval before sensitive actions.",
                riskLevel: "write",
                harness: "computer_use_desktop",
                openaiTools: ["responses", "computer_use"]
            ),
            OperatorPreset(
                id: "codex_app_server",
                title: "Codex app-server bridge",
                description: "Create a Codex task, stream events and diffs, and pause before commits, pushes, or destructive actions.",
                riskLevel: "write",
                harness: "codex_app_server",
                openaiTools: ["codex_app_server", "codex_exec_json"]
            ),
            OperatorPreset(
                id: "github_repo_debug",
                title: "GitHub repo read-only debugging",
                description: "Inspect repository context and produce a sourced debugging brief without write access.",
                targetUrl: "https://github.com/",
                defaultDomains: ["github.com"],
                riskLevel: "read"
            ),
            OperatorPreset(
                id: "aires_requirements",
                title: "AIRES scoped requirements",
                description: "Create a scoped requirements artifact with vertical slices and acceptance evidence.",
                riskLevel: "read",
                artifactKinds: ["aires_requirements"]
            )
        ],
        tasks: previews,
        activeTask: previews.first,
        limits: OperatorLimits(activeTasks: 2, approvalQueue: 1)
    )

    static let previews: [OperatorTask] = [
        OperatorTask(
            id: "operator-doc-suite",
            title: "Mobile parity document suite",
            goal: "Turn the current iOS parity context into implementation-ready artifacts.",
            skill: "operator_document_suite",
            riskLevel: "read",
            artifactKinds: ["product_requirements", "execution_plan", "aires_requirements"],
            relatedCallId: "session-1",
            jobIds: ["job-decision-map", "job-requirements"],
            jobsQueuedAt: "2026-07-14T18:03:00Z",
            status: "running",
            steps: [
                "Capture Michael's voice goal and source context.",
                "Queue real Cooper work jobs in the background.",
                "Monitor model execution, retries, token budgets, and artifact readiness.",
                "Present generated artifacts, open approvals, and next actions."
            ],
            stepIndex: 2,
            logs: [
                OperatorLog(id: "operator-log-1", type: "queued", title: "Task queued", detail: "Operator accepted the document suite.", at: "2026-07-14T18:02:00Z"),
                OperatorLog(id: "operator-log-2", type: "artifact.jobs_queued", title: "Background work started", detail: "Three shared Cooper jobs are attached to the Operator task.", at: "2026-07-14T18:03:00Z")
            ],
            createdAt: "2026-07-14T18:02:00Z",
            updatedAt: "2026-07-14T18:04:00Z",
            startedAt: "2026-07-14T18:02:30Z",
            progress: 50,
            generatedJobs: Array(ArtifactJob.previews.prefix(2)),
            generatedArtifacts: Array(ArtifactRecord.previews.prefix(1))
        ),
        OperatorTask(
            id: "operator-browser-approval",
            title: "Inspect the release dashboard",
            goal: "Open the release dashboard, capture its current state, and stop before any production change.",
            skill: "computer_use_browser",
            targetUrl: "https://github.com/aires-tech",
            allowedDomains: ["github.com"],
            riskLevel: "write",
            computerIntent: OperatorComputerIntent(mode: "browser", target: "release dashboard", targetUrl: "https://github.com/aires-tech", requestedBy: "Michael"),
            status: "waiting_approval",
            steps: [
                "Create an isolated visible browser harness and confirm allowed domains.",
                "Capture screenshots and ask the Computer Use model for the next UI action.",
                "Execute only approved, allow-listed browser actions and stream checkpoints.",
                "Pause before login, purchase, production, write, or external communication steps.",
                "Return the replayable browser trace, screenshots, result, and next approval."
            ],
            stepIndex: 1,
            approvals: [
                OperatorApproval(
                    id: "approval-browser",
                    type: "browser_launch",
                    title: "Open supervised browser",
                    description: "Approve opening the dedicated Operator browser profile for github.com. No writes are authorized.",
                    status: "pending",
                    requestedAt: "2026-07-14T18:06:00Z"
                )
            ],
            logs: [
                OperatorLog(id: "operator-log-3", type: "approval.required", title: "Approval required", detail: "The task is paused before opening a local browser.", at: "2026-07-14T18:06:00Z")
            ],
            createdAt: "2026-07-14T18:05:00Z",
            updatedAt: "2026-07-14T18:06:00Z",
            startedAt: "2026-07-14T18:05:30Z",
            progress: 20
        ),
        OperatorTask(
            id: "operator-debug-complete",
            title: "Read-only repository debugging brief",
            goal: "Inspect the mobile parity implementation and return the highest-risk follow-up checks.",
            skill: "github_repo_debug",
            targetUrl: "https://github.com/aires-tech/cooper",
            allowedDomains: ["github.com"],
            riskLevel: "read",
            status: "completed",
            steps: ["Prepare a read-only run.", "Collect relevant context.", "Synthesize debugging hypotheses.", "Return a sourced brief."],
            stepIndex: 4,
            artifacts: [
                OperatorArtifact(id: "operator-summary", type: "summary", title: "Repository debugging brief", content: "The shared call and context packet contracts are consistent. Credentialed device audio and notification delivery remain the highest-risk verification gates.", createdAt: "2026-07-14T17:40:00Z")
            ],
            logs: [
                OperatorLog(id: "operator-log-4", type: "artifact.ready", title: "Debugging brief ready", detail: "The read-only result is available for review.", at: "2026-07-14T17:40:00Z")
            ],
            createdAt: "2026-07-14T17:30:00Z",
            updatedAt: "2026-07-14T17:40:00Z",
            startedAt: "2026-07-14T17:31:00Z",
            completedAt: "2026-07-14T17:40:00Z",
            progress: 100
        )
    ]
}

extension ArcadeStatus {
    static let preview = ArcadeStatus(
        configured: true,
        userId: "michael@aires.ai",
        gatewayUrl: "https://api.arcade.dev/mcp/cooper-app",
        writesEnabled: false,
        tools: [
            ArcadeTool(name: "search_notion_workspace", label: "Search Notion", description: "Search approved workspace context.", arcadeToolName: "NotionToolkit.SearchByTitle", mapped: true, configured: true, status: "completed", riskLevel: "read"),
            ArcadeTool(name: "fetch_notion_page", label: "Fetch Notion page", description: "Load a selected page into session context.", arcadeToolName: "NotionToolkit.GetPageContentById", mapped: true, configured: true, status: "completed", riskLevel: "read"),
            ArcadeTool(name: "create_followup_action", label: "Create follow-up", description: "Create an approved follow-up action.", arcadeToolName: "NotionToolkit.CreatePage", mapped: true, configured: true, status: "not_started", riskLevel: "write")
        ]
    )
}

extension ArcadeDiscovery {
    static let preview = ArcadeDiscovery(
        configured: true,
        userId: "michael@aires.ai",
        gatewayUrl: "https://api.arcade.dev/mcp/cooper-app",
        services: [
            ArcadeService(service: "Google Calendar", connected: true, status: "completed", providerId: "google", scopes: ["calendar.readonly"], connectable: true, toolCount: 2, writeToolCount: 1),
            ArcadeService(service: "Notion", connected: true, status: "completed", providerId: "notion", scopes: ["read_content"], connectable: true, toolCount: 3, writeToolCount: 1)
        ]
    )
}
