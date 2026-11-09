import SwiftUI
import UIKit

// Tokens copied from v2/docs/ios/prototype.html (which takes them from v2/apps/web/src/index.css),
// so the app reads as بُعد in light and dark.

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

enum Buad {
    static let canvas = Color(light: 0xF2F1EE, dark: 0x0B0B0B)
    static let surface = Color(light: 0xFFFFFF, dark: 0x1C1C1B)
    static let surface2 = Color(light: 0xF8F7F5, dark: 0x232322)
    static let ink = Color(light: 0x171717, dark: 0xF2F2F2)
    static let onInk = Color(light: 0xFFFFFF, dark: 0x0B0B0B)
    static let muted = Color(light: 0x6B6862, dark: 0xA8A6A2)
    static let faint = Color(light: 0xA19D96, dark: 0x74716B)
    static let line = Color(light: 0xE7E4DF, dark: 0x2E2D2B)
    static let brandSoft = Color(light: 0xEEECE8, dark: 0x2A2928)
    static let accent = Color(light: 0xF5A524, dark: 0xF5A524)
    static let accentSoft = Color(light: 0xFDF0D9, dark: 0x3A2A10)
    static let accentInk = Color(light: 0x9A5800, dark: 0xF7B955)
    static let success = Color(light: 0x16A34A, dark: 0x22C55E)
    static let successSoft = Color(light: 0xE9F9EF, dark: 0x0F2A1A)
    static let successInk = Color(light: 0x157F3C, dark: 0x4ADE80)
    static let warningSoft = Color(light: 0xFFF5E1, dark: 0x2E2108)
    static let warningInk = Color(light: 0x9A5800, dark: 0xFBBF24)
    static let dangerSoft = Color(light: 0xFDEEEE, dark: 0x2C1212)
    static let dangerInk = Color(light: 0xB91C1C, dark: 0xF87171)
    static let infoSoft = Color(light: 0xEAF2FC, dark: 0x11233A)
    static let infoInk = Color(light: 0x1D5FAE, dark: 0x7FB4F0)
    static let logo = Color(light: 0x00197D, dark: 0xF2F2F2)

    static let gutter: CGFloat = 16
    static let radius: CGFloat = 16
    static let control: CGFloat = 12
    /// Small inner corners: pills, icon tiles, buttons inside rows.
    static let small: CGFloat = 8
    /// The smallest comfortable tap target (Apple HIG).
    static let tap: CGFloat = 44
}

enum Tone {
    case neutral, ok, warn, bad, info, accent

    var background: Color {
        switch self {
        case .neutral: return Buad.brandSoft
        case .ok: return Buad.successSoft
        case .warn: return Buad.warningSoft
        case .bad: return Buad.dangerSoft
        case .info: return Buad.infoSoft
        case .accent: return Buad.accentSoft
        }
    }

    var foreground: Color {
        switch self {
        case .neutral: return Buad.muted
        case .ok: return Buad.successInk
        case .warn: return Buad.warningInk
        case .bad: return Buad.dangerInk
        case .info: return Buad.infoInk
        case .accent: return Buad.accentInk
        }
    }
}

struct Pill: View {
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .frame(minHeight: 22)
            .background(tone.background, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .foregroundStyle(tone.foreground)
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
    }
}

struct ProgressBar: View {
    let value: Double
    var color: Color = Buad.accent

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Buad.brandSoft)
                Capsule().fill(color).frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 6)
        .environment(\.layoutDirection, .rightToLeft)
        .accessibilityElement()
        .accessibilityValue("\(Int((max(0, min(1, value)) * 100).rounded()))٪")
    }
}

/// The trailing hint that a row opens something (mirrors itself in right-to-left).
struct Chevron: View {
    var body: some View {
        Image(systemName: "chevron.forward")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Buad.faint)
            .accessibilityHidden(true)
    }
}

// MARK: - Joined tiles

/// Tiles that touch with a hairline between them (pulse, finance strip, dashboards). Use inside
/// `JoinedGrid` rows: every cell fills its row, so a short cell never shows the line colour as a band.
extension View {
    func joinedCell(minHeight: CGFloat = 64) -> some View {
        frame(maxWidth: .infinity, minHeight: minHeight, maxHeight: .infinity, alignment: .topLeading)
            .padding(12)
            .background(Buad.surface)
            .accessibilityElement(children: .combine)
    }
}

struct JoinedGrid<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        Grid(horizontalSpacing: 1, verticalSpacing: 1) { content }
            .background(Buad.line)
            .clipShape(RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
    }
}

// MARK: - Toast

/// A short confirmation that floats above the bottom edge, where the user is looking, with an
/// optional «تراجع». It gives a light haptic and clears itself (longer when it can be undone).
struct ToastItem: Identifiable, Equatable {
    let id = UUID()
    let text: String
    var undo: (@MainActor () async -> Void)? = nil

    static func == (a: ToastItem, b: ToastItem) -> Bool { a.id == b.id }
}

private struct ToastHost: ViewModifier {
    @Binding var item: ToastItem?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let t = item {
                    HStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Buad.success)
                        Text(t.text).font(.subheadline.weight(.medium)).multilineTextAlignment(.leading)
                        Spacer(minLength: 4)
                        if let undo = t.undo {
                            Button {
                                item = nil
                                Task { await undo() }
                            } label: {
                                Text("تراجع").font(.subheadline.weight(.bold))
                                    .frame(minWidth: Buad.tap, minHeight: Buad.tap)
                            }
                            .foregroundStyle(Buad.accent)
                        }
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 52)
                    .background(Buad.ink, in: RoundedRectangle(cornerRadius: Buad.control, style: .continuous))
                    .foregroundStyle(Buad.onInk)
                    .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
                    .padding(.horizontal, Buad.gutter)
                    .padding(.bottom, 10)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .id(t.id)
                    .accessibilityAddTraits(.isStaticText)
                }
            }
            .animation(.spring(duration: 0.3), value: item)
            .onChange(of: item) { _, now in
                guard let now else { return }
                Haptic.success()
                UIAccessibility.post(notification: .announcement, argument: now.text)
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(now.undo == nil ? 3.5 : 6))
                    if item == now { item = nil }
                }
            }
    }
}

extension View {
    func toast(_ item: Binding<ToastItem?>) -> some View { modifier(ToastHost(item: item)) }
}

struct EmptyNote: View {
    let text: String
    var icon: String = "tray"

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title2).foregroundStyle(Buad.faint)
            Text(text).font(.subheadline).foregroundStyle(Buad.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
        .background(Buad.surface, in: RoundedRectangle(cornerRadius: Buad.radius, style: .continuous))
    }
}
