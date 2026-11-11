import SwiftUI

/// «تحتاج تدخلك: n ملاحظات على الأرقام» (FinanceChecks.tsx): unapproved receipts, more received than
/// the contract, partner shares, tax booked as an expense, undecided fees, purchases without a tax
/// invoice, drafts, cancelled projects with instalments. Read-only; a row opens what it is about.
struct FinanceChecksCard: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @State private var checks: [FinanceCheck] = []
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !checks.isEmpty {
                let total = checks.reduce(0) { $0 + $1.rows.count }
                Button { withAnimation(.snappy) { open.toggle() } } label: {
                    HStack {
                        Label("تحتاج تدخلك: \(total) ملاحظة على الأرقام", systemImage: "checklist.checked").font(.subheadline.weight(.semibold)).foregroundStyle(Buad.warningInk)
                        Spacer()
                        Image(systemName: open ? "chevron.up" : "chevron.down").font(.caption.weight(.bold)).foregroundStyle(Buad.warningInk)
                    }
                    .padding(12).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if open {
                    ForEach(checks) { c in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(c.title) (\(c.rows.count))").font(.subheadline.weight(.semibold))
                            if !c.hint.isEmpty { Text(c.hint).font(.caption).foregroundStyle(Buad.muted) }
                            ForEach(c.rows) { r in
                                Button { nav.open(r.link) } label: {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(r.label).font(.footnote.weight(.medium)).foregroundStyle(Buad.accentInk).multilineTextAlignment(.leading)
                                        if !r.detail.isEmpty { Text("— \(r.detail)").font(.footnote).foregroundStyle(Buad.muted).multilineTextAlignment(.leading) }
                                        Spacer(minLength: 0)
                                    }
                                    .frame(minHeight: 32).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 12).padding(.bottom, 12)
                    }
                }
            }
        }
        .background(Buad.warningSoft, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        .task { checks = (try? await APIClient.shared.financeChecks()) ?? [] }
    }
}

/// «مقترحات الاستلام للاعتماد» (ReceiptProposals.tsx): projects with a contract and no receipt at all,
/// each with the date it was probably received. Approving records the receipt (saved already approved).
struct ReceiptSuggestionsCard: View {
    @EnvironmentObject private var session: Session
    @State private var items: [ReceiptSuggestion] = []
    @State private var loaded = false
    @State private var target: ReceiptSuggestion?
    @State private var toast: ToastItem?

    private var canEdit: Bool { session.me?.can("finance.edit") ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !items.isEmpty {
                Text("مقترحات الاستلام للاعتماد").font(.headline)
                Text("مشاريع لها قيمة عقد ولا استلام مسجّل: ربحها لا يُحتسب متحققاً حتى يُسجَّل استلامها.").font(.caption).foregroundStyle(Buad.muted)
                VStack(spacing: 0) {
                    ForEach(Array(items.prefix(8).enumerated()), id: \.element.id) { i, s in
                        if i > 0 { Divider().padding(.leading, 14) }
                        VStack(alignment: .leading, spacing: 6) {
                            Text(s.name).font(.subheadline.weight(.semibold))
                            Text("\(s.clientName) · قيمة العقد \(Fmt.sar(s.gross))").font(.caption).foregroundStyle(Buad.muted)
                            if s.hasDate {
                                HStack(spacing: 6) {
                                    Text("المقترح: \(Fmt.day(s.date))").font(.caption.weight(.medium))
                                    if !s.quarter.isEmpty { Pill(text: s.quarter, tone: .info) }
                                    ForEach(s.warnings, id: \.self) { Pill(text: ReceiptSuggestion.warning($0), tone: .warn) }
                                }
                                if !s.basis.isEmpty { Text(s.basis).font(.caption2).foregroundStyle(Buad.faint) }
                            } else {
                                Text("لا تاريخ في بياناته لاقتراحه، أدخل موعد الاستلام يدوياً.").font(.caption).foregroundStyle(Buad.warningInk)
                            }
                            if canEdit {
                                Button { target = s } label: {
                                    Text(s.hasDate ? "مراجعة واعتماد" : "سجّل استلاماً").font(.subheadline.weight(.bold)).foregroundStyle(Buad.accentInk)
                                        .frame(minHeight: Buad.tap, alignment: .leading).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                if items.count > 8 { Text("و\(items.count - 8) مشروعاً آخر").font(.caption).foregroundStyle(Buad.muted) }
            }
        }
        .task { await load() }
        .toast($toast)
        .sheet(item: $target) { s in
            ReceiptFormSheet(projectId: s.id, receipt: nil, remaining: s.gross, contractDate: s.contractDate, presetDate: s.date, basis: s.basis) { _, message in
                toast = ToastItem(text: message)
                Task { await load() }
            }
        }
    }

    private func load() async {
        items = (try? await APIClient.shared.receiptSuggestions()) ?? items
        loaded = true
    }
}
