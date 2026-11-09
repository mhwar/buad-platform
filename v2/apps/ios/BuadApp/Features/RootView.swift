import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var scenePhase
    /// A page of the platform's website, opened inside the app so the person comes back to the same place.
    @State private var browsing: WebPage?

    struct WebPage: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }

    var body: some View {
        ZStack {
            switch session.phase {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Buad.canvas.ignoresSafeArea())
            case .signedOut:
                SignInView()
            case .signedIn(let me):
                MainTabs(me: me)
                    .accessibilityHidden(session.locked)
            case .offline(let message):
                OfflineView(message: message)
            }
            if session.locked {
                LockView().transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: session.locked)
        // Links to the platform open in an in-app Safari sheet; phone, mail, WhatsApp and other sites
        // keep the system's behaviour.
        .environment(\.openURL, OpenURLAction { url in
            guard ["http", "https"].contains(url.scheme ?? ""), let host = url.host,
                  host == AppConfig.apiBase?.host else { return .systemAction }
            browsing = WebPage(url: url)
            return .handled
        })
        .sheet(item: $browsing) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { session.lockIfNeeded() }
            if phase == .active {
                if case .offline = session.phase { Task { await session.bootstrap() } } else { Task { await session.refreshMe() } }
            }
        }
    }
}

/// The phone tabs of the website (PHONE_CORE in features/more/tabs.ts), each shown only when the
/// role may see it: اليوم، المبيعات، المشاريع، المزيد. «المالية» و«المهام» و«العملاء» open from «المزيد».
/// The system tab bar is replaced by the floating `Dock`. Creating lives in each screen's own «+»
/// (Sales, Projects, Clients, the project page), so the same button never appears twice.
struct MainTabs: View {
    enum Tab: Hashable { case today, sales, projects, more }

    @EnvironmentObject private var session: Session
    let me: Me
    @StateObject private var center = CreateCenter()
    @State private var tab: Tab = .today

    private var items: [Dock.Item] {
        var list = [Dock.Item(id: .today, title: "اليوم", icon: "sun.max")]
        if me.can("sales.view") { list.append(.init(id: .sales, title: "المبيعات", icon: "bag")) }
        if me.can("projects.view") { list.append(.init(id: .projects, title: "المشاريع", icon: "briefcase")) }
        list.append(.init(id: .more, title: "المزيد", icon: "square.grid.2x2"))
        return list
    }

    var body: some View {
        TabView(selection: $tab) {
            page(TodayView(), .today)
            if me.can("sales.view") { page(SalesView(), .sales) }
            if me.can("projects.view") { page(ProjectsView(), .projects) }
            page(MoreView(), .more)
        }
        .overlay(alignment: .bottom) {
            Dock(items: items, selection: $tab)
                .padding(.bottom, 4)
                .ignoresSafeArea(.keyboard, edges: .bottom)
        }
        .environmentObject(center)
        .toast($center.toast)
        .sheet(item: $center.sheet) { kind in
            CreateSheet(kind: kind).environmentObject(session).environmentObject(center)
        }
        .onReceive(NotificationCenter.default.publisher(for: .movedToSales)) { _ in
            center.done(.opportunity, "نُقل المشروع إلى المبيعات كفرصة. أنشئ عرض السعر من صفحتها.")
        }
        .onChange(of: center.revision) { _, _ in
            // Bring forward the section that shows the new thing.
            if center.lastKind != .client, me.can("sales.view") { tab = .sales }
        }
    }

    private func page(_ content: some View, _ id: Tab) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: Dock.height + 8) }
            .toolbar(.hidden, for: .tabBar)
            .tag(id)
    }
}

/// Opening the app without a connection: the session is kept, nothing is lost, try again.
struct OfflineView: View {
    @EnvironmentObject private var session: Session
    let message: String
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 44)).foregroundStyle(Buad.muted)
            Text("تعذّر الوصول إلى المنصة").font(.title3.bold())
            Text("\(message) حسابك ما زال مسجّلاً على هذا الجهاز.")
                .font(.subheadline).foregroundStyle(Buad.muted).multilineTextAlignment(.center)
            Button {
                busy = true
                Task { await session.bootstrap(); busy = false }
            } label: {
                HStack { if busy { ProgressView().tint(Buad.onInk) } else { Text("إعادة المحاولة").bold() } }
                    .frame(maxWidth: 260, minHeight: 50)
                    .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                    .foregroundStyle(Buad.onInk)
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Buad.canvas.ignoresSafeArea())
    }
}

struct LockView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        VStack(spacing: 20) {
            Image("Logo")
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .foregroundStyle(Buad.logo)
                .frame(width: 56, height: 56)
            Text("بُعد مقفل").font(.title2.bold())
            Button {
                Task { await session.unlock() }
            } label: {
                Label(Biometry.unlockTitle, systemImage: Biometry.icon)
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: 260)
                    .frame(minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Buad.ink)
            .foregroundStyle(Buad.onInk)
            Button("تسجيل الخروج") { Task { await session.signOut() } }
                .font(.subheadline)
                .foregroundStyle(Buad.muted)
                .frame(minHeight: Buad.tap)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Buad.canvas.ignoresSafeArea())
        .accessibilityAddTraits(.isModal)
        .task { await session.unlock() }
    }
}
