/**
 * Set pieces: hand-designed-feeling places stamped over generated terrain.
 *
 * A builder receives a `Stamp` — a local grid over the set piece's footprint holding a snapshot
 * of the natural (generated) tiles — and paints terrain columns, heights (relative to the stamp's
 * flattened ground level `base`) and props with the helpers below. Buildings are raised columns
 * with roof terrain on top (gable profile), walls are stone columns, gates are openings. Builders
 * read the natural snapshot to adapt to rivers, lakes, coasts and the roads that the world
 * generator routed to their gates. Everything is seeded by the set piece id → stable layouts.
 *
 * Cell semantics:  t = KEEP → keep natural terrain;  dh = NAT_H → keep natural height;
 *                  prop = KEEP → keep natural prop.  Natural water under an untouched cell is kept.
 */
import type { Terrain } from '../engine/types';
import type { SetPieceDef, Side } from './geography';
import { clamp, fbm, hash01, hash32, smoothstep } from './noise';
import { F_BRIDGE, F_ROAD, P, PROP_BLOCKS_CODE, T, T_WALKABLE, T_WATER } from './tables';

export const KEEP = 255;
export const NAT_H = -32768;

export interface SetPieceInfo {
  id: string;
  name: string;
  builder: string;
  /** Footprint in world tiles, x1/y1 exclusive. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  center: [number, number];
  /** Flattened ground height. */
  base: number;
  gates: { side: Side; id?: string; x: number; y: number }[];
  /** Named sub-locations (world tiles), e.g. square, inn, gate_n. */
  locations: Record<string, [number, number]>;
  /** Walkable street/road tile nearest the centre — where travellers arrive. */
  hub: [number, number];
}

export interface StampInput {
  def: SetPieceDef;
  seed: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  natH: Int16Array;
  natT: Uint8Array;
  natProp: Uint8Array;
  natFlags: Uint8Array;
  /** Gate positions in local coordinates. */
  gates: { side: Side; id?: string; x: number; y: number }[];
}

type RoofT = 'thatch' | 'roof' | 'slate';
export interface BuildingOpts {
  wall: number;
  roof: RoofT;
  /** Ridge rise above the eaves (default by width). */
  ridge?: number;
  /** Flat roof (no gable). */
  flat?: boolean;
  /** Floor offset (dh of the ground under the building). */
  floor?: number;
  /** Force ridge axis. */
  axis?: 'x' | 'y';
}

export interface PlotStyle {
  roofs: [RoofT, number][];
  wall: [number, number];
  maxSize: number;
  minSize?: number;
  alley?: number;
  garden?: number;
  floor?: number;
  /** Terrain for alleys / leftover ground (default dirt). */
  alleyT?: Terrain;
  gardenProps?: string[];
  /** Chance a building leaves a 1-cell gap on its east/south side (detached houses). */
  gap?: number;
}

export class Stamp {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly seed: number;
  readonly def: SetPieceDef;
  base: number;
  readonly t: Uint8Array;
  readonly dh: Int16Array;
  readonly prop: Uint8Array;
  readonly flags: Uint8Array;
  readonly reserved: Uint8Array;
  readonly natH: Int16Array;
  readonly natT: Uint8Array;
  readonly natProp: Uint8Array;
  readonly natFlags: Uint8Array;
  readonly gates: { side: Side; id?: string; x: number; y: number }[];
  readonly locations: Record<string, [number, number]> = {};
  private rdist?: Int16Array;
  private wdist?: Int16Array;
  private salt = 0;

  constructor(inp: StampInput) {
    this.w = inp.w; this.h = inp.h; this.ox = inp.x0; this.oy = inp.y0; this.seed = inp.seed; this.def = inp.def;
    const n = inp.w * inp.h;
    this.t = new Uint8Array(n).fill(KEEP);
    this.dh = new Int16Array(n);
    this.prop = new Uint8Array(n).fill(KEEP);
    this.flags = new Uint8Array(n);
    this.reserved = new Uint8Array(n);
    this.natH = inp.natH; this.natT = inp.natT; this.natProp = inp.natProp; this.natFlags = inp.natFlags;
    this.gates = inp.gates;
    // Base: median natural land height, at least one above any water inside the footprint.
    const land: number[] = [];
    let maxWater = -Infinity;
    for (let i = 0; i < n; i++) {
      if (T_WATER[this.natT[i]] && !(this.natFlags[i] & F_BRIDGE)) maxWater = Math.max(maxWater, this.natH[i]);
      else land.push(this.natH[i]);
    }
    land.sort((a, b) => a - b);
    const med = land.length ? land[Math.floor(land.length / 2)] : maxWater + 1;
    this.base = Math.max(med, maxWater + 1);
  }

