import SwiftUI

/// «بحث» across the platform: projects, clients, opportunities, offers, tasks, meetings and documents.
/// It reads the same lists the sections do (so the server's visibility and permissions apply as they
/// always do) and matches on the phone; each result opens its own page.
struct SearchView: View {
    @EnvironmentObject private var session: Session

    @State private var query = ""
    @State private var projects: [ProjectItem] = []
    @State private var clients: [ClientItem] = []
    @State private var opportunities: [Opportunity] = []
    @State private var quotes: [SalesQuote] = []
    @State private var tasks: [TaskItem] = []
    @State private var meetings: [Meeting] = []
    @State private var documents: [RegisterDocument] = []
    @State private var loaded = false

    private var q: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func hit(_ parts: String...) -> Bool { parts.joined(separator: " ").localizedCaseInsensitiveContains(q) }

    private var pj: [ProjectItem] { projects.filter { hit($0.name, $0.number, $0.clientName, $0.productName) }.prefix(8).map { $0 } }
    private var cl: [ClientItem] { clients.filter { hit($0.name, $0.code, $0.city, $0.phone, $0.email) }.prefix(8).map { $0 } }
    private var op: [Opportunity] { opportunities.filter { hit($0.name, $0.entity, $0.phone, $0.email, $0.productName) }.prefix(8).map { $0 } }
    private var qt: [SalesQuote] { quotes.filter { !$0.requestId.isEmpty && hit($0.number, $0.recipient, $0.entity) }.prefix(6).map { $0 } }
    private var tk: [TaskItem] { tasks.filter { hit($0.title, $0.projectName, $0.assigneeName) }.prefix(8).map { $0 } }
    private var mt: [Meeting] { meetings.filter { hit($0.title, $0.clientName, $0.projectName) }.prefix(6).map { $0 } }
    private var dc: [RegisterDocument] { documents.filter { hit($0.title, $0.number, $0.outgoingNo, $0.projectName, $0.clientName) }.prefix(8).map { $0 } }

    var body: some View {
        List {
            if q.count < 2 {
                Section { EmptyNote(text: "اكتب حرفين على الأقل للبحث في المشاريع والعملاء والفرص والعروض والمهام والاجتماعات والمستندات.", icon: "magnifyingglass") }
                    .listRowBackground(Color.clear)
            } else if !loaded {
                Section { ProgressView().frame(maxWidth: .infinity) }
            } else if pj.isEmpty && cl.isEmpty && op.isEmpty && qt.isEmpty && tk.isEmpty && mt.isEmpty && dc.isEmpty {
                Section { EmptyNote(text: "لا نتائج لـ «\(q)».", icon: "magnifyingglass") }.listRowBackground(Color.clear)
            } else {
                if !pj.isEmpty {
                    Section("المشاريع") {
                        ForEach(pj) { p in
                            NavigationLink { ProjectDetailView(project: p) } label: { row(p.name, "\(p.clientName) · \(Fmt.ltr(p.number))", "briefcase") }
                        }
                    }
                }
                if !cl.isEmpty {
                    Section("العملاء") {
                        ForEach(cl) { c in
                            NavigationLink { ClientDetailView(client: c) } label: { row(c.name, [c.code, c.city].filter { !$0.isEmpty }.joined(separator: " · "), "person.2") }
                        }
                    }
                }
                if !op.isEmpty {
                    Section("الفرص") {
                        ForEach(op) { o in
                            NavigationLink { OpportunityView(id: o.id, preview: o) } label: { row(o.entity.isEmpty ? o.name : o.entity, o.productName, "scope") }
                        }
                    }
                }
                if !qt.isEmpty {
                    Section("عروض الأسعار") {
                        ForEach(qt) { x in
                            NavigationLink { OpportunityByID(id: x.requestId) } label: { row(Fmt.ltr(x.number), x.recipient.isEmpty ? x.entity : x.recipient, "doc.text") }
                        }
                    }
                }
                if !tk.isEmpty {
                    Section("المهام") {
                        ForEach(tk) { t in
                            if t.projectId.isEmpty {
                                row(t.title, "عمل الشركة", "checklist")
                            } else {
                                NavigationLink { ProjectByID(id: t.projectId) } label: { row(t.title, t.projectName, "checklist") }
                            }
                        }
                    }
                }
                if !mt.isEmpty {
                    Section("الاجتماعات") {
                        ForEach(mt) { m in
                            NavigationLink { MeetingPage(id: m.id) {} } label: { row(m.title, MeetingFmt.when(m.startsAt), "person.3") }
                        }
                    }
                }
                if !dc.isEmpty {
                    Section("المستندات") {
                        ForEach(dc) { d in
                            NavigationLink { DocumentPage(id: d.id) {} } label: { row(d.title.isEmpty ? d.number : d.title, [d.number, d.projectName].filter { !$0.isEmpty }.joined(separator: " · "), "doc.text") }
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("بحث")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "ابحث في كل المنصة")
        .task { await load() }
    }

    private func row(_ title: String, _ sub: String, _ icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(Buad.accentInk).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium)).lineLimit(2)
                if !sub.isEmpty { Text(sub).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
            }
        }
    }

    /// Each list a role may open is read once, together; one that fails or is not allowed is just empty.
    private func load() async {
        guard !loaded, let me = session.me else { return }
        let api = APIClient.shared
        async let p = me.can("projects.view") ? (try? await api.projects().items) : nil
        async let c = me.can("clients.view") ? (try? await api.clients()) : nil
        async let o = me.can("sales.view") ? (try? await api.opportunities()) : nil
        async let x = me.can("sales.view") ? (try? await api.quotes()) : nil
        async let t = me.can("tasks.view") ? (try? await api.tasks(mine: false)) : nil
        async let m = me.can("meetings.view") ? (try? await api.meetings()) : nil
        async let d = me.can("documents.view") ? (try? await api.documentsRegister(status: nil, query: "")) : nil
        projects = await p ?? []; clients = await c ?? []; opportunities = await o ?? []; quotes = await x ?? []
        tasks = await t ?? []; meetings = await m ?? []; documents = await d ?? []
        loaded = true
    }
}
