import SwiftUI

/// «المبيعات» (features/sales): «الفرص» (OpportunitiesPage), «العروض» (QuotesPage) and «اللوحة»
/// (SalesDashboard), with «+» for a new opportunity, offer or client. Opportunities open on a strip of
/// the open pipeline by stage (tap a stage to filter), then the list; each opportunity's page has its
/// timeline, offers, «تسجيل تواصل» and the stage. Reads need sales.view, writes sales.edit.
struct SalesView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var center: CreateCenter
    @State private var part = ScreenMemory.salesPart

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("أقسام المبيعات", selection: $part) {
                    Text("الفرص").tag(0)
                    Text("العروض").tag(1)
                    Text("اللوحة").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Buad.gutter)
                .padding(.vertical, 8)
                switch part {
                case 1: QuotesList()
                case 2: SalesBoard()
                default: OpportunitiesList()
                }
            }
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("المبيعات")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !CreateCenter.kinds(for: session.me).isEmpty {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            ForEach(CreateCenter.kinds(for: session.me)) { k in
                                Button { center.sheet = k } label: { Label(CreateCenter.title(k), systemImage: CreateCenter.icon(k)) }
                            }
                        } label: {
                            Image(systemName: "plus").font(.body.weight(.semibold)).accessibilityLabel("إنشاء")
                        }
                    }
                }
            }
            .navigationDestination(for: Opportunity.self) { OpportunityView(id: $0.id, preview: $0) }
            .navigationDestination(for: SalesQuote.self) { QuoteView(id: $0.id, preview: $0) }
            .onChange(of: part) { _, now in ScreenMemory.salesPart = now }
            // A new offer shows in «العروض»; a new opportunity in «الفرص».
            .onChange(of: center.revision) { _, _ in
                if center.lastKind == .quote { part = 1 } else if center.lastKind == .opportunity { part = 0 }
            }
        }
    }
}

// MARK: - الفرص

