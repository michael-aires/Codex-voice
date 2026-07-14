import SwiftUI

extension Color {
    static let cooperInk = Color(red: 45 / 255, green: 44 / 255, blue: 45 / 255)
    static let cooperMuted = Color(red: 116 / 255, green: 116 / 255, blue: 123 / 255)
    static let cooperCanvas = Color(red: 251 / 255, green: 251 / 255, blue: 248 / 255)
    static let cooperSoft = Color(red: 243 / 255, green: 243 / 255, blue: 239 / 255)
    static let cooperLine = Color(red: 228 / 255, green: 228 / 255, blue: 223 / 255)
    static let cooperVolt = Color(red: 240 / 255, green: 222 / 255, blue: 74 / 255)
    static let cooperSuccess = Color(red: 37 / 255, green: 118 / 255, blue: 74 / 255)
    static let cooperDanger = Color(red: 217 / 255, green: 71 / 255, blue: 71 / 255)
}

struct CooperMark: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var compact = false

    private var resolvedCompact: Bool { compact || dynamicTypeSize.isAccessibilitySize }

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: resolvedCompact ? 7 : 9)
                    .fill(Color.cooperInk)
                Circle()
                    .trim(from: 0.14, to: 0.86)
                    .stroke(Color.cooperVolt, style: StrokeStyle(lineWidth: resolvedCompact ? 3 : 4, lineCap: .round))
                    .rotationEffect(.degrees(90))
                    .padding(resolvedCompact ? 7 : 9)
            }
            .frame(width: resolvedCompact ? 32 : 42, height: resolvedCompact ? 32 : 42)

            if !resolvedCompact {
                VStack(alignment: .leading, spacing: 1) {
                    Text("COOPER")
                        .font(.system(.headline, design: .rounded, weight: .black))
                        .tracking(0.5)
                    Text("AIRES SESSION OS")
                        .font(.caption2.weight(.semibold).monospaced())
                        .foregroundStyle(Color.cooperMuted)
                        .tracking(0.8)
                }
                .foregroundStyle(Color.cooperInk)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cooper, AIRES Session OS")
    }
}

struct SectionHeading: View {
    let eyebrow: String
    let title: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow.uppercased())
                    .font(.caption.weight(.bold).monospaced())
                    .tracking(0.7)
                    .foregroundStyle(Color.cooperMuted)
                Text(title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Color.cooperInk)
            }
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.cooperMuted)
            }
        }
    }
}

struct SourceStatusPill: View {
    let source: SourceStatus

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(source.isConnected ? Color.cooperSuccess : Color.cooperDanger)
                .frame(width: 7, height: 7)
            VStack(alignment: .leading, spacing: 2) {
                Text(source.label)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.cooperInk)
                    .lineLimit(1)
                Text(source.isConnected ? "\(source.count) loaded" : source.status.replacingOccurrences(of: "_", with: " "))
                    .font(.caption2)
                    .foregroundStyle(Color.cooperMuted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.cooperLine, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

struct StatusBadge: View {
    let text: String
    var connected = false
    var emphasized = false

    var body: some View {
        Text(text.replacingOccurrences(of: "_", with: " ").uppercased())
            .font(.caption2.weight(.bold).monospaced())
            .tracking(0.5)
            .foregroundStyle(connected ? Color.cooperSuccess : Color.cooperInk)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(emphasized ? Color.cooperVolt : Color.cooperSoft, in: Capsule())
    }
}

struct InlineMessage: View {
    let text: String
    var isError = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: isError ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(isError ? Color.cooperDanger : Color.cooperInk)
            Text(text)
                .font(.footnote)
                .foregroundStyle(Color.cooperInk)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(isError ? Color.cooperDanger.opacity(0.08) : Color.cooperVolt.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
    }
}

struct EmptyContent: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(Color.cooperMuted)
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.cooperInk)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.cooperMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

extension String {
    var cooperDateTime: String {
        guard let date = ISO8601DateFormatter().date(from: self) else { return self }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

extension Int {
    var cooperDuration: String {
        guard self > 0 else { return "Under a minute" }
        let minutes = self / 60
        let hours = minutes / 60
        let remainder = minutes % 60
        if hours > 0 { return remainder > 0 ? "\(hours)h \(remainder)m" : "\(hours)h" }
        return "\(Swift.max(1, minutes))m"
    }
}
