import SwiftUI

/// «مراجعة السنة» (features/year-review): the year's revenue against its target, the money still to
/// collect, and the projects that need a look — completed with something owing, paid in full but still
/// open, a late instalment, no receipts, no contract. A receipt is recorded or a project closed from its card.
struct YearReviewView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @State private var year = Calendar(identifier: .gregorian).component(.year, from: Date())
    @State private var data: YearReview?
    @State private var loaded = false
    @State private var error: String?
    @State private var filter = "review"
    @State private var receiving: YearReview.Item?
    @State private var closing: YearReview.Item?
    @State private var settingTarget = false
    @State private var toast: ToastItem?

    private var canReceive: Bool { session.me?.can("finance.edit") ?? false }
    private var canClose: Bool { session.me?.can("projects.edit") ?? false }

    private var shown: [YearReview.Item] {
        guard let d = data else { return [] }
        switch filter {
        case "all": return d.items
        case "review": return d.items.filter { !$0.flags.isEmpty }
        default: return d.items.filter { $0.flags.contains(filter) }
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button { year -= 1 } label: { Image(systemName: "chevron.right").frame(width: Buad.tap, height: Buad.tap).contentShape(Rectangle()) }
                        .accessibilityLabel("السنة السابقة")
                    Spacer()
                    Text("سنة \(String(year))").font(.headline).monospacedDigit()
                    Spacer()
                    Button { year += 1 } label: { Image(systemName: "chevron.left").frame(width: Buad.tap, height: Buad.tap).contentShape(Rectangle()) }
                        .accessibilityLabel("السنة التالية")
                }
                .buttonStyle(.plain)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, data == nil {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if let d = data {
                    targetCard(d)
                    JoinedGrid {
                        GridRow {
                            tile("مقبوضات المشاريع", Fmt.sar(d.projectReceipts), sub: "منها ضريبة \(Fmt.short(d.receiptsVat))")
                            tile("دخل الشركة", Fmt.sar(d.companyIncome), sub: "خدمات وإيرادات أخرى")
                        }
                        GridRow {
                            tile("محتمل غير مسجّل", Fmt.sar(d.unrecorded), sub: "متبقٍّ على مشاريع مكتملة", tone: d.unrecorded > 0 ? .warn : nil)
                            tile("قيد التحصيل", Fmt.sar(d.collecting), sub: "متبقٍّ على مشاريع جارية")
                        }
                    }
                    filters(d)
                    if shown.isEmpty {
                        EmptyNote(text: filter == "review" ? "كل مشاريع السنة مرتّبة ✓" : "لا مشاريع في هذا العرض.", icon: "checkmark.seal")
                    }
                    ForEach(shown) { card($0) }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .refreshable { await load() }
        .task(id: year) { await load() }
        .toast($toast)
        .sheet(item: $receiving) { item in
            ReceiptFormSheet(projectId: item.id, receipt: nil, remaining: item.remaining, contractDate: item.contractDate) { _, message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
        .sheet(isPresented: $settingTarget) {
            TargetSheet(year: year, current: data?.target) { toast = ToastItem(text: "حُفظ المستهدف"); Task { await load() } }
        }
        .confirmationDialog("إغلاق «\(closing?.name ?? "")» كمكتمل؟", isPresented: Binding(get: { closing != nil }, set: { if !$0 { closing = nil } }),
                            titleVisibility: .visible, presenting: closing) { item in
            Button("إغلاق كمكتمل") { Task { await complete(item) } }
            Button("إلغاء", role: .cancel) {}
        } message: { _ in Text("يُنقل إلى المشاريع المكتملة، ويمكن إعادة فتحه لاحقاً.") }
    }

    private func targetCard(_ d: YearReview) -> some View {
        Card {
            HStack {
                Text("الإيراد مقابل المستهدف").font(.headline)
                Spacer()
                if session.me?.can("treasury.edit") == true {
                    Button { settingTarget = true } label: { Text(d.target == nil ? "ضبط المستهدف" : "تعديل").font(.subheadline.weight(.medium)) }
                        .frame(minHeight: Buad.tap)
                }
            }
            HStack(alignment: .firstTextBaseline) {
                Text(Fmt.sar(d.revenue)).font(.title2.bold()).monospacedDigit()
                Text("المحقق في \(String(d.year))").font(.caption).foregroundStyle(Buad.muted)
            }
            if let t = d.target {
                ProgressBar(value: d.progress, color: Buad.success)
                Text("من مستهدف \(Fmt.sar(t)) · \(String(format: "%.1f", d.progress * 100))% · المتبقي \(Fmt.sar(max(0, t - d.revenue)))")
                    .font(.caption).foregroundStyle(Buad.muted)
                if d.targetSource == "plan" { Text("المستهدف من مؤشر الإيراد في الخطة.").font(.caption2).foregroundStyle(Buad.faint) }
            } else {
                Text("لا مستهدف لسنة \(String(d.year)).").font(.caption).foregroundStyle(Buad.muted)
            }
            Text("شاملة الضريبة: المقبوضات المسجّلة من العملاء ودخل الشركة، بتاريخ وصولها.").font(.caption2).foregroundStyle(Buad.faint)
        }
    }

    private func filters(_ d: YearReview) -> some View {
        let flagged = d.items.filter { !$0.flags.isEmpty }.count
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(title: "تحتاج مراجعة", count: flagged, on: filter == "review") { filter = "review" }
                ForEach(["closed_not_paid", "paid_not_closed", "overdue", "no_receipts", "no_contract"], id: \.self) { f in
                    if (d.counts[f] ?? 0) > 0 { FilterChip(title: YearReview.flagLabel(f), count: d.counts[f], on: filter == f) { filter = f } }
                }
                FilterChip(title: "الكل", count: d.items.count, on: filter == "all") { filter = "all" }
            }
            .padding(.horizontal, Buad.gutter)
        }
        .padding(.horizontal, -Buad.gutter)
    }

    private func card(_ p: YearReview.Item) -> some View {
        let st = Vocabulary.status(p.status)
        return Card {
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                ForEach(p.flags, id: \.self) { Pill(text: YearReview.flagLabel($0), tone: $0 == "paid_not_closed" ? .ok : .warn) }
                Spacer(minLength: 0)
            }
            Button { nav.open("/projects/\(p.id)") } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).font(.headline).foregroundStyle(Buad.ink).multilineTextAlignment(.leading)
                    Text([Fmt.ltr(p.number), p.clientName].filter { !$0.isEmpty }.joined(separator: " · ")).font(.footnote).foregroundStyle(Buad.muted)
                }
            }
            .buttonStyle(.plain)
            HStack {
                stat(p.estimated ? "العقد (تقديري)" : "العقد", Fmt.short(p.gross))
                stat("المستلم", Fmt.short(p.received))
                stat("المتبقي", Fmt.short(p.remaining), warn: p.remaining > 0 && p.status == "completed")
            }
            Text(p.lastReceipt.isEmpty ? "لا استلامات" : "آخر استلام \(Fmt.day(p.lastReceipt))" + (p.receivedYear > 0 ? " · في \(String(year)): \(Fmt.short(p.receivedYear))" : ""))
                .font(.caption).foregroundStyle(Buad.muted)
            if (canReceive && p.remaining > 0) || (canClose && (p.status == "active" || p.status == "paused")) {
                ActionRow {
                    if canReceive && p.remaining > 0 {
                        if p.pendingLines > 0 {
                            ActionTile(icon: "banknote", title: "تسجيل مقبوض", primary: true) { nav.open("/projects/\(p.id)") }
                        } else {
                            ActionTile(icon: "banknote", title: "تسجيل مقبوض", primary: true) { receiving = p }
                        }
                    }
                    if canClose && (p.status == "active" || p.status == "paused") {
                        ActionTile(icon: "checkmark.seal", title: "إغلاق كمكتمل", primary: p.flags.contains("paid_not_closed")) { closing = p }
                    }
                }
            }
        }
    }

    private func stat(_ title: String, _ value: String, warn: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(warn ? Buad.warningInk : Buad.ink)
            Text(title).font(.caption2).foregroundStyle(Buad.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private func tile(_ title: String, _ value: String, sub: String, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(value).font(.body.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(tone?.foreground ?? Buad.ink)
            Text(sub).font(.caption2).foregroundStyle(Buad.muted).lineLimit(2)
        }
        .joinedCell(minHeight: 62)
    }

    private func complete(_ p: YearReview.Item) async {
        do {
            try await APIClient.shared.updateProject(p.id, ["status": "completed"])
            toast = ToastItem(text: "أُغلق «\(p.name)» كمكتمل")
            NotificationCenter.default.post(name: .projectsChanged, object: nil)
            await load()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر إغلاق المشروع."
        }
    }

    private func load() async {
        do { data = try await APIClient.shared.yearReview(year); error = nil } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

/// The year's revenue target (riyals, VAT included), kept in the organisation's settings; empty clears it.
struct TargetSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let year: Int
    let current: Int?
    let saved: () -> Void

    @State private var amount = ""
    @State private var error: String?
    @State private var busy = false
    @State private var started = false

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) } }
                Section {
                    HStack {
                        Text("مستهدف \(String(year)) (ر.س)")
                        TextField("غير محدد", text: $amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                } footer: { Text("شامل الضريبة، ويقاس به «اليوم» و«مراجعة السنة». اتركه فارغاً لمسحه.") }
            }
            .navigationTitle("مستهدف الإيراد")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && !amount.isEmpty || current != nil, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .onAppear {
                guard !started else { return }
                started = true
                if let c = current { amount = EntrySheet.plain(c) }
            }
        }
    }

    private func save() async {
        let t = amount.trimmingCharacters(in: .whitespaces)
        var value: Double?
        if !t.isEmpty {
            guard let v = ReceiptRules.riyals(t), v >= 0 else { error = "المبلغ غير صحيح."; return }
            value = v
        }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.setYearTarget(year, riyals: value)
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}
