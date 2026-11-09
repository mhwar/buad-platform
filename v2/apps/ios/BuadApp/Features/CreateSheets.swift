import SwiftUI

// MARK: - «إنشاء»: one place for every new thing

/// What can be created from the Sales «+» or the Clients «+»: an opportunity, an offer, a client.
/// Each is shown only when the role may write it, and every list that shows the new thing refreshes
/// when `revision` moves.
@MainActor
final class CreateCenter: ObservableObject {
    enum Kind: String, Identifiable { case opportunity, quote, client; var id: String { rawValue } }

    @Published var sheet: Kind?
    @Published var revision = 0
    @Published var toast: ToastItem?
    /// What the last thing created was, so the right list comes forward.
    private(set) var lastKind: Kind?

    static func kinds(for me: Me?) -> [Kind] {
        guard let me else { return [] }
        var k: [Kind] = []
        if me.can("sales.edit") { k += [.opportunity, .quote] }
        if me.can("clients.edit") { k.append(.client) }
        return k
    }

    static func title(_ k: Kind) -> String {
        switch k {
        case .opportunity: return "فرصة جديدة"
        case .quote: return "عرض سعر"
        case .client: return "عميل جديد"
        }
    }

    static func subtitle(_ k: Kind) -> String {
        switch k {
        case .opportunity: return "طلب أو جهة مهتمة بخدمة"
        case .quote: return "بنود وأسعار وضريبة، ثم PDF"
        case .client: return "جهة تتعامل معها"
        }
    }

    static func icon(_ k: Kind) -> String {
        switch k {
        case .opportunity: return "scope"
        case .quote: return "doc.text"
        case .client: return "person.crop.circle.badge.plus"
        }
    }

    static func tint(_ k: Kind) -> (Color, Color) {
        switch k {
        case .opportunity: return (Buad.accentSoft, Buad.accentInk)
        case .quote: return (Buad.infoSoft, Buad.infoInk)
        case .client: return (Buad.successSoft, Buad.successInk)
        }
    }

    func done(_ kind: Kind, _ text: String) {
        lastKind = kind
        revision += 1
        toast = ToastItem(text: text)
    }
}

/// The sheet for a `CreateCenter.Kind`, wired back to the centre so lists refresh and a toast shows.
struct CreateSheet: View {
    @EnvironmentObject private var center: CreateCenter
    let kind: CreateCenter.Kind

    var body: some View {
        switch kind {
        case .opportunity:
            NewOpportunitySheet { center.done(.opportunity, "أُضيفت الفرصة") }
        case .quote:
            QuoteEditor { _ in center.done(.quote, "أُنشئ عرض السعر مسودةً. تجده في «العروض».") }
        case .client:
            NewClientSheet { name in center.done(.client, "أُضيف العميل «\(name)»") }
        }
    }
}

// MARK: - Choosing a client

/// A searchable list of the platform's clients; «بلا عميل» clears the choice.
struct ClientPicker: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    var allowNone = true
    let picked: (ClientItem?) -> Void

    @State private var clients: [ClientItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var query = ""

    private var shown: [ClientItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? clients : clients.filter { "\($0.name) \($0.code) \($0.city)".localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            List {
                if allowNone && query.isEmpty {
                    Button { picked(nil); dismiss() } label: {
                        Label("بلا عميل", systemImage: "minus.circle").foregroundStyle(Buad.muted)
                    }
                }
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let error {
                    Text(error).foregroundStyle(Buad.muted)
                } else if shown.isEmpty {
                    Text(clients.isEmpty ? "لا عملاء بعد." : "لا عميل بهذا الاسم.").foregroundStyle(Buad.muted)
                }
                ForEach(shown) { c in
                    Button { picked(c); dismiss() } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.name).foregroundStyle(Buad.ink)
                            Text([Fmt.ltr(c.code), Vocabulary.clientType(c.type), c.city].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(Buad.muted)
                        }
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "ابحث باسم العميل أو رمزه")
            .navigationTitle("اختيار العميل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .task {
                do { clients = try await APIClient.shared.clients() } catch {
                    session.handle(error)
                    self.error = (error as? APIError)?.message ?? APIError.network.message
                }
                loaded = true
            }
        }
    }
}

