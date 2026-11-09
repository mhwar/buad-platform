import SwiftUI

/// The project page, read-only (0.1.1). Same sections and wording as the website's ProjectPage:
/// summary, contract and collection, entries, execution, documents. Each part loads from its own
/// route and only when the role allows it; the server already hides what the role may not see.
struct ProjectDetailView: View {
    @EnvironmentObject private var session: Session
    let project: ProjectItem

    enum Section: String, CaseIterable, Identifiable {
        case summary, collection, entries, execution, documents
        var id: String { rawValue }
        var title: String {
            switch self {
            case .summary: return "الملخص"
            case .collection: return "العقد والتحصيل"
            case .entries: return "المعاملات"
            case .execution: return "التنفيذ"
            case .documents: return "المستندات"
            }
        }
    }

    @State private var section: Section = .summary
    @State private var detail: ProjectDetail?
    @State private var finance: ProjectFinance?
    @State private var schedule: [ScheduleItem] = []
    @State private var execution: Execution?
    @State private var documents: [DocumentItem]?
    @State private var failed = false
    @State private var loaded = false

    private var canFinance: Bool { (session.me?.can("finance.view") ?? false) && !project.external }
    private var canTasks: Bool { session.me?.can("tasks.view") ?? false }
    private var canDocs: Bool { session.me?.can("documents.view") ?? false }

    private var sections: [Section] {
        Section.allCases.filter {
            switch $0 {
            case .summary: return true
            case .collection, .entries: return canFinance
            case .execution: return canTasks
            case .documents: return canDocs
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if sections.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(sections) { s in
                                FilterChip(title: s.title, count: count(s), on: section == s) { section = s }
                            }
                        }
                        .padding(.horizontal, Buad.gutter)
                    }
                    .padding(.horizontal, -Buad.gutter)
                }
                if failed {
                    EmptyNote(text: "تعذّر تحميل بعض أقسام المشروع. اسحب للتحديث.", icon: "exclamationmark.triangle")
                }
                switch section {
                case .summary: summary
                case .collection: collection
                case .entries: entries
                case .execution: executionView
                case .documents: documentsView
                }
                webLink
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { if !loaded { await load() } }
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

    private func count(_ s: Section) -> Int? {
        switch s {
        case .summary: return nil
        case .collection: return schedule.count
        case .entries: return finance?.entries.count ?? 0
        case .execution: return (execution?.stages.count ?? 0) + (execution?.tasks.count ?? 0)
        case .documents: return documents?.count ?? 0
        }
    }

    // MARK: header

    private var header: some View {
        let status = Vocabulary.status(project.status)
        return VStack(alignment: .leading, spacing: 6) {
            Text(project.number).font(.caption.weight(.medium)).foregroundStyle(Buad.faint).environment(\.layoutDirection, .leftToRight)
            Text(project.name).font(.title2.bold())
            HStack(spacing: 8) {
                Pill(text: project.late ? "متأخر" : status.label, tone: project.late ? .bad : status.tone)
                if project.external { Pill(text: "خارجي") }
                if project.closed { Pill(text: "مغلق مالياً") }
                Text(project.clientName).font(.subheadline).foregroundStyle(Buad.muted).lineLimit(1)
            }
        }
    }

    // MARK: الملخص

