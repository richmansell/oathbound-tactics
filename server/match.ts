/**
 * An authoritative PvP match: owns the battle state, validates every command
 * against turn ownership and the engine's own legality checks.
 */
import { applyCommand, createBattle, effectiveControl } from '../src/engine/battle';
import { planTurn } from '../src/engine/ai';
import { parseMapRows } from '../src/engine/grid';
import { hashString } from '../src/engine/rng';
import type { BattleState, Command, Pos, UnitBuild } from '../src/engine/types';
import { stateHash } from '../src/net/protocol';
import { SANDBOX_MAP } from '../src/game/sandbox';

export interface Seat {
  id: string;
  name: string;
  send: (msg: object) => void;
}

const DEPLOY: [Pos[], Pos[]] = [
  [[3, 10], [4, 10], [5, 10], [4, 11], [5, 11], [6, 11], [3, 11]],
  [[3, 1], [4, 1], [5, 1], [4, 2], [5, 2], [6, 2], [9, 1]],
];

export class Match {
  readonly id: string;
  state: BattleState;
  private seq = 0;
  private deployed: (Command & { type: 'deploy' })['placements'][] = [];
  ended = false;

  constructor(public seats: [Seat, Seat], parties: [UnitBuild[], UnitBuild[]]) {
    this.id = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const map = SANDBOX_MAP ?? parseMapRows('pvp', 'Arena', ['g0 g0', 'g0 g0'], 'day');
    this.state = createBattle({
      map, seed: hashString(this.id), deploy: true,
      units: [
        ...parties[0].map((b) => ({ build: b, team: 'player' as const, control: 'human' as const, owner: 0 })),
        ...parties[1].map((b) => ({ build: b, team: 'enemy' as const, control: 'human' as const, owner: 1 })),
      ],
      victory: { type: 'defeatAll' },
      rules: { permadeath: false, aiLevel: 1, koCount: 3, spill: 0 },
      inventory: { player: { potion: 3, phoenix_down: 1 }, enemy: { potion: 3, phoenix_down: 1 } },
    });
    seats.forEach((seat, i) => seat.send({ t: 'match', matchId: this.id, you: i, opponent: seats[1 - i].name, state: this.state, deployTiles: DEPLOY[i] }));
  }

  /** Both players deploy secretly; the combined deploy command starts the battle. */
  deploy(seat: number, placements: (Command & { type: 'deploy' })['placements']): string | null {
    if (this.state.phase !== 'deploy') return 'not deploying';
    const allowed = new Set(DEPLOY[seat].map((p) => p.join(',')));
    const mine = placements.filter((p) => {
      const u = this.state.units.find((x) => x.uid === p.uid);
      return u && u.owner === seat && allowed.has(p.pos.join(','));
    });
    if (!mine.length) return 'no valid placements';
    this.deployed[seat] = mine;
    if (this.deployed[0] && this.deployed[1]) {
      const cmd: Command = { type: 'deploy', placements: [...this.deployed[0], ...this.deployed[1]] };
      const r = applyCommand(this.state, cmd);
      if (r.error) return r.error;
      this.state = r.state;
      const hash = stateHash(this.state);
      for (const s of this.seats) s.send({ t: 'started', matchId: this.id, cmd, hash });
      this.checkEnd();
      this.runAiTurns();
    }
    return null;
  }

  command(seat: number, seq: number, cmd: Command): string | null {
    if (this.ended) return 'match over';
    if (cmd.type === 'deploy') return 'use deploy';
    const active = this.state.turn ? this.state.units.find((u) => u.uid === this.state.turn!.unit) : undefined;
    if (!active || active.owner !== seat) return 'not your turn';
    if (cmd.unit !== active.uid) return 'wrong unit';
    const r = applyCommand(this.state, cmd);
    if (r.error) return r.error;
    this.state = r.state;
    this.seq++;
    const hash = stateHash(this.state);
    for (const s of this.seats) s.send({ t: 'applied', matchId: this.id, seq: this.seq, by: seat, cmd, hash });
    void seq;
    this.checkEnd();
    this.runAiTurns();
    return null;
  }

  /** Status-driven turns (confuse/berserk/charm) are decided by the server's AI. */
  private runAiTurns(): void {
    for (let guard = 0; guard < 50 && !this.ended; guard++) {
      const u = this.state.turn ? this.state.units.find((x) => x.uid === this.state.turn!.unit) : undefined;
      if (!u || effectiveControl(u) !== 'ai') return;
      for (const cmd of planTurn(this.state)) {
        const r = applyCommand(this.state, cmd);
        if (r.error) break;
        this.state = r.state;
        this.seq++;
        const hash = stateHash(this.state);
        for (const s of this.seats) s.send({ t: 'applied', matchId: this.id, seq: this.seq, by: -1, cmd, hash });
        if (this.state.turn?.unit !== u.uid) break;
      }
      this.checkEnd();
    }
  }

  forfeit(seat: number): void {
    if (this.ended) return;
    this.finish(1 - seat, 'forfeit');
  }

  private checkEnd(): void {
    if (this.state.phase === 'victory') this.finish(0, 'defeat all');
    else if (this.state.phase === 'defeat') this.finish(1, 'defeat all');
  }

  private finish(winner: number | null, reason: string): void {
    this.ended = true;
    for (const s of this.seats) s.send({ t: 'end', matchId: this.id, winner, reason });
  }
}
