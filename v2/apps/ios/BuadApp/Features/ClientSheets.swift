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
    @State private var similar: String?
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline: [String: String] = [:]

    private var fields: [String: String] {
        ["name": name.trimmingCharacters(in: .whitespaces), "type": type, "city": city.trimmingCharacters(in: .whitespaces),
         "phone": phone.trimmingCharacters(in: .whitespaces), "email": email.trimmingCharacters(in: .whitespaces),
         "regNo": regNo.trimmingCharacters(in: .whitespaces), "taxNo": taxNo.trimmingCharacters(in: .whitespaces),
         "address": address.trimmingCharacters(in: .whitespaces), "website": website.trimmingCharacters(in: .whitespaces),
         "notes": notes.trimmingCharacters(in: .whitespacesAndNewlines)]
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
        baseline = fields
        started = true
    }

    private func save(confirm: Bool) async {
        let f = fields
        guard !f["name"]!.isEmpty else { error = "اكتب اسم العميل."; return }
        let mail = f["email"]!
        if !mail.isEmpty && !(mail.contains("@") && mail.contains(".")) { error = "البريد غير صحيح."; return }
        var body: [String: Any] = [:]
        for (k, v) in f where v != baseline[k] { body[k] = v }
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
