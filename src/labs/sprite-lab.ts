/**
 * Sprite Lab (dev page: /sprite-lab.html). Shows sample characters composed from LPC layers,
 * cycling every game animation in all four directions, plus a sheet inspector.
 */
import {
  type CharacterSheet,
  type Dir,
  type GameAnim,
  type SheetAnim,
  GAME_ANIMS,
  composeCharacter,
  defaultLayersForAppearance,
  frameAt,
  imageCacheStats,
  loadCatalog,
  planDuration,
  spriteMemoryStats,
} from '../render/sprites';
import { SAMPLE_CHARACTERS as SAMPLES, type SampleCharacter as Sample } from '../render/sprites/samples';

const DIRS: Dir[] = ['s', 'w', 'n', 'e'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const grid = $('grid');
const scaleSel = $<HTMLSelectElement>('scale');
const animSel = $<HTMLSelectElement>('anim');
const bgSel = $<HTMLSelectElement>('bg');
const anchorsBtn = $<HTMLButtonElement>('anchors');
const pauseBtn = $<HTMLButtonElement>('pause');
const stats = $('stats');
const inspect = $('inspect');

animSel.innerHTML = ['<option value="cycle">cycle all</option>', ...GAME_ANIMS.map((g) => `<option>${g}</option>`)].join('');

interface Card {
  sample: Sample;
  sheet: CharacterSheet;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  meta: HTMLElement;
  animIndex: number;
  start: number;
}

let scale = 2;
let showAnchors = false;
let paused = false;
let pausedAt = 0;
let selected: Card | null = null;
const cards: Card[] = [];
const CELL_W = 112, CELL_H = 124, FEET_Y = 96;

function sizeCanvas(c: Card): void {
  c.canvas.width = CELL_W * DIRS.length * scale;
  c.canvas.height = CELL_H * scale;
}

function currentGameAnim(c: Card): GameAnim {
  return animSel.value === 'cycle' ? GAME_ANIMS[c.animIndex % GAME_ANIMS.length] : (animSel.value as GameAnim);
}

function draw(now: number): void {
  const t = paused ? pausedAt : now;
  for (const c of cards) {
    const g = currentGameAnim(c);
    const plan = c.sheet.resolve(g);
    let elapsed = t - c.start;
    const dur = planDuration(plan);
    const shown = plan.loop ? Math.max(dur * 2, 1600) : dur + 700;
    if (!paused && animSel.value === 'cycle' && elapsed > shown) {
      c.animIndex++;
      c.start = t;
      elapsed = 0;
    }
    const p = c.sheet.resolve(currentGameAnim(c));
    const { frame } = frameAt(p, elapsed);
    const ctx = c.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
    DIRS.forEach((dir, i) => {
      const fx = (i * CELL_W + CELL_W / 2) * scale;
      const fy = FEET_Y * scale;
      c.sheet.drawFrame(ctx, p.anim, dir, frame, fx, fy, { scale });
      if (showAnchors) {
        ctx.strokeStyle = '#ff3b6b';
        ctx.beginPath();
        ctx.moveTo(fx - 6 * scale, fy + 0.5);
        ctx.lineTo(fx + 6 * scale, fy + 0.5);
        ctx.moveTo(fx + 0.5, fy - 6 * scale);
        ctx.lineTo(fx + 0.5, fy + 2 * scale);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.strokeRect(fx - 32 * scale + 0.5, fy - 62 * scale + 0.5, 64 * scale, 64 * scale);
      }
    });
    const missing = c.sheet.info(p.anim).missing;
    c.meta.textContent = `${p.gameAnim} → ${p.anim} [${p.frames.join(',')}] frame ${frame}${p.complete ? '' : ` · missing: ${missing.join(', ')}`}`;
  }
  const mem = spriteMemoryStats();
  const img = imageCacheStats();
  stats.textContent = `${mem.sheets} sheets · composed ${(mem.composedBytes / 1048576).toFixed(1)} MiB · layer cache ${img.entries} imgs ${(img.bytes / 1048576).toFixed(1)} MiB`;
  requestAnimationFrame(draw);
}

async function showInspector(c: Card): Promise<void> {
  selected?.el.classList.remove('sel');
  selected = c;
  c.el.classList.add('sel');
  const anims: SheetAnim[] = ['walk', 'idle', 'slash', 'thrust', 'spellcast', 'shoot', 'hurt', 'jump', 'emote', 'slash_oversize', 'slash_reverse_oversize', 'thrust_oversize', 'walk_128', 'slash_128', 'backslash_128', 'halfslash_128'];
  inspect.innerHTML = `<h3>${c.sample.name} — game animations</h3><div class="row"><select id="stripDir">${DIRS.map((d) => `<option>${d}</option>`).join('')}</select><span class="meta">every frame of every resolved game animation (feet on the red line)</span></div><canvas id="strips"></canvas>` +
    `<h3>${c.sample.name} — composed sheets</h3><div class="row"><select id="sheetAnim">${anims.map((a) => `<option>${a}</option>`).join('')}</select><span id="sheetInfo" class="meta"></span></div><div id="layers" class="meta"></div><canvas id="sheetCanvas"></canvas>`;
  const sel = $<HTMLSelectElement>('sheetAnim');
  const cv = $<HTMLCanvasElement>('sheetCanvas');
  $('layers').textContent = 'Layers: ' + c.sheet.refs.map((r) => `${r.key}${r.color ? `(${r.color}${r.color2 ? '/' + r.color2 : ''})` : ''}`).join(' · ') +
    (c.sheet.warnings.length ? `  ⚠ ${c.sheet.warnings.join('; ')}` : '');
  const render = async () => {
    const anim = sel.value as SheetAnim;
    const comp = await c.sheet.anim(anim);
    cv.width = comp.canvas.width;
    cv.height = comp.canvas.height;
    cv.style.width = `${comp.canvas.width * Math.min(scale, 2)}px`;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(comp.canvas as CanvasImageSource, 0, 0);
    ctx.strokeStyle = 'rgba(227,179,65,0.35)';
    for (let x = 0; x <= comp.canvas.width; x += comp.frameSize) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, comp.canvas.height); ctx.stroke(); }
    for (let y = 0; y <= comp.canvas.height; y += comp.frameSize) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(comp.canvas.width, y + 0.5); ctx.stroke(); }
    $('sheetInfo').textContent = `${comp.frames}×${comp.rows} frames of ${comp.frameSize}px · ${comp.complete ? 'complete' : 'missing ' + comp.missing.join(', ')}`;
  };
  sel.onchange = () => void render();
  const dirSel = $<HTMLSelectElement>('stripDir');
  const strips = async () => {
    const dir = dirSel.value as Dir;
    const plans = GAME_ANIMS.map((g) => c.sheet.resolve(g));
    await c.sheet.preload([...new Set(plans.map((p) => p.anim))]);
    const cellW = 160, cellH = 150, feet = 110, labelW = 150, s2 = 1;
    const cols = Math.max(...plans.map((p) => p.frames.length));
    const cv2 = $<HTMLCanvasElement>('strips');
    cv2.width = labelW + cols * cellW * s2;
    cv2.height = plans.length * cellH * s2;
    const ctx = cv2.getContext('2d')!;
    ctx.font = '12px system-ui';
    plans.forEach((p, r) => {
      ctx.fillStyle = p.complete ? '#e6e6ea' : '#f0883e';
      ctx.fillText(`${p.gameAnim} → ${p.anim}`, 6, r * cellH + 20);
      if (!p.complete) ctx.fillText(`missing ${c.sheet.info(p.anim).missing.join(', ')}`.slice(0, 24), 6, r * cellH + 36);
      ctx.strokeStyle = 'rgba(255,59,107,0.6)';
      ctx.beginPath();
      ctx.moveTo(labelW, r * cellH + feet + 0.5);
      ctx.lineTo(cv2.width, r * cellH + feet + 0.5);
      ctx.stroke();
      p.frames.forEach((f, i) => c.sheet.drawFrame(ctx, p.anim, dir, f, labelW + i * cellW + cellW / 2, r * cellH + feet, { scale: s2 }));
    });
  };
  dirSel.onchange = () => void strips();
  await strips();
  await render();
}

