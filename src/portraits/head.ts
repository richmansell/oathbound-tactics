/**
 * Head: neck, ears, face skin, and facial features (eyes, brows, nose, mouth, extras).
 */
import type { Ctx } from './context';
import { ellipse, polygon, smooth, stroke, bezier, type Pt } from './geom';
import { MOUTH, SCLERA, TEAR, TEETH, PATCH, tintRamp, mix, type Ramp } from './palette';
import { parseSprite, type Obj } from './scene';
import { NOSES } from './features';

// ---------------------------------------------------------------------------
// Neck
// ---------------------------------------------------------------------------

export function drawNeck(c: Ctx) {
  const { sc, g, skin } = c;
  const o = sc.add({ ramp: skin, kind: 'skin', family: 'skin', outline: { bg: 0, over: 1 } });
  const top = g.mouthY - 2, bot = 90;
  const hwAt = (y: number) => g.neckHW + Math.max(0, y - 78) * 0.9;
  for (let y = top; y < bot; y++) {
    const hw = hwAt(y);
    for (let x = Math.floor(g.neckCx - hw - 1); x <= Math.ceil(g.neckCx + hw + 1); x++) {
      const px = x + 0.5;
      if (px < g.neckCx - hw || px > g.neckCx + hw) continue;
      const u = (px - (g.neckCx - hw)) / (2 * hw); // 0 left … 1 right
      // Neck sits in the head's shadow; the lit strip is on the left.
      let lv = u < 0.38 ? 3 : 2;
      // Shadow under the jaw.
      const jawBottom = g.chinY - 2 + (Math.abs(px - g.center(g.chinY)) / (g.hw(g.mouthY) + 1)) * -8;
      if (y < Math.max(g.chinY + 3, jawBottom + 6)) lv = 2;
      if (y < g.chinY + 1 && u > 0.25) lv = 1;
      // Sternocleidomastoid hint.
      if (y > g.chinY + 6 && y < 84 && Math.abs(u - 0.62 - (y - g.chinY) * 0.008) < 0.05) lv = Math.min(lv, 2);
      sc.set(x, y, o, lv);
    }
  }
  // Collarbone notch shadow.
  for (let y = 80; y < 84; y++) sc.set(Math.round(g.neckCx + 1), y, o, 2);
}

// ---------------------------------------------------------------------------
// Ears
// ---------------------------------------------------------------------------

/** Ear centres: near (viewer's left) and far x, shared y. */
export function earPos(c: Ctx): { nx: number; fx: number; y: number } {
  const { g } = c;
  const y = g.eyeY + 3.5;
  return { nx: g.left(y) + 0.6, fx: g.right(y) + 0.2, y };
}

export function drawEars(c: Ctx, which: 'far' | 'near') {
  const { sc, g, skin } = c;
  if (c.species === 'skeleton') return;
  const o = sc.add({ ramp: skin, kind: 'skin', family: 'skin', outline: { bg: 0, over: 1 } });
  const ey = g.eyeY + 3.5;
  const big = c.species === 'goblin' ? 2 : c.species === 'orc' ? 1 : 0;
  if (which === 'near') {
    const ex = g.left(ey) + 1.2;
    if (c.elf || c.species === 'goblin' || c.species === 'orc') {
      const len = c.species === 'goblin' ? 16 : c.elf ? 12 : 8;
      const tip: Pt = [ex - len, ey - (c.species === 'goblin' ? 5 : 9)];
      const pts: Pt[] = [[ex + 2, ey - 4], [ex - 2, ey - 5 - big], tip, [ex - 3, ey + 2], [ex - 1, ey + 5 + big], [ex + 2, ey + 4]];
      const sdf = polygon(pts);
      sc.fill(o, sdf, (x, y) => {
        const t = (ex - x) / len;
        if (y > ey - 3 + t * -4 && x > ex - len * 0.75 && x < ex - 0.5 && y < ey + 3) return 2;
        return y < ey - 2 - t * 4 ? 4 : 3;
      });
    } else {
      const ecx = earPos(c).nx;
      const sdf = ellipse(ecx, ey, 3.4 + big, 5.6 + big);
      sc.fill(o, sdf, (x, y) => {
        const dx = x - ecx, dy = y - ey;
        // Inner ear: C-shaped shadow.
        if (dx > -1.6 && dx < 1.2 && Math.abs(dy) < 3.2) return dx > 0.2 && Math.abs(dy) < 1.6 ? 1 : 2;
        return dy < -2.5 || dx < -1.8 ? 4 : 3;
      });
    }
  } else {
    const ex = g.right(ey) - 0.8;
    if (c.elf || c.species === 'goblin' || c.species === 'orc') {
      const len = c.species === 'goblin' ? 12 : c.elf ? 8 : 5;
      const pts: Pt[] = [[ex - 2, ey - 3], [ex + len, ey - (c.species === 'goblin' ? 5 : 8)], [ex + 1.5, ey + 4], [ex - 2, ey + 4]];
      sc.fill(o, polygon(pts), (x, y) => (x > ex + 1 && y > ey - 4 ? 2 : 3));
    } else {
      sc.fill(o, ellipse(ex + 1, ey, 2.4, 4.8), (x) => (x > ex + 1.5 ? 2 : 3));
    }
  }
}

