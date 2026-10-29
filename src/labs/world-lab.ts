/**
 * World Lab (dev page: /world-lab.html, `npx vite --port 5176 --strictPort`).
 * Renders a window of the procedural overworld with the real isometric terrain/prop renderers,
 * jumps to set pieces, previews carved battlefields with their deploy tiles.
 */
import { BattleView } from '../render/scene';
import type { BattleMap, Tile } from '../engine/types';
import { PROP_BLOCKS, posKey } from '../engine/grid';
import { WorldGen } from '../world/gen';
import { MAIN_GEOGRAPHY } from '../world/geography';
import { kmuToTile, tileToKmu } from '../world/coords';
import { sampleOverview } from '../world/minimap';
import { carveBattlefield } from '../world/carve';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = $('host'), stage = $('stage');
const spSel = $<HTMLSelectElement>('sp'), sizeIn = $<HTMLInputElement>('size'), scaleSel = $<HTMLSelectElement>('scale');
const seedIn = $<HTMLInputElement>('seed'), kx = $<HTMLInputElement>('kx'), ky = $<HTMLInputElement>('ky');
const mini = $<HTMLCanvasElement>('mini'), info = $('info'), hover = $('hover');

let gen = new WorldGen(Number(seedIn.value), MAIN_GEOGRAPHY);
let center: [number, number] = [kmuToTile(500), kmuToTile(700)];
let view: BattleView | null = null;
let origin: [number, number] = [0, 0];

spSel.innerHTML = '<option value="">—</option>' + MAIN_GEOGRAPHY.setPieces.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

function layout(): void {
  const sc = Number(scaleSel.value);
  host.style.width = `${stage.clientWidth / sc}px`;
  host.style.height = `${stage.clientHeight / sc}px`;
  host.style.transform = `scale(${sc})`;
}

function buildMap(cx: number, cy: number, size: number): BattleMap {
  const x0 = cx - Math.floor(size / 2), y0 = cy - Math.floor(size / 2);
  origin = [x0, y0];
  const raw = [];
  let min = Infinity;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const t = gen.tile(x0 + x, y0 + y); raw.push(t); min = Math.min(min, t.h); }
  const tiles: Tile[] = raw.map((t) => {
    const o: Tile = { h: t.h - min, t: t.t };
    if (t.prop) { o.prop = t.prop; o.blocked = PROP_BLOCKS[t.prop] ?? true; }
    return o;
  });
  const r = gen.regionAt(cx, cy);
  return { id: 'lab', name: r.name, w: size, h: size, tiles, theme: r.biome === 'snow' ? 'snow' : r.biome === 'marsh' || r.biome === 'blight' ? 'overcast' : 'day' };
}

function show(map: BattleMap): void {
  layout();
  if (!view) view = new BattleView(host, map);
  else view.setMap(map);
  view.highlights.clear();
  view.resize();
  view.setZoom(1);
  view.centerOnMap(true);
  drawMini();
  const r = gen.regionAt(center[0], center[1]);
  const sp = gen.setPieceAt(center[0], center[1]);
  info.textContent = `tile ${center[0]}, ${center[1]}  (KMU ${tileToKmu(center[0]).toFixed(1)}, ${tileToKmu(center[1]).toFixed(1)})\n`
    + `region ${r.name}  danger ${r.danger}  biome ${r.biome}\n`
    + (sp ? `set piece ${sp.name}\n  locations: ${Object.keys(sp.locations).join(', ')}` : '');
}

function refresh(): void {
  const size = Math.max(15, Math.min(200, Number(sizeIn.value) || 64));
  show(buildMap(center[0], center[1], size));
}

function drawMini(): void {
  const step = 8, n = 266;
  const x0 = center[0] - (n / 2) * step, y0 = center[1] - (n / 2) * step;
  const px = sampleOverview(gen, x0, y0, n, n, step);
  const ctx = mini.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  const size = Number(sizeIn.value) / step;
  ctx.strokeStyle = '#ff40ff';
  ctx.strokeRect(n / 2 - size / 2, n / 2 - size / 2, size, size);
  mini.onclick = (e) => {
    const r = mini.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * n, my = ((e.clientY - r.top) / r.height) * n;
    center = [Math.round(x0 + mx * step), Math.round(y0 + my * step)];
    refresh();
  };
}

spSel.onchange = () => {
  const info = spSel.value ? gen.setPieceInfo(spSel.value) : undefined;
  if (!info) return;
  center = info.center;
  sizeIn.value = String(Math.min(200, Math.max(info.bounds.x1 - info.bounds.x0, info.bounds.y1 - info.bounds.y0) + 24));
  refresh();
};
$('go').onclick = () => { center = [kmuToTile(Number(kx.value)), kmuToTile(Number(ky.value))]; refresh(); };
$('regen').onclick = () => { gen = new WorldGen(Number(seedIn.value), MAIN_GEOGRAPHY); refresh(); };
$('rotl').onclick = () => view?.rotateBy(-1);
$('rotr').onclick = () => view?.rotateBy(1);
scaleSel.onchange = () => { layout(); view?.resize(); };
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pan]')) {
  b.onclick = () => {
    const d = Math.floor(Number(sizeIn.value) / 2);
    const k = b.dataset.pan!;
    center = [center[0] + (k === 'e' ? d : k === 'w' ? -d : 0), center[1] + (k === 's' ? d : k === 'n' ? -d : 0)];
    refresh();
  };
}
$('carve').onclick = () => {
  const res = carveBattlefield(gen, center[0], center[1], { approachDir: 's' });
  show(res.map);
  for (const p of res.playerTiles) view!.highlights.set(posKey(p), 'deploy');
  for (const p of res.enemyTiles) view!.highlights.set(posKey(p), 'attack');
  info.textContent += `\ncarved ${res.map.name}${res.repaired ? ' (repaired)' : ''}`;
};

// drag to pan, hover readout
let drag: [number, number] | null = null;
stage.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
window.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('pointermove', (e) => {
  const sc = Number(scaleSel.value);
  if (drag && view) { view.panBy((e.clientX - drag[0]) / sc, (e.clientY - drag[1]) / sc); drag = [e.clientX, e.clientY]; return; }
  if (!view) return;
  const r = stage.getBoundingClientRect();
  const p = view.pick((e.clientX - r.left) / sc, (e.clientY - r.top) / sc);
  if (!p) return;
  const t = gen.tile(origin[0] + p[0], origin[1] + p[1]);
  hover.textContent = `${p[0]},${p[1]}  h${t.h} ${t.t}${t.prop ? ' ' + t.prop : ''}${t.road ? ' road' : ''}${t.setPiece ? ' [' + t.setPiece + ']' : ''}  ${t.region}/${t.biome}`;
});
window.addEventListener('resize', () => { layout(); view?.resize(); });

const params = new URLSearchParams(location.search);
if (params.get('sp')) { spSel.value = params.get('sp')!; spSel.onchange!(new Event('change')); }
else refresh();
