/**
 * BattleView: draws a battle map with units, props, highlights and effects.
 * Two canvases: a native-resolution pixel canvas (scaled crisply by CSS) and a
 * full-resolution overlay for text, numbers and HP bars.
 */
import { tileAt } from '../engine/grid';
import { hash2 } from '../engine/rng';
import type { BattleMap, Dir, Pos } from '../engine/types';
import { HALF_H, HALF_W, HEIGHT_PX, TILE_H, TILE_W, lerp, project, rotate, rotateDir, type Camera, type Rot } from './iso';
import { propSprite } from './props';
import { columnSprite, diamondPath } from './terrain';
import { Vfx } from './vfx';
import { nextFrame } from './frame';

export type GameAnimName = 'idle' | 'walk' | 'attack' | 'cast' | 'item' | 'shoot' | 'hurt' | 'ko' | 'jump' | 'victory' | 'kneel' | 'die';

/** Anything that can draw a character (composited LPC sheet or placeholder). */
export interface UnitSpriteSource {
  draw(ctx: CanvasRenderingContext2D, anim: GameAnimName, screenDir: Dir, elapsedMs: number, x: number, y: number, opts?: { alpha?: number; tint?: string }): void;
  duration(anim: GameAnimName): number;
  impactMs(anim: GameAnimName): number;
}

export interface VisualUnit {
  uid: string;
  gx: number; gy: number;       // grid position (float during movement)
  z: number;                    // height in half-steps (float)
  lift: number;                 // extra px above ground (jumps)
  facing: Dir;
  anim: GameAnimName;
  animStart: number;
  alpha: number;
  hidden: boolean;
  team: 'player' | 'enemy' | 'ally' | 'neutral';
  sprite: UnitSpriteSource | null;
  hpFrac: number;
  mpFrac: number;
  statuses: string[];
  name: string;
  shakeUntil: number;
  flashUntil: number;
  flashColor: string;
  crystal: boolean;
  charging: boolean;
  /** Depth override while moving between tiles. */
  depthTile?: Pos;
}

export interface FloatText {
  text: string;
  wx: number; wy: number;       // world px
  color: string;
  t: number; max: number;
  size: number;
  rise: number;
}

export type HighlightKind = 'move' | 'attack' | 'aoe' | 'path' | 'deploy' | 'danger' | 'ally';

const HL_COLORS: Record<HighlightKind, [string, string]> = {
  move: ['rgba(80,150,255,0.38)', 'rgba(160,210,255,0.9)'],
  attack: ['rgba(255,80,70,0.34)', 'rgba(255,160,150,0.9)'],
  aoe: ['rgba(255,210,60,0.45)', 'rgba(255,240,160,1)'],
  path: ['rgba(120,255,200,0.35)', 'rgba(200,255,230,0.9)'],
  deploy: ['rgba(90,220,140,0.34)', 'rgba(170,255,200,0.9)'],
  danger: ['rgba(255,60,60,0.16)', 'rgba(255,90,90,0.4)'],
  ally: ['rgba(120,255,160,0.3)', 'rgba(170,255,200,0.9)'],
};

const THEME: Record<string, { sky: [string, string]; tint?: string; tintAlpha?: number; particles?: 'snow' | 'fireflies' | 'dust' | 'rain' | 'embers' }> = {
  day: { sky: ['#6fa8dc', '#cfe6f5'] },
  dawn: { sky: ['#e8a07a', '#f6dcc0'], tint: '#ffb070', tintAlpha: 0.1, particles: 'dust' },
  dusk: { sky: ['#5a3a6a', '#e89a6a'], tint: '#ff8040', tintAlpha: 0.14, particles: 'dust' },
  night: { sky: ['#0a1028', '#2a3a60'], tint: '#203070', tintAlpha: 0.32, particles: 'fireflies' },
  overcast: { sky: ['#6a7480', '#a8b0b8'], tint: '#708090', tintAlpha: 0.12, particles: 'rain' },
  interior: { sky: ['#140e0a', '#2a1e16'], tint: '#3a2010', tintAlpha: 0.18, particles: 'embers' },
  snow: { sky: ['#8a9ab0', '#dce6f0'], tint: '#c0d0ff', tintAlpha: 0.08, particles: 'snow' },
};

