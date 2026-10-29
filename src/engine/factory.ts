/** Deterministic creation of unit builds (recruits, enemies, story characters). */
import { ABILITIES } from '../content/abilities';
import { ITEMS } from '../content/items';
import { JOBS, jobDef } from '../content/jobs';
import type { Appearance, EquipSlot } from '../content/schema';
import type { ItemDef } from '../content/types';
import { levelUp } from './progression';
import { hashString, rand, type RngHolder } from './rng';
import { canEquip } from './units';
import type { UnitBuild } from './types';

export interface BuildSpec {
  id: string;
  name: string;
  appearance: Appearance;
  job: string;
  level?: number;
  brave?: number;
  faith?: number;
  seed?: number;
  character?: string;
  /** Learn every action of the job affordable at this level (enemies). */
  autoLearn?: boolean;
  secondary?: string;
  reaction?: string;
  support?: string;
  movement?: string;
  learned?: Record<string, string[]>;
  equipment?: Partial<Record<EquipSlot, string>>;
  /** Highest item tier for auto-equip; default from level. */
  equipTier?: number;
  essential?: boolean;
}

export function createBuild(spec: BuildSpec): UnitBuild {
  const r: RngHolder = { rng: spec.seed ?? hashString(spec.id) };
  const female = spec.appearance.body === 'female';
  const vary = (v: number, pct: number) => v * (1 + (rand(r) * 2 - 1) * pct);
  const build: UnitBuild = {
    id: spec.id,
    name: spec.name,
    character: spec.character,
    appearance: spec.appearance,
    level: 1,
    exp: 0,
    raw: {
      hp: vary(female ? 54 : 58, 0.06),
      mp: vary(female ? 16 : 13, 0.08),
      sp: female ? 7.05 : 7,
      pa: vary(female ? 6.3 : 6.8, 0.05),
      ma: vary(female ? 6.6 : 6.0, 0.05),
    },
    brave: spec.brave ?? Math.round(45 + rand(r) * 30),
    faith: spec.faith ?? Math.round(45 + rand(r) * 30),
    job: spec.job,
    jobs: {},
    secondary: spec.secondary,
    reaction: spec.reaction,
    support: spec.support,
    movement: spec.movement,
    equipment: {},
    essential: spec.essential,
  };
  build.jobs[spec.job] = { jp: 0, total: 0, learned: [] };
  const level = Math.max(1, spec.level ?? 1);
  for (let i = 1; i < level; i++) levelUp(build);

  for (const [job, ids] of Object.entries(spec.learned ?? {})) {
    if (!build.jobs[job]) build.jobs[job] = { jp: 0, total: 0, learned: [] };
    for (const id of ids) if (!build.jobs[job].learned.includes(id)) build.jobs[job].learned.push(id);
  }

  if (spec.autoLearn) autoLearn(build, level, r);
  if (spec.equipment) build.equipment = { ...spec.equipment };
  else autoEquip(build, spec.equipTier ?? tierForLevel(level));
  return build;
}

export function tierForLevel(level: number): number {
  return Math.max(1, Math.min(8, Math.floor(level / 5) + 1));
}

/** Enemy-style learning: affordable actions + passives for the job and a sensible secondary. */
function autoLearn(build: UnitBuild, level: number, r: RngHolder): void {
  const budget = 60 + level * 70;
  const job = jobDef(build.job);
  const learned = build.jobs[build.job].learned;
  const acts = job.abilities.filter((a) => ABILITIES[a].kind === 'action').sort((a, b) => ABILITIES[a].jp - ABILITIES[b].jp);
  let spent = 0;
  for (const a of acts) {
    if (spent + ABILITIES[a].jp > budget) break;
    learned.push(a);
    spent += ABILITIES[a].jp;
  }
  const total = 200 + level * 90;
  build.jobs[build.job].total = total;
  // Passives once levelled a bit.
  if (level >= 4 && !build.reaction) {
    const re = job.abilities.find((a) => ABILITIES[a].kind === 'reaction');
    if (re) { build.reaction = re; learned.push(re); }
  }
  if (level >= 6 && !build.support) {
    const su = job.abilities.find((a) => ABILITIES[a].kind === 'support');
    if (su) { build.support = su; learned.push(su); }
  }
  if (level >= 8 && !build.movement) {
    const mv = job.abilities.find((a) => ABILITIES[a].kind === 'movement');
    if (mv) { build.movement = mv; learned.push(mv); }
  }
  if (level >= 5 && !build.secondary) {
    const pool = SECONDARY_FOR[build.job] ?? [];
    if (pool.length) {
      const sec = pool[Math.floor(rand(r) * pool.length)];
      build.secondary = sec;
      const sj = JOBS[sec];
      if (sj) {
        const sacts = sj.abilities.filter((a) => ABILITIES[a].kind === 'action').sort((a, b) => ABILITIES[a].jp - ABILITIES[b].jp).slice(0, 2 + Math.floor(level / 6));
        build.jobs[sec] = { jp: 0, total: 300, learned: sacts };
      }
    }
  }
}

