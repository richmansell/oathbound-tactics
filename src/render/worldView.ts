/**
 * WorldView: streams and draws the free-roam overworld around the party using
 * the same isometric terrain/prop/sprite renderers as battles. Only tiles in a
 * window around the camera are drawn; columns render just their visible depth.
 */
import { hash2 } from '../engine/rng';
import type { Dir, Terrain } from '../engine/types';
import { HALF_H, HALF_W, HEIGHT_PX, lerp, rotateDir, type Rot } from './iso';
import { propSprite } from './props';
import { columnSprite, diamondPath } from './terrain';
import { nextFrame } from './frame';
import type { GameAnimName, UnitSpriteSource } from './scene';

export interface WorldTileLike {
  h: number;
  t: Terrain;
  prop?: string;
  road?: boolean;
  water?: boolean;
  blocked?: boolean;
  region?: string;
  danger?: number;
  setPiece?: string;
}

export interface WorldSource {
  tile(x: number, y: number): WorldTileLike;
}

export interface WorldActor {
  id: string;
  x: number; y: number;          // float tile coords
  z: number;                     // height (float)
  facing: Dir;
  anim: GameAnimName;
  animStart: number;
  sprite: UnitSpriteSource | null;
  kind: 'party' | 'follower' | 'enemy' | 'npc';
  label?: string;
  alert?: boolean;               // chasing (shows "!")
  alpha?: number;
}

export class WorldView {
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  cam = { x: 0, y: 0, zoom: 2, rot: 0 as Rot };
  private camTarget = { x: 0, y: 0 };
  actors = new Map<string, WorldActor>();
  /** World minutes, for day/night tint. */
  time = 8 * 60;
  weather: 'clear' | 'fog' | 'rain' | 'snow' | 'ash' = 'clear';
  marker: [number, number] | null = null;
  pathPreview: [number, number][] = [];
  radius = 20;
  private stopped = false;
  private last = performance.now();
  private dpr = 1;
  onFrame?: (dt: number) => void;
  private ambient: { x: number; y: number; life: number; ph: number }[] = [];

  constructor(host: HTMLElement, public world: WorldSource) {
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    for (const c of [this.canvas, this.overlay]) Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
    this.canvas.style.imageRendering = 'pixelated';
    this.overlay.style.pointerEvents = 'none';
    host.appendChild(this.canvas);
    host.appendChild(this.overlay);
    this.ctx = this.canvas.getContext('2d')!;
    this.octx = this.overlay.getContext('2d')!;
    this.radius = Math.min(window.innerWidth, window.innerHeight) < 600 ? 15 : 20;
    this.resize();
    this.loop = this.loop.bind(this);
    nextFrame(this.loop);
  }

  destroy(): void {
    this.stopped = true;
    this.canvas.remove();
    this.overlay.remove();
  }

