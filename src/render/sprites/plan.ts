/**
 * Pure character planning: turns a request (body + LayerRefs) into resolved, z-sorted layers
 * with concrete files and palette mappings, works out which animations every item covers,
 * and emits backend-agnostic draw operations for composing one animation sheet.
 *
 * No DOM here: the browser compositor executes the ops with canvas drawImage; tests execute
 * them with a plain RGBA blitter.
 */
import type { BodyType, LayerRef } from '../../content/schema';
import {
  type Catalog,
  type CatalogItem,
  type CustomAnim,
  type SheetAnim,
  type StandardAnim,
  CUSTOM_ANIMS,
  DIR_ROW,
  STANDARD_ANIMS,
  isCustomAnim,
  layerAnims,
  layerFile,
} from './catalog';
import { type PaletteMapping, isBaseColor, mappingKey, resolvePaletteColor } from './palette';

export interface CharacterRequest {
  body: BodyType;
  layers: LayerRef[];
  /** Automatically add companion items (e.g. arrows for bows). Default true. */
  companions?: boolean;
}

/** One catalogue layer of one requested item, resolved for the body and colours. */
export interface ResolvedLayer {
  key: string;
  /** Index of the LayerRef in the (normalised) request; tie-break for equal z. */
  refIndex: number;
  layerIndex: number;
  z: number;
  custom?: CustomAnim;
  /** Asset-relative file per animation this layer provides. */
  files: Partial<Record<SheetAnim, string>>;
  mappings: PaletteMapping[];
  mappingKey: string;
}

export interface ResolvedRef {
  key: string;
  item: CatalogItem;
  color?: string;
  color2?: string;
  variant: string | null;
  /** Companions/ammo/shadow: drawn when available but never make an animation "incomplete". */
  optional: boolean;
}

export interface CharacterPlan {
  key: string;
  body: BodyType;
  refs: ResolvedRef[];
  layers: ResolvedLayer[];
  /** Per animation: item keys that do not cover it (empty array = complete). */
  missing: Partial<Record<SheetAnim, string[]>>;
  /** Animations with at least the body (or any layer) present. */
  supported: Set<SheetAnim>;
  /** First weapon in the request (drives attack style). */
  weaponKey: string | null;
  warnings: string[];
}

/** Draw `sw×sh` from (sx, sy) of `src` at (dx, dy) of the destination sheet (no scaling). */
export interface DrawOp {
  src: string; // file
  mappingKey: string;
  mappings: PaletteMapping[];
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
}

export interface AnimComposition {
  anim: SheetAnim;
  width: number;
  height: number;
  frameSize: number;
  frames: number;
  rows: number;
  ops: DrawOp[];
  /** Distinct source images needed (file + mapping). */
  sources: { src: string; mappingKey: string; mappings: PaletteMapping[] }[];
}

const SLOT_ORDER = ['shadow', 'body', 'head', 'ears', 'eyebrows', 'hair', 'beard'];
const OPTIONAL_SLOTS = new Set(['ammo', 'shadow']);

/** Stable hash-ish key of a request (used for sheet caching). */
export function requestKey(req: CharacterRequest): string {
  const layers = req.layers.map((l) => [l.key, l.color ?? '', l.color2 ?? ''].join(':')).join(',');
  return `${req.body}|${req.companions === false ? 'nc' : 'c'}|${layers}`;
}

