import Foundation

// Shapes of the existing v2 API responses (v2/apps/api/src). The app adds nothing of its own:
// every figure on screen is what the server sends, so the app and the website always agree.

/// GET /api/me and POST /api/auth/login → `{ ok, user }` (publicUser in app.ts).
struct Me: Decodable, Equatable {
    let id: String
    let orgId: String
    let email: String
    let name: String
    let role: String
    let roleKey: String
    let perms: [String]

    enum CodingKeys: String, CodingKey { case id, orgId, email, name, role, roleKey, perms }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        orgId = c.string(.orgId)
        email = c.string(.email)
        name = c.string(.name)
        role = c.string(.role)
        roleKey = c.string(.roleKey)
        perms = (try? c.decode([String].self, forKey: .perms)) ?? []
    }

    /// Same rule as the website's `useCan`: the role grants it or it does not.
    func can(_ perm: String) -> Bool { perms.contains(perm) }

    var firstName: String { name.split(separator: " ").first.map(String.init) ?? name }
}

struct MeEnvelope: Decodable { let user: Me? }

struct OKEnvelope: Decodable { let ok: Bool? }

/// GET /api/attention → `{ ok, items, checklist }` (modules/attention.ts).
struct AttentionItem: Decodable, Identifiable, Equatable {
    let key: String
    let tone: String
    let title: String
    let count: Int
    let link: String

    var id: String { key }
}

struct AttentionEnvelope: Decodable { let items: [AttentionItem] }

/// One row of GET /api/projects → `{ ok, items, counts }` (modules/projects.ts).
/// Money fields are halalas; `received`/`nextDueAmount` are null for roles without finance.view.
struct ProjectItem: Decodable, Identifiable, Hashable {
    let id: String
    let number: String
    let name: String
    let type: String
    let status: String
    let clientName: String
    let productName: String
    let startDate: String
    let endDate: String
    let contractTotal: Int
    let received: Int?
    let estimated: Bool
    let external: Bool
    let late: Bool
    let fullyDistributed: Bool
    let closed: Bool
    let stagesTotal: Int
    let stagesDone: Int
    let tasksOpen: Int
    let tasksDone: Int
    let tasksOverdue: Int
    let nextDueDate: String
    let nextDueAmount: Int?

    enum CodingKeys: String, CodingKey {
        case id, number, name, type, status, clientName, productName, startDate, endDate, contractTotal, received
        case estimated, external, late, fullyDistributed, closedAt, stagesTotal, stagesDone, tasksOpen, tasksDone
        case tasksOverdue, nextDueDate, nextDueAmount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        number = c.string(.number)
        name = c.string(.name)
        type = c.string(.type)
        status = c.string(.status)
        clientName = c.string(.clientName)
        productName = c.string(.productName)
        startDate = c.string(.startDate)
        endDate = c.string(.endDate)
        contractTotal = c.int(.contractTotal)
        received = c.optionalInt(.received)
        estimated = c.bool(.estimated)
        external = c.bool(.external)
        late = c.bool(.late)
        fullyDistributed = c.bool(.fullyDistributed)
        closed = c.optionalInt(.closedAt).map { $0 > 0 } ?? false
        stagesTotal = c.int(.stagesTotal)
        stagesDone = c.int(.stagesDone)
        tasksOpen = c.int(.tasksOpen)
        tasksDone = c.int(.tasksDone)
        tasksOverdue = c.int(.tasksOverdue)
        nextDueDate = c.string(.nextDueDate)
        nextDueAmount = c.optionalInt(.nextDueAmount)
    }

    /// «التنفيذ»: stages when the project has them, otherwise tasks (as the website's ProjectCard).
    var execution: (done: Int, total: Int) {
        stagesTotal > 0 ? (stagesDone, stagesTotal) : (tasksDone, tasksDone + tasksOpen)
    }
}

