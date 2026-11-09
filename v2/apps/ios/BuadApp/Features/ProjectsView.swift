import SwiftUI

/// «المشاريع» (features/projects/ProjectsPage.tsx), laid out for the phone as the website does it:
/// search, then the status pills with their counts, then sort and «تصفية» (needs attention, finance,
/// type) in the bar, with the active filters shown as removable chips. GET /api/projects keeps the
/// server's visibility rule (all/team/mine) and hides money for roles without finance.view.
struct ProjectsView: View {
    enum Sort: String, CaseIterable { case newest, deadline, name, value }
    enum Attention: String { case all, late, due }
    enum Money: String { case all, internal, external }

    @EnvironmentObject private var session: Session
    @State private var projects: [ProjectItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var query = ""
    @State private var status = "all"
    @State private var sort: Sort = .newest
    @State private var attention: Attention = .all
    @State private var money: Money = .all
    @State private var type = ""
    @State private var filtering = false

    private let statuses: [(key: String, label: String)] = [
        ("all", "الكل"), ("active", "جاري التنفيذ"), ("draft", "مسودة"),
        ("completed", "مكتمل"), ("paused", "متوقف"), ("cancelled", "ملغي"),
    ]

    private var filtersOn: Int { (attention != .all ? 1 : 0) + (money != .all ? 1 : 0) + (type.isEmpty ? 0 : 1) }

    /// Everything but the status: the pills count within it.
    private var pool: [ProjectItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return projects.filter { p in
            (q.isEmpty || p.name.localizedCaseInsensitiveContains(q) || p.clientName.localizedCaseInsensitiveContains(q) || p.number.contains(q))
                && (attention == .all || (attention == .late ? p.late : p.paymentLate))
                && (money == .all || (money == .external) == p.external)
                && (type.isEmpty || p.type == type)
        }
    }

    private var shown: [ProjectItem] {
        let list = pool.filter { status == "all" || $0.status == status }
        switch sort {
        case .newest: return list.sorted { $0.order < $1.order }
        case .name: return list.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .value: return list.sorted { $0.contractTotal > $1.contractTotal }
        case .deadline:
            // As the server's «deadline» order: active projects with an end date first, soonest first.
            return list.sorted {
                let a = $0.status == "active" && !$0.endDate.isEmpty, b = $1.status == "active" && !$1.endDate.isEmpty
                if a != b { return a }
                if $0.endDate != $1.endDate { return $0.endDate < $1.endDate }
                return $0.name.localizedCompare($1.name) == .orderedAscending
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12, pinnedViews: [.sectionHeaders]) {
                    Section {
                        if filtersOn > 0 { activeFilters }
                        if !loaded {
                            ProgressView("جارٍ تحميل المشاريع").frame(maxWidth: .infinity).padding(.vertical, 40)
                        } else if let error {
                            EmptyNote(text: error, icon: "wifi.exclamationmark")
                        } else if projects.isEmpty {
                            EmptyNote(text: "لا توجد مشاريع بعد. أضيفوها من الموقع، من صفحة العميل ثم «مشروع جديد».", icon: "briefcase")
                        } else if shown.isEmpty {
                            EmptyNote(text: "لا نتائج. جرّبوا بحثاً أو تصفية أخرى.", icon: "magnifyingglass")
                        } else {
                            Text("\(shown.count) مشروع").font(.footnote).foregroundStyle(Buad.muted)
                            ForEach(shown) { p in
                                NavigationLink(value: p) { ProjectCard(project: p) }.buttonStyle(.plain)
                            }
                        }
                    } header: {
                        statusPills
                    }
                }
                .padding(.horizontal, Buad.gutter)
                .padding(.bottom, 16)
            }
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("المشاريع")
            .searchable(text: $query, prompt: "ابحث باسم المشروع أو رقمه أو اسم العميل")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Menu {
                        Picker("الترتيب", selection: $sort) {
                            Label("الأحدث", systemImage: "clock").tag(Sort.newest)
                            Label("الأقرب انتهاءً", systemImage: "calendar").tag(Sort.deadline)
                            Label("الاسم", systemImage: "textformat").tag(Sort.name)
                            Label("القيمة", systemImage: "banknote").tag(Sort.value)
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down").accessibilityLabel("الترتيب")
                    }
                    Button { filtering = true } label: {
                        Image(systemName: filtersOn > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                            .accessibilityLabel(filtersOn > 0 ? "تصفية (\(filtersOn))" : "تصفية")
                    }
                }
            }
            .sheet(isPresented: $filtering) { filterSheet.presentationDetents([.medium, .large]) }
            .refreshable { await load() }
            .task { if !loaded { await load() } }
            .navigationDestination(for: ProjectItem.self) { ProjectDetailView(project: $0) }
        }
    }

    // MARK: pills, chips, sheet