// ---------------------------------------------------------------------------
// Face skin
// ---------------------------------------------------------------------------

export function faceLight(c: Ctx, x: number, y: number): number {
  const { g } = c;
  // Soft top-left falloff over the skull/face volume.
  const nx = (x - (g.cx - 6)) / (g.R + 10);
  const ny = (y - (g.eyeY - 8)) / 40;
  return 1 - Math.hypot(nx * 1.0, ny * 1.1);
}

/** Face skin levels: midtone base, a clean far-side shadow crescent, light on the near planes. */
export function faceLevel(c: Ctx, x: number, y: number): number {
  const { g } = c;
  let lv = 3;
  const l = faceLight(c, x, y);
  if (l > 0.7) lv = 4;
  // Near cheekbone plane.
  const cbx = g.fx(-g.eyeDx - 1), cby = g.eyeY + 5;
  if (((x - cbx) ** 2) / 10 + ((y - cby + 1) ** 2) / 4 < 1) lv = 4;
  // Far-side shadow crescent hugging the contour below the brow.
  const re = g.right(y);
  const width = 2.2 + 2.8 * smooth(g.browY, g.mouthY, y);
  if (y > g.browY - 4 && x > re - width) lv = 2;
  // Temple shadow above the far eye.
  if (y > g.browY - 6 && y < g.browY + 1 && x > re - 4) lv = 2;
  // Underside of the jaw.
  const bottom = jawBottom(c, x);
  if (bottom - y < 2.2 && y > g.mouthY + 2) lv = Math.min(lv, 2);
  if (bottom - y < 3.6 && y > g.mouthY + 2 && x > g.center(y) + 1) lv = 2;
  // Eye sockets (just inside the brow).
  for (const s of [-1, 1]) {
    const ex = g.fx(s * g.eyeDx);
    if (Math.abs(x - ex - s * 1.5) < 4.5 && y > g.browY + 1.6 && y < g.eyeY - 2 && s > 0) lv = Math.min(lv, 2);
  }
  // Near-side contour gets reflected-light midtone.
  if (x < g.left(y) + 1.6 && y > g.eyeY) lv = Math.min(lv, 3);
  return lv;
}

function jawBottom(c: Ctx, x: number): number {
  const { g } = c;
  // Lowest face y for this column.
  let y = g.chinY + 1;
  while (y > g.mouthY && !g.inFace(x, y)) y -= 0.5;
  return y;
}

export function drawFace(c: Ctx): Obj {
  const { sc, g, skin } = c;
  const o = sc.add({ ramp: skin, kind: 'skin', family: 'skin', outline: { bg: 0, bgLit: 1, over: 1 } });
  for (let y = Math.floor(g.top); y <= Math.ceil(g.chinY + 1); y++) {
    for (let x = 0; x < sc.w; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!g.inFace(px, py)) continue;
      sc.set(x, y, o, faceLevel(c, px, py));
    }
  }
  // Forehead specular.
  const fh = g.fx(-4);
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]) {
    const x = Math.round(fh) + dx, y = g.browY - 7 + dy;
    if (sc.kindAt(x, y) === 'skin') sc.shade(x, y, 5);
  }
  // Chin highlight.
  const cxh = Math.round(g.fx(-1));
  for (const dx of [0, 1]) if (sc.kindAt(cxh + dx, g.chinY - 3) === 'skin') sc.shade(cxh + dx, g.chinY - 3, 4);
  return o;
}

// ---------------------------------------------------------------------------
// Feature sprites
// ---------------------------------------------------------------------------

