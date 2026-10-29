/**
 * Every ability in the game, keyed by id. Jobs reference these ids.
 * Balance notes: a mid-game unit has ~100–150 HP; a basic weapon hit lands for
 * 30–50; tier-1 spells ~40–60; tier-3 ~100+.
 */
import type { AbilityDef, Effect, Formula, HitSpec, PassiveSpec, RangeSpec, AoeSpec } from './types';

type ActOpts = Omit<AbilityDef, 'id' | 'name' | 'description' | 'kind' | 'jp'>;

const A: Record<string, AbilityDef> = {};

function act(id: string, name: string, description: string, jp: number, o: ActOpts): void {
  A[id] = { id, name, description, kind: 'action', jp, target: 'any', ...o };
}
function passive(kind: 'reaction' | 'support' | 'movement', id: string, name: string, description: string, jp: number, p: PassiveSpec): void {
  A[id] = { id, name, description, kind, jp, passive: p };
}
const reaction = (id: string, n: string, d: string, jp: number, p: PassiveSpec) => passive('reaction', id, n, d, jp, p);
const support = (id: string, n: string, d: string, jp: number, p: PassiveSpec) => passive('support', id, n, d, jp, p);
const movement = (id: string, n: string, d: string, jp: number, p: PassiveSpec) => passive('movement', id, n, d, jp, p);

// --- shared shapes ---------------------------------------------------------
const SELF: RangeSpec = { type: 'self' };
const WEAPON: RangeSpec = { type: 'weapon' };
const R = (max: number, vertical = 99, min = 0): RangeSpec => ({ type: 'fixed', max, min, vertical });
const AOE = (radius: number, vertical = 2): AoeSpec => ({ radius, vertical });
const EVADE: HitSpec = { kind: 'evadable' };
const ALWAYS: HitSpec = { kind: 'always' };
const PCT = (base: number, stat: 'pa' | 'ma' | 'sp' | 'none' = 'ma', faith = false): HitSpec => ({ kind: 'pct', base, stat, faith });
const dmg = (formula: Formula, extra: Partial<Extract<Effect, { type: 'damage' }>> = {}): Effect =>
  ({ type: 'damage', formula, ...extra } as Effect);
const magicDmg = (q: number, element?: AbilityDef['element']): Effect => ({ type: 'damage', formula: { kind: 'magic', q }, element });
const status = (...s: NonNullable<Extract<Effect, { type: 'addStatus' }>['status']>): Effect => ({ type: 'addStatus', status: s });

// ===========================================================================
// Universal
// ===========================================================================
act('attack', 'Attack', 'Strike with the equipped weapon.', 0, {
  range: WEAPON, target: 'any', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon' }, element: 'weapon' }],
  anim: 'attack', ai: 'damage',
});

// ===========================================================================
// 1. Squire — "Grit"
// ===========================================================================
act('focus', 'Focus', 'Steady your breathing. PA +1 for the battle.', 150, {
  range: SELF, target: 'self', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'pa', amount: 1 }], anim: 'kneel', vfx: 'buff', ai: 'buff',
});
act('rush', 'Rush', 'Shoulder-charge a foe, knocking them back.', 80, {
  range: R(1, 3), target: 'enemy', hit: EVADE, effects: [dmg({ kind: 'stat', stat: 'pa', mul: 2.5 }), { type: 'knockback' }], anim: 'attack', sfx: 'blunt', ai: 'damage',
});
act('throw_stone', 'Throw Stone', 'Hurl a stone. Weak, but reaches far and can knock back.', 90, {
  range: R(4), target: 'enemy', hit: EVADE, effects: [dmg({ kind: 'stat', stat: 'pa', mul: 1.5 }), { type: 'knockback' }], anim: 'throw', vfx: 'stone', ai: 'damage',
});
act('field_dressing', 'Field Dressing', 'Bind wounds: restores HP and cures Poison and Blind.', 150, {
  range: R(1, 3), target: 'ally', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'stat', stat: 'pa', mul: 4 } }, { type: 'removeStatus', status: ['poison', 'blind'] }], anim: 'item', vfx: 'heal', ai: 'heal',
});
act('rally', 'Rally', 'A rousing shout. Target ally gains Speed +1.', 200, {
  range: R(3), target: 'ally', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'sp', amount: 1 }], anim: 'victory', vfx: 'buff', ai: 'buff',
});
act('stand_firm', 'Stand Firm', 'Remind an ally of their oath. Brave +8.', 200, {
  range: R(3), target: 'ally', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'brave', amount: 8 }], anim: 'victory', vfx: 'buff', ai: 'buff',
});
act('second_wind', 'Second Wind', 'Recover 30% of max HP. Usable once you are critical.', 300, {
  range: SELF, target: 'self', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'pctMax', pct: 30 } }], anim: 'kneel', vfx: 'heal', ai: 'heal',
});
reaction('counter_tackle', 'Counter Tackle', 'When struck in melee, slam the attacker back.', 180, { kind: 'counterTackle' });
support('jp_boost', 'JP Boost', 'Earn 50% more JP.', 250, { kind: 'jpBoost' });
support('exp_boost', 'EXP Boost', 'Earn 50% more EXP.', 350, { kind: 'expBoost' });
movement('move_1', 'Move +1', 'Move one extra tile.', 200, { kind: 'move', amount: 1 });

// ===========================================================================
// 2. Alchemist — "Alchemy" (consumes party items)
// ===========================================================================
const itemAct = (id: string, name: string, desc: string, jp: number, item: string, ai: AbilityDef['ai'], ko = false) =>
  act(id, name, desc, jp, { range: R(1, 99), target: ko ? 'ko' : 'ally', targetsKO: ko, hit: ALWAYS, consumes: item, effects: [{ type: 'useItem' }], anim: 'item', vfx: 'item', ai });