  // ------------------------------------------------------------------ queries
  i(x: number, y: number): number { return y * this.w + x; }
  inb(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  nWater(x: number, y: number): boolean {
    if (!this.inb(x, y)) return false;
    const i = this.i(x, y);
    return T_WATER[this.natT[i]] === 1 && !(this.natFlags[i] & F_BRIDGE);
  }
  nDeep(x: number, y: number): boolean { return this.inb(x, y) && this.natT[this.i(x, y)] === T.deepwater; }
  nRoad(x: number, y: number): boolean { return this.inb(x, y) && (this.natFlags[this.i(x, y)] & F_ROAD) !== 0; }
  nBridge(x: number, y: number): boolean { return this.inb(x, y) && (this.natFlags[this.i(x, y)] & F_BRIDGE) !== 0; }
  /** Natural height relative to base. */
  nH(x: number, y: number): number { return this.natH[this.i(clamp(x, 0, this.w - 1), clamp(y, 0, this.h - 1))] - this.base; }
  rand(a: number, b = 0, c = 0): number { return hash01(this.seed + c * 977, a, b); }
  /** Sequential deterministic random numbers. */
  next(): number { return hash01(this.seed ^ 0x5bd1e995, this.salt++, 77); }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  gate(side: Side, id?: string): { x: number; y: number } | undefined {
    return this.gates.find((g) => g.side === side && (id === undefined || g.id === id));
  }
  free(x: number, y: number): boolean { return this.inb(x, y) && !this.reserved[this.i(x, y)] && !this.nWater(x, y); }
  rectFree(x0: number, y0: number, w: number, h: number, margin = 0): boolean {
    for (let y = y0 - margin; y < y0 + h + margin; y++) for (let x = x0 - margin; x < x0 + w + margin; x++) if (!this.free(x, y)) return false;
    return true;
  }
  /** BFS distance (4-neighbour) from natural road cells, capped at 999. */
  roadDist(): Int16Array {
    if (!this.rdist) this.rdist = this.bfs((x, y) => this.nRoad(x, y) || (this.flags[this.i(x, y)] & F_ROAD) !== 0);
    return this.rdist;
  }
  resetRoadDist(): void { this.rdist = undefined; }
  waterDist(): Int16Array {
    if (!this.wdist) this.wdist = this.bfs((x, y) => this.nWater(x, y));
    return this.wdist;
  }
  private bfs(seed: (x: number, y: number) => boolean): Int16Array {
    const n = this.w * this.h, d = new Int16Array(n).fill(999), q = new Int32Array(n);
    let qh = 0, qt = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (seed(x, y)) { d[this.i(x, y)] = 0; q[qt++] = this.i(x, y); }
    while (qh < qt) {
      const c = q[qh++], cx = c % this.w, cy = (c / this.w) | 0, nd = d[c] + 1;
      if (cx > 0 && d[c - 1] > nd) { d[c - 1] = nd; q[qt++] = c - 1; }
      if (cx < this.w - 1 && d[c + 1] > nd) { d[c + 1] = nd; q[qt++] = c + 1; }
      if (cy > 0 && d[c - this.w] > nd) { d[c - this.w] = nd; q[qt++] = c - this.w; }
      if (cy < this.h - 1 && d[c + this.w] > nd) { d[c + this.w] = nd; q[qt++] = c + this.w; }
    }
    return d;
  }
  /** Distance to the footprint edge (for tapering sculpted heights). */
  edgeDist(x: number, y: number): number { return Math.min(x, y, this.w - 1 - x, this.h - 1 - y); }
  /** Principal direction of the natural road cells (unit vector), or null. */
  roadAxis(): { cx: number; cy: number; dx: number; dy: number } | null {
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.nRoad(x, y)) { n++; sx += x; sy += y; }
    if (n < 4) return null;
    const mx = sx / n, my = sy / n;
    let xx = 0, xy = 0, yy = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.nRoad(x, y)) { const a = x - mx, b = y - my; xx += a * a; xy += a * b; yy += b * b; }
    const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
    return { cx: mx, cy: my, dx: Math.cos(ang), dy: Math.sin(ang) };
  }

  // ------------------------------------------------------------------ painting
  set(x: number, y: number, t: Terrain | null, dh = 0, prop: string | null = '', flags = 0): void {
    if (!this.inb(x, y)) return;
    const i = this.i(x, y);
    this.t[i] = t === null ? KEEP : T[t];
    this.dh[i] = dh;
    this.prop[i] = prop === null ? KEEP : prop === '' ? 0 : P[prop] ?? 0;
    this.flags[i] = flags;
  }
  fill(x0: number, y0: number, w: number, h: number, t: Terrain | null, dh = 0, prop: string | null = '', flags = 0, reserve = true): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!this.inb(x, y)) continue;
      this.set(x, y, t, dh, prop, flags);
      if (reserve) this.reserved[this.i(x, y)] = 1;
    }
  }
  /** Fill only cells that aren't natural water. */
  fillDry(x0: number, y0: number, w: number, h: number, t: Terrain | null, dh = 0, prop: string | null = '', flags = 0): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inb(x, y) && !this.nWater(x, y)) { this.set(x, y, t, dh, prop, flags); this.reserved[this.i(x, y)] = 1; }
  }
  setProp(x: number, y: number, prop: string): void {
    if (!this.inb(x, y)) return;
    this.prop[this.i(x, y)] = prop === '' ? 0 : P[prop] ?? 0;
  }
  /** Put a prop only where the cell is ground (not water, not a roof). */
  propIfOpen(x: number, y: number, prop: string): boolean {
    if (!this.inb(x, y)) return false;
    const i = this.i(x, y);
    const t = this.t[i] === KEEP ? this.natT[i] : this.t[i];
    if (T_WATER[t] || t === T.roof || t === T.thatch || t === T.slate || (this.flags[i] & F_ROAD)) return false;
    this.prop[i] = P[prop] ?? 0;
    return true;
  }
  getDh(x: number, y: number): number { return this.inb(x, y) ? this.dh[this.i(x, y)] : 0; }
  getT(x: number, y: number): number { if (!this.inb(x, y)) return T.void; const i = this.i(x, y); return this.t[i] === KEEP ? this.natT[i] : this.t[i]; }
  reserve(x0: number, y0: number, w: number, h: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inb(x, y)) this.reserved[this.i(x, y)] = 1;
  }
  mark(name: string, x: number, y: number): void { this.locations[name] = [Math.round(x), Math.round(y)]; }

  /** Gable-roofed building: walls `wall` high, ridge along the long axis. */
  building(x0: number, y0: number, bw: number, bh: number, o: BuildingOpts): void {
    const axis = o.axis ?? (bw >= bh ? 'x' : 'y');
    const short = axis === 'x' ? bh : bw;
    const ridge = o.flat ? 0 : o.ridge ?? (short >= 7 ? 3 : short >= 5 ? 2 : short >= 3 ? 1 : 0);
    const half = (short - 1) / 2;
    const floor = o.floor ?? 0;
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) {
      if (!this.inb(x, y)) continue;
      const c = axis === 'x' ? y - y0 : x - x0;
      const rise = half <= 0 ? ridge : Math.max(0, Math.round(ridge * (1 - Math.abs(c - half) / Math.max(half, 0.5))));
      this.set(x, y, o.roof, floor + o.wall + rise, '');
      this.reserved[this.i(x, y)] = 1;
    }
  }
  /** Square/rect tower; crenellated stone top or a slate cone. */
  tower(x0: number, y0: number, tw: number, th: number, height: number, style: 'crenel' | 'cone' | 'flat' = 'crenel', top: Terrain = 'stone'): void {
    const cx = x0 + (tw - 1) / 2, cy = y0 + (th - 1) / 2;
    for (let y = y0; y < y0 + th; y++) for (let x = x0; x < x0 + tw; x++) {
      const edge = x === x0 || y === y0 || x === x0 + tw - 1 || y === y0 + th - 1;
      let dh = height, t: Terrain = top;
      if (style === 'crenel' && edge && (x + y) % 2 === 0) dh += 1;
      if (style === 'cone') { t = 'slate'; dh = height + Math.round(Math.min(tw, th) / 2 - Math.max(Math.abs(x - cx), Math.abs(y - cy))); }
      this.set(x, y, t, dh, '');
      if (this.inb(x, y)) this.reserved[this.i(x, y)] = 1;
    }
  }
  /** Axis-aligned wall segment (thickness grows toward +x / +y). Crenels on the outer row. */
  wall(x0: number, y0: number, x1: number, y1: number, height: number, thick = 2, outer: Side = 'n', t: Terrain = 'stone', skipWater = true): void {
    const horiz = y0 === y1;
    for (let k = 0; k < thick; k++) {
      const steps = horiz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
      for (let s = 0; s <= steps; s++) {
        const x = horiz ? Math.min(x0, x1) + s : x0 + k;
        const y = horiz ? y0 + k : Math.min(y0, y1) + s;
        if (!this.inb(x, y) || (skipWater && this.nWater(x, y))) continue;
        const outerRow = (outer === 'n' && horiz && k === 0) || (outer === 's' && horiz && k === thick - 1)
          || (outer === 'w' && !horiz && k === 0) || (outer === 'e' && !horiz && k === thick - 1);
        const merlon = outerRow && thick > 1 && (x + y) % 2 === 0;
        this.set(x, y, t, height + (merlon ? 1 : 0), '');
        this.reserved[this.i(x, y)] = 1;
      }
    }
  }
  /** Thick line of ground (streets, paths). Diagonals allowed. */
  line(x0: number, y0: number, x1: number, y1: number, width: number, t: Terrain, dh = 0, flags = F_ROAD, overWater: Terrain | null = 'wood'): void {
    const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const r = (width - 1) / 2;
    for (let s = 0; s <= len; s++) {
      const cx = x0 + ((x1 - x0) * s) / len, cy = y0 + ((y1 - y0) * s) / len;
      for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++) for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
        const x = Math.round(cx + ox), y = Math.round(cy + oy);
        if (!this.inb(x, y)) continue;
        if (Math.abs(ox) > r + 0.01 && Math.abs(oy) > r + 0.01) continue;
        if (Math.max(Math.abs(cx + ox - Math.round(cx + ox)), 0) > 0.5) continue;
        const w = this.nWater(x, y);
        if (w && overWater === null) continue;
        this.set(x, y, w ? overWater : t, dh, '', flags | (w ? F_BRIDGE : 0));
        this.reserved[this.i(x, y)] = 1;
      }
    }
  }
  /** Iterate cells within radius r of (cx, cy). */
  disc(cx: number, cy: number, r: number, cb: (x: number, y: number, d: number) => void): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!this.inb(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) cb(x, y, d);
    }
  }

  /** Fill a block with buildings and gardens by recursive subdivision. */
  plots(x0: number, y0: number, pw: number, ph: number, st: PlotStyle): number {
    let count = 0;
    const min = st.minSize ?? 3;
    const leaf = (x: number, y: number, w: number, h: number) => {
      if (w < 2 || h < 2) return;
      // shrink away from non-free cells
      let ax = x, ay = y, bx = x + w - 1, by = y + h - 1, changed = true;
      while (changed && ax <= bx && ay <= by) {
        changed = false;
        for (let xx = ax; xx <= bx; xx++) if (!this.free(xx, ay)) { ay++; changed = true; break; }
        if (changed) continue;
        for (let xx = ax; xx <= bx; xx++) if (!this.free(xx, by)) { by--; changed = true; break; }
        if (changed) continue;
        for (let yy = ay; yy <= by; yy++) if (!this.free(ax, yy)) { ax++; changed = true; break; }
        if (changed) continue;
        for (let yy = ay; yy <= by; yy++) if (!this.free(bx, yy)) { bx--; changed = true; break; }
      }
      const lw = bx - ax + 1, lh = by - ay + 1;
      if (lw < 2 || lh < 2) return;
      if (this.next() < (st.garden ?? 0.15) || lw < min || lh < min) {
        const gp = st.gardenProps ?? ['tree', 'bush', 'flowers', 'flowers', 'bush'];
        for (let yy = ay; yy <= by; yy++) for (let xx = ax; xx <= bx; xx++) {
          if (!this.free(xx, yy)) continue;
          const r = this.next();
          this.set(xx, yy, r < 0.75 ? 'grass' : 'tallgrass', st.floor ?? 0, r < 0.35 ? gp[Math.floor(this.next() * gp.length)] : '');
          this.reserved[this.i(xx, yy)] = 1;
        }
        return;
      }
      const tot = st.roofs.reduce((a, r) => a + r[1], 0);
      let pick = this.next() * tot, roof: RoofT = st.roofs[0][0];
      for (const [r, wgt] of st.roofs) { if ((pick -= wgt) <= 0) { roof = r; break; } }
      const wall = this.int(st.wall[0], st.wall[1]);
      // yard margin on one side sometimes
      let mx0 = ax, my0 = ay, mw = lw, mh = lh;
      const gap = st.gap ?? 0.3;
      if (lw > 3 && this.next() < gap) mw--;
      if (lh > 3 && this.next() < gap) mh--;
      if (mw > 4 && this.next() < 0.3) { mw--; if (this.next() < 0.5) mx0++; }
      if (mh > 4 && this.next() < 0.3) { mh--; if (this.next() < 0.5) my0++; }
      for (let yy = ay; yy <= by; yy++) for (let xx = ax; xx <= bx; xx++) {
        if (xx >= mx0 && xx < mx0 + mw && yy >= my0 && yy < my0 + mh) continue;
        if (!this.free(xx, yy)) continue;
        const r = this.next();
        this.set(xx, yy, st.alleyT ?? 'dirt', st.floor ?? 0, r < 0.08 ? 'barrel' : r < 0.12 ? 'crate' : r < 0.2 ? 'flowers' : '');
        this.reserved[this.i(xx, yy)] = 1;
      }
      this.building(mx0, my0, mw, mh, { wall, roof, floor: st.floor });
      count++;
    };
    const split = (x: number, y: number, w: number, h: number, depth: number) => {
      if ((w <= st.maxSize && h <= st.maxSize) || depth > 12) { leaf(x, y, w, h); return; }
      const horiz = w >= h;
      const len = horiz ? w : h;
      const lo = min, hi = len - min;
      if (hi <= lo) { leaf(x, y, w, h); return; }
      const cut = lo + Math.floor(this.next() * (hi - lo));
      const alley = this.next() < (st.alley ?? 0.3) && len > 2 * min + 1 ? 1 : 0;
      if (alley) {
        if (horiz) for (let yy = y; yy < y + h; yy++) { if (this.free(x + cut, yy)) { this.set(x + cut, yy, st.alleyT ?? 'dirt', st.floor ?? 0, '', F_ROAD); this.reserved[this.i(x + cut, yy)] = 1; } }
        else for (let xx = x; xx < x + w; xx++) { if (this.free(xx, y + cut)) { this.set(xx, y + cut, st.alleyT ?? 'dirt', st.floor ?? 0, '', F_ROAD); this.reserved[this.i(xx, y + cut)] = 1; } }
      }
      if (horiz) { split(x, y, cut, h, depth + 1); split(x + cut + alley, y, w - cut - alley, h, depth + 1); }
      else { split(x, y, w, cut, depth + 1); split(x, y + cut + alley, w, h - cut - alley, depth + 1); }
    };
    split(x0, y0, pw, ph, 0);
    return count;
  }

  /** Ground height along each footprint side (walls/roofs ignored) — the falloff ring ramps from it. */
  edgeTop!: Int16Array; edgeBottom!: Int16Array; edgeLeft!: Int16Array; edgeRight!: Int16Array;
  computeEdges(): void {
    const W = this.w, H = this.h;
    const ground = (x: number, y: number, dx: number, dy: number) => {
      let best = Infinity;
      for (let k = 0; k < 4; k++) {
        const xx = x + dx * k, yy = y + dy * k;
        if (!this.inb(xx, yy)) break;
        const i = this.i(xx, yy);
        const t = this.effT(i);
        if (T_WATER[t] && !(this.flags[i] & F_BRIDGE)) continue;
        if (t === T.roof || t === T.thatch || t === T.slate) continue;
        best = Math.min(best, this.effH(i));
      }
      return Number.isFinite(best) ? best : this.base;
    };
    this.edgeTop = new Int16Array(W); this.edgeBottom = new Int16Array(W);
    this.edgeLeft = new Int16Array(H); this.edgeRight = new Int16Array(H);
    for (let x = 0; x < W; x++) { this.edgeTop[x] = ground(x, 0, 0, 1); this.edgeBottom[x] = ground(x, H - 1, 0, -1); }
    for (let y = 0; y < H; y++) { this.edgeLeft[y] = ground(0, y, 1, 0); this.edgeRight[y] = ground(W - 1, y, -1, 0); }
  }
  /** Ground height of the footprint edge nearest an outside tile (local coords, may be outside). */
  edgeHeight(lx: number, ly: number): number {
    const cx = clamp(lx, 0, this.w - 1), cy = clamp(ly, 0, this.h - 1);
    if (lx < 0) return this.edgeLeft[cy];
    if (lx >= this.w) return this.edgeRight[cy];
    if (ly < 0) return this.edgeTop[cx];
    return this.edgeBottom[cx];
  }

  /** Effective final terrain / height / blocking for a cell (mirrors WorldGen.applyStamp). */
  effT(i: number): number { return this.t[i] === KEEP ? this.natT[i] : this.t[i]; }
  effH(i: number): number {
    const keepWater = this.t[i] === KEEP && T_WATER[this.natT[i]] && !(this.natFlags[i] & F_BRIDGE) && this.dh[i] === 0;
    return keepWater || this.dh[i] === NAT_H ? this.natH[i] : this.base + this.dh[i];
  }
  effBlocked(i: number): boolean { const p = this.prop[i] === KEEP ? this.natProp[i] : this.prop[i]; return !!p && PROP_BLOCKS_CODE[p] === 1; }
  effRoad(i: number): boolean { return this.t[i] === KEEP ? ((this.natFlags[i] | this.flags[i]) & F_ROAD) !== 0 : (this.flags[i] & F_ROAD) !== 0; }
  passable(i: number): boolean { const t = this.effT(i); return T_WALKABLE[t] === 1 && t !== T.deepwater && !this.effBlocked(i); }

  /** Walkable street/road cell nearest the centre (falls back to ground-level open cells). */
  findHub(): [number, number] {
    const cx = Math.floor(this.w / 2), cy = Math.floor(this.h / 2);
    let hub: [number, number] = [cx, cy], bd = Infinity;
    for (const needRoad of [true, false]) {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = this.i(x, y);
        if (needRoad && !this.effRoad(i)) continue;
        const t = this.effT(i);
        if (!this.passable(i) || t === T.roof || t === T.thatch || t === T.slate) continue;
        if (!needRoad && this.dh[i] !== NAT_H && Math.abs(this.dh[i]) > 1) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) { bd = d; hub = [x, y]; }
      }
      if (bd < Infinity) break;
    }
    return hub;
  }

  /**
   * Guarantee road connectivity: link every gate and every road entering across the footprint
   * edge to the hub along the cheapest walkable path (|Δh| ≤ 4), flagging it as road.
   */
  connect(): void {
    const W = this.w, H = this.h, n = W * H;
    const [hx, hy] = this.findHub();
    const cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const heap: number[] = [];
    const push = (i: number) => {
      heap.push(i);
      let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (cost[heap[p]] <= cost[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1;
          let m = c;
          if (l < heap.length && cost[heap[l]] < cost[heap[m]]) m = l;
          if (r < heap.length && cost[heap[r]] < cost[heap[m]]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
        }
      }
      return top;
    };
    const h0 = this.i(hx, hy);
    cost[h0] = 0; push(h0);
    while (heap.length) {
      const c = pop();
      const cx = c % W, cy = (c / W) | 0, ch = this.effH(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = this.i(x, y);
        if (!this.passable(j) || Math.abs(this.effH(j) - ch) > 4) continue;
        const t = this.effT(j);
        const step = this.effRoad(j) ? 1 : T_WATER[t] ? 12 : t === T.roof || t === T.thatch || t === T.slate ? 30 : 4;
        const nc = cost[c] + step;
        if (nc < cost[j]) { cost[j] = nc; prev[j] = c; push(j); }
      }
    }
    const entries: number[] = [];
    for (const g of this.gates) entries.push(this.i(clamp(g.x, 0, W - 1), clamp(g.y, 0, H - 1)));
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = this.i(x, y); if (this.effRoad(i)) entries.push(i); }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = this.i(x, y); if (this.effRoad(i)) entries.push(i); }
    for (const e of entries) {
      if (!Number.isFinite(cost[e])) continue;
      for (let c = e; c >= 0; c = prev[c]) this.flags[c] |= F_ROAD;
    }
  }

  /** Public info for game logic. */
  info(def: SetPieceDef): SetPieceInfo {
    const loc: Record<string, [number, number]> = {};
    for (const [k, v] of Object.entries(this.locations)) loc[k] = [v[0] + this.ox, v[1] + this.oy];
    for (const g of this.gates) loc[`gate_${g.id ?? g.side}`] ??= [g.x + this.ox, g.y + this.oy];
    const hub = this.findHub();
    return {
      hub: [hub[0] + this.ox, hub[1] + this.oy],
      id: def.id, name: def.name, builder: def.builder,
      bounds: { x0: this.ox, y0: this.oy, x1: this.ox + this.w, y1: this.oy + this.h },
      center: [this.ox + Math.floor(this.w / 2), this.oy + Math.floor(this.h / 2)],
      base: this.base,
      gates: this.gates.map((g) => ({ side: g.side, id: g.id, x: g.x + this.ox, y: g.y + this.oy })),
      locations: loc,
    };
  }
}

// =================================================================================================
// Builders
// =================================================================================================

const TOWN: PlotStyle = { roofs: [['roof', 6], ['thatch', 2], ['slate', 1]], wall: [4, 6], maxSize: 6, alley: 0.4, garden: 0.14, gap: 0.45 };
const VILLAGE: PlotStyle = { roofs: [['thatch', 9], ['roof', 1]], wall: [4, 4], maxSize: 5, minSize: 3, alley: 0.3, garden: 0.25, alleyT: 'grass', gap: 1 };
const CITY: PlotStyle = { roofs: [['roof', 5], ['slate', 4]], wall: [5, 8], maxSize: 7, alley: 0.5, garden: 0.06, alleyT: 'brick', gap: 0.35 };
const SLUM: PlotStyle = { roofs: [['thatch', 5], ['roof', 3]], wall: [4, 5], maxSize: 4, alley: 0.5, garden: 0.04 };

/** Find, per column, the first natural water row from the top (h if none). */
function waterTop(s: Stamp): Int16Array {
  const wt = new Int16Array(s.w).fill(s.h);
  for (let x = 0; x < s.w; x++) for (let y = 0; y < s.h; y++) if (s.nWater(x, y)) { wt[x] = y; break; }
  return wt;
}

