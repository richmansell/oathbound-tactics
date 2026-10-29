/**
 * Maps LPC catalogue keys (hair_*, beards_*, hat_*, torso_*, cape_*, heads_*) onto the
 * portrait generator's shape families. Unknown keys fall back by prefix/keyword so every
 * key renders something sensible.
 */

// ---------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------

export type Fringe = 'none' | 'full' | 'side' | 'center' | 'spiky' | 'messy' | 'swoop' | 'short' | 'curly' | 'blunt';
export type HairExtra =
  | 'ponytail' | 'highponytail' | 'braid' | 'bun' | 'pigtails' | 'topknot' | 'mohawk' | 'afro'
  | 'buzz' | 'balding' | 'cornrows' | 'halfup' | 'dreads';

export interface HairStyle {
  id: string;
  /** Pixels of volume above the skull. */
  vol: number;
  /** Hairline height above the brows at the centre (px). */
  hairline: number;
  fringe: Fringe;
  /** How far fringe locks reach below the hairline (px). */
  fringeLen: number;
  /** Face-framing side locks: none / to ear / to cheek / to jaw / past chin. */
  sides: 0 | 1 | 2 | 3 | 4;
  /** Back hair length below the skull: 0 none … 5 waist. */
  back: 0 | 1 | 2 | 3 | 4 | 5;
  texture: 'straight' | 'wavy' | 'curly' | 'spiky' | 'messy';
  extra?: HairExtra;
}

const H = (id: string, s: Omit<HairStyle, 'id'>): HairStyle => ({ id, ...s });

