import AppKit
import Foundation
import WidgetKit

private let appGroupIdentifier = "99564YDV39.com.idvault.shared"
private let widgetKind = "com.idvault.desktop.quick-access"
private let snapshotName = "widget-snapshot.json"
private let maximumSnapshotSize = 1_048_576
private let maximumCopySize = 4_096

private struct RevisionEnvelope: Decodable {
    let version: Int
    let revision: String
}

let data = FileHandle.standardInput.readDataToEndOfFile()

if CommandLine.arguments.dropFirst().first == "--copy" {
    guard
        !data.isEmpty,
        data.count <= maximumCopySize,
        let value = String(data: data, encoding: .utf8),
        !value.isEmpty
    else {
        FileHandle.standardError.write(Data("Invalid clipboard value.\n".utf8))
        exit(2)
    }
    let pasteboard = NSPasteboard.general
    pasteboard.prepareForNewContents(with: .currentHostOnly)
    guard pasteboard.setString(value, forType: .string) else {
        FileHandle.standardError.write(Data("The value could not be copied.\n".utf8))
        exit(1)
    }
    exit(0)
}

guard !data.isEmpty, data.count <= maximumSnapshotSize else {
    FileHandle.standardError.write(Data("Invalid widget snapshot.\n".utf8))
    exit(2)
}

do {
    let incoming = try JSONDecoder().decode(RevisionEnvelope.self, from: data)
    guard incoming.version == 1, !incoming.revision.isEmpty, incoming.revision.count <= 128 else {
        throw CocoaError(.fileReadCorruptFile)
    }
    guard let root = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else {
        throw CocoaError(.fileNoSuchFile)
    }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let target = root.appendingPathComponent(snapshotName)
    if
        let currentData = try? Data(contentsOf: target),
        let current = try? JSONDecoder().decode(RevisionEnvelope.self, from: currentData),
        current.revision == incoming.revision
    {
        exit(0)
    }
    try data.write(to: target, options: .atomic)
    try FileManager.default.setAttributes(
        [.posixPermissions: 0o600],
        ofItemAtPath: target.path
    )
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
