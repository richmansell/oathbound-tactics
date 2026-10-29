/**
 * Shoulders + outfit families (collar shapes, armour, cloaks).
 */
import type { Ctx } from './context';
import { band, circle, ellipse, polygon, smoothOpen, stroke, union, intersect, subtract, type Pt, type SDF } from './geom';
import type { Obj } from './scene';

interface Torso { sdf: SDF; top: number; nx: number; scale: number }

function torsoShape(c: Ctx): Torso {
  const { g } = c;
  const s = c.build === 'broad' ? 1.12 : c.build === 'slight' ? 0.9 : 1;
  const nx = g.neckCx;
  const ny = g.chinY + 9 + (c.build === 'broad' ? -1 : 0);
  const nh = g.neckHW;
  const L = (dx: number, y: number): Pt => [nx - dx * s - (dx > 10 ? 0 : 0), y];
  const Rr = (dx: number, y: number): Pt => [nx + dx * s * 0.94, y];
  const pts: Pt[] = [
    [nx - nh - 1, ny - 2],
    L(16, ny + 1),
    L(29, ny + 3),
    L(39, ny + 7),
    L(45, ny + 14),
    L(47, 98),
    Rr(47, 98),
    Rr(44, ny + 13),
    Rr(38, ny + 6),
    Rr(28, ny + 2),
    Rr(16, ny),
    [nx + nh + 1, ny - 3],
  ];
  return { sdf: polygon(smoothOpen(pts, 5)), top: ny - 3, nx, scale: s };
}

function clothLight(t: Torso, x: number, y: number): number {
  // Big ellipsoid for the chest/shoulders, light top-left.
  const nx = (x - (t.nx - 4)) / (52 * t.scale);
  const ny = (y - 104) / 34;
  const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
  return -0.55 * nx - 0.62 * ny + 0.56 * nz;
}

function clothLevel(t: Torso, x: number, y: number, extra = 0): number {
  return band(clothLight(t, x, y) + extra, [-0.05, 0.38, 0.72], 1);
}

/** Pixel-level fold lines: diagonal creases from the neck toward the armpits. */
function folds(c: Ctx, o: Obj, t: Torso, region: SDF) {
  const { sc } = c;
  const lines: Pt[][] = [
    [[t.nx - 10, 84], [t.nx - 16, 90], [t.nx - 19, 96]],
    [[t.nx + 11, 84], [t.nx + 16, 91], [t.nx + 18, 96]],
    [[t.nx - 26, 86], [t.nx - 30, 96]],
  ];
  for (const ln of lines) {
    const pts = smoothOpen(ln, 6);
    for (const [x, y] of pts) {
      const px = Math.round(x), py = Math.round(y);
      if (region(px + 0.5, py + 0.5) < 0 && sc.objAt(px, py) === o) sc.darken(px, py, 1);
    }
  }
}

function fillCloth(c: Ctx, o: Obj, t: Torso, sdf: SDF, extra = 0) {
  c.sc.fill(o, sdf, (x, y) => clothLevel(t, x, y, extra), [0, t.top - 2, 95, 95]);
}

function metalLevel(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const nx = (x - cx) / rx, ny = (y - cy) / ry;
  const k = nx * nx + ny * ny;
  const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, k)));
  const l = -0.55 * nx - 0.62 * ny + 0.56 * nz;
  // Metal: high contrast, with a sharp specular.
  const spec = Math.pow(Math.max(0, l), 10);
  return band(l + spec * 0.4, [-0.25, 0.15, 0.55, 0.93], 1);
}

