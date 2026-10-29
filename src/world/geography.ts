/**
 * Campaign geography for the world generator — pure data, authored in **kingdom map units**
 * (KMU, 0..1023, y = 0 north; 1 KMU = 4 tiles) and converted to tiles by `WorldGen` at load.
 *
 * A campaign pack supplies its own `Geography` (regions, water, roads, set pieces); the generator
 * is entirely driven by it. `MAIN_GEOGRAPHY` is Aldmere, transcribed from docs/story/BIBLE.md §6A
 * and src/content/campaigns/main/world.ts.
 *
 * Interpretations of the bible where its numbers disagree with each other:
 *  - The Old Mere is an ellipse centred (590,425) with radii 55×45 (bible: (575,425), 70×45). The
 *    bible's ellipse would swallow Aurenne (520,410) and the Aure's mouth (540,430); the shifted
 *    ellipse keeps the box's east edge (645), the south outflow (585,470) and Archive Isle, and puts
 *    Aurenne on its west shore as described.
 *  - Saltreach (140,470) is ~100 KMU inland of the x≈0–40 coast, so it stands at the head of a
 *    long sea inlet, Saltreach Sound.
 *  - The Sallow is routed along Tallow Cross's southern edge (the wharf) rather than through the
 *    town centre.
 */
import type { Terrain } from '../engine/types';
import { regions as mainRegions, nodes as mainNodes, edges as mainEdges } from '../content/campaigns/main/world';

export type GeoBiome =
  | 'grassland' | 'farmland' | 'forest' | 'hills' | 'mountains' | 'marsh' | 'coast'
  | 'snow' | 'desert' | 'blight' | 'ocean' | 'lake';

export type KmuPoint = [number, number];
export type Side = 'n' | 'e' | 's' | 'w';

export interface GeoRegion {
  id: string;
  name: string;
  /** [x0, y0, x1, y1] inclusive KMU. Omitted for frontier regions. Smaller boxes win overlaps. */
  box?: [number, number, number, number];
  biome: GeoBiome;
  /** Secondary biomes mixed in as large patches (coast/lake entries are ignored). */
  mix?: GeoBiome[];
  danger: [number, number];
  roaming: string[];
  weather?: string;
  chapter?: number;
  /** Relief multiplier (macro height amplitude), default 1. */
  relief?: number;
  /** Base elevation offset in half-steps, default 0. */
  elev?: number;
  /** Coast cliffiness 0 (wide beaches) .. 1 (sheer cliffs), default 0.3. */
  cliff?: number;
  /** 0..1 — cold climate (pines, snow at lower heights). */
  cold?: number;
  /** 0..1 — Hollow blight (ash, dead trees, colourless). */
  blight?: number;
  /** 0..1 — arid (sand, mesas). */
  dry?: number;
  /** Frontier region for one side of the kingdom (no box). */
  frontier?: Side;
  /** Box sides the region never spills past despite border warping (e.g. a fortified line). */
  hardEdges?: Side[];
}

export interface GeoRiver {
  id: string;
  name: string;
  /** Source → mouth. [x, y, full width] in KMU. */
  points: [number, number, number][];
  /** River id this one flows into at its last point. */
  joins?: string;
  /** Lake id the river ends in / starts from. */
  intoLake?: string;
  fromLake?: string;
  /** 0..1 reed islands and shallows. */
  reedy?: number;
}

export interface GeoLake {
  id: string;
  name: string;
  /** Region id reported for tiles on the lake. */
  region?: string;
  center: KmuPoint;
  radii: [number, number];
  /** Surface height (half-steps). Computed from the shore if omitted. */
  level?: number;
  islands?: { center: KmuPoint; radii: [number, number] }[];
}

export interface GeoSea {
  id: string;
  name: string;
  /** Closed polygon (KMU). Sea = the union of all sea polygons. Coastlines get noise. */
  polygon: KmuPoint[];
}

/** A road waypoint: a KMU point, a node id, or "node:gateId" to force a particular gate. */
export type RoadPoint = KmuPoint | string;

