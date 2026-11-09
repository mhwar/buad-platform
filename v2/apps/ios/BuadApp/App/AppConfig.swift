import Foundation

enum AppConfig {
    static var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }
    static var build: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0" }

    /// Set per build configuration (BUAD_API_BASE in project.yml / the Xcode project). Empty means the
    /// sign-in screen asks for the platform's address and keeps it on this device.
    private static var bundledBase: String {
        ((Bundle.main.object(forInfoDictionaryKey: "BuadAPIBase") as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static let storedKey = "buad.apiBase"

    static var needsServerEntry: Bool { bundledBase.isEmpty }

    static var storedServer: String { UserDefaults.standard.string(forKey: storedKey) ?? "" }

    static var apiBase: URL? {
        let raw = bundledBase.isEmpty ? storedServer : bundledBase
        guard let url = URL(string: raw), url.scheme == "https", url.host != nil else { return nil }
        return url
    }

    /// Accepts «buad.example.sa» or a full https address; refuses anything that is not https.
    @discardableResult
    static func setServer(_ input: String) -> Bool {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return false }
        if !s.contains("://") { s = "https://\(s)" }
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.scheme == "https", let host = url.host, host.contains(".") else { return false }
        UserDefaults.standard.set("https://\(host)\(url.port.map { ":\($0)" } ?? "")", forKey: storedKey)
        return true
    }

    static var serverHost: String { apiBase?.host ?? "—" }
}