itemAct('use_potion', 'Potion', 'Use a Potion: restore 30 HP.', 30, 'potion', 'heal');
itemAct('use_hi_potion', 'Hi-Potion', 'Use a Hi-Potion: restore 70 HP.', 200, 'hi_potion', 'heal');
itemAct('use_x_potion', 'X-Potion', 'Use an X-Potion: restore 150 HP.', 300, 'x_potion', 'heal');
itemAct('use_ether', 'Ether', 'Use an Ether: restore 20 MP.', 300, 'ether', 'heal');
itemAct('use_hi_ether', 'Hi-Ether', 'Use a Hi-Ether: restore 50 MP.', 400, 'hi_ether', 'heal');
itemAct('use_elixir', 'Elixir', 'Use an Elixir: fully restore HP and MP.', 900, 'elixir', 'heal');
itemAct('use_antidote', 'Antidote', 'Use an Antidote: cure Poison.', 70, 'antidote', 'utility');
itemAct('use_eye_drops', 'Eye Drops', 'Use Eye Drops: cure Blind.', 80, 'eye_drops', 'utility');
itemAct('use_echo_herbs', 'Echo Herbs', 'Use Echo Herbs: cure Silence.', 120, 'echo_herbs', 'utility');
itemAct('use_gold_needle', 'Gold Needle', 'Use a Gold Needle: cure Stone.', 150, 'gold_needle', 'utility');
itemAct('use_holy_water', 'Holy Water', 'Use Holy Water: cure Undead and Doom; sears the restless dead.', 200, 'holy_water', 'utility');
itemAct('use_remedy', 'Remedy', 'Use a Remedy: cure most ailments.', 350, 'remedy', 'utility');
itemAct('use_phoenix_down', 'Phoenix Down', 'Use a Phoenix Down: revive a fallen ally with some HP.', 90, 'phoenix_down', 'revive', true);
reaction('auto_potion', 'Auto-Potion', 'When damaged, drink the best potion carried.', 400, { kind: 'autoPotion' });
support('throw_items', 'Throw Items', 'Items can be thrown up to 4 tiles.', 350, { kind: 'throwItems' });
support('medicine', 'Medicine', 'Restorative items are 50% more effective.', 300, { kind: 'medicine' });
support('safeguard', 'Safeguard', 'Equipment cannot be broken or stolen.', 250, { kind: 'safeguard' });
movement('accrue_exp', 'Accrue EXP', 'Gain EXP for each tile moved.', 400, { kind: 'accrueExp' });

// ===========================================================================
// 3. Knight — "Arms"
// ===========================================================================
const rend = (id: string, name: string, desc: string, jp: number, effects: Effect[], base = 45) =>
  act(id, name, desc, jp, { range: WEAPON, target: 'enemy', hit: PCT(base, 'pa'), weaponBased: true, effects, anim: 'attack', vfx: 'rend', ai: 'debuff' });
rend('rend_helm', 'Rend Helm', 'Shatter the target\'s headgear.', 250, [{ type: 'break', slot: 'head' }]);
rend('rend_armor', 'Rend Armour', 'Shatter the target\'s body armour.', 300, [{ type: 'break', slot: 'body' }], 40);
rend('rend_shield', 'Rend Shield', 'Shatter the target\'s shield.', 200, [{ type: 'break', slot: 'off' }]);
rend('rend_weapon', 'Rend Weapon', 'Shatter the target\'s weapon.', 300, [{ type: 'break', slot: 'main' }], 35);
rend('rend_power', 'Rend Power', 'Sap the target\'s strength. PA −3.', 250, [{ type: 'modStat', stat: 'pa', amount: -3 }], 50);
rend('rend_magic', 'Rend Magick', 'Sap the target\'s magick. MA −3.', 250, [{ type: 'modStat', stat: 'ma', amount: -3 }], 50);
rend('rend_speed', 'Rend Speed', 'Hobble the target. Speed −2.', 250, [{ type: 'modStat', stat: 'sp', amount: -2 }], 50);
act('rend_mp', 'Rend MP', 'Strike the target\'s mana instead of flesh.', 200, {
  range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.6 }, mp: true }], anim: 'attack', ai: 'damage',
});
act('shield_bash', 'Shield Bash', 'Strike with your shield: damage and a chance to Disable.', 300, {
  range: R(1, 3), target: 'enemy', hit: EVADE, effects: [dmg({ kind: 'stat', stat: 'pa', mul: 3 }), { type: 'addStatus', status: ['disable'], chance: 40 }], anim: 'attack', sfx: 'blunt', ai: 'damage',
});
reaction('parry', 'Parry', 'Brave% chance to deflect physical attacks with your weapon.', 200, { kind: 'parry' });
support('equip_heavy', 'Equip Heavy Armour', 'Wear armour and helms in any job.', 500, { kind: 'equip', categories: ['armor', 'helm'] });
support('equip_shield', 'Equip Shields', 'Carry shields in any job.', 250, { kind: 'equip', categories: ['shield'] });
support('equip_swords', 'Equip Swords', 'Wield swords in any job.', 350, { kind: 'equip', categories: ['sword'] });

// ===========================================================================
// 4. Ranger — "Aim"
// ===========================================================================
const aim = (id: string, name: string, desc: string, jp: number, speed: number, mul: number) =>
  act(id, name, desc, jp, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, requiresWeapon: ['bow', 'crossbow'], speed, effects: [{ type: 'damage', formula: { kind: 'weapon', mul }, element: 'weapon' }], anim: 'shoot', ai: 'damage' });
