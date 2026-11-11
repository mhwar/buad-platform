import Foundation

// 0.9.2 «مالية الشركة»: /api/finance/company/* (company-finance.ts). Every amount arrives in riyals
// and is turned into halalas here, except where noted.

struct JKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
    init(_ s: String) { stringValue = s }
}

private extension KeyedDecodingContainer where Key == JKey {
    func list<T>(_ key: String, _ make: (KeyedDecodingContainer<JKey>) -> T) -> [T] {
        var out: [T] = []
        if var arr = try? nestedUnkeyedContainer(forKey: JKey(key)) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                out.append(make(x))
            }
        }
        return out
    }
}

/// GET /overview — the company's own numbers for a period, and everything since the start.
struct CompanyOverview: Decodable {
    struct Calc { let projectProfit, serviceIncome, companyExpenses, income, netProfit: Int }
    struct AllTime { let netProfit, distributed, retained, available: Int }
    struct Retained { let ops, dev, reserve, total: Int }
    struct Month: Identifiable { let month: String; let income: Int; let expense: Int; var id: String { month } }
    struct Proj: Identifiable { let id, number, name, clientName, status: String; let profit: Int; let earning: Bool }

    let calc: Calc
    let allTime: AllTime
    let retained: Retained
    let bankMinimum: Int
    let monthly: [Month]
    let projects: [Proj]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        let k = try c.nestedContainer(keyedBy: JKey.self, forKey: JKey("calc"))
        calc = Calc(projectProfit: k.halalasFromRiyals(JKey("projectProfit")), serviceIncome: k.halalasFromRiyals(JKey("serviceIncome")),
                    companyExpenses: k.halalasFromRiyals(JKey("companyExpenses")), income: k.halalasFromRiyals(JKey("income")),
                    netProfit: k.halalasFromRiyals(JKey("netProfit")))
        let a = try c.nestedContainer(keyedBy: JKey.self, forKey: JKey("allTime"))
        allTime = AllTime(netProfit: a.halalasFromRiyals(JKey("netProfit")), distributed: a.halalasFromRiyals(JKey("distributed")),
                          retained: a.halalasFromRiyals(JKey("retained")), available: a.halalasFromRiyals(JKey("available")))
        let r = try c.nestedContainer(keyedBy: JKey.self, forKey: JKey("retained"))
        retained = Retained(ops: r.halalasFromRiyals(JKey("ops")), dev: r.halalasFromRiyals(JKey("dev")),
                            reserve: r.halalasFromRiyals(JKey("reserve")), total: r.halalasFromRiyals(JKey("total")))
        bankMinimum = c.halalasFromRiyals(JKey("bankMinimum"))
        monthly = c.list("monthly") { Month(month: $0.string(JKey("month")), income: $0.halalasFromRiyals(JKey("income")), expense: $0.halalasFromRiyals(JKey("expense"))) }
        projects = c.list("projects") {
            Proj(id: $0.string(JKey("id")), number: $0.string(JKey("number")), name: $0.string(JKey("name")), clientName: $0.string(JKey("clientName")),
                 status: $0.string(JKey("status")), profit: $0.halalasFromRiyals(JKey("profit")), earning: $0.bool(JKey("earning")))
        }
    }
}

/// An entry of the company's own ledger (income or expense).
struct CompanyEntry: Identifiable, Hashable {
    let id: String
    let type: String
    let category: String
    let date: String
    let paymentDate: String
    let description: String
    let amount: Int
    let note: String
}

struct CompanyEntriesEnvelope: Decodable {
    let items: [CompanyEntry]
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        var out: [CompanyEntry] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("items")) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                out.append(CompanyEntry(id: x.string(JKey("id")), type: x.string(JKey("type")), category: x.string(JKey("category")),
                                        date: x.string(JKey("date")), paymentDate: x.string(JKey("paymentDate")),
                                        description: x.string(JKey("description")), amount: x.halalasFromRiyals(JKey("amount")), note: x.string(JKey("note"))))
            }
        }
        items = out
    }
}

