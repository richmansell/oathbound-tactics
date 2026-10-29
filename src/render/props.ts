/**
 * Procedural pixel-art props. Each sprite is rasterised once with shaded
 * primitives (spheres, cylinders, iso boxes) lit from the top-left, with 1px
 * dark outlines, then cached. Anchor = bottom-centre at the tile's centre.
 */
import { hash2 } from '../engine/rng';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Pix {
  data: Uint8ClampedArray;
  constructor(public w: number, public h: number) { this.data = new Uint8ClampedArray(w * h * 4); }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  get(x: number, y: number): number { return this.data[(y * this.w + x) * 4 + 3]; }
  /** Shaded ellipse: ramp dark→light, lit from top-left. */
  sphere(cx: number, cy: number, rx: number, ry: number, ramp: RGB[], seed = 0, rough = 0.15): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        let l = (-nx * 0.55 - ny * 0.65 + nz * 0.55) * 0.5 + 0.5;
        l += (hash2(seed, x, y) - 0.5) * rough;
        const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(l * ramp.length)));
        this.set(x, y, ramp[i]);
      }
    }
  }
  /** Vertical cylinder from (cx, top) to bottom with radius r; ellipse caps. */
  cylinder(cx: number, top: number, bottom: number, r: number, ramp: RGB[], capRamp?: RGB[]): void {
    for (let y = top; y <= bottom; y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const nx = (x + 0.5 - cx) / r;
        if (Math.abs(nx) > 1) continue;
        const l = (-nx * 0.7 + Math.sqrt(1 - nx * nx) * 0.6) * 0.5 + 0.45;
        this.set(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(l * ramp.length)))]);
      }
    }
    if (capRamp) this.sphere(cx, top, r, Math.max(1, r * 0.45), capRamp, 0, 0);
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  /** Iso box with footprint half-width hw and vertical height; (cx, by) = bottom vertex of the footprint. */
  isoBox(cx: number, by: number, hw: number, height: number, top: RGB, left: RGB, right: RGB): void {
    const hh = hw / 2;
    const topCy = by - hh - height;
    for (let y = 0; y < this.h; y++) {
      const fy = y + 0.5;
      for (let x = 0; x < this.w; x++) {
        const dx = x + 0.5 - cx;
        const ax = Math.abs(dx) / hw;
        if (ax > 1) continue;
        if (ax + Math.abs(fy - topCy) / hh <= 1) { this.set(x, y, top); continue; }
        const faceTop = topCy + hh * (1 - ax);
        const faceBottom = by - hh * ax;
        if (fy >= faceTop && fy <= faceBottom) this.set(x, y, dx < 0 ? left : right);
      }
    }
  }
  /** Add 1px dark outline around all opaque pixels. */
  outline(c: RGB): void {
    const src = new Uint8ClampedArray(this.data);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[(y * this.w + x) * 4 + 3] > 0) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
        const xx = x + ox, yy = y + oy;
        return xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[(yy * this.w + xx) * 4 + 3] > 0;
      });
      if (n) this.set(x, y, c);
    }
  }
  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

const R = (...hs: string[]) => hs.map(hex);
const LEAF = R('#173a1c', '#22552a', '#2f7035', '#428a42', '#62a852');
const LEAF_AUTUMN = R('#4a1f10', '#7a3518', '#a8521f', '#cf7a2a', '#e8a64a');
const PINE = R('#0f2a1c', '#173d27', '#215333', '#2e6a40');
const BARK = R('#2a1a10', '#3e2817', '#553821', '#6c4a2d');
const STONE = R('#2e3036', '#45484f', '#5e6269', '#7a7e85', '#9a9ea4');
const MOSSY = R('#2a3328', '#3d4a38', '#556650', '#6e8068');
const WOOD = R('#3b2412', '#55361b', '#704a27', '#8c5f34', '#a8783f');
const IRON = R('#1f2126', '#33363d', '#4b4f57', '#6a6f78');
const CLOTH_RED = R('#4a1010', '#741a1a', '#9c2828', '#c23c3c');
const CLOTH_BLUE = R('#101a4a', '#1a2a74', '#28409c', '#3c5ac2');
const CANVAS_C = R('#6e6450', '#8c8066', '#aa9c80', '#c8b99a');
const HAY = R('#6e5420', '#94742c', '#b8933a', '#d8b450');
const OUT = hex('#141018');
const OUT_SOFT = hex('#1c1a14');

