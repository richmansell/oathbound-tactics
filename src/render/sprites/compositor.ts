/**
 * Runtime character compositor.
 *
 *   const sheet = await composeCharacter({ body: 'male', layers: defaultLayersForAppearance(app) });
 *   const plan = sheet.resolve('attack');           // weapon-aware animation choice
 *   const { frame } = frameAt(plan, elapsedMs);
 *   sheet.drawFrame(ctx, plan.anim, 's', frame, feetX, feetY, { scale: 2 });
 *   …
 *   releaseCharacter(sheet);
 *
 * Animations are composed lazily on first use (one canvas per animation, sized to that
 * animation's frame size), cached per request, and evicted under a global byte budget.
 */
import type { BodyType, LayerRef } from '../../content/schema';
import { type AnimPlan, type GameAnim, resolveAnim } from './anims';
import { type Catalog, type Dir, type SheetAnim, DIR_ROW, defaultAssetBase, getCatalogIfLoaded, loadCatalog } from './catalog';
import {
  type CharacterPlan,
  type CharacterRequest,
  type ResolvedRef,
  composeOps,
  isComplete,
  isUsable,
  missingWeight,
  planCharacter,
  requestKey,
} from './plan';
import { type AnyCanvas, type LayerImageHandle, acquireLayerImage, context2d, createCanvas, setImageCacheBudget } from './recolor';

export type { CharacterRequest } from './plan';
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ComposedAnim {
  anim: SheetAnim;
  canvas: AnyCanvas;
  frameSize: number;
  frames: number;
  rows: number;
  /** Every equipped item is present in this animation. */
  complete: boolean;
  /** Items without a sheet for this animation (not drawn). */
  missing: readonly string[];
}

export interface AnimInfo {
  frameSize: number;
  frames: number;
  rows: number;
  complete: boolean;
  missing: readonly string[];
}

export interface DrawOpts {
  /** Integer scale recommended for crisp pixels. Default 1. */
  scale?: number;
  alpha?: number;
  /** Mirror horizontally around the feet anchor. */
  flipX?: boolean;
  /**
   * If the animation is not composed yet (composition starts automatically), draw the first
   * frame of another composed animation instead of nothing. Default true.
   */
  fallback?: boolean;
}

export interface FrameRect {
  canvas: AnyCanvas;
  sx: number;
  sy: number;
  size: number;
  /** Feet anchor inside the frame (pixels from the frame's top-left). */
  anchorX: number;
  anchorY: number;
}

export interface CharacterSheet {
  /** Request hash (cache key). */
  readonly key: string;
  readonly body: BodyType;
  /** Resolved items in request order (after companions; unknown/unsupported items dropped). */
  readonly refs: readonly ResolvedRef[];
  /** First weapon item (drives attack style), if any. */
  readonly weaponKey: string | null;
  /** Problems found while resolving (unknown keys, colours, body support). */
  readonly warnings: readonly string[];
  /** Feet anchor inside a 64px body frame. */
  readonly anchor: { x: number; y: number };
  info(anim: SheetAnim): AnimInfo;
  /** Every equipped item has this animation. */
  isComplete(anim: SheetAnim): boolean;
  /** Choose sheet animation + frames for a game action (weapon-aware, coverage-aware). */
  resolve(gameAnim: GameAnim, weaponKey?: string | null): AnimPlan;
  /** Compose (once) and return an animation sheet. */
  anim(anim: SheetAnim): Promise<ComposedAnim>;
  /** Composed sheet if ready (no side effects). */
  peek(anim: SheetAnim): ComposedAnim | undefined;
  preload(anims: readonly SheetAnim[]): Promise<void>;
  /** Source rectangle of a frame (for custom renderers), or null if not composed yet. */
  frameRect(anim: SheetAnim, dir: Dir, frame: number): FrameRect | null;
  /**
   * Draw a frame with the character's FEET at (x, y) (bottom-centre of the 64px body frame,
   * also for oversize frames). Returns false if the animation is still composing.
   */
  drawFrame(ctx: Ctx2D, anim: SheetAnim, dir: Dir, frame: number, x: number, y: number, opts?: DrawOpts): boolean;
  /** Drop composed canvases (all, or one animation); they recompose on demand. */
  trim(anim?: SheetAnim): void;
}

// ---------------------------------------------------------------------------
// Configuration + global budget of composed canvases
// ---------------------------------------------------------------------------

let assetBase: string | null = null;
let composedBudget = 96 * 1024 * 1024;
let composedBytes = 0;
let clock = 0;

export interface SpriteConfig {
  /** URL prefix of public/assets/lpc/ (default `${BASE_URL}assets/lpc/`). */
  assetBase?: string;
  /** Byte budget of composed animation canvases across all characters (default 96 MiB). */
  composedBudgetBytes?: number;
  /** Byte budget of cached (recoloured) source layer images (default 48 MiB). */
  imageBudgetBytes?: number;
}