aim('aim_1', 'Aim +1', 'A careful shot: 120% damage. Brief charge.', 100, 50, 1.2);
aim('aim_2', 'Aim +2', 'A patient shot: 140% damage.', 150, 34, 1.4);
aim('aim_3', 'Aim +3', 'A measured shot: 170% damage.', 220, 25, 1.7);
aim('aim_5', 'Aim +5', 'A hunter\'s shot: 220% damage. Long charge.', 380, 17, 2.2);
aim('aim_10', 'Aim +10', 'Wait for the perfect moment: 320% damage.', 700, 10, 3.2);
act('pinning_shot', 'Pinning Shot', 'Shoot at the feet: light damage and Immobilize.', 250, {
  range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, requiresWeapon: ['bow', 'crossbow'], effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.6 } }, { type: 'addStatus', status: ['immobilize'], chance: 75 }], anim: 'shoot', ai: 'debuff',
});
act('blinding_shot', 'Blinding Shot', 'Aim for the eyes: light damage and Blind.', 250, {
  range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, requiresWeapon: ['bow', 'crossbow'], effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.6 } }, { type: 'addStatus', status: ['blind'], chance: 70 }], anim: 'shoot', ai: 'debuff',
});
act('arrow_rain', 'Arrow Rain', 'Loose a volley over an area.', 450, {
  range: WEAPON, aoe: AOE(1, 3), target: 'tile', affects: 'any', hit: EVADE, weaponBased: true, requiresWeapon: ['bow'], speed: 25, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.8 } }], anim: 'shoot', vfx: 'arrows', ai: 'damage',
});
reaction('arrow_guard', 'Arrow Guard', 'Brave% chance to dodge arrows, bolts and thrown weapons.', 250, { kind: 'arrowGuard' });
support('concentrate', 'Concentrate', 'Your attacks ignore evasion.', 400, { kind: 'concentrate' });
support('equip_bows', 'Equip Bows', 'Wield bows and crossbows in any job.', 350, { kind: 'equip', categories: ['bow', 'crossbow'] });
movement('jump_1', 'Jump +1', 'Jump one level higher.', 200, { kind: 'jump', amount: 1 });

// ===========================================================================
// 5. Cleric — "White Magick"
// ===========================================================================
const cleric = (id: string, name: string, desc: string, jp: number, o: ActOpts) =>
  act(id, name, desc, jp, { magic: true, reflectable: true, anim: 'cast', ...o });
cleric('cure', 'Cure', 'Restore a little HP in a small area.', 50, { mp: 6, speed: 25, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'any', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'magic', q: 14 } }], vfx: 'cure', ai: 'heal' });
cleric('cura', 'Cura', 'Restore moderate HP in a small area.', 180, { mp: 10, speed: 20, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'any', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'magic', q: 20 } }], vfx: 'cure', ai: 'heal' });
cleric('curaga', 'Curaga', 'Restore much HP in a small area.', 400, { mp: 16, speed: 15, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'any', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'magic', q: 28 } }], vfx: 'cure_big', ai: 'heal' });
cleric('curaja', 'Curaja', 'Restore great HP across a wide area.', 700, { mp: 22, speed: 10, range: R(4), aoe: AOE(2, 3), target: 'tile', affects: 'any', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'magic', q: 34 } }], vfx: 'cure_big', ai: 'heal' });
cleric('raise', 'Raise', 'Revive a fallen ally with half HP.', 180, { mp: 10, speed: 25, range: R(4), target: 'ko', targetsKO: true, hit: PCT(180, 'ma', true), effects: [{ type: 'revive', pct: 50 }], vfx: 'raise', ai: 'revive' });
cleric('arise', 'Arise', 'Revive a fallen ally with full HP.', 500, { mp: 20, speed: 10, range: R(4), target: 'ko', targetsKO: true, hit: PCT(160, 'ma', true), effects: [{ type: 'revive', pct: 100 }], vfx: 'raise', ai: 'revive' });
cleric('regen', 'Regen', 'Grant Regen: recover HP each turn.', 300, { mp: 8, speed: 34, range: R(3), target: 'ally', hit: ALWAYS, effects: [status('regen')], vfx: 'buff', ai: 'buff' });
cleric('protect', 'Protect', 'Grant Protect to a small area.', 70, { mp: 6, speed: 34, range: R(3), aoe: AOE(1, 1), target: 'tile', affects: 'ally', hit: ALWAYS, effects: [status('protect')], vfx: 'protect', ai: 'buff' });
cleric('shell', 'Shell', 'Grant Shell to a small area.', 70, { mp: 6, speed: 34, range: R(3), aoe: AOE(1, 1), target: 'tile', affects: 'ally', hit: ALWAYS, effects: [status('shell')], vfx: 'shell', ai: 'buff' });
cleric('esuna', 'Esuna', 'Cleanse ailments in a small area.', 280, { mp: 18, speed: 34, range: R(3), aoe: AOE(1, 1), target: 'tile', affects: 'ally', hit: PCT(190, 'ma', true), effects: [{ type: 'removeStatus', status: ['poison', 'blind', 'silence', 'petrify', 'confuse', 'berserk', 'sleep', 'immobilize', 'disable', 'slow', 'doom', 'charm', 'oil'] }], vfx: 'esuna', ai: 'utility' });
cleric('holy', 'Holy', 'Call down searing light on one foe.', 600, { mp: 56, speed: 17, range: R(5), target: 'enemy', hit: ALWAYS, element: 'holy', effects: [magicDmg(50, 'holy')], vfx: 'holy', ai: 'damage' });
reaction('regenerator', 'Regenerator', 'When damaged, gain Regen.', 400, { kind: 'regenerator' });
support('healing_boost', 'Healing Boost', 'Healing you cast is 33% stronger.', 300, { kind: 'magicBoostHeal' });
support('arcane_defense', 'Arcane Defence', 'Magick damage taken −33%.', 400, { kind: 'arcaneDefense' });

// ===========================================================================
// 6. Wizard — "Black Magick"
// ===========================================================================
const wiz = (id: string, name: string, desc: string, jp: number, o: ActOpts) =>
  act(id, name, desc, jp, { magic: true, reflectable: true, anim: 'cast', target: 'tile', affects: 'any', hit: ALWAYS, ...o });
