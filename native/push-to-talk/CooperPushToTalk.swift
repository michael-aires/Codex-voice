import AppKit
import AVFoundation
import AudioToolbox
import Carbon
import Foundation

struct CooperPTTConfig: Codable {
    var serverURL: String
    var token: String
    var keyCode: UInt32
    var modifiers: [String]

    static let defaultConfig = CooperPTTConfig(
        serverURL: "http://127.0.0.1:3417",
        token: "",
        keyCode: 49,
        modifiers: ["control", "option"]
    )
}

final class CooperPushToTalkApp: NSObject, NSApplicationDelegate {
    private var config = CooperPTTConfig.defaultConfig
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var meterTimer: Timer?
    private let hud = CooperHUDController()
    private var isRecording = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        config = loadConfig()
        requestMicrophoneAccess()
        registerHotKey()
        print("Cooper push-to-talk is running. Hold \(hotkeyDescription(config)) to talk.")
    }

    private func requestMicrophoneAccess() {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        if status == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                if !granted {
                    DispatchQueue.main.async {
                        self.hud.show(status: "Microphone denied", levels: [])
                        self.hud.hide(after: 2.2)
                    }
                }
            }
        }
    }

    private func registerHotKey() {
        var eventTypes = [
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased))
        ]

        let selfPointer = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        let callback: EventHandlerUPP = { _, event, userData in
            guard let event = event, let userData = userData else { return noErr }
            let app = Unmanaged<CooperPushToTalkApp>.fromOpaque(userData).takeUnretainedValue()
            let kind = GetEventKind(event)
            DispatchQueue.main.async {
                if kind == UInt32(kEventHotKeyPressed) {
                    app.hotKeyPressed()
                } else if kind == UInt32(kEventHotKeyReleased) {
                    app.hotKeyReleased()
                }
            }
            return noErr
        }

        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            callback,
            eventTypes.count,
            &eventTypes,
            selfPointer,
            &eventHandlerRef
        )

        guard installStatus == noErr else {
            print("Could not install hotkey handler: \(installStatus)")
            NSApp.terminate(nil)
            return
        }

        let hotKeyID = EventHotKeyID(signature: fourCharCode("CPTT"), id: 1)
        let registerStatus = RegisterEventHotKey(
            config.keyCode,
            carbonModifierFlags(config.modifiers),
            hotKeyID,
            GetApplicationEventTarget(),
            OptionBits(0),
            &hotKeyRef
        )

        guard registerStatus == noErr else {
            print("Could not register hotkey: \(registerStatus)")
            NSApp.terminate(nil)
            return
        }
    }

    private func hotKeyPressed() {
        guard !isRecording else { return }
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            hud.show(status: "Microphone denied", levels: [])
            hud.hide(after: 2.0)
            return
        }

        do {
            isRecording = true
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("cooper-ptt-\(UUID().uuidString)")
                .appendingPathExtension("m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 44_100.0,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]
            let nextRecorder = try AVAudioRecorder(url: url, settings: settings)
            nextRecorder.isMeteringEnabled = true
            nextRecorder.record()
            recorder = nextRecorder
            recordingURL = url
            hud.show(status: "Listening", levels: [])
            startMetering()
        } catch {
            isRecording = false
            hud.show(status: "Recorder error", levels: [])
            hud.hide(after: 2.0)
            print("Recorder error: \(error.localizedDescription)")
        }
    }

    private func hotKeyReleased() {
        guard isRecording else { return }
        isRecording = false
        meterTimer?.invalidate()
        meterTimer = nil
        recorder?.stop()
        recorder = nil
        hud.show(status: "Thinking", levels: hud.levels)

        guard let url = recordingURL else {
            hud.show(status: "No audio", levels: [])
            hud.hide(after: 1.6)
            return
        }

        postAudio(url)
    }

    private func startMetering() {
        meterTimer?.invalidate()
        meterTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self = self, let recorder = self.recorder else { return }
            recorder.updateMeters()
            let power = recorder.averagePower(forChannel: 0)
            let normalized = max(0.04, min(1.0, pow(10.0, power / 32.0)))
            self.hud.pushLevel(CGFloat(normalized))
        }
    }

    private func postAudio(_ url: URL) {
        guard let endpoint = URL(string: config.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/push-to-talk/utterance") else {
            hud.show(status: "Bad server URL", levels: hud.levels)
            hud.hide(after: 2.0)
            return
        }

        let boundary = "CooperPTT-\(UUID().uuidString)"
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if !config.token.isEmpty {
            request.setValue(config.token, forHTTPHeaderField: "X-Cooper-PTT-Token")
        }

        do {
            let audioData = try Data(contentsOf: url)
            request.httpBody = multipartBody(
                boundary: boundary,
                audioData: audioData,
                filename: url.lastPathComponent,
                fields: ["source": "macos_hotkey"]
            )
        } catch {
            hud.show(status: "Read failed", levels: hud.levels)
            hud.hide(after: 2.0)
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            try? FileManager.default.removeItem(at: url)
            DispatchQueue.main.async {
                if let error = error {
                    self.hud.show(status: "Server error", levels: self.hud.levels)
                    self.hud.hide(after: 2.3)
                    print("Push-to-talk request failed: \(error.localizedDescription)")
                    return
                }

                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(statusCode) else {
                    self.hud.show(status: "Request failed", levels: self.hud.levels)
                    self.hud.hide(after: 2.3)
                    print("Push-to-talk server returned \(statusCode)")
                    return
                }

                let payload = decodePushToTalkResponse(data)
                let label = payload?.action == "computer_task_queued"
                    ? "running tool"
                    : payload?.action == "stop_computer"
                        ? "Stopped"
                        : "Done"
                self.hud.show(status: label, levels: self.hud.levels)
                self.hud.hide(after: 1.6)
            }
        }.resume()
    }
}

