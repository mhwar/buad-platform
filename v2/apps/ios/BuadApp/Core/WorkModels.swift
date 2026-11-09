import Foundation

// 0.1.2 reads: tasks across projects, notifications, clients. Shapes as the API sends them
// (v2/apps/api/src/modules/tasks.ts, notifications.ts, clients.ts).
// Units: the clients list (projectValue, owed) and a client's projects (contractTotal) are in
// halalas; the statement of account is in riyals and is turned into halalas here.

struct TasksEnvelope: Decodable { let items: [TaskItem] }

// MARK: GET /api/notifications

struct NotificationItem: Decodable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let link: String
    let read: Bool
    let createdAt: Int

    private enum K: String, CodingKey { case id, kind, title, link, readAt, createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        kind = c.string(.kind)
        title = c.string(.title)
        link = c.string(.link)
        read = c.int(.readAt) > 0
        createdAt = c.int(.createdAt)
    }

    init(copy n: NotificationItem, read: Bool) {
        id = n.id; kind = n.kind; title = n.title; link = n.link; createdAt = n.createdAt
        self.read = read
    }
}

struct NotificationsEnvelope: Decodable {
    let items: [NotificationItem]
    let unread: Int

    private enum K: String, CodingKey { case items, unread }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        items = (try? c.decode([NotificationItem].self, forKey: .items)) ?? []
        unread = c.int(.unread)
    }
}

// MARK: GET /api/clients

struct ClientItem: Decodable, Identifiable, Hashable {
    let id: String
    let code: String
    let name: String
    let type: String
    let city: String
    let phone: String
    let email: String
    let relationship: String
    let projectCount: Int
    let projectValue: Int
    /// nil when the role may not see project finance (the server sends null).
    let owed: Int?
    let lateInstalments: Int
    let documentsCount: Int
    let openRequests: Int
    let ownerName: String
    let nextFollowUpAt: String

    private enum K: String, CodingKey {
        case id, code, name, type, city, phone, email, relationship, projectCount, projectValue, owed, lateInstalments
        case documentsCount, openRequests, ownerName, nextFollowUpAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = c.string(.id)
        code = c.string(.code)
        name = c.string(.name)
        type = c.string(.type)
        city = c.string(.city)
        phone = c.string(.phone)
        email = c.string(.email)
        relationship = c.string(.relationship)
        projectCount = c.int(.projectCount)
        projectValue = c.int(.projectValue)
        owed = c.optionalInt(.owed)
        lateInstalments = c.int(.lateInstalments)
        documentsCount = c.int(.documentsCount)
        openRequests = c.int(.openRequests)
        ownerName = c.string(.ownerName)
        nextFollowUpAt = c.string(.nextFollowUpAt)
    }

    static func == (a: ClientItem, b: ClientItem) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

struct ClientsEnvelope: Decodable { let items: [ClientItem] }

// MARK: GET /api/clients/:id

struct ClientDetail: Decodable {
    struct Contact: Decodable, Identifiable {
        let id: String
        let name: String
        let title: String
        let phone: String
        let email: String
        let isSignatory: Bool

        private enum K: String, CodingKey { case id, name, title, phone, email, isSignatory }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id)
            name = c.string(.name)
            title = c.string(.title)
            phone = c.string(.phone)
            email = c.string(.email)
            isSignatory = c.bool(.isSignatory)
        }
    }

    struct Project: Decodable, Identifiable {
        let id: String
        let number: String
        let name: String
        let type: String
        let status: String
        let startDate: String
        let contractTotal: Int
        let archived: Bool
        let external: Bool

        private enum K: String, CodingKey { case id, number, name, type, status, startDate, contractTotal, archivedAt, external }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id)
            number = c.string(.number)
            name = c.string(.name)
            type = c.string(.type)
            status = c.string(.status)
            startDate = c.string(.startDate)
            contractTotal = c.int(.contractTotal)
            archived = c.optionalInt(.archivedAt) != nil
            external = c.bool(.external)
        }
    }

    let regNo: String
    let taxNo: String
    let address: String
    let website: String
    let notes: String
    let contacts: [Contact]
    let projects: [Project]

    private enum K: String, CodingKey { case client, contacts, projects }
    private enum C: String, CodingKey { case regNo, taxNo, address, website, notes }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let cl = try c.nestedContainer(keyedBy: C.self, forKey: .client)
        regNo = cl.string(.regNo)
        taxNo = cl.string(.taxNo)
        address = cl.string(.address)
        website = cl.string(.website)
        notes = cl.string(.notes)
        contacts = (try? c.decode([Contact].self, forKey: .contacts)) ?? []
        projects = (try? c.decode([Project].self, forKey: .projects)) ?? []
    }
}

// MARK: GET /api/clients/:id/statement (riyals → halalas)

struct Statement: Decodable {
    struct Line: Decodable, Identifiable {
        let id: String
        let number: String
        let name: String
        let status: String
        let contractNo: String
        let gross: Int
        let received: Int
        let owed: Int

        private enum K: String, CodingKey { case id, number, name, status, contractNo, gross, received, owed }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            id = c.string(.id)
            number = c.string(.number)
            name = c.string(.name)
            status = c.string(.status)
            contractNo = c.string(.contractNo)
            gross = c.halalasFromRiyals(.gross)
            received = c.halalasFromRiyals(.received)
            owed = c.halalasFromRiyals(.owed)
        }
    }

    let items: [Line]
    let gross: Int
    let received: Int
    let owed: Int

    private enum K: String, CodingKey { case items, totals }
    private enum T: String, CodingKey { case gross, received, owed }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        items = (try? c.decode([Line].self, forKey: .items)) ?? []
        let t = try c.nestedContainer(keyedBy: T.self, forKey: .totals)
        gross = t.halalasFromRiyals(.gross)
        received = t.halalasFromRiyals(.received)
        owed = t.halalasFromRiyals(.owed)
    }
}
