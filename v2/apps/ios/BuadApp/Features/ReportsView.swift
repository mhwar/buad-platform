import SwiftUI

/// «التقارير»: execution and productivity, and the projects portfolio — the two the website lists
/// first. Both read-only.
struct ReportsHubView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        List {
            if let me = session.me {
                Section {
                    if me.can("tasks.view") { NavigationLink { ExecutionReportView() } label: { Label("التنفيذ والإنتاجية", systemImage: "checklist.checked") } }
                    if me.can("projects.view") { NavigationLink { PortfolioReportView() } label: { Label("محفظة المشاريع", systemImage: "briefcase") } }
                    if me.can("plans.view") { NavigationLink { PlansView() } label: { Label("الخطط والأهداف", systemImage: "target") } }
                    if me.can("finance.view") || me.can("treasury.view") { NavigationLink { FinanceView(embedded: true) } label: { Label("التقارير المالية", systemImage: "banknote") } }
                } footer: { Text("تقارير الموقع للقراءة. التصدير إلى Excel من الموقع.") }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("التقارير")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ExecutionReportView: View {
    @EnvironmentObject private var session: Session
    @State private var period = FinancePeriod()
    @State private var group = 0
    @State private var report: ExecutionReport?
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                PeriodBar(period: $period)
                Picker("التجميع", selection: $group) {
                    Text("حسب الأشخاص").tag(0)
                    Text("حسب المشاريع").tag(1)
                }
                .pickerStyle(.segmented)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, report == nil {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if let r = report {
                    figures(r.totals)
                    let rows = group == 0 ? r.people : r.projects
                    if rows.isEmpty {
                        EmptyNote(text: "لا مهام بعد.", icon: "checklist")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                                if i > 0 { Divider() }
                                line(row)
                            }
                        }
                        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("التنفيذ والإنتاجية")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: period) { await load() }
    }

    private func figures(_ t: ExecRow) -> some View {
        let onTime = t.done > 0 ? "\(Int((Double(t.onTime) / Double(t.done) * 100).rounded()))%" : "—"
        return Card {
            HStack {
                stat("مفتوحة", "\(t.open)")
                stat("متأخرة", "\(t.late)", bad: t.late > 0)
                stat("أُنجزت", "\(t.done)")
            }
            HStack {
                stat("في موعدها", onTime)
                stat("الساعات", t.minutes > 0 ? Fmt.hours(t.minutes) : "—")
                Spacer(minLength: 0).frame(maxWidth: .infinity)
            }
        }
    }

    private func stat(_ title: String, _ value: String, bad: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.title3.bold()).monospacedDigit().foregroundStyle(bad ? Buad.dangerInk : Buad.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func line(_ r: ExecRow) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(r.name.isEmpty ? (group == 0 ? "بلا مسؤول" : "عمل الشركة") : r.name).font(.subheadline.weight(.semibold))
            HStack(spacing: 12) {
                Text("مفتوحة \(r.open)")
                Text("متأخرة \(r.late)").foregroundStyle(r.late > 0 ? Buad.dangerInk : Buad.muted)
                Text("أُنجزت \(r.done)")
                Text("في موعدها \(r.onTime)")
                if r.minutes > 0 { Text(Fmt.hours(r.minutes)) }
            }
            .font(.caption).foregroundStyle(Buad.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
    }

    private func load() async {
        let b = period.bounds
        do {
            report = try await APIClient.shared.executionReport(from: b?.0 ?? "", to: b?.1 ?? "")
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

/// «محفظة المشاريع»: the running (or all) internal projects with value, received, and what is late.
struct PortfolioReportView: View {
    @EnvironmentObject private var session: Session
    @State private var running = true
    @State private var items: [ProjectItem] = []
    @State private var loaded = false
    @State private var error: String?

    private var shown: [ProjectItem] {
        items.filter { !$0.external && $0.status != "draft" && (!running || $0.status == "active") }
            .sorted { ($0.endDate.isEmpty ? "9999" : $0.endDate) < ($1.endDate.isEmpty ? "9999" : $1.endDate) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Picker("النطاق", selection: $running) {
                    Text("الجارية").tag(true)
                    Text("الكل").tag(false)
                }
                .pickerStyle(.segmented)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else {
                    totals
                    if shown.isEmpty {
                        EmptyNote(text: "لا مشاريع في هذا العرض.", icon: "briefcase")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(shown.enumerated()), id: \.element.id) { i, p in
                                if i > 0 { Divider() }
                                row(p)
                            }
                        }
                        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("محفظة المشاريع")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { if !loaded { await load() } }
    }

    private var totals: some View {
        let value = shown.reduce(0) { $0 + $1.contractTotal }
        let hasReceived = shown.contains { $0.received != nil }
        let received = shown.reduce(0) { $0 + ($1.received ?? 0) }
        return Card {
            HStack {
                stat("المشاريع", "\(shown.count)")
                stat("قيمة العقود", Fmt.short(value))
                if hasReceived { stat("المحصّل", Fmt.short(received)) }
            }
            HStack {
                stat("متأخرة عن الانتهاء", "\(shown.filter(\.late).count)", bad: shown.contains(where: \.late))
                stat("دفعات متأخرة", "\(shown.filter(\.paymentLate).count)", bad: shown.contains(where: \.paymentLate))
                Spacer(minLength: 0).frame(maxWidth: .infinity)
            }
        }
    }

    private func stat(_ title: String, _ value: String, bad: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.headline).monospacedDigit().foregroundStyle(bad ? Buad.dangerInk : Buad.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ p: ProjectItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(p.name).font(.subheadline.weight(.semibold))
                Spacer(minLength: 6)
                if p.late { Pill(text: "متأخر", tone: .bad) }
            }
            Text("\(p.clientName) · \(Fmt.ltr(p.number))").font(.caption).foregroundStyle(Buad.muted)
            HStack(spacing: 12) {
                Text(Fmt.sar(p.contractTotal))
                if let r = p.received { Text("محصّل \(Fmt.sar(r))") }
                if !p.endDate.isEmpty { Text("حتى \(Fmt.day(p.endDate))") }
            }
            .font(.caption).foregroundStyle(Buad.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
    }

    private func load() async {
        do {
            items = try await APIClient.shared.projects().items
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}
