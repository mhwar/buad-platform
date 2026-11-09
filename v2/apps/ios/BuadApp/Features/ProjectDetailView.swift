import SwiftUI

/// The project page (features/projects/ProjectPage.tsx) in the website's phone order:
///   header → notices → main action → «نبض المشروع» → finance strip → ① «العقد والتحصيل»
///   → ② work area («المعاملات» · «المستندات» · «التنفيذ») → ③ «بيانات المشروع».
/// Each part loads from its own route only when the role allows it; the server already hides what
/// the role may not see. The one write here is «تسجيل مقبوض» (finance.edit, Face ID).
struct ProjectDetailView: View {
    @EnvironmentObject private var session: Session
    let project: ProjectItem

    enum ContractPart: Hashable { case summary, receipts, schedule }
    enum WorkPart: Hashable { case entries, documents, execution }
    enum EntryKind: Hashable { case all, income, expense }

    @State private var detail: ProjectDetail?
    @State private var finance: ProjectFinance?
    @State private var schedule: [ScheduleItem] = []
    @State private var execution: Execution?
    @State private var documents: [DocumentItem]?
    @State private var failed = false
    @State private var loaded = false
    @State private var contractPart: ContractPart?
    @State private var workPart: WorkPart?
    @State private var entryKind: EntryKind = .all
    @State private var receiving: ReceiveSheet.LineInfo?
    @State private var toast: String?

    private var me: Me? { session.me }
    private var canFinance: Bool { (me?.can("finance.view") ?? false) && !project.external }
    private var canReceive: Bool { (me?.can("finance.edit") ?? false) && canFinance && !project.closed && project.status != "draft" && project.status != "cancelled" }
    private var canTasks: Bool { me?.can("tasks.view") ?? false }
    private var canDocs: Bool { me?.can("documents.view") ?? false }

    private var pending: [ScheduleItem] { schedule.filter { $0.status == "pending" }.sorted { $0.dueDate < $1.dueDate } }
    private var webURL: URL? { APIClient.shared.webURL("/projects/\(project.id)") }