for (const [el, names, vfx] of [
  ['fire', ['Fire', 'Fira', 'Firaga'], 'fire'],
  ['ice', ['Blizzard', 'Blizzara', 'Blizzaga'], 'ice'],
  ['lightning', ['Thunder', 'Thundara', 'Thundaga'], 'thunder'],
] as const) {
  const base = names[0].toLowerCase();
  wiz(base, names[0], `Strike a small area with ${el}.`, 50, { mp: 6, speed: 25, range: R(4), aoe: AOE(1, 1), element: el, effects: [magicDmg(14, el)], vfx, ai: 'damage' });
  wiz(names[1].toLowerCase(), names[1], `Strike a small area with fiercer ${el}.`, 200, { mp: 12, speed: 20, range: R(4), aoe: AOE(1, 2), element: el, effects: [magicDmg(19, el)], vfx, ai: 'damage' });
  wiz(names[2].toLowerCase(), names[2], `Engulf a wide area in ${el}.`, 500, { mp: 24, speed: 15, range: R(4), aoe: AOE(2, 3), element: el, effects: [magicDmg(25, el)], vfx: vfx + '_big', ai: 'damage' });
}
wiz('poison_spell', 'Toxin', 'Envelop a small area in noxious vapour: Poison.', 150, { mp: 6, speed: 34, range: R(4), aoe: AOE(1, 1), hit: PCT(160, 'ma', true), effects: [status('poison')], vfx: 'poison', ai: 'debuff' });
wiz('flare', 'Flare', 'Annihilating heat on a single target.', 900, { mp: 60, speed: 15, range: R(5), aoe: AOE(0, 0), effects: [magicDmg(46)], vfx: 'flare', ai: 'damage' });
reaction('magick_counter', 'Magick Counter', 'When hit by a spell, cast it back at the caster.', 800, { kind: 'counterMagic' });
support('arcane_strength', 'Arcane Strength', 'Magick damage dealt +33%.', 400, { kind: 'arcaneStrength' });
movement('manafont', 'Manafont', 'Recover MP for each tile moved.', 350, { kind: 'manafont' });

// ===========================================================================
// 7. Monk — "Martial Arts" (unarmed formulas)
// ===========================================================================
act('cyclone', 'Cyclone', 'A spinning kick that strikes all around you.', 150, { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'any', hit: EVADE, effects: [dmg({ kind: 'fist', mul: 0.55 })], anim: 'attack', vfx: 'wind', ai: 'damage' });
act('pummel', 'Pummel', 'A flurry of blows. Damage varies wildly.', 300, { range: R(1, 3), target: 'enemy', hit: EVADE, variance: 0.6, effects: [dmg({ kind: 'fist', mul: 1.0 })], anim: 'attack', vfx: 'hit_multi', ai: 'damage' });
act('aura_blast', 'Aura Blast', 'Project your spirit as a blast at range.', 300, { range: R(3), target: 'enemy', hit: EVADE, effects: [dmg({ kind: 'fist', mul: 0.7 })], anim: 'cast', vfx: 'aura', ai: 'damage' });
act('shockwave', 'Shockwave', 'Split the earth in a line before you.', 600, { range: R(8, 99, 1), aoe: { radius: 8, vertical: 4, shape: 'line' }, target: 'tile', affects: 'any', element: 'earth', hit: EVADE, effects: [dmg({ kind: 'fist', mul: 0.6 }, { element: 'earth' })], anim: 'attack', vfx: 'earth', ai: 'damage' });
act('chakra', 'Chakra', 'Channel inner energy: restore HP and MP around you.', 350, { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'ally', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'stat', stat: 'pa', mul: 5 } }, { type: 'heal', formula: { kind: 'stat', stat: 'pa', mul: 2.5 }, mp: true }], anim: 'kneel', vfx: 'heal', ai: 'heal' });
act('purify', 'Purify', 'Cleanse an adjacent ally of ailments.', 200, { range: R(1, 3), target: 'ally', hit: ALWAYS, effects: [{ type: 'removeStatus', status: ['poison', 'blind', 'silence', 'petrify', 'confuse', 'berserk', 'sleep', 'immobilize', 'disable', 'slow', 'doom', 'oil'] }], anim: 'item', vfx: 'esuna', ai: 'utility' });
act('revive_monk', 'Revive', 'Pound life back into a fallen ally.', 500, { range: R(1, 3), target: 'ko', targetsKO: true, hit: PCT(70, 'pa'), effects: [{ type: 'revive', pct: 20 }], anim: 'attack', vfx: 'raise', ai: 'revive' });
act('doom_fist', 'Doom Fist', 'A strike to a fatal meridian. Inflicts Doom.', 300, { range: R(1, 3), target: 'enemy', hit: PCT(40, 'pa'), effects: [status('doom')], anim: 'attack', vfx: 'dark', ai: 'debuff' });
reaction('counter', 'Counter', 'Brave% chance to strike back when hit in melee.', 300, { kind: 'counter' });
support('brawler', 'Brawler', 'Unarmed attacks hit much harder.', 200, { kind: 'brawler' });
support('defense_boost', 'Defence Boost', 'Physical damage taken −33%.', 400, { kind: 'defenseBoost' });
movement('lifefont', 'Lifefont', 'Recover HP for each tile moved.', 300, { kind: 'lifefont' });

// ===========================================================================
// 8. Rogue — "Thievery"
// ===========================================================================
const steal = (id: string, name: string, desc: string, jp: number, slot: Extract<Effect, { type: 'steal' }>['slot'], base: number) =>
  act(id, name, desc, jp, { range: R(1, 3), target: 'enemy', hit: PCT(base, 'sp'), effects: [{ type: 'steal', slot }], anim: 'item', vfx: 'steal', ai: 'utility', ignoreFacing: false });
