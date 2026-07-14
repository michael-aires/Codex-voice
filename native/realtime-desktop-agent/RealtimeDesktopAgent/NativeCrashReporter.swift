import Foundation
import Darwin

enum NativeCrashReporter {
  nonisolated(unsafe) private static var installed = false
  private static let handledSignals: [Int32] = [SIGABRT, SIGILL, SIGSEGV, SIGBUS, SIGTRAP]

  static var reportFileURL: URL {
    diagnosticsDirectoryURL.appendingPathComponent("native-crashes.jsonl")
  }

  static var diagnosticsDirectoryURL: URL {
    let baseURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    return baseURL
      .appendingPathComponent("RealtimeDesktopAgent", isDirectory: true)
      .appendingPathComponent("Diagnostics", isDirectory: true)
  }

  static func install() {
    guard !installed else {
      return
    }
    installed = true

    try? FileManager.default.createDirectory(at: diagnosticsDirectoryURL, withIntermediateDirectories: true)
    NSSetUncaughtExceptionHandler { exception in
      NativeCrashReporter.record(
        kind: "uncaughtException",
        name: exception.name.rawValue,
        reason: exception.reason ?? "",
        stack: exception.callStackSymbols.joined(separator: "\n"),
        fatal: true
      )
    }

    for signalNumber in handledSignals {
      Darwin.signal(signalNumber) { signalNumber in
        NativeCrashReporter.record(
          kind: "signal",
          name: NativeCrashReporter.signalName(signalNumber),
          reason: "Received signal \(signalNumber).",
          stack: Thread.callStackSymbols.joined(separator: "\n"),
          fatal: true
        )
        Darwin.signal(signalNumber, SIG_DFL)
        raise(signalNumber)
      }
    }

    HostDiagnostics().append(level: "info", message: "Native crash reporter installed at \(reportFileURL.path).")
  }

  private static func record(kind: String, name: String, reason: String, stack: String, fatal: Bool) {
    let report: [String: Any] = [
      "id": "native-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8))",
      "kind": kind,
      "name": HostDiagnostics.redact(name),
      "reason": HostDiagnostics.redact(reason),
      "stack": HostDiagnostics.redact(stack),
      "fatal": fatal,
      "createdAt": HostDiagnostics.timestamp(Date()),
      "pid": ProcessInfo.processInfo.processIdentifier,
      "runtime": [
        "os": ProcessInfo.processInfo.operatingSystemVersionString,
        "arch": SystemArchitecture.current,
        "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
      ]
    ]

    guard let json = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
          let newline = "\n".data(using: .utf8) else {
      return
    }

    var data = json
    data.append(newline)
    try? FileManager.default.createDirectory(at: diagnosticsDirectoryURL, withIntermediateDirectories: true)
    do {
      let handle = try FileHandle(forWritingTo: reportFileURL)
      defer {
        try? handle.close()
      }
      try handle.seekToEnd()
      try handle.write(contentsOf: data)
    } catch {
      try? data.write(to: reportFileURL, options: .atomic)
    }
  }

  private static func signalName(_ signalNumber: Int32) -> String {
    switch signalNumber {
    case SIGABRT:
      "SIGABRT"
    case SIGILL:
      "SIGILL"
    case SIGSEGV:
      "SIGSEGV"
    case SIGBUS:
      "SIGBUS"
    case SIGTRAP:
      "SIGTRAP"
    default:
      "signal-\(signalNumber)"
    }
  }
}

private enum SystemArchitecture {
  static var current: String {
    #if arch(arm64)
      "arm64"
    #elseif arch(x86_64)
      "x86_64"
    #else
      "unknown"
    #endif
  }
}
