/**
 * Battle lifecycle. `applyCommand(state, cmd)` is the single entry point that
 * changes a battle; it returns the new state and the events to animate.
 * Deterministic: same (initial state, commands) → same result everywhere.
 */
import { ABILITIES } from '../content/abilities';
import type { BattleTrigger, VictoryCondition } from '../content/schema';
import type { StatusId } from '../content/types';
import { addStatus, applyHeal, applyHpDamage, cancelPending, knockOut, removeStatus, resolveAbility, revive, teamKey, type Ctx } from './combat';
import { manhattan, samePos, tileAt } from './grid';
import { canReach, isAlive, pathTo, reachable, unitAt } from './movement';
import { addExp, addJp } from './progression';
import { chance } from './rng';
import { validTargets } from './targeting';
import { oathBattleStart, oathTurnEnd, oathTurnStart, oathVictory } from './oaths';
import { autoStatuses, availableActions, deriveStats, hasPassive, statusActive } from './units';
import type { BattleEvent, BattleMap, BattleRules, BattleState, BattleUnit, Command, Dir, EngineTrigger, Pos, Team, UnitBuild } from './types';

export interface BattleSetupUnit {
  build: UnitBuild;
  team: Team;
  control: 'human' | 'ai';
  pos?: Pos;
  facing?: Dir;
  ai?: string;
  hidden?: boolean;
  spawnId?: string;
  guest?: boolean;
  owner?: number;
  retreat?: boolean;
  untargetable?: boolean;
  /** Oath id sworn before battle. */
  oath?: string;
}

export interface BattleSetup {
  map: BattleMap;
  seed: number;
  units: BattleSetupUnit[];
  victory: VictoryCondition;
  defeat?: VictoryCondition[];
  triggers?: (BattleTrigger | EngineTrigger)[];
  rules?: Partial<BattleRules>;
  inventory?: Record<string, Record<string, number>>;
  gil?: Record<string, number>;
  /** If set, the battle starts in the deploy phase. */
  deploy?: boolean;
}

export const DEFAULT_RULES: BattleRules = { permadeath: false, koCount: 3, aiLevel: 1, spill: 0.25 };

export function createBattle(setup: BattleSetup): BattleState {
  const units: BattleUnit[] = setup.units.map((s, i) => {
    const build: UnitBuild = structuredClone(s.build);
    const u: BattleUnit = {
      uid: `${s.team[0]}${i}_${build.id}`,
      build,
      team: s.team,
      control: s.control,
      owner: s.owner,
      ai: s.ai,
      pos: s.pos ?? [-1, -1],
      facing: s.facing ?? 's',
      hp: 0, mp: 0, ct: 0,
      statuses: [],
      mods: { pa: 0, ma: 0, sp: 0, brave: 0, faith: 0, move: 0 },
      oath: s.oath ? { id: s.oath, state: 'sworn' } : undefined,
      lostEquip: [],
      hidden: s.hidden,
      spawnId: s.spawnId,
      earned: { exp: 0, jp: 0, spill: {} },
      turns: 0,
      guest: s.guest,
      retreat: s.retreat,
      untargetable: s.untargetable,
    };
    const st = deriveStats(build, u);
    u.hp = st.maxHp;
    u.mp = st.maxMp;
    for (const a of autoStatuses(build)) u.statuses.push({ id: a, ticks: 0 });
    return u;
  });
  const state: BattleState = {
    version: 1,
    seed: setup.seed >>> 0,
    rng: setup.seed >>> 0,
    tick: 0,
    map: structuredClone(setup.map),
    units,
    pending: [],
    nextPendingId: 1,
    turn: null,
    inventory: structuredClone(setup.inventory ?? {}),
    gil: { ...(setup.gil ?? {}) },
    victory: setup.victory,
    defeat: setup.defeat ?? [],
    fired: [],
    triggers: (setup.triggers ?? []).map((t) => ({ id: t.id, when: t.when, reveal: t.reveal, scene: t.scene, once: t.once ?? true })),
    rules: { ...DEFAULT_RULES, ...(setup.rules ?? {}) },
    phase: setup.deploy ? 'deploy' : 'battle',
    turnCount: 0,
    log: [],
    loot: [],
    lost: [],
  };
  return state;
}