private struct OpportunitiesList: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var center: CreateCenter
    @State private var items: [Opportunity] = ScreenMemory.opportunities ?? []
    @State private var loaded = ScreenMemory.opportunities != nil
    @State private var error: String?
    @State private var stage = ScreenMemory.salesStage
    @State private var dueOnly = ScreenMemory.salesDueOnly
    @State private var query = ""

    /// Follow-up overdue or due today, on an open opportunity (the website's «تحتاج متابعة»).
    private static func isDue(_ o: Opportunity) -> Bool {
        guard o.isOpen, !o.followUpAt.isEmpty, let d = Fmt.daysUntil(o.followUpAt) else { return false }
        return d <= 0
    }

    private var pool: [Opportunity] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return items.filter { o in
            (q.isEmpty || "\(o.name) \(o.entity) \(o.productName) \(o.phone)".localizedCaseInsensitiveContains(q))
                && (!dueOnly || Self.isDue(o))
        }
    }

    private var shown: [Opportunity] {
        pool.filter { stage == "all" || (stage == "open" ? $0.isOpen : $0.status == stage) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                Section {
                    if !loaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                    } else if let error {
                        EmptyNote(text: error, icon: "wifi.exclamationmark")
                    } else if shown.isEmpty {
                        EmptyNote(text: items.isEmpty ? "لا فرص بعد. تصل طلبات الموقع هنا، وتُضاف الفرص من زر «+»."
                                    : dueOnly || !query.isEmpty ? "لا فرص تطابق هذا البحث. غيّر التصفية أو امسح البحث."
                                    : "لا فرص في هذا العرض.",
                                  icon: "target")
                    } else {
                        if query.isEmpty && !dueOnly { strip }
                        let total = shown.reduce(0) { $0 + $1.value }
                        Text(Fmt.opportunities(shown.count) + (total > 0 ? " · \(Fmt.short(total)) ر.س" : ""))
                            .font(.footnote).foregroundStyle(Buad.muted)
                        ForEach(shown) { o in
                            NavigationLink(value: o) { LeadRow(o: o) }.buttonStyle(.plain)
                        }
                    }
                } header: {
                    pills
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.bottom, 16)
        }
        .searchable(text: $query, prompt: "ابحث بالاسم أو الجهة أو الخدمة")
        .refreshable { await load() }
        .task { await load() }
        .onChange(of: center.revision) { _, _ in Task { await load() } }
        .onChange(of: stage) { _, now in ScreenMemory.salesStage = now }
        .onChange(of: dueOnly) { _, now in ScreenMemory.salesDueOnly = now }
    }

    /// The open pipeline at a glance: each open stage with its count and value, the bar showing its
    /// share of the open value. Tapping a stage filters the list to it; tapping it again shows all open.
    private var strip: some View {
        let open = items.filter(\.isOpen)
        let all = max(1, open.reduce(0) { $0 + $1.value })
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Sales.openStages, id: \.self) { s in
                    let list = open.filter { $0.status == s }
                    let value = list.reduce(0) { $0 + $1.value }
                    let st = Sales.stage(s)
                    let on = stage == s
                    Button {
                        withAnimation(.snappy) { stage = on ? "open" : s }
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 6) {
                                Circle().fill(st.tone.foreground).frame(width: 7, height: 7)
                                Text(st.label).font(.caption.weight(.semibold)).foregroundStyle(on ? Buad.onInk : Buad.muted)
                            }
                            Text(verbatim: String(list.count)).font(.title3.bold()).monospacedDigit()
                                .foregroundStyle(on ? Buad.onInk : Buad.ink)
                            Text(value > 0 ? Fmt.short(value) : "—").font(.caption2).monospacedDigit()
                                .foregroundStyle(on ? Buad.onInk.opacity(0.8) : Buad.muted)
                            GeometryReader { g in
                                Capsule().fill((on ? Buad.onInk : Buad.line).opacity(on ? 0.3 : 1))
                                    .overlay(alignment: .leading) {
                                        Capsule().fill(on ? Buad.onInk : st.tone.foreground)
                                            .frame(width: g.size.width * CGFloat(value) / CGFloat(all))
                                    }
                            }
                            .frame(height: 4)
                        }
                        .padding(12)
                        .frame(width: 112, alignment: .leading)
                        .background(on ? Buad.ink : Buad.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(st.label)، \(Fmt.opportunities(list.count))، \(Fmt.sar(value))")
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, Buad.gutter)
        }
        .padding(.horizontal, -Buad.gutter)
        .sensoryFeedback(.selection, trigger: stage)
    }

    private var pills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // «تحتاج متابعة» first: a filter on top of the stage, and a different colour so it reads as one.
                let due = items.filter(Self.isDue).count
                if due > 0 || dueOnly {
                    Button { dueOnly.toggle() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "clock.badge.exclamationmark")
                            Text("تحتاج متابعة").font(.subheadline.weight(.medium))
                            Text(verbatim: String(due)).font(.caption).monospacedDigit()
                        }
                        .padding(.horizontal, 14).frame(minHeight: 34)
                        .background(dueOnly ? Buad.warningInk : Buad.warningSoft, in: Capsule())
                        .foregroundStyle(dueOnly ? Buad.onInk : Buad.warningInk)
                        .padding(.vertical, 5).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(dueOnly ? .isSelected : [])
                }
                FilterChip(title: "المفتوحة", count: pool.filter(\.isOpen).count, on: stage == "open") { stage = "open" }
                ForEach(Sales.stages, id: \.self) { s in
                    let n = pool.filter { $0.status == s }.count
                    if n > 0 || stage == s {
                        FilterChip(title: Sales.stage(s).label, count: n, on: stage == s) { stage = s }
                    }
                }
                FilterChip(title: "الكل", count: pool.count, on: stage == "all") { stage = "all" }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .padding(.horizontal, -Buad.gutter)
        .background(Buad.canvas)
    }

    private func load() async {
        do {
            items = try await APIClient.shared.opportunities()
            ScreenMemory.opportunities = items
            error = nil
        } catch {
            session.handle(error)
            if ScreenMemory.opportunities == nil { self.error = (error as? APIError)?.message ?? APIError.network.message }
        }
        loaded = true
    }
}

