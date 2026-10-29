/**
 * Procedural overworld generator.
 *
 * `WorldGen` turns (seed, Geography) into an endless deterministic tile world, generated per
 * 32×32 chunk and cached (LRU). Every tile is a pure function of its coordinates — chunks never
 * depend on generation order — so the same seed always yields identical chunks.
 *
 * Pipeline per tile:
 *   1. regions → blended biome parameters (box-filtered lattice of warped region lookups, so
 *      height character blends smoothly over ~56 tiles across borders);
 *   2. macro height (domain-warped fbm + ridged noise, scaled by biome parameters, lowered in
 *      mountain passes) + detail;
 *   3. sea (union of noisy coast polygons, cliffs vs beaches by region), lakes, rivers (carved
 *      valleys with monotone water levels, deep cores, shallow edges, reed islands);
 *   4. biome painting (terrain, small height features, props);
 *   5. roads (precomputed smooth height profile → walkable decks, bridges, causeways, verges);
 *   6. set pieces (hand-designed stamps flattened onto the terrain with a smooth falloff).
 */
import type { Terrain } from '../engine/types';
import {
  CHUNK, CHUNK_AREA, KINGDOM_KMU, KMU_TO_TILES, chunkKey, chunkOf, kmuToTileF, tileKey, tileToKmu,
} from './coords';
import type { GateDef, GeoRegion, Geography, KmuPoint, RoadPoint, SetPieceDef, Side } from './geography';
import { cellular, clamp, fbm, gradNoise, hash01, hash32, lerp, ridged, smoothstep, subSeed, valueNoise, type CellResult } from './noise';
import {
  B, BIOMES, F_BLOCKED, F_BRIDGE, F_ROAD, F_STAMP, F_WATER, NB, P, PROPS, PROP_BLOCKS_CODE, T, TERRAINS, T_WATER,
} from './tables';
import { KEEP, NAT_H, Stamp, buildSetPiece, type SetPieceInfo } from './setpieces';

export { CHUNK } from './coords';
export type { SetPieceInfo } from './setpieces';

// ------------------------------------------------------------------------------------------------
// Public types
// ------------------------------------------------------------------------------------------------

export interface WorldTile {
  h: number;
  t: Terrain;
  prop?: string;
  road?: boolean;
  water?: boolean;
  region: string;
  biome: string;
  danger: number;
  setPiece?: string;
  blocked?: boolean;
  bridge?: boolean;
}

export interface RegionInfo {
  id: string;
  name: string;
  biome: string;
  /** Danger at the queried tile (1–10). */
  danger: number;
  dangerRange: [number, number];
  roaming: string[];
  weather?: string;
  chapter?: number;
  frontier: boolean;
}

/** Compact chunk storage. Index = ly * 32 + lx. */
export interface Chunk {
  cx: number;
  cy: number;
  h: Int16Array;
  /** Terrain code → TERRAINS. */
  t: Uint8Array;
  /** Prop code → PROPS (0 = none). */
  prop: Uint8Array;
  /** F_ROAD | F_WATER | F_BLOCKED | F_BRIDGE | F_STAMP. */
  flags: Uint8Array;
  /** Region index → WorldGen.regions. */
  region: Uint8Array;
  /** Biome code → BIOMES. */
  biome: Uint8Array;
  danger: Uint8Array;
  /** Set piece index + 1 → WorldGen.setPieces (0 = none). */
  setPiece: Uint16Array;
}

export { TERRAINS, PROPS, BIOMES } from './tables';

// ------------------------------------------------------------------------------------------------
// Biome parameters
// ------------------------------------------------------------------------------------------------

//                     grass  farm  forest hills  mount  marsh  coast  snow   desert blight ocean
const BIOME_BASE   = [  3.5,  3.0,  4.0,   5.2,   11.0,  1.6,   2.6,   5.0,   4.0,   3.5,   2.6];
const BIOME_AMP    = [  3.0,  2.6,  3.6,   6.5,   16.0,  0.8,   2.6,   6.0,   3.0,   3.2,   3.0];
const BIOME_RIDGE  = [  0.1,  0.0,  0.15,  0.35,  0.85,  0.0,   0.1,   0.4,   0.2,   0.15,  0.2];
const BIOME_DETAIL = [  0.7,  0.5,  0.9,   1.0,   2.2,   0.3,   0.6,   1.0,   0.7,   0.8,   0.8];
/** Mid-frequency (≈48-tile) relief: what makes a 15×15 battlefield interesting. */
const BIOME_LOCAL  = [  2.6,  2.2,  3.0,   4.0,   3.0,   0.9,   2.2,   2.8,   2.6,   2.8,   2.0];
/** Small hummocks / banks (≈14 tiles). */
const BIOME_MICRO  = [  1.8,  1.1,  2.0,   2.4,   1.5,   0.5,   1.5,   1.8,   1.6,   2.2,   1.4];

const I_RELIEF = NB, I_ELEV = NB + 1, I_CLIFF = NB + 2, I_COLD = NB + 3, I_BLIGHT = NB + 4, I_DRY = NB + 5;
const NP = NB + 6;

const LAT = 8;            // lattice spacing (tiles)
const BLUR = 3;           // box filter radius in lattice cells (7×7 → 56 tiles)
const LAT_N = CHUNK / LAT + 1; // 5 nodes per chunk axis
const RAW_N = LAT_N + 2 * BLUR; // 11

// Water classes.
const W_NONE = 0, W_RIVER = 1, W_RIVER_DEEP = 2, W_SEA = 3, W_SEA_DEEP = 4, W_LAKE = 5, W_LAKE_DEEP = 6;

const SEA_MARGIN = 240;

// ------------------------------------------------------------------------------------------------
// Internal structures
// ------------------------------------------------------------------------------------------------

interface ResolvedRegion {
  def: GeoRegion;
  index: number;
  /** Box in tiles (inclusive-exclusive), or null for frontier regions. */
  box: [number, number, number, number] | null;
  area: number;
  biomeCode: number;
  mixCodes: number[];
  scalars: Float64Array; // relief, elev, cliff, cold, blight, dry
  isLake: boolean;
}

interface LakeR { id: string; region: number; cx: number; cy: number; rx: number; ry: number; level: number; islands: { cx: number; cy: number; rx: number; ry: number }[]; bbox: [number, number, number, number] }
interface SeaR { id: string; xs: Float64Array; ys: Float64Array; bbox: [number, number, number, number] }
interface PassSeg { ax: number; ay: number; bx: number; by: number; r: number }
interface RidgeSeg { ax: number; ay: number; bx: number; by: number; w: number; h: number }

interface RiverR { id: string; reedy: number; xs: number[]; ys: number[]; hw: number[]; level: number[]; joins?: string; intoLake?: string; fromLake?: string }
interface RoadR { id: string; def: Geography['roads'][number] | null; hw: number; xs: number[]; ys: number[]; prof: number[]; cobble: boolean[]; straight: boolean[]; surface: 'dirt' | 'cobble' | 'kings'; bridge: number; causeway: number }

interface GateRT { side: Side; id?: string; x: number; y: number; out: number; explicit: boolean }

export interface SetPieceRT {
  index: number;
  def: SetPieceDef;
  /** Footprint in tiles: [x0, y0, x1, y1) */
  x0: number; y0: number; x1: number; y1: number;
  falloff: number;
  gates: GateRT[];
  stamp?: Stamp;
  info?: SetPieceInfo;
}

interface Ctx {
  cx: number; cy: number; x0: number; y0: number;
  lat: Float64Array;
  rivers: Int32Array;
  roads: Int32Array;
  seas: { s: SeaR; mode: number }[]; // mode 0 exact, -1 deep inside
  lakes: LakeR[];
  passes: PassSeg[];
  ridges: RidgeSeg[];
  sps: number[];
}

/** Scratch for one tile's natural fields. */
class Field {
  p = new Float64Array(NP);
  H = 0;          // natural height after water shaping (float)
  hLand = 0;
  water = W_NONE;
  wl = 0;         // water surface level
  seaD = 1e9;     // signed coast distance (tiles, + = land)
  lakeD = 1e9;
  riverRd = 1e9;  // distance from nearest river edge (+ = land)
  reed = 0;       // 1 = reed island in a river
  island = false;
  roadD = 1e9;
  roadSeg = -1;
  roadProf = 0;
  dom = 0;        // chosen biome code
  region = 0;
  danger = 1;
}

/** Per-rect output buffers (a chunk, a stamp's natural snapshot, or a single sample). */
interface RectOut {
  h: Int16Array; t: Uint8Array; prop: Uint8Array; flags: Uint8Array;
  region: Uint8Array; biome: Uint8Array; danger: Uint8Array; setPiece: Uint16Array;
}

function makeRect(n: number): RectOut {
  return {
    h: new Int16Array(n), t: new Uint8Array(n), prop: new Uint8Array(n), flags: new Uint8Array(n),
    region: new Uint8Array(n), biome: new Uint8Array(n), danger: new Uint8Array(n), setPiece: new Uint16Array(n),
  };
}

const SIDE_VEC: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** Whether segment a→b passes through the interior of rect [x0, y0, x1, y1]. */
function segHitsRect(ax: number, ay: number, bx: number, by: number, r: readonly [number, number, number, number]): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy], q = [ax - r[0], r[2] - ax, ay - r[1], r[3] - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] <= 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    if (t0 >= t1) return false;
  }
  return t1 - t0 > 1e-6;
}

function mtnW(p: Float64Array): number { return p[B.mountains] + p[B.snow] * 0.5; }

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number, out: { t: number }): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.t = t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

// ------------------------------------------------------------------------------------------------
// WorldGen
// ------------------------------------------------------------------------------------------------

export class WorldGen {
  readonly seed: number;
  readonly geo: Geography;
  readonly regions: ResolvedRegion[] = [];
  readonly setPieces: SetPieceRT[] = [];
  readonly rivers: RiverR[] = [];
  readonly roads: RoadR[] = [];
  readonly lakes: LakeR[] = [];
  private seas: SeaR[] = [];
  private passSegs: PassSeg[] = [];
  private ridgeSegs: RidgeSeg[] = [];
  private regionByBoxArea: ResolvedRegion[] = [];
  private regionIdx = new Map<string, number>();
  private frontierBySide: Partial<Record<Side, number>> = {};
  private nodeTiles = new Map<string, [number, number]>();
  private spById = new Map<string, SetPieceRT>();

  // segments (flat arrays)
  private rs = { ax: [] as number[], ay: [] as number[], bx: [] as number[], by: [] as number[], river: [] as number[], i: [] as number[] };
  private ds = { ax: [] as number[], ay: [] as number[], bx: [] as number[], by: [] as number[], road: [] as number[], i: [] as number[] };
  private riverBuckets = new Map<number, number[]>();
  private roadBuckets = new Map<number, number[]>();
  private pointProps = new Map<number, number>();

  // caches
  private chunks = new Map<number, Chunk>();
  private ctxs = new Map<number, Ctx>();
  private farmCache = new Map<number, number>();
  readonly maxChunks: number;

  // seeds
  private sWarpR: number; private sWarpM: number; private sMacro: number; private sRidge: number; private sDetail: number;
  private sMesa: number; private sCoast: number; private sIsle: number; private sLake: number; private sMix: number; private sMix2: number;
  private sJit: number; private sMoist: number; private sForest: number; private sMarsh: number; private sProp: number; private sProp2: number;
  private sField: number; private sDanger: number; private sReed: number; private sMeander: number; private sRoad: number; private sDune: number;

  private F = new Field();
  private F2 = new Field();
  private cellTmp: CellResult = { f1: 0, f2: 0, cx: 0, cy: 0, px: 0, py: 0, c2x: 0, c2y: 0 };
  private segT = { t: 0 };
  private ctxSerial = 1;
  private segSeenR: Int32Array = new Int32Array(0);
  private segSeenD: Int32Array = new Int32Array(0);
  private bestRd: Float64Array = new Float64Array(0);
  private bestL: Float64Array = new Float64Array(0);
  private bestHw: Float64Array = new Float64Array(0);
  private bestD: Float64Array = new Float64Array(0);

