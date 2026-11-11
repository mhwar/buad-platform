import Foundation

// 0.10.1 «الخطط والتقارير»: /api/plans (plans.ts) and /api/reports/execution (reports.ts).
// Plan money is in riyals; the app shows it through `Fmt.sar(halalas)`.

private extension KeyedDecodingContainer {
    func number(_ key: Key) -> Double? {
        if let v = try? decodeIfPresent(Double.self, forKey: key) { return v }
        if let v = try? decodeIfPresent(String.self, forKey: key) { return Double(v) }
        return nil
    }
}

struct PlanCycle: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let name: String
    let startDate: String
    let endDate: String
    let vision: String
    let mission: String
    let values: [String]
    let parentCycleId: String
    let status: String
    private enum K: String, CodingKey { case id, kind, name, startDate, endDate, vision, mission, values, parentCycleId, status }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); kind = c.string(.kind); name = c.string(.name)
        startDate = c.string(.startDate); endDate = c.string(.endDate)
        vision = c.string(.vision); mission = c.string(.mission)
        values = (try? c.decode([String].self, forKey: .values)) ?? []
        parentCycleId = c.string(.parentCycleId); status = c.string(.status)
    }
}

struct PlanCyclesEnvelope: Decodable { let cycles: [PlanCycle] }

struct PlanIndicator: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let unit: String
    let target: Double
    let current: Double?
    let hidden: Bool
    let source: String
    let attainment: Double
    private enum K: String, CodingKey { case id, name, unit, target, current, hidden, source, attainment }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); name = c.string(.name); unit = c.string(.unit)
        target = c.number(.target) ?? 0; current = c.number(.current)
        hidden = c.bool(.hidden); source = c.string(.source); attainment = c.number(.attainment) ?? 0
    }
    var manual: Bool { source.isEmpty || source == "manual" }
}

struct PlanInitiative: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let dueDate: String
    let tasksTotal: Int
    let tasksDone: Int
    private enum K: String, CodingKey { case id, title, status, dueDate, tasks }
    private enum T: String, CodingKey { case total, done }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); title = c.string(.title); status = c.string(.status); dueDate = c.string(.dueDate)
        let t = try? c.nestedContainer(keyedBy: T.self, forKey: .tasks)
        tasksTotal = t?.int(.total) ?? 0; tasksDone = t?.int(.done) ?? 0
    }
}

struct PlanReview: Decodable, Identifiable, Hashable {
    let id: String
    let quarter: Int
    let note: String
    let createdAt: Int
    private enum K: String, CodingKey { case id, quarter, note, createdAt }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); quarter = c.int(.quarter); note = c.string(.note); createdAt = c.int(.createdAt)
    }
}

struct PlanObjective: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let ownerId: String
    let quarter: Int
    let budget: Double
    let indicators: [PlanIndicator]
    let initiatives: [PlanInitiative]
    let reviews: [PlanReview]
    let progress: Double?
    let status: String
    private enum K: String, CodingKey {
        case id, title, description, ownerId, quarter, budget, indicators, initiatives, reviews, progress, status
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); title = c.string(.title); description = c.string(.description)
        ownerId = c.string(.ownerId); quarter = c.int(.quarter); budget = c.number(.budget) ?? 0
        indicators = (try? c.decode([PlanIndicator].self, forKey: .indicators)) ?? []
        initiatives = (try? c.decode([PlanInitiative].self, forKey: .initiatives)) ?? []
        reviews = (try? c.decode([PlanReview].self, forKey: .reviews)) ?? []
        progress = c.number(.progress); status = c.string(.status)
    }
}

struct PlanDetail: Decodable {
    let cycle: PlanCycle
    let objectives: [PlanObjective]
    let progress: Double?
    let status: String
    let budget: Double
    private enum K: String, CodingKey { case cycle, objectives, progress, status, budget }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        cycle = try c.decode(PlanCycle.self, forKey: .cycle)
        objectives = (try? c.decode([PlanObjective].self, forKey: .objectives)) ?? []
        progress = c.number(.progress); status = c.string(.status); budget = c.number(.budget) ?? 0
    }
}

struct PlanOwnersEnvelope: Decodable { let owners: [Person] }

enum PlanVocabulary {
    static func status(_ s: String) -> (label: String, tone: Tone) {
        switch s {
        case "on_track": return ("على المسار", .ok)
        case "at_risk": return ("معرّض للتأخر", .warn)
        case "late": return ("متأخر", .bad)
        case "done": return ("مكتمل", .info)
        case "not_started": return ("لم يبدأ", .neutral)
        default: return ("بلا قياس", .neutral)
        }
    }

    static func cycleStatus(_ s: String) -> String {
        s == "active" ? "جارية" : s == "closed" ? "مغلقة" : "مسودة"
    }

    /// Plan initiatives say «متعثرة» where tasks say «معلّقة».
    static func initiative(_ s: String) -> String {
        switch s {
        case "doing": return "قيد التنفيذ"
        case "blocked": return "متعثرة"
        case "done": return "منجزة"
        default: return "لم تبدأ"
        }
    }

    static func percent(_ p: Double?) -> String { p.map { "\(Int(($0 * 100).rounded()))%" } ?? "—" }

    static func number(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }
}

// MARK: Execution report

struct ExecRow: Decodable, Identifiable, Hashable {
    let key: String
    let name: String
    let open, late, done, onTime, minutes: Int
    var id: String { key }
    static let zero = ExecRow(key: "", name: "", open: 0, late: 0, done: 0, onTime: 0, minutes: 0)
    init(key: String, name: String, open: Int, late: Int, done: Int, onTime: Int, minutes: Int) {
        self.key = key; self.name = name; self.open = open; self.late = late; self.done = done; self.onTime = onTime; self.minutes = minutes
    }
    private enum K: String, CodingKey { case key, name, open, late, done, onTime, minutes }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        key = c.string(.key); name = c.string(.name)
        open = c.int(.open); late = c.int(.late); done = c.int(.done); onTime = c.int(.onTime); minutes = c.int(.minutes)
    }
}

struct ExecutionReport: Decodable {
    let totals: ExecRow
    let people: [ExecRow]
    let projects: [ExecRow]
    private enum K: String, CodingKey { case totals, people, projects }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        totals = (try? c.decode(ExecRow.self, forKey: .totals)) ?? ExecRow.zero
        people = (try? c.decode([ExecRow].self, forKey: .people)) ?? []
        projects = (try? c.decode([ExecRow].self, forKey: .projects)) ?? []
    }
}
