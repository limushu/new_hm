import Foundation
import CoreGraphics
import ImageIO

// Encode a native screenshot as opaque PNG without resizing or changing its UI.
// App Store Connect rejects even fully opaque PNGs that retain an alpha channel.
guard CommandLine.arguments.count == 3 else { fatalError("Usage: export-store-png source destination") }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard let source = CGImageSourceCreateWithURL(input as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
      let context = CGContext(data: nil, width: image.width, height: image.height,
                              bitsPerComponent: 8, bytesPerRow: image.width * 4,
                              space: image.colorSpace ?? CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
  fatalError("Cannot decode screenshot")
}
context.setFillColor(CGColor(gray: 1, alpha: 1))
let bounds = CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height))
context.fill(bounds)
context.draw(image, in: bounds)
guard let opaque = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil) else {
  fatalError("Cannot encode opaque PNG")
}
CGImageDestinationAddImage(destination, opaque, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Cannot write PNG") }
let bytes = try Data(contentsOf: output)
guard bytes.count > 25 && bytes[25] == 2 else { fatalError("Output must be RGB PNG with no alpha channel") }
