import SwiftUI

// 0.2.5: the project's money forms, each the website's own dialog and call.
//   ReceiptFormSheet  — «تسجيل مقبوض» with a free amount / «تعديل مقبوض» (features/finance/Receipts.tsx)
//   ScheduleLineSheet — «دفعة منتظرة» (features/receivables/ScheduleCard.tsx)
//   InvoiceSheet      — «تسجيل فاتورة ضريبية مرسلة» (features/finance/SalesInvoices.tsx)
// Every save or delete is confirmed with Face ID; the server decides with the role's permissions.

/// A riyal field's text for a halala amount: 1250000 → «12500», 1250050 → «12500.5».
private func plain(_ halalas: Int) -> String { EntrySheet.plain(halalas) }

private struct AmountField: View {
    let title: String
    @Binding var text: String
    var placeholder = "0"

    var body: some View {
        HStack {
            Text(title)
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .environment(\.layoutDirection, .leftToRight)
        }
    }
}

private struct SaveButton: View {
    let title: String
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Spacer()
                if busy { ProgressView() } else { Label(title, systemImage: "faceid").bold() }
                Spacer()
            }
        }
        .disabled(busy)
    }
}

// MARK: - Receipt

struct ReceiptFormSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    let projectId: String
    let receipt: Receipt?
    /// What is still owed on the contract (halalas), to prefill a new receipt.
    let remaining: Int
    let contractDate: String
    let saved: (ProjectFinance, String) -> Void

    @State private var date = Date()
    @State private var amount = ""
    @State private var refund = false
    @State private var note = ""
    @State private var error: String?
    @State private var busy = false
    @State private var overContract: (received: Int, gross: Int)?
    @State private var askOver = false
    @State private var confirmDelete = false
    @State private var started = false

    private var iso: String { Fmt.isoDay(date) }

    var body: some View {
        NavigationStack {
            Form {
                if let r = receipt, !r.approved {
                    Section {
                        Text("هذا المقبوض غير معتمد، فلا يُحتسب في أي رقم. اعتمدوه إن كان دفعة فعلية، أو احذفوه إن كان مكرراً.")
                            .font(.footnote).foregroundStyle(Buad.warningInk)
                    }
                }
                Section {
                    DatePicker("تاريخ وصوله للبنك", selection: $date, displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    AmountField(title: "المبلغ (ر.س)", text: $amount)
                    Toggle("استرجاع للعميل (يُخصم من المستلم)", isOn: $refund)
                    TextField("ملاحظة", text: $note, prompt: Text("الدفعة الأولى…"), axis: .vertical)
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("يقع هذا الاستلام في \(ReceiptRules.quarterLabel(iso))").bold()
                        Text("يحدد ربع السنة الذي يتحقق فيه ربحه.")
                        ForEach(ReceiptRules.warnings(date: iso, contractDate: contractDate, today: Fmt.todayISO), id: \.self) {
                            Text("⚠ \($0)").foregroundStyle(Buad.warningInk)
                        }
                    }
                    .font(.footnote)
                }
                if let error { Section { Text(error).foregroundStyle(Buad.dangerInk) } }
                Section {
                    if let r = receipt, !r.approved {
                        SaveButton(title: "اعتماد", busy: busy) { Task { await approve() } }
                    }
                    SaveButton(title: receipt == nil ? "تسجيل المقبوض" : "حفظ", busy: busy) { Task { await save(confirmOver: false) } }
                    if receipt != nil {
                        Button(role: .destructive) { confirmDelete = true } label: { HStack { Spacer(); Text("حذف"); Spacer() } }
                            .disabled(busy)
                    }
                }
            }
            .navigationTitle(receipt == nil ? "تسجيل مقبوض" : "تعديل مقبوض")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .interactiveDismissDisabled(busy)
            .alert("المبلغ يتجاوز قيمة العقد", isPresented: $askOver, presenting: overContract) { _ in
                Button("تسجيله رغم ذلك") { Task { await save(confirmOver: true) } }
                Button("إلغاء", role: .cancel) {}
            } message: { o in
                Text(APIError.overContract(received: o.received, gross: o.gross).message)
            }
            .confirmationDialog("حذف هذا المقبوض؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف", role: .destructive) { Task { await remove() } }
                Button("إلغاء", role: .cancel) {}
            }
            .onAppear(perform: start)
        }
    }

    private func start() {
        guard !started else { return }
        started = true
        if let r = receipt {
            date = Fmt.date(r.date) ?? Date()
            amount = plain(abs(r.amount))
            refund = r.amount < 0
            note = r.note
        } else if remaining > 0 {
            amount = plain(remaining)
        }
    }

    private func save(confirmOver: Bool) async {
        guard let n = ReceiptRules.riyals(amount), n > 0 else { error = "أدخلوا التاريخ والمبلغ"; return }
        let riyals = ((refund ? -n : n) * 100).rounded() / 100
        if !confirmOver {
            guard await Confirm.owner("تأكيد \(refund ? "استرجاع" : "مقبوض") بمبلغ \(Fmt.sar(Int((n * 100).rounded())))") else { return }
        }
        busy = true
        defer { busy = false }
        do {
            let fin: ProjectFinance
            if let r = receipt {
                fin = try await APIClient.shared.updateReceipt(projectId, r.id, date: iso, riyals: riyals, note: note)
            } else {
                fin = try await APIClient.shared.addReceipt(projectId, date: iso, riyals: riyals, note: note, confirmOver: confirmOver)
            }
            saved(fin, receipt == nil ? "سُجّل المقبوض" : "حُفظ المقبوض")
            dismiss()
        } catch let APIError.overContract(received, gross) {
            overContract = (received, gross)
            askOver = true
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func approve() async {
        guard let r = receipt, await Confirm.owner("تأكيد اعتماد مقبوض بمبلغ \(Fmt.sar(abs(r.amount)))") else { return }
        busy = true
        defer { busy = false }
        do {
            saved(try await APIClient.shared.approveReceipt(projectId, r.id), "اعتُمد المقبوض")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الاعتماد"
        }
    }

    private func remove() async {
        guard let r = receipt, await Confirm.owner("تأكيد حذف مقبوض بمبلغ \(Fmt.sar(abs(r.amount)))") else { return }
        busy = true
        defer { busy = false }
        do {
            saved(try await APIClient.shared.deleteReceipt(projectId, r.id), "حُذف المقبوض")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }
}

// MARK: - Payment schedule line

struct ScheduleLineSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    let projectId: String
    let saved: (String) -> Void

    @State private var label = ""
    @State private var dueDate = Date()
    @State private var amount = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("الوصف", text: $label, prompt: Text("مثال: الدفعة الأولى"))
                    DatePicker("تاريخ الاستحقاق", selection: $dueDate, displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    AmountField(title: "المبلغ شامل الضريبة (ر.س)", text: $amount)
                } footer: {
                    Text("أضف الدفعات المنتظرة من العميل لتتابعها وتظهر أعمارها.")
                }
                if let error { Section { Text(error).foregroundStyle(Buad.dangerInk) } }
                Section { SaveButton(title: "إضافة الدفعة", busy: busy) { Task { await save() } } }
            }
            .navigationTitle("دفعة منتظرة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .interactiveDismissDisabled(busy)
        }
    }

    private func save() async {
        let text = label.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { error = "أدخلوا الوصف."; return }
        guard let n = ReceiptRules.riyals(amount), n > 0 else { error = "أدخلوا المبلغ."; return }
        guard await Confirm.owner("تأكيد إضافة دفعة «\(text)» بمبلغ \(Fmt.sar(Int((n * 100).rounded())))") else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.addScheduleLine(projectId, label: text, dueDate: Fmt.isoDay(dueDate), riyals: (n * 100).rounded() / 100)
            saved("أُضيفت الدفعة")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}