function stalls(s: Stamp, x0: number, y0: number, x1: number, y1: number, step = 3): void {
  for (let x = x0; x <= x1; x += step) for (const y of [y0, y1]) if (s.inb(x, y) && !(s.flags[s.i(x, y)] & F_ROAD)) s.setProp(x, y, s.next() < 0.75 ? 'stall' : s.next() < 0.5 ? 'crate' : 'barrel');
}

// -------------------------------------------------------------------------------- market town
function marketTown(s: Stamp): void {
  const W = s.w, H = s.h;
  const wt = waterTop(s);
  const gN = s.gate('n')!, gE = s.gate('e')!, gS = s.gate('s');
  const cx = gN.x;
  const dryBottom = (x: number) => Math.min(H - 2, wt[clamp(x, 0, W - 1)] - 3);
  // ---- palisade on an earth bank (N, W, E; south follows the river = wharf)
  const pal = (x: number, y: number, outer: [number, number]) => {
    if (!s.inb(x, y) || y > dryBottom(x)) return;
    s.set(x, y, 'wood', 5, ''); s.reserve(x, y, 1, 1);
    const ox = x + outer[0], oy = y + outer[1];
    if (s.inb(ox, oy) && !s.nWater(ox, oy)) { s.set(ox, oy, 'dirt', 1, ''); s.reserve(ox, oy, 1, 1); }
  };
  for (let x = 1; x <= W - 2; x++) if (Math.abs(x - cx) > 1) pal(x, 1, [0, -1]);
  for (let y = 1; y <= H - 2; y++) { pal(1, y, [-1, 0]); if (Math.abs(y - gE.y) > 1) pal(W - 2, y, [1, 0]); }
  for (let x = 1; x <= W - 2; x++) if (H - 2 <= dryBottom(x) && (!gS || Math.abs(x - gS.x) > 1)) pal(x, H - 2, [0, 1]);
  // gate towers
  s.fill(cx - 3, 0, 2, 3, 'wood', 7); s.fill(cx + 2, 0, 2, 3, 'wood', 7);
  s.fill(W - 3, gE.y - 3, 3, 2, 'wood', 7); s.fill(W - 3, gE.y + 2, 3, 2, 'wood', 7);
  s.mark('gate_n', cx, 0); s.mark('gate_e', W - 1, gE.y);
  // ---- streets
  const sqX0 = cx - 7, sqX1 = cx + 7, sqY0 = gE.y - 5, sqY1 = gE.y + 5;
  for (let y = 0; y < wt[cx]; y++) s.fill(cx - 1, y, 3, 1, 'road', 0, '', F_ROAD);
  // bridge south over the Sallow
  for (let y = wt[cx]; y < H; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) { s.set(x, y, 'wood', 0, '', F_ROAD | F_BRIDGE); s.reserve(x, y, 1, 1); }
    if (s.nWater(cx - 2, y)) s.set(cx - 2, y, 'wood', 1, '');
    if (s.nWater(cx + 2, y)) s.set(cx + 2, y, 'wood', 1, '');
  }
  s.mark('bridge', cx, Math.min(H - 1, wt[cx] + 3));
  s.mark('gate_s', cx, H - 1);
  s.line(sqX1, gE.y, W - 1, gE.y, 3, 'road');
  s.line(3, gE.y, sqX0, gE.y, 3, 'road');
  // inner ring lane
  s.line(3, 3, W - 4, 3, 1, 'dirt');
  s.line(3, 3, 3, dryBottom(3), 1, 'dirt');
  s.line(W - 4, 3, W - 4, Math.max(3, dryBottom(W - 4)), 1, 'dirt');
  // ---- market square
  s.fill(sqX0, sqY0, sqX1 - sqX0 + 1, sqY1 - sqY0 + 1, 'brick', 0, '', F_ROAD);
  s.setProp(cx + 3, gE.y, 'well');
  s.mark('square', cx, gE.y); s.mark('well', cx + 3, gE.y);
  stalls(s, sqX0 + 1, sqY0 + 1, sqX1 - 1, sqY1 - 1, 3);
  for (const [x, y] of [[sqX0, sqY0], [sqX1, sqY0], [sqX0, sqY1], [sqX1, sqY1]]) s.setProp(x, y, 'lamppost');
  // ---- Notary House (stone) on the square's north side, Ledger banner in front
  s.building(cx + 2, sqY0 - 7, 7, 6, { wall: 7, roof: 'slate', ridge: 2 });
  s.setProp(cx + 5, sqY0 + 1, 'banner');
  s.mark('notary_house', cx + 5, sqY0 - 4);
  // ---- The Drowned Lantern: three storeys, gable + flat leaded section
  const ix = cx - 8, iy = sqY1 + 1;
  s.building(ix, iy, 4, 7, { wall: 10, roof: 'roof', axis: 'y', ridge: 2 });
  s.building(ix + 4, iy, 4, 7, { wall: 10, roof: 'slate', flat: true });
  s.fill(ix + 8, iy + 1, 1, 5, 'brick', 0, '', F_ROAD);
  s.setProp(ix + 8, iy + 3, 'sign');
  s.setProp(ix + 8, iy + 1, 'barrel');
  s.mark('inn', ix + 3, iy + 3); s.mark('inn_roof', ix + 5, iy + 3);
  // ---- Wool Market (west): plaza with covered stalls and a long market hall
  const wmX0 = 4, wmX1 = sqX0 - 3;
  s.fill(wmX0, gE.y - 6, wmX1 - wmX0 + 1, 13, 'brick', 0, '', F_ROAD);
  for (let x = wmX0 + 1; x <= wmX1 - 1; x += 2) { s.setProp(x, gE.y - 5, 'stall'); s.setProp(x, gE.y - 3, x % 4 === 1 ? 'haybale' : 'stall'); }
  s.building(wmX0 + 1, gE.y + 3, wmX1 - wmX0 - 1, 3, { wall: 4, roof: 'roof', ridge: 1 });
  s.mark('wool_market', Math.floor((wmX0 + wmX1) / 2), gE.y - 2);
  // ---- The Wharf: boardwalk along the bank, jetties into the river, warehouses
  for (let x = 0; x < W; x++) {
    if (wt[x] >= H) continue;
    for (let y = wt[x] - 2; y < wt[x]; y++) if (s.inb(x, y) && !s.reserved[s.i(x, y)]) { s.set(x, y, 'wood', 0, '', F_ROAD); s.reserve(x, y, 1, 1); }
    if ((x % 6 === 2 || x % 6 === 3) && Math.abs(x - cx) > 3) {
      for (let y = wt[x]; y < Math.min(H, wt[x] + 5); y++) if (s.nWater(x, y)) { s.set(x, y, 'wood', 0, ''); s.reserve(x, y, 1, 1); }
    }
  }
  for (let x = 0; x < W; x++) {
    if (wt[x] >= H) continue;
    const y = wt[x] - 1;
    if (s.inb(x, y) && s.next() < 0.18) s.setProp(x, y, s.next() < 0.5 ? 'crate' : 'barrel');
    const jy = wt[x] + 3;
    if ((x % 6 === 2) && s.nWater(x, jy) && s.next() < 0.5) s.setProp(x, jy, 'barrel');
  }
  const wharfX = clamp(cx + 6, 0, W - 1);
  s.mark('wharf', wharfX, Math.min(H - 1, wt[wharfX] - 1));
  // warehouses behind the wharf (east of the main street)
  for (let x = cx + 3; x < W - 6; x += 7) {
    const by = Math.min(dryBottom(x), dryBottom(x + 5)) - 1;
    if (by - 4 > sqY1 + 2 && s.rectFree(x, by - 4, 6, 4)) s.building(x, by - 4, 6, 4, { wall: 5, roof: 'roof' });
  }
  // ---- Chandlers' Row (north-east): workshops with smoking yards
  for (let x = cx + 11; x < W - 5; x += 6) {
    const y = 5;
    if (s.rectFree(x, y, 5, 4)) {
      s.building(x, y, 5, 4, { wall: s.int(4, 5), roof: s.next() < 0.6 ? 'roof' : 'thatch' });
      s.fillDry(x, y + 4, 5, 2, 'dirt', 0, '');
      s.setProp(x + 1, y + 5, s.next() < 0.5 ? 'brazier' : 'campfire');
      s.setProp(x + 3, y + 5, 'barrel');
    }
  }
  s.mark('chandlers_row', cx + 15, 8);
  // ---- fill remaining blocks with houses and gardens
  s.plots(4, 4, cx - 6, gE.y - 11, TOWN);
  s.plots(cx + 2, 4, 8, sqY0 - 11, TOWN);
  s.plots(cx + 9, 11, W - cx - 13, gE.y - 13, TOWN);
  s.plots(4, gE.y + 7, cx - 6, H - gE.y - 9, TOWN);
  s.plots(cx + 2, sqY1 + 1, W - cx - 6, H - sqY1 - 3, TOWN);
  // lamps along the main street
  for (let y = 4; y < sqY0; y += 6) s.setProp(cx - 2, y, 'lamppost');
}

// -------------------------------------------------------------------------------- village
function village(s: Stamp): void {
  const W = s.w, H = s.h;
  const gN = s.gate('n')!, gE = s.gate('e')!;
  const sx = gN.x; // main street centre column
  // brook column per row (natural water)
  const brook = new Int16Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    let sum = 0, n = 0;
    for (let x = sx + 3; x < W; x++) if (s.nWater(x, y)) { sum += x; n++; }
    if (n) brook[y] = Math.round(sum / n);
  }
  const bx = (y: number) => (brook[clamp(y, 0, H - 1)] >= 0 ? brook[clamp(y, 0, H - 1)] : W - 8);
  // ---- main street (the King's Road)
  s.line(sx, 0, sx, H - 1, 3, 'road');
  // ---- Saint Verity's Charity: walled compound north-west, single gate south
  const c0x = 0, c0y = 1, cw = 16, ch = 14;
  const cg = c0x + 7;
  for (let x = c0x; x < c0x + cw; x++) { s.set(x, c0y, 'stone', 3, ''); if (x !== cg && x !== cg + 1) s.set(x, c0y + ch - 1, 'stone', 3, ''); }
  for (let y = c0y; y < c0y + ch; y++) { s.set(c0x, y, 'stone', 3, ''); s.set(c0x + cw - 1, y, 'stone', 3, ''); }
  s.reserve(c0x, c0y, cw, ch);
  s.fill(c0x + 1, c0y + 1, cw - 2, ch - 2, 'grass', 0, '', 0);
  // dormitory: two storeys, slate, with a flat roof walk on its east end
  s.building(c0x + 2, c0y + 2, 6, 5, { wall: 7, roof: 'slate', axis: 'x', ridge: 2 });
  s.building(c0x + 8, c0y + 2, 2, 5, { wall: 7, roof: 'slate', flat: true });
  s.setProp(c0x + 9, c0y + 3, 'barrel');
  s.mark('dormitory', c0x + 5, c0y + 4); s.mark('oath_roof', c0x + 9, c0y + 4);
  // chapel with bell-cote
  s.building(c0x + 11, c0y + 2, 3, 6, { wall: 6, roof: 'slate', axis: 'y', ridge: 1 });
  s.set(c0x + 12, c0y + 7, 'slate', 10, '');
  s.mark('chapel', c0x + 12, c0y + 4);
  // kitchen garden
  for (let y = c0y + 8; y < c0y + ch - 1; y++) for (let x = c0x + 1; x < c0x + 7; x++) s.set(x, y, (y % 2) ? 'dirt' : 'tallgrass', 0, s.next() < 0.12 ? 'flowers' : s.next() < 0.06 ? 'bush' : '');
  s.mark('kitchen_garden', c0x + 3, c0y + 10);
  // laundry yard
  s.fill(c0x + 8, c0y + 9, cw - 9, ch - 10, 'brick', 0, '', 0);
  s.setProp(c0x + 13, c0y + 10, 'well'); s.setProp(c0x + 9, c0y + 10, 'fence'); s.setProp(c0x + 10, c0y + 10, 'fence'); s.setProp(c0x + 9, c0y + 11, 'barrel');
  s.mark('laundry_yard', c0x + 10, c0y + 11);
  s.mark('charity', c0x + 8, c0y + 7); s.mark('charity_gate', cg, c0y + ch - 1);
  // lane from the charity gate to the village green
  s.line(cg, c0y + ch, cg, c0y + ch + 3, 2, 'dirt');
  // ---- village green with the well
  const gy0 = c0y + ch + 3;
  s.fill(2, gy0, sx - 4, 7, 'grass', 0, '', 0);
  s.setProp(Math.floor(sx / 2), gy0 + 3, 'well'); s.setProp(Math.floor(sx / 2) - 3, gy0 + 1, 'tree'); s.setProp(Math.floor(sx / 2) + 3, gy0 + 5, 'flowers');
  s.mark('green', Math.floor(sx / 2), gy0 + 3);
  s.line(2, gy0 + 3, sx - 2, gy0 + 3, 1, 'dirt');
  // ---- east lane over the brook (stone bridge) to the Fen Road
  const ey = gE.y;
  for (let x = sx + 2; x < W; x++) {
    const water = s.nWater(x, ey) || s.nWater(x, ey - 1) || s.nWater(x, ey + 1);
    if (water) {
      s.set(x, ey - 1, 'brick', 1, '', F_ROAD | F_BRIDGE); s.set(x, ey, 'brick', 1, '', F_ROAD | F_BRIDGE);
      s.set(x, ey - 2, 'stone', 2, ''); s.set(x, ey + 1, 'stone', 2, '');
      s.reserve(x, ey - 2, 1, 4);
    } else { s.set(x, ey - 1, 'dirt', 0, '', F_ROAD); s.set(x, ey, 'dirt', 0, '', F_ROAD); s.reserve(x, ey - 1, 1, 2); }
  }
  s.mark('stone_bridge', bx(ey), ey);
  // ---- mill-pond with mill and dam (south, on the brook)
  const py = H - 11, pcx = bx(py);
  s.disc(pcx, py, 5.5, (x, y, d) => {
    const ell = Math.hypot((x - pcx) / 5.5, (y - py) / 3.8);
    if (ell > 1) return;
    const wh = s.inb(pcx, py) ? s.nH(pcx, py) : -1;
    s.set(x, y, ell < 0.5 ? 'deepwater' : 'water', Math.min(-1, wh), s.next() < 0.1 && ell > 0.75 ? 'reeds' : '');
    s.reserve(x, y, 1, 1);
    void d;
  });
  const damY = py - 4;
  for (let x = pcx - 3; x <= pcx + 3; x++) if (x !== pcx) { s.set(x, damY, 'stone', 1, ''); s.reserve(x, damY, 1, 1); }
  s.set(pcx, damY, 'water', Math.min(-1, s.nH(pcx, damY)), '');
  if (s.rectFree(pcx + 2, damY - 4, 5, 4) || true) s.building(pcx + 2, damY - 4, 5, 4, { wall: 5, roof: 'thatch' });
  s.set(pcx + 1, damY - 2, 'wood', 3, ''); s.set(pcx + 1, damY - 1, 'wood', 3, '');
  s.mark('mill', pcx + 4, damY - 2); s.mark('millpond', pcx, py);
  // ---- cottages along the street and the brook
  s.plots(1, gy0 + 8, sx - 3, H - gy0 - 9, VILLAGE);
  s.plots(sx + 2, 1, W - sx - 3, ey - 3, VILLAGE);
  s.plots(sx + 2, ey + 2, Math.max(2, bx(ey + 6) - sx - 4), H - ey - 3, VILLAGE);
  s.plots(bx(ey + 6) + 3, ey + 2, W - bx(ey + 6) - 4, H - ey - 3, VILLAGE);
  // fences and garden props around the village
  for (let y = 2; y < H - 1; y += 3) if (s.free(sx + 2, y)) s.setProp(sx + 2, y, s.next() < 0.5 ? 'fence' : 'flowers');
}

