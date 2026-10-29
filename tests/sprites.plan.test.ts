import { beforeAll, describe, expect, it } from 'vitest';
import type { LayerRef } from '../src/content/schema';
import { type Catalog, itemColorChoices } from '../src/render/sprites/catalog';
import { isUsable, missingWeight, planCharacter, resolveColors } from '../src/render/sprites/plan';
import { resolvePaletteColor } from '../src/render/sprites/palette';
import { GAME_ANIMS, frameAt, resolveAnim } from '../src/render/sprites/anims';
import { defaultLayersForAppearance } from '../src/render/sprites/appearance';
import { loadTestCatalog } from './sprites.harness';

let catalog: Catalog;
beforeAll(() => {
  catalog = loadTestCatalog();
});

const knight: LayerRef[] = [
  { key: 'body', color: 'light' }, { key: 'heads_human_male', color: 'light' }, { key: 'legs_armour' },
  { key: 'feet_armour' }, { key: 'torso_chainmail' }, { key: 'torso_armour_plate' }, { key: 'arms_armour' },
  { key: 'hat_helmet_armet' }, { key: 'weapon_sword_longsword' }, { key: 'shield_heater_revised_trim' },
];

function sheetResolve(layers: LayerRef[], body: 'male' | 'female' = 'male') {
  const plan = planCharacter(catalog, { body, layers });
  return {
    plan,
    resolve: (g: (typeof GAME_ANIMS)[number]) =>
      resolveAnim(g, plan.weaponKey, {
        catalog,
        body,
        available: (a) => isUsable(plan, a),
        missingCount: (a) => missingWeight(plan, a),
      }),
  };
}

describe('palette resolution', () => {
  it('accepts bare, versioned and cross-material colour keys', () => {
    const skin = catalog.items['body'].recolor![0];
    expect(resolvePaletteColor(catalog, skin, 'bronze')).toEqual(catalog.palettes.body.versions.ulpc.bronze);
    expect(resolvePaletteColor(catalog, skin, 'lpcr.coffee')).toEqual(catalog.palettes.body.versions.lpcr.coffee);
    expect(resolvePaletteColor(catalog, skin, 'all.lpcr.aegean')).toEqual(catalog.palettes.all.versions.lpcr.aegean);
    expect(resolvePaletteColor(catalog, skin, 'nope')).toBeNull();
    const eyes = catalog.items['heads_human_male'].recolor![1];
    expect(eyes.material).toBe('eye');
    expect(resolvePaletteColor(catalog, eyes, 'green')).toEqual(catalog.palettes.eye.versions.ulpc.green);
  });

  it('prefers exact file variants, then palette swaps of the base variant', () => {
    const tunic = catalog.items['torso_clothes_tunic'];
    expect(resolveColors(catalog, tunic, 'torso_clothes_tunic', 'forest', undefined).variant).toBe('forest');
    const navy = resolveColors(catalog, tunic, 'torso_clothes_tunic', 'navy', undefined);
    expect(navy.variant).toBe('white');
    expect(navy.mappings).toHaveLength(1);
    const kite = catalog.items['shield_kite'];
    const warnings: string[] = [];
    expect(resolveColors(catalog, kite, 'shield_kite', 'purple', undefined, warnings).variant).toBe(kite.variants![0]);
    expect(warnings.length).toBe(1);
  });

  it('lists colour choices for UI', () => {
    expect(itemColorChoices(catalog, 'hair_plain')).toContain('chestnut');
    expect(itemColorChoices(catalog, 'torso_clothes_tunic')).toEqual(expect.arrayContaining(['forest', 'navy', 'all.lpcr.navy']));
    expect(itemColorChoices(catalog, 'heads_human_male', 1)).toContain('green');
  });
});

describe('planning', () => {
  it('sorts layers by z and drops unsupported items with a warning', () => {
    const plan = planCharacter(catalog, { body: 'muscular', layers: [...knight, { key: 'nope' }] });
    for (let i = 1; i < plan.layers.length; i++) expect(plan.layers[i].z).toBeGreaterThanOrEqual(plan.layers[i - 1].z);
    expect(plan.warnings.some((w) => w.includes('"nope"'))).toBe(true);
    expect(plan.warnings.some((w) => w.includes('torso_armour_plate'))).toBe(true);
  });

  it('applies the skin colour to match_body_color items automatically', () => {
    const plan = planCharacter(catalog, { body: 'male', layers: [{ key: 'body', color: 'olive' }, { key: 'heads_orc_male' }] });
    expect(plan.refs[1].color).toBe('olive');
    const head = plan.layers.find((l) => l.key === 'heads_orc_male')!;
    expect(head.mappings[0].source).toEqual(catalog.palettes.body.versions.ulpc.green);
  });

  it('adds companions (arrows with bows) without making animations incomplete', () => {
    const plan = planCharacter(catalog, { body: 'female', layers: [{ key: 'body' }, { key: 'weapon_ranged_bow_normal' }] });
    expect(plan.refs.map((r) => r.key)).toContain('weapon_ranged_bow_arrow');
    // Bows walk with the 128px walk sheet; the arrow only exists in "shoot" but is optional.
    expect(plan.missing.walk_128).toEqual([]);
    expect(plan.missing.shoot).toEqual([]);
  });
});