steal('steal_gil', 'Steal Gil', 'Lift coin from a foe\'s purse.', 10, 'gil', 70);
steal('steal_weapon', 'Steal Weapon', 'Snatch the foe\'s weapon.', 300, 'main', 30);
steal('steal_shield', 'Steal Shield', 'Snatch the foe\'s shield.', 150, 'off', 40);
steal('steal_helm', 'Steal Helm', 'Snatch the foe\'s headgear.', 200, 'head', 40);
steal('steal_armor', 'Steal Armour', 'Snatch the foe\'s armour.', 300, 'body', 30);
steal('steal_accessory', 'Steal Accessory', 'Snatch the foe\'s accessory.', 350, 'accessory', 35);
steal('steal_exp', 'Steal EXP', 'Steal experience itself.', 250, 'exp', 70);
act('beguile', 'Beguile', 'A winning smile. Charms the target.', 200, { range: R(3), target: 'enemy', hit: PCT(40, 'ma'), effects: [status('charm')], anim: 'victory', vfx: 'charm', ai: 'debuff' });
act('cheap_shot', 'Cheap Shot', 'Strike where it hurts. Always lands as if from behind.', 300, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, ignoreFacing: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.1 }, element: 'weapon' }], anim: 'attack', ai: 'damage' });
reaction('gil_snapper', 'Gil Snapper', 'When hit, pocket gil equal to the damage.', 200, { kind: 'gilSnapper' });
reaction('reflexes', 'Reflexes', 'Your evasion is doubled when reacting.', 400, { kind: 'reflexes' });
support('evasive_stance', 'Evasive Stance', 'Evasion +10% at all times.', 350, { kind: 'evasiveStance' });
movement('move_2', 'Move +2', 'Move two extra tiles.', 520, { kind: 'move', amount: 2 });
movement('jump_2', 'Jump +2', 'Jump two levels higher.', 480, { kind: 'jump', amount: 2 });

// ===========================================================================
// 9. Chronomancer — "Time Magick"
// ===========================================================================
const time = (id: string, name: string, desc: string, jp: number, o: ActOpts) =>
  act(id, name, desc, jp, { magic: true, reflectable: true, anim: 'cast', vfx: 'time', ...o });
time('haste', 'Haste', 'Quicken one ally: Speed ×1.5.', 100, { mp: 8, speed: 50, range: R(3), target: 'ally', hit: ALWAYS, effects: [status('haste')], ai: 'buff' });
time('hasteja', 'Hasteja', 'Quicken allies in an area.', 600, { mp: 30, speed: 15, range: R(3), aoe: AOE(1, 2), target: 'tile', affects: 'ally', hit: ALWAYS, effects: [status('haste')], ai: 'buff' });
time('slow', 'Slow', 'Weigh down one foe: Speed ×0.5.', 80, { mp: 8, speed: 50, range: R(4), target: 'enemy', hit: PCT(180, 'ma', true), effects: [status('slow')], ai: 'debuff' });
time('slowja', 'Slowja', 'Slow foes in an area.', 600, { mp: 30, speed: 15, range: R(4), aoe: AOE(1, 2), target: 'tile', affects: 'enemy', hit: PCT(150, 'ma', true), effects: [status('slow')], ai: 'debuff' });
time('stop', 'Stop', 'Freeze a foe in time.', 330, { mp: 14, speed: 15, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'enemy', hit: PCT(110, 'ma', true), effects: [status('stop')], ai: 'debuff' });
time('immobilize_spell', 'Bind', 'Root a foe to the spot.', 100, { mp: 10, speed: 34, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'enemy', hit: PCT(190, 'ma', true), effects: [status('immobilize')], ai: 'debuff' });
time('float', 'Float', 'Lift allies in an area off the ground.', 200, { mp: 8, speed: 34, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'ally', hit: ALWAYS, effects: [status('float')], ai: 'buff' });
time('reflect', 'Reflect', 'Wrap an ally in a spell-reflecting ward.', 300, { mp: 12, speed: 50, range: R(4), target: 'ally', hit: ALWAYS, effects: [status('reflect')], ai: 'buff' });
time('quick', 'Quick', 'The target acts next, immediately.', 800, { mp: 24, speed: 25, range: R(4), target: 'allyNotSelf', hit: ALWAYS, effects: [{ type: 'gainCT', amount: 100 }], ai: 'buff', reflectable: false });
time('gravity', 'Gravity', 'Crush a foe: removes 1/4 of current HP.', 250, { mp: 24, speed: 17, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'enemy', hit: PCT(140, 'ma', true), effects: [{ type: 'damage', formula: { kind: 'pctCurrent', pct: 25 }, ignoreDefense: true }], vfx: 'gravity', ai: 'damage' });
time('graviga', 'Graviga', 'Crush foes: removes 1/2 of current HP.', 550, { mp: 50, speed: 10, range: R(4), aoe: AOE(1, 2), target: 'tile', affects: 'enemy', hit: PCT(120, 'ma', true), effects: [{ type: 'damage', formula: { kind: 'pctCurrent', pct: 50 }, ignoreDefense: true }], vfx: 'gravity', ai: 'damage' });
time('meteor', 'Meteor', 'Call stars down upon a huge area.', 1500, { mp: 70, speed: 10, range: R(5), aoe: AOE(3, 4), target: 'tile', affects: 'any', hit: ALWAYS, reflectable: false, effects: [magicDmg(55)], vfx: 'meteor', ai: 'damage' });
reaction('critical_quick', 'Critical: Quick', 'When reduced to critical HP, act immediately.', 800, { kind: 'criticalQuick' });
support('swiftness', 'Swiftness', 'Charged actions resolve twice as fast.', 1000, { kind: 'swiftness' });
movement('teleport', 'Teleport', 'Blink to any tile within Move +2, ignoring height and obstacles.', 650, { kind: 'teleport' });
movement('float_move', 'Levitate', 'Permanently Float: cross water, ignore descending height.', 540, { kind: 'float' });

