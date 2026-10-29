/**
 * Story jobs (Lanternbearer, Ashguard, Auditor, Archscribe) and monster jobs,
 * per docs/story/STORY_JOBS.md. Ability names and flavour are canon; numbers
 * are tuned to the engine's units (see DESIGN.md).
 */
import { registerAbilities } from './abilities';
import { registerItems } from './items';
import { registerJobs } from './jobs';
import type { AbilityDef, Effect, ItemDef, JobDef, PassiveSpec, StatBlock } from './types';
import type { LayerRef } from './schema';

const st = (hp: number, mp: number, sp: number, pa: number, ma: number): StatBlock => ({ hp, mp, sp, pa, ma });
const L = (key: string, color?: string, color2?: string): LayerRef => (color2 ? { key, color, color2 } : color ? { key, color } : { key });
const R = (max: number, vertical = 99, min = 0) => ({ type: 'fixed' as const, max, min, vertical });
const SELF = { type: 'self' as const };
const WEAPON = { type: 'weapon' as const };
const AOE = (radius: number, vertical = 2) => ({ radius, vertical });
const EVADE = { kind: 'evadable' as const };
const ALWAYS = { kind: 'always' as const };
const PCT = (base: number, stat: 'pa' | 'ma' | 'sp' | 'none' = 'ma', faith = false) => ({ kind: 'pct' as const, base, stat, faith });
const status = (...s: Extract<Effect, { type: 'addStatus' }>['status']): Effect => ({ type: 'addStatus', status: s });
const chanceStatus = (chance: number, ...s: Extract<Effect, { type: 'addStatus' }>['status']): Effect => ({ type: 'addStatus', status: s, chance });

const defs: AbilityDef[] = [];
function act(id: string, name: string, description: string, jp: number, o: Omit<AbilityDef, 'id' | 'name' | 'description' | 'kind' | 'jp'>): void {
  defs.push({ id, name, description, kind: 'action', jp, target: 'any', ...o });
}
function passive(kind: 'reaction' | 'support' | 'movement', id: string, name: string, description: string, jp: number, p: PassiveSpec): void {
  defs.push({ id, name, description, kind, jp, passive: p });
}

// ===========================================================================
// Lanternbearer — "Witness"
// ===========================================================================
act('lantern_ward', 'Lantern Ward', 'Raise the lantern. Allies beside you gain Protect; the dark keeps its distance. "Stay back. I\'ve got light."', 100, {
  mp: 6, range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'ally', hit: ALWAYS, effects: [status('protect')], anim: 'cast', vfx: 'holy', ai: 'buff',
});
act('i_witness_you', 'I Witness You', 'Witness an ally: Brave +10 and Surety — a kept Oath pays double.', 150, {
  mp: 8, range: R(3), target: 'ally', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'brave', amount: 10 }, status('surety')], anim: 'victory', vfx: 'buff', ai: 'buff',
});
act('witnesslight', 'Witnesslight', 'A clean white flare that smells of candle-smoke. Holy damage; Hollows suffer double.', 200, {
  mp: 12, speed: 25, magic: true, range: R(4), aoe: AOE(1, 2), target: 'tile', affects: 'enemy', hit: ALWAYS, element: 'holy', effects: [{ type: 'damage', formula: { kind: 'magic', q: 16 }, element: 'holy' }], anim: 'cast', vfx: 'holy', ai: 'damage',
});
act('name_the_forfeit', 'Name the Forfeit', 'Name a foe\'s debt aloud: Forsworn. The next ability it uses costs it a fifth of its life.', 250, {
  mp: 10, speed: 34, magic: true, range: R(3), target: 'enemy', hit: PCT(50, 'ma', true), effects: [status('forsworn')], anim: 'cast', vfx: 'hex', ai: 'debuff',
});
act('steady_hands', 'Steady Hands', 'Steady an ally: remove Doubt, Fear, Confuse and Charm, and mend a little.', 150, {
  mp: 10, range: R(3), target: 'ally', hit: ALWAYS, effects: [{ type: 'removeStatus', status: ['doubt', 'fear', 'confuse', 'charm', 'berserk'] }, { type: 'heal', formula: { kind: 'stat', stat: 'ma', mul: 3 } }], anim: 'item', vfx: 'esuna', ai: 'utility',
});
act('crossroads_rally', 'Crossroads Rally', 'Allies around you: Brave +5 and Speed +1.', 300, {
  mp: 16, range: SELF, target: 'self', aoe: AOE(2, 3), affects: 'ally', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'brave', amount: 5 }, { type: 'modStat', stat: 'sp', amount: 1 }], anim: 'victory', vfx: 'buff', ai: 'buff',
});
act('settle_the_debt', 'Settle the Debt', 'Strike with the lantern\'s light: holy weapon damage ×1.5.', 250, {
  mp: 8, range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, element: 'holy', effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.5 }, element: 'holy' }], anim: 'attack', vfx: 'edge_holy', ai: 'damage',
});
act('keep_the_light', 'Keep the Light', 'The company\'s promises hold: allies in a wide circle gain Regen and Surety.', 600, {
  mp: 30, speed: 20, magic: true, range: SELF, target: 'self', aoe: AOE(3, 4), affects: 'ally', hit: ALWAYS, effects: [status('regen', 'surety')], anim: 'cast', vfx: 'holy', ai: 'buff',
});
passive('reaction', 'witness_eye', 'Witness\'s Eye', 'When an adjacent ally is struck, Brave% chance to grant them Protect.', 300, { kind: 'witnessEye' });
passive('support', 'oathkeeper', 'Oathkeeper', 'Oaths you swear reward 50% more; broken ones cost half.', 400, { kind: 'oathkeeper' });
passive('support', 'lamp_lit', 'Lamp-Lit', 'Immune to Blind and Fear; Hollows take 25% more damage from you.', 350, { kind: 'lampLit' });
passive('movement', 'fen_walker', 'Fen-Walker', 'Shallow water and marsh cost no extra movement.', 250, { kind: 'waterwalk' });

