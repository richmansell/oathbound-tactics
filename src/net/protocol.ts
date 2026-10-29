/**
 * Online protocol shared by client and server. JSON over WebSocket.
 *
 * Model: the server is authoritative. Clients send intents (commands); the
 * server validates ownership and legality with the same deterministic engine,
 * applies them, and broadcasts the command plus a state hash. Clients replay
 * the command locally (identical result by determinism) to animate, and verify
 * the hash to detect desync (on mismatch they request a full state resync).
 */
import type { BattleEvent, BattleState, Command, Dir, Pos, UnitBuild } from '../engine/types';

export const PROTOCOL_VERSION = 1;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'queue'; party: UnitBuild[]; mode: 'casual' | 'ranked' }
  | { t: 'unqueue' }
  | { t: 'deploy'; matchId: string; placements: { uid: string; pos: Pos; facing: Dir }[] }
  | { t: 'cmd'; matchId: string; seq: number; cmd: Command }
  | { t: 'resync'; matchId: string }
  | { t: 'forfeit'; matchId: string }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'welcome'; id: string; v: number; online: number }
  | { t: 'queued'; position: number }
  | { t: 'match'; matchId: string; you: number; opponent: string; state: BattleState; deployTiles: Pos[] }
  | { t: 'started'; matchId: string; cmd: Command; hash: string }
  | { t: 'applied'; matchId: string; seq: number; by: number; cmd: Command; hash: string; events?: BattleEvent[] }
  | { t: 'rejected'; matchId: string; seq: number; reason: string }
  | { t: 'state'; matchId: string; state: BattleState }
  | { t: 'end'; matchId: string; winner: number | null; reason: string }
  | { t: 'error'; msg: string }
  | { t: 'pong'; at: number };

/** Stable 32-bit hash of the parts of state that must agree between peers. */
export function stateHash(s: BattleState): string {
  const core = JSON.stringify([s.tick, s.rng, s.phase, s.turn, s.units.map((u) => [u.uid, u.hp, u.mp, u.ct, u.pos, u.facing, u.statuses.map((x) => x.id + x.ticks)]), s.pending]);
  let h = 0x811c9dc5;
  for (let i = 0; i < core.length; i++) { h ^= core.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** PvP rules: normalise levels so matches are about builds, not grind. */
export const PVP_LEVEL = 30;
export const PVP_PARTY_SIZE = 5;
