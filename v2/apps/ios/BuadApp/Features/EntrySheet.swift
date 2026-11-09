import SwiftUI

/// «إضافة قيد مالي» / «تعديل القيد» (features/finance/EntryDialog.tsx «بند جديد»), same fields and
/// wording: type, description, category (built-in, custom, budget rows), «ما هذا البند؟» for «cf»,
/// amount, date, status, «له فاتورة ضريبية» for an expense, and a note. Sent as the website sends
/// it (riyals); the server answers with the project's whole finance, which replaces what is shown.
/// Confirmed with Face ID. The «من الاتفاقية» tab and the profit margin stay on the website.
struct EntrySheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    let projectId: String
    let projectName: String
    let finance: ProjectFinance
    let existing: FinanceEntry?
    let saved: (ProjectFinance, String) -> Void

    @State private var type = "expense"
    @State private var description = ""
    @State private var cat = "other"
    @State private var cfKind = ""
    @State private var amount = ""
    @State private var date = Date()
    @State private var status = ""
    @State private var note = ""
    @State private var hasInvoice = false
    @State private var supplierName = ""
    @State private var supplierVatNo = ""
    @State private var invoiceNo = ""
    @State private var invoiceDate = Date()
    @State private var vatAmount = ""
    @State private var error: String?
    @State private var busy = false
    @State private var confirmDelete = false
    @State private var started = false

    private static let builtIn = ["salary", "logistics", "materials", "other", "exec", "mkt", "cashback", "cf", "vat"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("النوع", selection: $type) {
                        Text("مصروف").tag("expense")
                        Text("دخل").tag("income")
                    }
                    .pickerStyle(.segmented)
                    TextField("الوصف *", text: $description, axis: .vertical)
                    HStack {
                        Text("المبلغ (ر.س) *")
                        TextField("0", text: $amount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    DatePicker("التاريخ", selection: $date, displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                }

                Section {
                    Picker("التصنيف", selection: $cat) {
                        // VAT paid to ZATCA is not a project cost: kept only on entries that already use it.
                        ForEach(Self.builtIn.filter { $0 != "vat" || existing?.cat == "vat" }, id: \.self) {
                            Text(Vocabulary.entryCategory[$0] ?? $0).tag($0)
                        }
                        if !finance.customCategories.isEmpty {
                            Section("تصنيفات مخصصة") {
                                ForEach(finance.customCategories) { Text($0.label).tag($0.id) }
                            }
                        }
                        if !finance.budgetItems.isEmpty {
                            Section("بنود الميزانية") {
                                ForEach(finance.budgetItems) { Text($0.label.isEmpty ? "بند ميزانية" : $0.label).tag("bdg_\($0.id)") }
                            }
                        }
                    }
                    if cat == "cf" {
                        Picker("ما هذا البند؟", selection: $cfKind) {
                            Text("لم يُحدد بعد").tag("")
                            Text("ضريبة العقد المحجوزة للهيئة").tag("vat")
                            Text("رسوم فعلية (منصات، تحويلات…)").tag("fee")
                        }
                    }
                    Picker("الحالة", selection: $status) {
                        Text("—").tag("")
                        Text("مدفوع").tag("paid")
                        Text("معلق").tag("pending")
                        Text("ملغي").tag("cancelled")
                    }
                } footer: {
                    if cat == "cf" { Text("ضريبة العقد المحجوزة للهيئة تظهر في صفحة الضريبة، ولا تُعدّ تكلفة") }
                }

                if type == "expense" {
                    Section {
                        Toggle("له فاتورة ضريبية", isOn: $hasInvoice.animation())
                        if hasInvoice {
                            TextField("اسم المورد", text: $supplierName)
                            TextField("الرقم الضريبي للمورد", text: $supplierVatNo)
                                .keyboardType(.numberPad)
                                .environment(\.layoutDirection, .leftToRight)
                            TextField("رقم الفاتورة", text: $invoiceNo)
                                .environment(\.layoutDirection, .leftToRight)
                            DatePicker("تاريخ الفاتورة", selection: $invoiceDate, displayedComponents: .date)
                                .environment(\.calendar, Calendar(identifier: .gregorian))
                            HStack {
                                Text("مبلغ الضريبة (ر.س)")
                                TextField("تلقائي", text: $vatAmount)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .environment(\.layoutDirection, .leftToRight)
                            }
                        }
                    } footer: {
                        if hasInvoice {
                            Text("الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3. تاريخ الفاتورة يحدد ربع الضريبة. اتركوا مبلغ الضريبة فارغاً ليحسبه الخادم من المبلغ الشامل بنسبة الجهة.")
                        } else {
                            Text("بفاتورة ضريبية تدخل ضريبتها تلقائياً في إقرار ربع تاريخ الفاتورة ضمن «ضريبة المشتريات».")
                        }
                    }
                }

                Section {
                    TextField("ملاحظة", text: $note, axis: .vertical).lineLimit(2...5)
                }

                if let error {
                    Section { Text(error).foregroundStyle(Buad.dangerInk) }
                }

                Section {
                    Button { Task { await save() } } label: {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Label(existing == nil ? "إضافة القيد" : "حفظ التعديل", systemImage: "faceid").bold() }
                            Spacer()
                        }
                    }
                    .disabled(busy)
                    if existing != nil {
                        Button(role: .destructive) { confirmDelete = true } label: {
                            HStack { Spacer(); Text("حذف القيد"); Spacer() }
                        }
                        .disabled(busy)
                    }
                }
            }
            .navigationTitle((existing == nil ? "إضافة قيد مالي" : "تعديل القيد") + " · " + projectName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .interactiveDismissDisabled(busy)
            .confirmationDialog("حذف هذا القيد؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف القيد", role: .destructive) { Task { await remove() } }
                Button("إلغاء", role: .cancel) {}
            }
            .onAppear(perform: start)
        }
    }

    private func start() {
        guard !started else { return }
        started = true
        guard let e = existing else { return }
        type = e.type
        description = e.description
        cat = e.cat
        cfKind = e.cfKind
        amount = Self.plain(e.amount)
        date = Fmt.date(e.date) ?? Date()
        status = e.status
        note = e.note
        hasInvoice = e.taxInvoice
        supplierName = e.supplierName
        supplierVatNo = e.supplierVatNo
        invoiceNo = e.invoiceNo
        invoiceDate = Fmt.date(e.invoiceDate) ?? Fmt.date(e.date) ?? Date()
        vatAmount = e.taxInvoice ? Self.plain(e.vatAmount) : ""
    }

    private func save() async {
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { error = "الوصف مطلوب"; return }
        guard let riyals = ReceiptRules.riyals(amount), riyals > 0 else { error = "المبلغ يجب أن يكون أكبر من صفر"; return }
        var vat: Double?
        if type == "expense", hasInvoice, !vatAmount.trimmingCharacters(in: .whitespaces).isEmpty {
            guard let v = ReceiptRules.riyals(vatAmount), v >= 0 else { error = "مبلغ الضريبة غير صحيح"; return }
            vat = v
        }
        let halalas = Int((riyals * 100).rounded())
        guard await Confirm.owner("تأكيد \(existing == nil ? "إضافة" : "تعديل") قيد \(type == "income" ? "دخل" : "مصروف") بمبلغ \(Fmt.sar(halalas))") else { return }

        var body: [String: Any] = [
            "type": type, "description": text, "cat": cat, "cfKind": cat == "cf" ? cfKind : "",
            "amount": (riyals * 100).rounded() / 100, "date": Fmt.isoDay(date), "status": status,
            "note": note.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        // As EntryDialog: an object registers/updates the invoice, null removes it, absent leaves it.
        if type == "expense" && hasInvoice {
            var ti: [String: Any] = [
                "supplierName": supplierName.trimmingCharacters(in: .whitespaces),
                "supplierVatNo": supplierVatNo.filter(\.isNumber),
                "invoiceNo": invoiceNo.trimmingCharacters(in: .whitespaces),
                "invoiceDate": Fmt.isoDay(invoiceDate),
            ]
            if let vat { ti["vatAmount"] = vat }
            body["taxInvoice"] = ti
        } else if existing?.taxInvoice == true {
            body["taxInvoice"] = NSNull()
        }

        busy = true
        defer { busy = false }
        do {
            let fin = existing == nil
                ? try await APIClient.shared.addEntry(projectId, body)
                : try await APIClient.shared.updateEntry(projectId, existing!.id, body)
            saved(fin, existing == nil ? "أُضيف القيد" : "حُفظ القيد")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاولوا مرة أخرى"
        }
    }

    private func remove() async {
        guard let e = existing else { return }
        guard await Confirm.owner("تأكيد حذف القيد «\(e.description)»") else { return }
        busy = true
        defer { busy = false }
        do {
            let fin = try await APIClient.shared.deleteEntry(projectId, e.id)
            saved(fin, "حُذف القيد")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }

    /// Halalas as a plain riyal number for a field: 1250000 → «12500», 1250050 → «12500.5».
    static func plain(_ halalas: Int) -> String {
        if halalas % 100 == 0 { return String(halalas / 100) }
        var s = String(format: "%.2f", Double(halalas) / 100)
        if s.hasSuffix("0") { s.removeLast() }
        return s
    }
}
