import SwiftUI

/// The period chosen for a report: every period, a quarter or a whole year, with its year and quarter.
/// Used by «تحليلات المبيعات»; the finance overview has its own with the same wording.
struct PeriodBar: View {
    @Binding var period: FinancePeriod
    var reloading = false

    private var years: [Int] {
        let y = Calendar(identifier: .gregorian).component(.year, from: Date())
        return Array((y - 4...y).reversed())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Menu {
                    Picker("الفترة", selection: $period.preset) {
                        Text("كل الفترات").tag(FinancePeriod.Preset.all)
                        Text("ربع سنة").tag(FinancePeriod.Preset.quarter)
                        Text("سنة كاملة").tag(FinancePeriod.Preset.year)
                    }
                } label: { chip(period.preset == .all ? "كل الفترات" : period.preset == .quarter ? "ربع سنة" : "سنة كاملة") }
                if period.preset != .all {
                    Menu {
                        Picker("السنة", selection: $period.year) {
                            ForEach(years, id: \.self) { Text(String($0)).tag($0) }
                        }
                    } label: { chip(String(period.year)) }
                }
                Spacer(minLength: 0)
                if reloading { ProgressView().controlSize(.small) }
            }
            if period.preset == .quarter {
                Picker("الربع", selection: $period.quarter) {
                    ForEach(1...4, id: \.self) { Text("ر\($0)").tag($0) }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private func chip(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text).font(.subheadline.weight(.medium))
            Image(systemName: "chevron.down").font(.caption2.weight(.bold))
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(Buad.surface, in: Capsule())
        .foregroundStyle(Buad.ink)
    }
}
