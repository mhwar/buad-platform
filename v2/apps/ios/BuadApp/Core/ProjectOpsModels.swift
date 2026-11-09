import Foundation

// 0.5.0 «صفحة المشروع كاملة»: the shapes behind the project's writes — the team, the close check,
// documents (templates, the document with its fields and clauses, share links) and assignees.

/// PROJECT_STATUSES / PROJECT_TYPES (packages/schema/src/clients.ts).
enum ProjectVocabulary {
    static let statuses = ["draft", "active", "paused", "completed", "cancelled"]
    static let types = ["training", "consulting", "event", "other"]

    static let statusHint: [String: String] = [
        "draft": "لا تُحسب أرقامه في المالية",
        "active": "يُحسب في المالية والتحصيل",
        "paused": "العمل متوقف مؤقتاً",
        "completed": "انتهى التنفيذ",
        "cancelled": "توقّف العمل: يُفضّل «إلغاء المشروع» للتسوية",
    ]

    /// Project and document errors as the website words them.
    static func error(_ code: String) -> String? {
        switch code {
        case "has_records": return "للمشروع قيود مالية أو مستندات أو مهام، فلا يُحذف نهائياً. أرشِفه بدلاً من ذلك."
        case "client_archived": return "العميل مؤرشف. استعده أولاً."
        case "has_finance_records": return "للمشروع سجلات مالية، فلا يتغير كونه خارجياً."
        case "package_without_product": return "اختر الخدمة قبل الباقة."
        case "already_closed": return "المشروع مغلق من قبل."
        case "below_received": return "القيمة النهائية أقل من المستلم فعلاً."
        case "already_cancelled": return "المشروع ملغى من قبل."
        case "not_closed": return "المشروع غير مغلق."
        case "approved_locked": return "المستند معتمد ومقفل. أعد فتحه للتعديل أولاً."
        case "stale": return "عُدّل المستند من مكان آخر. اسحب للتحديث."
        case "number_taken": return "رقم المستند مستخدم في مستند آخر."
        case "has_history": return "للمستند نسخة معتمدة سابقة، فلا يُحذف."
        case "not_approved": return "اعتمد المستند أولاً."
        case "no_steps": return "الخدمة المرتبطة بلا خطوات في «آلية العمل»."
        case "has_stages": return "للمشروع مراحل من قبل."
        case "no_service": return "المشروع غير مرتبط بخدمة."
        case "assignee_not_found": return "المسؤول المختار لم يعد في الفريق."
        case "has_documents_or_tasks": return "للمشروع مستندات أو مهام. انقلها أو احذفها أولاً."
        case "not_draft": return "يُنقل إلى المبيعات المشروع المسودة فقط."
        default: return nil
        }
    }
}

struct Person: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let email: String
    let active: Bool
    private enum K: String, CodingKey { case id, name, email, active }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); name = c.string(.name); email = c.string(.email)
        active = (try? c.decodeIfPresent(Bool.self, forKey: .active)) ?? true
    }
}

struct PeopleEnvelope: Decodable { let users: [Person] }
struct MembersEnvelope: Decodable { let userIds: [String] }

/// GET /api/projects/:id/close — the review before closing or cancelling. Figures are riyals on the
/// wire, halalas here.
struct CloseCheck: Decodable {
    struct Warning: Identifiable { let code, text: String; let count: Int; var id: String { code } }

    let closed: Bool
    let gross: Int
    let received: Int
    let remaining: Int
    let expenses: Int
    let profit: Int
    let realized: Int
    let undistributed: Int
    let unapproved: Int
    let pendingCount: Int
    let pendingAmount: Int
    let outputVat: Int
    let inputVat: Int
    let warnings: [Warning]

