/**
 * Story-mode campaign runner: new games, chapter beats, story battle setup and
 * post-battle bookkeeping. UI-agnostic — screens call into this.
 */
import type { BattleDef, CharacterDef, StoryBeat } from '../content/schema';
import { ITEMS } from '../content/items';
import { JOBS, jobActions } from '../content/jobs';
import { ABILITIES } from '../content/abilities';
import { createBattle, type BattleSetupUnit } from '../engine/battle';
import { autoEquip, createBuild, tierForLevel } from '../engine/factory';
import { hashString } from '../engine/rng';
import { addExp, ensureJob } from '../engine/progression';
import { kmuToTileXY } from '../world/coords';
import type { BattleState, Pos, UnitBuild } from '../engine/types';
import { battleMap, character, enemyTemplate, packData } from './campaignData';
import { getGame, mutate, setGame, type Difficulty, type GameState } from './state';

export const MONEY = 'marks';

// ---------------------------------------------------------------------------
// Builds from story characters
// ---------------------------------------------------------------------------

export function buildFromCharacter(def: CharacterDef, levelOverride?: number): UnitBuild {
  const level = levelOverride ?? def.level ?? 1;
  const b = createBuild({
    id: def.id, name: def.displayName ?? def.name, character: def.id, appearance: { ...def.appearance, outfitJob: def.appearance.outfitJob ?? def.job },
    job: def.job, level, brave: def.brave, faith: def.faith, learned: def.learned, essential: def.essential,
    equipment: def.equipment as UnitBuild['equipment'] | undefined, seed: hashString(def.id),
    autoLearn: level >= 3,
  });
  // Story characters start with their core abilities and some JP banked.
  const j = ensureJob(b, def.job);
  const acts = jobActions(def.job, ABILITIES).sort((a, c) => ABILITIES[a].jp - ABILITIES[c].jp);
  const starter = JOBS[def.job]?.special === 'story' ? 3 : 2;
  for (const a of acts.slice(0, Math.min(starter, Math.max(1, Math.floor(level / 2) + 1)))) if (!j.learned.includes(a)) j.learned.push(a);
  j.total = Math.max(j.total, 150 + level * 60);
  j.jp = Math.max(j.jp, 80 + level * 25);
  if (def.job !== 'squire' && !JOBS[def.job]?.special) ensureJob(b, 'squire').total = 200;
  return b;
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export function newGame(opts: { difficulty: Difficulty; name?: string; pack?: string }): GameState {
  const pd = packData(opts.pack ?? 'main');
  const pack = pd.pack;
  const roster = pack.startingParty.map((id) => buildFromCharacter(pack.characters[id]));
  const startNode = pack.world.nodes.find((n) => n.id === pack.world.start) ?? pack.world.nodes[0];
  const g: GameState = {
    version: 1,
    id: `g${Date.now().toString(36)}`,
    name: opts.name ?? 'Brask\'s Lanterns',
    created: Date.now(),
    saved: Date.now(),
    playtime: 0,
    story: { pack: pack.id, chapter: pack.chapters[0].id, beat: 0, flags: [], done: [] },
    roster,
    party: roster.map((u) => u.id),
    inventory: { potion: 4, phoenix_down: 1, antidote: 1 },
    gil: 600,
    world: {
      seed: hashString(pack.id + ':world'),
      pos: kmuToTileXY(startNode.pos),
      facing: 's', discovered: [], cleared: {}, deltas: {}, time: 8 * 60, steps: 0,
      visited: [],
    },
    settings: { difficulty: opts.difficulty, battleSpeed: 1, textSpeed: 45, autoAdvance: false, showHpBars: true },
    pvpParty: roster.map((u) => u.id).slice(0, 5),
    shopUnlocks: [],
    fallen: [],
    tavernSeed: 1,
  };
  setGame(g);
  return g;
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

export function chapterDef(g: GameState = getGame()) {
  const pack = packData(g.story.pack).pack;
  return pack.chapters.find((c) => c.id === g.story.chapter) ?? pack.chapters[0];
}

export function currentBeat(g: GameState = getGame()): StoryBeat | null {
  return chapterDef(g).beats[g.story.beat] ?? null;
}

export function hasFlag(f: string): boolean {
  return getGame().story.flags.includes(f);
}

export function setFlag(f: string, on: boolean): void {
  mutate((g) => {
    g.story.flags = g.story.flags.filter((x) => x !== f);
    if (on) g.story.flags.push(f);
  });
}

/** Node ids the player may travel to (unlocked by beats so far, plus the start). */
export function unlockedNodes(g: GameState = getGame()): string[] {
  const pack = packData(g.story.pack).pack;
  const out = new Set<string>([pack.world.start]);
  const beats = chapterDef(g).beats;
  for (let i = 0; i < Math.min(g.story.beat + 1, beats.length); i++) {
    const b = beats[i];
    if (b.kind === 'unlockNode') out.add(b.node);
    if ((b.kind === 'battle' || b.kind === 'scene') && b.at) out.add(b.at);
  }
  for (const v of g.world.visited) out.add(v);
  return [...out];
}

/**
 * Apply all beats that resolve instantly. Returns the first beat that needs the
 * UI (scene, battle, title card, end), or null at chapter end.
 */
export function advanceInstantBeats(): StoryBeat | null {
  for (let guard = 0; guard < 200; guard++) {
    const g = getGame();
    const b = currentBeat(g);
    if (!b) return null;
    switch (b.kind) {
      case 'join': {
        const def = character(b.character, g.story.pack);
        mutate((gg) => {
          let u = gg.roster.find((r) => r.id === b.character);
          if (!u && def) {
            const avg = Math.round(gg.roster.reduce((a, r) => a + r.level, 0) / Math.max(1, gg.roster.length));
            u = buildFromCharacter(def, Math.max(def.level ?? 1, avg));
            gg.roster.push(u);
          }
          if (u && !gg.party.includes(u.id)) gg.party.push(u.id);
          gg.story.beat++;
        });
        continue;
      }
      case 'leave':
        mutate((gg) => { gg.party = gg.party.filter((id) => id !== b.character); gg.story.beat++; });
        continue;
      case 'unlockNode':
        mutate((gg) => { gg.story.beat++; });
        continue;
      case 'shop':
        mutate((gg) => { for (const it of b.items) if (!gg.shopUnlocks.includes(it)) gg.shopUnlocks.push(it); gg.story.beat++; });
        continue;
      case 'unlockJob':
        mutate((gg) => { const u = gg.roster.find((r) => r.id === b.character); if (u) ensureJob(u, b.job); gg.story.beat++; });
        continue;
      case 'flag':
        mutate((gg) => { if (b.set && !gg.story.flags.includes(b.set)) gg.story.flags.push(b.set); if (b.clear) gg.story.flags = gg.story.flags.filter((f) => f !== b.clear); gg.story.beat++; });
        continue;
      default:
        return b;
    }
  }
  return null;
}

export function completeBeat(id?: string): void {
  mutate((g) => {
    if (id && !g.story.done.includes(id)) g.story.done.push(id);
    g.story.beat++;
  });
  applyStoryHooks();
}

/** Story consequences not expressed as beats yet (see SCHEMA_REQUESTS). */
function applyStoryHooks(): void {
  const g = getGame();
  // Bren becomes a Lanternbearer once Odo falls at the Sallow Ford.
  if (g.story.done.includes('c1_b4_sallow_ford')) {
    mutate((gg) => {
      const bren = gg.roster.find((u) => u.id === 'bren');
      if (bren && !bren.jobs.lanternbearer) {
        const j = ensureJob(bren, 'lanternbearer');
        j.learned.push('lantern_ward', 'witnesslight');
        j.jp = 200; j.total = 200;
        if (!gg.inventory.brask_lantern && bren.equipment.accessory !== 'brask_lantern') gg.inventory.brask_lantern = 1;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Story battles
// ---------------------------------------------------------------------------

export interface PreparedBattle {
  def: BattleDef;
  state: BattleState;
  deployTiles: Pos[];
}

export function partyLevel(g: GameState = getGame()): number {
  const p = g.party.map((id) => g.roster.find((u) => u.id === id)).filter(Boolean) as UnitBuild[];
  if (!p.length) return 1;
  const top = p.map((u) => u.level).sort((a, b) => b - a).slice(0, 5);
  return Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}

export function difficultyRules(d: Difficulty) {
  return d === 'story' ? { permadeath: false, aiLevel: 0, koCount: 3 } : d === 'oathsworn' ? { permadeath: true, aiLevel: 2, koCount: 3 } : { permadeath: false, aiLevel: 1, koCount: 3 };
}

export function prepareStoryBattle(battleId: string, g: GameState = getGame()): PreparedBattle {
  const pd = packData(g.story.pack);
  const def = pd.pack.battles[battleId];
  if (!def) throw new Error(`Unknown battle ${battleId}`);
  const map = battleMap(def.map, g.story.pack);
  const plv = partyLevel(g);
  const spawnedChars = new Set(def.units.filter((u) => u.character).map((u) => u.character!));
  const units: BattleSetupUnit[] = [];
  // Party (deployable): everyone in the party not spawned as a guest.
  for (const id of g.party) {
    if (spawnedChars.has(id)) continue;
    const b = g.roster.find((u) => u.id === id);
    if (!b) continue;
    const required = def.required?.includes(id) ?? false;
    units.push({ build: { ...structuredClone(b), essential: b.essential || required }, team: 'player', control: 'human' });
  }
  for (const s of def.units) {
    let build: UnitBuild | null = null;
    const skirmish = def.repeatable || battleId.includes('_sk_');
    const lv = s.level === 'party' ? Math.max(1, plv - (skirmish ? 1 : 0)) : Math.max(1, s.level ?? plv);
    if (s.character) {
      const c = pd.pack.characters[s.character];
      const rosterCopy = g.roster.find((u) => u.id === s.character);
      if (rosterCopy && s.team !== 'enemy') build = structuredClone(rosterCopy);
      else if (c) build = buildFromCharacter(c, lv);
      if (build && s.team === 'enemy') { build.jobs[build.job].learned = jobActions(build.job, ABILITIES); autoEquip(build, tierForLevel(lv)); }
    } else if (s.template) {
      const t = enemyTemplate(s.template, g.story.pack);
      if (t) build = createBuild({ id: `${s.id}`, name: s.name ?? t.name, appearance: t.appearance, job: t.job, level: lv, brave: t.brave, faith: t.faith, autoLearn: true, seed: hashString(`${battleId}:${s.id}`) });
    }
    if (!build) continue;
    if (s.name) build.name = s.name;
    units.push({
      build, team: s.team, control: s.team === 'player' && !s.guest ? 'human' : 'ai', pos: s.at, facing: s.dir ?? 's',
      ai: s.ai ?? t_ai(s.template), hidden: s.hidden, spawnId: s.id, guest: s.guest || s.team === 'ally',
      retreat: s.retreat ?? (s.ai === 'boss' && !!s.character && s.team === 'enemy' && isRetreatingBoss(s.id)), untargetable: s.untargetable ?? isUntargetable(s.id),
    });
  }
  const rules = difficultyRules(g.settings.difficulty);
  const victory = def.victory.type === 'escape' && !def.victory.who && def.required?.length ? { ...def.victory, who: def.required.filter((r) => units.some((u) => u.build.id === r || u.build.character === r)).slice(0, 2) } : def.victory;
  const state = createBattle({
    map, seed: hashString(`${g.id}:${battleId}:${g.story.done.length}`), units, victory, defeat: def.defeat,
    triggers: def.triggers, rules, deploy: true,
    inventory: { player: { ...g.inventory }, enemy: { potion: 2 } }, gil: { player: g.gil },
  });
  return { def, state, deployTiles: def.deployTiles };
}

function t_ai(_template?: string): string | undefined { return undefined; }

/** Story-team convention: these named bosses withdraw at 0 HP (SCHEMA_REQUESTS #3). */
function isRetreatingBoss(spawnId: string): boolean {
  return ['jory_b2', 'ilka_b3'].includes(spawnId);
}

/** Present but not fightable (SCHEMA_REQUESTS #4). */
function isUntargetable(spawnId: string): boolean {
  return ['morrow_b4'].includes(spawnId);
}

/** Copy progress back from a finished battle. */
export function applyBattleResult(state: BattleState, result: 'victory' | 'defeat', rewards?: BattleDef['rewards']): { gil: number; items: string[] } {
  const gained = { gil: 0, items: [] as string[] };
  mutate((g) => {
    for (const u of state.units) {
      if (u.team !== 'player' && !(u.team === 'ally' && g.roster.some((r) => r.id === u.build.id))) continue;
      const idx = g.roster.findIndex((r) => r.id === u.build.id);
      if (idx < 0) continue;
      const updated = structuredClone(u.build);
      updated.essential = g.roster[idx].essential;
      g.roster[idx] = updated;
    }
    // Consumables used in battle
    const inv = state.inventory.player;
    if (inv) for (const [k, v] of Object.entries(inv)) { if (ITEMS[k]?.type === 'consumable') { if (v > 0) g.inventory[k] = v; else delete g.inventory[k]; } }
    g.gil = Math.max(0, state.gil.player ?? g.gil);
    // Permadeath
    for (const id of state.lost) {
      const u = g.roster.find((r) => r.id === id);
      if (u && !u.essential) {
        g.fallen.push({ id: u.id, name: u.name, job: u.job, level: u.level });
        g.roster = g.roster.filter((r) => r.id !== id);
        g.party = g.party.filter((p) => p !== id);
      }
    }
    if (result === 'victory') {
      for (const it of state.loot) { g.inventory[it] = (g.inventory[it] ?? 0) + 1; gained.items.push(it); }
      if (rewards) {
        g.gil += rewards.gil ?? 0;
        gained.gil += rewards.gil ?? 0;
        for (const it of rewards.items ?? []) {
          if (!ITEMS[it]) continue;
          g.inventory[it] = (g.inventory[it] ?? 0) + 1;
          gained.items.push(it);
        }
        for (const s of rewards.unlockShop ?? []) if (!g.shopUnlocks.includes(s)) g.shopUnlocks.push(s);
      }
      // Victory bonus: everyone who fought gets extra EXP and JP.
      for (const u of state.units) {
        if (u.team !== 'player' || u.pos[0] < 0) continue;
        const r = g.roster.find((x) => x.id === u.build.id);
        if (r) { const j = ensureJob(r, r.job); j.jp += 30; j.total += 30; addExp(r, 30); }
      }
    }
  });
  return gained;
}