final class CooperHUDController {
    private let window: NSPanel
    private let contentView = CooperHUDView()
    private(set) var levels: [CGFloat] = []

    init() {
        window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 390, height: 82),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.isOpaque = false
        window.backgroundColor = .clear
        window.ignoresMouseEvents = true
        window.contentView = contentView
    }

    func show(status: String, levels: [CGFloat]) {
        self.levels = levels
        contentView.status = status
        contentView.levels = levels
        position()
        window.orderFrontRegardless()
        contentView.needsDisplay = true
    }

    func pushLevel(_ value: CGFloat) {
        levels.append(value)
        if levels.count > 34 {
            levels.removeFirst(levels.count - 34)
        }
        contentView.levels = levels
        contentView.needsDisplay = true
    }

    func hide(after delay: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            self.window.orderOut(nil)
        }
    }

    private func position() {
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = window.frame.size
        let x = screen.midX - size.width / 2
        let y = screen.maxY - size.height - 24
        window.setFrameOrigin(NSPoint(x: x, y: y))
    }
}

final class CooperHUDView: NSView {
    var status = "Listening"
    var levels: [CGFloat] = []

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let path = NSBezierPath(roundedRect: bounds, xRadius: 24, yRadius: 24)
        NSColor(calibratedWhite: 0.04, alpha: 0.78).setFill()
        path.fill()

        NSColor(calibratedWhite: 1.0, alpha: 0.12).setStroke()
        path.lineWidth = 1
        path.stroke()

