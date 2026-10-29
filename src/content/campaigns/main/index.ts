/**
 * The base campaign: "Oathbound Tactics — The Split Penny" (Chapter 1 playable).
 * Story bible: docs/story/BIBLE.md · Chapter 1 beat sheet: docs/story/chapters/chapter1.md
 * Engine work needed (story/monster jobs, schema requests): docs/story/STORY_JOBS.md, docs/story/SCHEMA_REQUESTS.md
 */
import type { CampaignPack } from '../../schema';
import { characters } from './characters';
import { locations } from './locations';
import { world } from './world';
import { chapter1 } from './chapter1';
import { scenes as chapter1Scenes } from './chapter1/scenes';
import { battles as chapter1Battles } from './chapter1/battles';

export const mainCampaign: CampaignPack = {
  id: 'main',
  title: 'Oathbound Tactics',
  subtitle: 'The Split Penny',
  version: '0.1.0',
  characters,
  locations,
  scenes: { ...chapter1Scenes },
  battles: { ...chapter1Battles },
  chapters: [chapter1],
  world,
  startingParty: ['bren', 'odo', 'wat', 'merrit'],
};

export default mainCampaign;

// Companion data not (yet) part of the CampaignPack schema — see SCHEMA_REQUESTS.md.
export { maps } from './maps';
export type { MapDef, PropType } from './maps';
export { enemies, bodyOverride } from './enemies';
export type { EnemyTemplate } from './enemies';
export { regions, KMU_TO_TILES } from './world';
export type { WorldRegion, Biome } from './world';