// -------------------------------------------------------------------------------- stilt hamlet
function stiltHamlet(s: Stamp): void {
  const W = s.w, H = s.h;
  const ruined = !!s.def.params?.ruined;
  // base = marsh water level
  let wmin = Infinity;
  for (let i = 0; i < W * H; i++) if (T_WATER[s.natT[i]]) wmin = Math.min(wmin, s.natH[i]);
  if (Number.isFinite(wmin)) s.base = wmin;
  // flatten natural ground into peat hummocks
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (s.nWater(x, y)) {
      s.set(x, y, s.nDeep(x, y) ? 'deepwater' : s.getT(x, y) === T.swamp ? 'swamp' : 'water', 0, null);
    } else if (!s.nRoad(x, y)) {
      const e = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
      const wet = fbm(s.seed + 1, x / 6, y / 6, 2) + (1 - e) * 0.5 > 0.18;
      if (wet && e < 1) { s.set(x, y, s.rand(x, y, 4) < 0.25 ? 'swamp' : 'water', 0, s.rand(x, y, 5) < 0.1 ? 'reeds' : ''); continue; }
      const hi = s.rand(x >> 2, y >> 2, 3) < 0.3;
      s.set(x, y, ruined ? (s.rand(x, y) < 0.5 ? 'ash' : 'dirt') : (s.rand(x, y) < 0.3 ? 'dirt' : 'grass'), hi ? 2 : 1, null);
    }
  }
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  // central hall (or ruined stone chapel)
  if (ruined) {
    const x0 = cx - 4, y0 = cy - 3;
    s.fill(x0, y0, 9, 6, 'brick', 1, '', 0);
    for (let x = x0; x < x0 + 9; x++) for (const y of [y0, y0 + 5]) if (s.rand(x, y, 5) < 0.75) s.set(x, y, 'stone', 2 + Math.floor(s.rand(x, y, 6) * 4), '');
    for (let y = y0; y < y0 + 6; y++) for (const x of [x0, x0 + 8]) if (s.rand(x, y, 5) < 0.75 && y !== y0 + 3) s.set(x, y, 'stone', 2 + Math.floor(s.rand(x, y, 6) * 4), '');
    s.setProp(x0 + 6, y0 + 2, 'altar'); s.setProp(x0 + 2, y0 + 3, 'bones'); s.setProp(x0 + 4, y0 + 2, 'brokenpillar');
    s.mark('chapel', cx, cy);
  } else {
    s.fill(cx - 5, cy - 4, 11, 9, 'wood', 2, '', F_ROAD);
    s.building(cx - 3, cy - 2, 7, 5, { wall: 4, roof: 'thatch', floor: 2, ridge: 2 });
    s.mark('stilt_hall', cx, cy);
  }
  // houses
  const houses: [number, number][] = [];
  for (let tries = 0; tries < 400 && houses.length < 20; tries++) {
    const a = s.next() * Math.PI * 2, r = 7 + s.next() * Math.min(W, H) * 0.36;
    const hx = Math.round(cx + Math.cos(a) * r * (W / H)), hy = Math.round(cy + Math.sin(a) * r);
    if (hx < 2 || hy < 2 || hx > W - 5 || hy > H - 5) continue;
    if (houses.some(([x, y]) => Math.abs(x - hx) < 5 && Math.abs(y - hy) < 5)) continue;
    if (Math.abs(hx - cx) < 7 && Math.abs(hy - cy) < 6) continue;
    houses.push([hx, hy]);
  }
  const walk = (x0: number, y0: number, x1: number, y1: number, intact = false) => {
    const pts: [number, number][] = [];
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) pts.push([x, y0]);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) pts.push([x1, y]);
    for (const [x, y] of pts) {
      if (!s.inb(x, y) || s.reserved[s.i(x, y)]) continue;
      if (ruined && !intact && s.rand(x, y, 9) < 0.3) continue;
      s.set(x, y, 'wood', 2, '', F_ROAD);
    }
  };
  // walkways to the hall first (so houses don't overwrite them)
  for (const [hx, hy] of houses) walk(hx + 1, hy + 1, cx, cy);
  for (const g of s.gates) walk(g.x, g.y, cx, cy, true);
  for (const [hx, hy] of houses) {
    if (ruined) {
      for (let y = hy; y < hy + 3; y++) for (let x = hx; x < hx + 3; x++) {
        const r = s.rand(x, y, 11);
        if (r < 0.45) s.set(x, y, 'wood', 1 + Math.floor(s.rand(x, y, 12) * 4), '');
        else if (r < 0.6) s.set(x, y, 'ash', 2, s.rand(x, y, 13) < 0.3 ? 'bones' : '');
      }
    } else {
      const big = s.next() < 0.3;
      s.building(hx, hy, big ? 4 : 3, 3, { wall: 3, roof: 'thatch', floor: 2, ridge: 1 });
    }
  }
  // eel-weirs (fence lines across open water), reeds
  for (let k = 0; k < 6; k++) {
    const x0 = s.int(1, W - 8), y0 = s.int(1, H - 2);
    for (let x = x0; x < x0 + 5; x++) if (s.nWater(x, y0) && !s.reserved[s.i(x, y0)]) s.setProp(x, y0, 'fence');
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (s.nWater(x, y) && s.prop[s.i(x, y)] === KEEP && s.rand(x, y, 21) < 0.12) s.setProp(x, y, 'reeds');
  // hedge-witness shrine with its (illegal) lantern post
  const sx = clamp(cx + 9, 2, W - 4), sy = clamp(cy + 7, 2, H - 4);
  s.fill(sx - 1, sy - 1, 4, 4, 'grass', 1, '', 0);
  s.building(sx, sy, 2, 2, { wall: 2, roof: ruined ? 'roof' : 'thatch', floor: 1, flat: true });
  s.setProp(sx - 1, sy + 1, ruined ? 'brokenpillar' : 'lamppost');
  s.mark('shrine', sx, sy);
  if (ruined) for (let k = 0; k < 10; k++) { const x = s.int(1, W - 2), y = s.int(1, H - 2); if (!s.nWater(x, y)) s.setProp(x, y, s.next() < 0.5 ? 'deadtree' : 'bones'); }
}

/** Origin (x0, y0) of a w×h rect whose cells are all ≥ `clear` from roads, nearest (px, py). */
function clearSpot(s: Stamp, w: number, h: number, clear: number, px: number, py: number, margin = 1): [number, number] | null {
  const rd = s.roadDist();
  let best: [number, number] | null = null, bd = Infinity;
  for (let y0 = margin; y0 + h + margin <= s.h; y0++) for (let x0 = margin; x0 + w + margin <= s.w; x0++) {
    const d = Math.hypot(x0 + w / 2 - px, y0 + h / 2 - py);
    if (d >= bd) continue;
    let ok = true;
    for (let y = y0; y < y0 + h && ok; y++) for (let x = x0; x < x0 + w; x++) if (rd[s.i(x, y)] < clear || s.nWater(x, y) && clear > 90) { ok = false; break; }
    if (ok) { bd = d; best = [x0, y0]; }
  }
  return best;
}

// -------------------------------------------------------------------------------- landmarks
function causewaySite(s: Stamp): void {
  const rd = s.roadDist();
  const cx = s.w / 2, cy = s.h / 2;
  let best = -1, bd = 1e9;
  for (let y = 4; y < s.h - 8; y++) for (let x = 4; x < s.w - 9; x++) {
    const d = rd[s.i(x, y)];
    if (d < 4 || d > 8) continue;
    const dd = Math.hypot(x - cx, y - cy);
    if (dd < bd) { bd = dd; best = s.i(x, y); }
  }
  if (best >= 0) {
    const wx = best % s.w, wy = Math.floor(best / s.w);
    s.fill(wx - 1, wy - 1, 8, 7, 'grass', 1, '', 0);
    s.fill(wx, wy, 6, 5, 'brick', 1, '', 0);
    for (let x = wx; x < wx + 6; x++) for (const y of [wy, wy + 4]) if (s.rand(x, y) < 0.7) s.set(x, y, 'stone', 2 + Math.floor(s.rand(x, y, 1) * 3), '');
    for (let y = wy; y < wy + 5; y++) for (const x of [wx, wx + 5]) if (s.rand(x, y, 2) < 0.7 && y !== wy + 2) s.set(x, y, 'stone', 2 + Math.floor(s.rand(x, y, 1) * 3), '');
    s.set(wx + 1, wy + 1, 'roof', 3, ''); s.set(wx + 2, wy + 1, 'roof', 3, '');
    s.setProp(wx + 3, wy + 2, 'crate'); s.setProp(wx + 2, wy + 3, 'bones');
    s.mark('waystation', wx + 3, wy + 2);
  }
  // lamp posts along the causeway (some broken)
  let k = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (rd[s.i(x, y)] !== 2 || s.nWater(x, y)) continue;
    if ((x * 7 + y * 13) % 23 === 0) { s.setProp(x, y, (k++ % 3 === 2) ? 'brokenpillar' : 'lamppost'); }
  }
  const ax = s.roadAxis();
  if (ax) s.mark('causeway', ax.cx, ax.cy);
}

function sunkenLane(s: Stamp): void {
  const ax = s.roadAxis() ?? { cx: s.w / 2, cy: s.h / 2, dx: 1, dy: 1 };
  const rd = s.roadDist();
  // wooded ridge across the road (perpendicular), road stays sunk between steep banks
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (s.nWater(x, y)) continue;
    const along = (x - ax.cx) * ax.dx + (y - ax.cy) * ax.dy; // distance along the road
    const ridge = Math.max(0, 1 - Math.abs(along) / 11);
    const r = rd[s.i(x, y)];
    const sunk = smoothstep(1.5, 3.6, r);
    const taper = smoothstep(0, 6, s.edgeDist(x, y));
    const dh = Math.round((6 * Math.sqrt(ridge) + 1) * sunk * taper);
    if (r === 0) { s.set(x, y, null, 0, ''); continue; }
    const tree = ridge > 0.15 && r > 3 && s.rand(x, y) < 0.32;
    s.set(x, y, ridge > 0.1 ? (s.rand(x, y, 1) < 0.3 ? 'tallgrass' : 'grass') : null, dh, tree ? (s.rand(x, y, 2) < 0.8 ? 'tree' : 'pine') : (s.rand(x, y, 3) < 0.06 ? 'bush' : r === 1 ? '' : null));
  }
  s.mark('lane', ax.cx, ax.cy);
  // abandoned watermill on the millrace
  let best = -1, bd = 1e9;
  for (let y = 3; y < s.h - 3; y++) for (let x = 3; x < s.w - 3; x++) {
    if (!s.nWater(x, y)) continue;
    const along = Math.abs((x - ax.cx) * ax.dx + (y - ax.cy) * ax.dy);
    if (along < 9) continue;
    const d = Math.hypot(x - s.w / 2, y - s.h / 2) + (rd[s.i(x, y)] < 5 ? 50 : 0);
    if (d < bd) { bd = d; best = s.i(x, y); }
  }
  if (best >= 0) {
    const mx = best % s.w, my = Math.floor(best / s.w);
    const wl = s.nH(mx, my);
    // mill pond (widen the race)
    s.disc(mx, my - 3, 3.2, (x, y) => { if (!s.reserved[s.i(x, y)] && rd[s.i(x, y)] > 1) { s.set(x, y, 'water', wl, s.rand(x, y, 7) < 0.15 ? 'reeds' : ''); s.reserve(x, y, 1, 1); } });
    const bxx = mx + 2;
    for (let y = my - 2; y <= my + 3; y++) for (let x = bxx - 1; x <= bxx + 5; x++) if (s.inb(x, y) && !s.nWater(x, y)) s.set(x, y, 'dirt', 0, '');
    s.building(bxx, my - 1, 5, 4, { wall: 5, roof: 'thatch' });
    // broken roof
    s.set(bxx + 3, my, 'wood', 4, ''); s.set(bxx + 4, my, 'wood', 3, '');
    s.set(mx + 1, my - 1, 'wood', 3, ''); s.set(mx + 1, my, 'wood', 3, '');
    s.setProp(bxx + 1, my + 3, 'crate'); s.setProp(bxx + 5, my + 2, 'barrel');
    s.mark('watermill', bxx + 2, my + 1);
  }
}

