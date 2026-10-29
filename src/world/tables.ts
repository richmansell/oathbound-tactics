/** Lookup tables shared by the world generator: compact codes for terrains, props and biomes. */
import type { Terrain } from '../engine/types';
import { PROP_BLOCKS, TERRAIN_INFO } from '../engine/grid';

export const TERRAINS: Terrain[] = [
  'grass', 'tallgrass', 'dirt', 'road', 'stone', 'brick', 'sand', 'water', 'deepwater',
  'wood', 'snow', 'swamp', 'roof', 'thatch', 'slate', 'cave', 'lava', 'ash', 'void',
];
export const T: Record<Terrain, number> = Object.fromEntries(TERRAINS.map((t, i) => [t, i])) as Record<Terrain, number>;

/** Prop ids; index 0 = no prop. */
export const PROPS: string[] = [
  '', 'tree', 'pine', 'deadtree', 'bush', 'rock', 'boulder', 'crate', 'barrel', 'fence', 'tombstone',
  'pillar', 'brokenpillar', 'statue', 'banner', 'cart', 'tent', 'campfire', 'well', 'lamppost', 'haybale',
  'altar', 'brazier', 'bookshelf', 'table', 'stump', 'flowers', 'reeds', 'mushroom', 'sign', 'bones',
  'standingstone', 'gallows', 'stall', 'cross',
];
export const P: Record<string, number> = Object.fromEntries(PROPS.map((p, i) => [p, i]));

export const PROP_BLOCKS_CODE = new Uint8Array(PROPS.length);
for (let i = 1; i < PROPS.length; i++) PROP_BLOCKS_CODE[i] = (PROP_BLOCKS[PROPS[i]] ?? true) ? 1 : 0;

export const T_WALKABLE = new Uint8Array(TERRAINS.length);
export const T_WATER = new Uint8Array(TERRAINS.length);
TERRAINS.forEach((t, i) => {
  T_WALKABLE[i] = TERRAIN_INFO[t].walkable ? 1 : 0;
  T_WATER[i] = TERRAIN_INFO[t].water ? 1 : 0;
});

export const BIOMES = [
  'grassland', 'farmland', 'forest', 'hills', 'mountains', 'marsh', 'coast', 'snow', 'desert', 'blight', 'ocean',
] as const;
export type BiomeId = (typeof BIOMES)[number];
export const B: Record<BiomeId, number> = Object.fromEntries(BIOMES.map((b, i) => [b, i])) as Record<BiomeId, number>;
export const NB = BIOMES.length;

/** Tile flag bits (Chunk.flags). */
export const F_ROAD = 1;
export const F_WATER = 2;
export const F_BLOCKED = 4;
export const F_BRIDGE = 8;
/** Inside a set piece's footprint. */
export const F_STAMP = 16;
