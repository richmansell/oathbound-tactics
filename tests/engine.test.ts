import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/content/abilities';
import { ITEMS } from '../src/content/items';
import { GENERIC_JOBS, JOBS } from '../src/content/jobs';
import type { Appearance } from '../src/content/schema';
import { planTurn } from '../src/engine/ai';
import { applyCommand, createBattle, startBattle, turnOrder } from '../src/engine/battle';
import { previewAbility } from '../src/engine/combat';
import { attackSide, parseMapRows } from '../src/engine/grid';
import { createBuild } from '../src/engine/factory';
import { reachable } from '../src/engine/movement';
import { addJp, jobUnlocked, learn } from '../src/engine/progression';
import { validTargets } from '../src/engine/targeting';
import { deriveStats } from '../src/engine/units';
import type { BattleState, Team } from '../src/engine/types';

const APP: Appearance = { body: 'male', skin: 'light', hair: 'hair_plain', hairColor: 'chestnut' };

const MAP = parseMapRows('test', 'Test Field', [
  'g0 g0 g1 g1 g2 g2 g1 g0 g0 g0',
  'g0 g0 g1 g2 g3 g2 g1 g0 g0 g0',
  'g0 g0 g0 g1 g2 g1 g0 g0 w0 w0',
  'd0 d0 g0 g0 g1 g0 g0 g0 w0 W0',
  'd0 d0 g0 g0 g0 g0 g0 g0 g0 w0',
  'd0 d0 g0 s4 s4 g0 g0 g0 g0 g0',
  'g0 g0 g0 s4 s6 g0 g0 g1 g1 g0',
  'g0 g0 g0 g0 g0 g0 g1 g2 g2 g1',
], 'day', [{ at: [6, 4], type: 'tree' }]);

function squad(team: Team, jobs: string[], level: number, row: number): { build: ReturnType<typeof createBuild>; team: Team; control: 'ai'; pos: [number, number]; facing: 'n' | 's' }[] {
  return jobs.map((job, i) => ({
    build: createBuild({ id: `${team}-${job}-${i}`, name: `${job} ${i}`, appearance: APP, job, level, autoLearn: true }),
    team, control: 'ai' as const, pos: [1 + i * 2, row] as [number, number], facing: (row === 0 ? 's' : 'n') as 'n' | 's',
  }));
}

function runToEnd(seed: number): { state: BattleState; turns: number } {
  let state = createBattle({
    map: MAP, seed,
    units: [...squad('player', ['knight', 'wizard', 'cleric', 'ranger', 'monk'], 8, 7), ...squad('enemy', ['squire', 'rogue', 'lancer', 'hexer', 'chronomancer'], 8, 0)],
    victory: { type: 'defeatAll' },
    inventory: { player: { potion: 5, phoenix_down: 2 }, enemy: { potion: 3 } },
  });
  state = startBattle(state).state;
  let turns = 0;
  while (state.phase === 'battle' && turns < 400) {
    const cmds = planTurn(state);
    expect(cmds.length).toBeGreaterThan(0);
    for (const c of cmds) {
      const r = applyCommand(state, c);
      if (r.error) throw new Error(`Command failed (${r.error}): ${JSON.stringify(c)}`);
      state = r.state;
      if (state.phase !== 'battle') break;
    }
    turns++;
  }
  return { state, turns };
}

describe('content integrity', () => {
  it('every job ability exists and every item visual is declared', () => {
    for (const j of Object.values(JOBS)) for (const a of j.abilities) expect(ABILITIES[a], `${j.id}:${a}`).toBeDefined();
    for (const it of Object.values(ITEMS)) if (it.type !== 'consumable' && it.category !== 'ring' && it.tier < 9) expect(it.visual?.length, it.id).toBeGreaterThan(0);
    for (const a of Object.values(ABILITIES)) if (a.consumes) expect(ITEMS[a.consumes], a.id).toBeDefined();
    expect(GENERIC_JOBS).toHaveLength(16);
  });
});

