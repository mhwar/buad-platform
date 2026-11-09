import SwiftUI

/// «المهام» on the project page (features/tasks/ExecutionTab.tsx): the stages in order — tap the circle
/// to move one along (لم تبدأ ← قيد التنفيذ ← منجزة), add one, generate them from the service's
/// «آلية العمل» — then the tasks with their tick, owner and date, «تسجيل وقت», edit and delete.
/// Writes need tasks.edit.
struct ProjectWorkTab: View {
    @EnvironmentObject private var session: Session
    let projectId: String
    let execution: Execution?
    let loaded: Bool
    @Binding var newTask: Bool
    @Binding var newStage: Bool
    let reload: () async -> Void
    let toast: (String) -> Void

    @State private var editing: TaskItem?
    @State private var timing: TaskItem?
    @State private var deleting: TaskItem?
    @State private var deletingStage: Stage?
    @State private var stageTitle = ""
    @State private var busy = false
    @State private var error: String?
    @State private var showDone = false

    private var canEdit: Bool { session.me?.can("tasks.edit") ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let error { RefreshBanner(text: error) }
            if let x = execution {
                summary(x)
                stages(x)
                tasks(x)
            } else {
                EmptyNote(text: loaded ? "تعذّر تحميل المهام." : "جارٍ التحميل…", icon: "checklist")
            }
        }
        .sheet(isPresented: $newTask) {
            TaskSheet(projectId: projectId, stages: execution?.stages ?? [], existing: nil) { m in toast(m); Task { await reload() } }
        }
        .sheet(item: $editing) { t in
            TaskSheet(projectId: projectId, stages: execution?.stages ?? [], existing: t) { m in toast(m); Task { await reload() } }
        }
        .sheet(item: $timing) { t in
            TimeSheet(task: t) { m in toast(m); Task { await reload() } }
                .presentationDetents([.medium])
        }
        .alert("مرحلة جديدة", isPresented: $newStage) {
            TextField("اسم المرحلة", text: $stageTitle)
            Button("إضافة") { Task { await addStage() } }
            Button("إلغاء", role: .cancel) { stageTitle = "" }
        }
        .confirmationDialog("حذف المهمة «\(deleting?.title ?? "")»؟", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible, presenting: deleting) { t in
            Button("حذف المهمة", role: .destructive) { Task { await run("حُذفت المهمة") { try await APIClient.shared.deleteTask(t.id) } } }
            Button("إلغاء", role: .cancel) {}
        }
        .confirmationDialog("حذف المرحلة «\(deletingStage?.title ?? "")»؟", isPresented: Binding(get: { deletingStage != nil }, set: { if !$0 { deletingStage = nil } }),
                            titleVisibility: .visible, presenting: deletingStage) { s in
            Button("حذف المرحلة", role: .destructive) { Task { await run("حُذفت المرحلة") { try await APIClient.shared.deleteStage(s.id) } } }
            Button("إلغاء", role: .cancel) {}
        } message: { _ in Text("مهامها تبقى في المشروع بلا مرحلة.") }
    }

    // MARK: summary

    private func summary(_ x: Execution) -> some View {
        let open = x.tasks.filter { $0.status != "done" }
        let late = open.filter(\.overdue).count
        return JoinedGrid {
            GridRow {
                cell("المراحل", x.stages.isEmpty ? "—" : "\(x.stages.filter { $0.status == "done" }.count)/\(x.stages.count)")
                cell("المهام المفتوحة", String(open.count), tone: nil)
                cell("المتأخرة", String(late), tone: late > 0 ? .bad : nil)
                cell("الوقت", x.minutes > 0 ? Fmt.hours(x.minutes) : "—")
            }
        }
    }

    private func cell(_ title: String, _ value: String, tone: Tone? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(Buad.muted).lineLimit(1)
            Text(value).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(tone?.foreground ?? Buad.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .joinedCell(minHeight: 54)
    }

    // MARK: stages

    @ViewBuilder private func stages(_ x: Execution) -> some View {
        Text("المراحل").font(.headline)
        if x.stages.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("قسّم العمل إلى مراحل تتابع تقدّمها: التحضير، التنفيذ، التسليم…").font(.footnote).foregroundStyle(Buad.muted)
                if canEdit && x.hasService {
                    Button { Task { await run("وُلّدت المراحل من آلية عمل الخدمة") { try await APIClient.shared.stagesFromService(projectId) } } } label: {
                        Label("توليد من آلية عمل الخدمة", systemImage: "wand.and.stars")
                            .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: Buad.tap)
                            .background(Buad.accentSoft, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                            .foregroundStyle(Buad.accentInk)
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                }
            }
            .padding(14)
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        } else {
            let done = x.stages.filter { $0.status == "done" }.count
            ProgressView(value: Double(done), total: Double(x.stages.count)).tint(Buad.success)
            VStack(spacing: 0) {
                ForEach(Array(x.stages.enumerated()), id: \.element.id) { i, st in
                    if i > 0 { Divider().padding(.leading, 52) }
                    stageRow(st, index: i + 1)
                }
            }
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
        }
    }

    private func stageRow(_ st: Stage, index: Int) -> some View {
        let s = Vocabulary.taskStatus(st.status)
        return HStack(spacing: 12) {
            Button {
                let next = st.status == "todo" ? "doing" : st.status == "doing" ? "done" : "todo"
                Task { await run(nil) { try await APIClient.shared.updateStage(st.id, ["status": next]) } }
            } label: {
                ZStack {
                    Circle().stroke(st.status == "todo" ? Buad.line : Buad.success, lineWidth: 2)
                    if st.status == "done" {
                        Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(Buad.success)
                    } else if st.status == "doing" {
                        Circle().trim(from: 0, to: 0.5).fill(Buad.success).rotationEffect(.degrees(-90)).padding(3)
                    } else {
                        Text(verbatim: String(index)).font(.caption2.weight(.semibold)).foregroundStyle(Buad.muted)
                    }
                }
                .frame(width: 26, height: 26)
                .frame(width: Buad.tap, height: Buad.tap)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!canEdit || busy)
            .accessibilityLabel("\(st.title)، \(s.label)")
            .accessibilityHint(canEdit ? "لنقلها إلى الحالة التالية" : "")
            VStack(alignment: .leading, spacing: 2) {
                Text(st.title).font(.subheadline.weight(.medium))
                    .foregroundStyle(st.status == "done" ? Buad.muted : Buad.ink)
                if !st.dueDate.isEmpty { Text(Fmt.day(st.dueDate)).font(.caption).foregroundStyle(Buad.muted) }
            }
            Spacer()
            Pill(text: s.label, tone: s.tone)
            if canEdit {
                Menu {
                    ForEach(["todo", "doing", "done"], id: \.self) { k in
                        Button(Vocabulary.taskStatus(k).label) { Task { await run(nil) { try await APIClient.shared.updateStage(st.id, ["status": k]) } } }
                    }
                    Divider()
                    Button("حذف المرحلة", role: .destructive) { deletingStage = st }
                } label: {
                    Image(systemName: "ellipsis").frame(width: 32, height: Buad.tap).contentShape(Rectangle())
                }
                .foregroundStyle(Buad.muted)
            }
        }
        .padding(.horizontal, 6)
        .padding(.trailing, 6)
    }

    // MARK: tasks

    @ViewBuilder private func tasks(_ x: Execution) -> some View {
        let open = x.tasks.filter { $0.status != "done" }
        let closed = x.tasks.filter { $0.status == "done" }
        Text("المهام").font(.headline)
        if x.tasks.isEmpty {
            EmptyNote(text: canEdit ? "لا مهام بعد. أضف أول مهمة من زر «مهمة» أعلاه وأسندها لأحد الفريق." : "لا مهام لهذا المشروع.", icon: "checklist")
        } else {
            let byStage = Dictionary(grouping: open) { $0.stageId }
            let order = x.stages.map(\.id).filter { byStage[$0] != nil } + (byStage[""] != nil ? [""] : [])
            let orphan = byStage.keys.filter { k in !k.isEmpty && !x.stages.contains { $0.id == k } }
            ForEach(order + orphan, id: \.self) { sid in
                let list = byStage[sid] ?? []
                VStack(alignment: .leading, spacing: 6) {
                    if !x.stages.isEmpty {
                        Text(x.stages.first { $0.id == sid }?.title ?? "بلا مرحلة").font(.caption.weight(.semibold)).foregroundStyle(Buad.muted)
                    }
                    taskList(list)
                }
            }
            if open.isEmpty { Label("أُنجزت كل المهام", systemImage: "checkmark.seal").font(.subheadline).foregroundStyle(Buad.successInk) }
            if !closed.isEmpty {
                Button { withAnimation { showDone.toggle() } } label: {
                    HStack {
                        Text("المنجزة (\(closed.count))").font(.subheadline.weight(.semibold))
                        Spacer()
                        Image(systemName: showDone ? "chevron.up" : "chevron.down").font(.caption)
                    }
                    .foregroundStyle(Buad.muted).frame(minHeight: Buad.tap).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if showDone { taskList(closed) }
            }
        }
    }

    private func taskList(_ list: [TaskItem]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                if i > 0 { Divider().padding(.leading, 52) }
                taskRow(t)
            }
        }
        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
    }

    private func taskRow(_ t: TaskItem) -> some View {
        let done = t.status == "done"
        let meta = [t.assigneeName, t.dueDate.isEmpty ? "" : (t.overdue ? "متأخرة · " : "حتى ") + Fmt.dayMonth(t.dueDate),
                    Vocabulary.priority(t.priority).map { "أولوية \($0)" } ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
        return HStack(alignment: .center, spacing: 8) {
            Button {
                Task { await run(done ? nil : "أُنجزت «\(t.title)»") { try await APIClient.shared.patchTask(t.id, ["status": done ? "todo" : "done"]) } }
            } label: {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.title3).foregroundStyle(done ? Buad.success : Buad.faint)
                    .frame(width: Buad.tap, height: Buad.tap).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!canEdit || busy)
            .accessibilityLabel(done ? "إعادة فتح المهمة" : "إنجاز المهمة")
            .sensoryFeedback(.success, trigger: done)
            Button { if canEdit { editing = t } } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.title).font(.subheadline.weight(.medium)).strikethrough(done)
                        .foregroundStyle(done ? Buad.muted : Buad.ink).multilineTextAlignment(.leading)
                    if !meta.isEmpty { Text(meta).font(.caption).foregroundStyle(t.overdue ? Buad.dangerInk : Buad.muted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if t.status == "doing" || t.status == "blocked" {
                let s = Vocabulary.taskStatus(t.status)
                Pill(text: s.label, tone: s.tone)
            }
            if canEdit {
                Menu {
                    Button { editing = t } label: { Label("تعديل", systemImage: "pencil") }
                    Button { timing = t } label: { Label("تسجيل وقت", systemImage: "clock") }
                    Menu("الحالة") {
                        ForEach(["todo", "doing", "blocked", "done"], id: \.self) { k in
                            Button(Vocabulary.taskStatus(k).label) { Task { await run(nil) { try await APIClient.shared.patchTask(t.id, ["status": k]) } } }
                        }
                    }
                    Divider()
                    Button(role: .destructive) { deleting = t } label: { Label("حذف المهمة", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis").frame(width: 32, height: Buad.tap).contentShape(Rectangle())
                }
                .foregroundStyle(Buad.muted)
            }
        }
        .padding(.vertical, 4)
        .padding(.trailing, 8)
    }

    // MARK: actions

    private func addStage() async {
        let t = stageTitle.trimmingCharacters(in: .whitespaces)
        stageTitle = ""
        guard !t.isEmpty else { return }
        await run("أُضيفت المرحلة") { try await APIClient.shared.addStage(projectId, title: t, dueDate: "") }
    }

    private func run(_ message: String?, _ work: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await work()
            error = nil
            if let message { toast(message) }
            await reload()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ"
        }
    }
}

// MARK: - A task

/// TaskDialog.tsx «مهمة جديدة» / «تعديل المهمة»: title, details, owner, date, status, priority, stage.
struct TaskSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let projectId: String
    let stages: [Stage]
    let existing: TaskItem?
    let saved: (String) -> Void

    @State private var title = ""
    @State private var details = ""
    @State private var assignee = ""
    @State private var due: Date?
    @State private var status = "todo"
    @State private var priority = "normal"
    @State private var stageId = ""
    @State private var people: [Person] = []
    @State private var error: String?
    @State private var busy = false
    @State private var baseline = ""
    @State private var started = false

    private var snapshot: String { [title, details, assignee, due.map(Fmt.isoDay) ?? "", status, priority, stageId].joined(separator: "|") }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                }
                Section {
                    TextField("المهمة *", text: $title, axis: .vertical)
                    TextField("تفاصيل", text: $details, axis: .vertical).lineLimit(2...6)
                }
                Section {
                    Picker("المسؤول", selection: $assignee) {
                        Text("غير مسند").tag("")
                        ForEach(people) { Text($0.name).tag($0.id) }
                    }
                    OptionalDateRow(title: "الموعد", date: $due)
                    Picker("الحالة", selection: $status) {
                        ForEach(["todo", "doing", "blocked", "done"], id: \.self) { Text(Vocabulary.taskStatus($0).label).tag($0) }
                    }
                    Picker("الأولوية", selection: $priority) {
                        Text("منخفضة").tag("low")
                        Text("عادية").tag("normal")
                        Text("عالية").tag("high")
                    }
                    if !stages.isEmpty {
                        Picker("المرحلة", selection: $stageId) {
                            Text("بلا مرحلة").tag("")
                            ForEach(stages) { Text($0.title).tag($0.id) }
                        }
                    }
                } footer: {
                    if existing == nil { Text("يصل المسؤولَ إشعار بالمهمة.") }
                }
            }
            .navigationTitle(existing == nil ? "مهمة جديدة" : "تعديل المهمة")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: started && snapshot != baseline, busy: busy, saveTitle: existing == nil ? "إضافة" : "حفظ") { Task { await save() } }
            .task {
                if !started, let t = existing {
                    title = t.title; details = t.description; assignee = t.assigneeId; due = Fmt.date(t.dueDate)
                    status = t.status; priority = t.priority.isEmpty ? "normal" : t.priority; stageId = t.stageId
                }
                if !started { baseline = snapshot; started = true }
                people = (try? await APIClient.shared.assignees()) ?? []
            }
        }
    }

    private func save() async {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "اكتب المهمة."; return }
        let body: [String: Any] = [
            "title": t, "description": details.trimmingCharacters(in: .whitespacesAndNewlines), "assigneeId": assignee,
            "dueDate": due.map(Fmt.isoDay) ?? "", "status": status, "priority": priority, "stageId": stageId,
        ]
        busy = true
        defer { busy = false }
        do {
            if let e = existing {
                try await APIClient.shared.patchTask(e.id, body)
            } else {
                var b = body
                b["projectId"] = projectId
                try await APIClient.shared.createTask(b)
            }
            saved(existing == nil ? "أُضيفت المهمة" : "حُفظت المهمة")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

/// TimeDialog «تسجيل وقت»: hours in quarters, today, and a note.
struct TimeSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let task: TaskItem
    let saved: (String) -> Void

    @State private var hours = 1.0
    @State private var date = Date()
    @State private var note = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) }
                Section {
                    Stepper(value: $hours, in: 0.25...24, step: 0.25) {
                        HStack {
                            Text("عدد الساعات")
                            Spacer()
                            Text(Fmt.hours(Int((hours * 60).rounded()))).monospacedDigit().bold()
                        }
                    }
                    DatePicker("التاريخ", selection: $date, in: ...Date(), displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    TextField("ملاحظة", text: $note)
                } footer: {
                    Text(task.title)
                }
            }
            .navigationTitle("تسجيل وقت")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: !note.isEmpty, busy: busy, saveTitle: "تسجيل") { Task { await save() } }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.logTime(task.id, minutes: Int((hours * 60).rounded()), date: Fmt.isoDay(date),
                                               note: note.trimmingCharacters(in: .whitespaces))
            saved("سُجّل \(Fmt.hours(Int((hours * 60).rounded())))")
            dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر التسجيل"
        }
    }
}