/// GET /balances — realised profit of the projects, the company's net, what was shared and kept.
struct CompanyBalances: Decodable {
    let realized, companyNet, distributed, retained, undistributed, approvedUnpaid: Int
    let ops, dev, reserve: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        realized = c.halalasFromRiyals(JKey("realized")); companyNet = c.halalasFromRiyals(JKey("companyNet"))
        distributed = c.halalasFromRiyals(JKey("distributed")); retained = c.halalasFromRiyals(JKey("retained"))
        undistributed = c.halalasFromRiyals(JKey("undistributed")); approvedUnpaid = c.halalasFromRiyals(JKey("approvedUnpaid"))
        let r = try? c.nestedContainer(keyedBy: JKey.self, forKey: JKey("retainedBy"))
        ops = r?.halalasFromRiyals(JKey("ops")) ?? 0; dev = r?.halalasFromRiyals(JKey("dev")) ?? 0; reserve = r?.halalasFromRiyals(JKey("reserve")) ?? 0
    }
}

struct Partner: Identifiable, Hashable {
    let id: String
    let name: String
    let sharePct: Double
    let note: String
}

struct PartnersEnvelope: Decodable {
    let items: [Partner]
    let totalPct: Double
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        var out: [Partner] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("items")) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                out.append(Partner(id: x.string(JKey("id")), name: x.string(JKey("name")), sharePct: x.double(JKey("sharePct")), note: x.string(JKey("note"))))
            }
        }
        items = out
        totalPct = c.double(JKey("totalPct"))
    }
}

struct Distribution: Identifiable {
    struct Share: Identifiable { let partnerName: String; let sharePct: Double; let amount: Int; let paidOn: String; var id: String { partnerName } }
    let id: String
    let periodLabel: String
    let from: String
    let to: String
    let netProfit: Int
    let pct: Double
    let distributed: Int
    let retained: Int
    let retainedCategory: String
    let status: String
    let completedAt: Int
    let paidOn: String
    let shares: [Share]

    var paid: Bool { status == "completed" && !paidOn.isEmpty }
}

struct DistributionsEnvelope: Decodable {
    let items: [Distribution]
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        var out: [Distribution] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("items")) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                var shares: [Distribution.Share] = []
                if var s = try? x.nestedUnkeyedContainer(forKey: JKey("shares")) {
                    while !s.isAtEnd {
                        guard let y = try? s.nestedContainer(keyedBy: JKey.self) else { break }
                        shares.append(.init(partnerName: y.string(JKey("partnerName")), sharePct: y.double(JKey("sharePct")),
                                            amount: y.halalasFromRiyals(JKey("amount")), paidOn: y.string(JKey("paidOn"))))
                    }
                }
                out.append(Distribution(id: x.string(JKey("id")), periodLabel: x.string(JKey("periodLabel")), from: x.string(JKey("from")), to: x.string(JKey("to")),
                                        netProfit: x.halalasFromRiyals(JKey("netProfit")), pct: x.double(JKey("pct")),
                                        distributed: x.halalasFromRiyals(JKey("distributed")), retained: x.halalasFromRiyals(JKey("retained")),
                                        retainedCategory: x.string(JKey("retainedCategory")), status: x.string(JKey("status")),
                                        completedAt: x.optionalInt(JKey("completedAt")) ?? 0, paidOn: x.string(JKey("paidOn")), shares: shares))
            }
        }
        items = out
    }
}

