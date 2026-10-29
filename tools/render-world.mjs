#!/usr/bin/env node
/**
 * Dev tool: renders the procedural overworld to PNGs.
 *   node tools/render-world.mjs [outDir] [--seed N] [--only overview,ch1,towns,sp:<id>] [--scale 6]
 * (a) overview.png    — whole kingdom (+margin) at 1 px per 4 tiles
 * (b) chapter1.png    — Lowmarch/Greyfen (KMU 380..720 × 580..860) at 1 px per tile
 * (c) sp_<id>.png     — top-down close-ups of set pieces with height shading
 * Loads the TypeScript sources through Vite's SSR loader (no build step).
 */
import { createServer } from 'vite';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outDir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'world-out';
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const seed = Number(opt('--seed', 1337));
const only = opt('--only', 'overview,ch1,towns').split(',');
const scale = Number(opt('--scale', 6));
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { WorldGen } = await server.ssrLoadModule('/src/world/gen.ts');
  const { MAIN_GEOGRAPHY } = await server.ssrLoadModule('/src/world/geography.ts');
  const { sampleOverview, shadeSample } = await server.ssrLoadModule('/src/world/minimap.ts');
  const { KINGDOM_ORIGIN, kmuToTile } = await server.ssrLoadModule('/src/world/coords.ts');
  const { PROPS, TERRAINS } = await server.ssrLoadModule('/src/world/tables.ts');
  const t0 = performance.now();
  const gen = new WorldGen(seed, MAIN_GEOGRAPHY, { maxChunks: 1024 });
  console.log(`init ${(performance.now() - t0).toFixed(0)} ms`);

  const save = (name, w, h, data) => {
    const png = new PNG({ width: w, height: h });
    png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const file = path.join(outDir, name);
    fs.writeFileSync(file, PNG.sync.write(png));
    console.log('wrote', file, `${w}×${h}`);
  };

  if (only.includes('overview')) {
    const m = 48; // KMU margin around the kingdom
    const n = 1024 + 2 * m;
    const t = performance.now();
    const rgba = sampleOverview(gen, KINGDOM_ORIGIN - m * 4, KINGDOM_ORIGIN - m * 4, n, n, 4);
    // node markers
    for (const node of MAIN_GEOGRAPHY.nodes) {
      const px = Math.round(node.pos[0] + m), py = Math.round(node.pos[1] + m);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const o = ((py + dy) * n + (px + dx)) * 4;
        rgba[o] = 230; rgba[o + 1] = 40; rgba[o + 2] = 40;
      }
    }
    console.log(`overview ${(performance.now() - t).toFixed(0)} ms`);
    save('overview.png', n, n, rgba);
  }

  if (only.includes('ch1') || only.includes('chapter1')) {
    const x0 = kmuToTile(380), y0 = kmuToTile(580), w = (720 - 380) * 4, h = (860 - 580) * 4;
    const t = performance.now();
    const rgba = sampleOverview(gen, x0, y0, w, h, 1);
    console.log(`chapter1 ${(performance.now() - t).toFixed(0)} ms (${((w * h) / 1024).toFixed(0)} chunks)`);
    save('chapter1.png', w, h, rgba);
  }

  // ---- arbitrary KMU rect: --rect name:x0,y0,x1,y1,step
  for (const o of only) {
    if (!o.startsWith('rect:')) continue;
    const [name, spec] = o.slice(5).split('@');
    const [x0, y0, x1, y1, step] = spec.split('/').map(Number);
    const w = Math.floor(((x1 - x0) * 4) / step), h = Math.floor(((y1 - y0) * 4) / step);
    save(`${name}.png`, w, h, sampleOverview(gen, kmuToTile(x0), kmuToTile(y0), w, h, step));
  }

  // ---- close-ups
  const closeup = (id, margin = 14) => {
    const info = gen.setPieceInfo(id);
    if (!info) { console.log('no set piece', id); return; }
    const { x0, y0, x1, y1 } = info.bounds;
    const X0 = x0 - margin, Y0 = y0 - margin, W = x1 - x0 + 2 * margin, H = y1 - y0 + 2 * margin;
    const S = scale;
    const img = new Uint8ClampedArray(W * S * H * S * 4);
    const tiles = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push(gen.tile(X0 + x, Y0 + y));
    const tc = TERRAINS.reduce((a, t, i) => ((a[t] = i), a), {});
    const pc = PROPS.reduce((a, p, i) => ((a[p] = i), a), {});
    const px = new Uint8ClampedArray(4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x];
      const hw = x > 0 ? tiles[y * W + x - 1].h : t.h, hn = y > 0 ? tiles[(y - 1) * W + x].h : t.h;
      shadeSample(tc[t.t], t.h, 0, (t.road ? 1 : 0) | (t.bridge ? 8 : 0), 0, hw, hn, 1, px, 0);
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const o = (((y * S + sy) * W * S) + x * S + sx) * 4;
        let k = 1;
        // walls: darken the south/east edge where the neighbour is much lower
        const hs = y + 1 < H ? tiles[(y + 1) * W + x].h : t.h, he = x + 1 < W ? tiles[y * W + x + 1].h : t.h;
        if (sy === S - 1 && t.h - hs >= 3) k = 0.55;
        if (sx === S - 1 && t.h - he >= 3) k = 0.65;
        if (sy === 0 && hn - t.h >= 3) k = 0.75;
        img[o] = px[0] * k; img[o + 1] = px[1] * k; img[o + 2] = px[2] * k; img[o + 3] = 255;
      }
      if (t.prop) {
        const col = t.prop === 'tree' || t.prop === 'bush' ? [30, 80, 30] : t.prop === 'pine' ? [20, 60, 40] : t.prop === 'deadtree' ? [70, 55, 40]
          : t.prop === 'lamppost' || t.prop === 'brazier' || t.prop === 'campfire' ? [250, 210, 80] : t.prop === 'banner' ? [200, 40, 40]
          : t.prop === 'well' || t.prop === 'standingstone' || t.prop === 'tombstone' ? [210, 210, 220] : t.prop === 'reeds' ? [120, 150, 60] : [60, 40, 30];
        const r = t.prop === 'tree' || t.prop === 'pine' ? S * 0.42 : S * 0.28;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          if (Math.hypot(sx - S / 2 + 0.5, sy - S / 2 + 0.5) > r) continue;
          const o = (((y * S + sy) * W * S) + x * S + sx) * 4;
          img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
        }
      }
    }
    // bounds outline
    for (let x = margin * S; x < (W - margin) * S; x++) for (const y of [margin * S, (H - margin) * S - 1]) { const o = (y * W * S + x) * 4; img[o] = 255; img[o + 1] = 0; img[o + 2] = 255; }
    for (let y = margin * S; y < (H - margin) * S; y++) for (const x of [margin * S, (W - margin) * S - 1]) { const o = (y * W * S + x) * 4; img[o] = 255; img[o + 1] = 0; img[o + 2] = 255; }
    save(`sp_${id}.png`, W * S, H * S, img);
    console.log(' ', id, 'base', info.base, 'locations', Object.keys(info.locations).join(','));
    void pc;
  };
  if (only.includes('towns')) for (const id of ['tallow_cross', 'millbrook', 'tenpenny', 'corvel_keep']) closeup(id);
  for (const o of only) if (o.startsWith('sp:')) closeup(o.slice(3));
} finally {
  await server.close();
}
