import SwiftUI
import UIKit

/// The same top bar and safety for every form sheet (entry, receipt, instalment, invoice, contact):
///  · «إلغاء» asks «تجاهل التغييرات؟» when something was typed, and a swipe down cannot drop it;
///  · the save action sits in the top bar, so the keyboard never covers it;
///  · «تم» above the keyboard closes it (the number pad has no return key).
private struct FormChrome: ViewModifier {
    let dirty: Bool
    let busy: Bool
    let saveTitle: String
    let save: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var asking = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { if dirty { asking = true } else { dismiss() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saveTitle, action: save).bold().disabled(busy)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("تم") {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                    .bold()
                }
            }
            .interactiveDismissDisabled(busy || dirty)
            .confirmationDialog("تجاهل التغييرات؟", isPresented: $asking, titleVisibility: .visible) {
                Button("تجاهل التغييرات", role: .destructive) { dismiss() }
                Button("متابعة التعديل", role: .cancel) {}
            } message: {
                Text("ما كتبته في هذا النموذج لن يُحفظ.")
            }
    }
}

extension View {
    func formChrome(dirty: Bool, busy: Bool, saveTitle: String, save: @escaping () -> Void) -> some View {
        modifier(FormChrome(dirty: dirty, busy: busy, saveTitle: saveTitle, save: save))
    }
}