// MARK: - A new opportunity

/// «فرصة جديدة» (features/sales/NewOpportunityDialog.tsx): for a client already on the platform, a new
/// client made in the same step (after the similar-name check), or contact details only; the service
/// and its package, the expected value, the first follow-up, and what was asked. Assigned to me.
struct NewOpportunitySheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let created: () -> Void

    enum Who: String { case existing, new, contact }
    @State private var who: Who = .new
    @State private var clientId = ""
    @State private var clientName = ""
    @State private var entity = ""
    @State private var name = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var catalog: [CatalogItem] = []
    @State private var service = ""
    @State private var value = ""
    @State private var hasFollowUp = true
    @State private var followUp = Calendar.current.date(byAdding: .day, value: 2, to: Date()) ?? Date()
    @State private var message = ""
    @State private var choosingClient = false
    @State private var similar: String?
    @State private var error: String?
    @State private var busy = false

    private var dirty: Bool {
        !(entity + name + phone + email + value + message + clientId).trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Products, once each (a product can have several packages).
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
                if let similar {
                    Section {
                        Text(APIError.similarName(similar).message).foregroundStyle(Buad.warningInk)
                        Button("نعم، أنشئ عميلاً جديداً") { Task { await save(confirm: true) } }.bold()
                        Button("اختيار العميل الموجود") { who = .existing; self.similar = nil; choosingClient = true }
                    }
                }
                Section {
                    Picker("الجهة", selection: $who.animation()) {
                        Text("عميل جديد").tag(Who.new)
                        Text("عميل حالي").tag(Who.existing)
                        Text("تواصل فقط").tag(Who.contact)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section {
                    switch who {
                    case .existing:
                        Button { choosingClient = true } label: {
                            HStack {
                                Text("العميل").foregroundStyle(Buad.ink)
                                Spacer()
                                Text(clientName.isEmpty ? "اختر" : clientName).foregroundStyle(clientName.isEmpty ? Buad.muted : Buad.accentInk)
                                Chevron()
                            }
                        }
                        TextField("الشخص المسؤول لديهم", text: $name)
                    case .new, .contact:
                        TextField(who == .new ? "اسم الجهة *" : "الجهة", text: $entity)
                        TextField("اسم الشخص", text: $name)
                        TextField("الجوال", text: $phone).keyboardType(.phonePad).environment(\.layoutDirection, .leftToRight)
                        TextField("البريد", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                            .autocorrectionDisabled().environment(\.layoutDirection, .leftToRight)
                    }
                } footer: {
                    switch who {
                    case .new: Text("يُنشأ العميل مع الفرصة، ويُنبَّه إن وُجد اسم مشابه.")
                    case .contact: Text("بلا عميل: أضف جوالاً أو بريداً. يُنشأ العميل لاحقاً عند أول تواصل.")
                    case .existing: Text("تُربط الفرصة بملف العميل وسجل تواصله.")
                    }
                }

                Section("الفرصة") {
                    if !products.isEmpty {
                        Picker("الخدمة", selection: $service) {
                            Text("غير محددة").tag("")
                            ForEach(catalog) { c in Text("\(c.productName) · \(c.packageName)").tag(c.id) }
                        }
                        .onChange(of: service) { _, now in
                            if let c = catalog.first(where: { $0.id == now }), value.isEmpty {
                                value = QuoteView.qty(c.price)
                            }
                        }
                    }
                    HStack {
                        Text("القيمة المتوقعة (ر.س)")
                        TextField("0", text: $value).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    Toggle("موعد المتابعة الأولى", isOn: $hasFollowUp.animation())
                    if hasFollowUp {
                        DatePicker("المتابعة", selection: $followUp, in: Date()..., displayedComponents: .date)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                    }
                    TextField("ماذا طلبوا؟", text: $message, axis: .vertical).lineLimit(2...6)
                }
            }
            .navigationTitle("فرصة جديدة")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: dirty, busy: busy, saveTitle: "إضافة") { Task { await save(confirm: false) } }
            .sheet(isPresented: $choosingClient) {
                ClientPicker(allowNone: false) { c in
                    clientId = c?.id ?? ""
                    clientName = c?.name ?? ""
                }
            }
            .task { catalog = (try? await APIClient.shared.catalog()) ?? [] }
        }
    }

    private func save(confirm: Bool) async {
        error = nil
        let ent = entity.trimmingCharacters(in: .whitespaces)
        let person = name.trimmingCharacters(in: .whitespaces)
        let tel = phone.trimmingCharacters(in: .whitespaces)
        let mail = email.trimmingCharacters(in: .whitespaces)
        switch who {
        case .existing: guard !clientId.isEmpty else { error = "اختر العميل."; return }
        case .new: guard (ent.isEmpty ? person : ent).count >= 2 else { error = "اكتب اسم الجهة."; return }
        case .contact:
            guard (ent.isEmpty ? person : ent).count >= 2 else { error = "اكتب اسم الجهة أو الشخص."; return }
            guard !tel.isEmpty || !mail.isEmpty else { error = "أضف جوالاً أو بريداً للتواصل."; return }
        }
        if !value.trimmingCharacters(in: .whitespaces).isEmpty, ReceiptRules.riyals(value) == nil { error = "القيمة غير صحيحة."; return }
        let c = catalog.first { $0.id == service }
        var body: [String: Any] = [
            "name": person, "entity": who == .existing ? "" : ent, "phone": who == .existing ? "" : tel,
            "email": who == .existing ? "" : mail,
            "message": message.trimmingCharacters(in: .whitespacesAndNewlines),
            "value": ReceiptRules.riyals(value) ?? 0,
            "followUpAt": hasFollowUp ? Fmt.isoDay(followUp) : "",
            "ownerId": session.me?.id ?? "",
            "productId": c?.productId ?? "", "packageId": c?.packageId ?? "",
            "newClient": who == .new, "confirmSimilarName": confirm,
        ]
        if who == .existing { body["clientId"] = clientId }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.createOpportunity(body)
            ScreenMemory.opportunities = nil
            ScreenMemory.salesOverview = nil
            created()
            dismiss()
        } catch let APIError.similarName(n) {
            similar = n
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

// MARK: - A new client

/// «عميل جديد» (features/clients/ClientDialog.tsx, the essentials): name, type, contact and city.
/// The rest of the file (registration, tax number, signatory, logo) is on the client's page on the website.
struct NewClientSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let created: (String) -> Void

    @State private var name = ""
    @State private var type = "company"
    @State private var phone = ""
    @State private var email = ""
    @State private var city = ""
    @State private var contact = ""
    @State private var similar: String?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                if let similar {
                    Section {
                        Text(APIError.similarName(similar).message).foregroundStyle(Buad.warningInk)
                        Button("نعم، أضفه") { Task { await save(confirm: true) } }.bold()
                    }
                }
                Section {
                    TextField("اسم العميل *", text: $name)
                    Picker("النوع", selection: $type) {
                        ForEach(["company", "association", "government", "individual"], id: \.self) { Text(Vocabulary.clientType($0)).tag($0) }
                    }
                    TextField("المدينة", text: $city)
                }
                Section {
                    TextField("اسم جهة الاتصال", text: $contact)
                    TextField("الجوال", text: $phone).keyboardType(.phonePad).environment(\.layoutDirection, .leftToRight)
                    TextField("البريد", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                        .autocorrectionDisabled().environment(\.layoutDirection, .leftToRight)
                } header: {
                    Text("التواصل")
                } footer: {
                    Text("السجل التجاري والرقم الضريبي والمفوّض بالتوقيع تُكمل من صفحة العميل في الموقع.")
                }
            }
            .navigationTitle("عميل جديد")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: !(name + phone + email + city + contact).trimmingCharacters(in: .whitespaces).isEmpty,
                        busy: busy, saveTitle: "إضافة") { Task { await save(confirm: false) } }
        }
    }

    private func save(confirm: Bool) async {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { error = "اكتب اسم العميل."; return }
        let mail = email.trimmingCharacters(in: .whitespaces)
        if !mail.isEmpty && !(mail.contains("@") && mail.contains(".")) { error = "البريد غير صحيح."; return }
        var body: [String: Any] = [
            "name": n, "type": type, "phone": phone.trimmingCharacters(in: .whitespaces), "email": mail,
            "city": city.trimmingCharacters(in: .whitespaces), "confirmSimilarName": confirm,
        ]
        let person = contact.trimmingCharacters(in: .whitespaces)
        if !person.isEmpty {
            body["contacts"] = [["name": person, "title": "", "phone": body["phone"] ?? "", "email": mail]]
        }
        error = nil
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.createClient(body)
            created(n)
            dismiss()
        } catch let APIError.similarName(s) {
            similar = s
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

// MARK: - Editing an opportunity

/// What the opportunity page of the website lets you change besides the stage: who owns it, what it
/// is worth, when to follow up, and the internal notes (PATCH /api/product-requests/:id).
struct OpportunityEditSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let opportunity: Opportunity
    let saved: () -> Void

    @State private var owner = ""
    @State private var value = ""
    @State private var follow: Date?
    @State private var notes = ""
    @State private var people: [Person] = []
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline: [String] = []

    private var snapshot: [String] { [owner, value.trimmingCharacters(in: .whitespaces), follow.map(Fmt.isoDay) ?? "", notes] }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Picker("المسؤول", selection: $owner) {
                        Text("غير مسند").tag("")
                        ForEach(people) { Text($0.name).tag($0.id) }
                    }
                    HStack {
                        Text("القيمة المتوقعة (ر.س)")
                        TextField("0", text: $value).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    OptionalDateRow(title: "موعد المتابعة", date: $follow)
                    if follow != nil {
                        HStack(spacing: 8) {
                            ForEach([("غداً", 1), ("بعد غد", 2), ("أسبوع", 7)], id: \.1) { label, d in
                                Button(label) { follow = Calendar.current.date(byAdding: .day, value: d, to: Date()) }
                                    .buttonStyle(.bordered).tint(Buad.ink)
                            }
                        }
                    }
                }
                Section("ملاحظات داخلية") {
                    TextField("ملاحظات", text: $notes, axis: .vertical).lineLimit(3...8)
                }
            }
            .navigationTitle("تعديل الفرصة")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && snapshot != baseline, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .task {
                if !started {
                    owner = opportunity.ownerId
                    value = opportunity.value > 0 ? EntrySheet.plain(opportunity.value) : ""
                    follow = Fmt.date(opportunity.followUpAt)
                    notes = opportunity.notes
                    baseline = snapshot
                    started = true
                }
                people = (try? await APIClient.shared.assignees()) ?? []
            }
        }
    }

    private func save() async {
        var fields: [String: Any] = [:]
        let now = snapshot
        if now[0] != baseline[0] { fields["ownerId"] = owner }
        if now[1] != baseline[1] {
            guard value.trimmingCharacters(in: .whitespaces).isEmpty || ReceiptRules.riyals(value) != nil else { error = "القيمة غير صحيحة."; return }
            fields["value"] = ReceiptRules.riyals(value) ?? 0
        }
        if now[2] != baseline[2] { fields["followUpAt"] = follow.map(Fmt.isoDay) ?? "" }
        if now[3] != baseline[3] { fields["notes"] = notes.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard !fields.isEmpty else { dismiss(); return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.updateOpportunity(opportunity.id, fields)
            ScreenMemory.opportunities = nil
            ScreenMemory.salesOverview = nil
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}