export interface GeoRoad {
  id: string;
  name: string;
  points: RoadPoint[];
  /** Width in tiles. */
  width: number;
  /** 'kings' = cobbled near towns, dirt elsewhere. */
  surface: 'dirt' | 'cobble' | 'kings';
  /** Deck terrain over marsh water (default 'dirt'). */
  causeway?: Terrain;
  /** Deck terrain over rivers / lakes (default 'wood'). */
  bridge?: Terrain;
  /** Lamp posts every N tiles along the road. */
  lamps?: number;
  /** Wayside crosses every N tiles. */
  wayside?: number;
  /** Wobble strength 0..1 (default 1). */
  wobble?: number;
  /** Extra world edges this road stands in for (besides consecutive node waypoints). */
  covers?: [string, string][];
}

/**
 * Mountain crest: a cliff-walled spine along the polyline (`width` KMU half-width, raised `height`
 * half-steps with sheer edges) that makes the range impassable except where pass corridors cut it.
 */
export interface GeoRidge {
  id: string;
  points: KmuPoint[];
  width: number;
  height: number;
}

/** Mountain pass corridor: relief is lowered within `radius` KMU of the polyline. */
export interface GeoPass {
  id: string;
  points: KmuPoint[];
  radius: number;
}

export interface GateDef {
  side: Side;
  /** Optional id so roads can name it ("aurenne:lakegate"). */
  id?: string;
  /** Offset in tiles along the side from its centre (+ = east/south). */
  offset?: number;
  /** How far (tiles) the road runs straight out of the gate before turning. Default 12. */
  out?: number;
  /** Only used when a road names it explicitly. */
  explicit?: boolean;
}

export interface SetPieceDef {
  /** Usually the world node id. */
  id: string;
  name: string;
  /** Builder id in setpieces.ts. */
  builder: string;
  /** Centre, KMU. */
  pos: KmuPoint;
  /** Footprint in tiles [w, h]. */
  size: [number, number];
  /** Flattening falloff ring outside the footprint, tiles (default 12). */
  falloff?: number;
  gates?: GateDef[];
  params?: Record<string, number | string | boolean>;
}

export interface GeoNode { id: string; name: string; pos: KmuPoint; kind?: string }

export interface Geography {
  id: string;
  name: string;
  regions: GeoRegion[];
  /** Frontier blending: border biomes continue for `blend` KMU, danger rises per KMU outside. */
  frontier: { blend: number; dangerPerKmu: number };
  nodes: GeoNode[];
  rivers: GeoRiver[];
  lakes: GeoLake[];
  seas: GeoSea[];
  roads: GeoRoad[];
  /** World edges drawn as roads when no explicit road covers them. */
  autoRoads?: { edges: { from: string; to: string }[]; width: number; surface: 'dirt' | 'cobble' | 'kings' };
  passes: GeoPass[];
  ridges?: GeoRidge[];
  setPieces: SetPieceDef[];
}

// ------------------------------------------------------------------------------------------------
// Aldmere
// ------------------------------------------------------------------------------------------------

const REGION_EXTRA: Record<string, Partial<GeoRegion>> = {
  skarnholt: { cold: 1, cliff: 0.6, relief: 1.1, elev: 2 },
  thornwall: { cold: 0.7, relief: 1 },
  westmarch: { cliff: 0.95, relief: 1.1 },
  crownlands: { relief: 0.8, cliff: 0.2 },
  old_mere: {},
  ashen_reach: { blight: 1, cliff: 0.5, hardEdges: ['w'] },
  lowmarch: { relief: 1.0, cliff: 0.1 },
  hollin_downs: { relief: 0.9 },
  greyfen: { relief: 0.6, cliff: 0 },
  sallow_coast: { cliff: 0.08, relief: 0.8 },
  velmont_shore: { cliff: 0.35 },
  scald: { dry: 1, cliff: 0.55 },
};