/// LeadCard for the phone: stage, follow-up, name and entity, service, value.
private struct LeadRow: View {
    let o: Opportunity

    var body: some View {
        let st = Sales.stage(o.status)
        Card {
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                if o.isOpen, let f = Sales.followUp(o.followUpAt) { Pill(text: f.label, tone: f.tone) }
                if o.interest { Pill(text: "تسجيل اهتمام") }
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(o.entity.isEmpty ? o.name : o.entity).font(.headline).foregroundStyle(Buad.ink).lineLimit(2)
                if !o.entity.isEmpty && !o.name.isEmpty { Text(o.name).font(.subheadline).foregroundStyle(Buad.muted).lineLimit(1) }
                if !o.productName.isEmpty { Text(o.productName).font(.footnote.weight(.medium)).foregroundStyle(Buad.accentInk).lineLimit(1) }
            }
            HStack {
                Text("\(Sales.source(o.source)) · وصل \(Self.ago(o.createdAt))").font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
                Spacer()
                if o.value > 0 { Text(Fmt.sar(o.value)).font(.subheadline.weight(.semibold)).monospacedDigit() }
            }
        }
    }
}

extension LeadRow {
    /// «اليوم», «أمس», «قبل 3 أيام», «قبل أسبوعين», then the date.
    static func ago(_ epoch: Int) -> String {
        guard epoch > 0 else { return "" }
        let days = Int((Date().timeIntervalSince1970 - TimeInterval(epoch)) / 86_400)
        switch days {
        case ..<1: return "اليوم"
        case 1: return "أمس"
        case 2: return "قبل يومين"
        case 3...10: return "قبل \(days) أيام"
        case 11...13: return "قبل \(days) يوماً"
        case 14...20: return "قبل أسبوعين"
        default: return Fmt.epochDay(epoch)
        }
    }
}

// MARK: - اللوحة

