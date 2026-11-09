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
    /// POST …/receipts answered «over_contract»: received so far and the contract, both in halalas.
    case overContract(received: Int, gross: Int)
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
        case .overContract(let received, let gross):
            return "استُلم \(Fmt.sar(received)) من عقد قيمته \(Fmt.sar(gross)). هل هذه دفعة فعلية وليست مكررة؟"
        case .rejected(let code):
            switch code {
            case "end_before_start": return "تاريخ الاستحقاق قبل تاريخ البداية."
            case "not_found": return "لم يعد هذا العنصر موجوداً أو لا تملك صلاحية الوصول إليه."
            case "not_pending": return "سُجّلت هذه الدفعة من قبل. اسحب للتحديث."
            case "amount_exceeds_line": return "المبلغ أكبر من الدفعة."
            case "closed", "project_closed": return "المشروع مغلق مالياً. أعد فتحه من الموقع أولاً."
            case "in_distribution": return "وُزّع ربح هذا المبلغ على الشركاء في توزيع مكتمل؛ ألغِ التوزيع أولاً من الموقع."
            case "too_large": return "الملف أكبر من 2 ميغابايت."
            case "unsupported_type": return "نوع الملف غير مدعوم. المسموح: صورة أو PDF."
            case "storage_unavailable": return "تخزين الملفات غير متاح الآن."
            case "already_received": return "استُلمت هذه الدفعة، فلا تُعدَّل ولا تُحذف."
            case "invalid_asset": return "الملف المرفق غير موجود. ارفعه من جديد."
            case "invalid_category": return "التصنيف غير موجود. اسحب للتحديث ثم اختر تصنيفاً آخر."
            case "tax_invoice_on_expense_only": return "الفاتورة الضريبية للمصروفات فقط."
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

    private func send<T: Decodable>(_ method: String, _ path: String, body: [String: Any]? = nil,
                                    raw: (data: Data, type: String)? = nil) async throws -> T {
        let data = try await perform(method, path, body: body, raw: raw)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }

    /// The request itself, with the API's status codes turned into APIError; answers the raw bytes.
    private func perform(_ method: String, _ path: String, body: [String: Any]? = nil,
                         raw: (data: Data, type: String)? = nil) async throws -> Data {
        var request = URLRequest(url: try url(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ios/\(AppConfig.version) (\(AppConfig.build))", forHTTPHeaderField: "X-Buad-Client")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } else if let raw {
            request.setValue(raw.type, forHTTPHeaderField: "Content-Type")
            request.httpBody = raw.data
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
        case 400, 404, 409, 413, 415, 422, 503:
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let reason = json?["error"] as? String
            if reason == "over_contract" {
                let riyals = { (k: String) -> Int in Int((((json?[k] as? NSNumber)?.doubleValue ?? 0) * 100).rounded()) }
                throw APIError.overContract(received: riyals("received"), gross: riyals("gross"))
            }
            throw APIError.rejected(reason ?? "")
        default: throw APIError.server(code)
        }
        return data
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

    // MARK: 0.2.0 — finance and collection

    func receivables() async throws -> Receivables {
        try await send("GET", "/api/receivables")
    }

    /// The website's «تسجيل مقبوض» (features/receivables/ReceiveDialog.tsx): POST /api/receivables/:id/receive
    /// with the bank day and the riyal amount. Less than the line keeps the rest as a new pending line.
    /// Returns what remains, in halalas.
    func receive(lineId: String, date: String, riyals: Double) async throws -> Int {
        let r: ReceiveResult = try await send("POST", "/api/receivables/\(lineId)/receive", body: ["date": date, "amount": riyals])
        return r.rest
    }

    func financeOverview(_ period: FinancePeriod) async throws -> FinanceOverview {
        guard let (from, to) = period.bounds else { return try await send("GET", "/api/finance/overview") }
        return try await send("GET", "/api/finance/overview?from=\(from)&to=\(to)")
    }

    /// q = 0: the whole year, as the website's VatTab.
    func vatReport(year: Int, quarter: Int) async throws -> VatReport {
        try await send("GET", "/api/finance/vat/report?year=\(year)" + (quarter > 0 ? "&q=\(quarter)" : ""))
    }

    func vatYear(_ year: Int) async throws -> VatYear {
        try await send("GET", "/api/finance/vat/year?year=\(year)")
    }

    // MARK: 0.2.4 — entries (features/finance/api.ts addEntry / updateEntry / deleteEntry)
    // Each answers with the project's whole finance, recomputed by the server.

    func addEntry(_ projectId: String, _ body: [String: Any]) async throws -> ProjectFinance {
        try await send("POST", "/api/projects/\(projectId)/finance/entries", body: body)
    }

    func updateEntry(_ projectId: String, _ entryId: String, _ body: [String: Any]) async throws -> ProjectFinance {
        try await send("PATCH", "/api/projects/\(projectId)/finance/entries/\(entryId)", body: body)
    }

    func deleteEntry(_ projectId: String, _ entryId: String) async throws -> ProjectFinance {
        try await send("DELETE", "/api/projects/\(projectId)/finance/entries/\(entryId)")
    }

    // MARK: 0.2.5 — receipts, the payment schedule, sales tax invoices (the website's own calls)

    /// features/finance/api.ts addReceipt. `confirmOver` after the person confirms an over-contract amount.
    func addReceipt(_ projectId: String, date: String, riyals: Double, note: String, confirmOver: Bool) async throws -> ProjectFinance {
        var body: [String: Any] = ["date": date, "amount": riyals, "note": note, "basis": ""]
        if confirmOver { body["confirmOver"] = true }
        return try await send("POST", "/api/projects/\(projectId)/finance/receipts", body: body)
    }

    func updateReceipt(_ projectId: String, _ id: String, date: String, riyals: Double, note: String) async throws -> ProjectFinance {
        try await send("PATCH", "/api/projects/\(projectId)/finance/receipts/\(id)", body: ["date": date, "amount": riyals, "note": note])
    }

    func approveReceipt(_ projectId: String, _ id: String) async throws -> ProjectFinance {
        try await send("POST", "/api/projects/\(projectId)/finance/receipts/\(id)/approve")
    }

    func deleteReceipt(_ projectId: String, _ id: String) async throws -> ProjectFinance {
        try await send("DELETE", "/api/projects/\(projectId)/finance/receipts/\(id)")
    }

    /// features/receivables/ScheduleCard.tsx: an instalment expected from the client (riyals, gross).
    func addScheduleLine(_ projectId: String, label: String, dueDate: String, riyals: Double) async throws {
        let _: OKEnvelope = try await send("POST", "/api/receivables/projects/\(projectId)", body: ["label": label, "dueDate": dueDate, "amount": riyals])
    }

    func deleteScheduleLine(_ id: String) async throws {
        let _: OKEnvelope = try await send("DELETE", "/api/receivables/\(id)")
    }

    func salesInvoices(_ projectId: String) async throws -> [SalesInvoice] {
        let envelope: SalesInvoicesEnvelope = try await send("GET", "/api/finance/vat/invoices?projectId=\(projectId)")
        return envelope.items
    }

    /// features/finance/SalesInvoices.tsx. `vat` nil = the server works it out from the project's rate.
    func saveSalesInvoice(id: String?, projectId: String, number: String, date: String, riyals: Double, vat: Double?, receiptId: String, assetId: String, note: String) async throws {
        var body: [String: Any] = ["projectId": projectId, "number": number, "date": date, "amount": riyals, "receiptId": receiptId, "assetId": assetId, "note": note]
        if let vat { body["vat"] = vat }
        if let id {
            let _: OKEnvelope = try await send("PATCH", "/api/finance/vat/invoices/\(id)", body: body)
        } else {
            let _: OKEnvelope = try await send("POST", "/api/finance/vat/invoices", body: body)
        }
    }

    /// POST /api/assets: the file's own bytes (PDF or image), as the website's uploadImage. Needs assets.edit.
    func uploadAsset(_ data: Data, type: String) async throws -> String {
        let r: AssetEnvelope = try await send("POST", "/api/assets", raw: (data, type))
        return r.id
    }

    /// GET /api/assets/:id with this session: the stored file's bytes.
    func assetData(_ id: String) async throws -> Data {
        try await perform("GET", "/api/assets/\(id)")
    }

    func deleteSalesInvoice(_ id: String) async throws {
        let _: OKEnvelope = try await send("DELETE", "/api/finance/vat/invoices/\(id)")
    }

    // MARK: 0.3.0 — sales (features/sales/api.ts): opportunities, their timeline, and the dashboard

    func opportunities() async throws -> [Opportunity] {
        let envelope: OpportunitiesEnvelope = try await send("GET", "/api/product-requests")
        return envelope.requests
    }

    func opportunity(_ id: String) async throws -> OpportunityDetail {
        try await send("GET", "/api/product-requests/\(id)")
    }

    func salesOverview() async throws -> SalesOverview {
        try await send("GET", "/api/sales/overview")
    }

    /// «تسجيل تواصل»: a call, meeting, … on the opportunity, with an optional next follow-up.
    /// The server moves a «جديد» opportunity to «مؤهَّل» on its first contact, as on the website.
    func logActivity(_ id: String, type: String, summary: String, on: String, followUpAt: String?) async throws {
        var body: [String: Any] = ["type": type, "summary": summary, "on": on]
        if let followUpAt { body["followUpAt"] = followUpAt }
        let _: OKEnvelope = try await send("POST", "/api/product-requests/\(id)/activities", body: body)
    }

    /// PATCH /api/product-requests/:id with the changed fields (status, followUpAt, lostReason, value…).
    func updateOpportunity(_ id: String, _ fields: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/product-requests/\(id)", body: fields)
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