export interface PropSprite {
  canvas: HTMLCanvasElement;
  /** Anchor offset: draw at (tileX - ax, tileY - ay). */
  ax: number;
  ay: number;
  /** Animated flame / glow offset (for campfire, brazier, lamppost). */
  flame?: [number, number];
  tall?: boolean;
}

const cache = new Map<string, PropSprite>();

export function propSprite(type: string, variant: number, theme = 'day'): PropSprite {
  const autumn = theme === 'dusk' && variant % 3 === 0;
  const key = `${type}|${variant % 4}|${autumn ? 1 : 0}|${theme === 'snow' ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sp = build(type, variant % 4, autumn, theme === 'snow');
  cache.set(key, sp);
  return sp;
}

function build(type: string, v: number, autumn: boolean, snowy: boolean): PropSprite {
  const s = v * 31 + type.length * 7;
  switch (type) {
    case 'tree': {
      const p = new Pix(64, 88);
      p.cylinder(32, 50, 82, 4, BARK);
      // roots
      p.rect(27, 80, 3, 3, BARK[1]); p.rect(35, 80, 3, 3, BARK[1]);
      const leaf = autumn ? LEAF_AUTUMN : LEAF;
      const jitter = (i: number) => (hash2(s, i, 0) - 0.5) * 6;
      p.sphere(22 + jitter(1), 46, 14, 12, leaf, s);
      p.sphere(42 + jitter(2), 44, 14, 12, leaf, s + 1);
      p.sphere(32 + jitter(3), 30, 17, 15, leaf, s + 2);
      p.sphere(32 + jitter(4), 18, 11, 10, leaf, s + 3);
      if (snowy) for (let x = 14; x < 50; x++) { const y = 10 + Math.abs(x - 32) * 0.6; if (p.get(x, Math.floor(y)) > 0) p.set(x, y, hex('#f0f6fb')); }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 32, ay: 84, tall: true };
    }
    case 'pine': {
      const p = new Pix(48, 92);
      p.cylinder(24, 70, 88, 3, BARK);
      for (let i = 0; i < 4; i++) {
        const top = 8 + i * 15, w = 8 + i * 5, bot = top + 24;
        for (let y = top; y < bot; y++) {
          const half = ((y - top) / (bot - top)) * w;
          for (let x = Math.floor(24 - half); x <= Math.ceil(24 + half); x++) {
            const nx = (x - 24) / (half + 0.01);
            let l = 0.55 - nx * 0.35 - (y - top) / (bot - top) * 0.25 + (hash2(s, x, y) - 0.5) * 0.2;
            const c = PINE[Math.max(0, Math.min(3, Math.floor(l * 4)))];
            p.set(x, y, snowy && y < top + 4 + (hash2(s, x, 1) * 3) ? hex('#e8f0f6') : c);
          }
        }
      }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 24, ay: 89, tall: true };
    }
    case 'deadtree': {
      const p = new Pix(56, 80);
      p.cylinder(28, 30, 76, 3, BARK);
      const branch = (x0: number, y0: number, dx: number, dy: number, len: number) => {
        for (let i = 0; i < len; i++) p.set(x0 + dx * i, y0 + dy * i, BARK[1 + (i % 2)]);
      };
      branch(28, 40, -1, -0.8, 14); branch(28, 34, 1, -1, 12); branch(28, 30, -0.3, -1, 14); branch(18, 32, -0.6, -0.4, 6); branch(38, 24, 0.8, -0.3, 6);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 28, ay: 77, tall: true };
    }
    case 'bush': {
      const p = new Pix(40, 28);
      const leaf = autumn ? LEAF_AUTUMN : LEAF;
      p.sphere(14, 17, 10, 8, leaf, s); p.sphere(26, 16, 10, 9, leaf, s + 1); p.sphere(20, 12, 9, 7, leaf, s + 2);
      if (v % 2 === 0) for (let i = 0; i < 4; i++) p.set(10 + hash2(s, i, 9) * 22, 8 + hash2(s, i, 8) * 14, hex(i % 2 ? '#d8404a' : '#f0e070'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 20, ay: 25 };
    }
    case 'rock': {
      const p = new Pix(32, 22);
      p.sphere(16, 14, 11, 7, v % 2 ? MOSSY : STONE, s, 0.25);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 16, ay: 19 };
    }
    case 'boulder': {
      const p = new Pix(52, 44);
      p.sphere(24, 26, 19, 15, STONE, s, 0.3);
      p.sphere(34, 30, 12, 10, STONE, s + 1, 0.3);
      if (v % 2) for (let x = 10; x < 40; x++) { const y = 13 + Math.abs(x - 24) * 0.35; if (p.get(x, Math.floor(y)) > 0) p.set(x, y, MOSSY[2]); }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 26, ay: 40, tall: true };
    }
    case 'crate': {
      const p = new Pix(40, 44);
      p.isoBox(20, 40, 15, 20, WOOD[4], WOOD[2], WOOD[1]);
      // planks
      for (let x = 6; x < 34; x += 6) for (let y = 14; y < 40; y++) if (p.get(x, y) > 0 && y > 16) p.set(x, y, WOOD[0]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 20, ay: 40 };
    }
    case 'barrel': {
      const p = new Pix(28, 36);
      p.cylinder(14, 6, 32, 9, WOOD, WOOD.slice(1));
      for (const y of [11, 26]) for (let x = 5; x < 24; x++) if (p.get(x, y) > 0) p.set(x, y, IRON[1]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 14, ay: 33 };
    }
    case 'fence': {
      const p = new Pix(48, 30);
      for (const x of [8, 24, 40]) p.cylinder(x, 6, 27, 2, WOOD);
      for (const y of [11, 19]) for (let x = 6; x < 42; x++) { p.set(x, y + (x - 24) * 0.0, WOOD[3]); p.set(x, y + 1, WOOD[1]); }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 24, ay: 27 };
    }
    case 'tombstone': {
      const p = new Pix(28, 36);
      p.rect(7, 12, 14, 20, STONE[2]);
      p.sphere(14, 12, 7, 6, STONE, s, 0.1);
      p.rect(7, 12, 3, 20, STONE[3]);
      p.rect(18, 12, 3, 20, STONE[1]);
      p.rect(12, 14, 4, 1, STONE[0]); p.rect(13, 12, 2, 6, STONE[0]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 14, ay: 32 };
    }
    case 'pillar': case 'brokenpillar': {
      const tall = type === 'pillar';
      const p = new Pix(32, tall ? 84 : 44);
      const top = tall ? 8 : 12;
      const bot = tall ? 78 : 38;
      p.rect(6, bot - 2, 20, 6, STONE[1]);
      p.cylinder(16, top, bot, 8, STONE);
      for (let x = 10; x < 24; x += 4) for (let y = top + 2; y < bot - 2; y++) if (p.get(x, y)) p.set(x, y, STONE[1]);
      if (tall) p.rect(5, top - 4, 22, 5, STONE[3]);
      else for (let x = 8; x < 25; x++) p.set(x, top + Math.round(hash2(s, x, 2) * 4), [0, 0, 0], 0);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 16, ay: tall ? 82 : 42, tall };
    }
    case 'statue': {
      const p = new Pix(36, 80);
      p.isoBox(18, 76, 14, 14, STONE[3], STONE[2], STONE[1]);
      p.cylinder(18, 30, 58, 6, STONE);
      p.sphere(18, 24, 6, 6, STONE, s, 0.05);
      p.rect(9, 34, 4, 16, STONE[2]); p.rect(23, 32, 4, 10, STONE[2]);
      p.rect(25, 10, 2, 30, STONE[3]); // sword raised
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 18, ay: 77, tall: true };
    }
    case 'banner': {
      const p = new Pix(30, 76);
      p.cylinder(8, 4, 72, 2, WOOD);
      const cloth = v % 2 ? CLOTH_BLUE : CLOTH_RED;
      for (let y = 8; y < 44; y++) for (let x = 10; x < 26; x++) {
        const wave = Math.sin(y * 0.3) * 1.2;
        if (y > 38 && Math.abs(x - 18) < (y - 38) * 1.3) continue;
        p.set(x + wave, y, cloth[x < 14 ? 3 : x < 20 ? 2 : 1]);
      }
      p.sphere(18, 22, 4, 4, R('#a88a20', '#d8b440', '#f0d870'), 0, 0);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 8, ay: 73, tall: true };
    }
    case 'cart': {
      const p = new Pix(56, 40);
      p.isoBox(28, 30, 22, 10, WOOD[3], WOOD[2], WOOD[1]);
      p.sphere(14, 30, 7, 7, WOOD, s, 0); p.sphere(42, 32, 7, 7, WOOD, s, 0);
      p.sphere(14, 30, 2, 2, IRON, 0, 0); p.sphere(42, 32, 2, 2, IRON, 0, 0);
      p.sphere(28, 14, 12, 6, HAY, s);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 28, ay: 37 };
    }
    case 'tent': {
      const p = new Pix(60, 50);
      for (let y = 6; y < 46; y++) {
        const half = (y - 6) * 0.72;
        for (let x = Math.floor(30 - half); x <= Math.ceil(30 + half); x++) {
          const c = x < 30 ? CANVAS_C[3 - Math.floor((30 - x) / (half + 1) * 1.5)] ?? CANVAS_C[2] : CANVAS_C[Math.max(0, 1 - Math.floor((x - 30) / (half + 1) * 1.5))];
          p.set(x, y, c);
        }
      }
      for (let y = 26; y < 46; y++) for (let x = 27; x < 34; x++) p.set(x, y, hex('#2a2018'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 30, ay: 46, tall: true };
    }
    case 'campfire': {
      const p = new Pix(32, 22);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; p.sphere(16 + Math.cos(a) * 9, 15 + Math.sin(a) * 4, 3, 2, STONE, i, 0.1); }
      p.rect(9, 13, 14, 2, WOOD[1]); p.rect(12, 11, 8, 2, WOOD[2]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 16, ay: 18, flame: [16, 10] };
    }
    case 'brazier': {
      const p = new Pix(28, 46);
      p.cylinder(14, 18, 42, 2, IRON);
      p.rect(8, 40, 13, 3, IRON[1]);
      p.sphere(14, 16, 9, 5, IRON, 0, 0.05);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 14, ay: 43, flame: [14, 11] };
    }
    case 'lamppost': {
      const p = new Pix(24, 76);
      p.cylinder(12, 14, 72, 2, IRON);
      p.isoBox(12, 18, 6, 8, IRON[3], IRON[2], IRON[1]);
      p.rect(9, 9, 7, 7, hex('#f0c060'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 12, ay: 73, flame: [12, 12], tall: true };
    }
    case 'well': {
      const p = new Pix(52, 56);
      p.cylinder(26, 30, 48, 15, STONE, R('#10161e', '#1a2430'));
      p.rect(10, 8, 3, 30, WOOD[2]); p.rect(39, 8, 3, 30, WOOD[1]);
      for (let x = 6; x < 46; x++) { const y = 6 + Math.abs(x - 26) * 0.25; p.set(x, y, hex('#7a3020')); p.set(x, y + 1, hex('#5a2018')); }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 26, ay: 50, tall: true };
    }
    case 'haybale': {
      const p = new Pix(36, 30);
      p.sphere(18, 17, 14, 10, HAY, s, 0.3);
      for (let x = 6; x < 30; x++) if (p.get(x, 16)) p.set(x, 16, HAY[0]);
      p.outline(OUT_SOFT);
      return { canvas: p.toCanvas(), ax: 18, ay: 27 };
    }
    case 'altar': {
      const p = new Pix(48, 40);
      p.isoBox(24, 38, 20, 14, STONE[4], STONE[2], STONE[1]);
      p.rect(19, 4, 10, 2, hex('#d8b440')); p.rect(23, 0, 2, 12, hex('#d8b440'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 24, ay: 37 };
    }
    case 'bookshelf': {
      const p = new Pix(40, 60);
      p.isoBox(20, 56, 16, 40, WOOD[3], WOOD[2], WOOD[1]);
      for (let row = 0; row < 4; row++) for (let x = 6; x < 20; x++) {
        const y0 = 22 + row * 9 + Math.floor((20 - x) * 0.5);
        const book = R('#7a2020', '#204a7a', '#2a6a30', '#7a6a20')[Math.floor(hash2(s, x, row) * 4)];
        for (let y = y0; y < y0 + 6; y++) p.set(x, y, book);
      }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 20, ay: 56, tall: true };
    }
    case 'table': {
      const p = new Pix(44, 32);
      p.isoBox(22, 22, 18, 3, WOOD[4], WOOD[2], WOOD[1]);
      for (const [x, y] of [[8, 22], [36, 22], [22, 29]] as const) p.rect(x, y - 4, 2, 9, WOOD[1]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 22, ay: 30 };
    }
    case 'stump': {
      const p = new Pix(28, 20);
      p.cylinder(14, 8, 15, 8, BARK, R('#8c6a40', '#a8844e', '#c09a5c'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 14, ay: 17 };
    }
    case 'flowers': {
      const p = new Pix(32, 16);
      for (let i = 0; i < 9; i++) {
        const x = 4 + hash2(s, i, 1) * 24, y = 4 + hash2(s, i, 2) * 9;
        p.set(x, y + 1, LEAF[2]); p.set(x, y + 2, LEAF[1]);
        p.set(x, y, hex(['#f0e070', '#e870a0', '#f0f0f0', '#a070e0'][i % 4]));
      }
      return { canvas: p.toCanvas(), ax: 16, ay: 12 };
    }
    case 'reeds': {
      const p = new Pix(28, 28);
      for (let i = 0; i < 8; i++) {
        const x = 4 + hash2(s, i, 1) * 20, h = 10 + hash2(s, i, 2) * 14;
        for (let y = 0; y < h; y++) p.set(x + y * 0.08, 26 - y, LEAF[y > h - 4 ? 4 : 2]);
        p.set(x + h * 0.08, 26 - h, hex('#6a4a2a')); p.set(x + h * 0.08, 27 - h, hex('#6a4a2a'));
      }
      return { canvas: p.toCanvas(), ax: 14, ay: 25 };
    }
    case 'mushroom': {
      const p = new Pix(24, 18);
      p.rect(10, 9, 3, 6, hex('#e8dcc0'));
      p.sphere(11, 8, 7, 4, R('#6a1010', '#a02020', '#d03a3a'), 0, 0);
      p.set(9, 6, hex('#ffffff')); p.set(13, 7, hex('#ffffff'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 12, ay: 15 };
    }
    case 'sign': {
      const p = new Pix(28, 40);
      p.cylinder(14, 12, 36, 2, WOOD);
      p.rect(3, 8, 22, 10, WOOD[3]); p.rect(3, 16, 22, 2, WOOD[1]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 14, ay: 37 };
    }
    case 'bones': {
      const p = new Pix(28, 14);
      const B = R('#8a8478', '#bdb6a6', '#e2dccb');
      p.sphere(9, 7, 4, 3, B, 0, 0);
      p.rect(13, 7, 10, 2, B[1]); p.rect(16, 4, 2, 8, B[2]);
      p.outline(OUT_SOFT);
      return { canvas: p.toCanvas(), ax: 14, ay: 11 };
    }
    case 'standingstone': {
      // tall rough-hewn monolith, slightly leaning, lichen patches
      const p = new Pix(30, 62);
      const lean = (v % 2 ? 1 : -1) * 0.06;
      for (let y = 6; y < 58; y++) {
        const t = (y - 6) / 52;
        const half = 6 + t * 3 + Math.sin(y * 0.7 + v) * 0.6;
        const cx = 15 + (58 - y) * lean;
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          const nx = (x + 0.5 - cx) / half;
          if (Math.abs(nx) > 1) continue;
          let l = 0.55 - nx * 0.4 - t * 0.12 + (hash2(s, x, y) - 0.5) * 0.18;
          if (y < 9 + Math.abs(nx) * 3) l += 0.15;
          p.set(x, y, STONE[Math.max(0, Math.min(4, Math.floor(l * 5)))]);
        }
      }
      for (let i = 0; i < 14; i++) { const x = 9 + hash2(s, i, 3) * 10, y = 20 + hash2(s, i, 4) * 34; if (p.get(Math.round(x), Math.round(y))) p.set(x, y, MOSSY[2 + (i % 2)]); }
      p.rect(8, 57, 15, 2, hex('#2a2a24'));
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 15, ay: 58, tall: true };
    }
    case 'gallows': {
      const p = new Pix(52, 88);
      p.isoBox(16, 86, 12, 4, WOOD[3], WOOD[2], WOOD[1]);
      p.cylinder(14, 10, 80, 3, WOOD);
      for (let x = 12; x < 44; x++) { p.set(x, 10, WOOD[3]); p.set(x, 11, WOOD[2]); p.set(x, 12, WOOD[1]); }
      for (let i = 0; i < 12; i++) { p.set(15 + i, 24 - i, WOOD[2]); p.set(16 + i, 24 - i, WOOD[1]); }
      const rope = hex('#b89a60');
      for (let y = 13; y < 34; y++) p.set(38 + Math.sin(y * 0.4) * 0.4, y, rope);
      for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; p.set(38 + Math.cos(t) * 3, 37 + Math.sin(t) * 3.5, rope); }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 16, ay: 85, tall: true };
    }
    case 'stall': {
      // market stall: plank counter, four posts and a striped canvas awning
      const p = new Pix(60, 60);
      p.isoBox(30, 54, 22, 12, WOOD[3], WOOD[2], WOOD[1]);
      for (const [x, top] of [[10, 20], [50, 20], [24, 26], [36, 26]] as const) p.cylinder(x, top, 50, 1.5, WOOD);
      const stripe = v % 2 ? CLOTH_BLUE : CLOTH_RED;
      for (let y = 6; y < 26; y++) {
        const t = (y - 6) / 20;
        const half = 14 + t * 14;
        for (let x = Math.floor(30 - half); x <= Math.ceil(30 + half); x++) {
          const band = Math.floor((x - 30 + 40) / 5) % 2 === 0;
          const shade = x < 30 ? 1 : 0;
          const c = band ? stripe[2 + shade] : CANVAS_C[2 + shade];
          p.set(x, y, c);
        }
      }
      for (let x = 2; x < 58; x += 2) p.set(x, 26, (Math.floor((x - 30 + 40) / 5) % 2 === 0 ? stripe : CANVAS_C)[1]);
      // goods on the counter
      for (let i = 0; i < 6; i++) {
        const gx = 18 + i * 5, gy = 38 + (i % 2);
        p.sphere(gx, gy, 2.4, 2, [R('#7a2010', '#b83a20', '#e06a3a'), HAY, R('#2a5a20', '#3e8030', '#62a850')][i % 3], s + i, 0);
      }
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 30, ay: 55, tall: true };
    }
    case 'cross': {
      // wayside cross on a stepped plinth
      const p = new Pix(30, 64);
      p.isoBox(15, 62, 11, 4, STONE[3], STONE[2], STONE[1]);
      p.isoBox(15, 57, 7, 4, STONE[4], STONE[2], STONE[1]);
      p.rect(13, 12, 5, 42, STONE[2]); p.rect(13, 12, 2, 42, STONE[3]); p.rect(17, 12, 1, 42, STONE[1]);
      p.rect(6, 20, 19, 5, STONE[2]); p.rect(6, 20, 19, 2, STONE[3]); p.rect(6, 24, 19, 1, STONE[1]);
      for (let i = 0; i < 6; i++) p.set(12 + hash2(s, i, 5) * 7, 30 + hash2(s, i, 6) * 20, MOSSY[2]);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 15, ay: 61, tall: true };
    }
    default: {
      const p = new Pix(24, 24);
      p.sphere(12, 14, 8, 6, STONE, s);
      p.outline(OUT);
      return { canvas: p.toCanvas(), ax: 12, ay: 20 };
    }
  }
}