    private var statusPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(statuses, id: \.key) { s in
                    let n = s.key == "all" ? pool.count : pool.filter { $0.status == s.key }.count
                    if s.key == "all" || n > 0 || status == s.key {
                        FilterChip(title: s.label, count: n, on: status == s.key) { status = s.key }
                    }
                }
            }
            .padding(.horizontal, Buad.gutter)
            .padding(.vertical, 8)
        }
        .padding(.horizontal, -Buad.gutter)
        .background(Buad.canvas)
    }

    private var activeFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if attention != .all { removable(attention == .late ? "متأخرة عن موعد الانتهاء" : "عليها دفعة متأخرة") { attention = .all } }
                if money != .all { removable(money == .internal ? "داخلية" : "خارجية") { money = .all } }
                if !type.isEmpty { removable(Vocabulary.type(type)) { type = "" } }
                Button("مسح الكل") { attention = .all; money = .all; type = "" }
                    .font(.caption.weight(.semibold)).foregroundStyle(Buad.infoInk)
            }
        }
    }

    private func removable(_ text: String, _ remove: @escaping () -> Void) -> some View {
        Button(action: remove) {
            HStack(spacing: 4) {
                Text(text)
                Image(systemName: "xmark").font(.caption2.weight(.bold))
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10).frame(height: 28)
            .background(Buad.infoSoft, in: Capsule())
            .foregroundStyle(Buad.infoInk)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("إزالة \(text)")
    }

    private var filterSheet: some View {
        NavigationStack {
            Form {
                Picker("تحتاج انتباهاً", selection: $attention) {
                    Text("كل المشاريع").tag(Attention.all)
                    Text("متأخرة عن موعد الانتهاء").tag(Attention.late)
                    if session.me?.can("finance.view") == true { Text("عليها دفعة متأخرة").tag(Attention.due) }
                }
                Picker("المالية", selection: $money) {
                    Text("داخلية وخارجية").tag(Money.all)
                    Text("داخلية (تدخل في المالية)").tag(Money.internal)
                    Text("خارجية (لا تدخل في المالية)").tag(Money.external)
                }
                Picker("النوع", selection: $type) {
                    Text("كل الأنواع").tag("")
                    ForEach(["training", "consulting", "event", "other"], id: \.self) { Text(Vocabulary.type($0)).tag($0) }
                }
            }
            .navigationTitle("تصفية")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إعادة الضبط") { attention = .all; money = .all; type = "" }.disabled(filtersOn == 0)
                }
                ToolbarItem(placement: .confirmationAction) { Button("تم") { filtering = false }.bold() }
            }
        }
    }

    private func load() async {
        do {
            let items = try await APIClient.shared.projects().items
            projects = items.enumerated().map { i, p in var p = p; p.order = i; return p }
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

/// ProjectCard (features/projects/ProjectsPage.tsx) for the phone.
struct ProjectCard: View {
    let project: ProjectItem

    var body: some View {
        let p = project
        let status = Vocabulary.status(p.status)
        let exec = p.execution
        Card {
            HStack(alignment: .center, spacing: 6) {
                Pill(text: status.label, tone: status.tone)
                if p.external { Pill(text: "خارجي") }
                if p.fullyDistributed { Pill(text: "موزّع بالكامل", tone: .ok) } else if p.closed { Pill(text: "مغلق") }
                deadline
                Spacer(minLength: 4)
                if p.visibility == "private" { Image(systemName: "lock.fill").font(.caption2).foregroundStyle(Buad.faint).accessibilityLabel("خاص") }
                Text(p.number).font(.caption.weight(.medium)).foregroundStyle(Buad.faint).environment(\.layoutDirection, .leftToRight)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(p.name).font(.headline).foregroundStyle(Buad.ink).multilineTextAlignment(.leading).lineLimit(2)
                Text(p.clientName).font(.subheadline).foregroundStyle(Buad.muted).lineLimit(1)
                if !p.productName.isEmpty {
                    Text(p.packageName.isEmpty ? p.productName : "\(p.productName) · \(p.packageName)")
                        .font(.footnote.weight(.medium)).foregroundStyle(Buad.accentInk).lineLimit(1)
                }
            }
            HStack(spacing: 16) {
                meter("التنفيذ", exec.total > 0 ? "\(exec.done)/\(exec.total)" : "—",
                      exec.total > 0 ? Double(exec.done) / Double(exec.total) : 0, Buad.accent,
                      extra: p.tasksOverdue > 0 ? "\(p.tasksOverdue) متأخرة" : nil)
                if let received = p.received, !p.external, p.status != "draft" {
                    meter("التحصيل", "\(Fmt.percent(received, of: p.contractTotal))%",
                          p.contractTotal > 0 ? Double(received) / Double(p.contractTotal) : 0, Buad.success)
                }
            }
            Divider()
            HStack {
                Text([Vocabulary.type(p.type), Fmt.dayMonth(p.startDate)].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(Buad.muted)
                Spacer()
                if p.external {
                    Text("لا يدخل في المالية").font(.caption).foregroundStyle(Buad.muted)
                } else if p.received != nil {
                    HStack(spacing: 4) {
                        Text(Fmt.short(p.contractTotal)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        if p.estimated { Text("تقديري").font(.caption).foregroundStyle(Buad.muted) }
                    }
                }
            }
            if let amount = p.nextDueAmount, amount > 0, !p.nextDueDate.isEmpty {
                Label("\(p.paymentLate ? "دفعة متأخرة" : "الدفعة القادمة"): \(Fmt.sar(amount)) · \(Fmt.dayMonth(p.nextDueDate))", systemImage: "calendar")
                    .font(.footnote)
                    .foregroundStyle(p.paymentLate ? Buad.dangerInk : Buad.infoInk)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(p.paymentLate ? Buad.dangerSoft : Buad.infoSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .overlay(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous).stroke(p.late ? Buad.dangerInk.opacity(0.5) : .clear, lineWidth: 1))
    }

    /// «متأخر {n} يوم» / «ينتهي خلال {n} يوم» (≤ 7) / «ينتهي {date}».
    @ViewBuilder private var deadline: some View {
        if let d = project.deadline {
            if d < 0 {
                Text("⚠ متأخر \(-d) يوم").font(.caption.weight(.semibold)).foregroundStyle(Buad.dangerInk)
            } else if d <= 7 {
                Text("ينتهي خلال \(d) يوم").font(.caption.weight(.medium)).foregroundStyle(Buad.warningInk)
            } else {
                Text("ينتهي \(Fmt.dayMonth(project.endDate))").font(.caption).foregroundStyle(Buad.muted)
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
