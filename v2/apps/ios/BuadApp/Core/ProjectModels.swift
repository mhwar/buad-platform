import Foundation

// The project page's reads, shaped exactly as the API sends them (v2/apps/api/src/modules).
// Units differ by route, so every amount is turned into halalas here and shown with Fmt.sar:
//   halalas: finance entries, receipts, project expectedValue
//   riyals:  finance summary, finance `received`, payment schedule amounts
// Nothing is added up or derived in the app; each figure is the server's.

extension KeyedDecodingContainer {
    /// A riyal amount (possibly fractional) as whole halalas.
    func halalasFromRiyals(_ key: Key) -> Int {
        if let v = try? decodeIfPresent(Double.self, forKey: key) { return Int((v * 100).rounded()) }
        if let v = try? decodeIfPresent(String.self, forKey: key), let n = Double(v) { return Int((n * 100).rounded()) }
        return 0
    }

    func double(_ key: Key) -> Double {
        if let v = try? decodeIfPresent(Double.self, forKey: key) { return v }
        if let v = try? decodeIfPresent(String.self, forKey: key), let n = Double(v) { return n }
        return 0
    }
}

// MARK: GET /api/projects/:id

struct ProjectDetail: Decodable {
    let location: String
    let startDate: String
    let endDate: String
    let payDate: String
    let visibility: String
    let notes: String
    let serviceName: String
    let packageName: String
    let clientName: String
    let financeExists: Bool

    private enum Keys: String, CodingKey { case project, service, client, financeExists }
    private enum P: String, CodingKey { case location, startDate, endDate, payDate, visibility, notes }
    private enum S: String, CodingKey { case productName, packageName }
    private enum C: String, CodingKey { case name }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let p = try c.nestedContainer(keyedBy: P.self, forKey: .project)
        location = p.string(.location)
        startDate = p.string(.startDate)
        endDate = p.string(.endDate)
        payDate = p.string(.payDate)
        visibility = p.string(.visibility)
        notes = p.string(.notes)
        let s = try? c.nestedContainer(keyedBy: S.self, forKey: .service)
        serviceName = s?.string(.productName) ?? ""
        packageName = s?.string(.packageName) ?? ""
        let cl = try? c.nestedContainer(keyedBy: C.self, forKey: .client)
        clientName = cl?.string(.name) ?? ""
        financeExists = c.bool(.financeExists)
    }
}

// MARK: GET /api/projects/:id/finance

struct FinanceEntry: Decodable, Identifiable {
    let id: String
    let date: String
    let description: String
    let cat: String
    let type: String
    let amount: Int
    let status: String
    let note: String
    let supplierName: String
    let cfKind: String
    let taxInvoice: Bool
    let vatAmount: Int
    let supplierVatNo: String
    let invoiceNo: String
    let invoiceDate: String
    let source: String

    private enum K: String, CodingKey {
        case id, date, description, cat, type, amount, status, note, supplierName
        case cfKind, taxInvoice, vatAmount, supplierVatNo, invoiceNo, invoiceDate, source
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        date = c.string(.date)
        description = c.string(.description)
        cat = c.string(.cat)
        type = c.string(.type)
        amount = c.int(.amount)
        status = c.string(.status)
        note = c.string(.note)
        supplierName = c.string(.supplierName)
        cfKind = c.string(.cfKind)
        taxInvoice = c.bool(.taxInvoice)
        vatAmount = c.int(.vatAmount)
        supplierVatNo = c.string(.supplierVatNo)
        invoiceNo = c.string(.invoiceNo)
        invoiceDate = c.string(.invoiceDate)
        source = c.string(.source)
    }
}

struct Receipt: Decodable, Identifiable {
    let id: String
    let date: String
    let amount: Int
    let note: String
    let approved: Bool

    private enum K: String, CodingKey { case id, date, amount, note, approvedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        date = c.string(.date)
        amount = c.int(.amount)
        note = c.string(.note)
        approved = c.optionalInt(.approvedAt) != nil
    }
}

struct ProjectFinance: Decodable {
    struct Summary {
        let grossTotal: Int
        let totalDeductions: Int
        let pendingExpenses: Int
        let profit: Int
        let remaining: Int
        let remainingFromGross: Int
        let execAmt: Int
        let mkt: Int
        let cb: Int
        let cfAmt: Int
        let available: Int
        let opExpenses: Int
        let remainingExec: Int
        let totalIncome: Int
        let totalExpenses: Int
    }

    let summary: Summary
    let received: Int
    let profitHidden: Bool
    let contractNo: String
    let contractDate: String
    let vatIncluded: Bool
    let vatPct: Double
    let mktInternal: Bool
    let notSetUp: Bool
    let entries: [FinanceEntry]
    let receipts: [Receipt]
    /// Custom category id → label, and budget row id → name, for the entry category names.
    let categoryLabels: [String: String]
    let budgetLabels: [String: String]
    /// The same, in the website's order, for the category picker.
    let customCategories: [NamedItem]
    let budgetItems: [NamedItem]

    private enum K: String, CodingKey { case summary, received, profitHidden, ctrl, entries, receipts, categories, budget }
    private enum S: String, CodingKey {
        case grossTotal, totalDeductions, pendingExpenses, profit, remaining, remainingFromGross, execAmt, mkt, cb, cfAmt
        case available, opExpenses, remainingExec, totalIncome, totalExpenses
    }
    private enum Ctrl: String, CodingKey { case contractNo, contractDate, vatIncluded, vatPct, mktInternal, version }

