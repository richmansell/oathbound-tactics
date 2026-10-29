/**
 * Procedural pixel-art terrain. Each (terrain, height, variant) column is
 * rasterised once into a cached canvas: textured top diamond plus lit left and
 * right faces. Deterministic: same map → same look.
 */
import type { Terrain } from '../engine/types';
import { hash2 } from '../engine/rng';
import { HALF_H, HALF_W, HEIGHT_PX, TILE_H, TILE_W } from './iso';

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

interface TerrainStyle {
  top: string[];          // ramp dark → light
  side: string[];         // ramp dark → light
  lip?: string[];         // overhang colour at top of faces (grass edge)
  lipDepth?: number;
  pattern: 'noise' | 'grass' | 'cobble' | 'brick' | 'planks' | 'sand' | 'water' | 'snow' | 'roof' | 'cave' | 'dirt' | 'flag' | 'thatch' | 'slate' | 'ash';
  sidePattern: 'strata' | 'brick' | 'planks' | 'rock' | 'timber' | 'stonewall' | 'none';
  alpha?: number;
}

export const TERRAIN_STYLE: Record<Terrain, TerrainStyle> = {
  grass: { top: ['#2f5a2a', '#3f7a33', '#56953d', '#74b04c'], side: ['#3b2a1f', '#56402c', '#6e5238', '#86663f'], lip: ['#2f5a2a', '#3f7a33'], lipDepth: 3, pattern: 'grass', sidePattern: 'strata' },
  tallgrass: { top: ['#3c5e22', '#557d2b', '#6e9a33', '#93b84a'], side: ['#3b2a1f', '#56402c', '#6e5238', '#86663f'], lip: ['#3c5e22', '#557d2b'], lipDepth: 4, pattern: 'grass', sidePattern: 'strata' },
  dirt: { top: ['#5a4029', '#73533a', '#8c6a47', '#a78456'], side: ['#3b2a1f', '#4f3a27', '#654a33', '#7a5b3e'], pattern: 'dirt', sidePattern: 'strata' },
  road: { top: ['#5d5752', '#7a736b', '#958d82', '#b2a898'], side: ['#3b3632', '#524b45', '#6a625a', '#81786d'], pattern: 'cobble', sidePattern: 'brick' },
  stone: { top: ['#4f5257', '#686c72', '#81868c', '#9ea3a8'], side: ['#33353a', '#46494e', '#5b5e63', '#72767b'], pattern: 'noise', sidePattern: 'rock' },
  brick: { top: ['#6b6258', '#857a6d', '#9e9282', '#bbad99'], side: ['#3e3832', '#554c43', '#6c6155', '#857868'], pattern: 'flag', sidePattern: 'brick' },
  sand: { top: ['#a8905e', '#c2a970', '#d6bf86', '#e8d4a0'], side: ['#6e5a3a', '#8a7249', '#a38a59', '#b89f6a'], pattern: 'sand', sidePattern: 'strata' },
  water: { top: ['#1e4a73', '#2a6395', '#3a7fb6', '#5ea2d4'], side: ['#1a3550', '#22445f', '#2a536f', '#346480'], pattern: 'water', sidePattern: 'none', alpha: 0.85 },
  deepwater: { top: ['#0f2d4d', '#173f66', '#215381', '#2f6a9c'], side: ['#0d2236', '#122c44', '#183753', '#1e4262'], pattern: 'water', sidePattern: 'none', alpha: 0.92 },
  wood: { top: ['#5a3a20', '#74502d', '#8e663a', '#a97f4d'], side: ['#3a2615', '#4d331d', '#614127', '#765032'], pattern: 'planks', sidePattern: 'planks' },
  snow: { top: ['#a9b6c6', '#c6d1dd', '#dfe7ef', '#f6fafd'], side: ['#5a6070', '#717887', '#8a92a0', '#a5acb8'], lip: ['#c6d1dd', '#dfe7ef'], lipDepth: 3, pattern: 'snow', sidePattern: 'rock' },
  swamp: { top: ['#2c3a24', '#3a4a2c', '#4b5c36', '#607044'], side: ['#2a2419', '#3a3122', '#4a3f2c', '#5a4d36'], pattern: 'water', sidePattern: 'strata', alpha: 1 },
  roof: { top: ['#5e2a22', '#7a372b', '#954637', '#b05a46'], side: ['#3a2a1e', '#a89880', '#c8b8a0', '#e0d4bc'], pattern: 'roof', sidePattern: 'timber' },
  thatch: { top: ['#6e5226', '#8c6a32', '#a8843e', '#c4a052'], side: ['#3a2a1e', '#a89880', '#c8b8a0', '#e0d4bc'], pattern: 'thatch', sidePattern: 'timber' },
  slate: { top: ['#2e3440', '#3c4452', '#4c5566', '#5e687a'], side: ['#3a3836', '#57534e', '#706b64', '#8a847b'], pattern: 'slate', sidePattern: 'stonewall' },
  ash: { top: ['#4a4846', '#5e5b58', '#74706b', '#8a857f'], side: ['#2a2826', '#3a3734', '#4a4642', '#5a5550'], pattern: 'ash', sidePattern: 'strata' },
  cave: { top: ['#3a3430', '#4a433d', '#5b534b', '#6e655b'], side: ['#221f1c', '#2f2b27', '#3c3732', '#4a443e'], pattern: 'cave', sidePattern: 'rock' },
  lava: { top: ['#7a1c08', '#b8360c', '#e8661a', '#ffb347'], side: ['#2a1a14', '#3a241a', '#4a2e20', '#5a3826'], pattern: 'noise', sidePattern: 'rock' },
  void: { top: ['#000000', '#000000', '#000000', '#000000'], side: ['#000000', '#000000', '#000000', '#000000'], pattern: 'noise', sidePattern: 'none' },
};

