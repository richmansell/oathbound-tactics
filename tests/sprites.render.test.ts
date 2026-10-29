import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { BodyType, LayerRef } from '../src/content/schema';
import { type Catalog, type SheetAnim, itemOwnAnims } from '../src/render/sprites/catalog';
import { planCharacter } from '../src/render/sprites/plan';
import { decodePng } from '../src/render/sprites/png';
import { defaultLayersForAppearance } from '../src/render/sprites/appearance';
import { LPC, colorSet, dump, frameOf, loadTestCatalog, opaqueBounds, renderAnim } from './sprites.harness';

let catalog: Catalog;
beforeAll(() => {
  catalog = loadTestCatalog();
});

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

describe('PNG decoder', () => {
  it('decodes the optimised sheets exactly like pngjs', async () => {
    const files = ['body/bodies/male/walk.png', 'weapon/sword/longsword/attack_slash/longsword.png', 'hair/plain/adult/slash.png', 'torso/armour/plate/male/hurt.png'];
    for (const f of files) {
      const buf = fs.readFileSync(path.join(LPC, f));
      const ours = await decodePng(new Uint8Array(buf));
      const ref = PNG.sync.read(buf);
      expect([ours.width, ours.height]).toEqual([ref.width, ref.height]);
      expect(Buffer.from(ours.data).equals(ref.data), f).toBe(true);
    }
  });
});