export const HAIR_STYLES: Record<string, HairStyle> = {
  crop:       H('crop',       { vol: 2.5, hairline: 9, fringe: 'short', fringeLen: 3, sides: 0, back: 0, texture: 'straight' }),
  bangs:      H('bangs',      { vol: 3, hairline: 10, fringe: 'full', fringeLen: 9, sides: 1, back: 1, texture: 'straight' }),
  bangsshort: H('bangsshort', { vol: 3, hairline: 10, fringe: 'blunt', fringeLen: 6, sides: 1, back: 0, texture: 'straight' }),
  messy:      H('messy',      { vol: 4, hairline: 9, fringe: 'messy', fringeLen: 8, sides: 1, back: 1, texture: 'messy' }),
  parted:     H('parted',     { vol: 3, hairline: 10, fringe: 'side', fringeLen: 7, sides: 1, back: 0, texture: 'straight' }),
  swoop:      H('swoop',      { vol: 3.5, hairline: 10, fringe: 'swoop', fringeLen: 9, sides: 1, back: 1, texture: 'straight' }),
  pixie:      H('pixie',      { vol: 3, hairline: 10, fringe: 'side', fringeLen: 8, sides: 2, back: 1, texture: 'straight' }),
  spiky:      H('spiky',      { vol: 5, hairline: 9, fringe: 'spiky', fringeLen: 7, sides: 1, back: 0, texture: 'spiky' }),
  long:       H('long',       { vol: 3, hairline: 10, fringe: 'center', fringeLen: 6, sides: 4, back: 4, texture: 'straight' }),
  longbangs:  H('longbangs',  { vol: 3, hairline: 10, fringe: 'full', fringeLen: 9, sides: 4, back: 4, texture: 'straight' }),
  xlong:      H('xlong',      { vol: 3, hairline: 10, fringe: 'center', fringeLen: 6, sides: 4, back: 5, texture: 'straight' }),
  longmessy:  H('longmessy',  { vol: 4, hairline: 9, fringe: 'messy', fringeLen: 8, sides: 4, back: 4, texture: 'messy' }),
  wavy:       H('wavy',       { vol: 4, hairline: 10, fringe: 'side', fringeLen: 7, sides: 4, back: 4, texture: 'wavy' }),
  curlylong:  H('curlylong',  { vol: 5, hairline: 10, fringe: 'curly', fringeLen: 6, sides: 4, back: 4, texture: 'curly' }),
  shoulder:   H('shoulder',   { vol: 3, hairline: 10, fringe: 'side', fringeLen: 7, sides: 3, back: 3, texture: 'straight' }),
  halfup:     H('halfup',     { vol: 3, hairline: 10, fringe: 'center', fringeLen: 5, sides: 3, back: 3, texture: 'straight', extra: 'halfup' }),
  bob:        H('bob',        { vol: 3.5, hairline: 10, fringe: 'full', fringeLen: 8, sides: 3, back: 2, texture: 'straight' }),
  bobside:    H('bobside',    { vol: 3.5, hairline: 10, fringe: 'side', fringeLen: 8, sides: 3, back: 2, texture: 'straight' }),
  page:       H('page',       { vol: 3, hairline: 10, fringe: 'blunt', fringeLen: 8, sides: 3, back: 2, texture: 'straight' }),
  ponytail:   H('ponytail',   { vol: 2.5, hairline: 10, fringe: 'side', fringeLen: 5, sides: 1, back: 0, texture: 'straight', extra: 'ponytail' }),
  highpony:   H('highpony',   { vol: 2.5, hairline: 10, fringe: 'center', fringeLen: 5, sides: 2, back: 0, texture: 'straight', extra: 'highponytail' }),
  braid:      H('braid',      { vol: 2.5, hairline: 10, fringe: 'center', fringeLen: 4, sides: 1, back: 0, texture: 'straight', extra: 'braid' }),
  bun:        H('bun',        { vol: 2.5, hairline: 10, fringe: 'full', fringeLen: 7, sides: 1, back: 0, texture: 'straight', extra: 'bun' }),
  pigtails:   H('pigtails',   { vol: 2.5, hairline: 10, fringe: 'full', fringeLen: 8, sides: 1, back: 0, texture: 'straight', extra: 'pigtails' }),
  princess:   H('princess',   { vol: 3.5, hairline: 10, fringe: 'center', fringeLen: 7, sides: 4, back: 5, texture: 'wavy' }),
  curlyshort: H('curlyshort', { vol: 4.5, hairline: 9, fringe: 'curly', fringeLen: 5, sides: 1, back: 1, texture: 'curly' }),
  afro:       H('afro',       { vol: 9, hairline: 9, fringe: 'curly', fringeLen: 3, sides: 1, back: 2, texture: 'curly', extra: 'afro' }),
  buzz:       H('buzz',       { vol: 0.8, hairline: 9, fringe: 'none', fringeLen: 0, sides: 0, back: 0, texture: 'straight', extra: 'buzz' }),
  cornrows:   H('cornrows',   { vol: 1.2, hairline: 9, fringe: 'none', fringeLen: 0, sides: 0, back: 0, texture: 'straight', extra: 'cornrows' }),
  balding:    H('balding',    { vol: 1.5, hairline: 14, fringe: 'none', fringeLen: 0, sides: 0, back: 0, texture: 'straight', extra: 'balding' }),
  shorthawk:  H('shorthawk',  { vol: 1, hairline: 9, fringe: 'none', fringeLen: 0, sides: 0, back: 0, texture: 'spiky', extra: 'mohawk' }),
  longhawk:   H('longhawk',   { vol: 1, hairline: 9, fringe: 'none', fringeLen: 0, sides: 0, back: 1, texture: 'spiky', extra: 'mohawk' }),
  dreads:     H('dreads',     { vol: 4, hairline: 9, fringe: 'side', fringeLen: 6, sides: 3, back: 2, texture: 'straight', extra: 'dreads' }),
  topknot:    H('topknot',    { vol: 2, hairline: 9, fringe: 'none', fringeLen: 0, sides: 0, back: 0, texture: 'straight', extra: 'topknot' }),
  loose:      H('loose',      { vol: 3.5, hairline: 10, fringe: 'side', fringeLen: 7, sides: 4, back: 3, texture: 'messy' }),
};