// ===========================================================================
// Ashguard — "Ashing"
// ===========================================================================
act('torch_cut', 'Torch-Cut', 'A burning blade: fire weapon damage, may leave the target oiled.', 100, {
  range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, element: 'fire', effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.1 }, element: 'fire' }, chanceStatus(30, 'oil')], anim: 'attack', vfx: 'edge_fire', ai: 'damage',
});
act('ash_the_ground', 'Ash the Ground', 'Set the ground alight around a tile. Hollows burn hotter.', 200, {
  mp: 10, speed: 34, range: R(3), aoe: AOE(1, 2), target: 'tile', affects: 'enemy', hit: ALWAYS, element: 'fire', effects: [{ type: 'damage', formula: { kind: 'stat', stat: 'pa', mul: 3 }, element: 'fire' }], anim: 'cast', vfx: 'fire', ai: 'damage',
});
act('ash_and_order', 'Ash and Order', 'Grey discipline: allies around you gain Brave +10 and cast off Fear.', 150, {
  mp: 12, range: SELF, target: 'self', aoe: AOE(2, 3), affects: 'ally', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'brave', amount: 10 }, { type: 'removeStatus', status: ['fear', 'doubt'] }], anim: 'victory', vfx: 'buff', ai: 'buff',
});
act('firebreak', 'Firebreak', 'Sweep fire along the line ahead, driving foes back.', 300, {
  mp: 14, speed: 25, range: R(1, 3), aoe: { radius: 3, vertical: 3, shape: 'line' }, target: 'tile', affects: 'enemy', hit: ALWAYS, element: 'fire', effects: [{ type: 'damage', formula: { kind: 'stat', stat: 'pa', mul: 3.2 }, element: 'fire' }, { type: 'knockback' }], anim: 'attack', vfx: 'fire', ai: 'damage',
});
act('grey_cloak', 'Grey Cloak', 'Wrap yourself in the ashen cloak: Shell.', 120, {
  mp: 8, range: SELF, target: 'self', hit: ALWAYS, effects: [status('shell')], anim: 'kneel', vfx: 'shell', ai: 'buff',
});
act('pyre', 'Pyre', 'Burn a fallen foe to ash at once and take strength from the fire. "Ash today. Harvest tomorrow."', 300, {
  mp: 16, range: R(2, 3), target: 'ko', targetsKO: true, hit: ALWAYS, effects: [{ type: 'consume', healPct: 20 }], anim: 'cast', vfx: 'fire', ai: 'utility',
});
act('hold_the_line', 'Hold the Line', 'Plant your feet: Guarding and Protect until your next turn.', 150, {
  mp: 10, range: SELF, target: 'self', hit: ALWAYS, effects: [status('defending', 'protect')], anim: 'kneel', vfx: 'protect', ai: 'buff',
});
passive('reaction', 'smoulder', 'Smoulder', 'When struck in melee, Brave% chance to leave the attacker oiled.', 200, { kind: 'smoulder' });
passive('support', 'ashborn', 'Ashborn', 'Absorb fire.', 500, { kind: 'absorbElement', element: 'fire' });
passive('movement', 'burn_walker', 'Burn-Walker', 'Move +1.', 300, { kind: 'move', amount: 1 });

