import Foundation
import Security

/// Credentials cannot sync via iCloud Keychain or migrate to another device.
final class IdentityCredentials {
  private let service: String
  init(service: String = "com.limushu.hm.identity") { self.service = service }
  private func query(_ project: String) throws -> [String: Any] {
    guard project.range(of: "^[a-z0-9]{20}$", options: .regularExpression) != nil else {
      throw NSError(domain: "identity_configuration_invalid", code: 0)
    }
    return [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: project,
            kSecAttrSynchronizable as String: false]
  }
  func load(_ project: String) throws -> String? {
    var search = try query(project)
    search[kSecReturnData as String] = true
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(search as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = item as? Data, data.count <= 65536,
          let credential = String(data: data, encoding: .utf8) else {
      throw NSError(domain: "identity_secure_storage_failed", code: 0)
    }
    return credential
  }
  func save(_ project: String, credential: String?) throws {
    var search = try query(project)
    guard let credential = credential else {
      let status = SecItemDelete(search as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else { throw NSError(domain: "identity_secure_storage_failed", code: 0) }
      return
    }
    guard let data = credential.data(using: .utf8), data.count <= 65536, !data.isEmpty else {
      throw NSError(domain: "identity_session_invalid", code: 0)
    }
    let attributes: [String: Any] = [kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    var status = SecItemUpdate(search as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      for (key, value) in attributes { search[key] = value }
      status = SecItemAdd(search as CFDictionary, nil)
    }
    guard status == errSecSuccess else { throw NSError(domain: "identity_secure_storage_failed", code: 0) }
  }
}
