/**
 * Hair and beards. Hair is built from a skull "cap", a back mass and tapered locks
 * (bangs, side locks, tails). Locks share a family so they get thin separation lines
 * between clumps instead of full outlines.
 */
import type { Ctx } from './context';
import { band, bezier, circle, ellipse, LIGHT, polygon, smooth, smoothOpen, strokeHit, strokeBox, union, type Pt, type SDF } from './geom';
import { mix, type Ramp } from './palette';
import type { Obj } from './scene';
import { earPos, stubbleRamp } from './head';

// ---------------------------------------------------------------------------
// Shading helpers
// ---------------------------------------------------------------------------

function hairBase(c: Ctx, x: number, y: number): number {
  const { g } = c;
  const vol = c.hairStyle?.vol ?? 3;
  const r = g.R + vol + 3;
  const cx = g.cx - 2, cy = g.cy0 - 3;
  let nx = (x - cx) / r, ny = (y - cy) / (r * 1.15);
  const k = nx * nx + ny * ny;
  if (k > 1) { const s = 1 / Math.sqrt(k); nx *= s; ny *= s; }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  let l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  // Hair below the skull falls into shadow progressively.
  if (y > g.eyeY) l -= 0.25 * smooth(g.eyeY, 96, y);
  return l;
}

/** Streak pattern radiating from the crown: gives clumps rather than noise. */
function streak(c: Ctx, x: number, y: number): number {
  const { g } = c;
  const a = Math.atan2(y - (g.top - 6), x - (g.cx + 2));
  const s = c.vary[6] * 6.28;
  return 0.5 * Math.sin(a * 23 + s) + 0.3 * Math.sin(a * 41 + s * 2.1) + 0.2 * Math.sin(a * 67 + s * 0.7);
}

function hairLevel(c: Ctx, l: number): number {
  return band(l, [-0.32, 0.1, 0.5, 0.86], 1);
}

interface Lock { pts: Pt[]; w0: number; w1: number }

function lockOf(p: Pt[], w0: number, w1: number): Lock {
  return { pts: p.length > 4 ? smoothOpen(p, 6) : bezier(p, 18), w0, w1 };
}

/** Rasterise a lock with lateral cylinder shading. */
function drawLock(c: Ctx, o: Obj, L: Lock, bias = 0, clip?: SDF) {
  const { sc } = c;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of L.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = Math.max(L.w0, L.w1) + 1;
  for (let y = Math.floor(y0 - pad); y <= Math.ceil(y1 + pad); y++) {
    for (let x = Math.floor(x0 - pad); x <= Math.ceil(x1 + pad); x++) {
      const px = x + 0.5, py = y + 0.5;
      if (clip && clip(px, py) > 0) continue;
      const h = strokeHit(L.pts, L.w0, L.w1, px, py);
      if (h.d > 0) continue;
      // Lateral normal: perpendicular to tangent, scaled by side.
      const nxl = -h.ty * h.side, nyl = h.tx * h.side;
      const lat = nxl * LIGHT[0] + nyl * LIGHT[1];
      let l = hairBase(c, px, py) * 0.7 + lat * 0.55 + bias;
      // Tips darken slightly, roots near the crown lighten.
      l -= 0.15 * smooth(0.6, 1, h.t);
      sc.set(x, y, o, hairLevel(c, l));
    }
  }
}

