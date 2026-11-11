import SwiftUI
import WidgetKit

// «اختصارات بُعد»: a home-screen widget with the quick creates. It holds no data and needs no sign-in of its
// own: every button is a link «buad://new/…» that the app opens straight to the form (BuadApp/Features/Routing.swift).
//
// NOT part of the build yet. To turn it on: a Widget Extension target (bundle id sa.buad.app.widget) with this
// file, its App ID and provisioning profile on Apple's side, and the profile name added to the TestFlight workflow.

struct ShortcutsEntry: TimelineEntry { let date: Date }

struct ShortcutsProvider: TimelineProvider {
    func placeholder(in context: Context) -> ShortcutsEntry { ShortcutsEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (ShortcutsEntry) -> Void) { completion(ShortcutsEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ShortcutsEntry>) -> Void) {
        completion(Timeline(entries: [ShortcutsEntry(date: Date())], policy: .never))
    }
}

struct ShortcutsView: View {
    private let items: [(title: String, icon: String, link: String)] = [
        ("فرصة", "scope", "buad://new/opportunity"),
        ("عميل", "person.crop.circle.badge.plus", "buad://new/client"),
        ("مهمة", "checklist", "buad://new/task"),
        ("عرض سعر", "doc.text", "buad://new/quote"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("بُعد").font(.headline)
            HStack(spacing: 10) {
                ForEach(items, id: \.link) { x in
                    Link(destination: URL(string: x.link)!) {
                        VStack(spacing: 6) {
                            Image(systemName: x.icon).font(.title3)
                            Text(x.title).font(.caption2.weight(.medium))
                        }
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(4)
        .containerBackground(.background, for: .widget)
    }
}

@main
struct BuadShortcutsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BuadShortcuts", provider: ShortcutsProvider()) { _ in ShortcutsView() }
            .configurationDisplayName("اختصارات بُعد")
            .description("أنشئ فرصة أو عميلاً أو مهمة أو عرض سعر بلمسة.")
            .supportedFamilies([.systemMedium])
    }
}
