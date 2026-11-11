import SwiftUI

/// «المالية ← الضريبة» (features/finance-overview/VatTab.tsx), read-only: the year's returns by
/// quarter (due date and where each stands), then the year or one quarter in detail — the three
/// figures, the warnings, sales, purchases with tax invoices and what is still to identify.
/// A return is recorded and paid here (vat.edit), the rate and period are set here, and a tax payment
/// booked as a project expense is moved into its quarter's return.
struct VatView: View {
    @EnvironmentObject private var session: Session
    @State private var year = ScreenMemory.vatYear
    @State private var quarter = ScreenMemory.vatQuarter
    @State private var report: VatReport? = ScreenMemory.vat?.report
    @State private var yearData: VatYear? = ScreenMemory.vat?.yearData
    @State private var loaded = ScreenMemory.vat != nil
    @State private var reloading = false
    @State private var error: String?
    @State private var filing: VatYear.Quarter?
    @State private var settings = false
    @State private var toast: ToastItem?
    private var canEdit: Bool { session.me?.can("vat.edit") ?? false }

    private var years: [Int] {
        let y = Calendar(identifier: .gregorian).component(.year, from: Date())
        return (0..<4).map { y - $0 }
    }

    /// A quarter row was tapped: once its detail arrives, scroll to it so the tap visibly does something.
    @State private var showDetail = false

