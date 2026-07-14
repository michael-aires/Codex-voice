import Foundation
import Security
import SwiftUI

@MainActor
final class BrokerProcess: ObservableObject {
  enum State: Equatable {
    case idle
    case starting
    case ready
    case failed(String)
  }

  struct ReadyInfo {
    let url: URL
    let workspaceRoot: String
    let hasApiKey: Bool
  }

  struct HostDiagnosticEvent: Identifiable, Equatable {
    let id: UUID
    let timestamp: Date
    let level: String
    let message: String
  }

  @Published private(set) var state: State = .idle
  @Published private(set) var ready: ReadyInfo?
  @Published private(set) var recentDiagnostics: [HostDiagnosticEvent] = []

  private var process: Process?
  private var stdoutHandle: FileHandle?
  private var stderrHandle: FileHandle?
  private var outputBuffer = ""
  private var errorBuffer = ""
  private let diagnostics = HostDiagnostics()

  var statusLabel: String {
    switch state {
    case .idle:
      "Idle"
    case .starting:
      "Starting"
    case .ready:
      "Broker ready"
    case .failed:
      "Broker failed"
    }
  }

  var statusTone: StatusTone {
    switch state {
    case .idle, .starting:
      .starting
    case .ready:
      .ready
    case .failed:
      .failed
    }
  }

  var diagnosticsLogURL: URL {
    diagnostics.logFileURL
  }

  var diagnosticsDirectoryURL: URL {
    diagnostics.directoryURL
  }

  var diagnosticsSummary: String {
    var lines = [
      "Realtime Desktop Agent Host Diagnostics",
      "Generated: \(HostDiagnostics.timestamp(Date()))",
      "State: \(statusLabel)",
      "Diagnostics log: \(diagnosticsLogURL.path)",
      "Native crash reports: \(NativeCrashReporter.reportFileURL.path)"
    ]

    if let ready {
      lines.append("Broker URL: \(ready.url.absoluteString)")
      lines.append("Workspace root: \(ready.workspaceRoot)")
      lines.append("OpenAI key present: \(ready.hasApiKey ? "yes" : "no")")
    }

    if !errorBuffer.isEmpty {
      lines.append("")
      lines.append("Recent broker stderr:")
      lines.append(HostDiagnostics.redact(errorBuffer.trimmingCharacters(in: .whitespacesAndNewlines)))
    }

    if !recentDiagnostics.isEmpty {
      lines.append("")
      lines.append("Recent host events:")
      lines.append(contentsOf: recentDiagnostics.suffix(20).map { event in
        "\(HostDiagnostics.timestamp(event.timestamp)) [\(event.level.uppercased())] \(event.message)"
      })
    }

    return lines.joined(separator: "\n")
  }

