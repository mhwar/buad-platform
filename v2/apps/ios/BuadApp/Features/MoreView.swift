import SwiftUI

struct MoreView: View {
    private static let soonIcon = ["الاجتماعات": "person.3", "القرارات": "checkmark.seal", "الخطط والأهداف": "target",
                                   "التقارير": "chart.bar.doc.horizontal", "الإعدادات": "gearshape"]

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

                if let me = session.me {
                    let work = me.can("tasks.view") || me.can("clients.view") || me.can("documents.view")
                    if work {
                        Section {
                            if me.can("tasks.view") { NavigationLink { TasksView().navigationTitle("المهام").navigationBarTitleDisplayMode(.inline) } label: { Label("المهام", systemImage: "checklist") } }
                            if me.can("clients.view") {
                                NavigationLink { FollowupsView() } label: { Label("المتابعات", systemImage: "clock.badge.checkmark") }
                                NavigationLink { ClientsView() } label: { Label("العملاء", systemImage: "person.2") }
                            }
                            if me.can("documents.view") { NavigationLink { DocumentsRegisterView() } label: { Label("المستندات", systemImage: "doc.text") } }
                        } header: { Text("العمل") }
                    }
                    if me.can("treasury.view") || me.can("vat.view") {
                        Section {
                            NavigationLink { FinanceView(embedded: true) } label: { Label("المالية", systemImage: "banknote") }
                        } header: { Text("المالية") }
                    }
                    Section {
                        ForEach(["الاجتماعات", "القرارات", "الخطط والأهداف", "التقارير", "الإعدادات"], id: \.self) { name in
                            NavigationLink { SoonView(name: name) } label: {
                                HStack {
                                    Label(name, systemImage: Self.soonIcon[name] ?? "hammer")
                                    Spacer()
                                    Text("قريباً").font(.caption.weight(.semibold)).foregroundStyle(Buad.accentInk)
                                        .padding(.horizontal, 8).padding(.vertical, 3)
                                        .background(Buad.accentSoft, in: Capsule())
                                }
                            }
                        }
                    } header: { Text("قيد النقل إلى التطبيق") } footer: {
                        Text("أقسام الموقع التي تنتقل إلى التطبيق تباعاً. كل قسم يظهر هنا بمجرد جاهزيته.")
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