    private struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
        init(_ s: String) { stringValue = s }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        closed = (try? c.nestedContainer(keyedBy: Key.self, forKey: Key("closed"))) != nil
        let f = try c.nestedContainer(keyedBy: Key.self, forKey: Key("figures"))
        gross = f.halalasFromRiyals(Key("gross")); received = f.halalasFromRiyals(Key("received"))
        remaining = f.halalasFromRiyals(Key("remaining")); expenses = f.halalasFromRiyals(Key("expenses"))
        profit = f.halalasFromRiyals(Key("profit")); realized = f.halalasFromRiyals(Key("realized"))
        undistributed = f.halalasFromRiyals(Key("undistributed")); unapproved = f.halalasFromRiyals(Key("unapproved"))
        let i = try? c.nestedContainer(keyedBy: Key.self, forKey: Key("instalments"))
        pendingCount = i?.int(Key("count")) ?? 0
        pendingAmount = i?.halalasFromRiyals(Key("amount")) ?? 0
        let v = try? c.nestedContainer(keyedBy: Key.self, forKey: Key("vat"))
        outputVat = v?.halalasFromRiyals(Key("outputVat")) ?? 0
        inputVat = v?.halalasFromRiyals(Key("inputVat")) ?? 0
        var list: [Warning] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: Key("warnings")) {
            while !arr.isAtEnd {
                guard let w = try? arr.nestedContainer(keyedBy: Key.self) else { break }
                list.append(Warning(code: w.string(Key("code")), text: w.string(Key("text")), count: w.int(Key("count"))))
            }
        }
        warnings = list
    }
}

// MARK: documents

struct DocTemplate: Decodable, Identifiable, Hashable {
    let key: String
    let title: String
    var id: String { key }
    private enum K: String, CodingKey { case key, title }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        key = c.string(.key); title = c.string(.title)
    }
}

struct DocTemplates: Decodable {
    let contracts: [DocTemplate]
    let letters: [DocTemplate]
}

/// One clause of a contract or letter (clauseSchema), sent back whole when the clauses change.
struct Clause: Codable, Identifiable, Hashable {
    var id: String
    var key: String
    var title: String
    var baseTitle: String
    var content: String
    var pageBreak: Bool

    private enum K: String, CodingKey { case id, key, title, baseTitle, content, pageBreak }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); key = c.string(.key); title = c.string(.title); baseTitle = c.string(.baseTitle)
        content = c.string(.content); pageBreak = c.bool(.pageBreak)
    }
    init(title: String) {
        id = "c" + UUID().uuidString.prefix(10).lowercased()
        key = ""; self.title = title; baseTitle = title; content = ""; pageBreak = false
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(id, forKey: .id); try c.encode(key, forKey: .key); try c.encode(title, forKey: .title)
        try c.encode(baseTitle, forKey: .baseTitle); try c.encode(content, forKey: .content); try c.encode(pageBreak, forKey: .pageBreak)
    }
    var json: [String: Any] {
        ["id": id, "key": key, "title": title, "baseTitle": baseTitle, "content": content, "pageBreak": pageBreak]
    }
    /// The heading as printed: «المادة …: base» is recomputed by the server.
    var heading: String { title.isEmpty ? baseTitle : title }
}

/// GET /api/documents/:id — the document, the value of every field (stored or filled automatically)
/// and what each would be automatically now.
struct DocumentDetail: Decodable {
    let id: String
    let kind: String
    let number: String
    let title: String
    let status: String
    let version: Int
    let outgoingNo: String
    let variables: [String: String]
    let content: [Clause]
    let values: [String: String]
    let auto: [String: String]
    let approvedVersions: Int

    private enum K: String, CodingKey { case document, values, auto, versions }
    private enum D: String, CodingKey { case id, kind, number, title, status, version, outgoingNo, variables, content }
    private struct Resolved: Decodable { let value: String?
        private enum K: String, CodingKey { case value }
        init(from decoder: Decoder) throws { value = (try? decoder.container(keyedBy: K.self))?.string(.value) }
    }
    private struct Version: Decodable {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let d = try c.nestedContainer(keyedBy: D.self, forKey: .document)
        id = d.string(.id); kind = d.string(.kind); number = d.string(.number); title = d.string(.title)
        status = d.string(.status); version = d.int(.version); outgoingNo = d.string(.outgoingNo)
        variables = (try? d.decode([String: String].self, forKey: .variables)) ?? [:]
        content = (try? d.decode([Clause].self, forKey: .content)) ?? []
        values = ((try? c.decode([String: Resolved].self, forKey: .values)) ?? [:]).compactMapValues { $0.value }
        auto = ((try? c.decode([String: Resolved].self, forKey: .auto)) ?? [:]).compactMapValues { $0.value }
        approvedVersions = ((try? c.decode([Version].self, forKey: .versions)) ?? []).count
    }

