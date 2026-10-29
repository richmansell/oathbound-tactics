/** Levelling, JP and job progression — shared by battle (mid-battle level ups) and meta-game. */
import { ABILITIES } from '../content/abilities';
import { JOBS, jobDef, jobLevelFor } from '../content/jobs';
import type { UnitBuild } from './types';

export const EXP_PER_LEVEL = 100;
export const MAX_LEVEL = 99;

/** Apply one level of growth using the current job's growth constants. */
export function levelUp(build: UnitBuild): void {
  if (build.level >= MAX_LEVEL) return;
  const g = jobDef(build.job).growth;
  const lv = build.level;
  build.raw.hp += build.raw.hp / (g.hp + lv);
  build.raw.mp += build.raw.mp / (g.mp + lv);
  build.raw.sp += build.raw.sp / (g.sp + lv);
  build.raw.pa += build.raw.pa / (g.pa + lv);
  build.raw.ma += build.raw.ma / (g.ma + lv);
  build.level += 1;
}

/** Add EXP; returns number of levels gained. */
export function addExp(build: UnitBuild, amount: number): number {
  let gained = 0;
  build.exp += Math.max(0, Math.floor(amount));
  while (build.exp >= EXP_PER_LEVEL && build.level < MAX_LEVEL) {
    build.exp -= EXP_PER_LEVEL;
    levelUp(build);
    gained++;
  }
  if (build.level >= MAX_LEVEL) build.exp = Math.min(build.exp, EXP_PER_LEVEL - 1);
  return gained;
}

export function ensureJob(build: UnitBuild, jobId: string): { jp: number; total: number; learned: string[] } {
  if (!build.jobs[jobId]) build.jobs[jobId] = { jp: 0, total: 0, learned: [] };
  return build.jobs[jobId];
}

/** Add JP to a job; returns true if the job levelled up. */
export function addJp(build: UnitBuild, jobId: string, amount: number): boolean {
  const j = ensureJob(build, jobId);
  const before = jobLevelFor(j.total);
  const a = Math.max(0, Math.floor(amount));
  j.jp = Math.min(9999, j.jp + a);
  j.total = Math.min(99999, j.total + a);
  return jobLevelFor(j.total) > before;
}

export function jobLevel(build: UnitBuild, jobId: string): number {
  return jobLevelFor(build.jobs[jobId]?.total ?? 0);
}

/** Can this build switch to the job (requirements met)? */
export function jobUnlocked(build: UnitBuild, jobId: string): boolean {
  const job = JOBS[jobId];
  if (!job) return false;
  if (job.special) return build.job === jobId || !!build.jobs[jobId];
  return Object.entries(job.requires).every(([req, lv]) => jobLevel(build, req) >= lv);
}

export function canLearn(build: UnitBuild, jobId: string, abilityId: string): boolean {
  const job = JOBS[jobId];
  const ab = ABILITIES[abilityId];
  if (!job || !ab || !job.abilities.includes(abilityId)) return false;
  const j = build.jobs[jobId];
  if (!j || j.learned.includes(abilityId)) return false;
  return j.jp >= ab.jp;
}

export function learn(build: UnitBuild, jobId: string, abilityId: string): boolean {
  if (!canLearn(build, jobId, abilityId)) return false;
  const j = build.jobs[jobId];
  j.jp -= ABILITIES[abilityId].jp;
  j.learned.push(abilityId);
  return true;
}

/** Every learned ability across all jobs. */
export function allLearned(build: UnitBuild): string[] {
  return Object.values(build.jobs).flatMap((j) => j.learned);
}

/** JP earned per successful action. */
export function actionJp(build: UnitBuild): number {
  return 8 + 2 * jobLevel(build, build.job) + Math.floor(build.level / 4);
}

/** EXP earned per action against targets of the given levels. */
export function actionExp(level: number, targetLevels: number[], kos: number): number {
  const avg = targetLevels.length ? targetLevels.reduce((a, b) => a + b, 0) / targetLevels.length : level;
  const base = Math.max(4, Math.min(60, Math.round(18 + (avg - level) * 4)));
  return base + kos * 15;
}
