"""Verify actual compiled PNGs, including Apple's CgBI optimization, against HM assets."""
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


def write_png(path, width, height, pixels):
    def chunk(kind, value):
        return struct.pack('>I',len(value))+kind+value+struct.pack('>I',zlib.crc32(kind+value))
    rows = b''.join(b'\0'+pixels[y*width*4:(y+1)*width*4] for y in range(height))
    pathlib.Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))


def verify(app, sources, output):
    expected = {}
    for path in pathlib.Path(sources).glob('*.png'):
        w,h,pixels = read_png(path)
        expected.setdefault((w,h),[]).append((path.name,pixels))
    actual = sorted(p for p in pathlib.Path(app).glob('*.png') if p.name.lower().startswith('appicon'))
    if not actual:
        raise ValueError('No compiled primary AppIcon PNGs in application')
    checked = []
    for path in actual:
        w,h,pixels = read_png(path)
        candidates = expected.get((w,h),[])
        if not candidates:
            raise ValueError(f'No HM source for compiled icon {path.name}: {w}x{h}')
        scores = [(sum(abs(a-b) for a,b in zip(pixels,reference))/len(pixels),name) for name,reference in candidates]
        error, source = min(scores)
        if error > 1:
            raise ValueError(f'Compiled app icon differs from HM branding: {path.name}, mean error {error:.3f}')
        checked.append({'file':path.name,'source':source,'meanError':error,'pixelsSha256':hashlib.sha256(pixels).hexdigest()})
        if len(checked) == 1:
            write_png(output,w,h,pixels)
    print(json.dumps({'compiledHMIcons':checked}))


if __name__ == '__main__':
    verify(*sys.argv[1:])