// ===========================================================================
// 10. Hexer — "Hexes"
// ===========================================================================
const hex = (id: string, name: string, desc: string, jp: number, base: number, effects: Effect[], o: Partial<ActOpts> = {}) =>
  act(id, name, desc, jp, { magic: true, reflectable: true, mp: 10, speed: 34, range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'enemy', hit: PCT(base, 'ma', true), effects, anim: 'cast', vfx: 'hex', ai: 'debuff', ...o });
hex('blind_spell', 'Umbra', 'Veil foes\' eyes in darkness: Blind.', 100, 200, [status('blind')]);
hex('silence_spell', 'Hush', 'Steal foes\' voices: Silence.', 170, 170, [status('silence')]);
hex('sleep_spell', 'Slumber', 'Send foes into a deep sleep.', 350, 170, [status('sleep')], { mp: 16 });
hex('confuse_spell', 'Bewilder', 'Scramble foes\' senses: Confuse.', 400, 130, [status('confuse')], { mp: 18 });
hex('berserk_spell', 'Fury', 'Fill a foe with mindless rage: Berserk.', 400, 140, [status('berserk')], { aoe: AOE(0, 0), mp: 16 });
hex('doom_spell', 'Death Sentence', 'Mark a foe for death: Doom.', 500, 100, [status('doom')], { aoe: AOE(0, 0), mp: 24 });
hex('petrify_spell', 'Stone Curse', 'Turn a foe to stone.', 600, 110, [status('petrify')], { aoe: AOE(0, 0), mp: 20, speed: 25 });
hex('enthrall', 'Enthrall', 'Bind a foe\'s will to yours: Charm.', 300, 120, [status('charm')], { aoe: AOE(0, 0), mp: 20 });
hex('despair', 'Despair', 'Whisper doubts: Brave −15.', 200, 160, [{ type: 'modStat', stat: 'brave', amount: -15 }], { aoe: AOE(0, 0), mp: 8 });
hex('leech', 'Leech', 'Drain a foe\'s life into your own.', 300, 0, [{ type: 'damage', formula: { kind: 'magic', q: 18 }, drain: true, element: 'dark' }], { aoe: AOE(0, 0), mp: 14, hit: ALWAYS, ai: 'damage', vfx: 'drain' });
hex('siphon', 'Siphon', 'Drain a foe\'s mana into your own.', 250, 0, [{ type: 'damage', formula: { kind: 'magic', q: 10 }, mp: true, drain: true }], { aoe: AOE(0, 0), mp: 0, hit: ALWAYS, ai: 'damage', vfx: 'drain' });
reaction('absorb_mp', 'Absorb MP', 'Gain MP equal to the cost of spells cast on you.', 250, { kind: 'absorbMp' });
support('halve_mp', 'Halve MP', 'Spells cost half MP.', 900, { kind: 'halveMp' });

// ===========================================================================
// 11. Lancer — "Jump"
// ===========================================================================
const jumpAct = (id: string, name: string, desc: string, jp: number, max: number, speed: number, mul: number, radius = 0) =>
  act(id, name, desc, jp, { range: R(max, 99, 1), aoe: radius ? AOE(radius, 3) : undefined, target: 'tile', affects: 'any', hit: EVADE, jump: true, speed, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul }, element: 'weapon' }], anim: 'jump', vfx: 'jump', ai: 'damage', noReaction: true });
jumpAct('jump', 'Jump', 'Leap into the sky and crash down 2 tiles away. You cannot be targeted while airborne.', 150, 2, 34, 1.5);
jumpAct('long_jump', 'Long Jump', 'A great leap of up to 4 tiles.', 350, 4, 25, 1.5);
jumpAct('high_jump', 'High Jump', 'A towering leap that strikes harder.', 450, 3, 20, 2.0);
jumpAct('dragon_dive', 'Dragon Dive', 'Crash down and shatter the ground around the target.', 700, 3, 17, 1.4, 1);
act('impale', 'Impale', 'Thrust through two foes in a line.', 250, { range: R(1, 3), aoe: { radius: 2, vertical: 3, shape: 'line' }, target: 'tile', affects: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.15 }, element: 'weapon' }], anim: 'thrust', ai: 'damage' });
reaction('dragonheart', 'Dragonheart', 'When struck, Brave% chance to gain Reraise.', 600, { kind: 'dragonheart' });
support('equip_polearms', 'Equip Polearms', 'Wield spears in any job.', 400, { kind: 'equip', categories: ['spear'] });
movement('ignore_height', 'Ignore Height', 'Climb and descend any height.', 700, { kind: 'ignoreHeight' });

// ===========================================================================
// 12. Warden — "Wildcraft" (terrain-dependent)
// ===========================================================================
const wild = (id: string, name: string, desc: string, jp: number, terrain: string[], element: AbilityDef['element'], extra: Effect[]) =>
  act(id, name, desc, jp, { range: R(5), aoe: AOE(1, 2), target: 'tile', affects: 'enemy', hit: ALWAYS, terrain, element, effects: [{ type: 'damage', formula: { kind: 'mix', a: 'pa', b: 'ma', mul: 4 }, element }, ...extra], anim: 'cast', vfx: 'wild_' + element, ai: 'damage' });
