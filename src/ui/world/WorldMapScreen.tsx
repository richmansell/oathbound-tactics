import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorldNode } from '../../content/schema';
import { regions } from '../../content/campaigns/main/world';
import { hash2 } from '../../engine/rng';
import { packData } from '../../game/campaignData';
import { MONEY } from '../../game/campaign';
import { music, sfx } from '../../game/sound';
import { mutate, useGame } from '../../game/state';
import { Icon } from '../common/Icon';
import { kmuToTileXY, tileToKmuXY } from '../../world/coords';
import './world.css';

const BIOME_COL: Record<string, string> = {
  farmland: '#b8b070', grassland: '#a8b868', forest: '#6a8a4a', hills: '#a8a070', mountains: '#8a8478', marsh: '#7a8a6a',
  coast: '#c8bc8a', snow: '#e4e4dc', desert: '#d0a86a', blight: '#8a8580', lake: '#7aa0b8',
};

/** Rivers/lakes (KMU) from the bible, for the map drawing. */
const RIVERS: [number, number][][] = [
  [[520, 150], [515, 300], [520, 410], [540, 430]],
  [[585, 470], [575, 560], [560, 640], [520, 695]],
  [[690, 640], [610, 655], [560, 685], [520, 695], [500, 700], [525, 775], [445, 785], [300, 870]],
];

export interface WorldMapProps {
  target?: string | null;
  unlocked: string[];
  onArrive: (node: string) => void;
  onParty: () => void;
  onMenu: () => void;
  objective?: string;
  /** Real-world overview image covering KMU 0..1023 (fast-travel map). */
  overview?: HTMLCanvasElement;
}

