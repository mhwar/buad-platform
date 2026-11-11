import SwiftUI

// MARK: - Where a link goes

/// The server's links (notifications, «ما يحتاج انتباهك», follow-ups) are the website's paths. In the app
/// each one opens its own screen: a section of the dock, or a screen over it with «إغلاق». Nothing
/// leaves the app for the website; a section the app does not have yet opens its own «قريباً» page.
enum AppRoute: Identifiable, Hashable {
    case tab(MainTabs.Tab)
    case project(String)
    case opportunity(String)
    case client(String)
    case document(String)
    case quotes
    case tasks
    case clients
    case followups
    case finance
    case documents
    case meetings
    case meeting(String)
    case decisions
    case settings
    case search
    case plans
    case reports
    case audit
    case team
    case account
    case soon(String)

    var id: String {
        switch self {
        case .tab(let t): return "tab-\(t)"
        case .project(let i): return "project-\(i)"
        case .opportunity(let i): return "opp-\(i)"
        case .client(let i): return "client-\(i)"
        case .document(let i): return "doc-\(i)"
        case .quotes: return "quotes"
        case .tasks: return "tasks"
        case .clients: return "clients"
        case .followups: return "followups"
        case .finance: return "finance"
        case .documents: return "documents"
        case .meetings: return "meetings"
        case .meeting(let i): return "meeting-\(i)"
        case .decisions: return "decisions"
        case .settings: return "settings"
        case .search: return "search"
        case .plans: return "plans"
        case .reports: return "reports"
        case .audit: return "audit"
        case .team: return "team"
        case .account: return "account"
        case .soon(let s): return "soon-\(s)"
        }
    }

    /// The website path → the screen. `nil` for an empty path.
    static func parse(_ link: String) -> AppRoute? {
        let raw = link.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty else { return nil }
        let path = raw.split(separator: "?", maxSplits: 1).first.map(String.init) ?? raw
        let q = raw.contains("?") ? String(raw.split(separator: "?", maxSplits: 1).last ?? "") : ""
        let p = path.split(separator: "/").map(String.init)
        guard let head = p.first else { return .tab(.today) }
        switch head {
        case "sales":
            if p.count == 1 { return .tab(.sales) }
            if p[1] == "followups" { return .followups }
            if p[1] == "quotes" { return .quotes }
            return .opportunity(p[1])
        case "projects":
            if p.count >= 4, p[2] == "documents" { return .document(p[3]) }
            if p.count >= 2 { return .project(p[1]) }
            return .tab(.projects)
        case "clients": return p.count >= 2 ? .client(p[1]) : .clients
        case "tasks": return .tasks
        case "finance": return .finance
        case "documents": return .documents
        case "meetings":
            if let open = q.split(separator: "&").first(where: { $0.hasPrefix("open=") }) { return .meeting(String(open.dropFirst(5))) }
            return .meetings
        case "decisions": return .decisions
        case "plans": return .plans
        case "products": return .soon("المنتجات والخدمات")
        case "settings":
            if p.count >= 2, p[1] == "activity" { return .audit }
            if p.count >= 2, p[1] == "team" { return .team }
            if p.count >= 2, p[1] == "account" { return .account }
            return .settings
        case "account": return .account
        case "search": return .search
        case "reports": return .reports
        default: return .soon("هذا القسم")
        }
    }
}

/// Opens an `AppRoute` from anywhere in the signed-in app. `MainTabs` owns it: a dock section is
/// selected (and brought back to its first page); anything else is shown over the current screen.
@MainActor
final class Navigator: ObservableObject {
    @Published var sheet: AppRoute?
    @Published var tabRequest: MainTabs.Tab?

    func open(_ link: String) {
        guard let r = AppRoute.parse(link) else { return }
        open(r)
    }

    func open(_ route: AppRoute) {
        switch route {
        case .tab(let t):
            if t == .sales { ScreenMemory.salesPart = 0 }
            tabRequest = t
        case .quotes:
            ScreenMemory.salesPart = 1
            tabRequest = .sales
        default:
            sheet = route
        }
    }

}

/// The app's own links, for a home-screen widget or a shortcut: «buad://new/opportunity» opens the form,
/// «buad://open/projects/…» opens a page by its website path. Anything else is ignored.
enum DeepLink {
    enum Action: Equatable {
        case create(String)
        case open(String)
    }

    static func parse(_ url: URL) -> Action? {
        guard url.scheme == "buad", let host = url.host else { return nil }
        let rest = url.path.split(separator: "/").map(String.init)
        switch host {
        case "new":
            guard let what = rest.first, ["opportunity", "quote", "client", "task"].contains(what) else { return nil }
            return .create(what)
        case "open":
            return rest.isEmpty ? nil : .open("/" + rest.joined(separator: "/"))
        default:
            return nil
        }
    }
}