function hairObj(c: Ctx, ramp?: Ramp, outline = true): Obj {
  return c.sc.add({
    ramp: ramp ?? c.hair, kind: 'hair', family: 'hair',
    outline: outline ? { bg: 0, over: 1, family: -2 } : false,
  });
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function capSDF(c: Ctx, extraVol = 0): SDF {
  const { g } = c;
  const s = c.hairStyle!;
  const vol = s.vol + extraVol;
  // Skull hair volume: wider toward the back of the head (viewer's left in 3/4).
  return union(
    ellipse(g.cx - 1.5, g.cy0 - 0.5, g.R + vol * 0.85 + 1, g.R + vol),
    ellipse(g.cx - 4, g.cy0 + 3, g.R + vol * 0.6, g.R * 0.9 + vol),
  );
}

/** y of the hairline at screen x (face-relative), for the front cap. */
function hairlineY(c: Ctx, x: number): number {
  const { g } = c;
  const s = c.hairStyle!;
  const hy = g.browY - s.hairline;
  const mid = g.fx(0);
  const dx = x - mid;
  const halfL = mid - g.left(g.eyeY), halfR = g.right(g.eyeY) - mid;
  const u = dx < 0 ? -dx / halfL : dx / halfR; // 0 centre … 1 face edge
  const temple = g.eyeY - 2;
  const side = s.sides >= 2 ? g.noseY : g.eyeY + (c.female ? 1 : 4);
  if (u < 0.62) return hy + 2.5 * u * u;
  if (u < 0.86) return hy + 1 + (temple - hy) * smooth(0.62, 0.86, u);
  return temple + (side - temple) * smooth(0.86, 1.0, u);
}

// ---------------------------------------------------------------------------
// Back hair (drawn behind the head)
// ---------------------------------------------------------------------------

export function drawBackHair(c: Ctx, underHeadgear = false) {
  const s = c.hairStyle;
  if (!s) return;
  if (underHeadgear && s.back < 3 && s.extra !== 'ponytail' && s.extra !== 'braid' && s.extra !== 'pigtails') return;
  if (underHeadgear && c.headgear?.family === 'hood') return;
  const { g, sc } = c;
  const o = hairObj(c);
  o.receive = true;

  if (s.extra === 'afro' && !underHeadgear) {
    const lump: SDF[] = [ellipse(g.cx - 2, g.cy0 - 1, g.R + 9, g.R + 9)];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      lump.push(circle(g.cx - 2 + Math.cos(a) * (g.R + 8), g.cy0 - 1 + Math.sin(a) * (g.R + 8), 4.2));
    }
    sc.fill(o, union(...lump), (x, y) => hairLevel(c, hairBase(c, x, y) + curlTex(c, x, y)), undefined, (x, y) => y < g.chinY - 4);
    return;
  }

  // Skull mass behind the head so the silhouette reads around the face.
  const cap = capSDF(c);
  const capBack = s.extra === 'balding' || s.extra === 'buzz' || s.extra === 'cornrows' || s.extra === 'mohawk' ? null : cap;
  if (capBack && !underHeadgear) {
    sc.fill(o, capBack, (x, y) => hairLevel(c, hairBase(c, x, y) + streak(c, x, y) * 0.12 - 0.1), undefined, (x, y) => y < g.eyeY + 10);
  }

  // Long back mass.
  const ends = [0, g.chinY + 1, g.mouthY + 5, 82, 100, 100];
  if (s.back >= 2) {
    const endY = ends[s.back];
    const flare = s.back >= 4 ? 6 : s.back === 3 ? 4 : 1;
    const wl = g.left(g.eyeY) - s.vol - 1, wr = g.right(g.eyeY) + s.vol;
    const wavy = s.texture === 'wavy' || s.texture === 'curly';
    const body = polygon(smoothOpen([
      [wl + 2, g.cy0 - 4], [wl - flare * 0.5, g.eyeY + 8], [wl - flare - (s.back === 5 ? 3 : 0), endY - 6], [wl - flare + 3, endY],
      [wr + flare - 3, endY], [wr + flare + (s.back === 5 ? 2 : 0), endY - 6], [wr + flare * 0.4, g.eyeY + 8], [wr - 2, g.cy0 - 4],
    ], 5));
    sc.fill(o, body, (x, y) => {
      let l = hairBase(c, x, y) - 0.12 + streakV(c, x, y, wavy) * 0.25;
      // Inner region behind the neck is in deep shadow.
      if (x > g.neckCx - g.neckHW - 3 && x < g.neckCx + g.neckHW + 4 && y > g.chinY - 4) l -= 0.5;
      return hairLevel(c, l);
    });
    // Hanging locks along the outer edges, giving pointed tips.
    const n = s.back >= 4 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      for (const side of [-1, 1]) {
        const rx = side < 0 ? wl + 2 + t * 6 : wr - 2 - t * 6;
        const tipX = side < 0 ? wl - flare + 2 + t * 10 : wr + flare - 2 - t * 10;
        const wob = wavy ? 3 : 1;
        const tipY = endY + 1 - (i % 2) * 3 - t * 2;
        const L = lockOf([[rx, g.eyeY - 4], [rx + side * (flare + wob), (g.eyeY + tipY) / 2], [tipX + (wavy ? side * -2 : 0), tipY]], 3.2, 0.6);
        drawLock(c, o, L, -0.05 - t * 0.15);
      }
    }
  } else if (s.back === 1) {
    // Nape tuft behind the neck.
    const nape = ellipse(g.cx - g.R * 0.62, g.eyeY + 8, 6, 8);
    sc.fill(o, nape, (x, y) => hairLevel(c, hairBase(c, x, y) - 0.3));
  }

  // Extras behind the head.
  switch (underHeadgear && (s.extra === 'bun' || s.extra === 'topknot' || s.extra === 'highponytail' || s.extra === 'halfup' || s.extra === 'mohawk') ? undefined : s.extra) {
    case 'ponytail': {
      const L = lockOf([[g.cx - g.R - 1, g.cy0 - 3], [g.cx - g.R - 13, g.cy0 + 2], [g.cx - g.R - 11, g.eyeY + 20], [g.cx - g.R - 6, 90]], 5.5, 1.5);
      drawLock(c, o, L, 0.1);
      tie(c, g.cx - g.R - 2, g.cy0 - 2);
      break;
    }
    case 'highponytail': {
      const L = lockOf([[g.cx - g.R * 0.5, g.top + 2], [g.cx - g.R - 14, g.top - 4], [g.cx - g.R - 10, g.eyeY + 22]], 5, 1.2);
      drawLock(c, o, L, 0.1);
      tie(c, g.cx - g.R * 0.62, g.top + 2);
      break;
    }
    case 'bun':
    case 'halfup': {
      const bx = g.cx - g.R * 0.75, by = g.top + (s.extra === 'bun' ? 2 : 8);
      const r = s.extra === 'bun' ? 6.5 : 4.5;
      const bo = hairObj(c);
      sc.fill(bo, circle(bx, by, r), (x, y) => {
        const a = Math.atan2(y - by, x - bx);
        return hairLevel(c, hairBase(c, x, y) + 0.4 * Math.sin(a * 3 + (Math.hypot(x - bx, y - by) * 0.9)) * 0.5 + 0.1);
      });
      break;
    }
    case 'topknot': {
      const bo = hairObj(c);
      const bx = g.cx - 1, by = g.top - 2;
      sc.fill(bo, circle(bx, by, 4.5), (x, y) => hairLevel(c, hairBase(c, x, y) + (x < bx ? 0.3 : -0.1)));
      tie(c, bx, by + 4);
      break;
    }
    case 'pigtails': {
      for (const side of [-1, 1]) {
        const rx = side < 0 ? g.left(g.eyeY) - 1 : g.right(g.eyeY) + 1;
        const L = lockOf([[rx, g.eyeY - 6], [rx + side * 9, g.eyeY + 10], [rx + side * 5, 84]], 5, 1.4);
        drawLock(c, o, L, side < 0 ? 0.1 : -0.1);
        tie(c, rx + side * 1, g.eyeY - 5);
      }
      break;
    }
    case 'mohawk': {
      // Long mohawks are handled by taller crest spikes (drawMohawk).
      break;
    }
    case 'dreads': {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const rx = g.left(g.eyeY) - 2 + t * (g.right(g.eyeY) - g.left(g.eyeY) + 4);
        const tipX = rx + (t - 0.5) * 14;
        const L = lockOf([[rx, g.cy0], [tipX, g.chinY + 6 + (i % 3) * 3]], 2.4, 1.8);
        drawDread(c, o, L);
      }
      break;
    }
  }
}

