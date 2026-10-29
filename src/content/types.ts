/**
 * Rules-content definitions: jobs, abilities, items, statuses.
 * Plain data only — the engine interprets these.
 */
import type { LayerRef, BodyType } from './schema';

export type Element =
  | 'fire' | 'ice' | 'lightning' | 'water' | 'wind' | 'earth' | 'holy' | 'dark' | 'none';

export const ELEMENTS: Element[] = ['fire', 'ice', 'lightning', 'water', 'wind', 'earth', 'holy', 'dark'];

export type StatKey = 'hp' | 'mp' | 'sp' | 'pa' | 'ma';

export type StatusId =
  | 'ko' | 'crystal' | 'poison' | 'regen' | 'protect' | 'shell' | 'haste' | 'slow' | 'stop'
  | 'immobilize' | 'disable' | 'silence' | 'blind' | 'sleep' | 'confuse' | 'charm' | 'berserk'
  | 'doom' | 'float' | 'reflect' | 'petrify' | 'faith' | 'atheist' | 'undead' | 'oil'
  | 'reraise' | 'defending' | 'charging' | 'invisible' | 'doubt' | 'chicken' | 'vanish'
  | 'quicken' | 'critical' | 'surety' | 'forsworn' | 'fear';

export type WeaponFamily =
  | 'fist' | 'knife' | 'sword' | 'knightsword' | 'katana' | 'axe' | 'flail' | 'spear'
  | 'staff' | 'rod' | 'bow' | 'crossbow' | 'throwing';

export type ArmorFamily = 'shield' | 'hat' | 'helm' | 'clothes' | 'robe' | 'armor' | 'ribbon'
  | 'accessory' | 'cloak' | 'ring' | 'armlet' | 'boots' | 'perfume';

export type EquipCategory = WeaponFamily | ArmorFamily;

/** Formula producing a raw amount (damage or heal) before modifiers. */
export type Formula =
  /** Weapon formula of the equipped weapon, times mul. */
  | { kind: 'weapon'; mul?: number }
  /** MA × q, scaled by caster and target Faith. */
  | { kind: 'magic'; q: number }
  /** stat × mul (optionally × Brave/100), no faith. */
  | { kind: 'stat'; stat: 'pa' | 'ma' | 'sp' | 'level'; mul: number; brave?: boolean; plus?: number }
  /** (PA + stat2) / 2 × mul */
  | { kind: 'mix'; a: 'pa' | 'ma' | 'sp'; b: 'pa' | 'ma' | 'sp'; mul: number }
  /** Monster natural attacks: PA × (base + level × 0.2) × mul — scales like a tiered weapon. */
  | { kind: 'monster'; mul: number }
  /** Unarmed: PA × (PA × Brave/100) × mul */
  | { kind: 'fist'; mul: number }
  | { kind: 'fixed'; amount: number }
  | { kind: 'pctMax'; pct: number }        // % of target max HP (or MP for mp effects)
  | { kind: 'pctCurrent'; pct: number }
  | { kind: 'casterMissing'; mul: number } // caster's missing HP × mul
  | { kind: 'casterHp'; pct: number };     // % of caster's current HP

export type HitSpec =
  | { kind: 'always' }
  /** Physical: evaded by C-Ev/shield/accessory depending on facing. */
  | { kind: 'evadable'; bonus?: number }
  /** Percentage: (stat + base)%, optionally × faiths. */
  | { kind: 'pct'; base: number; stat?: 'pa' | 'ma' | 'sp' | 'none'; faith?: boolean; brave?: boolean };

export type Effect =
  | { type: 'damage'; formula: Formula; element?: Element | 'weapon'; mp?: boolean; drain?: boolean; ignoreDefense?: boolean }
  | { type: 'heal'; formula: Formula; mp?: boolean }
  | { type: 'addStatus'; status: StatusId[]; mode?: 'all' | 'random'; chance?: number }
  | { type: 'removeStatus'; status: StatusId[] }
  | { type: 'revive'; pct: number }
  | { type: 'modStat'; stat: 'pa' | 'ma' | 'sp' | 'brave' | 'faith' | 'ct'; amount: number }
  | { type: 'break'; slot: 'main' | 'off' | 'head' | 'body' | 'accessory' }
  | { type: 'steal'; slot: 'main' | 'off' | 'head' | 'body' | 'accessory' | 'gil' | 'exp' }
  | { type: 'kill' }
  | { type: 'knockback' }
  | { type: 'setHp'; to: 'one' | 'critical' }
  | { type: 'gainCT'; amount: number }           // quick: set CT to 100 = take turn next
  | { type: 'teleport' }                         // move caster to target tile
  | { type: 'swap' }                             // swap places with target
  | { type: 'useItem' }                          // apply chosen consumable
  | { type: 'learnFromCrystal' }
  /** Instantly crystallise a KO'd target (Pyre / Feast); heal caster by pct of max HP. */
  | { type: 'consume'; healPct: number };

