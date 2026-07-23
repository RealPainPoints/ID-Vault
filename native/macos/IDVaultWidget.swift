import Foundation
import SwiftUI
import WidgetKit

private let appGroupIdentifier = "99564YDV39.com.idvault.shared"
private let widgetKind = "com.idvault.desktop.quick-access"
private let snapshotName = "widget-snapshot.json"

private struct DetailSnapshot: Codable, Identifiable {
    let id: String
    let label: String
    let value: String
}

private struct DocumentSnapshot: Codable, Identifiable {
    let id: String
    let title: String
    let kind: String
    let expiresAt: String?
}

private struct VaultSnapshot: Codable {
    let version: Int
    let revision: String
    let updatedAt: String
    let details: [DetailSnapshot]
    let documents: [DocumentSnapshot]

    static let empty = VaultSnapshot(
        version: 1,
        revision: "empty",
        updatedAt: "",
        details: [],
        documents: []
    )

    static let preview = VaultSnapshot(
        version: 1,
        revision: "preview",
        updatedAt: "",
        details: [
            DetailSnapshot(id: "tax", label: "Tax ID", value: "•• ••• •• 901"),
            DetailSnapshot(id: "vat", label: "VAT ID", value: "•••••••6789"),
            DetailSnapshot(id: "passport", label: "Passport", value: "•••••0T47")
        ],
        documents: [
            DocumentSnapshot(id: "passport", title: "Passport", kind: "passport", expiresAt: nil),
            DocumentSnapshot(id: "identity", title: "Identity card", kind: "identity-card", expiresAt: nil)
        ]
    )
}

private enum SnapshotStore {
    static func load() -> VaultSnapshot {
        guard
            let root = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: appGroupIdentifier
            ),
            let data = try? Data(contentsOf: root.appendingPathComponent(snapshotName)),
            data.count <= 1_048_576,
            let snapshot = try? JSONDecoder().decode(VaultSnapshot.self, from: data),
            snapshot.version == 1
        else {
            return .empty
        }
        return snapshot
    }
}

private struct VaultEntry: TimelineEntry {
    let date: Date
    let snapshot: VaultSnapshot
}

private struct VaultProvider: TimelineProvider {
    func placeholder(in context: Context) -> VaultEntry {
        VaultEntry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (VaultEntry) -> Void) {
        completion(VaultEntry(date: Date(), snapshot: context.isPreview ? .preview : SnapshotStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VaultEntry>) -> Void) {
        let entry = VaultEntry(date: Date(), snapshot: SnapshotStore.load())
        let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: entry.date) ?? entry.date
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }
}

private struct VaultShield: Shape {
    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + rect.width * x, y: rect.minY + rect.height * y)
        }

        var path = Path()
        path.move(to: point(0.5, 0))
        path.addLine(to: point(1, 0.14))
        path.addLine(to: point(1, 0.44))
        path.addCurve(
            to: point(0.5, 1),
            control1: point(1, 0.72),
            control2: point(0.79, 0.91)
        )
        path.addCurve(
            to: point(0, 0.44),
            control1: point(0.21, 0.91),
            control2: point(0, 0.72)
        )
        path.addLine(to: point(0, 0.14))
        path.closeSubpath()
        return path
    }
}

private struct VaultCheck: Shape {
    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + rect.width * x, y: rect.minY + rect.height * y)
        }

        var path = Path()
        path.move(to: point(0.23, 0.48))
        path.addLine(to: point(0.41, 0.62))
        path.addLine(to: point(0.77, 0.31))
        return path
    }
}

private struct VaultLogoMark: View {
    private let checkStroke = StrokeStyle(lineWidth: 2.3, lineCap: .round, lineJoin: .round)