/// POST /distributions/preview — what the server would distribute, before anything is saved.
struct DistributionPreview: Decodable {
    struct Share: Identifiable { let partnerName: String; let sharePct: Double; let amount: Int; var id: String { partnerName } }
    let label: String
    let netProfit: Int
    let distributed: Int
    let retained: Int
    let shares: [Share]
    let sharesPct: Double

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        label = c.string(JKey("label")); netProfit = c.halalasFromRiyals(JKey("netProfit"))
        distributed = c.halalasFromRiyals(JKey("distributed")); retained = c.halalasFromRiyals(JKey("retained"))
        sharesPct = c.double(JKey("sharesPct"))
        var out: [Share] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("shares")) {
            while !arr.isAtEnd {
                guard let y = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                out.append(.init(partnerName: y.string(JKey("partnerName")), sharePct: y.double(JKey("sharePct")), amount: y.halalasFromRiyals(JKey("amount"))))
            }
        }
        shares = out
    }
}

/// GET /quarter — one quarter (or the year) project by project: what was received, realised, shared
/// and what is left to share.
struct QuarterReport: Decodable {
    struct Row: Identifiable {
        let id, number, name, clientName, status: String
        let receivedInPeriod, realizedInPeriod, realizedToDate, distributed, available: Int
        let flags: [String]
        let fullyDistributed: Bool
    }
    struct Totals { let receivedInPeriod, realizedInPeriod, available, positive, carried: Int }
    struct Q: Identifiable { let q: Int; let label: String; let receivedInPeriod, realizedInPeriod, companyNet, leftover: Int; let stamp: String; var id: Int { q } }

    let label: String
    let rows: [Row]
    let totals: Totals
    let companyIncome: Int
    let companyExpenses: Int
    let stamp: String
    let leftover: Int
    let partnersPct: Double
    let quarters: [Q]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        label = c.string(JKey("label"))
        rows = c.list("rows") { x in
            var flags: [String] = []
            if let f = try? x.decode([String].self, forKey: JKey("flags")) { flags = f }
            return Row(id: x.string(JKey("id")), number: x.string(JKey("number")), name: x.string(JKey("name")), clientName: x.string(JKey("clientName")),
                       status: x.string(JKey("status")), receivedInPeriod: x.halalasFromRiyals(JKey("receivedInPeriod")),
                       realizedInPeriod: x.halalasFromRiyals(JKey("realizedInPeriod")), realizedToDate: x.halalasFromRiyals(JKey("realizedToDate")),
                       distributed: x.halalasFromRiyals(JKey("distributed")), available: x.halalasFromRiyals(JKey("available")),
                       flags: flags, fullyDistributed: x.bool(JKey("fullyDistributed")))
        }
        let t = try c.nestedContainer(keyedBy: JKey.self, forKey: JKey("totals"))
        totals = Totals(receivedInPeriod: t.halalasFromRiyals(JKey("receivedInPeriod")), realizedInPeriod: t.halalasFromRiyals(JKey("realizedInPeriod")),
                        available: t.halalasFromRiyals(JKey("available")), positive: t.halalasFromRiyals(JKey("positive")), carried: t.halalasFromRiyals(JKey("carried")))
        let co = try? c.nestedContainer(keyedBy: JKey.self, forKey: JKey("company"))
        companyIncome = co?.halalasFromRiyals(JKey("income")) ?? 0; companyExpenses = co?.halalasFromRiyals(JKey("expenses")) ?? 0
        let s = try? c.nestedContainer(keyedBy: JKey.self, forKey: JKey("settlement"))
        stamp = s?.string(JKey("stamp")) ?? "open"; leftover = s?.halalasFromRiyals(JKey("leftover")) ?? 0
        partnersPct = c.double(JKey("partnersPct"))
        quarters = c.list("quarters") { x in
            Q(q: x.int(JKey("q")), label: x.string(JKey("label")), receivedInPeriod: x.halalasFromRiyals(JKey("receivedInPeriod")),
              realizedInPeriod: x.halalasFromRiyals(JKey("realizedInPeriod")), companyNet: x.halalasFromRiyals(JKey("companyNet")),
              leftover: x.halalasFromRiyals(JKey("leftover")), stamp: x.string(JKey("stamp")))
        }
    }
}

