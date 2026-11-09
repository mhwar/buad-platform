import SwiftUI

/// «الإشعارات» (GET /api/notifications): the latest 30 for this person, unread first in weight.
/// Opening one marks it read on the server (POST /api/notifications/:id/read), like the website's bell.
struct NotificationsView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.openURL) private var openURL
    @State private var items: [NotificationItem] = []
    @State private var unread = 0
    @State private var loaded = false
    @State private var error: String?
    var onUnreadChange: (Int) -> Void = { _ in }

    var body: some View {
        List {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if let error, items.isEmpty {
                EmptyNote(text: error, icon: "wifi.exclamationmark").listRowBackground(Color.clear)
            } else if items.isEmpty {
                EmptyNote(text: "لا إشعارات بعد.", icon: "bell").listRowBackground(Color.clear)
            } else {
                ForEach(items) { n in
                    Button { open(n) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Circle().fill(n.read ? Color.clear : Buad.accent).frame(width: 8, height: 8).padding(.top, 6)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(n.title).font(.subheadline.weight(n.read ? .regular : .semibold)).foregroundStyle(Buad.ink)
                                    .multilineTextAlignment(.leading)
                                Text(Fmt.epochDay(n.createdAt)).font(.caption).foregroundStyle(Buad.muted)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, minHeight: Buad.tap, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityValue(n.read ? "" : "غير مقروء")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("الإشعارات")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if unread > 0 {
                ToolbarItem(placement: .primaryAction) {
                    Button("تعليم الكل كمقروء") { Task { await readAll() } }
                }
            }
        }
        .refreshable { await load() }
        .task { if !loaded { await load() } }
    }

    private func load() async {
        do {
            let r = try await APIClient.shared.notifications()
            items = r.items
            unread = r.unread
            onUnreadChange(r.unread)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }

    private func open(_ n: NotificationItem) {
        if !n.read {
            items = items.map { $0.id == n.id ? NotificationItem(copy: $0, read: true) : $0 }
            unread = max(0, unread - 1)
            onUnreadChange(unread)
            Task { try? await APIClient.shared.markRead(n.id) }
        }
        if !n.link.isEmpty, let url = APIClient.shared.webURL(n.link) { openURL(url) }
    }

    private func readAll() async {
        do {
            try await APIClient.shared.markAllRead()
            await load()
        } catch {
            session.handle(error)
        }
    }
}