function ford(s: Stamp): void {
  const rd = s.roadDist();
  // crossing cells: natural bridge tiles the ford track made
  const cross: [number, number][] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.nBridge(x, y)) cross.push([x, y]);
  let wl = 0; { const w: number[] = []; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.nWater(x, y)) w.push(s.nH(x, y)); w.sort((a, b) => a - b); wl = w.length ? w[w.length >> 1] : -1; }
  // causeway-ford: stone blocks just above the water
  for (const [x, y] of cross) { s.set(x, y, 'stone', wl + 1, '', F_ROAD); s.reserve(x, y, 1, 1); }
  // direction of the crossing
  let dx = 0, dy = 1;
  if (cross.length > 3) {
    let mx = 0, my = 0; for (const [x, y] of cross) { mx += x; my += y; } mx /= cross.length; my /= cross.length;
    let xx = 0, xy = 0, yy = 0; for (const [x, y] of cross) { xx += (x - mx) ** 2; xy += (x - mx) * (y - my); yy += (y - my) ** 2; }
    const a = 0.5 * Math.atan2(2 * xy, xx - yy); dx = Math.cos(a); dy = Math.sin(a);
    s.mark('ford', mx, my);
    // broken bridge, parallel and offset
    const nx = -dy, ny = dx, off = 6;
    const L = 22;
    for (let t = -L; t <= L; t++) {
      for (let w = 0; w < 2; w++) {
        const x = Math.round(mx + nx * (off + w) + dx * t), y = Math.round(my + ny * (off + w) + dy * t);
        if (!s.inb(x, y)) continue;
        const water = s.nWater(x, y);
        const nearWater = water || s.nWater(x + 1, y) || s.nWater(x - 1, y) || s.nWater(x, y + 1) || s.nWater(x, y - 1);
        if (!nearWater) continue;
        if (Math.abs(t) <= 1) continue; // the collapsed span
        s.set(x, y, 'brick', wl + 3, '');
        s.reserve(x, y, 1, 1);
      }
    }
    s.mark('broken_bridge', mx + nx * off, my + ny * off);
    // ferryman's hut on a bank
    for (let t = 6; t < 20; t++) {
      const hx = Math.round(mx - nx * 6 + dx * t), hy = Math.round(my - ny * 6 + dy * t);
      if (s.rectFree(hx, hy, 4, 3, 1) && rd[s.i(clamp(hx, 0, s.w - 1), clamp(hy, 0, s.h - 1))] > 2) {
        s.building(hx, hy, 4, 3, { wall: 4, roof: 'thatch' });
        s.setProp(hx - 1, hy + 1, 'barrel');
        s.mark('ferry_hut', hx + 2, hy + 1);
        break;
      }
    }
  }
  // reed islands
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (!s.nWater(x, y) || s.reserved[s.i(x, y)] || s.nDeep(x, y)) continue;
    if (fbm(s.seed, x / 4, y / 4, 2) > 0.35) s.set(x, y, 'swamp', wl + 1, s.rand(x, y) < 0.5 ? 'reeds' : '');
  }
}

function drownedChurch(s: Stamp): void {
  const W = s.w, H = s.h;
  let wl = 0; { const w: number[] = []; for (let i = 0; i < W * H; i++) if (T_WATER[s.natT[i]]) w.push(s.natH[i]); w.sort((a, b) => a - b); if (w.length) s.base = w[w.length >> 1]; wl = 0; }
  const rd = s.roadDist();
  // churchyard: sunken, wet, tombstones in the water, broken wall
  const yx0 = 3, yy0 = 3, yx1 = W - 4, yy1 = H - 4;
  for (let y = yy0; y <= yy1; y++) for (let x = yx0; x <= yx1; x++) {
    if (rd[s.i(x, y)] < 2) continue;
    const edge = x === yx0 || y === yy0 || x === yx1 || y === yy1;
    if (edge) { if (s.rand(x, y, 1) < 0.6) s.set(x, y, 'stone', wl + 1, ''); continue; }
    const r = s.rand(x, y, 2);
    const t = r < 0.45 ? 'water' : r < 0.75 ? 'swamp' : 'grass';
    s.set(x, y, t, t === 'grass' ? wl + 1 : wl, s.rand(x, y, 3) < 0.13 ? 'tombstone' : t === 'swamp' && s.rand(x, y, 4) < 0.2 ? 'reeds' : '');
  }
  // yews at the corners
  for (const [x, y] of [[yx0 + 1, yy0 + 1], [yx1 - 1, yy0 + 1], [yx0 + 1, yy1 - 1], [yx1 - 1, yy1 - 1], [yx0 + 2, yy0 + 1]]) { s.set(x, y, 'grass', wl + 1, 'pine'); }
  // the sinking chapel: tilted walls, flooded east end
  const cw = 10, chh = 7;
  const spot = clearSpot(s, cw + 3, chh, 3, W / 2, H / 2) ?? [Math.floor(W / 2) - 6, Math.floor(H / 2) - 3];
  const cx0 = spot[0] + 2, cy0 = spot[1];
  for (let y = cy0; y < cy0 + chh; y++) for (let x = cx0; x < cx0 + cw; x++) {
    const tilt = Math.round(5 - (x - cx0) * 0.38);
    const edge = x === cx0 || y === cy0 || x === cx0 + cw - 1 || y === cy0 + chh - 1;
    if (edge) {
      const door = x === cx0 && y === cy0 + 3;
      const window = !door && s.rand(x, y, 5) < 0.18;
      if (door || window) s.set(x, y, 'brick', wl + 1, '');
      else s.set(x, y, 'stone', wl + Math.max(1, tilt), '');
    } else {
      s.set(x, y, x < cx0 + 5 ? 'brick' : (s.rand(x, y, 6) < 0.6 ? 'water' : 'swamp'), x < cx0 + 5 ? wl + 1 : wl, '');
    }
  }
  // bell-tower stump and roof fragment
  s.fill(cx0 - 2, cy0 + 2, 2, 3, 'stone', wl + 7, '');
  s.set(cx0 + 1, cy0 + 1, 'slate', wl + 6, ''); s.set(cx0 + 2, cy0 + 1, 'slate', wl + 6, ''); s.set(cx0 + 1, cy0 + 2, 'slate', wl + 6, '');
  s.set(cx0 + cw - 3, cy0 + 3, 'brick', wl + 1, 'altar');
  s.mark('chapel', cx0 + 3, cy0 + 3); s.mark('altar', cx0 + cw - 3, cy0 + 3); s.mark('churchyard', yx0 + 4, yy1 - 3);
}

function tor(s: Stamp): void {
  const W = s.w, H = s.h;
  const tx = Math.floor(W / 2), ty = Math.floor(H / 2);
  const R = Math.min(W, H) / 2 - 9, top = 10;
  const ringR = R + 3;
  const prof = (x: number, y: number) => {
    const r = Math.hypot(x - tx, y - ty) * (1 + fbm(s.seed, x / 9, y / 9, 2) * 0.1);
    return top * (1 - smoothstep(6, R, r));
  };
  // the downs and the granite dome
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = prof(x, y);
    const crag = p > 2 && p < 9.5 && fbm(s.seed + 5, x / 5, y / 5, 2) > 0.3;
    const dh = Math.round(p + (crag ? 1 : 0));
    let t: Terrain | null = p > 0.3 ? (s.rand(x, y) < 0.25 ? 'tallgrass' : 'grass') : null;
    if (crag || (p > 3 && Math.abs(prof(x + 1, y) - p) > 1.3) || (p > 6.5 && s.rand(x, y, 5) < 0.55)) t = 'stone';
    const prop = crag && s.rand(x, y, 2) < 0.2 ? 'boulder' : p > 1 && s.rand(x, y, 3) < 0.04 ? 'rock' : p > 0.3 && s.rand(x, y, 4) < 0.03 ? 'bush' : p > 0.3 ? '' : null;
    s.set(x, y, t, dh, prop);
  }
  // ring road round the foot, spokes to the gates (the King's Road skirts the tor)
  for (let a = 0; a < 360; a += 1) {
    const r = (a * Math.PI) / 180;
    const x = Math.round(tx + Math.cos(r) * ringR), y = Math.round(ty + Math.sin(r) * ringR);
    s.line(x, y, x, y, 3, 'dirt', 0);
  }
  for (const g of s.gates) s.line(g.x, g.y, Math.round(tx + Math.sign(g.x - tx) * (g.side === 'e' || g.side === 'w' ? ringR : 0)), Math.round(ty + Math.sign(g.y - ty) * (g.side === 'n' || g.side === 's' ? ringR : 0)), 3, 'dirt', 0);
  // Saint Ebbe's on the summit: cloister (west) + broken nave (east) + crossroads arch (south)
  const ax = tx - 9, ay = ty - 5;
  for (let y = ay; y < ay + 9; y++) for (let x = ax; x < ax + 9; x++) {
    const edge = x === ax || y === ay || x === ax + 8 || y === ay + 8;
    if (edge) s.set(x, y, s.rand(x, y, 7) < 0.7 ? 'stone' : 'brick', s.rand(x, y, 7) < 0.7 ? top + 2 + Math.floor(s.rand(x, y, 8) * 2) : top, '');
    else if (x === ax + 1 || y === ay + 1 || x === ax + 7 || y === ay + 7) s.set(x, y, 'brick', top, '');
    else s.set(x, y, 'grass', top, s.rand(x, y, 9) < 0.15 ? 'flowers' : '');
  }
  for (const [x, y] of [[ax + 1, ay + 1], [ax + 7, ay + 1], [ax + 1, ay + 7], [ax + 7, ay + 7]]) s.setProp(x, y, 'brokenpillar');
  s.set(ax + 4, ay + 8, 'brick', top, ''); s.set(ax + 8, ay + 4, 'brick', top, '');
  s.mark('cloister', ax + 4, ay + 4);
  const nx = ax + 9, ny = ay + 1;
  for (let y = ny; y < ny + 7; y++) for (let x = nx; x < nx + 11; x++) {
    const edge = y === ny || y === ny + 6 || x === nx + 10;
    if (edge && s.rand(x, y, 10) < 0.72) s.set(x, y, 'stone', top + 2 + Math.floor(s.rand(x, y, 11) * 4), '');
    else s.set(x, y, 'brick', top, (y === ny + 2 || y === ny + 4) && x % 3 === 0 && !edge ? 'brokenpillar' : '');
  }
  s.setProp(nx + 8, ny + 3, 'altar');
  s.mark('nave', nx + 5, ny + 3); s.mark('altar', nx + 8, ny + 3);
  const arx = tx, ary = ty + 6;
  s.set(arx - 1, ary, 'stone', top + 6, ''); s.set(arx + 1, ary, 'stone', top + 6, '');
  s.set(arx, ary, 'brick', top, 'cross');
  s.mark('arch', arx, ary); s.mark('summit', tx, ty);
  // path from the ring road up to the arch (south), graded ≤ 1 per step
  const footY = Math.round(ty + ringR - 1);
  for (let y = ary + 1; y <= footY; y++) {
    const target = Math.max(0, Math.round(top * (1 - smoothstep(6, R, Math.abs(y - ty)))));
    for (const x of [arx, arx + 1]) s.set(x, y, 'dirt', target, '', F_ROAD);
  }
  s.mark('path_foot', arx, footY);
}

function gibbet(s: Stamp): void {
  const W = s.w, H = s.h;
  const ax = s.roadAxis() ?? { cx: W / 2, cy: H / 2, dx: 0, dy: 1 };
  // crossing track perpendicular to the road
  const px = -ax.dy, py = ax.dx;
  s.line(Math.round(ax.cx - px * 16), Math.round(ax.cy - py * 16), Math.round(ax.cx + px * 16), Math.round(ax.cy + py * 16), 2, 'dirt');
  s.resetRoadDist();
  const rd = s.roadDist();
  s.mark('crossroads', ax.cx, ax.cy);
  // knoll in the quadrant farthest from both roads
  let best = 0, bv = -1;
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) { const v = Math.min(rd[s.i(x, y)], 12) - Math.hypot(x - W / 2, y - H / 2) * 0.2; if (v > bv) { bv = v; best = s.i(x, y); } }
  const kx = best % W, ky = Math.floor(best / W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (rd[s.i(x, y)] === 0) continue;
    const p = 4.5 * (1 - smoothstep(0, 8.5, Math.hypot(x - kx, y - ky))) * smoothstep(1, 4, rd[s.i(x, y)]) * smoothstep(0, 4, s.edgeDist(x, y));
    if (p > 0.3) s.set(x, y, s.rand(x, y) < 0.4 ? 'tallgrass' : 'grass', Math.round(p), s.rand(x, y, 1) < 0.04 ? 'rock' : '');
  }
  s.set(kx, ky, 'dirt', Math.round(4.5 * smoothstep(1, 4, rd[s.i(kx, ky)])), 'gallows');
  s.setProp(kx + 1, ky + 1, 'bones');
  s.mark('gallows', kx, ky);
  // inn ruin in the opposite quadrant
  const ox = clamp(Math.round(2 * ax.cx - kx) - 3, 1, W - 8), oy = clamp(Math.round(2 * ax.cy - ky) - 2, 1, H - 7);
  for (let y = oy; y < oy + 5; y++) for (let x = ox; x < ox + 6; x++) {
    if (rd[s.i(x, y)] < 1) continue;
    const edge = x === ox || y === oy || x === ox + 5 || y === oy + 4;
    if (edge && s.rand(x, y, 3) < 0.7) s.set(x, y, s.rand(x, y, 4) < 0.3 ? 'wood' : 'stone', 2 + Math.floor(s.rand(x, y, 5) * 3), '');
    else s.set(x, y, 'brick', 0, s.rand(x, y, 6) < 0.12 ? 'crate' : s.rand(x, y, 6) < 0.16 ? 'barrel' : '');
  }
  s.set(ox + 1, oy + 1, 'roof', 4, ''); s.set(ox + 2, oy + 1, 'roof', 4, '');
  s.mark('inn_ruin', ox + 3, oy + 2);
  const sgx = Math.round(ax.cx + px * 3 + ax.dx * 3), sgy = Math.round(ax.cy + py * 3 + ax.dy * 3);
  if (s.inb(sgx, sgy) && rd[s.i(sgx, sgy)] > 0) s.setProp(sgx, sgy, 'sign');
}

