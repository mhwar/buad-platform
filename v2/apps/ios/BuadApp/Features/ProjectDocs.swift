import QuickLook
import UIKit
import SwiftUI

struct DocRef: Hashable { let id: String }

/// «المستندات» on the project page (features/documents/DocumentsSection.tsx): contracts and letters,
/// each with its status; «مستند جديد» makes one from a template, filled from the organisation, the
/// client, the project and its finance. A document opens in the app (DocumentPage).
struct ProjectDocumentsTab: View {
    @EnvironmentObject private var session: Session
    let projectId: String
    let documents: [DocumentItem]?
    let loaded: Bool
    @Binding var newDocument: Bool
    let opened: (String) -> Void

    private var canEdit: Bool { session.me?.can("documents.edit") ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("العقود والخطابات").font(.headline)
                Spacer()
                if canEdit {
                    Button { newDocument = true } label: { Label("مستند جديد", systemImage: "plus").font(.subheadline.weight(.semibold)) }
                        .frame(minHeight: Buad.tap)
                }
            }
            if let docs = documents {
                if docs.isEmpty {
                    VStack(spacing: 12) {
                        EmptyNote(text: "لا مستندات بعد. العقد يُنشأ معبأً تلقائياً من بيانات الجهة والعميل والمشروع والمالية.", icon: "doc.text")
                        if canEdit {
                            Button { newDocument = true } label: {
                                Label("إنشاء عقد", systemImage: "signature")
                                    .font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 50)
                                    .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                                    .foregroundStyle(Buad.onInk)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(docs.enumerated()), id: \.element.id) { i, d in
                            if i > 0 { Divider().padding(.leading, 62) }
                            NavigationLink(value: DocRef(id: d.id)) { row(d) }.buttonStyle(.plain)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }
            } else {
                EmptyNote(text: loaded ? "تعذّر تحميل المستندات." : "جارٍ التحميل…", icon: "doc.text")
            }
        }
        .sheet(isPresented: $newDocument) {
            NewDocumentSheet(projectId: projectId) { id in opened(id) }
        }
    }

    private func row(_ d: DocumentItem) -> some View {
        let st = Vocabulary.docStatus(d.status)
        return HStack(spacing: 12) {
            Image(systemName: d.kind == "contract" ? "signature" : "envelope")
                .frame(width: 36, height: 36)
                .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(Buad.ink)
            VStack(alignment: .leading, spacing: 2) {
                Text(d.title.isEmpty ? Vocabulary.docKind(d.kind) : d.title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text([Vocabulary.docKind(d.kind), Fmt.ltr(d.number), d.outgoingNo.isEmpty ? "" : "صادر \(Fmt.ltr(d.outgoingNo))", Fmt.epochDay(d.updatedAt)]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Buad.muted).lineLimit(1)
            }
            Spacer()
            Pill(text: st.label, tone: st.tone)
            Chevron()
        }
        .padding(14)
        .contentShape(Rectangle())
    }
}

// MARK: - A new document

struct NewDocumentSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let projectId: String
    let created: (String) -> Void

    @State private var kind = "contract"
    @State private var templates: DocTemplates?
    @State private var template = ""
    @State private var title = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    Picker("النوع", selection: $kind) {
                        Text("عقد").tag("contract")
                        Text("خطاب").tag("letter")
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section("القالب") {
                    if let t = templates {
                        ForEach(kind == "contract" ? t.contracts : t.letters) { tpl in
                            Button { template = tpl.key } label: {
                                HStack {
                                    Text(tpl.title).foregroundStyle(Buad.ink)
                                    Spacer()
                                    if template == tpl.key { Image(systemName: "checkmark").foregroundStyle(Buad.accentInk).bold() }
                                }
                            }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
                Section {
                    TextField(kind == "contract" ? "عنوان العقد (اختياري)" : "موضوع الخطاب (اختياري)", text: $title)
                } footer: {
                    Text("تُعبأ الحقول تلقائياً من بيانات الجهة والعميل والمشروع والمالية، وتعدّلها بعد الإنشاء.")
                }
            }
            .navigationTitle("مستند جديد")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: false, busy: busy || template.isEmpty, saveTitle: "إنشاء") { Task { await create() } }
            .onChange(of: kind) { _, _ in pickDefault() }
            .task {
                do { templates = try await APIClient.shared.documentTemplates(); pickDefault() } catch {
                    session.handle(error)
                    self.error = (error as? APIError)?.message ?? APIError.network.message
                }
            }
        }
    }

