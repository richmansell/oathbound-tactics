import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, type Appearance } from '../src/content/schema';
import { renderPortrait, stableHash, NATIVE_SIZE } from '../src/portraits';
import {
  BEARD_MAP, HAIR_MAP, HAIR_STYLES, beardStyleFor, hairStyleFor, headgearFor, outfitFor, speciesFor,
} from '../src/portraits/mapping';
import { PORTRAIT_SAMPLES } from '../src/portraits/samples';

const LPC_HAIR_KEYS = [
  'hair_plain', 'hair_bangs', 'hair_bangsshort', 'hair_bedhead', 'hair_messy1', 'hair_messy2', 'hair_parted', 'hair_pixie',
  'hair_spiked', 'hair_spiked2', 'hair_swoop', 'hair_unkempt', 'hair_long', 'hair_long_straight', 'hair_long_messy', 'hair_wavy',
  'hair_ponytail', 'hair_ponytail2', 'hair_high_ponytail', 'hair_braid', 'hair_bob', 'hair_bob_side_part', 'hair_bangs_bun',
  'hair_pigtails_bangs', 'hair_princess', 'hair_xlong', 'hair_shoulderl', 'hair_curly_short', 'hair_curly_long', 'hair_afro',
  'hair_buzzcut', 'hair_balding', 'hair_shorthawk', 'hair_longhawk', 'hair_cornrows', 'hair_dreadlocks_short',
  'hair_topknot_short', 'hair_half_up', 'hair_loose', 'hair_page', 'hair_relm_short', 'hair_sara',
];
const LPC_BEARD_KEYS = [
  'beards_beard', 'beards_medium', 'beards_trimmed', 'beards_5oclock_shadow', 'beards_winter', 'beards_mustache',
  'beards_bigstache', 'beards_handlebar',
];

const base: Appearance = { body: 'male', skin: 'light', hair: 'hair_plain', hairColor: 'chestnut', eyes: 'blue' };

function opaqueCount(img: { data: Uint8ClampedArray }): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++;
  return n;
}

