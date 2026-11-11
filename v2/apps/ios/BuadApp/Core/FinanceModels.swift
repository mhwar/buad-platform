import Foundation

// 0.2.0: GET /api/receivables (v2/apps/api/src/modules/receivables.ts). Every amount on this route
// is in riyals and is turned into halalas here. The ageing and the 13-week forecast are the server's.

struct Receivables: Decodable {
    struct Bucket { let key: String; let label: String; let amount: Int; let count: Int }

    struct Line: Decodable, Identifiable {
        let id: String
        let projectId: String
        let label: String
        let dueDate: String
        let amount: Int
        let project: String
        let client: String
        let phone: String

        private enum K: String, CodingKey { case id, projectId, label, dueDate, amount, project, client, phone }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id)
            projectId = c.string(.projectId)
            label = c.string(.label)
            dueDate = c.string(.dueDate)
            amount = c.halalasFromRiyals(.amount)
            project = c.string(.project)
            client = c.string(.client)
            phone = c.string(.phone)
        }
    }

    struct Week: Decodable, Identifiable {
        let start: String
        let end: String
        let inflow: Int
        let outflow: Int
        let balance: Int
        var id: String { start }

        private enum K: String, CodingKey { case start, end, inflow, outflow, balance }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            start = c.string(.start)
            end = c.string(.end)
            inflow = c.halalasFromRiyals(.inflow)
            outflow = c.halalasFromRiyals(.outflow)
            balance = c.halalasFromRiyals(.balance)
        }
    }

    let today: String
    let total: Int
    let overdue: Int
    let buckets: [Bucket]
    let items: [Line]
    let weeks: [Week]
    let shortfallWeek: String
    let pendingExpenses: Int

    /// AGING_BUCKETS (packages/domain/src/receivables.ts), in the website's order.
    static let bucketLabels: [(String, String)] = [
        ("current", "غير مستحقة"), ("d1_30", "1–30 يوماً"), ("d31_60", "31–60 يوماً"),
        ("d61_90", "61–90 يوماً"), ("d90", "أكثر من 90 يوماً"),
    ]

    private enum K: String, CodingKey { case today, aging, items, weeks, shortfallWeek, pendingExpenses }
    private enum A: String, CodingKey { case total, overdue, buckets }
    private struct Dyn: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }
    private enum B: String, CodingKey { case amount, count }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        today = c.string(.today)
        let a = try c.nestedContainer(keyedBy: A.self, forKey: .aging)
        total = a.halalasFromRiyals(.total)
        overdue = a.halalasFromRiyals(.overdue)
        let raw = try? a.nestedContainer(keyedBy: Dyn.self, forKey: .buckets)
        buckets = Self.bucketLabels.map { key, label in
            let b = try? raw?.nestedContainer(keyedBy: B.self, forKey: Dyn(stringValue: key))
            return Bucket(key: key, label: label, amount: b?.halalasFromRiyals(.amount) ?? 0, count: b?.int(.count) ?? 0)
        }
        items = (try? c.decode([Line].self, forKey: .items)) ?? []
        weeks = (try? c.decode([Week].self, forKey: .weeks)) ?? []
        shortfallWeek = c.string(.shortfallWeek)
        pendingExpenses = c.halalasFromRiyals(.pendingExpenses)
    }
}

struct ReceiveResult: Decodable {
    let rest: Int
    private enum K: String, CodingKey { case rest }
    init(from decoder: Decoder) throws {
        rest = try decoder.container(keyedBy: K.self).halalasFromRiyals(.rest)
    }
}

/// Date rules for a receipt, as in packages/domain/src/receipts.ts and realized.ts.
/// They only warn; the server decides what is saved.
enum ReceiptRules {
    static let quarterNames = ["", "الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"]

    private static func parts(_ iso: String) -> (y: Int, m: Int)? {
        let p = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        return p.count == 3 ? (p[0], p[1]) : nil
    }

    /// «الربع الثالث 2026».
    static func quarterLabel(_ iso: String) -> String {
        guard let (y, m) = parts(iso) else { return "" }
        return "\(quarterNames[(m - 1) / 3 + 1]) \(y)"
    }

