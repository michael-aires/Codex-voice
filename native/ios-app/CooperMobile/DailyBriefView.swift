import SwiftUI

struct DailyBriefSummaryCard: View {
    @Environment(AppModel.self) private var model
    @State private var openedBrief: DailyBrief?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("DAILY CATCH UP")
                        .font(.caption.weight(.bold).monospaced())
                        .tracking(0.8)
                        .foregroundStyle(Color.cooperMuted)
                    Text("Calendar and sprint, briefed together")
                        .font(.title3.bold())
                        .foregroundStyle(Color.cooperInk)
                }
                Spacer()
                if model.isRefreshingDailyBrief {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Refreshing Daily Catch Up")
                } else if model.dailyBrief != nil {
                    StatusBadge(text: "Ready", connected: true)
                }
            }

            if let brief = model.dailyBrief {
                Text(brief.summary)
                    .font(.body)
                    .foregroundStyle(Color.cooperInk)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 0) {
                    briefMetric(value: String(brief.meetings.count), label: "Meetings")
                    Divider().frame(height: 34)
                    briefMetric(value: String(brief.tasks.count), label: "Tickets")
                    Divider().frame(height: 34)
                    briefMetric(value: String(brief.slides.count), label: "Slides")
                }
                .padding(.vertical, 10)
                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))

                if !brief.assignment.message.isEmpty {
                    Label(brief.assignment.message, systemImage: "person.crop.circle.badge.checkmark")
                        .font(.caption)
                        .foregroundStyle(Color.cooperMuted)
                }

                HStack(spacing: 10) {
                    Button {
                        openedBrief = brief
                    } label: {
                        Label("Open brief", systemImage: "rectangle.stack")
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.cooperInk)
                    .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
                    .accessibilityIdentifier("open-daily-catch-up")

                    Button {
                        Task { await model.refreshDailyBrief() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.cooperInk)
                    .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("Refresh Daily Catch Up")
                    .disabled(model.isRefreshingDailyBrief || model.isPreviewMode)
                }
            } else if let error = model.dailyBriefError {
                InlineMessage(text: error, isError: true)
            } else {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Building today’s four-slide briefing from Calendar and Notion…")
                        .font(.subheadline)
                        .foregroundStyle(Color.cooperMuted)
                }
            }
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.cooperLine) }
        .sheet(item: $openedBrief) { brief in
            let visibleBrief = model.dailyBrief ?? brief
            NavigationStack {
                DailyBriefDeckView(
                    brief: visibleBrief,
                    onRefresh: {
                        await model.refreshDailyBrief()
                    },
                    onPresent: {
                        model.presentDailyBrief(model.dailyBrief ?? visibleBrief)
                    }
                )
            }
        }
        .task {
            guard ProcessInfo.processInfo.arguments.contains("--open-daily-brief") else { return }
            openedBrief = model.dailyBrief
        }
    }

    private func briefMetric(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(Color.cooperInk)
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.cooperMuted)
        }
        .frame(maxWidth: .infinity)
    }
}

struct DailyBriefDeckView: View {
    @Environment(\.dismiss) private var dismiss

    let brief: DailyBrief
    var playbackText = ""
    var isLive = false
    var onRefresh: (() async -> Void)?
    var onPresent: (() -> Void)?

    @State private var activeIndex = 0
    @State private var isRefreshing = false

