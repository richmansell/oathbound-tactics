import { describe, expect, it } from 'vitest';
import { WorldGen, type WorldTile } from '../src/world/gen';
import { MAIN_GEOGRAPHY } from '../src/world/geography';
import { CHUNK, KINGDOM_ORIGIN, kmuToTile, tileKey } from '../src/world/coords';
import { carveBattlefield } from '../src/world/carve';
import { sampleOverview } from '../src/world/minimap';
import { TERRAIN_INFO } from '../src/engine/grid';
import { edges as worldEdges } from '../src/content/campaigns/main/world';

const SEED = 1337;
const gen = new WorldGen(SEED, MAIN_GEOGRAPHY, { maxChunks: 2048 });
const K = (x: number, y: number): [number, number] => [kmuToTile(x), kmuToTile(y)];

function walkable(t: WorldTile): boolean {
  return TERRAIN_INFO[t.t].walkable && !t.blocked && t.t !== 'deepwater';
}

/** A* over road tiles (|Δh| ≤ 4) between two world tiles. Returns path length or -1. */
function roadPath(a: [number, number], b: [number, number], limit = 400000): number {
  const open: [number, number, number, number][] = [[a[0], a[1], 0, 0]];
  const seen = new Map<number, number>([[tileKey(a[0], a[1]), 0]]);
  const hfn = (x: number, y: number) => Math.abs(x - b[0]) + Math.abs(y - b[1]);
  let n = 0;
  while (open.length && n++ < limit) {
    // pop min f (binary heap would be faster; open stays small on road graphs)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][3] < open[bi][3]) bi = i;
    const [x, y, g] = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (x === b[0] && y === b[1]) return g;
    const h0 = gen.heightAt(x, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = tileKey(nx, ny);
      if (seen.has(k) && seen.get(k)! <= g + 1) continue;
      const t = gen.tile(nx, ny);
      if (!t.road || !walkable(t) || Math.abs(t.h - h0) > 4) continue;
      seen.set(k, g + 1);
      open.push([nx, ny, g + 1, g + 1 + hfn(nx, ny)]);
    }
  }
  return -1;
}

