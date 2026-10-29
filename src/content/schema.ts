/**
 * Content-pack schema. A CampaignPack is a self-contained, purchasable story
 * (the base game ships one). Everything is plain data referenced by id so packs
 * can be downloaded, versioned and validated independently of the engine.
 */

/** Talking-head expressions every story portrait must provide. */
export type Expression =
  | 'neutral'
  | 'happy'
  | 'angry'
  | 'sad'
  | 'surprised'
  | 'determined'
  | 'hurt'
  | 'smirk';

export const EXPRESSIONS: Expression[] = [
  'neutral', 'happy', 'angry', 'sad', 'surprised', 'determined', 'hurt', 'smirk',
];

export type BodyType = 'male' | 'female' | 'muscular';

/**
 * How a character looks. Layer keys refer to entries in the sprite catalogue
 * (public/assets/lpc/catalog.json). Colours are palette variant names
 * (e.g. skin "light", hair "chestnut", cloth "navy", metal "steel").
 */
export interface Appearance {
  body: BodyType;
  skin: string;
  head?: string;             // head layer key, default human head for body type
  hair?: string;             // hair layer key or undefined for bald
  hairColor?: string;
  beard?: string;
  eyes?: string;             // eye colour variant
  ears?: string;             // e.g. elven ears
  /** Outfit overrides by slot — applied under equipment (job outfits fill the rest). */
  outfit?: Partial<Record<OutfitSlot, LayerRef>>;
  /**
   * Job the personal outfit belongs to. While the unit is in another job, that
   * job's clothing wins for torso/legs/feet/hat (accessories still show).
   */
  outfitJob?: string;
  /** Cosmetic dyes: catalogue item key → colour, applied to job outfit and equipment layers. */
  dyes?: Record<string, string>;
  /** Portrait-only details (scars, freckles, eyepatch...). */
  portrait?: PortraitExtras;
}

export type OutfitSlot = 'torso' | 'legs' | 'feet' | 'hands' | 'waist' | 'cape' | 'neck' | 'hat';

export interface LayerRef {
  key: string;               // catalogue item key
  color?: string;            // palette variant / file variant
  color2?: string;           // secondary recolour channel if item has one
}

export interface PortraitExtras {
  scar?: 'left-cheek' | 'right-eye' | 'nose' | 'lip';
  freckles?: boolean;
  eyepatch?: 'left' | 'right';
  age?: 'young' | 'adult' | 'old';
  build?: 'slight' | 'average' | 'broad';
  markings?: string;         // free text for bespoke portrait art
}

/** A named story character (or recurring enemy). */
export interface CharacterDef {
  id: string;
  name: string;
  /** Short name shown in dialogue boxes. */
  displayName?: string;
  title?: string;            // e.g. "Captain of the Ashguard"
  appearance: Appearance;
  job: string;               // job id
  level?: number;
  brave?: number;
  faith?: number;
  /** Ability ids pre-learned, keyed by job id. */
  learned?: Record<string, string[]>;
  equipment?: Partial<Record<EquipSlot, string>>; // item ids
  /** Free-form notes for voice actors (age, accent, tone). */
  voice?: string;
  /** Character may join the player party. */
  recruitable?: boolean;
  /** Cannot be permanently lost; battle is lost if KO'd and crystallised. */
  essential?: boolean;
}

export type EquipSlot = 'main' | 'off' | 'head' | 'body' | 'accessory';

// ---------------------------------------------------------------------------
// Scenes (cutscenes with talking heads)
// ---------------------------------------------------------------------------

/**
 * Every line carries a stable `id` used as the voice-over key:
 *   `<pack>.<chapter>.<scene>.<nnn>`  e.g. "main.c1.s02.014"
 * Audio files will live at `voice/<locale>/<id>.ogg`. Never renumber
 * existing ids when editing — append new ids or use suffixes (014a).
 */
export type SceneStep =
  | DialogueLine
  | NarrationLine
  | ChoiceStep
  | StageStep
  | FlagStep
  | LabelStep
  | GotoStep;

export interface DialogueLine {
  kind: 'line';
  id: string;
  speaker: string;           // CharacterDef id, or a generic speaker id like "bandit_a"
  /** Override name shown in the box (e.g. "???" before a reveal). */
  name?: string;
  expression?: Expression;
  /** Which side the portrait appears on. Defaults by speaker order. */
  side?: 'left' | 'right';
  text: string;
  /** Delivery note for voice actors / text animation. */
  direction?: string;
  /** Text effect: shout shakes the box, whisper is small/italic. */
  style?: 'normal' | 'shout' | 'whisper' | 'thought';
}

export interface NarrationLine {
  kind: 'narration';
  id: string;
  text: string;
  direction?: string;
}

export interface ChoiceStep {
  kind: 'choice';
  id: string;
  speaker?: string;
  prompt?: string;
  options: { text: string; setFlag?: string; goto?: string }[];
}

/** Sprite actions on the scene's map (FFT-style event staging). */
export interface StageStep {
  kind: 'stage';
  action:
    | 'place'      // put actor at tile instantly
    | 'walk'       // walk along path to tile
    | 'face'       // turn to direction
    | 'exit'       // walk off / fade out
    | 'anim'       // play animation: slash, spellcast, hurt, emote, jump, thrust, shoot
    | 'emote'      // overhead bubble: '!' '?' '...' 'heart' 'anger' 'sweat'
    | 'camera'     // pan camera to tile
    | 'shake'      // screen shake
    | 'flash'      // screen flash (colour)
    | 'fade'       // fade in/out
    | 'wait'       // pause ms
    | 'music'      // change music track
    | 'sfx'        // play sound effect
    | 'background';// change backdrop (location id) for map-less scenes
  actor?: string;
  to?: [number, number];
  dir?: 'n' | 'e' | 's' | 'w';
  value?: string;
  ms?: number;
}

