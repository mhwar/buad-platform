import SwiftUI

// MARK: - «الاجتماعات»

/// «الاجتماعات» (features/workspace): the team's meetings — upcoming first, then those held or cancelled —
/// each with when, where, who, what it is about and how many decisions are still open. «+» plans one;
/// a meeting opens on its agenda, minutes and decisions. Reads need meetings.view, writes meetings.edit.
struct MeetingsView: View {
    @EnvironmentObject private var session: Session
    @State private var items: [Meeting] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var mine = false
    @State private var filter = "upcoming"
    @State private var creating = false
    @State private var toast: ToastItem?

    private var canEdit: Bool { session.me?.can("meetings.edit") ?? false }

    private var shown: [Meeting] {
        switch filter {
        case "upcoming": return items.filter(\.upcoming).sorted { $0.startsAt < $1.startsAt }
        case "past": return items.filter { !$0.upcoming && $0.status != "cancelled" }.sorted { $0.startsAt > $1.startsAt }
        case "cancelled": return items.filter { $0.status == "cancelled" }.sorted { $0.startsAt > $1.startsAt }
        default: return items.sorted { $0.startsAt > $1.startsAt }
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Picker("النطاق", selection: $mine) {
                    Text("كل الاجتماعات").tag(false)
                    Text("اجتماعاتي").tag(true)
                }
                .pickerStyle(.segmented)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "القادمة", count: items.filter(\.upcoming).count, on: filter == "upcoming") { filter = "upcoming" }
                        FilterChip(title: "السابقة", count: items.filter { !$0.upcoming && $0.status != "cancelled" }.count, on: filter == "past") { filter = "past" }
                        FilterChip(title: "الملغاة", count: items.filter { $0.status == "cancelled" }.count, on: filter == "cancelled") { filter = "cancelled" }
                        FilterChip(title: "الكل", count: items.count, on: filter == "all") { filter = "all" }
                    }
                    .padding(.horizontal, Buad.gutter)
                }
                .padding(.horizontal, -Buad.gutter)

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if shown.isEmpty {
                    EmptyNote(text: items.isEmpty ? (canEdit ? "لا اجتماعات بعد. اضغط «+» لتجدول أول اجتماع." : "لا اجتماعات.") : "لا اجتماعات في هذا العرض.",
                              icon: "person.3")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { i, m in
                            if i > 0 { Divider().padding(.leading, 14) }
                            NavigationLink { MeetingPage(id: m.id) { Task { await load() } } } label: { MeetingRow(meeting: m) }.buttonStyle(.plain)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("الاجتماعات")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Button { creating = true } label: { Image(systemName: "plus").font(.body.weight(.semibold)).accessibilityLabel("اجتماع جديد") }
                }
            }
        }
        .refreshable { await load() }
        .task(id: mine) { await load() }
        .toast($toast)
        .sheet(isPresented: $creating) {
            MeetingSheet(existing: nil) { toast = ToastItem(text: "جُدول الاجتماع"); Task { await load() } }
        }
    }

    private func load() async {
        do {
            items = try await APIClient.shared.meetings(mine: mine)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

struct MeetingRow: View {
    let meeting: Meeting

    var body: some View {
        let st = MeetingVocabulary.status(meeting.status)
        let links = [meeting.projectName, meeting.clientName, meeting.requestName].filter { !$0.isEmpty }.joined(separator: " · ")
        HStack(alignment: .top, spacing: 10) {
            VStack(spacing: 2) {
                Text(MeetingFmt.date(meeting.startsAt).map { Fmt.dayMonth(Fmt.isoDay($0)) } ?? "")
                    .font(.caption.weight(.bold)).monospacedDigit()
                Text(MeetingFmt.time(meeting.startsAt)).font(.caption2).foregroundStyle(Buad.muted)
            }
            .frame(width: 64)
            .padding(.vertical, 8)
            .background(Buad.brandSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(meeting.title).font(.subheadline.weight(.semibold)).foregroundStyle(Buad.ink).lineLimit(2).multilineTextAlignment(.leading)
                let meta = [meeting.location, links].filter { !$0.isEmpty }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
                HStack(spacing: 6) {
                    if meeting.status != "scheduled" || !meeting.upcoming { Pill(text: st.label, tone: st.tone) }
                    if meeting.openDecisions > 0 { Pill(text: "\(meeting.openDecisions) قرار مفتوح", tone: .warn) }
                }
            }
            Spacer(minLength: 0)
            Chevron()
        }
        .padding(12)
        .contentShape(Rectangle())
    }
}

// MARK: - One meeting

/// A meeting: when and where, who was invited, what it is about (tap to open it), the agenda and
/// minutes, and its decisions with their owners. «تعديل»، «قرار»، الحالة، and delete for who may manage it.
struct MeetingPage: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @Environment(\.dismiss) private var dismiss
    let id: String
    let changed: () -> Void

    @State private var detail: MeetingDetail?
    @State private var error: String?
    @State private var editing = false
    @State private var addingDecision = false
    @State private var confirmDelete = false
    @State private var toast: ToastItem?

    private var canEdit: Bool { session.me?.can("meetings.edit") ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let d = detail {
                    header(d.meeting)
                    if let error { RefreshBanner(text: error) }
                    if canEdit && d.meeting.canManage { actions(d.meeting) }
                    about(d.meeting)
                    if !d.meeting.agenda.isEmpty { textCard("جدول الأعمال", d.meeting.agenda) }
                    if !d.meeting.minutes.isEmpty { textCard("المحضر", d.meeting.minutes) }
                    decisions(d)
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
        .navigationTitle("اجتماع")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { if detail == nil { await load() } }
        .toast($toast)
        .sheet(isPresented: $editing) {
            if let m = detail?.meeting { MeetingSheet(existing: m) { toast = ToastItem(text: "حُفظ الاجتماع"); changed(); Task { await load() } } }
        }
        .sheet(isPresented: $addingDecision) {
            if let m = detail?.meeting {
                DecisionSheet(existing: nil, meeting: m) { toast = ToastItem(text: "أُضيف القرار"); changed(); Task { await load() } }
            }
        }
        .confirmationDialog("حذف هذا الاجتماع؟", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("حذف الاجتماع", role: .destructive) { Task { await remove() } }
            Button("إلغاء", role: .cancel) {}
        } message: { Text("تبقى قراراته دون اجتماع. لا يمكن التراجع.") }
    }

    private func header(_ m: Meeting) -> some View {
        let st = MeetingVocabulary.status(m.status)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Pill(text: st.label, tone: st.tone)
                if m.upcoming { Pill(text: "قادم", tone: .info) }
            }
            Text(m.title).font(.title2.bold()).fixedSize(horizontal: false, vertical: true)
            Label(MeetingFmt.when(m.startsAt) + " · " + MeetingFmt.duration(m.durationMin), systemImage: "calendar")
                .font(.subheadline).foregroundStyle(Buad.ink)
            if !m.location.isEmpty { Label(m.location, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(Buad.muted) }
        }
    }

    private func actions(_ m: Meeting) -> some View {
        ActionRow {
            ActionTile(icon: "pencil", title: "تعديل", primary: true) { editing = true }
            ActionTile(icon: "plus.rectangle.on.rectangle", title: "قرار") { addingDecision = true }
            ActionMenuTile(icon: "arrow.left.arrow.right", title: "الحالة", detail: MeetingVocabulary.status(m.status).label) {
                ForEach(["scheduled", "done", "cancelled"].filter { $0 != m.status }, id: \.self) { k in
                    Button(MeetingVocabulary.status(k).label) { Task { await setStatus(k) } }
                }
            }
            ActionTile(icon: "trash", title: "حذف") { confirmDelete = true }
        }
    }

    @ViewBuilder private func about(_ m: Meeting) -> some View {
        let links: [(String, String, String)] = [
            (m.projectId.isEmpty ? "" : "المشروع", m.projectName, "/projects/\(m.projectId)"),
            (m.clientId.isEmpty ? "" : "العميل", m.clientName, "/clients/\(m.clientId)"),
            (m.requestId.isEmpty ? "" : "الفرصة", m.requestName, "/sales/\(m.requestId)"),
        ].filter { !$0.0.isEmpty }
        if !links.isEmpty || !m.attendees.isEmpty {
            Card {
                ForEach(links, id: \.0) { title, name, link in
                    Button { nav.open(link) } label: {
                        HStack {
                            Text(title).foregroundStyle(Buad.muted)
                            Spacer()
                            Text(name.isEmpty ? "فتح" : name).foregroundStyle(Buad.accentInk).lineLimit(1)
                            Chevron()
                        }
                        .font(.subheadline)
                        .frame(minHeight: Buad.tap)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                if !m.attendees.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("المدعوون (\(m.attendees.count))").font(.caption).foregroundStyle(Buad.muted)
                        Text(m.attendees.map(\.name).filter { !$0.isEmpty }.joined(separator: "، ")).font(.subheadline)
                    }
                }
            }
        }
    }

    private func textCard(_ title: String, _ text: String) -> some View {
        Card {
            Text(title).font(.headline)
            Text(text).font(.subheadline).foregroundStyle(Buad.ink).textSelection(.enabled)
        }
    }

    @ViewBuilder private func decisions(_ d: MeetingDetail) -> some View {
        HStack {
            Text("القرارات").font(.headline)
            Spacer()
            Text(verbatim: String(d.decisions.count)).font(.caption).foregroundStyle(Buad.muted).monospacedDigit()
        }
        if d.decisions.isEmpty {
            EmptyNote(text: canEdit && d.meeting.canManage ? "لا قرارات بعد. اضغط «قرار» لتسجّل ما اتُّفق عليه." : "لا قرارات مسجلة.", icon: "checkmark.seal")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(d.decisions.enumerated()), id: \.element.id) { i, x in
                    if i > 0 { Divider().padding(.leading, 52) }
                    DecisionRow(decision: x) { Task { await load() }; changed() }
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func load() async {
        do { detail = try await APIClient.shared.meeting(id); error = nil } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }

    private func setStatus(_ k: String) async {
        do {
            try await APIClient.shared.updateMeeting(id, ["status": k])
            toast = ToastItem(text: k == "done" ? "عُلّم الاجتماع منعقداً، وسُجّل في سجل تواصل عميله" : k == "cancelled" ? "أُلغي الاجتماع" : "أُعيد جدولته")
            changed()
            await load()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func remove() async {
        do {
            try await APIClient.shared.deleteMeeting(id)
            changed()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحذف"
        }
    }
}

// MARK: - Planning a meeting

/// «اجتماع جديد» / «تعديل الاجتماع»: title, day and time, length, place, who is invited, what it is
/// about (a project and/or a client; an opportunity when planned from its page), agenda and minutes.
struct MeetingSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let existing: Meeting?
    /// A new meeting about a record: its project, client or opportunity come filled.
    var projectId = ""
    var clientId = ""
    var requestId = ""
    let saved: () -> Void

    @State private var title = ""
    @State private var startsAt = Date().addingTimeInterval(86_400)
    @State private var duration = 60
    @State private var location = ""
    @State private var attendees = Set<String>()
    @State private var project = ""
    @State private var client = ""
    @State private var clientName = ""
    @State private var request = ""
    @State private var agenda = ""
    @State private var minutes = ""
    @State private var people: [Person] = []
    @State private var projects: [ProjectItem] = []
    @State private var choosingClient = false
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline = ""

    private var snapshot: String {
        [title, MeetingFmt.string(startsAt), String(duration), location, attendees.sorted().joined(separator: ","), project, client, agenda, minutes].joined(separator: "|")
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    TextField("عنوان الاجتماع *", text: $title)
                    DatePicker("اليوم والوقت", selection: $startsAt)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    Stepper(value: $duration, in: 15...480, step: 15) {
                        HStack { Text("المدة"); Spacer(); Text(MeetingFmt.duration(duration)).monospacedDigit().foregroundStyle(Buad.muted) }
                    }
                    TextField("المكان أو الرابط", text: $location)
                }
                Section("يخص") {
                    if !projects.isEmpty {
                        Picker("المشروع", selection: $project) {
                            Text("بلا مشروع").tag("")
                            ForEach(projects) { Text($0.name).tag($0.id) }
                        }
                    }
                    Button { choosingClient = true } label: {
                        HStack {
                            Text("العميل").foregroundStyle(Buad.ink)
                            Spacer()
                            Text(clientName.isEmpty ? "بلا عميل" : clientName).foregroundStyle(clientName.isEmpty ? Buad.muted : Buad.accentInk)
                            Chevron()
                        }
                    }
                }
                if !people.isEmpty {
                    Section {
                        ForEach(people) { p in
                            Button {
                                if attendees.contains(p.id) { attendees.remove(p.id) } else { attendees.insert(p.id) }
                            } label: {
                                HStack {
                                    Text(p.name).foregroundStyle(Buad.ink)
                                    Spacer()
                                    Image(systemName: attendees.contains(p.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(attendees.contains(p.id) ? Buad.accentInk : Buad.faint)
                                }
                            }
                        }
                    } header: { Text("المدعوون") } footer: { Text("يصل المدعوّين إشعار بالاجتماع.") }
                }
                Section("جدول الأعمال") { TextField("النقاط التي سيناقشها الاجتماع", text: $agenda, axis: .vertical).lineLimit(3...8) }
                Section {
                    TextField("ما دار في الاجتماع", text: $minutes, axis: .vertical).lineLimit(3...12)
                } header: { Text("المحضر") } footer: {
                    Text("عند تعليم الاجتماع «عُقد» يُسجَّل في سجل تواصل العميل المرتبط.")
                }
            }
            .navigationTitle(existing == nil ? "اجتماع جديد" : "تعديل الاجتماع")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && snapshot != baseline, busy: busy, saveTitle: existing == nil ? "جدولة" : "حفظ") { Task { await save() } }
            .sheet(isPresented: $choosingClient) {
                ClientPicker { c in client = c?.id ?? ""; clientName = c?.name ?? "" }
            }
            .task {
                if !started {
                    if let m = existing {
                        title = m.title; startsAt = MeetingFmt.date(m.startsAt) ?? startsAt; duration = m.durationMin
                        location = m.location; attendees = Set(m.attendees.map(\.id)); project = m.projectId
                        client = m.clientId; clientName = m.clientName; request = m.requestId; agenda = m.agenda; minutes = m.minutes
                    } else {
                        project = projectId; client = clientId; request = requestId
                    }
                    baseline = snapshot
                    started = true
                }
                people = (try? await APIClient.shared.assignees()) ?? []
                if session.me?.can("projects.view") == true {
                    projects = (try? await APIClient.shared.projects().items) ?? []
                }
                if existing == nil, !clientId.isEmpty, clientName.isEmpty {
                    clientName = (try? await APIClient.shared.clients().first { $0.id == clientId }?.name) ?? ""
                }
            }
        }
    }

    private func save() async {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "اكتب عنوان الاجتماع."; return }
        let body: [String: Any] = [
            "title": t, "startsAt": MeetingFmt.string(startsAt), "durationMin": duration,
            "location": location.trimmingCharacters(in: .whitespaces), "attendeeIds": Array(attendees),
            "clientId": client, "requestId": request, "projectId": project,
            "agenda": agenda.trimmingCharacters(in: .whitespacesAndNewlines),
            "minutes": minutes.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        error = nil
        busy = true
        defer { busy = false }
        do {
            if let m = existing { try await APIClient.shared.updateMeeting(m.id, body) } else { _ = try await APIClient.shared.createMeeting(body) }
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

// MARK: - A record's meetings

/// The meetings about one project, client or opportunity, with «اجتماع جديد» (RecordMeetings.tsx).
struct MeetingsSection: View {
    @EnvironmentObject private var session: Session
    var projectId = ""
    var clientId = ""
    var requestId = ""
    /// A client to fill in on a new meeting without filtering the list by it (an opportunity's client).
    var presetClientId = ""

    @State private var items: [Meeting] = []
    @State private var loaded = false
    @State private var creating = false

    private var canView: Bool { session.me?.can("meetings.view") ?? false }
    private var canEdit: Bool { session.me?.can("meetings.edit") ?? false }

    var body: some View {
        if canView {
            Card {
                HStack {
                    Label("الاجتماعات", systemImage: "person.3").font(.headline)
                    Spacer()
                    if canEdit {
                        Button { creating = true } label: { Label("اجتماع", systemImage: "plus").font(.subheadline.weight(.semibold)) }
                            .frame(minHeight: Buad.tap)
                    }
                }
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity)
                } else if items.isEmpty {
                    Text("لا اجتماعات مرتبطة.").font(.subheadline).foregroundStyle(Buad.muted)
                } else {
                    ForEach(items.sorted { $0.startsAt > $1.startsAt }.prefix(5)) { m in
                        NavigationLink { MeetingPage(id: m.id) { Task { await load() } } } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.title).font(.subheadline.weight(.medium)).foregroundStyle(Buad.ink).lineLimit(1)
                                    Text(MeetingFmt.when(m.startsAt)).font(.caption).foregroundStyle(Buad.muted)
                                }
                                Spacer()
                                if m.openDecisions > 0 { Pill(text: "\(m.openDecisions) قرار", tone: .warn) }
                                Chevron()
                            }
                            .frame(minHeight: Buad.tap)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .task { await load() }
            .sheet(isPresented: $creating) {
                MeetingSheet(existing: nil, projectId: projectId, clientId: clientId.isEmpty ? presetClientId : clientId, requestId: requestId) { Task { await load() } }
            }
        }
    }

    private func load() async {
        items = (try? await APIClient.shared.meetings(projectId: projectId, clientId: clientId, requestId: requestId)) ?? items
        loaded = true
    }
}

// MARK: - «القرارات»

/// «القرارات»: what was decided and who owns it — open first, with the due date; tick one to close it,
/// or turn it into a task. «قراراتي» narrows it to the ones that are mine.
struct DecisionsView: View {
    @EnvironmentObject private var session: Session
    @State private var items: [DecisionItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var mine = true
    @State private var filter = "open"
    @State private var creating = false
    @State private var toast: ToastItem?

    private var canEdit: Bool { session.me?.can("meetings.edit") ?? false }
    private var shown: [DecisionItem] { filter == "all" ? items : items.filter { $0.status == filter } }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Picker("النطاق", selection: $mine) {
                    Text("قراراتي").tag(true)
                    Text("كل الفريق").tag(false)
                }
                .pickerStyle(.segmented)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "مفتوحة", count: items.filter { $0.status == "open" }.count, on: filter == "open") { filter = "open" }
                        FilterChip(title: "منفّذة", count: items.filter { $0.status == "done" }.count, on: filter == "done") { filter = "done" }
                        FilterChip(title: "ملغاة", count: items.filter { $0.status == "cancelled" }.count, on: filter == "cancelled") { filter = "cancelled" }
                        FilterChip(title: "الكل", count: items.count, on: filter == "all") { filter = "all" }
                    }
                    .padding(.horizontal, Buad.gutter)
                }
                .padding(.horizontal, -Buad.gutter)
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if shown.isEmpty {
                    EmptyNote(text: mine ? "لا قرارات مسندة إليك في هذا العرض." : "لا قرارات في هذا العرض.", icon: "checkmark.seal")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { i, x in
                            if i > 0 { Divider().padding(.leading, 52) }
                            DecisionRow(decision: x) { Task { await load() } }
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("القرارات")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Button { creating = true } label: { Image(systemName: "plus").font(.body.weight(.semibold)).accessibilityLabel("قرار جديد") }
                }
            }
        }
        .refreshable { await load() }
        .task(id: mine) { await load() }
        .toast($toast)
        .sheet(isPresented: $creating) {
            DecisionSheet(existing: nil, meeting: nil) { toast = ToastItem(text: "أُضيف القرار"); Task { await load() } }
        }
    }

    private func load() async {
        do {
            items = try await APIClient.shared.decisions(mine: mine)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

/// One decision: tick to close it (or reopen), its owner and date, and a menu to edit, turn into a task or delete.
struct DecisionRow: View {
    @EnvironmentObject private var session: Session
    let decision: DecisionItem
    let changed: () -> Void

    @State private var editing = false
    @State private var error: String?
    @State private var busy = false

    private var canTask: Bool { session.me?.can("tasks.edit") ?? false }

    var body: some View {
        let x = decision
        let st = MeetingVocabulary.decisionStatus(x.status)
        HStack(alignment: .center, spacing: 6) {
            Button { Task { await set(x.status == "done" ? "open" : "done") } } label: {
                Image(systemName: x.status == "done" ? "checkmark.circle.fill" : "circle")
                    .font(.title3).foregroundStyle(x.status == "done" ? Buad.success : Buad.faint)
                    .frame(width: Buad.tap, height: Buad.tap).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!x.canClose || busy)
            .accessibilityLabel(x.status == "done" ? "إعادة فتح القرار" : "تعليم القرار منفّذاً")
            VStack(alignment: .leading, spacing: 3) {
                Text(x.title).font(.subheadline.weight(.medium)).strikethrough(x.status == "done")
                    .foregroundStyle(x.status == "open" ? Buad.ink : Buad.muted).multilineTextAlignment(.leading)
                let meta = [x.ownerName, x.dueDate.isEmpty ? "" : (x.overdue ? "متأخر · " : "حتى ") + Fmt.dayMonth(x.dueDate), x.meetingTitle]
                    .filter { !$0.isEmpty }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(x.overdue ? Buad.dangerInk : Buad.muted).lineLimit(2) }
                if let error { Text(error).font(.caption).foregroundStyle(Buad.dangerInk) }
            }
            Spacer(minLength: 4)
            if x.status != "open" { Pill(text: st.label, tone: st.tone) }
            if !x.taskId.isEmpty { Image(systemName: "checklist").font(.caption).foregroundStyle(Buad.infoInk).accessibilityLabel("حُوّل إلى مهمة") }
            if x.canEdit || x.canClose {
                Menu {
                    if x.canEdit { Button { editing = true } label: { Label("تعديل", systemImage: "pencil") } }
                    if x.canClose && x.taskId.isEmpty && canTask && x.status == "open" {
                        Button { Task { await toTask() } } label: { Label("تحويل إلى مهمة", systemImage: "checklist") }
                    }
                    if x.canClose && x.status != "cancelled" { Button { Task { await set("cancelled") } } label: { Label("إلغاء القرار", systemImage: "xmark.circle") } }
                    if x.canEdit { Button(role: .destructive) { Task { await remove() } } label: { Label("حذف", systemImage: "trash") } }
                } label: {
                    Image(systemName: "ellipsis").frame(width: 32, height: Buad.tap).contentShape(Rectangle())
                }
                .foregroundStyle(Buad.muted)
            }
        }
        .padding(.vertical, 4)
        .padding(.trailing, 8)
        .sheet(isPresented: $editing) {
            DecisionSheet(existing: x, meeting: nil) { changed() }
        }
    }

    private func run(_ work: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do { try await work(); error = nil; changed() } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }

    private func set(_ status: String) async { await run { try await APIClient.shared.updateDecision(decision.id, ["status": status]) } }
    private func toTask() async { await run { try await APIClient.shared.decisionToTask(decision.id) } }
    private func remove() async { await run { try await APIClient.shared.deleteDecision(decision.id) } }
}

/// «قرار جديد» / «تعديل القرار»: what was decided, details, who owns it, the due date, and its status.
struct DecisionSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let existing: DecisionItem?
    let meeting: Meeting?
    let saved: () -> Void

    @State private var title = ""
    @State private var details = ""
    @State private var owner = ""
    @State private var due: Date?
    @State private var status = "open"
    @State private var people: [Person] = []
    @State private var error: String?
    @State private var busy = false
    @State private var started = false
    @State private var baseline = ""

    private var snapshot: String { [title, details, owner, due.map(Fmt.isoDay) ?? "", status].joined(separator: "|") }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    TextField("القرار *", text: $title, axis: .vertical)
                    TextField("تفاصيل", text: $details, axis: .vertical).lineLimit(2...6)
                } footer: { if let m = meeting { Text("من اجتماع «\(m.title)».") } }
                Section {
                    Picker("المسؤول", selection: $owner) {
                        Text("غير مسند").tag("")
                        ForEach(people) { Text($0.name).tag($0.id) }
                    }
                    OptionalDateRow(title: "موعد التنفيذ", date: $due)
                    if existing != nil {
                        Picker("الحالة", selection: $status) {
                            ForEach(["open", "done", "cancelled"], id: \.self) { Text(MeetingVocabulary.decisionStatus($0).label).tag($0) }
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "قرار جديد" : "تعديل القرار")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && snapshot != baseline, busy: busy, saveTitle: existing == nil ? "إضافة" : "حفظ") { Task { await save() } }
            .task {
                if !started {
                    if let x = existing { title = x.title; details = x.details; owner = x.ownerId; due = Fmt.date(x.dueDate); status = x.status }
                    baseline = snapshot
                    started = true
                }
                people = (try? await APIClient.shared.assignees()) ?? []
            }
        }
    }

    private func save() async {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "اكتب القرار."; return }
        var body: [String: Any] = ["title": t, "details": details.trimmingCharacters(in: .whitespacesAndNewlines), "ownerId": owner, "dueDate": due.map(Fmt.isoDay) ?? ""]
        busy = true
        defer { busy = false }
        do {
            if let x = existing {
                body["status"] = status
                try await APIClient.shared.updateDecision(x.id, body)
            } else {
                if let m = meeting { body["meetingId"] = m.id; if !m.projectId.isEmpty { body["projectId"] = m.projectId } }
                try await APIClient.shared.createDecision(body)
            }
            saved()
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}
