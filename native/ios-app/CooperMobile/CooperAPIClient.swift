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

    func calls() async throws -> CallsResponse {
        try await get("api/calls")
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

    func checkArcade(tool name: String) async throws -> ArcadeAuthorizeResponse {
        try await post("api/tools/arcade/check", body: ToolRequest(name: name))
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

private struct EmptyRequest: Encodable, Sendable {}

private struct ErrorEnvelope: Decodable, Sendable {
    let error: String
}