  func start() {
    guard process == nil else {
      logDiagnostic("info", "Broker start requested while an existing process is active.")
      return
    }

    state = .starting
    ready = nil
    outputBuffer = ""
    errorBuffer = ""
    logDiagnostic("info", "Starting local broker process.")

    guard let resourceRoot = Bundle.main.resourceURL?.appendingPathComponent("Resources") else {
      fail("Bundled resources were not found.")
      return
    }

    let brokerScript = resourceRoot.appendingPathComponent("Broker/server.mjs")
    let webRoot = resourceRoot.appendingPathComponent("Web")

    guard FileManager.default.fileExists(atPath: brokerScript.path) else {
      fail("Missing broker script at \(brokerScript.path).")
      return
    }

    guard FileManager.default.fileExists(atPath: webRoot.path) else {
      fail("Missing web assets at \(webRoot.path).")
      return
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["node", brokerScript.path]
    process.currentDirectoryURL = resourceRoot.appendingPathComponent("Broker")

    var environment = ProcessInfo.processInfo.environment
    environment["PORT"] = "0"
    environment["WEB_ROOT"] = webRoot.path
    environment["APPROVED_WORKSPACE"] = environment["APPROVED_WORKSPACE"] ?? DevelopmentPaths.defaultWorkspaceRoot.path
    environment["REALTIME_AGENT_MODEL"] = environment["REALTIME_AGENT_MODEL"] ?? "gpt-realtime-2"
    if (environment["OPENAI_API_KEY"] ?? "").isEmpty,
       let keychainKey = Keychain.openAIAPIKey() {
      environment["OPENAI_API_KEY"] = keychainKey
    }
    process.environment = environment
    logDiagnostic(
      "info",
      "Broker environment prepared with workspace \(environment["APPROVED_WORKSPACE"] ?? "") and OpenAI key present: \((environment["OPENAI_API_KEY"] ?? "").isEmpty ? "no" : "yes")."
    )

    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr

    stdoutHandle = stdout.fileHandleForReading
    stderrHandle = stderr.fileHandleForReading

    stdoutHandle?.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty, let chunk = String(data: data, encoding: .utf8) else {
        return
      }
      Task { @MainActor in
        self?.consumeStdout(chunk)
      }
    }

    stderrHandle?.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty, let chunk = String(data: data, encoding: .utf8) else {
        return
      }
      Task { @MainActor in
        self?.consumeStderr(chunk)
      }
    }

    process.terminationHandler = { [weak self] process in
      Task { @MainActor in
        self?.handleTermination(status: process.terminationStatus)
      }
    }