// ===========================================================================
// Auditor (job id: inquisitor) — "Audit"
// ===========================================================================
act('read_the_oath', 'Read the Oath', 'Read what a foe has sworn. Their certainty falters: Doubt.', 80, {
  mp: 4, range: R(4), target: 'enemy', hit: PCT(70, 'ma'), effects: [status('doubt')], anim: 'cast', vfx: 'hex', ai: 'debuff',
});
act('seal', 'Seal', '"Your words are noted. And withheld." Silence and Disable.', 250, {
  mp: 12, speed: 25, magic: true, range: R(4), target: 'enemy', hit: PCT(120, 'ma', true), effects: [status('silence', 'disable')], anim: 'cast', vfx: 'hex', ai: 'debuff',
});
act('lien', 'Lien', 'Place a lien on a foe\'s mana and draw it into your own.', 150, {
  speed: 34, magic: true, range: R(4), target: 'enemy', hit: ALWAYS, effects: [{ type: 'damage', formula: { kind: 'stat', stat: 'ma', mul: 2 }, mp: true, drain: true }], anim: 'cast', vfx: 'drain', ai: 'damage',
});
act('debit', 'Debit', 'Enter a debt against the target: dark damage.', 200, {
  mp: 14, speed: 25, magic: true, reflectable: true, range: R(4), target: 'enemy', hit: ALWAYS, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'magic', q: 14 }, element: 'dark' }], anim: 'cast', vfx: 'dark', ai: 'damage',
});
act('inkbind', 'Inkbind', 'Ink spreads in a cross: Immobilize and Slow.', 300, {
  mp: 18, speed: 20, magic: true, range: R(4), aoe: { radius: 1, vertical: 2, shape: 'cross' }, target: 'tile', affects: 'enemy', hit: PCT(130, 'ma', true), effects: [status('immobilize', 'slow')], anim: 'cast', vfx: 'hex', ai: 'debuff',
});
act('breach_of_contract', 'Breach of Contract', 'The pen moves. The air goes cold. Dark damage and Doubt; the target\'s blessings are voided.', 500, {
  mp: 24, speed: 17, magic: true, range: R(3), target: 'enemy', hit: ALWAYS, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'magic', q: 18 }, element: 'dark' }, { type: 'removeStatus', status: ['protect', 'shell', 'haste', 'regen', 'surety', 'reraise'] }, status('doubt')], anim: 'cast', vfx: 'dark', ai: 'damage',
});
act('remission', 'Remission', 'Remit an ally\'s debts: heal and remove Doubt.', 150, {
  mp: 10, speed: 34, magic: true, range: R(4), target: 'ally', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'magic', q: 12 } }, { type: 'removeStatus', status: ['doubt'] }], anim: 'cast', vfx: 'cure', ai: 'heal',
});
act('strike', 'Strike', 'An Archscribe\'s warrant: strike a name from the Ledger. Removes all blessings and a quarter of current HP; Hollows are unmade.', 999, {
  mp: 30, speed: 15, magic: true, range: R(5), target: 'enemy', hit: ALWAYS, effects: [{ type: 'removeStatus', status: ['protect', 'shell', 'haste', 'regen', 'surety', 'reraise', 'float', 'reflect', 'faith'] }, { type: 'damage', formula: { kind: 'pctCurrent', pct: 25 }, ignoreDefense: true }], anim: 'cast', vfx: 'dark', ai: 'damage',
});
passive('reaction', 'countersign', 'Countersign', 'When struck by a spell, Brave% chance to sign it back to the caster.', 400, { kind: 'counterMagic' });
passive('support', 'warrant', 'Warrant', 'Status abilities hit oath-bound (Surety) units 20% more often.', 300, { kind: 'warrant' });
passive('movement', 'procession', 'Procession', 'Move +1.', 300, { kind: 'move', amount: 1 });

// ===========================================================================
// Archscribe (boss) — written larger
// ===========================================================================
act('strike_through', 'Strike Through', 'A line struck through the world: voids blessings and burns.', 0, {
  mp: 30, speed: 20, magic: true, range: R(1, 99), aoe: { radius: 5, vertical: 4, shape: 'line' }, target: 'tile', affects: 'enemy', hit: ALWAYS, element: 'dark',
  effects: [{ type: 'damage', formula: { kind: 'magic', q: 24 }, element: 'dark' }, { type: 'removeStatus', status: ['protect', 'shell', 'haste', 'regen', 'surety', 'reraise'] }], anim: 'cast', vfx: 'dark', ai: 'damage',
});
act('the_book_remembers', 'The Book Remembers', 'The Ledger recalls its faithful: revive an ally.', 0, {
  mp: 30, speed: 25, magic: true, range: R(5), target: 'ko', targetsKO: true, hit: ALWAYS, effects: [{ type: 'revive', pct: 60 }], anim: 'cast', vfx: 'raise', ai: 'revive',
});
act('final_audit', 'Final Audit', 'Every debt in the room comes due.', 0, {
  mp: 80, speed: 8, magic: true, range: SELF, target: 'self', aoe: { radius: 6, vertical: 8 }, affects: 'enemy', hit: ALWAYS, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'magic', q: 40 }, element: 'dark' }], anim: 'cast', vfx: 'summon_revenant_king', ai: 'damage',
});

