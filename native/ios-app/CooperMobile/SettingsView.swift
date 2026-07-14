import SwiftUI
import UIKit

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    var body: some View {
        @Bindable var model = model

        Form {
            Section {
                HStack(spacing: 14) {
                    CooperMark()
                    Spacer()
                    StatusBadge(text: model.isPreviewMode ? "Simulator preview" : "Connected", connected: !model.isPreviewMode, emphasized: model.isPreviewMode)
                }
                .padding(.vertical, 8)
            }
            .listRowBackground(Color.white)

            Section("Deployment") {
                NavigationLink {
                    DeviceReadinessView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Device readiness")
                            Text("Signing, audio, APNs, app links, meetings, and accessibility")
                                .font(.caption)
                                .foregroundStyle(Color.cooperMuted)
                        }
                    } icon: {
                        Image(systemName: "checkmark.shield")
                            .foregroundStyle(Color.cooperInk)
                    }
                }
                .accessibilityIdentifier("open-device-readiness")
            }

            Section("Alerts and app links") {
                LabeledContent("Notification permission", value: model.notificationAuthorization.label)
                LabeledContent("Cooper alerts", value: model.notificationsEnabled ? "On" : "Off")
                LabeledContent("Delivery", value: pushDeliveryLabel)
                LabeledContent("Registered devices", value: "\(model.mobilePush.registeredDevices)")
                if model.mobilePush.pendingEvents > 0 {
                    LabeledContent("Queued events", value: "\(model.mobilePush.pendingEvents)")
                }
                LabeledContent("Universal links", value: model.mobilePush.associatedAppId.isEmpty ? "Domain pending" : "Host ready")

                if model.notificationAuthorization == .denied {
                    Button("Open iOS notification settings") {
                        guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
                        openURL(url)
                    }
                } else if model.notificationsEnabled {
                    Button("Pause Cooper alerts", role: .destructive) {
                        Task { await model.disableNotifications() }
                    }
                } else {
                    Button("Enable actionable alerts") {
                        Task { await model.enableNotifications() }
                    }
                }

                if let error = model.remotePushRegistrationError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(Color.cooperDanger)
                }

                Text("Approval, Operator completion, and artifact-ready alerts open the exact task or result. APNs delivery is used when both this iPhone and the Cooper host are configured; otherwise local foreground alerts remain the safe fallback. cooper:// links work now, while HTTPS universal links require the signed app's final associated domain.")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }

            Section("Cooper host") {
                TextField("Server URL", text: $model.serverAddress)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textContentType(.URL)

                Button("Save and reconnect") {
                    Task { await model.saveServerAndReconnect() }
                }
                .disabled(model.isPreviewMode)

                Text("The iOS app keeps only this host address. Authentication remains in the server session cookie; provider secrets stay on the Cooper host. Use HTTPS for a physical device or deployed host so microphone capture and WebRTC remain available.")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }

            Section("Connected context") {
                SettingsStatusRow(label: "Google Calendar", source: model.today.sources.calendar)
                SettingsStatusRow(label: "Notion", source: model.today.sources.notion)
                LabeledContent("Arcade") {
                    Text(model.arcade.configured ? "Configured" : "Setup required")
                        .foregroundStyle(model.arcade.configured ? Color.cooperSuccess : Color.cooperDanger)
                }
                LabeledContent("Arcade user", value: model.arcade.userId.isEmpty ? "—" : model.arcade.userId)
                LabeledContent("Write tools", value: model.arcade.writesEnabled ? "Enabled" : "Blocked")
            }

            Section("Recent tool activity") {
                if model.toolCalls.isEmpty {
                    Text("Tool calls made through Cooper will appear here with their approval risk and result state.")
                        .font(.caption)
                        .foregroundStyle(Color.cooperMuted)
                } else {
                    ForEach(Array(model.toolCalls.prefix(5))) { toolCall in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(toolCall.toolName.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(.subheadline.bold())
                                Spacer()
                                StatusBadge(
                                    text: toolCall.status.replacingOccurrences(of: "_", with: " "),
                                    connected: toolCall.isSuccessful,
                                    emphasized: toolCall.riskLevel == "write"
                                )
                            }
                            Text(toolCall.arcadeToolName ?? "Cooper host tool")
                                .font(.caption2.monospaced())
                                .foregroundStyle(Color.cooperMuted)
                            if let error = toolCall.error, !error.isEmpty {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(Color.cooperDanger)
                            } else if !toolCall.resultSummary.isEmpty {
                                Text(toolCall.resultSummary)
                                    .font(.caption)
                                    .foregroundStyle(Color.cooperMuted)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            Section("Delivery status") {
                LabeledContent("Current milestone", value: "Native parity audit")
                LabeledContent("Available", value: "Today · Brief · Sessions · Chat · Voice · Canvas · Operator · Library · Alerts · PDF · Word · PowerPoint · Excel")
                LabeledContent("Next", value: "Provisioned iPhone audio · APNs · signed distribution")
                Text("Repository-owned native workflows are present and Simulator-verified. Apple signing, physical-device audio, live APNs delivery, the final associated domain, and any native embedded-meeting SDK remain explicit deployment or product-decision gates.")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }

            Section {
                Button("Sign out", role: .destructive) {
                    Task { await model.signOut() }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.cooperCanvas)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
        }
    }

    private var pushDeliveryLabel: String {
        if model.isRemotePushRegistered, model.mobilePush.configured { return "Remote APNs" }
        if model.isRemotePushRegistered { return "Device registered · host pending" }
        return "Local fallback"
    }
}

private struct SettingsStatusRow: View {
    let label: String
    let source: SourceStatus

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 6) {
                Circle()
                    .fill(source.isConnected ? Color.cooperSuccess : Color.cooperDanger)
                    .frame(width: 7, height: 7)
                Text(source.isConnected ? "Connected" : source.status.replacingOccurrences(of: "_", with: " "))
            }
        }
    }
}

#Preview("Settings") {
    NavigationStack { SettingsView() }
        .environment({
            let model = AppModel()
            model.today = .preview
            model.arcade = .preview
            model.phase = .ready
            return model
        }())
}