/** Start the battle (when not deploying): fire start triggers, advance to first turn. */
export function startBattle(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  const s = structuredClone(state);
  const ctx: Ctx = { state: s, events: [] };
  s.phase = 'battle';
  oathBattleStart(ctx);
  checkTriggers(ctx, 'start');
  if (!checkEnd(ctx)) advance(ctx);
  return { state: s, events: ctx.events };
}

export interface CommandResult {
  state: BattleState;
  events: BattleEvent[];
  error?: string;
}

export function applyCommand(state: BattleState, cmd: Command): CommandResult {
  const s = structuredClone(state);
  const ctx: Ctx = { state: s, events: [] };
  const err = execute(ctx, cmd);
  if (err) return { state, events: [], error: err };
  s.log.push(cmd);
  return { state: s, events: ctx.events };
}

function getUnit(s: BattleState, uid: string): BattleUnit | undefined {
  return s.units.find((u) => u.uid === uid);
}

function execute(ctx: Ctx, cmd: Command): string | null {
  const s = ctx.state;
  if (cmd.type === 'deploy') {
    if (s.phase !== 'deploy') return 'Not in deployment';
    for (const p of cmd.placements) {
      const u = getUnit(s, p.uid);
      if (!u) return `No unit ${p.uid}`;
      if (!tileAt(s.map, p.pos[0], p.pos[1])) return 'Invalid tile';
      u.pos = [p.pos[0], p.pos[1]];
      u.facing = p.facing;
    }
    // Units left undeployed sit out the battle.
    for (const u of s.units) if (u.pos[0] < 0) u.gone = true;
    for (const p of cmd.placements) { const u = getUnit(s, p.uid); if (u && p.oath) u.oath = { id: p.oath, state: 'sworn' }; }
    s.phase = 'battle';
    oathBattleStart(ctx);
    checkTriggers(ctx, 'start');
    if (!checkEnd(ctx)) advance(ctx);
    return null;
  }
  if (s.phase !== 'battle') return 'Battle not in progress';
  const t = s.turn;
  if (!t || t.unit !== cmd.unit) return 'Not this unit\'s turn';
  const u = getUnit(s, cmd.unit)!;

  switch (cmd.type) {
    case 'move': {
      if (t.moved) return 'Already moved';
      if (statusActive(u, 'immobilize') || statusActive(u, 'stop')) return 'Cannot move';
      const reach = reachable(s, u);
      if (!canReach(reach, cmd.to)) return 'Unreachable';
      const path = pathTo(reach, cmd.to) ?? [u.pos, cmd.to];
      const from = u.pos;
      u.pos = [cmd.to[0], cmd.to[1]];
      if (path.length > 1) u.facing = dirFromStep(path[path.length - 2], path[path.length - 1]) ?? u.facing;
      t.moved = true;
      ctx.events.push({ e: 'move', unit: u.uid, path, teleport: reach.teleport });
      // Movement abilities that reward distance.
      const dist = Math.max(0, path.length - 1);
      if (dist > 0) {
        if (hasPassive(u.build, 'lifefont')) applyHeal(ctx, u, Math.ceil((deriveStats(u.build, u).maxHp * dist) / 30));
        if (hasPassive(u.build, 'manafont')) applyHeal(ctx, u, Math.ceil((deriveStats(u.build, u).maxMp * dist) / 20), true);
        if (hasPassive(u.build, 'accrueExp')) { addExp(u.build, dist * 2); u.earned.exp += dist * 2; }
        if (hasPassive(u.build, 'accrueJp')) { addJp(u.build, u.build.job, dist * 3); u.earned.jp += dist * 3; }
        if (manhattan(from, cmd.to) > 0) t.canUndoMove = !hasPassive(u.build, 'lifefont') && !hasPassive(u.build, 'manafont') && !hasPassive(u.build, 'accrueExp') && !hasPassive(u.build, 'accrueJp');
      }
      checkTriggers(ctx, 'move');
      checkEnd(ctx);
      return null;
    }
    case 'undoMove': {
      if (!t.moved || t.acted || !t.canUndoMove) return 'Cannot undo';
      u.pos = [t.startPos[0], t.startPos[1]];
      u.facing = t.startFacing;
      t.moved = false;
      ctx.events.push({ e: 'move', unit: u.uid, path: [u.pos], teleport: true });
      return null;
    }
    case 'act': {
      if (t.acted) return 'Already acted';
      const err = canUseAbility(s, u, cmd.ability, cmd.item);
      if (err) return err;
      const ab = ABILITIES[cmd.ability];
      const targets = validTargets(s, u, cmd.ability);
      if (!targets.some((p) => samePos(p, cmd.target))) return 'Invalid target';
      payCosts(s, u, cmd.ability, cmd.item);
      t.acted = true;
      t.canUndoMove = false;
      let speed = ab.speed ?? 0;
      if (speed > 0) {
        if (hasPassive(u.build, 'swiftness')) speed *= 2;
        const occupant = unitAt(s, cmd.target);
        const followUnit = occupant && (!ab.aoe || ab.aoe.radius === 0) && ab.target !== 'tile' && !ab.jump;
        const ticks = Math.ceil(100 / speed);
        const id = s.nextPendingId++;
        s.pending.push({ id, unit: u.uid, ability: cmd.ability, item: cmd.item, target: followUnit ? { unit: occupant!.uid } : { tile: [cmd.target[0], cmd.target[1]] }, ticks });
        addStatus(ctx, u, 'charging', { silent: true });
        ctx.events.push({ e: 'charge', unit: u.uid, ability: cmd.ability, target: cmd.target, pending: id });
        if (ab.jump) ctx.events.push({ e: 'jumpUp', unit: u.uid });
      } else {
        resolveAbility(ctx, u, cmd.ability, cmd.target, { item: cmd.item });
      }
      checkTriggers(ctx, 'act');
      if (!checkEnd(ctx) && !isAlive(u)) endTurn(ctx, u, u.facing);
      return null;
    }
    case 'wait': {
      endTurn(ctx, u, cmd.facing);
      return null;
    }
  }
  return 'Unknown command';
}