// ===========================================================================
// Monsters
// ===========================================================================
const m = (id: string, name: string, desc: string, o: Omit<AbilityDef, 'id' | 'name' | 'description' | 'kind' | 'jp'>) => act(id, name, desc, 0, o);
// wolfkin
m('wolf_rend', 'Rend', 'Teeth and claws: heavy damage that leaves a bleeding wound (Poison).', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.15 } }, chanceStatus(50, 'poison')], anim: 'attack', ai: 'damage' });
m('pack_howl', 'Pack Howl', 'A howl that quickens the pack: allies nearby Speed +1.', { range: SELF, target: 'self', aoe: AOE(3, 4), affects: 'ally', hit: ALWAYS, effects: [{ type: 'modStat', stat: 'sp', amount: 1 }], anim: 'victory', vfx: 'buff', ai: 'buff' });
m('hamstring', 'Hamstring', 'Bite at the legs: Slow.', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.6 } }, chanceStatus(65, 'slow')], anim: 'attack', ai: 'debuff' });
m('lunge', 'Lunge', 'Spring at a foe two tiles away.', { range: R(2, 3, 2), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.0 } }], anim: 'attack', ai: 'damage' });
m('fade', 'Fade', 'Melt into the reeds: untargetable until it acts.', { range: SELF, target: 'self', hit: ALWAYS, effects: [status('vanish')], anim: 'kneel', vfx: 'smoke', ai: 'buff' });
// hollow shade
m('cold_touch', 'Cold Touch', 'A touch like grave-water: dark damage and Slow.', { magic: true, range: R(1, 3), target: 'enemy', hit: ALWAYS, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'magic', q: 10 }, element: 'dark' }, chanceStatus(40, 'slow')], anim: 'cast', vfx: 'dark', ai: 'damage' });
m('whisper_of_doubt', 'Whisper of Doubt', 'It says what you fear is true. Brave −10.', { range: R(3), target: 'enemy', hit: PCT(80, 'ma'), effects: [{ type: 'modStat', stat: 'brave', amount: -10 }, chanceStatus(30, 'fear')], anim: 'cast', vfx: 'hex', ai: 'debuff' });
m('hunger', 'Hunger', 'It feeds: drain HP.', { magic: true, range: R(2, 3), target: 'enemy', hit: ALWAYS, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'magic', q: 8 }, drain: true, element: 'dark' }], anim: 'cast', vfx: 'drain', ai: 'damage' });
m('unmake', 'Unmake', 'It pulls at the threads of a promise: removes Surety and blessings.', { range: R(2, 3), target: 'enemy', hit: PCT(60, 'ma'), effects: [{ type: 'removeStatus', status: ['surety', 'protect', 'shell', 'regen'] }, status('doubt')], anim: 'cast', vfx: 'hex', ai: 'debuff' });
m('gather', 'Gather', 'Shades knit together: recover a quarter of max HP.', { range: SELF, target: 'self', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'pctMax', pct: 25 } }], anim: 'cast', vfx: 'dark', ai: 'heal' });
// skeleton
m('rusted_blade', 'Rusted Blade', 'A rusted strike that leaves foul wounds.', { range: WEAPON, target: 'enemy', hit: EVADE, weaponBased: true, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1.15 } }, chanceStatus(25, 'poison')], anim: 'attack', ai: 'damage' });
m('bone_wall', 'Bone Wall', 'Bones lock together: Guarding and Protect.', { range: SELF, target: 'self', hit: ALWAYS, effects: [status('defending', 'protect')], anim: 'kneel', vfx: 'protect', ai: 'buff' });
m('rattle', 'Rattle', 'A dreadful clatter: adjacent foes may Fear.', { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'enemy', hit: PCT(25, 'none'), effects: [status('fear')], anim: 'victory', vfx: 'hex', ai: 'debuff' });
m('grave_arrow', 'Grave Arrow', 'A black-fletched arrow from the barrow.', { range: R(5, 99, 2), target: 'enemy', hit: EVADE, element: 'dark', effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.0 }, element: 'dark' }], anim: 'shoot', ai: 'damage' });
// ghoul
m('claw', 'Claw', 'Filthy claws: damage and Poison.', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.95 } }, chanceStatus(30, 'poison')], anim: 'attack', ai: 'damage' });
m('gnaw', 'Gnaw', 'It bites and swallows: drain HP.', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.75 }, drain: true }], anim: 'attack', ai: 'damage' });
m('grasp', 'Grasp', 'Cold hands hold fast: Immobilize.', { range: R(1, 3), target: 'enemy', hit: PCT(60, 'pa'), effects: [status('immobilize')], anim: 'attack', ai: 'debuff' });
m('stench', 'Stench', 'The reek of the grave: nearby foes may Blind.', { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'enemy', hit: PCT(25, 'none'), effects: [status('blind')], anim: 'kneel', vfx: 'poison', ai: 'debuff' });
m('feast', 'Feast', 'It feeds on the fallen: the body is lost and the ghoul heals.', { range: R(1, 3), target: 'ko', targetsKO: true, hit: ALWAYS, effects: [{ type: 'consume', healPct: 40 }], anim: 'attack', ai: 'utility' });
// goblin / titheling
m('pilfer', 'Pilfer', 'Quick fingers in your purse.', { range: R(1, 3), target: 'enemy', hit: PCT(60, 'sp'), effects: [{ type: 'steal', slot: 'gil' }], anim: 'item', vfx: 'steal', ai: 'utility' });
m('pinch', 'Pinch', 'A spiteful little cut: may Slow.', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.62 } }, chanceStatus(20, 'slow')], anim: 'attack', ai: 'damage' });
m('hoard_glint', 'Hoard Glint', 'It shows you something shiny. Charm.', { range: R(2), target: 'enemy', hit: PCT(20, 'none'), effects: [status('charm')], anim: 'victory', vfx: 'charm', ai: 'debuff' });
// gaunt
m('drink_grace', 'Drink Grace', 'It drinks grace and blood alike.', { magic: true, range: R(3), target: 'enemy', hit: ALWAYS, effects: [{ type: 'damage', formula: { kind: 'magic', q: 12 }, drain: true, element: 'dark' }, { type: 'damage', formula: { kind: 'magic', q: 6 }, mp: true, drain: true }], anim: 'cast', vfx: 'drain', ai: 'damage' });
m('noble_mien', 'Noble Mien', 'Courtly menace: Charm.', { magic: true, range: R(3), target: 'enemy', hit: PCT(90, 'ma', true), effects: [status('charm')], anim: 'victory', vfx: 'charm', ai: 'debuff' });
m('contempt', 'Contempt', 'Its disdain withers resolve around a tile: Doubt.', { magic: true, range: R(4), aoe: AOE(2, 3), target: 'tile', affects: 'enemy', hit: PCT(100, 'ma', true), effects: [status('doubt')], anim: 'cast', vfx: 'hex', ai: 'debuff' });
m('mist_form', 'Mist Form', 'Becomes mist and reforms elsewhere.', { range: R(4, 99, 1), target: 'tile', hit: ALWAYS, effects: [{ type: 'teleport' }], anim: 'kneel', vfx: 'smoke', ai: 'utility' });
// brute
m('smash', 'Smash', 'A crushing blow that sends foes flying.', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.38 } }, { type: 'knockback' }], anim: 'attack', ai: 'damage' });
m('roar', 'Roar', 'A roar that shakes the bones: Fear nearby.', { range: SELF, target: 'self', aoe: AOE(2, 3), affects: 'enemy', hit: PCT(40, 'none'), effects: [status('fear')], anim: 'victory', vfx: 'hex', ai: 'debuff' });
m('thick_hide', 'Thick Hide', 'Hide like boiled leather: Protect.', { range: SELF, target: 'self', hit: ALWAYS, effects: [status('protect')], anim: 'kneel', vfx: 'protect', ai: 'buff' });
m('rage', 'Rage', 'It loses itself: Berserk (PA ×1.5).', { range: SELF, target: 'self', hit: ALWAYS, effects: [status('berserk')], anim: 'victory', vfx: 'fire', ai: 'buff' });
// boarman
m('tusk_charge', 'Tusk Charge', 'Head down, charging: damage and knockback.', { range: R(2, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.12 } }, { type: 'knockback' }], anim: 'attack', ai: 'damage' });
m('snort', 'Snort', 'A spray of muck: Disable.', { range: R(1, 3), target: 'enemy', hit: PCT(45, 'none'), effects: [status('disable')], anim: 'attack', ai: 'debuff' });
m('wallow', 'Wallow', 'Rolls in the mud and recovers.', { range: SELF, target: 'self', hit: ALWAYS, effects: [{ type: 'heal', formula: { kind: 'pctMax', pct: 25 } }], anim: 'kneel', ai: 'heal' });
// minotaur
m('horn_rush', 'Horn Rush', 'A charge across the field: massive damage and knockback.', { range: R(4, 3, 1), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.25 } }, { type: 'knockback' }], anim: 'attack', ai: 'damage' });
m('labrys_sweep', 'Labrys Sweep', 'The great axe sweeps all around.', { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'weapon', mul: 1 } }], weaponBased: true, anim: 'attack', vfx: 'wind', ai: 'damage' });
m('bellow', 'Bellow', 'A bellow like a landslide: adjacent foes may Stop.', { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'enemy', hit: PCT(25, 'none'), effects: [status('stop')], anim: 'victory', vfx: 'earth', ai: 'debuff' });
m('stamp', 'Stamp', 'Stamps the ground: damage around the target.', { range: R(2, 3), aoe: AOE(1, 2), target: 'tile', affects: 'enemy', hit: EVADE, element: 'earth', effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.75 }, element: 'earth' }], anim: 'attack', vfx: 'earth', ai: 'damage' });
// troll
m('boulder_toss', 'Boulder Toss', 'Hurls a boulder: damage in a small area.', { range: R(4, 99, 2), aoe: AOE(1, 2), target: 'tile', affects: 'any', hit: EVADE, element: 'earth', effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.85 }, element: 'earth' }], anim: 'item', vfx: 'earth', ai: 'damage' });
m('regenerate', 'Regenerate', 'Flesh knits over: Regen.', { range: SELF, target: 'self', hit: ALWAYS, effects: [status('regen')], anim: 'kneel', vfx: 'heal', ai: 'buff' });
m('stone_skin', 'Stone Skin', 'Skin turns grey stone: Protect and Shell, but Slow.', { range: SELF, target: 'self', hit: ALWAYS, effects: [status('protect', 'shell', 'slow')], anim: 'kneel', vfx: 'protect', ai: 'buff' });
m('ground_slam', 'Ground Slam', 'The earth jumps: damage around and Immobilize.', { range: SELF, target: 'self', aoe: AOE(1, 2), affects: 'enemy', hit: EVADE, element: 'earth', effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.75 }, element: 'earth' }, chanceStatus(30, 'immobilize')], anim: 'attack', vfx: 'earth', ai: 'damage' });
// lizardfolk (Sarth)
m('reed_spear', 'Reed Spear', 'A long thrust that reaches two tiles.', { range: R(2, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 1.0 } }], anim: 'thrust', ai: 'damage' });
m('tail_sweep', 'Tail Sweep', 'A heavy tail knocks a foe back.', { range: R(1, 3), target: 'enemy', hit: EVADE, effects: [{ type: 'damage', formula: { kind: 'monster', mul: 0.75 } }, { type: 'knockback' }], anim: 'attack', ai: 'damage' });
m('mire_spit', 'Mire Spit', 'Spits fen-muck: Blind and Slow.', { range: R(3), target: 'enemy', hit: PCT(55, 'none'), effects: [status('blind', 'slow')], anim: 'cast', vfx: 'poison', ai: 'debuff' });
m('oathcarving', 'Oathcarving', 'Carves a Sarth oath-mark on an ally: Protect and Regen.', { range: R(3), target: 'ally', hit: ALWAYS, effects: [status('protect', 'regen')], anim: 'cast', vfx: 'buff', ai: 'buff' });
m('hiss', 'Hiss', 'A threatening hiss: Brave −8 nearby.', { range: SELF, target: 'self', aoe: AOE(2, 3), affects: 'enemy', hit: PCT(70, 'none'), effects: [{ type: 'modStat', stat: 'brave', amount: -8 }], anim: 'victory', ai: 'debuff' });

