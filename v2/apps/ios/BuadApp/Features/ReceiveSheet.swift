import SwiftUI

/// «تسجيل مقبوض» for one instalment (features/receivables/ReceiveDialog.tsx): the day the money
/// reached the bank (it decides the quarter and the VAT period) and how much came. Less than the
/// instalment keeps the rest as a new pending instalment. Confirmed with Face ID, then sent as is.
struct ReceiveSheet: View {
    struct LineInfo: Identifiable {
        let id: String
        let label: String
        let amount: Int
        let project: String
        var contractDate: String = ""
    }

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let line: LineInfo
    let done: (String) -> Void

    @State private var date = Date()
    @State private var amount = ""
    @State private var error: String?
    @State private var busy = false

    private var iso: String { Fmt.isoDay(date) }
    private var riyals: Double? { ReceiptRules.riyals(amount) }
    private var halalas: Int? { riyals.map { Int(($0 * 100).rounded()) } }
    private var rest: Int { max(0, line.amount - (halalas ?? 0)) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("الدفعة", value: Fmt.sar(line.amount))
                    if !line.project.isEmpty { LabeledContent("المشروع", value: line.project) }
                }
                Section {
                    DatePicker("تاريخ وصوله للبنك", selection: $date, displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    HStack {
                        Text("المبلغ المستلم (ر.س)")
                        TextField("0", text: $amount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("يقع في \(ReceiptRules.quarterLabel(iso))").bold()
                        if let h = halalas, h > 0, rest > 0 {
                            Text("استلام جزئي: يبقى \(Fmt.sar(rest)) دفعةً منتظرة بنفس الموعد.").foregroundStyle(Buad.warningInk)
                        }
                        ForEach(ReceiptRules.warnings(date: iso, contractDate: line.contractDate, today: Fmt.todayISO), id: \.self) {
                            Text("⚠ \($0)").foregroundStyle(Buad.warningInk)
                        }
                    }
                    .font(.footnote)
                }
                if let error {
                    Section { Text(error).foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Label("تسجيل المقبوض", systemImage: "faceid").bold() }
                            Spacer()
                        }
                    }
                    .disabled(busy)
                }
            }
            .navigationTitle("تسجيل مقبوض — \(line.label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .onAppear { if amount.isEmpty { amount = Self.plain(line.amount) } }
            .interactiveDismissDisabled(busy)
        }
    }

    private func save() async {
        guard let r = riyals, let h = halalas, h > 0 else { error = "أدخل التاريخ والمبلغ."; return }
        guard h <= line.amount else { error = "المبلغ أكبر من الدفعة."; return }
        guard await Confirm.owner("تأكيد تسجيل مقبوض بمبلغ \(Fmt.sar(h))") else { return }
        busy = true
        defer { busy = false }
        do {
            let left = try await APIClient.shared.receive(lineId: line.id, date: iso, riyals: (r * 100).rounded() / 100)
            done(left > 0 ? "سُجّل المقبوض، وبقي الباقي دفعةً منتظرة" : "سُجّل المقبوض")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر تسجيل المقبوض."
        }
    }

    /// Halalas as a plain riyal number for the field: 1250000 → «12500», 1250050 → «12500.5».
    private static func plain(_ halalas: Int) -> String {
        halalas % 100 == 0 ? String(halalas / 100) : String(format: "%.2f", Double(halalas) / 100).replacingOccurrences(of: #"0$"#, with: "", options: .regularExpression)
    }
}