function dirFromStep(a: Pos, b: Pos): Dir | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx > 0) return 'e';
  if (dx < 0) return 'w';
  if (dy > 0) return 's';
  if (dy < 0) return 'n';
  return null;
}

/** Why a unit can't use an ability right now (or null if it can). */
export function canUseAbility(s: BattleState, u: BattleUnit, abilityId: string, item?: string): string | null {
  const ab = ABILITIES[abilityId];
  if (!ab || ab.kind !== 'action') return 'Unknown ability';
  if (statusActive(u, 'disable')) return 'Disabled';
  if (abilityId !== 'attack') {
    const sets = availableActions(u.build);
    if (!sets.some((x) => x.abilities.includes(abilityId))) return 'Not learned';
  }
  if (ab.magic && statusActive(u, 'silence')) return 'Silenced';
  const mp = mpCost(u, abilityId);
  if (u.mp < mp) return 'Not enough MP';
  if (ab.hpCostPct && u.hp <= Math.floor((deriveStats(u.build, u).maxHp * ab.hpCostPct) / 100)) return 'Not enough HP';
  const consumable = ab.consumes ?? item;
  if (consumable && (s.inventory[teamKey(u)]?.[consumable] ?? 0) <= 0) return 'None left';
  if (ab.requiresWeapon) {
    const fam = deriveStats(u.build, u).family;
    if (!ab.requiresWeapon.includes(fam)) return 'Requires ' + ab.requiresWeapon.join('/');
  }
  return null;
}

