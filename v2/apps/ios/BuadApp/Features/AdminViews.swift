import SwiftUI
import UIKit

// MARK: - Settings hub

/// «الإعدادات»: the account, and what the website's settings area shows read-only in the app —
/// the activity log, the team and the organisation. Editing roles and the organisation stays on the web.
struct SettingsHubView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        List {
            Section {
                NavigationLink { AccountView() } label: { Label("حسابي", systemImage: "person.crop.circle") }
            } header: { Text("الحساب") } footer: { Text("كلمة المرور ومفتاح الاستعادة وأجهزتك.") }
            if let me = session.me {
                Section {
                    if me.can("audit.view") { NavigationLink { AuditLogView() } label: { Label("سجل النشاط", systemImage: "list.bullet.clipboard") } }
                    if me.can("team.view") { NavigationLink { TeamView() } label: { Label("الفريق والأدوار", systemImage: "person.3") } }
                    NavigationLink { OrgView() } label: { Label("بيانات المنشأة", systemImage: "building.2") }
                } header: { Text("المنشأة") } footer: {
                    Text("للعرض. تعديل الأدوار وبيانات المنشأة من الموقع.")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("الإعدادات")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Account

/// features/account: change the password, sign the other devices out, and the one-time recovery key.
struct AccountView: View {
    @EnvironmentObject private var session: Session
    @State private var current = ""
    @State private var new = ""
    @State private var busy = false
    @State private var error: String?
    @State private var toast: ToastItem?
    @State private var confirmOthers = false
    @State private var key: RecoveryKeyStatus?
    @State private var shownKey: String?
    @State private var confirmKey = false

    private var canChange: Bool { !current.isEmpty && new.count >= 8 && !busy }

    var body: some View {
        Form {
            if let me = session.me {
                Section {
                    LabeledContent("الاسم", value: me.name)
                    LabeledContent("البريد", value: me.email)
                }
            }
            Section {
                SecureField("كلمة المرور الحالية", text: $current).textContentType(.password)
                SecureField("كلمة المرور الجديدة", text: $new).textContentType(.newPassword)
                if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(Buad.dangerInk).font(.footnote) }
                Button("تغيير كلمة المرور") { Task { await change() } }.disabled(!canChange)
            } header: { Text("تغيير كلمة المرور") } footer: {
                Text("8 أحرف على الأقل. تُخرج الأجهزة الأخرى عند التغيير.")
            }
            Section {
                Button("خروج من كل الأجهزة الأخرى", role: .destructive) { confirmOthers = true }
            } header: { Text("الأجهزة") } footer: { Text("يبقى هذا الجهاز مسجلاً، ويُطلب الدخول من جديد في غيره.") }
            Section {
                if let key {
                    Text(key.exists ? "لديك مفتاح فعّال منذ \(Fmt.epochDay(key.createdAt))." : "لا يوجد مفتاح بعد.")
                        .font(.subheadline).foregroundStyle(Buad.muted)
                }
                if let shownKey {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("احفظه الآن، فلن يظهر مرة أخرى:").font(.footnote.weight(.semibold)).foregroundStyle(Buad.warningInk)
                        Text(verbatim: shownKey).font(.system(.title3, design: .monospaced).weight(.bold)).textSelection(.enabled)
                            .environment(\.layoutDirection, .leftToRight)
                        Button("نسخ المفتاح") { UIPasteboard.general.string = shownKey; toast = ToastItem(text: "نُسخ المفتاح") }
                    }
                }
                Button(key?.exists == true ? "إنشاء مفتاح جديد" : "إنشاء مفتاح استعادة") {
                    if key?.exists == true { confirmKey = true } else { Task { await makeKey() } }
                }
            } header: { Text("مفتاح الاستعادة") } footer: {
                Text("يُستعمل مرة واحدة لتعيين كلمة مرور جديدة إن نسيتها. المفتاح القديم يتوقف فور إنشاء جديد.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("حسابي")
        .navigationBarTitleDisplayMode(.inline)
        .toast($toast)
        .task { key = try? await APIClient.shared.recoveryKey() }
        .confirmationDialog("الخروج من كل الأجهزة الأخرى؟", isPresented: $confirmOthers, titleVisibility: .visible) {
            Button("إخراج الأجهزة الأخرى", role: .destructive) { Task { await others() } }
            Button("إلغاء", role: .cancel) {}
        } message: { Text("سيلزم تسجيل الدخول من جديد في أي جهاز آخر.") }
        .confirmationDialog("إنشاء مفتاح جديد؟", isPresented: $confirmKey, titleVisibility: .visible) {
            Button("إنشاء", role: .destructive) { Task { await makeKey() } }
            Button("إلغاء", role: .cancel) {}
        } message: { Text("المفتاح القديم يتوقف عن العمل فوراً.") }
    }

    private func change() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.changePassword(current: current, new: new)
            current = ""; new = ""; error = nil
            toast = ToastItem(text: "تم تغيير كلمة المرور")
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? "تعذّر تغيير كلمة المرور، حاول مرة أخرى."
        }
    }

    private func others() async {
        do {
            try await APIClient.shared.logoutOthers()
            toast = ToastItem(text: "خرجت كل الأجهزة الأخرى")
        } catch {
            session.handle(error)
            toast = ToastItem(text: (error as? APIError)?.message ?? "تعذّر التنفيذ.")
        }
    }

    private func makeKey() async {
        do {
            shownKey = try await APIClient.shared.createRecoveryKey()
            key = try? await APIClient.shared.recoveryKey()
        } catch {
            session.handle(error)
            toast = ToastItem(text: (error as? APIError)?.message ?? "تعذّر إنشاء المفتاح.")
        }
    }
}

// MARK: - Activity log

/// features/team/ActivityPage.tsx «سجل النشاط»: who changed what and when, with the values before and after.
struct AuditLogView: View {
    @EnvironmentObject private var session: Session
    @State private var items: [AuditEntry] = []
    @State private var users: [TeamUser] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var entity = ""
    @State private var user = ""
    @State private var from: Date?
    @State private var to: Date?

    var body: some View {
        List {
            Section {
                Picker("القسم", selection: $entity) {
                    Text("كل الأقسام").tag("")
                    ForEach(AdminVocabulary.entities, id: \.key) { Text($0.label).tag($0.key) }
                }
                if !users.isEmpty {
                    Picker("المستخدم", selection: $user) {
                        Text("كل المستخدمين").tag("")
                        ForEach(users) { Text($0.name).tag($0.id) }
                    }
                }
                OptionalDateRow(title: "من تاريخ", date: $from)
                OptionalDateRow(title: "إلى تاريخ", date: $to)
            }
            if !loaded {
                Section { ProgressView().frame(maxWidth: .infinity) }
            } else if let error, items.isEmpty {
                Section { EmptyNote(text: error, icon: "wifi.exclamationmark") }
            } else if items.isEmpty {
                Section { EmptyNote(text: "لا نشاط مطابق", icon: "list.bullet.clipboard") }
            } else {
                Section {
                    ForEach(items) { row($0) }
                } footer: { Text("آخر \(items.count) حركة.") }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("سجل النشاط")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: "\(entity)|\(user)|\(from.map(Fmt.isoDay) ?? "")|\(to.map(Fmt.isoDay) ?? "")") { await load() }
        .task { if session.me?.can("team.view") == true { users = (try? await APIClient.shared.teamUsers()) ?? [] } }
    }

    private func row(_ e: AuditEntry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(e.summary).font(.subheadline.weight(.semibold))
                Spacer(minLength: 6)
                Pill(text: AdminVocabulary.entity(e.entity))
            }
            Text("\(e.userName.isEmpty ? "النظام" : e.userName) · \(Self.stamp(e.at))")
                .font(.caption).foregroundStyle(Buad.muted)
            ForEach(e.changes) { c in
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(c.label):").font(.caption).foregroundStyle(Buad.muted)
                    if c.before != "—" {
                        Text(Self.value(c.before)).font(.caption).strikethrough().foregroundStyle(Buad.dangerInk)
                        Image(systemName: "arrow.left").font(.caption2).foregroundStyle(Buad.faint)
                    }
                    Text(Self.value(c.after)).font(.caption.weight(.semibold)).foregroundStyle(Buad.successInk)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private static func value(_ s: String) -> String {
        if s.count == 10, let d = Fmt.date(s) { _ = d; return Fmt.day(s) }
        return s
    }

    private static let stampFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.dateFormat = "d MMM yyyy، h:mm a"
        return f
    }()

    private static func stamp(_ at: Int) -> String { stampFormat.string(from: Date(timeIntervalSince1970: TimeInterval(at))) }

    private func load() async {
        do {
            items = try await APIClient.shared.audit(entity: entity, user: user, from: from.map(Fmt.isoDay) ?? "", to: to.map(Fmt.isoDay) ?? "")
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

// MARK: - Team

/// features/team/TeamPage.tsx, read-only: the people with their role and state, and the roles.
struct TeamView: View {
    @EnvironmentObject private var session: Session
    @State private var users: [TeamUser] = []
    @State private var roles: [TeamRole] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var part = 0

    var body: some View {
        List {
            Section {
                Picker("العرض", selection: $part) {
                    Text("المستخدمون").tag(0)
                    Text("الأدوار").tag(1)
                }
                .pickerStyle(.segmented)
            }
            if !loaded {
                Section { ProgressView().frame(maxWidth: .infinity) }
            } else if let error, users.isEmpty, roles.isEmpty {
                Section { EmptyNote(text: error, icon: "wifi.exclamationmark") }
            } else if part == 0 {
                Section {
                    ForEach(users) { u in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(u.name).font(.subheadline.weight(.semibold))
                                Spacer()
                                Pill(text: u.active ? (u.pending ? "بانتظار التفعيل" : "نشط") : "موقوف",
                                     tone: u.active ? (u.pending ? .warn : .ok) : .bad)
                            }
                            Text(u.email).font(.caption).foregroundStyle(Buad.muted).environment(\.layoutDirection, .leftToRight)
                            Text("\(u.roleName) · " + (u.lastLoginAt > 0 ? "آخر دخول \(Fmt.epochDay(u.lastLoginAt))" : "لم يسجّل دخولاً"))
                                .font(.caption).foregroundStyle(Buad.faint)
                        }
                        .padding(.vertical, 2)
                    }
                } footer: { Text("\(users.count) مستخدماً. إضافة المستخدمين وتغيير الأدوار من الموقع.") }
            } else {
                Section {
                    ForEach(roles) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(r.name).font(.subheadline.weight(.semibold))
                                Spacer()
                                Text("\(r.users) مستخدم").font(.caption).foregroundStyle(Buad.muted)
                            }
                            if !r.description.isEmpty { Text(r.description).font(.caption).foregroundStyle(Buad.muted) }
                            Text("\(r.permCount) صلاحية").font(.caption).foregroundStyle(Buad.faint)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("الفريق والأدوار")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { if !loaded { await load() } }
    }

    private func load() async {
        do {
            users = try await APIClient.shared.teamUsers()
            roles = (try? await APIClient.shared.teamRoles()) ?? roles
            error = nil
        } catch {
            session.handle(error)
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
        loaded = true
    }
}

// MARK: - Organisation

/// The organisation's profile as printed on its documents, with what its files take. Read-only.
struct OrgView: View {
    @EnvironmentObject private var session: Session
    @State private var profile: OrgProfile?
    @State private var storage: OrgStorage?
    @State private var error: String?

    var body: some View {
        Group {
            if let p = profile {
                List {
                    Section("الجهة") {
                        row("الاسم", p.name); row("البريد", p.email); row("الجوال", p.phone)
                        row("الموقع", p.website); row("العنوان", p.address)
                    }
                    Section("التسجيل") {
                        row("السجل التجاري", p.reg); row("الرقم الضريبي", p.tax)
                    }
                    Section("المفوّض بالتوقيع") {
                        row("الاسم", p.signerName); row("المسمى", p.signerTitle)
                    }
                    Section("الحساب البنكي") {
                        row("البنك", p.bankName); row("الآيبان", p.bankIban)
                    }
                    if let s = storage {
                        Section("الملفات") { row("المساحة المستخدمة", "\(AdminVocabulary.bytes(s.bytes)) · \(s.files) ملف") }
                    }
                    Section { EmptyView() } footer: { Text("لتعديل هذه البيانات استخدم الموقع. تظهر في المستندات وعروض الأسعار.") }
                }
                .scrollContentBackground(.hidden)
            } else if let error {
                EmptyNote(text: error, icon: "wifi.exclamationmark")
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Buad.canvas.ignoresSafeArea())
        .navigationTitle("بيانات المنشأة")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                profile = try await APIClient.shared.orgProfile()
                storage = try? await APIClient.shared.orgStorage()
            } catch {
                session.handle(error)
                self.error = (error as? APIError)?.message ?? APIError.network.message
            }
        }
    }

    @ViewBuilder private func row(_ title: String, _ value: String) -> some View {
        LabeledContent(title) {
            Text(value.isEmpty ? "—" : value).foregroundStyle(value.isEmpty ? Buad.faint : Buad.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}
