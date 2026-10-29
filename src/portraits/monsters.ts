/**
 * Non-human heads that need their own construction: skeleton, wolf (beast muzzle), lizard.
 * Orc / goblin / zombie reuse the human head with tweaks (see head.ts).
 */
import type { Ctx } from './context';
import type { Expression } from '../content/schema';
import { band, ellipse, polygon, smoothClosed, LIGHT, type Pt, type SDF } from './geom';
import { BONE, GLOW_BLUE, GLOW_RED, MOUTH, TEETH, type Ramp } from './palette';
import type { Obj } from './scene';
import { drawFeatureSprite } from './head';

export function drawMonsterHead(c: Ctx) {
  if (c.species === 'skeleton') return skull(c);
  return beast(c, c.species === 'lizard');
}

function sphereLv(x: number, y: number, cx: number, cy: number, rx: number, ry: number, th: number[], bias = 0): number {
  let nx = (x - cx) / rx, ny = (y - cy) / ry;
  const k = nx * nx + ny * ny;
  if (k > 1) { const s = 1 / Math.sqrt(k); nx *= s; ny *= s; }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return band(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias, th, 1);
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const JAW_DROP: Record<Expression, number> = { neutral: 0, happy: 2, angry: 3, sad: 0, surprised: 5, determined: 0, hurt: 2, smirk: 1 };

function skull(c: Ctx) {
  const { sc, g, expr } = c;
  const bone = BONE;
  const drop = JAW_DROP[expr];
  const mid = g.fx(0.5);
  const o = sc.add({ ramp: bone, kind: 'skin', family: 'skull', outline: { bg: 0, bgLit: 1, over: 1 } });
  const upperBottom = g.mouthY - 1;
  const pinch = (x: number, y: number) => {
    // Hollow under the cheekbones on both sides.
    if (y < g.noseY - 3 || y > upperBottom + 1) return false;
    return x < g.left(y) + 3.5 || x > g.right(y) - 3;
  };
  sc.fill(o, (x, y) => (g.inFace(x, y) && y < upperBottom && !pinch(x, y) ? -1 : 1), (x, y) => {
    let lv = sphereLv(x, y, g.cx - 7, g.top + 8, g.R + 8, g.R + 14, [-0.1, 0.3, 0.7, 0.92]);
    if (x > g.right(y) - 4 && y > g.browY) lv = Math.min(lv, 2);
    return lv;
  });
  // Maxilla (upper jaw block) narrower than the cranium.
  sc.fill(o, polygon([[mid - 9, g.noseY - 2], [mid + 9, g.noseY - 2], [mid + 8, upperBottom + 1], [mid - 8, upperBottom + 1]]), (x) => (x > mid + 3 ? 2 : 3));
  // Mandible.
  const jaw = sc.add({ ramp: bone, kind: 'skin', family: 'skull2', outline: { bg: 0, over: 1 } });
  const jx = expr === 'smirk' ? 1 : 0;
  const jawSdf: SDF = (x, y) => {
    const yy = y - drop, xx = x - jx;
    if (yy < g.mouthY + 1 || !g.inFace(xx, yy)) return 1;
    if (yy < g.mouthY + 4 && (xx < g.left(yy) + 2.5 || xx > g.right(yy) - 2)) return 1;
    return -1;
  };
  sc.fill(jaw, jawSdf, (x, y) => (x > g.center(y) + 2 ? 2 : y > g.chinY + drop - 3 ? 2 : 3));
  // Mouth gap.
  const gapO = sc.add({ ramp: MOUTH, kind: 'feature', outline: false, cast: false, exact: true });
  if (drop > 0) {
    for (let y = upperBottom + 1; y < g.mouthY + 1 + drop; y++) for (let x = Math.round(mid - 7); x <= Math.round(mid + 7); x++) {
      if (!sc.objAt(x, y) || sc.kindAt(x, y) === 'skin' || sc.kindAt(x, y) === 'cloth') sc.set(x, y, gapO, 0);
    }
  }
  // Teeth rows.
  const tO = sc.add({ ramp: TEETH, kind: 'feature', outline: false, cast: false, exact: true });
  for (let x = Math.round(mid - 7); x <= Math.round(mid + 7); x++) {
    const gap = (x - Math.round(mid)) % 2 === 0;
    for (const y of [upperBottom - 1, upperBottom]) sc.set(x, y, tO, gap ? 1 : x > mid + 3 ? 3 : 4);
    for (const y of [g.mouthY + 1 + drop, g.mouthY + 2 + drop]) sc.set(x + jx, y, tO, gap ? 1 : x > mid + 3 ? 3 : 4);
  }
  // Nose cavity.
  const cav = sc.add({ ramp: bone, kind: 'feature', outline: false, cast: false, exact: true });
  const nx = Math.round(mid), ny = g.noseY - 4;
  for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2], [-2, 0], [0, -1]]) sc.set(nx + dx, ny + dy, cav, dx === 1 ? 1 : 0);
  // Eye sockets with glow.
  const glow: Ramp = expr === 'angry' || expr === 'hurt' ? GLOW_RED : GLOW_BLUE;
  for (const side of [-1, 1] as const) socket(c, cav, glow, g.fx(side * (g.eyeDx + 0.5)), g.eyeY, side);
  // Crack.
  for (const [dx, dy] of [[-6, 0], [-5, 1], [-5, 2], [-4, 3], [-4, 4], [-3, 5]]) {
    const x = Math.round(g.cx + dx), y = g.top + 4 + dy;
    if (sc.objAt(x, y) === o) sc.shade(x, y, 1);
  }
}