function tie(c: Ctx, x: number, y: number) {
  const o = c.sc.add({ ramp: c.cloth2, kind: 'cloth', outline: { bg: 0, over: 0 } });
  c.sc.fill(o, ellipse(x, y, 2.4, 2.4), (px, py) => (px < x && py < y ? 4 : 2));
}

function streakV(c: Ctx, x: number, y: number, wavy: boolean): number {
  const w = wavy ? Math.sin(y * 0.35 + c.vary[7] * 6) * 3 : 0;
  const xx = x + w + Math.sin(y * 0.11) * 2;
  // Irregular clumps (incommensurate frequencies) rather than evenly spaced stripes.
  return 0.55 * Math.sin(xx * 0.47 + c.vary[6] * 9) + 0.3 * Math.sin(xx * 1.13 + 1.3) + 0.15 * Math.sin(xx * 2.3 + y * 0.05);
}

function curlTex(c: Ctx, x: number, y: number): number {
  const v = Math.sin(x * 1.1 + Math.sin(y * 0.9) * 2) * Math.sin(y * 1.05 + Math.sin(x * 0.8) * 2);
  return v * 0.35 + (c.vary[8] - 0.5) * 0.05;
}

function drawDread(c: Ctx, o: Obj, L: Lock) {
  const { sc } = c;
  const [bx0, by0, bx1, by1] = strokeBox(L.pts, Math.max(L.w0, L.w1));
  for (let y = Math.max(0, Math.floor(by0)); y < Math.min(sc.h, Math.ceil(by1)); y++) for (let x = Math.max(0, Math.floor(bx0)); x < Math.min(sc.w, Math.ceil(bx1)); x++) {
    const h = strokeHit(L.pts, L.w0, L.w1, x + 0.5, y + 0.5);
    if (h.d > 0) continue;
    const seg = Math.sin(h.t * 40) > 0.3 ? -0.25 : 0.1;
    sc.set(x, y, o, hairLevel(c, hairBase(c, x, y) + seg - h.side * 0.3));
  }
}

