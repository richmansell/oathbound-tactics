/**
 * Seeded, integer-hash based noise for world generation. Pure functions, no state, no
 * Math.random — identical inputs always give identical outputs on every platform.
 *
 * - `hash32 / hash01`: stateless integer hashes (same mixing as engine/rng `hash2`).
 * - `valueNoise`: smooth value noise in [-1, 1].
 * - `gradNoise`: 2D gradient (Perlin-style) noise, roughly [-1, 1].
 * - `fbm`, `ridged`: fractal sums; `warp`: domain warp offset.
 */

/** Stateless 32-bit hash of (seed, x, y) → uint32. */
export function hash32(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stateless hash → [0, 1). */
export function hash01(seed: number, x: number, y: number): number {
  return hash32(seed, x, y) / 4294967296;
}

/** Hash three integers → [0, 1). */
export function hash3(seed: number, x: number, y: number, z: number): number {
  return hash32(seed ^ Math.imul(z | 0, 0x9e3779b1), x, y) / 4294967296;
}

/** Derive a sub-seed from a seed and a salt (string or number). */
export function subSeed(seed: number, salt: string | number): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  const s = String(salt);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hash32(h, 0x51ed, 0x2709);
}

// 16 unit gradient directions.
const GX = new Float64Array(16);
const GY = new Float64Array(16);
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2 + 0.19634954;
  GX[i] = Math.cos(a);
  GY[i] = Math.sin(a);
}

/** 2D gradient noise, output roughly in [-1, 1]. */
export function gradNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const h00 = hash32(seed, x0, y0) & 15;
  const h10 = hash32(seed, x0 + 1, y0) & 15;
  const h01 = hash32(seed, x0, y0 + 1) & 15;
  const h11 = hash32(seed, x0 + 1, y0 + 1) & 15;
  const n00 = GX[h00] * fx + GY[h00] * fy;
  const n10 = GX[h10] * (fx - 1) + GY[h10] * fy;
  const n01 = GX[h01] * fx + GY[h01] * (fy - 1);
  const n11 = GX[h11] * (fx - 1) + GY[h11] * (fy - 1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.414;
}

/** Smooth value noise in [-1, 1]. */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash32(seed, x0, y0) / 2147483648 - 1;
  const b = hash32(seed, x0 + 1, y0) / 2147483648 - 1;
  const c = hash32(seed, x0, y0 + 1) / 2147483648 - 1;
  const d = hash32(seed, x0 + 1, y0 + 1) / 2147483648 - 1;
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return top + (bot - top) * v;
}

/**
 * Fractal Brownian motion of gradient noise. `x, y` are in noise space (divide world coords by a
 * scale first). Output normalised to roughly [-1, 1].
 */
export function fbm(seed: number, x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += gradNoise(seed + o * 1013, x, y) * amp;
    norm += amp;
    amp *= gain;
    // rotate a little each octave to hide lattice alignment
    const nx = x * 1.6 - y * 1.2;
    const ny = x * 1.2 + y * 1.6;
    x = nx * (lacunarity / 2) + 17.3;
    y = ny * (lacunarity / 2) - 9.1;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests (1) along noise zero-crossings. */
export function ridged(seed: number, x: number, y: number, octaves: number, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, weight = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(gradNoise(seed + o * 7919, x, y));
    n *= n;
    n *= weight;
    weight = Math.min(1, Math.max(0, n * 1.6));
    sum += n * amp;
    norm += amp;
    amp *= gain;
    const nx = x * 1.6 - y * 1.2;
    const ny = x * 1.2 + y * 1.6;
    x = nx + 31.7;
    y = ny - 3.3;
  }
  return sum / norm;
}

/** Domain-warp offset: writes (dx, dy) with magnitude up to ~amp into `out`. */
export function warp(seed: number, x: number, y: number, scale: number, amp: number, out: Float64Array | number[], octaves = 2): void {
  const sx = x / scale, sy = y / scale;
  out[0] = fbm(seed, sx, sy, octaves) * amp;
  out[1] = fbm(seed + 7777, sx + 5.2, sy + 1.3, octaves) * amp;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Cellular (Worley) noise: nearest and second-nearest feature-point distances plus the
 * nearest cell's id, for jittered points on a square grid of `cell` tiles.
 */
export interface CellResult { f1: number; f2: number; cx: number; cy: number; px: number; py: number; c2x: number; c2y: number }
export function cellular(seed: number, x: number, y: number, cell: number, out: CellResult, jitter = 0.8): CellResult {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  let f1 = 1e9, f2 = 1e9, bx = 0, by = 0, bpx = 0, bpy = 0, b2x = 0, b2y = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cy = gy + j;
      const h = hash32(seed, cx, cy);
      const px = (cx + 0.5 + ((h & 0xffff) / 65536 - 0.5) * jitter) * cell;
      const py = (cy + 0.5 + ((h >>> 16) / 65536 - 0.5) * jitter) * cell;
      const dx = px - x, dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; b2x = bx; b2y = by; f1 = d; bx = cx; by = cy; bpx = px; bpy = py; }
      else if (d < f2) { f2 = d; b2x = cx; b2y = cy; }
    }
  }
  out.f1 = f1; out.f2 = f2; out.cx = bx; out.cy = by; out.px = bpx; out.py = bpy; out.c2x = b2x; out.c2y = b2y;
  return out;
}
