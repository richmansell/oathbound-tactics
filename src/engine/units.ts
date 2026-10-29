/** Derived unit stats, passives and equipment rules. */
import { ABILITIES } from '../content/abilities';
import '../content/storyJobs';
import { ITEMS } from '../content/items';
import { JOBS, jobDef } from '../content/jobs';
import type { EquipCategory, ElementAffinity, ItemDef, PassiveSpec, StatusId, WeaponFamily, Element } from '../content/types';
import type { EquipSlot } from '../content/schema';
import type { BattleUnit, UnitBuild } from './types';

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  sp: number;
  pa: number;
  ma: number;
  move: number;
  jump: number;
  brave: number;
  faith: number;
  cev: number;
  /** Shield physical / magic evade. */
  sev: number;
  smev: number;
  /** Accessory physical / magic evade. */
  aev: number;
  amev: number;
  weapon?: ItemDef;
  offWeapon?: ItemDef;
  family: WeaponFamily;
  wp: number;
  weaponElement?: Element;
  affinity: Required<ElementAffinity>;
  immune: StatusId[];
}

const ACCESSORY_CATS: EquipCategory[] = ['accessory', 'cloak', 'ring', 'armlet', 'boots', 'perfume', 'ribbon'];

export function equippedItem(build: UnitBuild, slot: EquipSlot, lost: EquipSlot[] = []): ItemDef | undefined {
  if (lost.includes(slot)) return undefined;
  const id = build.equipment[slot];
  return id ? ITEMS[id] : undefined;
}

/** All passive specs active on a build: slotted reaction/support/movement + job innates. */
export function buildPassives(build: UnitBuild): { id: string; spec: PassiveSpec }[] {
  const out: { id: string; spec: PassiveSpec }[] = [];
  const add = (id?: string) => {
    if (!id) return;
    const a = ABILITIES[id];
    if (a?.passive) out.push({ id, spec: a.passive });
  };
  add(build.reaction);
  add(build.support);
  add(build.movement);
  const job = JOBS[build.job];
  for (const id of job?.innate ?? []) add(id);
  return out;
}

export function hasPassive(build: UnitBuild, kind: PassiveSpec['kind']): boolean {
  return buildPassives(build).some((p) => p.spec.kind === kind);
}

export function passiveOf<K extends PassiveSpec['kind']>(build: UnitBuild, kind: K): Extract<PassiveSpec, { kind: K }> | undefined {
  return buildPassives(build).find((p) => p.spec.kind === kind)?.spec as Extract<PassiveSpec, { kind: K }> | undefined;
}

/** Equipment categories this build may use (job + Equip X support). */
export function equipCategories(build: UnitBuild): EquipCategory[] {
  const job = jobDef(build.job);
  const cats = new Set<EquipCategory>(job.equips);
  for (const c of ACCESSORY_CATS) cats.add(c);
  const eq = passiveOf(build, 'equip');
  if (eq) for (const c of eq.categories) cats.add(c);
  return [...cats];
}

export function canEquip(build: UnitBuild, item: ItemDef, slot: EquipSlot): boolean {
  if (item.type === 'consumable') return false;
  const cats = equipCategories(build);
  if (!cats.includes(item.category as EquipCategory)) return false;
  switch (slot) {
    case 'main': return item.type === 'weapon';
    case 'off':
      if (item.type === 'shield') {
        const main = build.equipment.main ? ITEMS[build.equipment.main] : undefined;
        return !main?.twoHanded;
      }
      return item.type === 'weapon' && !item.twoHanded && hasPassive(build, 'dualWield');
    case 'head': return item.type === 'head';
    case 'body': return item.type === 'body';
    case 'accessory': return item.type === 'accessory';
  }
}

export function statusActive(u: BattleUnit, s: StatusId): boolean {
  return u.statuses.some((x) => x.id === s);
}