    @ViewBuilder private var summary: some View {
        if let f = finance {
            let s = f.summary
            let spent = s.grossTotal > 0 ? Double(s.totalDeductions) / Double(s.grossTotal) : 0
            let margin = s.grossTotal > 0 ? Double(s.profit) / Double(s.grossTotal) * 100 : 0
            VStack(spacing: 0) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 1), GridItem(.flexible(), spacing: 1)], spacing: 1) {
                    tile("المصروف من العقد", Fmt.sar(s.totalDeductions),
                         sub: s.pendingExpenses > 0 ? "منه معلّق \(Fmt.sar(s.pendingExpenses))" : "\(Int((spent * 100).rounded()))% من العقد",
                         tone: s.pendingExpenses > 0 ? .warn : nil)
                    tile("صافي الربح", f.profitHidden ? "مخفي" : Fmt.sar(s.profit), tone: f.profitHidden ? nil : .ok)
                    tile("غير المصنّف من العقد", Fmt.sar(s.remaining),
                         sub: s.remaining < 0 ? "▲ تجاوز قيمة العقد" : nil, tone: s.remaining < 0 ? .bad : nil)
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
                    .font(.caption)
                    .foregroundStyle(Buad.muted)
                    ProgressBar(value: spent, color: spent > 0.9 ? Buad.dangerInk : spent > 0.7 ? Buad.warningInk : Buad.accent)
                }
                .padding(14)
                .background(Buad.surface)
            }
            .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }

        let exec = project.execution
        Card {
            Text("نبض المشروع").font(.headline)
            HStack {
                Text("التنفيذ").foregroundStyle(Buad.muted)
                Spacer()
                Text(exec.total > 0 ? "\(exec.done) من \(exec.total) \(project.stagesTotal > 0 ? "مرحلة" : "مهمة")" : "لم تُضف مراحل أو مهام").monospacedDigit()
            }
            .font(.subheadline)
            ProgressBar(value: exec.total > 0 ? Double(exec.done) / Double(exec.total) : 0)
            if project.tasksOverdue > 0 { row("مهام متأخرة", "\(project.tasksOverdue)", tone: .bad) }
        }

        Card {
            Text("تفاصيل المشروع").font(.headline)
            row("النوع", Vocabulary.type(project.type))
            let service = detail?.serviceName.isEmpty == false ? detail!.serviceName : project.productName
            if !service.isEmpty {
                let pkg = detail?.packageName ?? ""
                row("الخدمة", pkg.isEmpty ? service : "\(service) · \(pkg)")
            }
            if let loc = detail?.location, !loc.isEmpty { row("الموقع", loc) }
            row("البداية", dayOr(detail?.startDate ?? project.startDate, "—"))
            row("الانتهاء المتوقع", dayOr(detail?.endDate ?? project.endDate, "مفتوح"))
            if let pay = detail?.payDate, !pay.isEmpty { row("استلام الدفعة", Fmt.day(pay)) }
            if let v = detail?.visibility, !v.isEmpty { row("الظهور", v == "private" ? "خاص" : "الفريق") }
            if let notes = detail?.notes, !notes.isEmpty {
                Text(notes).font(.subheadline).foregroundStyle(Buad.muted)
            }
        }
    }

    // MARK: العقد والتحصيل

    @ViewBuilder private var collection: some View {
        if let f = finance {
            let gross = f.summary.grossTotal
            let share = gross > 0 ? min(1, max(0, Double(f.received) / Double(gross))) : 0
            Card {
                Label("العقد والتحصيل", systemImage: "signature").font(.headline)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Fmt.sar(gross)).font(.title2.bold()).monospacedDigit()
                    Text(f.vatIncluded ? "شاملة الضريبة" : "+ ضريبة \(Self.pct(f.vatPct))%").font(.caption).foregroundStyle(Buad.muted)
                    if !f.contractNo.isEmpty || !f.contractDate.isEmpty {
                        Text([f.contractNo, Fmt.day(f.contractDate)].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(Buad.muted)
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("حُصّل \(Fmt.sar(f.received)) من \(Fmt.sar(gross))")
                        Spacer()
                        Text("\(Int((share * 100).rounded()))%").monospacedDigit()
                    }
                    .font(.caption)
                    .foregroundStyle(Buad.muted)
                    ProgressBar(value: share, color: Buad.success)
                }
                row("المتبقي على العميل", Fmt.sar(max(0, gross - f.received)))
            }

            if f.summary.grossTotal > 0 {
                Card {
                    Text(session.me?.can("finance.edit") == true ? "إعدادات العقد والميزانية" : "شروط العقد والميزانية").font(.headline)
                    money("قيمة العقد", f.summary.grossTotal, strong: true)
                    if f.summary.execAmt > 0 { money("أتعاب التنفيذ", f.summary.execAmt, sign: "−") }
                    if f.summary.mkt > 0 { money(f.mktInternal ? "التسويق (داخلي)" : "التسويق", f.summary.mkt, sign: "−") }
                    if f.summary.cb > 0 { money("كاش باك", f.summary.cb, sign: "−") }
                    if f.summary.cfAmt > 0 { money("رسوم إضافية", f.summary.cfAmt, sign: "−") }
                    Divider()
                    money("المتاح للتنفيذ", f.summary.available, sign: "=", strong: true)
                    money("المصاريف التشغيلية", f.summary.opExpenses, sign: "−")
                    Divider()
                    money("المتبقي للتنفيذ", f.summary.remainingExec, sign: "=", strong: true)
                }
            }
        }

        Text("جدول الدفعات").font(.headline).padding(.top, 4)
        if schedule.isEmpty {
            EmptyNote(text: loaded ? "لا دفعات مجدولة لهذا المشروع." : "جارٍ التحميل…", icon: "calendar")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(schedule.enumerated()), id: \.element.id) { i, item in
                    let st = Vocabulary.scheduleStatus(item.status, dueDate: item.dueDate)
                    if i > 0 { Divider().padding(.leading, 14) }
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.label.isEmpty ? "دفعة" : item.label).font(.subheadline.weight(.medium))
                            Text(item.status == "received" && !item.receivedAt.isEmpty ? "استُلمت \(Fmt.day(item.receivedAt))" : Fmt.day(item.dueDate))
                                .font(.caption).foregroundStyle(Buad.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(Fmt.sar(item.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                            Pill(text: st.label, tone: st.tone)
                        }
                    }
                    .padding(14)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }

        if let receipts = finance?.receipts, !receipts.isEmpty {
            Text("المقبوضات").font(.headline).padding(.top, 4)
            VStack(spacing: 0) {
                ForEach(Array(receipts.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { Divider().padding(.leading, 14) }
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Fmt.day(r.date)).font(.subheadline.weight(.medium))
                            if !r.note.isEmpty { Text(r.note).font(.caption).foregroundStyle(Buad.muted).lineLimit(2) }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(Fmt.sar(r.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                            if !r.approved { Pill(text: "بانتظار الاعتماد", tone: .warn) }
                        }
                    }
                    .padding(14)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    // MARK: المعاملات

    @ViewBuilder private var entries: some View {
        if let f = finance {
            HStack(spacing: 1) {
                tile("الدخل المسجّل", Fmt.sar(f.summary.totalIncome), tone: .ok)
                tile("المصاريف", Fmt.sar(f.summary.totalExpenses), tone: .bad)
            }
            .background(Buad.line)
            .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))

            if f.entries.isEmpty {
                EmptyNote(text: "لا معاملات مسجّلة بعد.", icon: "list.bullet.rectangle")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(f.entries.enumerated()), id: \.element.id) { i, e in
                        if i > 0 { Divider().padding(.leading, 14) }
                        let income = e.type == "income"
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(e.description).font(.subheadline.weight(.medium)).lineLimit(2)
                                Text([f.categoryName(e.cat), Fmt.day(e.date), e.supplierName].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 4) {
                                Text((income ? "+ " : "− ") + Fmt.sar(e.amount))
                                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                                    .foregroundStyle(income ? Buad.successInk : Buad.ink)
                                    .strikethrough(e.status == "cancelled")
                                if let st = Vocabulary.entryStatus(e.status) { Pill(text: st.label, tone: st.tone) }
                            }
                        }
                        .padding(14)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل المعاملات." : "جارٍ التحميل…", icon: "list.bullet.rectangle")
        }
    }

    // MARK: التنفيذ

    @ViewBuilder private var executionView: some View {
        if let x = execution {
            if x.stages.isEmpty && x.tasks.isEmpty {
                EmptyNote(text: "لم تُضف مراحل أو مهام لهذا المشروع.", icon: "checklist")
            }
            if !x.stages.isEmpty {
                Text("المراحل").font(.headline)
                VStack(spacing: 0) {
                    ForEach(Array(x.stages.enumerated()), id: \.element.id) { i, st in
                        if i > 0 { Divider().padding(.leading, 14) }
                        let s = Vocabulary.taskStatus(st.status)
                        HStack {
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
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
            if !x.tasks.isEmpty {
                HStack {
                    Text("المهام").font(.headline)
                    Spacer()
                    if x.minutes > 0 { Text("الساعات المسجّلة: \(Fmt.hours(x.minutes))").font(.caption).foregroundStyle(Buad.muted) }
                }
                VStack(spacing: 0) {
                    ForEach(Array(x.tasks.enumerated()), id: \.element.id) { i, t in
                        if i > 0 { Divider().padding(.leading, 14) }
                        let s = Vocabulary.taskStatus(t.status)
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(t.title).font(.subheadline.weight(.medium))
                                    .strikethrough(t.status == "done").foregroundStyle(t.status == "done" ? Buad.muted : Buad.ink)
                                let meta = [t.assigneeName, Fmt.dayMonth(t.dueDate), Vocabulary.priority(t.priority).map { "أولوية \($0)" } ?? ""]
                                    .filter { !$0.isEmpty }.joined(separator: " · ")
                                if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(t.overdue ? Buad.dangerInk : Buad.muted) }
                            }
                            Spacer()
                            Pill(text: t.overdue ? "متأخرة" : s.label, tone: t.overdue ? .bad : s.tone)
                        }
                        .padding(14)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            }
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل التنفيذ." : "جارٍ التحميل…", icon: "checklist")
        }
    }

    // MARK: المستندات

    @ViewBuilder private var documentsView: some View {
        if let docs = documents {
            if docs.isEmpty {
                EmptyNote(text: "لا مستندات لهذا المشروع بعد.", icon: "doc.text")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(docs.enumerated()), id: \.element.id) { i, d in
                        if i > 0 { Divider().padding(.leading, 14) }
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
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                        if let url = APIClient.shared.webURL("/projects/\(project.id)/documents/\(d.id)") {
                            Link(destination: url) { line }.buttonStyle(.plain)
                        } else {
                            line
                        }
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                Text("يُفتح المستند في الموقع للمعاينة والتصدير PDF والتوقيع.").font(.footnote).foregroundStyle(Buad.muted)
            }
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل المستندات." : "جارٍ التحميل…", icon: "doc.text")
        }
    }

    // MARK: pieces

    private var webLink: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let url = APIClient.shared.webURL("/projects/\(project.id)") {
                Link(destination: url) {
                    Label("فتح المشروع في الموقع للتعديل", systemImage: "safari")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                        .foregroundStyle(Buad.ink)
                }
            }
            Text("هذه النسخة للعرض فقط. التسجيل والتعديل من الموقع، ويظهر أي تعديل هنا عند السحب للتحديث.")
                .font(.footnote)
                .foregroundStyle(Buad.muted)
        }
        .padding(.top, 4)
    }

    private func tile(_ title: String, _ value: String, sub: String? = nil, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.footnote).foregroundStyle(Buad.muted)
            Text(value).font(.body.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
            if let sub { Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .padding(14)
        .background(Buad.surface)
    }

    private func row(_ title: String, _ value: String, tone: Tone? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Buad.muted)
            Spacer()
            Text(value).multilineTextAlignment(.trailing).foregroundStyle(tone?.foreground ?? Buad.ink)
        }
        .font(.subheadline)
    }

    private func money(_ title: String, _ halalas: Int, sign: String? = nil, strong: Bool = false) -> some View {
        HStack {
            if let sign { Text(sign).foregroundStyle(Buad.faint).frame(width: 12) }
            Text(title).foregroundStyle(strong ? Buad.ink : Buad.muted)
            Spacer()
            Text(Fmt.sar(halalas)).monospacedDigit()
                .foregroundStyle(sign == "−" ? Buad.dangerInk : Buad.ink)
        }
        .font(strong ? .subheadline.weight(.semibold) : .subheadline)
    }

    private func dayOr(_ iso: String, _ fallback: String) -> String {
        let d = Fmt.day(iso)
        return d.isEmpty ? fallback : d
    }

    private static func pct(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }
}
