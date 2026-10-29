/**
 * Appearance → ordered LayerRefs (body, head, face, hair, then outfit slots).
 * Equipment layers are appended by game code after these (z-order is resolved by the
 * compositor from the catalogue, so list order only breaks ties).
 */
import type { Appearance, LayerRef, OutfitSlot } from '../../content/schema';
import { type Catalog, getCatalogIfLoaded } from './catalog';
import { resolvePaletteColor } from './palette';

/** Outfit slots in drawing-order-friendly sequence. */
export const OUTFIT_SLOT_ORDER: readonly OutfitSlot[] = ['legs', 'feet', 'torso', 'waist', 'hands', 'neck', 'cape', 'hat'];

export const DEFAULT_HEADS = { male: 'heads_human_male', female: 'heads_human_female', muscular: 'heads_human_male' } as const;

export interface AppearanceLayerOptions {
  catalog?: Catalog | null;
  /** Add LPC eyebrows (hair-coloured) to human heads. Default true. */
  eyebrows?: boolean;
  /** Add the LPC ground shadow layer. Default false (the battle renderer draws its own). */
  shadow?: boolean;
  /** Hair colour used for eyebrows of bald characters. Default "dark_brown". */
  baldBrowColor?: string;
}

const isHuman = (head: string) => head.startsWith('heads_human_');
const SKELETAL = new Set(['heads_skeleton']);

/**
 * Turn a schema Appearance into LayerRefs. Skin colour is applied to the body and every
 * body-coloured part (head, ears) like LPC's match_body_color; eyes go to the head's second
 * channel; eyebrows follow the hair colour.
 */
export function defaultLayersForAppearance(appearance: Appearance, opts: AppearanceLayerOptions = {}): LayerRef[] {
  const catalog = opts.catalog === undefined ? getCatalogIfLoaded() : opts.catalog;
  const head = appearance.head ?? DEFAULT_HEADS[appearance.body];
  const skeletal = SKELETAL.has(head);
  const layers: LayerRef[] = [];

  if (opts.shadow) layers.push({ key: 'shadow' });

  // Skeletons use the bone body and keep bone colour unless the skin is a valid cloth/bone dye.
  if (skeletal) {
    const boneColor = skeletonColor(catalog, appearance.skin);
    layers.push(withColor({ key: 'body_skeleton' }, boneColor));
    layers.push(withColor({ key: head }, boneColor));
  } else {
    layers.push({ key: 'body', color: appearance.skin });
    layers.push(withColor({ key: head, color: appearance.skin }, appearance.skin, isHuman(head) ? appearance.eyes : undefined));
  }

  if (appearance.ears && !skeletal) layers.push({ key: appearance.ears, color: appearance.skin });

  if (isHuman(head) && opts.eyebrows !== false) {
    const brow = appearance.hairColor ?? (appearance.hair ? undefined : opts.baldBrowColor ?? 'dark_brown');
    const female = head.includes('female');
    layers.push(withColor({ key: female ? 'eyebrows_thin' : 'eyebrows_thick' }, brow));
  }

  if (appearance.hair) layers.push(withColor({ key: appearance.hair }, appearance.hairColor));
  if (appearance.beard) layers.push(withColor({ key: appearance.beard }, appearance.hairColor));

  for (const slot of OUTFIT_SLOT_ORDER) {
    const ref = appearance.outfit?.[slot];
    if (ref) layers.push({ ...ref });
  }
  return layers;
}

function withColor(ref: LayerRef, color?: string, color2?: string): LayerRef {
  const out: LayerRef = { key: ref.key };
  if (color) out.color = color;
  if (color2) out.color2 = color2;
  return out;
}

function skeletonColor(catalog: Catalog | null | undefined, skin: string): string | undefined {
  if (!catalog) return undefined;
  const ch = catalog.items['body_skeleton']?.recolor?.[0];
  if (!ch) return undefined;
  // Only accept colours from the bone/cloth palettes, not flesh tones.
  const clothOnly = { ...ch, palettes: ch.palettes.filter((p) => !p.startsWith('body.')) };
  return resolvePaletteColor(catalog, clothOnly, skin) ? skin : undefined;
}