export type RangeSpec =
  | { type: 'self' }
  | { type: 'weapon' }
  | { type: 'fixed'; max: number; min?: number; vertical?: number; line?: boolean };

export interface AoeSpec {
  radius: number;          // 0 = single tile
  vertical: number;        // max height difference from centre tile
  shape?: 'diamond' | 'line' | 'cross' | 'all';
  /** Line AoE length (from caster) for shape 'line'. */
}

export type TargetFilter = 'enemy' | 'ally' | 'any' | 'self' | 'tile' | 'ko' | 'allyNotSelf';

export type AbilityKind = 'action' | 'reaction' | 'support' | 'movement';

export type AnimKey = 'attack' | 'cast' | 'item' | 'shoot' | 'jump' | 'thrust' | 'kneel' | 'victory' | 'throw';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  kind: AbilityKind;
  /** JP to learn. */
  jp: number;
  // --- action fields ---
  mp?: number;
  /** HP cost as % of caster max HP (Oathbreaker arts). */
  hpCostPct?: number;
  /** Charge speed; 0/undefined = instant. Resolves after ceil(100/speed) ticks. */
  speed?: number;
  range?: RangeSpec;
  aoe?: AoeSpec;
  target?: TargetFilter;
  /** For AoE: who is affected inside the area. Default 'any'. */
  affects?: 'enemy' | 'ally' | 'any';
  hit?: HitSpec;
  effects?: Effect[];
  element?: Element;
  /** Magic: blocked by Silence, boosted by Arcane Strength, reflectable. */
  magic?: boolean;
  reflectable?: boolean;
  /** Uses the equipped weapon (range/element/anim). */
  weaponBased?: boolean;
  /** Can't be used with these statuses etc. */
  requiresWeapon?: WeaponFamily[];
  /** Spends an inventory item (Items skillset). */
  consumes?: string;
  /** Usable on KO'd units. */
  targetsKO?: boolean;
  /** Only usable when the target tile's terrain is one of these (Warden). */
  terrain?: string[];
  /** Variance: damage multiplied by a random factor in [1-v, 1+v]. */
  variance?: number;
  /** Ignore evasion / always counts as back attack. */
  ignoreFacing?: boolean;
  /** Not counterable by reactions. */
  noReaction?: boolean;
  /** Ignore Faith scaling (e.g. Shadowblade throws). */
  anim?: AnimKey;
  vfx?: string;
  sfx?: string;
  /** Damage/heal resolves on caster after jump (Lancer Jump). */
  jump?: boolean;
  /** For AI: role hint. */
  ai?: 'damage' | 'heal' | 'buff' | 'debuff' | 'revive' | 'utility';
  // --- passive fields (reaction/support/movement) ---
  passive?: PassiveSpec;
}

/** Passive behaviour for reaction / support / movement abilities. */
export type PassiveSpec =
  // reactions
  | { kind: 'counter' }                         // counter physical melee with Attack
  | { kind: 'counterMagic' }                    // recast the spell back at caster
  | { kind: 'counterTackle' }                   // knockback + damage counter
  | { kind: 'parry' }                           // block physical with weapon
  | { kind: 'arrowGuard' }                      // evade ranged
  | { kind: 'autoPotion' }                      // use best potion when damaged
  | { kind: 'regenerator' }                     // gain Regen when hit
  | { kind: 'dragonheart' }                     // gain Reraise when hit
  | { kind: 'criticalQuick' }                   // instant turn when entering critical
  | { kind: 'absorbMp' }                        // gain MP from spells targeting you
  | { kind: 'vigilance' }                       // enter Defending when hit
  | { kind: 'manaShield' }                      // damage to MP first
  | { kind: 'firstStrike' }                     // counter before melee hits
  | { kind: 'bonecrusher' }                     // counter for 1.5× when critical
  | { kind: 'gilSnapper' }                      // gain gil equal to damage
  | { kind: 'reflexes' }                        // doubles evasion
  | { kind: 'shirahadori' }                     // Brave% block of physical incl. ranged
  | { kind: 'oathGuard' }                       // block a lethal blow once (story)
  | { kind: 'witnessEye' }                      // adjacent ally attacked → Brave% grant them Protect
  | { kind: 'smoulder' }                        // melee attacker gains Oil (Brave%)
  | { kind: 'oathkeeper' }                      // Oath rewards +50%, penalties halved
  | { kind: 'lampLit' }                         // immune Blind/Fear, +25% damage vs Hollows
  | { kind: 'warrant' }                         // +20% status hit vs oath-bound units
  | { kind: 'absorbElement'; element: Element }  // absorb an element (Ashborn)
  // supports
  | { kind: 'equip'; categories: EquipCategory[] }
  | { kind: 'jpBoost' }
  | { kind: 'expBoost' }
  | { kind: 'attackBoost' }
  | { kind: 'arcaneStrength' }
  | { kind: 'defenseBoost' }
  | { kind: 'arcaneDefense' }
  | { kind: 'concentrate' }
  | { kind: 'throwItems' }
  | { kind: 'safeguard' }
  | { kind: 'swiftness' }
  | { kind: 'dualWield' }
  | { kind: 'doublehand' }
  | { kind: 'brawler' }
  | { kind: 'halveMp' }
  | { kind: 'medicine' }                        // items heal 1.5×
  | { kind: 'evasiveStance' }
  | { kind: 'magicBoostHeal' }                  // heals +33%
  | { kind: 'beastTongue' }
  | { kind: 'poach' }
  | { kind: 'treasureSense' }
  | { kind: 'tame' }
  // movement
  | { kind: 'move'; amount: number }
  | { kind: 'jump'; amount: number }
  | { kind: 'ignoreHeight' }
  | { kind: 'teleport' }
  | { kind: 'waterwalk' }
  | { kind: 'float' }
  | { kind: 'swim' }
  | { kind: 'lifefont' }
  | { kind: 'manafont' }
  | { kind: 'accrueJp' }
  | { kind: 'accrueExp' }
  | { kind: 'fly' };

