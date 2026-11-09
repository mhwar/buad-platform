import PhotosUI
import QuickLook
import SwiftUI
import UniformTypeIdentifiers
import VisionKit

/// «الفاتورة المرسلة (PDF أو صورة)» for the phone: scan it with the camera (VisionKit's document
/// scanner straightens and crops the page), pick a photo, or pick a PDF from Files. Images are
/// shrunk to JPEG under the server's 2 MB limit, then sent as raw bytes to POST /api/assets, the
/// website's own upload. The asset id is what the invoice keeps. «عرض المرفق» opens it in Quick Look.
struct AttachmentField: View {
    @Binding var assetId: String
    let canUpload: Bool
    /// True while a file is on its way: the form keeps «حفظ» off so nothing is saved without it.
    var uploading: Binding<Bool> = .constant(false)

    @State private var scanning = false
    @State private var picking = false
    @State private var importing = false
    @State private var photo: PhotosPickerItem?
    @State private var busy = false
    @State private var error: String?
    @State private var preview: URL?

    var body: some View {
        Group {
            if canUpload {
                Menu {
                    if VNDocumentCameraViewController.isSupported {
                        Button { scanning = true } label: { Label("تصوير بالكاميرا", systemImage: "doc.viewfinder") }
                    }
                    Button { picking = true } label: { Label("من الصور", systemImage: "photo") }
                    Button { importing = true } label: { Label("من الملفات (PDF)", systemImage: "folder") }
                } label: {
                    HStack {
                        Label(busy ? "جارٍ الرفع…" : assetId.isEmpty ? "رفع الملف" : "استبدال الملف",
                              systemImage: assetId.isEmpty ? "paperclip" : "arrow.triangle.2.circlepath")
                        Spacer()
                        if busy { ProgressView() }
                    }
                }
                .disabled(busy)
            }
            if !assetId.isEmpty {
                Button { Task { await open() } } label: {
                    Label("عرض المرفق", systemImage: "eye")
                }
                .disabled(busy)
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Buad.dangerInk) }
            if !canUpload && assetId.isEmpty {
                Text("رفع الملف يحتاج صلاحية «الملفات والشعارات».").font(.footnote).foregroundStyle(Buad.muted)
            }
        }
        .sheet(isPresented: $scanning) {
            DocumentScanner { image in
                scanning = false
                if let image { Task { await upload(image: image) } }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $picking, selection: $photo, matching: .images)
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await upload(image: image)
                }
                photo = nil
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .image]) { result in
            guard case .success(let url) = result else { return }
            Task { await upload(file: url) }
        }
        .quickLookPreview($preview)
    }

    private func upload(image: UIImage) async {
        guard let data = Self.jpeg(image, under: 2 * 1024 * 1024 - 32 * 1024) else {
            error = "تعذّر تجهيز الصورة."
            return
        }
        await send(data, type: "image/jpeg")
    }

    private func upload(file url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { error = "تعذّر قراءة الملف."; return }
        if UTType(filenameExtension: url.pathExtension)?.conforms(to: .pdf) == true {
            await send(data, type: "application/pdf")
        } else if let image = UIImage(data: data) {
            await upload(image: image)
        } else {
            error = APIError.rejected("unsupported_type").message
        }
    }

    private func send(_ data: Data, type: String) async {
        busy = true
        uploading.wrappedValue = true
        error = nil
        defer { busy = false; uploading.wrappedValue = false }
        do {
            assetId = try await APIClient.shared.uploadAsset(data, type: type)
            Haptic.success()
        } catch {
            self.error = (error as? APIError)?.message ?? "تعذّر رفع الملف."
        }
    }

    private func open() async {
        busy = true
        defer { busy = false }
        do {
            let data = try await APIClient.shared.assetData(assetId)
            let ext = data.starts(with: Array("%PDF".utf8)) ? "pdf" : "jpg"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("buad-\(assetId).\(ext)")
            try data.write(to: url, options: .atomic)
            preview = url
        } catch {
            self.error = (error as? APIError)?.message ?? "تعذّر فتح المرفق."
        }
    }

    /// A JPEG of at most `limit` bytes: scaled down to 2400 px on the long side, then lower quality.
    static func jpeg(_ image: UIImage, under limit: Int) -> Data? {
        var img = image
        let longSide = max(image.size.width, image.size.height)
        if longSide > 2400 {
            let scale = 2400 / longSide
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            img = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        }
        for quality in stride(from: 0.8, through: 0.3, by: -0.1) {
            if let d = img.jpegData(compressionQuality: quality), d.count <= limit { return d }
        }
        return nil
    }
}

/// VisionKit's document camera; answers the first scanned page (or nil when cancelled).
private struct DocumentScanner: UIViewControllerRepresentable {
    let done: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: (UIImage?) -> Void
        init(done: @escaping (UIImage?) -> Void) { self.done = done }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            done(scan.pageCount > 0 ? scan.imageOfPage(at: 0) : nil)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done(nil) }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done(nil) }
    }
}

/// Light haptic feedback for a saved write (a small touch of the improvements asked for each update).
enum Haptic {
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}