// ---------------------------------------------------------------------------
// Front hair (cap over the forehead, bangs, side locks)
// ---------------------------------------------------------------------------

export function drawFrontHair(c: Ctx, underHeadgear = false) {
  const s = c.hairStyle;
  if (!s) return;
  const { g, sc } = c;

  if (s.extra === 'buzz' || s.extra === 'cornrows' || s.extra === 'mohawk' || s.extra === 'balding') {
    drawShortCap(c);
    if (s.extra === 'mohawk' && !underHeadgear) drawMohawk(c);
    return;
  }

  const o = hairObj(c);
  const cap = capSDF(c);
  if (!underHeadgear) {
    sc.fill(o, cap, (x, y) => {
      let l = hairBase(c, x, y) + streak(c, x, y) * 0.22;
      if (s.texture === 'curly') l += curlTex(c, x, y);
      return hairLevel(c, l);
    }, undefined, (x, y) => y + 0.5 < hairlineY(c, x + 0.5) && (g.inFace(x + 0.5, y + 0.5) || y < g.eyeY - 4)
      && (s.sides >= 2 || !inEar(c, x + 0.5, y + 0.5)));
  }

  // Bangs.
  const fringeObj = hairObj(c);
  const hy = g.browY - s.hairline;
  const fy = hy + s.fringeLen;
  const fl = (dx: number) => g.fx(dx);
  const locks: Lock[] = [];
  switch (s.fringe) {
    case 'full':
    case 'blunt': {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const dx = -g.R * 0.82 + t * g.R * 1.64;
        const root: Pt = [fl(dx * 0.6), hy - 6];
        const tipY = fy + (s.fringe === 'blunt' ? 1 : (i % 2 === 0 ? 1 : -1.5)) + (Math.abs(t - 0.5) > 0.4 ? 2 : 0);
        locks.push(lockOf([root, [fl(dx * 0.92), hy], [fl(dx + (t - 0.5) * 2), tipY]], 4.2, s.fringe === 'blunt' ? 3 : 0.7));
      }
      break;
    }
    case 'side': {
      // Part on the near side; locks sweep toward the far temple.
      const px = -g.R * 0.45;
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const rootDx = px + t * 5;
        const tipDx = -g.R * 0.3 + t * g.R * 1.15;
        locks.push(lockOf([[fl(rootDx), hy - 7], [fl((rootDx + tipDx) / 2 + 3), hy - 1], [fl(tipDx + 2), fy - 2 + t * 3 + (i % 2)]], 4.2, 0.8));
      }
      locks.push(lockOf([[fl(px - 1), hy - 6], [fl(px - 5), hy + 1], [fl(-g.R * 0.82), fy - 3]], 3.2, 0.6));
      break;
    }
    case 'swoop': {
      locks.push(lockOf([[fl(-g.R * 0.5), hy - 8], [fl(0), hy - 4], [fl(g.R * 0.75), fy + 2]], 6.5, 1));
      locks.push(lockOf([[fl(-g.R * 0.4), hy - 7], [fl(-g.R * 0.1), hy + 1], [fl(g.R * 0.35), fy + 4]], 4.5, 0.8));
      locks.push(lockOf([[fl(-g.R * 0.55), hy - 5], [fl(-g.R * 0.7), hy + 1], [fl(-g.R * 0.85), fy - 2]], 3, 0.6));
      break;
    }
    case 'center': {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const t = i / 2;
          const rootDx = side * (1 + t * 3);
          const tipDx = side * (g.R * 0.35 + t * g.R * 0.5);
          locks.push(lockOf([[fl(rootDx), hy - 6], [fl(rootDx + side * 4), hy - 2], [fl(tipDx), fy + t * 2]], 4, 0.7));
        }
      }
      break;
    }
    case 'spiky': {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const dx = -g.R * 0.7 + t * g.R * 1.4;
        locks.push(lockOf([[fl(dx * 0.5), hy - 8], [fl(dx * 0.9), hy - 1], [fl(dx * 1.1 + 3), fy + (i % 2 ? -2 : 1)]], 4.6, 0.5));
      }
      break;
    }
    case 'messy': {
      const dirs = [-3, 2, -1, 4, 1, 5];
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const dx = -g.R * 0.8 + t * g.R * 1.6;
        const tipY = fy + ((i * 7) % 3) - 1;
        locks.push(lockOf([[fl(dx * 0.5), hy - 8], [fl(dx * 0.85 + dirs[i] * 0.4), hy], [fl(dx + dirs[i]), tipY]], 4.2, 0.6));
      }
      break;
    }
    case 'short': {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const dx = -g.R * 0.6 + t * g.R * 1.2;
        locks.push(lockOf([[fl(dx * 0.7), hy - 5], [fl(dx * 0.9 + 1), hy - 1], [fl(dx + 2.5), fy]], 3.6, 0.8));
      }
      break;
    }
    case 'curly': {
      const co = hairObj(c);
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const dx = -g.R * 0.78 + t * g.R * 1.56;
        const cy = hy + 1 + (i % 2) * 1.5 + (Math.abs(t - 0.5) > 0.35 ? 2 : 0);
        sc.fill(co, circle(fl(dx), cy, 3.4), (x, y) => hairLevel(c, hairBase(c, x, y) + curlTex(c, x, y) + 0.1));
      }
      break;
    }
    case 'none':
      break;
  }
  for (const L of locks) drawLock(c, fringeObj, L, 0.05);
  if (s.fringe === 'blunt') {
    // Cut the fringe flat.
    for (let x = 0; x < sc.w; x++) for (let y = fy + 1; y < fy + 6; y++) {
      if (sc.objAt(x, y) === fringeObj) sc.erase(x, y);
    }
  }

  // Spiky silhouette: spikes behind/above the cap.
  if (s.texture === 'spiky' && !underHeadgear) {
    const so = hairObj(c);
    const angles = [-2.7, -2.25, -1.85, -1.45, -1.05, -0.65, -0.25];
    for (const [i, a] of angles.entries()) {
      const r0 = g.R * 0.5, r1 = g.R + s.vol + 5 + (i % 2) * 2;
      const ox = g.cx - 1, oy = g.cy0 - 1;
      const L = lockOf([[ox + Math.cos(a) * r0, oy + Math.sin(a) * r0], [ox + Math.cos(a + 0.12) * (r0 + r1) / 2, oy + Math.sin(a + 0.12) * (r0 + r1) / 2], [ox + Math.cos(a + 0.25) * r1, oy + Math.sin(a + 0.25) * r1]], 5, 0.5);
      drawLock(c, so, L, 0.05, (x, y) => (y + 0.5 < hairlineY(c, x) || !g.inFace(x, y) ? -1 : 1));
    }
  }
  if (s.texture === 'messy' && !underHeadgear) {
    const so = hairObj(c);
    const tufts: [number, number][] = [[-2.4, 3], [-1.7, 4], [-0.9, 3.5], [-0.3, 3]];
    for (const [a, len] of tufts) {
      const ox = g.cx - 1, oy = g.cy0;
      const r0 = g.R + s.vol - 3, r1 = g.R + s.vol + len;
      drawLock(c, so, lockOf([[ox + Math.cos(a) * r0, oy + Math.sin(a) * r0], [ox + Math.cos(a + 0.15) * r1, oy + Math.sin(a + 0.15) * r1 - 1], [ox + Math.cos(a + 0.35) * (r1 + 1), oy + Math.sin(a + 0.35) * (r1 + 1)]], 3.2, 0.5), 0);
    }
  }

  // Side locks framing the face (tucked inside a hood).
  if (s.sides >= 2 && !(underHeadgear && c.headgear?.family === 'hood')) {
    const so = hairObj(c);
    const endY = [0, 0, g.noseY + 2, g.mouthY + 4, g.chinY + 10][s.sides];
    const wavy = s.texture === 'wavy' || s.texture === 'curly';
    // Near side (viewer's left), in front of the ear.
    const nl = g.left(g.eyeY);
    drawLock(c, so, lockOf([[nl + 3, hy], [nl - 1 + (wavy ? -2 : 0), (hy + endY) / 2], [nl + 1 + (s.sides >= 4 ? -3 : 1), endY]], 4.6, 0.8), 0.05);
    if (s.sides >= 3) drawLock(c, so, lockOf([[nl + 6, hy + 2], [nl + 3, (hy + endY) / 2 + 2], [nl + 4, endY - 3]], 3, 0.6), 0.1);
    // Far side.
    const fr = g.right(g.eyeY);
    drawLock(c, so, lockOf([[fr - 4, hy], [fr + 1 + (wavy ? 2 : 0), (hy + endY) / 2], [fr + (s.sides >= 4 ? 2 : 0), endY]], 4, 0.8), -0.15);
  }

  // Braid over the near shoulder.
  if (s.extra === 'braid' && !underHeadgear) {
    const bo = hairObj(c);
    const x0 = g.left(g.eyeY) + 1, y0 = g.eyeY + 4;
    for (let i = 0; i < 7; i++) {
      const y = y0 + i * 5.5, x = x0 - 2 + Math.sin(i * 0.5) * 1.5 - i * 0.6;
      sc.fill(bo, ellipse(x + (i % 2 ? 1 : -1), y, 3.6 - i * 0.12, 3.2), (px, py) => hairLevel(c, hairBase(c, px, py) + (px < x ? 0.35 : -0.2) + 0.1));
    }
    tie(c, x0 - 6, y0 + 38);
  }
}

