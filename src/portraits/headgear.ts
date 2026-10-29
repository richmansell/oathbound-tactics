/**
 * Headgear families: helmets (knight / nasal / horned / kettle), wizard hat, hood, caps,
 * wide-brimmed hat, bandana, circlet and crown.
 */
import type { Ctx } from './context';
import { band, bezier, circle, ellipse, polygon, smoothClosed, smoothOpen, stroke, strokeHit, union, intersect, subtract, LIGHT, type Pt, type SDF } from './geom';
import { BONE, FEATHER, GEM_BLUE, GEM_RED } from './palette';
import type { Obj } from './scene';

const METAL_FAMS = new Set(['knight', 'nasal', 'horned', 'kettle']);

/** Headgear that covers the skull (cap and bangs are hidden under it). */
export function hidesHair(c: Ctx): boolean {
  const f = c.headgear?.family;
  return !!f && (METAL_FAMS.has(f) || f === 'hood' || f === 'bandana' || f === 'cap' || f === 'feathercap' || f === 'brimmed' || f === 'wizard');
}

/** Whether bangs/side locks should still be drawn under the headgear. */
export function showsFringe(c: Ctx): boolean {
  const f = c.headgear?.family;
  return f !== 'knight' && f !== 'kettle';
}

function metalLv(x: number, y: number, cx: number, cy: number, rx: number, ry: number, bias = 0): number {
  let nx = (x - cx) / rx, ny = (y - cy) / ry;
  const k = nx * nx + ny * ny;
  if (k > 1) { const s = 1 / Math.sqrt(k); nx *= s; ny *= s; }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias;
  const spec = Math.pow(Math.max(0, l), 8);
  return band(l + spec * 0.7, [-0.2, 0.18, 0.55, 0.88], 1);
}

function clothLv(x: number, y: number, cx: number, cy: number, rx: number, ry: number, bias = 0): number {
  let nx = (x - cx) / rx, ny = (y - cy) / ry;
  const k = nx * nx + ny * ny;
  if (k > 1) { const s = 1 / Math.sqrt(k); nx *= s; ny *= s; }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias;
  return band(l, [-0.15, 0.25, 0.68], 1);
}

/** Darken the skin just below an edge (deep shadow under brims/rims). */
function shadeBelow(c: Ctx, edge: Obj, depth: number) {
  const { sc } = c;
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    if (sc.objAt(x, y) !== edge) continue;
    for (let k = 1; k <= depth; k++) {
      const yy = y + k;
      const o = sc.objAt(x, yy);
      if (!o || o === edge) continue;
      if (o.kind === 'skin' || o.kind === 'hair') sc.darken(x, yy, 1, 1);
      if (o.kind !== 'skin' && o.kind !== 'hair' && o.kind !== 'feature') break;
    }
  }
}

function rimY(c: Ctx, x: number, base: number, dip: number): number {
  const { g } = c;
  const u = (x - g.fx(0)) / (g.R + 2);
  return base + dip * u * u;
}

// ---------------------------------------------------------------------------