/** Every LPC hair key the game uses → portrait hair style id. */
export const HAIR_MAP: Record<string, string> = {
  hair_plain: 'crop',
  hair_bangs: 'bangs',
  hair_bangsshort: 'bangsshort',
  hair_bedhead: 'messy',
  hair_messy1: 'messy',
  hair_messy2: 'messy',
  hair_unkempt: 'messy',
  hair_parted: 'parted',
  hair_pixie: 'pixie',
  hair_spiked: 'spiky',
  hair_spiked2: 'spiky',
  hair_swoop: 'swoop',
  hair_long: 'long',
  hair_long_straight: 'long',
  hair_long_messy: 'longmessy',
  hair_wavy: 'wavy',
  hair_ponytail: 'ponytail',
  hair_ponytail2: 'ponytail',
  hair_high_ponytail: 'highpony',
  hair_braid: 'braid',
  hair_bob: 'bob',
  hair_bob_side_part: 'bobside',
  hair_bangs_bun: 'bun',
  hair_pigtails_bangs: 'pigtails',
  hair_princess: 'princess',
  hair_xlong: 'xlong',
  hair_shoulderl: 'shoulder',
  hair_curly_short: 'curlyshort',
  hair_curly_long: 'curlylong',
  hair_afro: 'afro',
  hair_buzzcut: 'buzz',
  hair_balding: 'balding',
  hair_shorthawk: 'shorthawk',
  hair_longhawk: 'longhawk',
  hair_cornrows: 'cornrows',
  hair_dreadlocks_short: 'dreads',
  hair_topknot_short: 'topknot',
  hair_half_up: 'halfup',
  hair_loose: 'loose',
  hair_page: 'page',
  hair_relm_short: 'pixie',
  hair_sara: 'longbangs',
};

const HAIR_KEYWORDS: [RegExp, string][] = [
  [/afro/, 'afro'], [/dread/, 'dreads'], [/cornrow/, 'cornrows'], [/hawk|mohawk/, 'shorthawk'],
  [/buzz|shaved/, 'buzz'], [/bald/, 'balding'], [/topknot/, 'topknot'], [/bun/, 'bun'],
  [/pigtail|twintail/, 'pigtails'], [/braid/, 'braid'], [/high_?pony/, 'highpony'], [/pony/, 'ponytail'],
  [/half_?up/, 'halfup'], [/curly_?long|long_?curl/, 'curlylong'], [/curl/, 'curlyshort'],
  [/xlong|very_?long/, 'xlong'], [/princess/, 'princess'], [/wav/, 'wavy'], [/long_?messy/, 'longmessy'],
  [/long|loose/, 'long'], [/shoulder/, 'shoulder'], [/bob/, 'bob'], [/page/, 'page'], [/pixie/, 'pixie'],
  [/spik/, 'spiky'], [/messy|bedhead|unkempt|shaggy/, 'messy'], [/swoop|sweep/, 'swoop'],
  [/part/, 'parted'], [/bangs/, 'bangs'], [/short|plain|crop/, 'crop'],
];

export function hairStyleFor(key: string | undefined): HairStyle | null {
  if (!key) return null;
  const k = key.toLowerCase().replace(/\.png$/, '');
  if (k === 'none' || k === 'bald' || k === 'hair_none') return null;
  const id = HAIR_MAP[k] ?? HAIR_KEYWORDS.find(([re]) => re.test(k))?.[1] ?? 'crop';
  return HAIR_STYLES[id];
}

// ---------------------------------------------------------------------------
// Beards
// ---------------------------------------------------------------------------

export type BeardStyle = 'full' | 'medium' | 'trimmed' | 'stubble' | 'winter' | 'mustache' | 'bigstache' | 'handlebar';

export const BEARD_MAP: Record<string, BeardStyle> = {
  beards_beard: 'full',
  beards_medium: 'medium',
  beards_trimmed: 'trimmed',
  beards_5oclock_shadow: 'stubble',
  beards_winter: 'winter',
  beards_mustache: 'mustache',
  beards_bigstache: 'bigstache',
  beards_handlebar: 'handlebar',
};

export function beardStyleFor(key: string | undefined): BeardStyle | null {
  if (!key) return null;
  const k = key.toLowerCase();
  if (k === 'none') return null;
  if (BEARD_MAP[k]) return BEARD_MAP[k];
  if (/handlebar/.test(k)) return 'handlebar';
  if (/bigstache|big_?mustache|walrus/.test(k)) return 'bigstache';
  if (/stache|mustache|moustache/.test(k)) return 'mustache';
  if (/shadow|stubble|5oclock/.test(k)) return 'stubble';
  if (/winter|long/.test(k)) return 'winter';
  if (/trim|goatee|short/.test(k)) return 'trimmed';
  if (/medium/.test(k)) return 'medium';
  return 'full';
}

// ---------------------------------------------------------------------------
// Headgear
// ---------------------------------------------------------------------------

export type HeadgearFamily =
  | 'knight' | 'nasal' | 'horned' | 'kettle' | 'wizard' | 'hood' | 'cap' | 'brimmed' | 'bandana'
  | 'circlet' | 'crown' | 'feathercap';

