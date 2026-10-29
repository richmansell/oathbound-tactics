/**
 * Browser helpers: turn a rendered portrait into a canvas / data URL, cached by a stable hash.
 * Display with CSS `image-rendering: pixelated` so upscaling stays crisp.
 */
import type { Appearance, Expression } from '../content/schema';
import { renderPortrait, stableHash, type PortraitOptions } from './render';

const MAX_ENTRIES = 256;
const canvasCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

/** Stable cache key for a portrait request. */
export function portraitKey(appearance: Appearance, expression: Expression, opts: PortraitOptions = {}): string {
  return `${expression}:${opts.size ?? 96}:${opts.flip ? 1 : 0}:${stableHash({ appearance, h: opts.headgear, o: opts.outfit }).toString(36)}`;
}

function remember<T>(map: Map<string, T>, key: string, value: T) {
  map.set(key, value);
  if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string);
}

/** Cached canvas with the portrait drawn at `opts.size` (default native 96px). Treat as read-only. */
export function portraitCanvas(appearance: Appearance, expression: Expression, opts: PortraitOptions = {}): HTMLCanvasElement {
  const key = portraitKey(appearance, expression, opts);
  const hit = canvasCache.get(key);
  if (hit) { canvasCache.delete(key); canvasCache.set(key, hit); return hit; }
  const img = renderPortrait(appearance, expression, opts);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(img.data);
  ctx.putImageData(id, 0, 0);
  remember(canvasCache, key, canvas);
  return canvas;
}

/** Cached PNG data URL (for <img src>). */
export function portraitDataUrl(appearance: Appearance, expression: Expression, opts: PortraitOptions = {}): string {
  const key = portraitKey(appearance, expression, opts);
  const hit = urlCache.get(key);
  if (hit) return hit;
  const url = portraitCanvas(appearance, expression, opts).toDataURL('image/png');
  remember(urlCache, key, url);
  return url;
}

/** Drop all cached portraits (e.g. after a cosmetic/dye change). */
export function clearPortraitCache() {
  canvasCache.clear();
  urlCache.clear();
}
