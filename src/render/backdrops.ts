/**
 * Procedural animated backdrops for map-less scenes. Drawn at a low native
 * resolution (pixel-art look) in parallax silhouette layers, then scaled up
 * crisply. Every location backdrop kind has its own composition and mood.
 */
import { hash2 } from '../engine/rng';

export type BackdropKind = 'castle-hall' | 'forest' | 'village' | 'abbey' | 'camp-night' | 'road' | 'tavern' | 'bridge' | 'keep' | 'dungeon' | 'snow' | 'swamp' | 'black';

export const BD_W = 384;
export const BD_H = 216;

type C = CanvasRenderingContext2D;

function grad(ctx: C, stops: [number, string][], y0 = 0, y1 = BD_H): void {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, BD_W, y1 - y0);
}

/** Ridge silhouette from summed sines. */
function ridge(ctx: C, base: number, amp: number, freq: number, seed: number, color: string, jag = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, BD_H);
  for (let x = 0; x <= BD_W; x += 2) {
    const y = base - amp * (0.5 + 0.3 * Math.sin(x * freq + seed) + 0.2 * Math.sin(x * freq * 2.3 + seed * 1.7)) - (jag ? (hash2(seed, x, 0) - 0.5) * jag : 0);
    ctx.lineTo(x, Math.round(y));
  }
  ctx.lineTo(BD_W, BD_H);
  ctx.closePath();
  ctx.fill();
}

function pine(ctx: C, x: number, base: number, h: number, color: string): void {
  ctx.fillStyle = color;
  const w = h * 0.38;
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const y = base - h * (0.25 + t * 0.75);
    const ww = w * (1 - t * 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.22);
    ctx.lineTo(x + ww, y + h * 0.12);
    ctx.lineTo(x - ww, y + h * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(Math.round(x - 1), Math.round(base - h * 0.25), 2, Math.round(h * 0.25));
}

function roundTree(ctx: C, x: number, base: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - 1), Math.round(base - h * 0.4), 3, Math.round(h * 0.4));
  ctx.beginPath(); ctx.ellipse(x, base - h * 0.6, h * 0.32, h * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x - h * 0.2, base - h * 0.48, h * 0.22, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + h * 0.2, base - h * 0.5, h * 0.22, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
}

function deadTree(ctx: C, x: number, base: number, h: number, color: string, seed: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + (hash2(seed, 1, 1) - 0.5) * 4, base - h); ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const by = base - h * (0.4 + i * 0.12);
    const dir = i % 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + dir * h * (0.18 + hash2(seed, i, 2) * 0.2), by - h * 0.15); ctx.stroke();
  }
}

function house(ctx: C, x: number, base: number, w: number, h: number, wall: string, roof: string, lit: string | null, seed: number): void {
  ctx.fillStyle = wall;
  ctx.fillRect(Math.round(x), Math.round(base - h), Math.round(w), Math.round(h));
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - 3, base - h);
  ctx.lineTo(x + w / 2, base - h - w * 0.55);
  ctx.lineTo(x + w + 3, base - h);
  ctx.closePath();
  ctx.fill();
  if (hash2(seed, 3, 3) > 0.5) { ctx.fillRect(Math.round(x + w * 0.7), Math.round(base - h - w * 0.5), 3, Math.round(w * 0.3)); }
  if (lit) {
    for (let i = 0; i < 2; i++) {
      if (hash2(seed, i, 7) < 0.35) continue;
      ctx.fillStyle = lit;
      ctx.fillRect(Math.round(x + w * (0.2 + i * 0.45)), Math.round(base - h * 0.65), 3, 4);
    }
  }
}

