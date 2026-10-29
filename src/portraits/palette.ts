/**
 * Colour ramps for portraits. Every ramp has 6 entries ordered dark → light:
 *   0 outline · 1 deep shadow · 2 shadow · 3 base · 4 light · 5 highlight
 * Ramps come from the LPC "ulpc" palettes so portraits match the battle sprites.
 */
import { BODY_RAMPS, CLOTH_RAMPS, EYE_RAMPS, HAIR_RAMPS, METAL_RAMPS } from './lpc-palettes';

export type RGB = [number, number, number];
export type Ramp = RGB[];

export function hex(h: string): RGB {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function luma(c: RGB): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Hex list → ramp sorted by luminance (a few LPC ramps are not monotone). */
function toRamp(list: string[]): Ramp {
  return list.map(hex).sort((a, b) => luma(a) - luma(b));
}

const cache = new Map<string, Ramp>();
function cached(key: string, make: () => Ramp): Ramp {
  let r = cache.get(key);
  if (!r) { r = make(); cache.set(key, r); }
  return r;
}

/** Normalise a palette variant name: "Dark Brown" / "dark-brown" → "dark_brown". */
export function normName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export const SKIN_KEYS = Object.keys(BODY_RAMPS);
export const HAIR_KEYS = Object.keys(HAIR_RAMPS);
export const CLOTH_KEYS = Object.keys(CLOTH_RAMPS);
export const METAL_KEYS = Object.keys(METAL_RAMPS);
export const EYE_KEYS = Object.keys(EYE_RAMPS);

const SKIN_ALIASES: Record<string, string> = {
  pale: 'light', fair: 'light', white: 'light', tan: 'olive', dark: 'brown', ebony: 'black',
  green: 'green', orc: 'green', goblin: 'pale_green', undead: 'zombie', bone: 'light',
};

export function skinRamp(name?: string): Ramp {
  let n = normName(name) || 'light';
  if (!BODY_RAMPS[n]) n = SKIN_ALIASES[n] ?? (BODY_RAMPS[n.replace(/^skin_/, '')] ? n.replace(/^skin_/, '') : 'light');
  return cached('skin:' + n, () => toRamp(BODY_RAMPS[n]));
}

export function hairRamp(name?: string): Ramp {
  let n = normName(name) || 'dark_brown';
  if (!HAIR_RAMPS[n]) n = n === 'brown' ? 'chestnut' : n === 'grey' ? 'gray' : n === 'silver' ? 'white' : 'dark_brown';
  return cached('hair:' + n, () => toRamp(HAIR_RAMPS[n]));
}

export function isMetal(name?: string): boolean {
  return !!METAL_RAMPS[normName(name)];
}
export function isCloth(name?: string): boolean {
  return !!CLOTH_RAMPS[normName(name)];
}

export function clothRamp(name?: string, fallback = 'brown'): Ramp {
  const n = normName(name);
  if (CLOTH_RAMPS[n]) return cached('cloth:' + n, () => toRamp(CLOTH_RAMPS[n]));
  if (METAL_RAMPS[n]) return metalRamp(n);
  if (HAIR_RAMPS[n]) return hairRamp(n);
  return cached('cloth:' + fallback, () => toRamp(CLOTH_RAMPS[fallback] ?? CLOTH_RAMPS.brown));
}

export function metalRamp(name?: string, fallback = 'steel'): Ramp {
  const n = normName(name);
  if (METAL_RAMPS[n]) return cached('metal:' + n, () => toRamp(METAL_RAMPS[n]));
  if (CLOTH_RAMPS[n]) return clothRamp(n);
  return cached('metal:' + fallback, () => toRamp(METAL_RAMPS[fallback]));
}

/** Eye ramps are 3 colours in LPC; expand to [dark, mid, light]. */
export function eyeRamp(name?: string): RGB[] {
  let n = normName(name) || 'brown';
  if (!EYE_RAMPS[n]) n = n === 'grey' ? 'gray' : n === 'hazel' ? 'green' : n === 'amber' ? 'orange' : 'brown';
  return cached('eye:' + n, () => {
    const r = EYE_RAMPS[n].map(hex);
    // LPC "brown" light entry is darker than mid in places; enforce dark→light.
    return r.sort((a, b) => luma(a) - luma(b));
  });
}

/** Build a 6-step ramp from explicit colours. */
export function rampOf(...list: string[]): Ramp {
  return list.map(hex);
}

// Fixed helper ramps -----------------------------------------------------------
export const SCLERA: Ramp = rampOf('#2a1a22', '#6e5a62', '#b8a8a8', '#e2d6d2', '#f6f0ea', '#ffffff');
export const MOUTH: Ramp = rampOf('#1a0a10', '#3d1018', '#6b1e26', '#9a3a3a', '#c8706a', '#e8a8a0');
export const TEETH: Ramp = rampOf('#2a1a22', '#8a7a78', '#c8bcb4', '#e8e0d8', '#faf6f0', '#ffffff');
export const BONE: Ramp = rampOf('#241c20', '#5c5048', '#8c8070', '#bdb29a', '#e0d8c0', '#f8f4e6');
export const GLOW_BLUE: Ramp = rampOf('#081830', '#103a70', '#2070c0', '#40b0f0', '#a0e8ff', '#ffffff');
export const GLOW_RED: Ramp = rampOf('#200008', '#600010', '#b01020', '#f03030', '#ff9070', '#fff0d0');
export const TEAR: Ramp = rampOf('#1a2a40', '#3a6a9a', '#6aa8d8', '#a0d4f4', '#d8f0ff', '#ffffff');
export const GEM_RED: Ramp = rampOf('#200008', '#5a0a18', '#9a1428', '#d0283a', '#ff7080', '#ffe0e0');
export const GEM_BLUE: Ramp = rampOf('#080820', '#101a5a', '#1a3a9a', '#2a6ad0', '#70b0ff', '#e0f0ff');
export const PATCH: Ramp = rampOf('#0a0608', '#1a1214', '#2a1e20', '#3a2a2a', '#584242', '#7a6060');
export const FEATHER: Ramp = rampOf('#1d131e', '#651117', '#82171c', '#ab1e1e', '#cd2429', '#e86060');

/** Blend a ramp toward a tint colour (used for blush, scars, stubble). */
export function tintRamp(r: Ramp, tint: RGB, t: number): Ramp {
  return r.map((c) => mix(c, tint, t));
}