interface PaintCtx { feat: Obj; c: Ctx; lip: Ramp; beast?: boolean }

function paintChar(p: PaintCtx, ch: string, x: number, y: number) {
  const { feat, c } = p;
  const sc = c.sc;
  const skinUnder = () => { const k = sc.kindAt(x, y); return k === 'skin'; };
  switch (ch) {
    case 'K': sc.set(x, y, feat, 0, c.skin); break;
    case 'k': sc.set(x, y, feat, 1, c.skin); break;
    case 'W': if (p.beast) sc.set(x, y, feat, 3, c.eyeRamp); else sc.set(x, y, feat, 4, SCLERA); break;
    case 'w': if (p.beast) sc.set(x, y, feat, 2, c.eyeRamp); else sc.set(x, y, feat, 3, SCLERA); break;
    case 'i': sc.set(x, y, feat, 1, c.eyeRamp); break;
    case 'I': sc.set(x, y, feat, 2, c.eyeRamp); break;
    case 'L': sc.set(x, y, feat, 3, c.eyeRamp); break;
    case 'P': sc.set(x, y, feat, 0, c.eyeRamp); break;
    case 'H': sc.set(x, y, feat, 5, SCLERA); break;
    case 'S': if (skinUnder()) sc.shade(x, y, Math.min(sc.levelAt(x, y), 2)); break;
    case 'D': if (skinUnder()) sc.shade(x, y, 1); break;
    case 's': if (skinUnder()) sc.shade(x, y, Math.max(sc.levelAt(x, y), 4)); break;
    case 'x': if (skinUnder()) sc.shade(x, y, 3); break;
    case 'B': sc.set(x, y, feat, 1, c.brow); break;
    case 'b': sc.set(x, y, feat, 2, c.brow); break;
    case 'T': sc.set(x, y, feat, 4, TEAR); break;
    case 't': sc.set(x, y, feat, 3, TEAR); break;
    case 'M': sc.set(x, y, feat, 1, MOUTH); break;
    case 'm': sc.set(x, y, feat, 2, MOUTH); break;
    case 'G': sc.set(x, y, feat, 4, MOUTH); break;
    case 'E': sc.set(x, y, feat, 4, TEETH); break;
    case 'e': sc.set(x, y, feat, 2, TEETH); break;
    case 'R': sc.set(x, y, feat, 3, p.lip); break;
    case 'r': sc.set(x, y, feat, 2, p.lip); break;
  }
}

function drawSprite(p: PaintCtx, rows: string[], x0: number, y0: number, mirror = false, dropCol = -1) {
  const sp = parseSprite(rows);
  let ox = 0;
  for (let sx = 0; sx < sp.w; sx++) {
    const col = mirror ? sp.w - 1 - sx : sx;
    if (sx === dropCol) continue;
    for (let sy = 0; sy < sp.h; sy++) {
      const ch = sp.at(col, sy);
      if (ch) paintChar(p, ch, Math.round(x0) + ox, Math.round(y0) + sy);
    }
    ox++;
  }
}

/** Draw an expression eye/brow sprite centred at x (used by beast heads). */
export function drawFeatureSprite(c: Ctx, kind: 'eye' | 'brow', cx: number, top: number, far: boolean, beast: boolean) {
  const feat = c.sc.add({ ramp: c.skin, kind: 'feature', outline: false, cast: false, receive: false, exact: true });
  const p: PaintCtx = { feat, c, lip: c.skin, beast };
  const ed = c.ed;
  const rows = kind === 'eye' ? (far ? ed.eyeFar ?? ed.eye : ed.eye) : (far ? ed.browFar ?? ed.brow : ed.brow);
  const dy = kind === 'brow' ? (far ? ed.browFarDy ?? ed.browDy : ed.browDy) : 0;
  drawSprite(p, rows, far ? cx - 4 : cx - 5, top + dy, far, far ? 8 : -1);
}

