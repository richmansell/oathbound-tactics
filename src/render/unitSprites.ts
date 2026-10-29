/**
 * Builds a unit's visible layer stack (appearance + job outfit + equipment)
 * and adapts composited LPC sheets to the BattleView's UnitSpriteSource.
 *
 * Layer rules:
 *  - Equipment replaces outfit pieces in the same catalogue slot, except body
 *    armour, which is worn over the job's shirt.
 *  - Robes replace both torso and legs. Helmets marked hidesHair remove hair.
 *  - Items that don't exist for the unit's body type are substituted.
 */
import { ITEMS } from '../content/items';
import { JOBS } from '../content/jobs';
import type { BodyType, EquipSlot, LayerRef } from '../content/schema';
import type { Dir, UnitBuild } from '../engine/types';
import type { GameAnimName, UnitSpriteSource } from './scene';
import {
  composeCharacter, defaultLayersForAppearance, frameAt, getCatalogIfLoaded, planDuration, type CharacterSheet,
} from './sprites';

const norm = (s: string) => s.replace(/[\s-]+/g, '_').toLowerCase();

/** Robe/tunic etc. for bodies that lack the art. */
function substitute(ref: LayerRef, body: BodyType): LayerRef[] {
  const color = ref.color ? clothColor(ref.color) : undefined;
  switch (ref.key) {
    case 'torso_clothes_robe':
      return [{ key: 'torso_clothes_longsleeve', color }, { key: 'legs_skirts_plain', color }];
    case 'torso_clothes_tunic':
    case 'torso_clothes_blouse':
    case 'torso_clothes_corset':
      return [{ key: 'torso_clothes_longsleeve2', color }];
    case 'torso_clothes_vest':
    case 'torso_clothes_vest_open':
      return [{ key: 'torso_jacket_tabard', color: ref.color }];
    case 'torso_jacket_trench':
    case 'torso_jacket_iverness':
    case 'torso_jacket_frock':
    case 'torso_jacket_collared':
      return [{ key: 'torso_jacket_tabard', color: 'charcoal' }];
    case 'belt_mage':
      return [{ key: 'belt_sash', color: 'charcoal' }];
    case 'legs_skirt_belle':
      return [{ key: 'legs_skirts_plain', color }];
    case 'legs_widepants':
      return [{ key: 'legs_pantaloons', color }];
    default:
      void body;
      if (ref.key.startsWith('neck_')) return [{ key: 'neck_necklace', color: ref.color }];
      return [];
  }
}

/** Map robe file-variant names to cloth palette names. */
function clothColor(c: string): string {
  const n = norm(c);
  const map: Record<string, string> = { forest_green: 'forest', dark_gray: 'charcoal', light_gray: 'gray', dark_brown: 'walnut', _brown: 'brown' };
  return map[n] ?? n;
}

function slotOf(key: string): string {
  return getCatalogIfLoaded()?.items[key]?.slot ?? key.split('_')[0];
}

function supports(key: string, body: BodyType): boolean {
  const it = getCatalogIfLoaded()?.items[key];
  if (!it) return false;
  return !it.bodies || it.bodies.length === 0 || it.bodies.includes(body);
}

/** Match a requested colour against an item's file variants (spaces vs underscores). */
function fixColor(ref: LayerRef): LayerRef {
  const it = getCatalogIfLoaded()?.items[ref.key];
  if (!it || !ref.color) return ref;
  const variants: string[] = it.variants ?? [];
  const want = norm(ref.color);
  const v = variants.find((x) => norm(x) === want);
  if (v) return { ...ref, color: v };
  if (variants.length && !it.recolor?.length) return { ...ref, color: variants[0] };
  return ref;
}

export interface UnitLayerResult {
  body: BodyType;
  layers: LayerRef[];
  weaponKey: string | null;
}

