/** Battle Oath tracking: boons while kept, forfeits when broken, rewards at the end. */
import { OATH_BY_ID } from '../content/oaths';
import { addStatus, grantExpJp, type Ctx } from './combat';
import { manhattan } from './grid';
import { chance } from './rng';
import { isAlive, isAllied } from './movement';
import { hasPassive, hasTrait, statusActive } from './units';
import type { BattleUnit } from './types';

function allies(ctx: Ctx, u: BattleUnit): BattleUnit[] {
  return ctx.state.units.filter((v) => v !== u && !v.gone && !v.hidden && isAlive(v) && isAllied(v, u));
}

function nearestFoe(ctx: Ctx, u: BattleUnit): number {
  let d = Infinity;
  for (const v of ctx.state.units) if (isAlive(v) && !isAllied(v, u) && !v.hidden) d = Math.min(d, manhattan(v.pos, u.pos));
  return d;
}

export function breakOath(ctx: Ctx, u: BattleUnit): void {
  if (!u.oath || u.oath.state !== 'sworn') return;
  const def = OATH_BY_ID[u.oath.id];
  u.oath.state = 'broken';
  ctx.events.push({ e: 'oath', unit: u.uid, oath: u.oath.id, state: 'broken' });
  const halved = hasPassive(u.build, 'oathkeeper');
  addStatus(ctx, u, 'doubt');
  if (!halved && def?.check === 'noRetreat') addStatus(ctx, u, 'slow');
  if (def?.check === 'lastStand') for (const a of allies(ctx, u)) a.mods.brave -= 5;
  // Remove boons
  if (def?.check === 'noRetreat') u.mods.pa -= 2;
  if (def?.check === 'mercy') u.mods.faith -= 20;
}

/** Apply sworn-oath boons at battle start. */
export function oathBattleStart(ctx: Ctx): void {
  for (const u of ctx.state.units) {
    if (!u.oath) continue;
    const def = OATH_BY_ID[u.oath.id];
    if (!def) continue;
    ctx.events.push({ e: 'oath', unit: u.uid, oath: def.id, state: 'sworn' });
    if (def.check === 'noRetreat') u.mods.pa += 2;
    if (def.check === 'mercy') u.mods.faith += 20;
  }
}

export function oathTurnStart(ctx: Ctx, u: BattleUnit): void {
  if (!u.oath || u.oath.state !== 'sworn') return;
  const def = OATH_BY_ID[u.oath.id];
  u.oath.startFoeDist = nearestFoe(ctx, u);
  if (def.check === 'nearAlly2' && !statusActive(u, 'protect') && chance(ctx.state, statusActive(u, 'surety') ? 50 : 25)) addStatus(ctx, u, 'protect');
}

export function oathTurnEnd(ctx: Ctx, u: BattleUnit, acted: boolean): void {
  if (!u.oath || u.oath.state !== 'sworn' || !isAlive(u)) return;
  const def = OATH_BY_ID[u.oath.id];
  const al = allies(ctx, u);
  switch (def.check) {
    case 'nearAlly2':
      if (al.length && !al.some((a) => manhattan(a.pos, u.pos) <= 2)) breakOath(ctx, u);
      break;
    case 'actFirstTurn':
      if (u.turns === 1) {
        if (!acted) breakOath(ctx, u);
        else { u.oath.state = 'kept'; u.mods.move += 1; ctx.events.push({ e: 'oath', unit: u.uid, oath: def.id, state: 'kept' }); }
      }
      break;
    case 'noRetreat':
      if (u.oath.startFoeDist !== undefined && nearestFoe(ctx, u) > u.oath.startFoeDist) breakOath(ctx, u);
      break;
    case 'witness':
      if (al.some((a) => manhattan(a.pos, u.pos) > 4)) breakOath(ctx, u);
      break;
  }
}

/** Called when `attacker` damages `target` (mercy oath). */
export function oathOnStrike(ctx: Ctx, attacker: BattleUnit, target: BattleUnit, targetWasCritical: boolean): void {
  if (!attacker.oath || attacker.oath.state !== 'sworn') return;
  if (OATH_BY_ID[attacker.oath.id]?.check === 'mercy' && targetWasCritical && !hasTrait(target.build, 'hollow') && !isAllied(attacker, target)) breakOath(ctx, attacker);
}

/** Called when a unit is KO'd. */
export function oathOnKO(ctx: Ctx, u: BattleUnit): void {
  if (!u.oath || u.oath.state !== 'sworn') return;
  if (OATH_BY_ID[u.oath.id]?.check === 'lastStand' && allies(ctx, u).length > 0) breakOath(ctx, u);
}

/** Called when a unit drops to critical HP (Oath of the Lantern boon). */
export function oathOnCritical(ctx: Ctx, u: BattleUnit): void {
  if (u.oath?.state === 'sworn' && OATH_BY_ID[u.oath.id]?.check === 'lastStand') addStatus(ctx, u, 'regen');
}

/** Victory rewards for kept oaths. */
export function oathVictory(ctx: Ctx): void {
  const witnessKept = ctx.state.units.some((u) => u.oath?.id === 'oath_witness' && u.oath.state !== 'broken' && isAlive(u));
  for (const u of ctx.state.units) {
    if (!u.oath || u.oath.state === 'broken') continue;
    const def = OATH_BY_ID[u.oath.id];
    if (!def) continue;
    let mult = 1;
    if (hasPassive(u.build, 'oathkeeper')) mult += 0.5;
    if (statusActive(u, 'surety')) mult += 1;
    if (witnessKept && def.id !== 'oath_witness') mult += 0.25;
    u.oath.state = 'kept';
    ctx.events.push({ e: 'oath', unit: u.uid, oath: def.id, state: 'kept' });
    grantExpJp(ctx, u, Math.round(def.exp * mult), Math.round(def.jp * mult));
  }
}