enum CompanyVocabulary {
    static let incomeCategories: [(key: String, label: String)] = [
        ("subscription", "اشتراكات"), ("setup", "تأسيس"), ("consulting", "استشارات"), ("commission", "عمولات"), ("other", "أخرى"),
    ]
    static let expenseCategories: [(key: String, label: String)] = [
        ("hosting", "استضافة"), ("marketing", "تسويق"), ("payroll", "رواتب"), ("tools", "أدوات"), ("legal", "قانونية"),
        ("asset", "أصول"), ("purchase", "مشتريات"), ("zakat", "زكاة"), ("gov_fees", "رسوم حكومية"), ("other", "أخرى"),
    ]
    static func category(_ key: String) -> String {
        (incomeCategories + expenseCategories + [("project_fee", "أتعاب مشاريع")]).first { $0.key == key }?.label ?? key
    }
    static func retained(_ key: String) -> String { ["ops": "تشغيل", "dev": "تطوير", "reserve": "احتياطي"][key] ?? "—" }

    static func error(_ code: String) -> String? {
        switch code {
        case "shares_over_100": return "مجموع حصص الشركاء يتجاوز 100%."
        case "shares_not_100": return "مجموع حصص الشركاء ليس 100%؛ صحّح الحصص أولاً."
        case "nothing_to_distribute": return "لا يوجد ربح متاح للتوزيع."
        case "stale_draft": return "تغيّرت أرباح مشروع في هذه المسودة بعد حفظها (وُزّع ربحه في توزيع آخر). احذفها وأنشئ توزيعاً جديداً."
        case "not_draft": return "هذا التوزيع ليس مسودة، أو لم يعد موجوداً."
        case "not_approved": return "اعتمد التوزيع قبل تسجيل دفعه."
        case "completed_locked": return "التوزيع المعتمد لا يُحذف."
        case "invalid_category": return "التصنيف غير صالح لهذا النوع."
        default: return nil
        }
    }
}


// MARK: 0.9.1 — VAT settings, year review, checks, receipt suggestions

struct VatSettings: Decodable {
    let rate: Double
    let period: String
    let vatNumber: String
    private enum K: String, CodingKey { case rate, period, vatNumber }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        rate = c.double(.rate); period = c.string(.period).isEmpty ? "quarterly" : c.string(.period); vatNumber = c.string(.vatNumber)
    }
}

/// GET /api/finance/year-review — the year's revenue against the target, and the projects to review.
struct YearReview: Decodable {
    struct Item: Identifiable {
        let id, number, name, status, clientName, contractDate: String
        let estimated: Bool
        let gross, received, receivedYear, remaining: Int
        let lastReceipt: String
        let overdueLines, pendingLines: Int
        let flags: [String]
    }

    let year: Int
    let revenue: Int
    let target: Int?
    let targetSource: String
    let projectReceipts, receiptsVat, companyIncome, unrecorded, collecting: Int
    let counts: [String: Int]
    let items: [Item]

