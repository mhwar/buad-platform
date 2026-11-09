import SwiftUI

/// «العملاء» (features/clients/ClientsPage.tsx), read-only: the list with search, then the client's
/// page with contacts, projects and the statement of account. Amounts owed appear only with
/// finance.view; the server already sends null without it.
struct ClientsView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var center: CreateCenter
    @State private var items: [ClientItem] = []
    @State private var query = ""
    @State private var loaded = false
    @State private var error: String?

    private var shown: [ClientItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return items }
        return items.filter { "\($0.name) \($0.code) \($0.city) \($0.email)".localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 28)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if shown.isEmpty {
                    EmptyNote(text: query.isEmpty ? "لا يوجد عملاء بعد." : "لا نتائج. جرّبوا كلمة بحث أخرى.", icon: query.isEmpty ? "person.2" : "magnifyingglass")
                } else {
                    if let error { RefreshBanner(text: error) }
                    ForEach(shown) { c in
                        NavigationLink(value: c) { ClientCard(client: c) }.buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("العملاء")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "ابحث بالاسم أو الرقم أو المدينة أو البريد")
        .refreshable { await load() }
        .task { if !loaded { await load() } }
        .onChange(of: center.revision) { _, _ in Task { await load() } }
        .toolbar {
            if session.me?.can("clients.edit") == true {
                ToolbarItem(placement: .primaryAction) {
                    Button { center.sheet = .client } label: {
                        Image(systemName: "plus").font(.body.weight(.semibold)).accessibilityLabel("عميل جديد")
                    }
                }
            }
        }
        .navigationDestination(for: ClientItem.self) { ClientDetailView(client: $0) }
    }

    private func load() async {
        do {
            items = try await APIClient.shared.clients()
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

private struct ClientCard: View {
    let client: ClientItem

    var body: some View {
        let rel = Vocabulary.relationship(client.relationship)
        Card {
            HStack(spacing: 6) {
                Pill(text: rel.label, tone: rel.tone)
                Pill(text: Vocabulary.clientType(client.type))
                Spacer()
                Text(client.code).font(.caption.weight(.medium)).foregroundStyle(Buad.muted).environment(\.layoutDirection, .leftToRight)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(client.name).font(.headline).foregroundStyle(Buad.ink).multilineTextAlignment(.leading)
                let meta = [client.city, client.ownerName.isEmpty ? "" : "المسؤول: \(client.ownerName)"].filter { !$0.isEmpty }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(.subheadline).foregroundStyle(Buad.muted) }
            }
            if client.openRequests > 0 || client.lateInstalments > 0 {
                HStack(spacing: 6) {
                    if client.openRequests > 0 { Pill(text: "\(client.openRequests) \(client.openRequests == 1 ? "فرصة مفتوحة" : "فرص مفتوحة")", tone: .info) }
                    if client.lateInstalments > 0 { Pill(text: "\(client.lateInstalments) \(client.lateInstalments == 1 ? "دفعة متأخرة" : "دفعات متأخرة")", tone: .bad) }
                }
            }
            Divider()
            HStack {
                stat("المشاريع", "\(client.projectCount)")
                stat("قيمة العقود", client.projectValue > 0 ? Fmt.short(client.projectValue) : "—")
                if let owed = client.owed {
                    stat("المستحق عليه", owed > 0 ? Fmt.short(owed) : "—")
                } else {
                    stat("المستندات", "\(client.documentsCount)")
                }
            }
        }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit()
            Text(title).font(.caption).foregroundStyle(Buad.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

struct ClientDetailView: View {
    @EnvironmentObject private var session: Session
    let client: ClientItem
    @State private var detail: ClientDetail?
    @State private var statement: Statement?
    @State private var error: String?
    @State private var loaded = false
    /// The client's projects as the projects list has them, so a row can open the project page.
    @State private var openable: [String: ProjectItem] = [:]

    private var canFinance: Bool { session.me?.can("finance.view") ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(client.code).font(.caption.weight(.medium)).foregroundStyle(Buad.muted).environment(\.layoutDirection, .leftToRight)
                    Text(client.name).font(.title2.bold())
                    HStack(spacing: 6) {
                        let rel = Vocabulary.relationship(client.relationship)
                        Pill(text: rel.label, tone: rel.tone)
                        Pill(text: Vocabulary.clientType(client.type))
                    }
                }

                if let error { EmptyNote(text: error, icon: "wifi.exclamationmark") }

                if let s = statement, canFinance {
                    JoinedGrid {
                        GridRow {
                            tile("قيمة العقود", Fmt.sar(s.gross))
                            tile("المحصّل", Fmt.sar(s.received))
                            tile("المستحق عليه", Fmt.sar(s.owed), tone: s.owed > 0 ? .warn : nil)
                        }
                    }
                }

                Card {
                    Text("بيانات العميل").font(.headline)
                    if !client.phone.isEmpty, let tel = URL(string: "tel:\(client.phone.filter { $0.isNumber || $0 == "+" })") {
                        Link(destination: tel) { line("رقم الهاتف", client.phone, ltr: true, link: "phone") }
                    }
                    if !client.email.isEmpty, let mail = URL(string: "mailto:\(client.email)") {
                        Link(destination: mail) { line("البريد الإلكتروني", client.email, ltr: true, link: "envelope") }
                    }
                    if !client.city.isEmpty { line("المدينة", client.city) }
                    if let d = detail {
                        if !d.address.isEmpty { line("العنوان الوطني", d.address) }
                        if !d.regNo.isEmpty { line("رقم السجل / الترخيص", d.regNo, ltr: true) }
                        if !d.taxNo.isEmpty { line("الرقم الضريبي", d.taxNo, ltr: true) }
                        if !d.notes.isEmpty { Text(d.notes).font(.subheadline).foregroundStyle(Buad.muted) }
                    }
                }

                if let contacts = detail?.contacts, !contacts.isEmpty {
                    Text("جهات الاتصال").font(.headline)
                    VStack(spacing: 0) {
                        ForEach(Array(contacts.enumerated()), id: \.element.id) { i, p in
                            if i > 0 { Divider().padding(.leading, 14) }
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(p.name).font(.subheadline.weight(.medium))
                                        if p.isSignatory { Pill(text: "المفوّض بالتوقيع", tone: .info) }
                                    }
                                    let meta = [p.title, Fmt.ltr(p.phone), Fmt.ltr(p.email)].filter { !$0.isEmpty }.joined(separator: " · ")
                                    if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
                                }
                                Spacer()
                                if !p.phone.isEmpty, let tel = URL(string: "tel:\(p.phone.filter { $0.isNumber || $0 == "+" })") {
                                    Link(destination: tel) {
                                        Image(systemName: "phone.fill")
                                            .frame(width: Buad.tap, height: Buad.tap)
                                            .background(Buad.successSoft, in: Circle())
                                            .foregroundStyle(Buad.successInk)
                                    }
                                    .accessibilityLabel("اتصال بـ \(p.name)")
                                }
                            }
                            .padding(14)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }

                Text("المشاريع").font(.headline)
                if let projects = detail?.projects {
                    if projects.isEmpty {
                        EmptyNote(text: "لا مشاريع لهذا العميل.", icon: "briefcase")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(projects.enumerated()), id: \.element.id) { i, p in
                                if i > 0 { Divider().padding(.leading, 14) }
                                let st = Vocabulary.status(p.status)
                                let owedLine = statement?.items.first(where: { $0.id == p.id })
                                let row = HStack(alignment: .firstTextBaseline) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.name).font(.subheadline.weight(.medium))
                                        Text([Fmt.ltr(p.number), Vocabulary.type(p.type), Fmt.dayMonth(p.startDate)].filter { !$0.isEmpty }.joined(separator: " · "))
                                            .font(.caption).foregroundStyle(Buad.muted)
                                        if let o = owedLine, canFinance, o.owed > 0 {
                                            Text("المستحق: \(Fmt.sar(o.owed))").font(.caption).foregroundStyle(Buad.warningInk)
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 4) {
                                        if canFinance && !p.external { Text(Fmt.short(p.contractTotal)).font(.subheadline.weight(.semibold)).monospacedDigit() }
                                        Pill(text: p.archived ? "مؤرشف" : st.label, tone: p.archived ? .neutral : st.tone)
                                    }
                                    if openable[p.id] != nil { Chevron() }
                                }
                                .padding(14)
                                .contentShape(Rectangle())
                                if let item = openable[p.id] {
                                    NavigationLink(value: item) { row }.buttonStyle(.plain)
                                } else {
                                    row
                                }
                            }
                        }
                        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    }
                } else if !loaded {
                    ProgressView().frame(maxWidth: .infinity)
                }

                if let url = APIClient.shared.webURL("/clients/\(client.id)") {
                    Link(destination: url) {
                        Label("فتح العميل في الموقع للتعديل", systemImage: "safari")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                            .foregroundStyle(Buad.ink)
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(client.name)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: ProjectItem.self) { ProjectDetailView(project: $0) }
        .refreshable { await load() }
        .task { if !loaded { await load() } }
    }

    private func load() async {
        let id = client.id
        let fin = canFinance
        async let d = Self.fetch(true) { try await APIClient.shared.client(id) }
        async let s = Self.fetch(fin) { try await APIClient.shared.statement(id) }
        let canList = session.me?.can("projects.view") ?? false
        async let list = Self.fetch(canList) { try await APIClient.shared.projects().items }
        let (dr, sr, lr) = await (d, s, list)
        if let lr {
            let ids = Set(dr?.projects.map(\.id) ?? [])
            openable = Dictionary(lr.filter { ids.contains($0.id) }.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        }
        if let dr { detail = dr }
        if let sr { statement = sr }
        error = dr == nil && detail == nil ? APIError.server(0).message : nil
        loaded = true
    }

    private static func fetch<T>(_ allowed: Bool, _ work: @Sendable () async throws -> T) async -> T? {
        guard allowed else { return nil }
        return try? await work()
    }

    private func tile(_ title: String, _ value: String, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Buad.surface)
    }

    /// A label/value row. `link` names an icon for rows that call or e-mail, which are tinted as links.
    private func line(_ title: String, _ value: String, ltr: Bool = false, link: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Buad.muted)
            Spacer()
            if let link { Image(systemName: link).font(.caption).foregroundStyle(Buad.accentInk) }
            Text(value).foregroundStyle(link == nil ? Buad.ink : Buad.accentInk).multilineTextAlignment(.trailing)
                .environment(\.layoutDirection, ltr ? .leftToRight : .rightToLeft)
        }
        .font(.subheadline)
        .frame(minHeight: link == nil ? nil : Buad.tap)
        .contentShape(Rectangle())
    }
}
