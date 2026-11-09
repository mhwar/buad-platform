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
            }
            if session.locked {
                LockView().transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: session.locked)
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { session.lockIfNeeded() }
            if phase == .active { Task { await session.refreshMe() } }
        }
    }
}

/// The phone tabs of the website (PHONE_CORE in features/more/tabs.ts), each shown only when the
/// role may see it. Like PHONE_CORE: اليوم، المشاريع، المالية، المزيد (المبيعات joins in phase 3). «المهام» and «العملاء» open from «المزيد», as on the website.
struct MainTabs: View {
    let me: Me

    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("اليوم", systemImage: "square.grid.2x2") }
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
        .task { await session.unlock() }
    }
}
