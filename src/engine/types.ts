/**
 * Battle engine state. Everything here must stay plain JSON (no classes, Maps,
 * functions or undefined-sensitive logic) so it can be sent over the network,
 * saved, hashed and replayed.
 */
import type { Appearance, EquipSlot, VictoryCondition } from '../content/schema';
import type { Element, StatusId } from '../content/types';

export type Dir = 'n' | 'e' | 's' | 'w';
export type Team = 'player' | 'enemy' | 'ally' | 'neutral';
export type Pos = [number, number];

export type Terrain =
  | 'grass' | 'tallgrass' | 'dirt' | 'road' | 'stone' | 'brick' | 'sand' | 'water' | 'deepwater'
  | 'wood' | 'snow' | 'swamp' | 'roof' | 'cave' | 'lava' | 'thatch' | 'slate' | 'ash' | 'void';

export interface Tile {
  h: number;             // height in half-steps
  t: Terrain;
  prop?: string;         // prop type id
  /** Prop blocks standing on this tile. */
  blocked?: boolean;
}

export interface BattleMap {
  id: string;
  name: string;
  w: number;
  h: number;
  /** tiles[y * w + x] */
  tiles: Tile[];
  theme: string;
}

/** Persistent character build (lives in the roster / save / online preset). */
export interface UnitBuild {
  id: string;
  name: string;
  /** Story character id if this is a named character. */
  character?: string;
  appearance: Appearance;
  level: number;
  exp: number;
  /** Hidden raw stats (×1 scale, see DESIGN growth). */
  raw: { hp: number; mp: number; sp: number; pa: number; ma: number };
  brave: number;
  faith: number;
  job: string;
  /** Per-job progress. */
  jobs: Record<string, { jp: number; total: number; learned: string[] }>;
  secondary?: string;     // job id whose skillset is slotted
  reaction?: string;      // ability ids
  support?: string;
  movement?: string;
  equipment: Partial<Record<EquipSlot, string>>;
  /** Monster / special flags. */
  essential?: boolean;
  zodiac?: number;
}

export interface StatusInstance {
  id: StatusId;
  /** Clock ticks remaining; 0 = permanent until removed. */
  ticks: number;
  /** Doom / KO countdown in turns. */
  count?: number;
}

export interface PendingAction {
  id: number;
  unit: string;
  ability: string;
  item?: string;
  /** Target: either a tile or a unit (follows the unit). */
  target: { tile: Pos } | { unit: string };
  /** Ticks remaining before resolution. */
  ticks: number;
}

export interface BattleUnit {
  uid: string;                // unique in battle
  build: UnitBuild;
  team: Team;
  /** Player-controlled (vs AI). */
  control: 'human' | 'ai';
  /** Online: which player owns this unit (0/1...). */
  owner?: number;
  ai?: string;
  pos: Pos;
  facing: Dir;
  hp: number;
  mp: number;
  ct: number;
  statuses: StatusInstance[];
  /** In-battle stat modifiers (from abilities). */
  mods: { pa: number; ma: number; sp: number; brave: number; faith: number; move: number };
  /** Battle Oath sworn before the fight. */
  oath?: { id: string; state: 'sworn' | 'kept' | 'broken'; startFoeDist?: number };
  /** Equipment destroyed/stolen this battle. */
  lostEquip: EquipSlot[];
  /** Spawn hidden until a trigger reveals it. */
  hidden?: boolean;
  /** Left the battle (crystallised, fled, treasure). */
  gone?: boolean;
  spawnId?: string;
  /** Per-battle rewards accrued for this unit. */
  earned: { exp: number; jp: number; spill: Record<string, number> };
  /** Times this unit has taken a turn. */
  turns: number;
  guest?: boolean;
  /** Withdraws instead of being KO'd. */
  retreat?: boolean;
  /** Cannot be targeted and skips its turns. */
  untargetable?: boolean;
  /** Undead that already rose once this battle. */
  risen?: boolean;
  /** Abilities learned this battle (from crystals etc.). */
}

export interface TurnState {
  unit: string;
  moved: boolean;
  acted: boolean;
  /** Position at the start of the turn (for undoing a move before acting). */
  startPos: Pos;
  startFacing: Dir;
  /** Moving this turn can be undone only if nothing random happened. */
  canUndoMove: boolean;
}