function sameImage(a: { data: Uint8ClampedArray }, b: { data: Uint8ClampedArray }): boolean {
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

describe('portrait key mapping', () => {
  it('maps every LPC hair key explicitly to a defined style', () => {
    for (const k of LPC_HAIR_KEYS) {
      expect(HAIR_MAP[k], k).toBeDefined();
      expect(HAIR_STYLES[HAIR_MAP[k]], k).toBeDefined();
      expect(hairStyleFor(k), k).not.toBeNull();
    }
  });

  it('maps every LPC beard key explicitly', () => {
    for (const k of LPC_BEARD_KEYS) {
      expect(BEARD_MAP[k], k).toBeDefined();
      expect(beardStyleFor(k)).toBe(BEARD_MAP[k]);
    }
  });

  it('falls back sensibly for unknown keys', () => {
    expect(hairStyleFor('hair_some_new_long_style')?.id).toBe('long');
    expect(hairStyleFor(undefined)).toBeNull();
    expect(beardStyleFor('beards_goatee')).toBe('trimmed');
  });

  it('maps headgear and outfit families by prefix', () => {
    expect(headgearFor('hat_helmet_greathelm')?.family).toBe('knight');
    expect(headgearFor('hat_helmet_horned')?.family).toBe('horned');
    expect(headgearFor('hat_helmet_nasal')?.family).toBe('nasal');
    expect(headgearFor('hat_helmet_kettle')?.family).toBe('kettle');
    expect(headgearFor('hat_magic_wizard')?.family).toBe('wizard');
    expect(headgearFor('hat_magic_celestial')?.family).toBe('wizard');
    expect(headgearFor('hat_hood_cloth')?.family).toBe('hood');
    expect(headgearFor('hat_cap_leather')?.family).toBe('cap');
    expect(headgearFor('hat_bandana')?.family).toBe('bandana');
    expect(headgearFor('hat_tiara')?.family).toBe('circlet');
    expect(headgearFor('hat_formal_tricorne')?.family).toBe('brimmed');
    expect(outfitFor('torso_armour_plate')).toBe('plate');
    expect(outfitFor('torso_chainmail')).toBe('chainmail');
    expect(outfitFor('torso_clothes_robe')).toBe('robe');
    expect(outfitFor('torso_clothes_tunic')).toBe('tunic');
    expect(outfitFor('torso_aprons_apron')).toBe('apron');
    expect(outfitFor('torso_leather')).toBe('leather');
    expect(speciesFor('heads_orc_male', 'green')).toBe('orc');
    expect(speciesFor('heads_skeleton', undefined)).toBe('skeleton');
    expect(speciesFor(undefined, 'zombie')).toBe('zombie');
  });
});

describe('renderPortrait', () => {
  it('renders every expression at native size with visible content', () => {
    for (const e of EXPRESSIONS) {
      const img = renderPortrait(base, e);
      expect(img.width).toBe(NATIVE_SIZE);
      expect(img.height).toBe(NATIVE_SIZE);
      expect(img.data.length).toBe(NATIVE_SIZE * NATIVE_SIZE * 4);
      expect(opaqueCount(img)).toBeGreaterThan(NATIVE_SIZE * NATIVE_SIZE * 0.3);
    }
  });

  it('expressions differ from each other', () => {
    const imgs = EXPRESSIONS.map((e) => renderPortrait(base, e));
    for (let i = 0; i < imgs.length; i++) for (let j = i + 1; j < imgs.length; j++) {
      expect(sameImage(imgs[i], imgs[j]), `${EXPRESSIONS[i]} vs ${EXPRESSIONS[j]}`).toBe(false);
    }
  });

  it('is deterministic', () => {
    for (const s of PORTRAIT_SAMPLES.slice(0, 6)) {
      const a = renderPortrait(s.appearance, 'angry');
      const b = renderPortrait(JSON.parse(JSON.stringify(s.appearance)), 'angry');
      expect(sameImage(a, b)).toBe(true);
    }
  });

  it('honours size and flip', () => {
    const big = renderPortrait(base, 'neutral', { size: 288 });
    expect(big.width).toBe(288);
    expect(big.data.length).toBe(288 * 288 * 4);
    const n = renderPortrait(base, 'neutral');
    const f = renderPortrait(base, 'neutral', { flip: true });
    const W = NATIVE_SIZE;
    for (const [x, y] of [[10, 80], [40, 40], [60, 50]]) {
      for (let k = 0; k < 4; k++) expect(f.data[(y * W + (W - 1 - x)) * 4 + k]).toBe(n.data[(y * W + x) * 4 + k]);
    }
    // Native pixel (x, y) maps to a 3×3 block when upscaled ×3.
    const s3 = renderPortrait(base, 'neutral', { size: W * 3 });
    for (let k = 0; k < 4; k++) expect(s3.data[((40 * 3 + 2) * W * 3 + 50 * 3 + 1) * 4 + k]).toBe(n.data[(40 * W + 50) * 4 + k]);
  });

  it('renders all hair and beard keys, sample characters and option overrides without throwing', () => {
    for (const hair of LPC_HAIR_KEYS) {
      expect(opaqueCount(renderPortrait({ ...base, body: 'female', hair }, 'neutral'))).toBeGreaterThan(2000);
    }
    for (const beard of LPC_BEARD_KEYS) {
      expect(opaqueCount(renderPortrait({ ...base, beard }, 'happy'))).toBeGreaterThan(2000);
    }
    for (const s of PORTRAIT_SAMPLES) for (const e of EXPRESSIONS) renderPortrait(s.appearance, e, { headgear: s.headgear, outfit: s.outfit });
    for (const hg of ['hat_helmet_greathelm', 'hat_magic_wizard', 'hat_hood_cloth', 'hat_cap_leather', 'hat_bandana', 'hat_crown', 'hat_cap_feather', 'hat_formal_bowler']) {
      renderPortrait(base, 'smirk', { headgear: hg, outfit: 'torso_armour_plate' });
    }
  });

  it('appearance changes change the image, and the hash is order-independent', () => {
    const a = renderPortrait(base, 'neutral');
    const b = renderPortrait({ ...base, hairColor: 'blonde' }, 'neutral');
    expect(sameImage(a, b)).toBe(false);
    expect(stableHash({ a: 1, b: [1, 2] })).toBe(stableHash({ b: [1, 2], a: 1 }));
  });
});