    private static func dayNumber(_ iso: String) -> Int? {
        Fmt.date(iso).map { Int(($0.timeIntervalSince1970 / 86_400).rounded()) }
    }

    /// «future», «before_contract», «near_quarter_edge», with the website's wording.
    static func warnings(date: String, contractDate: String, today: String) -> [String] {
        var out: [String] = []
        if date > today { out.append("التاريخ في المستقبل.") }
        if !contractDate.isEmpty, date < contractDate { out.append("التاريخ قبل تاريخ العقد.") }
        if let (y, m) = parts(date), let d = dayNumber(date) {
            let q = (m - 1) / 3
            let from = String(format: "%04d-%02d-01", y, q * 3 + 1)
            let nextStart = q == 3 ? String(format: "%04d-01-01", y + 1) : String(format: "%04d-%02d-01", y, q * 3 + 4)
            if let f = dayNumber(from), let n = dayNumber(nextStart), d - f < 3 || (n - 1) - d < 3 {
                out.append("قريب من حدّ الربع؛ تأكد أنه في الربع الصحيح.")
            }
        }
        return out
    }

    /// «12,500.5» or «١٢٬٥٠٠٫٥» → 12500.5 (commas are thousands separators). nil when it is not a number.
    static func riyals(_ text: String) -> Double? {
        let digits = "٠١٢٣٤٥٦٧٨٩"
        var out = ""
        for ch in text where !ch.isWhitespace {
            if let i = digits.firstIndex(of: ch) { out.append(String(digits.distance(from: digits.startIndex, to: i))) }
            else if ch == "٫" || ch == "." { out.append(".") }
            else if ch == "," || ch == "٬" { continue }
            else { out.append(ch) }
        }
        return Double(out)
    }

    /// WhatsApp number as the website builds it (lib/format.ts whatsapp): 9665XXXXXXXX or "".
    static func whatsapp(_ phone: String) -> String {
        var d = phone.filter(\.isNumber)
        if d.hasPrefix("00") { d.removeFirst(2) }
        if d.hasPrefix("05"), d.count == 10 { d = "966" + d.dropFirst() } else if d.hasPrefix("5"), d.count == 9 { d = "966" + d }
        return d.count == 12 && d.hasPrefix("9665") ? d : ""
    }
}

// MARK: GET /api/finance/overview?from&to (finance-overview.ts) — riyals, turned into halalas.

struct FinanceOverview: Decodable {
    struct Totals {
        let gross, vat, profit, spent, received, remaining, pending, unregistered: Int
        let margin: Double
        let projects: Int
        let withoutFinance: Int
    }

    struct ProjectRow: Decodable, Identifiable {
        let id, number, name, clientName, status: String
        let gross, profit, spent, remaining: Int
        let margin: Double
        let hasFinance: Bool

