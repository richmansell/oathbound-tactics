/** Which tiles an ability can target, and which units an AoE touches. */
import { ABILITIES } from '../content/abilities';
import type { AbilityDef } from '../content/types';
import { DIR_VEC, DIRS, dirTo, manhattan, tileAt } from './grid';
import { isAlive, isAllied, unitAt } from './movement';
import { deriveStats, statusActive, weaponRange } from './units';
import type { BattleState, BattleUnit, Pos } from './types';

export function abilityRangeSpec(u: BattleUnit, ab: AbilityDef): { min: number; max: number; vertical: number; line?: boolean; arc?: boolean; self?: boolean } {
  const r = ab.range ?? { type: 'self' as const };
  if (r.type === 'self') return { min: 0, max: 0, vertical: 0, self: true };
  if (r.type === 'weapon') {
    const s = deriveStats(u.build, u);
    return weaponRange(s.family, s.weapon);
  }
  let max = r.max;
  // Throw Items extends item range.
  if (ab.consumes && u.build.support === 'throw_items') max = 4;
  return { min: r.min ?? 0, max, vertical: r.vertical ?? 99, line: r.line };
}

/** Tiles the ability may be aimed at from `from` (default: unit position). */
export function rangeTiles(state: BattleState, u: BattleUnit, abilityId: string, from: Pos = u.pos): Pos[] {
  const ab = ABILITIES[abilityId];
  const spec = abilityRangeSpec(u, ab);
  if (spec.self) return [from];
  const origin = tileAt(state.map, from[0], from[1]);
  if (!origin) return [];
  const out: Pos[] = [];
  // Bows gain range from height advantage: +1 per 2 half-steps above target.
  const reach = spec.max + (spec.arc ? 6 : 0);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < spec.min || d > reach) continue;
      if (spec.line && dx !== 0 && dy !== 0) continue;
      const x = from[0] + dx, y = from[1] + dy;
      const t = tileAt(state.map, x, y);
      if (!t) continue;
      const dh = t.h - origin.h;
      if (Math.abs(dh) > spec.vertical) continue;
      if (spec.arc) {
        const bonus = Math.floor((origin.h - t.h) / 2);
        if (d > spec.max + Math.max(-2, bonus)) continue;
      }
      out.push([x, y]);
    }
  }
  return out;
}

/** Tiles covered when the ability is aimed at `center`. */
export function aoeTiles(state: BattleState, caster: BattleUnit, abilityId: string, center: Pos, casterPos: Pos = caster.pos): Pos[] {
  const ab = ABILITIES[abilityId];
  const aoe = ab.aoe;
  const ct = tileAt(state.map, center[0], center[1]);
  if (!ct) return [];
  if (!aoe || aoe.radius === 0) return [center];
  if (aoe.shape === 'line') {
    const dir = dirTo(casterPos, center);
    const [vx, vy] = DIR_VEC[dir];
    const base = tileAt(state.map, casterPos[0], casterPos[1]);
    const out: Pos[] = [];
    for (let i = 1; i <= aoe.radius; i++) {
      const x = casterPos[0] + vx * i, y = casterPos[1] + vy * i;
      const t = tileAt(state.map, x, y);
      if (!t) break;
      if (base && Math.abs(t.h - base.h) > aoe.vertical) continue;
      out.push([x, y]);
    }
    return out;
  }
  if (aoe.shape === 'all') {
    const out: Pos[] = [];
    for (let y = 0; y < state.map.h; y++) for (let x = 0; x < state.map.w; x++) if (tileAt(state.map, x, y)) out.push([x, y]);
    return out;
  }
  const out: Pos[] = [];
  for (let dy = -aoe.radius; dy <= aoe.radius; dy++) {
    for (let dx = -aoe.radius; dx <= aoe.radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > aoe.radius) continue;
      if (aoe.shape === 'cross' && dx !== 0 && dy !== 0) continue;
      const x = center[0] + dx, y = center[1] + dy;
      const t = tileAt(state.map, x, y);
      if (!t) continue;
      if (Math.abs(t.h - ct.h) > aoe.vertical) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/** True if a unit can be singled out by a targeted ability. */
export function targetable(state: BattleState, u: BattleUnit): boolean {
  if (u.untargetable) return false;
  if (statusActive(u, 'vanish') || statusActive(u, 'invisible')) return false;
  if (state.pending.some((p) => p.unit === u.uid && ABILITIES[p.ability]?.jump)) return false;
  return true;
}

/** Units affected by an ability aimed at `center`. */
export function affectedUnits(state: BattleState, caster: BattleUnit, abilityId: string, center: Pos, casterPos: Pos = caster.pos): BattleUnit[] {
  const ab = ABILITIES[abilityId];
  const tiles = aoeTiles(state, caster, abilityId, center, casterPos);
  const single = !ab.aoe || ab.aoe.radius === 0;
  const selfCentredHostile = ab.range?.type === 'self' && !!ab.aoe && ab.aoe.radius > 0 && (ab.affects === 'enemy' || ab.affects === 'any') && (ab.ai === 'damage' || ab.ai === 'debuff');
  const out: BattleUnit[] = [];
  for (const p of tiles) {
    const v = unitAt(state, p);
    if (!v) continue;
    if (v.uid === caster.uid && selfCentredHostile) continue;
    if (v.untargetable) continue;
    const alive = isAlive(v);
    if (ab.targetsKO) {
      if (!statusActive(v, 'ko')) continue;
    } else if (!alive) continue;
    if (single && !targetable(state, v) && v.uid !== caster.uid) continue;
    if (state.pending.some((pa) => pa.unit === v.uid && ABILITIES[pa.ability]?.jump)) continue;
    const affects = ab.affects ?? 'any';
    if (!single || ab.target === 'tile') {
      if (affects === 'enemy' && isAllied(v, caster)) continue;
      if (affects === 'ally' && !isAllied(v, caster)) continue;
    }
    out.push(v);
  }
  return out;
}

/**
 * Valid aim tiles for an ability: inside range, and for single-target
 * abilities, holding an appropriate unit.
 */
export function validTargets(state: BattleState, u: BattleUnit, abilityId: string, from: Pos = u.pos): Pos[] {
  const ab = ABILITIES[abilityId];
  const tiles = rangeTiles(state, u, abilityId, from);
  return tiles.filter((p) => {
    if (ab.terrain) {
      const t = tileAt(state.map, p[0], p[1]);
      if (!t || !ab.terrain.includes(t.t)) return false;
    }
    if (ab.target === 'tile' || ab.target === 'self') {
      if (ab.effects?.some((e) => e.type === 'teleport')) {
        const t = tileAt(state.map, p[0], p[1]);
        return !!t && !t.blocked && !unitAt(state, p);
      }
      return true;
    }
    const v = unitAt(state, p);
    if (!v) return false;
    if (v.uid !== u.uid && !targetable(state, v)) return false;
    switch (ab.target) {
      case 'enemy': return isAlive(v) && !isAllied(v, u);
      case 'ally': return isAlive(v) && isAllied(v, u);
      case 'allyNotSelf': return isAlive(v) && isAllied(v, u) && v.uid !== u.uid;
      case 'ko': return statusActive(v, 'ko');
      default: return ab.targetsKO ? statusActive(v, 'ko') : isAlive(v);
    }
  });
}

/** Is the attack a melee (adjacent) strike from attacker at `from`? */
export function isMelee(from: Pos, to: Pos): boolean {
  return manhattan(from, to) === 1;
}

export { DIRS };
