/**
 * Audio asset manifest — the single place that maps logical ids to files.
 *
 * Swap an asset by changing its `src` here (and its CREDITS.md entry); game code only ever
 * refers to ids. Paths are relative to `public/assets/audio/`.
 *
 * Loop modes (music):
 *  - `{ start, end }` — sample-accurate seamless loop (seconds). Playback starts at 0, plays the
 *    intro, and jumps from `end` back to `start` forever. Points were found by waveform
 *    auto-correlation of the composer's built-in repeat (see docs/AUDIO.md).
 *  - `'crossfade'`    — track has no seamless loop; the engine overlaps the end of one pass with
 *    the start of the next using `crossfadeMs`.
 *  - `false`          — one-shot (jingles / stingers).
 *
 * `volume` is a per-asset trim (linear gain) applied before the bus volumes. Music trims were set
 * from measured integrated loudness (BS.1770, target ≈ −16 LUFS); SFX were loudness-normalised at
 * build time per category, so their trims are mostly 1.
 */

export type MusicLoop = { start: number; end: number } | 'crossfade' | false;

export interface MusicEntry {
  /** One path, or format alternatives in preference order (first playable wins). */
  src: string | string[];
  title: string;
  /** Duration of the shipped file in seconds (informational; used by tests). */
  duration: number;
  loop: MusicLoop;
  /** Overlap used when `loop === 'crossfade'`. */
  crossfadeMs?: number;
  volume: number;
  /** Short description of the cue's intended use. */
  role: string;
}

export type SfxCategory = 'ui' | 'move' | 'combat' | 'magic' | 'jingle' | 'voice' | 'world';

export interface SfxEntry {
  /** Variants; one is picked at random per play (never the same twice in a row). */
  variants: string[];
  category: SfxCategory;
  volume: number;
  /** Random pitch spread per play, e.g. 0.04 = ±4 %. */
  pitchJitter?: number;
  /** Max simultaneous instances of this id (oldest is cut). */
  maxVoices?: number;
}

const M = (file: string) => `music/${file}`;
const S = (file: string) => `sfx/${file}.m4a`;

export const MUSIC = {
  title: {
    src: M('title-a-dream-of-first-flight.mp3'), title: 'A Dream of First Flight', duration: 137.535,
    loop: { start: 10.561156, end: 136.025692 }, volume: 0.76, role: 'Title screen / main theme',
  },
  world: {
    src: M('world-the-world-at-your-door.mp3'), title: 'The World At Your Door', duration: 90.88,
    loop: { start: 14.693673, end: 89.373764 }, volume: 0.71, role: 'World map travel',
  },
  town: {
    src: M('town-in-tranquil-spring.mp3'), title: 'In Tranquil Spring', duration: 79.569,
    loop: { start: 2.468118, end: 78.060204 }, volume: 0.81, role: 'Towns, shops, calm hubs',
  },
  battle: {
    src: M('battle-a-fight-in-the-fields.mp3'), title: 'A Fight in the Fields', duration: 111.909,
    loop: { start: 7.215034, end: 110.397891 }, volume: 0.65, role: 'Standard battle',
  },
  battle2: {
    src: M('battle2-the-tread-of-war.mp3'), title: 'The Tread of War', duration: 110.237,
    loop: { start: 4.725238, end: 108.726803 }, volume: 0.68, role: 'Alternate battle (military march)',
  },
  boss: {
    src: M('boss-a-slave-to-no-one.mp3'), title: 'A Slave To No One', duration: 188.97,
    loop: { start: 24.796531, end: 187.454762 }, volume: 0.69, role: 'Boss / named-enemy battle',
  },
  tension: {
    src: M('tension-midnight-creeping.mp3'), title: 'Midnight Creeping', duration: 82.26,
    loop: { start: 4.025238, end: 80.744558 }, volume: 0.93, role: 'Intrigue, conspiracy, sneaking',
  },
  sorrow: {
    src: M('sorrow-visions-of-freedom.mp3'), title: 'Visions of Freedom', duration: 123.664,
    loop: { start: 5.140113, end: 122.138141 }, volume: 0.83, role: 'Sad / emotional story scenes',
  },
  church: {
    src: M('church-rites.m4a'), title: 'Rites', duration: 126.504,
    loop: 'crossfade', crossfadeMs: 5000, volume: 1.1, role: 'The Ledger church: chant-like voices and pipe organ',
  },
  hollow: {
    src: M('hollow-halls-of-the-undead.m4a'), title: 'Halls of the Undead', duration: 118.121,
    loop: 'crossfade', crossfadeMs: 4000, volume: 1.0, role: 'Hollows (undead): eerie organ, choir (first movement, 0:00–1:58)',
  },
  victory: {
    src: M('victory-won.m4a'), title: 'Won! (Orchestral winning jingle)', duration: 3.08,
    loop: false, volume: 1.0, role: 'Battle won fanfare (follow with `results`)',
  },
  defeat: {
    src: M('defeat-the-fallen.m4a'), title: 'The Fallen', duration: 39.649,
    loop: false, volume: 0.83, role: 'Party defeated / game over (one pass, natural ending)',
  },
  camp: {
    src: M('camp-a-tale-of-peace.mp3'), title: 'A Tale of Peace', duration: 109.375,
    loop: { start: 4.204036, end: 107.866213 }, volume: 1.2, role: 'Night camp, quiet reflection',
  },
  // ---- extras (not required, but useful cues) ----
  results: {
    src: M('results-cant-stop-winning.mp3'), title: "Can't Stop Winning", duration: 34.795,
    loop: { start: 5.854671, end: 33.2939 }, volume: 0.71, role: 'Battle results / spoils screen loop',
  },
  villain: {
    src: M('villain-encounter-of-misdeeds.mp3'), title: 'Encounter of Misdeeds', duration: 63.843,
    loop: { start: 3.028798, end: 62.341315 }, volume: 0.9, role: 'Villain reveals, menacing dialogue',
  },
  dread: {
    src: M('dread-out-of-time.mp3'), title: 'Out Of Time', duration: 73.535,
    loop: { start: 2.825238, end: 72.02458 }, volume: 0.63, role: 'Danger, terror, sinister events',
  },
  tavern: {
    src: M('tavern-minstrel-dance.m4a'), title: 'Medieval: Minstrel Dance', duration: 57.808,
    loop: { start: 0.75, end: 57.05771 }, volume: 0.68, role: 'Tavern / festival folk (lute, recorder)',
  },
} satisfies Record<string, MusicEntry>;