        private enum K: String, CodingKey { case id, number, name, clientName, status, gross, profit, spent, remaining, margin, hasFinance }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id); number = c.string(.number); name = c.string(.name)
            clientName = c.string(.clientName); status = c.string(.status)
            gross = c.halalasFromRiyals(.gross); profit = c.halalasFromRiyals(.profit)
            spent = c.halalasFromRiyals(.spent); remaining = c.halalasFromRiyals(.remaining)
            margin = c.double(.margin); hasFinance = c.bool(.hasFinance)
        }
    }

    struct Month: Decodable, Identifiable {
        let month: String
        let income, expense: Int
        var id: String { month }
        private enum K: String, CodingKey { case month, income, expense }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            month = c.string(.month); income = c.halalasFromRiyals(.income); expense = c.halalasFromRiyals(.expense)
        }
    }

    struct Ranked: Decodable, Identifiable {
        let label: String
        let amount: Int
        var id: String { label }
        private enum K: String, CodingKey { case label, amount }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            label = c.string(.label); amount = c.halalasFromRiyals(.amount)
        }
    }

    struct Pending: Decodable {
        let projectId, projectName, date, description: String
        let amount: Int
        private enum K: String, CodingKey { case projectId, projectName, date, description, amount }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            projectId = c.string(.projectId); projectName = c.string(.projectName)
            date = c.string(.date); description = c.string(.description); amount = c.halalasFromRiyals(.amount)
        }
    }

    struct Unregistered: Decodable {
        let projectId, projectName, item: String
        let amount: Int
        private enum K: String, CodingKey { case projectId, projectName, item, amount }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            projectId = c.string(.projectId); projectName = c.string(.projectName)
            item = c.string(.item); amount = c.halalasFromRiyals(.amount)
        }
    }

    struct Quality: Decodable {
        let missingReceipts: Bool
        let entriesWithoutStatus: Int
        private enum K: String, CodingKey { case missingReceipts, entriesWithoutStatus }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            missingReceipts = c.bool(.missingReceipts); entriesWithoutStatus = c.int(.entriesWithoutStatus)
        }
    }

    let totals: Totals
    let projects: [ProjectRow]
    let monthly: [Month]
    let categories: [Ranked]
    let pending: [Pending]
    let unregistered: [Unregistered]
    let quality: [Quality]

    private enum K: String, CodingKey { case totals, projects, monthly, categories, obligations, quality }
    private enum T: String, CodingKey { case gross, vat, profit, spent, received, remaining, pending, unregistered, margin, projects, withoutFinance }
    private enum O: String, CodingKey { case pending, unregistered }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let t = try c.nestedContainer(keyedBy: T.self, forKey: .totals)
        totals = Totals(
            gross: t.halalasFromRiyals(.gross), vat: t.halalasFromRiyals(.vat), profit: t.halalasFromRiyals(.profit),
            spent: t.halalasFromRiyals(.spent), received: t.halalasFromRiyals(.received),
            remaining: t.halalasFromRiyals(.remaining), pending: t.halalasFromRiyals(.pending),
            unregistered: t.halalasFromRiyals(.unregistered), margin: t.double(.margin),
            projects: t.int(.projects), withoutFinance: t.int(.withoutFinance)
        )
        projects = (try? c.decode([ProjectRow].self, forKey: .projects)) ?? []
        monthly = (try? c.decode([Month].self, forKey: .monthly)) ?? []
        categories = (try? c.decode([Ranked].self, forKey: .categories)) ?? []
        let o = try? c.nestedContainer(keyedBy: O.self, forKey: .obligations)
        pending = (try? o?.decode([Pending].self, forKey: .pending)) ?? []
        unregistered = (try? o?.decode([Unregistered].self, forKey: .unregistered)) ?? []
        quality = (try? c.decode([Quality].self, forKey: .quality)) ?? []
    }
}

/// The website's period control (features/finance-overview/api.ts resolvePeriod).
struct FinancePeriod: Equatable {
    enum Preset: String, CaseIterable { case all, quarter, year }
    var preset: Preset = .all
    var year: Int = Calendar(identifier: .gregorian).component(.year, from: Date())
    var quarter: Int = (Calendar(identifier: .gregorian).component(.month, from: Date()) - 1) / 3 + 1

    private static func range(_ y: Int, _ q: Int) -> (String, String) {
        let m = (q - 1) * 3 + 1
        let last = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m + 2] + ((m + 2 == 2 && y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) ? 1 : 0)
        return (String(format: "%04d-%02d-01", y, m), String(format: "%04d-%02d-%02d", y, m + 2, last))
    }

    /// (from, to), or nil for every period.
    var bounds: (String, String)? {
        switch preset {
        case .all: return nil
        case .quarter: return Self.range(year, quarter)
        case .year: return (String(format: "%04d-01-01", year), String(format: "%04d-12-31", year))
        }
    }

    var previous: FinancePeriod? {
        switch preset {
        case .all: return nil
        case .quarter: return quarter == 1 ? .init(preset: .quarter, year: year - 1, quarter: 4) : .init(preset: .quarter, year: year, quarter: quarter - 1)
        case .year: return .init(preset: .year, year: year - 1, quarter: quarter)
        }
    }

    var label: String {
        switch preset {
        case .all: return "كل الفترات"
        case .quarter: return "\(ReceiptRules.quarterNames[quarter]) \(year)"
        case .year: return "سنة \(year)"
        }
    }
}

