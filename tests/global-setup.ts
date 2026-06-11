import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { resolve } from 'path';

function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function generateIcon192(outPath: string): void {
  const W = 192, H = 192;

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB color type
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const BG: [number, number, number] = [0x0e, 0x0f, 0x12];
  const TEAL: [number, number, number] = [0x2d, 0xd4, 0xbf];
  const cx = W / 2, cy = H / 2, r = W * 0.40;

  const rows: Buffer[] = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.allocUnsafe(1 + W * 3);
    row[0] = 0;
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const px = (dist > r * 0.85 && dist < r) ? TEAL : BG;
      row[1 + x * 3] = px[0]; row[2 + x * 3] = px[1]; row[3 + x * 3] = px[2];
    }
    rows.push(row);
  }

  // deflateSync produces a zlib-wrapped stream (with CMF+FLG header and Adler-32)
  // which is exactly what PNG IDAT expects per RFC 1950
  const idat = deflateSync(Buffer.concat(rows));

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  writeFileSync(outPath, png);
}

function isValid192x192Png(filePath: string): boolean {
  try {
    const buf = readFileSync(filePath);
    if (buf.length < 24) return false;
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return false;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return w === 192 && h === 192;
  } catch {
    return false;
  }
}

export default function setup(): void {
  const iconPath = resolve(process.cwd(), 'pwa/public/icon-192.png');
  if (!isValid192x192Png(iconPath)) {
    generateIcon192(iconPath);
    console.log('[global-setup] Generated pwa/public/icon-192.png (192×192 dark bg + teal ring)');
  }
}