function glow(ctx: C, x: number, y: number, r: number, color: string, a: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('ALPHA', String(a)));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Flickering pixel flame: layered tongues, hot core, rising sparks. */
function flame(ctx: C, x: number, y: number, size: number, t: number): void {
  const tongues = 5;
  for (let layer = 0; layer < 3; layer++) {
    const col = ['#c83a12', '#ff8a30', '#ffe08a'][layer];
    const sc = [1, 0.7, 0.4][layer];
    ctx.fillStyle = col;
    for (let i = 0; i < tongues; i++) {
      const ph = t * (7 + i) + i * 1.7;
      const h = size * sc * (0.7 + 0.3 * Math.sin(ph)) * (1 - Math.abs(i - (tongues - 1) / 2) / tongues);
      const w = Math.max(1, Math.round(size * sc * 0.28));
      const xx = x + (i - (tongues - 1) / 2) * w * 0.8 + Math.sin(ph * 0.7) * 1.2;
      ctx.beginPath();
      ctx.moveTo(xx - w, y);
      ctx.quadraticCurveTo(xx - w * 0.6, y - h * 0.6, xx + Math.sin(ph) * 2, y - h);
      ctx.quadraticCurveTo(xx + w * 0.6, y - h * 0.6, xx + w, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  for (let i = 0; i < 4; i++) {
    const k = ((t * 0.9 + i * 0.25) % 1);
    ctx.fillStyle = `rgba(255,200,90,${1 - k})`;
    ctx.fillRect(Math.round(x + Math.sin(t * 3 + i * 2) * 5), Math.round(y - size * (0.8 + k * 1.6)), 1, 1);
  }
}

function stars(ctx: C, n: number, t: number, maxY = BD_H * 0.55): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(9, i, 1) * BD_W), y = Math.floor(hash2(9, i, 2) * maxY);
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.5 + hash2(9, i, 3)) + i));
    ctx.fillStyle = `rgba(255,255,240,${(tw * 0.8).toFixed(2)})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

function fog(ctx: C, y: number, h: number, t: number, alpha: number, color = '220,228,235'): void {
  for (let i = 0; i < 4; i++) {
    const off = ((t * (6 + i * 3)) % (BD_W * 2)) - BD_W;
    const g = ctx.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, `rgba(${color},0)`);
    g.addColorStop(0.5, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(off + i * 110, y + Math.sin(t * 0.3 + i) * 3, 160, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function particles(ctx: C, kind: 'snow' | 'rain' | 'embers' | 'fireflies' | 'dust' | 'ash', t: number): void {
  const n = kind === 'rain' ? 120 : kind === 'snow' ? 90 : 40;
  for (let i = 0; i < n; i++) {
    const sx = hash2(4, i, 1) * BD_W, sy = hash2(4, i, 2) * BD_H, sp = 0.5 + hash2(4, i, 3);
    let x = sx, y = sy;
    switch (kind) {
      case 'snow': y = (sy + t * 14 * sp) % BD_H; x = (sx + Math.sin(t + i) * 6) % BD_W; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(Math.round(x), Math.round(y), sp > 1 ? 2 : 1, sp > 1 ? 2 : 1); break;
      case 'rain': y = (sy + t * 220 * sp) % BD_H; x = (sx - t * 40 * sp) % BD_W; if (x < 0) x += BD_W; ctx.fillStyle = 'rgba(170,190,220,0.4)'; ctx.fillRect(Math.round(x), Math.round(y), 1, 4); break;
      case 'embers': y = BD_H - ((BD_H - sy + t * 18 * sp) % BD_H); x = sx + Math.sin(t * 2 + i) * 4; ctx.fillStyle = `rgba(255,${140 + Math.floor(sp * 60)},60,${0.5 + 0.4 * Math.sin(t * 5 + i)})`; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); break;
      case 'ash': y = (sy + t * 6 * sp) % BD_H; x = (sx + t * 8 + Math.sin(t + i) * 5) % BD_W; ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); break;
      case 'fireflies': x = sx + Math.sin(t * 0.7 + i) * 10; y = BD_H * 0.55 + (sy % (BD_H * 0.4)) + Math.cos(t * 0.9 + i) * 6; ctx.fillStyle = `rgba(220,255,140,${0.3 + 0.6 * Math.abs(Math.sin(t * 2 + i))})`; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); break;
      default: x = (sx + t * 3) % BD_W; y = sy + Math.sin(t + i) * 3; ctx.fillStyle = 'rgba(255,240,200,0.3)'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
}

function archWindow(ctx: C, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function stoneWall(ctx: C, y0: number, y1: number, base: string, line: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, y0, BD_W, y1 - y0);
  ctx.fillStyle = line;
  for (let row = 0; y0 + row * 9 < y1; row++) {
    const y = y0 + row * 9;
    ctx.fillRect(0, y, BD_W, 1);
    for (let x = (row % 2) * 12; x < BD_W; x += 24) ctx.fillRect(x, y, 1, 9);
  }
}

/** Draw a backdrop frame. `t` = seconds. `variant` varies details per location. */
export function drawBackdrop(ctx: C, kind: BackdropKind, t: number, variant = 0): void {
  ctx.imageSmoothingEnabled = false;
  const v = variant;
  switch (kind) {
    case 'black':
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, BD_W, BD_H);
      return;
    case 'forest': {
      grad(ctx, [[0, '#2c4a5a'], [0.6, '#7aa088'], [1, '#c8d4a8']]);
      ridge(ctx, 120, 40, 0.012, v + 1, '#4a6a62');
      for (let i = 0; i < 26; i++) pine(ctx, hash2(v, i, 1) * BD_W, 150 + hash2(v, i, 2) * 10, 40 + hash2(v, i, 3) * 25, '#2e4a3c');
      fog(ctx, 150, 14, t, 0.18);
      for (let i = 0; i < 14; i++) roundTree(ctx, hash2(v + 5, i, 1) * BD_W, 200 + hash2(v, i, 4) * 12, 70 + hash2(v, i, 5) * 40, '#1a2e22');
      grad(ctx, [[0, 'rgba(20,30,20,0)'], [1, 'rgba(10,18,12,0.85)']], 180, BD_H);
      particles(ctx, 'dust', t);
      // light shafts
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(255,240,190,${0.05 + 0.03 * Math.sin(t * 0.5 + i)})`;
        ctx.beginPath(); const x = 80 + i * 110; ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 70, BD_H); ctx.lineTo(x + 20, BD_H); ctx.fill();
      }
      ctx.restore();
      return;
    }
    case 'village': {
      const dusk = v % 2 === 1;
      grad(ctx, dusk ? [[0, '#3a2a4a'], [0.55, '#d88a5a'], [1, '#f0c890']] : [[0, '#5a8ac0'], [0.6, '#a8cce0'], [1, '#e8eed8']]);
      if (dusk) glow(ctx, 300, 120, 60, 'rgba(255,200,120,ALPHA)', 0.5);
      ridge(ctx, 128, 30, 0.01, v + 2, dusk ? '#6a4a5a' : '#7a9a8a');
      ridge(ctx, 150, 20, 0.02, v + 3, dusk ? '#4a3a42' : '#5a7a5a');
      for (let i = 0; i < 9; i++) {
        const x = 20 + i * 42 + hash2(v, i, 1) * 10;
        house(ctx, x, 176, 26 + hash2(v, i, 2) * 10, 16 + hash2(v, i, 3) * 8, dusk ? '#3a2a24' : '#8a7a62', dusk ? '#2a1a18' : '#6a3a2a', dusk ? '#ffd27a' : null, v * 31 + i);
      }
      for (let i = 0; i < 6; i++) roundTree(ctx, hash2(v + 9, i, 1) * BD_W, 182, 40 + hash2(v, i, 6) * 20, dusk ? '#241a1a' : '#3a5a32');
      ctx.fillStyle = dusk ? '#2a2018' : '#6a7a4a'; ctx.fillRect(0, 180, BD_W, BD_H - 180);
      ctx.fillStyle = dusk ? '#3a2e22' : '#8a8a62';
      ctx.beginPath(); ctx.moveTo(160, BD_H); ctx.lineTo(186, 180); ctx.lineTo(206, 180); ctx.lineTo(240, BD_H); ctx.fill();
      particles(ctx, dusk ? 'fireflies' : 'dust', t);
      // chimney smoke
      for (let i = 0; i < 3; i++) {
        const sx = 60 + i * 120, sy = 150 - ((t * 10 + i * 20) % 50);
        ctx.fillStyle = 'rgba(200,200,210,0.25)'; ctx.beginPath(); ctx.arc(sx + Math.sin(t + i) * 4, sy, 4 + (150 - sy) * 0.1, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    case 'road': {
      grad(ctx, [[0, '#6a9ac8'], [0.6, '#c0d8e0'], [1, '#e8e4c8']]);
      glow(ctx, 70, 50, 40, 'rgba(255,250,220,ALPHA)', 0.7);
      ridge(ctx, 118, 26, 0.009, v + 4, '#8aa0a0');
      ridge(ctx, 140, 22, 0.016, v + 5, '#6a8a62');
      ridge(ctx, 168, 18, 0.024, v + 6, '#5a7a48');
      ctx.fillStyle = '#4a6a38'; ctx.fillRect(0, 180, BD_W, BD_H - 180);
      ctx.fillStyle = '#a8946a';
      ctx.beginPath(); ctx.moveTo(120, BD_H); ctx.quadraticCurveTo(200, 180, 196, 150); ctx.lineTo(202, 150); ctx.quadraticCurveTo(230, 190, 300, BD_H); ctx.fill();
      for (let i = 0; i < 8; i++) roundTree(ctx, (i < 4 ? 10 + i * 30 : 260 + (i - 4) * 32) + hash2(v, i, 1) * 10, 186 + hash2(v, i, 2) * 10, 44 + hash2(v, i, 3) * 26, '#2e4a2a');
      // drifting clouds
      for (let i = 0; i < 3; i++) {
        const cx = ((t * 4 + i * 160) % (BD_W + 120)) - 60;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.ellipse(cx, 40 + i * 14, 30, 7, 0, 0, Math.PI * 2); ctx.ellipse(cx + 18, 36 + i * 14, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    case 'camp-night': {
      grad(ctx, [[0, '#060a1a'], [0.6, '#1a2440'], [1, '#2a2a30']]);
      stars(ctx, 120, t);
      ctx.fillStyle = '#e8e8d0'; ctx.beginPath(); ctx.arc(310, 40, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a2440'; ctx.beginPath(); ctx.arc(314, 37, 8, 0, Math.PI * 2); ctx.fill();
      ridge(ctx, 140, 24, 0.012, v + 7, '#10141e');
      for (let i = 0; i < 18; i++) pine(ctx, hash2(v, i, 1) * BD_W, 160, 30 + hash2(v, i, 2) * 20, '#0a0e14');
      ctx.fillStyle = '#14100c'; ctx.fillRect(0, 175, BD_W, BD_H - 175);
      // tents
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.moveTo(60, 190); ctx.lineTo(95, 150); ctx.lineTo(130, 190); ctx.fill();
      ctx.beginPath(); ctx.moveTo(270, 192); ctx.lineTo(300, 158); ctx.lineTo(332, 192); ctx.fill();
      const fl = 0.6 + 0.25 * Math.sin(t * 9) + 0.15 * Math.sin(t * 23);
      glow(ctx, 192, 180, 90, 'rgba(255,150,60,ALPHA)', 0.45 * fl);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(180, 182, 24, 3); ctx.fillRect(184, 180, 16, 2);
      ctx.fillStyle = '#4a4440'; for (let i = 0; i < 6; i++) ctx.fillRect(178 + i * 5, 184, 4, 2);
      flame(ctx, 192, 182, 16, t);
      particles(ctx, 'embers', t);
      return;
    }
    case 'swamp': {
      grad(ctx, [[0, '#3a4a4a'], [0.5, '#6a7a6a'], [1, '#4a5244']]);
      fog(ctx, 110, 20, t, 0.25);
      ridge(ctx, 140, 14, 0.02, v + 8, '#3a4638');
      for (let i = 0; i < 12; i++) deadTree(ctx, hash2(v, i, 1) * BD_W, 160 + hash2(v, i, 2) * 10, 40 + hash2(v, i, 3) * 40, '#1e2620', v * 13 + i);
      ctx.fillStyle = '#2a3430'; ctx.fillRect(0, 168, BD_W, BD_H - 168);
      for (let i = 0; i < 20; i++) {
        const x = hash2(v + 3, i, 1) * BD_W, w = 20 + hash2(v, i, 2) * 40;
        ctx.fillStyle = `rgba(150,170,160,${0.15 + 0.1 * Math.sin(t + i)})`;
        ctx.fillRect(Math.round(x + Math.sin(t * 0.5 + i) * 3), 172 + Math.floor(hash2(v, i, 3) * 40), Math.round(w), 1);
      }
      for (let i = 0; i < 30; i++) {
        const x = hash2(v + 4, i, 1) * BD_W, y = 175 + hash2(v, i, 2) * 40;
        ctx.fillStyle = '#1a2418'; ctx.fillRect(Math.round(x), Math.round(y - 10), 1, 10); ctx.fillRect(Math.round(x + 2), Math.round(y - 7), 1, 7);
      }
      fog(ctx, 175, 18, t * 1.3, 0.3);
      particles(ctx, 'fireflies', t);
      return;
    }
    case 'bridge': {
      grad(ctx, [[0, '#50708a'], [0.6, '#9ab0b8'], [1, '#7a8a80']]);
      ridge(ctx, 120, 24, 0.012, v + 9, '#6a7a7a');
      for (let i = 0; i < 14; i++) roundTree(ctx, hash2(v, i, 1) * BD_W, 140, 30 + hash2(v, i, 2) * 14, '#3a4a3a');
      ctx.fillStyle = '#3a5060'; ctx.fillRect(0, 150, BD_W, BD_H - 150);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(200,220,235,0.3)'; ctx.fillRect(Math.round((hash2(1, i, 1) * BD_W + t * 10) % BD_W), 152 + Math.floor(hash2(1, i, 2) * 60), 6, 1); }
      // bridge arches
      ctx.fillStyle = '#6a6458';
      ctx.fillRect(40, 130, 300, 12);
      for (let i = 0; i < 3; i++) {
        const ax = 70 + i * 100;
        ctx.fillRect(ax - 8, 142, 16, 40);
      }
      ctx.fillStyle = '#4a463e'; ctx.fillRect(40, 126, 300, 4);
      fog(ctx, 160, 10, t, 0.15);
      particles(ctx, 'rain', t);
      return;
    }
    case 'abbey': {
      const night = v % 2 === 0;
      grad(ctx, night ? [[0, '#0e1226'], [0.7, '#3a3a5a'], [1, '#5a5060']] : [[0, '#6a7a98'], [0.7, '#c0b8b0'], [1, '#a8a090']]);
      if (night) { stars(ctx, 80, t, 90); ctx.fillStyle = '#f0f0e0'; ctx.beginPath(); ctx.arc(80, 36, 12, 0, Math.PI * 2); ctx.fill(); }
      ridge(ctx, 150, 30, 0.01, v + 10, night ? '#1a1a2a' : '#5a6050');
      // ruined nave silhouette
      const col = night ? '#14141e' : '#4a4642';
      ctx.fillStyle = col;
      ctx.fillRect(90, 80, 200, 100);
      archWindow(ctx, 120, 95, 22, 60, night ? '#3a3a5a' : '#c0b8b0');
      archWindow(ctx, 180, 90, 26, 70, night ? '#3a3a5a' : '#c0b8b0');
      archWindow(ctx, 246, 95, 22, 60, night ? '#3a3a5a' : '#c0b8b0');
      ctx.fillStyle = col;
      ctx.fillRect(170, 40, 46, 50);
      ctx.beginPath(); ctx.moveTo(165, 40); ctx.lineTo(193, 14); ctx.lineTo(221, 40); ctx.fill();
      // broken top edge
      ctx.fillStyle = night ? '#3a3a5a' : '#c0b8b0';
      for (let x = 90; x < 290; x += 6) if (hash2(v, x, 9) > 0.6) ctx.fillRect(x, 80, 6, 4 + Math.floor(hash2(v, x, 8) * 8));
      ctx.fillStyle = night ? '#0a0a12' : '#3a3a30'; ctx.fillRect(0, 180, BD_W, BD_H - 180);
      if (night) glow(ctx, 191, 120, 50, 'rgba(255,220,150,ALPHA)', 0.12 + 0.05 * Math.sin(t * 2));
      fog(ctx, 182, 12, t, 0.2);
      return;
    }
    case 'castle-hall': case 'tavern': case 'dungeon': {
      const tavern = kind === 'tavern', dungeon = kind === 'dungeon';
      if (tavern) {
        grad(ctx, [[0, '#2a1a10'], [1, '#4a301c']]);
        // timber beams + plaster
        ctx.fillStyle = '#6a5038'; ctx.fillRect(0, 30, BD_W, 120);
        ctx.fillStyle = '#2a1a10';
        for (let x = 0; x < BD_W; x += 48) ctx.fillRect(x, 30, 6, 120);
        ctx.fillRect(0, 26, BD_W, 8);
        ctx.fillStyle = '#3a2416'; ctx.fillRect(0, 150, BD_W, BD_H - 150);
        for (let x = 0; x < BD_W; x += 20) { ctx.fillStyle = '#2e1c10'; ctx.fillRect(x, 150, 1, BD_H - 150); }
        // tables & mugs
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#1e120a'; ctx.fillRect(40 + i * 120, 170, 70, 6); ctx.fillRect(48 + i * 120, 176, 4, 26); ctx.fillRect(100 + i * 120, 176, 4, 26); ctx.fillStyle = '#a8946a'; ctx.fillRect(60 + i * 120, 164, 5, 6); }
        // hearth
        ctx.fillStyle = '#4a4440'; ctx.fillRect(160, 90, 64, 60); ctx.fillStyle = '#140c08'; ctx.fillRect(172, 108, 40, 42);
        const fl = 0.7 + 0.3 * Math.sin(t * 8);
        flame(ctx, 192, 150, 22, t);
        glow(ctx, 192, 130, 150, 'rgba(255,160,70,ALPHA)', 0.35 * fl);
        particles(ctx, 'embers', t * 0.5);
        return;
      }
      grad(ctx, [[0, dungeon ? '#0a0a10' : '#1a1a24'], [1, dungeon ? '#16141a' : '#2a2630']]);
      stoneWall(ctx, 0, 160, dungeon ? '#24222a' : '#3a3640', dungeon ? '#16141a' : '#2a2630');
      // pillars
      for (let i = 0; i < 4; i++) {
        const x = 30 + i * 108;
        ctx.fillStyle = dungeon ? '#2e2c34' : '#4e4a54'; ctx.fillRect(x, 0, 22, 170);
        ctx.fillStyle = dungeon ? '#1a1820' : '#2e2a34'; ctx.fillRect(x + 16, 0, 6, 170);
      }
      if (!dungeon) {
        // banners
        for (let i = 0; i < 3; i++) {
          const x = 80 + i * 108;
          ctx.fillStyle = '#6a1a1a'; ctx.fillRect(x, 20, 26, 70);
          ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x + 13, 100); ctx.lineTo(x + 26, 90); ctx.fill();
          ctx.fillStyle = '#d8b45a'; ctx.fillRect(x + 10, 40, 6, 14); ctx.fillRect(x + 6, 44, 14, 4);
        }
        ctx.fillStyle = '#5a1414'; ctx.fillRect(150, 160, 84, BD_H - 160);
      }
      ctx.fillStyle = dungeon ? '#100e14' : '#24202a'; ctx.fillRect(0, 160, BD_W, BD_H - 160);
      if (!dungeon) { ctx.fillStyle = '#6a1a1a'; ctx.beginPath(); ctx.moveTo(170, 160); ctx.lineTo(214, 160); ctx.lineTo(260, BD_H); ctx.lineTo(124, BD_H); ctx.fill(); }
      // braziers / torches
      for (const x of [62, 322]) {
        const fl = 0.7 + 0.3 * Math.sin(t * 9 + x);
        ctx.fillStyle = '#3a3430'; ctx.fillRect(x - 2, 100, 4, 10);
        flame(ctx, x, 101, 9, t + x);
        glow(ctx, x, 96, 70, 'rgba(255,150,60,ALPHA)', 0.35 * fl);
      }
      if (dungeon) particles(ctx, 'dust', t);
      return;
    }
    case 'keep': {
      grad(ctx, [[0, '#4a5068'], [0.6, '#9a98a0'], [1, '#6a6458']]);
      ridge(ctx, 150, 20, 0.012, v + 11, '#5a5a5a');
      const wall = '#4a4640';
      ctx.fillStyle = wall; ctx.fillRect(40, 110, 300, 70);
      for (let x = 40; x < 340; x += 12) ctx.fillRect(x, 104, 7, 6);
      for (const x of [40, 170, 300]) { ctx.fillRect(x - 6, 70, 40, 110); for (let i = 0; i < 4; i++) ctx.fillRect(x - 6 + i * 11, 64, 7, 6); ctx.fillStyle = '#1a1814'; ctx.fillRect(x + 10, 90, 6, 10); ctx.fillStyle = wall; }
      ctx.fillStyle = '#1a1814'; archWindow(ctx, 176, 140, 28, 40, '#1a1814');
      // grey banners
      for (const x of [62, 192, 322]) { ctx.fillStyle = '#7a7a80'; ctx.fillRect(x, 40, 1, 30); const w = Math.sin(t * 2 + x) * 2; ctx.fillRect(x + 1, 40, 14 + w, 8); }
      ctx.fillStyle = '#3a3630'; ctx.fillRect(0, 180, BD_W, BD_H - 180);
      particles(ctx, 'ash', t);
      return;
    }
    case 'snow': {
      grad(ctx, [[0, '#7a8aa8'], [0.6, '#c8d4e0'], [1, '#f0f4f8']]);
      ridge(ctx, 120, 50, 0.01, v + 12, '#a8b4c4', 4);
      ridge(ctx, 150, 30, 0.015, v + 13, '#d8e0ea');
      for (let i = 0; i < 20; i++) pine(ctx, hash2(v, i, 1) * BD_W, 175 + hash2(v, i, 2) * 14, 40 + hash2(v, i, 3) * 30, '#2a3a40');
      ctx.fillStyle = '#eef2f6'; ctx.fillRect(0, 186, BD_W, BD_H - 186);
      particles(ctx, 'snow', t);
      return;
    }
  }
}

/** Mount an animated backdrop on a canvas element; returns a stop function. */
export function animateBackdrop(canvas: HTMLCanvasElement, getKind: () => BackdropKind, variant = 0): () => void {
  canvas.width = BD_W;
  canvas.height = BD_H;
  const ctx = canvas.getContext('2d')!;
  let stop = false;
  const start = performance.now();
  const frame = () => {
    if (stop) return;
    drawBackdrop(ctx, getKind(), (performance.now() - start) / 1000, variant);
    requestAnimationFrame(frame);
  };
  frame();
  return () => { stop = true; };
}
