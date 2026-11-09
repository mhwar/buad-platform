import SwiftUI

/// «المالية ← النظرة العامة» (features/finance-overview/FinancePage.tsx Dashboard), read-only:
/// the period, the six headline figures with ▲▼ against the previous period, the data to complete,
/// the monthly movement, expenses by category, project profitability and open obligations.
/// Every figure is GET /api/finance/overview for the period, as the server computes it.
struct OverviewView: View {
    @EnvironmentObject private var session: Session
    @State private var period = ScreenMemory.overviewPeriod
    @State private var data: FinanceOverview? = ScreenMemory.overview?.data
    @State private var prev: FinanceOverview? = ScreenMemory.overview?.prev
    @State private var loaded = ScreenMemory.overview != nil
    /// A new period is on its way: the old figures stay, dimmed, until it arrives.
    @State private var reloading = false
    @State private var error: String?

    private var years: [Int] {
        let y = Calendar(identifier: .gregorian).component(.year, from: Date())
        return (0..<5).map { y - $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                periodPicker
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 28)
                } else if let error {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if let d = data {
                    Group {
                    if d.totals.projects == 0 && d.monthly.isEmpty {
                        EmptyNote(text: "لا مشاريع في هذه الفترة.", icon: "chart.bar")
                    } else {
                        quality(d)
                        tiles(d)
                        monthly(d)
                        categories(d)
                        profitability(d)
                        obligations(d)
                    }
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
        .onChange(of: period) { _, now in
            ScreenMemory.overviewPeriod = now
            reloading = true
            Task { await load() }
        }
    }

    // MARK: الفترة

    private var periodPicker: some View {
        HStack(spacing: 8) {
            Menu {
                Picker("الفترة", selection: $period.preset) {
                    Text("كل الفترات").tag(FinancePeriod.Preset.all)
                    Text("ربع سنة").tag(FinancePeriod.Preset.quarter)
                    Text("سنة كاملة").tag(FinancePeriod.Preset.year)
                }
            } label: { chip(period.preset == .all ? "كل الفترات" : period.preset == .quarter ? "ربع سنة" : "سنة كاملة") }
            if period.preset != .all {
                Menu {
                    Picker("السنة", selection: $period.year) {
                        ForEach(years, id: \.self) { Text(String($0)).tag($0) }
                    }
                } label: { chip(String(period.year)) }
            }
            if period.preset == .quarter {
                Picker("الربع", selection: $period.quarter) {
                    ForEach(1...4, id: \.self) { Text("ر\($0)").tag($0) }
                }
                .pickerStyle(.segmented)
            }
            Spacer(minLength: 0)
            if reloading { ProgressView().controlSize(.small) }
        }
    }

    private func chip(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text).font(.subheadline.weight(.medium))
            Image(systemName: "chevron.down").font(.caption2.weight(.bold))
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(Buad.surface, in: Capsule())
        .foregroundStyle(Buad.ink)
    }

    // MARK: بيانات ناقصة

    @ViewBuilder private func quality(_ d: FinanceOverview) -> some View {
        let dates = d.quality.filter(\.missingReceipts).count
        let statuses = d.quality.reduce(0) { $0 + $1.entriesWithoutStatus }
        if dates > 0 || statuses > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Label("بيانات ناقصة تؤثر على دقة الأرقام", systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Buad.warningInk)
                Text([
                    dates > 0 ? "\(dates) مشروع لم يُسجَّل له أي مبلغ مستلم (لا يُعرف ربعه ولا يدخل في التوزيع)" : "",
                    statuses > 0 ? "\(statuses) قيد بلا حالة (مدفوع/معلّق)" : "",
                ].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.caption).foregroundStyle(Buad.muted)
                Text("يُكمَل من الموقع.").font(.caption).foregroundStyle(Buad.muted)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Buad.warningSoft, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    // MARK: الأرقام الرئيسية

    private func tiles(_ d: FinanceOverview) -> some View {
        let t = d.totals
        let p = prev?.totals
        let items = d.pending.count + d.unregistered.count
        let label = period.previous?.label ?? ""
        return JoinedGrid {
            GridRow {
                tile("قيمة العقود (شامل الضريبة)", Fmt.sar(t.gross),
                     sub: "\(Fmt.projects(t.projects)) · ضريبة \(Fmt.short(t.vat))" + (t.withoutFinance > 0 ? " · \(t.withoutFinance) بلا مالية" : ""),
                     delta: p.map { delta(t.gross, $0.gross, label) })
                tile("صافي الربح", Fmt.sar(t.profit), sub: "هامش \(Self.pct(t.margin))", tone: t.profit > 0 ? .ok : nil,
                     delta: p.map { delta(t.profit, $0.profit, label) })
            }
            GridRow {
                tile("المستلم من العملاء", Fmt.sar(t.received), sub: "بتاريخ وصوله للبنك",
                     delta: p.map { delta(t.received, $0.received, label) })
                tile("المصروفات", Fmt.sar(t.spent), delta: p.map { delta(t.spent, $0.spent, label, lowerIsBetter: true) })
            }
            GridRow {
                tile("المتبقي من العقود", Fmt.sar(t.remaining), tone: t.remaining < 0 ? .bad : nil)
                tile("التزامات قائمة", Fmt.sar(t.pending + t.unregistered), sub: Fmt.items(items), tone: items > 0 ? .warn : nil)
            }
        }
    }

    /// StatTile's Delta (components/StatTile.tsx): «▲ 12% عن الربع الثاني 2026».
    private func delta(_ now: Int, _ before: Int, _ label: String, lowerIsBetter: Bool = false) -> (String, Tone) {
        if abs(now - before) < 1 { return ("بلا تغيّر عن \(label)", .neutral) }
        let up = now > before
        let good = lowerIsBetter ? !up : up
        let pct = before != 0 ? "\(Int((abs(Double(now - before) / Double(abs(before))) * 100).rounded()))%" : "جديد"
        return ("\(up ? "▲" : "▼") \(pct) عن \(label)", good ? .ok : .bad)
    }

    private func tile(_ title: String, _ value: String, sub: String? = nil, tone: Tone? = nil, delta: (String, Tone)? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted).lineLimit(2)
            Text(value).font(.body.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub { Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2) }
            if let delta { Text(delta.0).font(.caption2).foregroundStyle(delta.1 == .neutral ? Buad.muted : delta.1.foreground) }
        }
        .joinedCell(minHeight: 70)
    }