export interface FlagStep { kind: 'flag'; set?: string; clear?: string }
export interface LabelStep { kind: 'label'; name: string }
export interface GotoStep { kind: 'goto'; label: string; ifFlag?: string; ifNotFlag?: string }

export interface SceneDef {
  id: string;                // e.g. "c1.s02"
  title?: string;
  /** Location (for backdrop + map). If `map` set, scene is staged on that map. */
  location: string;
  map?: string;
  music?: string;
  /** Actors placed on the map at scene start: actorId -> [x, y, dir]. */
  actors?: Record<string, { character: string; at: [number, number]; dir?: 'n' | 'e' | 's' | 'w' }>;
  steps: SceneStep[];
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

export type VictoryCondition =
  | { type: 'defeatAll' }
  | { type: 'defeatTarget'; target: string }
  | { type: 'protect'; target: string }
  | { type: 'survive'; turns: number }
  | { type: 'reach'; tiles: [number, number][]; who?: string }
  | { type: 'escape'; tiles: [number, number][]; who?: string[] };

export interface BattleUnitSpawn {
  /** Story character id, or a generic template id from content/enemies. */
  character?: string;
  template?: string;
  name?: string;
  level?: number | 'party';  // 'party' = scale to party average
  at: [number, number];
  dir?: 'n' | 'e' | 's' | 'w';
  team: 'player' | 'enemy' | 'ally' | 'neutral';
  /** AI personality for non-player units. */
  ai?: 'aggressive' | 'defensive' | 'support' | 'coward' | 'boss' | 'guard';
  /** Joins player control mid-battle or after. */
  guest?: boolean;
  hidden?: boolean;          // appears via trigger
  /** Named boss withdraws instead of being KO'd (Jory, Ilka). */
  retreat?: boolean;
  /** Present but cannot be targeted and does not act (story presence). */
  untargetable?: boolean;
}

export interface BattleTrigger {
  id: string;
  when:
    | { type: 'start' }
    | { type: 'turn'; turn: number }
    | { type: 'unitHp'; unit: string; below: number }   // percent
    | { type: 'unitDefeated'; unit: string }
    | { type: 'enemiesLeft'; count: number }
    | { type: 'tileReached'; tiles: [number, number][]; team?: 'player' | 'enemy' }
    | { type: 'victory' }
    | { type: 'defeat' };
  /** Scene to play (talking heads over the battlefield). */
  scene?: string;
  /** Units to reveal (spawn ids). */
  reveal?: string[];
  once?: boolean;
}

export interface BattleDef {
  id: string;
  title: string;
  location: string;
  map: string;
  music?: string;
  /** Tiles the player may deploy units on. */
  deployTiles: [number, number][];
  maxDeploy: number;
  /** Party members who must deploy. */
  required?: string[];
  victory: VictoryCondition;
  /** Extra loss conditions besides party wipe. */
  defeat?: VictoryCondition[];
  units: (BattleUnitSpawn & { id: string })[];
  triggers?: BattleTrigger[];
  rewards?: { gil?: number; items?: string[]; unlockShop?: string[] };
  /** Scenes before/after. */
  introScene?: string;
  outroScene?: string;
  /** Optional skirmish battles are repeatable for JP/EXP. */
  repeatable?: boolean;
}

// ---------------------------------------------------------------------------
// World map + campaign
// ---------------------------------------------------------------------------

export interface WorldNode {
  id: string;
  name: string;
  kind: 'town' | 'battle' | 'landmark' | 'castle';
  pos: [number, number];     // 0..1000 coordinates on the world map image
  /** Description shown when selected. */
  blurb?: string;
  shop?: string;             // shop id (towns)
  tavern?: boolean;
  /** Random skirmish table for repeatable fights here. */
  skirmishes?: string[];
}

export interface WorldEdge { from: string; to: string; }

export interface ChapterDef {
  id: string;                // "c1"
  number: number;
  title: string;
  /** Ordered story beats; each beat is a scene, battle, or unlock. */
  beats: StoryBeat[];
}

export type StoryBeat =
  | { kind: 'scene'; scene: string; at?: string }                 // at = world node to visit
  | { kind: 'battle'; battle: string; at: string }
  | { kind: 'unlockNode'; node: string }
  | { kind: 'join'; character: string }
  | { kind: 'leave'; character: string }
  | { kind: 'shop'; shop: string; items: string[] }
  | { kind: 'title'; text: string; subtitle?: string }            // chapter title card
  | { kind: 'unlockJob'; character: string; job: string }
  | { kind: 'flag'; set?: string; clear?: string }
  | { kind: 'end'; text?: string };

export interface LocationDef {
  id: string;
  name: string;
  /** Backdrop style for map-less scenes. */
  backdrop: 'castle-hall' | 'forest' | 'village' | 'abbey' | 'camp-night' | 'road' | 'tavern' | 'bridge' | 'keep' | 'dungeon' | 'snow' | 'swamp' | 'black';
  description?: string;
}

export interface CampaignPack {
  id: string;                // "main"
  title: string;
  subtitle?: string;
  version: string;
  /** For purchasable packs; base game omits. */
  store?: { sku: string; priceTier: string; blurb: string };
  characters: Record<string, CharacterDef>;
  locations: Record<string, LocationDef>;
  scenes: Record<string, SceneDef>;
  battles: Record<string, BattleDef>;
  chapters: ChapterDef[];
  world: { nodes: WorldNode[]; edges: WorldEdge[]; start: string };
  /** Initial party (character ids). */
  startingParty: string[];
}
