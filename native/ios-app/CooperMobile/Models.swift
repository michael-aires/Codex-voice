import Foundation

struct AuthResponse: Decodable, Sendable {
    let authenticated: Bool
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

struct TodaySources: Decodable, Sendable {
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
}

struct CallsResponse: Decodable, Sendable {
    let calls: [SessionRecord]
}

struct SessionRecord: Decodable, Hashable, Sendable, Identifiable {
    var id = UUID().uuidString
    var title = "Cooper session"
    var status = "unknown"
    var startedAt = ""
    var endedAt: String?
    var durationSeconds = 0
    var projectId = ""
    var projectTitle = ""
    var transcript: [TranscriptEntry] = []
    var createdAt = ""
    var updatedAt = ""
    var resumedFromCallId = ""
    var threadId = ""
    var continuationIndex = 0

    var transcriptCount: Int { transcript.count }
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

struct ProviderAuthorization: Decodable, Sendable {
    var id = ""
    var authorizationUrl = ""
    var providerId = ""
    var scopes: [String] = []
    var status = "not_started"
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
                actionLabel: "Join with Cooper",
                time: "09:30",
                duration: "45 min",
                startsAt: "2026-07-14T09:30:00-07:00",
                endsAt: "2026-07-14T10:15:00-07:00"
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
        projects: [],
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

extension SessionRecord {
    static let previews: [SessionRecord] = [
        SessionRecord(
            id: "session-1",
            title: "macOS parity review",
            status: "ended",
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
            createdAt: "2026-07-13T23:10:00Z",
            updatedAt: "2026-07-13T23:42:00Z",
            threadId: "session-1"
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