export function configureSprites(cfg: SpriteConfig): void {
  if (cfg.assetBase !== undefined) assetBase = cfg.assetBase.replace(/\/?$/, '/');
  if (cfg.composedBudgetBytes !== undefined) {
    composedBudget = cfg.composedBudgetBytes;
    evictComposed(null);
  }
  if (cfg.imageBudgetBytes !== undefined) setImageCacheBudget(cfg.imageBudgetBytes);
}

const base = () => assetBase ?? defaultAssetBase();

interface Slot {
  composed: ComposedAnim | null;
  pending: Promise<ComposedAnim> | null;
  bytes: number;
  lastUsed: number;
  generation: number;
}

const live = new Set<SheetImpl>();

function evictComposed(keep: Slot | null): void {
  if (composedBytes <= composedBudget) return;
  const all: { sheet: SheetImpl; anim: SheetAnim; slot: Slot }[] = [];
  for (const s of live) for (const [anim, slot] of s.slots) if (slot.composed && slot !== keep) all.push({ sheet: s, anim, slot });
  all.sort((a, b) => a.slot.lastUsed - b.slot.lastUsed);
  for (const { sheet, anim } of all) {
    if (composedBytes <= composedBudget) break;
    sheet.trim(anim);
  }
}

export function spriteMemoryStats(): { sheets: number; composedBytes: number; composedBudget: number } {
  return { sheets: live.size, composedBytes, composedBudget };
}

// ---------------------------------------------------------------------------
// Sheet implementation
// ---------------------------------------------------------------------------

class SheetImpl implements CharacterSheet {
  readonly slots = new Map<SheetAnim, Slot>();
  refCount = 0;
  released = false;
  readonly key: string;
  readonly body: BodyType;
  readonly refs: readonly ResolvedRef[];
  readonly weaponKey: string | null;
  readonly warnings: readonly string[];
  readonly anchor: { x: number; y: number };

  constructor(private readonly catalog: Catalog, private readonly plan: CharacterPlan) {
    this.key = plan.key;
    this.body = plan.body;
    this.refs = plan.refs;
    this.weaponKey = plan.weaponKey;
    this.warnings = plan.warnings;
    this.anchor = { x: catalog.anchor.x, y: catalog.anchor.y };
  }

  info(anim: SheetAnim): AnimInfo {
    const g = this.catalog.animations[anim];
    return { frameSize: g.frameSize, frames: g.frames, rows: g.rows, complete: isComplete(this.plan, anim), missing: this.plan.missing[anim] ?? [] };
  }

  isComplete(anim: SheetAnim): boolean {
    return isComplete(this.plan, anim);
  }

  resolve(gameAnim: GameAnim, weaponKey: string | null = this.weaponKey): AnimPlan {
    return resolveAnim(gameAnim, weaponKey, {
      catalog: this.catalog,
      body: this.body,
      available: (a) => isUsable(this.plan, a),
      missingCount: (a) => missingWeight(this.plan, a),
    });
  }

  private slot(anim: SheetAnim): Slot {
    let s = this.slots.get(anim);
    if (!s) {
      s = { composed: null, pending: null, bytes: 0, lastUsed: 0, generation: 0 };
      this.slots.set(anim, s);
    }
    return s;
  }

  peek(anim: SheetAnim): ComposedAnim | undefined {
    return this.slots.get(anim)?.composed ?? undefined;
  }

  anim(anim: SheetAnim): Promise<ComposedAnim> {
    if (this.released) return Promise.reject(new Error('Character sheet was released'));
    const s = this.slot(anim);
    s.lastUsed = ++clock;
    if (s.composed) return Promise.resolve(s.composed);
    if (!s.pending) {
      const gen = s.generation;
      s.pending = this.compose(anim).then(
        (c) => {
          s.pending = null;
          if (this.released || s.generation !== gen) {
            c.canvas.width = c.canvas.height = 0;
            return c;
          }
          s.composed = c;
          s.bytes = c.canvas.width * c.canvas.height * 4;
          composedBytes += s.bytes;
          evictComposed(s);
          return c;
        },
        (e) => {
          s.pending = null;
          throw e;
        },
      );
    }
    return s.pending;
  }

  async preload(anims: readonly SheetAnim[]): Promise<void> {
    await Promise.all(anims.map((a) => this.anim(a)));
  }

