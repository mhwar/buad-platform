import SwiftUI

/// «المالية»: the website's sections that the app has so far — «النظرة العامة» and «التحصيل»
/// (treasury.view) and «الضريبة» (vat.view) — each shown only when the role holds its permission.
struct FinanceView: View {
    enum Part: String { case overview, collection, vat }
    @EnvironmentObject private var session: Session
    @State private var part: Part?

    private var parts: [Part] {
        guard let me = session.me else { return [] }
        return (me.can("treasury.view") ? [.overview, .collection] : []) + (me.can("vat.view") ? [.vat] : [])
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if parts.count > 1 {
                    Picker("أقسام المالية", selection: Binding(get: { part ?? parts.first }, set: { part = $0 })) {
                        ForEach(parts, id: \.self) { p in
                            Text(p == .overview ? "النظرة العامة" : p == .collection ? "التحصيل" : "الضريبة").tag(Optional(p))
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, Buad.gutter)
                    .padding(.vertical, 8)
                }
                switch part ?? parts.first {
                case .overview: OverviewView()
                case .collection: CollectionView()
                case .vat: VatView()
                case nil: EmptyNote(text: APIError.forbidden.message, icon: "lock")
                }
            }
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("المالية")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// «المالية ← التحصيل» (features/receivables/ReceivablesPage.tsx): debt ageing, the instalments still
/// owed with «تسجيل مقبوض» and a WhatsApp reminder, and the 13-week cash forecast. Every figure is
/// GET /api/receivables as the server computes it for this organisation.
struct CollectionView: View {
    @EnvironmentObject private var session: Session
    @State private var data: Receivables?
    @State private var loaded = false
    @State private var error: String?
    @State private var receiving: ReceiveSheet.LineInfo?
    @State private var toast: String?

    private var canReceive: Bool { session.me?.can("finance.edit") ?? false }

    var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let toast {
                        Label(toast, systemImage: "checkmark.circle.fill")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Buad.successInk)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Buad.successSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                    }
                    if !loaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 28)
                    } else if let error {
                        EmptyNote(text: error, icon: "wifi.exclamationmark")
                    } else if let d = data {
                        aging(d)
                        owed(d)
                        forecast(d)
                    }
                }
                .padding(.horizontal, Buad.gutter)
                .padding(.vertical, 8)
            }
            .background(Buad.canvas.ignoresSafeArea())
            .refreshable { await load() }
            .task { if !loaded { await load() } }
            .sheet(item: $receiving) { line in
                ReceiveSheet(line: line) { message in
                    toast = message
                    Task { await load() }
                }
            }
    }

    // MARK: أعمار الديون

    private func aging(_ d: Receivables) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("أعمار الديون").font(.headline)
            HStack(spacing: 1) {
                total("المستحق على العملاء", Fmt.sar(d.total), tone: nil)
                total("المتأخر", Fmt.sar(d.overdue), tone: d.overdue > 0 ? .bad : nil)
            }
            .background(Buad.line)
            .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(d.buckets, id: \.key) { b in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(b.label).font(.caption).foregroundStyle(Buad.muted)
                        Text(Fmt.sar(b.amount)).font(.subheadline.weight(.bold)).monospacedDigit()
                            .foregroundStyle(b.key == "d90" && b.amount > 0 ? Buad.dangerInk : Buad.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Text("\(b.count) دفعة").font(.caption).foregroundStyle(Buad.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                }
            }
        }
    }

    // MARK: الدفعات المنتظرة

    @ViewBuilder private func owed(_ d: Receivables) -> some View {
        Text("الدفعات المنتظرة").font(.headline)
        if d.items.isEmpty {
            EmptyNote(text: "لا دفعات منتظرة. أضف جدول دفعات من صفحة المشروع في الموقع لتظهر هنا وتُحسب أعمارها.", icon: "calendar")
        } else {
            VStack(spacing: 10) {
                ForEach(d.items) { i in
                    let late = i.dueDate < d.today
                    Card {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(i.label) · \(i.project)").font(.subheadline.weight(.medium))
                                Text(i.client).font(.caption).foregroundStyle(Buad.muted)
                                Text((late ? "متأخرة · " : "تستحق ") + Fmt.day(i.dueDate))
                                    .font(.caption.weight(late ? .semibold : .regular))
                                    .foregroundStyle(late ? Buad.dangerInk : Buad.muted)
                            }
                            Spacer()
                            Pill(text: Fmt.sar(i.amount), tone: late ? .bad : .info)
                        }
                        HStack(spacing: 8) {
                            if canReceive {
                                Button {
                                    toast = nil
                                    receiving = .init(id: i.id, label: i.label, amount: i.amount, project: i.project)
                                } label: {
                                    Label("تسجيل مقبوض", systemImage: "checkmark")
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 12).frame(height: 36)
                                        .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                            let wa = ReceiptRules.whatsapp(i.phone)
                            if !wa.isEmpty, let url = whatsappURL(wa, i) {
                                Link(destination: url) {
                                    Label("تذكير واتساب", systemImage: "message")
                                        .font(.subheadline)
                                        .foregroundStyle(Buad.muted)
                                        .padding(.horizontal, 12).frame(height: 36)
                                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Buad.line))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// reminderText (packages/domain/src/receivables.ts), word for word.
    private func whatsappURL(_ number: String, _ i: Receivables.Line) -> URL? {
        let text = "السلام عليكم \(i.client)،\nنذكّركم بدفعة «\(i.label)» لمشروع «\(i.project)» بمبلغ \(Fmt.sar(i.amount))، وتاريخ استحقاقها \(Fmt.day(i.dueDate)).\nنشكر لكم تعاونكم.\n"
        var c = URLComponents(string: "https://wa.me/\(number)")
        c?.queryItems = [URLQueryItem(name: "text", value: text)]
        return c?.url
    }

    // MARK: التوقّع النقدي

    @ViewBuilder private func forecast(_ d: Receivables) -> some View {
        if !d.weeks.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("التوقّع النقدي (13 أسبوعاً)").font(.headline)
                if !d.shortfallWeek.isEmpty {
                    Label("يتوقع عجز في أسبوع \(Fmt.dayMonth(d.shortfallWeek))", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote.weight(.medium)).foregroundStyle(Buad.dangerInk)
                }
                if d.pendingExpenses > 0 {
                    Text("مصاريف مسجّلة لم تُدفع بعد: \(Fmt.sar(d.pendingExpenses))").font(.footnote).foregroundStyle(Buad.muted)
                }
                VStack(spacing: 0) {
                    ForEach(Array(d.weeks.enumerated()), id: \.element.id) { n, w in
                        if n > 0 { Divider().padding(.leading, 14) }
                        HStack {
                            Text(Fmt.dayMonth(w.start)).font(.subheadline).frame(width: 70, alignment: .leading)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                HStack(spacing: 10) {
                                    if w.inflow > 0 { Text("+ \(Fmt.short(w.inflow))").foregroundStyle(Buad.successInk) }
                                    if w.outflow > 0 { Text("− \(Fmt.short(w.outflow))").foregroundStyle(Buad.dangerInk) }
                                    if w.inflow == 0 && w.outflow == 0 { Text("—").foregroundStyle(Buad.faint) }
                                }
                                .font(.caption).monospacedDigit()
                                Text("الرصيد \(Fmt.short(w.balance))").font(.caption2).foregroundStyle(w.balance < 0 ? Buad.dangerInk : Buad.muted)
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                Text("الرصيد يبدأ من صفر في التطبيق. لإدخال الرصيد الحالي افتح التحصيل في الموقع.").font(.footnote).foregroundStyle(Buad.muted)
            }
        }
    }

    private func total(_ title: String, _ value: String, tone: Tone?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.footnote).foregroundStyle(Buad.muted)
            Text(value).font(.body.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(tone?.foreground ?? Buad.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Buad.surface)
    }

    private func load() async {
        do {
            data = try await APIClient.shared.receivables()
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}
