import LocalAuthentication
import SafariServices
import SwiftUI

/// The device's own way of unlocking (Face ID, Touch ID or the passcode), named as the device has it.
enum Biometry {
    static var kind: LABiometryType {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        return context.biometryType
    }

    static var name: String {
        switch kind {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "رمز الجهاز"
        }
    }

    static var icon: String {
        switch kind {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        default: return "lock.open"
        }
    }

    static var unlockTitle: String { "افتح بـ \(name)" }
}

/// Safari inside the app, for the pages that still live on the website.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.dismissButtonStyle = .close
        vc.preferredControlTintColor = UIColor(Buad.accentInk)
        return vc
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