passive('reaction', 'phase', 'Phase', 'Brave% chance to let a physical blow pass through.', 0, { kind: 'shirahadori' });
passive('reaction', 'hold_fast', 'Hold Fast', 'When struck, Brave% chance to brace (evasion doubled).', 0, { kind: 'vigilance' });
passive('reaction', 'bristle', 'Bristle', 'When struck in melee, Brave% chance to gore back.', 0, { kind: 'counterTackle' });

registerAbilities(defs);

// ===========================================================================
// Jobs
// ===========================================================================
const HOLLOW_IMMUNE = ['poison', 'doom', 'charm'] as const;
const HOLLOW_EL = { weak: ['holy' as const] };

const J: JobDef[] = [
  {
    id: 'lanternbearer', name: 'Lanternbearer', skillsetName: 'Witness', special: 'story',
    description: 'The old hedge-witness tradition: crossroads keepers who witnessed the promises of people who could not pay the Ledger, and carried witnesslight against Hollows.',
    abilities: ['lantern_ward', 'i_witness_you', 'witnesslight', 'name_the_forfeit', 'steady_hands', 'crossroads_rally', 'settle_the_debt', 'keep_the_light', 'witness_eye', 'oathkeeper', 'lamp_lit', 'fen_walker'],
    equips: ['sword', 'flail', 'knife', 'shield', 'clothes', 'armor', 'hat'],
    mult: st(110, 90, 100, 105, 95), growth: st(10, 12, 100, 45, 50), move: 4, jump: 3, cev: 10, requires: {},
    outfit: { all: [L('torso_clothes_longsleeve2', 'tan'), L('torso_jacket_tabard', 'walnut'), L('legs_pants', 'brown'), L('feet_boots_fold', 'brown'), L('cape_solid', 'brown')] },
  },
  {
    id: 'ashguard', name: 'Ashguard', skillsetName: 'Ashing', special: 'story',
    description: 'The Regent\'s grey cloaks, founded to burn Hollow-blighted villages. Fire, discipline, terror.',
    abilities: ['torch_cut', 'ash_the_ground', 'ash_and_order', 'firebreak', 'grey_cloak', 'pyre', 'hold_the_line', 'smoulder', 'ashborn', 'burn_walker'],
    equips: ['axe', 'knightsword', 'spear', 'shield', 'armor', 'helm', 'clothes'],
    mult: st(125, 60, 95, 115, 90), growth: st(10, 15, 105, 42, 50), move: 4, jump: 3, cev: 5, requires: {},
    elements: { half: ['fire'] },
    outfit: { all: [L('torso_clothes_longsleeve', 'gray'), L('legs_pants', 'charcoal'), L('feet_boots_basic', 'black'), L('cape_tattered', 'gray')] },
  },
  {
    id: 'inquisitor', name: 'Auditor', skillsetName: 'Audit', special: 'story',
    description: 'The Ledger\'s inquisition. Grey gloves, warrants, ink that binds. They read oaths, seal mouths and — with the Archscribe\'s seal — strike.',
    abilities: ['read_the_oath', 'seal', 'lien', 'debit', 'inkbind', 'breach_of_contract', 'remission', 'countersign', 'warrant', 'procession'],
    equips: ['staff', 'rod', 'knife', 'robe', 'clothes', 'hat'],
    mult: st(95, 120, 105, 85, 115), growth: st(11, 10, 98, 55, 48), move: 3, jump: 3, cev: 10, requires: {},
    outfit: { all: [L('torso_clothes_robe', 'dark gray'), L('arms_gloves', 'iron'), L('belt_leather', 'charcoal'), L('feet_shoes_revised', 'black')] },
  },
  {
    id: 'archscribe', name: 'Archscribe', skillsetName: 'The Book', special: 'story',
    description: 'The head of the Ledger. Everything the Auditors can do, written larger.',
    abilities: ['debit', 'seal', 'inkbind', 'strike', 'strike_through', 'the_book_remembers', 'final_audit', 'countersign'],
    equips: ['staff', 'rod', 'robe', 'clothes', 'hat'],
    mult: st(160, 150, 100, 80, 140), growth: st(9, 8, 100, 55, 44), move: 3, jump: 3, cev: 10, requires: {},
    immune: ['doom', 'stop', 'charm', 'petrify', 'confuse'],
    outfit: { all: [L('torso_clothes_robe', 'white'), L('cape_trim', 'red', 'yellow'), L('feet_slippers', 'white')] },
  },
];

