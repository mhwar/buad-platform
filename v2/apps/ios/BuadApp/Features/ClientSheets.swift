import SwiftUI

/// «تعديل بيانات العميل» (features/clients/ClientDialog.tsx): name, type, city, phone, e-mail, commercial
/// register, tax number, national address, website and notes. Only what changed is sent
/// (PATCH /api/clients/:id); a name close to another client's asks before it is kept.
struct ClientEditSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let client: ClientItem
    let detail: ClientDetail?
    let saved: () -> Void

    @State private var name = ""
    @State private var type = "company"
    @State private var city = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var regNo = ""
    @State private var taxNo = ""
    @State private var address = ""
    @State private var website = ""
    @State private var notes = ""
    @State private var sigName = ""
    @State private var sigTitle = ""
    @State private var contacts: [ContactRow] = []
    @State private var similar: String?
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline: [String: String] = [:]

    /// One contact person being edited.
    struct ContactRow: Identifiable {
        let id = UUID()
        var name = ""
        var title = ""
        var phone = ""
        var email = ""
        var isSignatory = false
        var json: [String: Any] {
            ["name": name.trimmingCharacters(in: .whitespaces), "title": title.trimmingCharacters(in: .whitespaces),
             "phone": phone.trimmingCharacters(in: .whitespaces), "email": email.trimmingCharacters(in: .whitespaces), "isSignatory": isSignatory]
        }
    }

    private var contactsKey: String {
        contacts.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { "\($0.name)/\($0.title)/\($0.phone)/\($0.email)/\($0.isSignatory)" }.joined(separator: "|")
    }

    private var fields: [String: String] {
        ["name": name.trimmingCharacters(in: .whitespaces), "type": type, "city": city.trimmingCharacters(in: .whitespaces),
         "phone": phone.trimmingCharacters(in: .whitespaces), "email": email.trimmingCharacters(in: .whitespaces),
         "regNo": regNo.trimmingCharacters(in: .whitespaces), "taxNo": taxNo.trimmingCharacters(in: .whitespaces),
         "address": address.trimmingCharacters(in: .whitespaces), "website": website.trimmingCharacters(in: .whitespaces),
         "notes": notes.trimmingCharacters(in: .whitespacesAndNewlines),
         "signatoryName": sigName.trimmingCharacters(in: .whitespaces), "signatoryTitle": sigTitle.trimmingCharacters(in: .whitespaces),
         "contacts": contactsKey]
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
                        Button("نعم، احفظ الاسم") { Task { await save(confirm: true) } }.bold()
                    }
                }
                Section {
                    TextField("اسم العميل *", text: $name)
                    Picker("النوع", selection: $type) {
                        ForEach(["company", "association", "government", "individual"], id: \.self) { Text(Vocabulary.clientType($0)).tag($0) }
                    }
                    TextField("المدينة", text: $city)
                }
                Section("التواصل") {
                    TextField("الجوال", text: $phone).keyboardType(.phonePad).environment(\.layoutDirection, .leftToRight)
                    TextField("البريد", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                        .autocorrectionDisabled().environment(\.layoutDirection, .leftToRight)
                    TextField("الموقع الإلكتروني", text: $website).keyboardType(.URL).textInputAutocapitalization(.never)
                        .autocorrectionDisabled().environment(\.layoutDirection, .leftToRight)
                    TextField("العنوان الوطني", text: $address, axis: .vertical)
                }
                Section {
                    TextField("السجل التجاري", text: $regNo).environment(\.layoutDirection, .leftToRight)
                    TextField("الرقم الضريبي", text: $taxNo).keyboardType(.numberPad).environment(\.layoutDirection, .leftToRight)
                } header: { Text("البيانات النظامية") } footer: {
                    Text("تُملأ منها العقود والفواتير. لا يتكرر السجل أو الرقم الضريبي بين عميلين.")
                }
                Section {
                    TextField("اسم الممثل المفوّض بالتوقيع", text: $sigName)
                    TextField("صفته", text: $sigTitle)
                } header: { Text("المفوّض بالتوقيع") } footer: { Text("يُملأ منه الطرف الثاني في العقود.") }
                Section {
                    ForEach($contacts) { $c in
                        VStack(alignment: .leading, spacing: 8) {
                            TextField("الاسم", text: $c.name)
                            TextField("الصفة", text: $c.title)
                            TextField("الجوال", text: $c.phone).keyboardType(.phonePad).environment(\.layoutDirection, .leftToRight)
                            TextField("البريد", text: $c.email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                                .autocorrectionDisabled().environment(\.layoutDirection, .leftToRight)
                            Toggle("مفوّض بالتوقيع", isOn: $c.isSignatory)
                        }
                        .padding(.vertical, 4)
                    }
                    .onDelete { contacts.remove(atOffsets: $0) }
                    if contacts.count < 20 { Button { contacts.append(ContactRow()) } label: { Label("إضافة جهة اتصال", systemImage: "plus") } }
                } header: { Text("جهات الاتصال") } footer: { Text("اسحب الجهة لليسار لحذفها.") }
                Section("ملاحظات") { TextField("ملاحظات", text: $notes, axis: .vertical).lineLimit(3...8) }
            }
            .navigationTitle("تعديل العميل")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && fields != baseline, busy: busy, saveTitle: "حفظ") { Task { await save(confirm: false) } }
            .onAppear(perform: start)
        }
    }

    private func start() {
        guard !started else { return }
        name = client.name; type = client.type.isEmpty ? "company" : client.type; city = client.city
        phone = client.phone; email = client.email
        regNo = detail?.regNo ?? ""; taxNo = detail?.taxNo ?? ""; address = detail?.address ?? ""
        website = detail?.website ?? ""; notes = detail?.notes ?? ""
        sigName = detail?.signatoryName ?? ""; sigTitle = detail?.signatoryTitle ?? ""
        contacts = (detail?.contacts ?? []).map { ContactRow(name: $0.name, title: $0.title, phone: $0.phone, email: $0.email, isSignatory: $0.isSignatory) }
        baseline = fields
        started = true
    }

    private func save(confirm: Bool) async {
        let f = fields
        guard !f["name"]!.isEmpty else { error = "اكتب اسم العميل."; return }
        let mail = f["email"]!
        if !mail.isEmpty && !(mail.contains("@") && mail.contains(".")) { error = "البريد غير صحيح."; return }
        var body: [String: Any] = [:]
        for (k, v) in f where v != baseline[k] && k != "contacts" { body[k] = v }
        if f["contacts"] != baseline["contacts"] {
            body["contacts"] = contacts.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }.map(\.json)
        }
        guard !body.isEmpty else { dismiss(); return }
        body["confirmSimilarName"] = confirm
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.updateClient(client.id, body)
            saved()
            dismiss()
        } catch let APIError.similarName(n) {
            similar = n
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

/// «تسجيل تواصل» for a client (ClientCrm.tsx): what kind, what was said, and — optionally — when to
/// come back to them. It lands in the client's contact record.
struct ClientContactSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let client: ClientItem
    let saved: () -> Void

    @State private var type = "call"
    @State private var summary = ""
    @State private var next: Date?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Picker("النوع", selection: $type) {
                        ForEach(Sales.activityTypes, id: \.self) { Text(Sales.activity($0).label).tag($0) }
                    }
                    TextField("ماذا تم؟ *", text: $summary, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    OptionalDateRow(title: "المتابعة التالية", date: $next)
                } footer: { Text(client.name) }
            }
            .navigationTitle("تسجيل تواصل")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: !summary.isEmpty, busy: busy, saveTitle: "تسجيل") { Task { await save() } }
        }
    }

    private func save() async {
        let t = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "اكتب ما تم في التواصل."; return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.logClientActivity(client.id, type: type, summary: t)
            if let next { try await APIClient.shared.updateClientFollowUp(client.id, Fmt.isoDay(next)) }
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر التسجيل"
        }
    }
}

