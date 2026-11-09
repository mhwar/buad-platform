import Foundation

// Same rules as v2/apps/web/src/lib/format.ts: money arrives in halalas, digits are Latin,
// dates are Gregorian with Arabic month names, and the day is the Riyadh day.

enum Fmt {
    static let riyadh = TimeZone(identifier: "Asia/Riyadh") ?? .current

    private static let number: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        return f
    }()

    /// «115,000 ر.س» for a whole amount, «33,333.33 ر.س» when there are halalas.
    static func sar(_ halalas: Int) -> String {
        "\(amount(halalas)) ر.س"
    }

    /// The number alone: «115,000», «33,333.33».
    static func amount(_ halalas: Int) -> String {
        number.string(from: NSNumber(value: Double(halalas) / 100)) ?? "0"
    }

    /// «+ 1,000 ر.س» / «− 1,000 ر.س» with the sign kept on the number's left in Arabic text.
    static func signed(_ halalas: Int, positive: Bool) -> String {
        "\(ltr((positive ? "+" : "−") + amount(abs(halalas)))) ر.س"
    }

    /// Keeps a left-to-right run (a project or quote code, a phone, an e-mail, a signed number)
    /// whole and in order inside Arabic text (Unicode left-to-right isolate).
    static func ltr(_ s: String) -> String { s.isEmpty ? s : "\u{2066}\(s)\u{2069}" }

    /// Arabic number agreement: 1 → «يوم واحد», 2 → «يومان», 3–10 → «3 أيام», 11+ (and 0) → «11 يوماً».
    static func count(_ n: Int, one: String, two: String, few: String, many: String) -> String {
        switch n {
        case 1: return one
        case 2: return two
        case 3...10: return "\(n) \(few)"
        default: return "\(n) \(many)"
        }
    }

    static func days(_ n: Int) -> String { count(n, one: "يوم واحد", two: "يومان", few: "أيام", many: "يوماً") }
    static func projects(_ n: Int) -> String { count(n, one: "مشروع واحد", two: "مشروعان", few: "مشاريع", many: "مشروعاً") }
    static func opportunities(_ n: Int) -> String { count(n, one: "فرصة واحدة", two: "فرصتان", few: "فرص", many: "فرصة") }
    static func instalments(_ n: Int) -> String { count(n, one: "دفعة واحدة", two: "دفعتان", few: "دفعات", many: "دفعة") }
    static func items(_ n: Int) -> String { count(n, one: "بند واحد", two: "بندان", few: "بنود", many: "بنداً") }

    /// «172.5 ألف», «1.20 مليون» for tight spaces.
    static func short(_ halalas: Int) -> String {
        if halalas < 0 { return "−" + short(-halalas) }
        let r = Double(halalas) / 100
        if r >= 1_000_000 { return String(format: "%.2f مليون", r / 1_000_000) }
        if r >= 1_000 {
            let k = (r / 100).rounded() / 10
            return "\(number.string(from: NSNumber(value: k)) ?? "0") ألف"
        }
        return number.string(from: NSNumber(value: r)) ?? "0"
    }

    static func percent(_ part: Int, of whole: Int) -> Int {
        guard whole > 0 else { return 0 }
        return Int((Double(part) / Double(whole) * 100).rounded())
    }

    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = riyadh
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func arabic(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "ar@numbers=latn")
        f.timeZone = riyadh
        f.dateFormat = format
        return f
    }

    private static let dayFormat = arabic("d MMMM yyyy")
    private static let dayMonthFormat = arabic("d MMMM")
    private static let longFormat = arabic("EEEE، d MMMM yyyy")

    static func date(_ isoDay: String) -> Date? { isoDay.isEmpty ? nil : iso.date(from: String(isoDay.prefix(10))) }

    /// "2026-03-01" → «1 مارس 2026»; empty stays empty.
    static func day(_ isoDay: String) -> String { date(isoDay).map { dayFormat.string(from: $0) } ?? "" }

    /// "2026-03-01" → «1 مارس».
    static func dayMonth(_ isoDay: String) -> String { date(isoDay).map { dayMonthFormat.string(from: $0) } ?? "" }

    /// Seconds since 1970 (the API's timestamps) → «1 مارس 2026», like the website's fromEpoch.
    static func epochDay(_ seconds: Int) -> String {
        seconds > 0 ? dayFormat.string(from: Date(timeIntervalSince1970: TimeInterval(seconds))) : ""
    }

    /// «12 س 30 د» from minutes.
    static func hours(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) س" : h == 0 ? "\(m) د" : "\(h) س \(m) د"
    }

    /// A day as the API stores it: "2026-03-01" (Riyadh).
    static func isoDay(_ date: Date) -> String { iso.string(from: date) }

    /// Today plus a number of days, as an ISO day.
    static func isoDay(addingDays days: Int) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        return isoDay(cal.date(byAdding: .day, value: days, to: Date()) ?? Date())
    }

    static var todayISO: String { iso.string(from: Date()) }

    static func longToday() -> String { longFormat.string(from: Date()) }

    static func greeting() -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        let h = cal.component(.hour, from: Date())
        return h < 12 ? "صباح الخير" : h < 18 ? "مساء الخير" : "مساء النور"
    }

    /// Whole days from today to the given day (negative when it has passed).
    static func daysUntil(_ isoDay: String) -> Int? {
        guard let target = date(isoDay), let today = date(todayISO) else { return nil }
        return Int((target.timeIntervalSince(today) / 86_400).rounded())
    }
}
