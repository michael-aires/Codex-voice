import SwiftUI

@main
struct RealtimeDesktopAgentApp: App {
  @StateObject private var broker = BrokerProcess()

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
      }
    }
  }
}
