import SwiftUI

/// The app's floating dock: a glass capsule above the home indicator with the main sections and,
/// in the middle, «+» for whatever the role may create (opportunity, offer, client).
///  · The active section sits on a soft accent pill that slides between tabs, with the filled symbol.
///  · Each tap gives a light selection tick; the symbol bounces once.
///  · On iOS 26 it is Liquid Glass; earlier, an ultra-thin material with a hairline and soft shadow.
///  · It stays put when the keyboard opens and leaves room under every screen's content.
struct Dock: View {
    struct Item: Identifiable, Equatable {
        let id: MainTabs.Tab
        let title: String
        let icon: String
    }

    let items: [Item]
    @Binding var selection: MainTabs.Tab
    /// nil hides the centre button (nothing this role can create).
    let create: (() -> Void)?

    @Namespace private var pill
    @State private var bounce: MainTabs.Tab?
    @State private var creates = 0

    static let height: CGFloat = 64

    var body: some View {
        HStack(spacing: 2) {
            let half = (items.count + 1) / 2
            ForEach(items.prefix(create == nil ? items.count : half)) { tab($0) }
            if let create {
                Button { creates += 1; create() } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Buad.onInk)
                        .frame(width: 50, height: 50)
                        .background(
                            Circle().fill(Buad.ink)
                                .shadow(color: Buad.ink.opacity(0.25), radius: 8, y: 4)
                        )
                        .overlay(Circle().stroke(Buad.accent.opacity(0.9), lineWidth: 2).padding(-3))
                        .contentShape(Circle())
                }
                .buttonStyle(PressScale())
                .padding(.horizontal, 6)
                .accessibilityLabel("إنشاء")
                .accessibilityHint("فرصة أو عرض سعر أو عميل")
                .sensoryFeedback(.impact(weight: .medium), trigger: creates)
                ForEach(items.suffix(items.count - half)) { tab($0) }
            }
        }
        .padding(.horizontal, 7)
        .frame(height: Self.height)
        .modifier(DockSurface())
        .padding(.horizontal, 14)
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func tab(_ item: Item) -> some View {
        let on = selection == item.id
        return Button {
            if !on { bounce = item.id }
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
