/**
 * BattleSession: owns a battle's state, routes commands (human / AI / network),
 * plays animations and notifies the UI. Command sources are pluggable so the
 * same session drives local play, hot-seat and (later) online matches.
 */
import { planTurn } from '../engine/ai';
import { applyCommand, effectiveControl, startBattle, activeUnit } from '../engine/battle';
import type { BattleEvent, BattleState, BattleUnit, Command } from '../engine/types';
import { Animator, type AnimatorHooks } from '../render/animator';
import type { BattleView } from '../render/scene';

export type SessionPhase = 'deploy' | 'animating' | 'human' | 'ai' | 'remote' | 'over';

/** Online link: commands go to the authoritative server instead of applying locally. */
export interface RemoteLink {
  me: number;
  sendCommand(cmd: Command): void;
  sendDeploy(placements: Extract<Command, { type: 'deploy' }>['placements']): void;
  requestResync(): void;
}

export interface SessionListener {
  (s: BattleSession): void;
}

export class BattleSession {
  state: BattleState;
  phase: SessionPhase;
  animator: Animator;
  private listeners = new Set<SessionListener>();
  private destroyed = false;
  /** Called when the battle finishes. */
  onEnd?: (result: 'victory' | 'defeat', state: BattleState) => void;
  /** Auto-battle: AI controls the player's units too. */
  auto = false;
  /** Online play (authoritative server). */
  remote?: RemoteLink;
  private queue: Promise<void> = Promise.resolve();
  desyncs = 0;

  constructor(state: BattleState, public view: BattleView, hooks: AnimatorHooks = {}) {
    this.state = state;
    this.animator = new Animator(view, hooks);
    this.animator.sync(state);
    this.phase = state.phase === 'deploy' ? 'deploy' : 'animating';
  }

  subscribe(l: SessionListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }

  destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
  }

  get active(): BattleUnit | undefined {
    return activeUnit(this.state);
  }

  /** Begin (after deployment if any). */
  async begin(): Promise<void> {
    if (this.state.phase === 'deploy') return;
    const before = this.state;
    const r = startBattle(this.state);
    this.state = r.state;
    await this.playEvents(r.events, before);
    await this.continue();
  }

  async deploy(cmd: Extract<Command, { type: 'deploy' }>): Promise<string | null> {
    if (this.remote) { this.remote.sendDeploy(cmd.placements); this.phase = 'remote'; this.emit(); return null; }
    const before = this.state;
    const r = applyCommand(this.state, cmd);
    if (r.error) return r.error;
    this.state = r.state;
    this.phase = 'animating';
    this.emit();
    await this.playEvents(r.events, before);
    await this.continue();
    return null;
  }

  /** Apply a human command (rejects if not a human turn). */
  async command(cmd: Command): Promise<string | null> {
    if (this.phase !== 'human') return 'Not your turn';
    if (this.remote) { this.phase = 'remote'; this.emit(); this.remote.sendCommand(cmd); return null; }
    return this.exec(cmd);
  }

  /** Apply a server-confirmed command (ours or the opponent's), in order. */
  applyRemote(cmd: Command, hash: string, hashFn: (s: BattleState) => string): Promise<void> {
    this.queue = this.queue.then(async () => {
      if (this.destroyed) return;
      const before = this.state;
      const r = applyCommand(this.state, cmd);
      if (r.error) { this.remote?.requestResync(); return; }
      this.state = r.state;
      this.phase = 'animating';
      this.emit();
      await this.playEvents(r.events, before);
      if (hashFn(this.state) !== hash) { this.desyncs++; this.remote?.requestResync(); }
      await this.continue();
    });
    return this.queue;
  }

  /** Replace state wholesale (resync after a mismatch or reconnect). */
  resync(state: BattleState): void {
    this.state = state;
    this.animator.sync(state);
    void this.continue();
  }

  /** Server rejected our command: let the player try again. */
  rejected(): void {
    if (this.state.turn) { this.phase = 'human'; this.emit(); }
  }

  private async exec(cmd: Command): Promise<string | null> {
    const before = this.state;
    const r = applyCommand(this.state, cmd);
    if (r.error) return r.error;
    this.state = r.state;
    this.phase = 'animating';
    this.emit();
    await this.playEvents(r.events, before);
    if (this.destroyed) return null;
    await this.continue();
    return null;
  }

  private async playEvents(events: BattleEvent[], before: BattleState): Promise<void> {
    if (this.destroyed) return;
    await this.animator.play(events, before, this.state);
  }

  /** Decide who acts next; run AI turns until a human turn or the end. */
  private async continue(): Promise<void> {
    while (!this.destroyed) {
      const s = this.state;
      if (s.phase === 'victory' || s.phase === 'defeat') {
        this.phase = 'over';
        this.emit();
        this.onEnd?.(s.phase, s);
        return;
      }
      const u = activeUnit(s);
      if (!u) { this.phase = 'animating'; this.emit(); return; }
      if (this.remote) {
        // The server resolves AI-driven turns (confusion etc.); we only act for our own units.
        this.phase = u.owner === this.remote.me && effectiveControl(u) === 'human' ? 'human' : 'remote';
        this.emit();
        return;
      }
      const control = this.auto && u.team === 'player' ? 'ai' : effectiveControl(u);
      if (control === 'human') {
        this.phase = 'human';
        this.emit();
        return;
      }
      this.phase = 'ai';
      this.emit();
      await sleep(250 / this.animator.speed);
      const cmds = planTurn(s);
      for (const c of cmds) {
        if (this.destroyed) return;
        const before = this.state;
        const r = applyCommand(this.state, c);
        if (r.error) {
          // Fall back to waiting so the battle never stalls.
          const w = applyCommand(this.state, { type: 'wait', unit: u.uid, facing: u.facing });
          if (!w.error) { this.state = w.state; await this.playEvents(w.events, before); }
          break;
        }
        this.state = r.state;
        await this.playEvents(r.events, before);
        if (this.state.phase !== 'battle' || !this.state.turn || this.state.turn.unit !== u.uid) break;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