export function unitLayers(build: UnitBuild, lost: EquipSlot[] = []): UnitLayerResult {
  const ap = build.appearance;
  const body = ap.body;
  const base = defaultLayersForAppearance({ ...ap, outfit: undefined });

  // Job outfit + personal outfit overrides
  const job = JOBS[build.job];
  const jobOutfit = [...(job?.outfit.all ?? []), ...(job?.outfit[body] ?? [])];
  let outfit: LayerRef[] = [...jobOutfit];
  const ownLook = !ap.outfitJob || ap.outfitJob === build.job;
  for (const ref of Object.values(ap.outfit ?? {})) {
    if (!ref) continue;
    const s = slotOf(ref.key);
    if (!ownLook && ['torso', 'legs', 'feet', 'hat', 'waist'].includes(s)) continue;
    outfit = outfit.filter((o) => slotOf(o.key) !== s);
    outfit.push(ref);
  }

  // Equipment visuals
  let hideHair = false;
  const equipLayers: LayerRef[] = [];
  let weaponKey: string | null = null;
  for (const slot of ['body', 'head', 'accessory', 'off', 'main'] as EquipSlot[]) {
    if (lost.includes(slot)) continue;
    const id = build.equipment[slot];
    const it = id ? ITEMS[id] : undefined;
    if (!it?.visual?.length) continue;
    if (it.hidesHair) hideHair = true;
    for (const ref of it.visual) {
      const s = slotOf(ref.key);
      const keepUnder = it.category === 'armor' && s === 'torso';
      if (!keepUnder) outfit = outfit.filter((o) => slotOf(o.key) !== s);
      if (it.category === 'robe' && s === 'torso') outfit = outfit.filter((o) => slotOf(o.key) !== 'legs' && slotOf(o.key) !== 'waist');
      if (s === 'hat') outfit = outfit.filter((o) => slotOf(o.key) !== 'hat');
      equipLayers.push(ref);
      if (slot === 'main' && !weaponKey) weaponKey = ref.key;
    }
  }

  let layers = [...base, ...outfit, ...equipLayers];
  // Cosmetic dyes override colours per catalogue item.
  if (ap.dyes) layers = layers.map((l) => (ap.dyes![l.key] ? { ...l, color: ap.dyes![l.key] } : l));
  if (hideHair) layers = layers.filter((l) => slotOf(l.key) !== 'hair');

  // Body-type substitution
  const out: LayerRef[] = [];
  for (const l of layers) {
    if (supports(l.key, body)) { out.push(fixColor(l)); continue; }
    for (const sub of substitute(l, body)) if (supports(sub.key, body)) out.push(fixColor(sub));
  }
  return { body, layers: out, weaponKey };
}

/** UnitSpriteSource backed by a composited LPC CharacterSheet. */
export class LpcUnitSprite implements UnitSpriteSource {
  sheet: CharacterSheet | null = null;
  private failed = false;
  constructor(public readonly req: UnitLayerResult) {
    composeCharacter({ body: req.body, layers: req.layers })
      .then((s) => { this.sheet = s; void s.preload(['walk', s.resolve('idle').anim, s.resolve('attack', req.weaponKey).anim, 'hurt'].filter(Boolean) as never); })
      .catch((e) => { this.failed = true; console.warn('compose failed', e); });
  }

  get ready(): boolean { return !!this.sheet; }

  draw(ctx: CanvasRenderingContext2D, anim: GameAnimName, dir: Dir, elapsed: number, x: number, y: number, opts: { alpha?: number; tint?: string } = {}): void {
    const s = this.sheet;
    if (!s) return;
    const plan = s.resolve(anim, this.req.weaponKey);
    const { frame } = frameAt(plan, elapsed);
    s.drawFrame(ctx, plan.anim, dir, frame, x, y, { alpha: opts.alpha ?? 1 });
    if (opts.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      s.drawFrame(ctx, plan.anim, dir, frame, x, y, { alpha: 0.45 });
      ctx.restore();
    }
  }

  duration(anim: GameAnimName): number {
    const s = this.sheet;
    if (!s) return 500;
    return planDuration(s.resolve(anim, this.req.weaponKey));
  }

  impactMs(anim: GameAnimName): number {
    const s = this.sheet;
    if (!s) return 250;
    const plan = s.resolve(anim, this.req.weaponKey);
    const idx = plan.impact ?? Math.floor(plan.frames.length / 2);
    return idx * plan.frameMs;
  }

  get broken(): boolean { return this.failed; }
}

const spriteCache = new Map<string, LpcUnitSprite>();

/** Shared sprite per distinct look (identical builds reuse one sheet). */
export function spriteForBuild(build: UnitBuild, lost: EquipSlot[] = []): LpcUnitSprite | null {
  if (!getCatalogIfLoaded()) return null;
  const req = unitLayers(build, lost);
  const key = JSON.stringify(req);
  let s = spriteCache.get(key);
  if (!s) {
    s = new LpcUnitSprite(req);
    spriteCache.set(key, s);
    if (spriteCache.size > 120) spriteCache.delete(spriteCache.keys().next().value as string);
  }
  return s;
}
