/**
 * Node-side compositor harness for tests: executes the same plan/draw ops as the browser
 * compositor, using the runtime PNG decoder + palette recolouring and a plain RGBA blitter.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { type Catalog, type SheetAnim, setCatalog } from '../src/render/sprites/catalog';
import { type CharacterPlan, composeOps } from '../src/render/sprites/plan';
import { buildRecolorLut, recolorRgba } from '../src/render/sprites/palette';
import { type RgbaImage, decodePng } from '../src/render/sprites/png';

export const ROOT = path.resolve(__dirname, '..');
export const LPC = path.join(ROOT, 'public/assets/lpc');

export function loadTestCatalog(): Catalog {
  return setCatalog(JSON.parse(fs.readFileSync(path.join(LPC, 'catalog.json'), 'utf8')));
}

const imageCache = new Map<string, Promise<RgbaImage>>();
function loadLayer(src: string, mk: string, mappings: Parameters<typeof buildRecolorLut>[0]): Promise<RgbaImage> {
  const key = `${src}|${mk}`;
  let p = imageCache.get(key);
  if (!p) {
    p = decodePng(new Uint8Array(fs.readFileSync(path.join(LPC, src)))).then((img) => {
      if (mappings.length) recolorRgba(img.data, buildRecolorLut(mappings));
      return img;
    });
    imageCache.set(key, p);
  }
  return p;
}

/** Compose one animation sheet into an RGBA image (source-over alpha blending). */
export async function renderAnim(catalog: Catalog, plan: CharacterPlan, anim: SheetAnim): Promise<RgbaImage> {
  const comp = composeOps(catalog, plan, anim);
  const out: RgbaImage = { width: comp.width, height: comp.height, data: new Uint8ClampedArray(comp.width * comp.height * 4) };
  const imgs = new Map<string, RgbaImage>();
  for (const s of comp.sources) imgs.set(`${s.src}|${s.mappingKey}`, await loadLayer(s.src, s.mappingKey, s.mappings));
  for (const op of comp.ops) {
    const img = imgs.get(`${op.src}|${op.mappingKey}`)!;
    for (let y = 0; y < op.sh; y++) {
      const sy = op.sy + y, dy = op.dy + y;
      if (sy >= img.height || dy >= out.height) break;
      for (let x = 0; x < op.sw; x++) {
        const sx = op.sx + x, dx = op.dx + x;
        if (sx >= img.width || dx >= out.width) break;
        const si = (sy * img.width + sx) * 4;
        const a = img.data[si + 3];
        if (!a) continue;
        const di = (dy * out.width + dx) * 4;
        if (a === 255) {
          out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
        } else {
          const da = out.data[di + 3] / 255, sa = a / 255;
          const oa = sa + da * (1 - sa);
          for (let c = 0; c < 3; c++) out.data[di + c] = Math.round((img.data[si + c] * sa + out.data[di + c] * da * (1 - sa)) / oa);
          out.data[di + 3] = Math.round(oa * 255);
        }
      }
    }
  }
  return out;
}

/** Copy one frame out of a composed sheet. */
export function frameOf(img: RgbaImage, size: number, col: number, row: number): RgbaImage {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const s = ((row * size + y) * img.width + col * size) * 4;
    out.set(img.data.subarray(s, s + size * 4), y * size * 4);
  }
  return { width: size, height: size, data: out };
}

/** Bounding box of opaque pixels. */
export function opaqueBounds(img: RgbaImage): { minX: number; minY: number; maxX: number; maxY: number; count: number } {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3]) {
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, count };
}

export function colorSet(img: RgbaImage): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) s.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  return s;
}

/** Write an image (scaled, on a checkerboard) for eyeballing; only when SPRITE_DUMP is set. */
export function dump(name: string, img: RgbaImage, scale = 2): void {
  const dir = process.env.SPRITE_DUMP;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const png = new PNG({ width: img.width * scale, height: img.height * scale });
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const si = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
    const di = (y * png.width + x) * 4;
    const bg = ((x >> 4) + (y >> 4)) % 2 ? 150 : 175;
    const a = img.data[si + 3] / 255;
    for (let c = 0; c < 3; c++) png.data[di + c] = Math.round(img.data[si + c] * a + bg * (1 - a));
    png.data[di + 3] = 255;
  }
  fs.writeFileSync(path.join(dir, `${name}.png`), PNG.sync.write(png));
}
