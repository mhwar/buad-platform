import Foundation

// 0.4.0 «عروض الأسعار»: GET/POST/PATCH /api/quotes (quotes.ts shapeQuote). Item prices, the
// discount and the totals arrive in riyals; `totalHalalas` is the server's total in halalas.

struct SalesQuote: Decodable, Identifiable, Hashable {
    struct Item: Hashable {
        var label: String
        var qty: Double
        /// Riyals, as the API takes and gives them.
        var unit: Double
    }

    let id: String
    let number: String
    let requestId: String
    let clientId: String
    let projectId: String
    let recipient: String
    let entity: String
    let title: String
    let items: [Item]
    let discount: Double
    let vatPct: Double
    let validUntil: String
    let expired: Bool
    let terms: String
    let status: String
    let version: Int
    let subtotal: Int
    let vat: Int
    let total: Int
    let createdAt: Int

    private enum K: String, CodingKey {
        case id, number, requestId, clientId, projectId, recipient, entity, title, items, discount, vatPct, validUntil
        case expired, terms, status, version, totals, totalHalalas, createdAt
    }
    private enum I: String, CodingKey { case label, qty, unit }
    private enum T: String, CodingKey { case subtotal, vat }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); number = c.string(.number); requestId = c.string(.requestId); clientId = c.string(.clientId)
        projectId = c.string(.projectId); recipient = c.string(.recipient); entity = c.string(.entity); title = c.string(.title)
        var list: [Item] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: .items) {
            while !arr.isAtEnd {
                guard let i = try? arr.nestedContainer(keyedBy: I.self) else { break }
                list.append(Item(label: i.string(.label), qty: i.double(.qty), unit: i.double(.unit)))
            }
        }
        items = list
        discount = c.double(.discount); vatPct = c.double(.vatPct); validUntil = c.string(.validUntil)
        expired = c.bool(.expired); terms = c.string(.terms); status = c.string(.status); version = c.int(.version)
        let t = try? c.nestedContainer(keyedBy: T.self, forKey: .totals)
        subtotal = t?.halalasFromRiyals(.subtotal) ?? 0
        vat = t?.halalasFromRiyals(.vat) ?? 0
        total = c.int(.totalHalalas)
        createdAt = c.int(.createdAt)
    }

    static func == (a: SalesQuote, b: SalesQuote) -> Bool { a.id == b.id && a.version == b.version && a.status == b.status }
    func hash(into h: inout Hasher) { h.combine(id) }

    var converted: Bool { !projectId.isEmpty }
    /// Waiting for an answer: sent and still valid.
    var waiting: Bool { status == "sent" && !expired }
    /// Valid for at most 7 more days and not answered yet.
    var endingSoon: Bool {
        guard status == "draft" || status == "sent", !expired, !validUntil.isEmpty, let d = Fmt.daysUntil(validUntil) else { return false }
        return d <= 7
    }
}

struct QuotesEnvelope: Decodable { let quotes: [SalesQuote] }
struct QuoteEnvelope: Decodable { let quote: SalesQuote }

/// The figures shown while an offer is being written, worked out exactly as the website's
/// quoteTotals (packages/domain/src/quotes.ts) so the preview matches. The server recomputes them
/// on save, and every figure after that is the server's.
struct QuoteTotals {
    let subtotal: Int, discount: Int, net: Int, vat: Int, total: Int

    init(items: [SalesQuote.Item], discountRiyals: Double, vatPct: Double) {
        let sub = items.reduce(0) { $0 + Int((($1.qty * ($1.unit * 100).rounded())).rounded()) }
        let disc = min(max(0, Int((discountRiyals * 100).rounded())), sub)
        let n = sub - disc
        let v = Int((Double(n) * max(0, vatPct) / 100).rounded())
        subtotal = sub; discount = disc; net = n; vat = v; total = n + v
    }
}

/// GET /api/quotes/catalog: published service packages at their selling price (riyals).
struct CatalogItem: Decodable, Identifiable, Hashable {
    let productId: String
    let productName: String
    let packageId: String
    let packageName: String
    let price: Double
    var id: String { productId + "/" + packageId }

    private enum K: String, CodingKey { case productId, productName, packageId, packageName, price }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        productId = c.string(.productId); productName = c.string(.productName)
        packageId = c.string(.packageId); packageName = c.string(.packageName); price = c.double(.price)
    }
}

struct CatalogEnvelope: Decodable { let items: [CatalogItem] }

struct VatRateEnvelope: Decodable {
    let rate: Double
    private enum K: String, CodingKey { case rate }
    init(from decoder: Decoder) throws { rate = (try decoder.container(keyedBy: K.self)).double(.rate) }
}

struct CreatedEnvelope: Decodable {
    let id: String
    let number: String
    let clientId: String
    let code: String
    private enum K: String, CodingKey { case id, number, clientId, code }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); number = c.string(.number); clientId = c.string(.clientId); code = c.string(.code)
    }
}

struct ConvertResult: Decodable {
    let clientId: String
    let projectId: String
    let number: String
    let instalments: Int
    private enum K: String, CodingKey { case clientId, projectId, number, instalments }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        clientId = c.string(.clientId); projectId = c.string(.projectId); number = c.string(.number); instalments = c.int(.instalments)
    }
}

enum QuoteVocabulary {
    /// SCHEDULE_LABEL (packages/domain/src/quotes.ts).
    static let schedules: [(key: String, label: String)] = [
        ("half", "50% عند البدء و50% بعد 60 يوماً"),
        ("full", "دفعة واحدة بعد 30 يوماً"),
        ("thirds", "40% عند البدء و30% بعد 30 يوماً و30% بعد 60 يوماً"),
        ("none", "بلا جدول دفعات"),
    ]

    /// QuoteDialog's ERR messages.
    static func error(_ code: String) -> String? {
        switch code {
        case "no_items": return "أضف بنداً واحداً على الأقل قبل الإرسال."
        case "expired": return "انتهت صلاحية العرض. عدّل تاريخ الصلاحية أولاً."
        case "accepted_locked": return "العرض المقبول نهائي ولا يُعدَّل."
        case "version_conflict": return "عُدّل العرض من مكان آخر. أعد فتحه."
        case "bad_transition": return "هذا الانتقال غير متاح."
        case "only_drafts": return "تُحذف المسودات فقط."
        case "not_accepted": return "حوّل العرض بعد قبوله."
        case "already_converted": return "حُوّل هذا العرض إلى مشروع من قبل."
        case "client_archived": return "هذا العميل مؤرشف، فلا يُنشأ له عرض أو مشروع."
        case "pdf_unavailable": return "تعذّر إنشاء ملف PDF الآن. حاول بعد قليل."
        case "quote_incomplete": return "تسعير هذه الباقة غير مكتمل في الخدمة. أكمل نموذج تكلفتها من إعدادات الخدمة على الحاسوب."
        case "package_not_found": return "الباقة لم تعد موجودة في الخدمة. اختر باقة أخرى."
        case "name_required": return "اكتب اسم الجهة أو الشخص."
        case "contact_required": return "أضف رقم جوال أو بريداً للتواصل، أو اختر «عميل جديد»."
        case "client_not_found": return "لم يعد هذا العميل موجوداً. اختر عميلاً آخر."
        case "owner_not_found": return "المسؤول المختار لم يعد في الفريق."
        case "product_not_found": return "الخدمة لم تعد منشورة. اختر خدمة أخرى."
        case "duplicate": return "يوجد عميل بنفس رقم السجل أو الرقم الضريبي."
        default: return nil
        }
    }
}
