import SwiftUI

/// «المهام» (features/tasks/TasksPage.tsx): mine or the whole team's, across projects and company
/// work, open / late / done. Completing and postponing are the app's first writes: the website's
/// own PATCH /api/tasks/:id, allowed only with tasks.edit, and the list reloads from the server after.
struct TasksView: View {
    @EnvironmentObject private var session: Session
    @State private var mine = true
    @State private var view = "open"
    @State private var query = ""
    @State private var items: [TaskItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var busy: Set<String> = []
    @State private var postponing: TaskItem?
    @State private var notice: String?

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
                } else if let error {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if shown.isEmpty {
                    EmptyNote(text: mine ? "المهام المسندة إليك تظهر هنا." : "لا مهام في هذا العرض.", icon: "checklist")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { i, t in
                            if i > 0 { Divider().padding(.leading, 52) }
                            row(t)
                        }
                    }
                    .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
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
        .onChange(of: mine) { _, _ in Task { await load() } }
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
                        if done { Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white) }
                        if busy.contains(t.id) { ProgressView().controlSize(.mini) }
                    }
                    .frame(width: 26, height: 26)
                    .padding(.top, 1)
                }
                .buttonStyle(.plain)
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
            Pill(text: st.label, tone: st.tone)
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
            if !t.projectId.isEmpty, let url = APIClient.shared.webURL("/projects/\(t.projectId)?view=execution") {
                Link(destination: url) { Label("فتح في الموقع", systemImage: "safari") }
            }
        }
    }

    private func load() async {
        do {
            items = try await APIClient.shared.tasks(mine: mine)
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
        } catch {
            session.handle(error)
            notice = (error as? APIError)?.message ?? APIError.network.message
        }
    }
}

/// «تأجيل»: a new due date for the task. Quick picks, or any day from the calendar.
private struct PostponeSheet: View {
    let task: TaskItem
    let save: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()

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
            .navigationTitle("تأجيل المهمة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
    }
}