    private var activeSlide: DailyBriefSlide? {
        guard !brief.slides.isEmpty else { return nil }
        return brief.slides[min(max(activeIndex, 0), brief.slides.count - 1)]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                deckHeader
                if let slide = activeSlide {
                    slideCard(slide)
                        .id(slide.id)
                        .transition(.opacity.combined(with: .move(edge: .trailing)))
                } else {
                    EmptyContent(
                        icon: "rectangle.stack",
                        title: "No briefing slides",
                        message: "Refresh Daily Catch Up to rebuild the persisted presentation."
                    )
                }
            }
            .padding(18)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.cooperCanvas)
        .navigationTitle("Daily Catch Up")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CooperMark(compact: true)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .safeAreaInset(edge: .bottom) {
            deckControls
        }
        .onChange(of: playbackText) { _, transcript in
            synchronizePlayback(with: transcript)
        }
        .onAppear { synchronizePlayback(with: playbackText, animated: false) }
        .accessibilityIdentifier("daily-catch-up-deck")
    }

    private var deckHeader: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(brief.dateLabel.uppercased())
                    .font(.caption2.weight(.bold).monospaced())
                    .tracking(0.7)
                    .foregroundStyle(Color.cooperMuted)
                Spacer()
                StatusBadge(
                    text: isLive ? "Following Cooper" : "Latest saved brief",
                    connected: isLive,
                    emphasized: isLive
                )
            }
            Text(brief.summary)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
            Text("Slide \(min(activeIndex + 1, max(brief.slides.count, 1))) of \(brief.slides.count)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(Color.cooperMuted)
        }
    }

    private func slideCard(_ slide: DailyBriefSlide) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 10) {
                Text(slide.eyebrow.uppercased())
                    .font(.caption.weight(.bold).monospaced())
                    .tracking(0.8)
                    .foregroundStyle(Color.cooperMuted)
                Text(slide.title)
                    .font(.title.bold())
                    .foregroundStyle(Color.cooperInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text(slide.narrative)
                    .font(.body)
                    .foregroundStyle(Color.cooperMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !slide.metrics.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 10)], spacing: 10) {
                    ForEach(slide.metrics) { metric in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(metric.value)
                                .font(.title2.bold().monospacedDigit())
                                .foregroundStyle(Color.cooperInk)
                            Text(metric.label)
                                .font(.caption)
                                .foregroundStyle(Color.cooperMuted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            }

            if !slide.items.isEmpty {
                VStack(spacing: 0) {
                    ForEach(slide.items) { item in
                        HStack(alignment: .top, spacing: 12) {
                            Text(item.lead)
                                .font(.caption.bold().monospaced())
                                .foregroundStyle(Color.cooperMuted)
                                .frame(width: 58, alignment: .leading)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(Color.cooperInk)
                                if !item.detail.isEmpty {
                                    Text(item.detail)
                                        .font(.caption)
                                        .foregroundStyle(Color.cooperMuted)
                                }
                            }
                            Spacer(minLength: 8)
                            if !item.status.isEmpty {
                                StatusBadge(text: item.status, emphasized: item.status.localizedCaseInsensitiveContains("next"))
                            }
                        }
                        .padding(.vertical, 12)
                        .overlay(alignment: .bottom) { Rectangle().fill(Color.cooperLine).frame(height: 1) }
                    }
                }
            }

            if isLive {
                Label("Slides advance when Cooper speaks each saved transition cue.", systemImage: "waveform")
                    .font(.caption)
                    .foregroundStyle(Color.cooperMuted)
            }
        }
        .padding(20)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.cooperLine) }
    }

    private var deckControls: some View {
        VStack(spacing: 11) {
            HStack(spacing: 12) {
                Button {
                    withAnimation { activeIndex = max(0, activeIndex - 1) }
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                .disabled(activeIndex == 0)
                .accessibilityLabel("Previous briefing slide")

                HStack(spacing: 8) {
                    ForEach(Array(brief.slides.enumerated()), id: \.element.id) { index, slide in
                        Button {
                            withAnimation { activeIndex = index }
                        } label: {
                            Circle()
                                .fill(index == activeIndex ? Color.cooperInk : Color.cooperLine)
                                .frame(width: 8, height: 8)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Open \(slide.title)")
                    }
                }
                .frame(maxWidth: .infinity)

                Button {
                    withAnimation { activeIndex = min(max(brief.slides.count - 1, 0), activeIndex + 1) }
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                .disabled(activeIndex >= brief.slides.count - 1)
                .accessibilityLabel("Next briefing slide")
            }

            if !isLive && (onRefresh != nil || onPresent != nil) {
                HStack(spacing: 10) {
                    if let onRefresh {
                        Button {
                            Task {
                                isRefreshing = true
                                await onRefresh()
                                isRefreshing = false
                            }
                        } label: {
                            Label(isRefreshing ? "Refreshing" : "Latest data", systemImage: "arrow.clockwise")
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                        }
                        .buttonStyle(.plain)
                        .background(Color.cooperSoft, in: RoundedRectangle(cornerRadius: 8))
                        .disabled(isRefreshing)
                    }
                    if let onPresent {
                        Button {
                            dismiss()
                            Task { @MainActor in
                                try? await Task.sleep(for: .milliseconds(250))
                                onPresent()
                            }
                        } label: {
                            Label("Present with Cooper", systemImage: "waveform")
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.cooperInk)
                        .background(Color.cooperVolt, in: RoundedRectangle(cornerRadius: 8))
                        .accessibilityIdentifier("present-daily-catch-up")
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 11)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(Color.cooperLine).frame(height: 1) }
    }

    private func synchronizePlayback(with transcript: String, animated: Bool = true) {
        guard isLive else { return }
        let nextIndex = DailyBriefPresentation.slideIndex(
            slides: brief.slides,
            transcript: transcript,
            currentIndex: activeIndex
        )
        guard nextIndex != activeIndex else { return }
        if animated {
            withAnimation(.easeInOut(duration: 0.24)) { activeIndex = nextIndex }
        } else {
            activeIndex = nextIndex
        }
    }
}

#Preview("Daily Catch Up") {
    NavigationStack {
        DailyBriefDeckView(brief: .preview, isLive: true)
    }
}
