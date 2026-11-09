import SwiftUI

extension Notification.Name {
    /// A project was created, edited, archived or deleted: the projects list refreshes.
    static let projectsChanged = Notification.Name("buad.projectsChanged")
    /// A draft project went back to sales: the app opens «المبيعات» on the new opportunity.
    static let movedToSales = Notification.Name("buad.movedToSales")
}

// MARK: - «مشروع جديد» / «تعديل المشروع»

/// ProjectDialog.tsx: the client, name, service and package, type, status, place, visibility, dates,
/// the expected contract value (until the contract settings take it over), external, and notes.
/// Editing sends only what changed (a visibility change needs the owner or «كل المشاريع»).
struct ProjectEditSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    /// nil: a new project.
    var existing: ProjectDetail? = nil
    /// A new project for this client (from the client's page).
    var presetClient: ClientItem? = nil
    let saved: (String) -> Void

    @State private var clientId = ""
    @State private var clientName = ""
    @State private var name = ""
    @State private var productId = ""
    @State private var packageId = ""
    @State private var type = "other"
    @State private var status = "active"
    @State private var location = ""
    @State private var visibility = "team"
    @State private var start: Date?
    @State private var end: Date?
    @State private var pay: Date?
    @State private var value = ""
    @State private var external = false
    @State private var notes = ""
    @State private var catalog: [CatalogItem] = []
    @State private var choosingClient = false
    @State private var error: String?
    @State private var busy = false
    @State private var baseline: [String: String] = [:]
    @State private var started = false

    private var fields: [String: String] {
        ["clientId": clientId, "name": name.trimmingCharacters(in: .whitespaces), "productId": productId, "packageId": packageId,
         "type": type, "status": status, "location": location.trimmingCharacters(in: .whitespaces), "visibility": visibility,
         "startDate": start.map(Fmt.isoDay) ?? "", "endDate": end.map(Fmt.isoDay) ?? "", "payDate": pay.map(Fmt.isoDay) ?? "",
         "expectedValue": value.trimmingCharacters(in: .whitespaces), "external": String(external),
         "notes": notes.trimmingCharacters(in: .whitespacesAndNewlines)]
    }

    private var products: [CatalogItem] {
        var seen = Set<String>()
        return catalog.filter { seen.insert($0.productId).inserted }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Button { choosingClient = true } label: {
                        HStack {
                            Text("العميل *").foregroundStyle(Buad.ink)
                            Spacer()
                            Text(clientName.isEmpty ? "اختر" : clientName).foregroundStyle(clientName.isEmpty ? Buad.muted : Buad.accentInk)
                            Chevron()
                        }
                    }
                    TextField("اسم المشروع *", text: $name)
                    Picker("نوع المشروع", selection: $type) {
                        ForEach(ProjectVocabulary.types, id: \.self) { Text(Vocabulary.type($0)).tag($0) }
                    }
                    Picker("الحالة", selection: $status) {
                        ForEach(ProjectVocabulary.statuses, id: \.self) { Text(Vocabulary.status($0).label).tag($0) }
                    }
                } footer: {
                    if status == "draft" { Text("المسودة لا تُحسب في المالية (الأرباح والضريبة والتحصيل) حتى تصبح «جاري التنفيذ».") }
                    else if status == "cancelled" && existing != nil { Text("لإيقاف العمل مع تسوية العقد والدفعات استخدم «إلغاء المشروع» من قائمة المشروع.") }
                }

                if !products.isEmpty {
                    Section("الخدمة") {
                        Picker("الخدمة / المنتج", selection: $productId) {
                            Text("بلا خدمة").tag("")
                            ForEach(products) { Text($0.productName).tag($0.productId) }
                        }
                        .onChange(of: productId) { _, _ in
                            if !catalog.contains(where: { $0.productId == productId && $0.packageId == packageId }) { packageId = "" }
                        }
                        if !productId.isEmpty {
                            Picker("الباقة المتعاقد عليها", selection: $packageId) {
                                Text("غير محددة").tag("")
                                ForEach(catalog.filter { $0.productId == productId }) { Text($0.packageName).tag($0.packageId) }
                            }
                        }
                    }
                }

                Section("الموعد والمكان") {
                    TextField("المدينة / الموقع", text: $location)
                    OptionalDateRow(title: "تاريخ البداية", date: $start)
                    OptionalDateRow(title: "تاريخ الانتهاء المتوقع", date: $end)
                    OptionalDateRow(title: "تاريخ استلام الدفعة المالية", date: $pay)
                }

                Section {
                    HStack {
                        Text("قيمة العقد المتوقعة (ر.س)")
                        TextField("0", text: $value).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                            .disabled(existing?.financeExists == true)
                    }
                    Picker("الظهور", selection: $visibility) {
                        Text("الفريق").tag("team")
                        Text("خاص بي").tag("private")
                    }
                    Toggle("مشروع خارجي", isOn: $external)
                } footer: {
                    if existing?.financeExists == true {
                        Text("القيمة تُدار الآن من «إعدادات العقد والميزانية».")
                    } else {
                        Text("قبل الضريبة. المشروع الخارجي يُتابَع للعمل فقط ولا يدخل في أي رقم مالي.")
                    }
                }

                Section("ملاحظات") {
                    TextField("ملاحظات", text: $notes, axis: .vertical).lineLimit(3...8)
                }
            }
            .navigationTitle(existing == nil ? "مشروع جديد" : "تعديل المشروع")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && fields != baseline, busy: busy, saveTitle: existing == nil ? "إنشاء" : "حفظ") {
                Task { await save() }
            }
            .sheet(isPresented: $choosingClient) {
                ClientPicker(allowNone: false) { c in
                    if let c { clientId = c.id; clientName = c.name }
                }
            }
            .task { await start() }
        }
    }

    private func start() async {
        guard !started else { return }
        if let p = existing {
            clientId = p.clientId; clientName = p.clientName; name = p.name; productId = p.productId; packageId = p.packageId
            type = p.type.isEmpty ? "other" : p.type; status = p.status; location = p.location
            visibility = p.visibility.isEmpty ? "team" : p.visibility
            start = Fmt.date(p.startDate); end = Fmt.date(p.endDate); pay = Fmt.date(p.payDate)
            value = p.expectedValue > 0 ? EntrySheet.plain(p.expectedValue) : ""
            external = p.external; notes = p.notes
        }
        if existing == nil, let c = presetClient { clientId = c.id; clientName = c.name }
        baseline = fields
        started = true
        if session.me?.can("sales.view") == true { catalog = (try? await APIClient.shared.catalog()) ?? [] }
        // Keep the project's own service in the list even when it has no priced package.
        if let p = existing, !p.productId.isEmpty, !catalog.contains(where: { $0.productId == p.productId }) { catalog = [] }
    }

    private func save() async {
        let f = fields
        guard !f["clientId"]!.isEmpty else { error = "اختر العميل."; return }
        guard !f["name"]!.isEmpty else { error = "اكتب اسم المشروع."; return }
        if let s = start, let e = end, e < s { error = "تاريخ الانتهاء قبل تاريخ البداية."; return }
        let riyals: Double
        if f["expectedValue"]!.isEmpty { riyals = 0 } else {
            guard let r = ReceiptRules.riyals(f["expectedValue"]!), r >= 0 else { error = "القيمة غير صحيحة."; return }
            riyals = r
        }
        func json(_ k: String) -> Any {
            switch k {
            case "expectedValue": return riyals
            case "external": return external
            default: return f[k] ?? ""
            }
        }
        var body: [String: Any] = [:]
        for k in f.keys where existing == nil || f[k] != baseline[k] {
            if existing?.financeExists == true && k == "expectedValue" { continue }
            if catalog.isEmpty && (k == "productId" || k == "packageId") && existing != nil { continue }
            body[k] = json(k)
        }
        if existing != nil && body.isEmpty { dismiss(); return }
        error = nil
        busy = true
        defer { busy = false }
        do {
            let id: String
            if let p = existing {
                try await APIClient.shared.updateProject(p.id, body)
                id = p.id
            } else {
                id = try await APIClient.shared.createProject(body)
            }
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            saved(id)
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError) == .forbidden ? "تغيير الظهور لمالك المشروع فقط." : (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

/// A date that may be empty: a switch, then the picker.
struct OptionalDateRow: View {
    let title: String
    @Binding var date: Date?

    var body: some View {
        Toggle(title, isOn: Binding(get: { date != nil }, set: { date = $0 ? (date ?? Date()) : nil }).animation())
        if let d = date {
            DatePicker(title, selection: Binding(get: { d }, set: { date = $0 }), displayedComponents: .date)
                .environment(\.calendar, Calendar(identifier: .gregorian))
                .labelsHidden()
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

// MARK: - Closing, cancelling, reopening

/// CloseProjectDialog / CancelProjectDialog / ReopenProjectDialog: the review (warnings and final
/// figures), the contract settlement when something is still owed, and the note or reason.
/// Confirmed with Face ID.
struct CloseProjectSheet: View {
    enum Mode { case close, cancel, reopen }

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let projectId: String
    let projectName: String
    let mode: Mode
    let done: (String) -> Void

    enum Settle: Hashable { case keep, received, custom }
    @State private var check: CloseCheck?
    @State private var settle: Settle = .keep
    @State private var custom = ""
    @State private var cancelInstalments = false
    @State private var text = ""
    @State private var error: String?
    @State private var busy = false

    private var title: String { mode == .close ? "إغلاق المشروع" : mode == .cancel ? "إلغاء المشروع" : "إعادة فتح المشروع" }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                switch mode {
                case .reopen:
                    Section {
                        TextField("سبب إعادة الفتح", text: $text, axis: .vertical).lineLimit(2...5)
                    } footer: {
                        Text("تُفتح القيود والمقبوضات والفواتير للتعديل، ويُسجَّل السبب في سجل النشاط.")
                    }
                case .close, .cancel:
                    if mode == .cancel {
                        Section {
                            Text("توقّف العمل في المشروع. ما استُلم يبقى محسوباً، وما بقي على العميل يُسوّى هنا.")
                                .font(.subheadline).foregroundStyle(Buad.muted)
                        }
                    }
                    if let c = check {
                        Section(c.warnings.isEmpty ? "المراجعة" : "قبل \(mode == .close ? "الإغلاق" : "الإلغاء")، راجع (\(c.warnings.count))") {
                            if c.warnings.isEmpty {
                                Label("لا ملاحظات: المشروع جاهز.", systemImage: "checkmark.seal").foregroundStyle(Buad.successInk)
                            }
                            ForEach(c.warnings) { w in
                                Label(w.text, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Buad.warningInk)
                            }
                        }
                        Section("الأرقام النهائية") {
                            money("قيمة العقد", c.gross)
                            money("المستلم", c.received)
                            money("المتبقي على العميل", c.remaining)
                            money("المصاريف", c.expenses)
                            money("صافي الربح", c.profit)
                            if c.outputVat > 0 || c.inputVat > 0 { money("صافي ضريبة المشروع", c.outputVat - c.inputVat) }
                        }
                        if c.remaining > 50 || c.pendingCount > 0 {
                            Section {
                                Picker("تسوية العقد", selection: $settle) {
                                    Text(mode == .close ? "يبقى المتبقي مستحقاً على العميل" : "لا تسوية الآن").tag(Settle.keep)
                                    Text("اعتماد المستلم \(Fmt.sar(c.received)) قيمة نهائية").tag(Settle.received)
                                    Text("قيمة نهائية متفق عليها").tag(Settle.custom)
                                }
                                .pickerStyle(.inline)
                                .labelsHidden()
                                .onChange(of: settle) { _, now in cancelInstalments = now != .keep }
                                if settle == .custom {
                                    HStack {
                                        Text("القيمة النهائية (ر.س، شاملة الضريبة)")
                                        TextField("0", text: $custom).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                }
                                if c.pendingCount > 0 {
                                    Toggle("إلغاء الدفعات المجدولة غير المستلمة (\(Fmt.instalments(c.pendingCount)))", isOn: $cancelInstalments)
                                }
                            } header: { Text("تسوية العقد") }
                        }
                    } else {
                        Section { ProgressView().frame(maxWidth: .infinity) }
                    }
                    Section {
                        TextField(mode == .close ? "ملاحظة الإغلاق (اختياري)" : "سبب الإلغاء", text: $text, axis: .vertical).lineLimit(2...5)
                    } footer: {
                        if mode == .close { Text("بعد الإغلاق تُقفل القيود والمقبوضات والفواتير، ويمكن إعادة فتحه بسبب.") }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: !text.isEmpty, busy: busy || (mode != .reopen && check == nil), saveTitle: mode == .close ? "إغلاق" : mode == .cancel ? "إلغاء المشروع" : "إعادة الفتح") {
                Task { await go() }
            }
            .task {
                guard mode != .reopen, check == nil else { return }
                do { check = try await APIClient.shared.closeCheck(projectId) } catch {
                    session.handle(error)
                    self.error = (error as? APIError)?.message ?? APIError.network.message
                }
            }
        }
    }

    private func money(_ title: String, _ halalas: Int) -> some View {
        HStack { Text(title); Spacer(); Text(Fmt.sar(halalas)).monospacedDigit() }
    }

    private func go() async {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if mode != .close && t.count < 3 { error = mode == .cancel ? "اكتب سبب الإلغاء." : "اكتب سبب إعادة الفتح."; return }
        var final: Double?
        if mode != .reopen, let c = check {
            switch settle {
            case .keep: final = nil
            case .received: final = Double(c.received) / 100
            case .custom:
                guard let v = ReceiptRules.riyals(custom), v >= 0 else { error = "القيمة النهائية غير صحيحة."; return }
                guard Int((v * 100).rounded()) >= c.received else { error = "القيمة النهائية أقل من المستلم فعلاً."; return }
                final = v
            }
        }
        guard await Confirm.owner("تأكيد \(title) «\(projectName)»") else { return }
        error = nil
        busy = true
        defer { busy = false }
        do {
            if mode == .reopen {
                try await APIClient.shared.reopenProject(projectId, reason: t)
            } else {
                try await APIClient.shared.closeProject(projectId, cancel: mode == .cancel, text: t, finalRiyals: final, cancelInstalments: cancelInstalments)
            }
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            done(mode == .close ? "أُغلق المشروع" : mode == .cancel ? "أُلغي المشروع" : "أُعيد فتح المشروع")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

// MARK: - «فريق المشروع»

/// ProjectMembers.tsx: who of the team works on this project (they see it even when it is private).
struct ProjectTeamSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let projectId: String
    let done: (String) -> Void

    @State private var people: [Person] = []
    @State private var chosen = Set<String>()
    @State private var original = Set<String>()
    @State private var loaded = false
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            List {
                if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                if !loaded { ProgressView().frame(maxWidth: .infinity) }
                Section {
                    ForEach(people) { p in
                        Button {
                            if chosen.contains(p.id) { chosen.remove(p.id) } else { chosen.insert(p.id) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name).foregroundStyle(Buad.ink)
                                    Text(p.email).font(.caption).foregroundStyle(Buad.muted).environment(\.layoutDirection, .leftToRight)
                                }
                                Spacer()
                                Image(systemName: chosen.contains(p.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(chosen.contains(p.id) ? Buad.accentInk : Buad.faint)
                                    .font(.title3)
                            }
                        }
                    }
                } footer: {
                    Text("أعضاء المشروع يرونه ويعملون عليه حتى لو كان خاصاً.")
                }
            }
            .navigationTitle("فريق المشروع")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: chosen != original, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .task {
                do {
                    async let u = APIClient.shared.teamUsers()
                    async let m = APIClient.shared.projectMembers(projectId)
                    let (users, members) = try await (u, m)
                    people = users
                    chosen = Set(members); original = chosen
                } catch {
                    session.handle(error)
                    self.error = (error as? APIError)?.message ?? APIError.network.message
                }
                loaded = true
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.setProjectMembers(projectId, Array(chosen))
            done("حُفظ فريق المشروع")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}

// MARK: - «إعدادات العقد»

/// ControlCentre.tsx: the contract's number, date and value (lockable), whether the value includes
/// VAT and its rate, and the four deductions — execution fee, marketing (internal or not), cashback,
/// extra fees — each a percentage or a fixed amount, of the net or the gross. Sent as the website sends
/// it (riyals, with the version it started from); the figures of the project follow it.
struct ContractSettingsSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let projectId: String
    let finance: ProjectFinance
    let saved: () -> Void

    @State private var contractNo = ""
    @State private var contractDate: Date?
    @State private var value = ""
    @State private var locked = false
    @State private var vatIncluded = false
    @State private var vatPct = "15"
    @State private var exec = Fee()
    @State private var mkt = Fee()
    @State private var cb = Fee()
    @State private var cf = Fee()
    @State private var mktInternal = false
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline = ""

    struct Fee: Equatable { var v = ""; var type = "pct"; var base = "gross" }

    private var snapshot: String {
        [contractNo, contractDate.map(Fmt.isoDay) ?? "", value, String(locked), String(vatIncluded), vatPct, String(mktInternal)]
            .joined(separator: "|") + [exec, mkt, cb, cf].map { "\($0.v)/\($0.type)/\($0.base)" }.joined(separator: "|")
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    TextField("رقم العقد", text: $contractNo).environment(\.layoutDirection, .leftToRight)
                    OptionalDateRow(title: "تاريخ العقد", date: $contractDate)
                    HStack {
                        Text("قيمة العقد (ر.س)")
                        TextField("0", text: $value).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight).disabled(locked && finance.settings.cvLocked)
                    }
                    Toggle("قفل قيمة العقد", isOn: $locked)
                } footer: {
                    Text("المقفلة لا تتغير حتى تُفتح. المسودة لا تدخل المالية حتى تصبح «جاري التنفيذ».")
                }
                Section {
                    Toggle("القيمة شاملة الضريبة", isOn: $vatIncluded)
                    HStack {
                        Text("نسبة الضريبة %")
                        TextField("15", text: $vatPct).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                feeSection("أتعاب التنفيذ", $exec, footer: "تُحسب من العقد وتدخل دخلاً للشركة.")
                feeSection("التسويق", $mkt, footer: nil)
                Section { Toggle("التسويق داخلي (لا يُخصم من المتاح للتنفيذ)", isOn: $mktInternal) }
                feeSection("كاش باك", $cb, footer: nil)
                feeSection("رسوم إضافية", $cf, footer: "كرسوم المنصات والتحويلات.")
            }
            .navigationTitle("إعدادات العقد")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && snapshot != baseline, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .onAppear(perform: start)
        }
    }

    private func feeSection(_ title: String, _ fee: Binding<Fee>, footer: String?) -> some View {
        Section {
            HStack {
                Text("القيمة")
                TextField("0", text: fee.v).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    .environment(\.layoutDirection, .leftToRight)
            }
            Picker("النوع", selection: fee.type) {
                Text("نسبة %").tag("pct")
                Text("مبلغ ثابت (ر.س)").tag("fixed")
            }
            if fee.wrappedValue.type == "pct" {
                Picker("من", selection: fee.base) {
                    Text("إجمالي العقد").tag("gross")
                    Text("الصافي بعد الضريبة").tag("net")
                }
            }
        } header: { Text(title) } footer: { if let footer { Text(footer) } }
    }

    private func plain(_ v: Double) -> String { v == 0 ? "" : (v == v.rounded() ? String(Int(v)) : String(v)) }

    private func start() {
        guard !started else { return }
        let s = finance.settings
        contractNo = finance.contractNo; contractDate = Fmt.date(finance.contractDate)
        value = s.contractValue > 0 ? EntrySheet.plain(s.contractValue) : ""
        locked = s.cvLocked; vatIncluded = finance.vatIncluded; vatPct = plain(finance.vatPct).isEmpty ? "0" : plain(finance.vatPct)
        exec = Fee(v: plain(s.exec.v), type: s.exec.type, base: s.exec.base)
        mkt = Fee(v: plain(s.mkt.v), type: s.mkt.type, base: s.mkt.base)
        cb = Fee(v: plain(s.cb.v), type: s.cb.type, base: s.cb.base)
        cf = Fee(v: plain(s.cf.v), type: s.cf.type, base: s.cf.base)
        mktInternal = finance.mktInternal
        baseline = snapshot
        started = true
    }

    private func save() async {
        func num(_ t: String) -> Double? { t.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : ReceiptRules.riyals(t) }
        guard let cv = num(value), cv >= 0 else { error = "قيمة العقد غير صحيحة."; return }
        guard let vat = num(vatPct), vat >= 0, vat <= 100 else { error = "نسبة الضريبة بين 0 و100."; return }
        var body: [String: Any] = ["version": finance.settings.version]
        for (key, fee) in [("exec", exec), ("mkt", mkt), ("cb", cb), ("cf", cf)] {
            guard let v = num(fee.v), v >= 0 else { error = "قيمة الرسوم غير صحيحة."; return }
            if fee.type == "pct" && v > 100 { error = "النسبة لا تتجاوز 100%."; return }
            body["\(key)V"] = v; body["\(key)Type"] = fee.type; body["\(key)Base"] = fee.base
        }
        body["contractNo"] = contractNo.trimmingCharacters(in: .whitespaces)
        body["contractDate"] = contractDate.map(Fmt.isoDay) ?? ""
        body["contractValue"] = cv
        body["cvLocked"] = locked
        body["vatIncluded"] = vatIncluded
        body["vatPct"] = vat
        body["mktInternal"] = mktInternal
        guard await Confirm.owner("تأكيد حفظ إعدادات عقد «\(finance.contractNo.isEmpty ? "المشروع" : finance.contractNo)»") else { return }
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.saveContract(projectId, body)
            saved()
            dismiss()
        } catch {
            session.handle(error)
            if case .rejected(let code) = (error as? APIError) ?? .network, code == "stale" {
                self.error = "عُدّلت الإعدادات من مكان آخر. أغلق النافذة واسحب للتحديث."
            } else if case .rejected(let code) = (error as? APIError) ?? .network, code == "cv_locked" {
                self.error = "قيمة العقد مقفلة. ألغِ القفل أولاً لتغييرها."
            } else {
                self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
            }
        }
    }
}
