/**
 * Main campaign — world nodes, roads and generator regions.
 *
 * COORDINATES: all positions and boxes are in **kingdom map units (KMU), 0..1023, y = 0 north**.
 * 1 KMU = 4 world tiles (`KMU_TO_TILES`), so the hand-authored kingdom of Aldmere is ~4096×4096
 * battle-scale world tiles, sitting at the centre of an endless procedurally generated overworld
 * (32-bit tile coordinates). Everything outside 0..1023 KMU is the unexplored Frontier — reserved for
 * campaign packs and online play; the generator should extend each border region's biome outward.
 *
 * `WorldNode.pos` = the set piece's centre in KMU. Edges are roads the generator draws between nodes.
 * Region details, town layouts and water: docs/story/BIBLE.md §6A.
 */
import type { WorldEdge, WorldNode } from '../../schema';

export const KMU_TO_TILES = 4;

export type Biome =
  | 'grassland' | 'farmland' | 'forest' | 'hills' | 'mountains' | 'marsh' | 'coast'
  | 'snow' | 'desert' | 'blight' | 'lake';

export interface WorldRegion {
  id: string;
  name: string;
  /** [x0, y0, x1, y1] inclusive, KMU. Smaller (more specific) regions win where boxes overlap. */
  box: [number, number, number, number];
  biome: Biome;
  /** Secondary biomes the generator may mix in. */
  mix?: Biome[];
  /** 1–10. Roaming party level ≈ danger × 2 ± 1 (capped by story progress). */
  danger: [number, number];
  /** Enemy template ids (enemies.ts) for roaming parties. */
  roaming: string[];
  /** Fog/weather default. */
  weather?: 'clear' | 'fog' | 'rain' | 'snow' | 'ash';
  /** Chapter in which the region is first meant to be visited (story mode gating). */
  chapter: number;
}

export const regions: WorldRegion[] = [
  { id: 'skarnholt', name: 'Skarnholt', box: [0, 0, 1023, 120], biome: 'snow', mix: ['forest', 'lake'], danger: [7, 9],
    roaming: ['skarn_raider', 'skarn_runecaster', 'skarn_huntress', 'frost_wolfkin', 'troll_barrow'], weather: 'snow', chapter: 4 },
  { id: 'thornwall', name: 'The Thornwall Mountains', box: [100, 120, 920, 250], biome: 'mountains', mix: ['snow', 'forest'], danger: [6, 8],
    roaming: ['horned_brute', 'mountain_wolfkin', 'thornwall_bandit', 'skarn_raider', 'troll_barrow'], weather: 'clear', chapter: 4 },
  { id: 'westmarch', name: 'The Westmarch', box: [0, 250, 330, 640], biome: 'hills', mix: ['forest', 'coast', 'grassland'], danger: [4, 6],
    roaming: ['westmarch_footpad', 'corsair', 'westmarch_knight', 'boarman_brute', 'wolfkin'], weather: 'rain', chapter: 3 },
  { id: 'crownlands', name: 'The Crownlands', box: [330, 250, 700, 580], biome: 'farmland', mix: ['grassland', 'hills', 'lake'], danger: [3, 5],
    roaming: ['ashguard_soldier', 'red_tithe_collector', 'highwayman', 'ledger_verger', 'wolfkin'], weather: 'clear', chapter: 2 },
  { id: 'old_mere', name: 'The Old Mere', box: [505, 380, 645, 470], biome: 'lake', danger: [3, 3],
    roaming: [], weather: 'clear', chapter: 2 },
  { id: 'ashen_reach', name: 'The Ashen Reach', box: [700, 280, 1023, 620], biome: 'blight', mix: ['marsh', 'forest'], danger: [8, 10],
    roaming: ['hollow_shade', 'restless_skeleton', 'restless_ghoul', 'gaunt', 'horned_brute', 'wolfkin'], weather: 'ash', chapter: 4 },
  { id: 'lowmarch', name: 'The Lowmarch', box: [380, 580, 660, 860], biome: 'farmland', mix: ['grassland', 'forest'], danger: [1, 3],
    roaming: ['struck_brigand', 'struck_poacher', 'hollow_hound', 'fen_titheling', 'highwayman', 'ashguard_soldier'], weather: 'clear', chapter: 1 },
  { id: 'hollin_downs', name: 'Hollin Downs', box: [400, 580, 600, 640], biome: 'hills', mix: ['grassland'], danger: [2, 3],
    roaming: ['struck_brigand', 'wolfkin', 'highwayman', 'ashguard_archer'], weather: 'clear', chapter: 1 },
  { id: 'greyfen', name: 'The Greyfen', box: [560, 620, 720, 860], biome: 'marsh', mix: ['forest'], danger: [2, 4],
    roaming: ['hollow_hound', 'restless_ghoul', 'fen_titheling', 'bog_sarth', 'struck_poacher'], weather: 'fog', chapter: 1 },
  { id: 'sallow_coast', name: 'The Sallow Coast', box: [0, 640, 380, 880], biome: 'coast', mix: ['marsh', 'grassland'], danger: [3, 5],
    roaming: ['corsair', 'smuggler', 'bog_sarth', 'struck_brigand'], weather: 'rain', chapter: 2 },
  { id: 'velmont_shore', name: 'The Velmont Shore', box: [920, 620, 1023, 1023], biome: 'coast', mix: ['farmland'], danger: [5, 7],
    roaming: ['velmont_duelist', 'velmont_crossbow', 'corsair'], weather: 'clear', chapter: 5 },
  { id: 'scald', name: 'The Scald', box: [100, 880, 900, 1023], biome: 'desert', mix: ['hills', 'marsh'], danger: [5, 7],
    roaming: ['scald_nomad', 'scald_skirmisher', 'bog_sarth', 'sarth_oathcarver', 'minotaur_horned'], weather: 'clear', chapter: 5 },
];