export function planCharacter(catalog: Catalog, req: CharacterRequest): CharacterPlan {
  const warnings: string[] = [];
  const body = req.body;
  const refsIn = req.layers.slice();

  // Companions (arrows for bows …).
  const companions = new Set<string>();
  if (req.companions !== false) {
    for (const ref of req.layers) {
      for (const w of catalog.items[ref.key]?.with ?? []) {
        if (!refsIn.some((r) => r.key === w)) {
          refsIn.push({ key: w });
          companions.add(w);
        }
      }
    }
  }

  // The skin colour for match_body_color items: first explicit colour on a body-coloured base layer.
  const skinRef = refsIn.find((r) => {
    const it = catalog.items[r.key];
    return it && it.slot === 'body' && it.matchBodyColor && r.color;
  });
  const skin = skinRef?.color;

  const refs: ResolvedRef[] = [];
  const layers: ResolvedLayer[] = [];
  refsIn.forEach((ref, refIndex) => {
    const item = catalog.items[ref.key];
    if (!item) {
      warnings.push(`Unknown sprite item "${ref.key}"`);
      return;
    }
    if (!item.bodies.includes(body)) {
      warnings.push(`"${ref.key}" has no ${body} sprites (has ${item.bodies.join(', ')})`);
      return;
    }
    const color = ref.color ?? (item.matchBodyColor ? skin : undefined);
    const { variant, mappings } = resolveColors(catalog, item, ref.key, color, ref.color2, warnings);
    const optional = companions.has(ref.key) || OPTIONAL_SLOTS.has(item.slot);
    refs.push({ key: ref.key, item, color, color2: ref.color2, variant, optional });
    const mk = mappingKey(mappings);
    item.layers.forEach((layer, layerIndex) => {
      const files: Partial<Record<SheetAnim, string>> = {};
      for (const anim of layerAnims(layer, body)) {
        const f = layerFile(layer, body, anim, variant);
        if (f) files[anim] = f;
      }
      if (!Object.keys(files).length) return;
      layers.push({ key: ref.key, refIndex, layerIndex, z: layer.z, ...(layer.custom ? { custom: layer.custom } : {}), files, mappings, mappingKey: mk });
    });
  });

  layers.sort((a, b) => a.z - b.z || a.refIndex - b.refIndex || a.layerIndex - b.layerIndex);

  // Coverage.
  const missing: Partial<Record<SheetAnim, string[]>> = {};
  const supported = new Set<SheetAnim>();
  const allAnims: SheetAnim[] = [...STANDARD_ANIMS, ...CUSTOM_ANIMS];
  for (const anim of allAnims) {
    const geo = catalog.animations[anim];
    if (!geo) continue;
    const miss: string[] = [];
    let any = false;
    for (const r of refs) {
      const own = layers.filter((l) => l.key === r.key);
      const covers = own.some((l) => (isCustomAnim(anim) ? l.custom === anim || (!l.custom && !!geo.base && !!l.files[geo.base]) : !l.custom && !!l.files[anim]));
      if (covers) any = true;
      else if (!r.optional) miss.push(r.key);
    }
    missing[anim] = miss;
    if (any) supported.add(anim);
  }

  const weaponRef = refs.find((r) => r.item.slot === 'weapon');
  return {
    key: requestKey({ ...req, layers: refsIn }),
    body,
    refs,
    layers,
    missing,
    supported,
    weaponKey: weaponRef?.key ?? null,
    warnings,
  };
}

/** Pick the file variant and palette mappings for an item given its colour keys. */
export function resolveColors(
  catalog: Catalog,
  item: CatalogItem,
  key: string,
  color: string | undefined,
  color2: string | undefined,
  warnings: string[] = [],
): { variant: string | null; mappings: PaletteMapping[] } {
  const mappings: PaletteMapping[] = [];
  let variant: string | null = null;
  const channels = item.recolor ?? [];
  if (item.variants) {
    variant = item.recolorVariant ?? item.variants[0];
    if (color && item.variants.includes(color)) variant = color;
    else if (color) {
      const ch = item.recolorVariant ? channels[0] : undefined;
      const target = ch ? resolvePaletteColor(catalog, ch, color) : null;
      if (ch && target) {
        if (!isBaseColor(ch, color)) mappings.push({ source: ch.source, target });
      } else {
        warnings.push(`"${key}": unknown colour "${color}" (variants: ${item.variants.join(', ')})`);
      }
    }
  } else if (channels[0] && color) {
    const target = resolvePaletteColor(catalog, channels[0], color);
    if (target) {
      if (!isBaseColor(channels[0], color)) mappings.push({ source: channels[0].source, target });
    } else warnings.push(`"${key}": unknown ${channels[0].material} colour "${color}"`);
  }
  if (color2) {
    const ch = channels[1];
    if (!ch) warnings.push(`"${key}" has no secondary colour channel`);
    else {
      const target = resolvePaletteColor(catalog, ch, color2);
      if (target) {
        if (!isBaseColor(ch, color2)) mappings.push({ source: ch.source, target });
      } else warnings.push(`"${key}": unknown ${ch.material} colour "${color2}"`);
    }
  }
  return { variant, mappings };
}

/** True when every requested item contributes to `anim`. */
export function isComplete(plan: CharacterPlan, anim: SheetAnim): boolean {
  const m = plan.missing[anim];
  return !!m && m.length === 0 && plan.supported.has(anim);
}

