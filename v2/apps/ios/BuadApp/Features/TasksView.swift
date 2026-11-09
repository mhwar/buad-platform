import SwiftUI

/// «المهام» (features/tasks/TasksPage.tsx): mine or the whole team's, across projects and company
/// work, open / late / done. Completing and postponing are the app's first writes: the website's
/// own PATCH /api/tasks/:id, allowed only with tasks.edit, and the list reloads from the server after.
struct TasksView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var nav: Navigator
    @State private var mine = true
    @State private var view = "open"
    @State private var query = ""
    @State private var items: [TaskItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var busy: Set<String> = []
    @State private var postponing: TaskItem?
    @State private var notice: String?
    @State private var toast: ToastItem?
    /// «مهامي» ⇄ «كل الفريق» is loading: the old rows are dimmed so they are not mistaken for the new scope.
    @State private var switching = false

    /// The website's empty states for each filter (features/tasks/TasksPage.tsx).
    private var emptyText: String {
        if !query.trimmingCharacters(in: .whitespaces).isEmpty { return "لا مهام تطابق البحث." }
        switch view {
        case "late": return "لا مهام متأخرة."
        case "done": return "لا مهام منجزة بعد."
        default: return mine ? "لا مهام مفتوحة. المهام المسندة إليك تظهر هنا." : "لا مهام مفتوحة للفريق."
        }
    }

    private var canEdit: Bool { session.me?.can("tasks.edit") ?? false }

    private var pool: [TaskItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return items }
        return items.filter { "\($0.title) \($0.projectName) \($0.assigneeName)".localizedCaseInsensitiveContains(q) }
    }

    private var shown: [TaskItem] {
        pool.filter { view == "done" ? $0.status == "done" : view == "late" ? $0.overdue : $0.status != "done" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("النطاق", selection: $mine) {
                    Text("مهامي").tag(true)
                    Text("كل الفريق").tag(false)
                }
                .pickerStyle(.segmented)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "مفتوحة", count: pool.filter { $0.status != "done" }.count, on: view == "open") { view = "open" }
                        FilterChip(title: "متأخرة", count: pool.filter(\.overdue).count, on: view == "late") { view = "late" }
                        FilterChip(title: "منجزة", count: pool.filter { $0.status == "done" }.count, on: view == "done") { view = "done" }
                    }
                    .padding(.horizontal, Buad.gutter)
                }
                .padding(.horizontal, -Buad.gutter)

                if let notice {
                    Text(notice).font(.footnote).foregroundStyle(Buad.dangerInk)
                }

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 28)
                } else if let error, items.isEmpty {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if shown.isEmpty {
                    EmptyNote(text: emptyText, icon: query.isEmpty ? "checklist" : "magnifyingglass")
                } else {
                    if let error { RefreshBanner(text: error) }
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { i, t in
                            if i > 0 { Divider().padding(.leading, 52) }
                            row(t)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
                    .opacity(switching ? 0.4 : 1)
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("المهام")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "ابحث في المهام")
        .refreshable { await load() }
        .task { if !loaded { await load() } }
        .onChange(of: mine) { _, _ in
            switching = true
            Task { await load(); switching = false }
        }
        .toast($toast)
        .sheet(item: $postponing) { t in
            PostponeSheet(task: t) { day in
                postponing = nil
                Task { await update(t, ["dueDate": day]) }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func row(_ t: TaskItem) -> some View {
        let done = t.status == "done"
        let st = Vocabulary.taskStatus(t.status)
        return HStack(alignment: .top, spacing: 12) {
            if canEdit {
                Button {
                    Task { await update(t, ["status": done ? "todo" : "done"]) }
                } label: {
                    ZStack {
                        Circle().strokeBorder(done ? Buad.success : Buad.faint, lineWidth: 2)
                            .background(Circle().fill(done ? Buad.success : .clear))
                        if done { Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(Buad.onInk) }
                        if busy.contains(t.id) { ProgressView().controlSize(.mini) }
                    }
                    .frame(width: 26, height: 26)
                    .frame(width: Buad.tap, height: Buad.tap)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -9)
                .padding(.leading, -9)
                .disabled(busy.contains(t.id))
                .accessibilityLabel(done ? "إعادة فتح \(t.title)" : "إنجاز \(t.title)")
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(t.title).font(.subheadline.weight(.medium))
                    .strikethrough(done).foregroundStyle(done ? Buad.muted : Buad.ink)
                    .multilineTextAlignment(.leading)
                let meta = [
                    t.assigneeName.isEmpty || mine ? "" : "المسؤول: \(t.assigneeName)",
                    t.projectName,
                ].filter { !$0.isEmpty }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(Buad.muted).lineLimit(1) }
                HStack(spacing: 6) {
                    if !t.dueDate.isEmpty {
                        Text(t.overdue ? "متأخرة · \(Fmt.day(t.dueDate))" : "حتى \(Fmt.day(t.dueDate))")
                            .font(.caption.weight(t.overdue ? .semibold : .regular))
                            .foregroundStyle(t.overdue ? Buad.dangerInk : Buad.muted)
                    }
                    if t.priority == "high" { Pill(text: "عالية", tone: .bad) }
                }
            }
            Spacer(minLength: 6)
            if canEdit && !done {
                // The status is the menu, as the website's BadgeMenu: status, «تأجيل», and the website.
                Menu {
                    statusActions(t)
                } label: {
                    HStack(spacing: 3) {
                        Pill(text: st.label, tone: st.tone)
                        Image(systemName: "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Buad.faint)
                    }
                    .frame(minHeight: Buad.tap)
                    .contentShape(Rectangle())
                }
                .padding(.vertical, -11)
                .accessibilityLabel("الحالة: \(st.label). إجراءات \(t.title)")
            } else {
                Pill(text: st.label, tone: st.tone)
            }
        }
        .padding(14)
        .contentShape(Rectangle())
        .contextMenu {
            if canEdit && !done {
                Button { postponing = t } label: { Label("تأجيل", systemImage: "calendar.badge.clock") }
                if t.status != "doing" {
                    Button { Task { await update(t, ["status": "doing"]) } } label: { Label("قيد التنفيذ", systemImage: "play.circle") }
                }
                if t.status != "blocked" {
                    Button { Task { await update(t, ["status": "blocked"]) } } label: { Label("معلّقة", systemImage: "pause.circle") }
                }
            }
            if !t.projectId.isEmpty {
                Button { nav.open("/projects/\(t.projectId)") } label: { Label("فتح المشروع", systemImage: "briefcase") }
            }
        }
    }

    @ViewBuilder private func statusActions(_ t: TaskItem) -> some View {
        if t.status != "doing" {
            Button { Task { await update(t, ["status": "doing"]) } } label: { Label("قيد التنفيذ", systemImage: "play.circle") }
        }
        if t.status != "blocked" {
            Button { Task { await update(t, ["status": "blocked"]) } } label: { Label("معلّقة", systemImage: "pause.circle") }
        }
        if t.status != "todo" {
            Button { Task { await update(t, ["status": "todo"]) } } label: { Label("لم تبدأ", systemImage: "circle") }
        }
        Button { postponing = t } label: { Label("تأجيل", systemImage: "calendar.badge.clock") }
        if !t.projectId.isEmpty {
            Button { nav.open("/projects/\(t.projectId)") } label: { Label("فتح المشروع", systemImage: "briefcase") }
        }
    }

    private func load() async {
        do {
            let scope = mine
            let fresh = try await APIClient.shared.tasks(mine: scope)
            guard scope == mine else { return }
            items = fresh
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }

    private func update(_ t: TaskItem, _ fields: [String: String]) async {
        busy.insert(t.id)
        defer { busy.remove(t.id) }
        do {
            try await APIClient.shared.updateTask(t.id, fields)
            notice = nil
            await load()
            let previous = ["status": t.status, "dueDate": t.dueDate].filter { fields[$0.key] != nil }
            let text = fields["status"] == "done" ? "أُنجزت «\(t.title)»"
                : fields["status"] == "todo" && t.status == "done" ? "أُعيد فتح «\(t.title)»"
                : fields["dueDate"] != nil ? "أُجّلت إلى \(Fmt.day(fields["dueDate"] ?? ""))" : "حُفظت المهمة"
            toast = ToastItem(text: text) {
                try? await APIClient.shared.updateTask(t.id, previous)
                await load()
            }
        } catch {
            session.handle(error)
            notice = (error as? APIError)?.message ?? APIError.network.message
            Haptic.warning()
            Task { @MainActor in try? await Task.sleep(for: .seconds(6)); notice = nil }
        }
    }
}

/// «تأجيل»: a new due date for the task. Quick picks, or any day from the calendar.
private struct PostponeSheet: View {
    let task: TaskItem
    let save: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()

    /// The calendar starts from the current due date (or tomorrow), not from today.
    private var start: Date {
        if let due = Fmt.date(task.dueDate), due > Date() { return due }
        return Date().addingTimeInterval(86_400)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button("غداً") { save(Fmt.isoDay(addingDays: 1)) }
                    Button("بعد 3 أيام") { save(Fmt.isoDay(addingDays: 3)) }
                    Button("بعد أسبوع") { save(Fmt.isoDay(addingDays: 7)) }
                } header: {
                    Text(task.dueDate.isEmpty ? "بلا تاريخ استحقاق" : "الاستحقاق الحالي: \(Fmt.day(task.dueDate))")
                }
                Section {
                    DatePicker("تاريخ آخر", selection: $date, in: Date()..., displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    Button("حفظ التاريخ") { save(Fmt.isoDay(date)) }.bold()
                }
            }
            .onAppear { date = start }
            .navigationTitle("تأجيل المهمة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
    }
}