export function drawFeatures(c: Ctx) {
  const { sc, g, ed } = c;
  const feat = sc.add({ ramp: c.skin, kind: 'feature', outline: false, cast: false, receive: false, exact: true });
  const lip = tintRamp(c.skin, [196, 72, 88], c.female ? 0.32 : 0.12);
  const p: PaintCtx = { feat, c, lip };

  // Nose (anchored so column 1 is the bridge on the midline).
  const noseKind = c.species === 'orc' ? 'large'
    : c.age === 'young' ? 'button'
    : c.female ? 'small'
    : c.age === 'old' ? 'hooked'
    : c.build === 'broad' ? 'large'
    : c.vary[5] > 0.7 ? 'hooked' : 'medium';
  const nose = NOSES[noseKind];
  drawSprite(p, nose, g.fx(0.5) - 1, g.noseY - nose.length + 1);

  // Eyes.
  const nearX = g.fx(-g.eyeDx), farX = g.fx(g.eyeDx);
  const eyeTop = g.eyeY - 2;
  drawSprite(p, ed.eye, nearX - 5, eyeTop);
  drawSprite(p, ed.eyeFar ?? ed.eye, farX - 4, eyeTop, true, 8);
  // Female lashes: extra flick at the outer corners.
  if (c.female && c.species === 'human' && c.expr !== 'hurt') {
    const lashY = eyeTop + (c.expr === 'smirk' ? 1 : c.expr === 'happy' ? 1 : 0);
    sc.set(Math.round(nearX - 5), lashY, feat, 0, c.skin);
    sc.set(Math.round(nearX - 6), lashY - 1, feat, 0, c.skin);
    sc.set(Math.round(farX + 4), lashY, feat, 0, c.skin);
    sc.set(Math.round(farX + 5), lashY - 1, feat, 0, c.skin);
  }

  // Brows.
  const browTop = g.browY - 1;
  drawSprite(p, ed.brow, nearX - 5, browTop + ed.browDy);
  drawSprite(p, ed.browFar ?? ed.brow, farX - 4, browTop + (ed.browFarDy ?? ed.browDy), true, 8);
  if (c.build === 'broad' || c.species === 'orc') {
    // Heavier brows: thicken downward.
    thickenBrows(c, feat);
  }
  if (ed.knit) {
    const kx = Math.round(g.fx(0) - 0.5);
    for (const dy of [0, 1]) if (sc.kindAt(kx, g.browY + dy) === 'skin') sc.shade(kx, g.browY + dy, 2);
  }

  // Mouth.
  const soft = (c.female || c.age === 'young') && ed.mouthSoft ? ed.mouthSoft : ed.mouth;
  const mw = parseSprite(soft).w;
  drawSprite(p, soft, g.fx(0.5 + (ed.mouthDx ?? 0)) - mw / 2 + 0.5, g.mouthY - 1);
  // Under-lip shadow / philtrum for males.
  if (!c.female && c.age !== 'young') {
    const px = Math.round(g.fx(0.5));
    if (sc.kindAt(px, g.mouthY - 3) === 'skin') sc.shade(px, g.mouthY - 3, Math.min(3, sc.levelAt(px, g.mouthY - 3)));
  }

  // Cheeks / extras.
  if (ed.blush && (c.female || c.age === 'young')) blush(c, feat);
  if (c.age === 'old') wrinkles(c, feat);
  if (c.ap.portrait?.freckles) freckles(c);
  if (c.ap.portrait?.scar) scar(c, feat, c.ap.portrait.scar);
  if (ed.tear) tear(c, feat);
  if (ed.sweat) sweat(c, feat);
  if (c.species === 'orc') tusks(c, feat);
  if (c.species === 'zombie') zombieMarks(c, feat);
}

function thickenBrows(c: Ctx, feat: Obj) {
  const { sc } = c;
  const adds: [number, number][] = [];
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    const i = y * sc.w + x;
    if (sc.obj[i] === feat.id && sc.ramps[sc.ramp[i]] === c.brow && sc.kindAt(x, y + 1) === 'skin') adds.push([x, y + 1]);
  }
  for (const [x, y] of adds) sc.set(x, y, feat, 1, c.brow);
}

function blush(c: Ctx, feat: Obj) {
  const { sc, g } = c;
  const blushRamp = tintRamp(c.skin, [230, 90, 100], 0.4);
  for (const s of [-1, 1]) {
    const bx = Math.round(g.fx(s * (g.eyeDx + 1)) - 1), by = g.eyeY + 4;
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, -0]]) {
      const x = bx + dx, y = by + dy;
      if (sc.kindAt(x, y) === 'skin') sc.set(x, y, feat, Math.max(2, sc.levelAt(x, y)), blushRamp);
    }
    for (const dx of [0, 2]) {
      const x = bx + dx + 1, y = by - 1;
      if (sc.kindAt(x, y) === 'skin') sc.set(x, y, feat, 3, blushRamp);
    }
  }
}

