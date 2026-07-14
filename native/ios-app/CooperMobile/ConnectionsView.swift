import SwiftUI

struct ConnectionsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var allAuthorizationResults: [ArcadeAuthorizationResult] = []

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        StatusBadge(
                            text: model.arcade.configured ? "Arcade configured" : "Setup required",
                            connected: model.arcade.configured,
                            emphasized: !model.arcade.configured
                        )
                        Spacer()
                        if model.isPreviewMode { StatusBadge(text: "Preview", emphasized: true) }
                    }
                    Text("Connected context")
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.cooperInk)
                    Text("Arcade keeps provider OAuth and tool authorization on the Cooper host. This app receives connection state and opens secure authorization handoffs—it never stores provider API keys.")
                        .font(.body)
                        .foregroundStyle(Color.cooperMuted)
                }

                if let message = model.actionMessage {
                    InlineMessage(text: message, isError: message.localizedCaseInsensitiveContains("missing") || message.localizedCaseInsensitiveContains("error"))
                }

                if let error = model.arcadeDiscovery.error, !error.isEmpty {
                    InlineMessage(text: error, isError: true)
                }

                VStack(alignment: .leading, spacing: 14) {
                    SectionHeading(eyebrow: "Providers", title: "Workspace sources", trailing: "OAuth via Arcade")

                    if model.arcadeDiscovery.services.isEmpty {
                        EmptyContent(icon: "point.3.connected.trianglepath.dotted", title: "No providers discovered", message: "Configure Arcade on the Cooper host, then refresh this page.")
                    } else {
                        ForEach(model.arcadeDiscovery.services) { service in
                            ProviderCard(service: service) {
                                Task {
                                    if let url = await model.beginConnection(for: service) {
                                        openURL(url)
                                    }
                                }
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    SectionHeading(eyebrow: "Tool access", title: "Mapped capabilities", trailing: model.arcade.writesEnabled ? "Writes enabled" : "Writes blocked")
                    if !model.arcade.tools.filter(\.mapped).isEmpty {
                        Button("Authorize all mapped tools") {
                            Task {
                                allAuthorizationResults = await model.prepareAllArcadeAuthorizations()
                            }
                        }
                        .buttonStyle(.bordered)
                        .tint(Color.cooperInk)
                        .disabled(!model.arcade.configured)
                        .accessibilityIdentifier("authorize-all-arcade-tools")
                    }

                    if !allAuthorizationResults.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Complete mapped-tool authorization")
                                .font(.headline)
                                .foregroundStyle(Color.cooperInk)
                            Text("Arcade keeps each provider consent step separate. Open every link, finish it in the browser, then return and refresh Connections.")
                                .font(.subheadline)
                                .foregroundStyle(Color.cooperMuted)

                            ForEach(allAuthorizationResults) { result in
                                if let address = result.authorization?.authorizationUrl,
                                   let url = URL(string: address),
                                   !address.isEmpty {
                                    Button {
                                        openURL(url)
                                    } label: {
                                        Label("Authorize \(toolLabel(for: result.name))", systemImage: "arrow.up.right")
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(Color.cooperInk)
                                    .accessibilityIdentifier("open-arcade-authorization-\(result.name)")
                                }
                            }
                        }
                        .padding(14)
                        .background(Color.cooperVolt.opacity(0.16), in: RoundedRectangle(cornerRadius: 9))
                        .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.cooperVolt) }
                    }

                    if model.arcade.tools.isEmpty {
                        EmptyContent(icon: "wrench.and.screwdriver", title: "No mapped tools", message: "Add the Arcade tool mappings on the Cooper host to authorize them here.")
                    } else {
                        ForEach(model.arcade.tools) { tool in
                            ToolAuthorizationRow(
                                tool: tool,
                                authorize: {
                                    Task {
                                        if let url = await model.beginAuthorization(for: tool) {
                                            openURL(url)
                                        }
                                    }
                                },
                                check: {
                                    Task { await model.checkAuthorization(for: tool) }
                                }
                            )
                        }
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Connections")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshConnections() }
                } label: {
                    if model.isRefreshing { ProgressView() } else { Image(systemName: "arrow.clockwise") }
                }
                .accessibilityLabel("Refresh Connections")
                .disabled(model.isRefreshing || model.isPreviewMode)
            }
        }
        .refreshable { await model.refreshConnections() }
    }

    private func toolLabel(for name: String) -> String {
        model.arcade.tools.first { $0.name == name }?.label
            ?? name.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

private struct ProviderCard: View {
    let service: ArcadeService
    let connect: () -> Void

    private var systemImage: String {
        service.service.localizedCaseInsensitiveContains("calendar") ? "calendar" : "doc.text"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .frame(width: 38, height: 38)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(service.service)
                        .font(.headline)
                        .foregroundStyle(Color.cooperInk)
                    Text("\(service.toolCount) available tools · \(service.writeToolCount) write")
                        .font(.caption)
                        .foregroundStyle(Color.cooperMuted)
                }
                Spacer()
                StatusBadge(text: service.connected ? "Connected" : service.status, connected: service.connected)
            }

            if !service.scopes.isEmpty {
                Text(service.scopes.joined(separator: " · "))
                    .font(.caption2.monospaced())
                    .foregroundStyle(Color.cooperMuted)
                    .lineLimit(2)
            }

            if !service.connected {
                Button("Connect \(service.service)", action: connect)
                    .buttonStyle(.borderedProminent)
                    .tint(Color.cooperInk)
                    .disabled(!service.connectable)
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(Color.cooperLine) }
    }
}

private struct ToolAuthorizationRow: View {
    let tool: ArcadeTool
    let authorize: () -> Void
    let check: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(tool.label)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                Spacer()
                StatusBadge(text: tool.status, connected: tool.isConnected, emphasized: tool.riskLevel == "write")
            }
            Text(tool.description)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
            Text(tool.arcadeToolName.isEmpty ? tool.mappingEnv : tool.arcadeToolName)
                .font(.caption2.monospaced())
                .foregroundStyle(Color.cooperMuted)
                .lineLimit(2)

            if !tool.isConnected {
                HStack {
                    Button("Authorize", action: authorize)
                        .buttonStyle(.borderedProminent)
                        .tint(Color.cooperInk)
                        .disabled(!tool.mapped || !tool.configured)
                    if tool.authorization != nil {
                        Button("Check status", action: check)
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.cooperLine).frame(height: 1)
        }
    }
}

#Preview("Connections") {
    NavigationStack { ConnectionsView() }
        .environment({
            let model = AppModel()
            model.arcade = .preview
            model.arcadeDiscovery = .preview
            model.phase = .ready
            return model
        }())
}
