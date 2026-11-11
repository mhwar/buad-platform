import SwiftUI

/// «المالية ← الشركاء والتوزيع» (finance-overview/PartnersTab.tsx): what the projects have realised, the
/// company's net, what was shared and kept back, what is left to share; the partners and their shares;
/// and the distributions — a draft is approved or removed, an approved one records its payment.
/// A new distribution here is for one project's profit (preview first, then save as draft or approve).
/// The quarter distribution and past distributions are done on the website, which can check many
/// projects at once; «مركز الربع» below shows them read-only.
struct PartnersView: View {
    @EnvironmentObject private var session: Session
    @State private var balances: CompanyBalances?
    @State private var partners: [Partner] = []
    @State private var totalPct = 0.0
    @State private var distributions: [Distribution] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var partner: PartnerTarget?
    @State private var wizard = false
    @State private var toast: ToastItem?

    struct PartnerTarget: Identifiable { let partner: Partner?; var id: String { partner?.id ?? "new" } }

    private var canEdit: Bool { session.me?.can("treasury.edit") ?? false }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, balances == nil {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else {
                    if let b = balances { balancesCard(b) }
                    NavigationLink { QuarterView() } label: {
                        HStack {
                            Label("مركز الربع", systemImage: "calendar.badge.clock").font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink)
                            Spacer()
                            Text("ما استُلم وتحقق وما بقي للتوزيع").font(.caption).foregroundStyle(Buad.muted)
                            Chevron()
                        }
                        .padding(14).background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    partnersCard
                    distributionsSection
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .refreshable { await load() }
        .task { await load() }
        .toast($toast)
        .sheet(item: $partner) { t in
            PartnerSheet(existing: t.partner) { toast = ToastItem(text: "حُفظ الشريك"); Task { await load() } }
        }
        .sheet(isPresented: $wizard) {
            DistributionWizard(partnersPct: totalPct) { toast = ToastItem(text: $0); Task { await load() } }
        }
    }

    private func balancesCard(_ b: CompanyBalances) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("أرصدة الأرباح").font(.headline)
            JoinedGrid {
                GridRow {
                    tile("ربح متحقق من المشاريع", Fmt.sar(b.realized), "بالاستلامات المعتمدة")
                    tile("صافي الشركة", Fmt.sar(b.companyNet), "إيرادات الخدمات − المصروفات")
                }
                GridRow {
                    tile("وُزّع واحتُجز", Fmt.sar(b.distributed + b.retained), "للشركاء \(Fmt.short(b.distributed)) · محتجز \(Fmt.short(b.retained))")
                    tile("أرباح غير موزّعة", Fmt.sar(b.undistributed), "جاهزة للتوزيع أو الاحتجاز", tone: b.undistributed > 0 ? .ok : nil)
                }
            }
            if b.retained > 0 {
                Text("المحتجز: احتياطي \(Fmt.short(b.reserve)) · تشغيل \(Fmt.short(b.ops)) · تطوير \(Fmt.short(b.dev))").font(.caption).foregroundStyle(Buad.muted)
            }
            if b.approvedUnpaid > 0 {
                Label("معتمد ولم يُدفع للشركاء بعد: \(Fmt.sar(b.approvedUnpaid))", systemImage: "hourglass").font(.footnote.weight(.medium)).foregroundStyle(Buad.warningInk)
            }
        }
    }

    private func tile(_ title: String, _ value: String, _ sub: String, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            Text(value).font(.body.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(tone?.foreground ?? Buad.ink)
            Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2)
        }
        .joinedCell(minHeight: 62)
    }

    private var partnersCard: some View {
        Card {
            HStack {
                Text("الشركاء").font(.headline)
                Spacer()
                if canEdit {
                    Button { partner = PartnerTarget(partner: nil) } label: { Label("شريك", systemImage: "plus").font(.subheadline.weight(.semibold)) }
                        .frame(minHeight: Buad.tap)
                }
            }
            if partners.isEmpty {
                Text("لا شركاء بعد. أضفهم بحصصهم قبل أي توزيع.").font(.subheadline).foregroundStyle(Buad.muted)
            }
            ForEach(partners) { p in
                Button { if canEdit { partner = PartnerTarget(partner: p) } } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.subheadline.weight(.medium)).foregroundStyle(Buad.ink)
                            if !p.note.isEmpty { Text(p.note).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
                        }
                        Spacer()
                        Text("\(EntrySheet.num((p.sharePct * 100).rounded() / 100))%").font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(Buad.ink)
                    }
                    .frame(minHeight: Buad.tap).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if !partners.isEmpty {
                let ok = abs(totalPct - 100) < 0.011
                Label(ok ? "مجموع الحصص: \(EntrySheet.num((totalPct * 100).rounded() / 100))% ✓" : "مجموع الحصص: \(EntrySheet.num((totalPct * 100).rounded() / 100))% — يجب أن يكون 100%",
                      systemImage: ok ? "checkmark.circle" : "exclamationmark.triangle")
                    .font(.footnote.weight(.medium)).foregroundStyle(ok ? Buad.successInk : Buad.warningInk)
            }
        }
    }

    @ViewBuilder private var distributionsSection: some View {
        HStack {
            Text("توزيعات الأرباح").font(.headline)
            Spacer()
        }
        if canEdit {
            ActionRow { ActionTile(icon: "chart.pie", title: "توزيع ربح مشروع", primary: true) { wizard = true } }
        }
        if distributions.isEmpty {
            EmptyNote(text: "لا توزيعات بعد.", icon: "chart.pie")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(distributions.enumerated()), id: \.element.id) { i, d in
                    if i > 0 { Divider().padding(.leading, 14) }
                    DistributionRow(distribution: d, canEdit: canEdit) { message in toast = ToastItem(text: message); Task { await load() } }
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func load() async {
        do {
            async let b = APIClient.shared.companyBalances()
            async let p = APIClient.shared.partners()
            async let d = APIClient.shared.distributions()
            let (bb, pp, dd) = try await (b, p, d)
            balances = bb; partners = pp.items; totalPct = pp.totalPct; distributions = dd
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

/// One distribution: its label, state (draft, approved, paid) and what was shared and kept; open it for
/// the partners' shares and — by state — approve, delete the draft, or record the payment.
struct DistributionRow: View {
    @EnvironmentObject private var session: Session
    let distribution: Distribution
    let canEdit: Bool
    let changed: (String) -> Void

    @State private var open = false
    @State private var payDate = Date()
    @State private var payRef = ""
    @State private var busy = false
    @State private var error: String?
    @State private var confirm: String?

    private var state: (label: String, tone: Tone) {
        distribution.paid ? ("مدفوع", .ok) : distribution.status == "completed" ? ("معتمد", .info) : ("مسودة", .warn)
    }

    var body: some View {
        let d = distribution
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(d.periodLabel).font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink).multilineTextAlignment(.leading)
                        let line = d.paid ? "دُفع \(Fmt.day(d.paidOn))" : d.status == "completed" ? "اعتُمد \(Fmt.epochDay(d.completedAt))" : "مسودة"
                        Text("\(line) · وُزّع \(Fmt.short(d.distributed))" + (d.retained > 0 ? " · محتجز \(Fmt.short(d.retained)) (\(CompanyVocabulary.retained(d.retainedCategory)))" : ""))
                            .font(.caption).foregroundStyle(Buad.muted).multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Pill(text: state.label, tone: state.tone)
                    Image(systemName: open ? "chevron.up" : "chevron.down").font(.caption.weight(.bold)).foregroundStyle(Buad.faint)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                Divider()
                row("صافي الربح المتاح", Fmt.sar(d.netProfit))
                row("نسبة التوزيع", "\(EntrySheet.num(d.pct))%")
                ForEach(d.shares) { s in
                    HStack {
                        Text("\(s.partnerName) (\(EntrySheet.num((s.sharePct * 100).rounded() / 100))%)").font(.subheadline)
                        Spacer()
                        Text(Fmt.sar(s.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                    }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(Buad.dangerInk) }
                if canEdit {
                    if d.status == "draft" {
                        ActionRow {
                            ActionTile(icon: "checkmark.seal", title: "اعتماد", primary: true, busy: busy) { confirm = "approve" }
                            ActionTile(icon: "trash", title: "حذف المسودة", busy: busy) { confirm = "delete" }
                        }
                    } else if !d.paid {
                        VStack(alignment: .leading, spacing: 8) {
                            DatePicker("تاريخ الدفع للشركاء", selection: $payDate, displayedComponents: .date).environment(\.calendar, Calendar(identifier: .gregorian))
                            TextField("مرجع التحويل (اختياري)", text: $payRef).textFieldStyle(.roundedBorder).environment(\.layoutDirection, .leftToRight)
                            ActionRow { ActionTile(icon: "banknote", title: "تسجيل الدفع", primary: true, busy: busy) { confirm = "pay" } }
                        }
                    }
                }
            }
        }
        .padding(14)
        .confirmationDialog(title, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            switch confirm ?? "" {
            case "approve": Button("اعتماد التوزيع") { Task { await run("اعتُمد التوزيع", "اعتماد توزيع «\(d.periodLabel)»") { try await APIClient.shared.completeDistribution(d.id) } } }
            case "delete": Button("حذف المسودة", role: .destructive) { Task { await run("حُذفت المسودة", "حذف مسودة توزيع «\(d.periodLabel)»") { try await APIClient.shared.deleteDistribution(d.id) } } }
            case "pay": Button("تسجيل الدفع") { Task { await run("سُجّل دفع التوزيع", "تسجيل دفع توزيع «\(d.periodLabel)»") { try await APIClient.shared.payDistribution(d.id, date: Fmt.isoDay(payDate), ref: payRef.trimmingCharacters(in: .whitespaces)) } } }
            default: EmptyView()
            }
            Button("إلغاء", role: .cancel) {}
        } message: {
            switch confirm ?? "" {
            case "approve": Text("بعد الاعتماد لا يمكن تعديله أو حذفه، ويُخصم من المتاح.")
            case "pay": Text("يُسجَّل الدفع بالتاريخ نفسه لجميع الشركاء.")
            default: Text("")
            }
        }
    }

    private var title: String {
        switch confirm ?? "" {
        case "approve": return "اعتماد التوزيع؟"
        case "delete": return "حذف هذه المسودة؟"
        case "pay": return "تسجيل دفع التوزيع؟"
        default: return ""
        }
    }

    private func row(_ t: String, _ v: String) -> some View {
        HStack { Text(t).foregroundStyle(Buad.muted); Spacer(); Text(v).monospacedDigit() }.font(.subheadline)
    }

    private func run(_ done: String, _ ask: String, _ work: () async throws -> Void) async {
        guard await Confirm.owner("تأكيد " + ask) else { return }
        busy = true
        defer { busy = false }
        do { try await work(); error = nil; changed(done) } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر التنفيذ"
        }
    }
}

/// A partner and his or her share of what is distributed (percent; the shares should total 100).
struct PartnerSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let existing: Partner?
    let saved: () -> Void

    @State private var name = ""
    @State private var pct = ""
    @State private var note = ""
    @State private var confirmDelete = false
    @State private var error: String?
    @State private var busy = false
    @State private var started = false

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) } }
                Section {
                    TextField("الاسم *", text: $name)
                    HStack {
                        Text("الحصة % *")
                        TextField("0", text: $pct).keyboardType(.decimalPad).multilineTextAlignment(.trailing).environment(\.layoutDirection, .leftToRight)
                    }
                    TextField("ملاحظة", text: $note)
                } footer: { Text("الحصة نسبة من المبلغ الموزَّع على الشركاء، ومجموع الحصص 100% ليصح الاعتماد.") }
                if existing != nil { Section { Button("حذف الشريك", role: .destructive) { confirmDelete = true } } }
            }
            .navigationTitle(existing == nil ? "شريك جديد" : "تعديل الشريك")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .confirmationDialog("حذف الشريك «\(existing?.name ?? "")»؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف الشريك", role: .destructive) { Task { await remove() } }
                Button("إلغاء", role: .cancel) {}
            } message: { Text("التوزيعات السابقة تحتفظ باسمه وحصته.") }
            .onAppear {
                guard !started, let p = existing else { started = true; return }
                started = true
                name = p.name; pct = EntrySheet.num(p.sharePct); note = p.note
            }
        }
    }

    private func save() async {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty, let p = ReceiptRules.riyals(pct), p > 0, p <= 100 else { error = "أدخل الاسم وحصة بين 0 و100."; return }
        guard await Confirm.owner("تأكيد حفظ الشريك «\(n)» بحصة \(EntrySheet.num(p))%") else { return }
        busy = true
        defer { busy = false }
        do { try await APIClient.shared.savePartner(existing?.id, name: n, sharePct: p, note: note.trimmingCharacters(in: .whitespaces)); saved(); dismiss() } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func remove() async {
        guard let p = existing, await Confirm.owner("تأكيد حذف الشريك «\(p.name)»") else { return }
        do { try await APIClient.shared.deletePartner(p.id); saved(); dismiss() } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }
}

