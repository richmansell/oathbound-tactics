/** Grid geometry helpers: tiles, directions, facing and distance. */
import type { BattleMap, Dir, Pos, Tile, Terrain } from './types';

export const DIRS: Dir[] = ['n', 'e', 's', 'w'];
export const DIR_VEC: Record<Dir, Pos> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

export function tileAt(map: BattleMap, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return undefined;
  const t = map.tiles[y * map.w + x];
  return t.t === 'void' ? undefined : t;
}

export function inBounds(map: BattleMap, x: number, y: number): boolean {
  return tileAt(map, x, y) !== undefined;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

export function posKey(p: Pos): number {
  return p[1] * 4096 + p[0];
}

export function keyPos(k: number): Pos {
  return [k % 4096, Math.floor(k / 4096)];
}

/** Direction from a to b (dominant axis; ties prefer the x axis). */
export function dirTo(a: Pos, b: Pos): Dir {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? 'e' : 'w';
  if (dy !== 0) return dy > 0 ? 's' : 'n';
  return 's';
}

export function opposite(d: Dir): Dir {
  return d === 'n' ? 's' : d === 's' ? 'n' : d === 'e' ? 'w' : 'e';
}

/**
 * Relative attack direction: where the attacker stands relative to the
 * target's facing. 'front' | 'side' | 'back'.
 */
export function attackSide(attacker: Pos, target: Pos, targetFacing: Dir): 'front' | 'side' | 'back' {
  if (samePos(attacker, target)) return 'front';
  const [fx, fy] = DIR_VEC[targetFacing];
  const dx = attacker[0] - target[0];
  const dy = attacker[1] - target[1];
  // Project onto facing axis and perpendicular axis.
  const along = dx * fx + dy * fy;
  const across = Math.abs(dx * fy - dy * fx);
  if (along > 0 && along >= across) return 'front';
  if (along < 0 && -along >= across) return 'back';
  return 'side';
}

export const TERRAIN_INFO: Record<Terrain, { cost: number; walkable: boolean; water?: boolean; label: string }> = {
  grass: { cost: 1, walkable: true, label: 'Grass' },
  tallgrass: { cost: 1, walkable: true, label: 'Tall Grass' },
  dirt: { cost: 1, walkable: true, label: 'Dirt' },
  road: { cost: 1, walkable: true, label: 'Road' },
  stone: { cost: 1, walkable: true, label: 'Stone' },
  brick: { cost: 1, walkable: true, label: 'Flagstone' },
  sand: { cost: 1, walkable: true, label: 'Sand' },
  water: { cost: 2, walkable: true, water: true, label: 'Shallows' },
  deepwater: { cost: 99, walkable: false, water: true, label: 'Deep Water' },
  wood: { cost: 1, walkable: true, label: 'Planks' },
  snow: { cost: 1, walkable: true, label: 'Snow' },
  swamp: { cost: 2, walkable: true, water: true, label: 'Marsh' },
  roof: { cost: 1, walkable: true, label: 'Rooftop' },
  cave: { cost: 1, walkable: true, label: 'Cave' },
  lava: { cost: 99, walkable: false, label: 'Lava' },
  thatch: { cost: 1, walkable: true, label: 'Thatch Roof' },
  slate: { cost: 1, walkable: true, label: 'Slate Roof' },
  ash: { cost: 1, walkable: true, label: 'Ash' },
  void: { cost: 99, walkable: false, label: '' },
};

/** Parse the content map format ("g2 s4 x ...") into a BattleMap. */
export function parseMapRows(
  id: string,
  name: string,
  rows: string[],
  theme: string,
  props: { at: Pos; type: string }[] = [],
): BattleMap {
  const charToTerrain: Record<string, Terrain> = {
    g: 'grass', t: 'tallgrass', d: 'dirt', r: 'road', s: 'stone', b: 'brick', a: 'sand',
    w: 'water', W: 'deepwater', o: 'wood', n: 'snow', m: 'swamp', f: 'roof', c: 'cave', l: 'lava', h: 'thatch', e: 'slate', A: 'ash',
  };
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tok = grid[y][x] ?? 'x';
      if (tok === 'x' || tok === '') { tiles.push({ h: 0, t: 'void' }); continue; }
      const t = charToTerrain[tok[0]] ?? 'grass';
      const height = parseInt(tok.slice(1) || '0', 10);
      tiles.push({ h: Number.isFinite(height) ? height : 0, t });
    }
  }
  const map: BattleMap = { id, name, w, h, tiles, theme };
  for (const p of props) {
    const tile = tileAt(map, p.at[0], p.at[1]);
    if (!tile) continue;
    tile.prop = p.type;
    tile.blocked = PROP_BLOCKS[p.type] ?? true;
  }
  return map;
}

/** Whether a prop blocks standing on its tile. Low props (bushes, fences?) don't. */
export const PROP_BLOCKS: Record<string, boolean> = {
  tree: true, pine: true, deadtree: true, bush: false, rock: false, boulder: true, crate: true,
  barrel: true, fence: true, tombstone: true, pillar: true, brokenpillar: false, statue: true,
  banner: true, cart: true, tent: true, campfire: true, well: true, lamppost: true, haybale: true,
  altar: true, brazier: true, bookshelf: true, table: true, flowers: false, stump: false,
  reeds: false, mushroom: false, sign: true, bones: false, standingstone: true, gallows: true, stall: true, cross: true,
};
