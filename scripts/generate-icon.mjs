// Generates media/icon.png (128x128, the size the Marketplace requires).
// Drawn programmatically with supersampling so the repository needs no binary tooling.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 128;
const SCALE = 4; // supersampling factor
const WIDTH = SIZE * SCALE;

const BACKGROUND = [30, 41, 59, 255];
const BASELINE = [100, 116, 139, 255];
const UP = [34, 197, 94, 255];
const DOWN = [239, 68, 68, 255];

const pixels = new Uint8Array(WIDTH * WIDTH * 4);

function blend(index, [red, green, blue, alpha], coverage) {
  const srcAlpha = (alpha / 255) * coverage;
  const dstAlpha = pixels[index + 3] / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  if (outAlpha === 0) {
    return;
  }
  pixels[index] = Math.round((red * srcAlpha + pixels[index] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  pixels[index + 1] = Math.round((green * srcAlpha + pixels[index + 1] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  pixels[index + 2] = Math.round((blue * srcAlpha + pixels[index + 2] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  pixels[index + 3] = Math.round(outAlpha * 255);
}

function paint(x, y, color, coverage = 1) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= WIDTH) {
    return;
  }
  blend((y * WIDTH + x) * 4, color, coverage);
}

function paintRoundedRect(left, top, right, bottom, radius, color) {
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y += 1) {
    for (let x = Math.floor(left); x <= Math.ceil(right); x += 1) {
      const dx = Math.max(left + radius - x, 0, x - (right - radius));
      const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
      const distance = Math.hypot(dx, dy);
      if (distance > radius + 1) {
        continue;
      }
      paint(x, y, color, Math.min(1, radius + 0.5 - distance));
    }
  }
}

function paintSegment(x0, y0, x1, y1, thickness, color) {
  const half = thickness / 2;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let y = Math.floor(cy - half - 1); y <= Math.ceil(cy + half + 1); y += 1) {
      for (let x = Math.floor(cx - half - 1); x <= Math.ceil(cx + half + 1); x += 1) {
        const distance = Math.hypot(x - cx, y - cy);
        if (distance <= half + 1) {
          paint(x, y, color, Math.min(1, half + 0.5 - distance));
        }
      }
    }
  }
}

function paintDisc(cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= radius + 1) {
        paint(x, y, color, Math.min(1, radius + 0.5 - distance));
      }
    }
  }
}

paintRoundedRect(0, 0, WIDTH - 1, WIDTH - 1, 24 * SCALE, BACKGROUND);
paintSegment(18 * SCALE, 96 * SCALE, 110 * SCALE, 96 * SCALE, 2.5 * SCALE, BASELINE);
paintSegment(20 * SCALE, 84 * SCALE, 48 * SCALE, 62 * SCALE, 7 * SCALE, UP);
paintSegment(48 * SCALE, 62 * SCALE, 72 * SCALE, 76 * SCALE, 7 * SCALE, DOWN);
paintSegment(72 * SCALE, 76 * SCALE, 106 * SCALE, 34 * SCALE, 7 * SCALE, UP);
paintDisc(106 * SCALE, 34 * SCALE, 5 * SCALE, UP);

function downsample() {
  const output = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < SCALE; sy += 1) {
        for (let sx = 0; sx < SCALE; sx += 1) {
          const index = ((y * SCALE + sy) * WIDTH + (x * SCALE + sx)) * 4;
          totals[0] += pixels[index];
          totals[1] += pixels[index + 1];
          totals[2] += pixels[index + 2];
          totals[3] += pixels[index + 3];
        }
      }
      const target = (y * SIZE + x) * 4;
      const samples = SCALE * SCALE;
      output[target] = Math.round(totals[0] / samples);
      output[target + 1] = Math.round(totals[1] / samples);
      output[target + 2] = Math.round(totals[2] / samples);
      output[target + 3] = Math.round(totals[3] / samples);
    }
  }
  return output;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha

  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'media', 'icon.png');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, encodePng(downsample()));
console.log(`Wrote ${target} (${SIZE}x${SIZE})`);
