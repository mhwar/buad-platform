import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var scenePhase

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
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { session.lockIfNeeded() }
            if phase == .active {
                if case .offline = session.phase { Task { await session.bootstrap() } } else { Task { await session.refreshMe() } }
            }
        }
    }
}

/// The phone tabs of the website (PHONE_CORE in features/more/tabs.ts), each shown only when the
/// role may see it. Like PHONE_CORE: اليوم، المبيعات، المشاريع، المالية، المزيد. «المهام» and «العملاء» open from «المزيد», as on the website.
struct MainTabs: View {
    let me: Me

    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("اليوم", systemImage: "square.grid.2x2") }
            if me.can("sales.view") {
                SalesView()
                    .tabItem { Label("المبيعات", systemImage: "target") }
            }
            if me.can("projects.view") {
                ProjectsView()
                    .tabItem { Label("المشاريع", systemImage: "briefcase") }
            }
            if me.can("treasury.view") || me.can("vat.view") {
                FinanceView()
                    .tabItem { Label("المالية", systemImage: "banknote") }
            }
            MoreView()
                .tabItem { Label("المزيد", systemImage: "line.3.horizontal") }
        }
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
                Label("افتح بـ Face ID", systemImage: "faceid")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: 260)
                    .frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Buad.ink)
            .foregroundStyle(Buad.onInk)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Buad.canvas.ignoresSafeArea())
        .accessibilityAddTraits(.isModal)
        .task { await session.unlock() }
    }
}