// MARK: - Sales tax invoice

struct InvoiceSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    let projectId: String
    let invoice: SalesInvoice?
    let receipts: [Receipt]
    let saved: (String) -> Void

    @State private var number = ""
    @State private var date = Date()
    @State private var amount = ""
    @State private var vat = ""
    @State private var receiptId = ""
    @State private var assetId = ""
    @State private var note = ""
    @State private var error: String?
    @State private var busy = false
    @State private var confirmDelete = false
    @State private var started = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("رقم الفاتورة", text: $number).environment(\.layoutDirection, .leftToRight)
                    DatePicker("تاريخ الفاتورة", selection: $date, displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    AmountField(title: "المبلغ شامل الضريبة (ر.س)", text: $amount)
                    AmountField(title: "الضريبة (ر.س)", text: $vat, placeholder: "تلقائي")
                    Picker("سُدِّدت بالاستلام", selection: $receiptId) {
                        Text("—").tag("")
                        ForEach(receipts.filter { $0.amount > 0 }) { r in
                            Text("\(Fmt.day(r.date)) · \(Fmt.sar(r.amount))").tag(r.id)
                        }
                    }
                    TextField("ملاحظة", text: $note, axis: .vertical)
                } footer: {
                    Text("تاريخ الفاتورة يحدد ربع ضريبة المبيعات. الضريبة فارغة = تُحسب بنسبة المشروع.")
                }
                Section("الفاتورة المرسلة (PDF أو صورة)") {
                    AttachmentField(assetId: $assetId, canUpload: session.me?.can("assets.edit") ?? false)
                }
                if let error { Section { Text(error).foregroundStyle(Buad.dangerInk) } }
                Section {
                    SaveButton(title: invoice == nil ? "تسجيل الفاتورة" : "حفظ", busy: busy) { Task { await save() } }
                    if invoice != nil {
                        Button(role: .destructive) { confirmDelete = true } label: { HStack { Spacer(); Text("حذف الفاتورة"); Spacer() } }
                            .disabled(busy)
                    }
                }
            }
            .navigationTitle(invoice == nil ? "تسجيل فاتورة ضريبية مرسلة" : "تعديل الفاتورة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .interactiveDismissDisabled(busy)
            .confirmationDialog("حذف هذه الفاتورة؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف", role: .destructive) { Task { await remove() } }
                Button("إلغاء", role: .cancel) {}
            }
            .onAppear(perform: start)
        }
    }

    private func start() {
        guard !started, let i = invoice else { started = true; return }
        started = true
        number = i.number
        date = Fmt.date(i.date) ?? Date()
        amount = plain(i.amount)
        vat = plain(i.vat)
        receiptId = i.receiptId
        assetId = i.assetId
        note = i.note
    }

    private func save() async {
        guard let n = ReceiptRules.riyals(amount), n > 0 else { error = "أدخلوا المبلغ."; return }
        var v: Double?
        if !vat.trimmingCharacters(in: .whitespaces).isEmpty {
            guard let x = ReceiptRules.riyals(vat), x >= 0 else { error = "الضريبة غير صحيحة."; return }
            v = (x * 100).rounded() / 100
        }
        guard await Confirm.owner("تأكيد فاتورة ضريبية بمبلغ \(Fmt.sar(Int((n * 100).rounded())))") else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.saveSalesInvoice(id: invoice?.id, projectId: projectId, number: number.trimmingCharacters(in: .whitespaces),
                                                        date: Fmt.isoDay(date), riyals: (n * 100).rounded() / 100, vat: v,
                                                        receiptId: receiptId, assetId: assetId,
                                                        note: note.trimmingCharacters(in: .whitespacesAndNewlines))
            saved(invoice == nil ? "سُجّلت الفاتورة" : "حُفظت الفاتورة")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func remove() async {
        guard let i = invoice, await Confirm.owner("تأكيد حذف الفاتورة \(i.number)") else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.deleteSalesInvoice(i.id)
            saved("حُذفت الفاتورة")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }
}