const SECONDARY_FOR: Record<string, string[]> = {
  squire: ['alchemist'], alchemist: ['squire'], knight: ['squire', 'alchemist'], ranger: ['squire', 'alchemist'],
  cleric: ['alchemist', 'wizard'], wizard: ['alchemist', 'cleric'], monk: ['squire', 'knight'], rogue: ['ranger', 'alchemist'],
  chronomancer: ['cleric', 'wizard'], hexer: ['wizard', 'cleric'], lancer: ['knight', 'squire'], warden: ['monk', 'ranger'],
  invoker: ['wizard', 'chronomancer'], spellblade: ['knight', 'wizard'], shadowblade: ['rogue', 'ranger'], oathbreaker: ['knight', 'hexer'],
};

function itemScore(it: ItemDef, slot: EquipSlot, build: UnitBuild): number {
  const job = JOBS[build.job];
  const mag = (job?.mult.ma ?? 100) > (job?.mult.pa ?? 100);
  // Gear that fits the job's identity: casters favour MA/MP, fighters PA/HP; off-role bonuses count against.
  const ma = (it.bonus?.ma ?? 0) * (mag ? 14 : -6);
  const pa = (it.bonus?.pa ?? 0) * (mag ? -4 : 10);
  const mp = (it.mp ?? 0) * (mag ? 1.2 : 0);
  switch (slot) {
    case 'main': return expectedWeaponDamage(it, build) * (mag ? 0.3 : 1) + ma + pa + it.tier;
    case 'off': return (it.pev ?? 0) + (it.mev ?? 0);
    case 'head': case 'body': return (it.hp ?? 0) + mp + ma + pa;
    case 'accessory': return it.tier * 5 + (it.bonus?.move ?? 0) * 6 + (it.autoStatus?.length ?? 0) * 8 + ma + pa;
  }
}

/** Rough expected damage of a weapon for this build (axes/flails roll, knives use speed…). */
function expectedWeaponDamage(it: ItemDef, build: UnitBuild): number {
  const job = JOBS[build.job];
  const pa = (build.raw.pa * (job?.mult.pa ?? 100)) / 100;
  const ma = (build.raw.ma * (job?.mult.ma ?? 100)) / 100;
  const sp = (build.raw.sp * (job?.mult.sp ?? 100)) / 100;
  const wp = it.wp ?? 0;
  switch (it.category) {
    case 'axe': case 'flail': return ((1 + pa) / 2) * wp;
    case 'knife': case 'bow': case 'throwing': return ((pa + sp) / 2) * wp;
    case 'katana': return pa * wp * (build.brave / 100);
    case 'staff': return ma * wp;
    default: return pa * wp;
  }
}

/** Equip the best non-rare items available up to a tier. */
export function autoEquip(build: UnitBuild, maxTier: number, pool: ItemDef[] = Object.values(ITEMS)): void {
  for (const slot of ['main', 'off', 'head', 'body', 'accessory'] as EquipSlot[]) {
    let best: ItemDef | undefined;
    let bs = -Infinity;
    for (const it of pool) {
      if (it.rare || it.tier > maxTier) continue;
      if (!canEquip(build, it, slot)) continue;
      if (slot === 'off' && it.type === 'weapon') continue;
      const sc = itemScore(it, slot, build);
      if (sc > bs) { bs = sc; best = it; }
    }
    if (best) build.equipment[slot] = best.id;
    else delete build.equipment[slot];
    // Two-handed main weapon frees the off hand.
    if (slot === 'main' && best?.twoHanded) { delete build.equipment.off; }
  }
  if (build.equipment.main && ITEMS[build.equipment.main]?.twoHanded) delete build.equipment.off;
}