function socket(c: Ctx, cav: Obj, glow: Ramp, ex: number, ey: number, side: -1 | 1) {
  const { sc, expr } = c;
  const rx = side > 0 ? 3.6 : 4.4, ry = 4;
  const near = side < 0;
  // Brow cut: some expressions cover part of the socket with bone.
  const cut = (x: number, y: number): boolean => {
    const u = (x - ex) * -side; // + toward the outer corner
    switch (expr) {
      case 'angry': return y < ey - 3 + (-u + 4) * 0.55;
      case 'sad': return y < ey - 3 + (u + 4) * 0.5;
      case 'determined': return y < ey - 1.5;
      case 'smirk': return near && y < ey - 1;
      case 'happy': return y > ey + 1.5;
      case 'hurt': return y < ey - 1 + (-u) * 0.3;
      default: return false;
    }
  };
  const sock = ellipse(ex, ey + 0.5, rx, ry * (expr === 'surprised' ? 1.15 : 1));
  for (let y = Math.floor(ey - 6); y <= Math.ceil(ey + 6); y++) for (let x = Math.floor(ex - 6); x <= Math.ceil(ex + 6); x++) {
    if (sock(x + 0.5, y + 0.5) > 0 || cut(x + 0.5, y + 0.5)) continue;
    sc.set(x, y, cav, 0);
  }
  // Glow pupil.
  const gx = Math.round(ex + (side > 0 ? 0 : 0.5)), gy = Math.round(ey);
  const put = (dx: number, dy: number, lv: number) => sc.set(gx + dx, gy + dy, cav, lv, glow);
  switch (expr) {
    case 'surprised': put(0, 0, 5); put(-1, -2, 2); put(1, -2, 2); put(-2, 0, 2); put(2, 0, 2); put(0, 2, 2); break;
    case 'happy': put(-1, 0, 4); put(0, -1, 5); put(1, 0, 4); break;
    case 'hurt': if (near) { put(-1, -1, 3); put(1, 1, 3); put(0, 0, 4); put(1, -1, 3); put(-1, 1, 3); } else { put(0, 1, 4); put(1, 1, 3); } break;
    case 'determined': case 'smirk': put(0, 0, 5); put(1, 0, 4); put(0, 1, 3); break;
    default: put(0, 0, 5); put(1, 0, 4); put(0, 1, 4); put(1, 1, 3); put(0, -1, 2);
  }
}

// ---------------------------------------------------------------------------
// Beast heads (wolf / lizard)
// ---------------------------------------------------------------------------

const MOUTH_OPEN: Record<Expression, number> = { neutral: 0, happy: 3, angry: 4, sad: 0, surprised: 5, determined: 0, hurt: 2, smirk: 0 };

