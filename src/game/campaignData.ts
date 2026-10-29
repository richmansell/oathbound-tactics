/**
 * Lookups over the loaded campaign pack: characters, enemy templates, maps,
 * locations. Campaign packs register here; the base game registers 'main'.
 */
import { mainCampaign, maps as mainMaps, enemies as mainEnemies, bodyOverride as mainBodyOverride } from '../content/campaigns/main';
import type { EnemyTemplate, MapDef } from '../content/campaigns/main';
import type { Appearance, CampaignPack, CharacterDef } from '../content/schema';
import { parseMapRows } from '../engine/grid';
import type { BattleMap } from '../engine/types';

export interface PackData {
  pack: CampaignPack;
  maps: Record<string, MapDef>;
  enemies: Record<string, EnemyTemplate>;
  bodyOverride: Record<string, 'skeleton' | 'zombie'>;
}

const packs = new Map<string, PackData>();
packs.set('main', { pack: mainCampaign, maps: mainMaps, enemies: mainEnemies, bodyOverride: mainBodyOverride });

export function packData(id = 'main'): PackData {
  const p = packs.get(id);
  if (!p) throw new Error(`Unknown pack ${id}`);
  return p;
}

export function registerPack(d: PackData): void {
  packs.set(d.pack.id, d);
}

export function character(id: string, pack = 'main'): CharacterDef | undefined {
  return packData(pack).pack.characters[id];
}

export function enemyTemplate(id: string, pack = 'main'): EnemyTemplate | undefined {
  return packData(pack).enemies[id];
}

/** Display name and appearance for any speaker id (character, enemy template, or generic). */
export function speaker(id: string, pack = 'main'): { name: string; appearance?: Appearance; title?: string } {
  const c = character(id, pack);
  if (c) return { name: c.displayName ?? c.name, appearance: c.appearance, title: c.title };
  const e = enemyTemplate(id, pack);
  if (e) return { name: e.name, appearance: e.appearance };
  return { name: id.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) };
}

const mapCache = new Map<string, BattleMap>();

export function battleMap(id: string, pack = 'main'): BattleMap {
  const key = `${pack}:${id}`;
  const hit = mapCache.get(key);
  if (hit) return structuredClone(hit);
  const def = packData(pack).maps[id];
  if (!def) throw new Error(`Unknown map ${id}`);
  const m = parseMapRows(def.id, def.name, def.rows, def.theme, def.props ?? []);
  mapCache.set(key, m);
  return structuredClone(m);
}

export function locationName(id: string, pack = 'main'): string {
  return packData(pack).pack.locations[id]?.name ?? id;
}