const FRONTIER_REGIONS: GeoRegion[] = [
  { id: 'frontier_north', name: 'The White Waste', biome: 'snow', mix: ['forest', 'mountains'], danger: [8, 10], frontier: 'n', cold: 1, cliff: 0.6, relief: 1.2, elev: 2,
    roaming: ['skarn_raider', 'skarn_huntress', 'frost_wolfkin', 'troll_barrow'], weather: 'snow', chapter: 99 },
  { id: 'frontier_west', name: 'The Grey Sea Isles', biome: 'ocean', mix: ['forest', 'hills'], danger: [5, 8], frontier: 'w', cliff: 0.7,
    roaming: ['corsair', 'smuggler', 'wolfkin'], weather: 'rain', chapter: 99 },
  { id: 'frontier_east', name: 'The Velmont Isles', biome: 'ocean', mix: ['farmland', 'grassland'], danger: [6, 9], frontier: 'e', cliff: 0.4,
    roaming: ['velmont_duelist', 'velmont_crossbow', 'corsair'], weather: 'clear', chapter: 99 },
  { id: 'frontier_south', name: 'The Deep Scald', biome: 'desert', mix: ['hills'], danger: [7, 10], frontier: 's', dry: 1, cliff: 0.6, relief: 1.1,
    roaming: ['scald_nomad', 'scald_skirmisher', 'sarth_oathcarver', 'minotaur_horned'], weather: 'clear', chapter: 99 },
];

const SP = (d: SetPieceDef): SetPieceDef => d;
const nodePos = (id: string): KmuPoint => {
  const n = mainNodes.find((x) => x.id === id);
  if (!n) throw new Error(`geography: unknown node ${id}`);
  return [n.pos[0], n.pos[1]];
};

/** Burn-line watchtowers every 24 KMU along x ≈ 709. */
const burnlineTowers: SetPieceDef[] = [];
for (let i = 0, y = 296; y <= 600; y += 24, i++) {
  burnlineTowers.push(SP({ id: `burnline_tower_${i}`, name: 'Burn-line Watchtower', builder: 'watchtower', pos: [710, y], size: [9, 9], falloff: 6 }));
}