export class BattleView {
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  map: BattleMap;
  cam: Camera = { x: 0, y: 0, zoom: 2, rot: 0 };
  private camTarget = { x: 0, y: 0 };
  units = new Map<string, VisualUnit>();
  highlights = new Map<number, HighlightKind>();
  cursor: Pos | null = null;
  activeUid: string | null = null;
  targetUids = new Set<string>();
  vfx = new Vfx();
  texts: FloatText[] = [];
  showHpBars = true;
  private last = performance.now();
  private dpr = 1;
  private ambient: { x: number; y: number; vx: number; vy: number; life: number; phase: number }[] = [];
  /** Called each frame (for UI sync). */
  onFrame?: () => void;

  constructor(host: HTMLElement, map: BattleMap) {
    this.map = map;
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    for (const c of [this.canvas, this.overlay]) {
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.touchAction = 'none';
    }
    this.canvas.style.imageRendering = 'pixelated';
    this.overlay.style.pointerEvents = 'none';
    host.appendChild(this.canvas);
    host.appendChild(this.overlay);
    this.ctx = this.canvas.getContext('2d')!;
    this.octx = this.overlay.getContext('2d')!;
    this.resize();
    this.centerOnMap(true);
    this.loop = this.loop.bind(this);
    nextFrame(this.loop);
  }

  private stopped = false;

  destroy(): void {
    this.stopped = true;
    this.canvas.remove();
    this.overlay.remove();
  }

  setMap(map: BattleMap): void {
    this.map = map;
    this.centerOnMap(true);
  }

  resize(): void {
    const host = this.canvas.parentElement!;
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Default zoom: fit ~ 16 tiles across on phones, 22 on desktop.
    const nativeW = Math.ceil(w / this.cam.zoom), nativeH = Math.ceil(h / this.cam.zoom);
    this.canvas.width = nativeW;
    this.canvas.height = nativeH;
    this.overlay.width = Math.round(w * this.dpr);
    this.overlay.height = Math.round(h * this.dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  setZoom(z: number): void {
    this.cam.zoom = Math.max(1, Math.min(5, z));
    this.resize();
  }

  autoZoom(): void {
    const host = this.canvas.parentElement!;
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    const mapW = (this.map.w + this.map.h) * HALF_W + 40;
    const mapH = (this.map.w + this.map.h) * HALF_H + 120;
    const z = Math.min(w / mapW, h / mapH);
    this.setZoom(Math.max(1, Math.min(4, Math.round(z * 1.25 * 2) / 2)));
  }

  rotateBy(d: 1 | -1): void {
    const before = this.camTarget;
    void before;
    this.cam.rot = (((this.cam.rot + d) % 4) + 4) % 4 as Rot;
    const focus = this.cursor ?? [Math.floor(this.map.w / 2), Math.floor(this.map.h / 2)];
    this.focusTile(focus, true);
  }

  centerOnMap(instant = false): void {
    this.focusTile([(this.map.w - 1) / 2, (this.map.h - 1) / 2], instant);
  }

  /** World px of a grid position (diamond centre at the given height). */
  worldOf(gx: number, gy: number, z: number): [number, number] {
    const [rx, ry] = rotate(gx, gy, this.cam.rot, this.map.w, this.map.h);
    return project(rx, ry, z);
  }

  heightAt(x: number, y: number): number {
    return tileAt(this.map, Math.round(x), Math.round(y))?.h ?? 0;
  }

  focusTile(p: Pos | [number, number], instant = false): void {
    const z = this.heightAt(p[0], p[1]);
    const [wx, wy] = this.worldOf(p[0], p[1], z);
    this.camTarget = { x: wx, y: wy - 20 };
    if (instant) { this.cam.x = this.camTarget.x; this.cam.y = this.camTarget.y; }
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.camTarget.x -= dxScreen / this.cam.zoom;
    this.camTarget.y -= dyScreen / this.cam.zoom;
    this.cam.x = this.camTarget.x;
    this.cam.y = this.camTarget.y;
  }

  /** Screen (CSS px relative to host) → world px. */
  screenToWorld(sx: number, sy: number): [number, number] {
    return [sx / this.cam.zoom - this.canvas.width / 2 + this.cam.x, sy / this.cam.zoom - this.canvas.height / 2 + this.cam.y];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.cam.x + this.canvas.width / 2) * this.cam.zoom, (wy - this.cam.y + this.canvas.height / 2) * this.cam.zoom];
  }

