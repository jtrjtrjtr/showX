import struct, zlib, os

def make_png(size):
    w = h = size
    raw_rows = b''
    for _ in range(h):
        raw_rows += b'\x00' + bytes([0] * w)
    compressed = zlib.compress(raw_rows)
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b''))

out = os.path.join(os.path.dirname(__file__), '..', 'pwa', 'public')
with open(os.path.join(out, 'icon-192.png'), 'wb') as f:
    f.write(make_png(192))
with open(os.path.join(out, 'icon-512.png'), 'wb') as f:
    f.write(make_png(512))
print('icons created')
