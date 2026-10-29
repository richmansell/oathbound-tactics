/**
 * Game-level animation mapping: picks the LPC sheet animation, frame sequence and timing for a
 * game action, letting the equipped weapon decide the attack motion, and falling back when some
 * equipped items lack an animation (many legacy LPC items have no idle/jump/emote sheets).
 */
import type { BodyType } from '../../content/schema';
import { type Catalog, type SheetAnim, getCatalogIfLoaded, itemOwnAnims } from './catalog';

export type GameAnim =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'cast'
  | 'item'
  | 'shoot'
  | 'hurt'
  | 'ko'
  | 'jump'
  | 'victory'
  | 'kneel'
  /** Collapse: hurt played through, last frame held (then show `ko`). */
  | 'die';

export const GAME_ANIMS: readonly GameAnim[] = [
  'idle', 'walk', 'attack', 'cast', 'item', 'shoot', 'hurt', 'ko', 'jump', 'victory', 'kneel', 'die',
];

export interface AnimPlan {
  gameAnim: GameAnim;
  anim: SheetAnim;
  /** Column indices to show, in order. */
  frames: number[];
  /** Duration of each entry of `frames`. */
  frameMs: number;
  /** Loop forever, or play once and hold the last frame. */
  loop: boolean;
  /** Index into `frames` where the action lands (hit, release, cast) — for damage popups/VFX. */
  impact?: number;
  /** False when the sheet has a single row (hurt): direction is ignored. */
  directional: boolean;
  /** Whether every equipped item has this animation (false = best effort; some layer is missing). */
  complete: boolean;
}

interface Candidate {
  anim: SheetAnim;
  frames: number[];
  frameMs: number;
  loop: boolean;
  impact?: number;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const C = {
  walk: { anim: 'walk', frames: range(1, 8), frameMs: 95, loop: true },
  walk128: { anim: 'walk_128', frames: range(1, 8), frameMs: 95, loop: true },
  idle: { anim: 'idle', frames: [0, 0, 1], frameMs: 380, loop: true },
  combatIdle: { anim: 'combat_idle', frames: [0, 0, 1], frameMs: 380, loop: true },
  stand: { anim: 'walk', frames: [0], frameMs: 1000, loop: true },
  stand128: { anim: 'walk_128', frames: [0], frameMs: 1000, loop: true },
  slash: { anim: 'slash', frames: range(0, 5), frameMs: 85, loop: false, impact: 3 },
  slashOversize: { anim: 'slash_oversize', frames: range(0, 5), frameMs: 85, loop: false, impact: 3 },
  slashReverse: { anim: 'slash_reverse_oversize', frames: range(0, 5), frameMs: 85, loop: false, impact: 3 },
  slash128: { anim: 'slash_128', frames: range(0, 5), frameMs: 85, loop: false, impact: 3 },
  backslash128: { anim: 'backslash_128', frames: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12], frameMs: 60, loop: false, impact: 8 },
  halfslash128: { anim: 'halfslash_128', frames: range(0, 5), frameMs: 85, loop: false, impact: 3 },
  backslash: { anim: 'backslash', frames: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12], frameMs: 60, loop: false, impact: 8 },
  halfslash: { anim: 'halfslash', frames: range(0, 5), frameMs: 85, loop: false, impact: 3 },
  thrust: { anim: 'thrust', frames: range(0, 7), frameMs: 75, loop: false, impact: 5 },
  thrustOversize: { anim: 'thrust_oversize', frames: range(0, 7), frameMs: 75, loop: false, impact: 5 },
  thrust128: { anim: 'thrust_128', frames: range(0, 7), frameMs: 75, loop: false, impact: 5 },
  shoot: { anim: 'shoot', frames: range(0, 12), frameMs: 70, loop: false, impact: 9 },
  spellcast: { anim: 'spellcast', frames: range(0, 6), frameMs: 110, loop: false, impact: 5 },
  itemUse: { anim: 'spellcast', frames: [0, 1, 2, 3, 3, 3], frameMs: 110, loop: false, impact: 3 },
  hurt: { anim: 'hurt', frames: [0, 1, 1, 1, 0], frameMs: 90, loop: false, impact: 1 },
  die: { anim: 'hurt', frames: range(0, 5), frameMs: 130, loop: false, impact: 5 },
  ko: { anim: 'hurt', frames: [5], frameMs: 1000, loop: true },
  kneel: { anim: 'hurt', frames: [3], frameMs: 1000, loop: true },
  jump: { anim: 'jump', frames: range(0, 4), frameMs: 90, loop: false, impact: 2 },
  victory: { anim: 'emote', frames: [0, 1, 2], frameMs: 220, loop: false, impact: 2 },
  victoryJump: { anim: 'jump', frames: [0, 1, 2, 3, 4, 0], frameMs: 110, loop: false, impact: 2 },
} satisfies Record<string, Candidate>;

const ATTACK: Record<'slash' | 'thrust' | 'shoot' | 'unarmed', Candidate[]> = {
  slash: [C.slashOversize, C.slash128, C.slash, C.slashReverse, C.backslash128, C.halfslash128, C.backslash, C.halfslash],
  thrust: [C.thrustOversize, C.thrust128, C.thrust],
  shoot: [C.shoot],
  unarmed: [C.thrust, C.slash, C.halfslash],
};