function barrow(s: Stamp): void {
  const W = s.w, H = s.h;
  const rd = s.roadDist();
  let cx = W / 2, cy = H / 2;
  // move the mound off the road
  for (let k = 0; k < 20 && rd[s.i(Math.round(cx), Math.round(cy))] < 8; k++) cy += cy < H / 2 + 0.1 ? -0.4 : 0.4;
  const rx = 13, ry = 4.6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (e >= 1 || rd[s.i(x, y)] < 2) continue;
    const p = 5.2 * Math.sqrt(1 - e) * smoothstep(1, 4, rd[s.i(x, y)]);
    s.set(x, y, s.rand(x, y) < 0.35 ? 'tallgrass' : 'grass', Math.round(p), s.rand(x, y, 1) < 0.05 ? 'flowers' : '');
  }
  // opened passage into the east end, with a chamber
  const py = Math.round(cy);
  for (let x = Math.round(cx + 2); x <= Math.round(cx + rx); x++) {
    s.set(x, py, 'cave', 0, '');
    s.set(x, py - 1, 'stone', 3, ''); s.set(x, py + 1, 'stone', 3, '');
  }
  s.fill(Math.round(cx - 1), py - 1, 3, 3, 'cave', 0, '');
  s.setProp(Math.round(cx), py, 'bones'); s.setProp(Math.round(cx - 1), py - 1, 'altar');
  s.mark('passage', cx + rx - 1, py); s.mark('chamber', cx, py); s.mark('barrow', cx, cy - 2);
  // ring of standing stones
  const n = 22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (rx + 3.5)), y = Math.round(cy + Math.sin(a) * (ry + 3));
    if (!s.inb(x, y) || rd[s.i(x, y)] < 2 || Math.abs(y - py) <= 1 && x > cx) continue;
    if (s.rand(k, 0, 9) < 0.15) continue; // fallen
    s.set(x, y, null, 0, 'standingstone');
  }
}

// -------------------------------------------------------------------------------- fortresses
function fortress(s: Stamp): void {
  const W = s.w, H = s.h;
  const R = 2; // the low rise
  s.fill(1, 1, W - 2, H - 2, 'grass', R, null, 0, false);
  const x0 = 3, y0 = 3, x1 = W - 4, y1 = H - 4;
  s.fill(x0 + 2, y0 + 2, x1 - x0 - 3, y1 - y0 - 3, 'dirt', R, '', 0);
  const wallH = R + 7;
  const gx = Math.floor(W / 2);
  s.wall(x0, y0, x1, y0, wallH, 2, 'n');
  s.wall(x0, y0, x0, y1, wallH, 2, 'w');
  s.wall(x1 - 1, y0, x1 - 1, y1, wallH, 2, 'e');
  s.wall(x0, y1 - 1, x1, y1 - 1, wallH, 2, 's');
  // gate passage + gatehouse
  s.fill(gx - 2, y1 - 1, 4, 3, 'road', R, '', F_ROAD);
  s.tower(gx - 6, y1 - 3, 4, 5, R + 10); s.tower(gx + 2, y1 - 3, 4, 5, R + 10);
  s.line(gx - 1, y1 + 2, gx - 1, H - 1, 4, 'road', R);
  s.mark('gate', gx, y1); s.mark('gatehouse', gx - 4, y1 - 1);
  // corner towers
  s.tower(x0 - 2, y0 - 2, 6, 6, R + 11); s.tower(x1 - 4, y0 - 2, 6, 6, R + 11);
  s.tower(x0 - 2, y1 - 4, 6, 6, R + 11); s.tower(x1 - 4, y1 - 4, 6, 6, R + 11);
  // keep with external stair
  const kx = gx - 5, ky = y0 + 6;
  s.tower(kx, ky, 10, 10, R + 12);
  s.tower(kx + 7, ky - 1, 4, 4, R + 15, 'cone');
  for (let k = 0; k <= 12; k++) { const x = kx + 11 - k; s.set(x, ky + 10, 'stone', R + 1 + k, '', 0); s.set(x, ky + 11, 'stone', R + 1 + k, ''); s.reserve(x, ky + 10, 1, 2); }
  s.mark('keep', kx + 5, ky + 5); s.mark('keep_roof', kx + 3, ky + 3);
  // courtyard flagstones in front of the keep
  s.fill(gx - 4, ky + 12, 8, y1 - ky - 15, 'brick', R, '', F_ROAD);
  s.setProp(gx - 4, ky + 12, 'banner'); s.setProp(gx + 3, ky + 12, 'banner'); s.setProp(gx - 3, y1 - 3, 'banner'); s.setProp(gx + 2, y1 - 3, 'banner');
  s.mark('courtyard', gx, ky + 15);
  // barracks (west), stables (east), pyre-yard (north-east, black stone)
  s.building(x0 + 3, y0 + 17, 6, 12, { wall: 5, roof: 'slate', floor: R });
  s.mark('barracks', x0 + 6, y0 + 22);
  s.building(x1 - 9, y0 + 17, 6, 12, { wall: 4, roof: 'thatch', floor: R });
  for (let y = y0 + 18; y < y0 + 29; y += 3) s.setProp(x1 - 11, y, s.next() < 0.6 ? 'haybale' : 'cart');
  s.mark('stables', x1 - 6, y0 + 22);
  s.fill(x1 - 10, y0 + 3, 8, 8, 'ash', R, '', 0);
  s.setProp(x1 - 7, y0 + 6, 'altar'); s.setProp(x1 - 9, y0 + 4, 'brazier'); s.setProp(x1 - 4, y0 + 4, 'brazier'); s.setProp(x1 - 9, y0 + 9, 'brazier'); s.setProp(x1 - 4, y0 + 9, 'brazier');
  s.setProp(x1 - 6, y0 + 8, 'bones');
  s.mark('pyre_yard', x1 - 7, y0 + 6);
  // stair up to the west wall walk
  for (let k = 0; k < 7; k++) { s.set(x0 + 2, y0 + 15 - k, 'stone', R + 1 + k, ''); s.reserve(x0 + 2, y0 + 15 - k, 1, 1); }
  // yard clutter
  s.setProp(x0 + 4, y0 + 4, 'well'); s.setProp(x0 + 7, y0 + 4, 'crate'); s.setProp(x0 + 8, y0 + 4, 'barrel'); s.setProp(x0 + 5, y0 + 13, 'fence'); s.setProp(x0 + 6, y0 + 13, 'fence');
}

function mountainFortress(s: Stamp): void {
  const W = s.w, H = s.h;
  // set ground level to the road (south edge), keep the mountain behind
  const gS = s.gate('s');
  if (gS) s.base = s.natH[s.i(gS.x, gS.y)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = s.nH(x, y);
    s.set(x, y, null, Math.max(n, y < 12 ? 12 : n), null);
  }
  const lowY0 = 22, upY0 = 11;
  // lower bailey
  s.fill(3, lowY0, W - 6, H - lowY0 - 3, 'dirt', 1, '', 0);
  s.wall(2, lowY0, 2, H - 3, 7, 2, 'w'); s.wall(W - 4, lowY0, W - 4, H - 3, 7, 2, 'e'); s.wall(2, H - 4, W - 3, H - 4, 7, 2, 's');
  // upper bailey
  s.fill(5, upY0, W - 10, lowY0 - upY0, 'brick', 7, '', 0);
  s.wall(5, lowY0 - 1, W - 6, lowY0 - 1, 10, 1, 's');
  s.wall(4, upY0, 4, lowY0 - 1, 12, 1, 'w'); s.wall(W - 5, upY0, W - 5, lowY0 - 1, 12, 1, 'e');
  // keep cut into the cliff
  s.tower(10, 2, W - 20, upY0 - 1, 15);
  s.tower(8, 1, 5, 5, 18, 'cone'); s.tower(W - 13, 1, 5, 5, 18, 'cone');
  s.mark('keep', W >> 1, 5);
  // gates and roads
  const gx = W >> 1;
  s.fill(gx - 1, H - 4, 3, 4, 'road', 1, '', F_ROAD);
  s.tower(gx - 5, H - 6, 4, 4, 11); s.tower(gx + 2, H - 6, 4, 4, 11);
  s.mark('gate', gx, H - 1);
  for (const g of s.gates) {
    if (g.side === 'w') { s.fill(0, g.y - 1, 4, 3, 'road', 1, '', F_ROAD); s.mark('gate_w', 0, g.y); }
    if (g.side === 'e') { s.fill(W - 4, g.y - 1, 4, 3, 'road', 1, '', F_ROAD); s.mark('gate_e', W - 1, g.y); }
  }
  // stair from lower to upper bailey
  for (let k = 0; k < 7; k++) { const y = lowY0 + 6 - k; s.fill(gx - 1, y, 3, 1, 'stone', 1 + k, '', F_ROAD); }
  s.mark('upper_bailey', gx, upY0 + 4); s.mark('lower_bailey', gx, lowY0 + 8);
  s.building(5, lowY0 + 3, 7, 5, { wall: 5, roof: 'slate', floor: 1 });
  s.building(W - 12, lowY0 + 3, 7, 5, { wall: 5, roof: 'slate', floor: 1 });
  s.setProp(gx - 3, lowY0 + 10, 'brazier'); s.setProp(gx + 3, lowY0 + 10, 'brazier'); s.setProp(gx - 2, upY0 + 2, 'banner'); s.setProp(gx + 2, upY0 + 2, 'banner');
}

function moatedCastle(s: Stamp): void {
  const W = s.w, H = s.h;
  // formal gardens
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hedge = (x % 5 === 0 || y % 5 === 0) && s.rand(x, y) < 0.7;
    s.set(x, y, 'grass', 0, hedge ? 'bush' : s.rand(x, y, 1) < 0.06 ? 'flowers' : '');
  }
  const px0 = 9, py0 = 8, px1 = W - 10, py1 = H - 9;
  // moat
  for (let y = py0 - 3; y <= py1 + 3; y++) for (let x = px0 - 3; x <= px1 + 3; x++) {
    if (x >= px0 && x <= px1 && y >= py0 && y <= py1) continue;
    const ring = Math.min(Math.abs(x - (px0 - 2)), Math.abs(x - (px1 + 2)), Math.abs(y - (py0 - 2)), Math.abs(y - (py1 + 2)));
    s.set(x, y, ring === 0 ? 'deepwater' : 'water', -1, '');
    s.reserve(x, y, 1, 1);
  }
  s.fill(px0, py0, px1 - px0 + 1, py1 - py0 + 1, 'brick', 0, '', 0);
  // curtain + round-ish towers
  s.wall(px0, py0, px1, py0, 5, 1, 'n'); s.wall(px0, py1, px1, py1, 5, 1, 's'); s.wall(px0, py0, px0, py1, 5, 1, 'w'); s.wall(px1, py0, px1, py1, 5, 1, 'e');
  for (const [x, y] of [[px0 - 1, py0 - 1], [px1 - 3, py0 - 1], [px0 - 1, py1 - 3], [px1 - 3, py1 - 3]]) s.tower(x, y, 5, 5, 9, 'cone');
  // palace
  const cx = W >> 1;
  s.building(px0 + 4, py0 + 3, px1 - px0 - 7, 9, { wall: 8, roof: 'slate', ridge: 3 });
  s.building(px0 + 4, py0 + 12, 4, 7, { wall: 7, roof: 'slate', axis: 'y' });
  s.building(px1 - 7, py0 + 12, 4, 7, { wall: 7, roof: 'slate', axis: 'y' });
  s.mark('palace', cx, py0 + 7);
  s.setProp(cx, py0 + 15, 'well'); s.setProp(cx - 3, py0 + 14, 'flowers'); s.setProp(cx + 3, py0 + 14, 'flowers'); s.setProp(cx - 2, py1 - 2, 'statue'); s.setProp(cx + 2, py1 - 2, 'statue');
  s.mark('courtyard', cx, py0 + 16);
  // gates with bridges over the moat
  for (const g of s.gates) {
    if (g.side === 'e') { s.fill(px1, g.y - 1, W - px1, 3, 'road', 0, '', F_ROAD); for (let x = px1 + 1; x <= px1 + 3; x++) s.fill(x, g.y - 1, 1, 3, 'wood', 0, '', F_ROAD | F_BRIDGE); s.mark('gate_e', px1, g.y); }
    if (g.side === 's') { s.fill(g.x - 1, py1, 3, H - py1, 'road', 0, '', F_ROAD); for (let y = py1 + 1; y <= py1 + 3; y++) s.fill(g.x - 1, y, 3, 1, 'wood', 0, '', F_ROAD | F_BRIDGE); s.mark('gate_s', g.x, py1); }
  }
  s.mark('gardens', 3, 3);
}

function watchtower(s: Stamp): void {
  const W = s.w, H = s.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s.set(x, y, x > W / 2 + 1 ? 'ash' : 'dirt', 0, s.rand(x, y) < 0.06 ? 'bones' : '');
  s.tower(2, 2, 4, 4, 11);
  s.setProp(3, 3, 'brazier'); s.setProp(4, 4, 'banner');
  for (let x = 0; x < W; x++) { if (x !== 4) s.setProp(x, H - 1, 'fence'); }
  s.setProp(7, 6, 'campfire'); s.setProp(1, 7, 'crate'); s.setProp(2, 7, 'barrel');
  s.mark('tower', 3, 3);
}

