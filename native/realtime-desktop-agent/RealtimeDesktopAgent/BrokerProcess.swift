import Foundation
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

  @Published private(set) var state: State = .idle
  @Published private(set) var ready: ReadyInfo?

  private var process: Process?
  private var stdoutHandle: FileHandle?
  private var stderrHandle: FileHandle?
  private var outputBuffer = ""
  private var errorBuffer = ""

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

  func start() {
    guard process == nil else {
      return
    }

    state = .starting
    ready = nil
    outputBuffer = ""
    errorBuffer = ""

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
    process.environment = environment

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
    } catch {
      stdoutHandle?.readabilityHandler = nil
      stderrHandle?.readabilityHandler = nil
      stdoutHandle = nil
      stderrHandle = nil
      fail("Could not launch Node. Install Node.js or update PATH. \(error.localizedDescription)")
    }
  }

  func restart() {
    stop()
    start()
  }

  func stop() {
    guard let process else {
      return
    }
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
    errorBuffer += chunk
    if errorBuffer.count > 2400 {
      errorBuffer = String(errorBuffer.suffix(2400))
    }
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
    state = .failed(message)
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
