import { describe, expect, it } from 'vitest';
import { Match } from '../server/match';
import { planTurn } from '../src/engine/ai';
import { applyCommand } from '../src/engine/battle';
import { createBuild } from '../src/engine/factory';
import type { BattleState, Command } from '../src/engine/types';
import { stateHash, type ServerMsg } from '../src/net/protocol';
import { sanitiseParty } from '../src/net/validate';

const look = { body: 'male' as const, skin: 'light', hair: 'hair_plain', hairColor: 'chestnut' };

function party(prefix: string, jobs: string[]) {
  return jobs.map((job, i) => createBuild({ id: `${prefix}${i}`, name: `${prefix}${i}`, appearance: look, job, level: 20, autoLearn: true }));
}

describe('online authoritative match', () => {
  it('two clients stay in lockstep with the server for a whole match', () => {
    const inbox: ServerMsg[][] = [[], []];
    const seats = [0, 1].map((i) => ({ id: `c${i}`, name: `P${i}`, send: (m: object) => inbox[i].push(m as ServerMsg) })) as [never, never];
    const a = sanitiseParty(party('a', ['knight', 'wizard', 'cleric', 'ranger', 'monk']));
    const b = sanitiseParty(party('b', ['lancer', 'rogue', 'hexer', 'squire', 'chronomancer']));
    expect(a.errors).toEqual([]);
    const m = new Match(seats, [a.party, b.party]);
    const local: BattleState[] = [];
    for (const i of [0, 1]) {
      const msg = inbox[i].shift()!;
      expect(msg.t).toBe('match');
      if (msg.t === 'match') local[i] = msg.state;
    }
    // Each side deploys its own units.
    for (const i of [0, 1]) {
      const mine = local[i].units.filter((u) => u.owner === i);
      const tiles = i === 0 ? [[3, 10], [4, 10], [5, 10], [4, 11], [5, 11]] : [[3, 1], [4, 1], [5, 1], [4, 2], [5, 2]];
      expect(m.deploy(i, mine.map((u, k) => ({ uid: u.uid, pos: tiles[k] as [number, number], facing: i === 0 ? 'n' : 's' })))).toBeNull();
    }
    const drain = () => {
      for (const i of [0, 1]) {
        while (inbox[i].length) {
          const msg = inbox[i].shift()!;
          if (msg.t === 'started' || msg.t === 'applied') {
            const r = applyCommand(local[i], msg.cmd);
            expect(r.error).toBeUndefined();
            local[i] = r.state;
            expect(stateHash(local[i])).toBe(msg.hash);
          }
        }
      }
    };
    drain();
    let guard = 0;
    while (!m.ended && guard++ < 800) {
      const active = m.state.units.find((u) => u.uid === m.state.turn?.unit)!;
      const seat = active.owner!;
      // The client picks a command from its own replica (AI stands in for a human).
      const cmds: Command[] = planTurn(local[seat]);
      for (const c of cmds) {
        const err = m.command(seat, 0, c);
        if (err) { m.command(seat, 0, { type: 'wait', unit: active.uid, facing: 's' }); drain(); break; }
        drain();
        if (m.ended || m.state.turn?.unit !== active.uid) break;
      }
    }
    expect(m.ended).toBe(true);
    expect(stateHash(local[0])).toBe(stateHash(m.state));
    expect(stateHash(local[1])).toBe(stateHash(m.state));
  });

  it('rejects commands out of turn and sanitises hostile parties', () => {
    const bad = sanitiseParty([{ job: 'archscribe_hax', raw: { hp: 9999 } }, { job: 'knight', raw: { hp: 9999, pa: 999 }, equipment: { main: 'kingsbane' }, jobs: { knight: { learned: ['flare', 'rend_helm'], total: 1 } } }]);
    expect(bad.party).toHaveLength(1);
    const k = bad.party[0];
    expect(k.raw.pa).toBeLessThan(20);
    expect(k.jobs.knight.learned).toEqual(['rend_helm']);
  });
});