export function WorldMapScreen(props: WorldMapProps) {
  const g = useGame();
  const pack = packData(g.story.pack).pack;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ x: 520, y: 720, scale: 2.2 });
  const [hover, setHover] = useState<WorldNode | null>(null);
  const [travelling, setTravelling] = useState(false);
  const token = useRef<[number, number]>(tileToKmuXY(g.world.pos[0], g.world.pos[1]));
  const anim = useRef<{ path: [number, number][]; t: number; dest: string } | null>(null);
  const nodes = pack.world.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const unlocked = new Set(props.unlocked);

  useEffect(() => { music('world'); }, []);

  // Nearest node to the party.
  const here = nodes.reduce((best, n) => (dist(n.pos, token.current) < dist(best.pos, token.current) ? n : best), nodes[0]);

  useEffect(() => {
    const cv = cvRef.current!;
    let stop = false;
    const draw = () => {
      if (stop) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = performance.now() / 1000;
      // Advance travel animation
      const a = anim.current;
      if (a) {
        a.t += 1 / 60;
        const total = a.path.length - 1;
        const prog = Math.min(total, a.t * 1.6);
        const i = Math.floor(prog), f = prog - i;
        const p0 = a.path[i], p1 = a.path[Math.min(total, i + 1)];
        token.current = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
        setViewCentre(token.current);
        if (prog >= total) {
          anim.current = null;
          mutate((gg) => { gg.world.pos = kmuToTileXY([Math.round(token.current[0]), Math.round(token.current[1])]); if (!gg.world.visited.includes(a.dest)) gg.world.visited.push(a.dest); gg.world.time += 90; });
          setTravelling(false);
          props.onArrive(a.dest);
        }
      }
      renderMap(ctx, w, h, t);
      requestAnimationFrame(draw);
    };
    draw();
    return () => { stop = true; };
  });

  const viewRef = useRef(view);
  viewRef.current = view;
  function setViewCentre(p: [number, number]) {
    const v = viewRef.current;
    viewRef.current = { ...v, x: v.x + (p[0] - v.x) * 0.08, y: v.y + (p[1] - v.y) * 0.08 };
  }

  function toScreen(p: [number, number], w: number, h: number): [number, number] {
    const v = viewRef.current;
    return [(p[0] - v.x) * v.scale + w / 2, (p[1] - v.y) * v.scale + h / 2];
  }

  function renderMap(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const v = viewRef.current;
    // Sea / parchment
    ctx.fillStyle = '#4a6a80';
    ctx.fillRect(0, 0, w, h);
    if (props.overview) {
      const [ox0, oy0] = toScreen([0, 0], w, h);
      const [ox1, oy1] = toScreen([1024, 1024], w, h);
      ctx.imageSmoothingEnabled = v.scale < 2;
      ctx.drawImage(props.overview, ox0, oy0, ox1 - ox0, oy1 - oy0);
      ctx.fillStyle = 'rgba(40,30,10,0.12)';
      ctx.fillRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
    } else {
    // Kingdom land, coloured by region (smaller regions drawn last).
    const sorted = [...regions].sort((a, b) => area(b.box) - area(a.box));
    for (const r of sorted) {
      const [x0, y0] = toScreen([r.box[0], r.box[1]], w, h);
      const [x1, y1] = toScreen([r.box[2] + 1, r.box[3] + 1], w, h);
      ctx.fillStyle = BIOME_COL[r.biome] ?? '#a8a070';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // texture speckle
      const step = Math.max(6, 18 / v.scale * v.scale);
      for (let yy = Math.max(0, y0); yy < Math.min(h, y1); yy += step) for (let xx = Math.max(0, x0); xx < Math.min(w, x1); xx += step) {
        const n = hash2(r.id.length, Math.floor((xx - x0) / step), Math.floor((yy - y0) / step));
        if (n > 0.8) { ctx.fillStyle = r.biome === 'forest' || r.biome === 'mountains' ? 'rgba(40,50,30,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fillRect(xx, yy, 3, 3); }
      }
    }
    // West coast sea
    const [cx0] = toScreen([28, 0], w, h);
    ctx.fillStyle = '#4a6a80'; ctx.fillRect(0, 0, Math.max(0, cx0), h);
    // Old Mere
    const [mx, my] = toScreen([575, 425], w, h);
    ctx.fillStyle = '#6a92b0'; ctx.beginPath(); ctx.ellipse(mx, my, 70 * v.scale, 45 * v.scale, 0, 0, Math.PI * 2); ctx.fill();
    // Rivers
    ctx.strokeStyle = '#6a92b0'; ctx.lineWidth = Math.max(2, 3 * v.scale * 0.6); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of RIVERS) { ctx.beginPath(); r.forEach((p, i) => { const s = toScreen(p, w, h); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.stroke(); }
    }
    // Roads
    if (!props.overview) for (const e of pack.world.edges) {
      const a = byId.get(e.from), b = byId.get(e.to);
      if (!a || !b) continue;
      const open = unlocked.has(a.id) && unlocked.has(b.id);
      const sa = toScreen(a.pos, w, h), sb = toScreen(b.pos, w, h);
      ctx.strokeStyle = open ? 'rgba(90,60,30,0.9)' : 'rgba(90,60,30,0.25)';
      ctx.setLineDash(open ? [6, 4] : [2, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Nodes
    for (const n of nodes) {
      const [x, y] = toScreen(n.pos, w, h);
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
      const open = unlocked.has(n.id);
      const isTarget = props.target === n.id;
      ctx.save();
      ctx.globalAlpha = open ? 1 : 0.35;
      ctx.fillStyle = n.kind === 'town' ? '#e8d08a' : n.kind === 'castle' ? '#c8c8d8' : n.kind === 'battle' ? '#d87a5a' : '#a8c8a0';
      ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (n.kind === 'town' || n.kind === 'castle') ctx.rect(x - 7, y - 7, 14, 14);
      else if (n.kind === 'battle') { ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x - 8, y + 6); ctx.closePath(); }
      else ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (open || isTarget) {
        ctx.font = '600 13px Cinzel, serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,6,0.85)'; ctx.strokeText(n.name, x, y + 22);
        ctx.fillStyle = '#f6ecd0'; ctx.fillText(n.name, x, y + 22);
      }
      if (isTarget) {
        const b = Math.sin(t * 4) * 4;
        ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#3a2600';
        ctx.beginPath(); ctx.moveTo(x - 8, y - 26 + b); ctx.lineTo(x + 8, y - 26 + b); ctx.lineTo(x, y - 14 + b); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = `rgba(255,213,74,${0.4 + 0.3 * Math.sin(t * 4)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 13 + Math.sin(t * 4) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    // Party token
    const [px, py] = toScreen(token.current, w, h);
    ctx.fillStyle = '#5aa8ff'; ctx.strokeStyle = '#08142a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py - 4, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 14 - Math.abs(Math.sin(t * 3)) * 3, 2, 6);
  }

  function travelTo(dest: string) {
    if (travelling || !unlocked.has(dest)) return;
    if (dest === here.id && dist(here.pos, token.current) < 2) { props.onArrive(dest); return; }
    const path = routeBetween(here.id, dest);
    if (!path) { sfx('error'); return; }
    sfx('confirm');
    anim.current = { path: [token.current, ...path.map((id) => byId.get(id)!.pos as [number, number])], t: 0, dest };
    setTravelling(true);
  }

  function routeBetween(a: string, b: string): string[] | null {
    const adj = new Map<string, string[]>();
    for (const e of pack.world.edges) {
      if (!unlocked.has(e.from) || !unlocked.has(e.to)) continue;
      (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
      (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
    }
    const prev = new Map<string, string | null>([[a, null]]);
    const q = [a];
    while (q.length) {
      const c = q.shift()!;
      if (c === b) break;
      for (const n of adj.get(c) ?? []) if (!prev.has(n)) { prev.set(n, c); q.push(n); }
    }
    if (!prev.has(b)) return unlocked.has(b) ? [b] : null;
    const out: string[] = [];
    for (let c: string | null = b; c && c !== a; c = prev.get(c) ?? null) out.unshift(c);
    return out;
  }

  // Input: tap nodes, drag to pan, wheel/pinch to zoom.
  useEffect(() => {
    const cv = cvRef.current!;
    let down: { x: number; y: number; vx: number; vy: number } | null = null;
    let moved = false;
    const pick = (cx: number, cy: number): WorldNode | null => {
      const r = cv.getBoundingClientRect();
      const x = cx - r.left, y = cy - r.top;
      let best: WorldNode | null = null, bd = 22;
      for (const n of nodes) { const [sx, sy] = toScreen(n.pos, r.width, r.height); const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = n; } }
      return best;
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }; moved = false; cv.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!down) { setHover(pick(e.clientX, e.clientY)); return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (moved) viewRef.current = { ...viewRef.current, x: down.vx - dx / viewRef.current.scale, y: down.vy - dy / viewRef.current.scale };
    };
    const onUp = (e: PointerEvent) => {
      if (down && !moved) { const n = pick(e.clientX, e.clientY); if (n) { setHover(n); travelTo(n.id); } }
      down = null;
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const s = Math.max(0.6, Math.min(6, viewRef.current.scale * (e.deltaY < 0 ? 1.15 : 0.87))); viewRef.current = { ...viewRef.current, scale: s }; setView(viewRef.current); };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('wheel', onWheel, { passive: false });
    return () => { cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('wheel', onWheel); };
  });

  const info = hover ?? (props.target ? byId.get(props.target) : null) ?? here;
  const hours = Math.floor((g.world.time / 60) % 24);
  return (
    <div class="screen world-screen">
      <canvas ref={cvRef} class="fill world-canvas" />
      <div class="world-top">
        <div class="panel world-obj">
          <div class="label">Objective</div>
          <div>{props.objective ?? 'Explore the Lowmarch.'}</div>
        </div>
        <div class="spacer" />
        <div class="panel world-stats num"><span>Day {Math.floor(g.world.time / 1440) + 1} · {hours.toString().padStart(2, '0')}:00</span><span class="gold-text">{g.gil} {MONEY}</span></div>
        <button class="btn small" onClick={props.onParty}><Icon name="party" /></button>
        <button class="btn small" onClick={props.onMenu}><Icon name="menu" /></button>
      </div>
      {info && (
        <div class="panel world-info pop-in">
          <div class="title-font gold-text" style={{ fontSize: '18px' }}>{unlocked.has(info.id) ? info.name : '???'}</div>
          <div class="muted" style={{ fontSize: '13px' }}>{unlocked.has(info.id) ? info.blurb : 'Unknown lands.'}</div>
          {unlocked.has(info.id) && !travelling && <button class="btn primary small" style={{ marginTop: '8px' }} onClick={() => travelTo(info.id)}>{info.id === here.id && dist(here.pos, token.current) < 2 ? 'Enter' : 'Travel'}</button>}
          {travelling && <div class="muted">Travelling…</div>}
        </div>
      )}
      <div class="world-zoom">
        <button class="btn small" onClick={() => { viewRef.current = { ...viewRef.current, scale: Math.min(6, viewRef.current.scale * 1.25) }; setView(viewRef.current); }}><Icon name="plus" /></button>
        <button class="btn small" onClick={() => { viewRef.current = { ...viewRef.current, scale: Math.max(0.6, viewRef.current.scale / 1.25) }; setView(viewRef.current); }}><Icon name="minus" /></button>
      </div>
    </div>
  );
}

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function area(b: [number, number, number, number]): number {
  return (b[2] - b[0]) * (b[3] - b[1]);
}
