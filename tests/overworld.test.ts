import { describe, expect, it } from 'vitest';
import { planTurn } from '../src/engine/ai';
import { applyCommand } from '../src/engine/battle';
import { newGame } from '../src/game/campaign';
import { chunkSpawns, findPath, makeEncounter, makeRoamer } from '../src/game/overworld';
import { getGame } from '../src/game/state';
import { carve, nodeTile, worldGen } from '../src/game/worldRuntime';

describe('overworld integration', () => {
  it('walks between Chapter 1 locations on world tiles', () => {
    newGame({ difficulty: 'tactician' });
    const gen = worldGen(getGame().world.seed);
    const a = nodeTile(gen, 'tallow_cross');
    const b = nodeTile(gen, 'millers_cut');
    const path = findPath(gen, a, b, 60000);
    expect(path, 'Tallow Cross → Miller\'s Cut').not.toBeNull();
    expect(path!.length).toBeGreaterThan(20);
  });

  it('spawns roaming parties whose encounters produce valid, playable battles', () => {
    newGame({ difficulty: 'tactician' });
    const g = getGame();
    const gen = worldGen(g.world.seed);
    const [px, py] = nodeTile(gen, 'tallow_cross');
    let tested = 0;
    for (let dy = -4; dy <= 4 && tested < 4; dy++) for (let dx = -4; dx <= 4 && tested < 4; dx++) {
      for (const sp of chunkSpawns(gen, g.world.seed, Math.floor(px / 32) + dx, Math.floor(py / 32) + dy)) {
        if (tested >= 4) break;
        const r = makeRoamer(gen, g, sp);
        expect(r.templates.length).toBeGreaterThan(0);
        const enc = makeEncounter(gen, carve, g, r, [Math.round(r.x) + 1, Math.round(r.y)]);
        expect(enc.deployTiles.length).toBeGreaterThanOrEqual(4);
        let s = enc.state;
        const humans = s.units.filter((u) => u.team === 'player').slice(0, 5);
        const d = applyCommand(s, { type: 'deploy', placements: humans.map((u, i) => ({ uid: u.uid, pos: enc.deployTiles[i], facing: 'n' as const })) });
        expect(d.error).toBeUndefined();
        s = d.state;
        for (let t = 0; t < 300 && s.phase === 'battle'; t++) {
          for (const u of s.units) if (u.team === 'player') u.control = 'ai';
          for (const c of planTurn(s)) { const x = applyCommand(s, c); s = x.error ? applyCommand(s, { type: 'wait', unit: s.turn!.unit, facing: 's' }).state : x.state; if (s.phase !== 'battle') break; }
        }
        expect(['victory', 'defeat']).toContain(s.phase);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(0);
  }, 120000);
});
