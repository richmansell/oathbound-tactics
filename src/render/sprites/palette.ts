/**
 * Palette colour resolution (pure). Mirrors the upstream generator's recolour keys:
 *   "navy"                 → channel material, default version (ulpc)
 *   "lpcr.navy"            → channel material, explicit version
 *   "body.zombie"          → another material, its default version
 *   "all.lpcr.aegean"      → material.version.name
 * Bare names also fall back through the channel's offered palette sets, so e.g. a skeleton
 * (cloth material) accepts the body colour "light" because it offers "body.ulpc".
 */
import type { Catalog, RecolorChannel } from './catalog';

export interface PaletteMapping {
  source: readonly string[];
  target: readonly string[];
}

/** Resolve a colour key to target hex colours for a channel, or null if unknown/incompatible. */
export function resolvePaletteColor(catalog: Catalog, channel: RecolorChannel, key: string): string[] | null {
  const parts = key.split('.');
  const lookup = (material: string, version: string | undefined, name: string): string[] | null => {
    const mat = catalog.palettes[material];
    if (!mat) return null;
    const colors = mat.versions[version ?? mat.default]?.[name];
    return colors && colors.length === channel.source.length ? colors : null;
  };
  if (parts.length === 3) return lookup(parts[0], parts[1], parts[2]);
  if (parts.length === 2) {
    const [a, name] = parts;
    if (catalog.palettes[a]) return lookup(a, undefined, name);
    return lookup(channel.material, a, name);
  }
  const name = parts[0];
  const direct = lookup(channel.material, undefined, name);
  if (direct) return direct;
  for (const token of channel.palettes) {
    const [m, v] = token.split('.');
    const hit = lookup(m, v, name);
    if (hit) return hit;
  }
  const mat = catalog.palettes[channel.material];
  if (mat) for (const v of Object.keys(mat.versions)) {
    const hit = lookup(channel.material, v, name);
    if (hit) return hit;
  }
  return null;
}

/** True when a colour key names the channel's own base palette (no recolour needed). */
export function isBaseColor(channel: RecolorChannel, key: string): boolean {
  const [bv, bn] = channel.base.split('.');
  return key === bn || key === channel.base || key === `${channel.material}.${bv}.${bn}`;
}

/** Stable cache key for a list of mappings. */
export function mappingKey(mappings: readonly PaletteMapping[]): string {
  if (!mappings.length) return '';
  return mappings.map((m) => `${m.source.join('')}>${m.target.join('')}`).join('|').toLowerCase();
}

const hexToRgb24 = (hex: string): number => parseInt(hex.replace('#', '').slice(0, 6), 16);

/**
 * Lookup table packed-RGB → packed-RGB implementing upstream matching: a pixel matches a source
 * colour when every channel is within ±1; the first matching pair (in mapping order) wins.
 */
export function buildRecolorLut(mappings: readonly PaletteMapping[]): Map<number, number> {
  const lut = new Map<number, number>();
  for (const { source, target } of mappings) {
    for (let i = 0; i < source.length && i < target.length; i++) {
      const s = hexToRgb24(source[i]);
      const t = hexToRgb24(target[i]);
      const r = (s >> 16) & 255, g = (s >> 8) & 255, b = s & 255;
      for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
        const R = r + dr, G = g + dg, B = b + db;
        if (R < 0 || G < 0 || B < 0 || R > 255 || G > 255 || B > 255) continue;
        const k = (R << 16) | (G << 8) | B;
        if (!lut.has(k)) lut.set(k, t);
      }
    }
  }
  return lut;
}

/** Recolour RGBA pixels in place. Fully transparent pixels are skipped. */
export function recolorRgba(data: Uint8Array | Uint8ClampedArray, lut: Map<number, number>): void {
  if (!lut.size) return;
  let lastIn = -1, lastOut = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let t: number | undefined;
    if (k === lastIn) t = lastOut;
    else {
      t = lut.get(k);
      lastIn = k;
      lastOut = t ?? -1;
    }
    if (t === undefined || t < 0) continue;
    data[i] = (t >> 16) & 255;
    data[i + 1] = (t >> 8) & 255;
    data[i + 2] = t & 255;
  }
}