        drawStatus()
        drawWaveform()
    }

    private func drawStatus() {
        let label = status.uppercased()
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold),
            .foregroundColor: NSColor(calibratedRed: 0.94, green: 0.88, blue: 0.28, alpha: 1.0),
            .kern: 1.8
        ]
        label.draw(at: NSPoint(x: 22, y: bounds.midY - 8), withAttributes: attrs)
    }

    private func drawWaveform() {
        let barCount = 34
        let values = paddedLevels(count: barCount)
        let startX: CGFloat = 154
        let width = bounds.width - startX - 22
        let gap: CGFloat = 4
        let barWidth = max(3, (width - gap * CGFloat(barCount - 1)) / CGFloat(barCount))
        let midY = bounds.midY
        let maxHeight: CGFloat = 44

        for (index, value) in values.enumerated() {
            let height = max(7, maxHeight * value)
            let rect = NSRect(
                x: startX + CGFloat(index) * (barWidth + gap),
                y: midY - height / 2,
                width: barWidth,
                height: height
            )
            let alpha = 0.34 + min(0.66, value)
            NSColor(calibratedWhite: 1.0, alpha: alpha).setFill()
            NSBezierPath(roundedRect: rect, xRadius: barWidth / 2, yRadius: barWidth / 2).fill()
        }
    }

    private func paddedLevels(count: Int) -> [CGFloat] {
        if levels.isEmpty {
            return (0..<count).map { index -> CGFloat in
                let phase = CGFloat((index % 5) + 1) / CGFloat(5.0)
                return CGFloat(0.16) + CGFloat(0.12) * phase
            }
        }
        if levels.count >= count {
            return Array(levels.suffix(count))
        }
        return Array(repeating: CGFloat(0.12), count: count - levels.count) + levels
    }
}

struct PushToTalkResponse: Decodable {
    let action: String?
    let message: String?
}

func loadConfig() -> CooperPTTConfig {
    var config = CooperPTTConfig.defaultConfig
    let env = ProcessInfo.processInfo.environment
    let path = env["COOPER_PTT_CONFIG"] ?? NSString(string: "~/.cooper/push-to-talk.json").expandingTildeInPath

    if let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
       let decoded = try? JSONDecoder().decode(CooperPTTConfig.self, from: data) {
        config = decoded
    }

    if let serverURL = env["COOPER_PTT_SERVER_URL"], !serverURL.isEmpty {
        config.serverURL = serverURL
    }
    if let token = env["COOPER_PTT_TOKEN"], !token.isEmpty {
        config.token = token
    }
    if let keyCode = env["COOPER_PTT_KEY_CODE"].flatMap(UInt32.init) {
        config.keyCode = keyCode
    }
    if let modifiers = env["COOPER_PTT_MODIFIERS"], !modifiers.isEmpty {
        config.modifiers = modifiers.split(separator: "+").map { String($0).lowercased() }
    }

    return config
}

func hotkeyDescription(_ config: CooperPTTConfig) -> String {
    let key = config.keyCode == 49 ? "space" : "keyCode \(config.keyCode)"
    return (config.modifiers + [key]).joined(separator: "+")
}

func carbonModifierFlags(_ modifiers: [String]) -> UInt32 {
    modifiers.reduce(UInt32(0)) { flags, modifier in
        switch modifier.lowercased() {
        case "command", "cmd": return flags | UInt32(cmdKey)
        case "option", "alt": return flags | UInt32(optionKey)
        case "control", "ctrl": return flags | UInt32(controlKey)
        case "shift": return flags | UInt32(shiftKey)
        default: return flags
        }
    }
}

func fourCharCode(_ string: String) -> OSType {
    var result: OSType = 0
    for scalar in string.unicodeScalars.prefix(4) {
        result = (result << 8) + OSType(scalar.value)
    }
    return result
}

func multipartBody(boundary: String, audioData: Data, filename: String, fields: [String: String]) -> Data {
    var body = Data()

    for (name, value) in fields {
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        body.appendString("\(value)\r\n")
    }

    body.appendString("--\(boundary)\r\n")
    body.appendString("Content-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\n")
    body.appendString("Content-Type: audio/mp4\r\n\r\n")
    body.append(audioData)
    body.appendString("\r\n--\(boundary)--\r\n")

    return body
}

func decodePushToTalkResponse(_ data: Data?) -> PushToTalkResponse? {
    guard let data = data else { return nil }
    return try? JSONDecoder().decode(PushToTalkResponse.self, from: data)
}

extension Data {
    mutating func appendString(_ value: String) {
        append(value.data(using: .utf8) ?? Data())
    }
}

let app = NSApplication.shared
let delegate = CooperPushToTalkApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
