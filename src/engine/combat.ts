/**
 * Ability resolution: formulas, hit chance, effects, reactions, KO handling and
 * per-action rewards. Also exposes a side-effect-free preview for the UI/AI.
 */
import { ABILITIES } from '../content/abilities';
import { ITEMS, POTION_ORDER } from '../content/items';
import { STATUSES } from '../content/statuses';
import { JOBS } from '../content/jobs';
import type { AbilityDef, Effect, Element, Formula, ItemDef, StatusId } from '../content/types';
import type { EquipSlot } from '../content/schema';
import { DIR_VEC, attackSide, dirTo, manhattan, samePos, tileAt, TERRAIN_INFO } from './grid';
import { isAlive, isAllied, unitAt } from './movement';
import { actionExp, actionJp, addExp, addJp } from './progression';
import { chance, rand, randInt } from './rng';
import { affectedUnits } from './targeting';
import { oathOnCritical, oathOnKO, oathOnStrike } from './oaths';
import { deriveStats, hasPassive, hasTrait, passiveOf, statusActive, type DerivedStats } from './units';
import type { BattleEvent, BattleState, BattleUnit, Pos } from './types';

export interface Ctx {
  state: BattleState;
  events: BattleEvent[];
}

type Mode = 'roll' | 'min' | 'max' | 'avg';

/** Magic potency relative to weapon damage (keeps tier-1 spells ≈ a good weapon hit). */
export const MAGIC_SCALE = 0.65;

/** Limits on in-battle stat modifiers so buffs can't stack without end. */
export const MOD_CAPS = { pa: 5, ma: 5, sp: 3, brave: 30, faith: 30, move: 2 } as const;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function addStatus(ctx: Ctx, u: BattleUnit, s: StatusId, opts: { silent?: boolean; count?: number } = {}): boolean {
  const def = STATUSES[s];
  const st = deriveStats(u.build, u);
  if (st.immune.includes(s)) return false;
  for (const c of def.cancels ?? []) removeStatus(ctx, u, c);
  const existing = u.statuses.find((x) => x.id === s);
  if (existing) {
    existing.ticks = def.duration;
    if (opts.count !== undefined) existing.count = opts.count;
    return true;
  }
  u.statuses.push({ id: s, ticks: def.duration, ...(s === 'doom' ? { count: opts.count ?? 3 } : opts.count !== undefined ? { count: opts.count } : {}) });
  if (!opts.silent) ctx.events.push({ e: 'status', unit: u.uid, status: s, added: true });
  if (s === 'petrify' || s === 'stop' || s === 'sleep') cancelPending(ctx, u);
  if (s === 'silence') cancelPending(ctx, u, true);
  return true;
}

export function removeStatus(ctx: Ctx, u: BattleUnit, s: StatusId, silent = false): boolean {
  const i = u.statuses.findIndex((x) => x.id === s);
  if (i < 0) return false;
  u.statuses.splice(i, 1);
  if (!silent) ctx.events.push({ e: 'status', unit: u.uid, status: s, added: false });
  return true;
}

export function cancelPending(ctx: Ctx, u: BattleUnit, magicOnly = false): void {
  const before = ctx.state.pending.length;
  ctx.state.pending = ctx.state.pending.filter((p) => {
    if (p.unit !== u.uid) return true;
    const ab = ABILITIES[p.ability];
    if (magicOnly && !ab.magic) return true;
    ctx.events.push({ e: 'chargeCancel', unit: u.uid, ability: p.ability });
    return false;
  });
  if (ctx.state.pending.length !== before && !ctx.state.pending.some((p) => p.unit === u.uid)) removeStatus(ctx, u, 'charging', true);
}

function updateCritical(ctx: Ctx, u: BattleUnit): boolean {
  const max = deriveStats(u.build, u).maxHp;
  const crit = u.hp > 0 && u.hp <= Math.floor(max / 5);
  const had = statusActive(u, 'critical');
  if (crit && !had) { u.statuses.push({ id: 'critical', ticks: 0 }); return true; }
  if (!crit && had) removeStatus(ctx, u, 'critical', true);
  return false;
}

// ---------------------------------------------------------------------------
// HP changes, KO, revive
// ---------------------------------------------------------------------------

export function knockOut(ctx: Ctx, u: BattleUnit): void {
  if (u.retreat) {
    u.hp = 1;
    u.gone = true;
    cancelPending(ctx, u);
    ctx.events.push({ e: 'retreat', unit: u.uid });
    return;
  }
  if (statusActive(u, 'reraise')) {
    removeStatus(ctx, u, 'reraise');
    const max = deriveStats(u.build, u).maxHp;
    u.hp = Math.max(1, Math.floor(max / 10));
    ctx.events.push({ e: 'revive', unit: u.uid });
    return;
  }
  oathOnKO(ctx, u);
  u.hp = 0;
  const keep: StatusId[] = ['undead', 'float', 'reflect'];
  u.statuses = u.statuses.filter((s) => keep.includes(s.id) && s.ticks === 0);
  u.statuses.push({ id: 'ko', ticks: 0, count: ctx.state.rules.koCount });
  u.ct = 0;
  cancelPending(ctx, u);
  ctx.events.push({ e: 'ko', unit: u.uid });
}

