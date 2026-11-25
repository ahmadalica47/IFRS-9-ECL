"""Draws the app icon (teal tile with three rising bars) as PNG without extra libraries."""
import struct, zlib, os
def png(path, n):
    rad = n * 0.22; px = []
    bars = [(0.22, 0.58), (0.42, 0.44), (0.62, 0.28)]  # (x start, top) as fraction of size; width 0.16, bottom 0.76
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            # rounded-square mask
            cx = min(max(x, rad), n - 1 - rad); cy = min(max(y, rad), n - 1 - rad)
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2
            if not inside: row += bytes([0, 0, 0, 0]); continue
            t = (x + y) / (2 * n)  # gradient #0b2f3f -> #0f766e -> #4338ca
            if t < 0.6: a, b, u = (11, 47, 63), (15, 118, 110), t / 0.6
            else: a, b, u = (15, 118, 110), (67, 56, 202), (t - 0.6) / 0.4
            c = [int(a[i] + (b[i] - a[i]) * u) for i in range(3)]
            fx, fy = x / n, y / n
            if any(bx <= fx <= bx + 0.16 and top <= fy <= 0.76 for bx, top in bars): c = [255, 255, 255]
            if 0.18 <= fx <= 0.82 and 0.79 <= fy <= 0.82: c = [94, 234, 212]
            row += bytes(c + [255])
        px.append(bytes(row))
    raw = b''.join(px)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
for n in (192, 512): png(os.path.join(root, f'icon-{n}.png'), n)
print('icons written')