/// «توزيع ربح مشروع»: pick a project, the share of its available profit to distribute and where the rest
/// is kept; the platform shows exactly what each partner would get. Then approve (final) or save a draft.
struct DistributionWizard: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let partnersPct: Double
    let done: (String) -> Void

    @State private var projects: [CompanyOverview.Proj] = []
    @State private var projectId = ""
    @State private var pct = "100"
    @State private var retained = "reserve"
    @State private var preview: DistributionPreview?
    @State private var previewError: String?
    @State private var error: String?
    @State private var busy = false
    @State private var confirmApprove = false

    private var body0: [String: Any] {
        ["mode": "project", "projectId": projectId, "pct": min(100, max(0, ReceiptRules.riyals(pct) ?? 100)), "retainedCategory": retained]
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) } }
                Section("المشروع") {
                    Picker("المشروع", selection: $projectId) {
                        Text("اختر مشروعاً").tag("")
                        ForEach(projects.filter(\.earning)) { Text("\($0.name) — ربح \(Fmt.short($0.profit))").tag($0.id) }
                    }
                }
                Section {
                    HStack {
                        Text("نسبة التوزيع %")
                        TextField("100", text: $pct).keyboardType(.decimalPad).multilineTextAlignment(.trailing).environment(\.layoutDirection, .leftToRight)
                    }
                    Picker("الباقي يُحتجز لـ", selection: $retained) {
                        Text("احتياطي").tag("reserve"); Text("تشغيل").tag("ops"); Text("تطوير").tag("dev")
                    }
                }
                if partnersPct <= 0 {
                    Section { Label("أضف الشركاء وحصصهم أولاً.", systemImage: "exclamationmark.triangle").foregroundStyle(Buad.warningInk) }
                } else if abs(partnersPct - 100) > 0.011 {
                    Section { Label("مجموع حصص الشركاء \(EntrySheet.num(partnersPct))%: يمكن حفظ مسودة، ولا يصح الاعتماد قبل أن يصير 100%.", systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(Buad.warningInk) }
                }
                if !projectId.isEmpty {
                    Section("المعاينة") {
                        if let p = preview {
                            row("صافي الربح المتاح", Fmt.sar(p.netProfit)); row("يوزَّع", Fmt.sar(p.distributed)); row("يُحتجز (\(CompanyVocabulary.retained(retained)))", Fmt.sar(p.retained))
                            ForEach(p.shares) { s in row("\(s.partnerName) (\(EntrySheet.num((s.sharePct * 100).rounded() / 100))%)", Fmt.sar(s.amount)) }
                        } else if let previewError {
                            Text(previewError).foregroundStyle(Buad.warningInk)
                        } else {
                            ProgressView().frame(maxWidth: .infinity)
                        }
                    }
                    Section {
                        Button { confirmApprove = true } label: { HStack { Spacer(); Label("اعتماد التوزيع", systemImage: "checkmark.seal").bold(); Spacer() } }
                            .disabled(busy || (preview?.netProfit ?? 0) <= 0 || abs(partnersPct - 100) > 0.011)
                        Button { Task { await save("draft") } } label: { HStack { Spacer(); Text("حفظ كمسودة"); Spacer() } }
                            .disabled(busy || (preview?.netProfit ?? 0) <= 0)
                    }
                }
            }
            .navigationTitle("توزيع ربح مشروع")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .task { projects = (try? await APIClient.shared.companyOverview(FinancePeriod()).projects) ?? [] }
            .task(id: "\(projectId)|\(pct)|\(retained)") {
                preview = nil; previewError = nil
                guard !projectId.isEmpty else { return }
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled else { return }
                do { preview = try await APIClient.shared.previewDistribution(body0) } catch {
                    session.handle(error)
                    previewError = (error as? APIError)?.message ?? "تعذّرت المعاينة"
                }
            }
            .confirmationDialog("اعتماد التوزيع؟", isPresented: $confirmApprove, titleVisibility: .visible) {
                Button("اعتماد التوزيع") { Task { await save("completed") } }
                Button("إلغاء", role: .cancel) {}
            } message: { Text("لا يمكن تعديله أو حذفه بعد الاعتماد، ويُخصم من المتاح.") }
        }
    }

    private func row(_ t: String, _ v: String) -> some View { HStack { Text(t); Spacer(); Text(v).monospacedDigit().bold() }.font(.subheadline) }

    private func save(_ status: String) async {
        guard await Confirm.owner(status == "completed" ? "تأكيد اعتماد توزيع ربح المشروع" : "تأكيد حفظ مسودة توزيع") else { return }
        var b = body0
        b["status"] = status
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.createDistribution(b)
            done(status == "completed" ? "اعتُمد التوزيع" : "حُفظت المسودة")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}