private struct SalesBoard: View {
    @EnvironmentObject private var session: Session
    @State private var data: SalesOverview? = ScreenMemory.salesOverview
    @State private var loaded = ScreenMemory.salesOverview != nil
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if let d = data {
                    tiles(d)
                    pipeline(d)
                    if !d.stale.isEmpty { stale(d) }
                    quotes(d)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func tiles(_ d: SalesOverview) -> some View {
        JoinedGrid {
            GridRow {
                tile("الفرص المفتوحة", String(d.openCount), sub: Fmt.sar(d.openValue))
                tile("القيمة المرجّحة", Fmt.sar(d.openWeighted), sub: "حسب احتمال كل مرحلة")
            }
            GridRow {
                tile("نسبة الكسب", d.winRate.map { Self.pct($0) } ?? "—", sub: "\(d.won) مكسوبة · \(d.lost) خاسرة",
                     tone: (d.winRate ?? 0) >= 50 ? .ok : nil)
                tile("مكسوب هذا الربع", Fmt.sar(d.wonThisQuarter), sub: d.avgCycleDays.map { "متوسط الإغلاق \(Fmt.days($0))" },
                     tone: d.wonThisQuarter > 0 ? .ok : nil)
            }
            GridRow {
                tile("متابعات مستحقة", String(d.leadsDue), sub: d.clientsDue > 0 ? "و\(d.clientsDue) عميل" : "لا شيء متأخر", tone: d.leadsDue > 0 ? .warn : nil)
                tile("قبول العروض", d.acceptRate.map { Self.pct($0) } ?? "—", sub: "\(d.quotesAccepted) من \(d.quotesSent) · \(Fmt.short(d.acceptedValue))")
            }
        }
    }

    private func pipeline(_ d: SalesOverview) -> some View {
        let top = max(1, d.stages.map(\.value).max() ?? 1)
        return Card {
            Text("خط المبيعات").font(.headline)
            ForEach(d.stages) { s in
                let st = Sales.stage(s.stage)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(st.label).font(.subheadline.weight(.medium))
                        Text("\(s.count)").font(.caption).foregroundStyle(Buad.muted).monospacedDigit()
                        Spacer()
                        Text(Fmt.sar(s.value)).font(.subheadline.weight(.semibold)).monospacedDigit()
                    }
                    ProgressBar(value: Double(s.value) / Double(top), color: st.tone.foreground)
                    if let hint = Sales.stageHint[s.stage] { Text(hint).font(.caption2).foregroundStyle(Buad.muted) }
                }
            }
        }
    }

    private func stale(_ d: SalesOverview) -> some View {
        Card {
            Label("فرص بلا حركة منذ أسبوع", systemImage: "hourglass").font(.headline).foregroundStyle(Buad.warningInk)
            ForEach(d.stale) { l in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(l.name.isEmpty ? l.entity : l.name).font(.subheadline.weight(.medium)).lineLimit(1)
                        Text("\(Sales.stage(l.status).label) · منذ \(Fmt.days(l.daysIdle))").font(.caption).foregroundStyle(Buad.muted)
                    }
                    Spacer()
                    if l.value > 0 { Text(Fmt.short(l.value)).font(.subheadline).monospacedDigit() }
                }
            }
        }
    }

    @ViewBuilder private func quotes(_ d: SalesOverview) -> some View {
        if !d.waiting.isEmpty || !d.expiring.isEmpty {
            Card {
                Text("عروض الأسعار").font(.headline)
                ForEach(d.waiting) { q in quoteRow(q, note: "تنتظر رداً منذ \(Fmt.days(q.days))", tone: .info) }
                ForEach(d.expiring) { q in quoteRow(q, note: "تنتهي \(Fmt.day(q.validUntil))", tone: .warn) }
            }
        }
    }

    private func quoteRow(_ q: SalesOverview.QuoteBrief, note: String, tone: Tone) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(q.title.isEmpty ? q.number : q.title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text([Fmt.ltr(q.number), q.recipient].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(Fmt.sar(q.total)).font(.subheadline.weight(.semibold)).monospacedDigit()
                Pill(text: note, tone: tone)
            }
        }
    }

    private func tile(_ title: String, _ value: String, sub: String? = nil, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.body.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub { Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2) }
        }
        .joinedCell(minHeight: 62)
    }

    private static func pct(_ v: Double) -> String { v == v.rounded() ? "\(Int(v))%" : String(format: "%.1f%%", v) }

    private func load() async {
        do {
            data = try await APIClient.shared.salesOverview()
            ScreenMemory.salesOverview = data
            error = nil
        } catch {
            session.handle(error)
            if data == nil { self.error = (error as? APIError)?.message ?? APIError.network.message }
        }
        loaded = true
    }
}

// MARK: - صفحة الفرصة

