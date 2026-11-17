"""Check full-bleed brand sources and actual compiled PNGs, including Apple CgBI."""
import hashlib
import json
import pathlib
import struct
import sys
import zlib


def read_png(path):
    data = pathlib.Path(path).read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a PNG')
    offset, payload, cgbi, header = 8, bytearray(), False, None
    while offset < len(data):
        length = struct.unpack_from('>I', data, offset)[0]
        kind = data[offset+4:offset+8]
        chunk = data[offset+8:offset+8+length]
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', chunk)
        elif kind == b'CgBI':
            cgbi = True
        elif kind == b'IDAT':
            payload.extend(chunk)
        offset += 12+length
    if header is None:
        raise ValueError('Missing PNG header')
    width, height, depth, colour, compression, filtering, interlace = header
    if depth != 8 or colour not in (2, 6) or interlace or compression or filtering or not (0 < width <= 2048 and 0 < height <= 2048):
        raise ValueError(f'Unsupported icon PNG: {header}')
    channels = 4 if colour == 6 else 3
    stride = width * channels
    raw = zlib.decompress(payload, -15 if cgbi else 15)
    if len(raw) != (stride+1)*height:
        raise ValueError('Incomplete icon PNG')
    previous, pixels = bytearray(stride), bytearray()
    for y in range(height):
        mode = raw[y*(stride+1)]
        row = bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        for x in range(stride):
            a = row[x-channels] if x >= channels else 0
            b = previous[x]
            c = previous[x-channels] if x >= channels else 0
            if mode == 0:
                predictor = 0
            elif mode == 1:
                predictor = a
            elif mode == 2:
                predictor = b
            elif mode == 3:
                predictor = (a+b)//2
            elif mode == 4:
                p = a+b-c
                distances = [abs(p-a), abs(p-b), abs(p-c)]
                predictor = [a,b,c][distances.index(min(distances))]
            else:
                raise ValueError('Invalid PNG filter')
            row[x] = (row[x]+predictor) & 255
        for x in range(0, stride, channels):
            r,g,b = row[x:x+3]
            alpha = row[x+3] if channels == 4 else 255
            if cgbi:
                r,b = b,r
                if 0 < alpha < 255:
                    r,g,b = [min(255, round(v*255/alpha)) for v in (r,g,b)]
            pixels.extend((r,g,b,alpha))
        previous = row
    return width, height, bytes(pixels)


def require_opaque(pixels, path):
    if any(pixels[index] != 255 for index in range(3,len(pixels),4)):
        raise ValueError(f'Brand icon contains transparency: {path.name}')


def brand_background():
    root = pathlib.Path(__file__).resolve().parents[1]
    manifest = json.loads((root/'public/app-icon.json').read_text())
    colour = manifest['bg_color']
    if len(colour) != 7 or colour[0] != '#':
        raise ValueError('Brand background must be #RRGGBB')
    return tuple(bytes.fromhex(colour[1:]))


def require_full_bleed(width, height, pixels, path, background):
    require_opaque(pixels,path)
    edge = set(range(width)) | set(range((height-1)*width,height*width))
    edge.update(y*width for y in range(height))
    edge.update(y*width+width-1 for y in range(height))
    # The supplied artwork has a subtly varying graphite surface. Permit its
    # small tonal range, but reject white mattes, borders and transparent rims.
    if any(abs(pixels[4*index+channel]-background[channel]) > 16 for index in edge for channel in range(3)):
        raise ValueError(f'Brand icon edge differs from full-bleed background: {path.name}')


def check_assets():
    root = pathlib.Path(__file__).resolve().parents[1]
    master = root/'public/app-icon.png'
    width,height,pixels = read_png(master)
    if width != height or width < 1024:
        raise ValueError('Brand master must be a square PNG of at least 1024px')
    background = brand_background()
    require_full_bleed(width,height,pixels,master,background)
    assets = list((root/'src-tauri/icons/ios').glob('*.png'))
    if not assets:
        raise ValueError('Missing iOS brand assets')
    assets.append(root/'src-tauri/icons/icon.png')
    for path in assets:
        w,h,pixels = read_png(path)
        require_full_bleed(w,h,pixels,path,background)
    print(json.dumps({'fullBleedBrandAssets':len(assets)+1,'background':background}))


def write_png(path, width, height, pixels, rgb=False):
    def chunk(kind, value):
        return struct.pack('>I',len(value))+kind+value+struct.pack('>I',zlib.crc32(kind+value))
    if rgb:
        pixels = bytes(value for index,value in enumerate(pixels) if index % 4 != 3)
    stride = width*(3 if rgb else 4)
    rows = b''.join(b'\0'+pixels[y*stride:(y+1)*stride] for y in range(height))
    pathlib.Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2 if rgb else 6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))


def prepare(catalog):
    files = list(pathlib.Path(catalog).glob('*.png'))
    if not files:
        raise ValueError('No AppIcon images to prepare')
    for path in files:
        width,height,pixels = read_png(path)
        require_full_bleed(width,height,pixels,path,brand_background())
        write_png(path,width,height,pixels,rgb=True)
        data = path.read_bytes()
        if data[data.index(b'IHDR')+13] != 2:
            raise ValueError('AppIcon must be RGB without an alpha channel')


def verify(app, sources, output):
    expected = {}
    for path in pathlib.Path(sources).glob('*.png'):
        w,h,pixels = read_png(path)
        require_opaque(pixels,path)
        expected.setdefault((w,h),[]).append((path.name,pixels))
    actual = sorted(p for p in pathlib.Path(app).glob('*.png') if p.name.lower().startswith('appicon'))
    if not actual:
        raise ValueError('No compiled primary AppIcon PNGs in application')
    checked = []
    for path in actual:
        w,h,pixels = read_png(path)
        if any(pixels[index] != 255 for index in range(3,len(pixels),4)):
            raise ValueError(f'Compiled app icon contains transparency: {path.name}')
        candidates = expected.get((w,h),[])
        if not candidates:
            raise ValueError(f'No brand source for compiled icon {path.name}: {w}x{h}')
        scores = [(sum(abs(a-b) for a,b in zip(pixels,reference))/len(pixels),name) for name,reference in candidates]
        error, source = min(scores)
        if error > 1:
            raise ValueError(f'Compiled app icon differs from brand source: {path.name}, mean error {error:.3f}')
        checked.append({'file':path.name,'source':source,'meanError':error,'pixelsSha256':hashlib.sha256(pixels).hexdigest()})
        if len(checked) == 1:
            write_png(output,w,h,pixels)
    print(json.dumps({'compiledBrandIcons':checked}))


if __name__ == '__main__':
    if sys.argv[1] == '--assets':
        check_assets()
    elif sys.argv[1] == '--prepare':
        prepare(sys.argv[2])
    else:
        verify(*sys.argv[1:])
