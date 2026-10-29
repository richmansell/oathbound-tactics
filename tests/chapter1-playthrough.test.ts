/**
 * Plays the whole of Chapter 1 headlessly: every beat in order, scene flags and
 * choices applied, every story battle auto-played (AI on both sides, with a few
 * retries like a player would), progression carried forward between battles.
 */
import { describe, expect, it } from 'vitest';
import { planTurn } from '../src/engine/ai';
import { applyCommand } from '../src/engine/battle';
import type { BattleState } from '../src/engine/types';
import { advanceInstantBeats, applyBattleResult, completeBeat, currentBeat, newGame, prepareStoryBattle } from '../src/game/campaign';
import { packData } from '../src/game/campaignData';
import { getGame, mutate } from '../src/game/state';
import { learn } from '../src/engine/progression';
import { ABILITIES } from '../src/content/abilities';
import { JOBS } from '../src/content/jobs';

function playScene(id: string): void {
  const scene = packData('main').pack.scenes[id];
  if (!scene) return;
  for (const s of scene.steps) {
    if (s.kind === 'flag') mutate((g) => { if (s.set && !g.story.flags.includes(s.set)) g.story.flags.push(s.set); });
    if (s.kind === 'choice') { const o = s.options[0]; if (o.setFlag) mutate((g) => { if (!g.story.flags.includes(o.setFlag!)) g.story.flags.push(o.setFlag!); }); }
  }
}

/** Spend JP and shop like a sensible player between battles. */
function spendJp(): void {
  mutate((g) => {
    // Shopping: keep a stock of potions and phoenix downs.
    g.inventory.potion = Math.max(g.inventory.potion ?? 0, 6);
    g.inventory.phoenix_down = Math.max(g.inventory.phoenix_down ?? 0, 4);
    for (const u of g.roster) {
      // A player soon learns Alchemy basics and slots them as a secondary.
      if (u.job !== 'alchemist' && !u.secondary) {
        u.jobs.alchemist ??= { jp: 0, total: 200, learned: [] };
        for (const a of ['use_potion', 'use_phoenix_down']) if (!u.jobs.alchemist.learned.includes(a)) u.jobs.alchemist.learned.push(a);
        u.secondary = 'alchemist';
      }
      const job = JOBS[u.job];
      const cheap = job.abilities.filter((a) => ABILITIES[a]?.kind === 'action').sort((a, b) => ABILITIES[a].jp - ABILITIES[b].jp);
      for (const a of cheap) learn(u, u.job, a);
      for (const k of ['reaction', 'support', 'movement'] as const) {
        const opt = job.abilities.find((a) => ABILITIES[a]?.kind === k);
        if (opt && learn(u, u.job, opt) && !u[k]) u[k] = opt;
      }
    }
  });
}

function autoBattle(id: string, attempt: number): { result: string; state: BattleState } {
  mutate((g) => { g.id = `pt${attempt}`; });
  const prep = prepareStoryBattle(id);
  let state = prep.state;
  const humans = state.units.filter((u) => u.team === 'player' && u.control === 'human');
  const req = prep.def.required ?? [];
  humans.sort((a, b) => Number(req.includes(b.build.id)) - Number(req.includes(a.build.id)) || b.build.level - a.build.level);
  const placements = humans.slice(0, Math.min(prep.def.maxDeploy, prep.deployTiles.length)).map((u, i) => ({ uid: u.uid, pos: prep.deployTiles[i], facing: 'n' as const }));
  let r = applyCommand(state, { type: 'deploy', placements });
  if (r.error) throw new Error(`${id}: ${r.error}`);
  state = r.state;
  for (let turns = 0; state.phase === 'battle' && turns < 600; turns++) {
    for (const u of state.units) if (u.team === 'player') u.control = 'ai';
    for (const c of planTurn(state)) {
      r = applyCommand(state, c);
      if (r.error) { r = applyCommand(state, { type: 'wait', unit: state.turn!.unit, facing: 's' }); }
      state = r.state;
      if (state.phase !== 'battle') break;
    }
  }
  return { result: state.phase, state };
}

describe('Chapter 1 full playthrough', () => {
  it('reaches the end of the chapter', () => {
    newGame({ difficulty: 'tactician' });
    const log: string[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const b = advanceInstantBeats();
      if (!b) break;
      if (b.kind === 'end') { log.push('END'); break; }
      if (b.kind === 'scene') { playScene(b.scene); completeBeat(b.scene); continue; }
      if (b.kind === 'title') { completeBeat(); continue; }
      if (b.kind === 'battle') {
        const def = packData('main').pack.battles[b.battle];
        if (def.introScene) playScene(def.introScene);
        spendJp();
        let won = false;
        for (let attempt = 0; attempt < 6 && !won; attempt++) {
          const { result, state } = autoBattle(b.battle, attempt);
          if (result !== 'victory') console.log(`  ${b.battle} attempt ${attempt}: ${result} tick ${state.tick} | ${state.units.filter((u) => !u.hidden).map((u) => `${u.team[0]}:${u.build.name}:${u.hp}${u.statuses.map((x) => x.id).join('/')}`).join(' ')}`);
          if (result === 'victory') {
            for (const t of def.triggers ?? []) if (state.fired.includes(t.id) && t.scene) playScene(t.scene);
            applyBattleResult(state, 'victory', def.rewards);
            won = true;
          } else {
            // Like a player, keep the experience from a lost attempt and try again.
            applyBattleResult(state, 'defeat');
          }
          spendJp();
        }
        if (def.outroScene) playScene(def.outroScene);
        log.push(`${b.battle}:${won ? 'won' : 'LOST'} party ${getGame().party.map((id) => { const u = getGame().roster.find((x) => x.id === id)!; return `${u.id}${u.level}`; }).join(' ')}`);
        console.log(log[log.length - 1]);
        expect(won, `${b.battle} not won in 6 attempts`).toBe(true);
        completeBeat(b.battle);
        continue;
      }
      completeBeat();
    }
    // eslint-disable-next-line no-console
    console.log(log.join('\n'));
    const g = getGame();
    expect(log[log.length - 1]).toBe('END');
    expect(currentBeat(g)?.kind ?? 'end').toBe('end');
    expect(g.story.flags).toContain('oaths_unlocked');
    expect(g.roster.map((u) => u.id)).toEqual(expect.arrayContaining(['bren', 'tamsin', 'hesper', 'aldous', 'eira', 'jory']));
    expect(g.roster.find((u) => u.id === 'bren')!.jobs.lanternbearer).toBeDefined();
  }, 600000);
});
