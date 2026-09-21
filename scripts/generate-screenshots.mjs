// Captures the README artwork from a real editor window: launches VS Code with the extension
// under development, drives it over the DevTools protocol and clips the status bar strip.
//
//   npm run media                          # reuses the .vscode-test download when present
//   CODE_PATH=/usr/share/code/code npm run media
//
// Writes media/statusbar.png and media/rotation.gif. PNG decoding and GIF encoding happen here so
// the repository needs no image tooling, mirroring scripts/generate-icon.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(ROOT, 'media');
const PORT = 9333;
const ROTATE_SECONDS = 2;
const FRAMES = 4;

const SETTINGS = {
  'codingview.watchlist': [{ symbol: 'cn:600519', quantity: 100, cost: 1200 }, 'us:AAPL', 'hk:00700'],
  'codingview.pinnedSymbol': 'hk:00700',
  'codingview.rotateIntervalSeconds': ROTATE_SECONDS,
};

function findCodeBinary() {
  if (process.env.CODE_PATH) {
    return process.env.CODE_PATH;
  }
  const testRoot = join(ROOT, '.vscode-test');
  const candidates = readdirSync(testRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('vscode-'))
    .map((entry) => join(testRoot, entry.name, 'code'));
  if (candidates.length === 0) {
    throw new Error('No VS Code binary found. Run `npm run test:smoke` once or set CODE_PATH.');
  }
  return candidates.sort().at(-1);
}

async function waitForPageTarget(deadlineMs = 90000) {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(2000) });
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.title.includes('Extension Development Host'));
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      // The debugging endpoint is not up yet.
    }
    if (Date.now() > deadline) {
      throw new Error('VS Code did not expose a debugging target in time.');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = (nextId += 1);
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(send));
    socket.addEventListener('error', reject);
  });
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

const ITEMS_EXPRESSION = `JSON.stringify([...document.querySelectorAll('.statusbar-item')]
  .filter((element) => {
    const label = element.getAttribute('aria-label') ?? '';
    // The price items carry the tooltip's "### CodingView" heading; the refresh button has no such
    // heading, so it needs its own match — which has to survive the "Refreshing quotes…" tooltip it
    // shows while a request is running.
    return label.includes('### CodingView') || /Refresh(ing)? quotes/.test(label);
  })
  .map((element) => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() })))`;