    private struct Named: Decodable {
        let id: String
        let text: String
        private enum K: String, CodingKey { case id, label, name }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id)
            let label = c.string(.label)
            text = label.isEmpty ? c.string(.name) : label
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let s = try c.nestedContainer(keyedBy: S.self, forKey: .summary)
        summary = Summary(
            grossTotal: s.halalasFromRiyals(.grossTotal),
            totalDeductions: s.halalasFromRiyals(.totalDeductions),
            pendingExpenses: s.halalasFromRiyals(.pendingExpenses),
            profit: s.halalasFromRiyals(.profit),
            remaining: s.halalasFromRiyals(.remaining),
            remainingFromGross: s.halalasFromRiyals(.remainingFromGross),
            execAmt: s.halalasFromRiyals(.execAmt),
            mkt: s.halalasFromRiyals(.mkt),
            cb: s.halalasFromRiyals(.cb),
            cfAmt: s.halalasFromRiyals(.cfAmt),
            available: s.halalasFromRiyals(.available),
            opExpenses: s.halalasFromRiyals(.opExpenses),
            remainingExec: s.halalasFromRiyals(.remainingExec),
            totalIncome: s.halalasFromRiyals(.totalIncome),
            totalExpenses: s.halalasFromRiyals(.totalExpenses)
        )
        received = c.halalasFromRiyals(.received)
        profitHidden = c.bool(.profitHidden)
        let ctrl = try c.nestedContainer(keyedBy: Ctrl.self, forKey: .ctrl)
        contractNo = ctrl.string(.contractNo)
        contractDate = ctrl.string(.contractDate)
        vatIncluded = ctrl.bool(.vatIncluded)
        vatPct = ctrl.double(.vatPct)
        mktInternal = ctrl.bool(.mktInternal)
        notSetUp = ctrl.int(.version) == 0
        entries = (try? c.decode([FinanceEntry].self, forKey: .entries)) ?? []
        receipts = (try? c.decode([Receipt].self, forKey: .receipts)) ?? []
        let cats = (try? c.decode([Named].self, forKey: .categories)) ?? []
        categoryLabels = Dictionary(cats.map { ($0.id, $0.text) }, uniquingKeysWith: { a, _ in a })
        let budget = (try? c.decode([Named].self, forKey: .budget)) ?? []
        budgetLabels = Dictionary(budget.map { ($0.id, $0.text) }, uniquingKeysWith: { a, _ in a })
        customCategories = cats.map { NamedItem(id: $0.id, label: $0.text) }
        budgetItems = budget.map { NamedItem(id: $0.id, label: $0.text) }
    }

    /// Same rule as the website's catLabel (features/finance/labels.ts).
    func categoryName(_ cat: String) -> String {
        if let builtIn = Vocabulary.entryCategory[cat] { return builtIn }
        if cat.hasPrefix("bdg_") { return budgetLabels[String(cat.dropFirst(4))].flatMap { $0.isEmpty ? nil : $0 } ?? "بند ميزانية" }
        return categoryLabels[cat] ?? "تصنيف محذوف"
    }
}

struct NamedItem: Identifiable, Hashable {
    let id: String
    let label: String
}

// MARK: GET /api/receivables/projects/:id

struct ScheduleItem: Decodable, Identifiable {
    let id: String
    let label: String
    let dueDate: String
    let amount: Int
    let status: String
    let receivedAt: String

    private enum K: String, CodingKey { case id, label, dueDate, amount, status, receivedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        label = c.string(.label)
        dueDate = c.string(.dueDate)
        amount = c.halalasFromRiyals(.amount)
        status = c.string(.status)
        receivedAt = c.string(.receivedAt)
    }
}

struct ScheduleEnvelope: Decodable { let items: [ScheduleItem] }

// MARK: GET /api/tasks/projects/:id

struct Stage: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let dueDate: String

    private enum K: String, CodingKey { case id, title, status, dueDate }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        title = c.string(.title)
        status = c.string(.status)
        dueDate = c.string(.dueDate)
    }
}

struct TaskItem: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let priority: String
    let dueDate: String
    let startDate: String
    let stageId: String
    let assigneeId: String
    let assigneeName: String
    let projectId: String
    let projectName: String

    private enum K: String, CodingKey {
        case id, title, status, priority, dueDate, startDate, stageId, assigneeId, assigneeName, projectId, projectName
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        title = c.string(.title)
        status = c.string(.status)
        priority = c.string(.priority)
        dueDate = c.string(.dueDate)
        startDate = c.string(.startDate)
        stageId = c.string(.stageId)
        assigneeId = c.string(.assigneeId)
        assigneeName = c.string(.assigneeName)
        projectId = c.string(.projectId)
        projectName = c.string(.projectName)
    }

    var overdue: Bool { status != "done" && !dueDate.isEmpty && dueDate < Fmt.todayISO }
}

struct Execution: Decodable {
    let stages: [Stage]
    let tasks: [TaskItem]
    let minutes: Int

    private enum K: String, CodingKey { case stages, tasks, minutes }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        stages = (try? c.decode([Stage].self, forKey: .stages)) ?? []
        tasks = (try? c.decode([TaskItem].self, forKey: .tasks)) ?? []
        minutes = c.int(.minutes)
    }
}

// MARK: GET /api/projects/:id/documents

struct DocumentItem: Decodable, Identifiable {
    let id: String
    let kind: String
    let number: String
    let title: String
    let status: String
    let outgoingNo: String
    let updatedAt: Int

    private enum K: String, CodingKey { case id, kind, number, title, status, outgoingNo, updatedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        kind = c.string(.kind)
        number = c.string(.number)
        title = c.string(.title)
        status = c.string(.status)
        outgoingNo = c.string(.outgoingNo)
        updatedAt = c.int(.updatedAt)
    }
}

struct DocumentsEnvelope: Decodable { let items: [DocumentItem] }