  /** Pick the topmost tile under a screen point; units' bodies count for their tile. */
  pick(sx: number, sy: number): Pos | null {
    const [wx, wy] = this.screenToWorld(sx, sy);
    // Units first (front-most).
    const order = this.sortedTiles().reverse();
    for (const u of [...this.units.values()].filter((v) => !v.hidden).sort((a, b) => this.depthOf(b) - this.depthOf(a))) {
      const [ux, uy] = this.worldOf(u.gx, u.gy, u.z);
      if (wx > ux - 10 && wx < ux + 10 && wy > uy - 44 - u.lift && wy < uy - 4) return [Math.round(u.gx), Math.round(u.gy)];
    }
    for (const t of order) {
      const [cx, cy] = this.worldOf(t.x, t.y, t.h);
      if (Math.abs(wx - cx) / HALF_W + Math.abs(wy - cy) / HALF_H <= 1) return [t.x, t.y];
    }
    return null;
  }

  private sortedTiles(): { x: number; y: number; h: number; d: number; rx: number }[] {
    const out: { x: number; y: number; h: number; d: number; rx: number }[] = [];
    for (let y = 0; y < this.map.h; y++) {
      for (let x = 0; x < this.map.w; x++) {
        const t = tileAt(this.map, x, y);
        if (!t) continue;
        const [rx, ry] = rotate(x, y, this.cam.rot, this.map.w, this.map.h);
        out.push({ x, y, h: t.h, d: rx + ry, rx });
      }
    }
    out.sort((a, b) => a.d - b.d || a.rx - b.rx);
    return out;
  }

  private depthOf(u: VisualUnit): number {
    const p = u.depthTile ?? [Math.round(u.gx), Math.round(u.gy)];
    const [rx, ry] = rotate(p[0], p[1], this.cam.rot, this.map.w, this.map.h);
    return rx + ry;
  }

  floatText(uid: string, text: string, color: string, size = 1, delay = 0): void {
    const u = this.units.get(uid);
    if (!u) return;
    const [wx, wy] = this.worldOf(u.gx, u.gy, u.z);
    const stack = this.texts.filter((t) => Math.abs(t.wx - wx) < 4 && t.t < 0.4).length;
    this.texts.push({ text, wx, wy: wy - 46 - stack * 10, color, t: -delay, max: 1.3, size, rise: 18 });
  }