describe('composition', () => {
  it('keeps the feet anchor where the catalogue says (bottom of the body frame)', async () => {
    for (const body of ['male', 'female', 'muscular'] as BodyType[]) {
      const plan = planCharacter(catalog, { body, layers: [{ key: 'body' }] });
      const walk = await renderAnim(catalog, plan, 'walk');
      for (let row = 0; row < 4; row++) {
        const b = opaqueBounds(frameOf(walk, 64, 0, row));
        // Facing north the feet sit 1px higher (perspective); south/east/west touch the anchor line.
        expect(Math.abs(b.maxY + 1 - catalog.anchor.y), `${body} row ${row}`).toBeLessThanOrEqual(1);
        if (row === 2) expect(b.maxY + 1).toBe(catalog.anchor.y);
        expect(Math.abs((b.minX + b.maxX + 1) / 2 - catalog.anchor.x), `${body} row ${row} centre`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('recolours skin through every body-coloured layer (match_body_color)', async () => {
    const layers = defaultLayersForAppearance({ body: 'male', skin: 'bronze', hair: 'hair_plain', hairColor: 'raven', eyes: 'green' }, { catalog });
    const plan = planCharacter(catalog, { body: 'male', layers });
    expect(plan.warnings).toEqual([]);
    const img = frameOf(await renderAnim(catalog, plan, 'walk'), 64, 0, 2);
    const colors = colorSet(img);
    const light = catalog.palettes.body.versions.ulpc.light.slice(1).map((h) => parseInt(h.slice(1), 16));
    const bronze = catalog.palettes.body.versions.ulpc.bronze.map((h) => parseInt(h.slice(1), 16));
    for (const l of light) expect(colors.has(l), `light ${hex(l)} left over`).toBe(false);
    expect(bronze.filter((b) => colors.has(b)).length).toBeGreaterThanOrEqual(4);
    const green = catalog.palettes.eye.versions.ulpc.green.map((h) => parseInt(h.slice(1), 16));
    expect(green.some((g) => colors.has(g)), 'eye colour').toBe(true);
    dump('skin_bronze', img, 4);
  });

  it('centres the 64px body in oversize frames and draws the weapon', async () => {
    const layers: LayerRef[] = [
      { key: 'body', color: 'light' }, { key: 'heads_human_male', color: 'light' },
      { key: 'torso_armour_plate' }, { key: 'weapon_sword_longsword' },
    ];
    const plan = planCharacter(catalog, { body: 'male', layers });
    const sheet = await renderAnim(catalog, plan, 'slash_oversize');
    const bodyOnly = await renderAnim(catalog, planCharacter(catalog, { body: 'male', layers: layers.slice(0, 3) }), 'slash_oversize');
    const base = await renderAnim(catalog, planCharacter(catalog, { body: 'male', layers: layers.slice(0, 3) }), 'slash');
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const big = frameOf(bodyOnly, 192, col, row);
        const small = frameOf(base, 64, col, row);
        // Body pixels are the base slash frame offset by (64, 64).
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const a = small.data[(y * 64 + x) * 4 + 3];
          const b = big.data[((y + 64) * 192 + x + 64) * 4 + 3];
          if (a !== b) throw new Error(`row ${row} col ${col} (${x},${y}) misaligned`);
        }
      }
    }
    // The weapon adds pixels outside the body box in at least half the frames.
    let outside = 0;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      const b = opaqueBounds(frameOf(sheet, 192, col, row));
      if (b.minX < 64 || b.maxX >= 128 || b.minY < 64) outside++;
    }
    expect(outside).toBeGreaterThanOrEqual(12);
    dump('knight_slash_oversize', sheet, 2);
  });

  it('composes every curated item on a body without errors', async () => {
    const failures: string[] = [];
    for (const [key, item] of Object.entries(catalog.items)) {
      if (item.slot === 'body') continue;
      const body = item.bodies[0];
      const anims = [...itemOwnAnims(catalog, key, body)] as SheetAnim[];
      const anim = (anims.includes('walk') ? 'walk' : anims[0]) as SheetAnim;
      const plan = planCharacter(catalog, { body, layers: [{ key: 'body' }, { key }], companions: false });
      if (plan.warnings.length) failures.push(`${key}: ${plan.warnings.join('; ')}`);
      const withItem = await renderAnim(catalog, plan, anim);
      const bare = await renderAnim(catalog, planCharacter(catalog, { body, layers: [{ key: 'body' }] }), anim);
      if (Buffer.from(withItem.data).equals(Buffer.from(bare.data))) failures.push(`${key}: draws nothing in ${anim}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('recolours palette-converted file-variant items to match upstream files', async () => {
    // torso_aprons_overalls ships only "white"; "red" is produced by the cloth palette.
    const item = catalog.items['torso_aprons_overalls'];
    expect(item.recolorVariant).toBe('white');
    const plan = planCharacter(catalog, { body: 'male', layers: [{ key: 'torso_aprons_overalls', color: 'red' }] });
    expect(plan.warnings).toEqual([]);
    const img = await renderAnim(catalog, plan, 'walk');
    const red = new Set(catalog.palettes.cloth.versions.ulpc.red.map((h) => parseInt(h.slice(1), 16)));
    const colors = [...colorSet(img)];
    expect(colors.filter((c) => red.has(c)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('sample characters', () => {
  it('resolve without warnings and render every game animation', async () => {
    const { SAMPLE_CHARACTERS } = await import('../src/render/sprites/samples');
    const { GAME_ANIMS, resolveAnim } = await import('../src/render/sprites/anims');
    const { missingWeight, isUsable } = await import('../src/render/sprites/plan');
    const problems: string[] = [];
    for (const s of SAMPLE_CHARACTERS) {
      const layers = [...defaultLayersForAppearance(s.appearance, { catalog }), ...s.gear];
      const plan = planCharacter(catalog, { body: s.appearance.body, layers });
      if (plan.warnings.length) problems.push(`${s.name}: ${plan.warnings.join('; ')}`);
      const plans = GAME_ANIMS.map((g) => resolveAnim(g, plan.weaponKey, { catalog, body: plan.body, available: (a) => isUsable(plan, a), missingCount: (a) => missingWeight(plan, a) }));
      // Contact sheet: one row per game anim, plan frames facing south then east; feet at y=110.
      const cell = 160, rowH = 150, feet = 110;
      const cols = Math.max(...plans.map((p) => p.frames.length));
      const W = cell * cols * 2, H = rowH * plans.length;
      const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
      for (const [r, p] of plans.entries()) {
        const sheet = await renderAnim(catalog, plan, p.anim);
        const g = catalog.animations[p.anim];
        const off = (g.frameSize - 64) / 2;
        for (const [d, dirRow] of [2, 3].entries()) {
          for (const [i, f] of p.frames.entries()) {
            const fr = frameOf(sheet, g.frameSize, f, g.rows === 1 ? 0 : dirRow);
            const ox = d * cell * cols + i * cell + cell / 2 - (off + catalog.anchor.x);
            const oy = r * rowH + feet - (off + catalog.anchor.y);
            for (let y = 0; y < g.frameSize; y++) for (let x = 0; x < g.frameSize; x++) {
              const X = ox + x, Y = oy + y;
              if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
              const si = (y * g.frameSize + x) * 4, di = (Y * W + X) * 4;
              if (fr.data[si + 3]) out.data.set(fr.data.subarray(si, si + 4), di);
            }
          }
        }
        for (let x = 0; x < W; x++) { const di = ((r * rowH + feet) * W + x) * 4; if (!out.data[di + 3]) out.data.set([255, 59, 107, 120], di); }
      }
      dump(`sample_${s.name.toLowerCase()}`, out, 1);
    }
    expect(problems).toEqual([]);
  }, 60_000);
});

describe('weapon gallery (visual, only with SPRITE_DUMP)', () => {
  it.runIf(!!process.env.SPRITE_DUMP)('dumps each weapon attack facing every direction', async () => {
    const { resolveAnim } = await import('../src/render/sprites/anims');
    const weapons = Object.keys(catalog.items).filter((k) => catalog.items[k].slot === 'weapon');
    const cell = 192;
    const W = cell * 4 * 3, H = cell * weapons.length;
    const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
    for (const [i, key] of weapons.entries()) {
      const plan = planCharacter(catalog, { body: 'male', layers: [{ key: 'body' }, { key: 'heads_human_male' }, { key: 'legs_pants' }, { key }] });
      const p = resolveAnim('attack', key, { catalog });
      const sheet = await renderAnim(catalog, plan, p.anim);
      const g = catalog.animations[p.anim];
      const picks = [p.frames[0], p.frames[p.impact ?? 0], p.frames[p.frames.length - 1]];
      for (let dir = 0; dir < 4; dir++) for (const [j, f] of picks.entries()) {
        const fr = frameOf(sheet, g.frameSize, f, g.rows === 1 ? 0 : dir);
        const ox = (dir * 3 + j) * cell + (cell - g.frameSize) / 2, oy = i * cell + (cell - g.frameSize) / 2;
        for (let y = 0; y < g.frameSize; y++) for (let x = 0; x < g.frameSize; x++) {
          const si = (y * g.frameSize + x) * 4;
          if (fr.data[si + 3]) out.data.set(fr.data.subarray(si, si + 4), ((oy + y) * W + ox + x) * 4);
        }
      }
    }
    dump('weapon_gallery', out, 1);
  }, 60_000);
});
