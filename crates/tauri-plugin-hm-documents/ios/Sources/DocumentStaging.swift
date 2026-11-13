import Foundation

/// Coordinates provider access (including iCloud downloads) off the UI thread.
/// Only completed private copies are handed to Rust; the provider grant is then
/// released. A failed item does not discard other selected documents.
func stageDocuments(_ urls: [URL], into directory: URL) -> [[String: String]] {
  urls.map { source in
    let name = source.lastPathComponent
    let granted = source.startAccessingSecurityScopedResource()
    defer { if granted { source.stopAccessingSecurityScopedResource() } }
    let file = UUID().uuidString
    let destination = directory.appendingPathComponent(file)
    var issue: String?
    var coordinatedError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinatedError) { url in
      do {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey])
        guard values.isRegularFile == true else { issue = "document_not_file"; return }
        try FileManager.default.copyItem(at: url, to: destination)
      } catch {
        let error = error as NSError
        issue = error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoPermissionError
          ? "permission_denied" : "document_read_failed"
      }
    }
    if coordinatedError != nil { issue = "document_read_failed" }
    if let issue = issue {
      try? FileManager.default.removeItem(at: destination)
      return ["name": name, "error": issue]
    }
    guard FileManager.default.fileExists(atPath: destination.path) else {
      return ["name": name, "error": "document_read_failed"]
    }
    return ["name": name, "file": file]
  }
}