describe('geometry', () => {
  it('detects back and side attacks', () => {
    expect(attackSide([5, 6], [5, 5], 's')).toBe('front');
    expect(attackSide([5, 4], [5, 5], 's')).toBe('back');
    expect(attackSide([6, 5], [5, 5], 's')).toBe('side');
  });
  it('respects jump height and blocking props', () => {
    const state = createBattle({ map: MAP, seed: 1, units: squad('player', ['squire'], 1, 7), victory: { type: 'defeatAll' } });
    const u = state.units[0];
    u.pos = [2, 5];
    const r = reachable(state, u);
    expect(r.dests.some((p) => p[0] === 6 && p[1] === 4)).toBe(false); // tree
    // s6 tile is 6 high from a 0 tile (jump 3) — unreachable directly; s4 neighbours are also too high.
    expect(r.dests.some((p) => p[0] === 4 && p[1] === 6)).toBe(false);
  });
});

describe('battle simulation', () => {
  it('AI vs AI battle finishes with a winner', () => {
    const { state, turns } = runToEnd(12345);
    expect(['victory', 'defeat']).toContain(state.phase);
    expect(turns).toBeLessThan(400);
  });
  it('is deterministic for a given seed', () => {
    const a = runToEnd(777);
    const b = runToEnd(777);
    expect(a.state.phase).toBe(b.state.phase);
    expect(a.state.tick).toBe(b.state.tick);
    expect(JSON.stringify(a.state.units.map((u) => [u.hp, u.pos]))).toBe(JSON.stringify(b.state.units.map((u) => [u.hp, u.pos])));
  });
  it('runs many seeds without errors', () => {
    for (let s = 1; s <= 12; s++) runToEnd(s * 101);
  });
  it('forecasts a turn order', () => {
    const state = startBattle(createBattle({ map: MAP, seed: 3, units: [...squad('player', ['squire', 'rogue'], 5, 7), ...squad('enemy', ['knight'], 5, 0)], victory: { type: 'defeatAll' } })).state;
    const order = turnOrder(state, 8);
    expect(order).toHaveLength(8);
    expect(order[0].uid).toBe(state.turn!.unit);
  });
});

describe('formulas and preview', () => {
  it('sword damage is PA × WP and protect reduces it', () => {
    const state = createBattle({ map: MAP, seed: 9, units: [...squad('player', ['knight'], 10, 7), ...squad('enemy', ['squire'], 10, 0)], victory: { type: 'defeatAll' } });
    const k = state.units[0], e = state.units[1];
    k.build.equipment = { main: 'iron_sword' };
    e.build.equipment = {};
    e.statuses = [];
    k.pos = [3, 3]; e.pos = [3, 4]; e.facing = 'n';
    const st = deriveStats(k.build, k);
    const p1 = previewAbility(state, k.uid, 'attack', e.pos)[0];
    expect(p1.effects[0].min).toBe(st.pa * 5);
    e.statuses.push({ id: 'protect', ticks: 10 });
    const p2 = previewAbility(state, k.uid, 'attack', e.pos)[0];
    expect(p2.effects[0].min).toBe(Math.floor(st.pa * 5 * (2 / 3)));
  });
  it('bows cannot hit adjacent units but reach farther from height', () => {
    const state = createBattle({ map: MAP, seed: 9, units: [...squad('player', ['ranger'], 10, 7)], victory: { type: 'defeatAll' } });
    const r = state.units[0];
    r.pos = [4, 6]; // height 6
    const tiles = validTargets(state, r, 'attack');
    expect(tiles.length).toBe(0); // nobody to shoot
  });
});

describe('progression', () => {
  it('unlocks jobs by job level and learns with JP', () => {
    const b = createBuild({ id: 'p1', name: 'Test', appearance: APP, job: 'squire' });
    expect(jobUnlocked(b, 'knight')).toBe(false);
    addJp(b, 'squire', 250);
    expect(jobUnlocked(b, 'knight')).toBe(true);
    expect(learn(b, 'squire', 'focus')).toBe(true);
    expect(b.jobs.squire.jp).toBe(100);
    expect(learn(b, 'squire', 'focus')).toBe(false);
  });
});

