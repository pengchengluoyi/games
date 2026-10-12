import Foundation

enum LocalProgress {
    private static let storageKey = "hi3d-gem-garden-native-progress-v1"
    private static let allowedKeys: Set<String> = [
        "hi3d-gem-garden-save-v1",
        "hi3d-gem-garden-best-v1",
        "hi3d-gem-garden-settings-v1",
        "hi3d-gem-garden-levels-v2",
        "hi3d-gem-garden-lives-v3",
        "hi3d-gem-garden-retired-relax-v3"
    ]

    static func seedJSON() -> String {
        let values = UserDefaults.standard.dictionary(forKey: storageKey) as? [String: String] ?? [:]
        guard let data = try? JSONSerialization.data(withJSONObject: values, options: [.fragmentsAllowed, .sortedKeys]),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json.replacingOccurrences(of: "<", with: "\\u003c")
    }

    static func set(_ value: String, for key: String) {
        guard allowedKeys.contains(key), value.utf8.count < 250_000 else { return }
        var values = UserDefaults.standard.dictionary(forKey: storageKey) as? [String: String] ?? [:]
        values[key] = value
        UserDefaults.standard.set(values, forKey: storageKey)
    }

    static func remove(_ key: String) {
        guard allowedKeys.contains(key) else { return }
        var values = UserDefaults.standard.dictionary(forKey: storageKey) as? [String: String] ?? [:]
        values.removeValue(forKey: key)
        UserDefaults.standard.set(values, forKey: storageKey)
    }
}
