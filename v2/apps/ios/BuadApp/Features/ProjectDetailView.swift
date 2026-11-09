import QuickLook
import SwiftUI

/// The project page (features/projects/ProjectPage.tsx), everything the website does, for the phone:
///   header (status changes from its badge) → notices → the next step → one row of tabs:
///   «نظرة عامة» (pulse, figures, collection, what is next, the project's details)
///   «المالية» (contract and collection: instalments, receipts, invoices, terms; then transactions)
///   «المهام» (stages and tasks) · «المستندات» (contracts and letters).
/// «+» adds what fits the project (receipt, entry, instalment, invoice, task, stage, document);
/// «…» holds the project itself (edit, team, close / cancel / reopen, reports, archive, delete).
/// Each part loads only when the role allows it; money writes are confirmed with Face ID.
struct ProjectDetailView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let project: ProjectItem

    enum Tab: Hashable { case overview, finance, work, documents }
    enum EntryKind: Hashable { case all, income, expense }

    @State private var tab: Tab = .overview
    @State private var detail: ProjectDetail?
    @State private var finance: ProjectFinance?
    @State private var schedule: [ScheduleItem] = []
    @State private var execution: Execution?
    @State private var documents: [DocumentItem]?
    @State private var failed = false
    @State private var loaded = false
    @State private var entryKind: EntryKind = .all
    @State private var receiving: ReceiveSheet.LineInfo?
    @State private var entryTarget: EntryTarget?
    @State private var receiptTarget: ReceiptTarget?
    @State private var invoiceTarget: InvoiceTarget?
    @State private var addingLine = false
    @State private var invoices: [SalesInvoice]?
    @State private var writeError: String?
    @State private var lineActions: ScheduleItem?
    @State private var choosingReceipt = false
    @State private var showTerms = false
    @State private var toast: ToastItem?
    // 0.5.0
    @State private var newTask = false
    @State private var newStage = false
    @State private var newDocument = false
    @State private var openDoc: DocRef?
    @State private var editing = false
    @State private var closing: CloseProjectSheet.Mode?
    @State private var team = false
    @State private var confirm: String?
    @State private var statusBusy = false
    @State private var report: URL?

    struct ReceiptTarget: Identifiable {
        let receipt: Receipt?
        var id: String { receipt?.id ?? "new" }
    }

    struct InvoiceTarget: Identifiable {
        let invoice: SalesInvoice?
        var id: String { invoice?.id ?? "new" }
    }

    struct EntryTarget: Identifiable {
        let entry: FinanceEntry?
        var id: String { entry?.id ?? "new" }
    }

    // MARK: the project as it is now (the list's copy until the page has loaded)

    private var name: String { detail?.name.isEmpty == false ? detail!.name : project.name }
    private var status: String { detail?.status ?? project.status }
    private var closed: Bool { detail?.closed ?? project.closed }
    private var external: Bool { detail?.external ?? project.external }
    private var archived: Bool { detail?.archived ?? false }

    private var me: Me? { session.me }
    private func can(_ p: String) -> Bool { me?.can(p) ?? false }
    private var canFinance: Bool { can("finance.view") && !external }
    private var manager: Bool { can("finance.edit") && canFinance && !archived }
    private var canReceive: Bool { manager && !closed && status != "draft" && status != "cancelled" }
    private var canEditEntries: Bool { manager && !closed }
    private var canInvoices: Bool { can("vat.view") && canFinance }
    private var canEditInvoices: Bool { can("vat.edit") && canInvoices && !closed && !archived }
    private var canTasks: Bool { can("tasks.view") }
    private var canDocs: Bool { can("documents.view") }
    private var canEditProject: Bool { can("projects.edit") && !archived }

    private var pending: [ScheduleItem] { schedule.filter { $0.status == "pending" }.sorted { $0.dueDate < $1.dueDate } }
    private var webURL: URL? { APIClient.shared.webURL("/projects/\(project.id)") }

    private var tabs: [Tab] {
        [.overview] + (canFinance ? [.finance] : []) + (canTasks ? [.work] : []) + (canDocs ? [.documents] : [])
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16, pinnedViews: [.sectionHeaders]) {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    notices
                    if failed { RefreshBanner(text: "تعذّر تحميل بعض أقسام المشروع. اسحب للتحديث.") }
                    nextStep
                }
                Section {
                    switch tab {
                    case .overview: overview
                    case .finance: financeTab
                    case .work:
                        ProjectWorkTab(projectId: project.id, execution: execution, loaded: loaded, newTask: $newTask, newStage: $newStage,
                                       reload: { await reloadWork() }, toast: { toast = ToastItem(text: $0) })
                    case .documents:
                        ProjectDocumentsTab(projectId: project.id, documents: documents, loaded: loaded, newDocument: $newDocument) { id in
                            openDoc = DocRef(id: id)
                            Task { await reloadDocs() }
                        }
                    }
                } header: {
                    if tabs.count > 1 { tabBar }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if !archived && hasAddMenu { addMenu }
                moreMenu
            }
        }
        .refreshable { await load() }
        .task { if !loaded { await load() } }
        .toast($toast)
        .quickLookPreview($report)
        .navigationDestination(for: DocRef.self) { ref in DocumentPage(id: ref.id) { Task { await reloadDocs() } } }
        .navigationDestination(item: $openDoc) { ref in DocumentPage(id: ref.id) { Task { await reloadDocs() } } }
        .alert("تعذّر الحفظ", isPresented: Binding(get: { writeError != nil }, set: { if !$0 { writeError = nil } })) {
            Button("حسناً", role: .cancel) {}
        } message: {
            Text(writeError ?? "")
        }
        .confirmationDialog("أي دفعة استُلمت؟", isPresented: $choosingReceipt, titleVisibility: .visible) {
            ForEach(pending) { line in
                Button("\(line.label.isEmpty ? "دفعة" : line.label) · \(Fmt.sar(line.amount)) · \(Fmt.dayMonth(line.dueDate))") { startReceive(line) }
            }
            Button("مبلغ آخر") { receiptTarget = ReceiptTarget(receipt: nil) }
            Button("إلغاء", role: .cancel) {}
        }
        .confirmationDialog(lineActions.map { "\($0.label.isEmpty ? "دفعة" : $0.label) · \(Fmt.sar($0.amount))" } ?? "",
                            isPresented: Binding(get: { lineActions != nil }, set: { if !$0 { lineActions = nil } }),
                            titleVisibility: .visible, presenting: lineActions) { line in
            if canReceive { Button("تسجيل مقبوض") { startReceive(line) } }
            if canEditEntries { Button("حذف الدفعة", role: .destructive) { Task { await deleteLine(line) } } }
            Button("إلغاء", role: .cancel) {}
        } message: { line in
            Text("تستحق \(Fmt.day(line.dueDate))")
        }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            switch confirm ?? "" {
            case "archive": Button("أرشفة المشروع") { Task { await archive() } }
            case "delete": Button("حذف نهائياً", role: .destructive) { Task { await deleteProject() } }
            case "activate": Button("بدء التنفيذ") { Task { await setStatus("active") } }
            default: EmptyView()
            }
            Button("إلغاء", role: .cancel) {}
        } message: {
            switch confirm ?? "" {
            case "archive": Text("يُخفى من القوائم ويمكن استعادته.")
            case "delete": Text("لا يمكن التراجع. إن كان للمشروع سجلات فأرشفته أفضل.")
            case "activate": Text("تدخل أرقامه في المالية (الأرباح والضريبة والتحصيل) من الآن.")
            default: Text("")
            }
        }
        .sheet(item: $entryTarget) { target in
            if let f = finance {
                EntrySheet(projectId: project.id, projectName: name, finance: f, existing: target.entry) { fin, message in
                    finance = fin
                    toast = ToastItem(text: message)
                }
            }
        }
        .sheet(item: $receiptTarget) { target in
            ReceiptFormSheet(projectId: project.id, receipt: target.receipt,
                             remaining: max(0, (finance?.summary.grossTotal ?? 0) - (finance?.received ?? 0)),
                             contractDate: finance?.contractDate ?? "") { fin, message in
                finance = fin
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
        .sheet(item: $invoiceTarget) { target in
            InvoiceSheet(projectId: project.id, invoice: target.invoice, receipts: finance?.receipts ?? []) { message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
        .sheet(isPresented: $addingLine) {
            ScheduleLineSheet(projectId: project.id) { message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
        .sheet(item: $receiving) { line in
            ReceiveSheet(line: line) { message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
        .sheet(isPresented: $editing) {
            if let d = detail {
                ProjectEditSheet(existing: d) { _ in toast = ToastItem(text: "حُفظت بيانات المشروع"); Task { await load() } }
            }
        }
        .sheet(item: $closing) { mode in
            CloseProjectSheet(projectId: project.id, projectName: name, mode: mode) { message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
        .sheet(isPresented: $team) {
            ProjectTeamSheet(projectId: project.id) { toast = ToastItem(text: $0) }
        }
    }

    private var confirmTitle: String {
        switch confirm ?? "" {
        case "archive": return "أرشفة «\(name)»؟"
        case "delete": return "حذف «\(name)» نهائياً؟"
        case "activate": return "بدء تنفيذ المشروع؟"
        default: return ""
        }
    }

    // MARK: tabs

    private func title(_ t: Tab) -> String {
        switch t {
        case .overview: return "نظرة عامة"
        case .finance: return "المالية"
        case .work: return "المهام"
        case .documents: return "المستندات"
        }
    }

    private var tabBar: some View {
        Picker("أقسام المشروع", selection: $tab.animation(.snappy)) {
            ForEach(tabs, id: \.self) { Text(title($0)).tag($0) }
        }
        .pickerStyle(.segmented)
        .padding(.vertical, 8)
        .background(Buad.canvas)
    }

    // MARK: «+» and «…»

    private var hasAddMenu: Bool {
        canReceive || canEditEntries || canEditInvoices || (can("tasks.edit") && canTasks) || (can("documents.edit") && canDocs)
    }

    private var addMenu: some View {
        Menu {
            if canReceive || canEditEntries || canEditInvoices {
                Section("المالية") {
                    if canReceive { Button { receive() } label: { Label("تسجيل مقبوض", systemImage: "banknote") } }
                    if canEditEntries {
                        Button { entryTarget = EntryTarget(entry: nil) } label: { Label("قيد مالي", systemImage: "plus.forwardslash.minus") }
                        Button { addingLine = true } label: { Label("دفعة منتظرة", systemImage: "calendar.badge.plus") }
                    }
                    if canEditInvoices { Button { invoiceTarget = InvoiceTarget(invoice: nil) } label: { Label("فاتورة ضريبية مرسلة", systemImage: "doc.text") } }
                }
            }
            if can("tasks.edit") && canTasks {
                Section("العمل") {
                    Button { tab = .work; newTask = true } label: { Label("مهمة", systemImage: "checklist") }
                    Button { tab = .work; newStage = true } label: { Label("مرحلة", systemImage: "flag") }
                }
            }
            if can("documents.edit") && canDocs {
                Button { tab = .documents; newDocument = true } label: { Label("مستند (عقد أو خطاب)", systemImage: "signature") }
            }
        } label: {
            Image(systemName: "plus").font(.body.weight(.semibold)).accessibilityLabel("إضافة إلى المشروع")
        }
    }

    private var moreMenu: some View {
        Menu {
            Section("المشروع") {
                if canEditProject && detail != nil { Button { editing = true } label: { Label("تعديل بيانات المشروع", systemImage: "pencil") } }
                if can("team.view") && canEditProject { Button { team = true } label: { Label("فريق المشروع", systemImage: "person.2") } }
                if let webURL { ShareLink(item: webURL) { Label("مشاركة رابط المشروع", systemImage: "square.and.arrow.up") } }
            }
            if manager {
                Section("المالية") {
                    if closed {
                        Button { closing = .reopen } label: { Label("إعادة فتح المشروع", systemImage: "lock.open") }
                    } else {
                        Button { closing = .close } label: { Label("إغلاق المشروع", systemImage: "lock") }
                        if status != "cancelled" { Button(role: .destructive) { closing = .cancel } label: { Label("إلغاء المشروع", systemImage: "xmark.octagon") } }
                    }
                }
            }
            if canFinance {
                Section("التقارير") {
                    Button { Task { await makeReport(detailed: false) } } label: { Label("التقرير المالي للعميل", systemImage: "doc.richtext") }
                    if can("finance.edit") { Button { Task { await makeReport(detailed: true) } } label: { Label("التقرير المالي التفصيلي", systemImage: "doc.text.magnifyingglass") } }
                }
            }
            Section {
                if can("projects.archive") {
                    if archived { Button { Task { await restore() } } label: { Label("استعادة المشروع", systemImage: "arrow.uturn.backward") } }
                    else { Button { confirm = "archive" } label: { Label("أرشفة المشروع", systemImage: "archivebox") } }
                }
                if can("projects.delete") { Button(role: .destructive) { confirm = "delete" } label: { Label("حذف نهائي", systemImage: "trash") } }
            }
        } label: {
            Image(systemName: "ellipsis.circle").accessibilityLabel("إجراءات المشروع")
        }
    }

    // MARK: header & notices

    private var header: some View {
        let service = detail?.serviceName.isEmpty == false ? detail!.serviceName : project.productName
        let pkg = detail?.packageName ?? project.packageName
        let start = Fmt.day(detail?.startDate ?? project.startDate)
        let end = Fmt.day(detail?.endDate ?? project.endDate)
        return VStack(alignment: .leading, spacing: 8) {
            Text(name).font(.title2.bold()).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                statusBadge
                if status == "active", let d = Fmt.daysUntil(detail?.endDate ?? project.endDate), d < 0 {
                    Pill(text: "متأخر \(Fmt.days(-d))", tone: .bad)
                }
                if project.fullyDistributed && closed { Pill(text: "موزّع بالكامل", tone: .ok) } else if closed { Pill(text: "مغلق") }
                if archived { Pill(text: "مؤرشف", tone: .warn) }
                if external { Pill(text: "خارجي") }
                if (detail?.visibility ?? project.visibility) == "private" { Pill(text: "خاص") }
            }
            VStack(alignment: .leading, spacing: 3) {
                Label(detail?.clientName.isEmpty == false ? detail!.clientName : project.clientName, systemImage: "building.2")
                    .font(.subheadline.weight(.medium)).foregroundStyle(Buad.ink)
                Text([Fmt.ltr(project.number), Vocabulary.type(detail?.type ?? project.type), service.isEmpty ? "" : (pkg.isEmpty ? service : "\(service) · \(pkg)")]
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

    /// The status badge; with projects.edit it is a menu of the other statuses (the website's BadgeMenu).
    @ViewBuilder private var statusBadge: some View {
        let st = Vocabulary.status(status)
        if canEditProject {
            Menu {
                ForEach(ProjectVocabulary.statuses.filter { $0 != status }, id: \.self) { k in
                    Button { pick(k) } label: {
                        Text(Vocabulary.status(k).label)
                        if let hint = ProjectVocabulary.statusHint[k] { Text(hint) }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    if statusBusy { ProgressView().controlSize(.mini) }
                    Text(st.label).font(.caption.weight(.semibold))
                    Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                }
                .padding(.horizontal, 10).frame(minHeight: 26)
                .background(st.tone.background, in: Capsule())
                .foregroundStyle(st.tone.foreground)
                .padding(.vertical, 9).contentShape(Rectangle())
            }
            .accessibilityLabel("الحالة: \(st.label)")
            .accessibilityHint("لتغيير حالة المشروع")
        } else {
            Pill(text: st.label, tone: st.tone)
        }
    }

    @ViewBuilder private var notices: some View {
        if archived {
            notice("هذا المشروع مؤرشف: مخفي من القوائم، ويمكن استعادته من «…».")
        }
        if status == "draft" && !external {
            notice("مسودة: أرقام هذا المشروع لا تُحسب في المالية (الأرباح والضريبة والتحصيل) حتى تتغير حالته إلى «جاري التنفيذ».")
        }
        if closed {
            notice("المشروع مغلق مالياً\(detail.map { $0.closeNote.isEmpty ? "" : ": \($0.closeNote)" } ?? ""). قيوده ومقبوضاته وفواتيره للاطلاع فقط.")
        }
        if external {
            notice("مشروع خارجي: يُتابَع للعمل فقط، ولا يدخل في أي رقم مالي.")
        }
    }

    private func notice(_ text: String) -> some View {
        Label(text, systemImage: "info.circle")
            .font(.footnote).foregroundStyle(Buad.warningInk)
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Buad.warningSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
    }

    /// The one next step that fits where the project is: restore, start, record money, close.
    @ViewBuilder private var nextStep: some View {
        if archived {
            if can("projects.archive") { bigButton("استعادة المشروع", "arrow.uturn.backward") { Task { await restore() } } }
        } else if status == "draft" && canEditProject {
            bigButton("بدء التنفيذ", "play.fill") { confirm = "activate" }
        } else if status == "completed" && manager && !closed {
            bigButton("إغلاق المشروع", "lock.fill") { closing = .close }
        } else if canReceive && finance != nil {
            bigButton("تسجيل مقبوض", "banknote") { receive() }
        }
    }

    private func bigButton(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                .foregroundStyle(Buad.onInk)
        }
        .buttonStyle(.plain)
    }

    private func receive() {
        if pending.count > 1 { choosingReceipt = true }
        else if let next = pending.first { startReceive(next) }
        else { receiptTarget = ReceiptTarget(receipt: nil) }
    }

    // MARK: «نظرة عامة»

    @ViewBuilder private var overview: some View {
        pulse
        if canFinance, let f = finance {
            financeStrip(f)
            collection(f)
        }
        if external { externalCard }
        if canTasks, let x = execution { upcoming(x) }
        if canDocs, let docs = documents, !docs.isEmpty { docsSummary(docs) }
        detailsCard
    }

    /// «التحصيل» at a glance: collected of the contract, what is left, the next instalment.
    private func collection(_ f: ProjectFinance) -> some View {
        let gross = f.summary.grossTotal
        let share = gross > 0 ? min(1, max(0, Double(f.received) / Double(gross))) : 0
        return Button { tab = .finance } label: {
            Card {
                HStack {
                    Label("التحصيل", systemImage: "signature").font(.headline).foregroundStyle(Buad.ink)
                    Spacer()
                    Chevron()
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(Fmt.sar(f.received)).font(.title3.bold()).monospacedDigit().foregroundStyle(Buad.ink)
                    Text("من \(Fmt.sar(gross))").font(.caption).foregroundStyle(Buad.muted)
                    Spacer()
                    Text("\(Int((share * 100).rounded()))%").font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(Buad.successInk)
                }
                ProgressBar(value: share, color: Buad.success)
                if let d = pending.first {
                    let late = d.dueDate < Fmt.todayISO
                    HStack {
                        Text(late ? "دفعة متأخرة" : "الدفعة القادمة").font(.caption).foregroundStyle(late ? Buad.dangerInk : Buad.muted)
                        Spacer()
                        Text("\(Fmt.sar(d.amount)) · \(Fmt.dayMonth(d.dueDate))").font(.caption.weight(.semibold)).monospacedDigit()
                            .foregroundStyle(late ? Buad.dangerInk : Buad.ink)
                    }
                } else if gross > f.received {
                    Text("المتبقي على العميل \(Fmt.sar(gross - f.received)) بلا دفعات مجدولة").font(.caption).foregroundStyle(Buad.warningInk)
                }
            }
        }
        .buttonStyle(.plain)
    }

    /// The next open tasks by date, and a way to the whole list.
    @ViewBuilder private func upcoming(_ x: Execution) -> some View {
        let open = x.tasks.filter { $0.status != "done" }.sorted { ($0.dueDate.isEmpty ? "9" : $0.dueDate) < ($1.dueDate.isEmpty ? "9" : $1.dueDate) }
        Card {
            HStack {
                Label("ما التالي", systemImage: "checklist").font(.headline)
                Spacer()
                Button { tab = .work } label: { Text(open.isEmpty ? "المهام" : "كل المهام (\(open.count))").font(.subheadline.weight(.medium)) }
            }
            if open.isEmpty {
                Text(x.tasks.isEmpty ? "لا مهام بعد." : "أُنجزت كل المهام.").font(.subheadline).foregroundStyle(Buad.muted)
                if x.tasks.isEmpty && can("tasks.edit") {
                    Button { tab = .work; newTask = true } label: { Label("أضف أول مهمة", systemImage: "plus") }.font(.subheadline.weight(.semibold))
                }
            }
            ForEach(open.prefix(3)) { t in
                HStack(alignment: .firstTextBaseline) {
                    Image(systemName: t.status == "doing" ? "circle.lefthalf.filled" : "circle").font(.caption).foregroundStyle(Buad.faint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.title).font(.subheadline).lineLimit(2)
                        let meta = [t.assigneeName, t.dueDate.isEmpty ? "" : Fmt.dayMonth(t.dueDate)].filter { !$0.isEmpty }.joined(separator: " · ")
                        if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(t.overdue ? Buad.dangerInk : Buad.muted) }
                    }
                    Spacer()
                    if t.overdue { Pill(text: "متأخرة", tone: .bad) }
                }
            }
        }
    }

    private func docsSummary(_ docs: [DocumentItem]) -> some View {
        let approved = docs.filter { $0.status == "approved" }.count
        let contract = docs.first { $0.kind == "contract" }
        return Button { tab = .documents } label: {
            Card {
                HStack {
                    Label("المستندات", systemImage: "doc.text").font(.headline).foregroundStyle(Buad.ink)
                    Spacer()
                    Text("\(docs.count) · معتمد \(approved)").font(.caption).foregroundStyle(Buad.muted)
                    Chevron()
                }
                if let c = contract {
                    let st = Vocabulary.docStatus(c.status)
                    HStack {
                        Text(c.title.isEmpty ? "العقد" : c.title).font(.subheadline).foregroundStyle(Buad.ink).lineLimit(1)
                        Spacer()
                        Pill(text: st.label, tone: st.tone)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var detailsCard: some View {
        let loc = detail?.location ?? project.location
        return Card {
            HStack {
                Text("بيانات المشروع").font(.headline)
                Spacer()
                if canEditProject && detail != nil {
                    Button { editing = true } label: { Label("تعديل", systemImage: "pencil").font(.subheadline.weight(.medium)) }
                        .frame(minHeight: Buad.tap)
                }
            }
            row("النوع", Vocabulary.type(detail?.type ?? project.type))
            if !loc.isEmpty { row("الموقع", loc) }
            if let d = detail {
                if !d.startDate.isEmpty { row("البداية", Fmt.day(d.startDate)) }
                if !d.endDate.isEmpty { row("الانتهاء المتوقع", Fmt.day(d.endDate)) }
                if !d.payDate.isEmpty { row("استلام الدفعة", Fmt.day(d.payDate)) }
                if d.expectedValue > 0 && !d.financeExists { row("القيمة المتوقعة", Fmt.sar(d.expectedValue)) }
                row("الظهور", d.visibility == "private" ? "خاص" : "الفريق")
                if !d.notes.isEmpty {
                    Text(d.notes).font(.subheadline).foregroundStyle(Buad.muted)
                        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Buad.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                if d.createdAt > 0 {
                    Text("أُضيف \(Fmt.epochDay(d.createdAt)) · آخر تعديل \(Fmt.epochDay(d.updatedAt))").font(.caption).foregroundStyle(Buad.muted)
                }
            }
        }
    }

    // MARK: «المالية»

    @ViewBuilder private var financeTab: some View {
        if let f = finance {
            contractCard(f)
            scheduleCard
            receiptsCard(f)
            if canInvoices { Card { Label("الفواتير الضريبية", systemImage: "doc.text").font(.headline); invoicesList } }
            Text("المعاملات").font(.headline).padding(.top, 4)
            entriesView
        } else {
            EmptyNote(text: loaded ? "تعذّر تحميل المالية." : "جارٍ التحميل…", icon: "banknote")
        }
    }

    private func contractCard(_ f: ProjectFinance) -> some View {
        let gross = f.summary.grossTotal
        let share = gross > 0 ? min(1, max(0, Double(f.received) / Double(gross))) : 0
        return Card {
            Label("العقد والتحصيل", systemImage: "signature").font(.headline)
            VStack(alignment: .leading, spacing: 2) {
                Text(Fmt.sar(gross)).font(.title2.bold()).monospacedDigit()
                Text([f.vatIncluded ? "شاملة الضريبة" : "+ ضريبة \(Self.num(f.vatPct))%", Fmt.ltr(f.contractNo), Fmt.day(f.contractDate)]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Buad.muted)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("حُصّل \(Fmt.sar(f.received))")
                    Spacer()
                    Text("\(Int((share * 100).rounded()))%").monospacedDigit()
                }
                .font(.caption).foregroundStyle(Buad.muted)
                ProgressBar(value: share, color: Buad.success)
            }
            HStack {
                Text("المتبقي على العميل: ").foregroundStyle(Buad.muted) + Text(Fmt.sar(max(0, gross - f.received))).bold()
                Spacer()
            }
            .font(.subheadline)
            DisclosureGroup(isExpanded: $showTerms) {
                VStack(alignment: .leading, spacing: 8) { contractTrail(f) }.padding(.top, 8)
            } label: {
                Text("تفصيل العقد: الأتعاب والمتاح للتنفيذ").font(.subheadline.weight(.medium))
            }
            .tint(Buad.ink)
        }
    }

    private var scheduleCard: some View {
        Card {
            HStack {
                Label("الدفعات المنتظرة", systemImage: "calendar").font(.headline)
                Spacer()
                if pending.contains(where: { $0.dueDate < Fmt.todayISO }) { Pill(text: "متأخرة", tone: .bad) }
            }
            scheduleList
            if canEditEntries { addButton("دفعة منتظرة") { addingLine = true } }
        }
    }

    private func receiptsCard(_ f: ProjectFinance) -> some View {
        Card {
            HStack {
                Label("الاستلامات", systemImage: "banknote").font(.headline)
                Spacer()
                Text(String(f.receipts.count)).font(.caption).foregroundStyle(Buad.muted)
            }
            receiptsList(f)
            if canReceive { addButton("تسجيل مقبوض") { receive() } }
        }
    }

    /// «تعليم كمدفوع»: the entry's status only, as the website's quick status change.
    private func markPaid(_ e: FinanceEntry) async {
        guard await Confirm.owner("تأكيد تعليم «\(e.description)» كمدفوع") else { return }
        do {
            finance = try await APIClient.shared.updateEntry(project.id, e.id, ["status": "paid"])
            toast = ToastItem(text: "عُلّم «\(e.description)» مدفوعاً") { [id = project.id] in
                if let fin = try? await APIClient.shared.updateEntry(id, e.id, ["status": "pending"]) { finance = fin }
            }
        } catch {
            session.handle(error)
            writeError = "تعذّر تعليم القيد كمدفوع. " + ((error as? APIError)?.message ?? "")
        }
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
            JoinedGrid {
                GridRow {
                    cell("التنفيذ", exec.1 > 0 ? "\(exec.0)/\(exec.1) \(exec.2)" : "لم تُضف مراحل أو مهام",
                         progress: exec.1 > 0 ? Double(exec.0) / Double(exec.1) : nil)
                    if let d = days, status == "active" {
                        cell("الموعد", d < 0 ? "متأخر \(Fmt.days(-d))" : "متبقٍ \(Fmt.days(d))",
                             sub: "الانتهاء \(Fmt.day(endISO))", tone: d < 0 ? .bad : d <= 7 ? .warn : nil)
                    } else {
                        cell("الموعد", endISO.isEmpty ? "بلا تاريخ انتهاء" : Fmt.day(endISO))
                    }
                }
                GridRow {
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
            }
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
        .joinedCell(minHeight: 82)
    }

    // MARK: finance strip

    private func financeStrip(_ f: ProjectFinance) -> some View {
        let s = f.summary
        let spent = s.grossTotal > 0 ? Double(s.totalDeductions) / Double(s.grossTotal) : 0
        let margin = s.grossTotal > 0 ? Double(s.profit) / Double(s.grossTotal) * 100 : 0
        return VStack(spacing: 0) {
            Grid(horizontalSpacing: 1, verticalSpacing: 1) {
                GridRow {
                    tile("المصروف من العقد", Fmt.sar(s.totalDeductions),
                         sub: s.pendingExpenses > 0 ? "منه معلّق \(Fmt.sar(s.pendingExpenses))" : "\(Int((spent * 100).rounded()))% من العقد",
                         tone: s.pendingExpenses > 0 ? .warn : nil)
                    tile("صافي الربح", f.profitHidden ? "مخفي" : Fmt.sar(s.profit), tone: f.profitHidden ? nil : .ok)
                }
                GridRow {
                    tile("غير المصنّف من العقد", Fmt.sar(s.remaining), sub: s.remaining < 0 ? "▲ تجاوز قيمة العقد" : nil, tone: s.remaining < 0 ? .bad : nil)
                    tile("هامش الربح", f.profitHidden ? "مخفي" : "\(Int(margin.rounded()))%",
                         tone: f.profitHidden ? nil : margin >= 20 ? .ok : margin >= 0 ? .warn : .bad)
                }
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
            if let sub { Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2) }
        }
        .joinedCell()
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
                if canEditEntries {
                    Button { receiptTarget = ReceiptTarget(receipt: r) } label: { receiptRow(r, chevron: true) }
                        .buttonStyle(.plain)
                        .accessibilityHint("لتعديل المقبوض أو اعتماده")
                } else {
                    receiptRow(r, chevron: false)
                }
            }
        }
    }

    private func receiptRow(_ r: Receipt, chevron: Bool) -> some View {
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
                    if chevron { Chevron() }
                }
                .frame(minHeight: Buad.tap)
                .contentShape(Rectangle())
    }

    private func addButton(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button { action() } label: {
            Label(title, systemImage: "plus").font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: Buad.tap)
                .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                .foregroundStyle(Buad.ink)
        }
        .buttonStyle(.plain)
    }

    /// «الفواتير»: tax invoices sent to the client; their date sets the quarter of the sales VAT.
    @ViewBuilder private var invoicesList: some View {
        Text("الفواتير الضريبية المرسلة للعميل: تاريخها يحدد ربع ضريبة المبيعات. ما لم تُسجَّل فاتورة، تُحتسب ضريبة المشروع بتاريخ كل استلام.")
            .font(.caption).foregroundStyle(Buad.muted)
        if let list = invoices {
            if list.isEmpty {
                Text("لا فواتير مسجّلة.").font(.footnote).foregroundStyle(Buad.muted)
            } else {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, inv in
                    if i > 0 { Divider() }
                    let row = HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(Fmt.day(inv.date)) · \(inv.number.isEmpty ? "بلا رقم" : Fmt.ltr(inv.number))").font(.subheadline.weight(.medium))
                            HStack(spacing: 4) {
                                Text("منها ضريبة \(Fmt.sar(inv.vat))")
                                if inv.hasFile { Label("مرفقة", systemImage: "paperclip") }
                            }
                            .font(.caption).foregroundStyle(Buad.muted)
                        }
                        Spacer()
                        Text(Fmt.sar(inv.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        if canEditInvoices { Chevron() }
                    }
                    .frame(minHeight: Buad.tap)
                    .contentShape(Rectangle())
                    if canEditInvoices {
                        Button { invoiceTarget = InvoiceTarget(invoice: inv) } label: { row }.buttonStyle(.plain)
                    } else {
                        row
                    }
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity)
        }
        if canEditInvoices { addButton("فاتورة ضريبية مرسلة") { invoiceTarget = InvoiceTarget(invoice: nil) } }
    }

    @ViewBuilder private var scheduleList: some View {
        if schedule.isEmpty {
            Text(canEditEntries ? "أضف الدفعات المنتظرة من العميل لتتابعها وتظهر أعمارها." : "لا دفعات مجدولة.").font(.footnote).foregroundStyle(Buad.muted)
        } else {
            ForEach(Array(schedule.enumerated()), id: \.element.id) { i, item in
                if i > 0 { Divider() }
                let st = Vocabulary.scheduleStatus(item.status, dueDate: item.dueDate)
                let late = item.status == "pending" && item.dueDate < Fmt.todayISO
                if item.status == "pending" && (canReceive || canEditEntries) {
                    Button { lineActions = item } label: { scheduleRow(item, st: st, late: late) }
                        .buttonStyle(.plain)
                        .accessibilityHint("لتسجيل استلامها أو حذفها")
                } else {
                    scheduleRow(item, st: st, late: late)
                }
            }
        }
    }

    private func deleteLine(_ item: ScheduleItem) async {
        guard await Confirm.owner("تأكيد حذف الدفعة «\(item.label)»") else { return }
        do {
            try await APIClient.shared.deleteScheduleLine(item.id)
            toast = ToastItem(text: "حُذفت الدفعة")
            await load()
        } catch {
            session.handle(error)
            writeError = "تعذّر حذف الدفعة. " + ((error as? APIError)?.message ?? "")
        }
    }

    private func scheduleRow(_ item: ScheduleItem, st: (label: String, tone: Tone), late: Bool) -> some View {
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
                    if item.status == "pending" && (canReceive || canEditEntries) { Chevron() }
                }
                .frame(minHeight: Buad.tap)
                .contentShape(Rectangle())
    }

    private var externalCard: some View {
        Card {
            Label("مشروع خارجي", systemImage: "arrow.up.forward.square").font(.headline)
            Text("لا يدخل في أي رقم مالي: لا قيود ولا استلامات ولا فواتير، ولا يُحسب في الإيرادات أو الضريبة أو الأرباح أو المستهدف.")
                .font(.footnote).foregroundStyle(Buad.muted)
            if project.contractTotal > 0 { row("القيمة التقديرية (للاطلاع)", Fmt.sar(project.contractTotal)) }
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
                Spacer(minLength: 0)
                if canEditEntries {
                    Button { entryTarget = EntryTarget(entry: nil) } label: {
                        Label("قيد", systemImage: "plus").font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12).frame(minHeight: 34)
                            .background(Buad.brandSoft, in: Capsule())
                            .padding(.vertical, 5).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Buad.ink)
                    .accessibilityLabel("قيد جديد")
                }
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
                            Text("\(rows.count) · \(Fmt.ltr((net >= 0 ? "+" : "−") + Fmt.short(abs(net))))").font(.caption).foregroundStyle(Buad.muted).monospacedDigit()
                        }
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, e in
                                if i > 0 { Divider().padding(.leading, 14) }
                                if canEditEntries {
                                    VStack(alignment: .leading, spacing: 0) {
                                        Button { entryTarget = EntryTarget(entry: e) } label: { entryRow(e, f, chevron: true) }
                                            .buttonStyle(.plain)
                                            .accessibilityHint("لتعديل القيد أو حذفه")
                                        if e.status == "pending" {
                                            Button { Task { await markPaid(e) } } label: {
                                                Label("تعليم كمدفوع", systemImage: "checkmark.circle")
                                                    .font(.caption.weight(.semibold))
                                                    .padding(.horizontal, 12).frame(minHeight: 30)
                                                    .background(Buad.successSoft, in: Capsule())
                                                    .foregroundStyle(Buad.successInk)
                                                    .padding(.vertical, 7).contentShape(Rectangle())
                                            }
                                            .buttonStyle(.plain)
                                            .padding(.horizontal, 14)
                                            .padding(.top, -10)
                                        }
                                    }
                                } else {
                                    entryRow(e, f, chevron: false)
                                }
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

    private func entryRow(_ e: FinanceEntry, _ f: ProjectFinance, chevron: Bool) -> some View {
        let income = e.type == "income"
        let flags = [Fmt.day(e.date), f.categoryName(e.cat), e.supplierName, e.taxInvoice ? "فاتورة ضريبية" : "", e.assetId.isEmpty ? "" : "مرفق",
                     e.status == "pending" ? "معلّق" : "", e.status == "cancelled" ? "ملغى، لا يُحتسب" : ""]
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(e.description).font(.subheadline.weight(.medium)).lineLimit(2)
                Text(flags.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(e.status == "pending" ? Buad.warningInk : Buad.muted).lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(Fmt.signed(e.amount, positive: income))
                .font(.subheadline.weight(.semibold)).monospacedDigit()
                .foregroundStyle(e.status == "cancelled" ? Buad.muted : income ? Buad.successInk : Buad.ink)
                .strikethrough(e.status == "cancelled")
            if chevron { Chevron() }
        }
        .padding(14)
        .contentShape(Rectangle())
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

    // MARK: writes on the project

    private func pick(_ k: String) {
        // Stopping the work with money still owed is «إلغاء المشروع» (it settles the contract).
        if k == "cancelled" && manager && !closed { closing = .cancel; return }
        if k == "active" && status == "draft" { confirm = "activate"; return }
        Task { await setStatus(k) }
    }

    private func setStatus(_ k: String) async {
        let before = status
        statusBusy = true
        defer { statusBusy = false }
        do {
            try await APIClient.shared.updateProject(project.id, ["status": k])
            await load()
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            toast = ToastItem(text: "الحالة الآن «\(Vocabulary.status(k).label)»") { [id = project.id] in
                try? await APIClient.shared.updateProject(id, ["status": before])
                await load()
                NotificationCenter.default.post(name: .projectsChanged, object: nil)
            }
        } catch {
            session.handle(error)
            writeError = "تعذّر تغيير الحالة. " + ((error as? APIError)?.message ?? "")
        }
    }

    private func archive() async {
        do {
            try await APIClient.shared.archiveProject(project.id)
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            dismiss()
        } catch {
            session.handle(error)
            writeError = (error as? APIError)?.message ?? "تعذّرت الأرشفة"
        }
    }

    private func restore() async {
        do {
            try await APIClient.shared.restoreProject(project.id)
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            toast = ToastItem(text: "استُعيد المشروع")
            await load()
        } catch {
            session.handle(error)
            writeError = (error as? APIError)?.message ?? "تعذّرت الاستعادة"
        }
    }

    private func deleteProject() async {
        do {
            try await APIClient.shared.deleteProject(project.id)
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            dismiss()
        } catch {
            session.handle(error)
            writeError = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }

    private func makeReport(detailed: Bool) async {
        do {
            let data = try await APIClient.shared.financeReportPDF(project.id, detailed: detailed, name: "التقرير-المالي-\(project.number)")
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("التقرير المالي \(detailed ? "التفصيلي " : "")\(project.number).pdf")
            try data.write(to: url, options: .atomic)
            report = url
        } catch {
            session.handle(error)
            writeError = (error as? APIError)?.message ?? "تعذّر إنشاء التقرير"
        }
    }

    // MARK: loading

    private func reloadWork() async {
        if let x = try? await APIClient.shared.execution(project.id) { execution = x }
    }

    private func reloadDocs() async {
        if let d = try? await APIClient.shared.documents(project.id) { documents = d }
    }

    private func load() async {
        let id = project.id
        let (fin, tasks, docsAllowed, inv) = (canFinance, canTasks, canDocs, canInvoices)
        async let d = Self.attempt(true) { try await APIClient.shared.project(id) }
        async let f = Self.attempt(fin) { try await APIClient.shared.finance(id) }
        async let s = Self.attempt(fin) { try await APIClient.shared.schedule(id) }
        async let e = Self.attempt(tasks) { try await APIClient.shared.execution(id) }
        async let docs = Self.attempt(docsAllowed) { try await APIClient.shared.documents(id) }
        async let invs = Self.attempt(inv) { try await APIClient.shared.salesInvoices(id) }
        let (dr, fr, sr, er, docr, ir) = await (d, f, s, e, docs, invs)
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
        invoices = take(ir) ?? invoices
        failed = anyFailed
        loaded = true
        if !tabs.contains(tab) { tab = .overview }
    }

    private enum Loaded<T> { case value(T), failed(APIError), skipped }

    private static func attempt<T>(_ allowed: Bool, _ work: @Sendable () async throws -> T) async -> Loaded<T> {
        guard allowed else { return .skipped }
        do { return .value(try await work()) } catch { return .failed((error as? APIError) ?? .network) }
    }

}

extension CloseProjectSheet.Mode: Identifiable {
    var id: Self { self }
}
