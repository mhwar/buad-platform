import Foundation

enum APIError: Error, Equatable {
    case noServer
    case unauthorized
    case invalidCredentials
    case tooManyAttempts
    case forbidden
    case server(Int)
    /// A 4xx answer with the API's own error code (e.g. "end_before_start").
    case rejected(String)
    case network
    case decoding

    /// The website's own wording where it has one (features/auth, lib/format).
    var message: String {
        switch self {
        case .noServer: return "أدخل عنوان المنصة كاملاً، يبدأ بـ https."
        case .unauthorized: return "انتهت الجلسة. سجّل الدخول من جديد."
        case .invalidCredentials: return "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        case .tooManyAttempts: return "محاولات دخول كثيرة. انتظر دقيقة ثم حاول مجدداً."
        case .forbidden: return "دورك لا يسمح بهذه الصفحة."
        case .server: return "تعذّر التحميل. حاول مرة أخرى."
        case .rejected(let code):
            switch code {
            case "end_before_start": return "تاريخ الاستحقاق قبل تاريخ البداية."
            case "not_found": return "لم يعد هذا العنصر موجوداً أو لا تملك صلاحية الوصول إليه."
            default: return "رفضت المنصة هذا التعديل."
            }
        case .network: return "تعذّر الاتصال بالمنصة. تحقق من الإنترنت."
        case .decoding: return "وصل رد غير متوقع من المنصة."
        }
    }
}

/// The app talks only to the existing v2 API, exactly as the website does: same routes, same session,
/// same permissions. Sign-in uses POST /api/auth/login, whose session cookie the system keeps for us.
final class APIClient: @unchecked Sendable {
    static let shared = APIClient()

    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 25
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: config)
    }

    private func url(_ path: String) throws -> URL {
        guard let base = AppConfig.apiBase, let url = URL(string: path, relativeTo: base) else { throw APIError.noServer }
        return url.absoluteURL
    }

    private func send<T: Decodable>(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> T {
        var request = URLRequest(url: try url(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ios/\(AppConfig.version) (\(AppConfig.build))", forHTTPHeaderField: "X-Buad-Client")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        switch code {
        case 200..<300: break
        case 401: throw path == "/api/auth/login" ? APIError.invalidCredentials : APIError.unauthorized
        case 403: throw APIError.forbidden
        case 429: throw APIError.tooManyAttempts
        case 400, 404, 409, 422:
            let reason = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.rejected(reason ?? "")
        default: throw APIError.server(code)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }

    func signIn(email: String, password: String) async throws -> Me {
        let envelope: MeEnvelope = try await send("POST", "/api/auth/login", body: ["email": email, "password": password])
        guard let user = envelope.user else { throw APIError.decoding }
        return user
    }

    /// nil when there is no valid session.
    func me() async throws -> Me? {
        do {
            let envelope: MeEnvelope = try await send("GET", "/api/me")
            return envelope.user
        } catch APIError.unauthorized {
            return nil
        }
    }

    func attention() async throws -> [AttentionItem] {
        let envelope: AttentionEnvelope = try await send("GET", "/api/attention")
        return envelope.items
    }

    func projects() async throws -> ProjectsEnvelope {
        try await send("GET", "/api/projects")
    }

    func project(_ id: String) async throws -> ProjectDetail {
        try await send("GET", "/api/projects/\(id)")
    }

    func finance(_ projectId: String) async throws -> ProjectFinance {
        try await send("GET", "/api/projects/\(projectId)/finance")
    }

    func schedule(_ projectId: String) async throws -> [ScheduleItem] {
        let envelope: ScheduleEnvelope = try await send("GET", "/api/receivables/projects/\(projectId)")
        return envelope.items
    }

    func execution(_ projectId: String) async throws -> Execution {
        try await send("GET", "/api/tasks/projects/\(projectId)")
    }

    func documents(_ projectId: String) async throws -> [DocumentItem] {
        let envelope: DocumentsEnvelope = try await send("GET", "/api/projects/\(projectId)/documents")
        return envelope.items
    }

    // MARK: 0.1.2 — tasks, notifications, clients

    func tasks(mine: Bool) async throws -> [TaskItem] {
        let envelope: TasksEnvelope = try await send("GET", mine ? "/api/tasks?mine=1" : "/api/tasks")
        return envelope.items
    }

    /// The website's own calls (features/tasks/TaskRow.tsx): PATCH /api/tasks/:id with the changed fields.
    func updateTask(_ id: String, _ fields: [String: String]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/tasks/\(id)", body: fields)
    }

    func notifications() async throws -> NotificationsEnvelope {
        try await send("GET", "/api/notifications")
    }

    func markRead(_ id: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/notifications/\(id)/read")
    }

    func markAllRead() async throws {
        let _: OKEnvelope = try await send("POST", "/api/notifications/read-all")
    }

    func clients() async throws -> [ClientItem] {
        let envelope: ClientsEnvelope = try await send("GET", "/api/clients")
        return envelope.items
    }

    func client(_ id: String) async throws -> ClientDetail {
        try await send("GET", "/api/clients/\(id)")
    }

    func statement(_ clientId: String) async throws -> Statement {
        try await send("GET", "/api/clients/\(clientId)/statement")
    }

    func signOut() async {
        _ = try? await send("POST", "/api/auth/logout") as OKEnvelope
        if let base = AppConfig.apiBase, let cookies = HTTPCookieStorage.shared.cookies(for: base) {
            cookies.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }
    }

    /// The same page on the website, for anything this version shows read-only.
    func webURL(_ path: String) -> URL? {
        guard let base = AppConfig.apiBase else { return nil }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }
}