export function drawHeadgearBack(c: Ctx) {
  const hg = c.headgear;
  if (!hg) return;
  const { sc, g } = c;
  if (hg.family === 'hood') {
    const o = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hood' });
    const back = union(
      ellipse(g.cx - 3, g.cy0 + 1, g.R + 7, g.R + 8),
      polygon([[g.cx - g.R - 9, g.cy0], [g.cx - g.R - 12, 86], [g.cx + g.R + 10, 86], [g.cx + g.R + 6, g.cy0]]),
    );
    sc.fill(o, back, (x, y) => clothLv(x, y, g.cx - 8, g.cy0 - 6, g.R + 12, g.R + 16, -0.15));
  }
  if (hg.family === 'horned') {
    // Far horn sits behind the helmet.
    const o = sc.add({ ramp: BONE, kind: 'horn' });
    const base: Pt = [g.cx + g.R - 2, g.top + 9];
    const pts = bezier([base, [g.cx + g.R + 9, g.top + 5], [g.cx + g.R + 7, g.top - 7]], 20);
    hornFill(c, o, pts, 3.2);
  }
  if (hg.family === 'knight' && hg.plume) {
    const o = sc.add({ ramp: FEATHER, kind: 'plume' });
    const pts = smoothOpen([[g.cx + 2, g.top - 3], [g.cx - 8, g.top - 8], [g.cx - 20, g.top - 4], [g.cx - g.R - 9, g.top + 10]], 6);
    sc.fill(o, (x, y) => strokeHit(pts, 4.5, 2, x, y).d, (x, y) => {
      const h = strokeHit(pts, 4.5, 2, x, y);
      const str = Math.sin(h.t * 34) > 0.5 ? -1 : 0;
      return Math.max(1, (h.side < -0.2 ? 4 : h.side > 0.4 ? 2 : 3) + str);
    });
  }
}

function hornFill(c: Ctx, o: Obj, pts: Pt[], w: number) {
  c.sc.fill(o, (x, y) => strokeHit(pts, w, 0.6, x, y).d, (x, y) => {
    const h = strokeHit(pts, w, 0.6, x, y);
    const ring = Math.sin(h.t * 22) > 0.6 && h.t < 0.6 ? -1 : 0;
    return Math.max(1, (h.side < -0.1 ? 4 : h.side > 0.5 ? 2 : 3) + ring + (h.t > 0.75 ? 1 : 0));
  });
}

export function drawHeadgearFront(c: Ctx) {
  const hg = c.headgear;
  if (!hg) return;
  switch (hg.family) {
    case 'knight': case 'nasal': case 'horned': case 'kettle': return helmet(c);
    case 'wizard': return wizardHat(c);
    case 'hood': return hood(c);
    case 'cap': case 'feathercap': return cap(c, hg.family === 'feathercap');
    case 'brimmed': return brimmed(c);
    case 'bandana': return bandana(c);
    case 'circlet': case 'crown': return circlet(c, hg.family === 'crown');
  }
}

// ---------------------------------------------------------------------------
// Helmets
// ---------------------------------------------------------------------------