wild('tanglevine', 'Tanglevine', 'Grass and roots seize foes. Requires grass.', 150, ['grass', 'tallgrass'], 'earth', [{ type: 'addStatus', status: ['immobilize'], chance: 30 }]);
wild('rockslide', 'Rockslide', 'Stone heaves up from below. Requires stone or road.', 150, ['stone', 'road', 'brick', 'cave', 'roof'], 'earth', [{ type: 'addStatus', status: ['disable'], chance: 20 }]);
wild('riptide', 'Riptide', 'The water rises and drags. Requires water or marsh.', 150, ['water', 'swamp', 'deepwater'], 'water', [{ type: 'addStatus', status: ['slow'], chance: 30 }]);
wild('dust_devil', 'Dust Devil', 'A whirl of grit blinds foes. Requires sand or dirt.', 150, ['sand', 'dirt'], 'wind', [{ type: 'addStatus', status: ['blind'], chance: 35 }]);
wild('frostbite', 'Frostbite', 'Snow bites to the bone. Requires snow.', 150, ['snow'], 'ice', [{ type: 'addStatus', status: ['slow'], chance: 30 }]);
wild('wildfire', 'Wildfire', 'Dry timber catches flame. Requires planks or tall grass.', 200, ['wood', 'tallgrass', 'roof'], 'fire', [{ type: 'addStatus', status: ['oil'], chance: 25 }]);
act('oakheart', 'Oakheart', 'Take root: gain Protect and Regen.', 300, { range: SELF, target: 'self', hit: ALWAYS, effects: [status('protect', 'regen')], anim: 'kneel', vfx: 'buff', ai: 'buff' });
reaction('oakbark', 'Oakbark', 'When struck, brace: evasion doubled until your next turn.', 250, { kind: 'vigilance' });
support('attack_boost', 'Attack Boost', 'Physical damage dealt +33%.', 400, { kind: 'attackBoost' });
support('equip_axes', 'Equip Axes', 'Wield axes and flails in any job.', 250, { kind: 'equip', categories: ['axe', 'flail'] });
movement('waterwalk', 'Waterwalk', 'Walk on water and marsh at full pace.', 300, { kind: 'waterwalk' });

// ===========================================================================
// 13. Invoker — "Invocation" (summons hit only foes / heal only friends)
// ===========================================================================
const summon = (id: string, name: string, desc: string, jp: number, mp: number, speed: number, effects: Effect[], o: Partial<ActOpts> = {}) =>
  act(id, name, desc, jp, { magic: true, mp, speed, range: R(4), aoe: AOE(2, 3), target: 'tile', affects: 'enemy', hit: ALWAYS, effects, anim: 'cast', vfx: 'summon_' + id, ai: 'damage', ...o });
summon('ember_wyrm', 'Ember Wyrm', 'A wyrm of living flame breathes on your foes.', 200, 24, 25, [magicDmg(24, 'fire')], { element: 'fire' });
summon('frost_maiden', 'Frost Maiden', 'The Maiden\'s sigh freezes your foes.', 280, 30, 20, [magicDmg(26, 'ice')], { element: 'ice' });
summon('storm_roc', 'Storm Roc', 'A roc of thunderheads strikes from above.', 300, 30, 20, [magicDmg(28, 'lightning')], { element: 'lightning' });
summon('stonewarden', 'Stonewarden', 'An ancient guardian stamps the earth.', 350, 34, 17, [magicDmg(30, 'earth')], { element: 'earth' });
summon('tidemother', 'Tidemother', 'The sea rises at her call.', 500, 40, 15, [magicDmg(34, 'water')], { element: 'water' });
summon('greenwind', 'Greenwind', 'A gentle spirit restores your allies.', 300, 26, 20, [{ type: 'heal', formula: { kind: 'magic', q: 20 } }], { affects: 'ally', ai: 'heal' });
summon('aegis', 'Aegis', 'A shining shield spirit grants Protect and Shell.', 400, 30, 20, [status('protect', 'shell')], { affects: 'ally', ai: 'buff' });
summon('revenant_king', 'Revenant King', 'The drowned king of oaths unkept reaches up.', 650, 48, 12, [magicDmg(36, 'dark'), { type: 'addStatus', status: ['doom'], chance: 15 }], { element: 'dark' });
summon('solarch', 'Solarch', 'The sun-sovereign passes judgement.', 1000, 70, 10, [magicDmg(42, 'holy')], { element: 'holy', aoe: AOE(3, 4) });
reaction('mana_shield', 'Mana Shield', 'Damage is taken from MP before HP.', 400, { kind: 'manaShield' });
movement('accrue_jp', 'Accrue JP', 'Gain JP for each tile moved.', 400, { kind: 'accrueJp' });

// ===========================================================================
// 14. Spellblade — "Spellblade" (elemental weapon arts, physical)
// ===========================================================================
const edge = (id: string, name: string, desc: string, jp: number, element: AbilityDef['element'], mul: number, extra: Effect[] = [], o: Partial<ActOpts> = {}) =>
  act(id, name, desc, jp, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, element, effects: [{ type: 'damage', formula: { kind: 'weapon', mul }, element }, ...extra], anim: 'attack', vfx: 'edge_' + element, ai: 'damage', ...o });
edge('flame_edge', 'Flame Edge', 'Wreathe your blade in fire.', 200, 'fire', 1.2);
edge('frost_edge', 'Frost Edge', 'Rime your blade with ice; may Slow.', 200, 'ice', 1.1, [{ type: 'addStatus', status: ['slow'], chance: 25 }]);
edge('storm_edge', 'Storm Edge', 'Charge your blade with lightning; may Disable.', 200, 'lightning', 1.1, [{ type: 'addStatus', status: ['disable'], chance: 20 }]);
edge('holy_edge', 'Holy Edge', 'A sanctified strike that reaches two tiles.', 500, 'holy', 1.35, [], { range: R(2, 3) });
act('spell_break', 'Spell Break', 'Cut through a foe\'s mana.', 300, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.8 }, mp: true }], anim: 'attack', vfx: 'edge_none', ai: 'damage' });
act('silencing_strike', 'Silencing Strike', 'A strike to the throat: damage and Silence.', 300, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.8 } }, { type: 'addStatus', status: ['silence'], chance: 60 }], anim: 'attack', vfx: 'edge_none', ai: 'debuff' });
act('aether_blade', 'Aether Blade', 'Send a cutting wave down a line 3 tiles long.', 400, { range: R(1, 4), aoe: { radius: 3, vertical: 3, shape: 'line' }, target: 'tile', affects: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.0 } }], anim: 'attack', vfx: 'wave', ai: 'damage' });
reaction('blade_grasp', 'Blade Grasp', 'Brave% chance to catch any physical attack, even arrows.', 700, { kind: 'shirahadori' });
support('doublehand', 'Doublehand', 'Grip a one-handed weapon with both hands: double damage.', 900, { kind: 'doublehand' });

