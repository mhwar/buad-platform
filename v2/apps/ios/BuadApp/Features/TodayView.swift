import SwiftUI

/// «اليوم»: the page to start the day from, built for what this role may see.
///   · the greeting;
///   · «أدوات سريعة» — new opportunity, offer, client, project;
///   · «اليوم في أرقام» — my open tasks, follow-ups due, open opportunities, late payments (tap one to
///     go to it);
///   · «على جدولك» — what is due, in one list by date: tasks, follow-ups and instalments;
///   · «ما يحتاج انتباهك» — GET /api/attention exactly as the server computes it;
///   · «الأقسام» — the tools of the platform, a tap away.
/// Every part loads on its own and only when the role allows it; one that fails never blanks the page.
struct TodayView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @EnvironmentObject private var center: CreateCenter

    @State private var attention: [AttentionItem] = []
    @State private var tasks: [TaskItem] = []
    @State private var followups: [Followup] = []
    @State private var receivables: Receivables?
    @State private var sales: SalesOverview?
    @State private var loaded = false
    @State private var error: String?
    @State private var unread = 0
    @State private var creatingProject = false
    @State private var toast: ToastItem?

    private var me: Me? { session.me }
    private func can(_ p: String) -> Bool { me?.can(p) ?? false }

    // MARK: derived

    private var openTasks: [TaskItem] { tasks.filter { $0.status != "done" } }
    private var lateTasks: [TaskItem] { openTasks.filter(\.overdue) }
    private var dueFollowups: [Followup] { followups.filter { $0.state == "overdue" || $0.state == "today" } }

    private struct AgendaItem: Identifiable {
        let id: String
        let icon: String
        let title: String
        let meta: String
        let date: String
        let tone: Tone
        let tag: String
        let link: String
    }

    /// What is due: tasks and follow-ups that are late, today or in the next two days, and instalments
    /// that are late or fall within the week. Oldest first.
    private var agenda: [AgendaItem] {
        let today = Fmt.todayISO
        var out: [AgendaItem] = []
        for t in openTasks where !t.dueDate.isEmpty && (Fmt.daysUntil(t.dueDate) ?? 99) <= 2 {
            let late = t.dueDate < today
            out.append(.init(id: "t" + t.id, icon: "checklist", title: t.title,
                             meta: [t.projectName, Fmt.dayMonth(t.dueDate)].filter { !$0.isEmpty }.joined(separator: " · "),
                             date: t.dueDate, tone: late ? .bad : .warn, tag: late ? "متأخرة" : "مهمة",
                             link: t.projectId.isEmpty ? "/tasks" : "/projects/\(t.projectId)"))
        }
        for f in followups where f.state != "later" && (Fmt.daysUntil(f.date) ?? 99) <= 2 {
            let late = f.state == "overdue"
            out.append(.init(id: "f" + f.key, icon: f.kind == "request" ? "target" : "person.crop.circle", title: f.title,
                             meta: [f.subtitle, Fmt.dayMonth(f.date)].filter { !$0.isEmpty }.joined(separator: " · "),
                             date: f.date, tone: late ? .bad : .info, tag: late ? "متابعة متأخرة" : "متابعة", link: f.link))
        }
        if let r = receivables {
            for l in r.items where l.dueDate < today || (Fmt.daysUntil(l.dueDate) ?? 99) <= 7 {
                let late = l.dueDate < today
                out.append(.init(id: "p" + l.id, icon: "banknote", title: "\(l.client.isEmpty ? l.project : l.client) · \(Fmt.sar(l.amount))",
                                 meta: [l.label, Fmt.dayMonth(l.dueDate)].filter { !$0.isEmpty }.joined(separator: " · "),
                                 date: l.dueDate, tone: late ? .bad : .ok, tag: late ? "دفعة متأخرة" : "دفعة",
                                 link: l.projectId.isEmpty ? "/finance" : "/projects/\(l.projectId)"))
            }
        }
        return out.sorted { $0.date < $1.date }
    }

    // MARK: body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    quickTools
                    figures
                    schedule
                    attentionSection
                    sections
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
            .onChange(of: center.revision) { _, _ in Task { await load() } }
            .toast($toast)
            .sheet(isPresented: $creatingProject) {
                ProjectEditSheet { _ in
                    NotificationCenter.default.post(name: .projectsChanged, object: nil)
                    toast = ToastItem(text: "أُنشئ المشروع")
                }
            }
        }
    }

    // MARK: parts

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Fmt.longToday()).font(.footnote.weight(.medium)).foregroundStyle(Buad.muted)
            Text("\(Fmt.greeting())، \(me?.firstName ?? "")").font(.largeTitle.bold())
        }
    }

    @ViewBuilder private var quickTools: some View {
        let sell = can("sales.edit"), cli = can("clients.edit"), prj = can("projects.edit")
        if sell || cli || prj {
            VStack(alignment: .leading, spacing: 8) {
                label("أدوات سريعة")
                ActionRow {
                    if sell { ActionTile(icon: "scope", title: "فرصة", primary: true) { center.sheet = .opportunity } }
                    if sell { ActionTile(icon: "doc.text", title: "عرض سعر") { center.sheet = .quote } }
                    if cli { ActionTile(icon: "person.crop.circle.badge.plus", title: "عميل") { center.sheet = .client } }
                    if prj { ActionTile(icon: "folder.badge.plus", title: "مشروع", primary: !sell) { creatingProject = true } }
                }
            }
        }
    }

    @ViewBuilder private var figures: some View {
        let showTasks = can("tasks.view"), showFollow = can("clients.view"), showSales = can("sales.view") && sales != nil
        let showMoney = can("treasury.view") && receivables != nil
        if showTasks || showFollow || showSales || showMoney {
            VStack(alignment: .leading, spacing: 8) {
                label("اليوم في أرقام")
                JoinedGrid {
                    GridRow {
                        if showTasks {
                            figure("مهامي المفتوحة", String(openTasks.count), sub: lateTasks.isEmpty ? "لا متأخرة" : "منها \(lateTasks.count) متأخرة",
                                   tone: lateTasks.isEmpty ? nil : .bad, link: "/tasks")
                        }
                        if showFollow {
                            figure("متابعات مستحقة", String(dueFollowups.count), sub: dueFollowups.isEmpty ? "لا شيء متأخر" : "متأخرة أو اليوم",
                                   tone: dueFollowups.isEmpty ? nil : .warn, link: "/sales/followups")
                        }
                    }
                    GridRow {
                        if showSales, let s = sales {
                            figure("فرص مفتوحة", String(s.openCount), sub: Fmt.short(s.openValue) + " ر.س", tone: nil, link: "/sales")
                        }
                        if showMoney, let r = receivables {
                            figure("دفعات متأخرة", Fmt.short(r.overdue), sub: r.overdue > 0 ? "ر.س على العملاء" : "لا متأخرات",
                                   tone: r.overdue > 0 ? .bad : nil, link: "/finance")
                        }
                    }
                }
            }
        }
    }

    private func figure(_ title: String, _ value: String, sub: String, tone: Tone?, link: String) -> some View {
        Button { nav.open(link) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
                Text(value).font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(tone?.foreground ?? Buad.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(1)
            }
            .joinedCell(minHeight: 70)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var schedule: some View {
        if !loaded {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20)
        } else {
            let list = agenda
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    label("على جدولك")
                    Spacer()
                    if !list.isEmpty {
                        Text(verbatim: String(list.count)).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(Buad.muted)
                    }
                }
                if list.isEmpty {
                    EmptyNote(text: error ?? "جدولك فارغ: لا مهام ولا متابعات ولا دفعات مستحقة قريباً.",
                              icon: error == nil ? "checkmark.circle" : "wifi.exclamationmark")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(list.prefix(7).enumerated()), id: \.element.id) { i, a in
                            if i > 0 { Divider().padding(.leading, 56) }
                            Button { nav.open(a.link) } label: { agendaRow(a) }.buttonStyle(.plain)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    if list.count > 7 { Text("و\(list.count - 7) أخرى في أقسامها").font(.caption).foregroundStyle(Buad.muted) }
                }
            }
        }
    }

    private func agendaRow(_ a: AgendaItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: a.icon)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 34, height: 34)
                .background(a.tone.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(a.tone.foreground)
            VStack(alignment: .leading, spacing: 2) {
                Text(a.title).font(.subheadline.weight(.medium)).foregroundStyle(Buad.ink).lineLimit(1)
                if !a.meta.isEmpty { Text(a.meta).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
            }
            Spacer(minLength: 6)
            Text(a.tag).font(.caption2.weight(.semibold)).foregroundStyle(a.tone.foreground).lineLimit(1)
            Chevron()
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var attentionSection: some View {
        if loaded && !attention.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                label("ما يحتاج انتباهك")
                VStack(spacing: 0) {
                    ForEach(Array(attention.enumerated()), id: \.element.id) { i, item in
                        if i > 0 { Divider().padding(.leading, 56) }
                        AttentionRow(item: item)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        }
    }

    private struct SectionTile: Identifiable { let title: String; let icon: String; let link: String; let note: String?; var id: String { title } }

    private var sectionTiles: [SectionTile] {
        var t: [SectionTile] = []
        if can("tasks.view") { t.append(.init(title: "المهام", icon: "checklist", link: "/tasks", note: openTasks.isEmpty ? nil : "\(openTasks.count) مفتوحة")) }
        if can("clients.view") {
            t.append(.init(title: "المتابعات", icon: "clock.badge.checkmark", link: "/sales/followups", note: dueFollowups.isEmpty ? nil : "\(dueFollowups.count) مستحقة"))
            t.append(.init(title: "العملاء", icon: "person.2", link: "/clients", note: nil))
        }
        if can("documents.view") { t.append(.init(title: "المستندات", icon: "doc.text", link: "/documents", note: nil)) }
        if can("treasury.view") || can("vat.view") { t.append(.init(title: "المالية", icon: "banknote", link: "/finance", note: nil)) }
        if can("sales.view") { t.append(.init(title: "عروض الأسعار", icon: "doc.richtext", link: "/sales/quotes", note: nil)) }
        return t
    }

    /// The tools of the platform as tiles, each with a figure where there is one.
    @ViewBuilder private var sections: some View {
        let tiles = sectionTiles
        if !tiles.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                label("الأقسام")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(tiles) { tile in
                        Button { nav.open(tile.link) } label: {
                            HStack(spacing: 10) {
                                Image(systemName: tile.icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(Buad.accentInk).frame(width: 26)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(tile.title).font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink)
                                    if let note = tile.note { Text(note).font(.caption2).foregroundStyle(Buad.muted) }
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScale())
                    }
                }
            }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.footnote.weight(.semibold)).foregroundStyle(Buad.muted)
    }

    // MARK: loading

    private func load() async {
        let (t, c, f, s) = (can("tasks.view"), can("clients.view"), can("treasury.view"), can("sales.view"))
        async let a = Self.attempt(true) { try await APIClient.shared.attention() }
        async let k = Self.attempt(t) { try await APIClient.shared.tasks(mine: true) }
        async let fu = Self.attempt(c) { try await APIClient.shared.followups(all: false) }
        async let r = Self.attempt(f) { try await APIClient.shared.receivables() }
        async let o = Self.attempt(s) { try await APIClient.shared.salesOverview() }
        async let n = Self.attempt(true) { try await APIClient.shared.notifications().unread }
        let (ar, kr, fr, rr, or, nr) = await (a, k, fu, r, o, n)
        var failed: APIError?
        func take<T>(_ x: Result<T, APIError>?) -> T? {
            switch x {
            case .success(let v): return v
            case .failure(let e):
                if e == .unauthorized { session.handle(e) } else if e != .forbidden { failed = e }
                return nil
            case nil: return nil
            }
        }
        attention = take(ar) ?? attention
        tasks = take(kr) ?? tasks
        followups = take(fr) ?? followups
        receivables = take(rr) ?? receivables
        sales = take(or) ?? sales
        unread = take(nr) ?? unread
        error = failed?.message
        loaded = true
    }

    private static func attempt<T>(_ allowed: Bool, _ work: @Sendable () async throws -> T) async -> Result<T, APIError>? {
        guard allowed else { return nil }
        do { return .success(try await work()) } catch { return .failure((error as? APIError) ?? .network) }
    }
}

private struct AttentionRow: View {
    @EnvironmentObject private var nav: Navigator
    let item: AttentionItem

    var body: some View {
        let tone: Tone = item.tone == "info" ? .info : .warn
        Button { nav.open(item.link) } label: {
            HStack(spacing: 12) {
                Text(verbatim: String(item.count))
                    .font(.subheadline.weight(.bold))
                    .monospacedDigit()
                    .frame(minWidth: 32, minHeight: 32)
                    .background(tone.background, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .foregroundStyle(tone.foreground)
                Text(item.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Buad.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Chevron()
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
