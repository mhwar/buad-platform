import SwiftUI

/// «اليوم»: the greeting and «ما يحتاج انتباهك» exactly as GET /api/attention computes it for this role.
struct TodayView: View {
    @EnvironmentObject private var session: Session
    @State private var items: [AttentionItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var unread = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Fmt.longToday()).font(.footnote.weight(.medium)).foregroundStyle(Buad.muted)
                        Text("\(Fmt.greeting())، \(session.me?.firstName ?? "")")
                            .font(.largeTitle.bold())
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("ما يحتاج انتباهك")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Buad.muted)
                            .padding(.horizontal, 16)
                        if !loaded {
                            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 28)
                        } else if let error {
                            EmptyNote(text: error, icon: "wifi.exclamationmark")
                        } else if items.isEmpty {
                            EmptyNote(text: "لا شيء يحتاج انتباهك الآن.", icon: "checkmark.circle")
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                    AttentionRow(item: item)
                                    if index < items.count - 1 { Divider().padding(.leading, 60) }
                                }
                            }
                            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                        }
                    }

                    Text("يُفتح كل بند في صفحته على الموقع في هذه النسخة، وتنتقل الصفحات إلى التطبيق مرحلةً بعد مرحلة.")
                        .font(.footnote)
                        .foregroundStyle(Buad.muted)
                        .padding(.horizontal, 16)
                }
                .padding(.horizontal, Buad.gutter)
                .padding(.vertical, 8)
            }
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("اليوم")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink {
                        NotificationsView(onUnreadChange: { unread = $0 })
                    } label: {
                        Image(systemName: unread > 0 ? "bell.badge" : "bell")
                            .symbolRenderingMode(unread > 0 ? .multicolor : .monochrome)
                            .accessibilityLabel(unread > 0 ? "الإشعارات، \(unread) غير مقروء" : "الإشعارات")
                    }
                }
            }
            .refreshable { await load() }
            .task { if !loaded { await load() } }
        }
    }

    private func load() async {
        do {
            items = try await APIClient.shared.attention()
            error = nil
            unread = (try? await APIClient.shared.notifications().unread) ?? unread
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

private struct AttentionRow: View {
    let item: AttentionItem

    var body: some View {
        let tone: Tone = item.tone == "info" ? .info : .warn
        let content = HStack(spacing: 12) {
            Text(verbatim: String(item.count))
                .font(.body.weight(.bold))
                .monospacedDigit()
                .frame(minWidth: 30, minHeight: 30)
                .background(tone.background, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .foregroundStyle(tone.foreground)
            Text(item.title)
                .font(.body.weight(.medium))
                .foregroundStyle(Buad.ink)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            Image(systemName: "chevron.left").font(.footnote.weight(.semibold)).foregroundStyle(Buad.faint)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
        .contentShape(Rectangle())

        if let url = APIClient.shared.webURL(item.link) {
            Link(destination: url) { content }
        } else {
            content
        }
    }
}