describe('world generator', () => {
  it('is deterministic: same seed → identical chunks; different seed → different', () => {
    const a = new WorldGen(SEED, MAIN_GEOGRAPHY);
    const b = new WorldGen(SEED, MAIN_GEOGRAPHY);
    const c = new WorldGen(SEED + 1, MAIN_GEOGRAPHY);
    const coords: [number, number][] = [
      [Math.floor(K(500, 700)[0] / CHUNK), Math.floor(K(500, 700)[1] / CHUNK)], // Tallow Cross
      [Math.floor(K(640, 800)[0] / CHUNK), Math.floor(K(640, 800)[1] / CHUNK)], // Tenpenny
      [Math.floor(K(300, 180)[0] / CHUNK), Math.floor(K(300, 180)[1] / CHUNK)], // Thornwall
      [Math.floor(K(-200, 500)[0] / CHUNK), Math.floor(K(-200, 500)[1] / CHUNK)], // frontier sea
      [100, 120],
    ];
    let differs = false;
    // generate b in reverse order to prove order-independence
    const bs = [...coords].reverse().map(([x, y]) => b.chunk(x, y)).reverse();
    coords.forEach(([x, y], i) => {
      const ca = a.chunk(x, y), cb = bs[i], cc = c.chunk(x, y);
      for (const f of ['h', 't', 'prop', 'flags', 'region', 'biome', 'danger', 'setPiece'] as const) {
        expect(Array.from(ca[f])).toEqual(Array.from(cb[f]));
      }
      if (Array.from(ca.h).join() !== Array.from(cc.h).join() || Array.from(ca.prop).join() !== Array.from(cc.prop).join()) differs = true;
    });
    expect(differs).toBe(true);
    // single-tile sampling agrees with chunk generation
    for (let i = 0; i < 50; i++) {
      const x = K(380 + (i * 37) % 300, 600 + (i * 53) % 250)[0], y = K(380 + (i * 37) % 300, 600 + (i * 53) % 250)[1];
      const s = a.sample(x, y), t = a.tile(x, y);
      expect(s.h).toBe(t.h);
    }
  });

  it('kingdom origin centres Aldmere in a 30,000-tile world', () => {
    expect(KINGDOM_ORIGIN).toBe(12952);
    expect(kmuToTile(512)).toBe(15000);
  });

  it('region lookup matches the bible', () => {
    const at = (x: number, y: number) => gen.regionAt(...K(x, y)).id;
    const expectations: [string, number, number][] = [
      ['lowmarch', 500, 700], ['lowmarch', 440, 800], ['lowmarch', 470, 745], ['lowmarch', 410, 720],
      ['greyfen', 575, 690], ['greyfen', 640, 800], ['greyfen', 600, 760], ['greyfen', 610, 655],
      ['hollin_downs', 540, 622], ['hollin_downs', 470, 615],
      ['crownlands', 520, 410], ['crownlands', 590, 520], ['old_mere', 610, 440],
      ['thornwall', 470, 215], ['thornwall', 300, 200], ['skarnholt', 500, 50],
      ['westmarch', 140, 470], ['westmarch', 230, 360], ['ashen_reach', 860, 430],
      ['sallow_coast', 150, 760], ['scald', 500, 960], ['velmont_shore', 980, 800],
    ];
    for (const [id, x, y] of expectations) expect(`${x},${y}:${at(x, y)}`).toBe(`${x},${y}:${id}`);
    // frontier beyond the kingdom box, with danger rising with distance
    expect(at(-300, 500)).toBe('frontier_west');
    expect(at(500, -300)).toBe('frontier_north');
    expect(at(500, 1400)).toBe('frontier_south');
    expect(at(1400, 500)).toBe('frontier_east');
    expect(gen.regionAt(...K(500, -1400)).danger).toBeGreaterThan(gen.regionAt(...K(500, -300)).danger - 1);
    const lm = gen.regionAt(...K(500, 700));
    expect(lm.danger).toBeGreaterThanOrEqual(1);
    expect(lm.danger).toBeLessThanOrEqual(3);
    expect(lm.roaming).toContain('struck_brigand');
  });

  it('rivers, lakes and seas produce water', () => {
    for (const r of gen.riverPolylines()) {
      let wet = 0, n = 0;
      for (let i = 4; i < r.xs.length - 4; i += 6) {
        const x = Math.round(r.xs[i]), y = Math.round(r.ys[i]);
        const t = gen.tile(x, y);
        if (t.setPiece || t.road || t.bridge) continue;
        n++;
        if (t.water || t.t === 'swamp' || t.t === 'tallgrass') wet++; // reed islands count as river
      }
      expect(n).toBeGreaterThan(3);
      expect(wet / n).toBeGreaterThan(0.9);
    }
    // big rivers have deep cores somewhere
    const sallow = gen.riverPolylines().find((r) => r.id === 'sallow')!;
    let deep = 0;
    for (let i = 0; i < sallow.xs.length; i += 3) if (gen.tile(Math.round(sallow.xs[i]), Math.round(sallow.ys[i])).t === 'deepwater') deep++;
    expect(deep).toBeGreaterThan(5);
    // the Old Mere (away from Archive Isle) is deep water; the Grey Sea and Narrow Sea are water
    expect(gen.tile(...K(625, 440)).t).toBe('deepwater');
    expect(gen.tile(...K(-100, 500)).water).toBe(true);
    expect(gen.tile(...K(898, 760)).water).toBe(true);
    // river water levels never rise downstream
    for (const r of gen.riverPolylines()) for (let i = 1; i < r.level.length; i++) {
      if (r.id === 'aure' || r.id === 'aure_lower') continue; // clamped to the lake / junction
      expect(r.level[i]).toBeLessThanOrEqual(r.level[i - 1] + 1e-9);
    }
  });

  it('set pieces are walkable at their hub and connected by roads to their neighbours', () => {
    const hub = (id: string) => gen.setPieceInfo(id)!.hub;
    for (const sp of MAIN_GEOGRAPHY.setPieces) {
      const info = gen.setPieceInfo(sp.id)!;
      expect(info, sp.id).toBeTruthy();
      const t = gen.tile(...info.hub);
      expect(walkable(t), `${sp.id} hub walkable`).toBe(true);
    }
    const tc = gen.setPieceInfo('tallow_cross')!;
    expect(walkable(gen.tile(...tc.locations.square))).toBe(true);
    expect(tc.locations.inn).toBeTruthy();
    expect(tc.locations.notary_house).toBeTruthy();
    expect(gen.setPieceInfo('millbrook')!.locations.charity).toBeTruthy();
    // explicit chapter-1 checks
    expect(roadPath(hub('tallow_cross'), hub('millbrook'))).toBeGreaterThan(0);
    expect(roadPath(hub('tallow_cross'), hub('lantern_road'))).toBeGreaterThan(0);
    // every world edge
    const failed: string[] = [];
    for (const e of worldEdges) {
      if (!gen.setPieceInfo(e.from) || !gen.setPieceInfo(e.to)) continue;
      if (roadPath(hub(e.from), hub(e.to)) < 0) failed.push(`${e.from}→${e.to}`);
    }
    expect(failed).toEqual([]);
  });

  it('roads are smooth: consecutive road tiles never step more than 2', () => {
    let checked = 0;
    for (const r of gen.roadPolylines()) {
      let prev: WorldTile | null = null, px = 0, py = 0;
      for (let i = 0; i + 1 < r.xs.length; i++) {
        const len = Math.hypot(r.xs[i + 1] - r.xs[i], r.ys[i + 1] - r.ys[i]);
        for (let s = 0; s < len; s += 0.5) {
          const x = Math.round(r.xs[i] + ((r.xs[i + 1] - r.xs[i]) * s) / len), y = Math.round(r.ys[i] + ((r.ys[i + 1] - r.ys[i]) * s) / len);
          if (x === px && y === py) continue;
          const t = gen.tile(x, y);
          if (t.setPiece || !t.road) { prev = null; px = x; py = y; continue; }
          if (prev && Math.abs(x - px) + Math.abs(y - py) <= 2) { expect(Math.abs(t.h - prev.h), `${r.id} @${x},${y}`).toBeLessThanOrEqual(2); checked++; }
          prev = t; px = x; py = y;
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('has no walkability seams at region borders', () => {
    // transects across borders between walkable regions: steep (>4) steps stay rare near the border
    const borders: [string, number, number, number, number][] = [
      ['lowmarch|greyfen', 560, 660, 560, 840], ['lowmarch|hollin', 420, 640, 590, 640],
      ['crownlands|westmarch', 330, 300, 330, 600], ['westmarch|sallow_coast', 60, 640, 360, 640],
      ['crownlands|lowmarch', 610, 580, 690, 580], ['lowmarch|sallow_coast', 380, 660, 380, 860],
    ];
    for (const [name, x0, y0, x1, y1] of borders) {
      const vertical = x0 === x1;
      let steep = 0, n = 0;
      for (let k = 0; k <= 60; k++) {
        const bx = x0 + ((x1 - x0) * k) / 60, by = y0 + ((y1 - y0) * k) / 60;
        const [tx, ty] = K(bx, by);
        for (let d = -48; d < 48; d++) {
          const ax = vertical ? tx + d : tx, ay = vertical ? ty : ty + d;
          const a = gen.tile(ax, ay), b = gen.tile(vertical ? ax + 1 : ax, vertical ? ay : ay + 1);
          if (!walkable(a) || !walkable(b)) continue;
          n++;
          if (Math.abs(a.h - b.h) > 4) steep++;
        }
      }
      expect(n, name).toBeGreaterThan(1000);
      expect(steep / n, name).toBeLessThan(0.01);
    }
  });

  it('the Thornwall is a barrier except at its passes', () => {
    /** Flood north from the range's southern foot within a KMU band; returns true if it reaches the north side. */
    const crosses = (x0: number, x1: number, useRoads: boolean) => {
      const X0 = kmuToTile(x0), X1 = kmuToTile(x1), Y0 = kmuToTile(110), Y1 = kmuToTile(260);
      const W = X1 - X0, H = Y1 - Y0;
      const seen = new Uint8Array(W * H);
      const q: number[] = [];
      for (let x = 0; x < W; x++) { seen[(H - 1) * W + x] = 1; q.push((H - 1) * W + x); }
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], cx = c % W, cy = (c / W) | 0;
        if (cy === 0) return true;
        const h0 = gen.heightAt(X0 + cx, Y0 + cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x]) continue;
          const t = gen.tile(X0 + x, Y0 + y);
          if (!walkable(t) || (t.road && !useRoads) || Math.abs(t.h - h0) > 4) continue;
          seen[y * W + x] = 1; q.push(y * W + x);
        }
      }
      return false;
    };
    expect(crosses(180, 240, false)).toBe(false);
    expect(crosses(760, 820, false)).toBe(false);
    expect(crosses(280, 320, true)).toBe(true); // Hawkgate
    expect(crosses(625, 665, true)).toBe(true); // Ironpass
  });

  it('carveBattlefield always yields connected deploy sets in the Lowmarch and Greyfen', () => {
    const dirs = ['n', 'e', 's', 'w'] as const;
    let repaired = 0;
    for (let i = 0; i < 160; i++) {
      // deterministic pseudo-random positions
      const u = ((i * 2654435761) >>> 0) / 4294967296, v = ((i * 40503 + 12345) % 65536) / 65536;
      const [cx, cy] = K(390 + u * 320, 590 + v * 260);
      const dir = dirs[i % 4];
      const res = carveBattlefield(gen, cx, cy, { approachDir: dir });
      const { map, playerTiles, enemyTiles } = res;
      if (res.repaired) repaired++;
      expect(map.w).toBe(15);
      expect(map.tiles.length).toBe(225);
      expect(playerTiles.length).toBeGreaterThanOrEqual(6);
      expect(enemyTiles.length).toBeGreaterThanOrEqual(6);
      for (const t of map.tiles) { expect(t.h).toBeGreaterThanOrEqual(0); expect(t.h).toBeLessThanOrEqual(14); }
      const ok = (x: number, y: number) => {
        const t = map.tiles[y * map.w + x];
        return TERRAIN_INFO[t.t].walkable && !t.blocked && t.t !== 'deepwater';
      };
      for (const [x, y] of [...playerTiles, ...enemyTiles]) expect(ok(x, y)).toBe(true);
      // flood fill from the first player tile
      const seen = new Set<number>([playerTiles[0][1] * map.w + playerTiles[0][0]]);
      const q = [playerTiles[0]];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || seen.has(ny * map.w + nx) || !ok(nx, ny)) continue;
          if (Math.abs(map.tiles[ny * map.w + nx].h - map.tiles[y * map.w + x].h) > 3) continue;
          seen.add(ny * map.w + nx); q.push([nx, ny]);
        }
      }
      for (const [x, y] of [...playerTiles, ...enemyTiles]) expect(seen.has(y * map.w + x)).toBe(true);
      // player tiles are on the approach side
      const edge = (x: number, y: number) => (dir === 'n' ? y : dir === 's' ? map.h - 1 - y : dir === 'w' ? x : map.w - 1 - x);
      for (const [x, y] of playerTiles) expect(edge(x, y)).toBeLessThan(5);
    }
    expect(repaired).toBeLessThan(120);
  });

  it('carves set pieces too (Tallow Cross square, Corvel Keep)', () => {
    for (const id of ['tallow_cross', 'corvel_keep', 'tenpenny', 'millbrook']) {
      const hub = gen.setPieceInfo(id)!.hub;
      const res = carveBattlefield(gen, hub[0], hub[1]);
      expect(res.playerTiles.length).toBeGreaterThanOrEqual(6);
      expect(res.map.name.length).toBeGreaterThan(0);
    }
  });

  it('minimap sampling returns opaque RGBA', () => {
    const px = sampleOverview(gen, ...K(480, 680), 16, 16, 8);
    expect(px.length).toBe(16 * 16 * 4);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it('generates chunks fast (< 3 ms average)', () => {
    const g = new WorldGen(99, MAIN_GEOGRAPHY);
    // warm up JIT outside the measured window
    for (let i = 0; i < 20; i++) g.chunk(500 + i, 300);
    const N = 300;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const u = ((i * 2654435761) >>> 0) / 4294967296, v = ((i * 97 + 31) % 1000) / 1000;
      g.chunk(Math.floor((KINGDOM_ORIGIN + u * 4096) / CHUNK), Math.floor((KINGDOM_ORIGIN + v * 4096) / CHUNK));
    }
    const avg = (performance.now() - t0) / N;
    // eslint-disable-next-line no-console
    console.log(`chunk generation: ${avg.toFixed(2)} ms/chunk`);
    expect(avg).toBeLessThan(3);
  });
});
