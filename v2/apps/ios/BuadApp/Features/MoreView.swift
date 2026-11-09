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
                    Toggle(isOn: $faceID) {
                        Label("فتح التطبيق بـ Face ID", systemImage: "faceid")
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
                    if let url = APIClient.shared.webURL("/") {
                        Link(destination: url) {
                            Label("فتح المنصة في المتصفح", systemImage: "safari")
                        }
                    }
                    LabeledContent("الخادم", value: AppConfig.serverHost)
                    LabeledContent("الإصدار", value: "\(AppConfig.version) (\(AppConfig.build))")
                } header: {
                    Text("المنصة")
                } footer: {
                    Text("التطبيق يقرأ من نفس خادم الموقع وقاعدة بياناته، بنفس صلاحيات حسابك. بقية الأقسام تنتقل إلى التطبيق مرحلةً بعد مرحلة.")
                }

                Section {
                    Button(role: .destructive) {
                        confirmSignOut = true
                    } label: {
                        Label("تسجيل الخروج", systemImage: "rectangle.portrait.and.arrow.right")
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