    private func pickDefault() {
        guard let t = templates else { return }
        template = (kind == "contract" ? t.contracts : t.letters).first?.key ?? ""
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let id = try await APIClient.shared.createDocument(projectId, kind: kind, template: template,
                                                               title: title.trimmingCharacters(in: .whitespaces))
            created(id)
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الإنشاء"
        }
    }
}

// MARK: - The document

/// One contract or letter (DocumentEditor + DocumentActions): its status and next step — review,
/// approve, register an outgoing number, send to the client by a link — its fields (filled
/// automatically, edited here) and its clauses (edit, add, reorder, delete), a PDF as the website
/// prints it, a copy as a new document, and deleting a draft.
struct DocumentPage: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let id: String
    let changed: () -> Void

    @State private var doc: DocumentDetail?
    @State private var error: String?
    @State private var busy = false
    @State private var toast: ToastItem?
    @State private var pdf: URL?
    @State private var editingFields: (title: String, keys: [String])?
    @State private var editingHeader = false
    @State private var editingClause: Clause?
    @State private var addingClause = false
    @State private var sharing = false
    @State private var confirm: String?
    @State private var copied: DocRef?

    private var canEdit: Bool { session.me?.can("documents.edit") ?? false }
    private var canShare: Bool { session.me?.can("documents.share") ?? false }
    private var locked: Bool { doc?.approved ?? true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let d = doc {
                    header(d)
                    if let error { RefreshBanner(text: error) }
                    if canEdit || canShare { actions(d) }
                    if locked && canEdit {
                        Label("المستند معتمد ومقفل. «إعادة فتح للتعديل» تنشئ نسخة جديدة وتبقى المعتمدة في السجل.", systemImage: "lock")
                            .font(.footnote).foregroundStyle(Buad.muted)
                    }
                    fields(d)
                    clauses(d)
                } else if let error {
                    EmptyNote(text: error, icon: "exclamationmark.triangle")
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 12)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle(doc.map { Vocabulary.docKind($0.kind) + " " + $0.number } ?? "مستند")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let d = doc {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { Task { await makePDF(d) } } label: { Label("معاينة PDF ومشاركته", systemImage: "doc.richtext") }
                        if canEdit {
                            Button { Task { await duplicate() } } label: { Label("نسخ كمستند جديد", systemImage: "plus.square.on.square") }
                            if d.status == "draft" && d.approvedVersions == 0 {
                                Button(role: .destructive) { confirm = "delete" } label: { Label("حذف المسودة", systemImage: "trash") }
                            }
                        }
                    } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("إجراءات المستند") }
                }
            }
        }
        .refreshable { await load() }
        .task { if doc == nil { await load() } }
        .toast($toast)
        .quickLookPreview($pdf)
        .navigationDestination(item: $copied) { DocumentPage(id: $0.id, changed: changed) }
        .sheet(isPresented: Binding(get: { editingFields != nil }, set: { if !$0 { editingFields = nil } })) {
            if let d = doc, let g = editingFields {
                FieldsSheet(doc: d, title: g.title, keys: g.keys) { fresh in doc = fresh; toast = ToastItem(text: "حُفظت الحقول"); changed() }
            }
        }
        .sheet(isPresented: $editingHeader) {
            if let d = doc {
                FieldsSheet(doc: d, title: "العنوان والرقم", keys: [], header: true) { fresh in doc = fresh; toast = ToastItem(text: "حُفظ"); changed() }
            }
        }
        .sheet(item: $editingClause) { c in
            ClauseSheet(clause: c, isNew: false) { updated in
                Task { await saveClauses { $0 = $0.map { $0.id == updated.id ? updated : $0 } } }
            } removed: {
                Task { await saveClauses { $0.removeAll { $0.id == c.id } } }
            }
        }
        .sheet(isPresented: $addingClause) {
            ClauseSheet(clause: Clause(title: ""), isNew: true) { c in
                Task { await saveClauses { $0.append(c) } }
            } removed: {}
        }
        .sheet(isPresented: $sharing) {
            if let d = doc { ShareDocumentSheet(doc: d) }
        }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            switch confirm ?? "" {
            case "approve": Button("اعتماد") { Task { await move("approved") } }
            case "outgoing": Button("تسجيل رقم صادر") { Task { await outgoing() } }
            case "delete": Button("حذف المسودة", role: .destructive) { Task { await remove() } }
            case "reopen": Button("إعادة فتح للتعديل") { Task { await move("draft") } }
            default: EmptyView()
            }
            Button("إلغاء", role: .cancel) {}
        } message: {
            switch confirm ?? "" {
            case "approve": Text("يُقفل عن التعديل وتُحفظ نسخة منه.")
            case "outgoing": Text("الرقم نهائي ويُسجَّل في سجل الصادر.")
            case "delete": Text("لا يمكن التراجع.")
            default: Text("")
            }
        }
    }

    private var confirmTitle: String {
        switch confirm ?? "" {
        case "approve": return "اعتماد المستند؟"
        case "outgoing": return "تسجيل رقم صادر؟"
        case "delete": return "حذف هذه المسودة نهائياً؟"
        case "reopen": return "إعادة فتح المستند للتعديل؟"
        default: return ""
        }
    }

    private func header(_ d: DocumentDetail) -> some View {
        let st = Vocabulary.docStatus(d.status)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                Pill(text: Vocabulary.docKind(d.kind))
                if !d.outgoingNo.isEmpty { Pill(text: "صادر \(d.outgoingNo)", tone: .info) }
                Spacer(minLength: 0)
            }
            Button { if canEdit && !locked { editingHeader = true } } label: {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(d.title.isEmpty ? Vocabulary.docKind(d.kind) : d.title).font(.title2.bold())
                            .multilineTextAlignment(.leading).foregroundStyle(Buad.ink)
                        Text(Fmt.ltr(d.number)).font(.subheadline).foregroundStyle(Buad.muted)
                    }
                    Spacer()
                    if canEdit && !locked { Image(systemName: "pencil").foregroundStyle(Buad.muted) }
                }
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private func actions(_ d: DocumentDetail) -> some View {
        switch d.status {
        case "draft":
            if canEdit {
                HStack(spacing: 10) {
                    primary("اعتماد", "checkmark.seal.fill") { confirm = "approve" }
                    secondary("إرسال للمراجعة", "eye") { Task { await move("review") } }
                }
            }
        case "review":
            if canEdit {
                HStack(spacing: 10) {
                    primary("اعتماد", "checkmark.seal.fill") { confirm = "approve" }
                    secondary("إعادة للمسودة", "arrow.uturn.backward") { Task { await move("draft") } }
                }
            }
        case "approved":
            VStack(spacing: 10) {
                if canShare { primary("إرسال للعميل", "paperplane.fill") { sharing = true } }
                if canEdit {
                    HStack(spacing: 10) {
                        if d.outgoingNo.isEmpty { secondary("تسجيل صادر", "number") { confirm = "outgoing" } }
                        secondary("إعادة فتح للتعديل", "lock.open") { confirm = "reopen" }
                    }
                }
            }
        default: EmptyView()
        }
    }

    private func primary(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(Buad.onInk) } else { Image(systemName: icon) }
                Text(title).bold()
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
            .foregroundStyle(Buad.onInk)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func secondary(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Buad.control, style: .continuous).stroke(Buad.line))
                .foregroundStyle(Buad.ink)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    // MARK: fields

    @ViewBuilder private func fields(_ d: DocumentDetail) -> some View {
        let groups = d.kind == "contract" ? DocFields.contract : DocFields.letter
        ForEach(groups, id: \.title) { g in
            let missing = g.keys.filter { (d.values[$0] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }.count
            Button { if canEdit && !locked { editingFields = g } } label: {
                Card {
                    HStack {
                        Text(g.title).font(.headline).foregroundStyle(Buad.ink)
                        if missing > 0 { Pill(text: "\(missing) ناقص", tone: .warn) }
                        Spacer()
                        if canEdit && !locked { Text("تعديل").font(.subheadline.weight(.medium)).foregroundStyle(Buad.accentInk) }
                    }
                    ForEach(g.keys, id: \.self) { k in
                        let v = d.values[k] ?? ""
                        HStack(alignment: .firstTextBaseline) {
                            Text(DocFields.labels[k] ?? k).font(.caption).foregroundStyle(Buad.muted)
                            Spacer(minLength: 12)
                            Text(v.isEmpty ? "—" : v).font(.subheadline).foregroundStyle(v.isEmpty ? Buad.warningInk : Buad.ink)
                                .multilineTextAlignment(.trailing).lineLimit(2)
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(!(canEdit && !locked))
        }
    }

    // MARK: clauses

    @ViewBuilder private func clauses(_ d: DocumentDetail) -> some View {
        HStack {
            Text(d.kind == "contract" ? "البنود" : "نص الخطاب").font(.headline)
            Spacer()
            if canEdit && !locked {
                Button { addingClause = true } label: { Label("بند", systemImage: "plus").font(.subheadline.weight(.semibold)) }
                    .frame(minHeight: Buad.tap)
            }
        }
        if d.content.isEmpty {
            EmptyNote(text: "لا بنود بعد.", icon: "text.alignright")
        }
        ForEach(Array(d.content.enumerated()), id: \.element.id) { i, c in
            HStack(alignment: .top, spacing: 8) {
                Button { if canEdit && !locked { editingClause = c } } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        if !c.heading.isEmpty { Text(c.heading).font(.subheadline.weight(.bold)).foregroundStyle(Buad.ink) }
                        Text(Self.preview(c.content, values: d.values)).font(.subheadline).foregroundStyle(Buad.muted)
                            .lineLimit(6).multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                if canEdit && !locked && d.content.count > 1 {
                    VStack(spacing: 0) {
                        Button { Task { await saveClauses { $0.swapAt(i, i - 1) } } } label: { Image(systemName: "chevron.up").frame(width: 32, height: 36) }
                            .disabled(i == 0 || busy)
                        Button { Task { await saveClauses { $0.swapAt(i, i + 1) } } } label: { Image(systemName: "chevron.down").frame(width: 32, height: 36) }
                            .disabled(i == d.content.count - 1 || busy)
                    }
                    .foregroundStyle(Buad.muted)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("ترتيب البند")
                }
            }
        }
    }

    /// The clause's text with its fields filled in ({{key}} → value), as it will print.
    static func preview(_ text: String, values: [String: String]) -> String {
        var out = text
        for (k, v) in values where out.contains("{{") {
            out = out.replacingOccurrences(of: "{{\(k)}}", with: v.isEmpty ? "…" : v)
        }
        return out
    }

    // MARK: actions

    private func load() async {
        do { doc = try await APIClient.shared.document(id); error = nil } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }

    private func move(_ to: String) async {
        guard let d = doc else { return }
        busy = true
        defer { busy = false }
        do {
            doc = try await APIClient.shared.setDocumentStatus(d.id, to: to, version: d.version)
            toast = ToastItem(text: to == "approved" ? "اعتُمد المستند" : to == "review" ? "أُرسل للمراجعة" : "أُعيد إلى المسودة")
            error = nil
            changed()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func outgoing() async {
        guard let d = doc else { return }
        do {
            let no = try await APIClient.shared.registerOutgoing(d.id)
            await load()
            toast = ToastItem(text: "سُجّل الصادر \(no)")
            changed()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر التسجيل"
        }
    }

    private func duplicate() async {
        do {
            copied = DocRef(id: try await APIClient.shared.duplicateDocument(id))
            changed()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر النسخ"
        }
    }

    private func remove() async {
        do {
            try await APIClient.shared.deleteDocument(id)
            changed()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }

    private func saveClauses(_ edit: (inout [Clause]) -> Void) async {
        guard let d = doc else { return }
        var list = d.content
        edit(&list)
        busy = true
        defer { busy = false }
        do {
            doc = try await APIClient.shared.updateDocument(d.id, version: d.version, ["content": list.map(\.json)])
            error = nil
            changed()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر حفظ البنود"
            await load()
        }
    }

    private func makePDF(_ d: DocumentDetail) async {
        busy = true
        defer { busy = false }
        do {
            let data = try await APIClient.shared.documentPDF(d.id, name: "\(Vocabulary.docKind(d.kind))-\(d.number)")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(d.title.isEmpty ? Vocabulary.docKind(d.kind) : d.title) \(d.number).pdf")
            try data.write(to: url, options: .atomic)
            pdf = url
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر إنشاء ملف PDF"
        }
    }
}

// MARK: - Fields

/// A group of the document's fields; empty means «تلقائي» (the platform fills it).
struct FieldsSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let doc: DocumentDetail
    let title: String
    let keys: [String]
    var header = false
    let saved: (DocumentDetail) -> Void

    @State private var values: [String: String] = [:]
    @State private var docTitle = ""
    @State private var number = ""
    @State private var start: [String: String] = [:]
    @State private var error: String?
    @State private var busy = false
    @State private var ready = false

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                if header {
                    Section {
                        TextField(doc.kind == "contract" ? "عنوان العقد" : "موضوع الخطاب", text: $docTitle)
                        TextField("رقم المستند", text: $number).environment(\.layoutDirection, .leftToRight)
                    } footer: { Text("الرقم يُولَّد تلقائياً ويمكن تعديله.") }
                }
                ForEach(keys, id: \.self) { k in
                    Section {
                        TextField(DocFields.labels[k] ?? k, text: Binding(get: { values[k] ?? "" }, set: { values[k] = $0 }), axis: .vertical)
                        if let a = doc.auto[k], !a.isEmpty, a != (values[k] ?? "") {
                            Button("استعادة التلقائي: \(a)") { values[k] = a }.font(.caption)
                        }
                    } header: {
                        Text(DocFields.labels[k] ?? k)
                    } footer: {
                        if DocFields.dates.contains(k) { Text("بصيغة 2026-03-15.") }
                        else if k == "contract_date_hijri" { Text("اتركه فارغاً ليتبع التاريخ الميلادي.") }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: ready && (values != start || (header && (docTitle != doc.title || number != doc.number))), busy: busy, saveTitle: "حفظ") {
                Task { await save() }
            }
            .onAppear {
                guard !ready else { return }
                for k in keys { values[k] = doc.variables[k] ?? doc.values[k] ?? "" }
                start = values
                docTitle = doc.title; number = doc.number
                ready = true
            }
        }
    }

    private func save() async {
        var body: [String: Any] = [:]
        let changed = values.filter { start[$0.key] != $0.value }
        if !changed.isEmpty { body["variables"] = changed }
        if header {
            let t = docTitle.trimmingCharacters(in: .whitespaces)
            let n = number.trimmingCharacters(in: .whitespaces)
            if t != doc.title { body["title"] = t }
            if n != doc.number { guard !n.isEmpty else { error = "رقم المستند مطلوب."; return }; body["number"] = n }
        }
        guard !body.isEmpty else { dismiss(); return }
        busy = true
        defer { busy = false }
        do {
            saved(try await APIClient.shared.updateDocument(doc.id, version: doc.version, body))
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}

// MARK: - A clause

struct ClauseSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var clause: Clause
    let isNew: Bool
    let saved: (Clause) -> Void
    let removed: () -> Void

    @State private var original: Clause?
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section("العنوان") {
                    TextField("عنوان البند", text: Binding(get: { clause.baseTitle.isEmpty ? clause.title : clause.baseTitle },
                                                          set: { clause.baseTitle = $0; clause.title = $0 }))
                }
                Section {
                    TextField("نص البند", text: $clause.content, axis: .vertical).lineLimit(6...30)
                } header: { Text("النص") } footer: {
                    Text("الحقول تُكتب بين قوسين مزدوجين مثل {{party_b_name}} وتُعبأ عند الطباعة. يُرقَّم البند تلقائياً (المادة الأولى…).")
                }
                Section { Toggle("يبدأ في صفحة جديدة", isOn: $clause.pageBreak) }
                if !isNew {
                    Section {
                        Button("حذف البند", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(isNew ? "بند جديد" : "تعديل البند")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: original.map { $0 != clause } ?? false, busy: false, saveTitle: isNew ? "إضافة" : "حفظ") {
                saved(clause)
                dismiss()
            }
            .confirmationDialog("حذف هذا البند؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف البند", role: .destructive) { removed(); dismiss() }
                Button("إلغاء", role: .cancel) {}
            }
            .onAppear { if original == nil { original = clause } }
        }
    }
}

// MARK: - Sending to the client

/// SendDialog: a link to the approved document (7 or 30 days) the client opens without signing in,
/// sent by WhatsApp, e-mail or any app; earlier links with their views, and revoking one.
struct ShareDocumentSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let doc: DocumentDetail

    @State private var days = 7
    @State private var phone = ""
    @State private var link: URL?
    @State private var shares: [DocShare] = []
    @State private var error: String?
    @State private var busy = false

    private var message: String {
        "مرحباً، نرسل لكم \(Vocabulary.docKind(doc.kind)) «\(doc.title.isEmpty ? doc.number : doc.title)» للاطلاع: \(link?.absoluteString ?? "")"
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                if let link {
                    Section {
                        Text(link.absoluteString).font(.footnote).environment(\.layoutDirection, .leftToRight).textSelection(.enabled)
                        ShareLink(item: link, subject: Text(doc.title), message: Text(message)) {
                            Label("مشاركة الرابط", systemImage: "square.and.arrow.up")
                        }
                        Button { UIPasteboard.general.url = link } label: { Label("نسخ الرابط", systemImage: "doc.on.doc") }
                        if let wa = whatsapp { Button { openURL(wa) } label: { Label("إرسال بواتساب", systemImage: "message") } }
                    } header: { Text("الرابط جاهز") } footer: {
                        Text("صالح \(Fmt.days(days)). يفتحه العميل دون تسجيل دخول ويحمّل منه PDF.")
                    }
                } else {
                    Section {
                        Picker("صلاحية الرابط", selection: $days) {
                            Text("7 أيام").tag(7)
                            Text("30 يوماً").tag(30)
                        }
                        .pickerStyle(.segmented)
                        TextField("جوال المستلم (اختياري، لواتساب)", text: $phone).keyboardType(.phonePad)
                            .environment(\.layoutDirection, .leftToRight)
                        Button { Task { await create() } } label: {
                            HStack { Spacer(); if busy { ProgressView() } else { Text("إنشاء رابط للعميل").bold() }; Spacer() }
                        }
                        .disabled(busy)
                    }
                }
                if !shares.isEmpty {
                    Section("الروابط السابقة") {
                        ForEach(shares) { s in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(Fmt.epochDay(s.createdAt)).font(.subheadline)
                                    Text(s.revoked ? "أُلغي" : s.live ? "ينتهي \(Fmt.epochDay(s.expiresAt))" : "انتهى")
                                        .font(.caption).foregroundStyle(Buad.muted)
                                }
                                Spacer()
                                Text("\(s.views) مشاهدة").font(.caption).foregroundStyle(Buad.muted)
                                if s.live {
                                    Button("إلغاء", role: .destructive) { Task { await revoke(s) } }.font(.caption.weight(.semibold))
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("إرسال للعميل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() }.bold() } }
            .task { shares = (try? await APIClient.shared.shares(doc.id)) ?? [] }
        }
    }

    private var whatsapp: URL? {
        var digits = phone.filter(\.isNumber)
        if digits.hasPrefix("05") { digits = "966" + digits.dropFirst() }
        let text = message.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://wa.me/\(digits)?text=\(text)")
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            link = try await APIClient.shared.createShare(doc.id, days: days, channel: phone.isEmpty ? "link" : "whatsapp")
            shares = (try? await APIClient.shared.shares(doc.id)) ?? shares
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر إنشاء الرابط"
        }
    }

    private func revoke(_ s: DocShare) async {
        do {
            try await APIClient.shared.revokeShare(doc.id, s.id)
            shares = (try? await APIClient.shared.shares(doc.id)) ?? shares
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الإلغاء"
        }
    }
}