export function revive(ctx: Ctx, u: BattleUnit, pct: number): void {
  if (!statusActive(u, 'ko')) return;
  removeStatus(ctx, u, 'ko', true);
  const max = deriveStats(u.build, u).maxHp;
  u.hp = Math.max(1, Math.floor((max * pct) / 100));
  ctx.events.push({ e: 'revive', unit: u.uid });
  updateCritical(ctx, u);
}

/** Apply raw HP damage after all modifiers. Returns actual HP lost. */
export function applyHpDamage(ctx: Ctx, u: BattleUnit, amount: number, physical: boolean, info: Partial<Extract<BattleEvent, { e: 'damage' }>> = {}): number {
  if (amount <= 0 || !isAlive(u)) return 0;
  let dmg = Math.floor(amount);
  if (hasPassive(u.build, 'manaShield') && u.mp > 0) {
    const absorbed = Math.min(u.mp, dmg);
    u.mp -= absorbed;
    dmg -= absorbed;
    if (absorbed) ctx.events.push({ e: 'damage', unit: u.uid, amount: absorbed, mp: true });
  }
  const lost = Math.min(u.hp, dmg);
  u.hp -= lost;
  ctx.events.push({ e: 'damage', unit: u.uid, amount: dmg, ...info });
  if (physical) for (const s of u.statuses.slice()) if (STATUSES[s.id].breaksOnHit) removeStatus(ctx, u, s.id);
  if (u.hp <= 0) knockOut(ctx, u);
  else if (updateCritical(ctx, u)) oathOnCritical(ctx, u);
  return lost;
}