const N = (n: WorldNode): WorldNode => n;

export const nodes: WorldNode[] = [
  // ---------------------------------------------------------------- Chapter 1 (Lowmarch / Greyfen)
  N({ id: 'tallow_cross', name: 'Tallow Cross', kind: 'town', pos: [500, 700], shop: 'shop_tallow_cross', tavern: true,
    blurb: 'Market town where the King\'s Road crosses the Sallow. The Drowned Lantern serves sloe gin and gossip.' }),
  N({ id: 'lantern_road', name: 'The Lantern Road', kind: 'battle', pos: [575, 690],
    blurb: 'A causeway through the western Greyfen. The lanterns are dark. Something howls in the reeds.' }),
  N({ id: 'sallowmere', name: 'Sallowmere Ruins', kind: 'battle', pos: [610, 655], skirmishes: ['c1_sk_sallowmere'],
    blurb: 'An ashed fen village. Hollow hounds still circle the black stilts.' }),
  N({ id: 'millers_cut', name: 'Miller\'s Cut', kind: 'battle', pos: [470, 745],
    blurb: 'A sunken lane through a wooded ridge. Good ground for an ambush.' }),
  N({ id: 'millbrook', name: 'Millbrook', kind: 'town', pos: [440, 800],
    blurb: 'A brook, a mill-pond and the walled foundling house of Saint Verity\'s Charity. Home, once.' }),
  N({ id: 'sallow_ford', name: 'The Sallow Ford', kind: 'battle', pos: [525, 775],
    blurb: 'An old causeway-ford beside a broken bridge on the fen road north.' }),
  N({ id: 'gibbet_hill', name: 'Gibbet Hill', kind: 'battle', pos: [470, 655], skirmishes: ['c1_sk_gibbet'],
    blurb: 'A crossroads gallows on the King\'s Road. Highwaymen and worse.' }),
  N({ id: 'saint_odile', name: 'Saint Odile\'s', kind: 'landmark', pos: [600, 760],
    blurb: 'A drowned churchyard deep in the fen. No bell has rung here in eighty years.' }),
  N({ id: 'tenpenny', name: 'Tenpenny', kind: 'town', pos: [640, 800],
    blurb: 'A Struck hamlet on stilts. Tally marks on every door.' }),
  N({ id: 'kingsbarrow', name: 'Kingsbarrow', kind: 'landmark', pos: [410, 720], skirmishes: ['c1_sk_kingsbarrow'],
    blurb: 'A long barrow ringed with standing stones. Someone has opened it, and the dead have noticed.' }),
  N({ id: 'hollin_tor', name: 'Hollin Tor', kind: 'landmark', pos: [540, 622],
    blurb: 'A granite tor crowned by the ruin of Saint Ebbe\'s, an abbey older than the Ledger.' }),

  // ---------------------------------------------------------------- later chapters (locked in C1)
  N({ id: 'corvel_keep', name: 'Corvel Keep', kind: 'castle', pos: [590, 575],
    blurb: 'Fortress of the Ashguard on the Lowmarch border.' }),
  N({ id: 'aurenne', name: 'Aurenne', kind: 'castle', pos: [520, 410], tavern: true,
    blurb: 'The white capital on the Old Mere.' }),
  N({ id: 'archive', name: 'The Archive of Saint Verity', kind: 'landmark', pos: [585, 420],
    blurb: 'The Ledger\'s white mountain of libraries on Archive Isle.' }),
  N({ id: 'saltreach', name: 'Saltreach', kind: 'town', pos: [140, 470], tavern: true,
    blurb: 'Westmarch port city in terraces up a sea-cliff.' }),
  N({ id: 'aubrey_hall', name: 'Aubrey Hall', kind: 'castle', pos: [230, 360],
    blurb: 'The Duke of the Westmarch\'s moated palace-castle.' }),
  N({ id: 'saltmouth', name: 'Saltmouth', kind: 'town', pos: [300, 870], tavern: true,
    blurb: 'A fishing town on the dunes at the mouth of the Sallow.' }),
  N({ id: 'thornhold', name: 'Thornhold', kind: 'castle', pos: [470, 215],
    blurb: 'The Margravine\'s fortress above the Thornwall passes.' }),
  N({ id: 'hawkgate', name: 'Hawkgate Pass', kind: 'landmark', pos: [300, 200],
    blurb: 'The western pass through the Thornwall.' }),
  N({ id: 'ironpass', name: 'Ironpass', kind: 'landmark', pos: [640, 190],
    blurb: 'The eastern pass through the Thornwall, guarded by an old iron gate.' }),
  N({ id: 'calder', name: 'Calder (ruins)', kind: 'landmark', pos: [860, 430],
    blurb: 'A city eaten by the blight of 594. Ash to the horizon.' }),
];

