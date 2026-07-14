import AppKit
import SwiftUI

enum StatusTone {
  case starting
  case ready
  case warning
  case failed
}

struct ContentView: View {
  @EnvironmentObject private var broker: BrokerProcess
  @State private var diagnosticsFeedback: String?

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider()
      content
    }
    .background(Color(nsColor: .windowBackgroundColor))
  }

  private var header: some View {
    HStack(spacing: 12) {
      Label("Realtime Desktop Agent", systemImage: "waveform.circle.fill")
        .font(.headline)

      StatusPill(label: broker.statusLabel, tone: broker.statusTone)

      if let ready = broker.ready {
        StatusPill(
          label: ready.hasApiKey ? "OpenAI key loaded" : "OpenAI key missing",
          tone: ready.hasApiKey ? .ready : .warning
        )
        Text(ready.workspaceRoot)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)
      }

      Spacer()

      if let diagnosticsFeedback {
        StatusPill(label: diagnosticsFeedback, tone: .ready)
      }

      Button {
        copyDiagnostics()
      } label: {
        Image(systemName: "doc.on.doc")
      }
      .help("Copy host diagnostics")
      .buttonStyle(.borderless)

      Button {
        revealDiagnostics()
      } label: {
        Image(systemName: "folder")
      }
      .help("Reveal diagnostics log")
      .buttonStyle(.borderless)

      Button {
        broker.restart()
      } label: {
        Image(systemName: "arrow.clockwise")
      }
      .help("Restart local broker")
      .buttonStyle(.borderless)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }

  private func copyDiagnostics() {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.setString(broker.diagnosticsSummary, forType: .string)
    broker.noteDiagnosticsCopied()
    showDiagnosticsFeedback("Diagnostics copied")
  }

  private func revealDiagnostics() {
    NSWorkspace.shared.activateFileViewerSelecting([broker.diagnosticsLogURL])
    broker.noteDiagnosticsRevealed()
    showDiagnosticsFeedback("Log revealed")
  }

  private func showDiagnosticsFeedback(_ message: String) {
    diagnosticsFeedback = message
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      if diagnosticsFeedback == message {
        diagnosticsFeedback = nil
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch broker.state {
    case .idle, .starting:
      ProgressView("Starting local broker")
        .controlSize(.large)
        .frame(maxWidth: .infinity, maxHeight: .infinity)

    case .ready:
      if let url = broker.ready?.url {
        AgentWebView(url: url)
      }

    case .failed(let message):
      VStack(spacing: 16) {
        Image(systemName: "exclamationmark.triangle.fill")
          .font(.system(size: 40))
          .foregroundStyle(.orange)
        Text("Broker unavailable")
          .font(.title2.weight(.semibold))
        Text(message)
          .font(.body)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 560)
        Button("Restart Broker") {
          broker.restart()
        }
      }
      .padding(32)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

private struct StatusPill: View {
  let label: String
  let tone: StatusTone

  var body: some View {
    Text(label)
      .font(.caption.weight(.medium))
      .padding(.horizontal, 9)
      .padding(.vertical, 4)
      .background(background)
      .foregroundStyle(foreground)
      .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
  }

  private var background: Color {
    switch tone {
    case .starting:
      Color(nsColor: .controlBackgroundColor)
    case .ready:
      Color(red: 0.85, green: 0.95, blue: 0.89)
    case .warning:
      Color(red: 0.99, green: 0.91, blue: 0.70)
    case .failed:
      Color(red: 0.99, green: 0.82, blue: 0.78)
    }
  }

  private var foreground: Color {
    switch tone {
    case .starting:
      Color.secondary
    case .ready:
      Color(red: 0.10, green: 0.38, blue: 0.22)
    case .warning:
      Color(red: 0.45, green: 0.29, blue: 0.02)
    case .failed:
      Color(red: 0.55, green: 0.08, blue: 0.06)
    }
  }
}

#Preview {
  ContentView()
    .environmentObject(BrokerProcess())
}