function candidatesFor(gameAnim: GameAnim, style: keyof typeof ATTACK): Candidate[] {
  switch (gameAnim) {
    case 'idle': return [C.idle, C.combatIdle, C.stand, C.stand128];
    case 'walk': return [C.walk, C.walk128];
    case 'attack': return ATTACK[style];
    case 'cast': return [C.spellcast, C.thrustOversize, C.thrust128, C.thrust];
    case 'item': return [C.itemUse, C.thrust, C.slash, C.thrustOversize, C.thrust128, C.slashOversize, C.slash128];
    case 'shoot': return [C.shoot];
    case 'hurt': return [C.hurt];
    case 'die': return [C.die];
    case 'ko': return [C.ko];
    case 'kneel': return [C.kneel];
    case 'jump': return [C.jump, C.stand, C.stand128];
    case 'victory': return [C.victory, C.victoryJump, { ...C.spellcast, frames: [0, 1, 2, 3], loop: false }];
  }
}

/** Cross-family last resorts, only used when no candidate is complete (least-missing search). */
function lastResorts(gameAnim: GameAnim): Candidate[] {
  switch (gameAnim) {
    case 'attack': return [C.slash, C.thrust, C.halfslash, { ...C.spellcast, impact: 4 }];
    case 'cast': return [C.slash, C.halfslash];
    case 'item': return [C.halfslash];
    case 'shoot': return [C.thrust, C.slash];
    case 'jump': return [C.walk];
    default: return [];
  }
}

export interface ResolveAnimOptions {
  catalog?: Catalog;
  /** Body type (for weapon coverage lookups). Default male. */
  body?: BodyType;
  /**
   * Predicate telling whether every equipped item covers an animation (CharacterSheet passes
   * this). Without it, the weapon's own coverage decides.
   */
  available?: (anim: SheetAnim) => boolean;
  /**
   * How badly an animation is broken: weighted count of equipped items lacking it (Infinity =
   * unusable). Used to pick the least broken candidate when none is complete.
   */
  missingCount?: (anim: SheetAnim) => number;
}

/** Attack motion family for a weapon key (undefined weapon → unarmed). */
export function attackStyle(weaponKey: string | null | undefined, catalog?: Catalog | null): keyof typeof ATTACK {
  if (!weaponKey) return 'unarmed';
  const item = (catalog ?? getCatalogIfLoaded())?.items[weaponKey];
  if (item?.attack) return item.attack;
  if (/bow|sling/.test(weaponKey)) return 'shoot';
  if (/spear|trident|halberd|magic|crossbow/.test(weaponKey)) return 'thrust';
  return 'slash';
}

/**
 * Resolve a game animation to a sheet animation + frames. The weapon decides the attack style
 * (sword/axe/mace → slash, oversize slash when the weapon has it; spear/staff/crossbow → thrust;
 * bow → shoot; unarmed → thrust/slash). `ko` holds the last frame of hurt.
 */
export function resolveAnim(gameAnim: GameAnim, weaponKey?: string | null, opts: ResolveAnimOptions = {}): AnimPlan {
  const catalog = opts.catalog ?? getCatalogIfLoaded();
  const body = opts.body ?? 'male';
  const cands = candidatesFor(gameAnim, attackStyle(weaponKey, catalog));
  const weaponAnims = weaponKey && catalog ? itemOwnAnims(catalog, weaponKey, body) : null;
  // Without a full character, the weapon's own sheets decide (custom anims only when it owns them).
  const weaponHas = (a: SheetAnim): boolean => !weaponAnims || weaponAnims.has(a);
  let pick: Candidate | undefined;
  let complete = false;
  if (opts.available) {
    pick = cands.find((c) => opts.available!(c.anim));
    complete = !!pick;
  }
  if (!pick && opts.missingCount) {
    let best = Infinity;
    for (const c of [...cands, ...lastResorts(gameAnim)]) {
      const m = opts.missingCount(c.anim);
      if (m < best) { best = m; pick = c; }
    }
    complete = best === 0;
  }
  if (!pick && weaponAnims && weaponAnims.size) pick = cands.find((c) => weaponHas(c.anim));
  if (!pick) pick = cands[0];
  if (!opts.available) complete = weaponHas(pick.anim);
  const geo = catalog?.animations[pick.anim];
  const maxFrame = geo ? geo.frames - 1 : Infinity;
  return {
    gameAnim,
    anim: pick.anim,
    frames: pick.frames.map((f) => Math.min(f, maxFrame)),
    frameMs: pick.frameMs,
    loop: pick.loop,
    ...(pick.impact !== undefined ? { impact: pick.impact } : {}),
    directional: geo ? geo.rows > 1 : pick.anim !== 'hurt',
    complete,
  };
}

/** Frame column to show `elapsedMs` into a plan, and whether a non-looping plan has finished. */
export function frameAt(plan: AnimPlan, elapsedMs: number): { frame: number; index: number; done: boolean } {
  const n = plan.frames.length;
  const step = Math.max(0, Math.floor(elapsedMs / plan.frameMs));
  if (plan.loop) {
    const index = step % n;
    return { frame: plan.frames[index], index, done: false };
  }
  const index = Math.min(step, n - 1);
  return { frame: plan.frames[index], index, done: step >= n };
}

/** Total duration of a non-looping plan (one cycle for looping plans). */
export function planDuration(plan: AnimPlan): number {
  return plan.frames.length * plan.frameMs;
}
