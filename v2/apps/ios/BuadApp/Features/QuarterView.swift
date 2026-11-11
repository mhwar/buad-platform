import SwiftUI

/// «مركز الربع» (finance-overview/QuarterCentre.tsx), read-only: for a quarter or the whole year, each
/// project's receipts, the profit realised from them, what was already distributed and what remains,
/// with the company's net and whether the quarter was distributed. Distributing a quarter is done on
/// the website, where many projects are ticked at once.
struct QuarterView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @State private var year = Calendar(identifier: .gregorian).component(.year, from: Date())
    @State private var q = (Calendar(identifier: .gregorian).component(.month, from: Date()) - 1) / 3 + 1
    @State private var data: QuarterReport?
    @State private var loaded = false
    @State private var error: String?

    private var years: [Int] { let y = Calendar(identifier: .gregorian).component(.year, from: Date()); return Array((y - 4...y).reversed()) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Menu {
                        Picker("السنة", selection: $year) { ForEach(years, id: \.self) { Text(String($0)).tag($0) } }
                    } label: {
                        HStack(spacing: 4) { Text(String(year)).font(.subheadline.weight(.medium)); Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
                            .padding(.horizontal, 12).frame(height: 34).background(Buad.surface, in: Capsule()).foregroundStyle(Buad.ink)
                    }
                    Picker("الفترة", selection: $q) {
                        Text("السنة").tag(0)
                        ForEach(1...4, id: \.self) { Text("ر\($0)").tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, data == nil {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if let d = data {
                    header(d)
                    if !d.quarters.isEmpty { quarters(d) }
                    projects(d)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("مركز الربع")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: "\(year)|\(q)") { await load() }
    }

    private func header(_ d: QuarterReport) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(d.label).font(.headline)
                if d.stamp != "open" { Pill(text: d.stamp == "distributed" ? "موزّع" : "موزّع جزئياً · بقي \(Fmt.short(d.leftover))", tone: d.stamp == "distributed" ? .ok : .warn) }
            }
            JoinedGrid {
                GridRow {
                    tile("المستلم", Fmt.sar(d.totals.receivedInPeriod), "في \(d.label)")
                    tile("الربح المتحقق", Fmt.sar(d.totals.realizedInPeriod), "في الفترة")
                }
                GridRow {
                    tile("صافي مالية الشركة", Fmt.sar(d.companyIncome - d.companyExpenses), "إيرادات \(Fmt.short(d.companyIncome)) · مصروفات \(Fmt.short(d.companyExpenses))")
                    tile("القابل للتوزيع", Fmt.sar(max(0, d.totals.positive + d.totals.carried + d.companyIncome - d.companyExpenses)),
                         d.totals.carried < 0 ? "منه خصم تجاوزات سابقة \(Fmt.short(-d.totals.carried))" : "مشاريع + الشركة")
                }
            }
            if d.partnersPct <= 0 { Label("أضف الشركاء وحصصهم ليصح التوزيع.", systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(Buad.warningInk) }
            if d.stamp == "partial" {
                Text("بعد توزيعات الفترة بقي \(Fmt.sar(d.leftover)) غير موزّع. لا يُرحَّل تلقائياً: وزّعه من الموقع.").font(.caption).foregroundStyle(Buad.muted)
            }
        }
    }

    private func tile(_ title: String, _ value: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            Text(value).font(.body.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2)
        }
        .joinedCell(minHeight: 62)
    }

    private func quarters(_ d: QuarterReport) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الأرباع").font(.headline)
            VStack(spacing: 0) {
                ForEach(Array(d.quarters.enumerated()), id: \.element.id) { i, x in
                    if i > 0 { Divider().padding(.leading, 14) }
                    Button { q = x.q } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(x.label).font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink)
                                Text("استُلم \(Fmt.short(x.receivedInPeriod)) · متحقق \(Fmt.short(x.realizedInPeriod)) · صافي الشركة \(Fmt.short(x.companyNet))")
                                    .font(.caption).foregroundStyle(Buad.muted)
                            }
                            Spacer()
                            Text(x.stamp == "distributed" ? "موزّع" : x.stamp == "partial" ? "جزئياً" : "لم يُوزَّع").font(.caption.weight(.semibold))
                                .foregroundStyle(x.stamp == "distributed" ? Buad.successInk : x.stamp == "partial" ? Buad.warningInk : Buad.muted)
                            Chevron()
                        }
                        .padding(12).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func projects(_ d: QuarterReport) -> some View {
        let rows = d.rows.filter { $0.realizedToDate != 0 || $0.distributed != 0 || $0.receivedInPeriod != 0 }
        return VStack(alignment: .leading, spacing: 8) {
            Text("المشاريع وأرباحها المتحققة").font(.headline)
            if rows.isEmpty { EmptyNote(text: "لا استلامات في هذه الفترة.", icon: "banknote") }
            ForEach(rows) { r in
                Button { nav.open("/projects/\(r.id)") } label: {
                    Card {
                        HStack {
                            Text(r.name).font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink).multilineTextAlignment(.leading)
                            Spacer()
                            if r.fullyDistributed { Pill(text: "موزّع بالكامل", tone: .ok) }
                        }
                        Text([Fmt.ltr(r.number), r.clientName].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Buad.muted)
                        HStack {
                            stat("المستلم", Fmt.short(r.receivedInPeriod)); stat("متحقق", Fmt.short(r.realizedInPeriod))
                            stat("وُزّع", Fmt.short(r.distributed)); stat("المتبقي", Fmt.short(r.available), bad: r.available < 0)
                        }
                        let flags = r.flags.compactMap(Self.flag)
                        if !flags.isEmpty { Text(flags.joined(separator: " · ")).font(.caption2).foregroundStyle(Buad.warningInk) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func stat(_ t: String, _ v: String, bad: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text(v).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(bad ? Buad.dangerInk : Buad.ink)
            Text(t).font(.caption2).foregroundStyle(Buad.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private static func flag(_ f: String) -> String? {
        switch f {
        case "over_distributed": return "وُزّع أكثر من ربحه الحالي"
        case "estimate": return "ربح تقديري: بنود اتفاقية غير مسجلة"
        case "pending_expenses": return "مصروفات معلّقة"
        case "cancelled": return "مشروع ملغى"
        case "inactive": return "مسودة/متوقف"
        default: return nil
        }
    }

    private func load() async {
        do { data = try await APIClient.shared.quarter(year: year, q: q); error = nil } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}