function helmet(c: Ctx) {
  const { sc, g } = c;
  const fam = c.headgear!.family;
  const m = c.hatRamp;
  const rim = g.browY - (fam === 'kettle' ? 3 : 2);
  const domeSdf = ellipse(g.cx - 1.5, g.cy0 - 0.5, g.R + 3.2, g.R + 3.6);
  const o = sc.add({ ramp: m, kind: 'metal', family: 'helm' });
  sc.fill(o, domeSdf, (x, y) => {
    let lv = metalLv(x, y, g.cx - 8, g.cy0 - 10, g.R + 8, g.R + 10);
    // Central ridge.
    if (fam !== 'kettle' && Math.abs(x - (g.cx + 2 + (y - g.top) * 0.12)) < 0.8 && y < rim - 2) lv = Math.min(5, lv + 1);
    return lv;
  }, undefined, (x, y) => y + 0.5 < rimY(c, x + 0.5, rim, 3) || (!g.inFace(x + 0.5, y + 0.5) && y < g.eyeY + 2));

  // Rim band with rivets.
  const bandO = sc.add({ ramp: fam === 'knight' ? c.hatRamp2 : m, kind: 'metal', family: 'helm', outline: { bg: 0, over: 0, family: -2 } });
  sc.fill(bandO, domeSdf, (x, y) => metalLv(x, y, g.cx - 8, g.cy0 - 4, g.R + 6, g.R + 8, 0.05), undefined, (x, y) => {
    const ry = rimY(c, x + 0.5, rim, 3);
    return y + 0.5 >= ry - 3 && y + 0.5 < ry;
  });
  for (let k = -3; k <= 3; k++) {
    const x = Math.round(g.fx(k * 5.5));
    const y = Math.round(rimY(c, x, rim, 3) - 2);
    if (sc.objAt(x, y) === bandO) { sc.shade(x, y, 5); if (sc.objAt(x + 1, y) === bandO) sc.shade(x + 1, y, 2); }
  }

  if (fam === 'knight') {
    // Cheek guards covering ears and jaw sides.
    const cg = sc.add({ ramp: m, kind: 'metal', family: 'helm', outline: { bg: 0, over: 0, family: -2 } });
    const nl = g.left(g.eyeY), fr = g.right(g.eyeY);
    const near = polygon(smoothOpen([[nl - 3.5, rim - 3], [nl + 6, rim - 1], [nl + 6.5, g.eyeY + 3], [nl + 5, g.noseY + 3], [g.left(g.mouthY) + 4, g.mouthY + 3], [g.left(g.mouthY) - 2.5, g.mouthY + 4], [nl - 4, g.eyeY + 6]], 4));
    const far = polygon(smoothOpen([[fr - 3, rim - 2], [fr + 3.5, rim - 3], [fr + 3, g.eyeY + 6], [g.right(g.mouthY) + 2, g.mouthY + 3], [g.right(g.mouthY) - 3, g.mouthY + 2], [fr - 3.5, g.noseY + 2], [fr - 4, g.eyeY + 2]], 4));
    sc.fill(cg, near, (x, y) => metalLv(x, y, nl - 2, g.eyeY - 2, 10, 18, 0.05));
    const cg2 = sc.add({ ramp: m, kind: 'metal', family: 'helm', outline: { bg: 0, over: 0, family: -2 } });
    sc.fill(cg2, far, (x, y) => metalLv(x, y, fr - 6, g.eyeY - 4, 10, 18, -0.25));
    // Rivets on guards.
    for (const [x, y] of [[nl + 1, g.eyeY + 4], [nl + 1, g.noseY + 4]] as Pt[]) {
      const px = Math.round(x), py = Math.round(y);
      if (sc.objAt(px, py) === cg) { sc.shade(px, py, 5); sc.shade(px + 1, py, 2); }
    }
    shadeBelow(c, bandO, 2);
  }
  if (fam === 'nasal' || fam === 'horned') {
    const n = sc.add({ ramp: m, kind: 'metal', family: 'helm', outline: { bg: 0, over: 0 } });
    const nx = g.fx(0) - 0.5;
    sc.fill(n, polygon([[nx - 1.6, rim - 3], [nx + 1.8, rim - 3], [nx + 1.4, g.noseY - 3], [nx - 0.8, g.noseY - 2]]), (x) => (x < nx ? 4 : 2));
    shadeBelow(c, bandO, 2);
  }
  if (fam === 'kettle') {
    const b = sc.add({ ramp: m, kind: 'metal', family: 'helm', outline: { bg: 0, over: 0 } });
    const brim = ellipse(g.cx + 1, rim - 1, g.R + 11, 3.6);
    sc.fill(b, brim, (x, y) => (y < rim - 1.5 ? (x < g.cx ? 4 : 3) : 2));
    shadeBelow(c, b, 3);
  }
  if (fam === 'horned') {
    const ho = sc.add({ ramp: BONE, kind: 'horn' });
    const base: Pt = [g.cx - g.R + 1, g.top + 11];
    const pts = bezier([base, [g.cx - g.R - 13, g.top + 7], [g.cx - g.R - 10, g.top - 9]], 22);
    hornFill(c, ho, pts, 3.8);
  }
}

// ---------------------------------------------------------------------------
// Wizard hat
// ---------------------------------------------------------------------------

