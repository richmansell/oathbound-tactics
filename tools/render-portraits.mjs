#!/usr/bin/env node
/**
 * Renders a portrait contact sheet (samples × expressions) to PNG.
 *   node tools/render-portraits.mjs [outDir] [--scale 3] [--only 0,3,5]
 * Loads the TypeScript sources through Vite's SSR module loader (no build step).
 */
import { createServer } from 'vite';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--') && !/^\d/.test(a)) ?? 'portrait-out';
const scale = Number(args[args.indexOf('--scale') + 1]) || 2;
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const sizeArg = args.includes('--size') ? Number(args[args.indexOf('--size') + 1]) : null;

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { renderPortrait } = await server.ssrLoadModule('/src/portraits/index.ts');
  const { PORTRAIT_SAMPLES } = await server.ssrLoadModule('/src/portraits/samples.ts');
  const { EXPRESSIONS } = await server.ssrLoadModule('/src/content/schema.ts');
  let samples = PORTRAIT_SAMPLES;
  const exprArg = args.includes('--exprs') ? args[args.indexOf('--exprs') + 1].split(',') : null;
  const EXPRS = exprArg ?? EXPRESSIONS;
  if (onlyArg) samples = onlyArg.split(',').map((i) => PORTRAIT_SAMPLES[Number(i)]);
  // --catalog hair|beard|hat|outfit : one row per key (expressions across), for checking every mapping.
  const catalog = args.includes('--catalog') ? args[args.indexOf('--catalog') + 1] : null;
  if (catalog) {
    const { HAIR_MAP, BEARD_MAP } = await server.ssrLoadModule('/src/portraits/mapping.ts');
    const female = (k, i) => ({ body: i % 3 === 1 ? 'female' : i % 3 === 2 ? 'muscular' : 'male', skin: ['light', 'olive', 'brown', 'amber', 'taupe'][i % 5], hairColor: ['chestnut', 'blonde', 'black', 'redhead', 'gray', 'purple'][i % 6], eyes: 'green' });
    const keys = catalog === 'hair' ? Object.keys(HAIR_MAP) : catalog === 'beard' ? Object.keys(BEARD_MAP)
      : catalog === 'hat' ? ['hat_helmet_armet', 'hat_helmet_greathelm', 'hat_helmet_nasal', 'hat_helmet_horned', 'hat_helmet_kettle', 'hat_magic_wizard', 'hat_magic_celestial', 'hat_hood_cloth', 'hat_cap_leather', 'hat_cap_feather', 'hat_formal_tricorne', 'hat_bandana', 'hat_tiara', 'hat_crown']
      : ['torso_clothes_tunic', 'torso_clothes_robe', 'torso_armour_plate', 'torso_leather', 'torso_chainmail', 'torso_aprons_apron', 'torso_clothes_vest', 'torso_clothes_sleeveless', 'cape'];
    samples = keys.map((k, i) => {
      const ap = female(k, i);
      if (catalog === 'hair') ap.hair = k;
      else { ap.hair = 'hair_plain'; if (catalog === 'beard') { ap.body = 'male'; ap.beard = k; } }
      if (catalog === 'hat') { ap.hair = ['hair_long', 'hair_messy1', 'hair_bob'][i % 3]; ap.outfit = { hat: { key: k } }; }
      if (catalog === 'outfit') ap.outfit = k === 'cape' ? { torso: { key: 'torso_clothes_tunic' }, cape: { key: 'cape_solid', color: 'red' } } : { torso: { key: k } };
      return { name: k, appearance: ap };
    });
  }

  const cell = (sizeArg ?? 96) * scale;
  const pad = 4 * scale;
  const cells = samples.flatMap((smp) => EXPRS.map((ex) => [smp, ex]));
  const cols = args.includes('--cols') ? Number(args[args.indexOf('--cols') + 1]) : EXPRS.length;
  const rowsN = Math.ceil(cells.length / cols);
  const W = cols * (cell + pad) + pad;
  const H = rowsN * (cell + pad) + pad;
  const png = new PNG({ width: W, height: H });
  // Dialogue-box-like backdrop so outlines are judged against a realistic background.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const checker = ((x >> 4) + (y >> 4)) % 2 ? 6 : 0;
    png.data[i] = 40 + checker; png.data[i + 1] = 38 + checker; png.data[i + 2] = 52 + checker; png.data[i + 3] = 255;
  }
  const t0 = Date.now();
  cells.forEach(([s, ex], idx) => {
    const row = Math.floor(idx / cols), col = idx % cols;
    {
      const img = renderPortrait(s.appearance, ex, { size: cell, headgear: s.headgear, outfit: s.outfit });
      const ox = pad + col * (cell + pad), oy = pad + row * (cell + pad);
      // Frame background (parchment gradient like a dialogue portrait frame).
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const di = ((oy + y) * W + ox + x) * 4;
        const si = (y * cell + x) * 4;
        const a = img.data[si + 3] / 255;
        const bg = [74 - (y / cell) * 30, 66 - (y / cell) * 26, 84 - (y / cell) * 20];
        png.data[di] = img.data[si] * a + bg[0] * (1 - a);
        png.data[di + 1] = img.data[si + 1] * a + bg[1] * (1 - a);
        png.data[di + 2] = img.data[si + 2] * a + bg[2] * (1 - a);
        png.data[di + 3] = 255;
      }
    }
  });
  const ms = Date.now() - t0;
  fs.mkdirSync(outDir, { recursive: true });
  const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : `contact-${scale}x`;
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log(`wrote ${file} (${samples.length}×${EXPRS.length} portraits in ${ms} ms)`);
} finally {
  await server.close();
}