const cache = new Map<string, HTMLCanvasElement>();

function noise(x: number, y: number, seed: number): number {
  return hash2(seed, x, y);
}

/** Smooth value noise in [0,1). */
function vnoise(x: number, y: number, s: number, seed: number): number {
  const fx = x / s, fy = y / s;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const a = noise(x0, y0, seed), b = noise(x0 + 1, y0, seed), c = noise(x0, y0 + 1, seed), d = noise(x0 + 1, y0 + 1, seed);
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function pick(ramp: RGB[], v: number): RGB {
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)));
  return ramp[i];
}

function shade(c: RGB, f: number): RGB {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}

/** Map a top-diamond pixel to diamond-local (u, v) in tile units [0,1). */
function topUV(px: number, py: number): [number, number] {
  // Diamond centre at (HALF_W, HALF_H). Inverse of iso projection.
  const dx = (px - HALF_W + 0.5) / HALF_W;
  const dy = (py - HALF_H + 0.5) / HALF_H;
  return [(dx + dy + 1) / 2, (dy - dx + 1) / 2];
}

function topColor(st: TerrainStyle, ramp: RGB[], u: number, v: number, px: number, py: number, seed: number): RGB {
  const gx = Math.floor(u * 32), gy = Math.floor(v * 32); // texel grid on the tile surface
  const n = vnoise(gx, gy, 6, seed);
  const r = noise(gx, gy, seed + 7);
  switch (st.pattern) {
    case 'grass': {
      let t = 0.25 + n * 0.55;
      if (r > 0.86) t += 0.25;
      if (r < 0.06) t -= 0.25;
      return pick(ramp, t);
    }
    case 'dirt': {
      let t = 0.3 + n * 0.45;
      if (r > 0.93) t = 0.95;
      if (r < 0.05) t = 0.05;
      return pick(ramp, t);
    }
    case 'sand': {
      const ripple = Math.sin((u * 3 + v * 9 + n * 2) * Math.PI) * 0.12;
      return pick(ramp, 0.45 + n * 0.3 + ripple + (r > 0.95 ? 0.2 : 0));
    }
    case 'snow': {
      return pick(ramp, 0.55 + n * 0.35 + (r > 0.97 ? 0.15 : 0) - (r < 0.03 ? 0.2 : 0));
    }
    case 'cobble': {
      // Irregular cobblestones: cell grid with jitter, dark mortar lines.
      const cx = u * 5, cy = v * 5;
      const ix = Math.floor(cx + (Math.floor(cy) % 2) * 0.5), iy = Math.floor(cy);
      const fx = cx + (Math.floor(cy) % 2) * 0.5 - ix, fy = cy - iy;
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      if (edge < 0.09) return ramp[0];
      const cell = noise(ix, iy, seed + 3);
      const hi = fx < 0.3 && fy < 0.3 ? 0.15 : 0;
      return pick(ramp, 0.3 + cell * 0.45 + hi + n * 0.1);
    }
    case 'flag': {
      // Large square flagstones.
      const cx = u * 3, cy = v * 3;
      const ix = Math.floor(cx), iy = Math.floor(cy);
      const fx = cx - ix, fy = cy - iy;
      if (fx < 0.05 || fy < 0.05) return ramp[0];
      const cell = noise(ix, iy, seed + 11);
      return pick(ramp, 0.35 + cell * 0.35 + n * 0.15 + (fx < 0.15 || fy < 0.15 ? 0.12 : 0));
    }
    case 'planks': {
      const row = Math.floor(v * 6);
      const fy = v * 6 - row;
      if (fy < 0.1) return ramp[0];
      const seam = (u * 2 + noise(row, 0, seed) * 2) % 1;
      if (seam < 0.03) return ramp[0];
      const grain = Math.sin((u * 40 + noise(row, 1, seed) * 10)) * 0.08;
      return pick(ramp, 0.4 + noise(row, 2, seed) * 0.3 + grain + (fy < 0.25 ? 0.12 : 0));
    }
    case 'roof': {
      // Overlapping shingles along v.
      const row = Math.floor(v * 7);
      const fy = v * 7 - row;
      const col = Math.floor(u * 6 + (row % 2) * 0.5);
      const fx = u * 6 + (row % 2) * 0.5 - col;
      if (fy > 0.82) return ramp[0];
      if (fx < 0.06) return ramp[0];
      return pick(ramp, 0.35 + noise(col, row, seed) * 0.3 + (1 - fy) * 0.25);
    }
    case 'cave': {
      return pick(ramp, 0.25 + n * 0.5 + (r > 0.9 ? 0.2 : 0));
    }
    case 'thatch': {
      // Straw bundles in rows, ragged edges.
      const row = Math.floor(v * 8);
      const fy = v * 8 - row;
      const streak = noise(Math.floor(u * 40), row, seed);
      return pick(ramp, 0.3 + streak * 0.4 + (fy < 0.2 ? -0.2 : fy > 0.7 ? 0.15 : 0));
    }
    case 'slate': {
      const row = Math.floor(v * 8);
      const fy = v * 8 - row;
      const col = Math.floor(u * 7 + (row % 2) * 0.5);
      const fx = u * 7 + (row % 2) * 0.5 - col;
      if (fy > 0.85 || fx < 0.05) return ramp[0];
      return pick(ramp, 0.35 + noise(col, row, seed) * 0.35 + (fy < 0.25 ? 0.12 : 0));
    }
    case 'ash': {
      return pick(ramp, 0.3 + n * 0.45 + (r > 0.95 ? 0.25 : 0) - (r < 0.04 ? 0.25 : 0));
    }
    case 'water': {
      return pick(ramp, 0.35 + n * 0.4);
    }
    case 'noise':
    default: {
      const crack = r > 0.97 ? -0.3 : 0;
      return pick(ramp, 0.3 + n * 0.5 + crack + (u < 0.06 || v < 0.06 ? 0.15 : 0));
    }
  }
}