// MARK: - Relationship management

/// «إدارة العلاقة» (ClientCrm.tsx): the relationship the platform works out (active, prospect…), who
/// owns the client, where it came from, its tags, when to contact it next and when it last was —
/// and the contact log, newest first, from which an entry can be removed.
struct ClientCRMCard: View {
    @EnvironmentObject private var session: Session
    let client: ClientItem
    /// Changes when something was logged elsewhere, so the log reloads.
    var refresh = 0

    @State private var crm: ClientCRM?
    @State private var editing = false
    @State private var error: String?
    @State private var removing: ClientActivity?

    private var canEdit: Bool { session.me?.can("clients.edit") ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card {
                HStack {
                    Text("إدارة العلاقة").font(.headline)
                    Spacer()
                    if canEdit && crm != nil {
                        Button { editing = true } label: { Label("تعديل", systemImage: "pencil").font(.subheadline.weight(.medium)) }
                            .frame(minHeight: Buad.tap)
                    }
                }
                if let c = crm {
                    let rel = Vocabulary.relationship(c.relationship)
                    HStack { Text("العلاقة").foregroundStyle(Buad.muted); Spacer(); Pill(text: rel.label, tone: rel.tone) }.font(.subheadline)
                    row("المسؤول", c.ownerName.isEmpty ? "غير مسند" : c.ownerName)
                    row("المصدر", c.source.isEmpty ? "غير محدد" : Sales.source(c.source))
                    if !c.tags.isEmpty {
                        HStack(alignment: .firstTextBaseline) {
                            Text("الوسوم").foregroundStyle(Buad.muted)
                            Spacer()
                            Text(c.tags.joined(separator: "، ")).foregroundStyle(Buad.ink).multilineTextAlignment(.trailing)
                        }
                        .font(.subheadline)
                    }
                    row("المتابعة التالية", c.nextFollowUpAt.isEmpty ? "غير محددة" : Fmt.day(c.nextFollowUpAt))
                    row("آخر تواصل", c.lastContactAt > 0 ? Fmt.epochDay(c.lastContactAt) : "لا تواصل مسجّل")
                } else if let error {
                    Text(error).font(.footnote).foregroundStyle(Buad.muted)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            if let c = crm {
                Text("سجل التواصل").font(.headline)
                if c.activities.isEmpty {
                    EmptyNote(text: "لم يُسجَّل تواصل مع هذا العميل بعد.", icon: "bubble.left.and.bubble.right")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(c.activities.prefix(30).enumerated()), id: \.element.id) { i, a in
                            if i > 0 { Divider().padding(.leading, 56) }
                            activity(a)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }
            }
        }
        .task(id: refresh) { await load() }
        .sheet(isPresented: $editing) {
            if let c = crm { ClientCRMEditSheet(client: client, crm: c) { Task { await load() } } }
        }
        .confirmationDialog("حذف هذا التواصل من السجل؟", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { a in
            Button("حذف", role: .destructive) { Task { await remove(a) } }
            Button("إلغاء", role: .cancel) {}
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Buad.muted)
            Spacer()
            Text(value).foregroundStyle(Buad.ink).multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
    }

    private func activity(_ a: ClientActivity) -> some View {
        let kind = Sales.activity(a.type)
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: kind.icon).font(.caption.weight(.semibold))
                .frame(width: 32, height: 32).background(Buad.brandSoft, in: Circle()).foregroundStyle(Buad.ink)
            VStack(alignment: .leading, spacing: 3) {
                Text(a.summary).font(.subheadline).foregroundStyle(Buad.ink).lineLimit(5).multilineTextAlignment(.leading)
                Text([kind.label, Fmt.epochDay(a.at), a.createdByName].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Buad.muted)
            }
            Spacer(minLength: 0)
            if canEdit {
                Button { removing = a } label: {
                    Image(systemName: "trash").font(.caption).foregroundStyle(Buad.faint).frame(width: 36, height: Buad.tap).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("حذف التواصل")
            }
        }
        .padding(12)
    }

    private func load() async {
        do { crm = try await APIClient.shared.crm(client.id); error = nil } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }

    private func remove(_ a: ClientActivity) async {
        do { try await APIClient.shared.deleteActivity(a.id); await load() } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }
}

/// Owner, source, tags and next follow-up of a client (PATCH /api/crm/clients/:id).
struct ClientCRMEditSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let client: ClientItem
    let crm: ClientCRM
    let saved: () -> Void

