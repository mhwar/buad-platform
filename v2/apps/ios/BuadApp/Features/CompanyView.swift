import SwiftUI

/// «المالية ← الشركة» (finance-overview/CompanyTab.tsx): the company's own books apart from the
/// projects — project profit, service income, the company's expenses, net profit, what is available
/// to share and the bank minimum — the monthly movement, what was kept back, and the company's ledger
/// of income and expenses (add, edit, remove, restore). Reads need treasury.view, writes treasury.edit.
struct CompanyView: View {
    @EnvironmentObject private var session: Session
    @State private var period = FinancePeriod()
    @State private var data: CompanyOverview?
    @State private var entries: [CompanyEntry] = []
    @State private var archived = false
    @State private var kind = "all"
    @State private var loaded = false
    @State private var reloading = false
    @State private var error: String?
    @State private var editing: EntryTarget?
    @State private var toast: ToastItem?

    struct EntryTarget: Identifiable {
        let entry: CompanyEntry?
        let type: String
        var id: String { entry?.id ?? "new-\(type)" }
    }

    private var canEdit: Bool { session.me?.can("treasury.edit") ?? false }

    private var shown: [CompanyEntry] {
        entries.filter { kind == "all" || $0.type == kind }
            .filter { e in
                guard let (from, to) = period.bounds, !archived else { return true }
                let d = e.type == "income" && !e.paymentDate.isEmpty ? e.paymentDate : e.date
                return d >= from && d <= to
            }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                PeriodBar(period: $period, reloading: reloading)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, data == nil {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if let d = data {
                    tiles(d)
                    if d.retained.total > 0 { retained(d) }
                    if d.monthly.contains(where: { $0.income > 0 || $0.expense > 0 }) { monthly(d) }
                    ledger
                    let idle = d.projects.filter { !$0.earning }
                    if !idle.isEmpty { notEarning(idle) }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .refreshable { await load() }
        .task(id: period) { reloading = loaded; await load(); reloading = false }
        .task(id: archived) { await loadEntries() }
        .toast($toast)
        .sheet(item: $editing) { t in
            CompanyEntrySheet(existing: t.entry, type: t.type) { toast = ToastItem(text: "حُفظ القيد"); Task { await load(); await loadEntries() } }
        }
    }

    private func tiles(_ d: CompanyOverview) -> some View {
        JoinedGrid {
            GridRow {
                tile("أرباح المشاريع", Fmt.sar(d.calc.projectProfit), sub: "المشاريع الجارية والمكتملة")
                tile("إيرادات الخدمات", Fmt.sar(d.calc.serviceIncome), sub: "بتاريخ وصولها للبنك")
            }
            GridRow {
                tile("مصروفات الشركة", Fmt.sar(d.calc.companyExpenses), sub: nil)
                tile("صافي ربح الشركة", Fmt.sar(d.calc.netProfit), sub: nil, tone: d.calc.netProfit >= 0 ? .ok : .bad)
            }
            GridRow {
                tile("المتاح للتوزيع", Fmt.sar(d.allTime.available), sub: "كل الفترات − ما وُزّع")
                tile("الحد الأدنى في البنك", Fmt.sar(d.bankMinimum), sub: "ما تحتاجه المشاريع الجارية للتنفيذ", tone: .warn)
            }
        }
    }

    private func tile(_ title: String, _ value: String, sub: String?, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            Text(value).font(.body.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub { Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2) }
        }
        .joinedCell(minHeight: 62)
    }

    private func retained(_ d: CompanyOverview) -> some View {
        Card {
            Text("المحتجز من التوزيعات").font(.headline)
            row("احتياطي", d.retained.reserve); row("تشغيل", d.retained.ops); row("تطوير", d.retained.dev)
            Divider()
            row("المجموع", d.retained.total, bold: true)
        }
    }

    private func row(_ t: String, _ v: Int, bold: Bool = false) -> some View {
        HStack { Text(t).foregroundStyle(bold ? Buad.ink : Buad.muted); Spacer(); Text(Fmt.sar(v)).monospacedDigit() }
            .font(bold ? .subheadline.weight(.bold) : .subheadline)
    }

    private func monthly(_ d: CompanyOverview) -> some View {
        let top = max(1, d.monthly.map { max($0.income, $0.expense) }.max() ?? 1)
        return Card {
            Text("إيرادات ومصروفات الشركة شهرياً").font(.headline)
            ForEach(d.monthly.suffix(12)) { m in
                VStack(alignment: .leading, spacing: 3) {
                    Text(m.month).font(.caption).foregroundStyle(Buad.muted).monospacedDigit()
                    HStack(spacing: 8) {
                        ProgressBar(value: Double(m.income) / Double(top), color: Buad.success)
                        Text(Fmt.short(m.income)).font(.caption2).monospacedDigit().frame(width: 52, alignment: .trailing)
                    }
                    HStack(spacing: 8) {
                        ProgressBar(value: Double(m.expense) / Double(top), color: Buad.dangerInk)
                        Text(Fmt.short(m.expense)).font(.caption2).monospacedDigit().frame(width: 52, alignment: .trailing)
                    }
                }
            }
        }
    }

    @ViewBuilder private var ledger: some View {
        Text("سجل إيرادات ومصروفات الشركة").font(.headline)
        if canEdit && !archived {
            ActionRow {
                ActionTile(icon: "plus.circle", title: "إيراد", primary: true) { editing = EntryTarget(entry: nil, type: "income") }
                ActionTile(icon: "minus.circle", title: "مصروف") { editing = EntryTarget(entry: nil, type: "expense") }
            }
        }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(title: "الكل", on: kind == "all") { kind = "all" }
                FilterChip(title: "إيرادات", on: kind == "income") { kind = "income" }
                FilterChip(title: "مصروفات", on: kind == "expense") { kind = "expense" }
                FilterChip(title: archived ? "المحذوفات ✓" : "المحذوفات", on: archived) { archived.toggle() }
            }
            .padding(.horizontal, Buad.gutter)
        }
        .padding(.horizontal, -Buad.gutter)
        if shown.isEmpty {
            EmptyNote(text: archived ? "لا قيود محذوفة." : "لا قيود في هذه الفترة.", icon: "list.bullet.rectangle")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Divider().padding(.leading, 14) }
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(e.description).font(.subheadline.weight(.medium)).lineLimit(2)
                            Text([Fmt.day(e.date), CompanyVocabulary.category(e.category), e.type == "income" && !e.paymentDate.isEmpty && e.paymentDate != e.date ? "وصل البنك \(Fmt.dayMonth(e.paymentDate))" : ""]
                                .filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Buad.muted).lineLimit(2)
                        }
                        Spacer(minLength: 6)
                        Text(Fmt.signed(e.amount, positive: e.type == "income")).font(.subheadline.weight(.semibold)).monospacedDigit()
                            .foregroundStyle(e.type == "income" ? Buad.successInk : Buad.ink)
                        if archived && canEdit {
                            Button("استعادة") { Task { await restore(e) } }.font(.caption.weight(.bold)).buttonStyle(.plain).foregroundStyle(Buad.accentInk)
                        }
                    }
                    .padding(12)
                    .contentShape(Rectangle())
                    .onTapGesture { if canEdit && !archived { editing = EntryTarget(entry: e, type: e.type) } }
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func notEarning(_ list: [CompanyOverview.Proj]) -> some View {
        Card {
            Text("مشاريع لا تدخل في أرباح الشركة").font(.headline)
            ForEach(list) { p in
                HStack {
                    Text(p.name).font(.subheadline).lineLimit(1)
                    Spacer()
                    Text(Vocabulary.status(p.status).label).font(.caption).foregroundStyle(Buad.muted)
                    Text(Fmt.short(p.profit)).font(.caption).monospacedDigit().foregroundStyle(Buad.muted)
                }
            }
        }
    }

    private func load() async {
        do { data = try await APIClient.shared.companyOverview(period); error = nil } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }

    private func loadEntries() async {
        do { entries = try await APIClient.shared.companyEntries(archived: archived) } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }

    private func restore(_ e: CompanyEntry) async {
        do { try await APIClient.shared.restoreCompanyEntry(e.id); toast = ToastItem(text: "استُعيد القيد"); await load(); await loadEntries() } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّرت الاستعادة"
        }
    }
}

