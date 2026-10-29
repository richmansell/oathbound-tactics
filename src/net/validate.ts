/**
 * Server-side validation and normalisation of player-submitted units. Never
 * trust the client: every id must exist, abilities must belong to the jobs
 * they're filed under, equipment must be legal, and stats are recomputed from
 * a normalised level (PvP) rather than accepted.
 */
import { ABILITIES } from '../content/abilities';
import { ITEMS } from '../content/items';
import { JOBS } from '../content/jobs';
import '../content/storyJobs';
import type { EquipSlot } from '../content/schema';
import { levelUp } from '../engine/progression';
import { canEquip } from '../engine/units';
import type { UnitBuild } from '../engine/types';
import { PVP_LEVEL, PVP_PARTY_SIZE } from './protocol';

export function sanitiseParty(input: unknown): { party: UnitBuild[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(input)) return { party: [], errors: ['party must be an array'] };
  const party: UnitBuild[] = [];
  for (const raw of input.slice(0, PVP_PARTY_SIZE)) {
    const r = raw as Partial<UnitBuild>;
    if (!r || typeof r !== 'object' || typeof r.job !== 'string' || !JOBS[r.job] || JOBS[r.job].special === 'monster') { errors.push('invalid job'); continue; }
    const jobs: UnitBuild['jobs'] = {};
    for (const [jid, j] of Object.entries(r.jobs ?? {})) {
      if (!JOBS[jid]) continue;
      const learned = (j?.learned ?? []).filter((a) => typeof a === 'string' && JOBS[jid].abilities.includes(a) && ABILITIES[a]);
      jobs[jid] = { jp: 0, total: Math.max(0, Math.min(99999, Number(j?.total) || 0)), learned };
    }
    if (!jobs[r.job]) jobs[r.job] = { jp: 0, total: 0, learned: [] };
    const learnedAll = new Set(Object.values(jobs).flatMap((j) => j.learned));
    const okPassive = (id: unknown, kind: string) => (typeof id === 'string' && learnedAll.has(id) && ABILITIES[id]?.kind === kind ? id : undefined);
    const ap = r.appearance;
    const b: UnitBuild = {
      id: String(r.id ?? `u${party.length}`).slice(0, 40),
      name: String(r.name ?? 'Sellsword').slice(0, 24),
      appearance: ap && typeof ap === 'object' && ['male', 'female', 'muscular'].includes(ap.body) ? ap : { body: 'male', skin: 'light' },
      level: 1, exp: 0,
      // Raw stats are recomputed from fixed bases: no client-supplied stats.
      raw: { hp: ap?.body === 'female' ? 54 : 58, mp: ap?.body === 'female' ? 16 : 13, sp: 7, pa: ap?.body === 'female' ? 6.3 : 6.8, ma: ap?.body === 'female' ? 6.6 : 6 },
      brave: clampInt(r.brave, 40, 80, 60), faith: clampInt(r.faith, 40, 80, 60),
      job: r.job, jobs,
      secondary: typeof r.secondary === 'string' && jobs[r.secondary] && jobs[r.secondary].learned.length ? r.secondary : undefined,
      reaction: okPassive(r.reaction, 'reaction'), support: okPassive(r.support, 'support'), movement: okPassive(r.movement, 'movement'),
      equipment: {},
    };
    for (let i = 1; i < PVP_LEVEL; i++) levelUp(b);
    for (const slot of ['main', 'off', 'head', 'body', 'accessory'] as EquipSlot[]) {
      const id = r.equipment?.[slot];
      const it = typeof id === 'string' ? ITEMS[id] : undefined;
      if (it && canEquip(b, it, slot)) b.equipment[slot] = it.id;
    }
    party.push(b);
  }
  if (!party.length) errors.push('empty party');
  return { party, errors };
}

function clampInt(v: unknown, lo: number, hi: number, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
}
