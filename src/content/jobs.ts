/**
 * Job definitions. Stat multipliers/growth follow the classic tactics model:
 * multipliers shape current stats, growth constants (lower = faster) shape how
 * raw stats grow when levelling in that job.
 */
import type { JobDef, StatBlock } from './types';
import type { LayerRef } from './schema';

const st = (hp: number, mp: number, sp: number, pa: number, ma: number): StatBlock => ({ hp, mp, sp, pa, ma });
const L = (key: string, color?: string, color2?: string): LayerRef => (color2 ? { key, color, color2 } : color ? { key, color } : { key });

const J: Record<string, JobDef> = {};
function job(d: JobDef): void { J[d.id] = d; }

job({
  id: 'squire', name: 'Squire', skillsetName: 'Grit',
  description: 'Sellswords and would-be knights. Sturdy, adaptable, and the root of every martial path.',
  abilities: ['focus', 'rush', 'throw_stone', 'field_dressing', 'rally', 'stand_firm', 'second_wind', 'counter_tackle', 'jp_boost', 'exp_boost', 'move_1'],
  equips: ['knife', 'sword', 'axe', 'flail', 'clothes', 'hat'],
  mult: st(100, 75, 100, 90, 80), growth: st(11, 15, 100, 60, 50), move: 4, jump: 3, cev: 5, requires: {},
  outfit: { all: [L('torso_clothes_tunic', 'brown'), L('legs_pants', 'brown'), L('feet_boots_basic', 'leather'), L('belt_leather', 'brown')] },
});
job({
  id: 'alchemist', name: 'Alchemist', skillsetName: 'Alchemy',
  description: 'Apothecaries of the road. Masters of potions, remedies and the precious phoenix down.',
  abilities: ['use_potion', 'use_hi_potion', 'use_x_potion', 'use_ether', 'use_hi_ether', 'use_elixir', 'use_antidote', 'use_eye_drops', 'use_echo_herbs', 'use_gold_needle', 'use_holy_water', 'use_remedy', 'use_phoenix_down', 'auto_potion', 'throw_items', 'medicine', 'safeguard', 'accrue_exp'],
  equips: ['knife', 'crossbow', 'clothes', 'hat'],
  mult: st(80, 75, 100, 75, 80), growth: st(12, 16, 100, 75, 50), move: 3, jump: 3, cev: 5, requires: {},
  outfit: { all: [L('torso_clothes_longsleeve', 'white'), L('torso_aprons_apron', 'brown'), L('legs_pants', 'tan'), L('feet_shoes_basic', 'brown')] },
});
job({
  id: 'knight', name: 'Knight', skillsetName: 'Arms',
  description: 'Armoured warriors sworn to a banner. They break the enemy\'s steel before breaking the enemy.',
  abilities: ['rend_helm', 'rend_armor', 'rend_shield', 'rend_weapon', 'rend_power', 'rend_magic', 'rend_speed', 'rend_mp', 'shield_bash', 'parry', 'equip_heavy', 'equip_shield', 'equip_swords'],
  equips: ['sword', 'knightsword', 'shield', 'armor', 'helm', 'clothes'],
  mult: st(120, 80, 100, 120, 80), growth: st(10, 15, 100, 40, 50), move: 3, jump: 3, cev: 10, requires: { squire: 2 },
  outfit: { all: [L('torso_clothes_longsleeve', 'navy'), L('legs_pants', 'gray'), L('feet_boots_basic', 'black')] },
});
job({
  id: 'ranger', name: 'Ranger', skillsetName: 'Aim',
  description: 'Wardens of the wild roads. Patient archers whose charged shots strike from impossible heights.',
  abilities: ['aim_1', 'aim_2', 'aim_3', 'aim_5', 'aim_10', 'pinning_shot', 'blinding_shot', 'arrow_rain', 'arrow_guard', 'concentrate', 'equip_bows', 'jump_1'],
  equips: ['bow', 'crossbow', 'clothes', 'hat'],
  mult: st(100, 65, 100, 110, 80), growth: st(11, 16, 100, 45, 50), move: 3, jump: 3, cev: 10, requires: { squire: 2 },
  outfit: { all: [L('torso_clothes_longsleeve', 'forest'), L('legs_pants', 'brown'), L('feet_boots_fold', 'leather'), L('belt_leather', 'brown'), L('quiver')] },
});
job({
  id: 'cleric', name: 'Cleric', skillsetName: 'White Magick',
  description: 'Healers ordained by the Ledger — or trained in its shadow. Their prayers mend flesh and ward the faithful.',
  abilities: ['cure', 'cura', 'curaga', 'curaja', 'raise', 'arise', 'regen', 'protect', 'shell', 'esuna', 'holy', 'regenerator', 'healing_boost', 'arcane_defense'],
  equips: ['staff', 'flail', 'robe', 'clothes', 'hat'],
  mult: st(80, 120, 110, 90, 110), growth: st(10, 10, 100, 50, 50), move: 3, jump: 3, cev: 5, requires: { alchemist: 2 },
  outfit: { all: [L('torso_clothes_robe', 'white'), L('belt_robe'), L('feet_slippers', 'white')] },
});
job({
  id: 'wizard', name: 'Wizard', skillsetName: 'Black Magick',
  description: 'Scholars of the elements who bend fire, frost and storm to their will.',
  abilities: ['fire', 'fira', 'firaga', 'blizzard', 'blizzara', 'blizzaga', 'thunder', 'thundara', 'thundaga', 'poison_spell', 'flare', 'magick_counter', 'arcane_strength', 'manafont'],
  equips: ['rod', 'robe', 'clothes', 'hat'],
  mult: st(75, 120, 100, 60, 150), growth: st(12, 9, 100, 60, 50), move: 3, jump: 3, cev: 5, requires: { alchemist: 2 },
  outfit: { all: [L('torso_clothes_robe', 'blue'), L('belt_mage'), L('feet_slippers', 'navy')] },
});
job({
  id: 'monk', name: 'Monk', skillsetName: 'Martial Arts',
  description: 'Ascetics of the mountain houses. Their fists are weapons, their breath a remedy.',
  abilities: ['cyclone', 'pummel', 'aura_blast', 'shockwave', 'chakra', 'purify', 'revive_monk', 'doom_fist', 'counter', 'brawler', 'defense_boost', 'lifefont'],
  innate: ['brawler'],
  equips: ['fist', 'clothes', 'hat'],
  mult: st(135, 80, 110, 129, 80), growth: st(9, 13, 100, 48, 50), move: 3, jump: 4, cev: 20, requires: { knight: 3 },
  outfit: { all: [L('torso_clothes_sleeveless2', 'orange'), L('legs_pantaloons', 'orange'), L('belt_sash', 'maroon'), L('feet_sandals', 'brown'), L('torso_bandages')] },
});
job({
  id: 'rogue', name: 'Rogue', skillsetName: 'Thievery',
  description: 'Cutpurses, scouts and smugglers. Fast, slippery and always leaving with more than they came with.',
  abilities: ['steal_gil', 'steal_weapon', 'steal_shield', 'steal_helm', 'steal_armor', 'steal_accessory', 'steal_exp', 'beguile', 'cheap_shot', 'gil_snapper', 'reflexes', 'evasive_stance', 'move_2', 'jump_2'],
  equips: ['knife', 'throwing', 'clothes', 'hat'],
  mult: st(90, 50, 110, 100, 60), growth: st(11, 16, 90, 50, 50), move: 4, jump: 4, cev: 25, requires: { ranger: 3 },
  outfit: { all: [L('torso_clothes_longsleeve', 'charcoal'), L('torso_clothes_vest', 'black'), L('legs_pants', 'black'), L('feet_boots_rim', 'black')] },
});
job({
  id: 'chronomancer', name: 'Chronomancer', skillsetName: 'Time Magick',
  description: 'Heretics who study the turning of the hours. They hasten friends, still foes and call down stars.',
  abilities: ['haste', 'hasteja', 'slow', 'slowja', 'stop', 'immobilize_spell', 'float', 'reflect', 'quick', 'gravity', 'graviga', 'meteor', 'critical_quick', 'swiftness', 'teleport', 'float_move'],
  equips: ['staff', 'rod', 'robe', 'clothes', 'hat'],
  mult: st(75, 120, 100, 50, 130), growth: st(12, 10, 100, 65, 50), move: 3, jump: 3, cev: 5, requires: { cleric: 3 },
  outfit: { all: [L('torso_clothes_robe', 'purple'), L('belt_mage'), L('feet_slippers', 'purple')] },
});
job({
  id: 'hexer', name: 'Hexer', skillsetName: 'Hexes',
  description: 'Practitioners of forbidden curses. Sleep, silence, despair — and worse.',
  abilities: ['blind_spell', 'silence_spell', 'sleep_spell', 'confuse_spell', 'berserk_spell', 'doom_spell', 'petrify_spell', 'enthrall', 'despair', 'leech', 'siphon', 'absorb_mp', 'halve_mp'],
  equips: ['rod', 'staff', 'robe', 'clothes', 'hat'],
  mult: st(75, 110, 100, 50, 120), growth: st(12, 10, 100, 60, 50), move: 3, jump: 3, cev: 5, requires: { wizard: 3 },
  outfit: { all: [L('torso_clothes_robe', 'black'), L('belt_mage'), L('feet_slippers', 'black')] },
});
job({
  id: 'lancer', name: 'Lancer', skillsetName: 'Jump',
  description: 'Spear-knights of the high passes who strike from the sky.',
  abilities: ['jump', 'long_jump', 'high_jump', 'dragon_dive', 'impale', 'dragonheart', 'equip_polearms', 'ignore_height'],
  equips: ['spear', 'shield', 'armor', 'helm', 'clothes'],
  mult: st(120, 50, 100, 120, 50), growth: st(10, 15, 100, 40, 50), move: 3, jump: 4, cev: 15, requires: { knight: 4, rogue: 2 },
  outfit: { all: [L('torso_clothes_longsleeve', 'maroon'), L('legs_pants', 'gray'), L('feet_boots_revised', 'black')] },
});
job({
  id: 'warden', name: 'Warden', skillsetName: 'Wildcraft',
  description: 'Keepers of the old forests who turn the land itself against intruders.',
  abilities: ['tanglevine', 'rockslide', 'riptide', 'dust_devil', 'frostbite', 'wildfire', 'oakheart', 'oakbark', 'attack_boost', 'equip_axes', 'waterwalk'],
  equips: ['axe', 'flail', 'sword', 'clothes', 'hat'],
  mult: st(110, 95, 100, 110, 105), growth: st(10, 11, 100, 45, 50), move: 4, jump: 3, cev: 10, requires: { monk: 3, ranger: 3 },
  outfit: { all: [L('torso_clothes_tunic', 'forest'), L('legs_pants', 'leather'), L('feet_boots_fold', 'brown'), L('cape_tattered', 'brown')] },
});
job({
  id: 'invoker', name: 'Invoker', skillsetName: 'Invocation',
  description: 'Mages who bargain with the oathspirits — vast beings bound by promises older than the realm.',
  abilities: ['ember_wyrm', 'frost_maiden', 'storm_roc', 'stonewarden', 'tidemother', 'greenwind', 'aegis', 'revenant_king', 'solarch', 'mana_shield', 'accrue_jp'],
  equips: ['rod', 'staff', 'robe', 'clothes', 'hat'],
  mult: st(70, 125, 90, 50, 125), growth: st(13, 8, 100, 70, 50), move: 3, jump: 3, cev: 5, requires: { chronomancer: 3, wizard: 4 },
  outfit: { all: [L('torso_clothes_robe', 'dark gray'), L('cape_trim', 'teal', 'yellow'), L('belt_mage'), L('feet_slippers', 'teal')] },
});
job({
  id: 'spellblade', name: 'Spellblade', skillsetName: 'Spellblade',
  description: 'Duellists who etch spells into steel. Elegant, deadly and hard to pin down.',
  abilities: ['flame_edge', 'frost_edge', 'storm_edge', 'holy_edge', 'spell_break', 'silencing_strike', 'aether_blade', 'blade_grasp', 'doublehand'],
  equips: ['sword', 'katana', 'shield', 'armor', 'helm', 'clothes', 'hat'],
  mult: st(100, 80, 100, 115, 100), growth: st(11, 12, 100, 45, 50), move: 3, jump: 3, cev: 15, requires: { knight: 3, wizard: 3 },
  outfit: { all: [L('torso_clothes_longsleeve', 'sky'), L('torso_jacket_tabard', 'navy'), L('legs_pants', 'navy'), L('feet_boots_revised', 'brown'), L('cape_solid', 'blue')] },
});
job({
  id: 'shadowblade', name: 'Shadowblade', skillsetName: 'Shadow Arts',
  description: 'Silent killers trained by the guilds beneath the cities. Two blades, no mercy.',
  abilities: ['kunai', 'firebomb', 'caltrops', 'smoke_veil', 'shadowstep', 'assassinate', 'first_strike', 'dual_wield', 'move_3'],
  equips: ['knife', 'katana', 'throwing', 'clothes', 'hat'],
  mult: st(70, 50, 120, 120, 75), growth: st(12, 13, 80, 43, 50), move: 4, jump: 3, cev: 30, requires: { rogue: 4, lancer: 2, warden: 2 },
  outfit: { all: [L('torso_clothes_longsleeve', 'black'), L('legs_pants', 'black'), L('feet_shoes_revised', 'black'), L('neck_scarf', 'charcoal')] },
});
job({
  id: 'oathbreaker', name: 'Oathbreaker', skillsetName: 'Broken Oaths',
  description: 'Knights who broke a sacred oath and survived the Hollowing. They pay for power in blood.',
  abilities: ['unholy_strike', 'sanguine_edge', 'abyss', 'oath_severed', 'despair_wave', 'final_reckoning', 'bonecrusher', 'equip_knightswords'],
  equips: ['knightsword', 'sword', 'armor', 'helm', 'clothes'],
  mult: st(120, 60, 100, 125, 90), growth: st(10, 14, 100, 40, 50), move: 3, jump: 3, cev: 15, requires: { spellblade: 4, hexer: 4 },
  outfit: { all: [L('torso_clothes_longsleeve', 'black'), L('legs_pants', 'charcoal'), L('feet_boots_basic', 'black'), L('cape_tattered', 'maroon')] },
});