function sideColor(st: TerrainStyle, ramp: RGB[], lip: RGB[] | undefined, u: number, depthPx: number, totalPx: number, seed: number, face: 0 | 1): RGB {
  const lipD = st.lipDepth ?? 0;
  if (lip && depthPx < lipD + (noise(Math.floor(u * 32), 9, seed) > 0.6 ? 1 : 0)) return lip[depthPx === 0 ? 1 : 0];
  const gx = Math.floor(u * 32);
  const n = noise(gx, depthPx, seed + face * 13);
  switch (st.sidePattern) {
    case 'brick': {
      const row = Math.floor(depthPx / 5);
      const off = (row % 2) * 8;
      const bx = (gx + off) % 16;
      if (depthPx % 5 === 4 || bx === 0) return ramp[0];
      return pick(ramp, 0.4 + noise(Math.floor((gx + off) / 16), row, seed) * 0.35 + (depthPx % 5 === 0 ? 0.15 : 0));
    }
    case 'planks': {
      if (gx % 8 === 0) return ramp[0];
      return pick(ramp, 0.4 + noise(Math.floor(gx / 8), 0, seed) * 0.3 + n * 0.1);
    }
    case 'rock': {
      const blk = vnoise(gx, depthPx, 5, seed + face);
      return pick(ramp, 0.2 + blk * 0.6 + (n > 0.92 ? 0.2 : 0) - (n < 0.05 ? 0.2 : 0));
    }
    case 'timber': {
      // Plaster panels framed by dark beams, with occasional shuttered windows.
      const beamX = gx % 16 === 0 || gx % 16 === 15;
      const beamY = depthPx % 14 === 0 || depthPx === 1;
      if (beamX || beamY) return ramp[0];
      const winCol = Math.floor(gx / 16);
      const hasWin = noise(winCol, Math.floor(depthPx / 14), seed + 77) > 0.55 && depthPx > 3;
      const wx = gx % 16, wy = depthPx % 14;
      if (hasWin && wx >= 5 && wx <= 10 && wy >= 4 && wy <= 10) return wy === 4 || wx === 5 ? [40, 30, 22] : [58, 70, 92];
      if (gx % 16 === 8 && (depthPx % 14) > 9) return ramp[0];
      return pick(ramp, 0.55 + n * 0.3);
    }
    case 'stonewall': {
      const row = Math.floor(depthPx / 6);
      const off = (row % 2) * 6;
      const bx = (gx + off) % 12;
      if (depthPx % 6 === 5 || bx === 0) return ramp[0];
      const winCol = Math.floor(gx / 16);
      if (noise(winCol, Math.floor(depthPx / 16), seed + 91) > 0.75 && gx % 16 > 6 && gx % 16 < 10 && depthPx % 16 > 4 && depthPx % 16 < 12) return [30, 30, 40];
      return pick(ramp, 0.3 + noise(Math.floor((gx + off) / 12), row, seed) * 0.5 + (depthPx % 6 === 0 ? 0.15 : 0));
    }
    case 'strata': {
      const band = Math.sin((depthPx + vnoise(gx, 0, 8, seed) * 6) * 0.45) * 0.12;
      const pebble = n > 0.94 ? 0.3 : 0;
      return pick(ramp, 0.35 + band + pebble + vnoise(gx, depthPx, 4, seed) * 0.25);
    }
    default: return ramp[1];
  }
}

