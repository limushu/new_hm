import Foundation
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

private struct PickOptions: Decodable {
  let title: String
  let multiple: Bool
  let directory: String
}
private struct ExportOptions: Decodable { let title: String; let path: String }
private struct DocumentReply: Encodable {
  var cancelled: Bool?
  var error: String?
  var documents: [[String: String]]?
}

final class DocumentsPlugin: Plugin, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private weak var webview: WKWebView?
  private var pending: Invoke?
  private var directory: URL?
  private var processing = false
  private var picker: UIDocumentPickerViewController?

  override func load(webview: WKWebView) { self.webview = webview }

  private func present(_ picker: UIDocumentPickerViewController, invoke: Invoke, directory: URL?) {
    guard pending == nil else { invoke.resolve(["error": "document_picker_busy"]); return }
    let window = webview?.window ?? UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.isKeyWindow }
    guard let window = window, window.windowScene?.activationState == .foregroundActive,
          var controller = window.rootViewController else {
      invoke.resolve(["error": "document_requires_foreground"]); return
    }
    while let next = controller.presentedViewController { controller = next }
    guard !controller.isBeingDismissed, !controller.isBeingPresented else {
      invoke.resolve(["error": "document_picker_busy"]); return
    }
    self.pending = invoke
    self.directory = directory
    self.picker = picker
    picker.delegate = self
    controller.present(picker, animated: true)
    picker.presentationController?.delegate = self
  }

  @objc func pick(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(PickOptions.self)
    DispatchQueue.main.async {
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: false)
      picker.allowsMultipleSelection = options.multiple
      picker.title = options.title
      self.present(picker, invoke: invoke, directory: URL(fileURLWithPath: options.directory, isDirectory: true))
    }
  }

  @objc func exportFile(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(ExportOptions.self)
    DispatchQueue.main.async {
      let picker = UIDocumentPickerViewController(forExporting: [URL(fileURLWithPath: options.path)], asCopy: true)
      picker.title = options.title
      self.present(picker, invoke: invoke, directory: nil)
    }
  }

  private func complete(cancelled: Bool? = nil, error: String? = nil, documents: [[String: String]]? = nil) {
    let invoke = pending
    pending = nil
    directory = nil
    picker = nil
    processing = false
    invoke?.resolve(DocumentReply(cancelled: cancelled, error: error, documents: documents))
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    guard controller === picker, !processing else { return }
    complete(cancelled: true)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === picker, !processing else { return }
    complete(cancelled: true)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard controller === picker, !processing else { return }
    guard let directory = directory else { complete(cancelled: false); return }
    guard urls.count <= 500 else { complete(error: "import_limit_exceeded"); return }
    processing = true
    DispatchQueue.global(qos: .userInitiated).async {
      let documents = stageDocuments(urls, into: directory)
      DispatchQueue.main.async { self.complete(documents: documents) }
    }
  }
}

@_cdecl("init_plugin_hm_documents")
func initDocumentsPlugin() -> Plugin { DocumentsPlugin() }