const monster = (d: Omit<JobDef, 'special' | 'requires' | 'growth' | 'outfit'> & { outfit?: JobDef['outfit']; growth?: StatBlock }): JobDef => ({
  special: 'monster', requires: {}, growth: d.growth ?? st(10, 14, 100, 45, 50), outfit: d.outfit ?? {}, ...d,
});

J.push(
  monster({ id: 'wolfkin', name: 'Wolfkin', skillsetName: 'Hunt', description: 'Hollow hounds and the wolf-headed things that run with them.', traits: ['hollow', 'beast'], immune: [...HOLLOW_IMMUNE], elements: HOLLOW_EL,
    abilities: ['wolf_rend', 'pack_howl', 'hamstring', 'lunge', 'fade', 'counter', 'move_1'], equips: ['fist'], mult: st(95, 40, 125, 115, 50), move: 5, jump: 3, cev: 20 }),
  monster({ id: 'hollow', name: 'Hollow Shade', skillsetName: 'Hunger', description: 'The curdled weight of a broken promise, given a shape that hunts.', traits: ['hollow'], immune: [...HOLLOW_IMMUNE, 'blind'], elements: { weak: ['holy'], half: ['dark', 'ice'] },
    innateStatus: ['float'], abilities: ['cold_touch', 'whisper_of_doubt', 'hunger', 'unmake', 'gather', 'phase'], equips: ['fist'], mult: st(80, 100, 105, 70, 110), move: 4, jump: 4, cev: 25 }),
  monster({ id: 'skeleton', name: 'Restless', skillsetName: 'Grave', description: 'Bones that keep an oath their owner broke.', traits: ['hollow', 'undead'], immune: [...HOLLOW_IMMUNE, 'sleep', 'blind'], elements: { weak: ['holy', 'earth'], half: ['ice', 'dark'] },
    innateStatus: ['undead'], abilities: ['rusted_blade', 'bone_wall', 'rattle', 'grave_arrow', 'counter'], equips: ['sword', 'axe', 'bow', 'shield', 'helm'], mult: st(100, 40, 95, 110, 60), move: 3, jump: 3, cev: 10 }),
  monster({ id: 'ghoul', name: 'Restless (flesh)', skillsetName: 'Grave-Hunger', description: 'Drowned dead that crawl out of the fen when debts go unpaid.', traits: ['hollow', 'undead'], immune: [...HOLLOW_IMMUNE, 'sleep'], elements: { weak: ['holy', 'fire'], half: ['ice', 'water'] },
    innateStatus: ['undead'], abilities: ['claw', 'gnaw', 'grasp', 'stench', 'feast', 'hold_fast', 'waterwalk'], equips: ['fist'], mult: st(115, 30, 85, 110, 50), move: 3, jump: 2, cev: 5 }),
  monster({ id: 'goblin', name: 'Titheling', skillsetName: 'Tithes', description: 'Small, greedy Hollows born of unpaid tithes. Pests with knives.', traits: ['hollow'], immune: [...HOLLOW_IMMUNE], elements: HOLLOW_EL,
    abilities: ['pilfer', 'pinch', 'hoard_glint', 'reflexes', 'jump_2'], equips: ['knife'], mult: st(75, 40, 120, 90, 60), move: 4, jump: 4, cev: 30 }),
  monster({ id: 'gaunt', name: 'Gaunt', skillsetName: 'Grace-Thirst', description: 'A noble Hollow: what is left of a lord who broke a realm\'s worth of promises.', traits: ['hollow'], immune: [...HOLLOW_IMMUNE, 'blind', 'silence'], elements: { weak: ['holy'], absorb: ['dark'] },
    abilities: ['drink_grace', 'noble_mien', 'contempt', 'mist_form', 'absorb_mp', 'teleport'], equips: ['rod', 'knife'], mult: st(110, 130, 110, 80, 130), move: 4, jump: 3, cev: 20 }),
  monster({ id: 'brute', name: 'Hollow Brute', skillsetName: 'Wrath', description: 'An orc-headed mass of rage and debt.', traits: ['hollow', 'heavy'], immune: [...HOLLOW_IMMUNE], elements: HOLLOW_EL,
    abilities: ['smash', 'roar', 'thick_hide', 'rage', 'counter'], equips: ['axe', 'flail'], mult: st(150, 30, 85, 135, 40), move: 3, jump: 2, cev: 5 }),
  monster({ id: 'boarman', name: 'Hollow Boarman', skillsetName: 'Rut', description: 'A tusked charger from the mudflats.', traits: ['hollow', 'beast'], immune: [...HOLLOW_IMMUNE], elements: HOLLOW_EL,
    abilities: ['tusk_charge', 'snort', 'wallow', 'bristle', 'waterwalk'], equips: ['fist'], mult: st(130, 30, 100, 120, 40), move: 4, jump: 2, cev: 10 }),
  monster({ id: 'minotaur', name: 'The Horned Debt', skillsetName: 'Collection', description: 'Debt given horns and a labrys.', traits: ['hollow', 'heavy'], immune: [...HOLLOW_IMMUNE, 'confuse', 'fear'], elements: HOLLOW_EL,
    abilities: ['horn_rush', 'labrys_sweep', 'bellow', 'stamp', 'counter', 'ignore_height'], equips: ['axe'], mult: st(190, 40, 95, 140, 50), move: 4, jump: 3, cev: 10 }),
  monster({ id: 'troll', name: 'Barrow Troll', skillsetName: 'Barrow', description: 'Slow, ancient and very hard to kill.', traits: ['hollow', 'heavy'], immune: [...HOLLOW_IMMUNE], elements: { weak: ['holy', 'fire'], half: ['earth'] },
    abilities: ['boulder_toss', 'regenerate', 'stone_skin', 'ground_slam', 'counter', 'regenerator'], equips: ['flail'], mult: st(210, 40, 75, 130, 50), move: 3, jump: 2, cev: 0 }),
  monster({ id: 'lizardfolk', name: 'Sarth', skillsetName: 'Fen-Ways', description: 'A living people of the deltas and fens — not Hollows. They carve their oaths in their own scales.',
    abilities: ['reed_spear', 'tail_sweep', 'mire_spit', 'oathcarving', 'hiss', 'counter', 'waterwalk'], equips: ['spear', 'shield'], mult: st(110, 70, 105, 110, 80), move: 4, jump: 3, cev: 15, elements: { half: ['water'], weak: ['ice'] } }),
);
registerJobs(J);