  // --- frame ---------------------------------------------------------------
  private loop(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.cam.x = lerp(this.cam.x, this.camTarget.x, Math.min(1, dt * 8));
    this.cam.y = lerp(this.cam.y, this.camTarget.y, Math.min(1, dt * 8));
    this.vfx.update(dt);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.max);
    this.render(now);
    this.onFrame?.();
    if (!this.stopped) nextFrame(this.loop, 120);
  }

  private render(now: number): void {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const theme = THEME[this.map.theme] ?? THEME.day;
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    const shake = this.vfx.shake > 0 ? (Math.random() - 0.5) * this.vfx.shake * 6 : 0;
    ctx.translate(Math.round(W / 2 - this.cam.x + shake), Math.round(H / 2 - this.cam.y + shake * 0.5));

    // Ground shadow under the map for depth.
    const tiles = this.sortedTiles();
    const unitsByDepth = new Map<number, VisualUnit[]>();
    for (const u of this.units.values()) {
      if (u.hidden) continue;
      const p = u.depthTile ?? [Math.round(u.gx), Math.round(u.gy)];
      const k = p[1] * 4096 + p[0];
      if (!unitsByDepth.has(k)) unitsByDepth.set(k, []);
      unitsByDepth.get(k)!.push(u);
    }
    const t = now / 1000;
    for (const tile of tiles) {
      const tdef = tileAt(this.map, tile.x, tile.y)!;
      const [cx, cy] = this.worldOf(tile.x, tile.y, tile.h);
      const variant = Math.floor(hash2(17, tile.x, tile.y) * 4);
      const spr = columnSprite(tdef.t, tile.h, variant);
      ctx.drawImage(spr, cx - HALF_W, cy - HALF_H);
      // Animated water / lava surface
      if (tdef.t === 'water' || tdef.t === 'deepwater' || tdef.t === 'swamp' || tdef.t === 'lava') this.drawLiquid(ctx, cx, cy, tdef.t, t, tile.x, tile.y);
      // Highlights
      const hl = this.highlights.get(tile.y * 4096 + tile.x);
      if (hl) this.drawHighlight(ctx, cx, cy, hl, t);
      if (this.cursor && this.cursor[0] === tile.x && this.cursor[1] === tile.y) this.drawCursor(ctx, cx, cy, t);
      // Prop
      if (tdef.prop) {
        const ps = propSprite(tdef.prop, variant, this.map.theme);
        ctx.drawImage(ps.canvas, Math.round(cx - ps.ax), Math.round(cy + 4 - ps.ay));
        if (ps.flame) this.drawFlame(ctx, cx - ps.ax + ps.flame[0], cy + 4 - ps.ay + ps.flame[1], t, tile.x);
      }
      // Units standing here
      const us = unitsByDepth.get(tile.y * 4096 + tile.x);
      if (us) for (const u of us) this.drawUnit(ctx, u, now, tdef.t === 'water' || tdef.t === 'swamp');
    }
    this.vfx.draw(ctx);
    this.drawAmbient(ctx, theme.particles, W, H, now);
    ctx.restore();

    // Theme tint + flash
    if (theme.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = theme.tintAlpha ?? 0.1;
      ctx.fillStyle = theme.tint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (this.vfx.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.vfx.flash * 0.6;
      ctx.fillStyle = this.vfx.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    this.renderOverlay(now);
  }

  private drawLiquid(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: string, time: number, x: number, y: number): void {
    ctx.save();
    diamondPath(ctx, cx, cy, 1);
    ctx.clip();
    const col = t === 'lava' ? 'rgba(255,200,80,' : t === 'swamp' ? 'rgba(150,170,110,' : 'rgba(210,240,255,';
    for (let i = 0; i < 3; i++) {
      const ph = time * (t === 'lava' ? 0.6 : 1.2) + hash2(5, x, y) * 6 + i * 2.1;
      const ox = Math.sin(ph) * 14 + (i - 1) * 10;
      const oy = Math.cos(ph * 0.7) * 5 + (i - 1) * 3;
      ctx.fillStyle = col + (0.25 + 0.2 * Math.sin(ph * 2)) + ')';
      ctx.fillRect(Math.round(cx + ox - 4), Math.round(cy + oy), 8, 1);
    }
    ctx.restore();
  }

  private drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number): void {
    const f = Math.floor(t * 10 + seed) % 3;
    const cols = ['#fff2b0', '#ffb040', '#e8501a'];
    ctx.fillStyle = cols[2]; ctx.fillRect(Math.round(x - 3), Math.round(y - 4 - f), 6, 5 + f);
    ctx.fillStyle = cols[1]; ctx.fillRect(Math.round(x - 2), Math.round(y - 6 - f), 4, 6);
    ctx.fillStyle = cols[0]; ctx.fillRect(Math.round(x - 1), Math.round(y - 4), 2, 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - 3, 0, x, y - 3, 22);
    g.addColorStop(0, 'rgba(255,170,60,0.35)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 22, y - 25, 44, 44);
    ctx.restore();
  }

  private drawHighlight(ctx: CanvasRenderingContext2D, cx: number, cy: number, kind: HighlightKind, t: number): void {
    const [fill, line] = HL_COLORS[kind];
    ctx.save();
    const pulse = kind === 'aoe' ? 0.85 + Math.sin(t * 6) * 0.15 : 0.9 + Math.sin(t * 3) * 0.1;
    ctx.globalAlpha = pulse;
    diamondPath(ctx, cx, cy, 1);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawCursor(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
    ctx.save();
    const b = Math.sin(t * 5) * 1.5;
    diamondPath(ctx, cx, cy, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
    diamondPath(ctx, cx, cy, 3);
    ctx.strokeStyle = 'rgba(255,230,140,0.9)';
    ctx.stroke();
    // bouncing arrow
    ctx.fillStyle = '#ffe08a';
    ctx.strokeStyle = '#3a2a10';
    ctx.beginPath();
    const ay = cy - 62 + b;
    ctx.moveTo(cx - 4, ay); ctx.lineTo(cx + 4, ay); ctx.lineTo(cx, ay + 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: VisualUnit, now: number, inWater: boolean): void {
    const [x0, y0] = this.worldOf(u.gx, u.gy, u.z);
    let x = x0, y = y0 - u.lift;
    if (now < u.shakeUntil) x += Math.sin(now / 18) * 2;
    if (inWater && u.lift === 0) y += 4;
    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.35 * u.alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x0, y0 + (inWater ? 4 : 0), 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Team ring
    const ringCol = u.team === 'player' ? '#5aa8ff' : u.team === 'ally' ? '#6ae0a0' : u.team === 'enemy' ? '#ff6a5a' : '#d0d0d0';
    ctx.save();
    ctx.globalAlpha = 0.55 * u.alpha;
    ctx.strokeStyle = ringCol;
    ctx.beginPath();
    ctx.ellipse(x0, y0 + (inWater ? 4 : 0), 12, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (this.targetUids.has(u.uid)) {
      ctx.globalAlpha = 0.8 + Math.sin(now / 120) * 0.2;
      ctx.strokeStyle = '#ffe08a';
      ctx.beginPath(); ctx.ellipse(x0, y0, 14, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    if (u.crystal) { this.drawCrystal(ctx, x0, y0, now); return; }
    const screenDir = rotateDir(u.facing, this.cam.rot);
    const elapsed = now - u.animStart;
    ctx.save();
    if (inWater && u.lift === 0) {
      ctx.beginPath();
      ctx.rect(x - 40, y - 100, 80, 100 - 3);
      ctx.clip();
    }
    if (u.sprite) {
      u.sprite.draw(ctx, u.anim, screenDir, elapsed, Math.round(x), Math.round(y), { alpha: u.alpha, tint: now < u.flashUntil ? u.flashColor : undefined });
    } else {
      drawPlaceholder(ctx, x, y, u, screenDir, elapsed);
    }
    ctx.restore();
    if (u.charging) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + Math.sin(now / 90) * 0.25;
      const gr = ctx.createRadialGradient(x0, y0 - 20, 2, x0, y0 - 20, 26);
      gr.addColorStop(0, 'rgba(160,200,255,0.6)'); gr.addColorStop(1, 'rgba(120,160,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(x0 - 26, y0 - 46, 52, 52);
      ctx.restore();
    }
  }

  private drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    const b = Math.sin(now / 400) * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(130,210,255,0.85)';
    ctx.strokeStyle = '#e8f8ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 34 + b); ctx.lineTo(x + 9, y - 16 + b); ctx.lineTo(x, y - 2 + b); ctx.lineTo(x - 9, y - 16 + b); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - 3, y - 26 + b, 2, 8);
    ctx.restore();
  }

  private drawAmbient(ctx: CanvasRenderingContext2D, kind: string | undefined, W: number, H: number, now: number): void {
    if (!kind) return;
    const want = kind === 'rain' ? 80 : kind === 'snow' ? 60 : 24;
    while (this.ambient.length < want) {
      this.ambient.push({ x: this.cam.x + (Math.random() - 0.5) * W, y: this.cam.y + (Math.random() - 0.5) * H, vx: 0, vy: 0, life: Math.random() * 6, phase: Math.random() * 6 });
    }
    const dt = 1 / 60;
    ctx.save();
    for (const p of this.ambient) {
      p.life -= dt;
      switch (kind) {
        case 'snow': p.vx = Math.sin(now / 900 + p.phase) * 8; p.vy = 18; break;
        case 'rain': p.vx = -30; p.vy = 260; break;
        case 'fireflies': p.vx = Math.sin(now / 700 + p.phase) * 10; p.vy = Math.cos(now / 900 + p.phase) * 8; break;
        case 'embers': p.vx = Math.sin(now / 500 + p.phase) * 6; p.vy = -14; break;
        default: p.vx = 4; p.vy = Math.sin(now / 1000 + p.phase) * 3;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0 || Math.abs(p.x - this.cam.x) > W || Math.abs(p.y - this.cam.y) > H) {
        p.x = this.cam.x + (Math.random() - 0.5) * W; p.y = this.cam.y + (Math.random() - 0.5) * H - (kind === 'rain' || kind === 'snow' ? H / 2 : 0); p.life = 3 + Math.random() * 5;
      }
      switch (kind) {
        case 'snow': ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); break;
        case 'rain': ctx.fillStyle = 'rgba(180,200,230,0.45)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 5); break;
        case 'fireflies': ctx.fillStyle = `rgba(220,255,140,${0.4 + 0.4 * Math.sin(now / 200 + p.phase)})`; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); break;
        case 'embers': ctx.fillStyle = `rgba(255,160,60,${0.5 + 0.3 * Math.sin(now / 150 + p.phase)})`; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); break;
        default: ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
    ctx.restore();
  }

  private renderOverlay(now: number): void {
    const o = this.octx;
    const dpr = this.dpr;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = this.cam.zoom;
    // HP bars and status pips
    if (this.showHpBars) {
      for (const u of this.units.values()) {
        if (u.hidden || u.crystal || u.alpha < 0.3) continue;
        const [wx, wy] = this.worldOf(u.gx, u.gy, u.z);
        const [sx, sy] = this.worldToScreen(wx, wy - u.lift);
        const w = Math.max(22, 10 * z), h = Math.max(3, 1.2 * z);
        const bx = sx - w / 2, by = sy + 4 * z;
        o.fillStyle = 'rgba(10,10,20,0.75)';
        o.fillRect(bx - 1, by - 1, w + 2, h + 2);
        const col = u.team === 'enemy' ? '#ff6a5a' : u.team === 'player' ? '#6ae07a' : '#6ad0e0';
        o.fillStyle = u.hpFrac <= 0.2 ? '#ffb040' : col;
        o.fillRect(bx, by, w * Math.max(0, u.hpFrac), h);
        if (u.mpFrac > 0 && u.team !== 'enemy') {
          o.fillStyle = '#6aa8ff';
          o.fillRect(bx, by + h + 1, w * u.mpFrac, Math.max(1, h * 0.5));
        }
        // Status pips
        let i = 0;
        for (const s of u.statuses.slice(0, 5)) {
          o.fillStyle = STATUS_PIP[s] ?? '#ccc';
          o.fillRect(bx + i * (h + 3), by - h - 3, h + 1, h + 1);
          i++;
        }
      }
    }
    // Active unit marker
    if (this.activeUid) {
      const u = this.units.get(this.activeUid);
      if (u && !u.hidden) {
        const [wx, wy] = this.worldOf(u.gx, u.gy, u.z);
        const [sx, sy] = this.worldToScreen(wx, wy - u.lift - 60);
        const b = Math.sin(now / 160) * 4;
        const s = 7 + z * 1.5;
        o.save();
        o.shadowColor = 'rgba(255,200,60,0.9)';
        o.shadowBlur = 8;
        o.fillStyle = '#ffd54a';
        o.strokeStyle = '#3a2600';
        o.lineWidth = 2;
        o.beginPath();
        o.moveTo(sx - s, sy - s * 1.4 + b); o.lineTo(sx + s, sy - s * 1.4 + b); o.lineTo(sx, sy + b); o.closePath();
        o.fill(); o.shadowBlur = 0; o.stroke();
        o.restore();
      }
    }
    // Floating texts
    for (const t of this.texts) {
      if (t.t < 0) continue;
      const k = t.t / t.max;
      const pop = k < 0.12 ? 1 + (0.12 - k) * 5 : 1;
      const [sx, sy] = this.worldToScreen(t.wx, t.wy - Math.min(1, k * 3) * t.rise);
      const size = Math.round((10 + 4 * z) * t.size * pop);
      o.font = `700 ${size}px "Pixelify Sans", "Silkscreen", monospace`;
      o.textAlign = 'center';
      o.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      o.lineWidth = Math.max(3, size / 5);
      o.strokeStyle = 'rgba(10,8,16,0.95)';
      o.strokeText(t.text, sx, sy);
      o.fillStyle = t.color;
      o.fillText(t.text, sx, sy);
      o.globalAlpha = 1;
    }
  }
}

const STATUS_PIP: Record<string, string> = {
  poison: '#8fd14f', regen: '#7cf2b2', protect: '#e8c35a', shell: '#5ab6e8', haste: '#ffd54a', slow: '#7f6bd6',
  stop: '#b06bd6', silence: '#9ab', blind: '#555', sleep: '#6b8fd6', confuse: '#e86bd6', charm: '#ff8fb8',
  berserk: '#e84a4a', doom: '#a040a0', float: '#cdefff', reflect: '#e8f4ff', reraise: '#ffe9a0', undead: '#6a7a5a',
  immobilize: '#c97d4a', disable: '#c94a4a', oil: '#5a4a2a', charging: '#ffffff', defending: '#c0c0c0', vanish: '#cccccc', petrify: '#9a8f80',
};

/** Simple figure until composited LPC sprites are available. */
function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, u: VisualUnit, dir: Dir, elapsed: number): void {
  const bob = u.anim === 'walk' ? Math.abs(Math.sin(elapsed / 90)) * 2 : 0;
  const ko = u.anim === 'ko' || u.anim === 'die';
  ctx.save();
  ctx.globalAlpha = u.alpha;
  const body = u.team === 'enemy' ? '#a83a30' : '#3a6ab0';
  if (ko) {
    ctx.fillStyle = body; ctx.fillRect(x - 12, y - 6, 22, 6);
    ctx.fillStyle = '#e8c8a0'; ctx.fillRect(x + 8, y - 8, 6, 6);
  } else {
    ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 5, y - 10 - bob, 4, 10); ctx.fillRect(x + 1, y - 10 - bob, 4, 10);
    ctx.fillStyle = body; ctx.fillRect(x - 7, y - 26 - bob, 14, 17);
    ctx.fillStyle = '#e8c8a0'; ctx.fillRect(x - 5, y - 36 - bob, 10, 10);
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 5, y - 38 - bob, 10, 4);
    ctx.fillStyle = '#000';
    if (dir === 's' || dir === 'e') ctx.fillRect(x + (dir === 'e' ? 2 : -2), y - 32 - bob, 2, 2);
  }
  ctx.restore();
}

export { TILE_W, TILE_H, HEIGHT_PX };