export function drawTorso(c: Ctx) {
  const { sc, g } = c;
  const t = torsoShape(c);
  const neckCut = (w: number, depth: number): SDF => polygon([
    [t.nx - g.neckHW - w, t.top - 6], [t.nx - g.neckHW - w, t.top + 1], [t.nx, t.top + depth], [t.nx + g.neckHW + w, t.top],
    [t.nx + g.neckHW + w, t.top - 6],
  ]);

  switch (c.outfit) {
    case 'bare':
    case 'sleeveless': {
      const sk = sc.add({ ramp: c.skin, kind: 'skin', family: 'skin', outline: { bg: 0, over: 1 } });
      sc.fill(sk, t.sdf, (x, y) => band(clothLight(t, x, y), [0.0, 0.42, 0.85], 2) > 4 ? 4 : band(clothLight(t, x, y), [0.0, 0.42, 0.85], 2), [0, t.top - 2, 95, 95]);
      // Pectoral/collarbone hints.
      for (let x = -12; x <= 12; x++) {
        const px = Math.round(t.nx + x), py = Math.round(83 + Math.abs(x) * 0.12);
        if (Math.abs(x) > 2 && sc.objAt(px, py) === sk) sc.darken(px, py, 1, 2);
      }
      if (c.outfit === 'sleeveless') {
        // Vest straps.
        const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
        const strap = (s: number) => polygon([[t.nx + s * (g.neckHW + 2), t.top - 1], [t.nx + s * (g.neckHW + 8), t.top + 1], [t.nx + s * 14, 96], [t.nx + s * 6, 96]]);
        fillCloth(c, o, t, intersect(t.sdf, union(strap(-1), strap(1))));
      }
      return;
    }
    case 'robe': {
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      fillCloth(c, o, t, subtract(t.sdf, neckCut(1, 12)));
      folds(c, o, t, t.sdf);
      // Crossed collar bands (left over right).
      const trim = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      const bandL = stroke(smoothOpen([[t.nx - g.neckHW - 3, t.top - 2], [t.nx - 2, t.top + 10], [t.nx + 7, 97]], 8), 2.2, 2.6);
      const bandR = stroke(smoothOpen([[t.nx + g.neckHW + 3, t.top - 3], [t.nx + 4, t.top + 7], [t.nx + 1.5, t.top + 10]], 8), 2.2, 2.2);
      sc.fill(trim, intersect(t.sdf, bandR), (x, y) => clothLevel(t, x, y, 0.15));
      const trim2 = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      sc.fill(trim2, intersect(t.sdf, bandL), (x, y) => clothLevel(t, x, y, 0.2));
      return;
    }
    case 'plate': {
      // Undercloth then breastplate, gorget, pauldrons.
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      fillCloth(c, o, t, subtract(t.sdf, neckCut(0, 3)));
      const m = sc.add({ ramp: c.metal, kind: 'metal' });
      const chest = intersect(t.sdf, ellipse(t.nx, 104, 26 * t.scale, 26));
      sc.fill(m, chest, (x, y) => {
        // Centre ridge: lit left half, shaded right.
        const ridge = x - (t.nx + 1);
        if (Math.abs(ridge) < 0.8) return 4;
        return Math.min(4, metalLevel(x, y, t.nx - 8, 96, 34 * t.scale, 26)) - (ridge > 0 ? 1 : 0);
      });
      const gor = sc.add({ ramp: c.metal, kind: 'metal' });
      const gorget = intersect(ellipse(t.nx, t.top + 1, g.neckHW + 5, 6), (x, y) => y - (t.top - 2) > 0 ? -1 : 1);
      sc.fill(gor, gorget, (x, y) => metalLevel(x, y, t.nx - 3, t.top - 2, g.neckHW + 6, 8));
      const gor2 = sc.add({ ramp: c.metal, kind: 'metal' });
      sc.fill(gor2, intersect(ellipse(t.nx, t.top + 4, g.neckHW + 7, 6), (x, y) => (y > t.top + 2 ? -1 : 1)), (x, y) => metalLevel(x, y, t.nx - 4, t.top, g.neckHW + 8, 9));
      for (const s of [-1, 1]) {
        const p = sc.add({ ramp: c.metal, kind: 'metal' });
        const pcx = t.nx + s * 33 * t.scale, pcy = t.top + 15;
        const shape = intersect(t.sdf, (x, y) => ellipse(pcx, pcy, 15 * t.scale, 12)(x, y));
        sc.fill(p, shape, (x, y) => metalLevel(x, y, pcx - 5, pcy - 5, 17 * t.scale, 14) - (s > 0 ? 1 : 0));
        // Lames.
        const p2 = sc.add({ ramp: c.metal, kind: 'metal' });
        sc.fill(p2, intersect(t.sdf, ellipse(pcx + s * 2, pcy + 9, 14 * t.scale, 7)), (x, y) => metalLevel(x, y, pcx - 4, pcy + 4, 17 * t.scale, 10) - (s > 0 ? 1 : 0), undefined, (x, y) => y > pcy + 6);
        // Rivets.
        for (const k of [-0.6, 0, 0.6]) {
          const rx = Math.round(pcx + k * 9 * t.scale), ry = Math.round(pcy - 9 + Math.abs(k) * 4);
          if (sc.objAt(rx, ry) === p) { sc.shade(rx, ry, 5); sc.shade(rx + 1, ry + 1, 1); }
        }
      }
      return;
    }
    case 'chainmail': {
      const m = sc.add({ ramp: c.metal, kind: 'metal' });
      sc.fill(m, subtract(t.sdf, neckCut(0, 4)), (x, y) => {
        const base = clothLevel(t, x, y, 0.1);
        // Ring texture: offset rows of bright/dark pixel pairs.
        const xi = Math.floor(x), yi = Math.floor(y);
        const ring = (xi + (yi % 2) * 2) % 4;
        if (ring === 0) return Math.min(5, base + 1);
        if (ring === 2) return Math.max(1, base - 1);
        return base;
      }, [0, t.top - 2, 95, 95]);
      // Surcoat / tabard over the chest.
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      const tab = intersect(t.sdf, polygon([[t.nx - 14 * t.scale, 98], [t.nx - 12 * t.scale, t.top + 9], [t.nx - 6, t.top + 6], [t.nx + 7, t.top + 6], [t.nx + 13 * t.scale, t.top + 8], [t.nx + 14 * t.scale, 98]]));
      fillCloth(c, o, t, tab, 0.05);
      // Emblem stripe.
      const e = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      fillCloth(c, e, t, intersect(tab, polygon([[t.nx - 2, t.top + 10], [t.nx + 4, t.top + 10], [t.nx + 4, 98], [t.nx - 2, 98]])), 0.1);
      return;
    }
    case 'leather': {
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      fillCloth(c, o, t, subtract(t.sdf, neckCut(0, 2)), 0.05);
      folds(c, o, t, t.sdf);
      // Shoulder pads (stitched).
      for (const s of [-1, 1]) {
        const p = sc.add({ ramp: c.cloth, kind: 'cloth' });
        const pcx = t.nx + s * 37 * t.scale, pcy = t.top + 14;
        sc.fill(p, intersect(t.sdf, ellipse(pcx, pcy, 12 * t.scale, 11)), (x, y) => clothLevel(t, x, y, 0.15) - (s > 0 ? 1 : 0), undefined, (x, y) => y > t.top + 5);
        for (let k = -8; k <= 8; k += 2) {
          const sx = Math.round(pcx + k * t.scale), sy = Math.round(pcy + 7 - Math.abs(k) * 0.3);
          if (sc.objAt(sx, sy) === p) sc.shade(sx, sy, Math.max(1, sc.levelAt(sx, sy) - 2));
        }
      }
      // High collar.
      const col = sc.add({ ramp: c.cloth, kind: 'cloth' });
      const collar = subtract(ellipse(t.nx, t.top + 1, g.neckHW + 5, 7), ellipse(t.nx + 1, t.top - 4, g.neckHW + 1.5, 7));
      sc.fill(col, collar, (x, y) => clothLevel(t, x, y - 10, 0.3), undefined, (x, y) => y > t.top - 6);
      // Lacing.
      const lace = sc.add({ ramp: c.cloth2, kind: 'cloth', outline: false });
      for (let k = 0; k < 4; k++) {
        const y = t.top + 9 + k * 3;
        for (const dx of [-1, 0, 1]) sc.set(Math.round(t.nx + dx + (k % 2 ? 0 : 0)), y + (dx === 0 ? 0 : dx < 0 ? -1 : -1), lace, 3);
      }
      return;
    }
    case 'vest': {
      const shirt = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      fillCloth(c, shirt, t, subtract(t.sdf, neckCut(1, 6)), 0.15);
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      const open = polygon([[t.nx - 4, t.top - 4], [t.nx + 1, 97], [t.nx + 9, t.top - 4]]);
      fillCloth(c, o, t, subtract(subtract(t.sdf, neckCut(1, 6)), open));
      folds(c, o, t, t.sdf);
      return;
    }
    case 'apron': {
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      fillCloth(c, o, t, subtract(t.sdf, neckCut(1, 7)));
      folds(c, o, t, t.sdf);
      const a = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      fillCloth(c, a, t, intersect(t.sdf, polygon([[t.nx - 11, 98], [t.nx - 10, t.top + 13], [t.nx + 11, t.top + 13], [t.nx + 12, 98]])), 0.1);
      const st = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      for (const s of [-1, 1]) fillCloth(c, st, t, stroke([[t.nx + s * 9, t.top + 14], [t.nx + s * (g.neckHW + 2), t.top - 1]], 1.3, 1.3), 0.1);
      return;
    }
    case 'tunic':
    default: {
      const o = sc.add({ ramp: c.cloth, kind: 'cloth' });
      fillCloth(c, o, t, subtract(t.sdf, neckCut(1, 8)));
      folds(c, o, t, t.sdf);
      // Collar trim following the V.
      const trim = sc.add({ ramp: c.cloth2, kind: 'cloth' });
      const v = smoothOpen([[t.nx - g.neckHW - 2, t.top - 1], [t.nx - 2, t.top + 6], [t.nx, t.top + 9], [t.nx + 2, t.top + 6], [t.nx + g.neckHW + 2, t.top - 2]], 6);
      sc.fill(trim, intersect(t.sdf, stroke(v, 1.6, 1.6)), (x, y) => clothLevel(t, x, y, 0.2), undefined, (x, y) => sc.objAt(x, y) === o || sc.kindAt(x, y) === 'skin' && y > t.top - 1);
      return;
    }
  }
}

