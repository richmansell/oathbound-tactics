/**
 * renderPortrait: Appearance + Expression → RGBA pixel buffer. Pure and deterministic.
 */
import type { Appearance, Expression } from '../content/schema';
import { Scene } from './scene';
import { makeHeadGeo, type Age, type Build, type Ctx } from './context';
import { EXPRESSION_DEFS } from './features';
import {
  beardStyleFor, hairStyleFor, hasCape, headgearFor, isElfEars, outfitFor, speciesFor, ageFromHead,
} from './mapping';
import { clothRamp, eyeRamp, hairRamp, isMetal, metalRamp, mix, skinRamp, BONE, type Ramp } from './palette';
import { drawEars, drawEyepatch, drawFace, drawFeatures, drawNeck } from './head';
import { drawBackHair, drawFrontHair, drawBeard } from './hair';
import { drawTorso, drawOutfitFront } from './outfit';
import { drawHeadgearBack, drawHeadgearFront, hidesHair, showsFringe } from './headgear';
import { drawMonsterHead } from './monsters';

export const NATIVE_SIZE = 96;

export interface PortraitOptions {
  /** Output size in pixels (square). Upscaled with nearest-neighbour; default 96 (native). */
  size?: number;
  /** Headgear item key (overrides appearance.outfit.hat), e.g. "hat_helmet_greathelm". */
  headgear?: string;
  /** Torso item key (overrides appearance.outfit.torso), e.g. "torso_armour_plate". */
  outfit?: string;
  /** Mirror horizontally (portrait faces viewer's left). */
  flip?: boolean;
}

