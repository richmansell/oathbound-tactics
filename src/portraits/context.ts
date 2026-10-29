/**
 * Shared render context: resolved appearance, palette ramps and head geometry.
 */
import type { Appearance, Expression } from '../content/schema';
import type { Ramp, RGB } from './palette';
import type { Scene } from './scene';
import type { BeardStyle, Headgear, HairStyle, OutfitFamily, Species } from './mapping';
import type { ExpressionDef } from './features';
import { clamp, smooth, spline } from './geom';

export type Age = 'young' | 'adult' | 'old';
export type Build = 'slight' | 'average' | 'broad';

export interface HeadGeo {
  cx: number;          // cranium centre x
  top: number;         // top of skull
  R: number;           // skull half-width
  cy0: number;         // skull centre y
  browY: number;
  eyeY: number;
  noseY: number;
  mouthY: number;
  chinY: number;
  eyeDx: number;       // half distance between eye centres (on the face surface)
  turn: number;        // sin of head yaw (positive = facing viewer's right)
  hw: (y: number) => number;
  center: (y: number) => number;
  left: (y: number) => number;
  right: (y: number) => number;
  /** Screen x for a point on the face surface `dx` px from the facial midline. */
  fx: (dx: number) => number;
  inFace: (x: number, y: number) => boolean;
  neckHW: number;
  neckCx: number;
}

export interface Ctx {
  sc: Scene;
  g: HeadGeo;
  ap: Appearance;
  expr: Expression;
  ed: ExpressionDef;
  species: Species;
  age: Age;
  build: Build;
  female: boolean;
  skin: Ramp;
  hair: Ramp;
  brow: Ramp;
  eye: RGB[];
  eyeRamp: Ramp;
  hairStyle: HairStyle | null;
  beard: BeardStyle | null;
  headgear: Headgear | null;
  outfit: OutfitFamily;
  cape: boolean;
  cloth: Ramp;
  cloth2: Ramp;
  metal: Ramp;
  capeRamp: Ramp;
  hatRamp: Ramp;
  hatRamp2: Ramp;
  elf: boolean;
  /** Deterministic 0..1 random stream seeded by appearance. */
  rand: () => number;
  /** Fixed per-character variation values 0..1. */
  vary: number[];
}

/** Build head geometry from species/age/build/sex + per-character variation. */
export function makeHeadGeo(o: { female: boolean; age: Age; build: Build; species: Species; vary: number[] }): HeadGeo {
  const { female, age, build, species, vary } = o;
  const v = (i: number, amp: number) => (vary[i] - 0.5) * 2 * amp;
  let R = 20, jaw = 16.8, chin = 8.2, cheek = 19.6;
  if (female) { R = 19.2; jaw = 14.6; chin = 6.4; cheek = 18.6; }
  if (build === 'slight') { R -= 0.6; jaw -= 1; chin -= 0.6; cheek -= 0.6; }
  if (build === 'broad') { R += 1.2; jaw += 2.2; chin += 2; cheek += 1.3; }
  if (age === 'young') { jaw -= 0.8; chin -= 0.6; }
  if (age === 'old') { cheek -= 0.6; }
  if (species === 'orc') { R += 1; jaw += 3; chin += 3; cheek += 1; }
  if (species === 'goblin') { R += 0.5; jaw -= 1.5; chin -= 1.5; }
  R += v(0, 0.5); jaw += v(1, 0.8); chin += v(2, 0.6);

  const cx = 45.5;
  const top = age === 'young' ? 14 : 13;
  const chinY = (age === 'young' ? 64 : 66) + (build === 'broad' ? 1 : 0) + (species === 'orc' ? 1 : 0) + Math.round(v(3, 0.6));
  const eyeY = age === 'young' ? 41 : 40;
  const browY = eyeY - 6;
  const noseY = eyeY + 10 + (age === 'young' ? -1 : 0);
  const mouthY = noseY + (female ? 5 : 6);
  const cy0 = top + R;
  const turn = 0.24;

  // Face half-width profile (below the skull circle).
  const templeY = eyeY - 6;
  const prof = spline([
    [templeY, R],
    [eyeY + 3, cheek],
    [noseY + 2, cheek - 1.6],
    [mouthY, jaw],
    [mouthY + (chinY - mouthY) * 0.55, (jaw + chin) / 2 + 1.2],
    [chinY - 2.2, chin + 0.6],
    [chinY - 0.6, chin * 0.75],
    [chinY + 0.6, chin * 0.35],
  ]);
  const hw = (y: number) => {
    if (y < top) return 0;
    if (y < templeY) {
      const t = (templeY - y) / (templeY - top);
      return R * Math.sqrt(Math.max(0, 1 - t * t));
    }
    if (y > chinY + 0.6) return 0;
    return Math.max(0, prof(y));
  };
  const shiftMax = 2.4;
  const center = (y: number) => cx + shiftMax * smooth(eyeY - 2, chinY, y);
  const left = (y: number) => center(y) - hw(y) - 0.4 * smooth(eyeY, mouthY, y);
  const right = (y: number) => center(y) + hw(y) - 0.6 * smooth(eyeY + 2, chinY, y);
  const cosT = Math.sqrt(1 - turn * turn);
  const fx = (dx: number) => {
    const u = clamp(dx / R, -1, 1);
    return cx + R * (u * cosT + Math.sqrt(1 - u * u) * turn);
  };
  const inFace = (x: number, y: number) => x >= left(y) && x <= right(y) && y >= top && y <= chinY + 0.6;
  let neckHW = female ? 8.2 : 10;
  if (build === 'broad') neckHW += 2.4;
  if (build === 'slight') neckHW -= 0.6;
  if (species === 'orc') neckHW += 2;
  const eyeDx = (female ? 8.6 : 9) + (build === 'broad' ? 0.4 : 0) + v(4, 0.4);
  return { cx, top, R, cy0, browY, eyeY, noseY, mouthY, chinY, eyeDx, turn, hw, center, left, right, fx, inFace, neckHW, neckCx: cx + 1.8 };
}