function wizardHat(c: Ctx) {
  const { sc, g } = c;
  const r = c.hatRamp;
  const baseY = g.browY - 4;
  const o = sc.add({ ramp: r, kind: 'cloth', family: 'hat' });
  const cone = polygon(smoothClosed([
    [g.cx - g.R + 1, baseY + 1], [g.cx - g.R + 6, baseY - 14], [g.cx - 8, g.top - 4], [g.cx - 14, 3], [g.cx - 24, 1],
    [g.cx - 10, 1], [g.cx - 2, 4], [g.cx + 6, g.top - 2], [g.cx + g.R - 5, baseY - 10], [g.cx + g.R - 1, baseY + 1],
  ], 4));
  sc.fill(o, cone, (x, y) => {
    let lv = clothLv(x, y, g.cx - 12, baseY - 18, 24, 26, 0.05);
    // Fold crease where the tip bends.
    if (y < g.top + 2 && Math.abs(y - (g.top - 3) - (x - g.cx) * 0.2) < 0.7) lv = Math.max(1, lv - 1);
    return lv;
  });
  // Hat band.
  const bandO = sc.add({ ramp: c.hatRamp2, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 0, family: -2 } });
  sc.fill(bandO, cone, (x, y) => clothLv(x, y, g.cx - 10, baseY - 10, 22, 20, 0.15), undefined, (x, y) => y > baseY - 5);
  // Brim.
  const brim = sc.add({ ramp: r, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 0, family: -2 } });
  const bs = union(ellipse(g.cx + 1, baseY + 1.5, g.R + 13, 4.6));
  sc.fill(brim, bs, (x, y) => (y < baseY + 0.5 ? (x < g.cx - 4 ? 4 : 3) : y < baseY + 3 ? 2 : 1));
  shadeBelow(c, brim, 4);
  // Star charm.
  const st = sc.add({ ramp: c.hatRamp2, kind: 'metal', outline: false, exact: true });
  const sx = Math.round(g.cx - 4), sy = baseY - 10;
  for (const [dx, dy, lv] of [[0, -1, 4], [-1, 0, 4], [0, 0, 5], [1, 0, 3], [0, 1, 3]] as const) sc.set(sx + dx, sy + dy, st, lv);
}

// ---------------------------------------------------------------------------
// Hood
// ---------------------------------------------------------------------------

