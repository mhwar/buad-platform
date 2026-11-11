import Foundation

// 0.10.0 «الإدارة»: the activity log (/api/audit), the team (/api/team), the organisation (/api/org)
// and the signed-in user's own account (/api/auth). All read as the website reads them.

struct AuditChange: Decodable, Identifiable, Hashable {
    let label: String
    let before: String
    let after: String
    var id: String { label + before + after }
    private enum K: String, CodingKey { case label, before, after }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        label = c.string(.label); before = c.string(.before); after = c.string(.after)
    }
}

struct AuditEntry: Decodable, Identifiable, Hashable {
    let id: String
    let at: Int
    let userName: String
    let entity: String
    let summary: String
    let changes: [AuditChange]

    private enum K: String, CodingKey { case id, at, userName, entity, summary, detail }
    private enum D: String, CodingKey { case changes }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); at = c.int(.at); userName = c.string(.userName)
        entity = c.string(.entity); summary = c.string(.summary)
        if let d = try? c.nestedContainer(keyedBy: D.self, forKey: .detail) {
            changes = (try? d.decode([AuditChange].self, forKey: .changes)) ?? []
        } else {
            changes = []
        }
    }
}

struct AuditEnvelope: Decodable { let items: [AuditEntry] }

struct TeamUser: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let email: String
    let roleName: String
    let active: Bool
    let pending: Bool
    let lastLoginAt: Int
    private enum K: String, CodingKey { case id, name, email, roleName, active, pending, lastLoginAt }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); name = c.string(.name); email = c.string(.email); roleName = c.string(.roleName)
        active = (try? c.decodeIfPresent(Bool.self, forKey: .active)) ?? true
        pending = c.bool(.pending); lastLoginAt = c.int(.lastLoginAt)
    }
}

struct TeamUsersEnvelope: Decodable { let users: [TeamUser] }

struct TeamRole: Decodable, Identifiable, Hashable {
    let key: String
    let name: String
    let description: String
    let permCount: Int
    let builtin: Bool
    let users: Int
    var id: String { key }
    private enum K: String, CodingKey { case key, name, description, perms, builtin, users }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        key = c.string(.key); name = c.string(.name); description = c.string(.description)
        permCount = ((try? c.decode([String].self, forKey: .perms)) ?? []).count
        builtin = c.bool(.builtin); users = c.int(.users)
    }
}

struct TeamRolesEnvelope: Decodable { let roles: [TeamRole] }

struct OrgProfile: Decodable {
    let name, email, phone, website, address, reg, tax: String
    let signerName, signerTitle, bankName, bankIban: String
    private enum Keys: String, CodingKey { case profile }
    private enum K: String, CodingKey {
        case name, email, phone, website, address, reg, tax, signerName, signerTitle, bankName, bankIban
    }
    init(from decoder: Decoder) throws {
        let p = try decoder.container(keyedBy: Keys.self).nestedContainer(keyedBy: K.self, forKey: .profile)
        name = p.string(.name); email = p.string(.email); phone = p.string(.phone); website = p.string(.website)
        address = p.string(.address); reg = p.string(.reg); tax = p.string(.tax)
        signerName = p.string(.signerName); signerTitle = p.string(.signerTitle)
        bankName = p.string(.bankName); bankIban = p.string(.bankIban)
    }
}

struct OrgStorage: Decodable {
    let bytes: Int
    let files: Int
    private enum K: String, CodingKey { case bytes, files }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        bytes = c.int(.bytes); files = c.int(.files)
    }
}

struct RecoveryKeyStatus: Decodable {
    let exists: Bool
    let createdAt: Int
    private enum K: String, CodingKey { case exists, createdAt }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        exists = c.bool(.exists); createdAt = c.int(.createdAt)
    }
}

struct RecoveryKeyCreated: Decodable { let key: String }

enum AdminVocabulary {
    /// The website's labels for the activity log's sections (features/team/ActivityPage.tsx).
    static let entities: [(key: String, label: String)] = [
        ("project", "المشاريع"), ("client", "العملاء"), ("document", "المستندات"), ("company", "مالية الشركة"),
        ("vat", "الضريبة"), ("product", "المنتجات"), ("request", "الطلبات"), ("site", "الموقع"), ("org", "المنشأة"),
        ("user", "المستخدمون"), ("role", "الأدوار"), ("asset", "الملفات"), ("import", "الاستيراد"), ("task", "المهام"),
        ("quote", "عروض الأسعار"), ("plan", "الخطط"), ("meeting", "الاجتماعات"), ("decision", "القرارات"),
    ]

    static func entity(_ key: String) -> String { entities.first { $0.key == key }?.label ?? key }

    static func error(_ code: String) -> String? {
        switch code {
        case "wrong_password": return "كلمة المرور الحالية غير صحيحة."
        default: return nil
        }
    }

    static func bytes(_ n: Int) -> String {
        if n < 1024 { return "\(n) بايت" }
        if n < 1_048_576 { return "\(n / 1024) ك.ب" }
        return String(format: "%.1f م.ب", Double(n) / 1_048_576)
    }
}