/** Ear zone (kept clear of short hair so ears read). */
function inEar(c: Ctx, x: number, y: number): boolean {
  if (c.elf) return false;
  const e = earPos(c);
  return ellipse(e.nx, e.y, 4.6, 6.6)(x, y) < 0 || ellipse(e.fx, e.y, 3.4, 6)(x, y) < 0;
}

function drawShortCap(c: Ctx) {
  const s = c.hairStyle!;
  const { g, sc } = c;
  const ramp = s.extra === 'buzz' || s.extra === 'cornrows' || s.extra === 'mohawk'
    ? (c.skin.map((col, i) => mix(col, c.hair[Math.min(5, i)], 0.6)) as Ramp)
    : c.hair;
  const shaved = s.extra !== 'balding';
  const o = c.sc.add({ ramp, kind: shaved ? 'skin' : 'hair', family: shaved ? 'skin' : 'hair', outline: { bg: 0, over: shaved ? -1 : 1 }, cast: !shaved });
  const cap = ellipse(g.cx - 1, g.cy0 - 0.5, g.R + s.vol + 0.6, g.R + s.vol);
  sc.fill(o, cap, (x, y) => {
    let l = hairBase(c, x, y);
    if (s.extra === 'cornrows') {
      const rowPhase = (x - g.cx) * 0.55 + (y - g.top) * 0.08;
      if (Math.abs(Math.sin(rowPhase)) < 0.3) l -= 0.45;
    } else if (s.extra !== 'balding') {
      l += ((Math.floor(x) * 7 + Math.floor(y) * 13) % 5 === 0 ? -0.25 : 0) - 0.15;
    } else {
      l += streak(c, x, y) * 0.2;
    }
    return hairLevel(c, l);
  }, undefined, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    if (py >= hairlineY(c, px)) return false;
    if (!g.inFace(px, py) && py > g.eyeY - 4 && s.extra !== 'balding') return false;
    if (s.extra === 'balding') {
      // Only a horseshoe of hair around the sides/back of the head, above the ears.
      if (py < g.browY - 2 || py > g.eyeY + 1) return false;
      return px < g.left(py) + 3 || px > g.right(py) - 1.5;
    }
    if (inEar(c, px, py)) return false;
    if (s.extra === 'mohawk') return Math.abs(px - (g.cx + 1)) > 4 && py > g.top + 6;
    return true;
  });
  if (s.extra === 'balding') {
    // Bare scalp gets a specular highlight.
    const hx = Math.round(g.cx - 6), hy = g.top + 5;
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]) {
      if (sc.kindAt(hx + dx, hy + dy) === 'skin') sc.shade(hx + dx, hy + dy, 5);
    }
  }
}

