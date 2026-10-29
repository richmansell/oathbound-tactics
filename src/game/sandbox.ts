/** Dev sandbox battle: a mixed party vs a mixed enemy squad on a varied map. */
import type { Appearance } from '../content/schema';
import { createBattle } from '../engine/battle';
import { createBuild } from '../engine/factory';
import { parseMapRows } from '../engine/grid';
import type { BattleState, Pos } from '../engine/types';

export const SANDBOX_MAP = parseMapRows('sandbox', 'Thornwick Ford', [
  'g2 g2 g3 g3 g4 t4 t4 g3 g2 g2 g1 g1',
  'g2 g2 g3 s6 s6 g4 t4 g3 g2 g1 g1 g1',
  'g1 g2 g3 s6 s8 g4 g3 g2 g1 g1 d1 d1',
  'g1 g1 g2 g3 g4 g3 g2 g1 d1 d1 d1 d0',
  'd1 d1 d1 r1 r1 r1 r1 r1 r1 d0 w0 w0',
  'd0 d0 r0 r0 o2 o2 o2 r0 d0 w0 W0 w0',
  'w0 w0 w0 w0 o2 o2 o2 w0 w0 W0 W0 w0',
  'w0 W0 W0 w0 o2 o2 o2 w0 w0 w0 w0 d0',
  'd0 w0 w0 d0 r0 r0 r0 d0 d1 g1 g1 g1',
  'g1 d0 d0 g1 r1 r1 g1 g1 g2 g2 g3 g3',
  'g1 g1 g1 g2 g2 g1 g1 g2 g3 g4 g5 g4',
  'g1 g1 g2 g2 g3 g2 g2 g3 g4 g6 g7 g5',
], 'day', [
  { at: [0, 0], type: 'tree' }, { at: [1, 2], type: 'bush' }, { at: [7, 1], type: 'tree' }, { at: [10, 2], type: 'pine' },
  { at: [11, 0], type: 'pine' }, { at: [2, 9], type: 'rock' }, { at: [9, 9], type: 'tree' }, { at: [11, 11], type: 'boulder' },
  { at: [3, 4], type: 'fence' }, { at: [8, 8], type: 'barrel' }, { at: [0, 11], type: 'flowers' }, { at: [6, 10], type: 'stump' },
  { at: [5, 2], type: 'banner' }, { at: [3, 8], type: 'crate' },
]);

const look = (body: Appearance['body'], skin: string, hair: string, hairColor: string, beard?: string): Appearance => ({ body, skin, hair, hairColor, beard, eyes: 'brown' });

export function sandboxBattle(seed = 2024): { state: BattleState; deployTiles: Pos[] } {
  const party = [
    createBuild({ id: 'corin', name: 'Corin', appearance: look('male', 'light', 'hair_messy1', 'chestnut'), job: 'knight', level: 6, autoLearn: true, essential: true }),
    createBuild({ id: 'mira', name: 'Mira', appearance: look('female', 'olive', 'hair_ponytail', 'raven'), job: 'wizard', level: 6, autoLearn: true }),
    createBuild({ id: 'tobin', name: 'Tobin', appearance: look('male', 'brown', 'hair_buzzcut', 'black', 'beards_trimmed'), job: 'cleric', level: 6, autoLearn: true }),
    createBuild({ id: 'wren', name: 'Wren', appearance: look('female', 'light', 'hair_bob', 'ginger'), job: 'ranger', level: 6, autoLearn: true }),
    createBuild({ id: 'hale', name: 'Hale', appearance: look('male', 'amber', 'hair_spiked', 'blonde'), job: 'monk', level: 6, autoLearn: true }),
  ];
  const foes = [
    createBuild({ id: 'b1', name: 'Brigand', appearance: look('male', 'taupe', 'hair_unkempt', 'dark_brown', 'beards_beard'), job: 'squire', level: 6, autoLearn: true }),
    createBuild({ id: 'b2', name: 'Cutthroat', appearance: look('male', 'light', 'hair_shorthawk', 'black'), job: 'rogue', level: 6, autoLearn: true }),
    createBuild({ id: 'b3', name: 'Hedge Witch', appearance: look('female', 'light', 'hair_long_messy', 'gray'), job: 'hexer', level: 6, autoLearn: true }),
    createBuild({ id: 'b4', name: 'Archer', appearance: look('female', 'bronze', 'hair_braid', 'black'), job: 'ranger', level: 6, autoLearn: true }),
    createBuild({ id: 'b5', name: 'Bruiser', appearance: look('muscular', 'olive', 'hair_balding', 'sandy', 'beards_winter'), job: 'knight', level: 7, autoLearn: true }),
  ];
  const state = createBattle({
    map: SANDBOX_MAP,
    seed,
    deploy: true,
    units: [
      ...party.map((b) => ({ build: b, team: 'player' as const, control: 'human' as const })),
      ...foes.map((b, i) => ({ build: b, team: 'enemy' as const, control: 'ai' as const, pos: [[3, 1], [5, 1], [4, 2], [9, 1], [6, 3]][i] as Pos, facing: 's' as const })),
    ],
    victory: { type: 'defeatAll' },
    inventory: { player: { potion: 6, hi_potion: 2, phoenix_down: 3, ether: 2, antidote: 2, eye_drops: 2, echo_herbs: 1, remedy: 1 }, enemy: { potion: 2 } },
  });
  return { state, deployTiles: [[3, 10], [4, 10], [5, 10], [4, 11], [5, 11], [6, 11], [3, 11]] };
}