function hood(c: Ctx) {
  const { sc, g } = c;
  const o = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hood', outline: { bg: 0, over: 1, family: -1 } });
  const outer = ellipse(g.cx - 2, g.cy0 + 0.5, g.R + 6.5, g.R + 7.5);
  const opening = (x: number, y: number) => {
    // Face opening: an arch from above the brows down past the chin.
    const oTop = g.browY - 7, oBot = g.chinY + 1.5;
    const ocx = g.fx(0) - 0.5, ocy = (oTop + oBot) / 2;
    return ellipse(ocx, ocy, g.R - 1.5, (oBot - oTop) / 2)(x, y);
  };
  const drape = polygon([[g.cx - g.R - 8, g.eyeY], [g.neckCx - 26, 92], [g.neckCx + 26, 92], [g.cx + g.R + 6, g.eyeY]]);
  const cowl = polygon([[g.cx - g.R - 8, g.eyeY + 4], [g.neckCx - 30, 97], [g.neckCx + 30, 97], [g.cx + g.R + 6, g.eyeY + 4]]);
  const shape = subtract(union(outer, intersect(union(drape, cowl), (x, y) => g.chinY - 2 - y)), opening);
  sc.fill(o, shape, (x, y) => {
    const d = opening(x, y);
    // Rim fold: lit rolled edge just outside the opening, then shadowed inner lining.
    if (d < 1.6) return x < g.fx(0) ? 3 : 2;
    if (d < 3.2) return x < g.fx(0) - 6 ? 4 : 3;
    return clothLv(x, y, g.cx - 10, g.cy0 - 10, g.R + 14, g.R + 20, -0.05);
  });
  // Deep shadow inside the hood on the face edges.
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    const k = sc.objAt(x, y)?.kind;
    if (k !== 'skin' && k !== 'hair') continue;
    const d = opening(x + 0.5, y + 0.5);
    if (d > -2.5 && y < g.mouthY) sc.darken(x, y, 1, 1);
  }
  // Drape folds.
  for (const fx of [-14, -6, 9, 17]) {
    for (let y = g.chinY + 6; y < 92; y++) {
      const x = Math.round(g.neckCx + fx + (y - g.chinY) * 0.18 * Math.sign(fx));
      if (sc.objAt(x, y) === o) sc.darken(x, y, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Soft hats
// ---------------------------------------------------------------------------

function cap(c: Ctx, feather: boolean) {
  const { sc, g } = c;
  const rim = g.browY - 3;
  const o = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat' });
  const dome = feather
    ? polygon(smoothClosed([[g.cx - g.R - 2, rim + 1], [g.cx - g.R - 6, g.top - 2], [g.cx - 4, g.top - 5], [g.cx + g.R - 2, g.top + 6], [g.cx + g.R + 2, rim + 1]], 5))
    : ellipse(g.cx - 1, g.cy0 - 1.5, g.R + 3, g.R + 3.5);
  sc.fill(o, dome, (x, y) => {
    let lv = clothLv(x, y, g.cx - 8, g.top + 2, g.R + 6, g.R + 4);
    // Panel seams from the crown.
    for (const k of [-0.45, 0.15]) {
      const sx = g.cx + k * g.R + (y - g.top) * k * 0.6;
      if (!feather && Math.abs(x - sx) < 0.6 && y < rim - 2) lv = Math.max(1, lv - 1);
    }
    return lv;
  }, undefined, (x, y) => y + 0.5 < rimY(c, x + 0.5, rim, 2.5));
  // Band.
  const b = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 0, family: -2 } });
  sc.fill(b, dome, (x, y) => clothLv(x, y, g.cx - 6, g.top + 6, g.R + 6, g.R + 6, -0.1), undefined, (x, y) => {
    const ry = rimY(c, x + 0.5, rim, 2.5);
    return y + 0.5 < ry && y + 0.5 >= ry - 2.5;
  });
  if (!feather) {
    // Peak toward the facing side.
    const p = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 0 } });
    sc.fill(p, ellipse(g.fx(5), rim + 0.5, 11, 2.6), (x, y) => (y < rim ? 3 : 2), undefined, (x, y) => y + 0.5 > rim - 1.5);
    shadeBelow(c, p, 3);
  } else {
    const f = sc.add({ ramp: FEATHER, kind: 'plume' });
    const pts = smoothOpen([[g.cx - g.R + 2, rim - 3], [g.cx - g.R - 6, g.top + 2], [g.cx - g.R - 4, g.top - 10]], 6);
    sc.fill(f, (x, y) => strokeHit(pts, 2.6, 0.4, x, y).d, (x, y) => {
      const h = strokeHit(pts, 2.6, 0.4, x, y);
      return Math.abs(h.side) < 0.25 ? 5 : h.side < 0 ? 4 : 2;
    });
    shadeBelow(c, b, 2);
  }
}

function brimmed(c: Ctx) {
  const { sc, g } = c;
  const rim = g.browY - 4;
  const o = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat' });
  const crown = polygon(smoothClosed([[g.cx - g.R + 1, rim], [g.cx - g.R + 2, g.top - 2], [g.cx - 2, g.top - 5], [g.cx + g.R - 3, g.top - 1], [g.cx + g.R - 1, rim]], 5));
  sc.fill(o, crown, (x, y) => {
    let lv = clothLv(x, y, g.cx - 8, g.top, g.R + 6, g.R + 4);
    if (Math.abs(x - (g.cx + 1)) < 0.7 && y < g.top + 2) lv = Math.max(1, lv - 1); // pinch
    return lv;
  });
  const b = sc.add({ ramp: c.hatRamp2, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 0, family: -2 } });
  sc.fill(b, crown, (x, y) => clothLv(x, y, g.cx - 8, g.top, g.R + 6, g.R + 4, 0.1), undefined, (x, y) => y > rim - 4);
  const br = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 0, family: -2 } });
  sc.fill(br, ellipse(g.cx, rim + 1, g.R + 14, 4.2), (x, y) => (y < rim + 0.5 ? (x < g.cx - 6 ? 4 : 3) : y < rim + 3 ? 2 : 1));
  shadeBelow(c, br, 4);
}

