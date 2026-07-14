import SwiftUI
@preconcurrency import UserNotifications
import WebKit

struct AgentWebView: NSViewRepresentable {
  let url: URL

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.allowsAirPlayForMediaPlayback = true
    configuration.userContentController.add(context.coordinator, name: "nativeNotification")
    configuration.userContentController.add(context.coordinator, name: "nativeNotificationStatus")
    configuration.userContentController.add(context.coordinator, name: "nativeNotificationPermission")

    let webView = WKWebView(frame: .zero, configuration: configuration)
    context.coordinator.webView = webView
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.allowsBackForwardNavigationGestures = false
    webView.load(URLRequest(url: url))
    return webView
  }

  static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotification")
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotificationStatus")
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotificationPermission")
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    if webView.url?.absoluteString != url.absoluteString {
      webView.load(URLRequest(url: url))
    }
  }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, @preconcurrency UNUserNotificationCenterDelegate {
    weak var webView: WKWebView?

    override init() {
      super.init()
      UNUserNotificationCenter.current().delegate = self
    }

    @available(macOS 12.0, *)
    func webView(
      _ webView: WKWebView,
      requestMediaCapturePermissionFor origin: WKSecurityOrigin,
      initiatedByFrame frame: WKFrameInfo,
      type: WKMediaCaptureType,
      decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
    ) {
      decisionHandler(.grant)
    }

    func webView(
      _ webView: WKWebView,
      runJavaScriptConfirmPanelWithMessage message: String,
      initiatedByFrame frame: WKFrameInfo,
      completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
      let alert = NSAlert()
      alert.messageText = message
      alert.addButton(withTitle: "Allow")
      alert.addButton(withTitle: "Cancel")
      completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(
      _ webView: WKWebView,
      createWebViewWith configuration: WKWebViewConfiguration,
      for navigationAction: WKNavigationAction,
      windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      if let url = navigationAction.request.url {
        NSWorkspace.shared.open(url)
      }
      return nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      guard let payload = message.body as? [String: Any] else {
        return
      }
      if message.name == "nativeNotificationStatus" {
        postNotificationStatus(requestId: Self.clean(payload["requestId"] as? String, fallback: "notification-status"))
        return
      }
      if message.name == "nativeNotificationPermission" {
        requestNotificationPermission(requestId: Self.clean(payload["requestId"] as? String, fallback: "notification-permission"))
        return
      }
      guard message.name == "nativeNotification" else {
        return
      }
      let title = Self.clean(payload["title"] as? String, fallback: "Cooper")
      let body = Self.clean(payload["body"] as? String, fallback: "Native notification")
      let category = Self.clean(payload["category"] as? String, fallback: "status")
      sendNotification(title: title, body: body, category: category)
    }

    func userNotificationCenter(
      _ center: UNUserNotificationCenter,
      willPresent notification: UNNotification,
      withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
      completionHandler([.banner, .list, .sound])
    }

    private func sendNotification(title: String, body: String, category: String) {
      let center = UNUserNotificationCenter.current()
      center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
        guard granted else {
          return
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = category
        content.sound = .default

        let request = UNNotificationRequest(
          identifier: "cooper.\(category).\(UUID().uuidString)",
          content: content,
          trigger: nil
        )
        center.add(request)
      }
    }

    private func requestNotificationPermission(requestId: String) {
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
        Task { @MainActor in
          self.postNotificationStatus(requestId: requestId)
        }
      }
    }

    private func postNotificationStatus(requestId: String) {
      UNUserNotificationCenter.current().getNotificationSettings { settings in
        let payload: [String: Any] = [
          "requestId": requestId,
          "authorizationStatus": Self.authorizationStatusName(settings.authorizationStatus),
          "alertSetting": Self.settingName(settings.alertSetting),
          "soundSetting": Self.settingName(settings.soundSetting),
          "badgeSetting": Self.settingName(settings.badgeSetting),
          "notificationCenterSetting": Self.settingName(settings.notificationCenterSetting)
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
          return
        }
        Task { @MainActor in
          _ = try? await self.webView?.evaluateJavaScript("window.cooperNativeNotificationStatus && window.cooperNativeNotificationStatus(\(json));")
        }
      }
    }

    nonisolated private static func authorizationStatusName(_ status: UNAuthorizationStatus) -> String {
      switch status {
      case .notDetermined:
        return "not_determined"
      case .denied:
        return "denied"
      case .authorized:
        return "authorized"
      case .provisional:
        return "provisional"
      case .ephemeral:
        return "ephemeral"
      @unknown default:
        return "unknown"
      }
    }

    nonisolated private static func settingName(_ setting: UNNotificationSetting) -> String {
      switch setting {
      case .notSupported:
        return "not_supported"
      case .disabled:
        return "disabled"
      case .enabled:
        return "enabled"
      @unknown default:
        return "unknown"
      }
    }

    private static func clean(_ value: String?, fallback: String) -> String {
      let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let candidate = trimmed.isEmpty ? fallback : trimmed
      let redacted = redact(candidate)
      return String(redacted.prefix(180))
    }

    private static func redact(_ value: String) -> String {
      guard let regex = try? NSRegularExpression(pattern: #"sk-[A-Za-z0-9_\-]{12,}"#) else {
        return value
      }
      let range = NSRange(value.startIndex..., in: value)
      return regex.stringByReplacingMatches(in: value, range: range, withTemplate: "[redacted-openai-key]")
    }
  }
}