export function applyHeal(ctx: Ctx, u: BattleUnit, amount: number, mp = false): void {
  if (!isAlive(u)) return;
  const st = deriveStats(u.build, u);
  const amt = Math.max(0, Math.floor(amount));
  if (mp) u.mp = Math.min(st.maxMp, u.mp + amt);
  else { u.hp = Math.min(st.maxHp, u.hp + amt); updateCritical(ctx, u); }
  ctx.events.push({ e: 'heal', unit: u.uid, amount: amt, mp });
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

function weaponBase(cs: DerivedStats, caster: BattleUnit, weapon: ItemDef | undefined, mode: Mode, ctx: Ctx | null): number {
  const family = weapon ? weapon.category : 'fist';
  const wp = weapon?.wp ?? 0;
  const pa = cs.pa, sp = cs.sp, ma = cs.ma;
  switch (family) {
    case 'fist': {
      const v = pa * Math.floor((pa * cs.brave) / 100);
      return hasPassive(caster.build, 'brawler') ? Math.floor(v * 1.5) : v;
    }
    case 'knife': case 'bow': case 'throwing': return Math.floor((pa + sp) / 2) * wp;
    case 'katana': return Math.floor((pa * cs.brave) / 100) * wp;
    case 'axe': case 'flail': {
      const r = mode === 'min' ? 1 : mode === 'max' ? pa : mode === 'avg' ? (1 + pa) / 2 : randInt(ctx!.state, 1, pa);
      return Math.floor(r * wp);
    }
    case 'staff': return ma * wp;
    default: return pa * wp;
  }
}

function hollowIgnoresFaith(target: BattleUnit, el?: Element): boolean {
  return hasTrait(target.build, 'hollow') && el !== 'holy';
}

function formulaValue(f: Formula, caster: BattleUnit, cs: DerivedStats, target: BattleUnit, ts: DerivedStats, mp: boolean, mode: Mode, ctx: Ctx | null, weapon?: ItemDef, el?: Element): number {
  switch (f.kind) {
    case 'weapon': {
      if (!(weapon ?? cs.weapon) && JOBS[caster.build.job]?.special === 'monster') return cs.pa * (2.6 + caster.build.level * 0.2) * (f.mul ?? 1);
      let v = weaponBase(cs, caster, weapon ?? cs.weapon, mode, ctx) * (f.mul ?? 1);
      const w = weapon ?? cs.weapon;
      if (w && !w.twoHanded && !caster.build.equipment.off && hasPassive(caster.build, 'doublehand')) v *= 2;
      return v;
    }
    case 'monster': return cs.pa * (2.6 + caster.build.level * 0.2) * f.mul;
    case 'fist': {
      const v = cs.pa * Math.floor((cs.pa * cs.brave) / 100) * f.mul;
      return hasPassive(caster.build, 'brawler') ? v * 1.5 : v;
    }
    case 'magic': return (MAGIC_SCALE * cs.ma * f.q * cs.faith * (hollowIgnoresFaith(target, el) ? 100 : ts.faith)) / 10000;
    case 'stat': {
      const s = f.stat === 'level' ? caster.build.level : cs[f.stat];
      return s * f.mul * (f.brave ? cs.brave / 100 : 1) + (f.plus ?? 0);
    }
    case 'mix': return ((cs[f.a] + cs[f.b]) / 2) * f.mul;
    case 'fixed': return f.amount;
    case 'pctMax': return ((mp ? ts.maxMp : ts.maxHp) * f.pct) / 100;
    case 'pctCurrent': return ((mp ? target.mp : target.hp) * f.pct) / 100;
    case 'casterMissing': return (cs.maxHp - caster.hp) * f.mul;
    case 'casterHp': return (caster.hp * f.pct) / 100;
  }
}

function isPhysical(ab: AbilityDef, f: Formula): boolean {
  if (ab.magic) return false;
  return f.kind === 'weapon' || f.kind === 'stat' || f.kind === 'mix' || f.kind === 'fist' || f.kind === 'monster';
}

interface DamageCalc {
  amount: number;          // final (negative = absorbed → heal)
  element?: Element;
  weak?: boolean;
  resist?: boolean;
  immune?: boolean;
  absorb?: boolean;
}

function elementOf(e: Extract<Effect, { type: 'damage' }>, ab: AbilityDef, cs: DerivedStats, weapon?: ItemDef): Element | undefined {
  if (e.element === 'weapon') return (weapon ?? cs.weapon)?.element;
  return e.element ?? ab.element;
}

function calcDamage(
  e: Extract<Effect, { type: 'damage' }>, ab: AbilityDef, caster: BattleUnit, target: BattleUnit, mode: Mode, ctx: Ctx | null, weapon?: ItemDef,
): DamageCalc {
  const cs = deriveStats(caster.build, caster);
  const ts = deriveStats(target.build, target);
  const el0 = elementOf(e, ab, cs, weapon);
  let v = formulaValue(e.formula, caster, cs, target, ts, !!e.mp, mode, ctx, weapon, el0);
  const phys = isPhysical(ab, e.formula);
  if (hasPassive(caster.build, 'lampLit') && hasTrait(target.build, 'hollow')) v *= 1.25;
  if (!e.ignoreDefense) {
    if (phys) {
      if (hasPassive(caster.build, 'attackBoost')) v *= 4 / 3;
      if (hasPassive(target.build, 'defenseBoost')) v *= 2 / 3;
      if (statusActive(target, 'protect')) v *= 2 / 3;
    } else if (ab.magic) {
      if (hasPassive(caster.build, 'arcaneStrength')) v *= 4 / 3;
      if (hasPassive(target.build, 'arcaneDefense')) v *= 2 / 3;
      if (statusActive(target, 'shell')) v *= 2 / 3;
    }
  }
  if (ab.variance) {
    const r = mode === 'min' ? -ab.variance : mode === 'max' ? ab.variance : mode === 'avg' ? 0 : (rand(ctx!.state) * 2 - 1) * ab.variance;
    v *= 1 + r;
  }
  const el = elementOf(e, ab, cs, weapon);
  const out: DamageCalc = { amount: 0, element: el };
  if (el && el !== 'none') {
    const a = ts.affinity;
    if (a.absorb.includes(el)) { out.absorb = true; out.amount = -Math.max(1, Math.floor(v)); return out; }
    if (a.immune.includes(el)) { out.immune = true; return out; }
    if (cs.affinity.strengthen.includes(el)) v *= 1.25;
    if (a.half.includes(el)) { v *= 0.5; out.resist = true; }
    if (a.weak.includes(el)) { v *= 2; out.weak = true; }
    if (el === 'fire' && statusActive(target, 'oil')) v *= 2;
  }
  out.amount = Math.max(v > 0 ? 1 : 0, Math.floor(v));
  return out;
}

function calcHeal(e: Extract<Effect, { type: 'heal' }>, ab: AbilityDef, caster: BattleUnit, target: BattleUnit, mode: Mode, ctx: Ctx | null, item?: ItemDef): number {
  const cs = deriveStats(caster.build, caster);
  const ts = deriveStats(target.build, target);
  let v = formulaValue(e.formula, caster, cs, target, ts, !!e.mp, mode, ctx);
  if (ab.magic && hasPassive(caster.build, 'magicBoostHeal')) v *= 4 / 3;
  if (item && hasPassive(caster.build, 'medicine')) v *= 1.5;
  return Math.max(0, Math.floor(v));
}

// ---------------------------------------------------------------------------
// Hit chance
// ---------------------------------------------------------------------------

function canEvade(t: BattleUnit): boolean {
  return !['sleep', 'stop', 'petrify', 'charging', 'disable'].some((s) => statusActive(t, s as StatusId));
}

export function hitChance(state: BattleState, ab: AbilityDef, caster: BattleUnit, target: BattleUnit, casterPos: Pos = caster.pos): number {
  const hit = ab.hit ?? { kind: 'always' };
  const cs = deriveStats(caster.build, caster);
  const ts = deriveStats(target.build, target);
  const side = ab.ignoreFacing ? 'back' : attackSide(casterPos, target.pos, target.facing);
  if (hit.kind === 'always') return 100;
  if (hit.kind === 'evadable') {
    if (caster.uid === target.uid) return 100;
    let p = 100;
    if (!hasPassive(caster.build, 'concentrate') && canEvade(target)) {
      const mul = (statusActive(target, 'defending') ? 2 : 1) * (hasPassive(target.build, 'reflexes') ? 2 : 1);
      const evs = side === 'front' ? [ts.cev, ts.sev, ts.aev] : side === 'side' ? [ts.cev / 2, ts.sev, ts.aev] : [ts.aev / 2];
      for (const ev of evs) p *= 1 - Math.min(95, ev * mul) / 100;
    }
    if (statusActive(caster, 'blind')) p *= 0.5;
    p += hit.bonus ?? 0;
    return clampPct(p);
  }
  // Percentage-based
  const stat = hit.stat && hit.stat !== 'none' ? cs[hit.stat] : 0;
  let p = stat + hit.base;
  if (hit.faith) p = (p * cs.faith * ts.faith) / 10000;
  if (hit.brave) p = (p * cs.brave) / 100;
  if (hasPassive(caster.build, 'warrant') && statusActive(target, 'surety')) p += 20;
  if (!ab.magic && side === 'back' && caster.uid !== target.uid) p *= 1.5;
  if (ab.magic && caster.uid !== target.uid && !isAllied(caster, target)) p *= 1 - Math.min(80, ts.smev + ts.amev) / 100;
  return clampPct(p);
}

function clampPct(p: number): number {
  return Math.max(0, Math.min(100, Math.round(p)));
}

// ---------------------------------------------------------------------------
// Preview (no side effects)
// ---------------------------------------------------------------------------

export interface PreviewEffect {
  kind: 'damage' | 'heal' | 'status' | 'cleanse' | 'revive' | 'stat' | 'break' | 'steal' | 'kill' | 'other';
  min?: number;
  max?: number;
  mp?: boolean;
  status?: StatusId;
  chance?: number;
  label?: string;
  weak?: boolean;
  resist?: boolean;
  immune?: boolean;
  absorb?: boolean;
}

export interface PreviewTarget {
  uid: string;
  hit: number;
  effects: PreviewEffect[];
  /** Expected HP after (avg damage). */
  hpAfter: number;
  side: 'front' | 'side' | 'back';
}

export function previewAbility(state: BattleState, casterUid: string, abilityId: string, target: Pos, opts: { item?: string; casterPos?: Pos } = {}): PreviewTarget[] {
  const caster = state.units.find((u) => u.uid === casterUid)!;
  const ab = ABILITIES[abilityId];
  const casterPos = opts.casterPos ?? caster.pos;
  // Evaluate as if the caster stood at casterPos.
  const saved = caster.pos;
  caster.pos = casterPos;
  try {
    const targets = affectedUnits(state, caster, abilityId, target, casterPos);
    const item = opts.item ? ITEMS[opts.item] : ab.consumes ? ITEMS[ab.consumes] : undefined;
    const effects = ab.effects?.some((e) => e.type === 'useItem') && item ? item.effects ?? [] : ab.effects ?? [];
    return targets.map((t) => {
      const out: PreviewEffect[] = [];
      let hpAfter = t.hp;
      const ts = deriveStats(t.build, t);
      for (const e of effects) {
        switch (e.type) {
          case 'damage': {
            const lo = calcDamage(e, ab, caster, t, 'min', null);
            const hi = calcDamage(e, ab, caster, t, 'max', null);
            const avg = calcDamage(e, ab, caster, t, 'avg', null);
            const pe: PreviewEffect = { kind: 'damage', min: lo.amount, max: hi.amount, mp: e.mp, weak: avg.weak, resist: avg.resist, immune: avg.immune, absorb: avg.absorb };
            if (avg.absorb) { pe.kind = 'heal'; pe.min = -lo.amount; pe.max = -hi.amount; }
            out.push(pe);
            if (!e.mp) hpAfter = avg.absorb ? Math.min(ts.maxHp, hpAfter - avg.amount) : Math.max(0, hpAfter - avg.amount);
            break;
          }
          case 'heal': {
            const v = calcHeal(e, ab, caster, t, 'avg', null, item);
            const undead = statusActive(t, 'undead') && !e.mp;
            out.push({ kind: undead ? 'damage' : 'heal', min: v, max: v, mp: e.mp });
            if (!e.mp) hpAfter = undead ? Math.max(0, hpAfter - v) : Math.min(ts.maxHp, hpAfter + v);
            break;
          }
          case 'addStatus':
            for (const s of e.status) out.push({ kind: 'status', status: s, chance: e.chance ?? 100, immune: ts.immune.includes(s) });
            break;
          case 'removeStatus': out.push({ kind: 'cleanse', label: 'Cleanse' }); break;
          case 'revive': out.push({ kind: 'revive', min: Math.floor((ts.maxHp * e.pct) / 100), label: statusActive(t, 'undead') ? 'Destroy' : 'Revive' }); break;
          case 'modStat': out.push({ kind: 'stat', label: `${e.stat.toUpperCase()} ${e.amount > 0 ? '+' : ''}${e.amount}` }); break;
          case 'break': out.push({ kind: 'break', label: `Break ${e.slot}` }); break;
          case 'steal': out.push({ kind: 'steal', label: `Steal ${e.slot}` }); break;
          case 'kill': out.push({ kind: 'kill', label: 'KO' }); hpAfter = 0; break;
          default: out.push({ kind: 'other', label: e.type });
        }
      }
      return { uid: t.uid, hit: hitChance(state, ab, caster, t, casterPos), effects: out, hpAfter, side: ab.ignoreFacing ? 'back' : attackSide(casterPos, t.pos, t.facing) };
    });
  } finally {
    caster.pos = saved;
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolveOpts {
  item?: string;
  reaction?: boolean;      // triggered by a reaction: no further reactions
  free?: boolean;          // costs already paid / proc
  noRewards?: boolean;
}

const RANGED_FAMILIES = ['bow', 'crossbow', 'throwing'];

/** Execute an ability now. Costs are assumed paid by the caller unless !free. */
export function resolveAbility(ctx: Ctx, caster: BattleUnit, abilityId: string, center: Pos, opts: ResolveOpts = {}): void {
  const { state } = ctx;
  const ab = ABILITIES[abilityId];
  if (!ab) return;
  const cs = deriveStats(caster.build, caster);
  const item = opts.item ? ITEMS[opts.item] : ab.consumes ? ITEMS[ab.consumes] : undefined;

  // Face the target.
  if (!samePos(center, caster.pos)) {
    const d = dirTo(caster.pos, center);
    if (d !== caster.facing) { caster.facing = d; }
  }
  // Acting reveals a vanished unit.
  if (statusActive(caster, 'vanish')) removeStatus(ctx, caster, 'vanish');
  // Forsworn: the named forfeit comes due.
  if (!opts.reaction && statusActive(caster, 'forsworn')) {
    removeStatus(ctx, caster, 'forsworn');
    applyHpDamage(ctx, caster, Math.max(1, Math.floor(cs.maxHp / 5)), false);
    if (!isAlive(caster)) return;
  }

  const targets = affectedUnits(state, caster, abilityId, center);
  ctx.events.push({ e: 'action', unit: caster.uid, ability: abilityId, target: center, item: item?.id, affected: targets.map((t) => t.uid), reaction: opts.reaction });

  // Teleport / non-target effects.
  if (ab.effects?.some((e) => e.type === 'teleport')) {
    const t = tileAt(state.map, center[0], center[1]);
    if (t && !t.blocked && !unitAt(state, center)) {
      const from = caster.pos;
      caster.pos = [center[0], center[1]];
      ctx.events.push({ e: 'move', unit: caster.uid, path: [from, center], teleport: true });
    }
    if (!opts.noRewards) reward(ctx, caster, [], 0);
    return;
  }

  const weaponMelee = !!ab.weaponBased && !RANGED_FAMILIES.includes(cs.family) && manhattan(caster.pos, center) <= 2;
  const physicalStrike = ab.hit?.kind === 'evadable';
  const ranged = (ab.weaponBased && RANGED_FAMILIES.includes(cs.family)) || ['throw_stone', 'kunai'].includes(ab.id);
  let anyHit = false;
  const hitLevels: number[] = [];
  let kos = 0;

  const strikes: (ItemDef | undefined)[] = [cs.weapon];
  if (ab.id === 'attack' && cs.offWeapon && hasPassive(caster.build, 'dualWield')) strikes.push(cs.offWeapon);

  for (const target0 of targets) {
    let target = target0;
    // Reflect bounces reflectable spells to the caster.
    if (ab.reflectable && statusActive(target, 'reflect') && target.uid !== caster.uid) {
      ctx.events.push({ e: 'reflect', unit: target.uid, to: caster.pos });
      target = caster;
    }
    for (const weapon of strikes) {
      if (!isAlive(target) && !ab.targetsKO) break;
      if (!isAlive(caster)) break;
      // --- pre-hit reactions ---
      if (!opts.reaction && !ab.noReaction && target.uid !== caster.uid && !isAllied(target, caster) && isAlive(target) && canReact(target)) {
        if (physicalStrike && manhattan(caster.pos, target.pos) === 1 && passiveOf(target.build, 'firstStrike') && braveRoll(ctx, target)) {
          ctx.events.push({ e: 'reaction', unit: target.uid, ability: target.build.reaction! });
          resolveAbility(ctx, target, 'attack', caster.pos, { reaction: true, free: true });
          if (!isAlive(caster)) break;
          continue;
        }
        const blocker = physicalStrike ? blockingReaction(target, ranged, weaponMelee) : null;
        if (blocker && braveRoll(ctx, target)) {
          ctx.events.push({ e: 'reaction', unit: target.uid, ability: target.build.reaction! });
          ctx.events.push({ e: 'miss', unit: target.uid, blocked: 'parry' });
          continue;
        }
      }
      // --- hit roll ---
      const pct = hitChance(state, ab, caster, target);
      if (!chance(state, pct)) {
        const ts = deriveStats(target.build, target);
        ctx.events.push({ e: 'miss', unit: target.uid, blocked: physicalStrike && ts.sev > ts.cev ? 'shield' : 'evade' });
        continue;
      }
      anyHit = true;
      hitLevels.push(target.build.level);
      const hpBefore = target.hp;
      const wasCritical = statusActive(target, 'critical');
      const effects = ab.effects?.some((e) => e.type === 'useItem') && item ? item.effects ?? [] : ab.effects ?? [];
      let dealt = 0;
      for (const e of effects) {
        dealt += applyEffect(ctx, caster, target, ab, e, item, weapon);
      }
      // weapon on-hit status / proc
      if (ab.id === 'attack' && weapon && dealt > 0 && isAlive(target)) {
        if (weapon.onHit && chance(state, weapon.onHit.chance)) addStatus(ctx, target, weapon.onHit.status);
        if (weapon.proc && chance(state, weapon.proc.chance)) resolveAbility(ctx, caster, weapon.proc.ability, target.pos, { reaction: true, free: true, noRewards: true });
      }
      if (hpBefore > 0 && target.hp === 0) kos++;
      if (dealt > 0) oathOnStrike(ctx, caster, target, wasCritical);
      // --- post-hit reactions ---
      if (!opts.reaction && !ab.noReaction && target.uid !== caster.uid && !isAllied(target, caster)) {
        postReactions(ctx, caster, target, ab, dealt, wasCritical, physicalStrike && manhattan(caster.pos, target.pos) === 1);
      }
    }
  }
  if (!opts.noRewards) reward(ctx, caster, hitLevels, kos, anyHit || targets.length === 0);
}

function canReact(t: BattleUnit): boolean {
  return isAlive(t) && !['sleep', 'stop', 'petrify', 'charm', 'confuse', 'berserk', 'disable', 'fear'].some((s) => statusActive(t, s as StatusId));
}

function braveRoll(ctx: Ctx, t: BattleUnit): boolean {
  return chance(ctx.state, deriveStats(t.build, t).brave);
}

function blockingReaction(t: BattleUnit, ranged: boolean, melee: boolean): string | null {
  if (passiveOf(t.build, 'shirahadori')) return 'blade_grasp';
  if (ranged && passiveOf(t.build, 'arrowGuard')) return 'arrow_guard';
  if (melee && passiveOf(t.build, 'parry') && deriveStats(t.build, t).weapon) return 'parry';
  return null;
}

function postReactions(ctx: Ctx, attacker: BattleUnit, t: BattleUnit, ab: AbilityDef, dealt: number, wasCritical: boolean, meleePhysical: boolean): void {
  // Witness's Eye: an adjacent ally steps in with a ward.
  if (dealt > 0 && isAlive(t)) {
    for (const w of ctx.state.units) {
      if (w === t || !isAlive(w) || !isAllied(w, t) || manhattan(w.pos, t.pos) !== 1) continue;
      if (passiveOf(w.build, 'witnessEye') && w.build.reaction && canReact(w) && braveRoll(ctx, w)) {
        ctx.events.push({ e: 'reaction', unit: w.uid, ability: w.build.reaction });
        addStatus(ctx, t, 'protect');
        break;
      }
    }
  }
  if (meleePhysical && dealt > 0 && isAlive(attacker) && passiveOf(t.build, 'smoulder') && canReact(t) && braveRoll(ctx, t)) {
    ctx.events.push({ e: 'reaction', unit: t.uid, ability: t.build.reaction! });
    addStatus(ctx, attacker, 'oil');
  }
  const r = t.build.reaction;
  if (!r) return;
  const spec = ABILITIES[r]?.passive;
  if (!spec) return;
  const state = ctx.state;
  // Always-on (non-Brave) reactions
  if (spec.kind === 'absorbMp' && ab.magic && ab.mp && isAlive(t)) {
    ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
    applyHeal(ctx, t, ab.mp, true);
    return;
  }
  if (!canReact(t)) return;
  const braveOk = () => braveRoll(ctx, t);
  switch (spec.kind) {
    case 'counter':
      if (meleePhysical && dealt > 0 && isAlive(attacker) && braveOk()) {
        ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
        resolveAbility(ctx, t, 'attack', attacker.pos, { reaction: true, free: true });
      }
      break;
    case 'counterTackle':
      if (meleePhysical && dealt > 0 && isAlive(attacker) && braveOk()) {
        ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
        resolveAbility(ctx, t, 'rush', attacker.pos, { reaction: true, free: true });
      }
      break;
    case 'bonecrusher':
      if (meleePhysical && dealt > 0 && statusActive(t, 'critical') && isAlive(attacker) && braveOk()) {
        ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
        const d = calcDamage({ type: 'damage', formula: { kind: 'weapon', mul: 1.5 } }, ABILITIES.attack, t, attacker, 'roll', ctx);
        applyHpDamage(ctx, attacker, d.amount, true);
      }
      break;
    case 'counterMagic':
      if (ab.magic && ab.mp !== undefined && t.mp >= (ab.mp ?? 0) && isAlive(attacker) && braveOk()) {
        ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
        t.mp -= ab.mp ?? 0;
        resolveAbility(ctx, t, ab.id, attacker.pos, { reaction: true, free: true });
      }
      break;
    case 'autoPotion':
      if (dealt > 0 && isAlive(t) && braveOk()) {
        const inv = state.inventory[teamKey(t)] ?? {};
        const pot = POTION_ORDER.find((p) => (inv[p] ?? 0) > 0);
        if (pot) {
          inv[pot]--;
          ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
          for (const e of ITEMS[pot].effects ?? []) if (e.type === 'heal') applyHeal(ctx, t, calcHeal(e, ABILITIES.use_potion, t, t, 'roll', ctx, ITEMS[pot]));
        }
      }
      break;
    case 'regenerator':
      if (dealt > 0 && isAlive(t) && braveOk()) { ctx.events.push({ e: 'reaction', unit: t.uid, ability: r }); addStatus(ctx, t, 'regen'); }
      break;
    case 'dragonheart':
      if (dealt > 0 && isAlive(t) && braveOk()) { ctx.events.push({ e: 'reaction', unit: t.uid, ability: r }); addStatus(ctx, t, 'reraise'); }
      break;
    case 'vigilance':
      if (dealt > 0 && isAlive(t) && braveOk()) { ctx.events.push({ e: 'reaction', unit: t.uid, ability: r }); addStatus(ctx, t, 'defending'); }
      break;
    case 'criticalQuick':
      if (!wasCritical && statusActive(t, 'critical') && isAlive(t) && braveOk()) {
        ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
        t.ct = Math.max(t.ct, 100);
        addStatus(ctx, t, 'quicken', { silent: true });
        ctx.events.push({ e: 'ct', unit: t.uid });
      }
      break;
    case 'gilSnapper':
      if (dealt > 0 && braveOk()) {
        ctx.events.push({ e: 'reaction', unit: t.uid, ability: r });
        state.gil[teamKey(t)] = (state.gil[teamKey(t)] ?? 0) + dealt;
        ctx.events.push({ e: 'text', unit: t.uid, text: `+${dealt} gil`, color: '#ffd54a' });
      }
      break;
  }
}

export function teamKey(u: BattleUnit): string {
  return u.team === 'ally' ? 'player' : u.team;
}

/** Apply one effect to a target. Returns HP damage dealt (for reactions). */
function applyEffect(ctx: Ctx, caster: BattleUnit, t: BattleUnit, ab: AbilityDef, e: Effect, item?: ItemDef, weapon?: ItemDef): number {
  const { state } = ctx;
  switch (e.type) {
    case 'damage': {
      if (!isAlive(t)) return 0;
      const d = calcDamage(e, ab, caster, t, 'roll', ctx, weapon);
      if (d.immune) { ctx.events.push({ e: 'miss', unit: t.uid, blocked: 'immune' }); return 0; }
      if (d.absorb) { applyHeal(ctx, t, -d.amount, !!e.mp); return 0; }
      let amount = d.amount;
      let crit = false;
      const phys = isPhysical(ab, e.formula);
      if (phys && e.formula.kind === 'weapon' && chance(state, 5)) { amount = Math.floor(amount * 1.5); crit = true; }
      if (d.element === 'fire' && statusActive(t, 'oil')) removeStatus(ctx, t, 'oil');
      if (e.mp) {
        const lost = Math.min(t.mp, amount);
        t.mp -= lost;
        ctx.events.push({ e: 'damage', unit: t.uid, amount, mp: true });
        if (e.drain) applyHeal(ctx, caster, lost, true);
        return 0;
      }
      const lost = applyHpDamage(ctx, t, amount, phys, { crit, element: d.element, weak: d.weak, resist: d.resist });
      if (e.drain && lost > 0) {
        if (statusActive(t, 'undead')) applyHpDamage(ctx, caster, lost, false);
        else applyHeal(ctx, caster, lost);
      }
      if (crit && isAlive(t)) knockback(ctx, caster, t);
      return lost;
    }
    case 'heal': {
      const v = calcHeal(e, ab, caster, t, 'roll', ctx, item);
      if (statusActive(t, 'undead') && !e.mp) return applyHpDamage(ctx, t, v, false);
      applyHeal(ctx, t, v, !!e.mp);
      return 0;
    }
    case 'addStatus': {
      if (!isAlive(t)) return 0;
      if (e.chance !== undefined && !chance(state, e.chance)) return 0;
      const list = e.mode === 'random' ? [e.status[Math.floor(rand(state) * e.status.length)]] : e.status;
      for (const s of list) {
        if (!addStatus(ctx, t, s)) ctx.events.push({ e: 'miss', unit: t.uid, blocked: 'immune' });
      }
      return 0;
    }
    case 'removeStatus':
      for (const s of e.status) removeStatus(ctx, t, s);
      return 0;
    case 'revive':
      if (statusActive(t, 'ko')) {
        if (statusActive(t, 'undead')) {
          // Holy revival unmakes the restless dead.
          const ko = t.statuses.find((s) => s.id === 'ko');
          if (ko) ko.count = 0;
          ctx.events.push({ e: 'text', unit: t.uid, text: 'Banished!', color: '#fff3b0' });
        } else revive(ctx, t, e.pct);
      } else if (statusActive(t, 'undead') && isAlive(t)) {
        applyHpDamage(ctx, t, t.hp, false);
      }
      return 0;
    case 'modStat': {
      if (!isAlive(t)) return 0;
      if (e.stat === 'ct') { t.ct = Math.max(0, t.ct + e.amount); }
      else {
        const cap = MOD_CAPS[e.stat];
        const before = t.mods[e.stat];
        t.mods[e.stat] = Math.max(-cap, Math.min(cap, before + e.amount));
        if (t.mods[e.stat] === before) { ctx.events.push({ e: 'miss', unit: t.uid, blocked: 'immune' }); return 0; }
      }
      ctx.events.push({ e: 'stat', unit: t.uid, stat: e.stat, amount: e.amount });
      return 0;
    }
    case 'break': {
      const slot = e.slot as EquipSlot;
      const id = t.build.equipment[slot];
      if (!id || t.lostEquip.includes(slot) || hasPassive(t.build, 'safeguard')) { ctx.events.push({ e: 'miss', unit: t.uid, blocked: 'guard' }); return 0; }
      t.lostEquip.push(slot);
      clampToMax(t);
      ctx.events.push({ e: 'break', unit: t.uid, slot, item: id });
      return 0;
    }
    case 'steal': {
      if (e.slot === 'gil') {
        const amt = 10 * t.build.level + 50;
        const from = teamKey(t), to = teamKey(caster);
        state.gil[from] = Math.max(0, (state.gil[from] ?? 0) - amt);
        state.gil[to] = (state.gil[to] ?? 0) + amt;
        ctx.events.push({ e: 'steal', unit: caster.uid, from: t.uid, what: 'gil', amount: amt });
        return 0;
      }
      if (e.slot === 'exp') {
        const amt = Math.min(t.build.exp, 20 + t.build.level);
        t.build.exp -= amt;
        addExp(caster.build, amt);
        ctx.events.push({ e: 'steal', unit: caster.uid, from: t.uid, what: 'exp', amount: amt });
        return 0;
      }
      const slot = e.slot as EquipSlot;
      const id = t.build.equipment[slot];
      if (!id || t.lostEquip.includes(slot) || hasPassive(t.build, 'safeguard')) { ctx.events.push({ e: 'miss', unit: t.uid, blocked: 'guard' }); return 0; }
      t.lostEquip.push(slot);
      clampToMax(t);
      if (teamKey(caster) === 'player' && teamKey(t) !== 'player') { state.loot.push(id); }
      ctx.events.push({ e: 'steal', unit: caster.uid, from: t.uid, what: id });
      return 0;
    }
    case 'kill':
      if (isAlive(t)) {
        ctx.events.push({ e: 'damage', unit: t.uid, amount: t.hp });
        knockOut(ctx, t);
        return t.hp;
      }
      return 0;
    case 'knockback':
      if (isAlive(t)) knockback(ctx, caster, t);
      return 0;
    case 'setHp':
      if (isAlive(t)) {
        const max = deriveStats(t.build, t).maxHp;
        const to = e.to === 'one' ? 1 : Math.floor(max / 5);
        if (t.hp > to) { const d = t.hp - to; t.hp = to; ctx.events.push({ e: 'damage', unit: t.uid, amount: d }); updateCritical(ctx, t); return d; }
      }
      return 0;
    case 'gainCT':
      if (isAlive(t)) { t.ct = Math.max(t.ct, e.amount); addStatus(ctx, t, 'quicken', { silent: true }); ctx.events.push({ e: 'ct', unit: t.uid }); }
      return 0;
    case 'swap': {
      const a = caster.pos; caster.pos = t.pos; t.pos = a;
      ctx.events.push({ e: 'move', unit: caster.uid, path: [t.pos, caster.pos], teleport: true });
      ctx.events.push({ e: 'move', unit: t.uid, path: [caster.pos, t.pos], teleport: true });
      return 0;
    }
    case 'consume': {
      if (!statusActive(t, 'ko')) return 0;
      const ko = t.statuses.find((s) => s.id === 'ko');
      if (ko) ko.count = 0;
      t.ct = Math.max(t.ct, 100);
      ctx.events.push({ e: 'text', unit: t.uid, text: 'Consumed', color: '#ff9a6a' });
      if (e.healPct) applyHeal(ctx, caster, Math.floor((deriveStats(caster.build, caster).maxHp * e.healPct) / 100));
      return 0;
    }
    case 'teleport':
    case 'useItem':
    case 'learnFromCrystal':
      return 0;
  }
}

function clampToMax(u: BattleUnit): void {
  const s = deriveStats(u.build, u);
  u.hp = Math.min(u.hp, s.maxHp);
  u.mp = Math.min(u.mp, s.maxMp);
}

/** Push target one tile directly away from the attacker if possible. */
export function knockback(ctx: Ctx, attacker: BattleUnit, t: BattleUnit): void {
  const { state } = ctx;
  if (hasTrait(t.build, 'heavy')) return;
  const d = dirTo(attacker.pos, t.pos);
  const [vx, vy] = DIR_VEC[d];
  const to: Pos = [t.pos[0] + vx, t.pos[1] + vy];
  const from = tileAt(state.map, t.pos[0], t.pos[1]);
  const dest = tileAt(state.map, to[0], to[1]);
  if (!from || !dest || dest.blocked || unitAt(state, to)) return;
  if (!TERRAIN_INFO[dest.t].walkable) return;
  if (dest.h - from.h > 1) return;
  const fall = from.h - dest.h;
  t.pos = to;
  ctx.events.push({ e: 'knockback', unit: t.uid, to, fall: Math.max(0, fall) });
  const jump = deriveStats(t.build, t).jump;
  if (fall > jump + 1 && !statusActive(t, 'float')) {
    const max = deriveStats(t.build, t).maxHp;
    applyHpDamage(ctx, t, Math.floor((max * Math.min(fall - jump, 6)) / 16), true);
  }
}

/** EXP/JP for the acting unit, plus JP spillover to its side. */
export function reward(ctx: Ctx, u: BattleUnit, targetLevels: number[], kos: number, success = true): void {
  if (!success) return;
  const build = u.build;
  let jp = actionJp(build);
  if (hasPassive(build, 'jpBoost')) jp = Math.floor(jp * 1.5);
  let exp = actionExp(build.level, targetLevels, kos);
  if (hasPassive(build, 'expBoost')) exp = Math.floor(exp * 1.5);
  grantExpJp(ctx, u, exp, jp);
}

export function grantExpJp(ctx: Ctx, u: BattleUnit, exp: number, jp: number): void {
  const build = u.build;
  const before = deriveStats(build, u);
  const levels = addExp(build, exp);
  const jobUp = addJp(build, build.job, jp);
  u.earned.exp += exp;
  u.earned.jp += jp;
  if (levels > 0) {
    const after = deriveStats(build, u);
    u.hp = Math.min(after.maxHp, u.hp + (after.maxHp - before.maxHp));
    u.mp = Math.min(after.maxMp, u.mp + (after.maxMp - before.maxMp));
    ctx.events.push({ e: 'text', unit: u.uid, text: 'Level Up!', color: '#7cf2b2' });
  }
  if (jobUp) ctx.events.push({ e: 'text', unit: u.uid, text: 'Job Level Up!', color: '#ffd54a' });
  const spill = Math.floor(jp * ctx.state.rules.spill);
  if (spill > 0) {
    for (const ally of ctx.state.units) {
      if (ally === u || ally.gone || teamKey(ally) !== teamKey(u)) continue;
      addJp(ally.build, build.job, spill);
      ally.earned.spill[build.job] = (ally.earned.spill[build.job] ?? 0) + spill;
    }
  }
}
