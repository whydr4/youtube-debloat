// Rasterises the SVG icons in assets/ into every PNG the app and extension need.
// Usage: swift scripts/make-icons.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()
let assets = root.appendingPathComponent("assets")
let appIcons = root.appendingPathComponent("xcode/YouTube Debloat/Assets.xcassets/AppIcon.appiconset")
let extIcons = root.appendingPathComponent("extension/icons")

func render(_ svg: String, _ size: Int, to path: URL) {
    guard let image = NSImage(contentsOf: assets.appendingPathComponent(svg)) else {
        fatalError("cannot load \(svg)")
    }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: path)
    print("✔ \(path.lastPathComponent) (\(size)px)")
}

for (pt, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
    render("icon.svg", pt * scale, to: appIcons.appendingPathComponent("mac-icon-\(pt)@\(scale)x.png"))
}
render("icon.svg", 128, to: root.appendingPathComponent("xcode/YouTube Debloat/Resources/Icon.png"))
for size in [48, 128] {
    render("icon-extension.svg", size, to: extIcons.appendingPathComponent("icon-\(size).png"))
}
for size in [16, 19, 32, 38, 48, 72] {
    render("icon-toolbar.svg", size, to: extIcons.appendingPathComponent("toolbar-\(size).png"))
}