function beast(c: Ctx, lizard: boolean) {
  const { sc, g, expr } = c;
  const fur = c.skin;
  const open = MOUTH_OPEN[expr];
  const snout = lizard ? 14 : 11;
  const tipX = g.fx(g.R) + snout - 4;
  const noseY = g.noseY - (lizard ? 3 : 2);
  const corner: Pt = [g.fx(2), g.mouthY + (expr === 'happy' || expr === 'smirk' ? -1 : expr === 'sad' ? 2 : 1)];

  if (!lizard) {
    // Ears (far ear behind the head).
    const ear = (pts: Pt[], inner: Pt[], dark: boolean) => {
      const eo = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: { bg: 0, over: 1 } });
      sc.fill(eo, polygon(pts), (x, y) => (dark ? 2 : y < pts[1][1] + 6 ? 4 : 3));
      const io = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: false });
      sc.fill(io, polygon(inner), () => 1);
    };
    ear([[g.cx + 3, g.top + 6], [g.cx + 13, g.top - 9], [g.cx + g.R - 1, g.top + 9]], [[g.cx + 7, g.top + 5], [g.cx + 12.5, g.top - 4], [g.cx + 15, g.top + 6]], true);
  }

  // Cranium + cheek ruff.
  const head = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: { bg: 0, bgLit: 1, over: 1 } });
  const ruff: Pt[] = [];
  const cxh = g.cx - 1, cyh = g.cy0 + 4;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tuft = !lizard && Math.sin(a) > -0.2 ? (i % 2 ? 3.5 : 0) : 0;
    const rx = g.R + 1 + tuft, ry = g.R + (lizard ? -1 : 1) + tuft;
    ruff.push([cxh + Math.cos(a) * rx, cyh + Math.sin(a) * ry * (Math.sin(a) > 0 ? 1.05 : 0.95)]);
  }
  const headSdf = polygon(lizard ? smoothClosed(ruff, 3) : ruff);
  sc.fill(head, headSdf, (x, y) => {
    let lv = sphereLv(x, y, cxh - 8, cyh - 10, g.R + 8, g.R + 10, [-0.05, 0.35, 0.75], 0.0);
    if (lizard) {
      const row = Math.floor(y / 3);
      const xi = Math.floor(x + (row % 2) * 2);
      if (Math.floor(y) % 3 === 0 && xi % 4 !== 0) lv = Math.max(1, lv - 1);
    }
    return Math.min(lv, 4);
  });

  // Lower jaw (behind the muzzle).
  const jaw = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: { bg: 0, over: 1 } });
  const jawPts: Pt[] = [[g.fx(-6), g.mouthY - 1], [tipX - 3, noseY + 4 + open * 0.6], [tipX - 4, noseY + 7 + open], [g.fx(4), g.chinY - 2 + open * 0.4], [g.fx(-7), g.chinY - 3]];
  sc.fill(jaw, polygon(smoothClosed(jawPts, 3)), (x, y) => (y > noseY + 6 + open * 0.6 ? 2 : 3));
  // Mouth interior.
  if (open > 0) {
    const mo = sc.add({ ramp: MOUTH, kind: 'feature', outline: false, cast: false });
    const mouthPts: Pt[] = [corner, [tipX - 3, noseY + 3], [tipX - 4, noseY + 4 + open], [g.fx(6), corner[1] + open * 0.5]];
    sc.fill(mo, polygon(mouthPts), (x, y) => (y > noseY + 2 + open * 0.7 ? 3 : 1));
  }

  // Muzzle.
  const mz = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: { bg: 0, bgLit: 1, over: 1 } });
  const muzzlePts: Pt[] = lizard
    ? [[g.fx(-7), g.eyeY + 3], [g.fx(4), g.eyeY + 1], [tipX - 3, noseY - 3], [tipX + 1, noseY], [tipX - 1, noseY + 3], corner, [g.fx(-6), g.mouthY - 1]]
    : [[g.fx(-6), g.eyeY + 3], [g.fx(3), g.eyeY + 1.5], [tipX - 4, noseY - 4], [tipX, noseY - 2], [tipX + 0.5, noseY + 1.5], [tipX - 3, noseY + 3], corner, [g.fx(-7), g.mouthY - 1]];
  sc.fill(mz, polygon(smoothClosed(muzzlePts, 3)), (x, y) => {
    // Top plane of the muzzle catches light; underside lighter fur on wolves.
    if (y < noseY - 1 - (x - g.fx(0)) * 0.12) return 4;
    if (!lizard && y > noseY + 1) return 4;
    return 3;
  });
  // Lizard scales on the muzzle top.
  if (lizard) {
    for (let x = Math.round(g.fx(0)); x < tipX - 2; x += 3) {
      const y = Math.round(noseY - 3 - (tipX - x) * 0.1);
      if (sc.objAt(x, y) === mz) sc.shade(x, y, 2);
    }
  }
  // Nose.
  const nose = sc.add({ ramp: lizard ? fur : MOUTH, kind: 'feature', outline: false, cast: false, exact: true });
  if (lizard) {
    sc.set(Math.round(tipX - 2), Math.round(noseY - 1), nose, 0);
  } else {
    const nk: Ramp = [[10, 8, 12], [22, 18, 24], [40, 34, 42], [70, 62, 72], [120, 112, 124], [170, 165, 175]];
    sc.fill(nose, ellipse(tipX - 1, noseY - 0.5, 2.6, 2), (x, y) => (x < tipX - 2 && y < noseY - 1 ? 3 : 1));
    for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) if (sc.objAt(x, y) === nose) sc.set(x, y, nose, sc.levelAt(x, y), nk);
  }
  // Mouth line + fangs.
  const ml = sc.add({ ramp: fur, kind: 'feature', outline: false, cast: false, exact: true });
  const line = (a: Pt, b: Pt) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.5);
    for (let i = 0; i <= steps; i++) sc.set(Math.round(a[0] + ((b[0] - a[0]) * i) / steps), Math.round(a[1] + ((b[1] - a[1]) * i) / steps), ml, 0);
  };
  line(corner, [tipX - 3, noseY + 3]);
  if (open > 0) line(corner, [tipX - 4, noseY + 4 + open]);
  if (open > 0 || expr === 'angry' || expr === 'determined') {
    const tO = sc.add({ ramp: TEETH, kind: 'feature', outline: false, cast: false, exact: true });
    const fx1 = Math.round(tipX - 6), fy = noseY + 4;
    for (const [dx, dy, lv] of [[0, 0, 5], [0, 1, 4], [-5, 0, 4], [-5, 1, 3]] as const) sc.set(fx1 + dx, fy + dy, tO, lv);
    if (open > 2) for (const [dx, dy] of [[-1, open + 1], [-6, open]]) sc.set(fx1 + dx, fy + dy, tO, 4);
  }

  // Near ear in front.
  if (!lizard) {
    const eo = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: { bg: 0, over: 1 } });
    const pts: Pt[] = [[g.cx - g.R + 1, g.top + 10], [g.cx - g.R + 1, g.top - 9], [g.cx - 3, g.top + 3]];
    sc.fill(eo, polygon(pts), (x, y) => (x < g.cx - g.R + 4 ? 4 : 3));
    const io = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: false });
    sc.fill(io, polygon([[g.cx - g.R + 3.5, g.top + 7], [g.cx - g.R + 3, g.top - 3], [g.cx - 6, g.top + 4]]), () => 1);
  } else {
    // Crest spikes.
    for (let i = 0; i < 4; i++) {
      const so = sc.add({ ramp: fur, kind: 'skin', family: 'beast', outline: { bg: 0, over: 1 } });
      const a = -2.6 + i * 0.42;
      const bx = cxh + Math.cos(a) * (g.R - 2), by = cyh + Math.sin(a) * (g.R - 3);
      const tx = cxh + Math.cos(a - 0.15) * (g.R + 7), ty = cyh + Math.sin(a - 0.15) * (g.R + 6);
      sc.fill(so, polygon([[bx - 3, by + 1], [tx, ty], [bx + 3, by + 1]]), (x) => (x < tx ? 3 : 2));
    }
  }

  // Eyes and brows (shared expression sprites; beasts have no sclera).
  drawFeatureSprite(c, 'eye', g.fx(-g.eyeDx + 1.5), g.eyeY - 3, false, true);
  drawFeatureSprite(c, 'eye', g.fx(g.eyeDx - 1), g.eyeY - 3, true, true);
  drawFeatureSprite(c, 'brow', g.fx(-g.eyeDx + 1.5), g.browY - 2, false, true);
  drawFeatureSprite(c, 'brow', g.fx(g.eyeDx - 1), g.browY - 2, true, true);
}