/**
 * Column sprite for a tile: canvas of size TILE_W × (TILE_H + h*HEIGHT_PX + base).
 * The top diamond's top vertex sits at y=0.
 */
export function columnSprite(t: Terrain, h: number, variant: number): HTMLCanvasElement {
  const key = `${t}|${h}|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const st = TERRAIN_STYLE[t];
  const topRamp = st.top.map(hex);
  const sideRamp = st.side.map(hex);
  const lipRamp = st.lip?.map(hex);
  const colH = Math.max(0, h) * HEIGHT_PX + 6; // extra base so columns don't float
  const W = TILE_W, H = TILE_H + colH;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const seed = (variant * 7919 + t.length * 104729) >>> 0;
  const alpha = Math.round((st.alpha ?? 1) * 255);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let col: RGB | null = null;
      let a = 255;
      // Top diamond: |px - 32|/32 + |py - 16|/16 <= 1
      const dx = Math.abs(px + 0.5 - HALF_W) / HALF_W;
      const dyTop = Math.abs(py + 0.5 - HALF_H) / HALF_H;
      if (dx + dyTop <= 1) {
        const [u, v] = topUV(px, py);
        col = topColor(st, topRamp, u, v, px, py, seed);
        // Rim lighting: lighter top-left edges, darker bottom edges.
        const edge = 1 - (dx + dyTop);
        if (edge < 0.07) col = py < HALF_H ? shade(col, 1.18) : shade(col, 0.8);
        if (t === 'water' || t === 'deepwater' || t === 'swamp') a = alpha;
      } else if (py >= HALF_H) {
        // Faces: left face spans px < 32, right face px >= 32.
        const left = px < HALF_W;
        const edgeY = left ? HALF_H + (px + 0.5) / 2 : HALF_H + (W - px - 0.5) / 2;
        const depth = py - edgeY;
        if (depth >= 0 && depth < colH) {
          const u = left ? px / HALF_W : (px - HALF_W) / HALF_W;
          col = sideColor(st, sideRamp, lipRamp, u, Math.floor(depth), colH, seed, left ? 0 : 1);
          col = shade(col, left ? 0.92 : 0.72);
          // Darken toward the base (ambient occlusion).
          const ao = Math.max(0, (depth - colH + 10) / 10);
          if (ao > 0) col = shade(col, 1 - ao * 0.35);
          // Vertical corner highlight between faces.
          if (px === HALF_W || px === HALF_W - 1) col = shade(col, px === HALF_W - 1 ? 1.1 : 0.85);
          if (t === 'water' || t === 'deepwater') a = alpha;
        }
      }
      if (col) {
        const i = (py * W + px) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // Grass tufts / details on top.
  if (t === 'grass' || t === 'tallgrass') drawTufts(ctx, seed, t === 'tallgrass' ? 9 : 4, topRamp);
  if (t === 'snow') drawSpecks(ctx, seed, '#ffffff', 5);
  if (t === 'dirt' || t === 'road') drawSpecks(ctx, seed, '#3a2a1c', 3);
  cache.set(key, cv);
  return cv;
}

function inTop(x: number, y: number): boolean {
  return Math.abs(x + 0.5 - HALF_W) / HALF_W + Math.abs(y + 0.5 - HALF_H) / HALF_H <= 0.85;
}

function drawTufts(ctx: CanvasRenderingContext2D, seed: number, count: number, ramp: RGB[]): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash2(seed, i, 1) * TILE_W);
    const y = Math.floor(hash2(seed, i, 2) * TILE_H);
    if (!inTop(x, y)) continue;
    const c = ramp[3];
    const c2 = ramp[0];
    ctx.fillStyle = `rgb(${c2[0]},${c2[1]},${c2[2]})`;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x, y - 1, 1, 1);
    ctx.fillRect(x + 1, y - 2, 1, 2);
    ctx.fillRect(x + 2, y - 1, 1, 1);
    if (hash2(seed, i, 3) > 0.8) {
      // tiny flower
      ctx.fillStyle = hash2(seed, i, 4) > 0.5 ? '#f2e36a' : '#e88fb4';
      ctx.fillRect(x + 1, y - 3, 1, 1);
    }
  }
}

function drawSpecks(ctx: CanvasRenderingContext2D, seed: number, color: string, count: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash2(seed, i, 5) * TILE_W);
    const y = Math.floor(hash2(seed, i, 6) * TILE_H);
    if (inTop(x, y)) ctx.fillRect(x, y, 1, 1);
  }
}

/** Diamond path for overlays at a tile's top face (cx, cy = diamond centre). */
export function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, inset = 0): void {
  const hw = HALF_W - inset * 2, hh = HALF_H - inset;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

export function clearTerrainCache(): void {
  cache.clear();
}
