/**
 * Free-roam overworld logic: party pathfinding, roaming enemy parties and
 * encounter battles carved from the terrain where contact happens.
 * Presentation lives in render/worldView.ts and ui/world/WorldScreen.tsx.
 */
import { regions as mainRegions } from '../content/campaigns/main/world';
import { createBattle } from '../engine/battle';
import { createBuild } from '../engine/factory';
import { TERRAIN_INFO } from '../engine/grid';
import { hash2, hashString } from '../engine/rng';
import type { BattleMap, BattleState, Pos, UnitBuild } from '../engine/types';
import type { WorldTileLike } from '../render/worldView';
import { enemyTemplate } from './campaignData';
import { difficultyRules, partyLevel } from './campaign';
import type { GameState } from './state';

export const STEP_LIMIT = 4;
export const CHUNK = 32;

export interface WorldGenLike {
  tile(x: number, y: number): WorldTileLike;
}

export type CarveFn = (gen: never, x: number, y: number, opts?: { size?: number; approachDir?: 'n' | 'e' | 's' | 'w' }) => { map: BattleMap; playerTiles: Pos[]; enemyTiles: Pos[] };

export function walkable(t: WorldTileLike): boolean {
  if (t.blocked) return false;
  const info = TERRAIN_INFO[t.t];
  return !!info && (info.walkable || t.t === 'water' || t.t === 'swamp');
}

/** A* over world tiles with a node budget. Returns path excluding the start, or null. */
export function findPath(gen: WorldGenLike, from: Pos, to: Pos, budget = 4000): Pos[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const target = gen.tile(to[0], to[1]);
  if (!walkable(target)) return null;
  const open: { x: number; y: number; g: number; f: number }[] = [{ x: from[0], y: from[1], g: 0, f: 0 }];
  const came = new Map<string, string | null>([[key(from[0], from[1]), null]]);
  const gScore = new Map<string, number>([[key(from[0], from[1]), 0]]);
  let expanded = 0;
  while (open.length && expanded < budget) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    expanded++;
    if (cur.x === to[0] && cur.y === to[1]) {
      const path: Pos[] = [];
      let k: string | null = key(cur.x, cur.y);
      while (k && k !== key(from[0], from[1])) { const [x, y] = k.split(',').map(Number); path.unshift([x, y]); k = came.get(k) ?? null; }
      return path;
    }
    const ct = gen.tile(cur.x, cur.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const nt = gen.tile(nx, ny);
      if (!walkable(nt) || Math.abs(nt.h - ct.h) > STEP_LIMIT) continue;
      const cost = (nt.road ? 0.7 : 1) + (nt.t === 'water' || nt.t === 'swamp' ? 1.5 : 0) + Math.abs(nt.h - ct.h) * 0.15;
      const g = cur.g + cost;
      const k = key(nx, ny);
      if (g >= (gScore.get(k) ?? Infinity)) continue;
      gScore.set(k, g);
      came.set(k, key(cur.x, cur.y));
      open.push({ x: nx, y: ny, g, f: g + Math.abs(nx - to[0]) + Math.abs(ny - to[1]) });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roaming parties
// ---------------------------------------------------------------------------

export interface Roamer {
  key: string;
  x: number; y: number;
  homeX: number; homeY: number;
  tx: number; ty: number;          // wander target
  templates: string[];
  level: number;
  chasing: boolean;
  path: Pos[];
  speed: number;
  region: string;
}

const FRONTIER_POOL = ['hollow_shade', 'wolfkin', 'restless_skeleton', 'highwayman', 'bog_sarth'];

function regionDef(id: string | undefined) {
  return mainRegions.find((r) => r.id === id);
}

/** Respawn epoch: cleared camps return the next in-game day. */
export function epoch(time: number): number {
  return Math.floor(time / 1440);
}

/** Deterministic spawn points for a chunk (0–2), skipping set pieces and water. */
export function chunkSpawns(gen: WorldGenLike, seed: number, cx: number, cy: number): { key: string; x: number; y: number }[] {
  const out: { key: string; x: number; y: number }[] = [];
  const n = hash2(seed ^ 0x51ed, cx, cy) < 0.45 ? 1 : hash2(seed ^ 0x77, cx, cy) < 0.12 ? 2 : 0;
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 6; tries++) {
      const x = cx * CHUNK + Math.floor(hash2(seed + i * 31 + tries, cx, cy) * CHUNK);
      const y = cy * CHUNK + Math.floor(hash2(seed + i * 57 + tries + 9, cx, cy) * CHUNK);
      const t = gen.tile(x, y);
      if (!walkable(t) || t.setPiece || t.road || t.t === 'water' || t.t === 'swamp') continue;
      out.push({ key: `${cx},${cy},${i}`, x, y });
      break;
    }
  }
  return out;
}