// ===========================================================================
// 15. Shadowblade — "Shadow Arts"
// ===========================================================================
act('kunai', 'Kunai', 'Throw a blade at range. Damage scales with Speed.', 100, { range: R(4), target: 'enemy', hit: EVADE, effects: [dmg({ kind: 'stat', stat: 'sp', mul: 4 })], anim: 'throw', vfx: 'kunai', ai: 'damage' });
act('firebomb', 'Firebomb', 'A burst of fire over a small area.', 250, { range: R(4), aoe: AOE(1, 2), target: 'tile', affects: 'any', element: 'fire', hit: ALWAYS, effects: [dmg({ kind: 'stat', stat: 'sp', mul: 3.5 }, { element: 'fire' })], anim: 'throw', vfx: 'fire', ai: 'damage' });
act('caltrops', 'Caltrops', 'Scatter spikes: damage and Immobilize.', 200, { range: R(4), aoe: AOE(1, 1), target: 'tile', affects: 'enemy', hit: PCT(60, 'sp'), effects: [dmg({ kind: 'stat', stat: 'sp', mul: 1.5 }), status('immobilize')], anim: 'throw', vfx: 'caltrops', ai: 'debuff' });
act('smoke_veil', 'Smoke Veil', 'Vanish in smoke. You cannot be targeted until you act.', 300, { range: SELF, target: 'self', hit: ALWAYS, effects: [status('vanish')], anim: 'kneel', vfx: 'smoke', ai: 'buff' });
act('shadowstep', 'Shadowstep', 'Vanish and reappear on a tile within 4.', 400, { range: R(4, 99, 1), target: 'tile', hit: ALWAYS, effects: [{ type: 'teleport' }], anim: 'kneel', vfx: 'smoke', ai: 'utility' });
act('assassinate', 'Assassinate', 'A single killing stroke.', 800, { range: R(1, 3), target: 'enemy', hit: PCT(15, 'sp'), effects: [{ type: 'kill' }], anim: 'attack', vfx: 'dark', ai: 'damage' });
reaction('first_strike', 'First Strike', 'Strike first when an enemy closes to melee range.', 1000, { kind: 'firstStrike' });
support('dual_wield', 'Dual Wield', 'Wield a weapon in each hand and attack twice.', 900, { kind: 'dualWield' });
movement('move_3', 'Shadow Stride', 'Move three extra tiles.', 1000, { kind: 'move', amount: 3 });

// ===========================================================================
// 16. Oathbreaker — "Broken Oaths" (HP cost)
// ===========================================================================
const dark = (id: string, name: string, desc: string, jp: number, hpCostPct: number, o: ActOpts) =>
  act(id, name, desc, jp, { hpCostPct, anim: 'attack', vfx: 'dark', ...o });
dark('unholy_strike', 'Unholy Strike', 'Feed your blood to the blade for a crushing dark blow.', 400, 10, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.6 }, element: 'dark' }], ai: 'damage' });
dark('sanguine_edge', 'Sanguine Edge', 'Drink the life of your foe.', 300, 0, { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 0.9 }, drain: true, element: 'dark' }], ai: 'damage' });
dark('abyss', 'Abyss', 'Tear open the ground in a burst of shadow.', 700, 15, { range: R(3), aoe: AOE(1, 2), target: 'tile', affects: 'any', hit: EVADE, weaponBased: true, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.1 }, element: 'dark' }], ai: 'damage' });
dark('oath_severed', 'Oath Severed', 'Unmake a foe\'s blessings and fill them with Doubt.', 400, 5, { range: R(3), target: 'enemy', hit: PCT(60, 'ma'), effects: [{ type: 'removeStatus', status: ['protect', 'shell', 'haste', 'regen', 'reflect', 'float', 'reraise', 'faith'] }, status('doubt')], anim: 'cast', ai: 'debuff' });
dark('despair_wave', 'Dread Wave', 'A wave of dread around you: Brave −10 and Slow.', 500, 10, { range: SELF, target: 'self', aoe: AOE(2, 3), affects: 'enemy', hit: PCT(55, 'ma'), effects: [{ type: 'modStat', stat: 'brave', amount: -10 }, { type: 'addStatus', status: ['slow'], chance: 50 }], anim: 'cast', ai: 'debuff' });
dark('final_reckoning', 'Final Reckoning', 'Strike for damage equal to the HP you have lost.', 800, 0, { range: WEAPON, target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'casterMissing', mul: 1 }, element: 'dark', ignoreDefense: true }], ai: 'damage' });
reaction('bonecrusher', 'Vengeance', 'When struck while critical, counter for 150% damage.', 300, { kind: 'bonecrusher' });
support('equip_knightswords', 'Equip Knightswords', 'Wield knightswords in any job.', 600, { kind: 'equip', categories: ['knightsword'] });

export const ABILITIES: Record<string, AbilityDef> = A;

export function ability(id: string): AbilityDef {
  const a = A[id];
  if (!a) throw new Error(`Unknown ability: ${id}`);
  return a;
}

/** Register additional abilities (story jobs, monsters, campaign packs). */
export function registerAbilities(defs: AbilityDef[]): void {
  for (const d of defs) A[d.id] = d;
}