describe('story and monster jobs', () => {
  it('every referenced job in the main campaign exists with valid abilities', async () => {
    const { enemies } = await import('../src/content/campaigns/main/enemies');
    const { characters } = await import('../src/content/campaigns/main/characters');
    for (const e of Object.values(enemies)) expect(JOBS[e.job], `enemy ${e.id} job ${e.job}`).toBeDefined();
    for (const c of Object.values(characters)) expect(JOBS[c.job], `character ${c.id} job ${c.job}`).toBeDefined();
    for (const j of Object.values(JOBS)) for (const a of j.abilities) expect(ABILITIES[a], `${j.id}:${a}`).toBeDefined();
  });
  it('monster battles resolve (hollows vs lanternbearer party)', () => {
    let state = createBattle({
      map: MAP, seed: 99,
      units: [
        ...['lanternbearer', 'ashguard', 'inquisitor', 'cleric'].map((job, i) => ({ build: createBuild({ id: `p${i}`, name: job, appearance: APP, job, level: 6, autoLearn: true }), team: 'player' as const, control: 'ai' as const, pos: [1 + i * 2, 7] as [number, number] })),
        ...['wolfkin', 'hollow', 'skeleton', 'ghoul', 'goblin', 'brute', 'troll', 'lizardfolk', 'minotaur', 'gaunt', 'boarman'].map((job, i) => ({ build: createBuild({ id: `e${i}`, name: job, appearance: APP, job, level: 4, autoLearn: true }), team: 'enemy' as const, control: 'ai' as const, pos: [i % 10, i < 10 ? 0 : 1] as [number, number] })),
      ],
      victory: { type: 'defeatAll' },
    });
    state = startBattle(state).state;
    let turns = 0;
    while (state.phase === 'battle' && turns < 500) {
      for (const c of planTurn(state)) { const r = applyCommand(state, c); if (r.error) throw new Error(r.error + JSON.stringify(c)); state = r.state; if (state.phase !== 'battle') break; }
      turns++;
    }
    expect(['victory', 'defeat']).toContain(state.phase);
  });
});

describe('battle oaths', () => {
  it('Oath of the Ford breaks when retreating and grants PA while kept', async () => {
    const state0 = createBattle({ map: MAP, seed: 5, deploy: true, units: [...squad('player', ['knight'], 5, 7).map((u) => ({ ...u, pos: undefined, control: 'human' as const })), ...squad('enemy', ['squire'], 5, 0)], victory: { type: 'defeatAll' } });
    const uid = state0.units[0].uid;
    let r = applyCommand(state0, { type: 'deploy', placements: [{ uid, pos: [4, 4], facing: 'n', oath: 'oath_no_retreat' }] });
    expect(r.error).toBeUndefined();
    let s = r.state;
    const u = s.units.find((x) => x.uid === uid)!;
    expect(u.oath?.state).toBe('sworn');
    expect(u.mods.pa).toBe(2);
    // Play until the knight's turn, then move away from enemies and wait.
    for (let i = 0; i < 20 && s.turn?.unit !== uid; i++) { for (const c of planTurn(s)) { s = applyCommand(s, c).state; if (s.turn?.unit === uid) break; } }
    if (s.turn?.unit === uid) {
      const me = s.units.find((x) => x.uid === uid)!;
      const foes = s.units.filter((x) => x.team === 'enemy');
      const far = (p: [number, number]) => Math.min(...foes.map((f) => Math.abs(f.pos[0] - p[0]) + Math.abs(f.pos[1] - p[1])));
      const dest = reachable(s, me).dests.reduce((a, b) => (far(b) > far(a) ? b : a), me.pos);
      expect(far(dest)).toBeGreaterThan(far(me.pos));
      const mv = applyCommand(s, { type: 'move', unit: uid, to: dest });
      expect(mv.error).toBeUndefined();
      s = mv.state;
      s = applyCommand(s, { type: 'wait', unit: uid, facing: 'n' }).state;
      const k = s.units.find((x) => x.uid === uid)!;
      expect(k.oath?.state).toBe('broken');
      expect(k.statuses.some((x) => x.id === 'doubt')).toBe(true);
    }
  });
});