/** Compute derived stats for a build (optionally with in-battle unit state). */
export function deriveStats(build: UnitBuild, unit?: BattleUnit): DerivedStats {
  const job = jobDef(build.job);
  const lost = unit?.lostEquip ?? [];
  const items = (['main', 'off', 'head', 'body', 'accessory'] as EquipSlot[])
    .map((s) => [s, equippedItem(build, s, lost)] as const)
    .filter((x): x is readonly [EquipSlot, ItemDef] => !!x[1]);

  let maxHp = Math.floor((build.raw.hp * job.mult.hp) / 100);
  let maxMp = Math.floor((build.raw.mp * job.mult.mp) / 100);
  let sp = Math.floor((build.raw.sp * job.mult.sp) / 100);
  let pa = Math.floor((build.raw.pa * job.mult.pa) / 100);
  let ma = Math.floor((build.raw.ma * job.mult.ma) / 100);
  let move = job.move;
  let jump = job.jump;
  let brave = build.brave;
  let faith = build.faith;
  let cev = job.cev;
  let sev = 0, smev = 0, aev = 0, amev = 0;
  const affinity: Required<ElementAffinity> = { weak: [], half: [], immune: [], absorb: [], strengthen: [] };
  const immune: StatusId[] = [];
  const mergeAff = (a?: ElementAffinity) => {
    if (!a) return;
    for (const k of Object.keys(affinity) as (keyof ElementAffinity)[]) for (const e of a[k] ?? []) affinity[k].push(e);
  };
  mergeAff(job.elements);

  let weapon: ItemDef | undefined;
  let offWeapon: ItemDef | undefined;
  for (const [slot, it] of items) {
    maxHp += it.hp ?? 0;
    maxMp += it.mp ?? 0;
    const b = it.bonus;
    if (b) {
      pa += b.pa ?? 0; ma += b.ma ?? 0; sp += b.sp ?? 0; move += b.move ?? 0; jump += b.jump ?? 0;
      brave += b.brave ?? 0; faith += b.faith ?? 0;
    }
    if (it.type === 'shield') { sev += it.pev ?? 0; smev += it.mev ?? 0; }
    else if (it.type === 'accessory' || it.type === 'head' || it.type === 'body') { aev += it.pev ?? 0; amev += it.mev ?? 0; }
    if (slot === 'main' && it.type === 'weapon') weapon = it;
    if (slot === 'off' && it.type === 'weapon') offWeapon = it;
    mergeAff(it.elements);
    for (const s of it.immune ?? []) immune.push(s);
  }

  const mv = passiveOf(build, 'move');
  if (mv) move += mv.amount;
  const jp = passiveOf(build, 'jump');
  if (jp) jump += jp.amount;
  if (hasPassive(build, 'evasiveStance')) cev += 10;

  if (unit) {
    pa += unit.mods.pa; ma += unit.mods.ma; sp += unit.mods.sp; move += unit.mods.move ?? 0;
    brave += unit.mods.brave; faith += unit.mods.faith;
    if (statusActive(unit, 'berserk')) pa = Math.floor(pa * 1.5);
    if (statusActive(unit, 'doubt')) brave -= 20;
    if (statusActive(unit, 'fear')) brave -= 30;
    if (statusActive(unit, 'faith')) faith = 100;
    if (statusActive(unit, 'atheist')) faith = 0;
    if (statusActive(unit, 'float')) { if (!affinity.immune.includes('earth')) affinity.immune.push('earth'); }
  }

  for (const s of job.immune ?? []) immune.push(s);
  const absorbEl = passiveOf(build, 'absorbElement');
  if (absorbEl) affinity.absorb.push(absorbEl.element);
  if (hasPassive(build, 'lampLit')) immune.push('blind', 'fear');
  const family: WeaponFamily = weapon ? (weapon.category as WeaponFamily) : 'fist';
  return {
    maxHp: Math.max(1, maxHp), maxMp: Math.max(0, maxMp),
    sp: Math.max(1, sp), pa: Math.max(1, pa), ma: Math.max(1, ma),
    move: Math.max(0, move), jump: Math.max(0, jump),
    brave: clamp(brave, 0, 100), faith: clamp(faith, 0, 100),
    cev, sev, smev, aev, amev,
    weapon, offWeapon, family, wp: weapon?.wp ?? 0, weaponElement: weapon?.element,
    affinity, immune,
  };
}

export function hasTrait(build: UnitBuild, t: 'hollow' | 'undead' | 'heavy' | 'beast'): boolean {
  return !!JOBS[build.job]?.traits?.includes(t);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Statuses an item grants permanently while equipped. */
export function autoStatuses(build: UnitBuild): StatusId[] {
  const out: StatusId[] = [];
  for (const slot of ['main', 'off', 'head', 'body', 'accessory'] as EquipSlot[]) {
    const it = equippedItem(build, slot);
    for (const s of it?.autoStatus ?? []) out.push(s);
  }
  if (hasPassive(build, 'float')) out.push('float');
  const job = JOBS[build.job];
  for (const s of job?.innateStatus ?? []) out.push(s);
  return out;
}

/** Default range of a weapon family. */
export function weaponRange(family: WeaponFamily, item?: ItemDef): { min: number; max: number; vertical: number; line?: boolean; arc?: boolean } {
  switch (family) {
    case 'spear': return { min: 1, max: 2, vertical: 3, line: true };
    case 'bow': return { min: 3, max: item?.range ?? 5, vertical: 99, arc: true };
    case 'crossbow': return { min: 1, max: item?.range ?? 4, vertical: 99 };
    case 'throwing': return { min: 1, max: 4, vertical: 99 };
    default: return { min: 1, max: 1, vertical: 3 };
  }
}

/** Abilities the unit can use in battle: Attack + primary + secondary actions (learned). */
export function availableActions(build: UnitBuild): { skillset: string; jobId: string; abilities: string[] }[] {
  const sets: { skillset: string; jobId: string; abilities: string[] }[] = [];
  const addSet = (jobId: string) => {
    const job = JOBS[jobId];
    if (!job) return;
    const learned = new Set(build.jobs[jobId]?.learned ?? []);
    const acts = job.abilities.filter((a) => ABILITIES[a]?.kind === 'action' && (learned.has(a) || job.special === 'monster'));
    sets.push({ skillset: job.skillsetName, jobId, abilities: acts });
  };
  addSet(build.job);
  if (build.secondary && build.secondary !== build.job) addSet(build.secondary);
  return sets;
}