struct OpportunityView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    let id: String
    let preview: Opportunity

    @State private var detail: OpportunityDetail?
    @State private var loaded = false
    @State private var error: String?
    @State private var logging = false
    @State private var losing = false
    @State private var winning = false
    @State private var converting = false
    @State private var lostReason = ""
    /// The stage a move is on its way to (shows a spinner on that step).
    @State private var movingTo: String?
    @State private var toast: ToastItem?
    @State private var quoting = false
    @State private var editing = false

    private var canEdit: Bool { session.me?.can("sales.edit") ?? false }
    private var o: Opportunity { detail?.opportunity ?? preview }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let error { EmptyNote(text: error, icon: "exclamationmark.triangle") }
                track
                actionRow
                details
                if let d = detail, !d.quotes.isEmpty || (canEdit && o.isOpen) { offers(d) }
                MeetingsSection(requestId: id, presetClientId: o.clientId)
                timeline
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(o.name.isEmpty ? o.entity : o.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { if !loaded { await load() } }
        .toast($toast)
        .sheet(isPresented: $logging) {
            ActivitySheet(opportunityId: id, followUpAt: o.followUpAt) { message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $editing) {
            OpportunityEditSheet(opportunity: o) {
                toast = ToastItem(text: "حُفظت الفرصة")
                Task { await load() }
            }
        }
        .sheet(isPresented: $quoting) {
            QuoteEditor(opportunity: o) { _ in
                toast = ToastItem(text: "أُنشئ عرض السعر مسودةً. أرسله من صفحته.")
                Task { await load() }
            }
        }
        .confirmationDialog("كسب الفرصة", isPresented: $winning, titleVisibility: .visible) {
            if canEdit && o.projectId.isEmpty { Button("مكسوبة وإنشاء مشروعها") { converting = true } }
            Button("تعليمها كمكسوبة فقط") { Task { await move("won") } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("«مكسوبة وإنشاء مشروعها» يُنشئ العميل (إن لم يكن موجوداً) ومشروعاً مسودة، ويربطهما بالفرصة. وإن كان لها عرض سعر مقبول فالأفضل «تحويل إلى مشروع» من صفحة العرض ليحمل سعره وجدول دفعاته.")
        }
        .sheet(isPresented: $converting) {
            ConvertOpportunitySheet(opportunity: o) { result in
                toast = ToastItem(text: "أُنشئ المشروع \(result.number)")
                ScreenMemory.opportunities = nil
                Task { await load() }
                nav.open("/projects/\(result.projectId)")
            }
        }
        .alert("إغلاق الفرصة كخاسرة", isPresented: $losing) {
            TextField("السبب: السعر، اختاروا جهة أخرى، لا ميزانية…", text: $lostReason)
            Button("إغلاق كخاسرة", role: .destructive) { Task { await move("lost", extra: ["lostReason": lostReason]) } }
            Button("إلغاء", role: .cancel) {}
        }
    }

    private var header: some View {
        let st = Sales.stage(o.status)
        return VStack(alignment: .leading, spacing: 6) {
            Text(o.name.isEmpty ? o.entity : o.name).font(.title2.bold())
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                if o.isOpen, let f = Sales.followUp(o.followUpAt) { Pill(text: "\(f.label) · \(Fmt.dayMonth(o.followUpAt))", tone: f.tone) }
            }
            if !o.entity.isEmpty && !o.name.isEmpty { Label(o.entity, systemImage: "building.2").font(.subheadline).foregroundStyle(Buad.muted) }
            if o.value > 0 { Text("القيمة المتوقعة \(Fmt.sar(o.value))").font(.subheadline.weight(.semibold)).monospacedDigit() }
        }
    }

    /// Where the opportunity is, at a glance: four steps filled up to the current one, each named
    /// beneath; a won or lost one shows its result instead. Moving it is the «الحالة» action below.
    @ViewBuilder private var track: some View {
        let open = Sales.openStages
        let idx = open.firstIndex(of: o.status)
        let st = Sales.stage(o.status)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(st.label).font(.subheadline.weight(.bold)).foregroundStyle(st.tone.foreground)
                if let hint = Sales.stageHint[o.status] { Text(hint).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
                Spacer()
                if movingTo != nil { ProgressView().controlSize(.small) }
            }
            if let idx {
                HStack(spacing: 4) {
                    ForEach(Array(open.enumerated()), id: \.element) { i, s in
                        VStack(spacing: 5) {
                            Capsule().fill(i <= idx ? st.tone.foreground : Buad.line).frame(height: 5)
                            Text(Sales.stage(s).label).font(.system(size: 10.5, weight: i == idx ? .bold : .regular))
                                .foregroundStyle(i == idx ? Buad.ink : Buad.muted).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("المرحلة \(idx + 1) من \(open.count): \(st.label)")
            } else {
                Text(o.status == "won" ? "تم الاتفاق وتحويل الفرصة" : o.lostReason.isEmpty ? "لم تكتمل الفرصة" : "لم تكتمل: \(o.lostReason)")
                    .font(.footnote).foregroundStyle(Buad.muted)
            }
        }
        .padding(12)
        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
    }

    /// Everything to do with the opportunity in one row: log a contact, write an offer, move it to
    /// another stage, call or write to them. Each opens its own action.
    @ViewBuilder private var actionRow: some View {
        let phone = o.phone.filter { $0.isNumber || $0 == "+" }
        let wa = ReceiptRules.whatsapp(o.phone)
        let mail = o.email
        let hasContact = !phone.isEmpty || !wa.isEmpty || !mail.isEmpty
        if (canEdit) || hasContact {
            ActionRow {
                if canEdit && o.isOpen {
                    ActionTile(icon: "plus.bubble", title: "تسجيل تواصل", primary: true) { logging = true }
                    ActionTile(icon: "doc.badge.plus", title: "عرض سعر") { quoting = true }
                }
                if canEdit {
                    ActionMenuTile(icon: "arrow.left.arrow.right", title: "الحالة", detail: Sales.stage(o.status).label) {
                        ForEach(Sales.stages.filter { $0 != o.status }, id: \.self) { s in
                            Button(Sales.stage(s).label) {
                                guard movingTo == nil else { return }
                                switch s {
                                case "won": winning = true
                                case "lost": lostReason = o.lostReason; losing = true
                                default: Task { await move(s) }
                                }
                            }
                        }
                    }
                }
                if hasContact {
                    ActionMenuTile(icon: "phone.fill", title: "اتصال") {
                        if !phone.isEmpty, let tel = URL(string: "tel:\(phone)") { Link(destination: tel) { Label("اتصال", systemImage: "phone") } }
                        if !wa.isEmpty, let url = URL(string: "https://wa.me/\(wa)") { Link(destination: url) { Label("واتساب", systemImage: "message") } }
                        if !mail.isEmpty, let m = URL(string: "mailto:\(mail)") { Link(destination: m) { Label("بريد", systemImage: "envelope") } }
                    }
                }
            }
        }
    }

    private var details: some View {
        Card {
            HStack {
                Text("بيانات الفرصة").font(.headline)
                Spacer()
                if canEdit {
                    Button { editing = true } label: { Label("تعديل", systemImage: "pencil").font(.subheadline.weight(.medium)) }
                        .frame(minHeight: Buad.tap)
                }
            }
            if !o.draftProjectId.isEmpty && o.isOpen {
                Label("مشروعها المسودة محفوظ: يعود برقمه ومستنداته ومهامه عند قبول العرض و«تحويل إلى مشروع».", systemImage: "briefcase")
                    .font(.footnote).foregroundStyle(Buad.infoInk)
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Buad.infoSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            if let d = detail, !d.clientName.isEmpty { row("العميل", d.clientName) }
            if !o.productName.isEmpty {
                let pkg = detail?.packageName ?? ""
                row("الخدمة", pkg.isEmpty ? o.productName : "\(o.productName) · \(pkg)")
            }
            row("المصدر", Sales.source(o.source))
            if let owner = detail?.ownerName, !owner.isEmpty { row("المسؤول", owner) }
            if !o.followUpAt.isEmpty { row("موعد المتابعة", Fmt.day(o.followUpAt)) }
            row("وصلت", Fmt.epochDay(o.createdAt))
            if o.status == "lost" && !o.lostReason.isEmpty { row("سبب عدم الإتمام", o.lostReason) }
            if !o.phone.isEmpty { row("الجوال", Fmt.ltr(o.phone)) }
            if !o.email.isEmpty { row("البريد الإلكتروني", Fmt.ltr(o.email)) }
            if !o.message.isEmpty {
                Text(o.message).font(.subheadline).foregroundStyle(Buad.muted)
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Buad.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            if !o.notes.isEmpty { Text(o.notes).font(.footnote).foregroundStyle(Buad.muted) }
        }
    }

    private func offers(_ d: OpportunityDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("العروض").font(.headline)
                Spacer()
                if canEdit && o.isOpen {
                    Button { quoting = true } label: { Label("عرض جديد", systemImage: "plus").font(.subheadline.weight(.semibold)) }
                        .frame(minHeight: Buad.tap)
                }
            }
            if d.quotes.isEmpty {
                Text("لا عروض لهذه الفرصة بعد.").font(.subheadline).foregroundStyle(Buad.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(d.quotes.enumerated()), id: \.element.id) { i, q in
                        if i > 0 { Divider().padding(.leading, 14) }
                        let st = Sales.quote(q.status, expired: q.expired)
                        NavigationLink(value: q) {
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(q.title.isEmpty ? q.number : q.title).font(.subheadline.weight(.medium)).lineLimit(1)
                                    Text([Fmt.ltr(q.number), q.validUntil.isEmpty ? "" : "صالح حتى \(Fmt.day(q.validUntil))"].filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(Buad.muted)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 3) {
                                    Text(Fmt.sar(q.total)).font(.subheadline.weight(.semibold)).monospacedDigit()
                                    Pill(text: st.label, tone: st.tone)
                                }
                                Chevron()
                            }
                            .padding(14)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        }
    }

    @ViewBuilder private var timeline: some View {
        Text("سجل التواصل").font(.headline)
        if let acts = detail?.activities {
            if acts.isEmpty {
                EmptyNote(text: "لم يُسجَّل تواصل بعد.", icon: "bubble.left.and.bubble.right")
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(acts.enumerated()), id: \.element.id) { i, a in
                        let kind = Sales.activity(a.type)
                        HStack(alignment: .top, spacing: 12) {
                            VStack(spacing: 0) {
                                Image(systemName: kind.icon).font(.caption.weight(.semibold))
                                    .frame(width: 30, height: 30)
                                    .background(Buad.brandSoft, in: Circle())
                                if i < acts.count - 1 { Rectangle().fill(Buad.line).frame(width: 1).frame(maxHeight: .infinity) }
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(kind.label) · \(Fmt.epochDay(a.at))" + (a.createdByName.isEmpty ? "" : " · \(a.createdByName)"))
                                    .font(.caption).foregroundStyle(Buad.muted)
                                Text(a.summary).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.bottom, 14)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(14)
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        } else if !loaded {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Buad.muted)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
    }

    private func move(_ stage: String, extra: [String: Any] = [:], undoable: Bool = true) async {
        let previous = o.status
        movingTo = stage
        defer { movingTo = nil }
        var body = extra
        body["status"] = stage
        do {
            try await APIClient.shared.updateOpportunity(id, body)
            await load()
            var undo: (@MainActor () async -> Void)? = nil
            if undoable {
                undo = { await self.move(previous, undoable: false) }
            }
            toast = ToastItem(text: "نُقلت إلى «\(Sales.stage(stage).label)»", undo: undo)
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func load() async {
        do {
            detail = try await APIClient.shared.opportunity(id)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

/// «تسجيل تواصل» (features/sales/Timeline.tsx): what happened, when, and the next follow-up.
private struct ActivitySheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let opportunityId: String
    let followUpAt: String
    let saved: (String) -> Void

    @State private var type = "call"
    @State private var summary = ""
    @State private var on = Date()
    @State private var setFollowUp = false
    @State private var next = Date().addingTimeInterval(3 * 86_400)
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Picker("النوع", selection: $type) {
                        ForEach(Sales.activityTypes, id: \.self) { Label(Sales.activity($0).label, systemImage: Sales.activity($0).icon).tag($0) }
                    }
                    TextField("ماذا قيل؟ ما الخطوة التالية؟", text: $summary, axis: .vertical).lineLimit(3...8)
                    DatePicker("التاريخ", selection: $on, in: ...Date(), displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                }
                Section {
                    Toggle("موعد المتابعة التالية", isOn: $setFollowUp.animation())
                    if setFollowUp {
                        DatePicker("المتابعة", selection: $next, in: Date()..., displayedComponents: .date)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                    }
                } footer: {
                    if !followUpAt.isEmpty && !setFollowUp { Text("تبقى المتابعة الحالية: \(Fmt.day(followUpAt)).") }
                }
                Section {
                    Button { Task { await save() } } label: {
                        HStack { Spacer(); if busy { ProgressView() } else { Text("تسجيل").bold() }; Spacer() }
                    }
                    .disabled(busy)
                }
            }
            .navigationTitle("تسجيل تواصل")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, busy: busy, saveTitle: "حفظ التواصل") {
                Task { await save() }
            }
        }
    }

    private func save() async {
        let text = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { error = "اكتب ما حدث."; return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.logActivity(opportunityId, type: type, summary: text, on: Fmt.isoDay(on),
                                                   followUpAt: setFollowUp ? Fmt.isoDay(next) : nil)
            saved("سُجّل التواصل")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}