export interface PortraitImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** FNV-1a over a stable JSON serialisation. */
export function stableHash(v: unknown): number {
  const s = stableStringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_CLOTH: Record<string, string> = {
  tunic: 'blue', robe: 'white', plate: 'steel', leather: 'leather', chainmail: 'iron',
  apron: 'tan', vest: 'brown', bare: 'brown', sleeveless: 'brown',
};

export function buildContext(ap: Appearance, expr: Expression, opts: PortraitOptions = {}): Ctx {
  const seed = stableHash({ ap });
  const rand = mulberry(seed);
  const vary = Array.from({ length: 12 }, () => rand());
  const species = speciesFor(ap.head, ap.skin);
  const female = ap.body === 'female';
  const age: Age = ap.portrait?.age ?? ageFromHead(ap.head) ?? 'adult';
  const build: Build = ap.portrait?.build ?? (ap.body === 'muscular' ? 'broad' : female ? 'slight' : 'average');
  const g = makeHeadGeo({ female, age, build, species, vary });
  const sc = new Scene(NATIVE_SIZE, NATIVE_SIZE);

  const skin = species === 'skeleton' ? BONE : skinRamp(ap.skin || (species === 'orc' ? 'green' : species === 'goblin' ? 'pale_green' : species === 'zombie' ? 'zombie' : 'light'));
  const hair = hairRamp(ap.hairColor);
  const eye = eyeRamp(ap.eyes);
  // 6-step eye ramp: pupil, dark, mid, light (+ padding).
  const eyeR: Ramp = [mix(eye[0], [10, 6, 12], 0.7), eye[0], eye[1], eye[2], mix(eye[2], [255, 255, 255], 0.5), [255, 255, 255]];
  // Brows: hair colour, but keep them readable on very light hair.
  const brow: Ramp = hair.map((c, i) => (i <= 2 ? mix(c, hair[0], 0.15) : c)) as Ramp;

  const torsoRef = ap.outfit?.torso;
  const outfitKey = opts.outfit ?? torsoRef?.key;
  const outfit = ap.outfit?.torso || opts.outfit ? outfitFor(outfitKey) : 'tunic';
  const hatRef = ap.outfit?.hat;
  const headgear = headgearFor(opts.headgear ?? hatRef?.key);
  const capeRef = ap.outfit?.cape;
  const cape = hasCape(capeRef?.key) || (!!outfitKey && /cloak|cape/.test(outfitKey));

  const torsoColor = opts.outfit && opts.outfit !== torsoRef?.key ? undefined : torsoRef?.color;
  const metalFamilies = outfit === 'plate' || outfit === 'chainmail';
  const cloth = metalFamilies
    ? clothRamp(torsoRef?.color2 && !isMetal(torsoRef.color2) ? torsoRef.color2 : !isMetal(torsoColor) && torsoColor ? torsoColor : outfit === 'plate' ? 'navy' : 'maroon')
    : clothRamp(torsoColor ?? DEFAULT_CLOTH[outfit]);
  const metal = metalRamp(metalFamilies && isMetal(torsoColor) ? torsoColor : torsoRef?.color2 && isMetal(torsoRef.color2) ? torsoRef.color2 : outfit === 'chainmail' ? 'iron' : 'steel');
  const cloth2 = clothRamp(metalFamilies ? 'yellow' : torsoRef?.color2 ?? (outfit === 'robe' ? 'yellow' : outfit === 'apron' ? 'white' : outfit === 'vest' ? 'white' : 'tan'));
  const capeRamp = clothRamp(capeRef?.color ?? 'forest');
  const hatColor = opts.headgear && opts.headgear !== hatRef?.key ? undefined : hatRef?.color;
  const hatRamp = headgear?.metal ? metalRamp(hatColor ?? 'steel') : clothRamp(hatColor ?? (headgear?.family === 'wizard' ? 'navy' : headgear?.family === 'hood' ? 'forest' : headgear?.family === 'bandana' ? 'red' : 'leather'));
  const hatRamp2 = headgear?.metal ? metalRamp(hatRef?.color2 ?? 'gold') : clothRamp(hatRef?.color2 ?? 'yellow');

  return {
    sc, g, ap, expr, ed: EXPRESSION_DEFS[expr] ?? EXPRESSION_DEFS.neutral, species, age, build, female,
    skin, hair, brow, eye, eyeRamp: eyeR,
    hairStyle: species === 'skeleton' || species === 'wolf' || species === 'lizard' ? null : hairStyleFor(ap.hair),
    beard: species === 'human' || species === 'orc' ? beardStyleFor(ap.beard) : null,
    headgear, outfit, cape, cloth, cloth2, metal, capeRamp, hatRamp, hatRamp2,
    elf: isElfEars(ap.ears), rand, vary,
  };
}

/** Render the portrait at native resolution into a Scene-resolved RGBA buffer. */
function renderNative(c: Ctx): Uint8ClampedArray {
  const { sc } = c;
  const hairHidden = hidesHair(c);
  drawHeadgearBack(c);
  drawBackHair(c, hairHidden);
  drawNeck(c);
  drawTorso(c);
  if (c.species === 'wolf' || c.species === 'lizard' || c.species === 'skeleton') {
    drawMonsterHead(c);
  } else {
    const hooded = c.headgear?.family === 'hood' || c.headgear?.family === 'knight';
    if (!hooded) drawEars(c, 'far');
    drawFace(c);
    if (!hooded) drawEars(c, 'near');
    drawBeard(c, 'jaw');
    drawFeatures(c);
    drawBeard(c, 'stache');
    if (!hairHidden) drawFrontHair(c);
    else if (showsFringe(c)) drawFrontHair(c, true);
    drawEyepatch(c);
  }
  drawHeadgearFront(c);
  drawOutfitFront(c);

  sc.cleanSpurs();
  sc.castShadows(1, 2);
  sc.cleanOrphans(2);
  sc.outlines();
  return sc.toRGBA();
}

export function scaleImage(src: Uint8ClampedArray, w: number, h: number, size: number, flip: boolean): PortraitImage {
  if (size === w && !flip) return { width: w, height: h, data: src };
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / size));
    for (let x = 0; x < size; x++) {
      let sx = Math.min(w - 1, Math.floor((x * w) / size));
      if (flip) sx = w - 1 - sx;
      const si = (sy * w + sx) * 4, di = (y * size + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return { width: size, height: size, data: out };
}

export function renderPortrait(appearance: Appearance, expression: Expression, opts: PortraitOptions = {}): PortraitImage {
  const c = buildContext(appearance, expression, opts);
  const data = renderNative(c);
  const size = Math.max(1, Math.round(opts.size ?? NATIVE_SIZE));
  return scaleImage(data, NATIVE_SIZE, NATIVE_SIZE, size, !!opts.flip);
}
