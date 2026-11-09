import QuickLook
import SwiftUI

// MARK: - «العروض»: the list

/// «عروض الأسعار» (features/sales/SalesPage.tsx QuotesPage): every offer with its status, the ones
/// ending soon or waiting for an answer, search, and a few figures on top. Tap an offer to open it.
struct QuotesList: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var center: CreateCenter
    @State private var items: [SalesQuote] = ScreenMemory.quotes ?? []
    @State private var loaded = ScreenMemory.quotes != nil
    @State private var error: String?
    @State private var filter = "open"
    @State private var query = ""

    private var pool: [SalesQuote] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return items }
        return items.filter { "\($0.title) \($0.number) \($0.recipient) \($0.entity)".localizedCaseInsensitiveContains(q) }
    }

    private func matches(_ x: SalesQuote, _ f: String) -> Bool {
        switch f {
        case "open": return x.status == "draft" || x.status == "sent"
        case "waiting": return x.waiting
        case "ending": return x.endingSoon
        case "all": return true
        default: return x.status == f
        }
    }

    private let filters: [(String, String)] = [
        ("open", "الجارية"), ("waiting", "تنتظر رداً"), ("ending", "تنتهي قريباً"), ("draft", "مسودة"),
        ("sent", "أُرسل"), ("accepted", "مقبول"), ("rejected", "مرفوض"), ("all", "الكل"),
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                Section {
                    if !loaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                    } else if let error, items.isEmpty {
                        EmptyNote(text: error, icon: "wifi.exclamationmark")
                    } else if items.isEmpty {
                        EmptyNote(text: "لا عروض أسعار بعد. أنشئ أول عرض من زر «إنشاء».", icon: "doc.richtext")
                    } else {
                        if let error { RefreshBanner(text: error) }
                        summary
                        let shown = pool.filter { matches($0, filter) }
                        if shown.isEmpty {
                            EmptyNote(text: "لا عروض في هذا العرض.", icon: "doc.richtext")
                        } else {
                            ForEach(shown) { q in
                                NavigationLink(value: q) { QuoteCard(q: q) }.buttonStyle(.plain)
                            }
                        }
                    }
                } header: {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filters, id: \.0) { f in
                                let n = pool.filter { matches($0, f.0) }.count
                                if n > 0 || filter == f.0 || f.0 == "open" || f.0 == "all" {
                                    FilterChip(title: f.1, count: n, on: filter == f.0) { filter = f.0 }
                                }
                            }
                        }
                        .padding(.horizontal, Buad.gutter)
                        .padding(.vertical, 8)
                    }
                    .padding(.horizontal, -Buad.gutter)
                    .background(Buad.canvas)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.bottom, 16)
        }
        .searchable(text: $query, prompt: "ابحث برقم العرض أو عنوانه أو الجهة")
        .refreshable { await load() }
        .task { await load() }
        .onChange(of: center.revision) { _, _ in Task { await load() } }
    }

    /// The website's figures: sent, accepted, how much was accepted.
    private var summary: some View {
        let sent = items.filter { $0.status != "draft" }.count
        let accepted = items.filter { $0.status == "accepted" }
        let decided = items.filter { $0.status == "accepted" || $0.status == "rejected" }.count
        let rate = decided > 0 ? Int((Double(accepted.count) / Double(decided) * 100).rounded()) : nil
        return JoinedGrid {
            GridRow {
                stat("أُرسلت", String(sent))
                stat("نسبة القبول", rate.map { "\($0)%" } ?? "—")
                stat("قيمة المقبول", Fmt.short(accepted.reduce(0) { $0 + $1.total }))
            }
        }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.subheadline.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.8)
        }
        .joinedCell(minHeight: 54)
    }

    private func load() async {
        do {
            items = try await APIClient.shared.quotes()
            ScreenMemory.quotes = items
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

struct QuoteCard: View {
    let q: SalesQuote

    var body: some View {
        let st = Sales.quote(q.status, expired: q.expired)
        Card {
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                if q.converted { Pill(text: "حُوّل إلى مشروع", tone: .ok) }
                else if q.endingSoon { Pill(text: "تنتهي قريباً", tone: .warn) }
                Spacer(minLength: 0)
                Text(q.number).font(.caption.weight(.medium)).foregroundStyle(Buad.muted).environment(\.layoutDirection, .leftToRight)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(q.title).font(.headline).foregroundStyle(Buad.ink).lineLimit(2)
                let to = [q.entity, q.recipient].filter { !$0.isEmpty }.joined(separator: " · ")
                if !to.isEmpty { Text(to).font(.subheadline).foregroundStyle(Buad.muted).lineLimit(1) }
            }
            HStack {
                Text(q.validUntil.isEmpty ? "بلا تاريخ صلاحية" : "صالح حتى \(Fmt.day(q.validUntil))")
                    .font(.caption).foregroundStyle(q.expired ? Buad.dangerInk : Buad.muted)
                Spacer()
                Text(Fmt.sar(q.total)).font(.subheadline.weight(.semibold)).monospacedDigit()
            }
        }
    }
}

// MARK: - The offer's page

/// One offer: who it is for, the lines and totals, validity and terms, and what can be done with it
/// in its status (send, accept, reject, back to draft, convert to a project, PDF, copy, delete).
struct QuoteView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @Environment(\.dismiss) private var dismiss
    let id: String
    let preview: SalesQuote?

    @State private var quote: SalesQuote?
    @State private var error: String?
    @State private var busy = false
    @State private var toast: ToastItem?
    @State private var editing = false
    @State private var converting = false
    @State private var confirm: String?
    @State private var pdf: URL?
    @State private var copied: SalesQuote?

    private var canEdit: Bool { session.me?.can("sales.edit") ?? false }
    private var q: SalesQuote? { quote ?? preview }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let q {
                    header(q)
                    if let error { RefreshBanner(text: error) }
                    if canEdit { actions(q) }
                    lines(q)
                    if !q.terms.isEmpty {
                        Card {
                            Text("الشروط والملاحظات").font(.headline)
                            Text(q.terms).font(.subheadline).foregroundStyle(Buad.muted)
                        }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(q?.number ?? "عرض سعر")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let q {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { Task { await makePDF(q) } } label: { Label("معاينة PDF ومشاركته", systemImage: "doc.richtext") }
                        if canEdit {
                            Button { Task { await duplicate(q) } } label: { Label("نسخ العرض", systemImage: "plus.square.on.square") }
                            if q.status == "draft" {
                                Button(role: .destructive) { confirm = "delete" } label: { Label("حذف المسودة", systemImage: "trash") }
                            }
                        }
                    } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("إجراءات العرض") }
                }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .toast($toast)
        .quickLookPreview($pdf)
        .navigationDestination(item: $copied) { QuoteView(id: $0.id, preview: $0) }
        .sheet(isPresented: $editing) {
            if let q { QuoteEditor(existing: q) { _ in Task { await load(); toast = ToastItem(text: "حُفظ العرض") } } }
        }
        .sheet(isPresented: $converting) {
            if let q {
                ConvertQuoteSheet(quote: q) { result in
                    Task { await load() }
                    toast = ToastItem(text: "أُنشئ المشروع \(result.number)" + (result.instalments > 0 ? " وجدول من \(Fmt.instalments(result.instalments))" : ""))
                }
            }
        }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
                            titleVisibility: .visible) {
            switch confirm ?? "" {
            case "accepted": Button("تعليم العرض مقبولاً") { Task { await move("accepted") } }
            case "rejected": Button("تعليم العرض مرفوضاً", role: .destructive) { Task { await move("rejected") } }
            case "delete": Button("حذف المسودة", role: .destructive) { Task { await remove() } }
            default: EmptyView()
            }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text(confirm == "accepted" ? "العرض المقبول نهائي ولا يُعدَّل، ويمكن بعدها تحويله إلى مشروع." : "")
        }
    }

    private var confirmTitle: String {
        switch confirm ?? "" {
        case "accepted": return "قبِل العميل العرض؟"
        case "rejected": return "رفض العميل العرض؟"
        case "delete": return "حذف هذه المسودة؟"
        default: return ""
        }
    }

    private func header(_ q: SalesQuote) -> some View {
        let st = Sales.quote(q.status, expired: q.expired)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                if q.converted { Pill(text: "حُوّل إلى مشروع", tone: .ok) }
                Spacer(minLength: 0)
                Text(q.number).font(.caption.weight(.medium)).foregroundStyle(Buad.muted).environment(\.layoutDirection, .leftToRight)
            }
            Text(q.title).font(.title2.bold()).fixedSize(horizontal: false, vertical: true)
            let to = [q.entity, q.recipient].filter { !$0.isEmpty }.joined(separator: " · ")
            if !to.isEmpty { Label(to, systemImage: "building.2").font(.subheadline).foregroundStyle(Buad.ink) }
            HStack(alignment: .firstTextBaseline) {
                Text(Fmt.sar(q.total)).font(.title.bold()).monospacedDigit()
                Text("شامل الضريبة").font(.caption).foregroundStyle(Buad.muted)
            }
            Text(q.validUntil.isEmpty ? "بلا تاريخ صلاحية" : (q.expired ? "انتهت صلاحيته \(Fmt.day(q.validUntil))" : "صالح حتى \(Fmt.day(q.validUntil))"))
                .font(.footnote).foregroundStyle(q.expired ? Buad.dangerInk : Buad.muted)
        }
    }

    /// The next step for the offer's status, as one primary button and quieter secondary ones.
    @ViewBuilder private func actions(_ q: SalesQuote) -> some View {
        switch q.status {
        case "draft":
            HStack(spacing: 10) {
                primary("إرسال للعميل", "paperplane.fill") { Task { await move("sent") } }
                secondary("تعديل", "pencil") { editing = true }
            }
        case "sent":
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    primary("قُبِل", "checkmark.seal.fill") { confirm = "accepted" }
                    secondary("رُفض", "xmark") { confirm = "rejected" }
                }
                HStack(spacing: 10) {
                    secondary("تعديل", "pencil") { editing = true }
                    secondary("إرجاع لمسودة", "arrow.uturn.backward") { Task { await move("draft") } }
                }
            }
        case "rejected":
            HStack(spacing: 10) {
                primary("إعادة الإرسال", "paperplane") { Task { await move("sent") } }
                secondary("إرجاع لمسودة", "arrow.uturn.backward") { Task { await move("draft") } }
            }
        case "accepted":
            if q.converted {
                Button { nav.open("/projects/\(q.projectId)") } label: {
                    Label("فتح المشروع", systemImage: "briefcase.fill")
                        .font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 50)
                        .background(Buad.successSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                        .foregroundStyle(Buad.successInk)
                }
                .buttonStyle(.plain)
            } else {
                primary("تحويل إلى مشروع", "arrow.triangle.branch") { converting = true }
            }
        default: EmptyView()
        }
    }

    private func primary(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(Buad.onInk) } else { Image(systemName: icon) }
                Text(title).bold()
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
            .foregroundStyle(Buad.onInk)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func secondary(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Buad.control, style: .continuous).stroke(Buad.line))
                .foregroundStyle(Buad.ink)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func lines(_ q: SalesQuote) -> some View {
        Card {
            Text("البنود").font(.headline)
            if q.items.isEmpty {
                Text("لا بنود بعد.").font(.subheadline).foregroundStyle(Buad.muted)
            }
            ForEach(Array(q.items.enumerated()), id: \.offset) { i, item in
                if i > 0 { Divider() }
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label).font(.subheadline.weight(.medium))
                        Text("\(Self.qty(item.qty)) × \(Fmt.sar(Int((item.unit * 100).rounded())))").font(.caption).foregroundStyle(Buad.muted)
                    }
                    Spacer()
                    Text(Fmt.sar(Int((item.qty * item.unit * 100).rounded()))).font(.subheadline.weight(.semibold)).monospacedDigit()
                }
            }
            Divider()
            total("المجموع", q.subtotal)
            if q.discount > 0 { total("الخصم", -Int((q.discount * 100).rounded())) }
            total("ضريبة القيمة المضافة \(Self.qty(q.vatPct))%", q.vat)
            total("الإجمالي", q.total, strong: true)
        }
    }

    private func total(_ title: String, _ halalas: Int, strong: Bool = false) -> some View {
        HStack {
            Text(title).foregroundStyle(strong ? Buad.ink : Buad.muted)
            Spacer()
            Text(halalas < 0 ? Fmt.signed(halalas, positive: false) : Fmt.sar(halalas)).monospacedDigit()
        }
        .font(strong ? .body.weight(.bold) : .subheadline)
    }

    static func qty(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v) }

    // MARK: actions

    private func load() async {
        do {
            quote = try await APIClient.shared.quote(id)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }

    private func move(_ to: String) async {
        guard let q else { return }
        let from = q.status
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.setQuoteStatus(q.id, to: to)
            await load()
            let text = to == "sent" ? "عُلّم العرض مُرسلاً" : to == "accepted" ? "قُبل العرض. حوّله إلى مشروع متى شئت."
                : to == "rejected" ? "عُلّم العرض مرفوضاً" : "أُعيد العرض إلى مسودة"
            var undo: (@MainActor () async -> Void)? = nil
            if to != "accepted" {
                undo = { try? await APIClient.shared.setQuoteStatus(q.id, to: from); await self.load() }
            }
            toast = ToastItem(text: text, undo: undo)
            ScreenMemory.quotes = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func duplicate(_ q: SalesQuote) async {
        do {
            let newId = try await APIClient.shared.duplicateQuote(q.id)
            copied = try await APIClient.shared.quote(newId)
            ScreenMemory.quotes = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر نسخ العرض"
        }
    }

    private func remove() async {
        guard let q else { return }
        do {
            try await APIClient.shared.deleteQuote(q.id)
            ScreenMemory.quotes = nil
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }

    private func makePDF(_ q: SalesQuote) async {
        busy = true
        defer { busy = false }
        do {
            let data = try await APIClient.shared.quotePDF(q.id, name: "عرض-سعر-\(q.number)")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("عرض سعر \(q.number).pdf")
            try data.write(to: url, options: .atomic)
            pdf = url
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر إنشاء ملف PDF"
        }
    }
}

// MARK: - Writing an offer

/// «عرض سعر جديد» / editing a draft or sent offer (features/sales/QuoteDialog.tsx): the title, who it
/// is for (a client of the platform, or a name), the lines — typed, or a service package at its price —
/// the discount, VAT, validity and terms, with the totals worked out as the website does.
struct QuoteEditor: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    var existing: SalesQuote? = nil
    /// A new offer for an opportunity: its id, client and names come prefilled.
    var opportunity: Opportunity? = nil
    let saved: (String) -> Void

    @State private var title = ""
    @State private var clientId = ""
    @State private var clientName = ""
    @State private var recipient = ""
    @State private var entity = ""
    /// A line being edited, with its own identity so deleting one never confuses the fields.
    struct Line: Identifiable {
        let id = UUID()
        var label = ""
        var qty: Double = 1
        var unit: Double = 0
        var item: SalesQuote.Item { SalesQuote.Item(label: label, qty: qty, unit: unit) }
    }
    @State private var lines: [Line] = [Line()]
    private var items: [SalesQuote.Item] { lines.map(\.item) }
    @State private var discount = ""
    @State private var vatPct = "15"
    @State private var hasValidity = true
    @State private var validUntil = Date().addingTimeInterval(30 * 86_400)
    @State private var terms = ""
    /// The service package the offer was first priced from (kept with it, as the website does).
    @State private var productId = ""
    @State private var packageId = ""
    @State private var catalog: [CatalogItem] = []
    @State private var choosingClient = false
    @State private var error: String?
    @State private var busy = false
    @State private var baseline: String?
    @State private var started = false

    private var snapshot: String {
        ([title, clientId, recipient, entity, discount, vatPct, String(hasValidity), Fmt.isoDay(validUntil), terms]
            + items.map { "\($0.label)/\($0.qty)/\($0.unit)" }).joined(separator: "|")
    }

    private var totals: QuoteTotals {
        QuoteTotals(items: items.filter { !$0.label.trimmingCharacters(in: .whitespaces).isEmpty },
                    discountRiyals: ReceiptRules.riyals(discount) ?? 0, vatPct: ReceiptRules.riyals(vatPct) ?? 0)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    TextField("عنوان العرض *", text: $title, prompt: Text("مثلاً: تنفيذ ورشة القيادة"))
                    Button { choosingClient = true } label: {
                        HStack {
                            Text("العميل").foregroundStyle(Buad.ink)
                            Spacer()
                            Text(clientName.isEmpty ? "اختياري" : clientName).foregroundStyle(clientName.isEmpty ? Buad.muted : Buad.accentInk)
                            Chevron()
                        }
                    }
                    TextField("موجّه إلى", text: $recipient, prompt: Text("اسم الشخص"))
                    TextField("الجهة", text: $entity)
                } footer: {
                    if let o = opportunity { Text("مرتبط بالفرصة «\(o.entity.isEmpty ? o.name : o.entity)».") }
                }

                Section {
                    ForEach($lines) { $line in
                        VStack(alignment: .leading, spacing: 8) {
                            TextField("البند", text: $line.label, axis: .vertical)
                            HStack {
                                Text("الكمية").font(.caption).foregroundStyle(Buad.muted)
                                TextField("1", value: $line.qty, format: .number)
                                    .keyboardType(.decimalPad).frame(width: 64)
                                    .environment(\.layoutDirection, .leftToRight)
                                Spacer()
                                Text("السعر").font(.caption).foregroundStyle(Buad.muted)
                                TextField("0", value: $line.unit, format: .number)
                                    .keyboardType(.decimalPad).frame(width: 110)
                                    .multilineTextAlignment(.trailing)
                                    .environment(\.layoutDirection, .leftToRight)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .onDelete { lines.remove(atOffsets: $0); if lines.isEmpty { lines.append(Line()) } }
                    Button { lines.append(Line()) } label: { Label("إضافة بند", systemImage: "plus") }
                    if !catalog.isEmpty {
                        Menu {
                            ForEach(catalog) { c in
                                Button("\(c.productName) · \(c.packageName) — \(Fmt.sar(Int((c.price * 100).rounded())))") { add(c) }
                            }
                        } label: { Label("إضافة من باقة", systemImage: "shippingbox") }
                    }
                } header: {
                    Text("البنود")
                } footer: {
                    Text("اسحب البند لليسار لحذفه. أسعار الباقات كما في كتالوج الخدمات، شاملة التسعير المعتمد.")
                }

                Section {
                    HStack {
                        Text("خصم (ر.س)")
                        TextField("0", text: $discount).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    HStack {
                        Text("ضريبة القيمة المضافة %")
                        TextField("15", text: $vatPct).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    Toggle("له تاريخ صلاحية", isOn: $hasValidity.animation())
                    if hasValidity {
                        DatePicker("صالح حتى", selection: $validUntil, displayedComponents: .date)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                    }
                    TextField("الشروط والملاحظات", text: $terms, axis: .vertical).lineLimit(3...8)
                }

                Section("الإجماليات") {
                    row("المجموع", totals.subtotal)
                    if totals.discount > 0 { row("الخصم", -totals.discount) }
                    row("الضريبة", totals.vat)
                    row("الإجمالي", totals.total, strong: true)
                }
            }
            .navigationTitle(existing.map { "عرض سعر \($0.number)" } ?? "عرض سعر جديد")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: baseline.map { $0 != snapshot } ?? false, busy: busy, saveTitle: "حفظ") {
                Task { await save() }
            }
            .sheet(isPresented: $choosingClient) {
                ClientPicker { c in
                    clientId = c?.id ?? ""
                    clientName = c?.name ?? ""
                    if let c, entity.isEmpty { entity = c.name }
                }
            }
            .task { await start() }
        }
    }

    private func row(_ title: String, _ halalas: Int, strong: Bool = false) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(halalas < 0 ? Fmt.signed(halalas, positive: false) : Fmt.sar(halalas)).monospacedDigit()
        }
        .font(strong ? .body.weight(.bold) : .body)
    }

    private func add(_ c: CatalogItem) {
        let line = Line(label: "\(c.productName) — \(c.packageName)", qty: 1, unit: c.price)
        if let i = lines.firstIndex(where: { $0.label.trimmingCharacters(in: .whitespaces).isEmpty && $0.unit == 0 }) {
            lines[i] = line
        } else {
            lines.append(line)
        }
        if title.trimmingCharacters(in: .whitespaces).isEmpty { title = c.productName }
        if productId.isEmpty { productId = c.productId; packageId = c.packageId }
    }

    private func start() async {
        guard !started else { return }
        started = true
        if let q = existing {
            title = q.title; clientId = q.clientId; recipient = q.recipient; entity = q.entity
            lines = q.items.isEmpty ? [Line()] : q.items.map { Line(label: $0.label, qty: $0.qty, unit: $0.unit) }
            discount = q.discount > 0 ? QuoteView.qty(q.discount) : ""
            vatPct = QuoteView.qty(q.vatPct)
            hasValidity = !q.validUntil.isEmpty
            validUntil = Fmt.date(q.validUntil) ?? validUntil
            terms = q.terms
            clientName = q.entity
        } else if let o = opportunity {
            clientId = o.clientId; recipient = o.name; entity = o.entity
            clientName = o.entity.isEmpty ? o.name : o.entity
            title = o.productName
        }
        baseline = snapshot
        async let cat = try? APIClient.shared.catalog()
        async let rate = try? APIClient.shared.quoteVatRate()
        let (c, r) = await (cat, rate)
        catalog = c ?? []
        if existing == nil, let r {
            vatPct = QuoteView.qty(r)
            baseline = snapshot
        }
    }

    private func save() async {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { error = "اكتب عنوان العرض."; return }
        let filled = items.filter { !$0.label.trimmingCharacters(in: .whitespaces).isEmpty }
        if filled.contains(where: { $0.qty < 0 || $0.unit < 0 }) { error = "الكمية والسعر لا يكونان بالسالب."; return }
        var body: [String: Any] = [
            "title": name,
            "clientId": clientId,
            "recipient": recipient.trimmingCharacters(in: .whitespaces),
            "entity": entity.trimmingCharacters(in: .whitespaces),
            "items": filled.map { ["label": $0.label.trimmingCharacters(in: .whitespacesAndNewlines), "qty": $0.qty, "unit": $0.unit] },
            "discount": ReceiptRules.riyals(discount) ?? 0,
            "vatPct": ReceiptRules.riyals(vatPct) ?? 15,
            "validUntil": hasValidity ? Fmt.isoDay(validUntil) : "",
            "terms": terms.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        if existing == nil, let o = opportunity { body["requestId"] = o.id }
        if existing == nil, !productId.isEmpty { body["productId"] = productId; body["packageId"] = packageId }
        busy = true
        defer { busy = false }
        do {
            let id = try await APIClient.shared.saveQuote(id: existing?.id, version: existing?.version ?? 1, body)
            ScreenMemory.quotes = nil
            saved(id)
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

// MARK: - Converting an accepted offer

/// «تحويل إلى مشروع» (features/sales/ConvertQuoteDialog.tsx): the offer's client — or a new one made
/// from it, after the similar-name check — a project at the offer's value, and its payment schedule.
/// The linked opportunity is closed as won by the server.
struct ConvertQuoteSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let quote: SalesQuote
    let done: (ConvertResult) -> Void

    @State private var name = ""
    @State private var schedule = "half"
    @State private var clientId = ""
    @State private var clientName = ""
    @State private var choosingClient = false
    @State private var similar: String?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                if let similar {
                    Section {
                        Text(APIError.similarName(similar).message).foregroundStyle(Buad.warningInk)
                        Button("نعم، أنشئ عميلاً جديداً") { Task { await go(confirm: true) } }.bold()
                        Button("اختيار العميل الموجود") { choosingClient = true }
                    }
                }
                Section {
                    TextField("اسم المشروع", text: $name)
                    Button { choosingClient = true } label: {
                        HStack {
                            Text("العميل").foregroundStyle(Buad.ink)
                            Spacer()
                            Text(clientName.isEmpty ? "يُنشأ من العرض" : clientName)
                                .foregroundStyle(clientName.isEmpty ? Buad.muted : Buad.accentInk)
                            Chevron()
                        }
                    }
                } footer: {
                    Text("يُنشأ العميل إن لم يكن موجوداً، ومشروع بمسوّدة بقيمة العرض \(quote.number)، ويُغلق الطلب المرتبط كمكسوب.")
                }
                Section("جدول الدفعات") {
                    Picker("جدول الدفعات", selection: $schedule) {
                        ForEach(QuoteVocabulary.schedules, id: \.key) { Text($0.label).tag($0.key) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
            }
            .navigationTitle("تحويل إلى مشروع")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: false, busy: busy || name.trimmingCharacters(in: .whitespaces).isEmpty, saveTitle: "تحويل") {
                Task { await go(confirm: false) }
            }
            .sheet(isPresented: $choosingClient) {
                ClientPicker { c in
                    clientId = c?.id ?? ""
                    clientName = c?.name ?? ""
                    if c != nil { similar = nil }
                }
            }
            .onAppear {
                if name.isEmpty { name = quote.title }
                if clientId.isEmpty { clientId = quote.clientId; clientName = quote.clientId.isEmpty ? "" : quote.entity }
            }
        }
    }

    private func go(confirm: Bool) async {
        busy = true
        defer { busy = false }
        do {
            let r = try await APIClient.shared.convertQuote(quote.id, schedule: schedule, projectName: name.trimmingCharacters(in: .whitespaces),
                                                            clientId: clientId.isEmpty ? nil : clientId, confirmSimilarName: confirm)
            ScreenMemory.quotes = nil
            ScreenMemory.opportunities = nil
            done(r)
            dismiss()
        } catch let APIError.similarName(n) {
            similar = n
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر التحويل، حاول مرة أخرى."
        }
    }
}
