import Foundation

enum CooperAPIError: LocalizedError, Sendable {
    case invalidServerURL
    case invalidResponse
    case unauthorized
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidServerURL:
            "Enter a valid Cooper server URL, including http:// or https://."
        case .invalidResponse:
            "The Cooper host returned an unreadable response."
        case .unauthorized:
            "Your Cooper session has expired. Sign in again."
        case .server(_, let message):
            message
        }
    }
}

actor CooperAPIClient {
    private var baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(baseURL: URL) {
        self.baseURL = baseURL
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.httpCookieStorage = .shared
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 45
        session = URLSession(configuration: configuration)
    }

    func configure(baseURL: URL) {
        self.baseURL = baseURL
    }

    func authStatus() async throws -> AuthResponse {
        try await get("api/auth/session")
    }

    func login(password: String) async throws -> AuthResponse {
        try await post("api/auth/login", body: LoginRequest(password: password))
    }

    func logout() async throws -> AuthResponse {
        try await post("api/auth/logout", body: EmptyRequest())
    }

    func today(forceRefresh: Bool) async throws -> TodayResponse {
        try await get("api/today", query: forceRefresh ? [URLQueryItem(name: "refresh", value: "1")] : [])
    }

    func dailyBrief() async throws -> DailyBrief {
        let response: DailyBriefResponse = try await get("api/daily-brief")
        return response.brief
    }

    func refreshDailyBrief() async throws -> DailyBrief {
        let response: DailyBriefResponse = try await post("api/daily-brief/refresh", body: EmptyRequest())
        return response.brief
    }

    func calls() async throws -> CallsResponse {
        try await get("api/calls")
    }

    func call(id: String) async throws -> SessionRecord {
        let response: SessionResponse = try await get("api/calls/\(id)")
        return response.call
    }

    func projects() async throws -> ProjectStateResponse {
        try await get("api/state")
    }

    func workspaceState() async throws -> ProjectStateResponse {
        try await get("api/state")
    }

    func contextPacket(id: String) async throws -> ContextPacketResponse {
        try await get("api/context-packets/\(id)")
    }

    func airesExamples() async throws -> [AiresExample] {
        let response: AiresExamplesResponse = try await get("api/aires/examples")
        return response.examples
    }

    func airesExample(id: String) async throws -> AiresExample {
        let response: AiresExampleResponse = try await get("api/aires/examples/\(id)")
        return response.example
    }

    func operatorState() async throws -> OperatorStateResponse {
        try await get("api/operator/state")
    }

    func mobilePushStatus() async throws -> MobilePushStatus {
        let response: MobilePushStatusResponse = try await get("api/mobile-push/status")
        return response.mobilePush
    }

    func mobileDeviceReadiness() async throws -> MobileDeviceReadiness {
        let response: MobileDeviceReadinessResponse = try await get("api/mobile-readiness")
        return response.readiness
    }

    func registerMobilePushDevice(
        token: String,
        installationId: String,
        environment: String,
        bundleId: String,
        deviceName: String,
        locale: String
    ) async throws -> MobilePushDeviceResponse {
        try await post(
            "api/mobile-push/devices",
            body: MobilePushDeviceRequest(
                token: token,
                installationId: installationId,
                environment: environment,
                bundleId: bundleId,
                deviceName: deviceName,
                locale: locale
            )
        )
    }

    func unregisterMobilePushDevice(token: String, installationId: String) async throws -> MobilePushUnregisterResponse {
        try await post(
            "api/mobile-push/devices/unregister",
            body: MobilePushUnregisterRequest(token: token, installationId: installationId)
        )
    }

    func startOperatorTask(
        preset: OperatorPreset,
        goal: String,
        targetURL: String,
        allowedDomains: [String]
    ) async throws -> OperatorTask {
        let response: OperatorTaskResponse = try await post(
            "api/operator/tasks",
            body: OperatorTaskRequest(
                skill: preset.id,
                title: preset.title,
                goal: goal,
                targetUrl: targetURL,
                allowedDomains: allowedDomains,
                artifactKinds: preset.artifactKinds ?? [],
                templateIds: preset.templateIds ?? [],
                computerIntent: OperatorComputerIntentRequest(
                    mode: preset.isComputerUse ? (preset.id == "computer_use_desktop" ? "desktop" : "browser") : "",
                    target: goal,
                    targetUrl: targetURL,
                    requestedBy: "Cooper iOS"
                )
            )
        )
        return response.task
    }

    func approveOperatorTask(id: String, approvalId: String) async throws -> OperatorTask {
        let response: OperatorTaskResponse = try await post(
            "api/operator/tasks/\(id)/approve",
            body: OperatorApprovalRequest(approvalId: approvalId)
        )
        return response.task
    }

    func cancelOperatorTask(id: String) async throws -> OperatorTask {
        let response: OperatorTaskResponse = try await post(
            "api/operator/tasks/\(id)/cancel",
            body: EmptyRequest()
        )
        return response.task
    }

    func stopAllOperatorTasks() async throws -> [OperatorTask] {
        let response: OperatorStopResponse = try await post(
            "api/operator/stop-all",
            body: EmptyRequest()
        )
        return response.stopped
    }

    func createProject(title: String, description: String) async throws -> ProjectRecord {
        let response: ProjectResponse = try await post(
            "api/projects",
            body: CreateProjectRequest(title: title, description: description)
        )
        return response.project
    }

    func projectContext(id: String) async throws -> ProjectContextResponse {
        try await get("api/projects/\(id)/context")
    }

    func liveSessionContext(callId: String) async throws -> LiveSessionContextResponse {
        try await get("api/calls/\(callId)/live-context")
    }

    func attachProject(callId: String, projectId: String) async throws -> SessionRecord {
        let response: SessionResponse = try await patch(
            "api/calls/\(callId)",
            body: CallProjectRequest(projectId: projectId)
        )
        return response.call
    }

    func addProjectSource(
        projectId: String,
        title: String,
        content: String,
        sourceType: String = "paste"
    ) async throws -> ProjectSourceRecord {
        let response: ProjectSourceResponse = try await post(
            "api/projects/\(projectId)/sources",
            body: ProjectSourceRequest(title: title, sourceType: sourceType, content: content)
        )
        return response.source
    }

    func uploadProjectFile(projectId: String, fileURL: URL) async throws -> ProjectSourceRecord {
        let response: ProjectSourceResponse = try await uploadFile(
            path: "api/projects/\(projectId)/uploads",
            fileURL: fileURL
        )
        return response.source
    }

    func queueArtifact(
        callId: String,
        kind: String,
        customPrompt: String = "",
        title: String = "",
        workstream: String = ""
    ) async throws -> ArtifactJob {
        let response: ArtifactJobResponse = try await post(
            "api/calls/\(callId)/artifacts",
            body: ArtifactJobRequest(
                kind: kind,
                customPrompt: customPrompt,
                title: title,
                workstream: workstream
            )
        )
        return response.job
    }

    func retryArtifactJob(id: String) async throws -> ArtifactJob {
        let response: ArtifactJobResponse = try await post(
            "api/jobs/\(id)/retry",
            body: EmptyRequest()
        )
        return response.job
    }

    func artifactContent(id: String) async throws -> String {
        let data = try await artifactData(id: id)
        guard let content = String(data: data, encoding: .utf8) else {
            throw CooperAPIError.invalidResponse
        }
        return content
    }

    func artifactData(id: String) async throws -> Data {
        var request = URLRequest(url: try endpoint("api/artifacts/\(id)/content"))
        request.httpMethod = "GET"
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CooperAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw CooperAPIError.unauthorized }
            let message = String(data: data, encoding: .utf8)
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw CooperAPIError.server(status: http.statusCode, message: message)
        }
        return data
    }

    func resumeCall(id: String) async throws -> ResumeResponse {
        try await get("api/calls/\(id)/resume")
    }

    func createCall(
        title: String,
        projectId: String = "",
        resumedFromCallId: String = "",
        contextPacketId: String = ""
    ) async throws -> SessionRecord {
        let response: SessionResponse = try await post(
            "api/calls",
            body: CreateCallRequest(
                title: title,
                startedAt: ISO8601DateFormatter().string(from: Date()),
                projectId: projectId,
                resumedFromCallId: resumedFromCallId,
                contextPacketId: contextPacketId
            )
        )
        return response.call
    }

    func appendTranscript(callId: String, entry: TranscriptEntry) async throws {
        let _: TranscriptResponse = try await post(
            "api/calls/\(callId)/transcript",
            body: TranscriptRequest(entry: entry)
        )
    }

    func chatEvents(
        callId: String,
        message: String,
        messageId: String
    ) throws -> AsyncThrowingStream<SessionChatEvent, Error> {
        var request = URLRequest(url: try endpoint("api/calls/\(callId)/chat"))
        request.httpMethod = "POST"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(SessionChatRequest(message: message, messageId: messageId))
        return Self.makeChatEventStream(session: session, request: request)
    }

    nonisolated private static func makeChatEventStream(
        session: URLSession,
        request: URLRequest
    ) -> AsyncThrowingStream<SessionChatEvent, Error> {
        return AsyncThrowingStream { continuation in
            let task = Task.detached {
                do {
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw CooperAPIError.invalidResponse
                    }
                    guard (200..<300).contains(http.statusCode) else {
                        var data = Data()
                        for try await byte in bytes { data.append(byte) }
                        if http.statusCode == 401 { throw CooperAPIError.unauthorized }
                        let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data).error)
                            ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
                        throw CooperAPIError.server(status: http.statusCode, message: message)
                    }

                    var dataLines: [String] = []
                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        if line.isEmpty {
                            try Self.emitChatEvent(dataLines, to: continuation)
                            dataLines.removeAll(keepingCapacity: true)
                        } else if line.hasPrefix("data:") {
                            dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
                        }
                    }
                    try Self.emitChatEvent(dataLines, to: continuation)
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }

    func endCall(
        callId: String,
        transcript: [TranscriptEntry],
        durationSeconds: Int,
        realtimeUsage: RealtimeUsage
    ) async throws -> SessionRecord {
        let response: SessionResponse = try await post(
            "api/calls/\(callId)/end",
            body: EndCallRequest(
                transcript: transcript.map(TranscriptRequest.init),
                endedAt: ISO8601DateFormatter().string(from: Date()),
                durationSeconds: durationSeconds,
                realtimeUsage: realtimeUsage
            )
        )
        return response.call
    }

    func endTextCall(callId: String, durationSeconds: Int) async throws -> SessionRecord {
        let response: SessionResponse = try await post(
            "api/calls/\(callId)/end",
            body: TextEndCallRequest(
                endedAt: ISO8601DateFormatter().string(from: Date()),
                durationSeconds: durationSeconds
            )
        )
        return response.call
    }

    func updateActiveCall(
        callId: String,
        transcript: [TranscriptEntry],
        durationSeconds: Int,
        realtimeUsage: RealtimeUsage
    ) async throws -> SessionRecord {
        let response: SessionResponse = try await patch(
            "api/calls/\(callId)",
            body: UpdateCallRequest(
                transcript: transcript.map(TranscriptRequest.init),
                durationSeconds: durationSeconds,
                realtimeUsage: realtimeUsage
            )
        )
        return response.call
    }

    func arcadeStatus() async throws -> ArcadeStatus {
        try await get("api/tools/arcade/status")
    }

    func arcadeDiscovery() async throws -> ArcadeDiscovery {
        try await get("api/tools/arcade/discovery")
    }

    func connectArcade(service: String) async throws -> ArcadeConnectResponse {
        try await post("api/tools/arcade/connect", body: ServiceRequest(service: service))
    }

    func authorizeArcade(tool name: String) async throws -> ArcadeAuthorizeResponse {
        try await post("api/tools/arcade/authorize", body: ToolRequest(name: name))
    }

    func authorizeAllArcadeTools() async throws -> ArcadeAuthorizeAllResponse {
        try await post("api/tools/arcade/authorize-all", body: EmptyRequest())
    }

    func checkArcade(tool name: String) async throws -> ArcadeAuthorizeResponse {
        try await post("api/tools/arcade/check", body: ToolRequest(name: name))
    }

    func executeTool(name: String, callId: String, arguments: JSONValue) async throws -> JSONValue {
        let response: ToolExecutionResponse = try await post(
            "api/tools/execute",
            body: ToolExecutionRequest(name: name, callId: callId, arguments: arguments)
        )
        return response.output
    }

    func searchContextSources(
        provider: ContextProvider,
        query: String,
        type: String = "all",
        repository: String = "all",
        databaseId: String = "",
        limit: Int = 50
    ) async throws -> ContextSearchResponse {
        var queryItems = [
            URLQueryItem(name: "provider", value: provider.rawValue),
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "type", value: type),
            URLQueryItem(name: "repository", value: repository),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if !databaseId.isEmpty {
            queryItems.append(URLQueryItem(name: "databaseId", value: databaseId))
        }
        return try await get("api/context-sources/search", query: queryItems)
    }

    func createContextPacket(
        focus: TodayItem?,
        intent: String,
        sources: [ContextSource]
    ) async throws -> ContextPacketResponse {
        try await post(
            "api/context-packets",
            body: ContextPacketRequest(
                meeting: focus.map(ContextMeetingRequest.init),
                intent: intent,
                sources: sources
            )
        )
    }

    func uploadContextFile(packetId: String, fileURL: URL) async throws -> ContextPacketResponse {
        try await uploadFile(
            path: "api/context-packets/\(packetId)/uploads",
            fileURL: fileURL
        )
    }

    private func uploadFile<Response: Decodable & Sendable>(
        path: String,
        fileURL: URL
    ) async throws -> Response {
        let hasSecurityScope = fileURL.startAccessingSecurityScopedResource()
        defer {
            if hasSecurityScope { fileURL.stopAccessingSecurityScopedResource() }
        }

        let fileData = try Data(contentsOf: fileURL, options: .mappedIfSafe)
        let boundary = "CooperBoundary-\(UUID().uuidString)"
        let filename = fileURL.lastPathComponent
            .replacingOccurrences(of: "\"", with: "")
            .replacingOccurrences(of: "\r", with: "")
            .replacingOccurrences(of: "\n", with: "")
        var body = Data()

        func append(_ value: String) {
            body.append(Data(value.utf8))
        }

        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"title\"\r\n\r\n")
        append("\(filename)\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(Self.mimeType(for: fileURL))\r\n\r\n")
        body.append(fileData)
        append("\r\n--\(boundary)--\r\n")

        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return try await send(request)
    }

    private func get<Response: Decodable & Sendable>(
        _ path: String,
        query: [URLQueryItem] = []
    ) async throws -> Response {
        var request = URLRequest(url: try endpoint(path, query: query))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await send(request)
    }

    private func post<Response: Decodable & Sendable, Body: Encodable & Sendable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    private func patch<Response: Decodable & Sendable, Body: Encodable & Sendable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    private func send<Response: Decodable & Sendable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CooperAPIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw CooperAPIError.unauthorized }
            let message = (try? decoder.decode(ErrorEnvelope.self, from: data).error)
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw CooperAPIError.server(status: http.statusCode, message: message)
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw CooperAPIError.invalidResponse
        }
    }

    private func endpoint(_ path: String, query: [URLQueryItem] = []) throws -> URL {
        let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let url = baseURL.appendingPathComponent(cleanPath)
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw CooperAPIError.invalidServerURL
        }
        components.queryItems = query.isEmpty ? nil : query
        guard let result = components.url else { throw CooperAPIError.invalidServerURL }
        return result
    }

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf": "application/pdf"
        case "md", "markdown": "text/markdown"
        default: "text/plain"
        }
    }

    nonisolated private static func emitChatEvent(
        _ dataLines: [String],
        to continuation: AsyncThrowingStream<SessionChatEvent, Error>.Continuation
    ) throws {
        let payload = dataLines.joined(separator: "\n")
        guard !payload.isEmpty, payload != "[DONE]" else { return }
        guard let data = payload.data(using: .utf8) else { throw CooperAPIError.invalidResponse }
        continuation.yield(try JSONDecoder().decode(SessionChatEvent.self, from: data))
    }
}

