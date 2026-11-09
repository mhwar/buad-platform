import Foundation
import LocalAuthentication

/// Face ID (or the device passcode) before a financial write, as the plan sets for sensitive actions.
/// It is a local check on top of the server's: the server still decides by the role's permissions.
/// A device with no passcode at all cannot ask, so the write goes ahead on the server's check alone.
enum Confirm {
    static func owner(_ reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}
