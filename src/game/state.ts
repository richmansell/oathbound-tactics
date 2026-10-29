/**
 * Persistent game state (one save slot) and a tiny reactive store.
 * Plain JSON so it can be saved locally now and synced to a server later.
 */
import { useEffect, useState } from 'preact/hooks';
import type { UnitBuild } from '../engine/types';

export type Difficulty = 'story' | 'tactician' | 'oathsworn';

export interface WorldSave {
  seed: number;
  /** Party position in world tiles. */
  pos: [number, number];
  facing: 'n' | 'e' | 's' | 'w';
  /** Discovered chunk keys ("cx,cy"). */
  discovered: string[];
  /** Cleared roaming spawns: spawn key → world-time epoch cleared. */
  cleared: Record<string, number>;
  /** Persistent world changes (opened chests, unlocked gates…). */
  deltas: Record<string, string>;
  /** World clock in minutes (day/night). */
  time: number;
  /** Steps since the last encounter (for pacing). */
  steps: number;
  /** Nodes the player has visited (fast travel). */
  visited: string[];
}

export interface Settings {
  difficulty: Difficulty;
  battleSpeed: number;
  textSpeed: number;     // characters per second; 0 = instant
  autoAdvance: boolean;
  showHpBars: boolean;
  volumes?: { master: number; music: number; sfx: number; voice: number };
}

export interface StoryProgress {
  pack: string;
  chapter: string;
  /** Index of the next beat in the chapter. */
  beat: number;
  flags: string[];
  /** Completed scene/battle ids. */
  done: string[];
}

export interface GameState {
  version: 1;
  id: string;
  name: string;
  created: number;
  saved: number;
  playtime: number;
  story: StoryProgress;
  roster: UnitBuild[];
  /** Roster ids in deployment priority order. */
  party: string[];
  inventory: Record<string, number>;
  gil: number;
  world: WorldSave;
  settings: Settings;
  /** Saved formation for online PvP / world PvP. */
  pvpParty: string[];
  /** Shop stock unlocked by story. */
  shopUnlocks: string[];
  /** Units lost forever (Oathsworn). */
  fallen: { id: string; name: string; job: string; level: number }[];
  /** Recruitable pool seed so the tavern list is stable per visit. */
  tavernSeed: number;
}

export const MAX_ROSTER = 16;

let current: GameState | null = null;
const listeners = new Set<() => void>();

export function getGame(): GameState {
  if (!current) throw new Error('No game loaded');
  return current;
}

export function hasGame(): boolean {
  return !!current;
}

export function setGame(g: GameState | null): void {
  current = g;
  for (const l of listeners) l();
}

/** Mutate the game state in place and notify subscribers. */
export function mutate(fn: (g: GameState) => void): void {
  if (!current) return;
  fn(current);
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Preact hook: re-render on any game change. */
export function useGame(): GameState {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return getGame();
}

export function rosterUnit(id: string): UnitBuild | undefined {
  return current?.roster.find((u) => u.id === id);
}

export function addItem(id: string, n = 1): void {
  mutate((g) => { g.inventory[id] = (g.inventory[id] ?? 0) + n; if (g.inventory[id] <= 0) delete g.inventory[id]; });
}

export function itemCount(id: string): number {
  return current?.inventory[id] ?? 0;
}
