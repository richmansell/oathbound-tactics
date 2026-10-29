/**
 * World-map sampling (pure, no DOM): RGBA colours for an overview of the generated world —
 * terrain colour shaded by height and slope (hillshade), water by depth, roads, set pieces.
 */
import type { WorldGen } from './gen';
import { F_BRIDGE, F_ROAD, PROPS, T, TERRAINS } from './tables';

type RGB = [number, number, number];

/** Base map colour per terrain code (index = TERRAINS). */
export const TERRAIN_RGB: RGB[] = TERRAINS.map((t): RGB => {
  switch (t) {
    case 'grass': return [86, 140, 64];
    case 'tallgrass': return [118, 150, 66];
    case 'dirt': return [140, 108, 72];
    case 'road': return [176, 166, 150];
    case 'stone': return [128, 130, 134];
    case 'brick': return [170, 158, 140];
    case 'sand': return [214, 194, 140];
    case 'water': return [60, 120, 180];
    case 'deepwater': return [28, 70, 128];
    case 'wood': return [150, 104, 60];
    case 'snow': return [228, 236, 244];
    case 'swamp': return [82, 98, 62];
    case 'roof': return [168, 74, 56];
    case 'thatch': return [196, 158, 84];
    case 'slate': return [76, 86, 104];
    case 'cave': return [70, 62, 56];
    case 'lava': return [230, 100, 30];
    case 'ash': return [118, 114, 108];
    default: return [0, 0, 0];
  }
});

const PROP_TREE = new Set(['tree', 'pine', 'bush']);

/**
 * Shade one sample. `hW`/`hN` are the heights of the samples to the west / north (for hillshade);
 * `step` is the sample spacing in tiles.
 */
export function shadeSample(t: number, h: number, prop: number, flags: number, setPiece: number, hW: number, hN: number, step: number, out: Uint8ClampedArray, o: number): void {
  let [r, g, b] = TERRAIN_RGB[t] ?? [0, 0, 0];
  const water = t === T.water || t === T.deepwater;
  if (water) {
    const k = 0.9 + Math.min(h, 10) * 0.012;
    r *= k; g *= k; b *= k;
  } else {
    const pn = PROPS[prop];
    if (pn && PROP_TREE.has(pn)) { const k = pn === 'bush' ? 0.82 : 0.62; r = r * k * 0.8; g *= k; b *= k * 0.8; }
    else if (pn === 'deadtree') { r *= 0.6; g *= 0.58; b *= 0.55; }
    else if (pn) { r = r * 0.85 + 20; g = g * 0.85 + 18; b = b * 0.85 + 14; }
    // elevation tint + hillshade (light from the north-west)
    const elev = 0.82 + Math.min(h, 30) * 0.014;
    const slope = ((hW - h) + (hN - h)) / Math.sqrt(Math.max(1, step));
    const shade = Math.max(0.5, Math.min(1.4, 1 - slope * 0.11));
    r *= elev * shade; g *= elev * shade; b *= elev * shade;
  }
  if (flags & F_ROAD && step > 1) { r = r * 0.3 + 190 * 0.7; g = g * 0.3 + 170 * 0.7; b = b * 0.3 + 120 * 0.7; }
  if (flags & F_BRIDGE) { r = 150; g = 104; b = 60; }
  if (setPiece && step >= 3) { r = r * 0.6 + 240 * 0.4; g = g * 0.6 + 200 * 0.4; b = b * 0.6 + 80 * 0.4; }
  out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
}

/**
 * Sample a w×h grid of world tiles starting at (x0, y0) with `step` tiles between samples.
 * Returns RGBA (w × h × 4). step = 1 reads whole chunks (cached); larger steps sample single
 * tiles without filling the chunk cache.
 */
export function sampleOverview(gen: WorldGen, x0: number, y0: number, w: number, h: number, step: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const prevRow = new Float64Array(w);
  const tile = step === 1
    ? (x: number, y: number) => {
      const ch = gen.chunk(Math.floor(x / 32), Math.floor(y / 32));
      const i = (y - ch.cy * 32) * 32 + (x - ch.cx * 32);
      return { h: ch.h[i], t: ch.t[i], prop: ch.prop[i], flags: ch.flags[i], setPiece: ch.setPiece[i] };
    }
    : (x: number, y: number) => gen.sample(x, y);
  // step 1: iterate in chunk-row bands so the LRU never thrashes
  for (let j = 0; j < h; j++) {
    let hW = 0;
    for (let i = 0; i < w; i++) {
      const s = tile(x0 + i * step, y0 + j * step);
      const hn = j > 0 ? prevRow[i] : s.h;
      if (i === 0) hW = s.h;
      shadeSample(s.t, s.h, s.prop, s.flags, s.setPiece, hW, hn, step, out, (j * w + i) * 4);
      prevRow[i] = s.h;
      hW = s.h;
    }
  }
  return out;
}
