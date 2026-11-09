import Foundation

// 0.3.0 «المبيعات»: /api/product-requests (opportunities) and /api/sales/overview, as the API sends
// them (requests.ts, sales.ts). Opportunity values, quote totals and every overview amount arrive in
// riyals and are turned into halalas here. Rates arrive as percentages.

enum Sales {
    /// STAGES and STAGE_LABEL / STAGE_HINT (packages/domain/src/sales.ts): the stored values never change.
    static let stages = ["new", "contacted", "quoted", "negotiating", "won", "lost"]
    static let openStages = ["new", "contacted", "quoted", "negotiating"]

    static func stage(_ key: String) -> (label: String, tone: Tone) {
        switch key {
        case "new": return ("جديد", .info)
        case "contacted": return ("مؤهَّل", .accent)
        case "quoted": return ("عرض سعر", .warn)
        case "negotiating": return ("تفاوض", .warn)
        case "won": return ("مكسوب", .ok)
        case "lost": return ("خاسر", .bad)
        default: return (key, .neutral)
        }
    }

    static let stageHint: [String: String] = [
        "new": "وصل الطلب ولم نتواصل بعد", "contacted": "تواصلنا وفهمنا الحاجة", "quoted": "أرسلنا عرض سعر",
        "negotiating": "نناقش السعر والشروط", "won": "تم الاتفاق والتعاقد", "lost": "لم تكتمل",
    ]

    /// ACTIVITY_TYPES / ACTIVITY_LABEL.
    static let activityTypes = ["call", "meeting", "visit", "email", "whatsapp", "note"]
    static func activity(_ key: String) -> (label: String, icon: String) {
        switch key {
        case "call": return ("اتصال", "phone")
        case "meeting": return ("اجتماع", "person.2")
        case "visit": return ("زيارة", "mappin.and.ellipse")
        case "email": return ("بريد", "envelope")
        case "whatsapp": return ("واتساب", "message")
        default: return ("ملاحظة", "note.text")
        }
    }

    /// SOURCE_LABEL.
    static func source(_ key: String) -> String {
        ["site": "الموقع", "referral": "إحالة", "event": "معرض أو فعالية", "call": "اتصال وارد",
         "social": "تواصل اجتماعي"][key] ?? "أخرى"
    }

    /// followUpState + FOLLOW_UP_LABEL: overdue / today / this week / later.
    static func followUp(_ date: String) -> (label: String, tone: Tone)? {
        guard !date.isEmpty, let d = Fmt.daysUntil(date) else { return nil }
        if d < 0 { return ("متابعة متأخرة", .bad) }
        if d == 0 { return ("متابعة اليوم", .warn) }
        if d <= 7 { return ("هذا الأسبوع", .info) }
        return ("لاحقاً", .neutral)
    }

    /// Quote statuses as the website's «عروض الأسعار» pills.
    static func quote(_ status: String, expired: Bool) -> (label: String, tone: Tone) {
        if expired && status != "accepted" && status != "rejected" { return ("منتهي", .neutral) }
        switch status {
        case "sent": return ("أُرسل", .info)
        case "accepted": return ("مقبول", .ok)
        case "rejected": return ("مرفوض", .bad)
        default: return ("مسودة", .neutral)
        }
    }
}

struct Opportunity: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let entity: String
    let phone: String
    let email: String
    let message: String
    let notes: String
    let status: String
    let source: String
    let productName: String
    let clientId: String
    let projectId: String
    let ownerId: String
    let followUpAt: String
    let value: Int
    let lostReason: String
    let createdAt: Int
    let updatedAt: Int
    let interest: Bool

    private enum K: String, CodingKey {
        case id, name, entity, phone, email, message, notes, status, source, productName, clientId, projectId, ownerId
        case followUpAt, value, lostReason, createdAt, updatedAt, interest
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); name = c.string(.name); entity = c.string(.entity); phone = c.string(.phone)
        email = c.string(.email); message = c.string(.message); notes = c.string(.notes); status = c.string(.status)
        source = c.string(.source); productName = c.string(.productName); clientId = c.string(.clientId)
        projectId = c.string(.projectId); ownerId = c.string(.ownerId); followUpAt = c.string(.followUpAt)
        value = c.halalasFromRiyals(.value); lostReason = c.string(.lostReason)
        createdAt = c.int(.createdAt); updatedAt = c.int(.updatedAt); interest = c.bool(.interest)
    }

    static func == (a: Opportunity, b: Opportunity) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }

    var isOpen: Bool { Sales.openStages.contains(status) }
}

struct OpportunitiesEnvelope: Decodable {
    let requests: [Opportunity]
}

