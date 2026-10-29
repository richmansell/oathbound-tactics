/**
 * Chapter 1 — all scenes (story scenes s01–s24, battle-trigger scenes s40–s87).
 * Split by act for editing; see docs/story/chapters/chapter1.md for the beat sheet and
 * docs/story/chapters/chapter1_vo_script.md for the voice-actor script.
 */
import type { SceneDef } from '../../../schema';
import { scenesAct1 } from './scenes/act1';
import { scenesAct2 } from './scenes/act2';
import { scenesAct3 } from './scenes/act3';

export const scenes: Record<string, SceneDef> = {
  ...scenesAct1,
  ...scenesAct2,
  ...scenesAct3,
};
