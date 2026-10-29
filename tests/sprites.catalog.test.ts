import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BodyType } from '../src/content/schema';
import { type Catalog, layerAnims, layerFile } from '../src/render/sprites/catalog';

const ROOT = path.resolve(__dirname, '..');
const LPC = path.join(ROOT, 'public/assets/lpc');
const catalog: Catalog = JSON.parse(fs.readFileSync(path.join(LPC, 'catalog.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/lpc-items.json'), 'utf8'));

function pngSize(file: string): { w: number; h: number } {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(24);
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function allPngs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? allPngs(p) : e.name.endsWith('.png') ? [p] : [];
  });
}

/** Every (item, layer, body, anim, variant) → file the catalogue references. */
function referencedFiles(): { key: string; body: BodyType; anim: string; file: string }[] {
  const out: { key: string; body: BodyType; anim: string; file: string }[] = [];
  for (const [key, item] of Object.entries(catalog.items)) {
    for (const layer of item.layers) {
      for (const body of Object.keys(layer.paths) as BodyType[]) {
        for (const anim of layerAnims(layer, body)) {
          for (const v of item.variants ?? [null]) {
            const f = layerFile(layer, body, anim, v);
            if (f) out.push({ key, body, anim, file: f });
          }
        }
      }
    }
  }
  return out;
}

describe('LPC catalogue', () => {
  it('contains every curated key exactly as named', () => {
    const curated: string[] = Object.values(config.groups as Record<string, string[]>).flat();
    expect(curated.length).toBeGreaterThan(200);
    const missing = curated.filter((k) => !catalog.items[k]);
    expect(missing).toEqual([]);
  });

  it('has the keys other modules rely on', () => {
    for (const k of ['body', 'torso_chainmail', 'weapon_sword_longsword', 'hat_helmet_armet', 'hair_ponytail', 'heads_human_male', 'heads_human_female', 'torso_armour_plate', 'shield_kite']) {
      expect(catalog.items[k], k).toBeTruthy();
    }
  });

  it('references only files that exist, with frame grids matching the animation geometry', () => {
    const refs = referencedFiles();
    expect(refs.length).toBeGreaterThan(3000);
    const problems: string[] = [];
    for (const r of refs) {
      const abs = path.join(LPC, r.file);
      if (!fs.existsSync(abs)) {
        problems.push(`missing ${r.file} (${r.key})`);
        continue;
      }
      const g = catalog.animations[r.anim as keyof typeof catalog.animations];
      const { w, h } = pngSize(abs);
      if (w % g.frameSize || h % g.frameSize) problems.push(`${r.file}: ${w}×${h} not divisible by ${g.frameSize}`);
      if (w !== g.frameSize * g.frames || h !== g.frameSize * g.rows) problems.push(`${r.file}: ${w}×${h} ≠ ${g.frames}×${g.rows} frames of ${g.frameSize}`);
    }
    expect(problems).toEqual([]);
  });

  it('ships no unreferenced PNGs', () => {
    const referenced = new Set(referencedFiles().map((r) => path.join(LPC, r.file)));
    const orphans = allPngs(LPC).filter((f) => !referenced.has(f));
    expect(orphans).toEqual([]);
  });

  it('has consistent animation geometry', () => {
    const std = { idle: 2, combat_idle: 2, walk: 9, slash: 6, backslash: 13, halfslash: 6, thrust: 8, spellcast: 7, shoot: 13, hurt: 6, jump: 5, emote: 3, sit: 3 };
    for (const [a, n] of Object.entries(std)) {
      const g = catalog.animations[a as keyof typeof std];
      expect(g, a).toMatchObject({ frameSize: 64, frames: n, rows: a === 'hurt' ? 1 : 4 });
    }
    for (const [name, g] of Object.entries(catalog.animations)) {
      if (!g.base) continue;
      expect(g.cells, name).toHaveLength(g.rows);
      for (const row of g.cells!) expect(row, name).toHaveLength(g.frames);
      expect(catalog.animations[g.base], `${name} base`).toBeTruthy();
      expect([128, 192]).toContain(g.frameSize);
    }
  });

  it('has valid palettes and recolour channels', () => {
    for (const mat of ['body', 'hair', 'cloth', 'metal', 'eye', 'wood', 'all']) {
      const m = catalog.palettes[mat];
      expect(m, mat).toBeTruthy();
      const [v, n] = m.base.split('.');
      expect(m.versions[v]?.[n], `${mat} base`).toBeTruthy();
    }
    for (const [key, item] of Object.entries(catalog.items)) {
      for (const ch of item.recolor ?? []) {
        expect(catalog.palettes[ch.material], `${key} material`).toBeTruthy();
        for (const token of ch.palettes) {
          const [m, v] = token.split('.');
          const pal = catalog.palettes[m]?.versions[v];
          expect(pal, `${key}: palette ${token}`).toBeTruthy();
          for (const colors of Object.values(pal)) expect(colors.length, `${key} ${token}`).toBe(ch.source.length);
        }
      }
      if (item.variants) {
        expect(item.variants.length, key).toBeLessThanOrEqual(config.variantCap + 6);
        if (item.recolorVariant) expect(item.variants).toContain(item.recolorVariant);
      }
      expect(item.bodies.length, key).toBeGreaterThan(0);
      for (const b of item.bodies) expect(catalog.bodyTypes).toContain(b);
    }
  });

  it('only uses licences that allow commercial use', () => {
    const ok = /^(CC0|CC-BY(-SA)? [34]\.0\+?|CC-BY|OGA-BY[- ][34]\.0\+?|OGA-SA 3\.0|GPL [23]\.0\+?)$/;
    for (const [key, item] of Object.entries(catalog.items)) {
      expect(item.licenses.length, key).toBeGreaterThan(0);
      for (const l of item.licenses) expect(l, `${key}: ${l}`).toMatch(ok);
    }
  });

  it('credits every shipped file', () => {
    const csv = fs.readFileSync(path.join(LPC, 'CREDITS.csv'), 'utf8');
    const credited = new Set(csv.split('\n').slice(1).filter(Boolean).map((l) => l.slice(1, l.indexOf('"', 1))));
    const uncredited = allPngs(LPC).map((f) => path.relative(LPC, f).split(path.sep).join('/')).filter((f) => !credited.has(f));
    expect(uncredited).toEqual([]);
    const md = fs.readFileSync(path.join(LPC, 'CREDITS.md'), 'utf8');
    for (const key of Object.keys(catalog.items)) expect(md, key).toContain(`\`${key}\``);
  });

  it('records a sane feet anchor', () => {
    expect(catalog.anchor.x).toBe(32);
    expect(catalog.anchor.y).toBeGreaterThanOrEqual(56);
    expect(catalog.anchor.y).toBeLessThanOrEqual(64);
  });
});
