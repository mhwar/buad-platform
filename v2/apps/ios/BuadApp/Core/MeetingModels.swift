import Foundation

// 0.7.0 «الاجتماعات والقرارات»: /api/meetings and /api/decisions (workspace.ts). A meeting's time is the
// team's own clock as typed («2026-10-15T10:30»), never converted.

struct Attendee: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    private enum K: String, CodingKey { case id, name }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); name = c.string(.name)
    }
}

struct Meeting: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let startsAt: String
    let durationMin: Int
    let location: String
    let attendees: [Attendee]
    let clientId: String
    let clientName: String
    let requestId: String
    let requestName: String
    let projectId: String
    let projectName: String
    let agenda: String
    let minutes: String
    let status: String
    let openDecisions: Int
    let canManage: Bool

    private enum K: String, CodingKey {
        case id, title, startsAt, durationMin, location, attendees, clientId, clientName, requestId, requestName
        case projectId, projectName, agenda, minutes, status, openDecisions, canManage
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); title = c.string(.title); startsAt = c.string(.startsAt)
        durationMin = c.optionalInt(.durationMin) ?? 60; location = c.string(.location)
        attendees = (try? c.decode([Attendee].self, forKey: .attendees)) ?? []
        clientId = c.string(.clientId); clientName = c.string(.clientName)
        requestId = c.string(.requestId); requestName = c.string(.requestName)
        projectId = c.string(.projectId); projectName = c.string(.projectName)
        agenda = c.string(.agenda); minutes = c.string(.minutes); status = c.string(.status)
        openDecisions = c.int(.openDecisions)
        canManage = (try? c.decodeIfPresent(Bool.self, forKey: .canManage)) ?? false
    }

    static func == (a: Meeting, b: Meeting) -> Bool { a.id == b.id && a.status == b.status && a.startsAt == b.startsAt }
    func hash(into h: inout Hasher) { h.combine(id) }

    /// Scheduled and not yet started.
    var upcoming: Bool { status == "scheduled" && startsAt >= MeetingFmt.nowLocal }
}

struct MeetingsEnvelope: Decodable { let items: [Meeting] }

struct MeetingDetail: Decodable {
    let meeting: Meeting
    let decisions: [DecisionItem]
    private enum K: String, CodingKey { case meeting, decisions }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        meeting = try c.decode(Meeting.self, forKey: .meeting)
        decisions = (try? c.decode([DecisionItem].self, forKey: .decisions)) ?? []
    }
}

struct DecisionItem: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let details: String
    let ownerId: String
    let ownerName: String
    let dueDate: String
    let status: String
    let meetingId: String
    let meetingTitle: String
    let projectId: String
    let taskId: String
    let canEdit: Bool
    let canClose: Bool

    private enum K: String, CodingKey {
        case id, title, details, ownerId, ownerName, dueDate, status, meetingId, meetingTitle, projectId, taskId, canEdit, canClose
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id); title = c.string(.title); details = c.string(.details); ownerId = c.string(.ownerId)
        ownerName = c.string(.ownerName); dueDate = c.string(.dueDate); status = c.string(.status)
        meetingId = c.string(.meetingId); meetingTitle = c.string(.meetingTitle); projectId = c.string(.projectId)
        taskId = c.string(.taskId)
        canEdit = (try? c.decodeIfPresent(Bool.self, forKey: .canEdit)) ?? false
        canClose = (try? c.decodeIfPresent(Bool.self, forKey: .canClose)) ?? false
    }

    static func == (a: DecisionItem, b: DecisionItem) -> Bool { a.id == b.id && a.status == b.status && a.taskId == b.taskId }
    func hash(into h: inout Hasher) { h.combine(id) }

    var overdue: Bool { status == "open" && !dueDate.isEmpty && dueDate < Fmt.todayISO }
}

struct DecisionsEnvelope: Decodable { let items: [DecisionItem] }

enum MeetingVocabulary {
    static func status(_ key: String) -> (label: String, tone: Tone) {
        switch key {
        case "done": return ("عُقد", .ok)
        case "cancelled": return ("أُلغي", .bad)
        default: return ("مجدول", .info)
        }
    }

    static func decisionStatus(_ key: String) -> (label: String, tone: Tone) {
        switch key {
        case "done": return ("نُفّذ", .ok)
        case "cancelled": return ("أُلغي", .neutral)
        default: return ("مفتوح", .warn)
        }
    }

    static func error(_ code: String) -> String? {
        switch code {
        case "author_only": return "هذا لصاحب القرار أو الاجتماع أو من يملك صلاحية الإدارة فقط."
        case "already_converted": return "حُوّل هذا القرار إلى مهمة من قبل."
        case "project_not_found": return "المشروع غير موجود أو لا تملك صلاحية الوصول إليه."
        case "client_not_found": return "العميل غير موجود."
        case "request_not_found": return "الفرصة غير موجودة."
        case "meeting_not_found": return "الاجتماع غير موجود."
        default: return nil
        }
    }
}

/// Meeting times: parse and show «2026-10-15T10:30» in Gregorian, Latin digits, on the team's clock.
enum MeetingFmt {
    private static let local: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f
    }()

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar@numbers=latn")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "EEEE d MMMM"
        return f
    }()

    private static let timeFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar@numbers=latn")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "h:mm a"
        return f
    }()

    static var nowLocal: String { local.string(from: Date()) }
    static func date(_ s: String) -> Date? { local.date(from: s) }
    static func string(_ d: Date) -> String { local.string(from: d) }

    static func day(_ s: String) -> String { date(s).map { dayFormat.string(from: $0) } ?? "" }
    static func time(_ s: String) -> String { date(s).map { timeFormat.string(from: $0) } ?? "" }
    static func when(_ s: String) -> String { [day(s), time(s)].filter { !$0.isEmpty }.joined(separator: " · ") }

    static func duration(_ minutes: Int) -> String {
        if minutes < 60 { return "\(minutes) دقيقة" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? Fmt.hours(minutes) : "\(h) س \(m) د"
    }
}