/** The strip that holds the CodingView items, with a little padding on either side. */
async function codingviewClip(send, scale) {
  const items = JSON.parse(await evaluate(send, ITEMS_EXPRESSION));
  if (items.length === 0) {
    return undefined;
  }
  const left = Math.min(...items.map((item) => item.rect.left));
  const top = Math.min(...items.map((item) => item.rect.top));
  const bottom = Math.max(...items.map((item) => item.rect.bottom));
  const right = Math.max(...items.map((item) => item.rect.right));
  return {
    clip: {
      x: Math.max(0, Math.round(left) - 6),
      y: Math.round(top),
      width: Math.round(right - left) + 12,
      height: Math.round(bottom - top),
      scale,
    },
    items,
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

/** Minimal PNG reader: 8-bit truecolour with or without alpha, no interlacing. */
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) {
        throw new Error(`Unsupported PNG bit depth ${data[8]}`);
      }
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (channels === 0) {
        throw new Error(`Unsupported PNG colour type ${data[9]}`);
      }
    } else if (type === 'IDAT') {
      parts.push(data);
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let index = 0; index < line.length; index += 1) {
      const left = index >= channels ? line[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      switch (filter) {
        case 0:
          break;
        case 1:
          line[index] = (line[index] + left) & 0xff;
          break;
        case 2:
          line[index] = (line[index] + up) & 0xff;
          break;
        case 3:
          line[index] = (line[index] + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          line[index] = (line[index] + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter ${filter}`);
      }
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = line[source];
      pixels[target + 1] = line[source + 1];
      pixels[target + 2] = line[source + 2];
      pixels[target + 3] = channels === 4 ? line[source + 3] : 255;
    }
    previous = line;
  }
  return { width, height, pixels };
}

/** 3×3×3 bits per channel: enough for a flat status bar and a small GIF palette. */
function quantize(frames) {
  const palette = [];
  const lookup = new Map();
  const indexFor = (red, green, blue) => {
    const r = red >> 5;
    const g = green >> 5;
    const b = blue >> 5;
    const key = (r << 6) | (g << 3) | b;
    let index = lookup.get(key);
    if (index === undefined) {
      index = palette.length;
      lookup.set(key, index);
      palette.push([red & 0xe0, green & 0xe0, blue & 0xe0]);
    }
    return index;
  };

  const indices = frames.map((frame) => {
    const output = Buffer.alloc(frame.width * frame.height);
    for (let pixel = 0; pixel < output.length; pixel += 1) {
      output[pixel] = indexFor(frame.pixels[pixel * 4], frame.pixels[pixel * 4 + 1], frame.pixels[pixel * 4 + 2]);
    }
    return output;
  });
  return { palette, indices };
}

function lzwEncode(pixels, minimumCodeSize) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map();
  let bitBuffer = 0;
  let bitCount = 0;
  const output = [];

  const emit = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let prefix = pixels[0];
  for (let index = 1; index < pixels.length; index += 1) {
    const next = pixels[index];
    const key = prefix * 4096 + next;
    const found = dictionary.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      dictionary = new Map();
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
    } else {
      dictionary.set(key, nextCode);
      nextCode += 1;
      if (nextCode > 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
    }
    prefix = next;
  }
  emit(prefix);
  emit(endCode);
  if (bitCount > 0) {
    output.push(bitBuffer & 0xff);
  }
  return output;
}

function encodeGif(frames, palette, delayCentiseconds) {
  const { width, height } = frames[0];
  const paletteSize = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, palette.length))));
  const minimumCodeSize = Math.max(2, Math.log2(paletteSize));
  const parts = [Buffer.from('GIF89a', 'ascii')];

  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0b1111_0000 | (Math.log2(paletteSize) - 1);
  parts.push(screen);

  const table = Buffer.alloc(paletteSize * 3);
  palette.forEach((color, index) => {
    table[index * 3] = color[0];
    table[index * 3 + 1] = color[1];
    table[index * 3 + 2] = color[2];
  });
  parts.push(table);

  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00]));

  for (const frame of frames) {
    const control = Buffer.alloc(8);
    control[0] = 0x21;
    control[1] = 0xf9;
    control[2] = 0x04;
    control.writeUInt16LE(delayCentiseconds, 4);
    parts.push(control);

    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(width, 5);
    descriptor.writeUInt16LE(height, 7);
    parts.push(descriptor);

    parts.push(Buffer.from([minimumCodeSize]));
    const encoded = Buffer.from(lzwEncode(frame.indices, minimumCodeSize));
    for (let offset = 0; offset < encoded.length; offset += 255) {
      const block = encoded.subarray(offset, offset + 255);
      parts.push(Buffer.from([block.length]), block);
    }
    parts.push(Buffer.from([0x00]));
  }

  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

async function main() {
  const codePath = findCodeBinary();
  const workspace = mkdtempSync(join(tmpdir(), 'codingview-media-'));
  mkdirSync(join(workspace, 'ws', '.vscode'), { recursive: true });
  mkdirSync(join(workspace, 'data'), { recursive: true });
  mkdirSync(join(workspace, 'extensions'), { recursive: true });
  mkdirSync(MEDIA, { recursive: true });
  writeFileSync(join(workspace, 'ws', '.vscode', 'settings.json'), JSON.stringify(SETTINGS, null, 2));

  const child = spawn(
    codePath,
    [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--disable-telemetry',
      `--user-data-dir=${join(workspace, 'data')}`,
      `--extensions-dir=${join(workspace, 'extensions')}`,
      `--remote-debugging-port=${PORT}`,
      `--extensionDevelopmentPath=${ROOT}`,
      join(workspace, 'ws'),
    ],
    { detached: true, stdio: 'ignore' },
  );

  try {
    console.error('[media] waiting for the editor window');
    const send = await connect(await waitForPageTarget());
    console.error('[media] connected to the workbench');

    let strip;
    const deadline = Date.now() + 30000;
    for (;;) {
      strip = await codingviewClip(send, 3);
      if (strip?.items.some((item) => !item.text.includes('--'))) {
        break;
      }
      console.error('[media] waiting for the first quote');
      if (Date.now() > deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!strip) {
      throw new Error('CodingView never rendered a status bar item.');
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', clip: strip.clip });
    writeFileSync(join(MEDIA, 'statusbar.png'), Buffer.from(shot.data, 'base64'));
    console.log(`statusbar.png  ${strip.clip.width * strip.clip.scale}×${strip.clip.height * strip.clip.scale}`);

    const frames = [];
    let previous = '';
    for (let index = 0; index < FRAMES; index += 1) {
      const visible = JSON.parse(await evaluate(send, ITEMS_EXPRESSION)).map((item) => item.text.trim());
      const current = visible.join(' | ');
      if (index > 0 && current === previous) {
        // Wait for the rotation so every frame shows a different symbol.
        const deadline = Date.now() + ROTATE_SECONDS * 2000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          const next = JSON.parse(await evaluate(send, ITEMS_EXPRESSION)).map((item) => item.text.trim());
          if (next.join(' | ') !== previous) {
            break;
          }
        }
      }
      const frame = await send('Page.captureScreenshot', { format: 'png', clip: { ...strip.clip, scale: 2 } });
      frames.push(decodePng(Buffer.from(frame.data, 'base64')));
      const captured = JSON.parse(await evaluate(send, ITEMS_EXPRESSION)).map((item) => item.text.trim());
      previous = captured.join(' | ');
      console.error(`[media] frame ${index + 1}: ${previous}`);
    }
    const { palette, indices } = quantize(frames);
    const gifFrames = frames.map((frame, index) => ({ ...frame, indices: indices[index] }));
    writeFileSync(join(MEDIA, 'rotation.gif'), encodeGif(gifFrames, palette, ROTATE_SECONDS * 100));
    console.log(`rotation.gif   ${frames[0].width}×${frames[0].height}, ${frames.length} frames, ${palette.length} colours`);
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main();