// MARK: GET /api/finance/vat/report?year&q and /api/finance/vat/year?year (vat.ts) — riyals → halalas.

struct VatReport: Decodable {
    struct Sale: Decodable, Identifiable {
        let id = UUID()
        let date, name, clientName, source, invoiceNo: String
        let amount, base, vat: Int
        private enum K: String, CodingKey { case date, name, clientName, source, invoiceNo, amount, base, vat }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            date = c.string(.date); name = c.string(.name); clientName = c.string(.clientName)
            source = c.string(.source); invoiceNo = c.string(.invoiceNo)
            amount = c.halalasFromRiyals(.amount); base = c.halalasFromRiyals(.base); vat = c.halalasFromRiyals(.vat)
        }
    }

    struct Purchase: Decodable, Identifiable {
        let id = UUID()
        let invoiceDate, date, description, supplierName, projectName, owner: String
        let base, vat: Int
        let gaps: Int
        private enum K: String, CodingKey { case invoiceDate, date, description, supplierName, projectName, owner, base, vat, gaps }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            invoiceDate = c.string(.invoiceDate); date = c.string(.date); description = c.string(.description)
            supplierName = c.string(.supplierName); projectName = c.string(.projectName); owner = c.string(.owner)
            base = c.halalasFromRiyals(.base); vat = c.halalasFromRiyals(.vat)
            gaps = ((try? c.decode([String].self, forKey: .gaps)) ?? []).count
        }
    }

    struct Unidentified: Decodable, Identifiable {
        let id = UUID()
        let date, description, projectName, category: String
        let amount: Int
        private enum K: String, CodingKey { case date, description, projectName, category, amount }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            date = c.string(.date); description = c.string(.description)
            projectName = c.string(.projectName); category = c.string(.category); amount = c.halalasFromRiyals(.amount)
        }
    }

    struct Warning: Decodable, Identifiable {
        let code: String
        let count: Int
        var id: String { code }
        private enum K: String, CodingKey { case code, count }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            code = c.string(.code); count = c.int(.count)
        }

        /// WARNING (features/finance-overview/VatTab.tsx), word for word.
        var text: String {
            let n = count
            switch code {
            case "no_vat_number": return "الرقم الضريبي للجهة غير مسجّل في «الإعدادات ← بيانات الجهة»."
            case "projects_without_receipts": return "\(n) مشروع له قيمة عقد ولا استلام معتمداً ولا فاتورة: ضريبة مبيعاته لا تظهر بعد."
            case "invoice_incomplete": return "\(n) فاتورة مشتريات ناقصة البيانات (المورد/رقمه الضريبي/رقم الفاتورة/تاريخها)."
            case "unidentified_purchases": return "\(n) مصروف بلا فاتورة ضريبية: إن كان له فاتورة سجّلوها لتُخصم ضريبتها."
            case "sales_without_invoice": return "\(n) مقبوض في مشاريع لم تُسجَّل لها فواتير ضريبية بعد: احتُسبت بتاريخ الاستلام مؤقتاً. سجّلوا الفاتورة المرسلة للعميل من صفحة المشروع لتُحتسب بتاريخها."
            case "invoices_below_receipts": return "\(n) مشروع فواتيره المسجّلة أقل مما استُلم منه: قد تنقصه فاتورة."
            case "cf_undecided": return "\(n) بند «رسوم إضافية» لم يُحدَّد: هل هو ضريبة العقد المحجوزة للهيئة أم رسوم فعلية؟"
            case "vat_as_expense": return "\(n) قيد سداد ضريبة مسجّل كمصروف مشروع: انقله إلى سداد الإقرار من «سداد ضريبة مسجّل كمصروف» أدناه."
            default: return code
            }
        }
    }

    let label: String
    let rate: Double
    let outputVat, inputVat, netPayable, reserved: Int
    let salesBase, purchasesBase: Int
    let sales: [Sale]
    let purchases: [Purchase]
    let unidentified: [Unidentified]
    let warnings: [Warning]

    /// A tax payment booked as a project expense, to move into a quarter's filing.
    struct VatExpense: Identifiable {
        let id = UUID()
        let entryId, projectId, projectName, date, description: String
        let amount: Int
    }

    let vatExpenses: [VatExpense]

    private enum K: String, CodingKey { case period, rate, outputVat, inputVat, netPayable, reserved, sales, purchases, unidentified, warnings, vatExpenses }
    private enum P: String, CodingKey { case label }
    private enum Part: String, CodingKey { case rows, base }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        label = (try? c.nestedContainer(keyedBy: P.self, forKey: .period))?.string(.label) ?? ""
        rate = c.double(.rate)
        outputVat = c.halalasFromRiyals(.outputVat); inputVat = c.halalasFromRiyals(.inputVat)
        netPayable = c.halalasFromRiyals(.netPayable); reserved = c.halalasFromRiyals(.reserved)
        let s = try? c.nestedContainer(keyedBy: Part.self, forKey: .sales)
        salesBase = s?.halalasFromRiyals(.base) ?? 0
        sales = (try? s?.decode([Sale].self, forKey: .rows)) ?? []
        let p = try? c.nestedContainer(keyedBy: Part.self, forKey: .purchases)
        purchasesBase = p?.halalasFromRiyals(.base) ?? 0
        purchases = (try? p?.decode([Purchase].self, forKey: .rows)) ?? []
        let u = try? c.nestedContainer(keyedBy: Part.self, forKey: .unidentified)
        unidentified = (try? u?.decode([Unidentified].self, forKey: .rows)) ?? []
        warnings = (try? c.decode([Warning].self, forKey: .warnings)) ?? []
        var ve: [VatExpense] = []
        if var arr = try? c.nestedUnkeyedContainer(forKey: .vatExpenses) {
            while !arr.isAtEnd {
                guard let x = try? arr.nestedContainer(keyedBy: JKey.self) else { break }
                ve.append(VatExpense(entryId: x.string(JKey("entryId")), projectId: x.string(JKey("projectId")), projectName: x.string(JKey("projectName")),
                                     date: x.string(JKey("date")), description: x.string(JKey("description")), amount: x.halalasFromRiyals(JKey("amount"))))
            }
        }
        vatExpenses = ve
    }
}

