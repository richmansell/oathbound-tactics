/**
 * Carve a battlefield out of the overworld: copy a size×size patch of world tiles into a
 * `BattleMap` (heights normalised to 0..14) and choose deployment tiles for both sides so the
 * battle is always winnable — every chosen tile is walkable, unblocked, not deep water, and all of
 * them are mutually reachable with steps of |Δh| ≤ 3. Patches that fail (cliffs, deep water,
 * dense woods) are repaired minimally: blocking props removed, deep water shallowed, and as a last
 * resort a graded corridor carved between the two deployment bands.
 */
import { PROP_BLOCKS, TERRAIN_INFO } from '../engine/grid';
import type { BattleMap, Dir, Terrain, Tile } from '../engine/types';
import type { WorldGen } from './gen';

export interface CarveOptions {
  /** Patch size (odd numbers centre nicely). Default 15. */
  size?: number;
  /** Side the player approaches from (their deploy band). Default 's'. */
  approachDir?: Dir;
  /** Override the map id / name / theme. */
  id?: string;
  name?: string;
  theme?: string;
  /** Number of deploy tiles to return per side (≥ 6). Default 8. */
  deployCount?: number;
}

export interface CarveResult {
  map: BattleMap;
  playerTiles: [number, number][];
  enemyTiles: [number, number][];
  /** World tile of map (0, 0). */
  origin: [number, number];
  /** Whether the patch had to be repaired to guarantee connectivity. */
  repaired: boolean;
}

const MAX_H = 14;
const STEP = 3;

function passable(t: Tile): boolean {
  return TERRAIN_INFO[t.t].walkable && !t.blocked && t.t !== 'deepwater';
}

/** Connected components (4-neighbour, |Δh| ≤ STEP) over passable tiles. Returns labels (-1 = impassable). */
function components(map: BattleMap): Int32Array {
  const { w, h, tiles } = map;
  const lab = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let next = 0;
  for (let i = 0; i < w * h; i++) {
    if (lab[i] >= 0 || !passable(tiles[i])) continue;
    let qh = 0, qt = 0;
    q[qt++] = i; lab[i] = next;
    while (qh < qt) {
      const c = q[qh++], cx = c % w, cy = (c / w) | 0, ch = tiles[c].h;
      const nb = [cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1, cy > 0 ? c - w : -1, cy < h - 1 ? c + w : -1];
      for (const n of nb) {
        if (n < 0 || lab[n] >= 0 || !passable(tiles[n]) || Math.abs(tiles[n].h - ch) > STEP) continue;
        lab[n] = next; q[qt++] = n;
      }
    }
    next++;
  }
  return lab;
}

/** Distance of (x, y) from the given map edge. */
function edgeDist(dir: Dir, x: number, y: number, w: number, h: number): number {
  switch (dir) {
    case 'n': return y;
    case 's': return h - 1 - y;
    case 'w': return x;
    case 'e': return w - 1 - x;
  }
}

const OPP: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };

interface Pick { comp: number; p: number[]; e: number[]; score: number }

function choose(map: BattleMap, lab: Int32Array, dir: Dir, band: number, want: number): Pick | null {
  const { w, h } = map;
  const counts = new Map<number, { p: number[]; e: number[] }>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = lab[i];
    if (c < 0) continue;
    let rec = counts.get(c);
    if (!rec) counts.set(c, (rec = { p: [], e: [] }));
    if (edgeDist(dir, x, y, w, h) < band) rec.p.push(i);
    if (edgeDist(OPP[dir], x, y, w, h) < band) rec.e.push(i);
  }
  let best: Pick | null = null;
  for (const [comp, r] of counts) {
    const score = Math.min(r.p.length, r.e.length);
    if (score >= want && (!best || score > best.score)) best = { comp, p: r.p, e: r.e, score };
  }
  return best;
}

/** Order candidate tiles: nearest the edge first, then nearest the band's centre line; prefer dry ground. */
function rank(map: BattleMap, cands: number[], dir: Dir, n: number): [number, number][] {
  const { w, h } = map;
  const mid = (dir === 'n' || dir === 's' ? w : h) / 2 - 0.5;
  const scored = cands.map((i) => {
    const x = i % w, y = (i / w) | 0;
    const along = dir === 'n' || dir === 's' ? x : y;
    const t = map.tiles[i];
    const wet = TERRAIN_INFO[t.t].water ? 3 : 0;
    return { x, y, s: edgeDist(dir, x, y, w, h) * 2 + Math.abs(along - mid) * 0.35 + wet };
  });
  scored.sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
  return scored.slice(0, n).map((c) => [c.x, c.y] as [number, number]);
}

function themeFor(biome: string, t: Terrain): string {
  if (biome === 'snow' || t === 'snow') return 'snow';
  if (biome === 'marsh' || biome === 'blight') return 'overcast';
  return 'day';
}