function wrinkles(c: Ctx, feat: Obj) {
  const { sc, g } = c;
  const line = (pts: Pt[]) => {
    for (const [x, y] of pts) if (sc.kindAt(x, y) === 'skin') sc.shade(x, y, Math.min(2, sc.levelAt(x, y)));
  };
  const nx = Math.round(g.fx(-g.eyeDx)), fxr = Math.round(g.fx(g.eyeDx));
  // Crow's feet.
  line([[nx - 6, g.eyeY - 1], [nx - 6, g.eyeY + 1], [nx - 7, g.eyeY + 2]]);
  line([[fxr + 5, g.eyeY], [fxr + 5, g.eyeY + 2]]);
  // Under-eye bags.
  line([[nx - 2, g.eyeY + 3], [nx - 1, g.eyeY + 3], [nx, g.eyeY + 3], [fxr, g.eyeY + 3], [fxr + 1, g.eyeY + 3]]);
  // Forehead lines.
  const fx0 = Math.round(g.fx(-6)), fx1 = Math.round(g.fx(6));
  for (let x = fx0; x <= fx1; x++) if ((x + 1) % 5 !== 0) line([[x, g.browY - 5]]);
  // Nasolabial folds.
  const mx = g.fx(0.5);
  line([[Math.round(mx - 6), g.noseY], [Math.round(mx - 7), g.noseY + 1], [Math.round(mx - 7), g.noseY + 2], [Math.round(mx - 7), g.noseY + 3]]);
  line([[Math.round(mx + 6), g.noseY + 1], [Math.round(mx + 6), g.noseY + 2], [Math.round(mx + 6), g.noseY + 3]]);
}

function freckles(c: Ctx) {
  const { sc, g } = c;
  const pts: [number, number][] = [[-9, 5], [-7, 6], [-5, 5], [-8, 7], [-3, 6], [3, 6], [5, 5], [7, 6], [6, 7], [-1, 4]];
  for (const [dx, dy] of pts) {
    const x = Math.round(g.fx(dx)), y = g.eyeY + dy;
    if (sc.kindAt(x, y) === 'skin') sc.shade(x, y, Math.max(1, sc.levelAt(x, y) - 2));
  }
}

function scar(c: Ctx, feat: Obj, where: string) {
  const { sc, g } = c;
  const scarRamp = tintRamp(c.skin, [235, 200, 200], 0.35);
  const mark = (x: number, y: number, lv: number) => {
    if (sc.kindAt(x, y) === 'skin' || sc.objAt(x, y) === feat) sc.set(x, y, feat, lv, scarRamp);
  };
  const run = (pts: Pt[]) => {
    for (const [x, y] of pts) { mark(Math.round(x), Math.round(y), 4); mark(Math.round(x) + 1, Math.round(y), 1); }
  };
  if (where === 'right-eye') {
    // Viewer's right = far eye; vertical slash through brow and cheek.
    const x = g.fx(g.eyeDx + 1);
    run([[x - 1, g.browY - 4], [x - 1, g.browY - 3], [x, g.browY - 2], [x, g.browY - 1], [x, g.browY], [x + 0.5, g.eyeY + 3], [x + 1, g.eyeY + 4], [x + 1, g.eyeY + 5], [x + 1.5, g.eyeY + 6]]);
  } else if (where === 'left-cheek') {
    const x = g.fx(-g.eyeDx - 1), y = g.eyeY + 5;
    run([[x - 3, y - 1], [x - 2, y], [x - 1, y + 1], [x, y + 2], [x + 1, y + 3]]);
  } else if (where === 'nose') {
    const x = g.fx(0), y = g.noseY - 4;
    run([[x - 4, y + 1], [x - 2, y], [x, y], [x + 2, y - 1], [x + 4, y - 1]].map(([a, b]) => [a, b] as Pt));
    for (const [a, b] of [[x - 4, y + 1], [x - 3, y + 1], [x - 2, y], [x - 1, y], [x, y], [x + 1, y - 1], [x + 2, y - 1], [x + 3, y - 1]]) mark(Math.round(a), Math.round(b), 4);
  } else if (where === 'lip') {
    const x = g.fx(-2), y = g.mouthY;
    for (const [a, b] of [[x, y - 3], [x, y - 2], [x + 1, y - 1], [x + 1, y + 1], [x + 1, y + 2]]) mark(Math.round(a), Math.round(b), 4);
  }
}

