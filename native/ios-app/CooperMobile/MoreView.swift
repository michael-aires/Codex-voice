import SwiftUI

struct MoreView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("COOPER MOBILE")
                        .font(.caption.weight(.bold).monospaced())
                        .tracking(0.8)
                        .foregroundStyle(Color.cooperMuted)
                    Text("Workspace, connections, and delivery controls")
                        .font(.title2.bold())
                        .foregroundStyle(Color.cooperInk)
                }
                .padding(.vertical, 8)
            }
            .listRowBackground(Color.cooperCanvas)

            Section("Work and memory") {
                NavigationLink {
                    ArtifactLibraryView()
                } label: {
                    MoreDestinationRow(
                        icon: "books.vertical",
                        title: "Library",
                        detail: "\(model.artifacts.count) artifacts · \(model.artifactJobs.filter(\.isActive).count) active jobs"
                    )
                }

                NavigationLink {
                    ConnectionsView()
                } label: {
                    MoreDestinationRow(
                        icon: "point.3.connected.trianglepath.dotted",
                        title: "Connections",
                        detail: "Calendar, Notion, Arcade, and write authorization"
                    )
                }
            }

            Section("Account and delivery") {
                NavigationLink {
                    SettingsView()
                } label: {
                    MoreDestinationRow(
                        icon: "gearshape",
                        title: "Settings",
                        detail: "Cooper host, account, milestone, and sign-out"
                    )
                }
            }

            Section("Current capability") {
                LabeledContent("Operator tasks", value: model.operatorState.tasks.count.formatted())
                LabeledContent("Approval queue", value: model.operatorState.limits.approvalQueue.formatted())
                LabeledContent("Connected sources", value: "Calendar · Notion · Sessions")
                LabeledContent("Arcade writes", value: model.arcade.writesEnabled ? "Enabled" : "Approval gated")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.cooperCanvas)
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
        }
    }
}

private struct MoreDestinationRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.cooperInk)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.cooperInk)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
        }
        .padding(.vertical, 5)
    }
}

#Preview("More") {
    NavigationStack { MoreView() }
        .environment({
            let model = AppModel()
            model.today = .preview
            model.operatorState = .preview
            model.artifacts = ArtifactRecord.previews
            model.artifactJobs = ArtifactJob.previews
            model.arcade = .preview
            model.phase = .ready
            return model
        }())
}
