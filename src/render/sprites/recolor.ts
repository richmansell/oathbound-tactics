/**
 * Browser-side layer image loading with CPU palette recolouring.
 *
 * Images are cached by (file, palette mapping) in a byte-budgeted LRU. Entries in use by an
 * in-flight composition are pinned (acquire/release) so eviction never closes a bitmap that is
 * about to be drawn. Recoloured images are produced from exact PNG pixels (own decoder), so
 * palette matching is never disturbed by canvas premultiplication or colour management.
 */
import { type PaletteMapping, buildRecolorLut, mappingKey, recolorRgba } from './palette';
import { canDecodePng, decodePng } from './png';

export type Drawable = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

interface Entry {
  key: string;
  promise: Promise<Drawable>;
  image: Drawable | null;
  bytes: number;
  pins: number;
  lastUsed: number;
}

const cache = new Map<string, Entry>();
let budgetBytes = 48 * 1024 * 1024;
let totalBytes = 0;
let clock = 0;

export function setImageCacheBudget(bytes: number): void {
  budgetBytes = Math.max(0, bytes);
  evict();
}

export function imageCacheStats(): { entries: number; bytes: number; budget: number } {
  return { entries: cache.size, bytes: totalBytes, budget: budgetBytes };
}

/** Create a canvas (OffscreenCanvas when available). */
export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function context2d(c: AnyCanvas, readback = false): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d', readback ? { willReadFrequently: true } : undefined) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function closeDrawable(d: Drawable | null): void {
  if (d && typeof ImageBitmap !== 'undefined' && d instanceof ImageBitmap) d.close();
  else if (d && 'width' in d) {
    // Shrinking a canvas releases its backing store promptly on most engines.
    (d as AnyCanvas).width = 0;
    (d as AnyCanvas).height = 0;
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load sprite ${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function toDrawable(data: Uint8ClampedArray, width: number, height: number): Promise<Drawable> {
  const img = new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(img, { premultiplyAlpha: 'default', colorSpaceConversion: 'none' });
    } catch {
      /* fall through to canvas */
    }
  }
  const c = createCanvas(width, height);
  context2d(c).putImageData(img, 0, 0);
  return c;
}

async function decodePlain(bytes: Uint8Array): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { colorSpaceConversion: 'none' });
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = createCanvas(img.naturalWidth, img.naturalHeight);
    context2d(c).drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Recolour any drawable (canvas readback path). Prefer `acquireLayerImage`, which decodes PNG
 * bytes exactly; this is for sources that only exist as bitmaps/canvases.
 */
export function recolorCanvas(source: Drawable | HTMLImageElement, mappings: readonly PaletteMapping[]): AnyCanvas {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const c = createCanvas(w, h);
  const ctx = context2d(c, true);
  ctx.drawImage(source as CanvasImageSource, 0, 0);
  if (mappings.length) {
    const img = ctx.getImageData(0, 0, w, h);
    recolorRgba(img.data, buildRecolorLut(mappings));
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

async function loadImage(url: string, mappings: readonly PaletteMapping[]): Promise<Drawable> {
  const bytes = await fetchBytes(url);
  if (!mappings.length) return decodePlain(bytes);
  if (canDecodePng()) {
    try {
      const img = await decodePng(bytes);
      recolorRgba(img.data, buildRecolorLut(mappings));
      return await toDrawable(img.data, img.width, img.height);
    } catch {
      /* unusual PNG: fall back to canvas readback */
    }
  }
  const plain = await decodePlain(bytes);
  const out = recolorCanvas(plain, mappings);
  closeDrawable(plain);
  return out;
}

export interface LayerImageHandle {
  image: Drawable;
  release(): void;
}

/** Load (or reuse) a recoloured layer image and pin it until `release()`. */
export async function acquireLayerImage(url: string, mappings: readonly PaletteMapping[]): Promise<LayerImageHandle> {
  const key = `${url}|${mappingKey(mappings)}`;
  let e = cache.get(key);
  if (!e) {
    const entry: Entry = { key, promise: null as unknown as Promise<Drawable>, image: null, bytes: 0, pins: 0, lastUsed: ++clock };
    entry.promise = loadImage(url, mappings).then(
      (img) => {
        entry.image = img;
        entry.bytes = img.width * img.height * 4;
        if (cache.get(key) === entry) {
          totalBytes += entry.bytes;
          evict();
        }
        return img;
      },
      (err) => {
        if (cache.get(key) === entry) cache.delete(key);
        throw err;
      },
    );
    cache.set(key, entry);
    e = entry;
  }
  e.pins++;
  e.lastUsed = ++clock;
  const entry = e;
  try {
    const image = await entry.promise;
    let released = false;
    return {
      image,
      release() {
        if (released) return;
        released = true;
        entry.pins--;
        if (!cache.has(entry.key) && entry.pins <= 0) closeDrawable(entry.image);
        else evict();
      },
    };
  } catch (err) {
    entry.pins--;
    throw err;
  }
}

function evict(): void {
  if (totalBytes <= budgetBytes) return;
  const entries = [...cache.values()].filter((e) => e.image && e.pins <= 0).sort((a, b) => a.lastUsed - b.lastUsed);
  for (const e of entries) {
    if (totalBytes <= budgetBytes) break;
    cache.delete(e.key);
    totalBytes -= e.bytes;
    closeDrawable(e.image);
  }
}

/** Drop every unpinned cached image (e.g. on scene change or memory warning). */
export function clearImageCache(): void {
  for (const e of [...cache.values()]) {
    if (e.pins > 0) continue;
    cache.delete(e.key);
    if (e.image) {
      totalBytes -= e.bytes;
      closeDrawable(e.image);
    }
  }
}