function passGate(s: Stamp): void {
  const W = s.w, H = s.h;
  const iron = !!s.def.params?.iron;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s.set(x, y, null, NAT_H, null);
  const ax = s.roadAxis() ?? { cx: W / 2, cy: H / 2, dx: 0, dy: 1 };
  const rd = s.roadDist();
  const nx = -ax.dy, ny = ax.dx;
  for (let k = -14; k <= 14; k++) for (let w = 0; w < 2; w++) {
    const x = Math.round(ax.cx + nx * k + ax.dx * w), y = Math.round(ax.cy + ny * k + ax.dy * w);
    if (!s.inb(x, y) || s.nWater(x, y)) continue;
    if (rd[s.i(x, y)] <= 1) { if (rd[s.i(x, y)] === 1 && iron) s.set(x, y, null, NAT_H, 'fence'); continue; }
    const tower = rd[s.i(x, y)] <= 4;
    s.set(x, y, 'stone', s.nH(x, y) + (tower ? 10 : 6) + (w === 0 && (x + y) % 2 === 0 ? 1 : 0), '');
  }
  s.mark('gate', ax.cx, ax.cy);
  const hx = Math.round(ax.cx + nx * 6 + ax.dx * 5), hy = Math.round(ax.cy + ny * 6 + ax.dy * 5);
  if (s.inb(hx, hy)) { s.building(hx, hy, 4, 3, { wall: 4, roof: 'slate', floor: s.nH(hx, hy) }); s.setProp(hx - 1, hy, 'brazier'); }
}

// -------------------------------------------------------------------------------- cities
function capital(s: Stamp): void {
  const W = s.w, H = s.h;
  const gN = s.gate('n')!, gW = s.gate('w')!, gS = s.gate('s')!, gA = s.gate('e', 'ashgate')!, gL = s.gate('e', 'lakegate')!;
  const wx0 = 4, wy0 = 4, wx1 = W - 5, wy1 = H - 25;
  const mx0 = 58, mx1 = 86, my0 = 48, my1 = 70; // Market of Vows
  // ---- avenues
  s.line(gN.x, 0, gN.x, my0, 4, 'road');
  s.line(0, gW.y, mx0, gW.y, 4, 'road');
  s.line(gS.x, my1, gS.x, H - 1, 4, 'road');
  s.line(gN.x, gA.y, W - 1, gA.y, 4, 'road');
  s.line(mx1, gL.y, W - 1, gL.y, 4, 'road');
  s.line(mx0 + 4, my1, mx0 + 4, wy1, 3, 'road');
  s.line(mx1, my0 + 8, wx1, my0 + 8, 3, 'road');
  // ---- Market of Vows with the Oath-Stone
  s.fill(mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1, 'brick', 0, '', F_ROAD);
  const ox = (mx0 + mx1) >> 1, oy = (my0 + my1) >> 1;
  s.fill(ox - 2, oy - 2, 5, 5, 'stone', 1, '', 0);
  s.setProp(ox, oy, 'standingstone'); s.setProp(ox, oy + 2, 'altar');
  for (const [x, y] of [[mx0, my0], [mx1, my0], [mx0, my1], [mx1, my1]]) s.setProp(x, y, 'statue');
  for (let x = mx0 + 3; x < mx1 - 2; x += 4) { s.setProp(x, my0 + 1, 'lamppost'); s.setProp(x, my1 - 1, 'lamppost'); }
  stalls(s, mx0 + 2, my0 + 3, mx1 - 2, my1 - 3, 3);
  s.setProp(ox - 4, oy - 4, 'banner'); s.setProp(ox + 4, oy - 4, 'banner');
  s.mark('market_of_vows', ox, oy + 4); s.mark('oath_stone', ox, oy);
  // ---- Crown Hill: terraced palace (west)
  const cx0 = 8, cy0 = 10, cx1 = 46, cy1 = gW.y - 4;
  for (let lv = 1; lv <= 3; lv++) {
    const ins = (lv - 1) * 4;
    for (let y = cy0 + ins; y <= cy1 - ins; y++) for (let x = cx0 + ins; x <= cx1 - ins; x++) {
      const edge = x === cx0 + ins || y === cy0 + ins || x === cx1 - ins || y === cy1 - ins;
      s.set(x, y, lv === 3 ? 'brick' : 'grass', lv * 3, edge ? '' : s.rand(x, y, lv) < 0.1 ? (s.rand(x, y, 9) < 0.5 ? 'tree' : 'flowers') : '');
      s.reserve(x, y, 1, 1);
    }
  }
  const pcx = (cx0 + cx1) >> 1;
  // palace: great hall (north), two wings and a fountain court opening south toward the stair
  const px0 = cx0 + 12, px1 = cx1 - 12, py0 = cy0 + 12, py1 = cy1 - 13;
  const hallH = Math.max(7, Math.floor((py1 - py0) * 0.38));
  s.building(px0, py0, px1 - px0 + 1, hallH, { wall: 11, roof: 'slate', floor: 9, ridge: 3 });
  s.building(px0, py0 + hallH, 4, py1 - py0 - hallH + 1, { wall: 8, roof: 'slate', floor: 9, axis: 'y' });
  s.building(px1 - 3, py0 + hallH, 4, py1 - py0 - hallH + 1, { wall: 8, roof: 'slate', floor: 9, axis: 'y' });
  s.fill(px0 + 4, py0 + hallH, px1 - px0 - 7, py1 - py0 - hallH + 1, 'brick', 9, '', F_ROAD);
  const fcx = (px0 + px1) >> 1, fcy = py0 + hallH + ((py1 - py0 - hallH) >> 1);
  s.setProp(fcx, fcy, 'well'); s.setProp(fcx - 2, fcy - 2, 'statue'); s.setProp(fcx + 2, fcy - 2, 'statue');
  s.setProp(fcx - 2, py1, 'banner'); s.setProp(fcx + 2, py1, 'banner');
  s.mark('palace_court', fcx, fcy + 2); s.mark('throne_hall', fcx, py0 + (hallH >> 1));
  for (const [x, y] of [[cx0 + 9, cy0 + 9], [cx1 - 12, cy0 + 9], [cx0 + 9, cy1 - 12], [cx1 - 12, cy1 - 12]]) s.tower(x, y, 4, 4, 9 + 13, 'cone');
  // processional stair down to the West avenue
  for (let y = cy1 - 8; y <= gW.y - 2; y++) { const dh = clamp(gW.y - 2 - y, 0, 9); s.fill(pcx - 1, y, 3, 1, 'stone', Math.max(dh, y <= cy1 - 8 ? 9 : 0), '', F_ROAD); }
  s.mark('palace', pcx, (cy0 + cy1) >> 1); s.mark('crown_hill_stair', pcx, cy1);
  // ---- city walls with 12 towers
  s.wall(wx0, wy0, wx1, wy0, 8, 2, 'n');
  s.wall(wx0, wy1 - 1, wx1, wy1 - 1, 8, 2, 's');
  s.wall(wx0, wy0, wx0, wy1, 8, 2, 'w');
  s.wall(wx1 - 1, wy0, wx1 - 1, wy1, 8, 2, 'e');
  const tw: [number, number][] = [[wx0 - 1, wy0 - 1], [wx1 - 3, wy0 - 1], [wx0 - 1, wy1 - 3], [wx1 - 3, wy1 - 3]];
  for (const f of [1 / 3, 2 / 3]) {
    tw.push([Math.round(wx0 + (wx1 - wx0) * f), wy0 - 1], [Math.round(wx0 + (wx1 - wx0) * f), wy1 - 3]);
    tw.push([wx0 - 1, Math.round(wy0 + (wy1 - wy0) * f)], [wx1 - 3, Math.round(wy0 + (wy1 - wy0) * f)]);
  }
  const onRoad = (x: number, y: number) => {
    for (let yy = y - 1; yy < y + 6; yy++) for (let xx = x - 1; xx < x + 6; xx++) if (s.inb(xx, yy) && (s.flags[s.i(xx, yy)] & F_ROAD)) return true;
    return false;
  };
  for (const [tx0, ty0] of tw) {
    const horiz = ty0 === wy0 - 1 || ty0 === wy1 - 3;
    for (const off of [0, -6, 6, -10, 10, -14, 14]) {
      const x = horiz ? tx0 + off : tx0, y = horiz ? ty0 : ty0 + off;
      if (onRoad(x, y)) continue;
      let wet = 0; for (let yy = y; yy < y + 5; yy++) for (let xx = x; xx < x + 5; xx++) if (s.nWater(xx, yy)) wet++;
      if (wet < 6) s.tower(x, y, 5, 5, 11);
      break;
    }
  }
  // gate openings
  const open = (x: number, y: number, horiz: boolean) => {
    for (let k = -2; k <= 2; k++) for (let t = -1; t <= 2; t++) {
      const xx = horiz ? x + k : x + t, yy = horiz ? y + t : y + k;
      if (s.inb(xx, yy)) s.set(xx, yy, s.nWater(xx, yy) ? 'brick' : 'road', 0, '', F_ROAD);
    }
  };
  open(gN.x + 1, wy0, true); open(gS.x + 1, wy1 - 1, true); open(wx0, gW.y + 1, false); open(wx1 - 1, gA.y + 1, false); open(wx1 - 1, gL.y + 1, false);
  s.mark('gate_n', gN.x, wy0); s.mark('gate_w', wx0, gW.y); s.mark('gate_s', gS.x, wy1); s.mark('ashgate', wx1, gA.y); s.mark('lakegate', wx1, gL.y);
  // ---- Lakegate docks
  for (let y = gL.y - 14; y <= gL.y + 16; y++) for (let x = wx1 - 8; x < W; x++) {
    if (!s.inb(x, y) || s.reserved[s.i(x, y)]) continue;
    if (s.nWater(x, y)) { if ((y % 5 === 0 || y % 5 === 1) && x < W - 2) { s.set(x, y, 'wood', 0, s.rand(x, y) < 0.1 ? 'barrel' : ''); s.reserve(x, y, 1, 1); } }
    else if (x >= wx1 + 1) { s.set(x, y, 'wood', 0, s.rand(x, y, 1) < 0.08 ? 'crate' : '', F_ROAD); s.reserve(x, y, 1, 1); }
  }
  s.mark('docks', W - 3, gL.y);
  // ---- Ashgate barracks (north-east)
  for (let x = wx1 - 30; x < wx1 - 4; x += 9) if (s.rectFree(x, gA.y + 3, 7, 5)) { s.building(x, gA.y + 3, 7, 5, { wall: 5, roof: 'slate' }); s.setProp(x + 3, gA.y + 8, 'banner'); }
  s.setProp(wx1 - 3, gA.y - 3, 'brazier'); s.setProp(wx1 - 3, gA.y + 4, 'brazier');
  s.mark('ashguard_barracks', wx1 - 20, gA.y + 5);
  // ---- Scriveners' Quarter law courts
  s.building(64, 26, 16, 12, { wall: 8, roof: 'slate', ridge: 3 });
  s.fill(64, 38, 16, 2, 'brick', 0, '', F_ROAD);
  s.setProp(66, 39, 'statue'); s.setProp(77, 39, 'statue');
  s.mark('law_courts', 72, 32); s.mark('scriveners_quarter', 88, 34);
  // ---- quays along the river inside the walls
  for (let y = wy0 + 2; y < wy1 - 2; y++) for (let x = wx0 + 2; x < wx1 - 2; x++) {
    if (s.reserved[s.i(x, y)] || s.nWater(x, y)) continue;
    if (s.nWater(x + 1, y) || s.nWater(x - 1, y) || s.nWater(x, y + 1) || s.nWater(x, y - 1)) { s.set(x, y, 'brick', 0, '', F_ROAD); s.reserve(x, y, 1, 1); }
  }
  // ---- fill districts
  s.plots(wx0 + 2, wy0 + 2, gN.x - wx0 - 5, cy0 - wy0 - 2, CITY);
  s.plots(gN.x + 3, wy0 + 2, wx1 - gN.x - 6, gA.y - wy0 - 4, CITY);
  s.plots(gN.x + 3, gA.y + 3, wx1 - gN.x - 6, my0 - gA.y - 4, CITY);
  s.plots(cx1 + 2, wy0 + 2, gN.x - cx1 - 4, wy1 - wy0 - 4, CITY);
  s.plots(wx0 + 2, gW.y + 3, mx0 - wx0 - 4, wy1 - gW.y - 6, CITY);
  s.plots(mx0, my1 + 1, gS.x - mx0 - 2, wy1 - my1 - 3, CITY);
  s.plots(gS.x + 3, my1 + 1, wx1 - gS.x - 6, wy1 - my1 - 3, CITY);
  s.plots(mx1 + 2, my0, wx1 - mx1 - 5, gL.y - my0 - 2, CITY);
  // ---- the Low Town outside the south wall
  s.plots(2, wy1 + 2, gS.x - 4, H - wy1 - 3, SLUM);
  s.plots(gS.x + 3, wy1 + 2, W - gS.x - 5, H - wy1 - 3, SLUM);
  s.mark('low_town', 30, wy1 + 10);
  // lamps along avenues
  for (let y = 8; y < my0; y += 7) s.setProp(gN.x - 1, y, 'lamppost');
  for (let x = 8; x < mx0; x += 7) s.setProp(x, gW.y - 1, 'lamppost');
}