// ===========================================================================
// Signature and campaign items
// ===========================================================================
const items: ItemDef[] = [
  { id: 'brask_lantern', name: 'Brask\'s Lantern', type: 'accessory', category: 'accessory', price: 0, tier: 3, rare: true, description: 'Odo Brask\'s hedge-witness lantern. Holy resistance; Faith +10.', bonus: { faith: 10, brave: 3 }, elements: { half: ['holy', 'dark'] }, immune: ['fear'], visual: [L('neck_capeclip', 'brass')] },
  { id: 'half_penny', name: 'Half a Penny', type: 'accessory', category: 'accessory', price: 0, tier: 1, rare: true, description: '"A fair half." Brave +5, Faith +5.', bonus: { brave: 5, faith: 5 }, visual: [L('neck_necklace', 'brass')] },
  { id: 'broadsword', name: 'Broadsword', type: 'weapon', category: 'sword', price: 260, tier: 1, wp: 5, wev: 5, visual: [L('weapon_sword_arming', 'steel')] },
  { id: 'leather_armor', name: 'Leather Armour', type: 'body', category: 'clothes', price: 220, tier: 1, hp: 14, visual: [L('torso_armour_leather', 'leather', 'brass')] },
  { id: 'chain_vest', name: 'Chain Vest', type: 'body', category: 'armor', price: 400, tier: 2, hp: 24, visual: [L('torso_chainmail', 'iron')] },
  { id: 'cloth_robe', name: 'Cloth Robe', type: 'body', category: 'robe', price: 180, tier: 1, hp: 8, mp: 10, visual: [L('torso_clothes_robe', 'brown')] },
  { id: 'auditor_warrant', name: 'Archscribe\'s Warrant', type: 'accessory', category: 'accessory', price: 0, tier: 9, rare: true, description: 'A sealed warrant. It is warm to the touch.', visual: [] },
  { id: 'millbrook_register', name: 'The Millbrook Register', type: 'accessory', category: 'accessory', price: 0, tier: 9, rare: true, description: 'A charity register. Some names are struck through.', visual: [] },
  { id: 'rusted_sword', name: 'Rusted Blade', type: 'weapon', category: 'sword', price: 60, tier: 1, wp: 4, onHit: { status: 'poison', chance: 10 }, rare: true, visual: [L('weapon_sword_arming', 'iron')] },
  { id: 'bone_bow', name: 'Barrow Bow', type: 'weapon', category: 'bow', price: 100, tier: 2, wp: 5, twoHanded: true, rare: true, visual: [L('weapon_ranged_bow_normal', 'dark')] },
];
registerItems(items);

/** Key items cannot be equipped or sold. */
export const KEY_ITEMS = new Set(['auditor_warrant', 'millbrook_register']);

export const STORY_JOBS_LOADED = true;
