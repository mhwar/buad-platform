import SwiftUI

/// The app's floating dock: a glass capsule above the home indicator with the four main sections.
///  · The active section sits on a soft accent pill that slides between tabs, with the filled symbol
///    and its name in bold; the others are quiet outlines.
///  · Each tap gives a light selection tick; the symbol bounces once.
///  · On iOS 26 it is Liquid Glass; earlier, an ultra-thin material with a hairline and soft shadow.
///  · It stays put when the keyboard opens and leaves room under every screen's content.
/// Nothing is created from here: each screen has its own «+» for what belongs to it.
struct Dock: View {
    struct Item: Identifiable, Equatable {
        let id: MainTabs.Tab
        let title: String
        let icon: String
    }

    let items: [Item]
    @Binding var selection: MainTabs.Tab
    /// Every tap, even on the section already open: it goes back to that section's first page.
    var onTap: (MainTabs.Tab) -> Void = { _ in }

    @Namespace private var pill
    @State private var bounce: MainTabs.Tab?

    static let height: CGFloat = 62

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items) { tab($0) }
        }
        .padding(.horizontal, 6)
        .frame(height: Self.height)
        .modifier(DockSurface())
        .padding(.horizontal, items.count <= 3 ? 48 : 22)
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func tab(_ item: Item) -> some View {
        let on = selection == item.id
        return Button {
            if !on { bounce = item.id }
            onTap(item.id)
            withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) { selection = item.id }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: on ? item.icon + ".fill" : item.icon)
                    .font(.system(size: 19, weight: on ? .semibold : .regular))
                    .symbolEffect(.bounce.down, value: bounce == item.id)
                    .frame(height: 24)
                Text(item.title)
                    .font(.system(size: 10.5, weight: on ? .bold : .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? Buad.accentInk : Buad.muted)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background {
                if on {
                    Capsule().fill(Buad.accentSoft)
                        .matchedGeometryEffect(id: "pill", in: pill)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(PressScale())
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}

/// Liquid Glass on iOS 26, material with a hairline and shadow before it.
private struct DockSurface: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: Capsule())
        } else {
            content
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().strokeBorder(Buad.line.opacity(0.9), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
        }
    }
}

/// A gentle press: shrinks a little while held.
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
