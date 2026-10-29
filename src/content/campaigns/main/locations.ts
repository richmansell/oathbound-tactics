/**
 * Main campaign — locations (scene backdrops + battle sites).
 * Narrative descriptions: docs/story/BIBLE.md §6; generator stamps: §6A.
 */
import type { LocationDef } from '../../schema';

const L = (l: LocationDef): LocationDef => l;

export const locations: Record<string, LocationDef> = {
  // ---------------------------------------------------------------- Chapter 1: Lowmarch & Greyfen
  lantern_road: L({ id: 'lantern_road', name: 'The Lantern Road', backdrop: 'road',
    description: 'A causeway on posts through the western Greyfen. Lanterns hang on poles every furlong; most have been dark for years.' }),
  tallow_cross: L({ id: 'tallow_cross', name: 'Tallow Cross', backdrop: 'village',
    description: 'Market town where the King\'s Road crosses the Sallow. Smells of tallow, wool and river mud.' }),
  drowned_lantern: L({ id: 'drowned_lantern', name: 'The Drowned Lantern', backdrop: 'tavern',
    description: 'Tallow Cross\'s three-storey inn, all crooked beams and low ceilings; the sign is a lantern sinking in painted water.' }),
  tallow_cross_roof: L({ id: 'tallow_cross_roof', name: 'The Drowned Lantern — Roof', backdrop: 'village',
    description: 'A flat leaded stretch of roof between chimneys, above the market square. Stars, smoke, the river beyond.' }),
  millbrook_roof_memory: L({ id: 'millbrook_roof_memory', name: 'Saint Verity\'s Charity — Ten Years Ago', backdrop: 'village',
    description: 'The roof-walk of the foundling house in summer twilight, seen through memory: warmer, softer, smaller.' }),
  millers_cut: L({ id: 'millers_cut', name: 'Miller\'s Cut', backdrop: 'forest',
    description: 'A sunken lane through a wooded ridge on the King\'s Road, ending at an abandoned watermill.' }),
  millbrook: L({ id: 'millbrook', name: 'Millbrook', backdrop: 'village',
    description: 'A brook, a mill-pond, thirty cottages — and the walled foundling house of Saint Verity\'s Charity.' }),
  millbrook_chapel: L({ id: 'millbrook_chapel', name: 'Saint Verity\'s Chapel, Millbrook', backdrop: 'abbey',
    description: 'The foundling house chapel: whitewash, one window, a lamp before the open-book sigil.' }),
  camp_ashguard: L({ id: 'camp_ashguard', name: 'Ashguard Camp', backdrop: 'camp-night',
    description: 'Grey tents in a stubble field, a brazier, banners heavy with rain.' }),
  sallow_ford: L({ id: 'sallow_ford', name: 'The Sallow Ford', backdrop: 'bridge',
    description: 'An old stone causeway-ford across the Sallow beside the stub of a broken bridge. Reed islands, a ferryman\'s hut.' }),
  sallow_ford_north: L({ id: 'sallow_ford_north', name: 'North Bank of the Sallow', backdrop: 'road',
    description: 'A hedged lane above the ford. Grey light before dawn.' }),
  greyfen_deep: L({ id: 'greyfen_deep', name: 'The Deep Greyfen', backdrop: 'swamp',
    description: 'Reed-beds taller than a man, black water, fog. The paths are known only to fen folk.' }),
  saint_odile: L({ id: 'saint_odile', name: 'Saint Odile\'s Drowned Churchyard', backdrop: 'swamp',
    description: 'A chapel sinking into the marsh, its graves half under water. No bell has rung here in eighty years.' }),
  tenpenny: L({ id: 'tenpenny', name: 'Tenpenny', backdrop: 'swamp',
    description: 'A Struck hamlet on stilts and peat hummocks, joined by plank walkways. Tally marks on every door.' }),
  tenpenny_hall: L({ id: 'tenpenny_hall', name: 'Tenpenny Stilt-Hall', backdrop: 'tavern',
    description: 'The village\'s one big room: reed thatch, a peat fire, eel-nets drying from the rafters.' }),
  hollin_camp: L({ id: 'hollin_camp', name: 'Below Hollin Tor', backdrop: 'camp-night',
    description: 'A sheltered hollow on the downs beneath the tor. A small fire. The ruin a black shape against the stars.' }),
  hollin_tor: L({ id: 'hollin_tor', name: 'Saint Ebbe\'s, Hollin Tor', backdrop: 'abbey',
    description: 'A granite tor crowned by a roofless pre-Ledger abbey and a crossroads arch where Lanternbearers once kept their vigil.' }),
  sallowmere: L({ id: 'sallowmere', name: 'Sallowmere (ruins)', backdrop: 'swamp',
    description: 'Tamsin\'s village, ashed two years ago: charred stilts standing in black water.' }),
  gibbet_hill: L({ id: 'gibbet_hill', name: 'Gibbet Hill', backdrop: 'road',
    description: 'A crossroads knoll on the King\'s Road with a gallows and a burnt-out coaching inn.' }),
  kingsbarrow: L({ id: 'kingsbarrow', name: 'Kingsbarrow', backdrop: 'forest',
    description: 'A long barrow from the Age of Broken Words, ringed with standing stones. Someone has opened it.' }),

  // ---------------------------------------------------------------- Crownlands (cold open, sting, later)
  aurenne_palace: L({ id: 'aurenne_palace', name: 'Palace of Aurenne', backdrop: 'castle-hall',
    description: 'The royal palace on Crown Hill: white stone, long corridors, the king\'s bedchamber.' }),
  aurenne_road: L({ id: 'aurenne_road', name: 'The Lake Road, outside Aurenne', backdrop: 'road',
    description: 'A muddy road along the Old Mere in a storm.' }),
  aurenne_archive: L({ id: 'aurenne_archive', name: 'The Archive of Saint Verity', backdrop: 'dungeon',
    description: 'The deep vaults beneath the Archive: shelves to the dark, one candle, a black book.' }),
  aurenne: L({ id: 'aurenne', name: 'Aurenne', backdrop: 'castle-hall',
    description: 'The white capital on the Old Mere.' }),
  corvel_keep: L({ id: 'corvel_keep', name: 'Corvel Keep', backdrop: 'keep',
    description: 'Ashguard fortress on the Lowmarch border; black pyre-yard, grey banners.' }),
  saltreach: L({ id: 'saltreach', name: 'Saltreach', backdrop: 'village',
    description: 'Westmarch port city climbing a sea-cliff in terraces.' }),
  thornhold: L({ id: 'thornhold', name: 'Thornhold', backdrop: 'snow',
    description: 'The Margravine\'s fortress cut into the cliffs above the Thornwall passes.' }),
};