  constructor(seed: number, geo: Geography, opts: { maxChunks?: number } = {}) {
    this.seed = seed >>> 0;
    this.geo = geo;
    this.maxChunks = opts.maxChunks ?? 256;
    const s = (k: string) => subSeed(this.seed, k);
    this.sWarpR = s('warpR'); this.sWarpM = s('warpM'); this.sMacro = s('macro'); this.sRidge = s('ridge'); this.sDetail = s('detail');
    this.sMesa = s('mesa'); this.sCoast = s('coast'); this.sIsle = s('isle'); this.sLake = s('lake'); this.sMix = s('mix'); this.sMix2 = s('mix2');
    this.sJit = s('jit'); this.sMoist = s('moist'); this.sForest = s('forest'); this.sMarsh = s('marsh'); this.sProp = s('prop'); this.sProp2 = s('prop2');
    this.sField = s('field'); this.sDanger = s('danger'); this.sReed = s('reed'); this.sMeander = s('meander'); this.sRoad = s('road'); this.sDune = s('dune');

    this.resolveRegions();
    for (const n of geo.nodes) this.nodeTiles.set(n.id, [Math.round(kmuToTileF(n.pos[0])), Math.round(kmuToTileF(n.pos[1]))]);
    this.buildCalmGrid();
    this.resolveSeas();
    this.resolveLakes();
    this.resolvePasses();
    this.resolveRidges();
    this.resolveSetPieces();
    this.resolveRivers();
    this.resolveRoads();
    this.buildBuckets();
    this.computeLakeLevels();
    this.computeRiverLevels();
    this.computeRoadProfiles();
    this.placeRoadProps();
  }

  // ==============================================================================================
  // Public API
  // ==============================================================================================