function drawMohawk(c: Ctx) {
  const { g, sc } = c;
  const o = hairObj(c);
  const s = c.hairStyle!;
  const n = s.back >= 1 ? 7 : 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = -0.35 - t * 2.3; // from front-top to back
    const ox = g.cx + 1, oy = g.cy0 + 2;
    const r0 = g.R - 2, r1 = g.R + (s.back >= 1 ? 11 : 7) - Math.abs(t - 0.4) * 4;
    const L = lockOf([[ox + Math.cos(a) * r0, oy + Math.sin(a) * r0], [ox + Math.cos(a - 0.05) * (r0 + r1) / 2, oy + Math.sin(a - 0.05) * (r0 + r1) / 2], [ox + Math.cos(a - 0.2) * r1, oy + Math.sin(a - 0.2) * r1]], 4, 0.6);
    drawLock(c, o, L, 0.1);
  }
}

// ---------------------------------------------------------------------------
// Beards
// ---------------------------------------------------------------------------

/** Mustache sprites (K outline, B dark, b mid, h light, H highlight), centred over the mouth. */
const STACHES = {
  mustache: [
    '..KKK...KKK..',
    '.KhHhKKKhbbK.',
    'KhhbbbbbbbbBK',
    'KbBKK...KKBBK',
    'KK.........KK',
  ],
  bigstache: [
    '....KKKKKK....',
    '..KKhhHHhbKK..',
    '.KhhhhhbbbbbK.',
    'KhhbbbbbbbbbbK',
    'KbbbBBBBBBBbbK',
    'KBBKBKBBKBKBBK',
  ],
  handlebar: [
    'KK..............KK',
    'KhK...KKKKKK...KbK',
    '.KhKKKhhHhbbKKKbK.',
    '..KhhhhbbbbbbbbK..',
    '...KKbbBKKBbbKK...',
    '.....KK....KK.....',
  ],
};