    var approved: Bool { status == "approved" }
}

/// The fields of a contract or a letter, grouped as the website's editor (DocumentEditor.tsx).
enum DocFields {
    static let labels: [String: String] = [
        "party_a_name": "اسم الطرف الأول", "party_a_rep_name": "ممثل الطرف الأول", "party_a_title": "صفة ممثل الطرف الأول",
        "party_a_id": "هوية ممثل الطرف الأول", "party_a_address": "عنوان الطرف الأول", "party_a_phone": "هاتف الطرف الأول",
        "party_a_email": "بريد الطرف الأول", "party_a_reg": "سجل الطرف الأول", "party_a_tax": "الرقم الضريبي للطرف الأول",
        "party_b_name": "اسم الطرف الثاني", "party_b_rep_name": "ممثل الطرف الثاني", "party_b_title": "صفة ممثل الطرف الثاني",
        "party_b_id": "هوية/سجل الطرف الثاني", "party_b_address": "عنوان الطرف الثاني", "party_b_phone": "هاتف الطرف الثاني",
        "party_b_email": "بريد الطرف الثاني", "party_b_reg": "سجل الطرف الثاني", "party_b_tax": "الرقم الضريبي للطرف الثاني",
        "contract_no": "رقم العقد", "contract_date_gregorian": "تاريخ العقد", "contract_date_hijri": "التاريخ الهجري",
        "contract_city": "مدينة العقد", "signature_city": "مدينة التوقيع", "subject": "موضوع العقد",
        "contract_amount": "قيمة العقد", "currency": "العملة", "duration_months": "المدة", "duration_unit": "وحدة المدة",
        "payment_method": "طريقة الدفع", "letter_to_honorific": "اللقب", "letter_to": "الجهة المرسل إليها",
        "letter_to_suffix": "الخاتمة", "letter_salutation": "التحية", "letter_closing": "الختام", "letter_date": "تاريخ الخطاب",
    ]
    static let contract: [(title: String, keys: [String])] = [
        ("العقد", ["contract_no", "contract_date_gregorian", "contract_date_hijri", "contract_city", "signature_city", "subject"]),
        ("القيمة والمدة", ["contract_amount", "currency", "payment_method", "duration_months", "duration_unit"]),
        ("الطرف الأول (الجهة)", ["party_a_name", "party_a_rep_name", "party_a_title", "party_a_id", "party_a_reg", "party_a_tax",
                                  "party_a_address", "party_a_phone", "party_a_email"]),
        ("الطرف الثاني (العميل)", ["party_b_name", "party_b_rep_name", "party_b_title", "party_b_id", "party_b_reg", "party_b_tax",
                                    "party_b_address", "party_b_phone", "party_b_email"]),
    ]
    static let letter: [(title: String, keys: [String])] = [
        ("المرسل إليه", ["letter_to_honorific", "letter_to", "letter_to_suffix"]),
        ("الخطاب", ["letter_date", "letter_salutation", "letter_closing"]),
    ]
    static let dates: Set<String> = ["contract_date_gregorian", "letter_date"]
}

struct DocShare: Decodable, Identifiable {
    let id: String
    let channel: String
    let createdAt: Int
    let expiresAt: Int
    let revoked: Bool
    let views: Int
    private enum K: String, CodingKey { case id, channel, createdAt, expiresAt, revokedAt, views }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); channel = c.string(.channel); createdAt = c.int(.createdAt); expiresAt = c.int(.expiresAt)
        revoked = (c.optionalInt(.revokedAt) ?? 0) > 0; views = c.int(.views)
    }
    var live: Bool { !revoked && Double(expiresAt) > Date().timeIntervalSince1970 }
}

struct SharesEnvelope: Decodable { let items: [DocShare] }
struct ShareCreated: Decodable { let path: String }
struct OutgoingEnvelope: Decodable { let outgoingNo: String }