struct VatYear: Decodable {
    struct Quarter: Decodable, Identifiable {
        let q: Int
        /// «2026-Q2»: the key a filing is saved under.
        let key: String
        let label: String
        let dueDate: String
        let outputVat, inputVat, netPayable: Int
        let warnings: Int
        let status: String
        let filedOn: String
        let paidOn: String
        let paidAmount: Int
        let reference: String
        let note: String
        var id: Int { q }
        private enum K: String, CodingKey { case q, key, label, dueDate, outputVat, inputVat, netPayable, warnings, filing }
        private enum F: String, CodingKey { case status, filedOn, paidOn, paidAmount, reference, note }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            q = c.int(.q); key = c.string(.key); label = c.string(.label); dueDate = c.string(.dueDate)
            outputVat = c.halalasFromRiyals(.outputVat); inputVat = c.halalasFromRiyals(.inputVat)
            netPayable = c.halalasFromRiyals(.netPayable); warnings = c.int(.warnings)
            let f = try? c.nestedContainer(keyedBy: F.self, forKey: .filing)
            status = f?.string(.status).isEmpty == false ? f!.string(.status) : "open"
            filedOn = f?.string(.filedOn) ?? ""; paidOn = f?.string(.paidOn) ?? ""
            paidAmount = f?.halalasFromRiyals(.paidAmount) ?? 0
            reference = f?.string(.reference) ?? ""; note = f?.string(.note) ?? ""
        }
    }

    let quarters: [Quarter]
    let netPayable, paid, balance: Int

    private enum K: String, CodingKey { case quarters, totals }
    private enum T: String, CodingKey { case netPayable, paid, balance }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        quarters = (try? c.decode([Quarter].self, forKey: .quarters)) ?? []
        let t = try c.nestedContainer(keyedBy: T.self, forKey: .totals)
        netPayable = t.halalasFromRiyals(.netPayable); paid = t.halalasFromRiyals(.paid); balance = t.halalasFromRiyals(.balance)
    }
}
