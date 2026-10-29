/**
 * Enemy / ally AI. Pure function of the battle state: returns the commands for
 * the active unit's turn. Deterministic (no Math.random) so lockstep peers agree.
 */
import { ABILITIES } from '../content/abilities';
import type { AbilityDef } from '../content/types';
import { canUseAbility, effectiveControl } from './battle';
import { MOD_CAPS, previewAbility } from './combat';
import { DIRS, dirTo, manhattan, samePos, tileAt } from './grid';
import { isAlive, isAllied, reachable } from './movement';
import { hash2 } from './rng';
import { validTargets } from './targeting';
import { availableActions, deriveStats, statusActive } from './units';
import type { BattleState, BattleUnit, Command, Dir, Pos } from './types';

interface Plan {
  score: number;
  moveTo: Pos | null;      // null = don't move
  actFirst: boolean;
  ability?: string;
  target?: Pos;
  /** Retreat tile after acting (act-first plans). */
  after?: Pos | null;
}

export function planTurn(state: BattleState): Command[] {
  const t = state.turn;
  if (!t) return [];
  const u = state.units.find((x) => x.uid === t.unit)!;
  const reach = reachable(state, u);
  const dests: Pos[] = t.moved ? [u.pos] : reach.dests;
  const abilities = t.acted ? [] : usableAbilities(state, u);
  const berserk = statusActive(u, 'berserk');
  const confused = statusActive(u, 'confuse');

  let best: Plan = { score: positionScore(state, u, u.pos), moveTo: null, actFirst: false };

  if (confused) {
    // Wander and lash out at whatever is adjacent.
    const h = hash2(state.rng, state.tick, u.turns);
    const d = dests[Math.floor(h * dests.length)] ?? u.pos;
    const cmds: Command[] = [];
    if (!samePos(d, u.pos) && !t.moved) cmds.push({ type: 'move', unit: u.uid, to: d });
    cmds.push({ type: 'wait', unit: u.uid, facing: DIRS[Math.floor(h * 4)] });
    return cmds;
  }

  const origin = u.pos;
  for (const d of dests) {
    const pos = positionScore(state, u, d);
    if (pos > best.score) best = { score: pos, moveTo: samePos(d, origin) ? null : d, actFirst: false };
    for (const ab of abilities) {
      if (berserk && ab !== 'attack') continue;
      const targets = candidateTargets(state, u, ab, d);
      for (const tgt of targets) {
        const sc = scoreAction(state, u, ab, tgt, d);
        if (sc <= 0) continue;
        const total = sc + pos * 0.5;
        if (total > best.score) best = { score: total, moveTo: samePos(d, origin) ? null : d, actFirst: false, ability: ab, target: tgt };
      }
    }
  }

  // If the chosen action can be done from where we stand, consider acting first then retreating.
  if (best.ability && best.target && !t.moved && best.moveTo) {
    const fromHere = validTargets(state, u, best.ability, origin).some((p) => samePos(p, best.target!));
    if (fromHere) {
      const actScore = scoreAction(state, u, best.ability, best.target, origin);
      let bestAfter: Pos = origin;
      let bestPos = positionScore(state, u, origin);
      for (const d of dests) {
        const ps = positionScore(state, u, d);
        if (ps > bestPos) { bestPos = ps; bestAfter = d; }
      }
      const total = actScore + bestPos * 0.5;
      if (total >= best.score) best = { score: total, moveTo: null, actFirst: true, ability: best.ability, target: best.target, after: samePos(bestAfter, origin) ? null : bestAfter };
    }
  }

  // Easier AI occasionally picks a weaker plan.
  if (state.rules.aiLevel === 0 && best.ability && hash2(state.rng, state.tick, 7) < 0.25) {
    best = { ...best, ability: undefined, target: undefined };
  }

  const cmds: Command[] = [];
  if (best.actFirst && best.ability && best.target) {
    cmds.push({ type: 'act', unit: u.uid, ability: best.ability, target: best.target });
    if (best.after) cmds.push({ type: 'move', unit: u.uid, to: best.after });
  } else {
    if (best.moveTo) cmds.push({ type: 'move', unit: u.uid, to: best.moveTo });
    if (best.ability && best.target) cmds.push({ type: 'act', unit: u.uid, ability: best.ability, target: best.target });
  }
  const finalPos = best.actFirst ? best.after ?? origin : best.moveTo ?? origin;
  cmds.push({ type: 'wait', unit: u.uid, facing: bestFacing(state, u, finalPos) });
  return cmds;
}

function usableAbilities(state: BattleState, u: BattleUnit): string[] {
  const out = ['attack'];
  for (const set of availableActions(u.build)) for (const a of set.abilities) if (!out.includes(a)) out.push(a);
  return out.filter((a) => canUseAbility(state, u, a) === null);
}