function bandana(c: Ctx) {
  const { sc, g } = c;
  const rim = g.browY - 3;
  const o = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat' });
  const dome = ellipse(g.cx - 1.5, g.cy0 - 1, g.R + 2.6, g.R + 3);
  sc.fill(o, dome, (x, y) => {
    let lv = clothLv(x, y, g.cx - 8, g.top + 3, g.R + 6, g.R + 4, 0.05);
    // Wrinkles converging to the knot at the back.
    const a = Math.atan2(y - (g.cy0 - 2), x - (g.cx - g.R));
    if (Math.sin(a * 9) > 0.85 && y < rim - 2) lv = Math.max(1, lv - 1);
    return lv;
  }, undefined, (x, y) => y + 0.5 < rimY(c, x + 0.5, rim, 3.5) || (!g.inFace(x + 0.5, y + 0.5) && y < g.eyeY - 2));
  // Knot + tails at the back of the head (viewer's left).
  const k = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 1, family: -2 } });
  const kx = g.cx - g.R - 2, ky = g.eyeY - 6;
  sc.fill(k, circle(kx, ky, 2.8), (x, y) => (x < kx && y < ky ? 4 : 2));
  for (const [ex, ey, w] of [[kx - 7, ky + 12, 2.6], [kx - 2, ky + 14, 2.2]] as const) {
    const pts = bezier([[kx, ky + 1], [kx - 5, ky + 5], [ex, ey]], 16);
    const t = sc.add({ ramp: c.hatRamp, kind: 'cloth', family: 'hat', outline: { bg: 0, over: 1, family: -2 } });
    sc.fill(t, stroke(pts, w, 0.8), (x, y) => (strokeHit(pts, w, 0.8, x, y).side < 0 ? 3 : 2));
  }
  shadeBelow(c, o, 2);
}

function circlet(c: Ctx, crown: boolean) {
  const { sc, g } = c;
  const y0 = g.browY - (crown ? 6 : 5);
  const o = sc.add({ ramp: c.hatRamp, kind: 'metal', family: 'circlet', outline: { bg: 0, over: -1, sides: 'lrb' }, cast: true });
  const bandSdf: SDF = (x, y) => {
    if (!(g.inFace(x, y + 2) || Math.abs(x - g.cx) < g.R + 3)) return 1;
    const ry = rimY(c, x, y0, -4);
    return Math.abs(y - ry) - (crown ? 1.6 : 1.1);
  };
  sc.fill(o, intersect(bandSdf, ellipse(g.cx - 1, g.cy0, g.R + 3.5, g.R + 4)), (x, y) => {
    const ry = rimY(c, x, y0, -4);
    return y < ry ? (x < g.fx(4) ? 5 : 4) : x > g.fx(6) ? 2 : 3;
  });
  if (crown) {
    const p = sc.add({ ramp: c.hatRamp, kind: 'metal', family: 'circlet', outline: { bg: 0, over: 0 } });
    for (const k of [-12, -6, 0, 6, 12]) {
      const x = g.fx(k), yb = rimY(c, x, y0, -4) - 1;
      const h = k === 0 ? 7 : 5;
      sc.fill(p, polygon([[x - 2.5, yb + 1], [x, yb - h], [x + 2.5, yb + 1]]), (px) => (px < x ? 4 : 2));
    }
  }
  // Gem.
  const gem = sc.add({ ramp: crown ? GEM_RED : GEM_BLUE, kind: 'gem', outline: { bg: 0, over: 0 } });
  const gx = g.fx(0), gy = rimY(c, gx, y0, -4);
  sc.fill(gem, ellipse(gx, gy + 0.5, 2.2, 2.2), (x, y) => (x < gx && y < gy ? 5 : x > gx ? 2 : 3));
}