  /** Generate (or fetch from the LRU cache) the chunk at chunk coords (cx, cy). */
  chunk(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    const hit = this.chunks.get(key);
    if (hit) {
      this.chunks.delete(key);
      this.chunks.set(key, hit);
      return hit;
    }
    const out = makeRect(CHUNK_AREA);
    this.computeRect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, false, out);
    const ch: Chunk = { cx, cy, ...out };
    this.chunks.set(key, ch);
    if (this.chunks.size > this.maxChunks) {
      const first = this.chunks.keys().next().value as number;
      this.chunks.delete(first);
    }
    return ch;
  }

  /** Full tile record at world tile (x, y). */
  tile(x: number, y: number): WorldTile {
    const ch = this.chunk(chunkOf(x), chunkOf(y));
    const i = (y - ch.cy * CHUNK) * CHUNK + (x - ch.cx * CHUNK);
    return this.tileFrom(ch, i);
  }

  /** Decode tile i of a chunk into a WorldTile. */
  tileFrom(ch: Chunk, i: number): WorldTile {
    const f = ch.flags[i];
    const tile: WorldTile = {
      h: ch.h[i],
      t: TERRAINS[ch.t[i]],
      region: this.regions[ch.region[i]].def.id,
      biome: BIOMES[ch.biome[i]],
      danger: ch.danger[i],
    };
    if (ch.prop[i]) tile.prop = PROPS[ch.prop[i]];
    if (f & F_ROAD) tile.road = true;
    if (f & F_WATER) tile.water = true;
    if (f & F_BLOCKED) tile.blocked = true;
    if (f & F_BRIDGE) tile.bridge = true;
    if (ch.setPiece[i]) tile.setPiece = this.setPieces[ch.setPiece[i] - 1].def.id;
    return tile;
  }

  /** Final tile height. */
  heightAt(x: number, y: number): number {
    const ch = this.chunk(chunkOf(x), chunkOf(y));
    return ch.h[(y - ch.cy * CHUNK) * CHUNK + (x - ch.cx * CHUNK)];
  }

  /** Region (crisp, border-warped) and danger at a tile. */
  regionAt(x: number, y: number): RegionInfo {
    const ri = this.regionCrisp(x, y);
    const r = this.regions[ri];
    return {
      id: r.def.id, name: r.def.name, biome: r.def.biome, danger: this.dangerAt(x, y, ri),
      dangerRange: [r.def.danger[0], r.def.danger[1]], roaming: r.def.roaming.slice(), weather: r.def.weather,
      chapter: r.def.chapter, frontier: !!r.def.frontier,
    };
  }

  /**
   * Single-tile sample without touching the chunk cache (used by the minimap for sparse
   * sampling). Returns codes: { h, t, prop, flags, biome, setPiece }.
   */
  sample(x: number, y: number): { h: number; t: number; prop: number; flags: number; biome: number; setPiece: number } {
    const out = this.sampleOut;
    this.computeRect(x, y, 1, 1, false, out);
    return { h: out.h[0], t: out.t[0], prop: out.prop[0], flags: out.flags[0], biome: out.biome[0], setPiece: out.setPiece[0] };
  }
  private sampleOut = makeRect(1);

  /** World tile of a geography node's centre. */
  nodeTile(id: string): [number, number] | undefined {
    const sp = this.spById.get(id);
    if (sp) return [Math.floor((sp.x0 + sp.x1) / 2), Math.floor((sp.y0 + sp.y1) / 2)];
    return this.nodeTiles.get(id);
  }

  /** The set piece whose footprint contains (x, y), if any (builds it on first use). */
  setPieceAt(x: number, y: number): SetPieceInfo | undefined {
    for (const sp of this.setPieces) {
      if (x >= sp.x0 && x < sp.x1 && y >= sp.y0 && y < sp.y1) return this.setPieceInfo(sp.def.id);
    }
    return undefined;
  }

  /** Bounds, gates and named locations of a set piece (builds it on first use). */
  setPieceInfo(id: string): SetPieceInfo | undefined {
    const sp = this.spById.get(id);
    if (!sp) return undefined;
    this.ensureStamp(sp);
    return sp.info;
  }

  /** All set piece infos (builds every stamp — can take a moment for the big cities). */
  allSetPieces(): SetPieceInfo[] {
    return this.setPieces.map((sp) => { this.ensureStamp(sp); return sp.info!; });
  }

  /** Road polylines in tiles (for maps / debugging). */
  roadPolylines(): { id: string; xs: number[]; ys: number[] }[] {
    return this.roads.map((r) => ({ id: r.id, xs: r.xs, ys: r.ys }));
  }

  riverPolylines(): { id: string; xs: number[]; ys: number[]; hw: number[]; level: number[] }[] {
    return this.rivers.map((r) => ({ id: r.id, xs: r.xs, ys: r.ys, hw: r.hw, level: r.level }));
  }

  clearCache(): void {
    this.chunks.clear();
    this.ctxs.clear();
  }

  // ==============================================================================================
  // Resolution of geography
  // ==============================================================================================

  private resolveRegions(): void {
    const geo = this.geo;
    geo.regions.forEach((def, index) => {
      const box = def.box
        ? [kmuToTileF(def.box[0]), kmuToTileF(def.box[1]), kmuToTileF(def.box[2] + 1), kmuToTileF(def.box[3] + 1)] as [number, number, number, number]
        : null;
      const biome = def.biome === 'lake' ? 'grassland' : def.biome;
      const sc = new Float64Array(6);
      sc[0] = def.relief ?? 1; sc[1] = def.elev ?? 0; sc[2] = def.cliff ?? 0.3; sc[3] = def.cold ?? 0; sc[4] = def.blight ?? 0; sc[5] = def.dry ?? 0;
      const rr: ResolvedRegion = {
        def, index, box, area: box ? (box[2] - box[0]) * (box[3] - box[1]) : Infinity,
        biomeCode: B[biome as keyof typeof B] ?? 0,
        mixCodes: (def.mix ?? []).filter((m) => m !== 'lake' && m !== 'coast' && m !== 'ocean').map((m) => B[m as keyof typeof B]),
        scalars: sc, isLake: def.biome === 'lake',
      };
      this.regions.push(rr);
      this.regionIdx.set(def.id, index);
      if (def.frontier) this.frontierBySide[def.frontier] = index;
    });
    if (this.regions.length > 255) throw new Error('WorldGen: at most 255 regions');
    this.regionByBoxArea = this.regions.filter((r) => r.box && !r.isLake).sort((a, b) => a.area - b.area);
  }

  private resolveSeas(): void {
    for (const s of this.geo.seas) {
      const xs = Float64Array.from(s.polygon.map((p) => kmuToTileF(p[0])));
      const ys = Float64Array.from(s.polygon.map((p) => kmuToTileF(p[1])));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < xs.length; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]); }
      this.seas.push({ id: s.id, xs, ys, bbox: [x0, y0, x1, y1] });
    }
  }

  private resolveLakes(): void {
    for (const l of this.geo.lakes) {
      const cx = kmuToTileF(l.center[0]), cy = kmuToTileF(l.center[1]);
      const rx = l.radii[0] * KMU_TO_TILES, ry = l.radii[1] * KMU_TO_TILES;
      this.lakes.push({
        id: l.id, region: l.region ? this.regionIdx.get(l.region) ?? -1 : -1, cx, cy, rx, ry, level: l.level ?? -1,
        islands: (l.islands ?? []).map((i) => ({ cx: kmuToTileF(i.center[0]), cy: kmuToTileF(i.center[1]), rx: i.radii[0] * KMU_TO_TILES, ry: i.radii[1] * KMU_TO_TILES })),
        bbox: [cx - rx - 60, cy - ry - 60, cx + rx + 60, cy + ry + 60],
      });
    }
  }

  private resolveRidges(): void {
    for (const r of this.geo.ridges ?? []) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        this.ridgeSegs.push({
          ax: kmuToTileF(r.points[i][0]), ay: kmuToTileF(r.points[i][1]), bx: kmuToTileF(r.points[i + 1][0]), by: kmuToTileF(r.points[i + 1][1]),
          w: r.width * KMU_TO_TILES, h: r.height,
        });
      }
    }
  }

  private resolvePasses(): void {
    for (const p of this.geo.passes) {
      for (let i = 0; i + 1 < p.points.length; i++) {
        this.passSegs.push({
          ax: kmuToTileF(p.points[i][0]), ay: kmuToTileF(p.points[i][1]),
          bx: kmuToTileF(p.points[i + 1][0]), by: kmuToTileF(p.points[i + 1][1]), r: p.radius * KMU_TO_TILES,
        });
      }
    }
  }

  private resolveSetPieces(): void {
    this.geo.setPieces.forEach((def, index) => {
      const [w, h] = def.size;
      const cx = Math.round(kmuToTileF(def.pos[0])), cy = Math.round(kmuToTileF(def.pos[1]));
      const x0 = cx - Math.floor(w / 2), y0 = cy - Math.floor(h / 2);
      const gates: GateRT[] = (def.gates ?? []).map((g: GateDef) => {
        const off = g.offset ?? 0;
        const lx = g.side === 'n' || g.side === 's' ? Math.floor(w / 2) + off : g.side === 'w' ? 0 : w - 1;
        const ly = g.side === 'e' || g.side === 'w' ? Math.floor(h / 2) + off : g.side === 'n' ? 0 : h - 1;
        return { side: g.side, id: g.id, x: x0 + lx, y: y0 + ly, out: Math.max(12, g.out ?? 12), explicit: !!g.explicit };
      });
      const sp: SetPieceRT = { index, def, x0, y0, x1: x0 + w, y1: y0 + h, falloff: def.falloff ?? 12, gates };
      this.setPieces.push(sp);
      this.spById.set(def.id, sp);
    });
  }

  /** Distance from a point to the nearest gated (settlement) set piece footprint. */
  private townDist(x: number, y: number): number {
    let best = 1e9;
    for (const sp of this.setPieces) {
      if (!sp.gates.length) continue;
      const dx = Math.max(sp.x0 - x, 0, x - sp.x1), dy = Math.max(sp.y0 - y, 0, y - sp.y1);
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    return best;
  }

  private resolveRivers(): void {
    const geo = this.geo;
    // Topological order: rivers that others join come first.
    const order = [...geo.rivers].sort((a, b) => (a.joins ? 1 : 0) - (b.joins ? 1 : 0));
    for (const r of order) {
      // Catmull-Rom resample at ~5 tiles.
      const cps = r.points.map((p) => [kmuToTileF(p[0]), kmuToTileF(p[1]), (p[2] * KMU_TO_TILES) / 2] as [number, number, number]);
      const xs: number[] = [], ys: number[] = [], hw: number[] = [];
      for (let i = 0; i + 1 < cps.length; i++) {
        const p0 = cps[Math.max(0, i - 1)], p1 = cps[i], p2 = cps[i + 1], p3 = cps[Math.min(cps.length - 1, i + 2)];
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const n = Math.max(1, Math.ceil(len / 5));
        for (let k = 0; k < n; k++) {
          const t = k / n, t2 = t * t, t3 = t2 * t;
          const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          xs.push(cr(p0[0], p1[0], p2[0], p3[0]));
          ys.push(cr(p0[1], p1[1], p2[1], p3[1]));
          hw.push(lerp(p1[2], p2[2], t));
        }
      }
      const last = cps[cps.length - 1];
      xs.push(last[0]); ys.push(last[1]); hw.push(last[2]);
      // Meanders: perpendicular low-frequency offset, tapered at the ends and near towns.
      const seed = subSeed(this.sMeander, r.id);
      let s = 0;
      const total = (() => { let t = 0; for (let i = 1; i < xs.length; i++) t += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); return t; })();
      const ox = xs.slice(), oy = ys.slice();
      for (let i = 0; i < xs.length; i++) {
        if (i > 0) s += Math.hypot(ox[i] - ox[i - 1], oy[i] - oy[i - 1]);
        const a = Math.max(0, i - 1), b = Math.min(xs.length - 1, i + 1);
        let tx = ox[b] - ox[a], ty = oy[b] - oy[a];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const narrow = hw[i] < 2;
        const taper = smoothstep(0, narrow ? 16 : 60, s) * smoothstep(0, narrow ? 16 : 60, total - s);
        const town = smoothstep(narrow ? 4 : 30, narrow ? 30 : 140, this.townDist(ox[i], oy[i]));
        const amp = (narrow ? 10 : 5 + hw[i] * 0.9) * taper * town;
        const off = (fbm(seed, s / (narrow ? 38 : 140), 0.5, 3) * (narrow ? 2.4 : 1.4)) * amp;
        xs[i] = ox[i] - ty * off;
        ys[i] = oy[i] + tx * off;
      }
      this.rivers.push({ id: r.id, reedy: r.reedy ?? 0, xs, ys, hw, level: new Array(xs.length).fill(0), joins: r.joins, intoLake: r.intoLake, fromLake: r.fromLake });
    }
  }

  private pointOf(p: RoadPoint): { x: number; y: number; sp?: SetPieceRT; gate?: string } {
    if (typeof p === 'string') {
      const [id, gate] = p.split(':');
      const sp = this.spById.get(id);
      const t = this.nodeTile(id);
      if (!t) throw new Error(`WorldGen: unknown road node ${id}`);
      return { x: t[0], y: t[1], sp, gate };
    }
    return { x: kmuToTileF(p[0]), y: kmuToTileF(p[1]) };
  }

  private pickGate(sp: SetPieceRT, toward: { x: number; y: number }, named: string | undefined, avoid?: GateRT): GateRT | undefined {
    if (!sp.gates.length) return undefined;
    if (named) return sp.gates.find((g) => g.id === named);
    const cx = (sp.x0 + sp.x1) / 2, cy = (sp.y0 + sp.y1) / 2;
    let dx = toward.x - cx, dy = toward.y - cy;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    let best: GateRT | undefined, bs = -Infinity;
    for (const g of sp.gates) {
      if (g.explicit) continue;
      const v = SIDE_VEC[g.side];
      const gx = g.x - cx, gy = g.y - cy;
      const gl = Math.hypot(gx, gy) || 1;
      let sc = (v[0] * dx + v[1] * dy) * 0.7 + ((gx / gl) * dx + (gy / gl) * dy) * 0.3;
      if (g === avoid) sc -= 0.6;
      if (sc > bs) { bs = sc; best = g; }
    }
    return best;
  }

  private resolveRoads(): void {
    const geo = this.geo;
    const defs: { def: Geography['roads'][number] | null; id: string; points: RoadPoint[]; width: number; surface: 'dirt' | 'cobble' | 'kings' }[] =
      geo.roads.map((r) => ({ def: r, id: r.id, points: r.points, width: r.width, surface: r.surface }));
    // Auto roads for uncovered edges.
    if (geo.autoRoads) {
      const covered = new Set<string>();
      const k = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      for (const r of geo.roads) {
        const ids = r.points.filter((p): p is string => typeof p === 'string').map((p) => p.split(':')[0]);
        for (let i = 0; i + 1 < ids.length; i++) covered.add(k(ids[i], ids[i + 1]));
        for (const [a, b] of r.covers ?? []) covered.add(k(a, b));
      }
      for (const e of geo.autoRoads.edges) {
        if (covered.has(k(e.from, e.to))) continue;
        if (!this.nodeTile(e.from) || !this.nodeTile(e.to)) continue;
        covered.add(k(e.from, e.to));
        defs.push({ def: null, id: `edge_${e.from}_${e.to}`, points: [e.from, e.to], width: geo.autoRoads.width, surface: geo.autoRoads.surface });
      }
    }
    for (const d of defs) {
      // 1. Expand waypoints with gate approaches.
      type WP = { x: number; y: number; fixed: boolean; straight: boolean };
      const wps: WP[] = [];
      const pts = d.points.map((p) => this.pointOf(p));
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.sp && p.sp.gates.length) {
          const prev = pts[i - 1], next = pts[i + 1];
          const gIn = prev ? this.pickGate(p.sp, prev, p.gate) : undefined;
          const gOut = next ? this.pickGate(p.sp, next, p.gate, gIn) : undefined;
          if (gIn) {
            const v = SIDE_VEC[gIn.side];
            wps.push({ x: gIn.x + v[0] * gIn.out, y: gIn.y + v[1] * gIn.out, fixed: true, straight: true });
            wps.push({ x: gIn.x + v[0] * 2, y: gIn.y + v[1] * 2, fixed: true, straight: true });
            wps.push({ x: gIn.x, y: gIn.y, fixed: true, straight: !!gOut });
          }
          if (!gIn && !gOut) wps.push({ x: p.x, y: p.y, fixed: true, straight: false });
          if (gOut) {
            if (!gIn) wps.push({ x: p.x, y: p.y, fixed: true, straight: true });
            const v = SIDE_VEC[gOut.side];
            wps.push({ x: gOut.x, y: gOut.y, fixed: true, straight: true });
            wps.push({ x: gOut.x + v[0] * 2, y: gOut.y + v[1] * 2, fixed: true, straight: true });
            wps.push({ x: gOut.x + v[0] * gOut.out, y: gOut.y + v[1] * gOut.out, fixed: true, straight: false });
          }
        } else {
          wps.push({ x: p.x, y: p.y, fixed: typeof d.points[i] === 'string', straight: false });
        }
      }
      // 1b. Detour free segments around gated set pieces (reach the far gate around the walls).
      for (const sp of this.setPieces) {
        if (!sp.gates.length) continue;
        const m = 8;
        const R = [sp.x0 - m, sp.y0 - m, sp.x1 + m, sp.y1 + m] as const;
        for (let i = 0; i + 1 < wps.length; i++) {
          const a = wps[i], b = wps[i + 1];
          if (a.straight || !segHitsRect(a.x, a.y, b.x, b.y, R)) continue;
          const C = [[R[0] - 1, R[1] - 1], [R[2] + 1, R[1] - 1], [R[2] + 1, R[3] + 1], [R[0] - 1, R[3] + 1]];
          let best: number[][] | null = null, bl = Infinity;
          for (let c = 0; c < 4; c++) {
            const [cx, cy] = C[c];
            if (segHitsRect(a.x, a.y, cx, cy, R) || segHitsRect(cx, cy, b.x, b.y, R)) continue;
            const l = Math.hypot(cx - a.x, cy - a.y) + Math.hypot(b.x - cx, b.y - cy);
            if (l < bl) { bl = l; best = [C[c]]; }
          }
          if (!best) {
            for (let c = 0; c < 4; c++) for (const d of [(c + 1) % 4, (c + 3) % 4]) {
              const [cx, cy] = C[c], [dx, dy] = C[d];
              if (segHitsRect(a.x, a.y, cx, cy, R) || segHitsRect(dx, dy, b.x, b.y, R)) continue;
              const l = Math.hypot(cx - a.x, cy - a.y) + Math.hypot(dx - cx, dy - cy) + Math.hypot(b.x - dx, b.y - dy);
              if (l < bl) { bl = l; best = [C[c], C[d]]; }
            }
          }
          if (best) {
            wps.splice(i + 1, 0, ...best.map(([x, y]) => ({ x, y, fixed: false, straight: false })));
            i += best.length;
          }
        }
      }
      // 2. Midpoint displacement between waypoints.
      const wob = (d.def?.wobble ?? 1) * 0.16;
      const seed = subSeed(this.sRoad, d.id);
      const xs: number[] = [], ys: number[] = [], straight: boolean[] = [], fixed: boolean[] = [];
      for (let i = 0; i < wps.length; i++) {
        const a = wps[i];
        xs.push(a.x); ys.push(a.y); straight.push(a.straight); fixed.push(a.fixed);
        const b = wps[i + 1];
        if (!b) break;
        if (a.straight || wob === 0) {
          // straight run: subdivide linearly
          const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(len / 8);
          for (let k = 1; k < n; k++) { xs.push(lerp(a.x, b.x, k / n)); ys.push(lerp(a.y, b.y, k / n)); straight.push(true); fixed.push(true); }
          continue;
        }
        const sub: [number, number][] = [];
        const rec = (ax: number, ay: number, bx: number, by: number, depth: number, idx: number) => {
          const len = Math.hypot(bx - ax, by - ay);
          if (len < 14 || depth > 9) return;
          const nx = -(by - ay) / len, ny = (bx - ax) / len;
          const off = (hash01(seed, i * 1024 + idx, depth) - 0.5) * 2 * len * wob;
          const mx = (ax + bx) / 2 + nx * off, my = (ay + by) / 2 + ny * off;
          rec(ax, ay, mx, my, depth + 1, idx * 2);
          sub.push([mx, my]);
          rec(mx, my, bx, by, depth + 1, idx * 2 + 1);
        };
        rec(a.x, a.y, b.x, b.y, 0, 1);
        for (const [x, y] of sub) { xs.push(x); ys.push(y); straight.push(false); fixed.push(false); }
      }
      // 3. Chaikin smoothing (keeping fixed / straight vertices).
      let cx = xs, cy = ys, cs = straight, cf = fixed;
      for (let it = 0; it < 2; it++) {
        const nx: number[] = [], ny: number[] = [], ns: boolean[] = [], nf: boolean[] = [];
        for (let i = 0; i < cx.length; i++) {
          if (cf[i] || i === 0 || i === cx.length - 1) { nx.push(cx[i]); ny.push(cy[i]); ns.push(cs[i]); nf.push(true); continue; }
          nx.push(lerp(cx[i - 1], cx[i], 0.75)); ny.push(lerp(cy[i - 1], cy[i], 0.75)); ns.push(false); nf.push(false);
          nx.push(lerp(cx[i], cx[i + 1], 0.25)); ny.push(lerp(cy[i], cy[i + 1], 0.25)); ns.push(false); nf.push(false);
        }
        cx = nx; cy = ny; cs = ns; cf = nf;
      }
      // 4. Resample to ≤ 6-tile segments.
      const rx: number[] = [], ry: number[] = [], rst: boolean[] = [];
      for (let i = 0; i < cx.length; i++) {
        rx.push(cx[i]); ry.push(cy[i]); rst.push(cs[i]);
        if (i + 1 < cx.length) {
          const len = Math.hypot(cx[i + 1] - cx[i], cy[i + 1] - cy[i]);
          const n = Math.ceil(len / 6);
          for (let k = 1; k < n; k++) { rx.push(lerp(cx[i], cx[i + 1], k / n)); ry.push(lerp(cy[i], cy[i + 1], k / n)); rst.push(cs[i]); }
        }
      }
      const cobble = rx.map((x, i) => d.surface === 'cobble' || (d.surface === 'kings' && this.townDist(x, ry[i]) < 110));
      this.roads.push({
        id: d.id, def: d.def, hw: d.width / 2, xs: rx, ys: ry, prof: new Array(rx.length).fill(0), cobble, straight: rst,
        surface: d.surface, bridge: T[d.def?.bridge ?? 'wood'], causeway: T[d.def?.causeway ?? 'dirt'],
      });
    }
  }

  private bucketAdd(map: Map<number, number[]>, idx: number, x0: number, y0: number, x1: number, y1: number): void {
    const B = 64;
    for (let by = Math.floor(y0 / B); by <= Math.floor(y1 / B); by++) {
      for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++) {
        const k = chunkKey(bx, by);
        let arr = map.get(k);
        if (!arr) map.set(k, (arr = []));
        arr.push(idx);
      }
    }
  }

  private buildBuckets(): void {
    this.rivers.forEach((r, ri) => {
      for (let i = 0; i + 1 < r.xs.length; i++) {
        const idx = this.rs.ax.length;
        this.rs.ax.push(r.xs[i]); this.rs.ay.push(r.ys[i]); this.rs.bx.push(r.xs[i + 1]); this.rs.by.push(r.ys[i + 1]);
        this.rs.river.push(ri); this.rs.i.push(i);
        const hw = Math.max(r.hw[i], r.hw[i + 1]);
        const m = hw + 10 + 1.7 * hw + 2;
        this.bucketAdd(this.riverBuckets, idx, Math.min(r.xs[i], r.xs[i + 1]) - m, Math.min(r.ys[i], r.ys[i + 1]) - m, Math.max(r.xs[i], r.xs[i + 1]) + m, Math.max(r.ys[i], r.ys[i + 1]) + m);
      }
    });
    this.roads.forEach((r, ri) => {
      for (let i = 0; i + 1 < r.xs.length; i++) {
        const idx = this.ds.ax.length;
        this.ds.ax.push(r.xs[i]); this.ds.ay.push(r.ys[i]); this.ds.bx.push(r.xs[i + 1]); this.ds.by.push(r.ys[i + 1]);
        this.ds.road.push(ri); this.ds.i.push(i);
        const m = r.hw + 7;
        this.bucketAdd(this.roadBuckets, idx, Math.min(r.xs[i], r.xs[i + 1]) - m, Math.min(r.ys[i], r.ys[i + 1]) - m, Math.max(r.xs[i], r.xs[i + 1]) + m, Math.max(r.ys[i], r.ys[i + 1]) + m);
      }
    });
    this.segSeenR = new Int32Array(this.rs.ax.length);
    this.segSeenD = new Int32Array(this.ds.ax.length);
    const nr = this.rivers.length;
    this.bestRd = new Float64Array(nr); this.bestL = new Float64Array(nr); this.bestHw = new Float64Array(nr); this.bestD = new Float64Array(nr);
  }

  // ---------------------------------------------------------------------------------------------
  // Levels and profiles (need the stage-0/1 field)
  // ---------------------------------------------------------------------------------------------

  private hAt(x: number, y: number, stage: number): number {
    const ctx = this.ctxFor(chunkOf(Math.floor(x)), chunkOf(Math.floor(y)));
    this.field(Math.floor(x), Math.floor(y), ctx, stage, this.F2);
    return this.F2.H;
  }

  private computeLakeLevels(): void {
    for (const l of this.lakes) {
      if (l.level >= 0) continue;
      let mn = Infinity;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        mn = Math.min(mn, this.hAt(l.cx + Math.cos(a) * (l.rx + 24), l.cy + Math.sin(a) * (l.ry + 24), 0));
      }
      l.level = Math.max(1, Math.floor(mn - 1));
    }
  }

  private computeRiverLevels(): void {
    const levelAt = (rid: string, x: number, y: number): number => {
      const r = this.rivers.find((q) => q.id === rid);
      if (!r) return 0;
      let best = Infinity, lv = 0;
      for (let i = 0; i < r.xs.length; i++) {
        const d = Math.hypot(r.xs[i] - x, r.ys[i] - y);
        if (d < best) { best = d; lv = r.level[i]; }
      }
      return lv;
    };
    for (const r of this.rivers) {
      const n = r.xs.length;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = r.xs[b] - r.xs[a], ty = r.ys[b] - r.ys[a];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        let mn = Infinity;
        for (const o of [-1.4, -0.7, 0, 0.7, 1.4]) {
          const off = o * (r.hw[i] + 3);
          mn = Math.min(mn, this.hAt(r.xs[i] - ty * off, r.ys[i] + tx * off, 1));
        }
        r.level[i] = Math.max(0, mn - 1.6);
      }
      if (r.fromLake) {
        const lk = this.lakes.find((l) => l.id === r.fromLake);
        if (lk) r.level[0] = Math.min(r.level[0], lk.level);
      }
      for (let i = 1; i < n; i++) r.level[i] = Math.min(r.level[i], r.level[i - 1]);
      if (r.intoLake) {
        const lk = this.lakes.find((l) => l.id === r.intoLake);
        if (lk) { for (let i = 0; i < n; i++) r.level[i] = Math.max(r.level[i], lk.level); r.level[n - 1] = lk.level; }
      }
      if (r.joins) {
        const jl = levelAt(r.joins, r.xs[n - 1], r.ys[n - 1]);
        for (let i = 0; i < n; i++) r.level[i] = Math.max(r.level[i], jl);
      }
      // Rivers that reach the sea end at 0.
      const lastH = this.hAt(r.xs[n - 1], r.ys[n - 1], 0);
      if (lastH <= 0.01) {
        for (let i = n - 1, k = 0; i >= 0 && k < 12; i--, k++) r.level[i] = Math.min(r.level[i], k * 0.25);
        for (let i = 1; i < n; i++) r.level[i] = Math.min(r.level[i], r.level[i - 1]);
      }
    }
  }

  private computeRoadProfiles(): void {
    for (const r of this.roads) {
      const n = r.xs.length;
      const raw = new Array(n);
      for (let i = 0; i < n; i++) raw[i] = Math.max(1, this.hAt(r.xs[i], r.ys[i], 1));
      // moving average ±4
      const sm = raw.map((_, i) => {
        let s = 0, c = 0;
        for (let k = -4; k <= 4; k++) { const j = i + k; if (j >= 0 && j < n) { s += raw[j]; c++; } }
        return s / c;
      });
      // slope clamp 0.5 per tile
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < n; i++) {
          const len = Math.hypot(r.xs[i] - r.xs[i - 1], r.ys[i] - r.ys[i - 1]) * 0.5;
          sm[i] = clamp(sm[i], sm[i - 1] - len, sm[i - 1] + len);
        }
        for (let i = n - 2; i >= 0; i--) {
          const len = Math.hypot(r.xs[i + 1] - r.xs[i], r.ys[i + 1] - r.ys[i]) * 0.5;
          sm[i] = clamp(sm[i], sm[i + 1] - len, sm[i + 1] + len);
        }
      }
      r.prof = sm;
    }
  }

  private placeRoadProps(): void {
    for (const r of this.roads) {
      const lamps = r.def?.lamps ?? 0, way = r.def?.wayside ?? 0;
      if (!lamps && !way) continue;
      let s = 0, nextLamp = lamps / 2, nextWay = way / 2, side = 1;
      for (let i = 1; i < r.xs.length; i++) {
        const dx = r.xs[i] - r.xs[i - 1], dy = r.ys[i] - r.ys[i - 1];
        const len = Math.hypot(dx, dy);
        const nx = -dy / (len || 1), ny = dx / (len || 1);
        const s1 = s + len;
        const put = (at: number, prop: number) => {
          const t = (at - s) / (len || 1);
          const px = Math.round(r.xs[i - 1] + dx * t + nx * (r.hw + 1.5) * side);
          const py = Math.round(r.ys[i - 1] + dy * t + ny * (r.hw + 1.5) * side);
          this.pointProps.set(tileKey(px, py), prop);
        };
        while (lamps && nextLamp <= s1) { put(nextLamp, P.lamppost); nextLamp += lamps; side = -side; }
        while (way && nextWay <= s1) { put(nextWay, P.cross); nextWay += way; }
        s = s1;
      }
    }
  }

  // ==============================================================================================
  // Regions
  // ==============================================================================================

  /** Region index for biome purposes (lake regions skipped). Coordinates already warped. */
  private regionForBiome(tx: number, ty: number): number {
    const kx = tileToKmu(tx), ky = tileToKmu(ty);
    const max = KINGDOM_KMU - 1;
    if (kx < 0 || ky < 0 || kx > max + 1 || ky > max + 1) {
      const dx = kx < 0 ? -kx : kx > max + 1 ? kx - max - 1 : 0;
      const dy = ky < 0 ? -ky : ky > max + 1 ? ky - max - 1 : 0;
      const dOut = Math.max(dx, dy);
      if (dOut < this.geo.frontier.blend) {
        return this.regionForBiome(kmuToTileF(clamp(kx, 0, max + 0.99)), kmuToTileF(clamp(ky, 0, max + 0.99)));
      }
      const side: Side = dx > dy ? (kx < 0 ? 'w' : 'e') : (ky < 0 ? 'n' : 's');
      const fi = this.frontierBySide[side];
      if (fi !== undefined) return fi;
      return this.regionForBiome(kmuToTileF(clamp(kx, 0, max + 0.99)), kmuToTileF(clamp(ky, 0, max + 0.99)));
    }
    for (const r of this.regionByBoxArea) {
      const b = r.box!;
      if (tx >= b[0] && tx < b[2] && ty >= b[1] && ty < b[3]) return r.index;
    }
    // Gap between boxes: nearest box.
    let best = 0, bd = Infinity;
    for (const r of this.regionByBoxArea) {
      const b = r.box!;
      const dx = Math.max(b[0] - tx, 0, tx - b[2]), dy = Math.max(b[1] - ty, 0, ty - b[3]);
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = r.index; }
    }
    return best;
  }

  private warpRegion(x: number, y: number, out: Float64Array): void {
    const k = this.calm(x, y, 110, 280, 0);
    out[0] = (fbm(this.sWarpR, x / 800, y / 800, 3) * 420 + fbm(this.sWarpR + 99, x / 160, y / 160, 2) * 110) * k;
    out[1] = (fbm(this.sWarpR + 7777, x / 800 + 5.2, y / 800 + 1.3, 3) * 420 + fbm(this.sWarpR + 199, x / 160, y / 160, 2) * 110) * k;
  }

  /**
   * Noise damping near story nodes: 1 far away, `floor` within r0 tiles of a node, so border warps
   * and coast noise never move a set piece out of its bible region or off its shore.
   */
  private calm(x: number, y: number, r0: number, r1: number, floor: number): number {
    const cell = this.calmGrid.get(chunkKey(Math.floor(x / 256), Math.floor(y / 256)));
    if (!cell) return 1;
    let k = 1;
    for (let i = 0; i < cell.length; i += 2) {
      const d = Math.hypot(x - cell[i], y - cell[i + 1]);
      if (d < r1) k = Math.min(k, floor + (1 - floor) * smoothstep(r0, r1, d));
    }
    return k;
  }
  private calmGrid = new Map<number, number[]>();
  private buildCalmGrid(): void {
    const pts: [number, number][] = [];
    for (const [, t] of this.nodeTiles) pts.push(t);
    for (const [x, y] of pts) {
      for (let gy = Math.floor((y - 300) / 256); gy <= Math.floor((y + 300) / 256); gy++) for (let gx = Math.floor((x - 300) / 256); gx <= Math.floor((x + 300) / 256); gx++) {
        const k = chunkKey(gx, gy);
        let a = this.calmGrid.get(k);
        if (!a) this.calmGrid.set(k, (a = []));
        a.push(x, y);
      }
    }
  }

  private regionWarp = new Float64Array(2);

  /** Crisp region index at a tile (lakes included). */
  private regionCrisp(x: number, y: number): number {
    for (const l of this.lakes) {
      if (l.region < 0) continue;
      if (x < l.bbox[0] || x > l.bbox[2] || y < l.bbox[1] || y > l.bbox[3]) continue;
      if (this.lakeSd(l, x, y) < 0) return l.region;
    }
    const w = this.regionWarp;
    this.warpRegion(x, y, w);
    return this.hardEdge(this.regionForBiome(x + w[0], y + w[1]), x, y);
  }

  /**
   * Regions with `hardEdges` (e.g. the Ashen Reach behind its burn-line) never spill past those
   * box sides: if the warped lookup lands in one but the unwarped point is outside that side,
   * the unwarped lookup wins.
   */
  private hardEdge(ri: number, x: number, y: number): number {
    const r = this.regions[ri];
    const he = r.def.hardEdges;
    if (!he || !r.box) return ri;
    const b = r.box;
    if ((he.includes('w') && x < b[0]) || (he.includes('e') && x >= b[2]) || (he.includes('n') && y < b[1]) || (he.includes('s') && y >= b[3])) {
      const alt = this.regionForBiome(x, y);
      return alt === ri ? ri : alt;
    }
    return ri;
  }

  private dangerAt(x: number, y: number, ri: number): number {
    const r = this.regions[ri].def;
    const kx = tileToKmu(x), ky = tileToKmu(y), max = KINGDOM_KMU;
    const dOut = Math.max(kx < 0 ? -kx : kx > max ? kx - max : 0, ky < 0 ? -ky : ky > max ? ky - max : 0);
    const n = valueNoise(this.sDanger, x / 380, y / 380) * 0.5 + 0.5;
    const d = lerp(r.danger[0], r.danger[1], n) + dOut * this.geo.frontier.dangerPerKmu;
    return clamp(Math.round(d), 1, 10);
  }

  // ==============================================================================================
  // Per-chunk context
  // ==============================================================================================

  private ctxFor(cx: number, cy: number): Ctx {
    const key = chunkKey(cx, cy);
    const hit = this.ctxs.get(key);
    if (hit) return hit;
    const ctx = this.buildCtx(cx, cy);
    this.ctxs.set(key, ctx);
    if (this.ctxs.size > 2048) {
      const first = this.ctxs.keys().next().value as number;
      this.ctxs.delete(first);
    }
    return ctx;
  }

  private buildCtx(cx: number, cy: number): Ctx {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK, y1 = y0 + CHUNK;
    // --- region lattice
    const raw = new Float64Array(RAW_N * RAW_N * NP);
    const gx0 = cx * (CHUNK / LAT) - BLUR, gy0 = cy * (CHUNK / LAT) - BLUR;
    const w = this.regionWarp;
    for (let j = 0; j < RAW_N; j++) {
      for (let i = 0; i < RAW_N; i++) {
        const tx = (gx0 + i) * LAT, ty = (gy0 + j) * LAT;
        this.warpRegion(tx, ty, w);
        const ri = this.hardEdge(this.regionForBiome(tx + w[0], ty + w[1]), tx, ty);
        const r = this.regions[ri];
        const o = (j * RAW_N + i) * NP;
        let b = r.biomeCode;
        if (r.mixCodes.length) {
          const m = fbm(this.sMix, tx / 900, ty / 900, 3);
          if (m > 0.16) {
            const k = clamp(Math.floor((fbm(this.sMix2, tx / 1400, ty / 1400, 2) * 0.9 + 0.5) * r.mixCodes.length), 0, r.mixCodes.length - 1);
            b = r.mixCodes[k];
          }
        }
        if (r.biomeCode === B.marsh && b === B.forest) { raw[o + B.marsh] += 0.55; raw[o + B.forest] += 0.45; }
        else raw[o + b] = 1;
        for (let k = 0; k < 6; k++) raw[o + NB + k] = r.scalars[k];
      }
    }
    const lat = new Float64Array(LAT_N * LAT_N * NP);
    const inv = 1 / ((2 * BLUR + 1) * (2 * BLUR + 1));
    for (let j = 0; j < LAT_N; j++) {
      for (let i = 0; i < LAT_N; i++) {
        const o = (j * LAT_N + i) * NP;
        for (let dj = 0; dj <= 2 * BLUR; dj++) {
          for (let di = 0; di <= 2 * BLUR; di++) {
            const ro = ((j + dj) * RAW_N + (i + di)) * NP;
            for (let k = 0; k < NP; k++) lat[o + k] += raw[ro + k];
          }
        }
        for (let k = 0; k < NP; k++) lat[o + k] *= inv;
      }
    }
    // --- candidates
    const serial = ++this.ctxSerial;
    const gather = (buckets: Map<number, number[]>, seen: Int32Array): Int32Array => {
      const res: number[] = [];
      for (let by = Math.floor(y0 / 64); by <= Math.floor((y1 - 1) / 64); by++) {
        for (let bx = Math.floor(x0 / 64); bx <= Math.floor((x1 - 1) / 64); bx++) {
          const arr = buckets.get(chunkKey(bx, by));
          if (!arr) continue;
          for (const s of arr) { if (seen[s] !== serial) { seen[s] = serial; res.push(s); } }
        }
      }
      return Int32Array.from(res);
    };
    const rivers = gather(this.riverBuckets, this.segSeenR);
    const roads = gather(this.roadBuckets, this.segSeenD);
    const mx = x0 + CHUNK / 2, my = y0 + CHUNK / 2;
    const seas: { s: SeaR; mode: number }[] = [];
    for (const s of this.seas) {
      const b = s.bbox;
      if (mx < b[0] - SEA_MARGIN - 32 || mx > b[2] + SEA_MARGIN + 32 || my < b[1] - SEA_MARGIN - 32 || my > b[3] + SEA_MARGIN + 32) continue;
      const sd = this.polySd(s, mx, my);
      if (sd > SEA_MARGIN + 24) continue;
      seas.push({ s, mode: sd < -(SEA_MARGIN + 24) ? -1 : 0 });
    }
    const lakes = this.lakes.filter((l) => !(x1 < l.bbox[0] || x0 > l.bbox[2] || y1 < l.bbox[1] || y0 > l.bbox[3]));
    const passes = this.passSegs.filter((p) => {
      const d = segDist(mx, my, p.ax, p.ay, p.bx, p.by, this.segT);
      return d < p.r + 30;
    });
    const ridges = this.ridgeSegs.filter((r) => segDist(mx, my, r.ax, r.ay, r.bx, r.by, this.segT) < r.w * 1.6 + 70);
    const sps: number[] = [];
    for (const sp of this.setPieces) {
      const f = sp.falloff;
      if (x1 <= sp.x0 - f || x0 >= sp.x1 + f || y1 <= sp.y0 - f || y0 >= sp.y1 + f) continue;
      sps.push(sp.index);
    }
    return { cx, cy, x0, y0, lat, rivers, roads, seas, lakes, passes, ridges, sps };
  }

  /** Signed distance to a polygon (negative inside), tiles. */
  private polySd(s: SeaR, x: number, y: number): number {
    const xs = s.xs, ys = s.ys, n = xs.length;
    let best = Infinity, inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = xs[j], ay = ys[j], bx = xs[i], by = ys[i];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qy = ay + dy * t - y;
      const d = qx * qx + qy * qy;
      if (d < best) best = d;
    }
    const d = Math.sqrt(best);
    return inside ? -d : d;
  }

  private lakeSd(l: LakeR, x: number, y: number): number {
    const nx = (x - l.cx) / l.rx, ny = (y - l.cy) / l.ry;
    const k = Math.sqrt(nx * nx + ny * ny);
    return (k - 1) * Math.min(l.rx, l.ry) + fbm(this.sLake, x / 70, y / 70, 3) * 16;
  }

  // ==============================================================================================
  // Natural field
  // ==============================================================================================

  private field(x: number, y: number, ctx: Ctx, stage: number, F: Field): void {
    // ---- 1. blended parameters (bilinear over the chunk lattice)
    const lx = x - ctx.x0, ly = y - ctx.y0;
    const gi = lx >> 3, gj = ly >> 3;
    const fx = (lx & 7) / 8, fy = (ly & 7) / 8;
    const lat = ctx.lat, p = F.p;
    const o00 = (gj * LAT_N + gi) * NP, o10 = o00 + NP, o01 = o00 + LAT_N * NP, o11 = o01 + NP;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    for (let k = 0; k < NP; k++) p[k] = lat[o00 + k] * w00 + lat[o10 + k] * w10 + lat[o01 + k] * w01 + lat[o11 + k] * w11;
    let base = 0, amp = 0, ridge = 0, detail = 0, local = 0, micro = 0;
    for (let b = 0; b < NB; b++) {
      const wb = p[b];
      if (wb < 0.0005) continue;
      base += wb * BIOME_BASE[b]; amp += wb * BIOME_AMP[b]; ridge += wb * BIOME_RIDGE[b]; detail += wb * BIOME_DETAIL[b]; local += wb * BIOME_LOCAL[b]; micro += wb * BIOME_MICRO[b];
    }
    amp *= p[I_RELIEF];
    base += p[I_ELEV];
    // ---- passes
    let pf = 1;
    if (ctx.passes.length) {
      for (const s of ctx.passes) {
        const d = segDist(x, y, s.ax, s.ay, s.bx, s.by, this.segT);
        pf = Math.min(pf, smoothstep(s.r * 0.45, s.r, d));
      }
      if (pf < 1) {
        amp *= 0.25 + 0.75 * pf;
        ridge *= 0.4 + 0.6 * pf;
        base = lerp(Math.min(base, 8), base, pf);
      }
    }
    // ---- 2. macro + detail
    const wx = fbm(this.sWarpM, x / 320, y / 320, 2) * 60;
    const wy = fbm(this.sWarpM + 7777, x / 320 + 5.2, y / 320 + 1.3, 2) * 60;
    const n1 = fbm(this.sMacro, (x + wx) / 240, (y + wy) / 240, 5);
    let h = base + amp * (1 - ridge) * n1;
    if (ridge > 0.02) {
      const r = ridged(this.sRidge, (x + wx) / 125, (y + wy) / 125, 5);
      h += amp * ridge * (r * 2 - 0.62) * 1.25;
    }
    h += detail * fbm(this.sDetail, x / 22, y / 22, 2);
    h += local * pf * fbm(this.sDetail + 51, x / 48, y / 48, 3) * 2.2;
    h += micro * fbm(this.sDetail + 53, x / 14, y / 14, 2) * 1.5;
    // ---- crags on high ground
    if (mtnW(p) > 0.2 && h > 11) {
      h += (ridged(this.sDetail + 31, x / 26, y / 26, 3) - 0.35) * 7 * smoothstep(11, 19, h) * mtnW(p);
    }
    // ---- terraces: sharp cliffs in mountains, ledges in hills / snowfields (not in passes)
    const mw = p[B.mountains], hw = p[B.hills], sw = p[B.snow];
    const tw = (mw + hw + sw) * pf;
    if (tw > 0.04) {
      const inv = 1 / (mw + hw + sw);
      const step = (mw * 5 + hw * 3 + sw * 4) * inv;
      const sharp = (mw * 0.92 + hw * 0.55 + sw * 0.8) * inv;
      const a = 0.6 + 0.3 * sharp, b = a + (1 - sharp) * 0.4 + 0.035;
      const tt = (h + gradNoise(this.sDetail + 17, x / 40, y / 40) * 1.6) / step;
      const fl = Math.floor(tt);
      const terr = (fl + smoothstep(a, b, tt - fl)) * step;
      h = lerp(h, terr, Math.min(1, tw * 1.25));
    }
    const desertW = p[B.desert];
    if (desertW > 0.05) {
      const m = fbm(this.sMesa, x / 120, y / 120, 3);
      h += desertW * (smoothstep(0.185, 0.197, m) * 7 + smoothstep(0.43, 0.442, m) * 4);
    }
    if (h > 24) h = 24 + (h - 24) * 0.35;
    // ---- mountain crest: sheer-sided spine, cut only by pass corridors
    if (ctx.ridges.length && pf > 0.02) {
      const wy = fbm(this.sDetail + 41, x / 260, y / 260, 3) * 70;
      let boost = 0;
      for (const r of ctx.ridges) {
        const d = segDist(x, y + wy, r.ax, r.ay, r.bx, r.by, this.segT);
        const w = r.w * (0.75 + 0.5 * (fbm(this.sDetail + 43, x / 90, y / 90, 2) * 0.5 + 0.5));
        if (d < w) boost = Math.max(boost, r.h);
      }
      if (boost > 0) h += Math.round(boost * smoothstep(0.35, 0.75, pf));
    }
    F.hLand = h;
    F.water = W_NONE; F.wl = 0; F.seaD = 1e9; F.lakeD = 1e9; F.riverRd = 1e9; F.reed = 0; F.island = false;

    // ---- 3a. sea
    let H = h;
    if (ctx.seas.length) {
      let sd = 1e9;
      for (const c of ctx.seas) sd = Math.min(sd, c.mode < 0 ? -1e4 : this.polySd(c.s, x, y));
      const sc = sd + (fbm(this.sCoast, x / 300, y / 300, 4) * 210 + fbm(this.sCoast + 5, x / 60, y / 60, 2) * 34) * this.calm(x, y, 120, 220, 0.15) + gradNoise(this.sCoast + 9, x / 12, y / 12) * 3;
      F.seaD = sc;
      if (sc < 0) {
        // islands far out at sea
        const kx = tileToKmu(x), ky = tileToKmu(y), max = KINGDOM_KMU;
        const dOut = Math.max(kx < 0 ? -kx : kx > max ? kx - max : 0, ky < 0 ? -ky : ky > max ? ky - max : 0) * KMU_TO_TILES;
        const isl = fbm(this.sIsle, x / 190, y / 190, 4) - (0.42 - 0.16 * smoothstep(0, 1600, dOut)) - 0.35 * (1 - smoothstep(70, 260, -sc));
        if (isl > 0) {
          F.island = true;
          F.seaD = isl * 220;
          H = 1 + isl * 34 * Math.max(0.6, p[I_RELIEF]) + detail * 0.5 * fbm(this.sDetail, x / 22, y / 22, 2);
          H = Math.max(1, H);
        } else {
          F.water = sc < -8 && isl < -0.03 ? W_SEA_DEEP : W_SEA;
          H = 0; F.wl = 0;
        }
      } else {
        const ramp = lerp(42, 3, clamp(p[I_CLIFF], 0, 1));
        const c = smoothstep(0, ramp, sc);
        H = 1 + Math.max(0, h - 1) * c;
      }
    }
    if (F.water === W_NONE && H < 1) H = 1;

    // ---- 3b. lakes
    if (stage >= 1 && F.water === W_NONE && ctx.lakes.length) {
      for (const l of ctx.lakes) {
        const sd = this.lakeSd(l, x, y);
        if (sd > 44) continue;
        const L = l.level;
        let onIsland = false;
        for (const is of l.islands) {
          const nx = (x - is.cx) / is.rx, ny = (y - is.cy) / is.ry;
          const isd = (Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(is.rx, is.ry) + fbm(this.sLake + 3, x / 30, y / 30, 2) * 5;
          if (isd < 0) { onIsland = true; H = L + 1 + Math.max(0, H - L - 1) * smoothstep(0, 14, -isd); F.lakeD = -isd; }
        }
        if (onIsland) continue;
        if (sd < 0) {
          F.water = sd < -12 ? W_LAKE_DEEP : W_LAKE;
          H = L; F.wl = L; F.lakeD = sd;
        } else {
          F.lakeD = Math.min(F.lakeD, sd);
          if (H > L + 1) H = L + 1 + (H - L - 1) * smoothstep(0, 44, sd);
          else H = Math.max(H, L + 1);
        }
      }
    }

    // ---- 3c. rivers
    if (stage >= 2 && ctx.rivers.length) {
      const nr = this.rivers.length;
      const bestRd = this.bestRd, bestL = this.bestL, bestHw = this.bestHw, bestD = this.bestD;
      for (let r = 0; r < nr; r++) bestRd[r] = 1e9;
      const rs = this.rs;
      for (let k = 0; k < ctx.rivers.length; k++) {
        const s = ctx.rivers[k];
        const d = segDist(x, y, rs.ax[s], rs.ay[s], rs.bx[s], rs.by[s], this.segT);
        const rv = this.rivers[rs.river[s]];
        const i = rs.i[s], t = this.segT.t;
        const hw = rv.hw[i] + (rv.hw[i + 1] - rv.hw[i]) * t;
        const rd = d - hw;
        const ri = rs.river[s];
        if (rd < bestRd[ri]) { bestRd[ri] = rd; bestHw[ri] = hw; bestD[ri] = d; bestL[ri] = rv.level[i] + (rv.level[i + 1] - rv.level[i]) * t; }
      }
      let wr = -1, wrd = 0;
      for (let r = 0; r < nr; r++) {
        const rd = bestRd[r];
        if (rd > 1e8) continue;
        const L = bestL[r], hw = bestHw[r];
        if (rd < F.riverRd) F.riverRd = rd;
        if (rd >= 0) {
          const valley = 10 + 1.7 * hw;
          if (rd < valley && H > L + 1) H = L + 1 + (H - L - 1) * smoothstep(0, valley, rd);
        } else if (wr < 0 || rd < wrd) { wr = r; wrd = rd; }
      }
      if (wr >= 0 && F.water === W_NONE) {
        const rv = this.rivers[wr], hw = bestHw[wr], d = bestD[wr], L = bestL[wr];
        const reedy = rv.reedy;
        if (reedy > 0 && hw >= 3 && d > hw * 0.42 && valueNoise(this.sReed, x / 5, y / 5) * 0.6 + valueNoise(this.sReed + 1, x / 13, y / 13) * 0.4 > 0.62 - reedy * 0.22) {
          F.reed = 1; H = L + 1;
        } else {
          F.water = d < hw * 0.5 && hw >= 3.5 ? W_RIVER_DEEP : W_RIVER;
          H = L; F.wl = L;
        }
      }
    }
    F.H = H;
  }

  // ==============================================================================================
  // Rect computation (natural + paint + roads + set pieces)
  // ==============================================================================================

  private hBuf = new Float64Array(0);
  private fieldsBuf = {
    water: new Uint8Array(0), wl: new Float64Array(0), seaD: new Float64Array(0), lakeD: new Float64Array(0), riverRd: new Float64Array(0),
    reed: new Uint8Array(0), island: new Uint8Array(0), roadD: new Float64Array(0), roadSeg: new Int32Array(0), roadProf: new Float64Array(0),
    dom: new Uint8Array(0), cold: new Float64Array(0), blight: new Float64Array(0), forestW: new Float64Array(0), marshW: new Float64Array(0),
    desertW: new Float64Array(0), cliff: new Float64Array(0), hLand: new Float64Array(0), region: new Uint8Array(0), danger: new Uint8Array(0),
  };

  private ensureBufs(n: number, nb: number): void {
    if (this.hBuf.length < nb) this.hBuf = new Float64Array(nb);
    const fb = this.fieldsBuf;
    if (fb.water.length >= n) return;
    this.fieldsBuf = {
      water: new Uint8Array(n), wl: new Float64Array(n), seaD: new Float64Array(n), lakeD: new Float64Array(n), riverRd: new Float64Array(n),
      reed: new Uint8Array(n), island: new Uint8Array(n), roadD: new Float64Array(n), roadSeg: new Int32Array(n), roadProf: new Float64Array(n),
      dom: new Uint8Array(n), cold: new Float64Array(n), blight: new Float64Array(n), forestW: new Float64Array(n), marshW: new Float64Array(n),
      desertW: new Float64Array(n), cliff: new Float64Array(n), hLand: new Float64Array(n), region: new Uint8Array(n), danger: new Uint8Array(n),
    };
  }

  private computeRect(x0: number, y0: number, w: number, h: number, skipSP: boolean, out: RectOut): void {
    const bw = w + 1, bh = h + 1;
    this.ensureBufs(w * h, bw * bh);
    const hb = this.hBuf, fb = this.fieldsBuf, F = this.F;
    let ctx: Ctx | null = null;
    // ---- pass A: fields
    for (let j = 0; j < bh; j++) {
      const y = y0 + j;
      const cy = chunkOf(y);
      for (let i = 0; i < bw; i++) {
        const x = x0 + i;
        const cx = chunkOf(x);
        if (!ctx || ctx.cx !== cx || ctx.cy !== cy) ctx = this.ctxFor(cx, cy);
        this.field(x, y, ctx, 2, F);
        hb[j * bw + i] = F.H;
        if (i >= w || j >= h) continue;
        const o = j * w + i;
        fb.water[o] = F.water; fb.wl[o] = F.wl; fb.seaD[o] = F.seaD; fb.lakeD[o] = F.lakeD; fb.riverRd[o] = F.riverRd;
        fb.reed[o] = F.reed; fb.island[o] = F.island ? 1 : 0; fb.hLand[o] = F.hLand;
        const p = F.p;
        fb.cold[o] = p[I_COLD]; fb.blight[o] = p[I_BLIGHT]; fb.forestW[o] = p[B.forest]; fb.marshW[o] = p[B.marsh];
        fb.desertW[o] = p[B.desert]; fb.cliff[o] = p[I_CLIFF];
        // dominant biome with organic dithering
        let b1 = 0, w1 = -1, b2 = 0, w2 = -1;
        for (let b = 0; b < NB; b++) {
          const v = p[b];
          if (v > w1) { b2 = b1; w2 = w1; b1 = b; w1 = v; } else if (v > w2) { b2 = b; w2 = v; }
        }
        let dom = b1;
        if (w2 > 0.02) {
          const t = w2 / (w1 + w2);
          const j1 = fbm(this.sJit, x / 18, y / 18, 2) * 0.55 + 0.5 + (hash01(this.sJit, x, y) - 0.5) * 0.18;
          if (j1 < t) dom = b2;
        }
        if (F.island && (dom === B.ocean)) dom = B.coast;
        if (dom === B.ocean) dom = B.coast;
        fb.dom[o] = dom;
        // roads
        let rd = 1e9, rseg = -1, rprof = 0;
        if (ctx.roads.length) {
          const ds = this.ds;
          for (let k = 0; k < ctx.roads.length; k++) {
            const s = ctx.roads[k];
            const road = this.roads[ds.road[s]];
            const d = segDist(x, y, ds.ax[s], ds.ay[s], ds.bx[s], ds.by[s], this.segT) - road.hw;
            if (d < rd) {
              rd = d; rseg = s;
              const ii = ds.i[s];
              rprof = road.prof[ii] + (road.prof[ii + 1] - road.prof[ii]) * this.segT.t;
            }
          }
        }
        fb.roadD[o] = rd; fb.roadSeg[o] = rseg; fb.roadProf[o] = rprof;
        // region + danger
        const ri = this.regionCrisp(x, y);
        fb.region[o] = ri;
        fb.danger[o] = this.dangerAt(x, y, ri);
      }
    }
    // ---- pass B: paint + overlays
    for (let j = 0; j < h; j++) {
      const y = y0 + j;
      for (let i = 0; i < w; i++) {
        const x = x0 + i;
        const o = j * w + i;
        const H = hb[j * bw + i];
        const slope = Math.max(Math.abs(hb[j * bw + i + 1] - H), Math.abs(hb[(j + 1) * bw + i] - H));
        this.paint(x, y, o, H, slope, out);
        out.region[o] = fb.region[o];
        out.danger[o] = fb.danger[o];
        out.setPiece[o] = 0;
        // ---- roads
        const rd = fb.roadD[o];
        if (rd < 5) {
          const s = fb.roadSeg[o];
          const road = this.roads[this.ds.road[s]];
          const deck = fb.roadProf[o];
          const t = out.t[o];
          const isWater = T_WATER[t] === 1;
          if (rd < 0.5) {
            if (isWater) {
              const wl = out.h[o];
              const w = fb.water[o];
              out.t[o] = w === W_RIVER || w === W_RIVER_DEEP || w === W_LAKE || w === W_LAKE_DEEP || w === W_SEA || w === W_SEA_DEEP ? road.bridge : road.causeway;
              out.h[o] = Math.max(Math.round(deck), wl + 1);
              out.flags[o] = F_ROAD | F_BRIDGE;
            } else {
              const ii = this.ds.i[s];
              out.t[o] = road.cobble[ii] || road.cobble[ii + 1] ? T.road : T.dirt;
              out.h[o] = Math.round(deck);
              out.flags[o] = F_ROAD;
            }
            out.prop[o] = 0;
          } else if (!isWater) {
            const k = smoothstep(0.5, 5, rd);
            out.h[o] = Math.round(lerp(deck, out.h[o], k));
            if (rd < 2.5 && out.prop[o] && PROP_BLOCKS_CODE[out.prop[o]]) out.prop[o] = 0;
          }
        }
        const pp = this.pointProps.size ? this.pointProps.get(tileKey(x, y)) : undefined;
        if (pp !== undefined && !(out.flags[o] & F_ROAD) && !T_WATER[out.t[o]]) out.prop[o] = pp;
      }
    }
    // ---- set pieces
    if (!skipSP) {
      let lastCtx: Ctx | null = null;
      for (let j = 0; j < h; j++) {
        const y = y0 + j;
        for (let i = 0; i < w; i++) {
          const x = x0 + i;
          const cx = chunkOf(x), cy = chunkOf(y);
          if (!lastCtx || lastCtx.cx !== cx || lastCtx.cy !== cy) lastCtx = this.ctxFor(cx, cy);
          if (!lastCtx.sps.length) continue;
          for (const si of lastCtx.sps) this.applyStamp(this.setPieces[si], x, y, j * w + i, out);
        }
      }
    }
    // ---- flags
    for (let o = 0; o < w * h; o++) {
      let f = out.flags[o] & (F_ROAD | F_BRIDGE | F_STAMP);
      const t = out.t[o];
      if (T_WATER[t] && t !== T.swamp) f |= F_WATER;
      else if (t === T.swamp) f |= F_WATER;
      if (out.prop[o] && PROP_BLOCKS_CODE[out.prop[o]]) f |= F_BLOCKED;
      if (f & F_BRIDGE) f &= ~F_WATER;
      out.flags[o] = f;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Set piece application
  // ---------------------------------------------------------------------------------------------

  private ensureStamp(sp: SetPieceRT): Stamp {
    if (sp.stamp) return sp.stamp;
    const w = sp.x1 - sp.x0, h = sp.y1 - sp.y0;
    const nat = makeRect(w * h);
    this.computeRect(sp.x0, sp.y0, w, h, true, nat);
    const stamp = buildSetPiece({
      def: sp.def, seed: subSeed(this.seed, `sp:${sp.def.id}`), x0: sp.x0, y0: sp.y0, w, h,
      natH: nat.h, natT: nat.t, natProp: nat.prop, natFlags: nat.flags,
      gates: sp.gates.map((g) => ({ side: g.side, id: g.id, x: g.x - sp.x0, y: g.y - sp.y0 })),
    });
    sp.stamp = stamp;
    sp.info = stamp.info(sp.def);
    return stamp;
  }

  private applyStamp(sp: SetPieceRT, x: number, y: number, o: number, out: RectOut): void {
    const f = sp.falloff;
    if (x < sp.x0 - f || x >= sp.x1 + f || y < sp.y0 - f || y >= sp.y1 + f) return;
    const st = this.ensureStamp(sp);
    const inside = x >= sp.x0 && x < sp.x1 && y >= sp.y0 && y < sp.y1;
    const natWater = T_WATER[out.t[o]] === 1 && !(out.flags[o] & F_BRIDGE);
    if (!inside) {
      // falloff ring
      const dx = Math.max(sp.x0 - x, 0, x - (sp.x1 - 1)), dy = Math.max(sp.y0 - y, 0, y - (sp.y1 - 1));
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= f) return;
      if (natWater) return;
      const k = smoothstep(0, f, d);
      out.h[o] = Math.round(lerp(st.edgeHeight(x - sp.x0, y - sp.y0), out.h[o], k));
      if (d < 3 && out.prop[o] && PROP_BLOCKS_CODE[out.prop[o]]) out.prop[o] = 0;
      return;
    }
    const li = (y - sp.y0) * st.w + (x - sp.x0);
    const ct = st.t[li], dh = st.dh[li], cp = st.prop[li];
    out.setPiece[o] = sp.index + 1;
    if (ct === KEEP) {
      if (natWater && dh === 0) { out.flags[o] |= F_STAMP; return; }
      out.h[o] = dh === NAT_H ? out.h[o] : st.base + dh;
      if (cp !== KEEP) out.prop[o] = cp;
      out.flags[o] = (out.flags[o] & (F_ROAD | F_BRIDGE)) | F_STAMP | st.flags[li];
      return;
    }
    out.t[o] = ct;
    out.h[o] = dh === NAT_H ? out.h[o] : st.base + dh;
    out.prop[o] = cp === KEEP ? out.prop[o] : cp;
    out.flags[o] = st.flags[li] | F_STAMP;
  }

  // ==============================================================================================
  // Biome painting
  // ==============================================================================================

  private paint(x: number, y: number, o: number, H: number, slope: number, out: RectOut): void {
    const fb = this.fieldsBuf;
    const water = fb.water[o];
    const dom = fb.dom[o];
    out.biome[o] = dom;
    out.flags[o] = 0;
    out.prop[o] = 0;
    const r1 = hash01(this.sProp, x, y), r2 = hash01(this.sProp2, x, y);
    const blight = fb.blight[o] + fbm(this.sJit + 3, x / 30, y / 30, 2) * 0.35 > 0.55;
    const cold = fb.cold[o];

    // ---- water bodies
    if (water !== W_NONE) {
      const wl = Math.round(fb.wl[o]);
      out.h[o] = wl;
      const deep = water === W_RIVER_DEEP || water === W_SEA_DEEP || water === W_LAKE_DEEP;
      out.t[o] = deep ? T.deepwater : T.water;
      if (blight && !deep && r1 < 0.5) out.t[o] = T.swamp;
      if (!deep && water === W_RIVER && fb.riverRd[o] > -1.2 && r1 < 0.12 && !blight) out.prop[o] = P.reeds;
      if (!deep && (water === W_LAKE) && fb.lakeD[o] > -3 && r1 < 0.15) out.prop[o] = P.reeds;
      return;
    }
    let h = Math.round(H);
    let t = T.grass;
    let prop = 0;

    // ---- reed islands in rivers
    if (fb.reed[o]) {
      out.h[o] = h;
      out.t[o] = r2 < 0.55 ? T.swamp : T.tallgrass;
      out.prop[o] = r1 < 0.55 ? P.reeds : 0;
      return;
    }

    const seaD = fb.seaD[o];
    const riverRd = fb.riverRd[o];
    const lakeD = fb.lakeD[o];
    const moist = fbm(this.sMoist, x / 150, y / 150, 3);
    const forestN = fbm(this.sForest, x / 95, y / 95, 4) + gradNoise(this.sForest + 9, x / 14, y / 14) * 0.12;
    const cliff = fb.cliff[o];

    // ---- shores
    const beachW = 5 + (1 - cliff) * 9;
    if (seaD < beachW && h <= 3 && slope < 2.5) {
      out.h[o] = h;
      out.t[o] = T.sand;
      out.prop[o] = r1 < 0.012 ? P.rock : r1 < 0.016 ? P.bones : 0;
      if (cold > 0.7 && r2 < 0.5) out.t[o] = T.snow;
      return;
    }
    if (seaD < 6 && slope >= 2.5) {
      out.h[o] = h; out.t[o] = T.stone; out.prop[o] = r1 < 0.04 ? P.rock : 0; return;
    }

    switch (dom) {
      case B.farmland: {
        const res = this.paintFarm(x, y, o, h, slope, r1, r2, forestN, moist);
        t = res & 0xff; prop = (res >> 8) & 0xff; h += (res >> 16) - 64;
        break;
      }
      case B.grassland: {
        t = moist > 0.12 + gradNoise(this.sMoist + 3, x / 9, y / 9) * 0.15 ? T.tallgrass : T.grass;
        if (r2 < 0.01) t = T.dirt;
        if (forestN > 0.42) prop = r1 < 0.3 ? (r2 < 0.5 ? P.tree : P.bush) : r1 < 0.34 ? P.flowers : 0;
        else prop = r1 < 0.012 ? P.tree : r1 < 0.035 ? P.bush : r1 < 0.065 ? P.flowers : r1 < 0.072 ? P.rock : r1 < 0.0735 ? P.boulder : 0;
        break;
      }
      case B.forest: {
        const marshy = fb.marshW[o] > 0.3;
        if (marshy) {
          const res = this.paintMarsh(x, y, h, r1, r2, 0.7);
          t = res & 0xff; prop = (res >> 8) & 0xff; h += (res >> 16) - 64;
          if (!T_WATER[t] && r1 < 0.3) prop = r2 < 0.6 ? P.tree : P.deadtree;
          else if (t === T.swamp && r1 < 0.12) prop = P.deadtree;
          break;
        }
        t = moist > 0.2 ? T.tallgrass : T.grass;
        const clearing = forestN < -0.28;
        const dens = clearing ? 0.03 : clamp(0.2 + (forestN + 0.3) * 0.22 + gradNoise(this.sForest + 4, x / 7, y / 7) * 0.12, 0.08, 0.34);
        if (!clearing && r2 < 0.18) t = T.dirt;
        const pine = cold > 0.35 || H > 11 || hash01(this.sForest, x >> 4, y >> 4) < 0.18;
        if (r1 < dens) prop = pine ? P.pine : P.tree;
        else if (r1 < dens + 0.05) prop = P.bush;
        else if (r1 < dens + 0.06) prop = P.stump;
        else if (r1 < dens + 0.075) prop = P.mushroom;
        else if (r1 < dens + 0.085) prop = P.rock;
        else if (clearing && r1 < dens + 0.12) prop = P.flowers;
        break;
      }
      case B.hills: {
        t = moist > 0.25 ? T.tallgrass : T.grass;
        const tor = slope >= 3 || (fb.hLand[o] > 9.5 && gradNoise(this.sProp + 7, x / 11, y / 11) > 0.25);
        if (tor) t = T.stone;
        if (forestN > 0.5 && !tor) prop = r1 < 0.28 ? (cold > 0.3 ? P.pine : P.tree) : r1 < 0.33 ? P.bush : 0;
        else prop = r1 < 0.03 ? P.rock : r1 < 0.036 ? P.boulder : r1 < 0.066 ? P.bush : r1 < 0.08 ? (cold > 0.3 ? P.pine : P.tree) : r1 < 0.095 ? P.flowers : 0;
        if (tor && prop !== P.rock && prop !== P.boulder) prop = r1 < 0.08 ? P.boulder : 0;
        break;
      }
      case B.mountains: {
        const snowLine = 17 - cold * 3 + gradNoise(this.sProp + 11, x / 16, y / 16) * 1.5;
        const treeLine = 11 - cold * 2.5;
        if (H >= snowLine) { t = slope >= 4 ? T.stone : T.snow; prop = r1 < 0.02 ? P.rock : 0; }
        else if (slope >= 3.2) { t = T.stone; prop = r1 < 0.03 ? P.rock : r1 < 0.04 ? P.boulder : 0; }
        else if (H >= treeLine) { t = r2 < 0.62 ? T.stone : (cold > 0.85 ? T.snow : r2 < 0.8 ? T.dirt : T.grass); prop = r1 < 0.04 ? P.rock : r1 < 0.05 ? P.boulder : r1 < 0.07 ? P.pine : 0; }
        else { t = r2 < 0.12 ? T.dirt : T.grass; prop = r1 < 0.2 ? P.pine : r1 < 0.24 ? P.rock : r1 < 0.25 ? P.boulder : r1 < 0.28 ? P.bush : 0; }
        break;
      }
      case B.marsh: {
        const res = this.paintMarsh(x, y, h, r1, r2, fb.forestW[o]);
        t = res & 0xff; prop = (res >> 8) & 0xff; h += (res >> 16) - 64;
        break;
      }
      case B.coast: {
        const dune = (1 - cliff) > 0.5 && seaD < 70;
        const dn = fbm(this.sDune, x / 9, y / 9, 2);
        if (dune && dn > -0.1) {
          t = dn > 0.25 ? T.tallgrass : T.sand;
          h += dn > 0.15 ? 1 : 0;
          prop = r1 < 0.03 ? P.bush : 0;
        } else if (h <= 2 && moist > 0.15 && slope < 1) {
          t = r2 < 0.5 ? T.swamp : T.tallgrass;
          prop = r1 < 0.3 ? P.reeds : 0;
        } else {
          t = moist > 0.2 ? T.tallgrass : T.grass;
          if (slope >= 3) t = T.stone;
          prop = r1 < 0.03 ? P.bush : r1 < 0.045 ? P.rock : r1 < 0.055 ? P.tree : r1 < 0.07 ? P.flowers : 0;
          if (forestN > 0.45) prop = r1 < 0.25 ? P.tree : prop;
        }
        break;
      }
      case B.snow: {
        t = slope >= 3.4 ? T.stone : T.snow;
        const pond = fbm(this.sMoist + 5, x / 70, y / 70, 3) < -0.5 && slope < 1.2;
        if (pond) { t = T.water; prop = 0; break; }
        const woods = forestN > 0.3;
        prop = r1 < (woods ? 0.28 : 0.06) ? P.pine : r1 < 0.32 ? (r2 < 0.5 ? P.rock : 0) : r1 < 0.325 ? P.boulder : r1 < 0.33 ? P.deadtree : 0;
        if (t === T.stone && prop === P.pine) prop = 0;
        break;
      }
      case B.desert: {
        const mesaTop = fb.hLand[o] - H < 0.5 && fb.desertW[o] > 0.5 && fbm(this.sMesa, x / 120, y / 120, 3) > 0.2;
        t = mesaTop ? T.dirt : T.sand;
        if (slope >= 2.4) t = T.stone;
        const wash = Math.abs(fbm(this.sMoist + 9, x / 80, y / 80, 3)) < 0.035;
        if (wash && slope < 2) t = T.dirt;
        prop = r1 < 0.012 ? P.rock : r1 < 0.016 ? P.boulder : r1 < 0.021 ? P.bones : r1 < 0.025 ? P.deadtree : r1 < 0.034 ? P.bush : 0;
        if (t === T.stone && prop !== P.rock && prop !== P.boulder) prop = 0;
        break;
      }
      case B.blight: {
        const res = this.paintBlight(x, y, h, slope, r1, r2, forestN, fb.marshW[o]);
        t = res & 0xff; prop = (res >> 8) & 0xff; h += (res >> 16) - 64;
        break;
      }
      default: {
        t = T.grass;
        prop = r1 < 0.02 ? P.bush : 0;
      }
    }

    // ---- riverbanks / lake shores
    if (riverRd < 2.2 && !T_WATER[t]) {
      if (r2 < 0.35 && !blight) t = T.dirt;
      if (r1 < 0.14 && !blight) prop = P.reeds;
      else if (prop && PROP_BLOCKS_CODE[prop] && riverRd < 1) prop = 0;
    } else if (riverRd < 7 && r1 < 0.03 && !prop && !blight && cold < 0.5) prop = P.tree;
    if (lakeD < 3 && lakeD > -1 && !T_WATER[t]) { t = r2 < 0.6 ? T.sand : T.grass; if (prop && PROP_BLOCKS_CODE[prop]) prop = 0; }

    // ---- climate modifiers
    if (blight && dom !== B.blight) {
      if (t === T.grass || t === T.tallgrass || t === T.dirt || t === T.sand || t === T.snow) t = r2 < 0.12 ? T.stone : T.ash;
      if (prop === P.tree || prop === P.pine) prop = P.deadtree;
      else if (prop === P.bush || prop === P.flowers || prop === P.haybale) prop = r2 < 0.5 ? P.bones : 0;
      else if (prop === P.reeds || prop === P.mushroom) prop = 0;
    } else if (cold > 0.55 && (t === T.grass || t === T.tallgrass || t === T.dirt)) {
      if (cold > 0.9 || H > 15 - cold * 6 || gradNoise(this.sMoist + 21, x / 9, y / 9) > 0.75 - (cold - 0.55) * 1.2) t = T.snow;
      if (prop === P.tree) prop = P.pine;
      if (prop === P.flowers) prop = 0;
    }
    out.h[o] = h;
    out.t[o] = t;
    out.prop[o] = prop;
  }

  /** Marsh: 40–60% shallow water / swamp at the water table, deep pools, peat hummocks. */
  private paintMarsh(x: number, y: number, h: number, r1: number, r2: number, wooded: number): number {
    const m = fbm(this.sMarsh, x / 26, y / 26, 3) + valueNoise(this.sMarsh + 2, x / 6, y / 6) * 0.22;
    let t: number, prop = 0, dh = 0;
    if (m < -0.46) { t = T.deepwater; }
    else if (m < -0.14) { t = T.water; prop = r1 < 0.12 ? P.reeds : 0; }
    else if (m < 0.03) { t = T.swamp; prop = r1 < 0.36 ? P.reeds : r1 < 0.4 ? P.deadtree : 0; }
    else {
      dh = m > 0.55 ? 2 : 1;
      t = r2 < 0.16 ? T.dirt : m > 0.35 ? T.grass : T.tallgrass;
      prop = r1 < 0.06 ? P.deadtree : r1 < 0.06 + wooded * 0.12 ? P.tree : r1 < 0.12 ? P.bush : r1 < 0.135 ? P.mushroom : r1 < 0.14 ? P.bones : r1 < 0.2 ? P.reeds : 0;
    }
    void h;
    return t | (prop << 8) | ((dh + 64) << 16);
  }

  private paintBlight(x: number, y: number, h: number, slope: number, r1: number, r2: number, forestN: number, marshW: number): number {
    let t = T.ash, prop = 0, dh = 0;
    const rubble = gradNoise(this.sProp + 13, x / 12, y / 12) > 0.45;
    if (rubble || slope >= 3) t = T.stone;
    else if (r2 < 0.1) t = T.dirt;
    if (marshW > 0.25) {
      const m = fbm(this.sMarsh + 7, x / 24, y / 24, 3);
      if (m < -0.15) { t = m < -0.45 ? T.deepwater : T.swamp; return t | ((r1 < 0.05 ? P.deadtree : 0) << 8) | (64 << 16); }
    }
    const dead = forestN > 0.25 ? 0.2 : 0.045;
    prop = r1 < dead ? P.deadtree : r1 < dead + 0.02 ? P.bones : r1 < dead + 0.035 ? P.rock : r1 < dead + 0.037 ? P.brokenpillar : r1 < dead + 0.038 ? P.tombstone : 0;
    void h;
    return t | (prop << 8) | ((dh + 64) << 16);
  }

  /**
   * Farmland: irregular Voronoi fields (wheat furrows, ploughland, pasture, hay meadows,
   * orchards, fallow), hedgerows and dry-stone walls on field borders, copses, farmsteads.
   */
  private paintFarm(x: number, y: number, o: number, h: number, slope: number, r1: number, r2: number, forestN: number, moist: number): number {
    const c = this.cellTmp;
    cellular(this.sField, x, y, 15, c, 0.85);
    // second-nearest cell id for border pairing
    const enc = (t: number, prop: number, dh: number) => t | (prop << 8) | ((dh + 64) << 16);
    if (forestN > 0.44) {
      // copse
      const prop = r1 < 0.3 ? (r2 < 0.75 ? P.tree : P.pine) : r1 < 0.36 ? P.bush : r1 < 0.38 ? P.mushroom : 0;
      return enc(moist > 0.1 ? T.tallgrass : T.grass, prop, 0);
    }
    const ft = hash01(this.sField + 1, c.cx, c.cy);
    // Farmstead?
    const fs = this.farmstead(c.cx, c.cy, c.px, c.py);
    if (fs >= 0) {
      const hs = hash32(this.sField + 2, c.cx, c.cy);
      const hw = 3 + (hs & 1), hh = 2 + ((hs >> 1) & 1);
      const dx = x - Math.round(c.px), dy = y - Math.round(c.py);
      const axisX = ((hs >> 2) & 1) === 0;
      const ax = axisX ? hw : hh, ay = axisX ? hh : hw;
      const dh0 = fs - h;
      if (Math.abs(dx) <= ax && Math.abs(dy) <= ay) {
        // house: gable roof along the long axis
        const across = axisX ? Math.abs(dy) : Math.abs(dx);
        const half = axisX ? ay : ax;
        const rise = Math.round(2 * (1 - across / (half + 0.5)));
        return enc(T.thatch, 0, clamp(dh0 + 4 + rise, -30, 30));
      }
      const yard = Math.max(Math.abs(dx) - ax, Math.abs(dy) - ay);
      if (yard <= 3) {
        const prop = yard === 3 && r1 < 0.55 && !(Math.abs(dx) <= 1 || Math.abs(dy) <= 1) ? P.fence
          : r1 < 0.05 ? P.haybale : r1 < 0.07 ? P.barrel : r1 < 0.08 ? P.cart : r1 < 0.09 ? P.crate : r1 < 0.12 ? P.flowers : 0;
        return enc(r2 < 0.7 ? T.dirt : T.grass, prop, clamp(dh0, -30, 30));
      }
    }
    if (c.f2 - c.f1 < 1.25) {
      // field border: hedgerow, dry-stone wall or open
      const bx = Math.min(c.cx * 7919 + c.cy, c.c2x * 7919 + c.c2y), by = Math.max(c.cx * 7919 + c.cy, c.c2x * 7919 + c.c2y);
      const kind = hash01(this.sField + 3, bx, by);
      const gap = hash01(this.sField + 4, x >> 2, y >> 2) < 0.18;
      if (kind < 0.6) {
        if (gap) return enc(T.grass, 0, 0);
        return enc(T.grass, r1 < 0.07 ? P.tree : r1 < 0.8 ? P.bush : 0, 0);
      }
      if (kind < 0.85 && slope < 2) {
        if (gap) return enc(T.grass, 0, 0);
        return enc(T.stone, r1 < 0.05 ? P.bush : 0, 1);
      }
      return enc(T.grass, r1 < 0.03 ? P.flowers : 0, 0);
    }
    const orient = hash01(this.sField + 5, c.cx, c.cy) < 0.5;
    const row = orient ? x : y;
    if (ft < 0.27) {
      // wheat: rows of crop with furrows
      return enc(((row % 3) + 3) % 3 === 0 ? T.dirt : T.tallgrass, 0, 0);
    }
    if (ft < 0.42) {
      return enc(T.dirt, r1 < 0.004 ? P.rock : 0, 0);
    }
    if (ft < 0.66) {
      return enc(T.grass, r1 < 0.005 ? P.haybale : r1 < 0.03 ? P.flowers : r1 < 0.034 ? P.tree : r1 < 0.04 ? P.bush : 0, 0);
    }
    if (ft < 0.76) {
      return enc(r2 < 0.5 ? T.grass : T.tallgrass, r1 < 0.04 ? P.haybale : 0, 0);
    }
    if (ft < 0.86) {
      const ox = ((x % 4) + 4) % 4, oy = ((y % 4) + 4) % 4;
      return enc(T.grass, ox === 1 && oy === 1 ? P.tree : r1 < 0.03 ? P.flowers : 0, 0);
    }
    if (ft < 0.93) {
      // market garden: alternating rows
      return enc(((row % 2) + 2) % 2 === 0 ? T.dirt : T.grass, r1 < 0.06 ? P.flowers : 0, 0);
    }
    return enc(r2 < 0.4 ? T.tallgrass : T.grass, r1 < 0.04 ? P.bush : r1 < 0.06 ? P.flowers : 0, 0);
  }

  /** Farmstead ground height for a field cell, or -1 if none. Memoised; pure. */
  private farmstead(cx: number, cy: number, px: number, py: number): number {
    if (hash01(this.sField + 6, cx, cy) > 0.022) return -1;
    const key = chunkKey(cx & 0x7fff, cy & 0x7fff);
    const hit = this.farmCache.get(key);
    if (hit !== undefined) return hit;
    let res = -1;
    const ix = Math.round(px), iy = Math.round(py);
    const ctx = this.ctxFor(chunkOf(ix), chunkOf(iy));
    const F = this.F2;
    this.field(ix, iy, ctx, 2, F);
    if (F.water === W_NONE && F.riverRd > 9 && F.seaD > 14 && F.lakeD > 12 && F.reed === 0) {
      // road clearance
      let rd = 1e9;
      const ds = this.ds;
      for (let k = 0; k < ctx.roads.length; k++) {
        const s = ctx.roads[k];
        rd = Math.min(rd, segDist(ix, iy, ds.ax[s], ds.ay[s], ds.bx[s], ds.by[s], this.segT) - this.roads[ds.road[s]].hw);
      }
      let inSp = false;
      for (const si of ctx.sps) {
        const sp = this.setPieces[si];
        if (ix > sp.x0 - sp.falloff - 10 && ix < sp.x1 + sp.falloff + 10 && iy > sp.y0 - sp.falloff - 10 && iy < sp.y1 + sp.falloff + 10) inSp = true;
      }
      // Must be farmland-dominated.
      if (rd > 10 && !inSp && F.p[B.farmland] > 0.6) {
        const H0 = F.H;
        const s1 = Math.abs(this.hAt(ix + 3, iy, 2) - H0), s2 = Math.abs(this.hAt(ix, iy + 3, 2) - H0);
        if (s1 < 2 && s2 < 2) res = Math.round(H0);
      }
    }
    if (this.farmCache.size > 20000) this.farmCache.clear();
    this.farmCache.set(key, res);
    return res;
  }
}

/** Convenience: tile coords of a KMU point. */
export function kmu(p: KmuPoint): [number, number] {
  return [Math.round(kmuToTileF(p[0])), Math.round(kmuToTileF(p[1]))];
}