function enemiesOf(state: BattleState, u: BattleUnit): BattleUnit[] {
  return state.units.filter((v) => isAlive(v) && !isAllied(v, u));
}

function alliesOf(state: BattleState, u: BattleUnit): BattleUnit[] {
  return state.units.filter((v) => !v.gone && !v.hidden && isAllied(v, u));
}

/** Prune target tiles: only tiles with units near (or AoE centres touching units). */
function candidateTargets(state: BattleState, u: BattleUnit, abilityId: string, from: Pos): Pos[] {
  const ab = ABILITIES[abilityId];
  const all = validTargets(state, u, abilityId, from);
  const radius = ab.aoe?.radius ?? 0;
  if (radius === 0 || ab.aoe?.shape === 'line') return all.slice(0, 40);
  const units = state.units.filter((v) => !v.gone && !v.hidden);
  return all.filter((p) => units.some((v) => manhattan(v.pos, p) <= radius)).slice(0, 40);
}

const VALUE: Record<string, number> = {
  haste: 30, protect: 18, shell: 14, regen: 16, reraise: 30, float: 4, reflect: 10, faith: 6,
  slow: 26, stop: 45, sleep: 32, silence: 22, blind: 16, poison: 14, confuse: 30, charm: 40, berserk: 18,
  doom: 30, petrify: 55, immobilize: 14, disable: 24, oil: 6, doubt: 12, vanish: 20, quicken: 30,
};

function scoreAction(state: BattleState, u: BattleUnit, abilityId: string, target: Pos, from: Pos): number {
  const ab = ABILITIES[abilityId];
  const preview = previewAbility(state, u.uid, abilityId, target, { casterPos: from });
  if (!preview.length && !ab.effects?.some((e) => e.type === 'teleport')) return 0;
  let score = 0;
  for (const p of preview) {
    const v = state.units.find((x) => x.uid === p.uid)!;
    // Score against real sides: a charmed friend is still a friend.
    const side = (x: BattleUnit) => (x.team === 'ally' ? 'player' : x.team);
    const ally = statusActive(v, 'charm') || statusActive(u, 'charm') ? side(v) === side(u) : isAllied(v, u);
    const vs = deriveStats(v.build, v);
    const h = p.hit / 100;
    for (const e of p.effects) {
      const avg = ((e.min ?? 0) + (e.max ?? 0)) / 2;
      switch (e.kind) {
        case 'damage': {
          if (e.mp) { score += (ally ? -1 : 1) * Math.min(v.mp, avg) * 0.3 * h; break; }
          const dmg = Math.min(v.hp, avg);
          let val = dmg * h;
          // Objective focus: the side that must defeat a named target hunts it.
          const vic = state.victory;
          if (!ally && vic.type === 'defeatTarget' && (u.team === 'player' || u.team === 'ally') && (v.spawnId === vic.target || v.build.character === vic.target)) val *= 2.5;
          if (!ally && avg >= v.hp) val += 40 * h + threat(v) * 10 * h; // kill
          score += ally ? -val * 1.5 : val * (0.7 + threat(v) * 0.3);
          break;
        }
        case 'heal': {
          if (e.mp) { score += (ally ? 1 : -1) * Math.min(vs.maxMp - v.mp, avg) * 0.2; break; }
          const need = vs.maxHp - v.hp;
          const val = Math.min(need, avg) * h;
          const urgency = v.hp < vs.maxHp * 0.4 ? 1.6 : 1;
          score += ally ? val * urgency : -val;
          break;
        }
        case 'revive': score += ally ? (v.build.essential ? 220 : 90) * h : -60; break;
        case 'status': {
          if (!e.status || e.immune) break;
          if (statusActive(v, e.status)) break;
          const good = ['haste', 'protect', 'shell', 'regen', 'reraise', 'float', 'reflect', 'faith', 'vanish', 'quicken'].includes(e.status);
          const val = (VALUE[e.status] ?? 10) * h * ((e.chance ?? 100) / 100);
          score += good === ally ? val : -val;
          break;
        }
        case 'cleanse': {
          const bad = v.statuses.filter((s) => ['poison', 'blind', 'silence', 'petrify', 'confuse', 'berserk', 'sleep', 'slow', 'doom', 'stop', 'immobilize', 'disable', 'charm'].includes(s.id)).length;
          score += (ally ? 1 : -1) * bad * 20 * h;
          break;
        }
        case 'stat': {
          const m = /^(\w+) ([+-])(\d+)/.exec(e.label ?? '');
          const key = m?.[1].toLowerCase() as keyof typeof MOD_CAPS | undefined;
          const up = m?.[2] === '+';
          const room = key && key in MOD_CAPS ? (up ? MOD_CAPS[key] - v.mods[key as 'pa'] : MOD_CAPS[key] + v.mods[key as 'pa']) : 1;
          if (room <= 0) break;
          score += (ally === up ? 1 : -1) * (key === 'sp' ? 14 : 8) * h;
          break;
        }
        case 'break': case 'steal': score += ally ? -20 : 14 * h; break;
        case 'kill': score += ally ? -200 : (v.hp + 40) * h; break;
        default: break;
      }
    }
  }
  // Charged actions might miss moving targets.
  if (ab.speed && ab.target === 'tile') score *= 0.8;
  if (ab.speed) score *= 0.9;
  // MP thrift.
  score -= (ab.mp ?? 0) * 0.15;
  if (ab.consumes) score -= 4;
  if (ab.hpCostPct) score -= ab.hpCostPct * 0.8;
  return score;
}