export function mpCost(u: BattleUnit, abilityId: string): number {
  const mp = ABILITIES[abilityId]?.mp ?? 0;
  return hasPassive(u.build, 'halveMp') ? Math.ceil(mp / 2) : mp;
}

function payCosts(s: BattleState, u: BattleUnit, abilityId: string, item?: string): void {
  const ab = ABILITIES[abilityId];
  u.mp -= mpCost(u, abilityId);
  if (ab.hpCostPct) u.hp -= Math.floor((deriveStats(u.build, u).maxHp * ab.hpCostPct) / 100);
  const consumable = ab.consumes ?? item;
  if (consumable) s.inventory[teamKey(u)][consumable]--;
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

function effectiveSpeed(u: BattleUnit): number {
  let sp = deriveStats(u.build, u).sp;
  if (statusActive(u, 'haste')) sp = Math.floor(sp * 1.5);
  if (statusActive(u, 'slow')) sp = Math.max(1, Math.floor(sp / 2));
  return sp;
}

function ctFrozen(u: BattleUnit): boolean {
  return statusActive(u, 'stop') || statusActive(u, 'petrify') || statusActive(u, 'crystal');
}

function inPlay(u: BattleUnit): boolean {
  return !u.gone && !u.hidden && u.pos[0] >= 0;
}

/** Advance the clock until someone's turn starts or the battle ends. */
export function advance(ctx: Ctx): void {
  const s = ctx.state;
  for (let guard = 0; guard < 100000; guard++) {
    if (s.phase !== 'battle') return;
    // Units ready to act (CT ≥ 100), highest CT first, then unit order.
    let ready: BattleUnit | undefined;
    for (const u of s.units) {
      if (!inPlay(u) || ctFrozen(u)) continue;
      if (u.ct >= 100 && (!ready || u.ct > ready.ct)) ready = u;
    }
    if (ready) {
      if (beginTurn(ctx, ready)) return;
      if (checkEnd(ctx)) return;
      continue;
    }
    clockTick(ctx);
    if (checkEnd(ctx)) return;
  }
  throw new Error('Clock did not converge');
}

function clockTick(ctx: Ctx): void {
  const s = ctx.state;
  s.tick++;
  // 1. Status durations
  for (const u of s.units) {
    if (!inPlay(u)) continue;
    for (const st of u.statuses.slice()) {
      if (st.ticks > 0) {
        if (statusActive(u, 'stop') && st.id !== 'stop') continue;
        st.ticks--;
        if (st.ticks === 0) {
          removeStatus(ctx, u, st.id);
          // permanent equipment statuses re-apply
          if (autoStatuses(u.build).includes(st.id)) u.statuses.push({ id: st.id, ticks: 0 });
        }
      }
    }
  }
  // 2. Charged actions
  for (const p of s.pending) p.ticks--;
  const due = s.pending.filter((p) => p.ticks <= 0).sort((a, b) => a.id - b.id);
  for (const p of due) resolvePending(ctx, p.id);
  // 3. CT
  for (const u of s.units) {
    if (!inPlay(u) || ctFrozen(u)) continue;
    u.ct += effectiveSpeed(u);
  }
}

function resolvePending(ctx: Ctx, id: number): void {
  const s = ctx.state;
  const p = s.pending.find((x) => x.id === id);
  if (!p) return;
  s.pending = s.pending.filter((x) => x.id !== id);
  const u = getUnit(s, p.unit);
  if (!s.pending.some((x) => x.unit === p.unit) && u) removeStatus(ctx, u, 'charging', true);
  if (!u || !isAlive(u)) return;
  const ab = ABILITIES[p.ability];
  if (ab.magic && statusActive(u, 'silence')) { ctx.events.push({ e: 'chargeCancel', unit: u.uid, ability: p.ability }); return; }
  let center: Pos;
  if ('unit' in p.target) {
    const t = getUnit(s, p.target.unit);
    center = t && !t.gone ? t.pos : u.pos;
  } else center = p.target.tile;
  if (ab.jump) ctx.events.push({ e: 'jumpDown', unit: u.uid, to: center });
  resolveAbility(ctx, u, p.ability, center, { item: p.item });
  checkTriggers(ctx, 'act');
}

/** Returns true if a controllable turn started; false if the turn was consumed automatically. */
function beginTurn(ctx: Ctx, u: BattleUnit): boolean {
  const s = ctx.state;
  // KO countdown
  const ko = u.statuses.find((x) => x.id === 'ko');
  if (ko) {
    u.ct = 0;
    ko.count = (ko.count ?? s.rules.koCount) - 1;
    ctx.events.push({ e: 'countdown', unit: u.uid, count: Math.max(0, ko.count) });
    if (ko.count <= 0) crystallize(ctx, u);
    return false;
  }
  removeStatus(ctx, u, 'defending', true);
  removeStatus(ctx, u, 'quicken', true);
  if (u.untargetable) { u.ct = 0; return false; }
  // A still-charging action resolves at once when the caster's turn arrives.
  for (const p of s.pending.filter((x) => x.unit === u.uid)) resolvePending(ctx, p.id);
  if (!isAlive(u) || checkEnd(ctx)) { u.ct = Math.min(u.ct - 100, 60); return false; }
  // Doom
  const doom = u.statuses.find((x) => x.id === 'doom');
  if (doom) {
    doom.count = (doom.count ?? 3) - 1;
    ctx.events.push({ e: 'countdown', unit: u.uid, count: Math.max(0, doom.count) });
    if (doom.count <= 0) {
      removeStatus(ctx, u, 'doom');
      ctx.events.push({ e: 'damage', unit: u.uid, amount: u.hp });
      knockOut(ctx, u);
      return false;
    }
  }
  if (statusActive(u, 'sleep')) {
    u.ct = Math.min(u.ct - 60, 60);
    endOfTurnStatus(ctx, u);
    return false;
  }
  u.turns++;
  if (teamKey(u) === 'player') s.turnCount++;
  s.turn = { unit: u.uid, moved: false, acted: false, startPos: [u.pos[0], u.pos[1]], startFacing: u.facing, canUndoMove: true };
  ctx.events.push({ e: 'turn', unit: u.uid });
  oathTurnStart(ctx, u);
  checkTriggers(ctx, 'turn');
  if (checkEnd(ctx)) return true;
  return true;
}

function endTurn(ctx: Ctx, u: BattleUnit, facing: Dir): void {
  const s = ctx.state;
  const t = s.turn;
  if (isAlive(u)) {
    u.facing = facing;
    ctx.events.push({ e: 'face', unit: u.uid, dir: facing });
  }
  const cost = t && t.moved && t.acted ? 100 : t && (t.moved || t.acted) ? 80 : 60;
  u.ct = Math.min(Math.max(0, u.ct - cost), 60);
  oathTurnEnd(ctx, u, !!t?.acted);
  if (isAlive(u)) endOfTurnStatus(ctx, u);
  s.turn = null;
  if (!checkEnd(ctx)) advance(ctx);
}

function endOfTurnStatus(ctx: Ctx, u: BattleUnit): void {
  const max = deriveStats(u.build, u).maxHp;
  if (statusActive(u, 'poison')) applyHpDamage(ctx, u, Math.max(1, Math.floor(max / 8)), false);
  if (isAlive(u) && statusActive(u, 'regen')) applyHeal(ctx, u, Math.max(1, Math.floor(max / 8)));
}

function crystallize(ctx: Ctx, u: BattleUnit): void {
  const s = ctx.state;
  if (statusActive(u, 'undead') && autoStatuses(u.build).includes('undead') && !u.risen && chance(s, 50)) {
    // The restless dead may rise again — once.
    u.risen = true;
    revive(ctx, u, 50);
    ctx.events.push({ e: 'text', unit: u.uid, text: 'Rises again!', color: '#a0b080' });
    return;
  }
  removeStatus(ctx, u, 'ko', true);
  u.statuses = [{ id: 'crystal', ticks: 0 }];
  u.gone = true;
  ctx.events.push({ e: 'crystal', unit: u.uid });
  if (teamKey(u) === 'player' && s.rules.permadeath && !u.guest) s.lost.push(u.build.id);
}

// ---------------------------------------------------------------------------
// Victory, defeat, triggers
// ---------------------------------------------------------------------------

export function isOut(u: BattleUnit): boolean {
  return u.gone || statusActive(u, 'ko') || statusActive(u, 'crystal') || statusActive(u, 'petrify');
}

function bySpawn(s: BattleState, id: string): BattleUnit | undefined {
  return s.units.find((u) => u.spawnId === id || u.build.character === id || u.build.id === id);
}

function condMet(s: BattleState, c: VictoryCondition): boolean {
  switch (c.type) {
    case 'defeatAll': return s.units.filter((u) => u.team === 'enemy' && !u.hidden).every(isOut);
    case 'defeatTarget': { const u = bySpawn(s, c.target); return !!u && isOut(u); }
    case 'protect': { const u = bySpawn(s, c.target); return !!u && isOut(u); }
    case 'survive': return s.turnCount >= c.turns;
    case 'escape':
      if (c.who?.length) {
        return c.who.every((w) => { const u = bySpawn(s, w); return !!u && isAlive(u) && c.tiles.some((p) => samePos(p, u.pos)); });
      }
      return s.units.some((u) => u.team === 'player' && isAlive(u) && c.tiles.some((p) => samePos(p, u.pos)));
    case 'reach':
      return s.units.some((u) => (u.team === 'player') && isAlive(u) && (!('who' in c) || !c.who || u.spawnId === c.who || u.build.character === c.who) && c.tiles.some((p) => samePos(p, u.pos)));
  }
}

/** Ends the battle if a condition is met. Returns true if ended. */
export function checkEnd(ctx: Ctx): boolean {
  const s = ctx.state;
  if (s.phase === 'victory' || s.phase === 'defeat') return true;
  if (s.phase !== 'battle') return false;
  const players = s.units.filter((u) => u.team === 'player' && !u.hidden && u.pos[0] >= 0);
  const wiped = players.length > 0 && players.every(isOut);
  const essentialLost = s.units.some((u) => u.team === 'player' && u.build.essential && u.gone && statusActive(u, 'crystal'));
  const protectLost = s.victory.type === 'protect' && condMet(s, s.victory);
  const extraDefeat = s.defeat.some((c) => condMet(s, c));
  if (wiped || essentialLost || protectLost || extraDefeat) {
    s.phase = 'defeat';
    s.turn = null;
    checkTriggers(ctx, 'defeat');
    ctx.events.push({ e: 'end', result: 'defeat' });
    return true;
  }
  if (s.victory.type !== 'protect' && condMet(s, s.victory)) {
    s.phase = 'victory';
    s.turn = null;
    oathVictory(ctx);
    checkTriggers(ctx, 'victory');
    ctx.events.push({ e: 'end', result: 'victory' });
    return true;
  }
  return false;
}

export function checkTriggers(ctx: Ctx, _reason: string): void {
  const s = ctx.state;
  for (const t of s.triggers) {
    if (t.once !== false && s.fired.includes(t.id)) continue;
    if (!triggerMet(s, t, _reason)) continue;
    s.fired.push(t.id);
    for (const r of t.reveal ?? []) revealUnit(ctx, r);
    ctx.events.push({ e: 'trigger', id: t.id, scene: t.scene });
  }
}

function triggerMet(s: BattleState, t: EngineTrigger, reason: string): boolean {
  const w = t.when;
  switch (w.type) {
    case 'start': return reason === 'start';
    case 'turn': return s.turnCount >= w.turn;
    case 'unitHp': {
      const u = bySpawn(s, w.unit);
      if (!u || !isAlive(u)) return false;
      return (u.hp * 100) / deriveStats(u.build, u).maxHp < w.below;
    }
    case 'unitDefeated': { const u = bySpawn(s, w.unit); return !!u && isOut(u); }
    case 'enemiesLeft': return s.units.filter((u) => u.team === 'enemy' && !u.hidden && !isOut(u)).length <= w.count && reason !== 'start';
    case 'tileReached':
      return s.units.some((u) => (w.team ? teamKey(u) === w.team : teamKey(u) === 'player') && isAlive(u) && w.tiles.some((p) => samePos(p, u.pos)));
    case 'victory': return reason === 'victory';
    case 'defeat': return reason === 'defeat';
  }
}

function revealUnit(ctx: Ctx, spawnId: string): void {
  const s = ctx.state;
  const u = s.units.find((x) => x.spawnId === spawnId && x.hidden);
  if (!u) return;
  // Find nearest free tile to the intended position.
  let best = u.pos;
  if (unitAt(s, u.pos) || !tileAt(s.map, u.pos[0], u.pos[1])) {
    let bd = Infinity;
    for (let y = 0; y < s.map.h; y++) for (let x = 0; x < s.map.w; x++) {
      const t = tileAt(s.map, x, y);
      if (!t || t.blocked || unitAt(s, [x, y])) continue;
      const d = manhattan([x, y], u.pos);
      if (d < bd) { bd = d; best = [x, y]; }
    }
  }
  u.pos = best;
  u.hidden = false;
  ctx.events.push({ e: 'reveal', unit: u.uid });
}

// ---------------------------------------------------------------------------
// Queries for UI / AI
// ---------------------------------------------------------------------------

export function activeUnit(s: BattleState): BattleUnit | undefined {
  return s.turn ? getUnit(s, s.turn.unit) : undefined;
}

/** Who actually decides this unit's action (status can override control). */
export function effectiveControl(u: BattleUnit): 'human' | 'ai' {
  if (statusActive(u, 'confuse') || statusActive(u, 'berserk') || statusActive(u, 'charm') || statusActive(u, 'chicken')) return 'ai';
  return u.control;
}

export interface TurnOrderEntry {
  kind: 'unit' | 'pending';
  uid: string;
  ability?: string;
  ticks: number;
}

/** Forecast the next `n` turns/charged resolutions (ignores future status changes). */
export function turnOrder(s: BattleState, n = 12): TurnOrderEntry[] {
  const out: TurnOrderEntry[] = [];
  const cts = new Map<string, number>();
  const speeds = new Map<string, number>();
  for (const u of s.units) {
    if (!inPlay(u) || ctFrozen(u) || !isAlive(u)) continue;
    cts.set(u.uid, u.ct);
    speeds.set(u.uid, effectiveSpeed(u));
  }
  const pend = s.pending.map((p) => ({ ...p }));
  let tick = 0;
  // The current active unit is first.
  if (s.turn) { out.push({ kind: 'unit', uid: s.turn.unit, ticks: 0 }); cts.set(s.turn.unit, Math.min((cts.get(s.turn.unit) ?? 100) - 100, 60)); }
  for (let guard = 0; guard < 2000 && out.length < n; guard++) {
    let ready: string | null = null;
    let best = -1;
    for (const [uid, ct] of cts) if (ct >= 100 && ct > best) { best = ct; ready = uid; }
    if (ready) {
      out.push({ kind: 'unit', uid: ready, ticks: tick });
      cts.set(ready, Math.min(cts.get(ready)! - 100, 60));
      continue;
    }
    tick++;
    for (const p of pend) {
      p.ticks--;
      if (p.ticks === 0) out.push({ kind: 'pending', uid: p.unit, ability: p.ability, ticks: tick });
    }
    for (const [uid, ct] of cts) cts.set(uid, ct + speeds.get(uid)!);
  }
  return out.slice(0, n);
}

export { statusActive };
export type { StatusId };
