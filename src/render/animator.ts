/**
 * Plays engine BattleEvents on a BattleView. The engine has already resolved
 * everything; this only stages it visually with timing.
 */
import { ABILITIES } from '../content/abilities';
import { ITEMS } from '../content/items';
import { STATUSES } from '../content/statuses';
import { deriveStats } from '../engine/units';
import type { BattleEvent, BattleState, BattleUnit, Dir, Pos } from '../engine/types';
import { dirTo, tileAt } from '../engine/grid';
import { easeInOut } from './iso';
import { nextFrame } from './frame';
import type { BattleView, GameAnimName, VisualUnit } from './scene';

export interface AnimatorHooks {
  /** Story trigger: play a scene, resolve when done. */
  onTrigger?: (id: string, scene?: string) => Promise<void>;
  sfx?: (id: string) => void;
  toast?: (text: string) => void;
  /** Provide a sprite for a unit (async load). */
  spriteFor?: (u: BattleUnit) => VisualUnit['sprite'];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Animator {
  speed = 1;
  constructor(public view: BattleView, public hooks: AnimatorHooks = {}) {}

  private wait(ms: number): Promise<void> {
    return sleep(ms / this.speed);
  }

  /** Create/refresh visual units from a state (no animation). */
  sync(state: BattleState): void {
    const seen = new Set<string>();
    for (const u of state.units) {
      seen.add(u.uid);
      let v = this.view.units.get(u.uid);
      const st = deriveStats(u.build, u);
      const ko = u.statuses.some((s) => s.id === 'ko');
      if (!v) {
        v = {
          uid: u.uid, gx: u.pos[0], gy: u.pos[1], z: this.h(u.pos), lift: 0, facing: u.facing,
          anim: ko ? 'ko' : 'idle', animStart: performance.now(), alpha: 1, hidden: !!u.hidden || u.pos[0] < 0 || (!!u.gone && !u.statuses.some((s) => s.id === 'crystal')),
          team: u.team, sprite: this.hooks.spriteFor?.(u) ?? null, hpFrac: 1, mpFrac: 1, statuses: [], name: u.build.name,
          shakeUntil: 0, flashUntil: 0, flashColor: '#fff', crystal: false, charging: false,
        };
        this.view.units.set(u.uid, v);
      }
      v.gx = u.pos[0]; v.gy = u.pos[1]; v.z = this.h(u.pos);
      v.facing = u.facing;
      v.hpFrac = u.hp / st.maxHp;
      v.mpFrac = st.maxMp ? u.mp / st.maxMp : 0;
      v.statuses = u.statuses.filter((s) => s.id !== 'ko' && s.id !== 'critical' && s.id !== 'crystal').map((s) => s.id);
      v.crystal = u.statuses.some((s) => s.id === 'crystal');
      v.hidden = !!u.hidden || u.pos[0] < 0 || (!!u.gone && !v.crystal);
      v.charging = state.pending.some((p) => p.unit === u.uid);
      if (ko && v.anim !== 'ko' && v.anim !== 'die') this.setAnim(v, 'ko');
      if (!ko && (v.anim === 'ko' || v.anim === 'die')) this.setAnim(v, 'idle');
      v.team = u.team;
    }
    for (const k of [...this.view.units.keys()]) if (!seen.has(k)) this.view.units.delete(k);
    this.view.activeUid = state.turn?.unit ?? null;
  }

  private h(p: Pos): number {
    return tileAt(this.view.map, p[0], p[1])?.h ?? 0;
  }

  setAnim(v: VisualUnit, anim: GameAnimName): void {
    v.anim = anim;
    v.animStart = performance.now();
  }

  private vu(uid: string): VisualUnit | undefined {
    return this.view.units.get(uid);
  }

  private feet(v: VisualUnit): [number, number] {
    return this.view.worldOf(v.gx, v.gy, v.z);
  }

  /** Play a batch of events produced by one command. `after` is the resulting state. */
  async play(events: BattleEvent[], before: BattleState, after: BattleState): Promise<void> {
    const hp = new Map<string, { hp: number; mp: number; max: number; maxMp: number }>();
    for (const u of before.units) {
      const st = deriveStats(u.build, u);
      hp.set(u.uid, { hp: u.hp, mp: u.mp, max: st.maxHp, maxMp: st.maxMp });
    }
    const unitOf = (uid: string) => after.units.find((u) => u.uid === uid) ?? before.units.find((u) => u.uid === uid);

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.e) {
        case 'turn': {
          const v = this.vu(ev.unit);
          this.view.activeUid = ev.unit;
          if (v) { this.view.focusTile([v.gx, v.gy]); }
          this.hooks.sfx?.('turn_start');
          await this.wait(220);
          break;
        }
        case 'move': await this.animateMove(ev.unit, ev.path, !!ev.teleport); break;
        case 'face': { const v = this.vu(ev.unit); if (v) v.facing = ev.dir; break; }
        case 'charge': {
          const v = this.vu(ev.unit);
          const ab = ABILITIES[ev.ability];
          if (v) {
            v.facing = dirTo([v.gx, v.gy], ev.target);
            if (!ab.jump) { this.setAnim(v, 'cast'); v.charging = true; }
            this.view.floatText(ev.unit, `${ab.name}`, '#c8d8ff', 0.8);
            const [x, y] = this.view.worldOf(ev.target[0], ev.target[1], this.h(ev.target));
            this.view.vfx.circle(x, y, '#9ab8ff', 14, 0.8);
            this.hooks.sfx?.('charge');
          }
          await this.wait(520);
          if (v && !ab.jump) this.setAnim(v, 'idle');
          break;
        }
        case 'chargeCancel': {
          const v = this.vu(ev.unit);
          if (v) { v.charging = false; this.view.floatText(ev.unit, 'Interrupted', '#aaaaaa', 0.8); }
          await this.wait(300);
          break;
        }
        case 'jumpUp': {
          const v = this.vu(ev.unit);
          if (v) {
            this.setAnim(v, 'jump');
            this.hooks.sfx?.('jump');
            await this.tween(380, (t) => { v.lift = t * t * 260; v.alpha = 1 - t * 0.9; });
            v.hidden = true;
            v.lift = 0; v.alpha = 1;
          }
          break;
        }
        case 'jumpDown': {
          const v = this.vu(ev.unit);
          if (v) {
            const home: [number, number, number] = [v.gx, v.gy, v.z];
            v.gx = ev.to[0]; v.gy = ev.to[1]; v.z = this.h(ev.to);
            v.hidden = false;
            this.setAnim(v, 'jump');
            await this.tween(260, (t) => { v.lift = (1 - t) * (1 - t) * 260; });
            v.lift = 0;
            const [x, y] = this.feet(v);
            this.view.vfx.play('jump', x, y);
            this.hooks.sfx?.('land');
            // Return home after the strike resolves (next events).
            setTimeout(() => { v.gx = home[0]; v.gy = home[1]; v.z = home[2]; this.setAnim(v, 'idle'); }, 700 / this.speed);
          }
          break;
        }
        case 'action': {
          await this.animateAction(ev, unitOf(ev.unit));
          break;
        }
        case 'damage': {
          const v = this.vu(ev.unit);
          const rec = hp.get(ev.unit);
          if (v && rec) {
            if (ev.mp) {
              rec.mp = Math.max(0, rec.mp - ev.amount);
              v.mpFrac = rec.maxMp ? rec.mp / rec.maxMp : 0;
              this.view.floatText(ev.unit, `${ev.amount}`, '#8ab8ff');
            } else {
              rec.hp = Math.max(0, rec.hp - ev.amount);
              v.hpFrac = rec.hp / rec.max;
              const col = ev.weak ? '#ffb040' : ev.crit ? '#ffe060' : '#ffffff';
              this.view.floatText(ev.unit, `${ev.amount}`, col, ev.crit ? 1.35 : 1.1);
              if (ev.crit) this.view.floatText(ev.unit, 'Critical!', '#ffe060', 0.75, 0.05);
              if (ev.weak) this.view.floatText(ev.unit, 'Weak!', '#ffb040', 0.7, 0.05);
              if (ev.resist) this.view.floatText(ev.unit, 'Resist', '#a0b0c0', 0.7, 0.05);
              v.shakeUntil = performance.now() + 260 / this.speed;
              v.flashUntil = performance.now() + 120;
              v.flashColor = '#ffffff';
              if (rec.hp > 0) { this.setAnim(v, 'hurt'); setTimeout(() => { if (v.anim === 'hurt') this.setAnim(v, 'idle'); }, 380 / this.speed); }
              const [x, y] = this.feet(v);
              this.view.vfx.hit(x, y - 18, '#ffffff', ev.crit);
              this.hooks.sfx?.(ev.crit ? 'crit' : 'hit');
            }
          }
          await this.wait(this.nextIsSameBurst(events, i) ? 90 : 420);
          break;
        }
        case 'heal': case 'absorb': {
          const v = this.vu(ev.unit);
          const rec = hp.get(ev.unit);
          if (v && rec) {
            const mp = ev.e === 'heal' && ev.mp;
            if (mp) { rec.mp = Math.min(rec.maxMp, rec.mp + ev.amount); v.mpFrac = rec.maxMp ? rec.mp / rec.maxMp : 0; }
            else { rec.hp = Math.min(rec.max, rec.hp + ev.amount); v.hpFrac = rec.hp / rec.max; }
            this.view.floatText(ev.unit, `${ev.amount}`, mp ? '#9ac8ff' : '#7cf2b2', 1.1);
            this.hooks.sfx?.('heal');
          }
          await this.wait(this.nextIsSameBurst(events, i) ? 90 : 380);
          break;
        }
        case 'miss': {
          const label = ev.blocked === 'immune' ? 'Immune' : ev.blocked === 'parry' ? 'Blocked' : ev.blocked === 'guard' ? 'Guarded' : ev.blocked === 'shield' ? 'Shielded' : 'Miss';
          this.view.floatText(ev.unit, label, '#c0c8d8', 0.95);
          this.hooks.sfx?.(ev.blocked === 'parry' || ev.blocked === 'shield' ? 'block' : 'miss');
          await this.wait(this.nextIsSameBurst(events, i) ? 90 : 380);
          break;
        }
        case 'status': {
          const v = this.vu(ev.unit);
          const def = STATUSES[ev.status];
          if (v && def && ev.status !== 'charging' && ev.status !== 'critical' && ev.status !== 'quicken') {
            if (ev.added) { if (!v.statuses.includes(ev.status)) v.statuses.push(ev.status); }
            else v.statuses = v.statuses.filter((s) => s !== ev.status);
            if (ev.status !== 'ko') {
              this.view.floatText(ev.unit, ev.added ? def.name : `−${def.name}`, ev.added ? def.color : '#a0a0a0', 0.85);
              this.hooks.sfx?.(def.positive === ev.added ? 'buff' : 'debuff');
              await this.wait(this.nextIsSameBurst(events, i) ? 80 : 300);
            }
          }
          break;
        }
        case 'stat': {
          const sign = ev.amount > 0 ? '+' : '';
          this.view.floatText(ev.unit, `${ev.stat === 'brave' ? 'Brave' : ev.stat === 'faith' ? 'Faith' : ev.stat.toUpperCase()} ${sign}${ev.amount}`, ev.amount > 0 ? '#ffe08a' : '#b0a0ff', 0.85);
          await this.wait(300);
          break;
        }
        case 'ko': {
          const v = this.vu(ev.unit);
          if (v) {
            this.setAnim(v, 'die');
            this.hooks.sfx?.('ko');
            setTimeout(() => { if (v.anim === 'die') this.setAnim(v, 'ko'); }, 700 / this.speed);
            v.hpFrac = 0;
            v.statuses = [];
            v.charging = false;
          }
          await this.wait(600);
          break;
        }
        case 'revive': {
          const v = this.vu(ev.unit);
          if (v) {
            this.setAnim(v, 'idle');
            const u = unitOf(ev.unit);
            if (u) { const st = deriveStats(u.build, u); const rec = hp.get(ev.unit); if (rec) { rec.hp = u.hp; v.hpFrac = u.hp / st.maxHp; } }
            const [x, y] = this.feet(v);
            this.view.vfx.play('raise', x, y);
            this.hooks.sfx?.('revive');
          }
          await this.wait(500);
          break;
        }
        case 'crystal': {
          const v = this.vu(ev.unit);
          if (v) {
            this.view.vfx.screenFlash('#a0e0ff', 0.4);
            await this.tween(400, (t) => { v.alpha = 1 - t; });
            v.crystal = true;
            v.alpha = 1;
            const [x, y] = this.feet(v);
            this.view.vfx.burst(x, y - 18, ['#c8f0ff', '#7fd4ff', '#ffffff'], 30, 70, { shape: 'shard', size: 3 });
            this.view.floatText(ev.unit, 'Crystallised', '#7fd4ff', 0.9);
          }
          await this.wait(500);
          break;
        }
        case 'countdown': {
          const v = this.vu(ev.unit);
          if (v) { this.view.focusTile([v.gx, v.gy]); this.view.floatText(ev.unit, `${ev.count}`, ev.count <= 1 ? '#ff6a5a' : '#ffffff', 1.4); }
          await this.wait(450);
          break;
        }
        case 'break': {
          const v = this.vu(ev.unit);
          const it = ITEMS[ev.item];
          if (v) {
            const [x, y] = this.feet(v);
            this.view.vfx.burst(x, y - 20, ['#c0c0c0', '#808080', '#ffffff'], 24, 110, { shape: 'shard', size: 3, gravity: 200 });
            this.view.floatText(ev.unit, `${it?.name ?? 'Gear'} broken!`, '#ff9a6a', 0.85);
            this.hooks.sfx?.('break');
            if (v.sprite && this.hooks.spriteFor) { const u = unitOf(ev.unit); if (u) v.sprite = this.hooks.spriteFor(u); }
          }
          await this.wait(500);
          break;
        }
        case 'steal': {
          const what = ev.what === 'gil' ? `${ev.amount} gil` : ev.what === 'exp' ? `${ev.amount} EXP` : ITEMS[ev.what]?.name ?? ev.what;
          this.view.floatText(ev.from, `Stole ${what}!`, '#ffd54a', 0.85);
          this.hooks.sfx?.('steal');
          const fromU = unitOf(ev.from);
          const v = this.vu(ev.from);
          if (v && fromU && this.hooks.spriteFor) v.sprite = this.hooks.spriteFor(fromU);
          await this.wait(500);
          break;
        }
        case 'knockback': {
          const v = this.vu(ev.unit);
          if (v) {
            const sx = v.gx, sy = v.gy, sz = v.z;
            const tz = this.h(ev.to);
            v.depthTile = [Math.max(Math.round(sx), ev.to[0]), Math.max(Math.round(sy), ev.to[1])];
            await this.tween(260, (t) => {
              v.gx = sx + (ev.to[0] - sx) * t; v.gy = sy + (ev.to[1] - sy) * t;
              v.z = sz + (tz - sz) * t * t;
            });
            v.depthTile = undefined;
            v.gx = ev.to[0]; v.gy = ev.to[1]; v.z = tz;
            if (ev.fall > 2) this.hooks.sfx?.('land');
          }
          break;
        }
        case 'reaction': {
          const ab = ABILITIES[ev.ability];
          this.view.floatText(ev.unit, ab?.name ?? 'Reaction', '#ffd0ff', 0.9);
          const v = this.vu(ev.unit);
          if (v) { v.flashUntil = performance.now() + 250; v.flashColor = '#ffd0ff'; }
          await this.wait(450);
          break;
        }
        case 'reflect': {
          const v = this.vu(ev.unit);
          if (v) { const [x, y] = this.feet(v); this.view.vfx.ring(x, y - 18, '#e8f4ff', 6, 24, 0.4); this.view.floatText(ev.unit, 'Reflect', '#e8f4ff', 0.85); }
          await this.wait(350);
          break;
        }
        case 'reveal': {
          const u = unitOf(ev.unit);
          let v = this.vu(ev.unit);
          if (u && !v) { this.sync(after); v = this.vu(ev.unit); }
          if (v && u) {
            v.gx = u.pos[0]; v.gy = u.pos[1]; v.z = this.h(u.pos);
            v.hidden = false;
            this.view.focusTile(u.pos);
            await this.tween(400, (t) => { v!.alpha = t; });
          }
          break;
        }
        case 'trigger': {
          if (this.hooks.onTrigger) await this.hooks.onTrigger(ev.id, ev.scene);
          break;
        }
        case 'ct':
          this.view.floatText(ev.unit, 'Quick!', '#ffe08a', 0.9);
          await this.wait(300);
          break;
        case 'text':
          this.view.floatText(ev.unit, ev.text, ev.color ?? '#ffffff', 0.9);
          if (ev.text.includes('Level')) this.hooks.sfx?.(ev.text.includes('Job') ? 'job_level' : 'level_up');
          await this.wait(350);
          break;
        case 'oath': {
          const label = ev.state === 'sworn' ? 'Oath sworn' : ev.state === 'kept' ? 'Oath kept!' : 'Oath broken';
          const col = ev.state === 'broken' ? '#ff8a7a' : '#ffe9a0';
          this.view.floatText(ev.unit, label, col, ev.state === 'sworn' ? 0.75 : 0.95);
          if (ev.state !== 'sworn') this.hooks.sfx?.(ev.state === 'kept' ? 'learn' : 'debuff');
          await this.wait(ev.state === 'sworn' ? 120 : 450);
          break;
        }
        case 'retreat': {
          const v = this.vu(ev.unit);
          if (v) {
            this.view.floatText(ev.unit, 'Withdraws!', '#ffd0a0', 1);
            await this.wait(400);
            await this.tween(500, (t) => { v.alpha = 1 - t; v.lift = t * 8; });
            v.hidden = true;
          }
          break;
        }
        case 'loot':
          this.hooks.toast?.(`Obtained ${ITEMS[ev.item]?.name ?? ev.item}`);
          break;
        case 'end':
          break;
      }
    }
    this.sync(after);
  }

  private nextIsSameBurst(events: BattleEvent[], i: number): boolean {
    const n = events[i + 1];
    return !!n && (n.e === 'damage' || n.e === 'heal' || n.e === 'miss' || n.e === 'status' || n.e === 'absorb') && ('unit' in n) && n.unit !== (events[i] as { unit?: string }).unit;
  }

  private tween(ms: number, f: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const dur = ms / this.speed;
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / dur);
        f(t);
        if (t < 1) nextFrame(step);
        else resolve();
      };
      nextFrame(step);
    });
  }

  async animateMove(uid: string, path: Pos[], teleport: boolean): Promise<void> {
    const v = this.vu(uid);
    if (!v || path.length < 1) return;
    if (teleport || path.length === 1) {
      const to = path[path.length - 1];
      await this.tween(200, (t) => { v.alpha = 1 - t; });
      v.gx = to[0]; v.gy = to[1]; v.z = this.h(to);
      this.view.focusTile(to);
      await this.tween(200, (t) => { v.alpha = t; });
      return;
    }
    this.setAnim(v, 'walk');
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      v.facing = dirTo(a, b) as Dir;
      const ha = this.h(a), hb = this.h(b);
      const dh = hb - ha;
      const hop = Math.abs(dh) >= 2;
      v.depthTile = [b[0] + a[0] > b[0] * 2 ? a[0] : b[0], b[1] + a[1] > b[1] * 2 ? a[1] : b[1]];
      // Draw on whichever tile is in front.
      const front = this.frontOf(a, b);
      v.depthTile = front;
      if (hop) this.setAnim(v, 'jump');
      this.hooks.sfx?.(hop ? 'jump' : 'step');
      const dur = hop ? 300 : 190;
      await this.tween(dur, (t) => {
        const e = hop ? t : t;
        v.gx = a[0] + (b[0] - a[0]) * e;
        v.gy = a[1] + (b[1] - a[1]) * e;
        if (hop) {
          v.z = ha + dh * easeInOut(t);
          v.lift = Math.sin(t * Math.PI) * (10 + Math.max(0, dh) * 4);
        } else {
          v.z = ha + dh * t;
        }
      });
      v.lift = 0;
      v.gx = b[0]; v.gy = b[1]; v.z = hb;
      if (hop) { this.setAnim(v, 'walk'); this.hooks.sfx?.('land'); }
      if (i % 2 === 0) this.view.focusTile(b);
    }
    v.depthTile = undefined;
    this.view.focusTile(path[path.length - 1]);
    this.setAnim(v, 'idle');
  }

  private frontOf(a: Pos, b: Pos): Pos {
    // Depth = rotated rx+ry; pick the larger.
    const da = this.depth(a), db = this.depth(b);
    return db >= da ? b : a;
  }

  private depth(p: Pos): number {
    const rot = this.view.cam.rot;
    const { w, h } = this.view.map;
    switch (rot) {
      case 0: return p[0] + p[1];
      case 1: return h - 1 - p[1] + p[0];
      case 2: return w - 1 - p[0] + h - 1 - p[1];
      default: return p[1] + w - 1 - p[0];
    }
  }

  private async animateAction(ev: Extract<BattleEvent, { e: 'action' }>, u: BattleUnit | undefined): Promise<void> {
    const v = this.vu(ev.unit);
    const ab = ABILITIES[ev.ability];
    if (!v || !ab) return;
    if (!(v.gx === ev.target[0] && v.gy === ev.target[1])) v.facing = dirTo([Math.round(v.gx), Math.round(v.gy)], ev.target);
    v.charging = false;
    this.view.focusTile(ev.target);
    const fam = u ? deriveStats(u.build, u).family : 'fist';
    let anim: GameAnimName = 'attack';
    switch (ab.anim) {
      case 'cast': anim = 'cast'; break;
      case 'item': case 'throw': anim = 'item'; break;
      case 'shoot': anim = 'shoot'; break;
      case 'kneel': anim = 'kneel'; break;
      case 'victory': anim = 'victory'; break;
      case 'jump': anim = 'attack'; break;
      default: anim = fam === 'bow' && ab.weaponBased ? 'shoot' : 'attack';
    }
    if (!ev.reaction && ab.id !== 'attack') this.view.floatText(ev.unit, ab.name, '#ffffff', 0.85);
    this.setAnim(v, anim);
    const impact = v.sprite ? v.sprite.impactMs(anim) : 260;
    const total = v.sprite ? v.sprite.duration(anim) : 520;
    this.hooks.sfx?.(anim === 'cast' ? 'charge' : anim === 'shoot' ? 'arrow_shoot' : anim === 'item' ? 'item_get' : fam === 'fist' ? 'blunt' : 'slash');
    await this.wait(impact);
    // Projectile for ranged
    const [sx, sy] = this.feet(v);
    const th = this.h(ev.target);
    const [tx, ty] = this.view.worldOf(ev.target[0], ev.target[1], th);
    const ranged = (ab.weaponBased && (fam === 'bow' || fam === 'crossbow')) || ['throw_stone', 'kunai', 'aura_blast', 'firebomb', 'caltrops'].includes(ab.id) || (ab.consumes && Math.abs(v.gx - ev.target[0]) + Math.abs(v.gy - ev.target[1]) > 1);
    if (ranged) {
      const kind = ab.id === 'throw_stone' ? 'stone' : ab.id === 'kunai' ? 'blade' : ab.id === 'aura_blast' ? 'orb' : ab.consumes || ab.id === 'firebomb' || ab.id === 'caltrops' ? 'stone' : 'arrow';
      const dist = Math.hypot(tx - sx, ty - sy);
      const dur = Math.min(0.5, 0.15 + dist / 600);
      this.view.vfx.projectile(sx, sy - 22, tx, ty - 18, kind === 'orb' ? '#ffe08a' : '#a0a0a0', dur, fam === 'bow' ? 30 + dist * 0.15 : 10, kind);
      await this.wait(dur * 1000);
    }
    // Effect at target(s)
    const key = ab.vfx ?? (ab.weaponBased || ab.id === 'attack' ? 'hit' : 'hit');
    let impactDelay = 0;
    if (key === 'hit') {
      if (!ranged) this.view.vfx.slashArc(tx, ty - 18, '#ffffff', v.facing === 'w' || v.facing === 'n');
    } else {
      impactDelay = this.view.vfx.play(key, tx, ty, (ab.aoe?.radius ?? 0) >= 2);
      // Secondary bursts on other affected units for AoE spells.
      if (ab.aoe && ab.aoe.radius > 0) {
        for (const uid of ev.affected) {
          const t = this.vu(uid);
          if (!t || (Math.round(t.gx) === ev.target[0] && Math.round(t.gy) === ev.target[1])) continue;
          const [x, y] = this.feet(t);
          setTimeout(() => this.view.vfx.play(key.replace(/_big$/, ''), x, y), 120);
        }
      }
      this.hooks.sfx?.(sfxForVfx(key));
    }
    await this.wait(Math.max(impactDelay * 1000, 60));
    setTimeout(() => { if (v.anim === anim) this.setAnim(v, 'idle'); }, Math.max(0, total - impact) / this.speed);
  }
}

function sfxForVfx(key: string): string {
  if (key.includes('fire')) return 'fire';
  if (key.includes('ice') || key.includes('frost')) return 'ice';
  if (key.includes('thunder') || key.includes('lightning') || key.includes('storm')) return 'thunder';
  if (key.includes('cure') || key.includes('heal') || key.includes('greenwind')) return 'heal';
  if (key.includes('raise')) return 'revive';
  if (key.includes('holy') || key.includes('solarch')) return 'holy';
  if (key.includes('dark') || key.includes('drain') || key.includes('hex') || key.includes('revenant')) return 'dark';
  if (key.includes('time') || key.includes('gravity')) return 'time';
  if (key.includes('poison')) return 'poison';
  if (key.includes('earth') || key.includes('rock') || key.includes('stone')) return 'earth';
  if (key.includes('wind')) return 'wind';
  if (key.includes('water') || key.includes('tide')) return 'water';
  if (key.includes('summon')) return 'summon';
  if (key.includes('protect') || key.includes('shell') || key.includes('buff') || key.includes('aegis')) return 'buff';
  return 'hit';
}