struct ProjectsEnvelope: Decodable {
    let items: [ProjectItem]
    let counts: [String: Int]?
}

enum Vocabulary {
    /// PROJECT_STATUSES (packages/schema) with the website's badge tones.
    static func status(_ key: String) -> (label: String, tone: Tone) {
        switch key {
        case "draft": return ("مسودة", .neutral)
        case "active": return ("جاري التنفيذ", .ok)
        case "completed": return ("مكتمل", .info)
        case "paused": return ("متوقف", .warn)
        case "cancelled": return ("ملغي", .bad)
        default: return (key, .neutral)
        }
    }

    static func type(_ key: String) -> String {
        switch key {
        case "training": return "تدريب"
        case "consulting": return "استشارات"
        case "event": return "فعالية"
        default: return "أخرى"
        }
    }

    /// CATEGORY_LABELS (packages/schema/src/finance.ts).
    static let entryCategory: [String: String] = [
        "salary": "رواتب", "logistics": "لوجستيات", "materials": "مواد", "other": "أخرى", "exec": "أتعاب",
        "mkt": "تسويق", "cashback": "كاش باك", "cf": "رسوم إضافية", "vat": "ضريبة",
    ]

    /// ENTRY_STATUS_LABELS; an empty status shows nothing.
    static func entryStatus(_ key: String) -> (label: String, tone: Tone)? {
        switch key {
        case "paid": return ("مدفوع", .ok)
        case "pending": return ("معلق", .warn)
        case "cancelled": return ("ملغي", .neutral)
        default: return nil
        }
    }

    /// Payment schedule (paymentSchedule.status).
    static func scheduleStatus(_ key: String, dueDate: String) -> (label: String, tone: Tone) {
        switch key {
        case "received": return ("مستلمة", .ok)
        case "cancelled": return ("ملغاة", .neutral)
        default: return dueDate < Fmt.todayISO ? ("متأخرة", .bad) : ("قادمة", .info)
        }
    }

    /// DOC_KIND_LABELS and DOC_STATUS_LABELS (packages/schema/src/documents.ts) with the website's tones.
    static func docKind(_ key: String) -> String { key == "contract" ? "عقد" : key == "letter" ? "خطاب" : key }

    static func docStatus(_ key: String) -> (label: String, tone: Tone) {
        switch key {
        case "review": return ("قيد المراجعة", .warn)
        case "approved": return ("معتمد", .ok)
        default: return ("مسودة", .neutral)
        }
    }

    /// STATUS_LABEL (features/tasks/queries.ts) and TaskRow tones.
    static func taskStatus(_ key: String) -> (label: String, tone: Tone) {
        switch key {
        case "doing": return ("قيد التنفيذ", .info)
        case "blocked": return ("معلّقة", .warn)
        case "done": return ("منجزة", .ok)
        default: return ("لم تبدأ", .neutral)
        }
    }

    static func priority(_ key: String) -> String? { key == "high" ? "عالية" : key == "low" ? "منخفضة" : nil }
}

// Lenient reading: SQLite sends booleans as 0/1 and some counts as strings; a missing field never breaks a screen.
extension KeyedDecodingContainer {
    func string(_ key: Key) -> String { (try? decodeIfPresent(String.self, forKey: key)) ?? "" }

    func int(_ key: Key) -> Int { optionalInt(key) ?? 0 }

    func optionalInt(_ key: Key) -> Int? {
        if let v = try? decodeIfPresent(Int.self, forKey: key) { return v }
        if let v = try? decodeIfPresent(Double.self, forKey: key) { return Int(v.rounded()) }
        if let v = try? decodeIfPresent(String.self, forKey: key), let n = Double(v) { return Int(n.rounded()) }
        return nil
    }

    func bool(_ key: Key) -> Bool {
        if let v = try? decodeIfPresent(Bool.self, forKey: key) { return v }
        return (optionalInt(key) ?? 0) != 0
    }
}
