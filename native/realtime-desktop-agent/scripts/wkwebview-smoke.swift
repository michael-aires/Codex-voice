#!/usr/bin/env swift

import AppKit
import Foundation
import WebKit

final class SmokeHarness: NSObject, WKNavigationDelegate {
  private let webView: WKWebView
  private let window: NSWindow
  private var timeout: Timer?

  override init() {
    let configuration = WKWebViewConfiguration()
    let controller = WKUserContentController()
    controller.addUserScript(WKUserScript(
      source: SmokeHarness.mockBrokerScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    configuration.userContentController = controller

    webView = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 1280, height: 900),
      configuration: configuration
    )
    window = NSWindow(
      contentRect: webView.frame,
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )
    super.init()
    webView.navigationDelegate = self
    window.contentView = webView
  }

  func run() {
    guard let indexURL = Self.indexURL() else {
      fail("Could not locate Resources/Web/index.html from \(FileManager.default.currentDirectoryPath).")
      return
    }
    let webRoot = indexURL.deletingLastPathComponent()
    let appURL = webRoot.appendingPathComponent("app.js")
    guard let html = try? String(contentsOf: indexURL, encoding: .utf8),
          let appSource = try? String(contentsOf: appURL, encoding: .utf8) else {
      fail("Could not read WKWebView smoke HTML or app.js assets.")
      return
    }
    let safeAppSource = appSource.replacingOccurrences(of: "</script", with: "<\\/script")
    let smokeHTML = html.replacingOccurrences(
      of: #"<script type="module" src="/app.js"></script>"#,
      with: "<script>\n\(safeAppSource)\n</script>"
    )

    timeout = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
      self?.fail("WKWebView smoke timed out.")
    }

