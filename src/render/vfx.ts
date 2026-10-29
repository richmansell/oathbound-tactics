/**
 * Particle + glyph effects in world space (native pixels). Effects are pure
 * visuals: they never affect game state. Each ability's `vfx` key maps to a
 * recipe built from a few primitives.
 */

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; color: string;
  gravity: number; drag: number;
  shape: 'sq' | 'spark' | 'shard' | 'ring' | 'glow';
  fade: boolean;
  grow?: number;
  /** Depth hint: draw above units. */
  top?: boolean;
}

interface Glyph {
  t: number; max: number;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
}

export class Vfx {
  particles: Particle[] = [];
  glyphs: Glyph[] = [];
  flash = 0;
  flashColor = '#ffffff';
  shake = 0;

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const g of this.glyphs) g.t += dt;
    this.glyphs = this.glyphs.filter((g) => g.t < g.max);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const g of this.glyphs) g.draw(ctx, g.t / g.max);
    ctx.save();
    for (const p of this.particles) {
      const a = p.fade ? Math.max(0, p.life / p.max) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size));
      switch (p.shape) {
        case 'sq': ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); break;
        case 'spark': ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, Math.max(1, s)); break;
        case 'shard':
          ctx.beginPath(); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s / 2, p.y); ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s / 2, p.y); ctx.fill(); break;
        case 'ring':
          ctx.strokeStyle = p.color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, s, s / 2, 0, 0, Math.PI * 2); ctx.stroke(); break;
        case 'glow': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.globalCompositeOperation = 'lighter';
          ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
    ctx.restore();
  }

  // --- primitives ----------------------------------------------------------
  burst(x: number, y: number, colors: string[], n: number, speed: number, o: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      const life = (o.max ?? 0.6) * (0.6 + Math.random() * 0.5);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - (o.vy ?? 0),
        life, max: life, size: o.size ?? 2, color: colors[i % colors.length],
        gravity: o.gravity ?? 0, drag: o.drag ?? 2, shape: o.shape ?? 'sq', fade: o.fade ?? true, grow: o.grow,
      });
    }
  }

  rise(x: number, y: number, colors: string[], n: number, spread: number, o: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const life = (o.max ?? 0.9) * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.4,
        vx: (Math.random() - 0.5) * 8, vy: -(o.vy ?? 40) * (0.5 + Math.random()),
        life, max: life, size: o.size ?? 2, color: colors[i % colors.length],
        gravity: o.gravity ?? 0, drag: o.drag ?? 0.5, shape: o.shape ?? 'sq', fade: true,
      });
    }
  }

  ring(x: number, y: number, color: string, r0: number, r1: number, dur: number, width = 2): void {
    this.glyphs.push({ t: 0, max: dur, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      const r = r0 + (r1 - r0) * t;
      ctx.beginPath(); ctx.ellipse(x, y, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } });
  }

  /** Rotating magic circle on the ground. */
  circle(x: number, y: number, color: string, r: number, dur: number): void {
    this.glyphs.push({ t: 0, max: dur, draw: (ctx, t) => {
      ctx.save();
      const a = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.translate(x, y); ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(t * Math.PI * 1.5);
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const ang = (i * 4 * Math.PI) / 5;
        const px = Math.cos(ang) * r * 0.72, py = Math.sin(ang) * r * 0.72;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 - t * 2;
        ctx.fillStyle = color;
        ctx.fillRect(Math.cos(ang) * r * 0.86 - 1, Math.sin(ang) * r * 0.86 - 1, 2, 2);
      }
      ctx.restore();
    } });
  }

  pillar(x: number, y: number, color: string, w: number, h: number, dur: number): void {
    this.glyphs.push({ t: 0, max: dur, draw: (ctx, t) => {
      ctx.save();
      const a = Math.sin(t * Math.PI);
      ctx.globalAlpha = a * 0.85;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w, y - h, w * 2, h);
      ctx.restore();
    } });
  }

  bolt(x: number, y: number, color: string, dur: number): void {
    const segs: [number, number][] = [];
    let cx = x + (Math.random() - 0.5) * 20;
    for (let yy = y - 220; yy < y; yy += 14) { segs.push([cx, yy]); cx += (Math.random() - 0.5) * 16; }
    segs.push([x, y]);
    this.glyphs.push({ t: 0, max: dur, draw: (ctx, t) => {
      if (t > 0.6 && Math.floor(t * 20) % 2) return;
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 1 - t * 0.6;
      ctx.beginPath(); segs.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); segs.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      ctx.restore();
    } });
  }

  slashArc(x: number, y: number, color: string, flip: boolean, dur = 0.22): void {
    this.glyphs.push({ t: 0, max: dur, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath();
      const s = flip ? -1 : 1;
      const a0 = -Math.PI * 0.9, a1 = a0 + Math.PI * 1.1 * Math.min(1, t * 2.2);
      ctx.ellipse(x, y, 16, 12, 0, s > 0 ? a0 : Math.PI - a1, s > 0 ? a1 : Math.PI - a0);
      ctx.stroke();
      ctx.restore();
    } });
  }

  /** Projectile from a→b over dur seconds with an arc height. */
  projectile(ax: number, ay: number, bx: number, by: number, color: string, dur: number, arc: number, kind: 'arrow' | 'orb' | 'stone' | 'blade'): void {
    this.glyphs.push({ t: 0, max: dur, draw: (ctx, t) => {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t - Math.sin(t * Math.PI) * arc;
      const t2 = Math.min(1, t + 0.05);
      const x2 = ax + (bx - ax) * t2, y2 = ay + (by - ay) * t2 - Math.sin(t2 * Math.PI) * arc;
      ctx.save();
      if (kind === 'arrow' || kind === 'blade') {
        const ang = Math.atan2(y2 - y, x2 - x);
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = kind === 'arrow' ? '#d8c8a0' : '#c8d0e0';
        ctx.fillRect(-7, -0.5, 12, 1);
        ctx.fillStyle = color; ctx.fillRect(4, -1.5, 3, 3);
        if (kind === 'arrow') { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-8, -1.5, 2, 3); }
      } else {
        ctx.fillStyle = color;
        const s = kind === 'stone' ? 3 : 4;
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
        if (kind === 'orb') { ctx.globalAlpha = 0.4; ctx.fillRect(Math.round(x - s), Math.round(y - s), s * 2, s * 2); }
      }
      ctx.restore();
    } });
  }

  screenFlash(color: string, amount = 0.6): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  // --- recipes ---------------------------------------------------------------
  /**
   * Play the effect for an ability vfx key at target (x, y = feet point).
   * Returns the approximate time (seconds) until the impact moment.
   */
  play(key: string, x: number, y: number, big = false): number {
    const k = key.replace(/_big$/, '');
    const scale = big || key.endsWith('_big') ? 1.6 : 1;
    switch (k) {
      case 'fire': case 'edge_fire': case 'wild_fire': case 'summon_ember_wyrm':
        this.circle(x, y, '#ff8a3a', 18 * scale, 0.9);
        setTimeout(() => {
          this.rise(x, y - 4, ['#ffd27a', '#ff8a3a', '#e8401a', '#fff2b0'], 40 * scale, 22 * scale, { vy: 70, size: 3, max: 0.8 });
          this.burst(x, y - 10, ['#ff6a2a', '#ffb04a'], 20 * scale, 60, { shape: 'glow', size: 8, max: 0.5 });
          this.screenFlash('#ff7a30', 0.25);
        }, 250);
        return 0.35;
      case 'ice': case 'edge_ice': case 'frostbite': case 'wild_ice': case 'summon_frost_maiden':
        this.circle(x, y, '#9ad8ff', 18 * scale, 0.9);
        setTimeout(() => {
          for (let i = 0; i < 8 * scale; i++) {
            const dx = (Math.random() - 0.5) * 26 * scale;
            this.particles.push({ x: x + dx, y: y - 60 - Math.random() * 30, vx: 0, vy: 160, life: 0.35, max: 0.35, size: 5, color: i % 2 ? '#e0f6ff' : '#7cc8ff', gravity: 200, drag: 0, shape: 'shard', fade: false });
          }
          setTimeout(() => this.burst(x, y - 6, ['#e0f6ff', '#9ad8ff', '#5aa8e8'], 30 * scale, 90, { shape: 'shard', size: 3, max: 0.6, gravity: 80 }), 300);
        }, 200);
        return 0.55;
      case 'thunder': case 'edge_lightning': case 'summon_storm_roc':
        this.circle(x, y, '#f8f080', 16 * scale, 0.8);
        setTimeout(() => {
          this.bolt(x, y - 6, '#f8f080', 0.4);
          if (scale > 1) { this.bolt(x - 14, y, '#f8f080', 0.35); this.bolt(x + 14, y - 2, '#f8f080', 0.35); }
          this.burst(x, y - 6, ['#ffffff', '#f8f080'], 24, 120, { shape: 'spark', size: 3, max: 0.4 });
          this.screenFlash('#ffffe0', 0.5);
          this.shake = 0.4;
        }, 250);
        return 0.3;
      case 'cure': case 'heal': case 'cure_big': case 'summon_greenwind':
        this.circle(x, y, '#a8ffd0', 16 * scale, 1.0);
        this.rise(x, y, ['#ffffff', '#a8ffd0', '#7cf2b2', '#e0fff0'], 30 * scale, 20 * scale, { vy: 35, size: 2, max: 1.1 });
        this.pillar(x, y, 'rgba(160,255,210,0.5)', 10 * scale, 60, 0.9);
        return 0.4;
      case 'raise':
        this.pillar(x, y, 'rgba(255,240,180,0.8)', 14, 140, 1.2);
        this.rise(x, y, ['#fff6c8', '#ffffff', '#ffe08a'], 40, 18, { vy: 60, size: 2, max: 1.2 });
        return 0.6;
      case 'protect': case 'shell': case 'summon_aegis': {
        const c = k === 'shell' ? '#7ac8ff' : '#ffd86a';
        this.ring(x, y - 16, c, 4, 22, 0.6, 2);
        setTimeout(() => this.ring(x, y - 16, c, 4, 22, 0.6, 1), 200);
        this.burst(x, y - 16, [c, '#ffffff'], 16, 40, { size: 2, max: 0.7 });
        return 0.3;
      }
      case 'buff': case 'time':
        this.circle(x, y, k === 'time' ? '#c8a8ff' : '#ffe08a', 14, 0.8);
        this.rise(x, y, k === 'time' ? ['#e8d8ff', '#a888ff'] : ['#fff2b0', '#ffd24a'], 18, 16, { vy: 50, size: 2, shape: 'spark' });
        return 0.3;
      case 'esuna':
        this.rise(x, y, ['#ffffff', '#c8fff0'], 24, 18, { vy: 45, size: 2 });
        this.ring(x, y, '#c8fff0', 4, 18, 0.5);
        return 0.3;
      case 'holy': case 'edge_holy': case 'summon_solarch':
        this.pillar(x, y, 'rgba(255,255,230,0.95)', 16 * scale, 200, 0.9);
        setTimeout(() => {
          this.burst(x, y - 20, ['#ffffff', '#fff6c8', '#ffe08a'], 50 * scale, 140, { shape: 'spark', size: 4, max: 0.7 });
          this.screenFlash('#ffffff', 0.7);
        }, 300);
        return 0.45;
      case 'dark': case 'edge_dark': case 'summon_revenant_king': case 'drain': case 'hex':
        this.circle(x, y, '#a060e0', 16 * scale, 0.9);
        setTimeout(() => {
          for (let i = 0; i < 26 * scale; i++) {
            const a = (i / 26) * Math.PI * 2;
            this.particles.push({ x: x + Math.cos(a) * 26, y: y - 14 + Math.sin(a) * 13, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 30, life: 0.45, max: 0.45, size: 2, color: i % 2 ? '#3a1050' : '#a060e0', gravity: 0, drag: 0, shape: 'sq', fade: true });
          }
          this.burst(x, y - 14, ['#6a20a0', '#1a0828'], 14, 30, { shape: 'glow', size: 10, max: 0.6 });
        }, 200);
        return 0.45;
      case 'poison':
        this.rise(x, y, ['#8fd14f', '#4a8a2a', '#c0f080'], 20, 18, { vy: 25, size: 3, shape: 'ring' });
        return 0.3;
      case 'flare': case 'summon_tidemother':
        this.circle(x, y, k === 'flare' ? '#ff5030' : '#4aa0ff', 22, 1.0);
        setTimeout(() => {
          const cols = k === 'flare' ? ['#ffffff', '#ffd27a', '#ff5030'] : ['#ffffff', '#9ad8ff', '#2a70d0'];
          this.burst(x, y - 12, cols, 80, 160, { shape: 'glow', size: 10, max: 0.7 });
          this.ring(x, y, cols[1], 6, 50, 0.6, 3);
          this.screenFlash(cols[1], 0.7);
          this.shake = 0.6;
        }, 350);
        return 0.5;
      case 'meteor':
        for (let i = 0; i < 7; i++) {
          setTimeout(() => {
            const dx = (Math.random() - 0.5) * 80, dy = (Math.random() - 0.5) * 40;
            this.projectile(x + dx + 80, y + dy - 260, x + dx, y + dy, '#ff8a3a', 0.4, 0, 'orb');
            setTimeout(() => { this.burst(x + dx, y + dy, ['#ffd27a', '#ff5030', '#5a3020'], 26, 110, { gravity: 120, size: 3 }); this.shake = 0.5; }, 400);
          }, i * 140);
        }
        setTimeout(() => this.screenFlash('#ff8a3a', 0.6), 700);
        return 1.0;
      case 'gravity':
        this.glyphs.push({ t: 0, max: 0.8, draw: (ctx, t) => {
          ctx.save(); ctx.globalAlpha = Math.sin(t * Math.PI) * 0.8;
          ctx.fillStyle = '#1a0828';
          const r = 8 + Math.sin(t * Math.PI) * 16;
          ctx.beginPath(); ctx.arc(x, y - 16, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#a060e0'; ctx.stroke(); ctx.restore();
        } });
        return 0.45;
      case 'earth': case 'rockslide': case 'wild_earth': case 'summon_stonewarden':
        setTimeout(() => {
          this.burst(x, y, ['#8a6a48', '#6a5038', '#a88a60', '#4a3828'], 34 * scale, 120, { gravity: 260, vy: 60, size: 3, max: 0.8 });
          this.shake = 0.5;
        }, 150);
        return 0.2;
      case 'wind': case 'wild_wind':
        for (let i = 0; i < 3; i++) this.ring(x, y - 8 - i * 8, '#e8f8ff', 6, 26, 0.5 + i * 0.1, 1);
        this.burst(x, y - 10, ['#ffffff', '#c8f0ff'], 20, 100, { shape: 'spark', max: 0.5 });
        return 0.25;
      case 'wild_water': case 'riptide':
        this.rise(x, y, ['#9ad8ff', '#ffffff', '#4aa0ff'], 36, 26, { vy: 90, gravity: 220, size: 3, max: 0.7 });
        return 0.3;
      case 'aura':
        this.burst(x, y - 16, ['#fff2b0', '#ffd24a', '#ffffff'], 30, 80, { shape: 'glow', size: 6, max: 0.5 });
        return 0.1;
      case 'charm':
        this.rise(x, y - 20, ['#ff8fb8', '#ffc0d8'], 8, 16, { vy: 25, size: 3 });
        return 0.2;
      case 'steal':
        this.burst(x, y - 18, ['#ffd54a', '#ffffff'], 10, 50, { shape: 'spark', max: 0.4 });
        return 0.15;
      case 'rend':
        this.slashArc(x, y - 18, '#ffffff', false);
        this.burst(x, y - 18, ['#c0c0c0', '#ffffff', '#806040'], 16, 90, { gravity: 200, size: 2, max: 0.5 });
        return 0.1;
      case 'smoke':
        this.burst(x, y - 12, ['#a0a0a0', '#808080', '#c0c0c0'], 30, 40, { shape: 'glow', size: 12, grow: 10, max: 0.9 });
        return 0.3;
      case 'item':
        this.rise(x, y - 6, ['#ffffff', '#c8f0ff', '#a8ffd0'], 16, 14, { vy: 30, size: 2 });
        return 0.2;
      case 'jump':
        this.burst(x, y, ['#c0a880', '#e0d0b0'], 20, 80, { gravity: 120, size: 2, max: 0.5 });
        this.shake = 0.5;
        return 0;
      case 'wave': case 'edge_none':
        this.slashArc(x, y - 16, '#c8e8ff', false);
        this.burst(x, y - 16, ['#e0f0ff', '#ffffff'], 14, 70, { shape: 'spark' });
        return 0.1;
      case 'caltrops':
        this.burst(x, y, ['#808890', '#c0c8d0'], 16, 60, { gravity: 200, size: 2 });
        return 0.2;
      case 'arrows':
        for (let i = 0; i < 9; i++) setTimeout(() => {
          const dx = (Math.random() - 0.5) * 50, dy = (Math.random() - 0.5) * 24;
          this.projectile(x + dx - 20, y + dy - 140, x + dx, y + dy, '#a0a0a0', 0.25, 0, 'arrow');
        }, i * 50);
        return 0.6;
      case 'hit_multi':
        for (let i = 0; i < 4; i++) setTimeout(() => this.hit(x + (Math.random() - 0.5) * 10, y - 16 - Math.random() * 10, '#ffffff'), i * 90);
        return 0.3;
      case 'stone': case 'kunai':
        return 0;
      default:
        if (k.startsWith('summon_')) { this.circle(x, y, '#ffffff', 30, 1.2); this.screenFlash('#ffffff', 0.5); return 0.6; }
        this.hit(x, y - 16, '#ffffff');
        return 0.1;
    }
  }

  /** Generic physical hit spark. */
  hit(x: number, y: number, color = '#ffffff', crit = false): void {
    this.burst(x, y, [color, '#ffe8a0', '#ffffff'], crit ? 22 : 10, crit ? 140 : 90, { shape: 'spark', size: crit ? 4 : 3, max: 0.3 });
    if (crit) { this.screenFlash('#ffffff', 0.35); this.shake = 0.35; }
  }
}