export function makeRoamer(gen: WorldGenLike, g: GameState, sp: { key: string; x: number; y: number }): Roamer {
  const t = gen.tile(sp.x, sp.y);
  const reg = regionDef(t.region);
  const pool = reg?.roaming.length ? reg.roaming : FRONTIER_POOL;
  const valid = pool.filter((id) => enemyTemplate(id));
  const h = hashString(sp.key);
  const danger = t.danger ?? (reg ? Math.round((reg.danger[0] + reg.danger[1]) / 2) : 5);
  const count = 3 + (h % 3) + (danger > 6 ? 1 : 0);
  const templates = Array.from({ length: count }, (_, i) => valid[(h + i * 7) % Math.max(1, valid.length)] ?? 'hollow_shade');
  // Level from danger, softened by story progress so early regions stay fair.
  const plv = partyLevel(g);
  let level = Math.max(1, danger * 2 + ((h >> 3) % 3) - 1);
  // Story mode keeps the home regions fair: within a level of the party in Chapter 1.
  if (g.story.chapter === 'c1') level = Math.max(1, Math.min(level, plv + 1, Math.max(plv - 1, level)));
  // Early parties face smaller bands.
  const size = plv < 4 ? Math.min(templates.length, 3 + (h % 2)) : templates.length;
  templates.length = size;
  return { key: sp.key, x: sp.x, y: sp.y, homeX: sp.x, homeY: sp.y, tx: sp.x, ty: sp.y, templates, level, chasing: false, path: [], speed: 1.1, region: t.region ?? '' };
}

/** Advance a roamer; returns true on contact with the party. */
export function stepRoamer(gen: WorldGenLike, r: Roamer, party: [number, number], dt: number, night: boolean): boolean {
  const dx = party[0] - r.x, dy = party[1] - r.y;
  const dist = Math.hypot(dx, dy);
  const aggro = night ? 9 : 6.5;
  const leash = 26;
  const homeDist = Math.hypot(r.x - r.homeX, r.y - r.homeY);
  r.chasing = dist < aggro && homeDist < leash;
  let tx: number, ty: number;
  if (r.chasing) { tx = party[0]; ty = party[1]; r.speed = 2.6; }
  else {
    if (Math.hypot(r.tx - r.x, r.ty - r.y) < 0.3 || homeDist > leash) {
      r.tx = r.homeX + Math.round((Math.random() - 0.5) * 12);
      r.ty = r.homeY + Math.round((Math.random() - 0.5) * 12);
    }
    tx = r.tx; ty = r.ty; r.speed = 1.0;
  }
  const len = Math.hypot(tx - r.x, ty - r.y);
  if (len > 0.01) {
    const step = Math.min(len, r.speed * dt);
    const nx = r.x + ((tx - r.x) / len) * step;
    const ny = r.y + ((ty - r.y) / len) * step;
    const cur = gen.tile(Math.round(r.x), Math.round(r.y));
    const nt = gen.tile(Math.round(nx), Math.round(ny));
    if (walkable(nt) && Math.abs(nt.h - cur.h) <= STEP_LIMIT && !nt.setPiece) { r.x = nx; r.y = ny; }
    else { r.tx = r.homeX; r.ty = r.homeY; }
  }
  return dist < 0.95;
}

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

export interface Encounter {
  state: BattleState;
  deployTiles: Pos[];
  roamer: Roamer;
  title: string;
}

export function makeEncounter(gen: WorldGenLike, carve: CarveFn, g: GameState, r: Roamer, party: [number, number]): Encounter {
  const dx = r.x - party[0], dy = r.y - party[1];
  const approachDir: 'n' | 'e' | 's' | 'w' = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'w' : 'e') : (dy > 0 ? 'n' : 's');
  const cx = Math.round((party[0] + r.x) / 2), cy = Math.round((party[1] + r.y) / 2);
  const carved = carve(gen as never, cx, cy, { size: 13, approachDir });
  const members = g.party.map((id) => g.roster.find((u) => u.id === id)).filter(Boolean) as UnitBuild[];
  const seed = hashString(`${r.key}:${g.world.time}`);
  const enemies = r.templates.slice(0, carved.enemyTiles.length).map((tid, i) => {
    const t = enemyTemplate(tid)!;
    return createBuild({ id: `${r.key}_${i}`, name: t?.name ?? 'Hollow', appearance: t?.appearance ?? { body: 'male', skin: 'zombie' }, job: t?.job ?? 'hollow', level: Math.max(1, r.level + (i % 2 ? -1 : 0)), brave: t?.brave, faith: t?.faith, autoLearn: true, seed: seed + i });
  });
  const state = createBattle({
    map: carved.map, seed, deploy: true,
    units: [
      ...members.map((b) => ({ build: structuredClone(b), team: 'player' as const, control: 'human' as const })),
      ...enemies.map((b, i) => ({ build: b, team: 'enemy' as const, control: 'ai' as const, pos: carved.enemyTiles[i], facing: approachDir })),
    ],
    victory: { type: 'defeatAll' },
    rules: difficultyRules(g.settings.difficulty),
    inventory: { player: { ...g.inventory }, enemy: { potion: 1 } },
    gil: { player: g.gil },
  });
  const first = enemyTemplate(r.templates[0]);
  return { state, deployTiles: carved.playerTiles, roamer: r, title: first ? `${first.name}s` : 'Ambush' };
}

/** Gil and loot for winning a roaming battle. */
export function encounterRewards(level: number, seed: number): { gil: number; items: string[] } {
  const gil = 60 + level * 35 + (seed % 40);
  const items: string[] = [];
  if (seed % 3 === 0) items.push('potion');
  if (seed % 7 === 0) items.push('phoenix_down');
  if (seed % 11 === 0) items.push(level > 6 ? 'hi_potion' : 'ether');
  return { gil, items };
}
