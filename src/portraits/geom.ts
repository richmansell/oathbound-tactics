/**
 * Tiny 2D signed-distance toolkit. Shapes are functions (x, y) → distance, negative inside.
 * Everything is sampled at pixel centres by the scene, so shapes snap cleanly to the grid.
 */
export type Pt = [number, number];
export type SDF = ((x: number, y: number) => number) & { bbox?: BBox };
export type BBox = [number, number, number, number];

function withBox(f: (x: number, y: number) => number, bbox?: BBox): SDF {
  const g = f as SDF;
  if (bbox) g.bbox = bbox;
  return g;
}
function boxOfPts(pts: Pt[], pad = 0): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - pad - 1, y0 - pad - 1, x1 + pad + 1, y1 + pad + 1];
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function circle(cx: number, cy: number, r: number): SDF {
  return withBox((x, y) => Math.hypot(x - cx, y - cy) - r, [cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1]);
}

/** Approximate ellipse distance (good enough for rasterising). */
export function ellipse(cx: number, cy: number, rx: number, ry: number): SDF {
  return withBox((x, y) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const k = Math.hypot(dx, dy);
    return (k - 1) * Math.min(rx, ry);
  }, [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1]);
}

export function rect(x0: number, y0: number, x1: number, y1: number): SDF {
  return withBox((x, y) => {
    const dx = Math.max(x0 - x, x - x1), dy = Math.max(y0 - y, y - y1);
    return Math.max(dx, dy);
  }, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
}

/** Exact polygon SDF (even-odd). */
export function polygon(pts: Pt[]): SDF {
  const box = boxOfPts(pts);
  return withBox((x, y) => {
    if (x < box[0] || y < box[1] || x > box[2] || y > box[3]) return Math.max(box[0] - x, x - box[2], box[1] - y, y - box[3], 1);
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      const ex = xj - xi, ey = yj - yi;
      const wx = x - xi, wy = y - yi;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
      d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? -d : d;
  }, box);
}

export const union = (...s: SDF[]): SDF => withBox((x, y) => {
  let d = Infinity;
  for (const f of s) d = Math.min(d, f(x, y));
  return d;
}, s.every((f) => f.bbox) ? s.reduce<BBox>((b, f) => [Math.min(b[0], f.bbox![0]), Math.min(b[1], f.bbox![1]), Math.max(b[2], f.bbox![2]), Math.max(b[3], f.bbox![3])], [Infinity, Infinity, -Infinity, -Infinity]) : undefined);
export const intersect = (...s: SDF[]): SDF => {
  const boxes = s.filter((f) => f.bbox).map((f) => f.bbox!);
  return withBox((x, y) => {
    let d = -Infinity;
    for (const f of s) d = Math.max(d, f(x, y));
    return d;
  }, boxes.length ? boxes.reduce<BBox>((b, f) => [Math.max(b[0], f[0]), Math.max(b[1], f[1]), Math.min(b[2], f[2]), Math.min(b[3], f[3])], [-Infinity, -Infinity, Infinity, Infinity]) : undefined);
};
export const subtract = (a: SDF, b: SDF): SDF => withBox((x, y) => Math.max(a(x, y), -b(x, y)), a.bbox);
export const offset = (a: SDF, r: number): SDF => withBox((x, y) => a(x, y) - r, a.bbox && [a.bbox[0] - r, a.bbox[1] - r, a.bbox[2] + r, a.bbox[3] + r]);

/** Sample a quadratic / cubic bezier into points. */
export function bezier(p: Pt[], n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (p.length === 3) {
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push([a * p[0][0] + b * p[1][0] + c * p[2][0], a * p[0][1] + b * p[1][1] + c * p[2][1]]);
    } else if (p.length === 4) {
      const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      out.push([
        a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0],
        a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1],
      ]);
    } else {
      out.push(p[Math.min(p.length - 1, Math.round(t * (p.length - 1)))]);
    }
  }
  return out;
}

/** Smooth closed outline through points (Catmull-Rom) → polygon points. */
export function smoothClosed(pts: Pt[], seg = 6): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Open Catmull-Rom through points. */
export function smoothOpen(pts: Pt[], seg = 6): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

export interface StrokeHit { d: number; t: number; side: number; tx: number; ty: number }

/**
 * Tapered stroke along a polyline: width w0 at start → w1 at end.
 * Returns distance (negative inside) plus parameter t and signed side (−1 left … +1 right).
 */
export function strokeHit(pts: Pt[], w0: number, w1: number, x: number, y: number): StrokeHit {
  let best = Infinity, bt = 0, bside = 0, btx = 0, bty = 1;
  let acc = 0;
  const lens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(l); acc += l;
  }
  const total = acc || 1;
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const ex = bx - ax, ey = by - ay;
    const L2 = ex * ex + ey * ey || 1;
    const u = clamp(((x - ax) * ex + (y - ay) * ey) / L2, 0, 1);
    const px = ax + ex * u, py = ay + ey * u;
    const t = (run + lens[i] * u) / total;
    const w = lerp(w0, w1, t);
    const dist = Math.hypot(x - px, y - py);
    const d = dist - w;
    if (d < best) {
      best = d; bt = t;
      const L = Math.sqrt(L2);
      const cross = (ex * (y - ay) - ey * (x - ax)) / L;
      bside = w > 0 ? clamp(cross / w, -1, 1) : 0;
      btx = ex / L; bty = ey / L;
    }
    run += lens[i];
  }
  return { d: best, t: bt, side: bside, tx: btx, ty: bty };
}

export function stroke(pts: Pt[], w0: number, w1: number): SDF {
  return withBox((x, y) => strokeHit(pts, w0, w1, x, y).d, boxOfPts(pts, Math.max(w0, w1)));
}

/** Bounding box helper for ad-hoc stroke SDFs. */
export function strokeBox(pts: Pt[], w: number): BBox { return boxOfPts(pts, w); }

/** Monotone piecewise-cubic interpolation over sorted (x, y) knots. */
export function spline(knots: Pt[]): (x: number) => number {
  const n = knots.length;
  const xs = knots.map((k) => k[0]), ys = knots.map((k) => k[1]);
  const m: number[] = new Array(n).fill(0);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Light ------------------------------------------------------------------------
/** Key light from top-left-front (x right, y down, z toward viewer). */
export const LIGHT = (() => {
  const v = [-0.55, -0.62, 0.56];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();

/** Lambert-ish term for a sphere/ellipsoid point, −1..1. */
export function sphereLight(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  let nx = (x - cx) / rx, ny = (y - cy) / ry;
  const k = nx * nx + ny * ny;
  if (k > 1) { const s = 1 / Math.sqrt(k); nx *= s; ny *= s; }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
}

/** Quantise a light value into ramp levels using ascending thresholds. */
export function band(v: number, th: number[], base = 1): number {
  let lv = base;
  for (const t of th) if (v > t) lv++;
  return lv;
}
