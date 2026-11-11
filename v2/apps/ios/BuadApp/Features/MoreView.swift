import SwiftUI

struct MoreView: View {
    @EnvironmentObject private var session: Session
    @AppStorage("buad.faceid") private var faceID = false
    @AppStorage("buad.theme") private var theme = "system"
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if let me = session.me {
                    Section {
                        HStack(spacing: 12) {
                            Text(String(me.name.prefix(1)))
                                .font(.title3.bold())
                                .frame(width: 48, height: 48)
                                .background(Buad.infoSoft, in: Circle())
                                .foregroundStyle(Buad.infoInk)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(me.name).font(.headline)
                                Text(me.email).font(.footnote).foregroundStyle(Buad.muted)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    NavigationLink { SearchView() } label: { Label("بحث في كل المنصة", systemImage: "magnifyingglass") }
                }

                if let me = session.me {
                    let work = me.can("tasks.view") || me.can("clients.view") || me.can("documents.view") || me.can("meetings.view")
                    if work {
                        Section {
                            if me.can("tasks.view") { NavigationLink { TasksView().navigationTitle("المهام").navigationBarTitleDisplayMode(.inline) } label: { Label("المهام", systemImage: "checklist") } }
                            if me.can("clients.view") {
                                NavigationLink { FollowupsView() } label: { Label("المتابعات", systemImage: "clock.badge.checkmark") }
                                NavigationLink { ClientsView() } label: { Label("العملاء", systemImage: "person.2") }
                            }
                            if me.can("documents.view") { NavigationLink { DocumentsRegisterView() } label: { Label("المستندات", systemImage: "doc.text") } }
                            if me.can("meetings.view") {
                                NavigationLink { MeetingsView() } label: { Label("الاجتماعات", systemImage: "person.3") }
                                NavigationLink { DecisionsView() } label: { Label("القرارات", systemImage: "checkmark.seal") }
                            }
                        } header: { Text("العمل") }
                    }
                    if me.can("treasury.view") || me.can("vat.view") {
                        Section {
                            NavigationLink { FinanceView(embedded: true) } label: { Label("المالية", systemImage: "banknote") }
                        } header: { Text("المالية") }
                    }
                    Section {
                        NavigationLink { SettingsHubView() } label: { Label("الإعدادات والحساب", systemImage: "gearshape") }
                    } header: { Text("الإدارة") } footer: {
                        Text("حسابك وكلمة المرور وسجل النشاط والفريق وبيانات المنشأة.")
                    }
                    if me.can("plans.view") || me.can("tasks.view") || me.can("projects.view") {
                        Section {
                            if me.can("plans.view") { NavigationLink { PlansView() } label: { Label("الخطط والأهداف", systemImage: "target") } }
                            NavigationLink { ReportsHubView() } label: { Label("التقارير", systemImage: "chart.bar.doc.horizontal") }
                        } header: { Text("التخطيط والتحليل") }
                    }
                }

                Section {
                    Toggle(isOn: $faceID) {
                        Label("فتح التطبيق بـ \(Biometry.name)", systemImage: Biometry.icon)
                    }
                    Picker(selection: $theme) {
                        Text("تلقائي").tag("system")
                        Text("فاتح").tag("light")
                        Text("داكن").tag("dark")
                    } label: {
                        Label("المظهر", systemImage: "circle.lefthalf.filled")
                    }
                } header: {
                    Text("هذا الجهاز")
                }

                Section {
                    LabeledContent("الخادم", value: AppConfig.serverHost)
                    LabeledContent("الإصدار", value: "\(AppConfig.version) (\(AppConfig.build))")
                } header: {
                    Text("المنصة")
                } footer: {
                    Text("نفس بيانات الموقع وصلاحيات حسابك.")
                }

                Section {
                    Button(role: .destructive) {
                        confirmSignOut = true
                    } label: {
                        Label("تسجيل الخروج", systemImage: "rectangle.portrait.and.arrow.forward")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Buad.canvas.ignoresSafeArea())
            .navigationTitle("المزيد")
            .confirmationDialog("تسجيل الخروج من هذا الجهاز؟", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("تسجيل الخروج", role: .destructive) { Task { await session.signOut() } }
                Button("إلغاء", role: .cancel) {}
            }
        }
    }
}