/** Front layers: cloaks over shoulders. */
export function drawOutfitFront(c: Ctx) {
  if (!c.cape) return;
  const { sc, g } = c;
  const t = torsoShape(c);
  const o = sc.add({ ramp: c.capeRamp, kind: 'cloth' });
  const hood = c.headgear?.family === 'hood';
  const sh = intersect(t.sdf, subtract(
    union(ellipse(t.nx - 30 * t.scale, 100, 22 * t.scale, 26), ellipse(t.nx + 30 * t.scale, 100, 20 * t.scale, 26), ellipse(t.nx, 104, 34 * t.scale, 26)),
    polygon([[t.nx - 9, t.top - 6], [t.nx - 6, 98], [t.nx + 8, 98], [t.nx + 11, t.top - 6]]),
  ));
  sc.fill(o, sh, (x, y) => clothLevel(t, x, y, 0.05), [0, t.top - 4, 95, 95]);
  // Gathered folds.
  for (const fx of [-24, -16, 18, 26]) {
    for (let y = t.top + 8; y < 96; y++) {
      const x = Math.round(t.nx + fx * t.scale + (y - t.top) * 0.15 * Math.sign(fx));
      if (sc.objAt(x, y) === o) { sc.darken(x, y, 1); if (sc.objAt(x - 1, y) === o) sc.shade(x - 1, y, Math.min(5, sc.levelAt(x - 1, y) + 1)); }
    }
  }
  if (!hood) {
    // Clasp.
    const m = sc.add({ ramp: c.metal, kind: 'metal' });
    sc.fill(m, circle(t.nx - 8, t.top + 6, 2.6), (x, y) => metalLevel(x, y, t.nx - 9, t.top + 5, 3, 3));
  }
}
