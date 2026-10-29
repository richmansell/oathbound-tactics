import { useEffect, useRef, useState } from 'preact/hooks';
import { regions } from '../../content/campaigns/main/world';
import type { Pos, UnitBuild } from '../../engine/types';
import { packData } from '../../game/campaignData';
import { MONEY } from '../../game/campaign';
import {
  chunkSpawns, epoch, findPath, makeEncounter, makeRoamer, stepRoamer, walkable,
  type CarveFn, type Encounter, type Roamer, type WorldGenLike,
} from '../../game/overworld';
import { music, sfx } from '../../game/sound';
import { getGame, mutate, useGame } from '../../game/state';
import { spriteForBuild } from '../../render/unitSprites';
import { WorldView, type WorldActor } from '../../render/worldView';
import { Icon } from '../common/Icon';
import './world.css';

export interface WorldScreenProps {
  gen: WorldGenLike;
  carve: CarveFn;
  /** Map a set-piece id to a world node id (story/towns). */
  nodeForSetPiece: (id: string) => string | null;
  /** Node → world tile centre. */
  nodeTile: (id: string) => Pos;
  target?: string | null;
  objective?: string;
  onArrive: (node: string) => void;
  onEncounter: (e: Encounter) => void;
  onParty: () => void;
  onMenu: () => void;
  onMap: () => void;
}

const MINI = 72;

