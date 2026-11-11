import Foundation

/// What each finance and sales section last showed. Switching between «النظرة العامة» / «التحصيل» /
/// «الضريبة» or «الفرص» / «اللوحة» rebuilds the section; reading from here keeps its period, filters
/// and figures on screen at once, and the section refreshes quietly behind them.
/// In memory only, and cleared when the person signs out, so nothing outlives the session.
enum ScreenMemory {
    static var overviewPeriod = FinancePeriod()
    static var overview: (period: FinancePeriod, data: FinanceOverview, prev: FinanceOverview?)?

    static var vatYear = Calendar(identifier: .gregorian).component(.year, from: Date())
    static var vatQuarter = 0
    static var vat: (year: Int, quarter: Int, report: VatReport, yearData: VatYear)?

    static var receivables: Receivables?

    static var salesStage = "open"
    static var salesDueOnly = false
    static var salesOwner = ""
    static var salesSource = ""
    static var salesService = ""
    static var opportunities: [Opportunity]?
    static var salesOverview: SalesOverview?
    static var quotes: [SalesQuote]?
    static var salesPart = 0

    static func clear() {
        overviewPeriod = FinancePeriod()
        overview = nil
        vatYear = Calendar(identifier: .gregorian).component(.year, from: Date())
        vatQuarter = 0
        vat = nil
        receivables = nil
        salesStage = "open"
        salesDueOnly = false
        salesOwner = ""
        salesSource = ""
        salesService = ""
        opportunities = nil
        salesOverview = nil
        quotes = nil
        salesPart = 0
    }
}