    private var workParts: [WorkPart] {
        (canFinance ? [WorkPart.entries] : []) + (canDocs ? [.documents] : []) + (canTasks ? [.execution] : [])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                notices
                if let toast { banner(toast) }
                if failed { EmptyNote(text: "تعذّر تحميل بعض أقسام المشروع. اسحب للتحديث.", icon: "exclamationmark.triangle") }
                if canReceive, let next = pending.first { receiveButton(next) }
                pulse
                if canFinance, let f = finance { financeStrip(f) }
                if canFinance { contractCard }
                if project.external { externalCard }
                if !workParts.isEmpty { workArea }
                detailsCard
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    if let webURL {
                        Link(destination: webURL) { Label("فتح المشروع في الموقع للتعديل", systemImage: "safari") }
                        ShareLink(item: webURL) { Label("مشاركة رابط المشروع", systemImage: "square.and.arrow.up") }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle").accessibilityLabel("إجراءات المشروع")
                }
            }
        }
        .refreshable { await load() }
        .task { if !loaded { await load() } }
        .sheet(item: $receiving) { line in
            ReceiveSheet(line: line) { message in
                toast = message
                Task { await load() }
            }
        }
    }

    // MARK: header & notices

    private var header: some View {
        let status = Vocabulary.status(project.status)
        let service = detail?.serviceName.isEmpty == false ? detail!.serviceName : project.productName
        let pkg = detail?.packageName ?? project.packageName
        let start = Fmt.day(detail?.startDate ?? project.startDate)
        let end = Fmt.day(detail?.endDate ?? project.endDate)
        return VStack(alignment: .leading, spacing: 8) {
            Text(project.name).font(.title2.bold()).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Pill(text: project.late ? "متأخر" : status.label, tone: project.late ? .bad : status.tone)
                if project.fullyDistributed { Pill(text: "موزّع بالكامل", tone: .ok) } else if project.closed { Pill(text: "مغلق") }
                if project.external { Pill(text: "خارجي") }
                if project.visibility == "private" { Pill(text: "🔒 خاص") }
            }
            VStack(alignment: .leading, spacing: 3) {
                Label(project.clientName, systemImage: "building.2").font(.subheadline.weight(.medium)).foregroundStyle(Buad.ink)
                Text([project.number, Vocabulary.type(project.type), service.isEmpty ? "" : (pkg.isEmpty ? service : "\(service) · \(pkg)")]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(Buad.muted)
                if !start.isEmpty || !end.isEmpty {
                    Label("\(start.isEmpty ? "—" : start) ← \(end.isEmpty ? "مفتوح" : end)", systemImage: "calendar")
                        .font(.footnote).foregroundStyle(Buad.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var notices: some View {
        if project.status == "draft" && !project.external {
            notice("مسودة: أرقام هذا المشروع لا تُحسب في المالية (الأرباح والضريبة والتحصيل) حتى تتغير حالته إلى «جاري التنفيذ».")
        }
        if project.closed {
            notice("المشروع مغلق مالياً. قيوده ومقبوضاته وفواتيره للاطلاع فقط.")
        }
    }

    private func notice(_ text: String) -> some View {
        Label(text, systemImage: "info.circle")
            .font(.footnote).foregroundStyle(Buad.warningInk)
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Buad.warningSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
    }

    private func banner(_ text: String) -> some View {
        Label(text, systemImage: "checkmark.circle.fill")
            .font(.subheadline.weight(.medium)).foregroundStyle(Buad.successInk)
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Buad.successSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
    }

    private func receiveButton(_ line: ScheduleItem) -> some View {
        Button { startReceive(line) } label: {
            Label("تسجيل مقبوض", systemImage: "banknote")
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                .foregroundStyle(Buad.onInk)
        }
        .buttonStyle(.plain)
    }

    private func startReceive(_ line: ScheduleItem) {
        toast = nil
        receiving = .init(id: line.id, label: line.label.isEmpty ? "دفعة" : line.label, amount: line.amount,
                          project: project.name, contractDate: finance?.contractDate ?? "")
    }

    // MARK: نبض المشروع (2×2)

    private var pulse: some View {
        let exec = execution.map { x -> (Int, Int, String) in
            x.stages.isEmpty
                ? (x.tasks.filter { $0.status == "done" }.count, x.tasks.count, "مهمة")
                : (x.stages.filter { $0.status == "done" }.count, x.stages.count, "مرحلة")
        } ?? (project.execution.done, project.execution.total, project.stagesTotal > 0 ? "مرحلة" : "مهمة")
        let nextTask = execution?.tasks.filter { $0.status != "done" && !$0.dueDate.isEmpty }.min { $0.dueDate < $1.dueDate }
        let endISO = detail?.endDate ?? project.endDate
        let days = Fmt.daysUntil(endISO)
        let due = pending.first
        return VStack(alignment: .leading, spacing: 8) {
            Text("نبض المشروع").font(.headline)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 1), GridItem(.flexible(), spacing: 1)], spacing: 1) {
                cell("التنفيذ", exec.1 > 0 ? "\(exec.0)/\(exec.1) \(exec.2)" : "لم تُضف مراحل أو مهام",
                     progress: exec.1 > 0 ? Double(exec.0) / Double(exec.1) : nil)
                if let d = days, project.status == "active" {
                    cell("الموعد", d < 0 ? "متأخر \(-d) يوم" : "متبقٍ \(d) يوم",
                         sub: "الانتهاء \(Fmt.day(endISO))", tone: d < 0 ? .bad : d <= 7 ? .warn : nil)
                } else {
                    cell("الموعد", endISO.isEmpty ? "بلا تاريخ انتهاء" : Fmt.day(endISO))
                }
                if let t = nextTask {
                    cell("المهمة التالية", t.title,
                         sub: [t.overdue ? "متأخرة" : "", Fmt.dayMonth(t.dueDate), t.assigneeName].filter { !$0.isEmpty }.joined(separator: " · "),
                         tone: t.overdue ? .bad : nil)
                } else {
                    cell("المهمة التالية", canTasks ? "لا مهام بموعد" : "—")
                }
                if canFinance, let d = due {
                    let late = d.dueDate < Fmt.todayISO
                    cell("الدفعة القادمة", Fmt.sar(d.amount),
                         sub: [late ? "متأخرة" : "", d.label, Fmt.dayMonth(d.dueDate)].filter { !$0.isEmpty }.joined(separator: " · "),
                         tone: late ? .bad : nil)
                } else {
                    cell("الدفعة القادمة", canFinance ? "لا دفعات منتظرة" : "—")
                }
            }
            .background(Buad.line)
            .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func cell(_ title: String, _ value: String, sub: String? = nil, tone: Tone? = nil, progress: Double? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit().lineLimit(2)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub, !sub.isEmpty { Text(sub).font(.caption2).foregroundStyle(tone == .bad ? Buad.dangerInk : Buad.muted).lineLimit(2) }
            if let progress { ProgressBar(value: progress) }
        }
        .frame(maxWidth: .infinity, minHeight: 82, alignment: .topLeading)
        .padding(12)
        .background(Buad.surface)
    }

    // MARK: finance strip

    private func financeStrip(_ f: ProjectFinance) -> some View {
        let s = f.summary
        let spent = s.grossTotal > 0 ? Double(s.totalDeductions) / Double(s.grossTotal) : 0
        let margin = s.grossTotal > 0 ? Double(s.profit) / Double(s.grossTotal) * 100 : 0
        return VStack(spacing: 0) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 1), GridItem(.flexible(), spacing: 1)], spacing: 1) {
                tile("المصروف من العقد", Fmt.sar(s.totalDeductions),
                     sub: s.pendingExpenses > 0 ? "منه معلّق \(Fmt.sar(s.pendingExpenses))" : "\(Int((spent * 100).rounded()))% من العقد",
                     tone: s.pendingExpenses > 0 ? .warn : nil)
                tile("صافي الربح", f.profitHidden ? "مخفي" : Fmt.sar(s.profit), tone: f.profitHidden ? nil : .ok)
                tile("غير المصنّف من العقد", Fmt.sar(s.remaining), sub: s.remaining < 0 ? "▲ تجاوز قيمة العقد" : nil, tone: s.remaining < 0 ? .bad : nil)
                tile("هامش الربح", f.profitHidden ? "مخفي" : "\(Int(margin.rounded()))%",
                     tone: f.profitHidden ? nil : margin >= 20 ? .ok : margin >= 0 ? .warn : .bad)
            }
            .background(Buad.line)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("نسبة الصرف من العقد")
                    Spacer()
                    Text("\(Int((spent * 100).rounded()))%").monospacedDigit()
                }
                .font(.caption).foregroundStyle(Buad.muted)
                ProgressBar(value: spent, color: spent > 0.9 ? Buad.dangerInk : spent > 0.7 ? Buad.warningInk : Buad.accent)
            }
            .padding(12)
            .background(Buad.surface)
            if f.notSetUp {
                Text("هذه الأرقام من القيم الافتراضية (ضريبة 15٪، أتعاب تنفيذ 10٪). اضبطوا شروط العقد من الموقع لتكون دقيقة.")
                    .font(.caption).foregroundStyle(Buad.warningInk)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Buad.warningSoft)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
    }

    private func tile(_ title: String, _ value: String, sub: String? = nil, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.body.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub { Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .padding(12)
        .background(Buad.surface)
    }

    // MARK: ① العقد والتحصيل

    @ViewBuilder private var contractCard: some View {
        if let f = finance {
            let gross = f.summary.grossTotal
            let share = gross > 0 ? min(1, max(0, Double(f.received) / Double(gross))) : 0
            let lateDue = pending.first.map { $0.dueDate < Fmt.todayISO } ?? false
            let part = contractPart ?? (lateDue ? .schedule : .summary)
            Card {
                Label("العقد والتحصيل", systemImage: "signature").font(.headline)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Fmt.sar(gross)).font(.title2.bold()).monospacedDigit()
                    Text([f.vatIncluded ? "شاملة الضريبة" : "+ ضريبة \(Self.num(f.vatPct))%", f.contractNo, Fmt.day(f.contractDate)]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Buad.muted)
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("حُصّل \(Fmt.sar(f.received)) من \(Fmt.sar(gross))")
                        Spacer()
                        Text("\(Int((share * 100).rounded()))%").monospacedDigit()
                    }
                    .font(.caption).foregroundStyle(Buad.muted)
                    ProgressBar(value: share, color: Buad.success)
                }
                HStack {
                    Text("المتبقي على العميل: ").foregroundStyle(Buad.muted) + Text(Fmt.sar(max(0, gross - f.received))).bold()
                    Spacer()
                    if let next = pending.first {
                        Pill(text: "\(lateDue ? "دفعة متأخرة" : "الدفعة القادمة") · \(Fmt.dayMonth(next.dueDate))", tone: lateDue ? .bad : .info)
                    }
                }
                .font(.subheadline)

                Picker("أقسام العقد", selection: Binding(get: { part }, set: { contractPart = $0 })) {
                    Text("الملخص").tag(ContractPart.summary)
                    Text("الاستلامات (\(f.receipts.count))").tag(ContractPart.receipts)
                    Text("الدفعات (\(pending.count))").tag(ContractPart.schedule)
                }
                .pickerStyle(.segmented)

                switch part {
                case .summary: contractTrail(f)
                case .receipts: receiptsList(f)
                case .schedule: scheduleList
                }
            }
        } else if !loaded {
            Card { ProgressView().frame(maxWidth: .infinity) }
        }
    }

    @ViewBuilder private func contractTrail(_ f: ProjectFinance) -> some View {
        let s = f.summary
        money("قيمة العقد", s.grossTotal, strong: true)
        if s.execAmt > 0 { money("أتعاب التنفيذ", s.execAmt, sign: "−") }
        if s.mkt > 0 { money(f.mktInternal ? "التسويق (داخلي)" : "التسويق", s.mkt, sign: "−") }
        if s.cb > 0 { money("كاش باك", s.cb, sign: "−") }
        if s.cfAmt > 0 { money("رسوم إضافية", s.cfAmt, sign: "−") }
        Divider()
        money("المتاح للتنفيذ", s.available, sign: "=", strong: true)
        money("المصاريف التشغيلية", s.opExpenses, sign: "−")
        Divider()
        money("المتبقي للتنفيذ", s.remainingExec, sign: "=", strong: true)
    }

    @ViewBuilder private func receiptsList(_ f: ProjectFinance) -> some View {
        if f.receipts.isEmpty {
            Text("لم يُسجَّل استلام بعد. الربح يُعدّ متحققاً (وقابلاً للتوزيع) بقدر ما يُستلم من قيمة العقد.")
                .font(.footnote).foregroundStyle(Buad.muted)
        } else {
            ForEach(Array(f.receipts.reversed().enumerated()), id: \.element.id) { i, r in
                if i > 0 { Divider() }
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Fmt.day(r.date)).font(.subheadline.weight(.medium))
                        if !r.note.isEmpty { Text(r.note).font(.caption).foregroundStyle(Buad.muted).lineLimit(2) }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text((r.amount < 0 ? "استرجاع " : "") + Fmt.sar(abs(r.amount))).font(.subheadline.weight(.semibold)).monospacedDigit()
                        if !r.approved { Pill(text: "غير معتمد", tone: .warn) }
                    }
                }
            }
        }
    }

    @ViewBuilder private var scheduleList: some View {
        if schedule.isEmpty {
            Text("لا دفعات مجدولة. تُضاف من الموقع.").font(.footnote).foregroundStyle(Buad.muted)
        } else {
            ForEach(Array(schedule.enumerated()), id: \.element.id) { i, item in
                if i > 0 { Divider() }
                let st = Vocabulary.scheduleStatus(item.status, dueDate: item.dueDate)
                let late = item.status == "pending" && item.dueDate < Fmt.todayISO
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label.isEmpty ? "دفعة" : item.label).font(.subheadline.weight(.medium))
                        Text(item.status == "received" ? "استُلمت \(Fmt.day(item.receivedAt))" : late ? "متأخرة · \(Fmt.day(item.dueDate))" : "تستحق \(Fmt.day(item.dueDate))")
                            .font(.caption).foregroundStyle(late ? Buad.dangerInk : Buad.muted)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(Fmt.sar(item.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        Pill(text: st.label, tone: st.tone)
                    }
                    if canReceive && item.status == "pending" {
                        Button { startReceive(item) } label: {
                            Image(systemName: "banknote").frame(width: 36, height: 36)
                                .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("تسجيل مقبوض \(item.label)")
                    }
                }
            }
        }
    }

    private var externalCard: some View {
        Card {
            Label("مشروع خارجي", systemImage: "arrow.up.forward.square").font(.headline)
            Text("لا يدخل في أي رقم مالي: لا قيود ولا استلامات ولا فواتير، ولا يُحسب في الإيرادات أو الضريبة أو الأرباح أو المستهدف.")
                .font(.footnote).foregroundStyle(Buad.muted)
            if project.contractTotal > 0 { row("القيمة التقديرية (للاطلاع)", Fmt.sar(project.contractTotal)) }
        }
    }

    // MARK: ② منطقة العمل

    private var workArea: some View {
        let part = workPart.flatMap { workParts.contains($0) ? $0 : nil } ?? workParts.first ?? .execution
        let exec = execution.map { x -> String in
            let total = x.stages.isEmpty ? x.tasks.count : x.stages.count
            let done = x.stages.isEmpty ? x.tasks.filter { $0.status == "done" }.count : x.stages.filter { $0.status == "done" }.count
            return total > 0 ? " (\(done)/\(total))" : ""
        } ?? ""
        let docCount = documents.map { $0.isEmpty ? "" : " (\($0.count))" } ?? ""
        return VStack(alignment: .leading, spacing: 12) {
            if workParts.count > 1 {
                Picker("أقسام المشروع", selection: Binding(get: { part }, set: { workPart = $0 })) {
                    ForEach(workParts, id: \.self) { p in
                        Text(p == .entries ? "المعاملات" : p == .documents ? "المستندات\(docCount)" : "التنفيذ\(exec)").tag(p)
                    }
                }
                .pickerStyle(.segmented)
            }
            switch part {
            case .entries: entriesView
            case .documents: documentsView
            case .execution: executionView
            }
        }
    }

    // المعاملات: pills الكل/دخل/مصروف, grouped by month with the month's net.
    @ViewBuilder private var entriesView: some View {
        if let f = finance {
            let all = f.entries
            let incomeN = all.filter { $0.type == "income" }.count
            let list = all.filter { entryKind == .all || (entryKind == .income) == ($0.type == "income") }
            HStack(spacing: 8) {
                FilterChip(title: "الكل", count: all.count, on: entryKind == .all) { entryKind = .all }
                FilterChip(title: "دخل", count: incomeN, on: entryKind == .income) { entryKind = .income }
                FilterChip(title: "مصروف", count: all.count - incomeN, on: entryKind == .expense) { entryKind = .expense }
            }
            HStack(spacing: 1) {
                tile("الدخل المسجّل", Fmt.sar(f.summary.totalIncome), tone: .ok)
                tile("المصاريف", Fmt.sar(f.summary.totalExpenses), tone: .bad)
            }
            .background(Buad.line)
            .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            if list.isEmpty {
                EmptyNote(text: "لا معاملات مسجّلة بعد.", icon: "list.bullet.rectangle")
            } else {
                let groups = Dictionary(grouping: list) { $0.date.isEmpty ? "" : String($0.date.prefix(7)) }
                ForEach(groups.keys.sorted(by: >), id: \.self) { month in
                    let rows = groups[month] ?? []
                    let net = rows.filter { $0.status != "cancelled" }.reduce(0) { $0 + ($1.type == "income" ? $1.amount : -$1.amount) }
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(month.isEmpty ? "بلا تاريخ" : Self.monthName(month)).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(rows.count) · \(net >= 0 ? "+" : "−")\(Fmt.short(abs(net)))").font(.caption).foregroundStyle(Buad.muted).monospacedDigit()
                        }
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                                if i > 0 { Divider().padding(.leading, 14) }
                                entryRow(e, f)
                            }
                        }
                        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    }
                }
            }
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل المعاملات." : "جارٍ التحميل…", icon: "list.bullet.rectangle")
        }
    }

    private func entryRow(_ e: FinanceEntry, _ f: ProjectFinance) -> some View {
        let income = e.type == "income"
        let flags = [Fmt.day(e.date), f.categoryName(e.cat), e.supplierName,
                     e.status == "pending" ? "معلّق" : "", e.status == "cancelled" ? "ملغى، لا يُحتسب" : ""]
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(e.description).font(.subheadline.weight(.medium)).lineLimit(2)
                Text(flags.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(e.status == "pending" ? Buad.warningInk : Buad.muted).lineLimit(2)
            }
            Spacer(minLength: 8)
            Text((income ? "+ " : "− ") + Fmt.sar(e.amount))
                .font(.subheadline.weight(.semibold)).monospacedDigit()
                .foregroundStyle(e.status == "cancelled" ? Buad.faint : income ? Buad.successInk : Buad.ink)
                .strikethrough(e.status == "cancelled")
        }
        .padding(14)
    }

    @ViewBuilder private var documentsView: some View {
        if let docs = documents {
            if docs.isEmpty {
                EmptyNote(text: "لا توجد مستندات لهذا المشروع بعد. العقد يُنشأ من الموقع معبأً تلقائياً من بيانات الجهة والعميل والمشروع والمالية.", icon: "doc.text")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(docs.enumerated()), id: \.element.id) { i, d in
                        if i > 0 { Divider().padding(.leading, 62) }
                        documentRow(d)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                Text("يُفتح المستند في الموقع للمعاينة والتصدير PDF والتوقيع.").font(.caption).foregroundStyle(Buad.muted)
            }
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل المستندات." : "جارٍ التحميل…", icon: "doc.text")
        }
    }

    @ViewBuilder private func documentRow(_ d: DocumentItem) -> some View {
        let st = Vocabulary.docStatus(d.status)
        let line = HStack(spacing: 12) {
            Image(systemName: d.kind == "contract" ? "signature" : "envelope")
                .frame(width: 36, height: 36)
                .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(Buad.ink)
            VStack(alignment: .leading, spacing: 2) {
                Text(d.title.isEmpty ? Vocabulary.docKind(d.kind) : d.title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text([Vocabulary.docKind(d.kind), d.number, Fmt.epochDay(d.updatedAt)].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            }
            Spacer()
            Pill(text: st.label, tone: st.tone)
            Image(systemName: "arrow.up.forward").font(.caption).foregroundStyle(Buad.faint)
        }
        .padding(14)
        .contentShape(Rectangle())
        if let url = APIClient.shared.webURL("/projects/\(project.id)/documents/\(d.id)") {
            Link(destination: url) { line }.buttonStyle(.plain)
        } else {
            line
        }
    }

    @ViewBuilder private var executionView: some View {
        if let x = execution {
            if x.stages.isEmpty && x.tasks.isEmpty {
                EmptyNote(text: "لم تُضف مراحل أو مهام لهذا المشروع.", icon: "checklist")
            }
            if !x.stages.isEmpty {
                Text("المراحل (\(x.stages.filter { $0.status == "done" }.count) من \(x.stages.count))").font(.subheadline.weight(.semibold))
                VStack(spacing: 0) {
                    ForEach(Array(x.stages.enumerated()), id: \.element.id) { i, st in
                        if i > 0 { Divider().padding(.leading, 44) }
                        stageRow(st)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
            if !x.tasks.isEmpty {
                HStack {
                    Text("المهام (\(x.tasks.filter { $0.status == "done" }.count) من \(x.tasks.count))").font(.subheadline.weight(.semibold))
                    Spacer()
                    if x.minutes > 0 { Text("الساعات المسجّلة: \(Fmt.hours(x.minutes))").font(.caption).foregroundStyle(Buad.muted) }
                }
                VStack(spacing: 0) {
                    ForEach(Array(x.tasks.enumerated()), id: \.element.id) { i, t in
                        if i > 0 { Divider().padding(.leading, 14) }
                        taskRow(t)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل التنفيذ." : "جارٍ التحميل…", icon: "checklist")
        }
    }

    private func stageRow(_ st: Stage) -> some View {
        let s = Vocabulary.taskStatus(st.status)
        return HStack(spacing: 12) {
            Image(systemName: st.status == "done" ? "checkmark.circle.fill" : st.status == "doing" ? "circle.lefthalf.filled" : "circle")
                .foregroundStyle(st.status == "done" ? Buad.success : Buad.faint)
            VStack(alignment: .leading, spacing: 2) {
                Text(st.title).font(.subheadline.weight(.medium))
                if !st.dueDate.isEmpty { Text(Fmt.day(st.dueDate)).font(.caption).foregroundStyle(Buad.muted) }
            }
            Spacer()
            Pill(text: s.label, tone: s.tone)
        }
        .padding(14)
    }

    private func taskRow(_ t: TaskItem) -> some View {
        let s = Vocabulary.taskStatus(t.status)
        let meta = [t.assigneeName, t.dueDate.isEmpty ? "" : (t.overdue ? "متأخرة · " : "حتى ") + Fmt.dayMonth(t.dueDate),
                    Vocabulary.priority(t.priority).map { "أولوية \($0)" } ?? ""]
            .filter { !$0.isEmpty }.joined(separator: " · ")
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(t.title).font(.subheadline.weight(.medium))
                    .strikethrough(t.status == "done").foregroundStyle(t.status == "done" ? Buad.muted : Buad.ink)
                if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(t.overdue ? Buad.dangerInk : Buad.muted) }
            }
            Spacer()
            Pill(text: t.overdue ? "متأخرة" : s.label, tone: t.overdue ? .bad : s.tone)
        }
        .padding(14)
    }

    // MARK: ③ بيانات المشروع

    private var detailsCard: some View {
        let service = detail?.serviceName.isEmpty == false ? detail!.serviceName : project.productName
        let pkg = detail?.packageName ?? project.packageName
        let loc = detail?.location ?? project.location
        return Card {
            HStack {
                Text("بيانات المشروع").font(.headline)
                Spacer()
                if let webURL { Link("تعديل", destination: webURL).font(.subheadline.weight(.medium)) }
            }
            row("النوع", Vocabulary.type(project.type))
            if !service.isEmpty { row("الخدمة", pkg.isEmpty ? service : "\(service) · \(pkg)") }
            if !loc.isEmpty { row("الموقع", loc) }
            if let d = detail {
                if !d.startDate.isEmpty { row("البداية", Fmt.day(d.startDate)) }
                if !d.endDate.isEmpty { row("الانتهاء المتوقع", Fmt.day(d.endDate)) }
                if !d.payDate.isEmpty { row("استلام الدفعة", Fmt.day(d.payDate)) }
                row("الظهور", d.visibility == "private" ? "خاص" : "الفريق")
                if !d.notes.isEmpty {
                    Text(d.notes).font(.subheadline).foregroundStyle(Buad.muted)
                        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Buad.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }
    }

    // MARK: loading

    private func load() async {
        let id = project.id
        let (fin, tasks, docsAllowed) = (canFinance, canTasks, canDocs)
        async let d = Self.attempt(true) { try await APIClient.shared.project(id) }
        async let f = Self.attempt(fin) { try await APIClient.shared.finance(id) }
        async let s = Self.attempt(fin) { try await APIClient.shared.schedule(id) }
        async let e = Self.attempt(tasks) { try await APIClient.shared.execution(id) }
        async let docs = Self.attempt(docsAllowed) { try await APIClient.shared.documents(id) }
        let (dr, fr, sr, er, docr) = await (d, f, s, e, docs)
        var anyFailed = false
        func take<T>(_ r: Loaded<T>) -> T? {
            switch r {
            case .value(let v): return v
            case .failed(let error):
                if error == .unauthorized { session.handle(error) } else if error != .forbidden { anyFailed = true }
                return nil
            case .skipped: return nil
            }
        }
        detail = take(dr) ?? detail
        finance = take(fr) ?? finance
        schedule = take(sr) ?? schedule
        execution = take(er) ?? execution
        documents = take(docr) ?? documents
        failed = anyFailed
        loaded = true
    }

    private enum Loaded<T> { case value(T), failed(APIError), skipped }

    private static func attempt<T>(_ allowed: Bool, _ work: @Sendable () async throws -> T) async -> Loaded<T> {
        guard allowed else { return .skipped }
        do { return .value(try await work()) } catch { return .failed((error as? APIError) ?? .network) }
    }

    // MARK: pieces

    private func row(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Buad.muted)
            Spacer()
            Text(value).multilineTextAlignment(.trailing).foregroundStyle(Buad.ink)
        }
        .font(.subheadline)
    }

    private func money(_ title: String, _ halalas: Int, sign: String? = nil, strong: Bool = false) -> some View {
        HStack {
            if let sign { Text(sign).foregroundStyle(Buad.faint).frame(width: 12) }
            Text(title).foregroundStyle(strong ? Buad.ink : Buad.muted)
            Spacer()
            Text(Fmt.sar(halalas)).monospacedDigit().foregroundStyle(sign == "−" ? Buad.dangerInk : Buad.ink)
        }
        .font(strong ? .subheadline.weight(.semibold) : .subheadline)
    }

    private static func num(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v) }

    private static let months = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

    private static func monthName(_ ym: String) -> String {
        let p = ym.split(separator: "-").compactMap { Int($0) }
        guard p.count == 2, (1...12).contains(p[1]) else { return ym }
        return "\(months[p[1]]) \(p[0])"
    }
}