    var progress: Double { guard let t = target, t > 0 else { return 0 }; return min(1, Double(revenue) / Double(t)) }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        year = c.int(JKey("year"))
        let t = try c.nestedContainer(keyedBy: JKey.self, forKey: JKey("totals"))
        revenue = t.halalasFromRiyals(JKey("revenue"))
        target = t.contains(JKey("target")) && (try? t.decodeNil(forKey: JKey("target"))) != true ? t.halalasFromRiyals(JKey("target")) : nil
        targetSource = t.string(JKey("targetSource"))
        projectReceipts = t.halalasFromRiyals(JKey("projectReceipts")); receiptsVat = t.halalasFromRiyals(JKey("receiptsVat"))
        companyIncome = t.halalasFromRiyals(JKey("companyIncome")); unrecorded = t.halalasFromRiyals(JKey("unrecorded"))
        collecting = t.halalasFromRiyals(JKey("collecting"))
        var counts: [String: Int] = [:]
        if let cc = try? c.nestedContainer(keyedBy: JKey.self, forKey: JKey("counts")) {
            for k in ["closed_not_paid", "paid_not_closed", "overdue", "no_receipts", "no_contract"] { counts[k] = cc.int(JKey(k)) }
        }
        self.counts = counts
        var out: [Item] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("items")) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                out.append(Item(id: x.string(JKey("id")), number: x.string(JKey("number")), name: x.string(JKey("name")), status: x.string(JKey("status")),
                                clientName: x.string(JKey("clientName")), contractDate: x.string(JKey("contractDate")), estimated: x.bool(JKey("estimated")),
                                gross: x.halalasFromRiyals(JKey("gross")), received: x.halalasFromRiyals(JKey("received")),
                                receivedYear: x.halalasFromRiyals(JKey("receivedYear")), remaining: x.halalasFromRiyals(JKey("remaining")),
                                lastReceipt: x.string(JKey("lastReceipt")), overdueLines: x.int(JKey("overdueLines")), pendingLines: x.int(JKey("pendingLines")),
                                flags: (try? x.decode([String].self, forKey: JKey("flags"))) ?? []))
            }
        }
        items = out
    }

    static func flagLabel(_ f: String) -> String {
        switch f {
        case "closed_not_paid": return "مكتمل وعليه متبقٍّ"
        case "paid_not_closed": return "محصَّل بالكامل ولم يُغلق"
        case "overdue": return "دفعة متأخرة"
        case "no_receipts": return "لا استلامات مسجّلة"
        case "no_contract": return "بلا بيانات عقد"
        default: return f
        }
    }
}

struct FinanceCheck: Identifiable {
    struct Row: Identifiable { let id = UUID(); let label, detail, link: String }
    let key, title, hint: String
    let rows: [Row]
    var id: String { key }
}

struct ChecksEnvelope: Decodable {
    let checks: [FinanceCheck]
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        var out: [FinanceCheck] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("checks")) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                var rows: [FinanceCheck.Row] = []
                if var r = try? x.nestedUnkeyedContainer(forKey: JKey("rows")) {
                    while !r.isAtEnd {
                        guard let y = try? r.nestedContainer(keyedBy: JKey.self) else { break }
                        rows.append(.init(label: y.string(JKey("label")), detail: y.string(JKey("detail")), link: y.string(JKey("link"))))
                    }
                }
                out.append(FinanceCheck(key: x.string(JKey("key")), title: x.string(JKey("title")), hint: x.string(JKey("hint")), rows: rows))
            }
        }
        checks = out
    }
}

/// A project with no receipt yet and, when the platform can work it out, the date it was probably received.
struct ReceiptSuggestion: Identifiable {
    let id, number, name, clientName, status, contractDate: String
    let gross: Int
    let date: String
    let basis: String
    let quarter: String
    let warnings: [String]

    var hasDate: Bool { !date.isEmpty }

    static func warning(_ w: String) -> String {
        switch w {
        case "future": return "تاريخ في المستقبل"
        case "before_contract": return "قبل تاريخ العقد"
        case "near_quarter_edge": return "قريب من حدّ الربع"
        default: return w
        }
    }
}

struct SuggestionsEnvelope: Decodable {
    let items: [ReceiptSuggestion]
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: JKey.self)
        var out: [ReceiptSuggestion] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: JKey("items")) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                let s = try? x.nestedContainer(keyedBy: JKey.self, forKey: JKey("suggestion"))
                out.append(ReceiptSuggestion(id: x.string(JKey("projectId")), number: x.string(JKey("number")), name: x.string(JKey("name")),
                                             clientName: x.string(JKey("clientName")), status: x.string(JKey("status")), contractDate: x.string(JKey("contractDate")),
                                             gross: x.halalasFromRiyals(JKey("gross")), date: s?.string(JKey("date")) ?? "", basis: s?.string(JKey("basis")) ?? "",
                                             quarter: s?.string(JKey("quarter")) ?? "", warnings: (try? s?.decode([String].self, forKey: JKey("warnings"))) ?? []))
            }
        }
        items = out
    }
}
