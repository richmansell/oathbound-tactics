/**
 * Layered pixel scene. Each pixel stores (object, ramp, level). Objects are drawn
 * painter-style in creation order; post passes then add cast shadows, clean orphan
 * pixels, and draw selective outlines — the things that make shapes read as pixel art.
 */
import type { Ramp, RGB } from './palette';
import type { SDF } from './geom';

export interface OutlineSpec {
  /** Level used where the object borders empty space (−1 = none). */
  bg?: number;
  /** Level for empty-space borders on the lit (top/left) side; defaults to bg. */
  bgLit?: number;
  /** Level where the object overlaps an object behind it; negative = darken own level by that much. */
  over?: number;
  /** Same as `over` but when the object behind shares this object's family. */
  family?: number;
  /** Only outline against these sides ('t','b','l','r'); default all. */
  sides?: string;
}

export interface ObjOpts {
  ramp: Ramp;
  kind?: string;
  family?: string;
  outline?: OutlineSpec | false;
  cast?: boolean;
  receive?: boolean;
  /** Exclude from orphan cleanup (hand-authored sprites). */
  exact?: boolean;
}

export interface Obj extends ObjOpts {
  id: number;
  rampId: number;
}

export class Scene {
  readonly w: number;
  readonly h: number;
  obj: Int16Array;
  ramp: Int16Array;
  lvl: Int8Array;
  objs: Obj[] = [];
  ramps: Ramp[] = [];
  private rampIndex = new Map<Ramp, number>();

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.obj = new Int16Array(w * h).fill(-1);
    this.ramp = new Int16Array(w * h).fill(-1);
    this.lvl = new Int8Array(w * h);
  }

  rampId(r: Ramp): number {
    let i = this.rampIndex.get(r);
    if (i === undefined) { i = this.ramps.length; this.ramps.push(r); this.rampIndex.set(r, i); }
    return i;
  }

  add(o: ObjOpts): Obj {
    const obj: Obj = { cast: true, receive: true, outline: { bg: 0, over: 1 }, ...o, id: this.objs.length, rampId: this.rampId(o.ramp) };
    this.objs.push(obj);
    return obj;
  }

  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x: number, y: number): number { return this.inside(x, y) ? this.obj[y * this.w + x] : -1; }
  objAt(x: number, y: number): Obj | undefined { const i = this.at(x, y); return i >= 0 ? this.objs[i] : undefined; }
  kindAt(x: number, y: number): string | undefined { return this.objAt(x, y)?.kind; }
  levelAt(x: number, y: number): number { return this.inside(x, y) ? this.lvl[y * this.w + x] : 0; }

  set(x: number, y: number, o: Obj, level: number, ramp?: Ramp) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.obj[i] = o.id;
    this.ramp[i] = ramp ? this.rampId(ramp) : o.rampId;
    this.lvl[i] = Math.max(0, Math.min(5, Math.round(level)));
  }

  /** Change only the level of an existing pixel (shading overlays). */
  shade(x: number, y: number, level: number) {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    if (this.obj[i] < 0) return;
    this.lvl[i] = Math.max(0, Math.min(5, Math.round(level)));
  }
  darken(x: number, y: number, by = 1, min = 1) {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    if (this.obj[i] < 0) return;
    this.lvl[i] = Math.max(min, this.lvl[i] - by);
  }
  erase(x: number, y: number) {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.obj[i] = -1; this.ramp[i] = -1;
  }

  /**
   * Fill a shape. `shade` returns a ramp level (or null to skip the pixel).
   * `where` optionally restricts painting to pixels currently satisfying a predicate.
   */
  fill(o: Obj, sdf: SDF, shade: (x: number, y: number, d: number) => number | null,
    bbox?: [number, number, number, number], where?: (x: number, y: number) => boolean) {
    let [x0, y0, x1, y1] = bbox ?? [0, 0, this.w - 1, this.h - 1];
    if (sdf.bbox) {
      x0 = Math.max(x0, sdf.bbox[0]); y0 = Math.max(y0, sdf.bbox[1]);
      x1 = Math.min(x1, sdf.bbox[2]); y1 = Math.min(y1, sdf.bbox[3]);
    }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
        const d = sdf(x + 0.5, y + 0.5);
        if (d > 0) continue;
        if (where && !where(x, y)) continue;
        const lv = shade(x + 0.5, y + 0.5, d);
        if (lv === null) continue;
        this.set(x, y, o, lv);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Post passes
  // ---------------------------------------------------------------------------

  /** Objects marked `cast` darken `receive` objects behind them, offset down-right (light top-left). */
  castShadows(dx = 1, dy = 2) {
    const { w, h } = this;
    const out = new Int8Array(this.lvl);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = this.obj[i];
      if (a < 0) continue;
      const A = this.objs[a];
      if (!A.receive) continue;
      let shadow = false;
      for (let k = 1; k <= dy && !shadow; k++) {
        const sx = x - Math.round((dx * k) / dy), sy = y - k;
        const b = this.at(sx, sy);
        if (b > a) {
          const B = this.objs[b];
          if (B.cast && (!A.family || A.family !== B.family)) shadow = true;
        }
      }
      if (shadow) out[i] = Math.max(1, this.lvl[i] - 1);
    }
    this.lvl = out;
  }

  /** Remove single pixels whose 4 same-object neighbours all share another level. */
  cleanOrphans(passes = 1) {
    const { w, h } = this;
    for (let p = 0; p < passes; p++) {
      const out = new Int8Array(this.lvl);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = this.obj[i];
        if (a < 0 || this.objs[a].exact || this.ramp[i] !== this.objs[a].rampId) continue;
        const n = [i - 1, i + 1, i - w, i + w];
        let same = true, L = -1, cnt = 0;
        for (const j of n) {
          if (this.obj[j] !== a || this.ramp[j] !== this.ramp[i]) continue;
          cnt++;
          if (L < 0) L = this.lvl[j];
          else if (this.lvl[j] !== L) same = false;
        }
        if (cnt >= 3 && same && L >= 0 && L !== this.lvl[i]) out[i] = L;
      }
      this.lvl = out;
    }
  }

  /** Remove 1-pixel spurs from object silhouettes (pixels with ≤1 same-object neighbour). */
  cleanSpurs() {
    const { w, h } = this;
    const kill: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = this.obj[i];
      if (a < 0 || this.objs[a].exact) continue;
      let c = 0;
      if (this.at(x - 1, y) === a) c++;
      if (this.at(x + 1, y) === a) c++;
      if (this.at(x, y - 1) === a) c++;
      if (this.at(x, y + 1) === a) c++;
      if (c <= 1) kill.push(i);
    }
    for (const i of kill) {
      // Replace with whatever object is below: we don't keep history, so take the most common neighbour.
      const x = i % w, y = (i / w) | 0;
      const cand = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .map(([a, b]) => (this.inside(a, b) ? a + b * w : -1)).filter((j) => j >= 0 && this.obj[j] !== this.obj[i]);
      if (cand.length === 0) continue;
      const j = cand[0];
      this.obj[i] = this.obj[j]; this.ramp[i] = this.ramp[j]; this.lvl[i] = this.lvl[j];
    }
  }

  outlines() {
    const { w, h } = this;
    const out = new Int8Array(this.lvl);
    const dirs: [number, number, string][] = [[-1, 0, 'l'], [1, 0, 'r'], [0, -1, 't'], [0, 1, 'b']];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = this.obj[i];
      if (a < 0) continue;
      const A = this.objs[a];
      const spec = A.outline;
      if (!spec) continue;
      let bgUnlit = false, bgLit = false, over = false, fam = false;
      for (const [dx, dy, s] of dirs) {
        if (spec.sides && !spec.sides.includes(s)) continue;
        const nx = x + dx, ny = y + dy;
        // Canvas edges are not outlined (shapes are cropped by the frame).
        if (!this.inside(nx, ny)) continue;
        const b = this.obj[ny * w + nx];
        if (b < 0) { if (s === 'l' || s === 't') bgLit = true; else bgUnlit = true; }
        else if (b < a) {
          const B = this.objs[b];
          if (A.family && B.family === A.family) fam = true; else over = true;
        }
      }
      const lv = this.lvl[i];
      const apply = (v: number | undefined) => (v === undefined || v === null ? lv : v < 0 ? Math.max(0, lv + v) : v);
      if (bgUnlit && spec.bg !== undefined && spec.bg >= 0) out[i] = spec.bg;
      else if (bgLit && (spec.bgLit ?? spec.bg) !== undefined && (spec.bgLit ?? spec.bg)! >= 0) out[i] = (spec.bgLit ?? spec.bg)!;
      else if (over && spec.over !== undefined) out[i] = Math.min(lv, apply(spec.over));
      else if (fam && spec.family !== undefined) out[i] = Math.min(lv, apply(spec.family));
    }
    this.lvl = out;
  }

  /** Resolve to RGBA. */
  toRGBA(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      if (this.obj[i] < 0) continue;
      const r = this.ramps[this.ramp[i]];
      const c: RGB = r[Math.min(r.length - 1, Math.max(0, this.lvl[i]))];
      data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255;
    }
    return data;
  }
}

/** Parse a hand-authored pixel sprite: rows of chars, '.' or ' ' = transparent. */
export function parseSprite(rows: string[]): { w: number; h: number; at: (x: number, y: number) => string } {
  const w = Math.max(...rows.map((r) => r.length));
  return { w, h: rows.length, at: (x, y) => { const c = rows[y]?.[x]; return c === undefined || c === '.' || c === ' ' ? '' : c; } };
}
