import SwiftUI

@main
struct BuadApp: App {
    @StateObject private var session = Session()
    @AppStorage("buad.theme") private var theme = "system"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar@numbers=latn"))
                .preferredColorScheme(theme == "light" ? .light : theme == "dark" ? .dark : nil)
                .tint(Buad.accentInk)
                .task { await session.bootstrap() }
        }
    }
}