    var body: some View {
        ScrollViewReader { reader in
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 8) {
                    Menu {
                        Picker("السنة", selection: $year) { ForEach(years, id: \.self) { Text(String($0)).tag($0) } }
                    } label: {
                        HStack(spacing: 4) {
                            Text(String(year)).font(.subheadline.weight(.medium))
                            Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                        }
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(Buad.surface, in: Capsule()).foregroundStyle(Buad.ink)
                    }
                    Picker("الفترة", selection: $quarter) {
                        ForEach(0...4, id: \.self) { Text($0 == 0 ? "السنة" : "ر\($0)").tag($0) }
                    }
                    .pickerStyle(.segmented)
                    if canEdit {
                        Button { settings = true } label: {
                            Image(systemName: "gearshape").font(.body).frame(width: Buad.tap, height: Buad.tap).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).foregroundStyle(Buad.muted)
                        .accessibilityLabel("إعدادات الضريبة")
                    }
                }

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 28)
                } else if let error {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else {
                    Group {
                        if let y = yearData { returns(y) }
                        if let v = report { detail(v).id("detail") }
                    }
                    .opacity(reloading ? 0.4 : 1)
                    .animation(.easeOut(duration: 0.15), value: reloading)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .refreshable { await load() }
        .task { await load() }
        .toast($toast)
        .sheet(item: $filing) { q in
            FilingSheet(quarter: q) { toast = ToastItem(text: "حُفظ الإقرار"); Task { await load() } }
        }
        .sheet(isPresented: $settings) {
            VatSettingsSheet { toast = ToastItem(text: "حُفظت إعدادات الضريبة"); Task { await load() } }
        }
        .onChange(of: year) { _, now in ScreenMemory.vatYear = now; reloading = true; Task { await load() } }
        .onChange(of: quarter) { _, now in ScreenMemory.vatQuarter = now; reloading = true; Task { await load() } }
        .onChange(of: reloading) { _, busy in
            guard !busy, showDetail else { return }
            showDetail = false
            withAnimation { reader.scrollTo("detail", anchor: .top) }
        }
        }
    }

    // MARK: إقرارات السنة

    private func returns(_ y: VatYear) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("إقرارات سنة \(String(year))").font(.headline)
            Text("يُقدَّم كل إقرار ويُسدَّد قبل نهاية الشهر التالي للربع. السداد للهيئة تسوية لا مصروف.")
                .font(.caption).foregroundStyle(Buad.muted)
            Text("صافي السنة \(Fmt.sar(y.netPayable)) · سُدِّد \(Fmt.sar(y.paid)) · \(y.balance >= 0 ? "المتبقي" : "رصيد دائن") \(Fmt.sar(abs(y.balance)))")
                .font(.footnote.weight(.medium))
            VStack(spacing: 0) {
                ForEach(Array(y.quarters.enumerated()), id: \.element.id) { i, x in
                    if i > 0 { Divider().padding(.leading, 14) }
                    let st = Self.filing(x.status)
                    HStack(spacing: 0) {
                    Button { if quarter != x.q { showDetail = true }; quarter = x.q } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("ر\(x.q)").font(.subheadline.weight(.bold))
                                .frame(width: 32, height: 32)
                                .background(quarter == x.q ? Buad.ink : Buad.brandSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .foregroundStyle(quarter == x.q ? Buad.onInk : Buad.ink)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text("الصافي \(Fmt.sar(x.netPayable))").font(.subheadline.weight(.semibold)).monospacedDigit()
                                    if x.warnings > 0 { Image(systemName: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(Buad.warningInk) }
                                }
                                Text("المخرجات \(Fmt.short(x.outputVat)) · المدخلات \(Fmt.short(x.inputVat))").font(.caption).foregroundStyle(Buad.muted)
                                Text("الموعد \(Fmt.day(x.dueDate))").font(.caption).foregroundStyle(Buad.muted)
                            }
                            Spacer()
                            Pill(text: st.0, tone: st.1)
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if canEdit {
                        Button { filing = x } label: {
                            Text(x.status == "paid" ? "تعديل" : "تسجيل").font(.subheadline.weight(.bold)).foregroundStyle(Buad.accentInk)
                                .padding(.horizontal, 12).frame(minHeight: Buad.tap).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    }
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    /// STATUS (VatTab.tsx).
    private static func filing(_ s: String) -> (String, Tone) {
        switch s {
        case "filed": return ("قُدِّم", .warn)
        case "paid": return ("سُدِّد", .ok)
        default: return ("مفتوح", .neutral)
        }
    }

    // MARK: التفصيل

    @ViewBuilder private func detail(_ v: VatReport) -> some View {
        Text("\(v.label) · المبيعات بتاريخ الفاتورة الضريبية المرسلة للعميل (أو تاريخ الاستلام إن لم تُسجَّل فاتورة)، والمشتريات بتاريخ فاتورتها · النسبة الحالية \(Self.rate(v.rate))%")
            .font(.caption).foregroundStyle(Buad.muted)

        if !v.warnings.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(v.warnings) { w in
                    Label(w.text, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(Buad.warningInk)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Buad.warningSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
        }

        JoinedGrid {
            GridRow { tile("ضريبة المبيعات (المخرجات)", Fmt.sar(v.outputVat), sub: "على مبيعات \(Fmt.sar(v.salesBase)) قبل الضريبة") }
            GridRow { tile("ضريبة المشتريات القابلة للخصم", Fmt.sar(v.inputVat), sub: "على مشتريات \(Fmt.sar(v.purchasesBase)) قبل الضريبة") }
            GridRow {
                tile(v.netPayable >= 0 ? "صافي المستحق للهيئة" : "صافي المسترد من الهيئة", Fmt.sar(abs(v.netPayable)),
                     sub: v.reserved > 0 ? "محجوز في المشاريع لها: \(Fmt.sar(v.reserved))" : nil,
                     tone: v.netPayable > 0 ? .warn : .ok)
            }
        }

        section("المبيعات", note: "الفواتير الضريبية المرسلة للعملاء بتاريخها. المشروع الذي لم تُسجَّل له فاتورة تُحتسب استلاماته المعتمدة بتاريخ وصولها، مؤقتاً.",
                empty: v.sales.isEmpty ? "لا مبيعات في هذه الفترة." : nil) {
            ForEach(Array(v.sales.enumerated()), id: \.element.id) { i, s in
                if i > 0 { Divider().padding(.leading, 14) }
                line(title: s.name, meta: [Fmt.day(s.date), s.clientName, s.source == "invoice" ? (s.invoiceNo.isEmpty ? "فاتورة" : "فاتورة \(Fmt.ltr(s.invoiceNo))") : "بتاريخ الاستلام"],
                     amount: s.base, vat: s.vat)
            }
        }

        section("المشتريات بفواتير ضريبية", note: "تدخل تلقائياً: كل مصروف في أي مشروع سُجّلت له فاتورة ضريبية، وكل مشترى للشركة بفاتورة.",
                empty: v.purchases.isEmpty ? "لا مشتريات بفواتير ضريبية في هذه الفترة." : nil) {
            ForEach(Array(v.purchases.enumerated()), id: \.element.id) { i, p in
                if i > 0 { Divider().padding(.leading, 14) }
                line(title: p.description.isEmpty ? p.supplierName : p.description,
                     meta: [Fmt.day(p.invoiceDate.isEmpty ? p.date : p.invoiceDate), p.supplierName, p.owner == "company" ? "الشركة" : p.projectName,
                            p.gaps > 0 ? "بيانات ناقصة" : ""],
                     amount: p.base, vat: p.vat, warn: p.gaps > 0)
            }
        }

        if !v.unidentified.isEmpty {
            section("مصروفات لم تُحدَّد بعد (\(v.unidentified.count))",
                    note: "مصروفات الفترة بلا فاتورة ضريبية (دون الرواتب وبنود الاتفاقية والزكاة والرسوم الحكومية). إن كان لأحدها فاتورة، سجّلوها لتُخصم ضريبتها.",
                    empty: nil) {
                ForEach(Array(v.unidentified.enumerated()), id: \.element.id) { i, u in
                    if i > 0 { Divider().padding(.leading, 14) }
                    line(title: u.description, meta: [Fmt.day(u.date), u.projectName, u.category], amount: u.amount, vat: nil)
                }
            }
        }

        if canEdit && !v.vatExpenses.isEmpty { vatExpensesCard(v) }
    }

    /// «سداد ضريبة مسجّل كمصروف مشروع»: move each into the quarter's return as a payment.
    private func vatExpensesCard(_ v: VatReport) -> some View {
        let quarters = yearData?.quarters ?? []
        return VStack(alignment: .leading, spacing: 8) {
            Text("سداد ضريبة مسجّل كمصروف مشروع (\(v.vatExpenses.count))").font(.headline)
            Text("دفعة للهيئة سُجّلت مصروفاً على مشروع، وحقها أن تكون سداداً لإقرار الربع لا تكلفة مشروع. انقلها إلى إقرارها.")
                .font(.caption).foregroundStyle(Buad.muted)
            VStack(spacing: 0) {
                ForEach(Array(v.vatExpenses.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Divider().padding(.leading, 14) }
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.description.isEmpty ? "سداد ضريبة" : e.description).font(.subheadline.weight(.medium)).lineLimit(1)
                            Text([Fmt.day(e.date), e.projectName].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Buad.muted)
                        }
                        Spacer()
                        Text(Fmt.sar(e.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        Menu {
                            ForEach(quarters) { q in
                                Button(q.label) { Task { await move(e, to: q.key) } }
                            }
                        } label: { Text("نقل").font(.subheadline.weight(.bold)).foregroundStyle(Buad.accentInk).frame(minHeight: Buad.tap).padding(.horizontal, 6) }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 4)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func move(_ e: VatReport.VatExpense, to key: String) async {
        guard await Confirm.owner("تأكيد نقل \(Fmt.sar(e.amount)) إلى سداد إقرار \(key)") else { return }
        do {
            try await APIClient.shared.convertVatEntry(projectId: e.projectId, entryId: e.entryId, periodKey: key)
            toast = ToastItem(text: "نُقل إلى سداد الإقرار")
            await load()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر النقل"
        }
    }

    private func section<Rows: View>(_ title: String, note: String, empty: String?, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(note).font(.caption).foregroundStyle(Buad.muted)
            if let empty {
                EmptyNote(text: empty, icon: "doc.text")
            } else {
                VStack(spacing: 0) { rows() }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        }
    }

    private func line(title: String, meta: [String], amount: Int, vat: Int?, warn: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium)).lineLimit(2)
                Text(meta.filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption)
                    .foregroundStyle(warn ? Buad.warningInk : Buad.muted).lineLimit(2)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.sar(amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                if let vat { Text("ضريبة \(Fmt.sar(vat))").font(.caption2).foregroundStyle(Buad.muted).monospacedDigit() }
            }
        }
        .padding(14)
    }

    private func tile(_ title: String, _ value: String, sub: String? = nil, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.footnote).foregroundStyle(Buad.muted)
            Text(value).font(.title3.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub { Text(sub).font(.caption).foregroundStyle(Buad.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Buad.surface)
    }

    private func load() async {
        let (y, q) = (year, quarter)
        do {
            async let r = APIClient.shared.vatReport(year: y, quarter: q)
            async let yr = APIClient.shared.vatYear(y)
            let (rr, yy) = try await (r, yr)
            guard y == year, q == quarter else { return }
            report = rr
            yearData = yy
            error = nil
            ScreenMemory.vat = (y, q, rr, yy)
        } catch {
            session.handle(error)
            if report == nil { self.error = (error as? APIError)?.message ?? APIError.network.message }
        }
        loaded = true
        reloading = false
    }

    private static func rate(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v) }
}

// MARK: - تسجيل الإقرار

/// «إقرار الربع» (FilingDialog): open, filed (the filing date), or paid (the payment date, the amount
/// paid and the transfer reference). The platform keeps the quarter's figures as they were when it was saved.
struct FilingSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let quarter: VatYear.Quarter
    let saved: () -> Void

    @State private var status = "filed"
    @State private var filedOn: Date?
    @State private var paidOn = Date()
    @State private var paidAmount = ""
    @State private var reference = ""
    @State private var error: String?
    @State private var busy = false
    @State private var started = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Picker("الحالة", selection: $status) {
                        Text("مفتوح").tag("open")
                        Text("قُدِّم ولم يُسدَّد").tag("filed")
                        Text("سُدِّد").tag("paid")
                    }
                    if status != "open" { OptionalDateRow(title: "تاريخ التقديم", date: $filedOn) }
                } footer: {
                    Text("الصافي \(Fmt.sar(quarter.netPayable)) · الموعد \(Fmt.day(quarter.dueDate))")
                }
                if status == "paid" {
                    Section {
                        DatePicker("تاريخ السداد", selection: $paidOn, displayedComponents: .date)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                        HStack {
                            Text("المبلغ المسدَّد (ر.س)")
                            TextField("0", text: $paidAmount).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                        TextField("رقم المرجع (سداد)", text: $reference).environment(\.layoutDirection, .leftToRight)
                    }
                }
            }
            .navigationTitle("إقرار \(quarter.label)")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .onAppear {
                guard !started else { return }
                started = true
                status = quarter.status == "open" ? "filed" : quarter.status
                filedOn = Fmt.date(quarter.filedOn)
                paidOn = Fmt.date(quarter.paidOn) ?? Date()
                paidAmount = EntrySheet.plain(quarter.paidAmount > 0 ? quarter.paidAmount : max(0, quarter.netPayable))
                reference = quarter.reference
            }
        }
    }

    private func save() async {
        var amount = 0.0
        if status == "paid" {
            guard let a = ReceiptRules.riyals(paidAmount), a >= 0 else { error = "المبلغ المسدَّد غير صحيح."; return }
            amount = a
        }
        guard await Confirm.owner("تأكيد تسجيل إقرار \(quarter.label) كـ«\(status == "paid" ? "مسدَّد" : status == "filed" ? "مقدَّم" : "مفتوح")»") else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.saveFiling(quarter.key, status: status, filedOn: status == "open" ? "" : (filedOn.map(Fmt.isoDay) ?? ""),
                                                  paidOn: status == "paid" ? Fmt.isoDay(paidOn) : "", paidRiyals: status == "paid" ? amount : 0,
                                                  reference: status == "paid" ? reference.trimmingCharacters(in: .whitespaces) : "", note: quarter.note)
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

/// «إعدادات الضريبة»: the rate and whether returns are quarterly or monthly (the VAT number comes from
/// the organisation's profile).
struct VatSettingsSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let saved: () -> Void

    @State private var rate = "15"
    @State private var period = "quarterly"
    @State private var number = ""
    @State private var loaded = false
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    HStack {
                        Text("نسبة الضريبة %")
                        TextField("15", text: $rate).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    Picker("دورة الإقرار", selection: $period) {
                        Text("ربع سنوية").tag("quarterly")
                        Text("شهرية").tag("monthly")
                    }
                } footer: {
                    Text(number.isEmpty ? "الرقم الضريبي للجهة غير مسجّل في بيانات الجهة." : "الرقم الضريبي للجهة: \(number)")
                }
            }
            .navigationTitle("إعدادات الضريبة")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: loaded, busy: busy || !loaded, saveTitle: "حفظ") { Task { await save() } }
            .task {
                guard !loaded else { return }
                if let s = try? await APIClient.shared.vatSettings() {
                    rate = EntrySheet.num(s.rate); period = s.period; number = s.vatNumber
                }
                loaded = true
            }
        }
    }

    private func save() async {
        guard let r = ReceiptRules.riyals(rate), r >= 0, r <= 100 else { error = "النسبة بين 0 و100."; return }
        guard await Confirm.owner("تأكيد تغيير نسبة الضريبة إلى \(EntrySheet.num(r))%") else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.saveVatSettings(rate: r, period: period)
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}