export const JOBS: Record<string, JobDef> = J;

/** Generic jobs in menu order. */
export const GENERIC_JOBS = [
  'squire', 'alchemist', 'knight', 'ranger', 'cleric', 'wizard', 'monk', 'rogue',
  'chronomancer', 'hexer', 'lancer', 'warden', 'invoker', 'spellblade', 'shadowblade', 'oathbreaker',
];

/** JP total needed to reach each job level (index = level − 1). */
export const JOB_LEVEL_JP = [0, 200, 400, 700, 1100, 1600, 2200, 3000];
export const MAX_JOB_LEVEL = JOB_LEVEL_JP.length;

export function jobDef(id: string): JobDef {
  const j = J[id];
  if (!j) throw new Error(`Unknown job: ${id}`);
  return j;
}

export function registerJobs(defs: JobDef[]): void {
  for (const d of defs) J[d.id] = d;
}

export function jobLevelFor(totalJp: number): number {
  let lv = 1;
  for (let i = 0; i < JOB_LEVEL_JP.length; i++) if (totalJp >= JOB_LEVEL_JP[i]) lv = i + 1;
  return lv;
}

/** Action abilities of a job's skillset (excluding passives). */
export function jobActions(jobId: string, abilities: Record<string, { kind: string }>): string[] {
  return jobDef(jobId).abilities.filter((a) => abilities[a]?.kind === 'action');
}