    var body: some View {
        ZStack {
            VaultShield()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.20, green: 0.48, blue: 0.41),
                            Color(red: 0.08, green: 0.28, blue: 0.24)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            VaultShield()
                .stroke(
                    LinearGradient(
                        colors: [
                            Color(red: 0.84, green: 0.95, blue: 0.91),
                            Color(red: 0.35, green: 0.67, blue: 0.58),
                            Color(red: 0.04, green: 0.20, blue: 0.17)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1.1
                )
            VaultCheck()
                .stroke(Color(red: 0.02, green: 0.18, blue: 0.15).opacity(0.55), style: checkStroke)
                .offset(y: 0.7)
            VaultCheck()
                .stroke(
                    LinearGradient(
                        colors: [.white, Color(red: 0.86, green: 0.94, blue: 0.91)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: checkStroke
                )
        }
        .accessibilityHidden(true)
    }
}

private struct VaultWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: VaultEntry

    private var detailLimit: Int {
        switch family {
        case .systemSmall: 2
        case .systemMedium: 3
        default: 5
        }
    }

    private var documentLimit: Int {
        switch family {
        case .systemSmall: 0
        case .systemMedium: 2
        default: 4
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if entry.snapshot.details.isEmpty && entry.snapshot.documents.isEmpty {
                emptyState
            } else if family == .systemMedium {
                HStack(alignment: .top, spacing: 16) {
                    details
                    Divider().opacity(0.45)
                    documents
                }
            } else {
                details
                if documentLimit > 0 && !entry.snapshot.documents.isEmpty {
                    Divider().opacity(0.45)
                    documents
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [
                    Color(red: 0.075, green: 0.095, blue: 0.085),
                    Color(red: 0.11, green: 0.135, blue: 0.12)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .widgetURL(URL(string: "idvault://open?view=overview"))
    }

    private var header: some View {
        HStack(spacing: 9) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(red: 0.48, green: 0.70, blue: 0.63).opacity(0.22))
                VaultLogoMark()
                    .frame(width: 14, height: 18)
            }
            .frame(width: 28, height: 28)
            Text("ID Vault")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4))
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            if family != .systemSmall {
                sectionLabel("QUICK DETAILS")
            }
            ForEach(entry.snapshot.details.prefix(detailLimit)) { detail in
                Link(destination: URL(string: "idvault://open?view=details&id=\(detail.id)")!) {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(detail.label)
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundStyle(.white.opacity(0.55))
                                .lineLimit(1)
                            Text(detail.value)
                                .font(.system(size: 13, weight: .semibold, design: .rounded))
                                .foregroundStyle(.white.opacity(0.94))
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                                .privacySensitive()
                        }
                        Spacer(minLength: 4)
                        if family != .systemSmall {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.white.opacity(0.24))
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            if entry.snapshot.details.isEmpty {
                Text("Choose details in ID Vault")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var documents: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("DOCUMENTS")
            ForEach(entry.snapshot.documents.prefix(documentLimit)) { document in
                Link(destination: URL(string: "idvault://open?view=documents&id=\(document.id)")!) {
                    HStack(spacing: 8) {
                        Image(systemName: documentSymbol(document.kind))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color(red: 0.61, green: 0.84, blue: 0.76))
                            .frame(width: 17)
                        Text(document.title)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(.white.opacity(0.82))
                            .lineLimit(1)
                        Spacer(minLength: 2)
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.white.opacity(0.24))
                    }
                }
                .buttonStyle(.plain)
            }
            if entry.snapshot.documents.isEmpty {
                Text("Add documents in ID Vault")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Color(red: 0.61, green: 0.84, blue: 0.76))
            Text("Add your first detail")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
            Text("Open ID Vault to choose what appears here.")
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.5))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sectionLabel(_ value: String) -> some View {
        Text(value)
            .font(.system(size: 8, weight: .bold, design: .rounded))
            .tracking(0.8)
            .foregroundStyle(.white.opacity(0.34))
    }

    private func documentSymbol(_ kind: String) -> String {
        switch kind {
        case "passport": "book.closed.fill"
        case "identity-card": "person.text.rectangle.fill"
        case "driver-license": "car.fill"
        case "tax-document": "doc.text.fill"
        case "certificate": "seal.fill"
        default: "doc.fill"
        }
    }
}

private struct IDVaultSystemWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: widgetKind, provider: VaultProvider()) { entry in
            VaultWidgetView(entry: entry)
        }
        .configurationDisplayName("ID Vault Quick Access")
        .description("See masked identity details and open stored documents.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

@main
struct IDVaultWidgetBundle: WidgetBundle {
    var body: some Widget {
        IDVaultSystemWidget()
    }
}
