import AppKit
import SwiftUI

@main
struct RealtimeDesktopAgentApp: App {
  @StateObject private var broker = BrokerProcess()

  init() {
    NativeCrashReporter.install()
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(broker)
        .task {
          broker.start()
        }
        .frame(minWidth: 1100, minHeight: 720)
    }
    .windowStyle(.titleBar)
    .commands {
      CommandMenu("Agent") {
        Button("Restart Broker") {
          broker.restart()
        }
        .keyboardShortcut("r", modifiers: [.command, .shift])

        Divider()

        Button("Copy Host Diagnostics") {
          let pasteboard = NSPasteboard.general
          pasteboard.clearContents()
          pasteboard.setString(broker.diagnosticsSummary, forType: .string)
          broker.noteDiagnosticsCopied()
        }
        .keyboardShortcut("d", modifiers: [.command, .shift])

        Button("Reveal Diagnostics Log") {
          NSWorkspace.shared.activateFileViewerSelecting([broker.diagnosticsLogURL])
          broker.noteDiagnosticsRevealed()
        }
      }
    }
  }
}