function archive(s: Stamp): void {
  const W = s.w, H = s.h;
  const c = (W - 1) / 2;
  s.fill(0, 0, W, H, null, 0, null, 0, false);
  const tiers: [number, number][] = [[2, 1], [7, 6], [14, 12], [21, 18]];
  for (const [ins, dh] of tiers) {
    for (let y = ins; y < H - ins; y++) for (let x = ins; x < W - ins; x++) {
      const ring = Math.min(x - ins, y - ins, W - ins - 1 - x, H - ins - 1 - y);
      s.set(x, y, ring < 2 ? 'brick' : 'slate', dh, ring === 0 && (x + y) % 6 === 0 && ins > 2 ? 'lamppost' : '');
    }
  }
  // great dome on top
  s.disc(c, c, 7.5, (x, y, d) => s.set(x, y, 'slate', 18 + Math.round(6 * Math.sqrt(Math.max(0, 1 - (d / 7.5) ** 2))), ''));
  // small domes on tier-1 corners
  for (const [x, y] of [[10, 10], [W - 11, 10], [10, H - 11], [W - 11, H - 11]]) s.disc(x, y, 3, (xx, yy, d) => s.set(xx, yy, 'slate', 6 + Math.round(3 * Math.sqrt(Math.max(0, 1 - (d / 3) ** 2))), ''));
  // grand stair on the west axis
  const sy = Math.floor(H / 2) - 2;
  for (let x = 0; x <= 21; x++) {
    let dh = 1;
    if (x >= 2 && x <= 7) dh = Math.min(6, 1 + (x - 2));
    else if (x > 7 && x < 9) dh = 6;
    else if (x >= 9 && x <= 14) dh = Math.min(12, 7 + (x - 9));
    else if (x > 14 && x < 16) dh = 12;
    else if (x >= 16) dh = Math.min(18, 13 + (x - 16));
    s.fill(x, sy, 1, 4, 'brick', dh, '', F_ROAD);
  }
  s.setProp(1, sy - 1, 'statue'); s.setProp(1, sy + 4, 'statue');
  for (const [x, y] of [[8, sy - 1], [8, sy + 4], [15, sy - 1], [15, sy + 4]]) s.setProp(x, y, 'banner');
  s.mark('archive_gate', 0, sy + 2); s.mark('grand_stair', 10, sy + 2); s.mark('dome', c, c); s.mark('vault_entrance', 22, sy + 2);
}

function portCity(s: Stamp): void {
  const W = s.w, H = s.h;
  let wmax = -Infinity;
  for (let i = 0; i < W * H; i++) if (T_WATER[s.natT[i]]) wmax = Math.max(wmax, s.natH[i]);
  if (Number.isFinite(wmax)) s.base = wmax + 1;
  const wt = waterTop(s);
  const lvl = (x: number, y: number) => {
    const top = wt[clamp(x, 0, W - 1)] >= H ? H + 4 : wt[clamp(x, 0, W - 1)];
    const dy = top - y;
    return dy <= 7 ? 0 : dy <= 17 ? 1 : dy <= 28 ? 2 : dy <= 40 ? 3 : 4;
  };
  const stairs = [24, 48, 70];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (s.nWater(x, y)) continue;
    const L = lvl(x, y);
    const L1 = lvl(x, y + 1);
    let dh = L * 3;
    let t: Terrain = L === 0 ? 'brick' : 'road';
    if (stairs.some((sx) => Math.abs(x - sx) <= 1)) {
      const top = wt[x] >= H ? H + 4 : wt[x];
      dh = clamp(Math.round(((top - y - 7) * 3) / 10.5), 0, 12);
      t = 'stone';
      s.set(x, y, t, dh, '', F_ROAD); s.reserve(x, y, 1, 1);
      continue;
    }
    // terrace front street (first two rows of each terrace)
    const front = L1 !== L || lvl(x, y + 2) !== L;
    if (front || L === 0) { s.set(x, y, t, dh, '', F_ROAD); s.reserve(x, y, 1, 1); }
    else s.set(x, y, 'grass', dh, '');
  }
  // sea-wall with harbour jetties
  for (let x = 0; x < W; x++) {
    if (wt[x] >= H) continue;
    const y = wt[x] - 1;
    if (x > 26 && x < W - 18) {
      if (x % 6 === 0 || x % 6 === 1) for (let k = 0; k < 7; k++) if (s.nWater(x, y + 1 + k)) { s.set(x, y + 1 + k, 'wood', 0, k === 3 && x % 6 === 0 ? 'barrel' : ''); s.reserve(x, y + 1 + k, 1, 1); }
      if (s.next() < 0.2) s.setProp(x, y, s.next() < 0.5 ? 'crate' : 'barrel');
    } else if (s.inb(x, y)) s.set(x, y, 'stone', 1, '');
  }
  s.mark('harbour', W >> 1, Math.min(H - 1, wt[W >> 1]));
  // buildings on each terrace
  for (let L = 1; L <= 4; L++) {
    for (let x = 2; x < W - 2; x++) {
      for (let y = 1; y < H - 1; y++) {
        if (!s.free(x, y) || lvl(x, y) !== L || s.t[s.i(x, y)] !== T.grass) continue;
        let w = 2 + s.int(2, 4), h = 3 + s.int(0, 2);
        while (w > 2 && !(s.rectFree(x, y, w, h) && lvl(x + w - 1, y) === L && lvl(x, y + h - 1) === L)) w--;
        while (h > 2 && !(s.rectFree(x, y, w, h) && lvl(x + w - 1, y + h - 1) === L)) h--;
        if (w >= 3 && h >= 3 && s.rectFree(x, y, w, h)) s.building(x, y, w, h, { wall: s.int(4, 6), roof: s.next() < 0.75 ? 'roof' : 'slate', floor: L * 3 });
      }
    }
  }
  // the Collegium: domed school on the upper terrace
  let ccx = W >> 1, ccy = 8;
  for (let y = 2; y < H; y++) if (lvl(ccx, y) === 3) { ccy = y + 2; break; }
  s.fill(ccx - 7, ccy - 6, 15, 13, 'brick', 9, '', F_ROAD);
  s.disc(ccx, ccy, 5.5, (x, y, d) => s.set(x, y, 'slate', 9 + 5 + Math.round(4 * Math.sqrt(Math.max(0, 1 - (d / 5.5) ** 2))), ''));
  s.mark('collegium', ccx, ccy);
  // ducal fort on the headland (west)
  s.fill(1, 1, 18, 18, 'brick', 14, '', 0);
  s.wall(1, 1, 18, 1, 20, 1, 'n'); s.wall(1, 1, 1, 18, 20, 1, 'w'); s.wall(1, 18, 18, 18, 20, 1, 's'); s.wall(18, 1, 18, 18, 20, 1, 'e');
  s.tower(0, 0, 4, 4, 23); s.tower(16, 0, 4, 4, 23); s.tower(0, 16, 4, 4, 23); s.tower(16, 16, 4, 4, 23);
  s.building(6, 6, 8, 7, { wall: 6, roof: 'slate', floor: 14 });
  for (let k = 0; k < 6; k++) s.fill(19 + k, 9, 1, 3, 'stone', 14 - (k + 1) * 2 + 2, '', F_ROAD);
  s.mark('ducal_fort', 10, 10);
  // landward wall + gates
  const gN = s.gate('n'), gE = s.gate('e');
  for (let x = 19; x < W; x++) if (!gN || Math.abs(x - gN.x) > 1) s.set(x, 0, 'stone', 12 + 6, '');
  for (let y = 0; y < H; y++) if ((!gE || Math.abs(y - gE.y) > 1) && !s.nWater(W - 1, y)) s.set(W - 1, y, 'stone', lvl(W - 1, y) * 3 + 6, '');
  if (gN) s.fill(gN.x - 1, 0, 3, 3, 'road', 12, '', F_ROAD);
  if (gE) s.fill(W - 3, gE.y - 1, 3, 3, 'road', lvl(W - 2, gE.y) * 3, '', F_ROAD);
}

function fishingTown(s: Stamp): void {
  const W = s.w, H = s.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!s.nWater(x, y)) s.set(x, y, s.rand(x, y) < 0.8 ? 'sand' : 'tallgrass', 0, '');
  const cx = W >> 1, cy = H >> 1;
  s.line(cx, 0, cx, H - 1, 2, 'dirt'); s.line(0, cy, W - 1, cy, 2, 'dirt');
  s.mark('square', cx, cy); s.setProp(cx + 2, cy + 2, 'well');
  // lighthouse tower with a beacon
  s.tower(2, H - 6, 3, 3, 10); s.setProp(3, H - 5, 'brazier');
  s.mark('beacon', 3, H - 5);
  s.building(cx + 4, 3, 4, 6, { wall: 5, roof: 'slate', axis: 'y' });
  s.mark('chapel', cx + 6, 6);
  // jetties into the river / sea + nets
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!s.nWater(x, y)) continue;
    const bank = !s.nWater(x + 1, y) || !s.nWater(x - 1, y);
    if (bank && y % 6 === 0) for (let k = 0; k < 4; k++) { const xx = x + (s.nWater(x - 1, y) ? -k : k); if (s.nWater(xx, y)) s.set(xx, y, 'wood', 0, ''); }
  }
  s.plots(1, 1, cx - 2, cy - 2, { ...VILLAGE, alleyT: 'sand' });
  s.plots(cx + 2, 10, W - cx - 3, cy - 11, { ...VILLAGE, alleyT: 'sand' });
  s.plots(1, cy + 2, cx - 2, H - cy - 8, { ...VILLAGE, alleyT: 'sand' });
  s.plots(cx + 2, cy + 2, W - cx - 3, H - cy - 3, { ...VILLAGE, alleyT: 'sand' });
  for (let k = 0; k < 10; k++) { const x = s.int(1, W - 2), y = s.int(1, H - 2); if (s.free(x, y)) s.setProp(x, y, s.next() < 0.6 ? 'fence' : 'barrel'); }
}

function ruinedCity(s: Stamp): void {
  const W = s.w, H = s.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (s.nWater(x, y)) { s.reserve(x, y, 1, 1); continue; }
    const r = s.rand(x, y);
    s.set(x, y, r < 0.7 ? 'ash' : r < 0.85 ? 'stone' : 'dirt', 0, r < 0.03 ? 'bones' : r < 0.05 ? 'rock' : r < 0.06 ? 'deadtree' : '');
  }
  const wallAt = (x: number, y: number) => {
    if (s.nWater(x, y)) return;
    const n = fbm(s.seed + 3, x / 6, y / 6, 2);
    if (n < -0.2) return; // breach
    s.set(x, y, 'stone', Math.max(1, Math.round(3 + n * 6)), s.rand(x, y, 3) < 0.1 ? 'boulder' : '');
  };
  for (let x = 3; x < W - 3; x++) { wallAt(x, 3); wallAt(x, H - 4); }
  for (let y = 3; y < H - 3; y++) { wallAt(3, y); wallAt(W - 4, y); }
  // street grid of broken flagstones
  for (let k = 8; k < W - 4; k += 13) { s.line(k, 4, k, H - 5, 3, 'brick', 0, 0); s.line(4, k, W - 5, k, 3, 'brick', 0, 0); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (s.t[s.i(x, y)] === T.brick && !s.nWater(x, y) && s.rand(x, y, 4) < 0.35) s.set(x, y, 'ash', 0, s.rand(x, y, 5) < 0.06 ? 'rock' : '');
  // ruined buildings in the blocks
  for (let by = 10; by < H - 10; by += 13) for (let bx = 10; bx < W - 10; bx += 13) {
    const w = s.int(5, 9), h = s.int(5, 9), x0 = bx + s.int(0, 2), y0 = by + s.int(0, 2);
    for (let y = y0; y < y0 + h && y < H - 5; y++) for (let x = x0; x < x0 + w && x < W - 5; x++) {
      if (s.nWater(x, y)) continue;
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      if (edge) { if (s.rand(x, y, 6) < 0.62) s.set(x, y, 'stone', 1 + Math.floor(s.rand(x, y, 7) * 5), ''); }
      else s.set(x, y, s.rand(x, y, 8) < 0.5 ? 'brick' : 'ash', 0, s.rand(x, y, 9) < 0.08 ? 'brokenpillar' : s.rand(x, y, 9) < 0.12 ? 'bones' : '');
    }
  }
  // cathedral ruin at the centre
  const cx = W >> 1, cy = H >> 1;
  for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 11; x <= cx + 11; x++) {
    if (s.nWater(x, y)) continue;
    const edge = Math.abs(y - (cy)) === 7 || Math.abs(x - cx) === 11;
    if (edge) { if (s.rand(x, y, 10) < 0.7) s.set(x, y, 'stone', 3 + Math.floor(s.rand(x, y, 11) * 6), ''); }
    else s.set(x, y, 'brick', 0, (Math.abs(y - cy) === 3) && x % 3 === 0 ? (s.rand(x, y, 12) < 0.5 ? 'pillar' : 'brokenpillar') : '');
  }
  s.setProp(cx + 8, cy, 'altar');
  s.mark('cathedral', cx, cy); s.mark('altar', cx + 8, cy);
  for (const g of s.gates) s.mark(`gate_${g.side}`, g.x, g.y);
}

export const BUILDERS: Record<string, (s: Stamp) => void> = {
  market_town: marketTown,
  village,
  stilt_hamlet: stiltHamlet,
  causeway_site: causewaySite,
  sunken_lane: sunkenLane,
  ford,
  drowned_church: drownedChurch,
  tor,
  gibbet,
  barrow,
  fortress,
  mountain_fortress: mountainFortress,
  moated_castle: moatedCastle,
  watchtower,
  pass_gate: passGate,
  capital,
  archive,
  port_city: portCity,
  fishing_town: fishingTown,
  ruined_city: ruinedCity,
};

/** Build a set piece stamp. Unknown builders produce a flattened, untouched footprint. */
export function buildSetPiece(inp: StampInput): Stamp {
  const s = new Stamp(inp);
  const b = BUILDERS[inp.def.builder];
  if (b) b(s);
  s.connect();
  s.computeEdges();
  void hash32;
  return s;
}
