import SwiftUI

/// «الخطط» (features/plans): the strategic and operational plans, each objective with its indicators and
/// initiatives, tracked against time. With plans.edit: set an initiative's status, a manual indicator's
/// current value, and record a review. Building cycles and objectives stays on the website.
struct PlansView: View {
    @EnvironmentObject private var session: Session
    @State private var cycles: [PlanCycle] = []
    @State private var kind = "operational"
    @State private var cycleId = ""
    @State private var detail: PlanDetail?
    @State private var owners: [String: String] = [:]
    @State private var loaded = false
    @State private var error: String?
    @State private var quarter = -1
    @State private var showDone = false
    @State private var reviewing: PlanObjective?
    @State private var editing: PlanIndicator?
    @State private var toast: ToastItem?

    private var canEdit: Bool { session.me?.can("plans.edit") ?? false }
    private var ofKind: [PlanCycle] { cycles.filter { $0.kind == kind } }
    private var objectives: [PlanObjective] {
        guard let d = detail else { return [] }
        return quarter < 0 ? d.objectives : d.objectives.filter { $0.quarter == quarter }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Picker("النوع", selection: $kind) {
                    Text("الاستراتيجية").tag("strategic")
                    Text("التشغيلية").tag("operational")
                }
                .pickerStyle(.segmented)
                if ofKind.count > 1 {
                    Picker("الخطة", selection: $cycleId) {
                        ForEach(ofKind) { Text($0.name).tag($0.id) }
                    }
                    .pickerStyle(.menu)
                }
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if let error, detail == nil {
                    EmptyNote(text: error, icon: "wifi.exclamationmark")
                } else if ofKind.isEmpty {
                    EmptyNote(text: "لا توجد خطة \(kind == "strategic" ? "استراتيجية" : "تشغيلية") بعد. تُنشأ من الموقع.", icon: "target")
                } else if let d = detail {
                    header(d)
                    if kind == "operational" {
                        Picker("الربع", selection: $quarter) {
                            Text("كل السنة").tag(-1)
                            ForEach(1...4, id: \.self) { Text("ر\($0)").tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    if objectives.isEmpty {
                        EmptyNote(text: "لا أهداف في هذا العرض.", icon: "target")
                    } else {
                        ForEach(objectives) { objective($0) }
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("الخطط والأهداف")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadCycle() }
        .task { await loadAll() }
        .onChange(of: kind) { _, _ in pickDefault(); Task { await loadCycle() } }
        .onChange(of: cycleId) { _, _ in Task { await loadCycle() } }
        .toast($toast)
        .sheet(item: $reviewing) { o in
            ReviewSheet(objective: o) { toast = ToastItem(text: "حُفظت المراجعة"); Task { await loadCycle() } }
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $editing) { i in
            IndicatorValueSheet(indicator: i) { toast = ToastItem(text: "حُدّثت القيمة"); Task { await loadCycle() } }
                .presentationDetents([.height(260)])
        }
    }

    // MARK: pieces

    private func header(_ d: PlanDetail) -> some View {
        let st = PlanVocabulary.status(d.status)
        return Card {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.cycle.name).font(.headline)
                    Text("\(Fmt.day(d.cycle.startDate)) – \(Fmt.day(d.cycle.endDate))").font(.caption).foregroundStyle(Buad.muted)
                }
                Spacer()
                Pill(text: PlanVocabulary.cycleStatus(d.cycle.status))
            }
            HStack {
                Text("تقدّم الخطة").font(.subheadline)
                Spacer()
                Pill(text: st.label, tone: st.tone)
                Text(PlanVocabulary.percent(d.progress)).font(.subheadline.bold()).monospacedDigit()
            }
            ProgressBar(value: d.progress ?? 0)
            if d.cycle.kind == "strategic" {
                textBlock("الرؤية", d.cycle.vision, empty: "لم تُكتب بعد.")
                textBlock("الرسالة", d.cycle.mission, empty: "لم تُكتب بعد.")
                if !d.cycle.values.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("القيم").font(.caption).foregroundStyle(Buad.muted)
                        Text(d.cycle.values.joined(separator: " · ")).font(.subheadline)
                    }
                }
            } else if d.budget > 0 {
                Text("إجمالي ميزانيات الأهداف: \(Fmt.sar(Int((d.budget * 100).rounded())))").font(.footnote).foregroundStyle(Buad.muted)
            }
        }
    }

    private func textBlock(_ title: String, _ text: String, empty: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(Buad.muted)
            Text(text.isEmpty ? empty : text).font(.subheadline).foregroundStyle(text.isEmpty ? Buad.faint : Buad.ink)
        }
    }

    private func objective(_ o: PlanObjective) -> some View {
        let st = PlanVocabulary.status(o.status)
        let open = o.initiatives.filter { $0.status != "done" }
        let done = o.initiatives.filter { $0.status == "done" }
        return Card {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(o.title).font(.subheadline.weight(.semibold))
                    if !o.description.isEmpty { Text(o.description).font(.caption).foregroundStyle(Buad.muted) }
                }
                Spacer(minLength: 6)
                if o.quarter > 0 { Pill(text: "الربع \(o.quarter)") }
            }
            HStack(spacing: 8) {
                Pill(text: st.label, tone: st.tone)
                Text(PlanVocabulary.percent(o.progress)).font(.caption.bold()).monospacedDigit()
                Spacer()
                if let name = owners[o.ownerId], !o.ownerId.isEmpty { Text("المسؤول: \(name)").font(.caption).foregroundStyle(Buad.muted) }
            }
            ProgressBar(value: o.progress ?? 0, color: st.tone == .bad ? Buad.dangerInk : st.tone == .warn ? Buad.warningInk : Buad.accent)
            if o.budget > 0 { Text("الميزانية: \(Fmt.sar(Int((o.budget * 100).rounded())))").font(.caption).foregroundStyle(Buad.muted) }

            if !o.indicators.isEmpty {
                Divider()
                Text("مؤشرات الأداء").font(.caption.weight(.semibold)).foregroundStyle(Buad.muted)
                ForEach(o.indicators) { i in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(i.name).font(.subheadline)
                            if !i.manual { Pill(text: "من المنصة", tone: .info) }
                            Spacer()
                            Text(value(i)).font(.caption).monospacedDigit().foregroundStyle(Buad.muted)
                        }
                        ProgressBar(value: i.attainment)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { if canEdit, i.manual { editing = i } }
                }
            }

            if !o.initiatives.isEmpty {
                Divider()
                Text("المبادرات").font(.caption.weight(.semibold)).foregroundStyle(Buad.muted)
                ForEach(open) { initiative($0) }
                if !done.isEmpty {
                    Button(showDone ? "إخفاء المنجزة" : "عرض المنجزة (\(done.count))") { showDone.toggle() }
                        .font(.caption.weight(.semibold))
                    if showDone { ForEach(done) { initiative($0) } }
                }
            }

            Divider()
            HStack {
                if let r = o.reviews.first {
                    Text("آخر مراجعة (\(r.quarter == 0 ? "عام" : "الربع \(r.quarter)")): \(r.note.isEmpty ? "بلا ملاحظات" : r.note)")
                        .font(.caption).foregroundStyle(Buad.muted).lineLimit(3)
                } else {
                    Text("لم تُراجع بعد.").font(.caption).foregroundStyle(Buad.faint)
                }
                Spacer(minLength: 6)
                if canEdit { Button("مراجعة") { reviewing = o }.font(.caption.weight(.semibold)) }
            }
        }
    }

    private func initiative(_ x: PlanInitiative) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(x.title).font(.subheadline)
                HStack(spacing: 6) {
                    if !x.dueDate.isEmpty { Text("حتى \(Fmt.day(x.dueDate))").font(.caption).foregroundStyle(Buad.muted) }
                    if x.tasksTotal > 0 {
                        Pill(text: "مهام \(x.tasksDone)/\(x.tasksTotal)", tone: x.tasksDone == x.tasksTotal ? .ok : .neutral)
                    }
                }
            }
            Spacer(minLength: 6)
            if canEdit {
                Menu {
                    ForEach(["todo", "doing", "blocked", "done"], id: \.self) { s in
                        Button(PlanVocabulary.initiative(s)) { Task { await setStatus(x, s) } }
                    }
                } label: { statusPill(x.status) }
            } else {
                statusPill(x.status)
            }
        }
    }

    private func statusPill(_ s: String) -> some View {
        Pill(text: PlanVocabulary.initiative(s), tone: s == "done" ? .ok : s == "blocked" ? .bad : s == "doing" ? .info : .neutral)
    }

    private func value(_ i: PlanIndicator) -> String {
        let cur = i.hidden ? "مخفي" : i.current.map(PlanVocabulary.number) ?? "—"
        return "\(cur) / \(PlanVocabulary.number(i.target)) \(i.unit)"
    }

    // MARK: data

    private func pickDefault() {
        let list = ofKind
        cycleId = (list.first { $0.status == "active" } ?? list.first)?.id ?? ""
    }

    private func loadAll() async {
        do {
            cycles = try await APIClient.shared.planCycles()
            owners = Dictionary(uniqueKeysWithValues: ((try? await APIClient.shared.planOwners()) ?? []).map { ($0.id, $0.name) })
            pickDefault()
            error = nil
            await loadCycle()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }

    private func loadCycle() async {
        guard !cycleId.isEmpty else { detail = nil; return }
        do {
            detail = try await APIClient.shared.planCycle(cycleId)
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }

    private func setStatus(_ x: PlanInitiative, _ s: String) async {
        do {
            try await APIClient.shared.setInitiativeStatus(x.id, s)
            await loadCycle()
        } catch {
            session.handle(error)
            toast = ToastItem(text: (error as? APIError)?.message ?? "تعذّر الحفظ.")
        }
    }
}

/// «مراجعة الهدف»: the quarter and the note; the server freezes the objective's numbers with it.
struct ReviewSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let objective: PlanObjective
    let saved: () -> Void
    @State private var quarter = 0
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) } }
                Section {
                    Picker("الربع", selection: $quarter) {
                        Text("عام").tag(0)
                        ForEach(1...4, id: \.self) { Text("الربع \($0)").tag($0) }
                    }
                    TextField("ملاحظات المراجعة", text: $note, axis: .vertical).lineLimit(3...8)
                } header: { Text(objective.title) } footer: {
                    Text("تُحفظ ملاحظتك مع أرقام المؤشرات والمبادرات كما هي الآن، ولا تُعدَّل بعد ذلك.")
                }
            }
            .navigationTitle("مراجعة الهدف")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: !note.isEmpty, busy: busy, saveTitle: "حفظ المراجعة") { Task { await save() } }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.reviewObjective(objective.id, quarter: quarter, note: note.trimmingCharacters(in: .whitespacesAndNewlines))
            saved(); dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}

/// A manual indicator's current value.
struct IndicatorValueSheet: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    let indicator: PlanIndicator
    let saved: () -> Void
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk) } }
                Section {
                    TextField("القيمة الحالية", text: $text).keyboardType(.decimalPad)
                } header: { Text(indicator.name) } footer: {
                    Text("المستهدف: \(PlanVocabulary.number(indicator.target)) \(indicator.unit)")
                }
            }
            .navigationTitle("تحديث المؤشر")
            .navigationBarTitleDisplayMode(.inline)
            .formChrome(dirty: Double(text.replacingOccurrences(of: ",", with: ".")) != nil, busy: busy, saveTitle: "حفظ") { Task { await save() } }
            .onAppear { text = indicator.current.map(PlanVocabulary.number) ?? "" }
        }
    }

    private func save() async {
        guard let v = Double(text.replacingOccurrences(of: ",", with: ".")) else { error = "اكتب رقماً."; return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.setIndicatorCurrent(indicator.id, v)
            saved(); dismiss()
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر الحفظ، حاول مرة أخرى."
        }
    }
}
