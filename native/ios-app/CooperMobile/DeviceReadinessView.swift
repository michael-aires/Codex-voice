import AVFoundation
import SwiftUI
import UIKit

struct DeviceReadinessView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    @State private var microphonePermission = MicrophonePermission.current

    private var readiness: MobileDeviceReadiness { model.deviceReadiness }
    private var usesSecureHost: Bool { model.serverURL?.scheme?.lowercased() == "https" }
    private var appAssociatedDomainsConfigured: Bool {
        Bundle.main.object(forInfoDictionaryKey: "CooperAssociatedDomainsConfigured") as? Bool == true
    }
    private var conferenceMeetingCount: Int {
        model.today.meetings.filter { $0.conference.joinURL != nil }.count
    }
    private var appBundleID: String { Bundle.main.bundleIdentifier ?? "ai.aires.cooper.mobile" }
    private var apnsEnvironmentMatches: Bool {
        model.appAPNSEnvironment == readiness.apns.environment
    }
    private var apnsBundleMatches: Bool { appBundleID == readiness.apns.bundleId }

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            CooperMark()
                            Spacer()
                            StatusBadge(text: runtimeBadge, emphasized: true)
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            CooperMark()
                            StatusBadge(text: runtimeBadge, emphasized: true)
                        }
                    }
                    Text("Know what is ready—and what still needs a real device.")
                        .font(.title2.bold())
                        .foregroundStyle(Color.cooperInk)
                    Text("This checklist separates implemented app behavior from signing, credentials, and physical-device proof. It never treats Simulator success as APNs or microphone evidence from an iPhone.")
                        .font(.subheadline)
                        .foregroundStyle(Color.cooperMuted)
                }
                .padding(.vertical, 8)
                .accessibilityElement(children: .combine)
            }
            .listRowBackground(Color.white)

            if let error = model.deviceReadinessError {
                Section {
                    InlineMessage(text: "The last host readiness check failed: \(error)", isError: true)
                }
            }

            Section("Host and live audio") {
                ReadinessRow(
                    title: "Authenticated host",
                    detail: "The readiness contract is available only inside the signed-in Cooper session.",
                    value: readiness.host.authenticated || model.isPreviewMode ? "Connected" : "Not verified",
                    level: readiness.host.authenticated || model.isPreviewMode ? .ready : .attention
                )
                ReadinessRow(
                    title: "OpenAI voice and chat",
                    detail: "The host reports whether its OpenAI API credential is present without exposing it.",
                    value: readiness.host.openAIConfigured ? "Configured" : "Host setup required",
                    level: readiness.host.openAIConfigured ? .ready : .attention
                )
                ReadinessRow(
                    title: "Host transport",
                    detail: usesSecureHost
                        ? "HTTPS is suitable for a deployed physical-device host."
                        : "HTTP is accepted for local Simulator development; use HTTPS before deployment.",
                    value: usesSecureHost ? "HTTPS" : "Local HTTP",
                    level: usesSecureHost ? .ready : .deviceGate
                )
                ReadinessRow(
                    title: "Microphone permission",
                    detail: microphonePermission.detail,
                    value: microphonePermission.label,
                    level: microphonePermission.level
                )
                ReadinessRow(
                    title: "Audio route proof",
                    detail: physicalAudioDetail,
                    value: physicalAudioValue,
                    level: physicalAudioLevel
                )

                if microphonePermission == .denied {
                    Button("Open microphone settings") {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        openURL(url)
                    }
                }
            }

            Section("Push and app links") {
                ReadinessRow(
                    title: "Notification permission",
                    detail: "Actionable alerts need iOS authorization before Cooper registers for remote delivery.",
                    value: model.notificationAuthorization.label,
                    level: model.notificationAuthorization == .authorized ? .ready : .attention
                )
                ReadinessRow(
                    title: "APNs device registration",
                    detail: model.isRemotePushRegistered
                        ? "This installation has supplied a device token to the Cooper host."
                        : "A provisioned iPhone must return a device token before remote delivery can be tested.",
                    value: model.isRemotePushRegistered ? "Registered" : "Physical device required",
                    level: model.isRemotePushRegistered ? .ready : .deviceGate
                )
                ReadinessRow(
                    title: "APNs host credentials",
                    detail: readiness.apns.configured
                        ? "The host has a key ID, team ID, and private signing key."
                        : "The host is missing: \(readiness.apns.missing.joined(separator: ", ")).",
                    value: readiness.apns.configured ? "Configured" : "Host setup required",
                    level: readiness.apns.configured ? .ready : .attention
                )
                ReadinessRow(
                    title: "APNs environment",
                    detail: "The app build uses \(model.appAPNSEnvironment); the host uses \(readiness.apns.environment).",
                    value: apnsEnvironmentMatches ? "Matched" : "Mismatch",
                    level: apnsEnvironmentMatches ? .ready : .attention
                )
                ReadinessRow(
                    title: "APNs topic",
                    detail: "The signed app uses \(appBundleID); the host sends to \(readiness.apns.bundleId).",
                    value: apnsBundleMatches ? "Matched" : "Mismatch",
                    level: apnsBundleMatches ? .ready : .attention
                )
                ReadinessRow(
                    title: "Host universal-link file",
                    detail: readiness.universalLinks.hostAssociationConfigured
                        ? "The host can publish its Apple app-site association for \(readiness.universalLinks.associatedAppId)."
                        : "Set COOPER_IOS_ASSOCIATED_APP_ID on the final HTTPS host.",
                    value: readiness.universalLinks.hostAssociationConfigured ? "Configured" : "Host setup required",
                    level: readiness.universalLinks.hostAssociationConfigured ? .ready : .attention
                )
                ReadinessRow(
                    title: "Signed app domain entitlement",
                    detail: appAssociatedDomainsConfigured
                        ? "This build declares the final associated domain."
                        : "The repository intentionally leaves the final domain out until the production host and Apple Team are known.",
                    value: appAssociatedDomainsConfigured ? "Configured" : "Signing gate",
                    level: appAssociatedDomainsConfigured ? .ready : .deviceGate
                )
            }

            Section("Meetings") {
                ReadinessRow(
                    title: "Calendar conference handoff",
                    detail: "Decoded conference URLs open in the installed meeting app or browser without copying passcodes into logs.",
                    value: conferenceMeetingCount == 1 ? "1 join link" : "\(conferenceMeetingCount) join links",
                    level: conferenceMeetingCount > 0 ? .ready : .informational
                )
                ReadinessRow(
                    title: "Web Zoom Meeting SDK",
                    detail: "This reports the existing desktop/web embedded-room credential boundary.",
                    value: readiness.meetings.webZoomSDKConfigured ? "Host configured" : "Optional setup",
                    level: readiness.meetings.webZoomSDKConfigured ? .ready : .informational
                )
                ReadinessRow(
                    title: "Native embedded meeting room",
                    detail: "iOS currently uses the honest external handoff. An embedded room still needs a Zoom iOS SDK decision, signing, and audio-coexistence validation.",
                    value: readiness.meetings.nativeEmbeddedSDKConfigured ? "Integrated" : "Future milestone",
                    level: readiness.meetings.nativeEmbeddedSDKConfigured ? .ready : .deviceGate
                )
            }

            Section("Accessibility evidence") {
                ReadinessRow(
                    title: "Dynamic Type",
                    detail: "This checklist and Settings use semantic system text styles and reflow vertically.",
                    value: dynamicTypeSize.isAccessibilitySize ? "Accessibility size active" : "System size active",
                    level: .ready
                )
                ReadinessRow(
                    title: "VoiceOver semantics",
                    detail: "Status rows combine their title, evidence, and result; icon-only actions have explicit labels.",
                    value: "Named controls",
                    level: .ready
                )
                ReadinessRow(
                    title: "Physical-device audit",
                    detail: "Complete VoiceOver focus order, large-text clipping, microphone, interruption, Bluetooth, and background-delivery checks on a provisioned iPhone.",
                    value: "Still required",
                    level: .deviceGate
                )
            }

            Section {
                Text(lastCheckedText)
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(Color.cooperCanvas)
        .navigationTitle("Device Readiness")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    refresh()
                } label: {
                    if model.isRefreshing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .accessibilityLabel("Refresh device readiness")
                .accessibilityIdentifier("refresh-device-readiness")
                .disabled(model.isRefreshing)
            }
        }
        .task {
            microphonePermission = .current
            if !model.isPreviewMode { await model.refreshDeviceReadiness() }
        }
    }

    private func refresh() {
        microphonePermission = .current
        Task { await model.refreshDeviceReadiness() }
    }

    private var runtimeBadge: String {
#if targetEnvironment(simulator)
        "Simulator evidence"
#else
        "iPhone evidence"
#endif
    }

    private var physicalAudioValue: String {
#if targetEnvironment(simulator)
        "Physical device required"
#else
        "Ready to exercise"
#endif
    }

    private var physicalAudioDetail: String {
#if targetEnvironment(simulator)
        "Simulator proves navigation and transport integration, not the iPhone microphone, receiver, speaker, Bluetooth, or interruption behavior."
#else
        "Run a live voice turn through microphone, speaker, receiver, Bluetooth, interruption, and reconnect paths before release."
#endif
    }

    private var physicalAudioLevel: ReadinessLevel {
#if targetEnvironment(simulator)
        .deviceGate
#else
        .informational
#endif
    }

    private var lastCheckedText: String {
        guard !readiness.generatedAt.isEmpty else { return "Host readiness has not been checked yet." }
        return "Host readiness checked \(readiness.generatedAt.cooperDateTime). Local permissions are read directly from this installation."
    }
}

