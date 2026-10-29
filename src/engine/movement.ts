/** Movement range and pathfinding on the height grid. */
import { DIR_VEC, DIRS, TERRAIN_INFO, keyPos, manhattan, posKey, tileAt } from './grid';
import { deriveStats, hasPassive, statusActive } from './units';
import type { BattleState, BattleUnit, Pos, Tile } from './types';

export interface Reach {
  /** posKey → cost and previous step. */
  nodes: Map<number, { cost: number; prev: number | null }>;
  /** Tiles the unit may end its move on. */
  dests: Pos[];
  teleport: boolean;
}

export function isAlive(u: BattleUnit): boolean {
  return !u.gone && !u.hidden && !statusActive(u, 'ko') && !statusActive(u, 'crystal') && !statusActive(u, 'petrify');
}

/** A unit (alive or KO'd, not gone) standing on a tile. */
export function unitAt(state: BattleState, p: Pos, includeKO = true): BattleUnit | undefined {
  return state.units.find((u) => !u.gone && !u.hidden && u.pos[0] === p[0] && u.pos[1] === p[1] && (includeKO || isAlive(u)));
}

export function isAllied(a: BattleUnit, b: BattleUnit): boolean {
  const side = (u: BattleUnit) => {
    const t = statusActive(u, 'charm') ? (u.team === 'enemy' ? 'player' : 'enemy') : u.team;
    return t === 'ally' ? 'player' : t;
  };
  return side(a) === side(b);
}

interface MoveCaps {
  move: number;
  jump: number;
  ignoreHeight: boolean;
  float: boolean;
  waterwalk: boolean;
}

function caps(u: BattleUnit): MoveCaps {
  const s = deriveStats(u.build, u);
  return {
    move: s.move,
    jump: s.jump,
    ignoreHeight: hasPassive(u.build, 'ignoreHeight') || hasPassive(u.build, 'fly'),
    float: statusActive(u, 'float'),
    waterwalk: hasPassive(u.build, 'waterwalk') || statusActive(u, 'float'),
  };
}

function stepCost(t: Tile, c: MoveCaps): number {
  const info = TERRAIN_INFO[t.t];
  if (!info.walkable) {
    if (info.water && c.waterwalk) return 1;
    return Infinity;
  }
  if (info.water && c.waterwalk) return 1;
  return info.cost;
}

function canStep(from: Tile, to: Tile, c: MoveCaps): boolean {
  if (to.blocked) return false;
  if (c.ignoreHeight) return true;
  const dh = to.h - from.h;
  if (dh > 0) return dh <= c.jump;
  if (c.float) return true;
  return -dh <= c.jump + 1;
}

export function reachable(state: BattleState, u: BattleUnit): Reach {
  const c = caps(u);
  const nodes = new Map<number, { cost: number; prev: number | null }>();
  const dests: Pos[] = [];
  if (statusActive(u, 'immobilize') || statusActive(u, 'stop') || statusActive(u, 'sleep') || statusActive(u, 'petrify')) {
    nodes.set(posKey(u.pos), { cost: 0, prev: null });
    return { nodes, dests: [u.pos], teleport: false };
  }

  // Teleport: any free tile within Move + 2 (manhattan), ignoring obstacles.
  if (hasPassive(u.build, 'teleport')) {
    const r = c.move + 2;
    for (let y = 0; y < state.map.h; y++) {
      for (let x = 0; x < state.map.w; x++) {
        const t = tileAt(state.map, x, y);
        if (!t || t.blocked) continue;
        const p: Pos = [x, y];
        if (manhattan(p, u.pos) > r) continue;
        if (stepCost(t, c) === Infinity) continue;
        const occ = unitAt(state, p);
        if (occ && occ !== u) continue;
        nodes.set(posKey(p), { cost: manhattan(p, u.pos), prev: posKey(u.pos) });
        dests.push(p);
      }
    }
    nodes.set(posKey(u.pos), { cost: 0, prev: null });
    return { nodes, dests, teleport: true };
  }

  // Dijkstra with small integer costs.
  const start = posKey(u.pos);
  nodes.set(start, { cost: 0, prev: null });
  const frontier: number[] = [start];
  while (frontier.length) {
    // pop lowest cost
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) if (nodes.get(frontier[i])!.cost < nodes.get(frontier[bi])!.cost) bi = i;
    const k = frontier.splice(bi, 1)[0];
    const cur = nodes.get(k)!;
    const p = keyPos(k);
    const from = tileAt(state.map, p[0], p[1])!;
    for (const d of DIRS) {
      const np: Pos = [p[0] + DIR_VEC[d][0], p[1] + DIR_VEC[d][1]];
      const to = tileAt(state.map, np[0], np[1]);
      if (!to) continue;
      if (!canStep(from, to, c)) continue;
      const sc = stepCost(to, c);
      if (sc === Infinity) continue;
      const cost = cur.cost + sc;
      if (cost > c.move) continue;
      const occ = unitAt(state, np);
      // Living non-allies block passage entirely; KO'd bodies and allies can be passed.
      if (occ && occ !== u && isAlive(occ) && !isAllied(occ, u)) continue;
      const nk = posKey(np);
      const prev = nodes.get(nk);
      if (prev && prev.cost <= cost) continue;
      nodes.set(nk, { cost, prev: k });
      frontier.push(nk);
    }
  }
  for (const [k] of nodes) {
    const p = keyPos(k);
    const occ = unitAt(state, p);
    if (occ && occ !== u) continue;
    dests.push(p);
  }
  return { nodes, dests, teleport: false };
}

export function pathTo(reach: Reach, to: Pos): Pos[] | null {
  const k = posKey(to);
  if (!reach.nodes.has(k)) return null;
  if (reach.teleport) {
    const start = [...reach.nodes.entries()].find(([, v]) => v.prev === null)![0];
    return [keyPos(start), to];
  }
  const path: Pos[] = [];
  let cur: number | null = k;
  while (cur !== null) {
    path.unshift(keyPos(cur));
    cur = reach.nodes.get(cur)!.prev;
  }
  return path;
}

export function canReach(reach: Reach, to: Pos): boolean {
  return reach.dests.some((p) => p[0] === to[0] && p[1] === to[1]);
}