/// A route shown over the app: its screen in its own navigation, with «إغلاق».
struct RouteSheet: View {
    @Environment(\.dismiss) private var dismiss
    let route: AppRoute

    var body: some View {
        NavigationStack {
            destination
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } }
                }
        }
    }

    @ViewBuilder private var destination: some View {
        switch route {
        case .project(let id): ProjectByID(id: id)
        case .opportunity(let id): OpportunityByID(id: id)
        case .client(let id): ClientByID(id: id)
        case .document(let id): DocumentPage(id: id) {}
        case .tasks: TasksView().navigationTitle("المهام").navigationBarTitleDisplayMode(.inline)
        case .clients: ClientsView()
        case .followups: FollowupsView()
        case .finance: FinanceView(embedded: true)
        case .documents: DocumentsRegisterView()
        case .meetings: MeetingsView()
        case .meeting(let id): MeetingPage(id: id) {}
        case .decisions: DecisionsView()
        case .settings: SettingsHubView()
        case .search: SearchView()
        case .plans: PlansView()
        case .reports: ReportsHubView()
        case .audit: AuditLogView()
        case .team: TeamView()
        case .account: AccountView()
        case .soon(let name): SoonView(name: name)
        case .tab, .quotes: EmptyView()
        }
    }
}

/// A section the website has and the app is about to: named, with what it will hold, inside the app.
struct SoonView: View {
    let name: String

    static let notes: [String: String] = [
        "الخطط والأهداف": "الخطط والأهداف ومتابعة تقدمها.",
        "المنتجات والخدمات": "الخدمات والباقات والتسعير.",
        "الإعدادات": "بيانات الجهة والفريق والصلاحيات وسجل النشاط.",
        "التقارير": "تقارير المحفظة والتنفيذ والمالية.",
    ]

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "hammer").font(.system(size: 40)).foregroundStyle(Buad.accentInk)
            Text("\(name) قيد التطوير").font(.title3.bold())
            Text(Self.notes[name] ?? "هذا القسم يُنقل إلى التطبيق في إصدار قادم.")
                .font(.subheadline).foregroundStyle(Buad.muted).multilineTextAlignment(.center)
            Text("يظهر هنا ضمن «المزيد» فور جاهزيته.").font(.footnote).foregroundStyle(Buad.faint)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Screens opened by a bare id

/// A project by its id: found in the projects list, then the project page.
struct ProjectByID: View {
    @EnvironmentObject private var session: Session
    let id: String
    @State private var project: ProjectItem?
    @State private var error: String?

    var body: some View {
        Group {
            if let project { ProjectDetailView(project: project) }
            else if let error { EmptyNote(text: error, icon: "briefcase") }
            else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .background(Buad.canvas.ignoresSafeArea())
        .task {
            guard project == nil else { return }
            do {
                project = try await APIClient.shared.projects().items.first { $0.id == id }
                if project == nil { error = "لم يعد هذا المشروع موجوداً أو لا تملك صلاحية الوصول إليه." }
            } catch {
                session.handle(error)
                self.error = (error as? APIError)?.message ?? APIError.network.message
            }
        }
    }
}

struct OpportunityByID: View {
    @EnvironmentObject private var session: Session
    let id: String
    @State private var opportunity: Opportunity?
    @State private var error: String?

    var body: some View {
        Group {
            if let opportunity { OpportunityView(id: id, preview: opportunity) }
            else if let error { EmptyNote(text: error, icon: "target") }
            else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .background(Buad.canvas.ignoresSafeArea())
        .task {
            guard opportunity == nil else { return }
            do { opportunity = try await APIClient.shared.opportunity(id).opportunity } catch {
                session.handle(error)
                self.error = (error as? APIError)?.message ?? APIError.network.message
            }
        }
    }
}

struct ClientByID: View {
    @EnvironmentObject private var session: Session
    let id: String
    @State private var client: ClientItem?
    @State private var error: String?

    var body: some View {
        Group {
            if let client { ClientDetailView(client: client) }
            else if let error { EmptyNote(text: error, icon: "person.2") }
            else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .background(Buad.canvas.ignoresSafeArea())
        .task {
            guard client == nil else { return }
            do {
                client = try await APIClient.shared.clients().first { $0.id == id }
                if client == nil { error = "لم يعد هذا العميل موجوداً أو لا تملك صلاحية الوصول إليه." }
            } catch {
                session.handle(error)
                self.error = (error as? APIError)?.message ?? APIError.network.message
            }
        }
    }
}