    do {
      try process.run()
      self.process = process
      logDiagnostic("info", "Broker process launched with pid \(process.processIdentifier).")
    } catch {
      stdoutHandle?.readabilityHandler = nil
      stderrHandle?.readabilityHandler = nil
      stdoutHandle = nil
      stderrHandle = nil
      fail("Could not launch Node. Install Node.js or update PATH. \(error.localizedDescription)")
    }
  }

  func restart() {
    logDiagnostic("info", "Broker restart requested.")
    stop()
    start()
  }

  func stop() {
    guard let process else {
      logDiagnostic("info", "Broker stop requested with no active process.")
      return
    }
    logDiagnostic("info", "Stopping broker process pid \(process.processIdentifier).")
    process.terminationHandler = nil
    stdoutHandle?.readabilityHandler = nil
    stderrHandle?.readabilityHandler = nil
    stdoutHandle = nil
    stderrHandle = nil
    process.terminate()
    self.process = nil
  }

  private func consumeStdout(_ chunk: String) {
    outputBuffer += chunk
    let lines = outputBuffer.components(separatedBy: .newlines)
    outputBuffer = lines.last ?? ""

    for line in lines.dropLast() {
      handleBrokerLine(line)
    }
  }

  private func consumeStderr(_ chunk: String) {
    let redacted = HostDiagnostics.redact(chunk)
    errorBuffer += redacted
    if errorBuffer.count > 2400 {
      errorBuffer = String(errorBuffer.suffix(2400))
    }
    diagnostics.append(level: "stderr", message: redacted.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  private func handleBrokerLine(_ line: String) {
    guard let data = line.data(using: .utf8),
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          payload["type"] as? String == "ready",
          let urlString = payload["url"] as? String,
          let url = URL(string: urlString) else {
      return
    }

    ready = ReadyInfo(
      url: url,
      workspaceRoot: payload["workspaceRoot"] as? String ?? "",
      hasApiKey: payload["hasApiKey"] as? Bool ?? false
    )
    state = .ready
    logDiagnostic("info", "Broker ready at \(url.absoluteString).")
  }

  private func handleTermination(status: Int32) {
    process = nil
    stdoutHandle?.readabilityHandler = nil
    stderrHandle?.readabilityHandler = nil
    stdoutHandle = nil
    stderrHandle = nil
    guard case .ready = state else {
      let detail = errorBuffer.isEmpty ? "Node broker exited with status \(status)." : errorBuffer
      fail(detail.trimmingCharacters(in: .whitespacesAndNewlines))
      return
    }
    fail("Node broker stopped with status \(status).")
  }

  private func fail(_ message: String) {
    ready = nil
    let redacted = HostDiagnostics.redact(message)
    state = .failed(redacted)
    logDiagnostic("error", redacted)
  }

  func noteDiagnosticsCopied() {
    logDiagnostic("info", "Host diagnostics copied to pasteboard.")
  }

  func noteDiagnosticsRevealed() {
    logDiagnostic("info", "Host diagnostics folder revealed.")
  }

  private func logDiagnostic(_ level: String, _ message: String) {
    let event = HostDiagnosticEvent(
      id: UUID(),
      timestamp: Date(),
      level: level,
      message: HostDiagnostics.redact(message)
    )
    recentDiagnostics.append(event)
    if recentDiagnostics.count > 40 {
      recentDiagnostics.removeFirst(recentDiagnostics.count - 40)
    }
    diagnostics.append(level: level, message: event.message)
  }
}

final class HostDiagnostics {
  let directoryURL: URL
  let logFileURL: URL

  init(fileManager: FileManager = .default) {
    let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    directoryURL = baseURL
      .appendingPathComponent("RealtimeDesktopAgent", isDirectory: true)
      .appendingPathComponent("Diagnostics", isDirectory: true)
    logFileURL = directoryURL.appendingPathComponent("latest-host.log")

    try? fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    if !fileManager.fileExists(atPath: logFileURL.path) {
      fileManager.createFile(atPath: logFileURL.path, contents: nil)
    }
  }

  func append(level: String, message: String) {
    let sanitized = Self.redact(message)
    guard !sanitized.isEmpty,
          let data = "\(Self.timestamp(Date())) [\(level.uppercased())] \(sanitized)\n".data(using: .utf8) else {
      return
    }

    do {
      let handle = try FileHandle(forWritingTo: logFileURL)
      defer {
        try? handle.close()
      }
      try handle.seekToEnd()
      try handle.write(contentsOf: data)
    } catch {
      try? data.write(to: logFileURL, options: .atomic)
    }
  }

  static func timestamp(_ date: Date) -> String {
    let timestampFormatter = ISO8601DateFormatter()
    timestampFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return timestampFormatter.string(from: date)
  }

  static func redact(_ message: String) -> String {
    let patterns = [
      #"sk-[A-Za-z0-9_\-]{12,}"#,
      #"(?i)(OPENAI_API_KEY\s*=\s*)[^\s]+"#
    ]
    return patterns.reduce(message) { current, pattern in
      guard let regex = try? NSRegularExpression(pattern: pattern) else {
        return current
      }
      let range = NSRange(current.startIndex..., in: current)
      if pattern.hasPrefix("(?i)") {
        return regex.stringByReplacingMatches(
          in: current,
          range: range,
          withTemplate: "$1[redacted]"
        )
      }
      return regex.stringByReplacingMatches(in: current, range: range, withTemplate: "[redacted-openai-key]")
    }
  }
}

private enum DevelopmentPaths {
  static var defaultWorkspaceRoot: URL {
    let sourceFile = URL(fileURLWithPath: #filePath)
    return sourceFile
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }
}

private enum Keychain {
  static func openAIAPIKey() -> String? {
    password(service: "RealtimeDesktopAgent.OPENAI_API_KEY")
      ?? securityToolPassword(service: "RealtimeDesktopAgent.OPENAI_API_KEY")
  }

  static func password(service: String, account: String = NSUserName()) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]

    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func securityToolPassword(service: String) -> String? {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    process.arguments = ["find-generic-password", "-s", service, "-w"]
    process.standardOutput = output
    process.standardError = Pipe()

    do {
      try process.run()
      process.waitUntilExit()
    } catch {
      return nil
    }

    guard process.terminationStatus == 0 else {
      return nil
    }

    let data = output.fileHandleForReading.readDataToEndOfFile()
    let value = String(data: data, encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return value.isEmpty ? nil : value
  }
}
