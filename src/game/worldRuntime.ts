/**
 * Glue between the procedural world (src/world) and the game: a shared
 * WorldGen per save seed, node ↔ set-piece mapping and the carve function.
 */
import { carveBattlefield } from '../world/carve';
import { kmuToTileXY } from '../world/coords';
import { WorldGen } from '../world/gen';
import { MAIN_GEOGRAPHY } from '../world/geography';
import { sampleOverview } from '../world/minimap';
import { KINGDOM_ORIGIN } from '../world/coords';
import type { Pos } from '../engine/types';
import type { CarveFn } from './overworld';
import { packData } from './campaignData';

let cached: { seed: number; gen: WorldGen } | null = null;

export function worldGen(seed: number): WorldGen {
  if (!cached || cached.seed !== seed) cached = { seed, gen: new WorldGen(seed, MAIN_GEOGRAPHY) };
  return cached.gen;
}

export const carve: CarveFn = (gen, x, y, opts) => carveBattlefield(gen as unknown as WorldGen, x, y, { size: opts?.size ?? 13, approachDir: opts?.approachDir });

/** Set-piece ids are world node ids (towns, landmarks, battle sites). */
export function nodeForSetPiece(id: string, pack = 'main'): string | null {
  return packData(pack).pack.world.nodes.some((n) => n.id === id) ? id : null;
}

/** Arrival tile for a node: the set piece's hub, else its KMU position. */
export function nodeTile(gen: WorldGen, id: string, pack = 'main'): Pos {
  const info = gen.setPieceInfo(id);
  if (info) return (info as { hub?: Pos }).hub ?? info.center;
  const n = packData(pack).pack.world.nodes.find((x) => x.id === id);
  return n ? kmuToTileXY(n.pos) : [0, 0];
}

let overview: { seed: number; canvas: HTMLCanvasElement } | null = null;

/** Kingdom overview image (1 px per 8 tiles), cached per world seed. */
export function kingdomOverview(seed: number): HTMLCanvasElement {
  if (overview && overview.seed === seed) return overview.canvas;
  const gen = worldGen(seed);
  const step = 8, size = 4096 / step;
  const px = sampleOverview(gen, KINGDOM_ORIGIN, KINGDOM_ORIGIN, size, size, step);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  overview = { seed, canvas: cv };
  return cv;
}
