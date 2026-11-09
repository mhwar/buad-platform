import SwiftUI

/// «المتابعات» (features/sales/FollowupsPage.tsx): every follow-up due in one list — opportunities and
/// clients with a next-contact date — «متابعاتي» or «كل الفريق», grouped late / today / this week / later.
/// Each row opens its opportunity or client; its menu calls, writes on WhatsApp, or moves the date.
struct FollowupsView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @Environment(\.openURL) private var openURL
    @State private var all = false
    @State private var items: [Followup] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var toast: ToastItem?
    @State private var busy = false

    private var canEdit: Bool { (session.me?.can("clients.edit") ?? false) || (session.me?.can("sales.edit") ?? false) }

    private static let groups: [(String, String, Tone)] = [
        ("overdue", "متأخرة", .bad), ("today", "اليوم", .warn), ("soon", "هذا الأسبوع", .info), ("later", "لاحقاً", .neutral),
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                Picker("النطاق", selection: $all) {
                    Text("متابعاتي").tag(false)
                    Text("كل الفريق").tag(true)
                }
                .pickerStyle(.segmented)

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if items.isEmpty {
                    EmptyNote(text: all ? "لا متابعات مجدولة للفريق." : "لا متابعات مجدولة لك. تُضاف المتابعة من صفحة الفرصة أو العميل.", icon: "checkmark.circle")
                } else {
                    ForEach(Self.groups, id: \.0) { key, title, tone in
                        let list = items.filter { $0.state == key }
                        if !list.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    Text(title).font(.subheadline.weight(.bold)).foregroundStyle(tone.foreground)
                                    Text(verbatim: String(list.count)).font(.caption).foregroundStyle(Buad.muted).monospacedDigit()
                                }
                                VStack(spacing: 0) {
                                    ForEach(Array(list.enumerated()), id: \.element.key) { i, f in
                                        if i > 0 { Divider().padding(.leading, 14) }
                                        row(f)
                                    }
                                }
                                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("المتابعات")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .onChange(of: all) { _, _ in Task { await load() } }
        .toast($toast)
    }

    private func row(_ f: Followup) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Button { nav.open(f.link) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Image(systemName: f.kind == "request" ? "target" : "person.crop.circle").font(.caption).foregroundStyle(Buad.muted)
                        Text(f.title).font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink).lineLimit(1)
                    }
                    let meta = [f.subtitle, Fmt.dayMonth(f.date), f.ownerName, f.value > 0 ? Fmt.short(f.value) + " ر.س" : ""].filter { !$0.isEmpty }.joined(separator: " · ")
                    Text(meta).font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Menu {
                let digits = f.phone.filter { $0.isNumber || $0 == "+" }
                if !digits.isEmpty, let tel = URL(string: "tel:\(digits)") { Button { openURL(tel) } label: { Label("اتصال", systemImage: "phone") } }
                let wa = ReceiptRules.whatsapp(f.phone)
                if !wa.isEmpty, let url = URL(string: "https://wa.me/\(wa)") { Button { openURL(url) } label: { Label("واتساب", systemImage: "message") } }
                if canEdit {
                    Section("تأجيل المتابعة") {
                        Button("غداً") { Task { await postpone(f, days: 1) } }
                        Button("بعد غد") { Task { await postpone(f, days: 2) } }
                        Button("بعد أسبوع") { Task { await postpone(f, days: 7) } }
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle").font(.title3).foregroundStyle(Buad.muted).frame(width: Buad.tap, height: Buad.tap)
            }
            .disabled(busy)
        }
        .padding(.leading, 14)
        .padding(.vertical, 4)
    }

    private func postpone(_ f: Followup, days: Int) async {
        guard let d = Calendar.current.date(byAdding: .day, value: days, to: Date()) else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.setFollowUp(f, to: Fmt.isoDay(d))
            ScreenMemory.opportunities = nil
            toast = ToastItem(text: "أُجّلت متابعة «\(f.title)» إلى \(Fmt.dayMonth(Fmt.isoDay(d)))")
            await load()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر التأجيل"
        }
    }

    private func load() async {
        do {
            items = try await APIClient.shared.followups(all: all)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

/// «المستندات» (features/documents/DocumentsPage.tsx): every contract and letter across projects, with
/// its status; search, filter by status, and open one to work on it.
struct DocumentsRegisterView: View {
    @EnvironmentObject private var session: Session
    @State private var items: [RegisterDocument] = []
    @State private var status = ""
    @State private var query = ""
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "الكل", on: status.isEmpty) { status = "" }
                        FilterChip(title: "مسودة", on: status == "draft") { status = "draft" }
                        FilterChip(title: "قيد المراجعة", on: status == "review") { status = "review" }
                        FilterChip(title: "معتمد", on: status == "approved") { status = "approved" }
                    }
                    .padding(.horizontal, Buad.gutter)
                }
                .padding(.horizontal, -Buad.gutter)

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if items.isEmpty {
                    EmptyNote(text: "لا مستندات بهذا الشرط. تُنشأ المستندات من تبويب «المستندات» في صفحة المشروع.", icon: "doc.text")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { i, d in
                            if i > 0 { Divider().padding(.leading, 62) }
                            NavigationLink { DocumentPage(id: d.id) { Task { await load() } } } label: { row(d) }.buttonStyle(.plain)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("المستندات")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "ابحث بالرقم أو العنوان أو المشروع أو العميل")
        .refreshable { await load() }
        .task(id: status + "|" + query) {
            try? await Task.sleep(for: .milliseconds(query.isEmpty ? 0 : 300))
            guard !Task.isCancelled else { return }
            await load()
        }
    }

    private func row(_ d: RegisterDocument) -> some View {
        let st = Vocabulary.docStatus(d.status)
        return HStack(spacing: 12) {
            Image(systemName: d.kind == "contract" ? "signature" : "envelope")
                .frame(width: 36, height: 36)
                .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(Buad.ink)
            VStack(alignment: .leading, spacing: 2) {
                Text(d.title.isEmpty ? Vocabulary.docKind(d.kind) : d.title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text([Fmt.ltr(d.number), d.projectName, d.clientName].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            }
            Spacer()
            Pill(text: st.label, tone: st.tone)
            Chevron()
        }
        .padding(14)
        .contentShape(Rectangle())
    }

    private func load() async {
        do {
            items = try await APIClient.shared.documentsRegister(status: status, query: query)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}