  private async compose(anim: SheetAnim): Promise<ComposedAnim> {
    const comp = composeOps(this.catalog, this.plan, anim);
    const handles = new Map<string, LayerImageHandle>();
    try {
      const results = await Promise.allSettled(
        comp.sources.map(async (s) => {
          const h = await acquireLayerImage(base() + s.src, s.mappings);
          handles.set(`${s.src}|${s.mappingKey}`, h);
        }),
      );
      for (const r of results) if (r.status === 'rejected') console.warn('[sprites]', (r.reason as Error)?.message ?? r.reason);
      const canvas = createCanvas(comp.width, comp.height);
      const ctx = context2d(canvas);
      ctx.imageSmoothingEnabled = false;
      for (const op of comp.ops) {
        const h = handles.get(`${op.src}|${op.mappingKey}`);
        if (!h) continue;
        const sw = Math.min(op.sw, h.image.width - op.sx);
        const sh = Math.min(op.sh, h.image.height - op.sy);
        if (sw <= 0 || sh <= 0) continue;
        ctx.drawImage(h.image as CanvasImageSource, op.sx, op.sy, sw, sh, op.dx, op.dy, sw, sh);
      }
      return {
        anim,
        canvas,
        frameSize: comp.frameSize,
        frames: comp.frames,
        rows: comp.rows,
        complete: isComplete(this.plan, anim),
        missing: this.plan.missing[anim] ?? [],
      };
    } finally {
      for (const h of handles.values()) h.release();
    }
  }

  frameRect(anim: SheetAnim, dir: Dir, frame: number): FrameRect | null {
    const c = this.peek(anim);
    if (!c) return null;
    const row = c.rows === 1 ? 0 : DIR_ROW[dir];
    const col = Math.max(0, Math.min(c.frames - 1, Math.floor(frame)));
    const off = (c.frameSize - this.catalog.frameSize) / 2;
    return {
      canvas: c.canvas,
      sx: col * c.frameSize,
      sy: row * c.frameSize,
      size: c.frameSize,
      anchorX: off + this.anchor.x,
      anchorY: off + this.anchor.y,
    };
  }

  drawFrame(ctx: Ctx2D, anim: SheetAnim, dir: Dir, frame: number, x: number, y: number, opts: DrawOpts = {}): boolean {
    if (this.released) return false;
    const s = this.slot(anim);
    s.lastUsed = ++clock;
    let rect = this.frameRect(anim, dir, frame);
    let ready = !!rect;
    if (!rect) {
      void this.anim(anim).catch((e) => console.warn('[sprites]', e));
      if (opts.fallback !== false) {
        for (const alt of ['idle', 'walk', 'combat_idle', 'walk_128'] as SheetAnim[]) {
          if ((rect = this.frameRect(alt, dir, 0))) break;
        }
      }
      if (!rect) return false;
    }
    const scale = opts.scale ?? 1;
    const prevAlpha = ctx.globalAlpha;
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;
    const size = rect.size * scale;
    if (opts.flipX) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(rect.canvas as CanvasImageSource, rect.sx, rect.sy, rect.size, rect.size, -rect.anchorX * scale, y - rect.anchorY * scale, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(rect.canvas as CanvasImageSource, rect.sx, rect.sy, rect.size, rect.size, x - rect.anchorX * scale, y - rect.anchorY * scale, size, size);
    }
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = prevSmooth;
    return ready;
  }

  trim(anim?: SheetAnim): void {
    const list = anim ? [anim] : [...this.slots.keys()];
    for (const a of list) {
      const s = this.slots.get(a);
      if (!s) continue;
      s.generation++;
      if (s.composed) {
        composedBytes -= s.bytes;
        s.composed.canvas.width = 0;
        s.composed.canvas.height = 0;
        s.composed = null;
        s.bytes = 0;
      }
    }
  }

  dispose(): void {
    this.trim();
    this.released = true;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const sheets = new Map<string, SheetImpl>();

/**
 * Plan a character and return its (lazily composed) sheet. Identical requests share one sheet;
 * every call must be balanced by `releaseCharacter`.
 */
export async function composeCharacter(req: CharacterRequest): Promise<CharacterSheet> {
  const catalog = getCatalogIfLoaded() ?? (await loadCatalog(base() + 'catalog.json'));
  const key = requestKey(req);
  let sheet = sheets.get(key);
  if (!sheet) {
    const plan = planCharacter(catalog, req);
    for (const w of plan.warnings) console.warn('[sprites]', w);
    sheet = new SheetImpl(catalog, plan);
    sheets.set(key, sheet);
    live.add(sheet);
  }
  sheet.refCount++;
  return sheet;
}

/** Release a sheet obtained from `composeCharacter`; frees its canvases when unused. */
export function releaseCharacter(sheet: CharacterSheet | string): void {
  const key = typeof sheet === 'string' ? sheet : sheet.key;
  const s = sheets.get(key);
  if (!s) return;
  s.refCount--;
  if (s.refCount <= 0) {
    sheets.delete(key);
    live.delete(s);
    s.dispose();
  }
}

/** Convenience: compose + preload the animations needed for a set of game actions. */
export async function composeCharacterFor(
  req: CharacterRequest,
  gameAnims: readonly GameAnim[] = ['idle', 'walk'],
): Promise<CharacterSheet> {
  const sheet = await composeCharacter(req);
  await sheet.preload([...new Set(gameAnims.map((g) => sheet.resolve(g).anim))]);
  return sheet;
}

export type { LayerRef };