export function carveBattlefield(gen: WorldGen, centerX: number, centerY: number, opts: CarveOptions = {}): CarveResult {
  const size = Math.max(7, opts.size ?? 15);
  const dir = opts.approachDir ?? 's';
  const want = Math.max(6, opts.deployCount ?? 8);
  const x0 = centerX - Math.floor(size / 2), y0 = centerY - Math.floor(size / 2);
  // ---- copy + normalise heights
  const raw = [];
  let minH = Infinity;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const wt = gen.tile(x0 + x, y0 + y);
    raw.push(wt);
    if (wt.t !== 'deepwater') minH = Math.min(minH, wt.h);
  }
  if (!Number.isFinite(minH)) minH = raw[0].h;
  const tiles: Tile[] = raw.map((wt) => {
    const tile: Tile = { h: Math.max(0, Math.min(MAX_H, wt.h - minH)), t: wt.t };
    if (wt.prop) { tile.prop = wt.prop; tile.blocked = PROP_BLOCKS[wt.prop] ?? true; }
    return tile;
  });
  const centre = raw[Math.floor(size / 2) * size + Math.floor(size / 2)];
  const sp = centre.setPiece ? gen.setPieceInfo(centre.setPiece) : undefined;
  const region = gen.regionAt(centerX, centerY);
  const map: BattleMap = {
    id: opts.id ?? `world_${centerX}_${centerY}`,
    name: opts.name ?? sp?.name ?? region.name,
    w: size, h: size, tiles,
    theme: opts.theme ?? themeFor(centre.biome, centre.t),
  };

  // ---- pick deploy tiles, repairing progressively if needed
  let repaired = false;
  let pick: Pick | null = null;
  for (let stage = 0; stage < 4 && !pick; stage++) {
    if (stage === 1) {
      // remove blocking props in both bands and a central corridor
      repaired = true;
      const mid = Math.floor(size / 2);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const t = tiles[y * size + x];
        const inBand = edgeDist(dir, x, y, size, size) < 5 || edgeDist(OPP[dir], x, y, size, size) < 5;
        const inCorridor = (dir === 'n' || dir === 's') ? Math.abs(x - mid) <= 1 : Math.abs(y - mid) <= 1;
        if (t.blocked && (inBand || inCorridor)) { delete t.prop; delete t.blocked; }
      }
    } else if (stage === 2) {
      for (const t of tiles) {
        if (t.t === 'deepwater') t.t = 'water';
        else if (!TERRAIN_INFO[t.t].walkable) t.t = 'dirt';
      }
    } else if (stage === 3) {
      gradeCorridor(map, dir);
    }
    const lab = components(map);
    for (const band of [3, 4, 5]) {
      pick = choose(map, lab, dir, band, want);
      if (pick) break;
    }
  }
  if (!pick) {
    // Should be unreachable: the graded corridor and flattened bands are always connected.
    gradeCorridor(map, dir, true);
    pick = choose(map, components(map), dir, 5, 6)!;
  }
  return {
    map,
    playerTiles: rank(map, pick.p, dir, want),
    enemyTiles: rank(map, pick.e, OPP[dir], want),
    origin: [x0, y0],
    repaired,
  };
}

/**
 * Last-resort repair: flatten the two deployment bands (3 deep) to their median heights and
 * grade a 3-wide corridor between them so consecutive steps are ≤ STEP.
 */
function gradeCorridor(map: BattleMap, dir: Dir, hard = false): void {
  const { w, h, tiles } = map;
  const vertical = dir === 'n' || dir === 's';
  const len = vertical ? h : w;
  const across = vertical ? w : h;
  const at = (a: number, l: number) => (vertical ? tiles[l * w + a] : tiles[a * w + l]);
  const median = (ls: number[]) => {
    const hs: number[] = [];
    for (const l of ls) for (let a = 0; a < across; a++) hs.push(at(a, l).h);
    hs.sort((p, q) => p - q);
    return hs[hs.length >> 1];
  };
  const startRows = [0, 1, 2], endRows = [len - 1, len - 2, len - 3];
  const h0 = median(startRows), h1 = median(endRows);
  const fix = (t: Tile, hh: number) => {
    t.h = hh;
    if (!TERRAIN_INFO[t.t].walkable || t.t === 'deepwater') t.t = t.t === 'deepwater' ? 'water' : 'dirt';
    if (t.blocked) { delete t.prop; delete t.blocked; }
  };
  for (const l of startRows) for (let a = 0; a < across; a++) { const t = at(a, l); if (hard || Math.abs(t.h - h0) > 1 || !passable(t)) fix(t, h0); }
  for (const l of endRows) for (let a = 0; a < across; a++) { const t = at(a, l); if (hard || Math.abs(t.h - h1) > 1 || !passable(t)) fix(t, h1); }
  const mid = Math.floor(across / 2);
  for (let l = 0; l < len; l++) {
    const target = Math.round(h0 + ((h1 - h0) * l) / (len - 1));
    for (let a = mid - 1; a <= mid + 1; a++) fix(at(a, l), target);
  }
}
