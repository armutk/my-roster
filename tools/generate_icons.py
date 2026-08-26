"""Generate simple flat app icons (medical cross on rounded teal square) with no dependencies."""
import struct
import zlib
import os

TEAL = (13, 121, 116)      # #0d7974
TEAL_DARK = (8, 84, 82)    # subtle bottom shade
WHITE = (255, 255, 255)

def rounded_square_mask(x, y, size, radius):
    # returns True if pixel (x,y) is inside a rounded square of given size/radius
    cx = [radius, size - radius - 1]
    cy = [radius, size - radius - 1]
    inside_core_x = radius <= x <= size - radius - 1
    inside_core_y = radius <= y <= size - radius - 1
    if inside_core_x or inside_core_y:
        return 0 <= x < size and 0 <= y < size
    # check nearest corner circle
    nx = cx[0] if x < size / 2 else cx[1]
    ny = cy[0] if y < size / 2 else cy[1]
    dx, dy = x - nx, y - ny
    return dx * dx + dy * dy <= radius * radius

def cross_mask(x, y, size):
    # medical plus centered, arm thickness ~0.22*size, arm length ~0.62*size
    c = size / 2
    thickness = size * 0.20
    length = size * 0.58
    in_vertical = (c - thickness / 2 <= x <= c + thickness / 2) and (c - length / 2 <= y <= c + length / 2)
    in_horizontal = (c - length / 2 <= x <= c + length / 2) and (c - thickness / 2 <= y <= c + thickness / 2)
    return in_vertical or in_horizontal

def make_icon(size, radius_ratio=0.22, maskable=False):
    radius = int(size * radius_ratio)
    pixels = bytearray()
    pad = int(size * 0.14) if maskable else 0  # safe zone padding for maskable icons
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if maskable:
                inside = 0 <= x < size and 0 <= y < size
            else:
                inside = rounded_square_mask(x, y, size, radius)
            if not inside:
                row += bytes((0, 0, 0, 0))
                continue
            t = y / size
            r = int(TEAL[0] + (TEAL_DARK[0] - TEAL[0]) * t)
            g = int(TEAL[1] + (TEAL_DARK[1] - TEAL[1]) * t)
            b = int(TEAL[2] + (TEAL_DARK[2] - TEAL[2]) * t)
            cx, cy = x, y
            if maskable:
                # shrink cross into safe zone
                scale = (size - 2 * pad) / size
                cx = pad + x * 0 + (x - size/2) * scale + size/2 - pad
                cy = pad + (y - size/2) * scale + size/2 - pad
                effective_size = size - 2 * pad
                if cross_mask(cx, cy, effective_size):
                    r, g, b = WHITE
            else:
                if cross_mask(x, y, size):
                    r, g, b = WHITE
            row += bytes((r, g, b, 255))
        pixels += row
    return pixels

def write_png(path, size, pixels):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    idat = zlib.compress(bytes(raw), 9)
    with open(path, 'wb') as f:
        f.write(sig)
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))

def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    targets = [
        ('icon-192.png', 192, 0.22, False),
        ('icon-512.png', 512, 0.22, False),
        ('icon-maskable-512.png', 512, 0.0, True),
        ('apple-touch-icon.png', 180, 0.22, False),
        ('favicon-32.png', 32, 0.22, False),
        ('favicon-16.png', 16, 0.22, False),
    ]
    for name, size, radius_ratio, maskable in targets:
        pixels = make_icon(size, radius_ratio=radius_ratio, maskable=maskable)
        write_png(os.path.join(out_dir, name), size, pixels)
        print(f'wrote {name} ({size}x{size})')

if __name__ == '__main__':
    main()