export function drawBeard(c: Ctx, part: 'jaw' | 'stache') {
  const b = c.beard;
  if (!b) return;
  const { g, sc } = c;
  const mid = (y: number) => g.center(y);
  const mxc = g.fx(0.5);

  if (b === 'stubble') {
    if (part === 'stache') return;
    const st = stubbleRamp(c);
    for (let y = g.eyeY + 6; y <= g.chinY + 1; y++) for (let x = 0; x < sc.w; x++) {
      if (sc.kindAt(x, y) !== 'skin') continue;
      const px = x + 0.5, py = y + 0.5;
      if (!g.inFace(px, py)) continue;
      const jawLine = g.noseY + 1 + Math.abs(px - mxc) * -0.2;
      if (py < jawLine && Math.abs(px - mxc) < g.hw(py) - 3) continue;
      if (py < g.noseY + 1 && Math.abs(px - mxc) < 7) continue;
      const lv = sc.levelAt(x, y);
      const dot = (x * 3 + y * 5) % 7 === 0;
      sc.set(x, y, sc.objAt(x, y)!, dot ? Math.max(1, lv - 1) : lv, st);
    }
    return;
  }

  const o = sc.add({ ramp: c.hair, kind: 'hair', family: 'beard', outline: { bg: 0, over: 1, family: -1 } });
  const lvl = (x: number, y: number, bias = 0) => {
    const l = hairBase(c, x, y) * 0.6 + 0.25 + bias + streakV(c, x, y, false) * 0.18 - (x > mid(y) ? 0.25 : 0);
    return hairLevel(c, l);
  };
  const mustache = (kind: keyof typeof STACHES) => {
    const mo = sc.add({ ramp: c.hair, kind: 'hair', family: 'beard', outline: false, exact: true, cast: true });
    const rows = STACHES[kind];
    const w = rows[0].length;
    const x0 = Math.round(mxc - w / 2 + 0.5), y0 = g.mouthY - rows.length + (kind === 'bigstache' ? 1 : 0);
    rows.forEach((r, dy) => [...r].forEach((ch, dx) => {
      const lv = ch === 'K' ? 0 : ch === 'B' ? 1 : ch === 'b' ? 2 : ch === 'h' ? 3 : ch === 'H' ? 4 : -1;
      if (lv < 0) return;
      const x = x0 + dx, y = y0 + dy;
      sc.set(x, y, mo, dx >= w / 2 + 1 && lv > 1 ? lv - 1 : lv);
    }));
  };

  if (part === 'stache') {
    switch (b) {
      case 'mustache': mustache('mustache'); return;
      case 'bigstache': mustache('bigstache'); return;
      case 'handlebar': mustache('handlebar'); return;
      case 'trimmed': return;
      default: mustache(b === 'winter' ? 'bigstache' : 'mustache'); return;
    }
  }
  if (b === 'mustache' || b === 'bigstache' || b === 'handlebar') return;

  // Jaw beards: region below a line from the sideburns, around the mouth.
  const len = b === 'winter' ? 14 : b === 'full' ? 7 : b === 'medium' ? 4 : 1.5;
  const cheekY = b === 'trimmed' ? g.noseY + 3 : b === 'medium' ? g.noseY + 1 : g.noseY - 1;
  const shape: SDF = (x, y) => {
    const yy = y;
    // Below chin: extend downward with a rounded/pointed end.
    if (yy > g.chinY - 1) {
      const t = (yy - (g.chinY - 1)) / Math.max(1, len);
      if (t > 1) return 1;
      const w = (g.hw(g.chinY - 3) + 1) * (1 - t * t * (b === 'winter' ? 0.9 : 1)) + 1;
      return Math.abs(x - mid(g.chinY)) - w;
    }
    if (!g.inFace(x, y)) {
      // Allow a little bulk outside the jawline.
      const edgeL = g.left(y) - (b === 'trimmed' ? 0.5 : 1.5), edgeR = g.right(y) + (b === 'trimmed' ? 0.5 : 1.5);
      if (x < edgeL || x > edgeR || y < cheekY) return 1;
    }
    // Upper boundary: slopes from sideburn down toward the mouth corners.
    const u = Math.abs(x - mxc) / (g.hw(y) + 0.01);
    const upper = cheekY + (1 - smooth(0.55, 0.95, u)) * (g.mouthY - cheekY - 1);
    if (y < upper) return 1;
    return -1;
  };
  const mouthHole = ellipse(mxc, g.mouthY + 0.5, b === 'trimmed' ? 4 : 4.5, 2);
  sc.fill(o, shape, (x, y) => lvl(x, y), [0, cheekY - 2, 95, g.chinY + len + 2], (x, y) => mouthHole(x + 0.5, y + 0.5) > 0);
  if (b === 'winter') {
    // Strand lines.
    for (let k = -2; k <= 2; k++) {
      const x0 = mid(g.chinY) + k * 3;
      for (let y = g.chinY; y < g.chinY + len - 2; y++) {
        const x = Math.round(x0 + (y - g.chinY) * k * 0.12);
        if (sc.objAt(x, y) === o) sc.darken(x, y, 1);
      }
    }
  }
}