  resize(): void {
    const host = this.canvas.parentElement!;
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.ceil(w / this.cam.zoom);
    this.canvas.height = Math.ceil(h / this.cam.zoom);
    this.overlay.width = Math.round(w * this.dpr);
    this.overlay.height = Math.round(h * this.dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  setZoom(z: number): void {
    this.cam.zoom = Math.max(1, Math.min(4, z));
    this.resize();
  }

  /** Rotated offset of a world tile relative to the camera focus tile. */
  private rel(x: number, y: number, fx: number, fy: number): [number, number] {
    const dx = x - fx, dy = y - fy;
    switch (this.cam.rot) {
      case 0: return [dx, dy];
      case 1: return [-dy, dx];
      case 2: return [-dx, -dy];
      default: return [dy, -dx];
    }
  }

  private focus = { x: 0, y: 0 };

  /** World (tile) coords → canvas-native px. */
  worldToNative(x: number, y: number, z: number): [number, number] {
    const [rx, ry] = this.rel(x, y, this.focus.x, this.focus.y);
    return [(rx - ry) * HALF_W - this.cam.x + this.canvas.width / 2, (rx + ry) * HALF_H - z * HEIGHT_PX - this.cam.y + this.canvas.height / 2];
  }

  /** Centre the camera on a tile (smoothly). */
  follow(x: number, y: number, z: number, instant = false): void {
    // Re-anchor the focus to the integer tile to keep numbers small.
    const fx = Math.floor(x), fy = Math.floor(y);
    if (fx !== this.focus.x || fy !== this.focus.y) {
      const [ox, oy] = this.relPx(this.focus.x, this.focus.y, fx, fy);
      this.cam.x -= ox; this.cam.y -= oy; this.camTarget.x -= ox; this.camTarget.y -= oy;
      this.focus = { x: fx, y: fy };
    }
    const [rx, ry] = this.rel(x, y, fx, fy);
    this.camTarget = { x: (rx - ry) * HALF_W, y: (rx + ry) * HALF_H - z * HEIGHT_PX - 18 };
    if (instant) { this.cam.x = this.camTarget.x; this.cam.y = this.camTarget.y; }
  }

  private relPx(fromX: number, fromY: number, toX: number, toY: number): [number, number] {
    const [rx, ry] = this.rel(toX, toY, fromX, fromY);
    return [(rx - ry) * HALF_W, (rx + ry) * HALF_H];
  }

  rotateBy(d: 1 | -1): void {
    this.cam.rot = ((((this.cam.rot + d) % 4) + 4) % 4) as Rot;
    this.cam.x = this.camTarget.x = 0;
    this.cam.y = this.camTarget.y = 0;
  }

  /** Screen px (CSS, relative to host) → world tile under the point (topmost). */
  pick(sx: number, sy: number): [number, number] | null {
    const nx = sx / this.cam.zoom, ny = sy / this.cam.zoom;
    const R = this.radius;
    let best: [number, number] | null = null;
    let bestDepth = -Infinity;
    for (let ry = -R; ry <= R; ry++) for (let rx = -R; rx <= R; rx++) {
      const [x, y] = this.unrel(rx, ry);
      const t = this.world.tile(x, y);
      const [cx, cy] = this.worldToNative(x, y, t.h);
      if (Math.abs(nx - cx) / HALF_W + Math.abs(ny - cy) / HALF_H <= 1) {
        const d = rx + ry;
        if (d > bestDepth) { bestDepth = d; best = [x, y]; }
      }
    }
    return best;
  }

  private unrel(rx: number, ry: number): [number, number] {
    const fx = this.focus.x, fy = this.focus.y;
    switch (this.cam.rot) {
      case 0: return [fx + rx, fy + ry];
      case 1: return [fx + ry, fy - rx];
      case 2: return [fx - rx, fy - ry];
      default: return [fx - ry, fy + rx];
    }
  }

  private loop(now: number): void {
    if (this.stopped) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.cam.x = lerp(this.cam.x, this.camTarget.x, Math.min(1, dt * 10));
    this.cam.y = lerp(this.cam.y, this.camTarget.y, Math.min(1, dt * 10));
    this.onFrame?.(dt);
    this.render(now);
    nextFrame(this.loop, 120);
  }

  private dayTint(): { color: string; alpha: number; sky: [string, string] } {
    const h = (this.time / 60) % 24;
    if (h >= 6 && h < 17) return { color: '#000000', alpha: 0, sky: ['#6fa8dc', '#cfe6f5'] };
    if (h >= 17 && h < 20) return { color: '#ff7a30', alpha: 0.16 * (1 - Math.abs(h - 18.5) / 1.5) + 0.05, sky: ['#5a3a6a', '#e89a6a'] };
    if (h >= 4 && h < 6) return { color: '#ffa070', alpha: 0.12, sky: ['#3a4a7a', '#e8b090'] };
    return { color: '#1a2860', alpha: 0.42, sky: ['#060a1a', '#1a2440'] };
  }

  private render(now: number): void {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const day = this.dayTint();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, day.sky[0]); g.addColorStop(1, day.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const R = this.radius;
    const t = now / 1000;
    // Actors bucketed by their tile.
    const byTile = new Map<string, WorldActor[]>();
    for (const a of this.actors.values()) {
      const k = `${Math.round(a.x)},${Math.round(a.y)}`;
      if (!byTile.has(k)) byTile.set(k, []);
      byTile.get(k)!.push(a);
    }
    const markerKey = this.marker ? `${this.marker[0]},${this.marker[1]}` : '';
    const pathKeys = new Set(this.pathPreview.map((p) => `${p[0]},${p[1]}`));
    for (let d = -2 * R; d <= 2 * R; d++) {
      for (let rx = Math.max(-R, d - R); rx <= Math.min(R, d + R); rx++) {
        const ry = d - rx;
        const [x, y] = this.unrel(rx, ry);
        const tile = this.world.tile(x, y);
        const [cx, cy] = this.worldToNative(x, y, tile.h);
        if (cx < -HALF_W * 2 || cx > W + HALF_W * 2 || cy < -120 || cy > H + 300) continue;
        // Visible depth: down to the lowest front neighbour.
        const [ax, ay] = this.unrel(rx + 1, ry);
        const [bx, by] = this.unrel(rx, ry + 1);
        const low = Math.min(this.world.tile(ax, ay).h, this.world.tile(bx, by).h);
        const vis = Math.max(1, Math.min(tile.h, tile.h - low + 1));
        const variant = Math.floor(hash2(17, x, y) * 4);
        const spr = columnSprite(tile.t, vis, variant);
        ctx.drawImage(spr, Math.round(cx - HALF_W), Math.round(cy - HALF_H));
        if (tile.t === 'water' || tile.t === 'deepwater' || tile.t === 'swamp') this.drawLiquid(ctx, cx, cy, t, x, y);
        const k = `${x},${y}`;
        if (pathKeys.has(k)) { ctx.save(); diamondPath(ctx, cx, cy, 6); ctx.fillStyle = 'rgba(255,240,170,0.28)'; ctx.fill(); ctx.restore(); }
        if (k === markerKey) this.drawMarker(ctx, cx, cy, t);
        if (tile.prop) {
          const ps = propSprite(tile.prop, variant, this.weather === 'snow' ? 'snow' : 'day');
          ctx.drawImage(ps.canvas, Math.round(cx - ps.ax), Math.round(cy + 4 - ps.ay));
          if (ps.flame) this.drawFlame(ctx, cx - ps.ax + ps.flame[0], cy + 4 - ps.ay + ps.flame[1], t, x);
        }
        const acts = byTile.get(k);
        if (acts) for (const a of acts) this.drawActor(ctx, a, now, tile.t === 'water' || tile.t === 'swamp');
      }
    }
    this.drawWeather(ctx, W, H, now);
    if (day.alpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = day.alpha;
      ctx.fillStyle = day.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // Light pools around the party at night.
      if (day.alpha > 0.3) {
        const party = [...this.actors.values()].find((a) => a.kind === 'party');
        if (party) {
          const [px, py] = this.worldToNative(party.x, party.y, party.z);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const gr = ctx.createRadialGradient(px, py - 16, 4, px, py - 16, 70);
          gr.addColorStop(0, 'rgba(255,190,110,0.28)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
          ctx.fillStyle = gr; ctx.fillRect(px - 70, py - 86, 140, 140);
          ctx.restore();
        }
      }
    }
    this.renderOverlay(now);
  }

  private drawLiquid(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number, x: number, y: number): void {
    ctx.save();
    diamondPath(ctx, cx, cy, 1);
    ctx.clip();
    for (let i = 0; i < 2; i++) {
      const ph = time * 1.2 + hash2(5, x, y) * 6 + i * 2.1;
      ctx.fillStyle = `rgba(210,240,255,${0.22 + 0.15 * Math.sin(ph * 2)})`;
      ctx.fillRect(Math.round(cx + Math.sin(ph) * 14 - 4), Math.round(cy + Math.cos(ph * 0.7) * 5), 8, 1);
    }
    ctx.restore();
  }

  private drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number): void {
    const f = Math.floor(t * 10 + seed) % 3;
    ctx.fillStyle = '#e8501a'; ctx.fillRect(Math.round(x - 3), Math.round(y - 4 - f), 6, 5 + f);
    ctx.fillStyle = '#ffb040'; ctx.fillRect(Math.round(x - 2), Math.round(y - 6 - f), 4, 6);
    ctx.fillStyle = '#fff2b0'; ctx.fillRect(Math.round(x - 1), Math.round(y - 4), 2, 3);
  }

  private drawMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
    ctx.save();
    diamondPath(ctx, cx, cy, 2);
    ctx.strokeStyle = `rgba(255,230,140,${0.6 + 0.4 * Math.sin(t * 6)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawActor(ctx: CanvasRenderingContext2D, a: WorldActor, now: number, inWater: boolean): void {
    const [x, y] = this.worldToNative(a.x, a.y, a.z);
    ctx.save();
    ctx.globalAlpha = 0.35 * (a.alpha ?? 1);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y + (inWater ? 3 : 0), 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    if (inWater) { ctx.beginPath(); ctx.rect(x - 40, y - 100, 80, 98); ctx.clip(); }
    const dir = rotateDir(a.facing, this.cam.rot);
    if (a.sprite) a.sprite.draw(ctx, a.anim, dir, now - a.animStart, Math.round(x), Math.round(y + (inWater ? 3 : 0)), { alpha: a.alpha ?? 1 });
    else { ctx.fillStyle = a.kind === 'enemy' ? '#a83a30' : '#3a6ab0'; ctx.fillRect(x - 6, y - 30, 12, 28); }
    ctx.restore();
  }

  private drawWeather(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    const kind = this.weather;
    if (kind === 'clear') return;
    if (kind === 'fog') {
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const off = ((now / 1000) * (6 + i * 4) % (W * 2)) - W / 2;
        const gr = ctx.createRadialGradient(off + i * W * 0.3, H * (0.3 + i * 0.15), 10, off + i * W * 0.3, H * (0.3 + i * 0.15), W * 0.5);
        gr.addColorStop(0, 'rgba(220,228,235,0.22)'); gr.addColorStop(1, 'rgba(220,228,235,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      return;
    }
    const want = kind === 'rain' ? 120 : 70;
    while (this.ambient.length < want) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, life: Math.random(), ph: Math.random() * 6 });
    const dt = 1 / 60;
    for (const p of this.ambient) {
      if (kind === 'rain') { p.x -= 40 * dt; p.y += 300 * dt; ctx.fillStyle = 'rgba(180,200,230,0.45)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 5); }
      else if (kind === 'snow') { p.x += Math.sin(now / 900 + p.ph) * 0.3; p.y += 22 * dt; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
      else { p.x += 10 * dt; p.y += 8 * dt; ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
      if (p.y > H || p.x < 0 || p.x > W) { p.x = Math.random() * W; p.y = -5; }
    }
  }

  private renderOverlay(now: number): void {
    const o = this.octx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const z = this.cam.zoom;
    for (const a of this.actors.values()) {
      if (!a.label && !a.alert) continue;
      const [nx, ny] = this.worldToNative(a.x, a.y, a.z);
      const sx = nx * z, sy = (ny - 54) * z;
      if (a.alert) {
        o.font = `700 ${12 + 4 * z}px "Pixelify Sans", monospace`;
        o.textAlign = 'center';
        o.lineWidth = 4; o.strokeStyle = '#200';
        const b = Math.sin(now / 120) * 2;
        o.strokeText('!', sx, sy - 6 + b); o.fillStyle = '#ff5a4a'; o.fillText('!', sx, sy - 6 + b);
      }
      if (a.label) {
        o.font = `600 ${11 + z}px Cinzel, serif`;
        o.textAlign = 'center';
        o.lineWidth = 3; o.strokeStyle = 'rgba(10,8,16,0.9)';
        o.strokeText(a.label, sx, sy + 70 * z / 2 + 4);
        o.fillStyle = a.kind === 'enemy' ? '#ffb0a8' : '#f6ecd0';
        o.fillText(a.label, sx, sy + 70 * z / 2 + 4);
      }
    }
  }
}