export interface StatBlock { hp: number; mp: number; sp: number; pa: number; ma: number }

export interface JobDef {
  id: string;
  name: string;
  description: string;
  /** Skillset name shown in menus (e.g. "Arts of War"). */
  skillsetName: string;
  /** Ability ids, in menu order: actions, then reactions, supports, movement. */
  abilities: string[];
  /** Always-on passives (not slot-consuming), e.g. Monk innate Brawler. */
  innate?: string[];
  equips: EquipCategory[];
  /** Percent multipliers applied to raw stats. */
  mult: StatBlock;
  /** Growth constants: lower = faster growth. */
  growth: StatBlock;
  move: number;
  jump: number;
  cev: number;
  /** Job unlock requirements (job id → level). Empty = available from start. */
  requires: Record<string, number>;
  /** Visual outfit layers by body type (under equipment). */
  outfit: Partial<Record<BodyType, LayerRef[]>> & { all?: LayerRef[] };
  /** Story/monster jobs are not selectable by generic units. */
  special?: 'story' | 'monster';
  /** Monster jobs: fixed innate statuses. */
  innateStatus?: StatusId[];
  /** Elemental affinities innate to the job (monsters mostly). */
  elements?: ElementAffinity;
  /** Innate status immunities. */
  immune?: StatusId[];
  /** Creature traits: hollow (ignores Faith except Holy), undead, heavy (no knockback). */
  traits?: ('hollow' | 'undead' | 'heavy' | 'beast')[];
  /** Can this job use the generic Attack command. */
  noAttack?: boolean;
  /** Default weapon family visual for monsters that are unarmed. */
  icon?: string;
}

export interface ElementAffinity {
  weak?: Element[];
  half?: Element[];
  immune?: Element[];
  absorb?: Element[];
  strengthen?: Element[];
}

export type ItemType = 'weapon' | 'shield' | 'head' | 'body' | 'accessory' | 'consumable';

export interface ItemDef {
  id: string;
  name: string;
  description?: string;
  type: ItemType;
  category: EquipCategory | 'consumable';
  price: number;
  /** Rough tier used for shops / auto-equip / loot. */
  tier: number;
  // weapon
  wp?: number;
  /** Weapon hit/evade bonus (parry chance with Parry reaction). */
  wev?: number;
  element?: Element;
  twoHanded?: boolean;
  /** Range override (default by family). */
  range?: number;
  /** Chance to cast an ability on hit (rods/staves). */
  proc?: { ability: string; chance: number };
  onHit?: { status: StatusId; chance: number };
  // armour
  hp?: number;
  mp?: number;
  pev?: number;       // physical evade (shields, accessories)
  mev?: number;       // magic evade
  bonus?: Partial<{ pa: number; ma: number; sp: number; move: number; jump: number; brave: number; faith: number }>;
  autoStatus?: StatusId[];
  immune?: StatusId[];
  elements?: ElementAffinity;
  // consumable
  effects?: Effect[];
  targetsKO?: boolean;
  /** Sprite layers shown when equipped. */
  visual?: LayerRef[];
  /** Hide the job's hat/hair layer when equipped (helmets). */
  hidesHair?: boolean;
  /** Not sold in shops (loot/story/rare). */
  rare?: boolean;
}

export interface StatusDef {
  id: StatusId;
  name: string;
  description: string;
  /** Duration in clock ticks when applied; 0 = until removed. */
  duration: number;
  positive: boolean;
  /** Turn-skipping statuses. */
  skipTurn?: boolean;
  /** CT doesn't increase. */
  freezeCt?: boolean;
  noMove?: boolean;
  noAct?: boolean;
  noMagic?: boolean;
  /** Counts as out of the fight for victory checks. */
  incapacitating?: boolean;
  /** Removed when taking physical damage. */
  breaksOnHit?: boolean;
  /** Mutually exclusive statuses removed when this one is added. */
  cancels?: StatusId[];
  color: string;
}