export interface Headgear {
  family: HeadgearFamily;
  /** Metal headgear uses metal ramps, others cloth. */
  metal: boolean;
  plume?: boolean;
}

export function headgearFor(key: string | undefined): Headgear | null {
  if (!key) return null;
  const k = key.toLowerCase();
  if (k === 'none' || k === '') return null;
  const m = (family: HeadgearFamily, metal: boolean, plume = false): Headgear => ({ family, metal, plume });
  if (/horn|viking|winged/.test(k)) return m('horned', true);
  if (/kettle|pot|sallet|morion/.test(k)) return m('kettle', true);
  if (/nasal|spangen|norman|legion|centurion/.test(k)) return m('nasal', true, /legion|centurion/.test(k));
  if (/plume/.test(k)) return m('knight', true, true);
  if (/helm|armet|bascinet|barbut|close|sugarloaf|great|visor|mail|coif|hat_armou?r/.test(k)) return m('knight', true, /great|armet|plume|crest/.test(k));
  if (/crown/.test(k)) return m('crown', true);
  if (/circlet|tiara|diadem/.test(k)) return m('circlet', true);
  if (/wizard|magic|celestial|witch|mage|sorcer/.test(k)) return m('wizard', false);
  if (/hood|cowl/.test(k)) return m('hood', false);
  if (/bandana|headband|kerchief|wrap/.test(k)) return m('bandana', false);
  if (/feather|robin|bard|beret/.test(k)) return m('feathercap', false);
  if (/tricorn|bicorn|pirate|tophat|bowler|formal|wide|straw|brim|cowboy|ranger/.test(k)) return m('brimmed', false);
  if (/cap|hat|leather/.test(k)) return m('cap', false);
  return m('cap', false);
}

// ---------------------------------------------------------------------------
// Outfit
// ---------------------------------------------------------------------------

export type OutfitFamily = 'tunic' | 'robe' | 'plate' | 'leather' | 'chainmail' | 'apron' | 'vest' | 'bare' | 'sleeveless';

export function outfitFor(key: string | undefined): OutfitFamily {
  if (!key) return 'tunic';
  const k = key.toLowerCase();
  if (/plate|legion|cuirass|breastplate|armou?r_?plate|torso_armou?r/.test(k)) return 'plate';
  if (/chain|mail/.test(k)) return 'chainmail';
  if (/robe|dress|gown|cassock|kimono/.test(k)) return 'robe';
  if (/apron|smock/.test(k)) return 'apron';
  if (/leather|jerkin|brigandine|bandolier/.test(k)) return 'leather';
  if (/vest|jacket|coat|waistcoat|corset|bodice/.test(k)) return 'vest';
  if (/sleeveless|tank|bare|none/.test(k)) return 'sleeveless';
  return 'tunic';
}

export function hasCape(key: string | undefined): boolean {
  return !!key && /cape|cloak|mantle|shawl/.test(key.toLowerCase());
}

// ---------------------------------------------------------------------------
// Heads / species
// ---------------------------------------------------------------------------

export type Species = 'human' | 'orc' | 'goblin' | 'skeleton' | 'zombie' | 'wolf' | 'lizard';

export function speciesFor(head: string | undefined, skin: string | undefined): Species {
  const k = (head ?? '').toLowerCase();
  if (/skeleton|skull|lich/.test(k)) return 'skeleton';
  if (/zombie|ghoul|undead/.test(k)) return 'zombie';
  if (/goblin|kobold|imp/.test(k)) return 'goblin';
  if (/orc|troll|ogre|boar/.test(k)) return 'orc';
  if (/wolf|dog|jackal|fox|minotaur|rabbit|rat|mouse|sheep|pig|cat/.test(k)) return 'wolf';
  if (/lizard|dragon|serpent|reptile|frog|alien/.test(k)) return 'lizard';
  const s = (skin ?? '').toLowerCase();
  if (s === 'zombie' || s === 'zombie_green') return 'zombie';
  return 'human';
}

export function isElfEars(ears: string | undefined): boolean {
  return !!ears && /elf|elven|pointed|fae/.test(ears.toLowerCase());
}

export function ageFromHead(head: string | undefined): 'young' | 'adult' | 'old' | undefined {
  const k = (head ?? '').toLowerCase();
  if (/elder|old|aged/.test(k)) return 'old';
  if (/child|kid|teen|young/.test(k)) return 'young';
  return undefined;
}
