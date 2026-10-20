// Rasterises the SVG icons in assets/ into every PNG the app and extension need.
// Usage: python3 scripts/make-icon-svg.py && swift scripts/make-icons.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()
let assets = root.appendingPathComponent("assets")
let appIcons = root.appendingPathComponent("xcode/YouTube Debloat/Assets.xcassets/AppIcon.appiconset")
let appResources = root.appendingPathComponent("xcode/YouTube Debloat/Resources")
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

// App icon set: light is the default appearance, dark is the "-dark" variant (see Contents.json).
for (pt, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
    render("icon-light.svg", pt * scale, to: appIcons.appendingPathComponent("mac-icon-\(pt)@\(scale)x.png"))
    render("icon-dark.svg", pt * scale, to: appIcons.appendingPathComponent("mac-icon-\(pt)@\(scale)x-dark.png"))
}
// Container app window.
render("icon-light.svg", 256, to: appResources.appendingPathComponent("Icon.png"))
render("icon-dark.svg", 256, to: appResources.appendingPathComponent("Icon-dark.png"))
// Extension: Safari's extension list gets the light tile; the popup picks per colour scheme.
for size in [48, 128] {
    render("icon-extension-light.svg", size, to: extIcons.appendingPathComponent("icon-\(size).png"))
    render("icon-extension-dark.svg", size, to: extIcons.appendingPathComponent("icon-\(size)-dark.png"))
}
// Toolbar button: monochrome template glyph.
for size in [16, 19, 32, 38, 48, 72] {
    render("icon-toolbar.svg", size, to: extIcons.appendingPathComponent("toolbar-\(size).png"))
}