/** How visible a missing item is: clothes vanishing reads far worse than a weapon vanishing. */
const SLOT_WEIGHT: Record<string, number> = {
  body: 100, head: 100, torso: 10, legs: 10, hair: 6, beard: 4, hat: 5, visor: 4, feet: 3, hands: 3, arms: 3,
  shoulders: 3, waist: 2, cape: 3, neck: 1, ears: 4, eyebrows: 1, hat_accessory: 2, weapon: 1.5, shield: 1, back: 1,
};

/** Weighted badness of drawing `anim` (0 = complete, Infinity = nothing to draw / not worth it). */
export function missingWeight(plan: CharacterPlan, anim: SheetAnim): number {
  if (!plan.supported.has(anim)) return Infinity;
  if (isCustomAnim(anim) && !plan.layers.some((l) => l.custom === anim)) return Infinity;
  let w = 0;
  for (const key of plan.missing[anim] ?? []) {
    const slot = plan.refs.find((r) => r.key === key)?.item.slot ?? '';
    w += SLOT_WEIGHT[slot] ?? 2;
  }
  return w;
}

/**
 * Complete, and worth using: a custom (large-frame) animation is only used when some layer
 * actually provides a sheet for it — otherwise it is just the base animation in a bigger frame.
 */
export function isUsable(plan: CharacterPlan, anim: SheetAnim): boolean {
  if (!isComplete(plan, anim)) return false;
  return !isCustomAnim(anim) || plan.layers.some((l) => l.custom === anim);
}

/**
 * Draw operations for one animation sheet. Standard anims: each layer blits its whole sheet.
 * Custom anims: custom layers blit their own sheet; regular layers have each frame of the base
 * animation copied into the matching cell, centred in the larger frame.
 */
export function composeOps(catalog: Catalog, plan: CharacterPlan, anim: SheetAnim): AnimComposition {
  const geo = catalog.animations[anim];
  if (!geo) throw new Error(`Unknown animation ${anim}`);
  const W = geo.frameSize * geo.frames;
  const H = geo.frameSize * geo.rows;
  const ops: DrawOp[] = [];
  const add = (l: ResolvedLayer, src: string, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) =>
    ops.push({ src, mappingKey: l.mappingKey, mappings: l.mappings, sx, sy, sw, sh, dx, dy });

  for (const l of plan.layers) {
    if (!isCustomAnim(anim)) {
      const f = !l.custom ? l.files[anim] : undefined;
      if (f) add(l, f, 0, 0, W, H, 0, 0);
      continue;
    }
    if (l.custom === anim) {
      const f = l.files[anim];
      if (f) add(l, f, 0, 0, W, H, 0, 0);
      continue;
    }
    const base = geo.base as StandardAnim | undefined;
    const f = !l.custom && base ? l.files[base] : undefined;
    if (!f || !geo.cells || !base) continue;
    const baseGeo = catalog.animations[base];
    const off = (geo.frameSize - baseGeo.frameSize) / 2;
    geo.cells.forEach((row, r) => {
      row.forEach((spec, c) => {
        const [name, colStr] = spec.split(',');
        const dir = name.split('-')[1] as 'n' | 'w' | 's' | 'e';
        const srcRow = baseGeo.rows === 1 ? 0 : DIR_ROW[dir];
        const s = baseGeo.frameSize;
        add(l, f, Number(colStr) * s, srcRow * s, s, s, c * geo.frameSize + off, r * geo.frameSize + off);
      });
    });
  }
  const seen = new Map<string, { src: string; mappingKey: string; mappings: PaletteMapping[] }>();
  for (const op of ops) {
    const k = `${op.src}|${op.mappingKey}`;
    if (!seen.has(k)) seen.set(k, { src: op.src, mappingKey: op.mappingKey, mappings: op.mappings });
  }
  return { anim, width: W, height: H, frameSize: geo.frameSize, frames: geo.frames, rows: geo.rows, ops, sources: [...seen.values()] };
}

/** Order refs canonically (base layers first) — purely cosmetic for tie-breaking equal z. */
export function sortRefsBySlot(catalog: Catalog, refs: LayerRef[]): LayerRef[] {
  const rank = (r: LayerRef) => {
    const slot = catalog.items[r.key]?.slot ?? '';
    const i = SLOT_ORDER.indexOf(slot);
    return i === -1 ? SLOT_ORDER.length : i;
  };
  return refs.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}