export const edges: WorldEdge[] = [
  // Chapter 1
  { from: 'tallow_cross', to: 'lantern_road' },
  { from: 'lantern_road', to: 'sallowmere' },
  { from: 'tallow_cross', to: 'millers_cut' },
  { from: 'millers_cut', to: 'millbrook' },
  { from: 'millbrook', to: 'sallow_ford' },
  { from: 'sallow_ford', to: 'saint_odile' },
  { from: 'saint_odile', to: 'tenpenny' },
  { from: 'tallow_cross', to: 'gibbet_hill' },
  { from: 'gibbet_hill', to: 'hollin_tor' },
  { from: 'tallow_cross', to: 'kingsbarrow' },
  { from: 'tenpenny', to: 'hollin_tor' },
  // King's Road north and beyond
  { from: 'hollin_tor', to: 'corvel_keep' },
  { from: 'corvel_keep', to: 'aurenne' },
  { from: 'aurenne', to: 'archive' },
  { from: 'aurenne', to: 'aubrey_hall' },
  { from: 'aubrey_hall', to: 'saltreach' },
  { from: 'aurenne', to: 'thornhold' },
  { from: 'thornhold', to: 'hawkgate' },
  { from: 'thornhold', to: 'ironpass' },
  { from: 'millbrook', to: 'saltmouth' },
  { from: 'corvel_keep', to: 'calder' },
];

export const world = { nodes, edges, start: 'lantern_road' };