export function WorldScreen(props: WorldScreenProps) {
  const g = useGame();
  const hostRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [compass, setCompass] = useState<{ angle: number; dist: number } | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => { music('world'); }, []);

  useEffect(() => {
    const host = hostRef.current!;
    const gen = props.gen;
    const view = new WorldView(host, gen);
    viewRef.current = view;
    const gs = getGame();
    view.time = gs.world.time;
    const leader: UnitBuild | undefined = gs.roster.find((u) => u.id === gs.party[0]) ?? gs.roster[0];
    const followers = gs.party.slice(1, 3).map((id) => gs.roster.find((u) => u.id === id)).filter(Boolean) as UnitBuild[];
    let pos: [number, number] = [gs.world.pos[0], gs.world.pos[1]];
    // Make sure we start on walkable ground.
    if (!walkable(gen.tile(pos[0], pos[1]))) {
      outer: for (let r = 1; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (walkable(gen.tile(pos[0] + dx, pos[1] + dy))) { pos = [pos[0] + dx, pos[1] + dy]; break outer; }
      }
    }
    const trail: [number, number][] = [pos, pos, pos, pos, pos, pos];
    const party: WorldActor = { id: 'party', x: pos[0], y: pos[1], z: gen.tile(pos[0], pos[1]).h, facing: gs.world.facing, anim: 'idle', animStart: performance.now(), sprite: leader ? spriteForBuild(leader) : null, kind: 'party' };
    view.actors.set('party', party);
    followers.forEach((b, i) => view.actors.set(`f${i}`, { id: `f${i}`, x: pos[0], y: pos[1], z: party.z, facing: party.facing, anim: 'idle', animStart: performance.now(), sprite: spriteForBuild(b), kind: 'follower' }));
    view.follow(pos[0], pos[1], party.z, true);

    let path: Pos[] = [];
    let stepT = 0;
    let lastSet: string | null = gen.tile(pos[0], pos[1]).setPiece ?? null;
    let grace = 2.5;
    const roamers = new Map<string, Roamer>();
    let lastChunk = '';
    let encountered = false;
    const keys = new Set<string>();

    const refreshRoamers = () => {
      const cx = Math.floor(pos[0] / 32), cy = Math.floor(pos[1] / 32);
      const ck = `${cx},${cy}`;
      if (ck === lastChunk) return;
      lastChunk = ck;
      const want = new Set<string>();
      const ep = epoch(getGame().world.time);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        for (const sp of chunkSpawns(gen, getGame().world.seed, cx + dx, cy + dy)) {
          if ((getGame().world.cleared[sp.key] ?? -1) >= ep) continue;
          want.add(sp.key);
          if (!roamers.has(sp.key)) {
            const r = makeRoamer(gen, getGame(), sp);
            roamers.set(sp.key, r);
            const tmpl = r.templates[0];
            const looks = packData('main').enemies[tmpl];
            view.actors.set(`r:${sp.key}`, { id: `r:${sp.key}`, x: r.x, y: r.y, z: gen.tile(r.x, r.y).h, facing: 's', anim: 'walk', animStart: performance.now(), sprite: looks ? spriteForBuild({ id: tmpl, name: looks.name, appearance: looks.appearance, job: looks.job, level: 1, exp: 0, raw: { hp: 1, mp: 1, sp: 1, pa: 1, ma: 1 }, brave: 50, faith: 50, jobs: {}, equipment: {} }) : null, kind: 'enemy' });
          }
        }
      }
      for (const k of [...roamers.keys()]) if (!want.has(k)) { roamers.delete(k); view.actors.delete(`r:${k}`); }
      // Discovery
      mutate((gg) => { if (!gg.world.discovered.includes(ck)) gg.world.discovered.push(ck); });
    };

    const arriveCheck = () => {
      const t = gen.tile(pos[0], pos[1]);
      const sp = t.setPiece ?? null;
      if (sp !== lastSet) {
        lastSet = sp;
        if (sp) {
          const node = props.nodeForSetPiece(sp);
          if (node) {
            const n = packData(getGame().story.pack).pack.world.nodes.find((x) => x.id === node);
            if (n) { setPlaceName(n.name); setTimeout(() => setPlaceName(null), 2500); }
            path = [];
            party.anim = 'idle';
            props.onArrive(node);
          }
        }
      }
      // Region banner
      const reg = regions.filter((r) => t.region === r.id)[0];
      const name = reg?.name ?? (t.region ? t.region.replace(/_/g, ' ') : null);
      if (name && name !== regionRef.current) { regionRef.current = name; setRegion(name); setBanner(name); setTimeout(() => setBanner(null), 2600); }
    };
    const regionRef = { current: null as string | null };
    arriveCheck();
    refreshRoamers();

    view.onFrame = (dt) => {
      if (encountered) return;
      grace = Math.max(0, grace - dt);
      // Keyboard steering
      if (!path.length && keys.size) {
        const d: [number, number] = keys.has('w') ? [0, -1] : keys.has('s') ? [0, 1] : keys.has('a') ? [-1, 0] : keys.has('d') ? [1, 0] : [0, 0];
        // Screen-relative: rotate by camera.
        const rot = view.cam.rot;
        const rd: [number, number] = rot === 0 ? d : rot === 1 ? [d[1], -d[0]] : rot === 2 ? [-d[0], -d[1]] : [-d[1], d[0]];
        const nx = pos[0] + rd[0], ny = pos[1] + rd[1];
        const nt = gen.tile(nx, ny);
        if (walkable(nt) && Math.abs(nt.h - gen.tile(pos[0], pos[1]).h) <= 4) path = [[nx, ny]];
      }
      // Walk the path
      if (path.length) {
        const next = path[0];
        const nt = gen.tile(next[0], next[1]);
        const speed = nt.road ? 5.2 : nt.t === 'water' || nt.t === 'swamp' ? 2.6 : 4.2;
        stepT += dt * speed;
        if (party.anim !== 'walk') { party.anim = 'walk'; party.animStart = performance.now(); }
        party.facing = next[0] > pos[0] ? 'e' : next[0] < pos[0] ? 'w' : next[1] > pos[1] ? 's' : 'n';
        const k = Math.min(1, stepT);
        party.x = pos[0] + (next[0] - pos[0]) * k;
        party.y = pos[1] + (next[1] - pos[1]) * k;
        party.z = gen.tile(pos[0], pos[1]).h + (nt.h - gen.tile(pos[0], pos[1]).h) * k;
        if (stepT >= 1) {
          stepT = 0;
          trail.unshift([pos[0], pos[1]]);
          trail.length = 6;
          pos = [next[0], next[1]];
          path.shift();
          view.pathPreview = path.slice(0, 40);
          mutate((gg) => { gg.world.pos = [pos[0], pos[1]]; gg.world.facing = party.facing; gg.world.time += 1; gg.world.steps++; });
          view.time = getGame().world.time;
          refreshRoamers();
          arriveCheck();
          if (!path.length) { party.anim = 'idle'; party.animStart = performance.now(); view.marker = null; }
        }
      }
      // Followers trail the leader.
      followers.forEach((_, i) => {
        const a = view.actors.get(`f${i}`)!;
        const tp = trail[(i + 1) * 2 - 1] ?? trail[trail.length - 1];
        const ddx = tp[0] - a.x, ddy = tp[1] - a.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist > 0.05) {
          const s = Math.min(dist, dt * 4.6);
          a.x += (ddx / dist) * s; a.y += (ddy / dist) * s;
          a.facing = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'e' : 'w') : (ddy > 0 ? 's' : 'n');
          if (a.anim !== 'walk') { a.anim = 'walk'; a.animStart = performance.now(); }
        } else if (a.anim !== 'idle') { a.anim = 'idle'; a.animStart = performance.now(); }
        a.z = gen.tile(Math.round(a.x), Math.round(a.y)).h;
      });
      view.follow(party.x, party.y, party.z);
      // Roamers
      const night = ((getGame().world.time / 60) % 24) >= 20 || ((getGame().world.time / 60) % 24) < 5;
      for (const r of roamers.values()) {
        const contact = stepRoamer(gen, r, [party.x, party.y], dt, night);
        const a = view.actors.get(`r:${r.key}`);
        if (a) {
          const ddx = r.x - a.x, ddy = r.y - a.y;
          if (Math.abs(ddx) + Math.abs(ddy) > 0.001) a.facing = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'e' : 'w') : (ddy > 0 ? 's' : 'n');
          a.x = r.x; a.y = r.y; a.z = gen.tile(Math.round(r.x), Math.round(r.y)).h; a.alert = r.chasing;
          a.label = r.chasing ? `Lv ${r.level}` : undefined;
        }
        if (contact && grace <= 0 && !encountered) {
          encountered = true;
          sfx('turn_start');
          const enc = makeEncounter(gen, props.carve, getGame(), r, pos);
          setTimeout(() => props.onEncounter(enc), 250);
          return;
        }
      }
      // Compass to the story target
      if (props.target) {
        const tt = props.nodeTile(props.target);
        const ddx = tt[0] - party.x, ddy = tt[1] - party.y;
        const sxv = (ddx - ddy), syv = (ddx + ddy) * 0.5;
        const rot = view.cam.rot;
        const ang = Math.atan2(syv, sxv) - (rot * Math.PI) / 2;
        setCompassThrottled({ angle: ang, dist: Math.round(Math.hypot(ddx, ddy)) });
      }
      drawMini();
    };

    let lastCompass = 0;
    const setCompassThrottled = (c: { angle: number; dist: number }) => {
      const now = performance.now();
      if (now - lastCompass > 200) { lastCompass = now; setCompass(c); }
    };

    let lastMini = 0;
    const drawMini = () => {
      const now = performance.now();
      if (now - lastMini < 500 || !miniRef.current) return;
      lastMini = now;
      const cv = miniRef.current;
      cv.width = MINI; cv.height = MINI;
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(MINI, MINI);
      const step = 3;
      for (let y = 0; y < MINI; y++) for (let x = 0; x < MINI; x++) {
        const wx = pos[0] + (x - MINI / 2) * step, wy = pos[1] + (y - MINI / 2) * step;
        const t = gen.tile(wx, wy);
        const c = miniColor(t.t, t.h, !!t.road, !!t.setPiece);
        const i = (y * MINI + x) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      for (const r of roamers.values()) {
        const mx = MINI / 2 + (r.x - pos[0]) / step, my = MINI / 2 + (r.y - pos[1]) / step;
        ctx.fillStyle = r.chasing ? '#ff4030' : '#c06050';
        ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 2, 2);
      }
      if (props.target) {
        const tt = props.nodeTile(props.target);
        const mx = MINI / 2 + (tt[0] - pos[0]) / step, my = MINI / 2 + (tt[1] - pos[1]) / step;
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(Math.max(1, Math.min(MINI - 3, Math.round(mx) - 1)), Math.max(1, Math.min(MINI - 3, Math.round(my) - 1)), 3, 3);
      }
      ctx.fillStyle = '#5aa8ff'; ctx.fillRect(MINI / 2 - 1, MINI / 2 - 1, 3, 3);
    };

    // Input: tap/click to walk, drag to pan is not needed (camera follows).
    const el = view.canvas;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down = null; return; }
      down = null;
      const r = el.getBoundingClientRect();
      const tile = view.pick(e.clientX - r.left, e.clientY - r.top);
      if (!tile) return;
      const p = findPath(gen, pos, tile, 6000);
      if (p && p.length) { path = p; view.pathPreview = p.slice(0, 40); view.marker = tile; sfx('cursor'); }
      else sfx('error');
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); view.setZoom(view.cam.zoom + (e.deltaY < 0 ? 0.5 : -0.5)); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const map: Record<string, string> = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', w: 'w', a: 'a', s: 's', d: 'd' };
      if (map[k]) { keys.add(map[k]); e.preventDefault(); }
      if (k === 'q') view.rotateBy(-1);
      if (k === 'e') view.rotateBy(1);
      if (k === 'm') props.onMap();
    };
    const ku = (e: KeyboardEvent) => { const map: Record<string, string> = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', w: 'w', a: 'a', s: 's', d: 'd' }; const m = map[e.key.toLowerCase()]; if (m) keys.delete(m); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    if (import.meta.env.DEV) {
      (window as unknown as { __world: object }).__world = {
        pos: () => pos,
        walkTo: (x: number, y: number) => { const p = findPath(gen, pos, [x, y], 20000); if (p) { path = p; view.pathPreview = p.slice(0, 40); } return p?.length ?? -1; },
        walkToTarget: () => { if (!props.target) return -1; const t = props.nodeTile(props.target); const p = findPath(gen, pos, t, 40000); if (p) path = p; return p?.length ?? -1; },
        roamers: () => [...roamers.values()].map((r) => ({ key: r.key, x: r.x, y: r.y, level: r.level })),
        teleport: (x: number, y: number) => { pos = [x, y]; party.x = x; party.y = y; party.z = gen.tile(x, y).h; path = []; lastChunk = ''; refreshRoamers(); arriveCheck(); },
      };
    }
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', onResize);
      view.destroy();
    };
  }, []);

  const hours = Math.floor((g.world.time / 60) % 24);
  const mins = Math.floor(g.world.time % 60);
  return (
    <div class="screen world-screen free">
      <div ref={hostRef} class="fill" />
      {banner && <div class="region-banner title-font pop-in">{banner}</div>}
      {placeName && <div class="place-banner title-font pop-in">{placeName}</div>}
      <div class="world-top">
        <div class="panel world-obj">
          <div class="label">Objective</div>
          <div>{props.objective ?? 'Explore.'}</div>
          {compass && props.target && <div class="compass num"><svg class="compass-arrow" width="16" height="16" viewBox="0 0 16 16" style={{ transform: `rotate(${compass.angle}rad)` }}><path d="M2 5 L14 8 L2 11 L5 8 Z" fill="currentColor" /></svg> {compass.dist} paces</div>}
        </div>
        <div class="spacer" />
        <div class="panel world-stats num"><span>Day {Math.floor(g.world.time / 1440) + 1} · {hours.toString().padStart(2, '0')}:{mins.toString().padStart(2, '0')}</span><span class="gold-text">{g.gil} {MONEY}</span></div>
        <div class="panel minimap"><canvas ref={miniRef} style={{ width: `${MINI * 1.5}px`, height: `${MINI * 1.5}px`, imageRendering: 'pixelated', display: 'block' }} />{region && <div class="mini-label">{region}</div>}</div>
      </div>
      <div class="world-buttons">
        <button class="btn small" title="Rotate (Q)" onClick={() => viewRef.current?.rotateBy(-1)}><Icon name="rotl" /></button>
        <button class="btn small" title="Rotate (E)" onClick={() => viewRef.current?.rotateBy(1)}><Icon name="rotr" /></button>
        <button class="btn small" title="Zoom" onClick={() => { const v = viewRef.current; if (v) v.setZoom(v.cam.zoom >= 3 ? 1.5 : v.cam.zoom + 0.5); }}><Icon name="plus" /></button>
        <button class="btn small" title="Map (M)" onClick={props.onMap}><Icon name="map" /></button>
        <button class="btn small" title="Company" onClick={props.onParty}><Icon name="party" /></button>
        <button class="btn small" title="Menu" onClick={props.onMenu}><Icon name="menu" /></button>
      </div>
    </div>
  );
}

function miniColor(t: string, h: number, road: boolean, setPiece: boolean): [number, number, number] {
  if (setPiece) return [220, 200, 150];
  if (road) return [190, 160, 110];
  const base: Record<string, [number, number, number]> = {
    grass: [86, 140, 64], tallgrass: [104, 150, 60], dirt: [140, 110, 72], road: [170, 160, 140], stone: [130, 130, 136], brick: [160, 150, 130],
    sand: [210, 190, 130], water: [70, 120, 180], deepwater: [40, 80, 140], wood: [140, 100, 60], snow: [230, 236, 242], swamp: [80, 96, 64],
    roof: [150, 70, 55], thatch: [170, 140, 80], slate: [80, 90, 105], cave: [80, 72, 66], lava: [220, 90, 30], ash: [120, 116, 110],
  };
  const c = base[t] ?? [100, 100, 100];
  const k = 0.75 + Math.min(0.5, h / 40);
  return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
}
