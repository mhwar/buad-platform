import SwiftUI

/// «المبيعات» (features/sales): «الفرص» (OpportunitiesPage) and «اللوحة» (SalesDashboard).
/// Opportunities: stage pills with counts, search, «تحتاج متابعة», then each opportunity's page with its
/// timeline, offers, «تسجيل تواصل» and the stage. Reads need sales.view, writes sales.edit.
struct SalesView: View {
    enum Part: Hashable { case leads, board }
    @State private var part: Part = .leads

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("أقسام المبيعات", selection: $part) {
                    Text("الفرص").tag(Part.leads)
                    Text("اللوحة").tag(Part.board)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Buad.gutter)
                .padding(.vertical, 8)
                switch part {
                case .leads: OpportunitiesList()
                case .board: SalesBoard()
                }
            }
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("المبيعات")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Opportunity.self) { OpportunityView(id: $0.id, preview: $0) }
        }
    }
}

// MARK: - الفرص

private struct OpportunitiesList: View {
    @EnvironmentObject private var session: Session
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
                        EmptyNote(text: items.isEmpty ? "لا فرص بعد. تصل طلبات الموقع هنا، وتُضاف الفرص من الموقع."
                                    : dueOnly || !query.isEmpty ? "لا فرص تطابق هذا البحث. غيّر التصفية أو امسح البحث."
                                    : "لا فرص في هذا العرض.",
                                  icon: "target")
                    } else {
                        let total = shown.reduce(0) { $0 + $1.value }
                        Text("\(shown.count) فرصة" + (total > 0 ? " · \(Fmt.short(total)) ر.س" : ""))
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
        .onChange(of: stage) { _, now in ScreenMemory.salesStage = now }
        .onChange(of: dueOnly) { _, now in ScreenMemory.salesDueOnly = now }
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
                tile("مكسوب هذا الربع", Fmt.sar(d.wonThisQuarter), sub: d.avgCycleDays.map { "متوسط الإغلاق \($0) يوم" },
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
                        Text("\(Sales.stage(l.status).label) · منذ \(l.daysIdle) يوم").font(.caption).foregroundStyle(Buad.muted)
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
                ForEach(d.waiting) { q in quoteRow(q, note: "تنتظر رداً منذ \(q.days) يوم", tone: .info) }
                ForEach(d.expiring) { q in quoteRow(q, note: "تنتهي \(Fmt.day(q.validUntil))", tone: .warn) }
            }
        }
    }

    private func quoteRow(_ q: SalesOverview.QuoteBrief, note: String, tone: Tone) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(q.title.isEmpty ? q.number : q.title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text([q.number, q.recipient].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
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
        .joinedCell(minHeight: 78)
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
    let id: String
    let preview: Opportunity

    @State private var detail: OpportunityDetail?
    @State private var loaded = false
    @State private var error: String?
    @State private var logging = false
    @State private var losing = false
    @State private var winning = false
    @State private var lostReason = ""
    /// The stage a move is on its way to (shows a spinner on that step).
    @State private var movingTo: String?
    @State private var toast: ToastItem?

    private var canEdit: Bool { session.me?.can("sales.edit") ?? false }
    private var o: Opportunity { detail?.opportunity ?? preview }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let error { EmptyNote(text: error, icon: "exclamationmark.triangle") }
                stepper
                if canEdit && o.isOpen {
                    Button { logging = true } label: {
                        Label("تسجيل تواصل", systemImage: "plus.bubble")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                            .foregroundStyle(Buad.onInk)
                    }
                    .buttonStyle(.plain)
                }
                contact
                details
                if let d = detail, !d.quotes.isEmpty { offers(d) }
                timeline
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(o.name.isEmpty ? o.entity : o.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = APIClient.shared.webURL("/sales/\(id)") {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Link(destination: url) { Label("فتح في الموقع", systemImage: "safari") }
                        ShareLink(item: url) { Label("مشاركة الرابط", systemImage: "square.and.arrow.up") }
                    } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("إجراءات الفرصة") }
                }
            }
        }
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
        .confirmationDialog("كسب الفرصة", isPresented: $winning, titleVisibility: .visible) {
            Button("تعليمها كمكسوبة") { Task { await move("won") } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("تُعلَّم الفرصة «مكسوب». تحويلها إلى مشروع وإنشاء العقد من الموقع.")
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

    /// The stage stepper: tap a stage to move the opportunity there (sales.edit).
    /// «مراحل الفرصة»: the four open steps joined in order (done ones ticked), then «مكسوب», and «خاسر»
    /// apart. Tapping a step moves the opportunity there (sales.edit): «مكسوب» asks first, «خاسر» asks
    /// for the reason, and every move can be undone from the confirmation.
    private var stepper: some View {
        let current = Sales.stages.firstIndex(of: o.status) ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("مراحل الفرصة").font(.subheadline.weight(.semibold))
                if movingTo != nil { ProgressView().controlSize(.small) }
                Spacer()
                if let hint = Sales.stageHint[o.status] { Text(hint).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
            }
            ScrollViewReader { reader in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(Array(Sales.stages.enumerated()), id: \.element) { i, s in
                            if s == "lost" {
                                Rectangle().fill(Buad.line).frame(width: 1, height: 24).padding(.horizontal, 6)
                            } else if i > 0 {
                                Rectangle().fill(i <= current && o.status != "lost" ? Buad.success : Buad.line).frame(width: 10, height: 2)
                            }
                            step(s, done: o.status != "lost" && s != "lost" && i < current, on: o.status == s).id(s)
                        }
                    }
                    .padding(.horizontal, Buad.gutter)
                    .padding(.vertical, 2)
                }
                .onAppear { reader.scrollTo(o.status, anchor: .center) }
                .onChange(of: o.status) { _, now in withAnimation { reader.scrollTo(now, anchor: .center) } }
            }
            .padding(.horizontal, -Buad.gutter)
        }
    }

    @ViewBuilder private func step(_ s: String, done: Bool, on: Bool) -> some View {
        let st = Sales.stage(s)
        let look = HStack(spacing: 4) {
            if done { Image(systemName: "checkmark").font(.caption2.weight(.bold)) }
            Text(st.label).font(.subheadline.weight(on ? .bold : .medium))
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 34)
        .background(on ? st.tone.background : done ? Buad.successSoft : Buad.surface, in: Capsule())
        .overlay(Capsule().stroke(on ? st.tone.foreground : Buad.line))
        .foregroundStyle(on ? st.tone.foreground : done ? Buad.successInk : Buad.muted)
        if canEdit && !on {
            Button {
                guard movingTo == nil else { return }
                switch s {
                case "won": winning = true
                case "lost": lostReason = o.lostReason; losing = true
                default: Task { await move(s) }
                }
            } label: {
                look.padding(.vertical, 5).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(movingTo != nil)
            .accessibilityLabel("نقل إلى \(st.label)")
            .accessibilityHint(Sales.stageHint[s] ?? "")
        } else {
            look.padding(.vertical, 5)
                .accessibilityLabel(on ? "المرحلة الحالية: \(st.label)" : st.label)
        }
    }

    @ViewBuilder private var contact: some View {
        let phone = o.phone.filter { $0.isNumber || $0 == "+" }
        let wa = ReceiptRules.whatsapp(o.phone)
        if !phone.isEmpty || !o.email.isEmpty {
            HStack(spacing: 10) {
                if !phone.isEmpty, let tel = URL(string: "tel:\(phone)") { contactButton("اتصال", "phone.fill", tel) }
                if !wa.isEmpty, let url = URL(string: "https://wa.me/\(wa)") { contactButton("واتساب", "message.fill", url) }
                if !o.email.isEmpty, let mail = URL(string: "mailto:\(o.email)") { contactButton("بريد", "envelope.fill", mail) }
            }
        }
    }

    private func contactButton(_ title: String, _ icon: String, _ url: URL) -> some View {
        Link(destination: url) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.body)
                Text(title).font(.caption.weight(.medium))
            }
            .frame(maxWidth: .infinity).frame(height: 58)
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
            .foregroundStyle(Buad.ink)
        }
    }

    private var details: some View {
        Card {
            Text("بيانات الفرصة").font(.headline)
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
            if !o.phone.isEmpty { row("الجوال", o.phone) }
            if !o.email.isEmpty { row("البريد", o.email) }
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
            Text("العروض").font(.headline)
            VStack(spacing: 0) {
                ForEach(Array(d.quotes.enumerated()), id: \.element.id) { i, q in
                    if i > 0 { Divider().padding(.leading, 14) }
                    let st = Sales.quote(q.status, expired: q.expired)
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(q.title.isEmpty ? q.number : q.title).font(.subheadline.weight(.medium)).lineLimit(1)
                            Text([q.number, q.validUntil.isEmpty ? "" : "صالح حتى \(Fmt.day(q.validUntil))"].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(Buad.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(Fmt.sar(q.total)).font(.subheadline.weight(.semibold)).monospacedDigit()
                            Pill(text: st.label, tone: st.tone)
                        }
                    }
                    .padding(14)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            Text("إنشاء العروض ومعاينتها PDF في الإصدار التالي، والآن من الموقع.").font(.caption).foregroundStyle(Buad.muted)
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
            toast = ToastItem(text: "نُقلت إلى «\(Sales.stage(stage).label)»",
                              undo: undoable ? { await move(previous, undoable: false) } : nil)
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
                if let error { Section { Text(error).foregroundStyle(Buad.dangerInk) } }
                Section {
                    Button { Task { await save() } } label: {
                        HStack { Spacer(); if busy { ProgressView() } else { Text("تسجيل").bold() }; Spacer() }
                    }
                    .disabled(busy)
                }
            }
            .navigationTitle("تسجيل تواصل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("حفظ التواصل") { Task { await save() } }.bold().disabled(busy) }
            }
            // A typed note is not thrown away by a stray swipe; «إلغاء» still closes on purpose.
            .interactiveDismissDisabled(busy || !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
