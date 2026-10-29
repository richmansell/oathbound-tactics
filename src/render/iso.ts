/** Isometric projection with 90° camera rotation. All values in native (unzoomed) pixels. */
import type { Dir } from '../engine/types';

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
/** Pixels per height half-step. */
export const HEIGHT_PX = 8;

export type Rot = 0 | 1 | 2 | 3;

/** Rotate grid coords for the camera. w/h are map dimensions. */
export function rotate(x: number, y: number, rot: Rot, w: number, h: number): [number, number] {
  switch (rot) {
    case 0: return [x, y];
    case 1: return [h - 1 - y, x];
    case 2: return [w - 1 - x, h - 1 - y];
    case 3: return [y, w - 1 - x];
  }
}

/** Rotated grid → screen (tile top-centre of the diamond's top vertex area centre). */
export function project(rx: number, ry: number, height: number): [number, number] {
  return [(rx - ry) * HALF_W, (rx + ry) * HALF_H - height * HEIGHT_PX];
}

/** Direction as seen on screen after rotation. */
export function rotateDir(d: Dir, rot: Rot): Dir {
  const order: Dir[] = ['n', 'e', 's', 'w'];
  const i = order.indexOf(d);
  return order[(i + rot) % 4];
}

/** Inverse: screen-relative direction → world direction. */
export function unrotateDir(d: Dir, rot: Rot): Dir {
  const order: Dir[] = ['n', 'e', 's', 'w'];
  const i = order.indexOf(d);
  return order[(i - rot + 4) % 4];
}

/**
 * LPC sheet row for a screen-relative facing. Rotated 'e' points down-right on
 * screen, 's' down-left, 'w' up-left, 'n' up-right.
 */
export function lpcRow(screenDir: Dir): 'up' | 'left' | 'down' | 'right' {
  switch (screenDir) {
    case 'e': return 'right';
    case 's': return 'down';
    case 'w': return 'left';
    case 'n': return 'up';
  }
}

export interface Camera {
  /** World-space (native px) point at the screen centre. */
  x: number;
  y: number;
  zoom: number;
  rot: Rot;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
