import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var session: Session
    @State private var server = AppConfig.storedServer
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private enum Field { case server, email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                VStack(spacing: 12) {
                    Image("Logo")
                        .resizable()
                        .renderingMode(.template)
                        .scaledToFit()
                        .foregroundStyle(Buad.logo)
                        .frame(width: 52, height: 52)
                        .padding(10)
                        .background(Buad.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    Text("منصة بُعد").font(.title.bold())
                    Text("سجّل الدخول بحساب المنصة نفسه").font(.subheadline).foregroundStyle(Buad.muted)
                }

                VStack(alignment: .leading, spacing: 16) {
                    if AppConfig.needsServerEntry {
                        labeled("عنوان المنصة") {
                            TextField("buad.example.sa", text: $server)
                                .keyboardType(.URL)
                                .textContentType(.URL)
                                .focused($focus, equals: .server)
                                .submitLabel(.next)
                        }
                    }
                    labeled("البريد الإلكتروني") {
                        TextField("name@buad.sa", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .focused($focus, equals: .email)
                            .submitLabel(.next)
                            .onChange(of: email) { _, _ in session.notice = nil }
                    }
                    labeled("كلمة المرور") {
                        SecureField("", text: $password)
                            .textContentType(.password)
                            .focused($focus, equals: .password)
                            .submitLabel(.go)
                    }
                    if let message = error ?? session.notice {
                        Text(message).font(.footnote).foregroundStyle(Buad.dangerInk)
                    }
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack(spacing: 8) {
                            if busy { ProgressView().tint(Buad.onInk) }
                            Text("دخول").font(.body.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Buad.ink)
                    .foregroundStyle(Buad.onInk)
                    .disabled(busy)
                    // The website's «/recover»: the e-mail, the recovery key kept offline, a new password.
                    if let url = APIClient.shared.webURL("/recover") {
                        Link("نسيت كلمة المرور؟", destination: url)
                            .font(.subheadline)
                            .foregroundStyle(Buad.muted)
                            .frame(maxWidth: .infinity, minHeight: Buad.tap)
                    }
                }

                Text("الإصدار \(AppConfig.version) · بيانات المنصة الفعلية")
                    .font(.caption)
                    .foregroundStyle(Buad.muted)
            }
            .padding(.horizontal, 24)
            .padding(.top, 64)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Buad.canvas.ignoresSafeArea())
        .onSubmit {
            switch focus {
            case .server: focus = .email
            case .email: focus = .password
            default: Task { await submit() }
            }
        }
    }

    private func labeled<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.footnote.weight(.medium)).foregroundStyle(Buad.muted)
            content()
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .environment(\.layoutDirection, .leftToRight)
                .multilineTextAlignment(.trailing)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
        }
    }

    private func submit() async {
        error = nil
        let mail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        if AppConfig.needsServerEntry, !AppConfig.setServer(server) {
            error = APIError.noServer.message
            return
        }
        guard mail.contains("@"), mail.contains(".") else {
            error = "أدخل بريداً إلكترونياً صحيحاً"
            return
        }
        guard !password.isEmpty else {
            error = "أدخل كلمة المرور"
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await session.signIn(email: mail, password: password)
            password = ""
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.network.message
        }
    }
}