    @State private var owner = ""
    @State private var source = ""
    @State private var tags = ""
    @State private var next: Date?
    @State private var people: [Person] = []
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline = ""

    private var snapshot: String { [owner, source, tags, next.map(Fmt.isoDay) ?? ""].joined(separator: "|") }

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
                    Picker("المصدر", selection: $source) {
                        Text("غير محدد").tag("")
                        ForEach(["site", "referral", "event", "call", "social", "other"], id: \.self) { Text(Sales.source($0)).tag($0) }
                    }
                    OptionalDateRow(title: "المتابعة التالية", date: $next)
                }
                Section {
                    TextField("وسوم مفصولة بفاصلة", text: $tags, axis: .vertical)
                } header: { Text("الوسوم") } footer: { Text("مثلاً: مهم، حكومي، شريك. حتى 20 وسماً.") }
            }
            .navigationTitle(client.name)
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && snapshot != baseline, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .task {
                if !started {
                    owner = crm.ownerId; source = crm.source; tags = crm.tags.joined(separator: "، "); next = Fmt.date(crm.nextFollowUpAt)
                    baseline = snapshot
                    started = true
                }
                people = (try? await APIClient.shared.assignees()) ?? []
            }
        }
    }

    private func save() async {
        let list = tags.split(whereSeparator: { "،,".contains($0) }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard list.count <= 20, list.allSatisfy({ $0.count <= 40 }) else { error = "حتى 20 وسماً، وكل وسم حتى 40 حرفاً."; return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.updateCRM(client.id, ["ownerId": owner, "source": source, "tags": list, "nextFollowUpAt": next.map(Fmt.isoDay) ?? ""])
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}

/// The client's opportunities, newest first, each opening its page (ClientOpportunities.tsx).
struct ClientOpportunitiesCard: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    let clientId: String
    var refresh = 0
    @State private var items: [Opportunity] = []
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if session.me?.can("sales.view") == true, !loaded || !items.isEmpty {
                Text("الفرص").font(.headline)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(items.prefix(8).enumerated()), id: \.element.id) { i, o in
                            if i > 0 { Divider().padding(.leading, 14) }
                            Button { nav.open("/sales/\(o.id)") } label: {
                                let st = Sales.stage(o.status)
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(o.productName.isEmpty ? (o.entity.isEmpty ? o.name : o.entity) : o.productName).font(.subheadline.weight(.medium)).foregroundStyle(Buad.ink).lineLimit(1)
                                        Text([Fmt.epochDay(o.createdAt), o.value > 0 ? Fmt.short(o.value) + " ر.س" : ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                            .font(.caption).foregroundStyle(Buad.muted)
                                    }
                                    Spacer()
                                    Pill(text: st.label, tone: st.tone)
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
        }
        .task(id: refresh) { await load() }
    }

    private func load() async {
        guard session.me?.can("sales.view") == true else { return }
        if let all = try? await APIClient.shared.opportunities() {
            items = all.filter { $0.clientId == clientId }.sorted { $0.createdAt > $1.createdAt }
        }
        loaded = true
    }
}