describe('resolveAnim', () => {
  it('lets the weapon decide the attack', () => {
    expect(resolveAnim('attack', 'weapon_sword_longsword', { catalog }).anim).toBe('slash_oversize');
    expect(resolveAnim('attack', 'weapon_sword_arming', { catalog }).anim).toBe('slash_128');
    expect(resolveAnim('attack', 'weapon_sword_dagger', { catalog }).anim).toBe('slash');
    expect(resolveAnim('attack', 'weapon_blunt_waraxe', { catalog }).anim).toBe('slash_oversize');
    expect(resolveAnim('attack', 'weapon_polearm_spear', { catalog }).anim).toBe('thrust');
    expect(resolveAnim('attack', 'weapon_polearm_longspear', { catalog }).anim).toBe('thrust_oversize');
    expect(resolveAnim('attack', 'weapon_magic_crystal', { catalog }).anim).toBe('thrust_oversize');
    expect(resolveAnim('attack', 'weapon_ranged_crossbow', { catalog }).anim).toBe('thrust');
    expect(resolveAnim('attack', 'weapon_ranged_bow_normal', { catalog }).anim).toBe('shoot');
    expect(resolveAnim('attack', 'weapon_blunt_club', { catalog }).anim).toBe('slash_reverse_oversize');
    expect(resolveAnim('attack', null, { catalog }).anim).toBe('thrust');
  });

  it('holds the last hurt frame for ko and ignores direction', () => {
    const ko = resolveAnim('ko', null, { catalog });
    expect(ko).toMatchObject({ anim: 'hurt', frames: [5], directional: false });
    const die = resolveAnim('die', null, { catalog });
    expect(frameAt(die, 99999)).toEqual({ frame: 5, index: 5, done: true });
  });

  it('falls back when equipment lacks an animation, keeping every layer visible', () => {
    const { resolve } = sheetResolve(knight);
    expect(resolve('attack').anim).toBe('slash_oversize');
    // The longsword has no idle sheet → standing frame of walk.
    expect(resolve('idle')).toMatchObject({ anim: 'walk', frames: [0], complete: true });
    expect(resolve('walk')).toMatchObject({ anim: 'walk', complete: true });

    const katana = sheetResolve([{ key: 'body' }, { key: 'heads_human_male' }, { key: 'weapon_sword_katana' }]);
    expect(katana.resolve('idle')).toMatchObject({ anim: 'walk_128', frames: [0], complete: true });
    expect(katana.resolve('walk').anim).toBe('walk_128');
    expect(katana.resolve('attack').anim).toBe('slash_128');
  });

  it('prefers losing the weapon over losing clothes when nothing is complete', () => {
    // The robe has no thrust sheets; the crystal staff only thrusts (oversize).
    const { resolve } = sheetResolve([{ key: 'body' }, { key: 'heads_human_female' }, { key: 'torso_clothes_robe' }, { key: 'weapon_magic_crystal' }], 'female');
    const attack = resolve('attack');
    expect(attack.complete).toBe(false);
    expect(['slash', 'spellcast']).toContain(attack.anim);
  });

  it('every game anim resolves to a valid frame range', () => {
    const { resolve } = sheetResolve(knight);
    for (const g of GAME_ANIMS) {
      const p = resolve(g);
      const geo = catalog.animations[p.anim];
      expect(geo, g).toBeTruthy();
      for (const f of p.frames) expect(f, `${g} frame`).toBeLessThan(geo.frames);
    }
  });
});

describe('defaultLayersForAppearance', () => {
  it('builds body, head (skin + eyes), brows, hair, beard and outfit', () => {
    const layers = defaultLayersForAppearance(
      {
        body: 'male', skin: 'taupe', hair: 'hair_messy1', hairColor: 'chestnut', beard: 'beards_trimmed', eyes: 'brown',
        ears: 'head_ears_elven', outfit: { torso: { key: 'torso_clothes_longsleeve', color: 'navy' }, legs: { key: 'legs_pants' } },
      },
      { catalog },
    );
    expect(layers).toEqual([
      { key: 'body', color: 'taupe' },
      { key: 'heads_human_male', color: 'taupe', color2: 'brown' },
      { key: 'head_ears_elven', color: 'taupe' },
      { key: 'eyebrows_thick', color: 'chestnut' },
      { key: 'hair_messy1', color: 'chestnut' },
      { key: 'beards_trimmed', color: 'chestnut' },
      { key: 'legs_pants' },
      { key: 'torso_clothes_longsleeve', color: 'navy' },
    ]);
    expect(planCharacter(catalog, { body: 'male', layers }).warnings).toEqual([]);
  });

  it('uses the bone body for skeletons and the female head by default', () => {
    expect(defaultLayersForAppearance({ body: 'female', skin: 'light' }, { catalog })[1].key).toBe('heads_human_female');
    const skel = defaultLayersForAppearance({ body: 'male', skin: 'light', head: 'heads_skeleton' }, { catalog });
    expect(skel.slice(0, 2)).toEqual([{ key: 'body_skeleton' }, { key: 'heads_skeleton' }]);
  });
});