/** How dangerous a unit is (0..2): healers/casters and high-damage units first. */
function threat(v: BattleUnit): number {
  const s = deriveStats(v.build, v);
  const role = ['cleric', 'wizard', 'chronomancer', 'invoker', 'hexer'].includes(v.build.job) ? 0.6 : 0;
  return Math.min(2, role + (s.pa + s.ma) / 25);
}

/** Positional desirability: closeness to targets for melee, distance for casters, height, safety. */
function positionScore(state: BattleState, u: BattleUnit, p: Pos): number {
  const foes = enemiesOf(state, u);
  if (!foes.length) return 0;
  const s = deriveStats(u.build, u);
  const caster = s.ma > s.pa * 1.15 || ['bow', 'crossbow'].includes(s.family);
  const t = tileAt(state.map, p[0], p[1]);
  let nearest = Infinity;
  let adjacentFoes = 0;
  for (const f of foes) {
    const d = manhattan(f.pos, p);
    nearest = Math.min(nearest, d);
    if (d === 1) adjacentFoes++;
  }
  let score = 0;
  // Reach/escape objectives pull the side that needs them.
  const v = state.victory;
  if ((v.type === 'reach' || v.type === 'escape') && (u.team === 'player' || u.team === 'ally')) {
    const who = v.type === 'escape' ? v.who : v.who ? [v.who] : undefined;
    const mine = !who || who.includes(u.spawnId ?? '') || who.includes(u.build.character ?? '') || who.includes(u.build.id);
    if (mine) {
      let d = Infinity;
      for (const tt of v.tiles) d = Math.min(d, manhattan(tt, p));
      return -d * 18 + (t?.h ?? 0) * 0.1;
    }
  }
  const hpFrac = u.hp / s.maxHp;
  const ai = u.ai ?? 'aggressive';
  if (ai === 'guard' || ai === 'defensive') {
    score -= manhattan(p, u.pos) * 1.5;
  }
  if (u.build.essential && (u.team === 'player' || u.team === 'ally')) score -= adjacentFoes * (hpFrac < 0.6 ? 10 : 4);
  if (ai === 'coward' || hpFrac < 0.3) score += Math.min(nearest, 6) * 2;
  else if (caster) score -= Math.abs(nearest - 4) * 2 + adjacentFoes * 6;
  else score -= nearest * 2.2;
  // Close on the objective target.
  const vic = state.victory;
  if (vic.type === 'defeatTarget' && (u.team === 'player' || u.team === 'ally')) {
    const tgt = foes.find((f) => f.spawnId === vic.target || f.build.character === vic.target);
    if (tgt) score -= manhattan(tgt.pos, p) * (caster ? 0.6 : 1.4);
  }
  score += (t?.h ?? 0) * (caster ? 0.6 : 0.25);
  // Stay near wounded allies if a healer.
  if (['cleric', 'alchemist'].includes(u.build.job)) {
    const hurt = alliesOf(state, u).filter((a) => isAlive(a) && a.hp < deriveStats(a.build, a).maxHp * 0.6);
    for (const a of hurt) score -= Math.max(0, manhattan(a.pos, p) - 3) * 1.5;
  }
  return score;
}

function bestFacing(state: BattleState, u: BattleUnit, p: Pos): Dir {
  const foes = enemiesOf(state, u);
  if (!foes.length) return u.facing;
  let nearest = foes[0];
  for (const f of foes) if (manhattan(f.pos, p) < manhattan(nearest.pos, p)) nearest = f;
  return dirTo(p, nearest.pos);
}

/** Helper for UI/tests: is this unit AI-driven this turn? */
export function isAiTurn(state: BattleState): boolean {
  const t = state.turn;
  if (!t) return false;
  const u = state.units.find((x) => x.uid === t.unit);
  return !!u && effectiveControl(u) === 'ai';
}

export type { AbilityDef };
