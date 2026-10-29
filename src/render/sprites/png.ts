/**
 * Minimal exact PNG decoder (non-interlaced; palette 1/2/4/8-bit, grey/RGB/RGBA 8-bit).
 *
 * Used for palette recolouring so pixel values are read exactly as stored (no canvas
 * premultiplication or colour management). Inflate uses the platform DecompressionStream,
 * available in modern browsers and Node ≥ 18. Callers fall back to canvas readback if it throws.
 */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function canDecodePng(): boolean {
  return typeof DecompressionStream === 'function' && typeof Blob === 'function' && typeof Response === 'function';
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodePng(bytes: Uint8Array): Promise<RgbaImage> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('Not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos < bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace) throw new Error('Interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error(`PNG colour type ${colorType} not supported`);
  if (colorType !== 3 && bitDepth !== 8) throw new Error(`PNG bit depth ${bitDepth} not supported`);
  let total = 0;
  for (const c of idat) total += c.length;
  const joined = new Uint8Array(total);
  let o = 0;
  for (const c of idat) { joined.set(c, o); o += c.length; }
  const raw = await inflate(joined);

  const bpp = Math.max(1, (channels * bitDepth) >> 3);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const lines = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (rowBytes + 1)];
    const src = y * (rowBytes + 1) + 1;
    const dst = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const v = raw[src + x];
      const a = x >= bpp ? lines[dst + x - bpp] : 0;
      const b = y > 0 ? lines[dst - rowBytes + x] : 0;
      const c = y > 0 && x >= bpp ? lines[dst - rowBytes + x - bpp] : 0;
      let out: number;
      switch (f) {
        case 0: out = v; break;
        case 1: out = v + a; break;
        case 2: out = v + b; break;
        case 3: out = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Bad PNG filter ${f}`);
      }
      lines[dst + x] = out & 255;
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  if (colorType === 3) {
    if (!palette) throw new Error('PNG palette missing');
    const perByte = 8 / bitDepth;
    const mask = (1 << bitDepth) - 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = lines[y * rowBytes + Math.floor(x / perByte)];
        const idx = bitDepth === 8 ? byte : (byte >> (8 - bitDepth * ((x % perByte) + 1))) & mask;
        const d = (y * width + x) * 4;
        out[d] = palette[idx * 3];
        out[d + 1] = palette[idx * 3 + 1];
        out[d + 2] = palette[idx * 3 + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }
  } else {
    for (let i = 0, n = width * height; i < n; i++) {
      const s = i * channels, d = i * 4;
      if (channels === 4) { out[d] = lines[s]; out[d + 1] = lines[s + 1]; out[d + 2] = lines[s + 2]; out[d + 3] = lines[s + 3]; }
      else if (channels === 3) { out[d] = lines[s]; out[d + 1] = lines[s + 1]; out[d + 2] = lines[s + 2]; out[d + 3] = 255; }
      else if (channels === 2) { out[d] = out[d + 1] = out[d + 2] = lines[s]; out[d + 3] = lines[s + 1]; }
      else { out[d] = out[d + 1] = out[d + 2] = lines[s]; out[d + 3] = 255; }
    }
  }
  return { width, height, data: out };
}
