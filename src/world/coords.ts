/**
 * World coordinate conventions.
 *
 * - **World tiles** are battle-scale tiles with integer coordinates. The full world target is
 *   ~30,000 × 30,000 tiles, but nothing stops callers going beyond (generation is endless).
 * - **Chunks** are 32 × 32 tiles, generated deterministically from the world seed.
 * - **KMU** (kingdom map units, 0..1023, y = 0 north) are the story docs' coordinates for the
 *   hand-authored kingdom of Aldmere. 1 KMU = 4 tiles, so the kingdom is 4096 × 4096 tiles and
 *   sits centred in the 30,000-tile world: KMU (0, 0) is tile (12952, 12952).
 */

export const CHUNK = 32;
export const CHUNK_SHIFT = 5;
export const CHUNK_MASK = CHUNK - 1;
export const CHUNK_AREA = CHUNK * CHUNK;

export const KMU_TO_TILES = 4;
export const KINGDOM_KMU = 1024;
export const WORLD_SIZE = 30000;
/** Tile coordinate of KMU (0, 0), on both axes. */
export const KINGDOM_ORIGIN = WORLD_SIZE / 2 - (KINGDOM_KMU * KMU_TO_TILES) / 2; // 12952

/** KMU → tile coordinate (float; KMU k covers tiles [origin + 4k, origin + 4k + 4)). */
export function kmuToTileF(k: number): number {
  return KINGDOM_ORIGIN + k * KMU_TO_TILES;
}

/** KMU → integer tile coordinate. */
export function kmuToTile(k: number): number {
  return Math.round(KINGDOM_ORIGIN + k * KMU_TO_TILES);
}

/** Tile coordinate → KMU (float). */
export function tileToKmu(t: number): number {
  return (t - KINGDOM_ORIGIN) / KMU_TO_TILES;
}

export function kmuToTileXY(p: readonly [number, number]): [number, number] {
  return [kmuToTile(p[0]), kmuToTile(p[1])];
}

export function tileToKmuXY(x: number, y: number): [number, number] {
  return [tileToKmu(x), tileToKmu(y)];
}

/** Chunk coordinate containing a tile coordinate (floor division, works for negatives). */
export function chunkOf(t: number): number {
  return Math.floor(t / CHUNK);
}

/** Unique numeric key for a chunk (valid for |cx|, |cy| < 32768). */
export function chunkKey(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

export function chunkFromKey(k: number): [number, number] {
  const cx = Math.floor(k / 65536) - 32768;
  const cy = (k % 65536) - 32768;
  return [cx, cy];
}

/** Unique numeric key for a tile (valid for |x|, |y| < 2^24). */
export function tileKey(x: number, y: number): number {
  return (x + 16777216) * 33554432 + (y + 16777216);
}

/** Whether a tile lies inside the authored kingdom (KMU 0..1023). */
export function inKingdom(x: number, y: number): boolean {
  const lo = KINGDOM_ORIGIN, hi = KINGDOM_ORIGIN + KINGDOM_KMU * KMU_TO_TILES;
  return x >= lo && y >= lo && x < hi && y < hi;
}