/// An income or expense of the company's own ledger: what, how much, its category, its date, and — for
/// income — the day it reached the bank, which decides the quarter it counts in.
struct CompanyEntrySheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let existing: CompanyEntry?
    let type: String
    let saved: () -> Void

    @State private var description = ""
    @State private var amount = ""
    @State private var category = "other"
    @State private var date = Date()
    @State private var paymentDate: Date?
    @State private var note = ""
    @State private var confirmDelete = false
    @State private var error: String?
    @State private var busy = false
    @State private var started = false

    private var categories: [(key: String, label: String)] { type == "income" ? CompanyVocabulary.incomeCategories : CompanyVocabulary.expenseCategories }

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) } }
                Section {
                    TextField("البيان *", text: $description, axis: .vertical)
                    HStack {
                        Text("المبلغ (ر.س) *")
                        TextField("0", text: $amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing).environment(\.layoutDirection, .leftToRight)
                    }
                    Picker("التصنيف", selection: $category) { ForEach(categories, id: \.key) { Text($0.label).tag($0.key) } }
                    DatePicker("التاريخ", selection: $date, displayedComponents: .date).environment(\.calendar, Calendar(identifier: .gregorian))
                    if type == "income" { OptionalDateRow(title: "تاريخ وصوله للبنك", date: $paymentDate) }
                } footer: {
                    if type == "income" { Text("تاريخ الوصول للبنك يحدد ربع السنة الذي يُحسب فيه الإيراد.") }
                }
                Section { TextField("ملاحظة", text: $note, axis: .vertical).lineLimit(2...5) }
                if existing != nil {
                    Section { Button("حذف القيد", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle(existing == nil ? (type == "income" ? "إيراد جديد" : "مصروف جديد") : "تعديل القيد")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started, busy: busy, saveTitle: existing == nil ? "إضافة" : "حفظ") { Task { await save() } }
            .confirmationDialog("حذف هذا القيد؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف القيد", role: .destructive) { Task { await remove() } }
                Button("إلغاء", role: .cancel) {}
            } message: { Text("يمكن استعادته من «المحذوفات».") }
            .onAppear {
                guard !started else { return }
                started = true
                if let e = existing {
                    description = e.description; amount = EntrySheet.plain(e.amount); category = e.category
                    date = Fmt.date(e.date) ?? Date(); paymentDate = Fmt.date(e.paymentDate); note = e.note
                }
            }
        }
    }

    private func save() async {
        let d = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !d.isEmpty, let a = ReceiptRules.riyals(amount), a > 0 else { error = "أدخل البيان والمبلغ."; return }
        guard await Confirm.owner("تأكيد \(existing == nil ? "إضافة" : "تعديل") \(type == "income" ? "إيراد" : "مصروف") للشركة بمبلغ \(Fmt.sar(Int((a * 100).rounded())))") else { return }
        let body: [String: Any] = [
            "type": type, "category": category, "date": Fmt.isoDay(date), "paymentDate": type == "income" ? (paymentDate.map(Fmt.isoDay) ?? "") : "",
            "description": d, "amount": (a * 100).rounded() / 100, "note": note.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.saveCompanyEntry(existing?.id, body)
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }

    private func remove() async {
        guard let e = existing, await Confirm.owner("تأكيد حذف القيد «\(e.description)»") else { return }
        do { try await APIClient.shared.deleteCompanyEntry(e.id); saved(); dismiss() } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }
}