export const MAIN_GEOGRAPHY: Geography = {
  id: 'aldmere',
  name: 'Aldmere',
  regions: [
    ...mainRegions.map((r): GeoRegion => ({
      id: r.id, name: r.name, box: r.box, biome: r.biome, mix: r.mix, danger: r.danger, roaming: r.roaming,
      weather: r.weather, chapter: r.chapter, ...REGION_EXTRA[r.id],
    })),
    ...FRONTIER_REGIONS,
  ],
  frontier: { blend: 40, dangerPerKmu: 1 / 120 },
  nodes: mainNodes.map((n) => ({ id: n.id, name: n.name, pos: [n.pos[0], n.pos[1]], kind: n.kind })),

  rivers: [
    { id: 'sallow', name: 'River Sallow', reedy: 0.8, points: [
      [690, 640, 1.2], [670, 646, 2.2], [640, 651, 2.8], [610, 655, 3.2], [586, 667, 3.4], [560, 683, 3.6],
      [522, 697, 3.8], [510, 703, 3.8], [498, 707, 3.8], [488, 714, 3.8], [489, 727, 3.8], [500, 741, 3.8],
      [514, 754, 3.8], [526, 766, 3.8], [523, 778, 4], [503, 784, 4], [475, 785, 4], [445, 786, 4],
      [418, 792, 4.4], [390, 806, 4.6], [362, 824, 5], [338, 843, 5.4], [318, 853, 5.8], [300, 861, 6], [288, 872, 6.4], [282, 890, 7], [278, 910, 7.5],
    ] },
    { id: 'aure', name: 'River Aure', joins: 'sallow', intoLake: 'old_mere', reedy: 0.25, points: [
      [520, 166, 0.7], [519, 178, 1.0], [513, 205, 1.3], [510, 240, 1.7], [515, 300, 2.2], [517, 350, 2.6],
      [516, 382, 2.8], [520, 400, 3.0], [528, 418, 3.0], [540, 432, 3.0], [552, 436, 3.0],
    ] },
    { id: 'aure_lower', name: 'River Aure', joins: 'sallow', fromLake: 'old_mere', reedy: 0.3, points: [
      [585, 462, 3.0], [584, 480, 3.0], [580, 515, 3.2], [575, 560, 3.4], [569, 600, 3.5], [560, 638, 3.5],
      [542, 666, 3.6], [522, 697, 3.8],
    ] },
    { id: 'millbrook_brook', name: 'The Mill Brook', joins: 'sallow', points: [
      [432, 836, 0.5], [437, 822, 0.6], [440, 810, 0.65], [442, 798, 0.7], [444, 790, 0.75], [445, 786, 0.8],
    ] },
    { id: 'millrace', name: 'Miller\'s Race', joins: 'sallow', points: [
      [452, 722, 0.45], [462, 735, 0.55], [470, 747, 0.6], [478, 760, 0.65], [488, 773, 0.7], [496, 784, 0.8],
    ] },
    { id: 'greyfen_lode', name: 'The Greyfen Lode', joins: 'sallow', reedy: 1, points: [
      [712, 800, 0.8], [680, 790, 1.2], [650, 784, 1.5], [618, 776, 1.8], [585, 772, 2], [556, 776, 2.2], [530, 778, 2.4],
    ] },
    { id: 'wend', name: 'River Wend', reedy: 0.2, points: [
      [256, 246, 0.6], [246, 290, 1.1], [238, 330, 1.5], [222, 372, 1.8], [205, 405, 2.0], [184, 438, 2.2],
      [165, 458, 2.4], [156, 478, 2.6], [150, 490, 3],
    ] },
    { id: 'greywater', name: 'The Greywater', points: [
      [790, 285, 0.8], [815, 340, 1.4], [846, 400, 1.8], [872, 448, 2], [884, 500, 2.2], [886, 560, 2.4], [896, 600, 2.6],
    ] },
    { id: 'skarn_run', name: 'The Skarn Run', points: [
      [640, 168, 0.6], [652, 130, 1.0], [670, 90, 1.5], [700, 50, 2], [740, 12, 2.4], [780, -30, 2.6],
    ] },
  ],

  lakes: [
    { id: 'old_mere', name: 'The Old Mere', region: 'old_mere', center: [590, 425], radii: [55, 45],
      islands: [{ center: [585, 420], radii: [10, 9] }] },
  ],

  seas: [
    { id: 'grey_sea', name: 'The Grey Sea', polygon: [
      [-6000, -6000], [26, -6000], [28, -200], [24, 0], [30, 60], [20, 120], [27, 190], [22, 250], [30, 300], [17, 345],
      [26, 410], [20, 470], [24, 530], [16, 590], [22, 650], [30, 720], [40, 780], [62, 828], [104, 856], [160, 870],
      [222, 876], [268, 880], [292, 886], [300, 900], [286, 936], [258, 980], [232, 1023], [200, 1100], [120, 1300],
      [-200, 2400], [-6000, 6000],
    ] },
    { id: 'saltreach_sound', name: 'Saltreach Sound', polygon: [
      [-10, 474], [30, 470], [64, 466], [96, 466], [120, 469], [140, 472], [155, 476], [158, 486], [146, 494], [130, 497],
      [104, 496], [70, 500], [36, 504], [-10, 506],
    ] },
    { id: 'east_ocean', name: 'The Outer Sea', polygon: [
      [1036, -6000], [1034, -200], [1036, 0], [1026, 110], [1014, 220], [998, 310], [992, 400], [986, 500], [966, 560],
      [930, 586], [1000, 590], [1056, 610], [1062, 700], [1056, 800], [1068, 900], [1060, 1023], [1090, 1400],
      [1200, 6000], [6000, 6000], [6000, -6000],
    ] },
    { id: 'narrow_sea', name: 'The Narrow Sea', polygon: [
      [930, 560], [960, 580], [918, 610], [924, 660], [916, 720], [922, 800], [914, 880], [920, 960], [932, 1023],
      [940, 1200], [900, 1600], [860, 1600], [874, 1200], [878, 1023], [870, 940], [876, 860], [870, 780], [876, 700],
      [870, 640], [882, 600], [900, 580],
    ] },
  ],

  roads: [
    { id: 'kings_road', name: 'The King\'s Road', width: 3, surface: 'kings', wayside: 360, points: [
      'aurenne', [585, 560], 'hollin_tor', 'gibbet_hill', 'tallow_cross', 'millers_cut', [445, 784], 'millbrook', [380, 836], 'saltmouth',
    ], covers: [['hollin_tor', 'corvel_keep'], ['corvel_keep', 'aurenne']] },
    { id: 'corvel_spur', name: 'Corvel Road', width: 2, surface: 'cobble', wobble: 0.4, points: [[585, 560], 'corvel_keep'] },
    { id: 'lantern_road', name: 'The Lantern Road', width: 2, surface: 'dirt', causeway: 'wood', lamps: 26, points: [
      'tallow_cross', [538, 704], 'lantern_road', [592, 676], 'sallowmere',
    ] },
    { id: 'fen_road', name: 'The Fen Road', width: 2, surface: 'dirt', causeway: 'dirt', points: [
      'millbrook', [482, 794], 'sallow_ford', [560, 770], 'saint_odile', [622, 786], 'tenpenny',
    ] },
    { id: 'ford_track', name: 'Ford Track', width: 2, surface: 'dirt', wobble: 0.6, points: ['sallow_ford', [505, 760], 'millers_cut'] },
    { id: 'archive_causeway', name: 'The Lakegate Causeway', width: 3, surface: 'cobble', bridge: 'brick', wobble: 0, points: ['aurenne:lakegate', 'archive'] },
    { id: 'west_road', name: 'The West Road', width: 3, surface: 'kings', points: ['aurenne', [440, 398], [330, 374], 'aubrey_hall', [214, 398], [192, 432], 'saltreach'] },
    { id: 'north_road', name: 'The North Road', width: 2, surface: 'kings', points: ['aurenne', [500, 345], [486, 282], 'thornhold'] },
    { id: 'hawk_road', name: 'Hawkgate Road', width: 2, surface: 'dirt', points: ['thornhold', [400, 208], 'hawkgate', [296, 150], [290, 70], [285, -20]] },
    { id: 'iron_road', name: 'Ironpass Road', width: 2, surface: 'dirt', points: ['thornhold', [560, 202], 'ironpass', [648, 140], [656, 70], [660, -20]] },
    { id: 'burnline_road', name: 'The Burn-line Road', width: 2, surface: 'dirt', points: ['corvel_keep', [650, 588], [702, 580], [704, 500], [704, 400], [705, 296]] },
  ],

  autoRoads: { edges: mainEdges, width: 2, surface: 'dirt' },

  passes: [
    { id: 'north_road_valley', points: [[505, 300], [486, 262], [470, 215]], radius: 12 },
    { id: 'hawkgate', points: [[470, 215], [400, 208], [300, 200], [296, 150], [290, 100]], radius: 11 },
    { id: 'ironpass', points: [[470, 215], [560, 202], [640, 190], [648, 140], [656, 100]], radius: 11 },
    { id: 'aure_gorge', points: [[518, 172], [512, 220], [514, 260]], radius: 7 },
  ],

  ridges: [
    { id: 'thornwall_crest', width: 4.5, height: 11, points: [
      [80, 172], [160, 160], [240, 166], [330, 158], [420, 164], [520, 158], [600, 166], [700, 158], [800, 166], [940, 160],
    ] },
  ],

  setPieces: [
    // ---------------------------------------------------------------- Chapter 1
    SP({ id: 'tallow_cross', name: 'Tallow Cross', builder: 'market_town', pos: nodePos('tallow_cross'), size: [52, 48], falloff: 14,
      gates: [{ side: 'n' }, { side: 's', out: 18 }, { side: 'e', offset: -4 }] }),
    SP({ id: 'millbrook', name: 'Millbrook', builder: 'village', pos: nodePos('millbrook'), size: [40, 50], falloff: 12,
      gates: [{ side: 'n', offset: -4 }, { side: 's', offset: -4 }, { side: 'e', offset: 8 }] }),
    SP({ id: 'tenpenny', name: 'Tenpenny', builder: 'stilt_hamlet', pos: nodePos('tenpenny'), size: [32, 30], falloff: 8,
      gates: [{ side: 'w' }, { side: 'n' }] }),
    SP({ id: 'sallowmere', name: 'Sallowmere Ruins', builder: 'stilt_hamlet', pos: nodePos('sallowmere'), size: [32, 30], falloff: 8,
      params: { ruined: true }, gates: [{ side: 'w' }] }),
    SP({ id: 'lantern_road', name: 'The Lantern Road', builder: 'causeway_site', pos: nodePos('lantern_road'), size: [30, 26], falloff: 8 }),
    SP({ id: 'millers_cut', name: 'Miller\'s Cut', builder: 'sunken_lane', pos: nodePos('millers_cut'), size: [34, 34], falloff: 10 }),
    SP({ id: 'sallow_ford', name: 'The Sallow Ford', builder: 'ford', pos: nodePos('sallow_ford'), size: [34, 30], falloff: 8 }),
    SP({ id: 'saint_odile', name: 'Saint Odile\'s', builder: 'drowned_church', pos: nodePos('saint_odile'), size: [28, 26], falloff: 8 }),
    SP({ id: 'hollin_tor', name: 'Hollin Tor', builder: 'tor', pos: nodePos('hollin_tor'), size: [56, 56], falloff: 14,
      gates: [{ side: 'n' }, { side: 'e' }, { side: 's' }, { side: 'w' }] }),
    SP({ id: 'gibbet_hill', name: 'Gibbet Hill', builder: 'gibbet', pos: nodePos('gibbet_hill'), size: [26, 26], falloff: 10 }),
    SP({ id: 'kingsbarrow', name: 'Kingsbarrow', builder: 'barrow', pos: nodePos('kingsbarrow'), size: [36, 24], falloff: 10 }),
    // ---------------------------------------------------------------- later chapters
    SP({ id: 'corvel_keep', name: 'Corvel Keep', builder: 'fortress', pos: nodePos('corvel_keep'), size: [40, 40], falloff: 16,
      gates: [{ side: 's', out: 14 }] }),
    SP({ id: 'aurenne', name: 'Aurenne', builder: 'capital', pos: nodePos('aurenne'), size: [140, 120], falloff: 20,
      gates: [{ side: 'n', offset: -20 }, { side: 'w', offset: 6 }, { side: 's', offset: 6 }, { side: 'e', id: 'ashgate', offset: -38 },
        { side: 'e', id: 'lakegate', offset: 16, explicit: true }] }),
    SP({ id: 'archive', name: 'The Archive of Saint Verity', builder: 'archive', pos: nodePos('archive'), size: [60, 60], falloff: 6,
      gates: [{ side: 'w' }] }),
    SP({ id: 'saltreach', name: 'Saltreach', builder: 'port_city', pos: nodePos('saltreach'), size: [90, 70], falloff: 16,
      gates: [{ side: 'n', offset: 10 }, { side: 'e', offset: -10 }] }),
    SP({ id: 'aubrey_hall', name: 'Aubrey Hall', builder: 'moated_castle', pos: nodePos('aubrey_hall'), size: [44, 40], falloff: 14,
      gates: [{ side: 'e' }, { side: 's', offset: -6 }] }),
    SP({ id: 'saltmouth', name: 'Saltmouth', builder: 'fishing_town', pos: nodePos('saltmouth'), size: [36, 30], falloff: 10,
      gates: [{ side: 'n' }, { side: 'e' }] }),
    SP({ id: 'thornhold', name: 'Thornhold', builder: 'mountain_fortress', pos: nodePos('thornhold'), size: [40, 40], falloff: 16,
      gates: [{ side: 's' }, { side: 'w', offset: 8 }, { side: 'e', offset: 8 }] }),
    SP({ id: 'hawkgate', name: 'Hawkgate Pass', builder: 'pass_gate', pos: nodePos('hawkgate'), size: [28, 28], falloff: 10 }),
    SP({ id: 'ironpass', name: 'Ironpass', builder: 'pass_gate', pos: nodePos('ironpass'), size: [28, 28], falloff: 10, params: { iron: true } }),
    SP({ id: 'calder', name: 'Calder (ruins)', builder: 'ruined_city', pos: nodePos('calder'), size: [80, 80], falloff: 14,
      gates: [{ side: 'w' }, { side: 's' }] }),
    ...burnlineTowers,
  ],
};