    // MARK: الحركة الشهرية

    @ViewBuilder private func monthly(_ d: FinanceOverview) -> some View {
        if !d.monthly.isEmpty {
            let top = max(1, d.monthly.map { max($0.income, $0.expense) }.max() ?? 1)
            Card {
                Text("الحركة الشهرية").font(.headline)
                HStack(spacing: 14) {
                    legend("الدخل", Buad.success)
                    legend("المصروفات", Buad.dangerInk)
                }
                ForEach(d.monthly.suffix(12)) { m in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(Self.monthName(m.month)).font(.caption.weight(.medium))
                            Spacer()
                            Text(Fmt.ltr("+" + Fmt.short(m.income))).foregroundStyle(Buad.successInk)
                            Text(Fmt.ltr("−" + Fmt.short(m.expense))).foregroundStyle(Buad.dangerInk)
                        }
                        .font(.caption).monospacedDigit()
                        ProgressBar(value: Double(m.income) / Double(top), color: Buad.success)
                        ProgressBar(value: Double(m.expense) / Double(top), color: Buad.dangerInk)
                    }
                }
            }
        }
    }

    private func legend(_ text: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.caption).foregroundStyle(Buad.muted)
        }
    }

    // MARK: المصروفات حسب التصنيف

    @ViewBuilder private func categories(_ d: FinanceOverview) -> some View {
        let list = Array(d.categories.prefix(8))
        if !list.isEmpty {
            let top = max(1, list.first?.amount ?? 1)
            Card {
                Text("المصروفات حسب التصنيف").font(.headline)
                ForEach(list) { c in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(c.label).font(.subheadline)
                            Spacer()
                            Text(Fmt.sar(c.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        }
                        ProgressBar(value: Double(c.amount) / Double(top), color: Buad.infoInk)
                    }
                }
            }
        }
    }

    // MARK: ربحية المشاريع

    @ViewBuilder private func profitability(_ d: FinanceOverview) -> some View {
        if !d.projects.isEmpty {
            Text("ربحية المشاريع").font(.headline)
            VStack(spacing: 0) {
                ForEach(Array(d.projects.sorted { $0.profit > $1.profit }.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { Divider().padding(.leading, 14) }
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.subheadline.weight(.medium)).lineLimit(1)
                            Text("\(Fmt.ltr(p.number)) · \(p.clientName)").font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Fmt.sar(p.profit)).font(.subheadline.weight(.semibold)).monospacedDigit()
                                .foregroundStyle(p.profit < 0 ? Buad.dangerInk : Buad.ink)
                            Text("هامش \(Self.pct(p.margin)) · من \(Fmt.short(p.gross))").font(.caption2).foregroundStyle(Buad.muted)
                        }
                    }
                    .padding(14)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    // MARK: الالتزامات والمستحقات

    @ViewBuilder private func obligations(_ d: FinanceOverview) -> some View {
        Text("الالتزامات والمستحقات").font(.headline)
        Text("قيود معلّقة لم تُدفع، وبنود في الاتفاقية لم تُسجَّل في مالية مشروعها بعد.").font(.caption).foregroundStyle(Buad.muted)
        if d.pending.isEmpty && d.unregistered.isEmpty {
            EmptyNote(text: "لا التزامات قائمة.", icon: "checkmark.circle")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(d.unregistered.enumerated()), id: \.offset) { i, u in
                    if i > 0 { Divider().padding(.leading, 14) }
                    HStack(alignment: .firstTextBaseline) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Buad.warningInk).font(.caption)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(u.item) غير مسجّل").font(.subheadline.weight(.medium))
                            Text(u.projectName).font(.caption).foregroundStyle(Buad.muted)
                        }
                        Spacer()
                        Text(Fmt.sar(u.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                    }
                    .padding(14)
                }
                ForEach(Array(d.pending.enumerated()), id: \.offset) { i, p in
                    if i > 0 || !d.unregistered.isEmpty { Divider().padding(.leading, 14) }
                    HStack(alignment: .firstTextBaseline) {
                        Pill(text: "معلّق", tone: .warn)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(p.description) · \(p.projectName)").font(.subheadline).lineLimit(2)
                            Text(Fmt.day(p.date)).font(.caption).foregroundStyle(Buad.muted)
                        }
                        Spacer()
                        Text(Fmt.sar(p.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                    }
                    .padding(14)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    // MARK: loading

    private func load() async {
        let current = period
        do {
            async let now = APIClient.shared.financeOverview(current)
            async let before: FinanceOverview? = Self.optional(current.previous)
            let (n, b) = try await (now, before)
            guard current == period else { return }
            data = n
            prev = b
            error = nil
            ScreenMemory.overview = (current, n, b)
        } catch {
            session.handle(error)
            if data == nil { self.error = (error as? APIError)?.message ?? APIError.network.message }
        }
        loaded = true
        reloading = false
    }

    private static func optional(_ p: FinancePeriod?) async -> FinanceOverview? {
        guard let p else { return nil }
        return try? await APIClient.shared.financeOverview(p)
    }

    private static func pct(_ v: Double) -> String {
        let r = (v * 10).rounded() / 10
        return r == r.rounded() ? "\(Int(r))%" : String(format: "%.1f%%", r)
    }

    private static let monthNames = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

    /// "2026-03" → «مارس 2026».
    private static func monthName(_ ym: String) -> String {
        let p = ym.split(separator: "-").compactMap { Int($0) }
        guard p.count == 2, (1...12).contains(p[1]) else { return ym }
        return "\(monthNames[p[1]]) \(p[0])"
    }
}