struct OpportunityDetail: Decodable {
    struct Activity: Decodable, Identifiable {
        let id, type, summary, createdByName: String
        let at: Int
        private enum K: String, CodingKey { case id, type, summary, createdByName, at }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id); type = c.string(.type); summary = c.string(.summary)
            createdByName = c.string(.createdByName); at = c.int(.at)
        }
    }

    let opportunity: Opportunity
    let ownerName: String
    let packageName: String
    let clientName: String
    let clientCode: String
    let quotes: [SalesQuote]
    let activities: [Activity]

    private enum K: String, CodingKey { case opportunity, client, quotes, activities }
    private enum O: String, CodingKey { case ownerName, packageName }
    private enum C: String, CodingKey { case name, code }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        opportunity = try c.decode(Opportunity.self, forKey: .opportunity)
        let o = try c.nestedContainer(keyedBy: O.self, forKey: .opportunity)
        ownerName = o.string(.ownerName)
        packageName = o.string(.packageName)
        let cl = try? c.nestedContainer(keyedBy: C.self, forKey: .client)
        clientName = cl?.string(.name) ?? ""
        clientCode = cl?.string(.code) ?? ""
        quotes = (try? c.decode([SalesQuote].self, forKey: .quotes)) ?? []
        activities = (try? c.decode([Activity].self, forKey: .activities)) ?? []
    }
}

struct SalesOverview: Decodable {
    struct Stage: Identifiable { let stage: String; let count: Int; let value: Int; let weighted: Int; var id: String { stage } }
    struct Lead: Identifiable { let id, name, entity, status: String; let value: Int; let daysIdle: Int }
    struct QuoteBrief: Identifiable { let id, number, title, recipient, validUntil: String; let total: Int; let days: Int }

    let stages: [Stage]
    let openCount: Int
    let openValue: Int
    let openWeighted: Int
    let won: Int
    let lost: Int
    let winRate: Double?
    let avgCycleDays: Int?
    let wonThisQuarter: Int
    let leadsDue: Int
    let clientsDue: Int
    let stale: [Lead]
    let quotesSent: Int
    let quotesAccepted: Int
    let acceptRate: Double?
    let acceptedValue: Int
    let expiring: [QuoteBrief]
    let waiting: [QuoteBrief]

    private struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
        init(_ s: String) { stringValue = s }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        let pipe = try c.nestedContainer(keyedBy: Key.self, forKey: Key("pipeline"))
        var st: [Stage] = []
        if var arr = try? pipe.nestedUnkeyedContainer(forKey: Key("stages")) {
            while !arr.isAtEnd {
                let s = try arr.nestedContainer(keyedBy: Key.self)
                st.append(Stage(stage: s.string(Key("stage")), count: s.int(Key("count")),
                                value: s.halalasFromRiyals(Key("value")), weighted: s.halalasFromRiyals(Key("weighted"))))
            }
        }
        stages = st
        let open = try pipe.nestedContainer(keyedBy: Key.self, forKey: Key("open"))
        openCount = open.int(Key("count")); openValue = open.halalasFromRiyals(Key("value")); openWeighted = open.halalasFromRiyals(Key("weighted"))
        let r = try c.nestedContainer(keyedBy: Key.self, forKey: Key("results"))
        won = r.int(Key("won")); lost = r.int(Key("lost"))
        winRate = try? r.decodeIfPresent(Double.self, forKey: Key("winRate"))
        avgCycleDays = r.optionalInt(Key("avgCycleDays"))
        wonThisQuarter = r.halalasFromRiyals(Key("wonThisQuarter"))
        let f = try c.nestedContainer(keyedBy: Key.self, forKey: Key("followups"))
        leadsDue = f.int(Key("leadsDue")); clientsDue = f.int(Key("clientsDue"))
        var leads: [Lead] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: Key("stale")) {
            while !arr.isAtEnd {
                let l = try arr.nestedContainer(keyedBy: Key.self)
                leads.append(Lead(id: l.string(Key("id")), name: l.string(Key("name")), entity: l.string(Key("entity")),
                                  status: l.string(Key("status")), value: l.halalasFromRiyals(Key("value")), daysIdle: l.int(Key("daysIdle"))))
            }
        }
        stale = leads
        let q = try c.nestedContainer(keyedBy: Key.self, forKey: Key("quotes"))
        quotesSent = q.int(Key("sent")); quotesAccepted = q.int(Key("accepted"))
        acceptRate = try? q.decodeIfPresent(Double.self, forKey: Key("acceptRate"))
        acceptedValue = q.halalasFromRiyals(Key("acceptedValue"))
        func briefs(_ key: String) -> [QuoteBrief] {
            var out: [QuoteBrief] = []
            if var arr = try? q.nestedUnkeyedContainer(forKey: Key(key)) {
                while !arr.isAtEnd {
                    guard let b = try? arr.nestedContainer(keyedBy: Key.self) else { break }
                    out.append(QuoteBrief(id: b.string(Key("id")), number: b.string(Key("number")), title: b.string(Key("title")),
                                          recipient: b.string(Key("recipient")), validUntil: b.string(Key("validUntil")),
                                          total: b.halalasFromRiyals(Key("total")), days: b.int(Key("days"))))
                }
            }
            return out
        }
        expiring = briefs("expiring")
        waiting = briefs("waiting")
    }
}
