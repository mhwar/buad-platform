import SwiftUI

/// «المالية ← الضريبة» (features/finance-overview/VatTab.tsx), read-only: the year's returns by
/// quarter (due date and where each stands), then the year or one quarter in detail — the three
/// figures, the warnings, sales, purchases with tax invoices and what is still to identify.
/// Filing a return, company purchases and the VAT settings stay on the website.
struct VatView: View {
    @EnvironmentObject private var session: Session
    @State private var year = ScreenMemory.vatYear
    @State private var quarter = ScreenMemory.vatQuarter
    @State private var report: VatReport? = ScreenMemory.vat?.report
    @State private var yearData: VatYear? = ScreenMemory.vat?.yearData
    @State private var loaded = ScreenMemory.vat != nil
    @State private var reloading = false
    @State private var error: String?

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

        Text("تسجيل الإقرارات وسدادها، ومشتريات الشركة، وإعدادات الضريبة من الموقع.").font(.footnote).foregroundStyle(Buad.muted)
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
