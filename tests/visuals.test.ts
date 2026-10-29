import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { ITEMS } from '../src/content/items';
import { JOBS } from '../src/content/jobs';

const catalog = JSON.parse(readFileSync(new URL('../public/assets/lpc/catalog.json', import.meta.url), 'utf8'));

describe('sprite visuals reference real catalogue items', () => {
  it('items', () => {
    for (const it of Object.values(ITEMS)) for (const l of it.visual ?? []) expect(catalog.items[l.key], `${it.id} → ${l.key}`).toBeDefined();
  });
  it('job outfits', () => {
    for (const j of Object.values(JOBS)) for (const l of [...(j.outfit.all ?? []), ...(j.outfit.male ?? []), ...(j.outfit.female ?? [])]) expect(catalog.items[l.key], `${j.id} → ${l.key}`).toBeDefined();
  });
});

describe('unit layer stacking', () => {
  it('applies dyes, hides hair under helmets, and substitutes robes for male bodies', async () => {
    const { setCatalog } = await import('../src/render/sprites/catalog');
    const { unitLayers } = await import('../src/render/unitSprites');
    const { createBuild } = await import('../src/engine/factory');
    setCatalog(catalog);
    const b = createBuild({ id: 't', name: 'T', appearance: { body: 'male', skin: 'light', hair: 'hair_plain', hairColor: 'blonde', dyes: { legs_pants: 'red' } }, job: 'wizard', level: 3, equipment: {} });
    const l = unitLayers(b);
    expect(l.layers.some((x) => x.key === 'torso_clothes_longsleeve')).toBe(true); // robe → longsleeve + skirt for male
    expect(l.layers.some((x) => x.key === 'torso_clothes_robe')).toBe(false);
    b.job = 'squire';
    b.equipment = { head: 'armet' };
    const l2 = unitLayers(b);
    expect(l2.layers.some((x) => x.key.startsWith('hair_'))).toBe(false);
    expect(l2.layers.find((x) => x.key === 'legs_pants')?.color).toBe('red');
  });
});