export interface BattleRules {
  /** Units are lost forever when crystallised. */
  permadeath: boolean;
  /** KO countdown turns before crystallising. */
  koCount: number;
  /** AI skill: 0 easy … 2 hard. */
  aiLevel: number;
  /** JP spillover fraction to allies. */
  spill: number;
}

export interface BattleState {
  version: 1;
  seed: number;
  rng: number;
  tick: number;
  map: BattleMap;
  units: BattleUnit[];
  pending: PendingAction[];
  nextPendingId: number;
  turn: TurnState | null;
  /** Shared consumable inventories by team. */
  inventory: Record<string, Record<string, number>>;
  gil: Record<string, number>;
  victory: VictoryCondition;
  defeat: VictoryCondition[];
  /** Trigger ids that have fired. */
  fired: string[];
  triggers: EngineTrigger[];
  rules: BattleRules;
  phase: 'deploy' | 'battle' | 'victory' | 'defeat';
  /** Number of turns taken in total (for 'turn' triggers counting player turns). */
  turnCount: number;
  /** Command log for replays / netcode. */
  log: Command[];
  /** Items/loot gained this battle. */
  loot: string[];
  /** Units lost permanently this battle (build ids). */
  lost: string[];
}

/** Engine-side trigger (condition only; UI decides what to play). */
export interface EngineTrigger {
  id: string;
  when: import('../content/schema').BattleTrigger['when'];
  reveal?: string[];
  scene?: string;
  once?: boolean;
}

// ---------------------------------------------------------------------------
// Commands (player/AI input) and events (what happened, for animation)
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'deploy'; placements: { uid: string; pos: Pos; facing: Dir; oath?: string }[] }
  | { type: 'move'; unit: string; to: Pos }
  | { type: 'undoMove'; unit: string }
  | { type: 'act'; unit: string; ability: string; target: Pos; item?: string }
  | { type: 'wait'; unit: string; facing: Dir };

export type BattleEvent =
  | { e: 'turn'; unit: string }
  | { e: 'move'; unit: string; path: Pos[]; teleport?: boolean }
  | { e: 'face'; unit: string; dir: Dir }
  | { e: 'action'; unit: string; ability: string; target: Pos; item?: string; affected: string[]; reaction?: boolean }
  | { e: 'charge'; unit: string; ability: string; target: Pos; pending: number }
  | { e: 'chargeCancel'; unit: string; ability: string }
  | { e: 'jumpUp'; unit: string }
  | { e: 'jumpDown'; unit: string; to: Pos }
  | { e: 'damage'; unit: string; amount: number; mp?: boolean; crit?: boolean; element?: Element; weak?: boolean; resist?: boolean }
  | { e: 'heal'; unit: string; amount: number; mp?: boolean }
  | { e: 'absorb'; unit: string; amount: number }
  | { e: 'miss'; unit: string; blocked?: 'evade' | 'shield' | 'parry' | 'guard' | 'immune' | 'reflect' }
  | { e: 'status'; unit: string; status: StatusId; added: boolean }
  | { e: 'stat'; unit: string; stat: string; amount: number }
  | { e: 'ko'; unit: string }
  | { e: 'revive'; unit: string }
  | { e: 'crystal'; unit: string }
  | { e: 'countdown'; unit: string; count: number }
  | { e: 'break'; unit: string; slot: EquipSlot; item: string }
  | { e: 'steal'; unit: string; from: string; what: string; amount?: number }
  | { e: 'knockback'; unit: string; to: Pos; fall: number }
  | { e: 'reaction'; unit: string; ability: string }
  | { e: 'reflect'; unit: string; to: Pos }
  | { e: 'reveal'; unit: string }
  | { e: 'trigger'; id: string; scene?: string }
  | { e: 'ct'; unit: string }
  | { e: 'text'; unit: string; text: string; color?: string }
  | { e: 'loot'; item: string }
  | { e: 'retreat'; unit: string }
  | { e: 'oath'; unit: string; oath: string; state: 'sworn' | 'kept' | 'broken' }
  | { e: 'end'; result: 'victory' | 'defeat' };
