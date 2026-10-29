/**
 * Save slots in localStorage (wrapped in try/catch: private mode, quota and
 * locked-down webviews must not crash the game). Format is versioned JSON so
 * cloud saves can reuse it.
 */
import type { GameState } from './state';

const PREFIX = 'oathbound.save.';
export const SLOTS = ['auto', '1', '2', '3'] as const;
export type Slot = (typeof SLOTS)[number];

export interface SlotInfo {
  slot: Slot;
  name: string;
  saved: number;
  playtime: number;
  chapter: string;
  leader: string;
  level: number;
}

export function saveGame(g: GameState, slot: Slot): boolean {
  try {
    g.saved = Date.now();
    localStorage.setItem(PREFIX + slot, JSON.stringify(g));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadGame(slot: Slot): GameState | null {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    if (g.version !== 1) return null;
    return migrate(g);
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function deleteSave(slot: Slot): void {
  try { localStorage.removeItem(PREFIX + slot); } catch { /* ignore */ }
}

export function listSaves(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const slot of SLOTS) {
    const g = loadGame(slot);
    if (!g) continue;
    const leader = g.roster.find((u) => u.id === g.party[0]) ?? g.roster[0];
    out.push({ slot, name: g.name, saved: g.saved, playtime: g.playtime, chapter: g.story.chapter, leader: leader?.name ?? '', level: leader?.level ?? 1 });
  }
  return out.sort((a, b) => b.saved - a.saved);
}

export function latestSave(): SlotInfo | null {
  return listSaves()[0] ?? null;
}

/** Fill in fields added after a save was written. */
function migrate(g: GameState): GameState {
  g.world.visited ??= [];
  g.world.deltas ??= {};
  g.pvpParty ??= g.party.slice(0, 5);
  g.shopUnlocks ??= [];
  g.fallen ??= [];
  g.tavernSeed ??= 1;
  g.settings.textSpeed ??= 45;
  // Early saves stored kingdom-relative positions; world tiles are offset by the kingdom origin.
  if (g.world.pos[0] < 8000 && g.world.pos[1] < 8000) g.world.pos = [g.world.pos[0] + 12952, g.world.pos[1] + 12952];
  return g;
}

export function formatPlaytime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}