function tear(c: Ctx, feat: Obj) {
  const { sc, g } = c;
  const x = Math.round(g.fx(-g.eyeDx) - 1), y = g.eyeY + 2;
  sc.set(x, y, feat, 5, TEAR); sc.set(x, y + 1, feat, 4, TEAR); sc.set(x, y + 2, feat, 3, TEAR);
}

function sweat(c: Ctx, feat: Obj) {
  const { sc, g } = c;
  const x = Math.round(g.right(g.browY) - 4), y = g.browY - 4;
  const rows = ['.T.', 'TTt', 'THt', '.t.'];
  rows.forEach((r, dy) => [...r].forEach((ch, dx) => {
    if (ch === 'T') sc.set(x + dx, y + dy, feat, 4, TEAR);
    if (ch === 't') sc.set(x + dx, y + dy, feat, 2, TEAR);
    if (ch === 'H') sc.set(x + dx, y + dy, feat, 5, TEAR);
  }));
}

function tusks(c: Ctx, feat: Obj) {
  const { sc, g } = c;
  for (const s of [-1, 1]) {
    const x = Math.round(g.fx(0.5 + s * 4.5)), y = g.mouthY - 1;
    sc.set(x, y, feat, 5, TEETH); sc.set(x, y + 1, feat, 4, TEETH); sc.set(x + 1, y + 1, feat, 2, TEETH);
    sc.set(x, y - 1, feat, 4, TEETH);
  }
}

function zombieMarks(c: Ctx, feat: Obj) {
  const { sc, g } = c;
  // Sunken sockets.
  for (const s of [-1, 1]) {
    const ex = Math.round(g.fx(s * g.eyeDx));
    for (let dx = -4; dx <= 4; dx++) {
      for (const y of [g.eyeY - 3, g.eyeY + 2]) if (sc.kindAt(ex + dx, y) === 'skin') sc.shade(ex + dx, y, 1);
    }
  }
  // Stitches across the forehead.
  const sx = Math.round(g.fx(-5));
  for (let i = 0; i < 9; i++) {
    const x = sx + i, y = g.browY - 6 + (i > 4 ? 1 : 0);
    if (sc.kindAt(x, y) === 'skin') sc.set(x, y, feat, 1, c.skin);
    if (i % 2 === 0) { sc.set(x, y - 1, feat, 0, c.skin); sc.set(x, y + 1, feat, 0, c.skin); }
  }
}

/** Eyepatch: strap across the head + patch over one eye. Drawn after hair. */
export function drawEyepatch(c: Ctx) {
  const side = c.ap.portrait?.eyepatch;
  if (!side) return;
  const { sc, g } = c;
  const strap = sc.add({ ramp: PATCH, kind: 'patch', outline: { bg: 0, over: 0 } });
  const near = side === 'left';
  const ex = g.fx((near ? -1 : 1) * g.eyeDx);
  const ey = g.eyeY;
  // Strap: from patch up across the forehead to the far side of the head.
  // Long strap: from the patch up over the forehead to the opposite side of the skull.
  const far: Pt = near ? [g.right(g.top + 12) + 1, g.top + 9] : [g.left(g.top + 13) - 1, g.top + 10];
  const ctrl: Pt = [g.fx(0), g.browY - 9];
  sc.fill(strap, stroke(bezier([[ex, ey - 2], ctrl, far], 30), 0.9, 0.9), (x, y) => (y < g.browY - 6 ? 3 : 2));
  // Short strap back to the ear on the patch side.
  const earSide: Pt = near ? [g.left(ey - 2) + 0.5, ey - 3] : [g.right(ey - 2) - 0.5, ey - 3];
  sc.fill(strap, stroke([[ex, ey - 1], earSide], 0.8, 0.8), () => 2);
  const patch = sc.add({ ramp: PATCH, kind: 'patch', outline: { bg: 0, over: 0 } });
  sc.fill(patch, ellipse(ex + 0.5, ey + 0.5, 5, 3.8), (x, y) => (x < ex - 1 && y < ey ? 4 : y > ey + 1.5 ? 2 : 3));
}

/** Stubble overlay (5 o'clock shadow). */
export function stubbleRamp(c: Ctx): Ramp {
  return c.skin.map((col, i) => mix(col, c.hair[Math.min(5, i)], 0.35)) as Ramp;
}