private struct LoginRequest: Encodable, Sendable {
    let password: String
}

private struct ServiceRequest: Encodable, Sendable {
    let service: String
}

private struct ToolRequest: Encodable, Sendable {
    let name: String
}

private struct MobilePushDeviceRequest: Encodable, Sendable {
    let token: String
    let installationId: String
    let environment: String
    let bundleId: String
    let deviceName: String
    let locale: String
}

private struct MobilePushUnregisterRequest: Encodable, Sendable {
    let token: String
    let installationId: String
}

private struct OperatorTaskRequest: Encodable, Sendable {
    let skill: String
    let title: String
    let goal: String
    let targetUrl: String
    let allowedDomains: [String]
    let artifactKinds: [String]
    let templateIds: [String]
    let computerIntent: OperatorComputerIntentRequest
}

private struct OperatorComputerIntentRequest: Encodable, Sendable {
    let mode: String
    let target: String
    let targetUrl: String
    let requestedBy: String
}

private struct OperatorApprovalRequest: Encodable, Sendable {
    let approvalId: String
}

private struct CreateCallRequest: Encodable, Sendable {
    let title: String
    let startedAt: String
    let projectId: String
    let resumedFromCallId: String
    let contextPacketId: String
}

private struct CallProjectRequest: Encodable, Sendable {
    let projectId: String
}