export type MusicId = keyof typeof MUSIC;

const ui = (file: string, volume = 1, extra: Partial<SfxEntry> = {}): SfxEntry => ({ variants: [S(file)], category: 'ui', volume, maxVoices: 2, ...extra });
const one = (file: string, category: SfxCategory, volume = 1, extra: Partial<SfxEntry> = {}): SfxEntry => ({ variants: [S(file)], category, volume, ...extra });
const blips = (voice: string) => [1, 2, 3].map((i) => S(`text_blip_${voice}_${i}`));

export const SFX = {
  // UI
  cursor: ui('cursor', 0.8, { maxVoices: 3 }),
  confirm: ui('confirm'),
  cancel: ui('cancel'),
  error: ui('error'),
  menu_open: ui('menu_open'),
  menu_close: ui('menu_close'),
  page: ui('page', 1, { pitchJitter: 0.05 }),
  equip: ui('equip'),
  unequip: ui('unequip'),
  buy: ui('buy'),
  use_item: ui('use_item'),
  turn_start: ui('turn_start', 0.9),
  gil: ui('gil', 1, { pitchJitter: 0.03, maxVoices: 3 }),
  // Movement / world
  step: { variants: [1, 2, 3, 4].map((i) => S(`step_${i}`)), category: 'move', volume: 1, pitchJitter: 0.06, maxVoices: 4 },
  jump: one('jump', 'move', 1, { pitchJitter: 0.03 }),
  land: one('land', 'move', 1, { pitchJitter: 0.03 }),
  door: one('door', 'world'),
  // Combat
  slash: one('slash', 'combat', 1, { pitchJitter: 0.05, maxVoices: 4 }),
  slash_heavy: one('slash_heavy', 'combat', 1, { pitchJitter: 0.04 }),
  pierce: one('pierce', 'combat', 1, { pitchJitter: 0.05 }),
  blunt: one('blunt', 'combat', 1, { pitchJitter: 0.05 }),
  arrow_shoot: one('arrow_shoot', 'combat', 1, { pitchJitter: 0.04 }),
  arrow_hit: one('arrow_hit', 'combat', 1, { pitchJitter: 0.05 }),
  hit: one('hit', 'combat', 1, { pitchJitter: 0.06, maxVoices: 4 }),
  crit: one('crit', 'combat'),
  miss: one('miss', 'combat', 0.9, { pitchJitter: 0.06 }),
  whoosh: one('whoosh', 'combat', 0.9, { pitchJitter: 0.08 }),
  block: one('block', 'combat', 1, { pitchJitter: 0.04 }),
  guard: one('guard', 'combat'),
  ko: one('ko', 'combat'),
  steal: one('steal', 'combat'),
  // Magic & status
  heal: one('heal', 'magic'),
  cure_big: one('cure_big', 'magic'),
  revive: one('revive', 'magic'),
  buff: one('buff', 'magic'),
  protect: one('protect', 'magic'),
  debuff: one('debuff', 'magic'),
  poison: one('poison', 'magic'),
  sleep: one('sleep', 'magic'),
  absorb: one('absorb', 'magic'),
  fire: one('fire', 'magic'),
  ice: one('ice', 'magic'),
  thunder: one('thunder', 'magic'),
  wind: one('wind', 'magic'),
  earth: one('earth', 'magic'),
  water: one('water', 'magic'),
  holy: one('holy', 'magic'),
  dark: one('dark', 'magic'),
  time: one('time', 'magic'),
  teleport: one('teleport', 'magic'),
  summon: one('summon', 'magic', 0.9),
  charge: one('charge', 'magic', 0.8),
  // Progression / jingles
  level_up: one('level_up', 'jingle'),
  job_level: one('job_level', 'jingle'),
  learn: one('learn', 'jingle'),
  item_get: one('item_get', 'jingle'),
  victory_stinger: one('victory_stinger', 'jingle'),
  defeat_stinger: one('defeat_stinger', 'jingle'),
  // Dialogue typewriter blips (pick a voice per speaker)
  text_blip: { variants: blips('mid'), category: 'voice', volume: 1, pitchJitter: 0.03, maxVoices: 2 },
  text_blip_low: { variants: blips('low'), category: 'voice', volume: 1, pitchJitter: 0.03, maxVoices: 2 },
  text_blip_mid: { variants: blips('mid'), category: 'voice', volume: 1, pitchJitter: 0.03, maxVoices: 2 },
  text_blip_high: { variants: blips('high'), category: 'voice', volume: 1, pitchJitter: 0.03, maxVoices: 2 },
} satisfies Record<string, SfxEntry>;

