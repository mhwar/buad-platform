import Foundation
import LocalAuthentication
import SwiftUI

@MainActor
final class Session: ObservableObject {
    enum Phase: Equatable {
        case loading
        case signedOut
        case signedIn(Me)
    }

    @Published var phase: Phase = .loading
    @Published var locked = false
    @Published var notice: String?

    static let faceIDKey = "buad.faceid"

    var faceIDEnabled: Bool { UserDefaults.standard.bool(forKey: Self.faceIDKey) }

    var me: Me? {
        if case .signedIn(let user) = phase { return user }
        return nil
    }

    func bootstrap() async {
        guard AppConfig.apiBase != nil else {
            phase = .signedOut
            return
        }
        do {
            if let user = try await APIClient.shared.me() {
                phase = .signedIn(user)
                locked = faceIDEnabled
            } else {
                phase = .signedOut
            }
        } catch {
            notice = (error as? APIError)?.message
            phase = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        let user = try await APIClient.shared.signIn(email: email, password: password)
        notice = nil
        phase = .signedIn(user)
    }

    func signOut() async {
        await APIClient.shared.signOut()
        locked = false
        phase = .signedOut
    }

    /// Re-reads the signed-in user so a role or permission changed on the website applies here too.
    func refreshMe() async {
        guard me != nil else { return }
        if let user = try? await APIClient.shared.me() { phase = .signedIn(user) }
    }

    /// A 401 anywhere means the session ended (expired, password changed, account stopped on the website).
    func handle(_ error: Error) {
        if (error as? APIError) == .unauthorized {
            notice = APIError.unauthorized.message
            locked = false
            phase = .signedOut
        }
    }

    func lockIfNeeded() {
        if faceIDEnabled, me != nil { locked = true }
    }

    func unlock() async {
        let context = LAContext()
        var policyError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &policyError) else {
            locked = false
            return
        }
        if let ok = try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "افتح تطبيق بُعد"), ok {
            locked = false
        }
    }
}
