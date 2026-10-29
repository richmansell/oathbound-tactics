/**
 * Auto-plays every Chapter 1 story battle with AI on both sides to check that
 * each loads, deploys, fires its triggers without errors and is winnable at the
 * levels the story expects.
 */
import { describe, expect, it } from 'vitest';
import { planTurn } from '../src/engine/ai';
import { applyCommand } from '../src/engine/battle';
import type { BattleState } from '../src/engine/types';
import { newGame, prepareStoryBattle, buildFromCharacter } from '../src/game/campaign';
import { packData } from '../src/game/campaignData';
import { getGame, mutate } from '../src/game/state';

const LEVEL_FOR: Record<string, number> = { c1_sk_sallowmere: 3, c1_sk_gibbet: 4, c1_sk_kingsbarrow: 6, c1_b1_lantern_road: 1, c1_b2_millers_cut: 3, c1_b3_millbrook: 4, c1_b4_sallow_ford: 5, c1_b5_saint_odile: 6, c1_b6_tenpenny: 7, c1_b7_hollin_tor: 8 };
const PARTY_FOR: Record<string, string[]> = {
  c1_sk_sallowmere: ['bren', 'tamsin', 'hesper', 'odo', 'wat'],
  c1_sk_gibbet: ['bren', 'tamsin', 'hesper', 'odo', 'wat'],
  c1_sk_kingsbarrow: ['bren', 'tamsin', 'hesper', 'aldous'],
  c1_b1_lantern_road: ['bren', 'odo', 'wat', 'merrit'],
  c1_b2_millers_cut: ['bren', 'odo', 'wat', 'merrit', 'tamsin', 'hesper'],
  c1_b3_millbrook: ['bren', 'odo', 'wat', 'merrit', 'tamsin', 'hesper'],
  c1_b4_sallow_ford: ['bren', 'tamsin', 'hesper'],
  c1_b5_saint_odile: ['bren', 'tamsin', 'hesper'],
  c1_b6_tenpenny: ['bren', 'tamsin', 'hesper', 'aldous'],
  c1_b7_hollin_tor: ['bren', 'tamsin', 'hesper', 'aldous', 'eira', 'jory'],
};

function play(battleId: string, seed: number): { result: string; turns: number; triggers: string[] } {
  newGame({ difficulty: 'tactician' });
  const pack = packData('main').pack;
  mutate((g) => {
    g.roster = PARTY_FOR[battleId].map((id) => buildFromCharacter(pack.characters[id], LEVEL_FOR[battleId]));
    g.party = g.roster.map((u) => u.id);
    g.id = `sim${seed}`;
    g.inventory = { potion: 6, phoenix_down: 3, hi_potion: 2 };
  });
  const prep = prepareStoryBattle(battleId, getGame());
  let state: BattleState = prep.state;
  // Deploy: required first, then others, up to maxDeploy.
  const humans = state.units.filter((u) => u.team === 'player' && u.control === 'human');
  const req = prep.def.required ?? [];
  humans.sort((a, b) => Number(req.includes(b.build.id)) - Number(req.includes(a.build.id)));
  const placements = humans.slice(0, Math.min(prep.def.maxDeploy, prep.deployTiles.length)).map((u, i) => ({ uid: u.uid, pos: prep.deployTiles[i], facing: 'n' as const }));
  let r = applyCommand(state, { type: 'deploy', placements });
  if (r.error) throw new Error(`${battleId} deploy: ${r.error}`);
  state = r.state;
  const triggers: string[] = [];
  for (const e of r.events) if (e.e === 'trigger') triggers.push(e.id);
  for (const u of state.units) if (u.team === 'player') u.control = 'ai';
  let turns = 0;
  while (state.phase === 'battle' && turns < 600) {
    for (const c of planTurn(state)) {
      r = applyCommand(state, c);
      if (r.error) { r = applyCommand(state, { type: 'wait', unit: state.turn!.unit, facing: 's' }); if (r.error) throw new Error(`${battleId}: ${r.error}`); }
      state = r.state;
      for (const e of r.events) if (e.e === 'trigger') triggers.push(e.id);
      for (const u of state.units) if (u.team === 'player') u.control = 'ai';
      if (state.phase !== 'battle') break;
    }
    turns++;
  }
  return { result: state.phase, turns, triggers };
}

describe('Chapter 1 story battles', () => {
  for (const id of Object.keys(LEVEL_FOR)) {
    it(`${id} is playable and winnable`, () => {
      const results = [1, 2, 3, 4, 5].map((s) => play(id, s));
      const wins = results.filter((x) => x.result === 'victory').length;
      // eslint-disable-next-line no-console
      console.log(`${id}: ${wins}/5 wins, turns ${results.map((x) => x.turns).join(',')}, triggers ${[...new Set(results.flatMap((x) => x.triggers))].join(' ')}`);
      expect(results.every((x) => x.result === 'victory' || x.result === 'defeat')).toBe(true);
      expect(wins).toBeGreaterThanOrEqual(1);
    }, 120000);
  }
});