export type SfxId = keyof typeof SFX;

/** Ids the rest of the game may rely on existing. */
export const REQUIRED_MUSIC_IDS = [
  'title', 'world', 'town', 'battle', 'battle2', 'boss', 'tension', 'sorrow', 'church', 'hollow', 'victory', 'defeat', 'camp',
] as const satisfies readonly MusicId[];

export const REQUIRED_SFX_IDS = [
  'cursor', 'confirm', 'cancel', 'error', 'menu_open', 'page', 'step', 'jump', 'land', 'slash', 'slash_heavy', 'pierce',
  'blunt', 'arrow_shoot', 'arrow_hit', 'hit', 'crit', 'miss', 'whoosh', 'block', 'guard', 'ko', 'revive', 'heal',
  'cure_big', 'buff', 'debuff', 'poison', 'fire', 'ice', 'thunder', 'wind', 'earth', 'water', 'holy', 'dark', 'time',
  'summon', 'charge', 'level_up', 'job_level', 'learn', 'gil', 'item_get', 'steal', 'door', 'text_blip',
  'text_blip_low', 'text_blip_mid', 'text_blip_high', 'turn_start', 'victory_stinger',
] as const satisfies readonly SfxId[];

/** Small set decoded at init so the first menu interactions have zero latency. */
export const CORE_SFX: readonly SfxId[] = ['cursor', 'confirm', 'cancel', 'error', 'menu_open', 'text_blip', 'step', 'turn_start'];

export type BlipVoice = 'low' | 'mid' | 'high';

/** Voice-over lines live at `voice/<locale>/<lineId>.<ext>`; tried in this order. */
export const VOICE_FORMATS = ['ogg', 'm4a', 'mp3'] as const;
export const VOICE_DIR = 'voice';

/** Every shipped file path (relative to public/assets/audio/). */
export function allManifestFiles(): string[] {
  const out = new Set<string>();
  for (const m of Object.values(MUSIC) as MusicEntry[]) for (const s of Array.isArray(m.src) ? m.src : [m.src]) out.add(s);
  for (const e of Object.values(SFX) as SfxEntry[]) for (const v of e.variants) out.add(v);
  return [...out].sort();
}