async function main(): Promise<void> {
  const catalog = await loadCatalog();
  (window as unknown as { spriteCatalog: unknown }).spriteCatalog = catalog;
  for (const sample of SAMPLES) {
    const layers = [...defaultLayersForAppearance(sample.appearance, { catalog }), ...sample.gear];
    const sheet = await composeCharacter({ body: sample.appearance.body, layers });
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<h2>${sample.name} <span>${sample.appearance.body} · ${sample.note}</span></h2>`;
    const canvas = document.createElement('canvas');
    const meta = document.createElement('div');
    meta.className = 'meta';
    el.append(canvas, meta);
    if (sheet.warnings.length) {
      const w = document.createElement('div');
      w.className = 'warn';
      w.textContent = '⚠ ' + sheet.warnings.join('; ');
      el.append(w);
    }
    const card: Card = { sample, sheet, el, canvas, meta, animIndex: 0, start: performance.now() };
    el.onclick = () => void showInspector(card);
    sizeCanvas(card);
    grid.append(el);
    cards.push(card);
    void sheet.preload([...new Set(GAME_ANIMS.map((g) => sheet.resolve(g).anim))]);
  }
  scaleSel.onchange = () => {
    scale = Number(scaleSel.value);
    cards.forEach(sizeCanvas);
  };
  animSel.onchange = () => cards.forEach((c) => (c.start = performance.now()));
  bgSel.onchange = () => (document.body.className = `bg-${bgSel.value}`);
  anchorsBtn.onclick = () => anchorsBtn.classList.toggle('on', (showAnchors = !showAnchors));
  pauseBtn.onclick = () => {
    const now = performance.now();
    if (paused) cards.forEach((c) => (c.start += now - pausedAt));
    else pausedAt = now;
    paused = !paused;
    pauseBtn.classList.toggle('on', paused);
  };
  (window as unknown as { spriteLab: unknown }).spriteLab = { cards, SAMPLES };
  requestAnimationFrame(draw);
}

void main().catch((e) => {
  grid.textContent = String(e?.stack ?? e);
  console.error(e);
});
