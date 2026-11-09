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
    /// A client with a similar name exists (409 «similar_name»): ask, then send confirmSimilarName.
    case similarName(String)
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
        case .similarName(let name):
            return "يوجد عميل باسم مشابه" + (name.isEmpty ? "" : " («\(name)»)") + ". هل تريد إنشاء عميل جديد رغم ذلك؟"
        case .rejected(let code):
            if let q = QuoteVocabulary.error(code) ?? ProjectVocabulary.error(code) { return q }
            switch code {
            case "end_before_start": return "تاريخ الاستحقاق قبل تاريخ البداية."
            case "not_found": return "لم يعد هذا العنصر موجوداً أو لا تملك صلاحية الوصول إليه."
            case "not_pending": return "سُجّلت هذه الدفعة من قبل. اسحب للتحديث."
            case "amount_exceeds_line": return "المبلغ أكبر من الدفعة."
            case "closed", "project_closed": return "المشروع مغلق مالياً. أعد فتحه من «…» في صفحة المشروع أولاً."
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
            if reason == "similar_name" {
                throw APIError.similarName(((json?["similar"] as? [String: Any])?["name"] as? String) ?? "")
            }
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

    // MARK: 0.4.0 — quotes, new opportunities and clients (features/sales, features/clients)

    func quotes() async throws -> [SalesQuote] {
        let r: QuotesEnvelope = try await send("GET", "/api/quotes")
        return r.quotes
    }

    func quote(_ id: String) async throws -> SalesQuote {
        let r: QuoteEnvelope = try await send("GET", "/api/quotes/\(id)")
        return r.quote
    }

    func catalog() async throws -> [CatalogItem] {
        let r: CatalogEnvelope = try await send("GET", "/api/quotes/catalog")
        return r.items
    }

    func quoteVatRate() async throws -> Double {
        let r: VatRateEnvelope = try await send("GET", "/api/quotes/vat-rate")
        return r.rate
    }

    /// POST /api/quotes (new) or PATCH /api/quotes/:id with the version it started from.
    func saveQuote(id: String?, version: Int, _ body: [String: Any]) async throws -> String {
        if let id {
            var b = body
            b["version"] = version
            let _: OKEnvelope = try await send("PATCH", "/api/quotes/\(id)", body: b)
            return id
        }
        let r: CreatedEnvelope = try await send("POST", "/api/quotes", body: body)
        return r.id
    }

    func setQuoteStatus(_ id: String, to: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/quotes/\(id)/status", body: ["to": to])
    }

    func duplicateQuote(_ id: String) async throws -> String {
        let r: CreatedEnvelope = try await send("POST", "/api/quotes/\(id)/duplicate")
        return r.id
    }

    func deleteQuote(_ id: String) async throws {
        let _: OKEnvelope = try await send("DELETE", "/api/quotes/\(id)")
    }

    /// «تحويل إلى مشروع»: the client (existing, or made from the offer), a project and its payment schedule.
    func convertQuote(_ id: String, schedule: String, projectName: String, clientId: String?, confirmSimilarName: Bool) async throws -> ConvertResult {
        var body: [String: Any] = ["schedule": schedule, "projectName": projectName, "confirmSimilarName": confirmSimilarName]
        if let clientId, !clientId.isEmpty { body["clientId"] = clientId }
        return try await send("POST", "/api/quotes/\(id)/convert", body: body)
    }

    /// The offer as the website prints it (POST /api/pdf with /print/quotes/:id), as PDF bytes.
    func quotePDF(_ id: String, name: String) async throws -> Data {
        try await perform("POST", "/api/pdf", body: ["path": "/print/quotes/\(id)", "name": name])
    }

    /// POST /api/product-requests: an opportunity for an existing client, a new one made in the same step, or a contact only.
    func createOpportunity(_ body: [String: Any]) async throws -> CreatedEnvelope {
        try await send("POST", "/api/product-requests", body: body)
    }

    /// POST /api/clients (clients.edit).
    func createClient(_ body: [String: Any]) async throws -> CreatedEnvelope {
        try await send("POST", "/api/clients", body: body)
    }

    // MARK: 0.5.0 — the whole project page (projects.ts, project-close.ts, team.ts, documents.ts, share.ts, tasks.ts)

    /// POST /api/projects (projectInput) → the new project's id.
    func createProject(_ body: [String: Any]) async throws -> String {
        let r: CreatedEnvelope = try await send("POST", "/api/projects", body: body)
        return r.id
    }

    /// PATCH /api/projects/:id with the changed fields only (expectedValue in riyals).
    func updateProject(_ id: String, _ fields: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/projects/\(id)", body: fields)
    }

    func archiveProject(_ id: String) async throws { let _: OKEnvelope = try await send("POST", "/api/projects/\(id)/archive") }
    func restoreProject(_ id: String) async throws { let _: OKEnvelope = try await send("POST", "/api/projects/\(id)/restore") }
    func deleteProject(_ id: String) async throws { let _: OKEnvelope = try await send("DELETE", "/api/projects/\(id)") }

    /// «نقل إلى المبيعات»: a draft project becomes an opportunity (its id) and comes back when converted.
    func moveToSales(_ id: String) async throws -> String {
        let r: CreatedEnvelope = try await send("POST", "/api/projects/\(id)/to-sales")
        return r.id
    }

    func closeCheck(_ id: String) async throws -> CloseCheck { try await send("GET", "/api/projects/\(id)/close") }

    /// «إغلاق المشروع» (note) / «إلغاء المشروع» (reason), with the contract settlement.
    func closeProject(_ id: String, cancel: Bool, text: String, finalRiyals: Double?, cancelInstalments: Bool) async throws {
        var body: [String: Any] = [cancel ? "reason" : "note": text, "cancelInstalments": cancelInstalments]
        if let finalRiyals { body["finalValue"] = finalRiyals }
        let _: OKEnvelope = try await send("POST", "/api/projects/\(id)/close" + (cancel ? "/cancel" : ""), body: body)
    }

    func reopenProject(_ id: String, reason: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/projects/\(id)/close/reopen", body: ["reason": reason])
    }

    func teamUsers() async throws -> [Person] {
        let r: PeopleEnvelope = try await send("GET", "/api/team/users")
        return r.users.filter(\.active)
    }

    func projectMembers(_ id: String) async throws -> [String] {
        let r: MembersEnvelope = try await send("GET", "/api/team/projects/\(id)/members")
        return r.userIds
    }

    func setProjectMembers(_ id: String, _ userIds: [String]) async throws {
        let _: OKEnvelope = try await send("PUT", "/api/team/projects/\(id)/members", body: ["userIds": userIds])
    }

    /// The project's financial report as the website prints it (client or detailed), as PDF bytes.
    func financeReportPDF(_ id: String, detailed: Bool, name: String) async throws -> Data {
        try await perform("POST", "/api/pdf", body: ["path": "/print/finance/\(id)?mode=\(detailed ? "detailed" : "client")", "name": name])
    }

    // documents

    func documentTemplates() async throws -> DocTemplates { try await send("GET", "/api/documents/templates") }

    func createDocument(_ projectId: String, kind: String, template: String, title: String?) async throws -> String {
        var body: [String: Any] = ["kind": kind, "template": template]
        if let title, !title.isEmpty { body["title"] = title }
        let r: CreatedEnvelope = try await send("POST", "/api/projects/\(projectId)/documents", body: body)
        return r.id
    }

    func document(_ id: String) async throws -> DocumentDetail { try await send("GET", "/api/documents/\(id)") }

    /// PATCH /api/documents/:id with its version (title, number, variables, content).
    func updateDocument(_ id: String, version: Int, _ fields: [String: Any]) async throws -> DocumentDetail {
        var b = fields
        b["version"] = version
        return try await send("PATCH", "/api/documents/\(id)", body: b)
    }

    func setDocumentStatus(_ id: String, to: String, version: Int) async throws -> DocumentDetail {
        try await send("POST", "/api/documents/\(id)/status", body: ["to": to, "version": version])
    }

    func registerOutgoing(_ id: String) async throws -> String {
        let r: OutgoingEnvelope = try await send("POST", "/api/documents/\(id)/outgoing")
        return r.outgoingNo
    }

    func duplicateDocument(_ id: String) async throws -> String {
        let r: CreatedEnvelope = try await send("POST", "/api/documents/\(id)/duplicate")
        return r.id
    }

    func deleteDocument(_ id: String) async throws { let _: OKEnvelope = try await send("DELETE", "/api/documents/\(id)") }

    func documentPDF(_ id: String, name: String) async throws -> Data {
        try await perform("POST", "/api/pdf", body: ["path": "/print/documents/\(id)", "name": name])
    }

    func shares(_ docId: String) async throws -> [DocShare] {
        let r: SharesEnvelope = try await send("GET", "/api/documents/\(docId)/shares")
        return r.items
    }

    /// A client link to the approved document (7 or 30 days) → its full URL.
    func createShare(_ docId: String, days: Int, channel: String) async throws -> URL? {
        let r: ShareCreated = try await send("POST", "/api/documents/\(docId)/shares", body: ["days": days, "channel": channel])
        return webURL(r.path)
    }

    func revokeShare(_ docId: String, _ shareId: String) async throws {
        let _: OKEnvelope = try await send("DELETE", "/api/documents/\(docId)/shares/\(shareId)")
    }

    // execution

    func assignees() async throws -> [Person] {
        let r: PeopleEnvelope = try await send("GET", "/api/tasks/assignees")
        return r.users
    }

    func addStage(_ projectId: String, title: String, dueDate: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/tasks/projects/\(projectId)/stages", body: ["title": title, "dueDate": dueDate])
    }

    func stagesFromService(_ projectId: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/tasks/projects/\(projectId)/stages/from-service")
    }

    func updateStage(_ id: String, _ fields: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/tasks/stages/\(id)", body: fields)
    }

    func deleteStage(_ id: String) async throws { let _: OKEnvelope = try await send("DELETE", "/api/tasks/stages/\(id)") }

    func createTask(_ body: [String: Any]) async throws {
        let _: OKEnvelope = try await send("POST", "/api/tasks", body: body)
    }

    func patchTask(_ id: String, _ fields: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/tasks/\(id)", body: fields)
    }

    func deleteTask(_ id: String) async throws { let _: OKEnvelope = try await send("DELETE", "/api/tasks/\(id)") }

    func logTime(_ taskId: String, minutes: Int, date: String, note: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/tasks/\(taskId)/time", body: ["minutes": minutes, "date": date, "note": note])
    }

    // MARK: 0.6.0 — what used to open the website

    /// PATCH /api/projects/:id/finance/ctrl (finance.edit): the contract settings, riyals as typed.
    func saveContract(_ projectId: String, _ body: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/projects/\(projectId)/finance/ctrl", body: body)
    }

    /// «تسجيلها كلها»: every agreement item (execution fee, marketing, cashback, fees) as an entry.
    func registerAgreement(_ projectId: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/projects/\(projectId)/finance/agreement-all")
    }

    /// PATCH /api/receivables/:id — an instalment's label, date or amount (riyals) while it is pending.
    func updateScheduleLine(_ id: String, _ fields: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/receivables/\(id)", body: fields)
    }

    /// GET /api/receivables with the bank balance the forecast starts from (riyals).
    func receivables(opening riyals: Double) async throws -> Receivables {
        try await send("GET", "/api/receivables?opening=\(riyals)")
    }

    /// PATCH /api/clients/:id — the client's own fields (contacts are left as they are).
    func updateClient(_ id: String, _ fields: [String: Any]) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/clients/\(id)", body: fields)
    }

    func updateClientFollowUp(_ id: String, _ date: String) async throws {
        let _: OKEnvelope = try await send("PATCH", "/api/crm/clients/\(id)", body: ["nextFollowUpAt": date])
    }

    func followups(all: Bool) async throws -> [Followup] {
        let r: FollowupsEnvelope = try await send("GET", "/api/crm/followups?scope=\(all ? "all" : "mine")")
        return r.items
    }

    /// PATCH on the thing the follow-up belongs to: an opportunity's date, or a client's next contact.
    func setFollowUp(_ f: Followup, to date: String) async throws {
        if f.kind == "request" {
            try await updateOpportunity(f.id, ["followUpAt": date])
        } else {
            let _: OKEnvelope = try await send("PATCH", "/api/crm/clients/\(f.id)", body: ["nextFollowUpAt": date])
        }
    }

    /// A contact logged for a client (call, meeting, visit, mail, WhatsApp, note).
    func logClientActivity(_ clientId: String, type: String, summary: String) async throws {
        let _: OKEnvelope = try await send("POST", "/api/crm/clients/\(clientId)/activities", body: ["type": type, "summary": summary])
    }

    func documentsRegister(status: String?, query: String) async throws -> [RegisterDocument] {
        var items: [String] = []
        if let status, !status.isEmpty { items.append("status=\(status)") }
        let q = query.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty, let e = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("q=\(e)") }
        let r: RegisterEnvelope = try await send("GET", "/api/documents" + (items.isEmpty ? "" : "?" + items.joined(separator: "&")))
        return r.items
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
