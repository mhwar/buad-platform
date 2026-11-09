import SwiftUI

/// «المشاريع»: GET /api/projects as the website's list, with the server's visibility rule (all/team/mine)
/// and money hidden by the server itself for roles without finance.view.
struct ProjectsView: View {
    @EnvironmentObject private var session: Session
    @State private var projects: [ProjectItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var query = ""
    @State private var filter = "active"

    private let filters: [(key: String, label: String)] = [
        ("all", "الكل"), ("active", "جاري التنفيذ"), ("late", "متأخرة"), ("draft", "مسودة"),
        ("completed", "مكتمل"), ("paused", "متوقف"), ("cancelled", "ملغي"),
    ]

    private func matches(_ p: ProjectItem, _ key: String) -> Bool {
        key == "all" || (key == "late" ? p.late : p.status == key)
    }

    private var shown: [ProjectItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return projects.filter { p in
            matches(p, filter) && (q.isEmpty || p.name.contains(q) || p.clientName.contains(q) || p.number.contains(q))
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filters, id: \.key) { f in
                                let n = projects.filter { matches($0, f.key) }.count
                                if f.key == "all" || f.key == "active" || n > 0 {
                                    FilterChip(title: f.label, count: n, on: filter == f.key) { filter = f.key }
                                }
                            }
                        }
                        .padding(.horizontal, Buad.gutter)
                    }
                    .padding(.horizontal, -Buad.gutter)

                    if !loaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                    } else if let error {
                        EmptyNote(text: error, icon: "wifi.exclamationmark")
                    } else if shown.isEmpty {
                        EmptyNote(text: query.isEmpty ? "لا مشاريع في هذا التصنيف." : "لا مشاريع تطابق البحث.", icon: "briefcase")
                    } else {
                        ForEach(shown) { p in
                            NavigationLink(value: p) { ProjectCard(project: p) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, Buad.gutter)
                .padding(.vertical, 8)
            }
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("المشاريع")
            .searchable(text: $query, prompt: "ابحث باسم المشروع أو رقمه أو العميل")
            .refreshable { await load() }
            .task { if !loaded { await load() } }
            .navigationDestination(for: ProjectItem.self) { ProjectDetailView(project: $0) }
        }
    }

    private func load() async {
        do {
            projects = try await APIClient.shared.projects().items
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

struct FilterChip: View {
    let title: String
    var count: Int?
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title).font(.subheadline.weight(.medium))
                if let count { Text("\(count)").font(.caption).monospacedDigit().opacity(0.6) }
            }
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(on ? Buad.ink : Buad.surface, in: Capsule())
            .foregroundStyle(on ? Buad.onInk : Buad.ink)
        }
        .buttonStyle(.plain)
    }
}

private struct ProjectCard: View {
    let project: ProjectItem

    var body: some View {
        let status = Vocabulary.status(project.status)
        let exec = project.execution
        Card {
            HStack(alignment: .center, spacing: 6) {
                if project.late { Pill(text: "متأخر", tone: .bad) } else { Pill(text: status.label, tone: status.tone) }
                if project.external { Pill(text: "خارجي") }
                if project.fullyDistributed { Pill(text: "موزّع بالكامل", tone: .ok) } else if project.closed { Pill(text: "مغلق") }
                Spacer(minLength: 4)
                Text(project.number).font(.caption.weight(.medium)).foregroundStyle(Buad.faint).environment(\.layoutDirection, .leftToRight)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(project.name).font(.headline).foregroundStyle(Buad.ink).multilineTextAlignment(.leading)
                Text(project.clientName).font(.subheadline).foregroundStyle(Buad.muted)
                if !project.productName.isEmpty {
                    Text(project.productName).font(.footnote.weight(.medium)).foregroundStyle(Buad.accentInk)
                }
            }
            HStack(spacing: 16) {
                meter("التنفيذ", exec.total > 0 ? "\(exec.done)/\(exec.total)" : "—", exec.total > 0 ? Double(exec.done) / Double(exec.total) : 0, Buad.accent, extra: project.tasksOverdue > 0 ? "\(project.tasksOverdue) متأخرة" : nil)
                if let received = project.received, !project.external, project.status != "draft" {
                    meter("التحصيل", "\(Fmt.percent(received, of: project.contractTotal))%", project.contractTotal > 0 ? Double(received) / Double(project.contractTotal) : 0, Buad.success)
                }
            }
            Divider()
            HStack {
                Text("\(Vocabulary.type(project.type)) · \(Fmt.dayMonth(project.startDate))").font(.footnote).foregroundStyle(Buad.muted)
                Spacer()
                if project.received != nil || project.external {
                    HStack(spacing: 6) {
                        if project.external { Text("لا يدخل في المالية").font(.caption).foregroundStyle(Buad.muted) }
                        Text(Fmt.short(project.contractTotal)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        if project.estimated && !project.external { Text("تقديري").font(.caption).foregroundStyle(Buad.muted) }
                    }
                }
            }
            if let amount = project.nextDueAmount, amount > 0, !project.nextDueDate.isEmpty {
                let overdue = (Fmt.daysUntil(project.nextDueDate) ?? 0) < 0
                Label("\(overdue ? "دفعة متأخرة" : "الدفعة القادمة"): \(Fmt.sar(amount)) · \(Fmt.dayMonth(project.nextDueDate))", systemImage: "calendar")
                    .font(.footnote)
                    .foregroundStyle(overdue ? Buad.dangerInk : Buad.infoInk)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(overdue ? Buad.dangerSoft : Buad.infoSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }

    private func meter(_ title: String, _ value: String, _ progress: Double, _ color: Color, extra: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                Spacer()
                if let extra { Text(extra).foregroundStyle(Buad.dangerInk) }
                Text(value).monospacedDigit()
            }
            .font(.caption)
            .foregroundStyle(Buad.muted)
            ProgressBar(value: progress, color: color)
        }
        .frame(maxWidth: .infinity)
    }
}