private struct CreateProjectRequest: Encodable, Sendable {
    let title: String
    let description: String
}

private struct ProjectSourceRequest: Encodable, Sendable {
    let title: String
    let sourceType: String
    let content: String
}

private struct ArtifactJobRequest: Encodable, Sendable {
    let kind: String
    let customPrompt: String
    let title: String
    let workstream: String
}

private struct TranscriptRequest: Encodable, Sendable {
    let id: String
    let at: String
    let speaker: String
    let text: String
    let source: String
    let responseId: String
    let itemId: String

    init(entry: TranscriptEntry) {
        id = entry.id
        at = entry.at
        speaker = entry.speaker
        text = entry.text
        source = entry.source
        responseId = entry.responseId
        itemId = entry.itemId
    }
}

private struct EndCallRequest: Encodable, Sendable {
    let transcript: [TranscriptRequest]
    let endedAt: String
    let durationSeconds: Int
    let realtimeUsage: RealtimeUsage
}

private struct TextEndCallRequest: Encodable, Sendable {
    let endedAt: String
    let durationSeconds: Int
}

private struct UpdateCallRequest: Encodable, Sendable {
    let transcript: [TranscriptRequest]
    let durationSeconds: Int
    let realtimeUsage: RealtimeUsage
}

private struct SessionChatRequest: Encodable, Sendable {
    let message: String
    let messageId: String
}

private struct ToolExecutionRequest: Encodable, Sendable {
    let name: String
    let callId: String
    let arguments: JSONValue
}

private struct ContextPacketRequest: Encodable, Sendable {
    let meeting: ContextMeetingRequest?
    let intent: String
    let sources: [ContextSource]
}

private struct ContextMeetingRequest: Encodable, Sendable {
    let id: String
    let type: String
    let title: String
    let time: String
    let duration: String
    let subtitle: String
    let source: String
    let url: String
    let startsAt: String
    let endsAt: String

    init(_ item: TodayItem) {
        id = item.id
        type = item.type
        title = item.title
        time = item.time
        duration = item.duration
        subtitle = item.subtitle
        source = item.source
        url = item.url
        startsAt = item.startsAt
        endsAt = item.endsAt
    }
}

private struct EmptyRequest: Encodable, Sendable {}

private struct ErrorEnvelope: Decodable, Sendable {
    let error: String
}