    window.orderBack(nil)
    webView.loadHTMLString(smokeHTML, baseURL: webRoot)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    fail("WKWebView navigation failed: \(error.localizedDescription)")
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    fail("WKWebView provisional navigation failed: \(error.localizedDescription)")
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
      self.evaluate()
    }
  }

  private func evaluate() {
    evaluatePayload(Self.initialAssertionScript) { [weak self] payload in
      guard let self else { return }
      self.assertPayload(payload)
      self.showView("settings") {
        self.evaluatePayload(Self.settingsAssertionScript) { settingsPayload in
          self.assertPayload(settingsPayload)
          self.showView("library") {
            self.evaluatePayload(Self.libraryAssertionScript) { libraryPayload in
              self.assertPayload(libraryPayload)
              self.showView("operator") {
                self.evaluatePayload(Self.operatorAssertionScript) { operatorPayload in
                  self.assertPayload(operatorPayload)
                  self.timeout?.invalidate()
                  print("native WKWebView smoke passed")
                  NSApp.terminate(nil)
                }
              }
            }
          }
        }
      }
    }
  }

  private func evaluatePayload(_ script: String, completion: @escaping ([String: Any]) -> Void) {
    webView.evaluateJavaScript(script) { [weak self] result, error in
      guard let self else { return }
      if let error {
        self.fail("WKWebView assertion script failed: \(error.localizedDescription)")
        return
      }
      guard let json = result as? String,
            let data = json.data(using: .utf8),
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        self.fail("WKWebView assertion script returned an unreadable result.")
        return
      }
      completion(payload)
    }
  }

  private func showView(_ view: String, completion: @escaping () -> Void) {
    let escaped = view.replacingOccurrences(of: "'", with: "\\'")
    webView.evaluateJavaScript("window.desktopAgentDebug?.showView('\(escaped)'); 'ok';") { [weak self] _, error in
      if let error {
        self?.fail("WKWebView route failed for \(view): \(error.localizedDescription)")
        return
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: completion)
    }
  }

  private func assertPayload(_ payload: [String: Any]) {
    let missing = payload["missing"] as? [String] ?? []
    let failures = payload["failures"] as? [String] ?? []
    if !missing.isEmpty || !failures.isEmpty {
      let view = payload["view"] as? String ?? "unknown"
      let body = payload["body"] as? String ?? ""
      fail("WKWebView smoke failed. View: \(view). Missing: \(missing.joined(separator: ", ")). Failures: \(failures.joined(separator: ", ")). Body: \(body)")
    }
  }

  private func fail(_ message: String) {
    timeout?.invalidate()
    fputs("\(message)\n", stderr)
    exit(1)
  }

  private static func indexURL() -> URL? {
    let current = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
    let candidates = [
      current.appendingPathComponent("native/realtime-desktop-agent/Resources/Web/index.html"),
      current.appendingPathComponent("Resources/Web/index.html"),
      URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Resources/Web/index.html")
    ]
    return candidates.first { FileManager.default.fileExists(atPath: $0.path) }
  }

  private static let mockBrokerScript = """
  (() => {
    const now = new Date().toISOString();
    const store = {
      schemaVersion: 1,
      sessions: [],
      projects: [],
      artifacts: [
        {
          id: "artifact-wk-smoke",
          title: "WKWebView smoke deck",
          kind: "markdown",
          outputType: "markdown",
          tags: ["smoke"],
          source: {
            format: "markdown",
            value: "# Smoke deck\\n\\n## First slide\\n\\nPresentation runtime check."
          },
          createdAt: now,
          updatedAt: now,
          summary: "Smoke presentation artifact"
        }
      ],
      jobs: [],
      operatorTasks: [],
      settings: {
        workspaceAllowlist: ["wkwebview-smoke"],
        connectors: [
          {
            id: "notion",
            label: "Notion",
            status: "authorized",
            risk: "medium",
            authMode: "env_token",
            scopes: ["search", "read_page"],
            toolIds: ["notion.search", "notion.fetch_page"],
            note: "Smoke connector"
          },
          {
            id: "arcade",
            label: "Arcade",
            status: "not_configured",
            risk: "medium",
            authMode: "arcade_oauth",
            scopes: ["pre_authorization", "tool_execution"],
            toolIds: ["search_workspace_context", "search_notion_workspace", "fetch_notion_page"],
            note: "Smoke connector"
          },
          {
            id: "aires_requirements",
            label: "AIRES Requirements",
            status: "local_only",
            risk: "low",
            authMode: "local",
            scopes: ["artifact_generation"],
            toolIds: ["library.aires_requirements"],
            note: "Smoke connector"
          }
        ],
        toolAudit: []
      },
      updatedAt: now
    };
    const manifest = {
      ok: true,
      schema: "realtime-desktop-agent.capability-manifest.v1",
      runtime: {
        artifactModel: "gpt-5.4",
        callModes: ["free", "manual", "wake"]
      },
      capabilities: {
        nativeShell: true,
        realtimeCalls: true,
        durableStore: true,
        artifactResponses: true,
        operatorQueue: true
      },
      routes: [
        { method: "GET", path: "/api/settings", auth: "local_lock" },
        { method: "POST", path: "/api/tools/execute", auth: "local_lock" }
      ],
      tools: [
        { toolId: "notion.search", risk: "medium" },
        { toolId: "local.read_file", risk: "medium" }
      ],
      connectors: store.settings.connectors,
      security: {
        localLockProtectsApi: true,
        connectorAuthorizationRequired: true
      }
    };
    const response = (body, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => typeof body === "string" ? body : JSON.stringify(body)
    });
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : String(input?.url || "");
      const method = String(init.method || "GET").toUpperCase();
      if (url.endsWith("/health") || url === "/health") {
        return response({
          ok: true,
          model: "gpt-realtime-2",
          voice: "marin",
          hasApiKey: false,
          workspaceRoot: "wkwebview-smoke",
          supportsCallModes: ["free", "manual", "wake"],
          supportsArtifactResponses: true,
          artifactModel: "gpt-5.4",
          tools: ["local.read_file", "notion.search"]
        });
      }
      if (url.includes("/api/lock")) {
        return response({ ok: true, lock: { enabled: false, unlocked: true, ttlMinutes: 30 } });
      }
      if (url.includes("/api/store")) {
        if (method === "PUT") {
          const body = JSON.parse(init.body || "{}");
          return response({ store: body.store || store, metadata: { storePath: "wkwebview-store.json", schemaVersion: 1 } });
        }
        return response({ store, metadata: { storePath: "wkwebview-store.json", schemaVersion: 1 } });
      }
      if (url.includes("/api/settings")) {
        return response({
          ok: true,
          runtime: {
            model: "gpt-realtime-2",
            artifactModel: "gpt-5.4",
            voice: "marin",
            hasApiKey: false,
            workspaceRoot: "wkwebview-smoke",
            storePath: "wkwebview-store.json",
            supportsCallModes: ["free", "manual", "wake"],
            manifestSchema: manifest.schema
          },
          lock: { enabled: false, unlocked: true, ttlMinutes: 30 },
          settings: store.settings
        });
      }
      if (url.includes("/api/manifest")) {
        return response(manifest);
      }
      if (url.includes("/api/diagnostics")) {
        return response({ ok: true, generatedAt: now, crashReports: { count: 0, recent: [] } });
      }
      return response({ ok: true });
    };
    window.confirm = () => true;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} }
    });
  })();
  """

  private static let initialAssertionScript = """
  (() => {
    const required = [
      "#homeView",
      "#shellView",
      "#callView",
      "#homeStartCall",
      "[data-nav-view='sessions']",
      "[data-nav-view='projects']",
      "[data-nav-view='library']",
      "[data-nav-view='operator']",
      "[data-nav-view='settings']",
      "[data-call-mode='free']",
      "[data-call-mode='manual']",
      "[data-call-mode='wake']",
      "#canvasLayout",
      "#canvasGroup",
      "#canvasFilter"
    ];
    const missing = required.filter((selector) => !document.querySelector(selector));
    const failures = [];
    if (!document.body.innerText.includes("Good morning")) failures.push("home copy missing");
    return JSON.stringify({ missing, failures });
  })();
  """

  private static let settingsAssertionScript = """
  (() => {
    const failures = [];
    if (!document.querySelector(".settings-panel")) failures.push("settings panel did not render");
    if (!document.body.innerText.includes("Capability manifest")) failures.push("manifest panel missing");
    if (!document.body.innerText.includes("Approval-gated tools")) failures.push("connector approval copy missing");
    return JSON.stringify({ missing: [], failures, view: window.desktopAgentDebug?.view?.() || "", body: document.body.innerText.slice(0, 500) });
  })();
  """

  private static let libraryAssertionScript = """
  (() => {
    const failures = [];
    if (!document.querySelector("#shellTitle")?.textContent.includes("Library")) failures.push("library title missing");
    if (!document.querySelector(".artifact-controls")) failures.push("artifact controls missing");
    if (!document.querySelector("[data-aires-live='workshop']")) failures.push("AIRES workshop call action missing");
    if (!document.querySelector("[data-aires-live='interview']")) failures.push("AIRES interview call action missing");
    if (!document.body.textContent.includes("Present")) failures.push("presentation action missing");
    return JSON.stringify({ missing: [], failures, view: window.desktopAgentDebug?.view?.() || "", body: document.body.textContent.slice(0, 500) });
  })();
  """

  private static let operatorAssertionScript = """
  (() => {
    const failures = [];
    if (!document.querySelector("#shellTitle")?.textContent.includes("Operator")) failures.push("operator title missing");
    if (!document.querySelector(".operator-board")) failures.push("operator board missing");
    return JSON.stringify({ missing: [], failures, view: window.desktopAgentDebug?.view?.() || "", body: document.body.textContent.slice(0, 500) });
  })();
  """
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let harness = SmokeHarness()
harness.run()
app.run()