private struct ReadinessRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let title: String
    let detail: String
    let value: String
    let level: ReadinessLevel

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: level.systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(level.color)
                .frame(width: 22, alignment: .center)
                .accessibilityHidden(true)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) {
                    evidence
                    result
                }
            } else {
                HStack(alignment: .top, spacing: 8) {
                    evidence
                    Spacer(minLength: 8)
                    result
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(value). \(detail)")
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.cooperInk)
            Text(detail)
                .font(.caption)
                .foregroundStyle(Color.cooperMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var result: some View {
        Text(value)
            .font(.caption.weight(.semibold))
            .foregroundStyle(level.color)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private enum ReadinessLevel {
    case ready
    case attention
    case deviceGate
    case informational

    var systemImage: String {
        switch self {
        case .ready: "checkmark.circle.fill"
        case .attention: "exclamationmark.triangle.fill"
        case .deviceGate: "iphone.gen3"
        case .informational: "info.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .ready: Color.cooperSuccess
        case .attention: Color.cooperDanger
        case .deviceGate, .informational: Color.cooperMuted
        }
    }
}

private enum MicrophonePermission: Equatable {
    case undetermined
    case denied
    case granted

    static var current: MicrophonePermission {
        switch AVAudioApplication.shared.recordPermission {
        case .undetermined: .undetermined
        case .denied: .denied
        case .granted: .granted
        @unknown default: .undetermined
        }
    }

    var label: String {
        switch self {
        case .undetermined: "Not requested"
        case .denied: "Blocked in Settings"
        case .granted: "Allowed"
        }
    }

    var detail: String {
        switch self {
        case .undetermined: "Cooper asks only when you enter a live Voice session."
        case .denied: "Allow microphone access in iOS Settings before starting Voice."
        case .granted: "This installation may capture audio while a live Voice session is active."
        }
    }

    var level: ReadinessLevel {
        switch self {
        case .granted: .ready
        case .undetermined: .informational
        case .denied: .attention
        }
    }
}

#Preview("Device readiness") {
    NavigationStack { DeviceReadinessView() }
        .environment({
            let model = AppModel()
            model.today = .preview
            model.deviceReadiness = .preview
            model.mobilePush = .preview
            model.notificationAuthorization = .authorized
            model.notificationsEnabled = true
            model.isRemotePushRegistered = false
            model.phase = .ready
            return model
        }())
}
