/** LPC layered character sprites — public API. */
export * from './catalog';
export * from './palette';
export * from './anims';
export * from './appearance';
export {
  type CharacterPlan,
  type CharacterRequest,
  type ResolvedLayer,
  type ResolvedRef,
  type DrawOp,
  type AnimComposition,
  planCharacter,
  composeOps,
  isComplete,
  isUsable,
  missingWeight,
  requestKey,
  resolveColors,
} from './plan';
export {
  type CharacterSheet,
  type ComposedAnim,
  type AnimInfo,
  type DrawOpts,
  type FrameRect,
  type SpriteConfig,
  type Ctx2D,
  composeCharacter,
  composeCharacterFor,
  releaseCharacter,
  configureSprites,
  spriteMemoryStats,
} from './compositor';
export { acquireLayerImage, recolorCanvas, clearImageCache, imageCacheStats, setImageCacheBudget } from './recolor';
export { decodePng, type RgbaImage } from './png';
