import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ABILITIES } from '../../content/abilities';
import { ITEMS } from '../../content/items';
import { GENERIC_JOBS, JOBS, JOB_LEVEL_JP, MAX_JOB_LEVEL } from '../../content/jobs';
import { STATUSES } from '../../content/statuses';
import type { EquipSlot } from '../../content/schema';
import type { AbilityDef, ItemDef } from '../../content/types';
import { KEY_ITEMS } from '../../content/storyJobs';
import { autoEquip } from '../../engine/factory';
import { allLearned, canLearn, ensureJob, jobLevel, jobUnlocked, learn } from '../../engine/progression';
import { canEquip, deriveStats, equipCategories } from '../../engine/units';
import type { UnitBuild } from '../../engine/types';
import { tierForLevel } from '../../engine/factory';
import { sfx } from '../../game/sound';
import { MAX_ROSTER, mutate, useGame } from '../../game/state';
import { MONEY } from '../../game/campaign';
import { Portrait } from '../common/Portrait';
import { Icon } from '../common/Icon';
import { SpritePreview } from '../common/SpritePreview';
import { WardrobeTab } from './WardrobeTab';
import './party.css';

type Tab = 'status' | 'jobs' | 'abilities' | 'equip' | 'loadout' | 'wardrobe';
const SLOT_LABEL: Record<EquipSlot, string> = { main: 'Weapon', off: 'Off-hand', head: 'Head', body: 'Body', accessory: 'Accessory' };

export function PartyScreen({ onClose, initialUnit }: { onClose: () => void; initialUnit?: string }) {
  const g = useGame();
  const [sel, setSel] = useState<string | null>(initialUnit ?? g.party[0] ?? g.roster[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>('status');
  const unit = g.roster.find((u) => u.id === sel) ?? null;
  const [dismiss, setDismiss] = useState<string | null>(null);

  return (
    <div class="screen party-screen fade-in">
      <div class="party-header">
        <button class="btn small" onClick={onClose}><Icon name="back" /></button>
        <div class="title-font party-title">Company</div>
        <div class="spacer" />
        <div class="num gold-text">{g.gil.toLocaleString()} {MONEY}</div>
        <div class="num muted">{g.roster.length}/{MAX_ROSTER}</div>
      </div>
      <div class="party-body">
        <div class="roster panel scroll">
          {g.roster.map((u) => {
            const inParty = g.party.includes(u.id);
            return (
              <div class={`roster-row ${sel === u.id ? 'sel' : ''}`} onClick={() => { setSel(u.id); sfx('cursor'); }}>
                <Portrait build={u} size={44} />
                <div class="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <span class="title-font rr-name">{u.name}</span>
                  <span class="muted rr-sub">{JOBS[u.job]?.name} · Lv {u.level}</span>
                </div>
                <button class={`btn small ${g.pvpParty.includes(u.id) ? 'primary' : 'ghost'}`} title="Online duel party (up to 5)" onClick={(e) => {
                  e.stopPropagation();
                  mutate((gg) => { gg.pvpParty = gg.pvpParty.includes(u.id) ? gg.pvpParty.filter((p) => p !== u.id) : gg.pvpParty.length < 5 ? [...gg.pvpParty, u.id] : gg.pvpParty; });
                }}><Icon name="sword" size={14} /></button>
                <button class={`btn small ${inParty ? 'primary' : 'ghost'}`} title={inParty ? 'In active party' : 'In reserve'} onClick={(e) => {
                  e.stopPropagation();
                  mutate((gg) => { gg.party = inParty ? gg.party.filter((p) => p !== u.id) : [...gg.party, u.id]; });
                }}>{inParty ? 'Party' : 'Reserve'}</button>
              </div>
            );
          })}
        </div>
        {unit && (
          <div class="unit-detail panel">
            <div class="ud-head">
              <SpritePreview build={unit} size={96} />
              <Portrait build={unit} size={96} expression="neutral" class="ud-portrait" />
              <div class="col" style={{ gap: '2px', flex: 1, minWidth: 0 }}>
                <div class="title-font ud-name">{unit.name}</div>
                <div class="muted">{JOBS[unit.job]?.name} · Level {unit.level} · <span class="num">{unit.exp}/100 EXP</span></div>
                <div class="bar exp" style={{ maxWidth: '240px' }}><i style={{ width: `${unit.exp}%` }} /></div>
                <div class="row ud-tabs">
                  {(['status', 'jobs', 'abilities', 'equip', 'loadout', 'wardrobe'] as Tab[]).map((t) => (
                    <button class={`btn small ${tab === t ? 'primary' : ''}`} onClick={() => { setTab(t); sfx('page'); }}>{t[0].toUpperCase() + t.slice(1)}</button>
                  ))}
                </div>
              </div>
            </div>
            <div class="ud-body scroll">
              {tab === 'status' && <StatusTab u={unit} onDismiss={() => setDismiss(unit.id)} />}
              {tab === 'jobs' && <JobsTab u={unit} />}
              {tab === 'abilities' && <AbilitiesTab u={unit} />}
              {tab === 'equip' && <EquipTab u={unit} />}
              {tab === 'loadout' && <LoadoutTab u={unit} />}
              {tab === 'wardrobe' && <WardrobeTab u={unit} />}
            </div>
          </div>
        )}
      </div>
      {dismiss && (
        <div class="modal-backdrop" onClick={() => setDismiss(null)}>
          <div class="panel modal pop-in" onClick={(e) => e.stopPropagation()}>
            <div class="panel-title">Dismiss {g.roster.find((u) => u.id === dismiss)?.name}?</div>
            <p style={{ padding: '8px 14px' }}>They will leave the company for good. Their equipment returns to the stores.</p>
            <div class="row" style={{ padding: '10px', justifyContent: 'flex-end' }}>
              <button class="btn" onClick={() => setDismiss(null)}>Keep</button>
              <button class="btn danger" onClick={() => {
                mutate((gg) => {
                  const u = gg.roster.find((r) => r.id === dismiss);
                  if (u) for (const id of Object.values(u.equipment)) if (id) gg.inventory[id] = (gg.inventory[id] ?? 0) + 1;
                  gg.roster = gg.roster.filter((r) => r.id !== dismiss);
                  gg.party = gg.party.filter((p) => p !== dismiss);
                });
                setSel(g.roster[0]?.id ?? null);
                setDismiss(null);
              }}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTab({ u, onDismiss }: { u: UnitBuild; onDismiss: () => void }) {
  const st = deriveStats(u);
  const job = JOBS[u.job];
  const rows: [string, string | number][] = [
    ['HP', st.maxHp], ['MP', st.maxMp], ['Speed', st.sp], ['PA', st.pa], ['MA', st.ma],
    ['Move', st.move], ['Jump', st.jump], ['C-Ev', `${st.cev}%`], ['Brave', st.brave], ['Faith', st.faith],
    ['Weapon', st.weapon ? `${st.weapon.name} (WP ${st.wp})` : 'Unarmed'], ['Shield Ev', `${st.sev}% / ${st.smev}%`],
  ];
  return (
    <div class="col">
      <div class="stat-grid">
        {rows.map(([k, v]) => <div class="stat-cell"><span class="label">{k}</span><span class="num">{v}</span></div>)}
      </div>
      <div class="loadout-summary">
        <div><span class="label">Primary</span> {job?.skillsetName}</div>
        <div><span class="label">Secondary</span> {u.secondary ? JOBS[u.secondary]?.skillsetName : '—'}</div>
        <div><span class="label">Reaction</span> {u.reaction ? ABILITIES[u.reaction]?.name : '—'}</div>
        <div><span class="label">Support</span> {u.support ? ABILITIES[u.support]?.name : '—'}</div>
        <div><span class="label">Movement</span> {u.movement ? ABILITIES[u.movement]?.name : '—'}</div>
      </div>
      {(st.affinity.weak.length > 0 || st.affinity.half.length > 0 || st.immune.length > 0) && (
        <div class="muted" style={{ fontSize: '13px' }}>
          {st.affinity.weak.length > 0 && <div>Weak: {st.affinity.weak.join(', ')}</div>}
          {st.affinity.half.length > 0 && <div>Resists: {st.affinity.half.join(', ')}</div>}
          {st.immune.length > 0 && <div>Immune: {[...new Set(st.immune)].map((s) => STATUSES[s]?.name ?? s).join(', ')}</div>}
        </div>
      )}
      <p class="muted job-desc">{job?.description}</p>
      {!u.essential && !u.character && <button class="btn small danger" style={{ alignSelf: 'flex-start' }} onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}

function JobsTab({ u }: { u: UnitBuild }) {
  const jobs = [...GENERIC_JOBS, ...Object.keys(u.jobs).filter((j) => JOBS[j]?.special === 'story')];
  const [info, setInfo] = useState<string | null>(u.job);
  return (
    <div class="col">
      <div class="job-grid">
        {jobs.map((id) => {
          const job = JOBS[id];
          if (!job) return null;
          const unlocked = jobUnlocked(u, id);
          const lv = jobLevel(u, id);
          const current = u.job === id;
          return (
            <button class={`job-card ${current ? 'current' : ''} ${unlocked ? '' : 'locked'}`} onClick={() => setInfo(id)} onDblClick={() => unlocked && changeJob(u, id)}>
              <span class="title-font jc-name">{unlocked || lv > 1 ? job.name : '???'}</span>
              <span class="num jc-lv">{unlocked ? `Lv ${lv}` : 'Locked'}</span>
              <span class="jc-stars">{'★'.repeat(Math.min(lv, MAX_JOB_LEVEL))}<span class="muted">{'★'.repeat(Math.max(0, MAX_JOB_LEVEL - lv))}</span></span>
            </button>
          );
        })}
      </div>
      {info && JOBS[info] && <JobInfo u={u} id={info} />}
    </div>
  );
}

function changeJob(u: UnitBuild, id: string): void {
  mutate((g) => {
    const r = g.roster.find((x) => x.id === u.id)!;
    if (r.job === id) return;
    r.job = id;
    ensureJob(r, id);
    if (r.secondary === id) r.secondary = undefined;
    // Unequip what the new job can't use.
    for (const slot of ['main', 'off', 'head', 'body', 'accessory'] as EquipSlot[]) {
      const it = r.equipment[slot] ? ITEMS[r.equipment[slot]!] : undefined;
      if (it && !canEquip(r, it, slot)) { g.inventory[it.id] = (g.inventory[it.id] ?? 0) + 1; delete r.equipment[slot]; }
    }
  });
  sfx('equip');
}

function JobInfo({ u, id }: { u: UnitBuild; id: string }) {
  const job = JOBS[id];
  const unlocked = jobUnlocked(u, id);
  const p = u.jobs[id];
  const lv = jobLevel(u, id);
  const next = JOB_LEVEL_JP[lv] ?? null;
  return (
    <div class="job-info">
      <div class="row"><span class="title-font gold-text" style={{ fontSize: '18px' }}>{unlocked || lv > 1 ? job.name : 'Unknown job'}</span><span class="spacer" />
        {unlocked && u.job !== id && <button class="btn primary small" onClick={() => changeJob(u, id)}>Change job</button>}
        {u.job === id && <span class="label">Current job</span>}
      </div>
      {unlocked || lv > 1 ? <p class="muted">{job.description}</p> : null}
      {!unlocked && Object.keys(job.requires).length > 0 && (
        <div class="reqs">Requires: {Object.entries(job.requires).map(([j, l]) => <span class={jobLevel(u, j) >= l ? 'met' : 'unmet'}>{JOBS[j]?.name} Lv {l}</span>)}</div>
      )}
      {unlocked && (
        <div class="num muted" style={{ fontSize: '13px' }}>
          JP {p?.jp ?? 0} available · {p?.total ?? 0} total{next !== null ? ` · ${next - (p?.total ?? 0)} to Lv ${lv + 1}` : ' · Mastered'}
          <br />Move {job.move} · Jump {job.jump} · C-Ev {job.cev}% · HP {job.mult.hp}% MP {job.mult.mp}% PA {job.mult.pa}% MA {job.mult.ma}% Sp {job.mult.sp}%
          <br />Equips: {job.equips.join(', ')}
        </div>
      )}
    </div>
  );
}

function AbilitiesTab({ u }: { u: UnitBuild }) {
  const jobs = Object.keys(u.jobs).filter((j) => JOBS[j] && jobUnlocked(u, j));
  const [jobId, setJobId] = useState(u.job);
  const job = JOBS[jobId];
  const p = u.jobs[jobId];
  const kinds: AbilityDef['kind'][] = ['action', 'reaction', 'support', 'movement'];
  return (
    <div class="col">
      <div class="row wrap">{jobs.map((j) => <button class={`btn small ${j === jobId ? 'primary' : ''}`} onClick={() => setJobId(j)}>{JOBS[j].name}</button>)}</div>
      <div class="num gold-text">{job.name} · {p?.jp ?? 0} JP</div>
      {kinds.map((k) => {
        const list = job.abilities.filter((a) => ABILITIES[a]?.kind === k);
        if (!list.length) return null;
        return (
          <div>
            <div class="label" style={{ margin: '8px 0 4px' }}>{k === 'action' ? job.skillsetName : k}</div>
            {list.map((a) => {
              const ab = ABILITIES[a];
              const learned = p?.learned.includes(a);
              const can = canLearn(u, jobId, a);
              return (
                <div class={`ability-row ${learned ? 'learned' : ''}`}>
                  <div class="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                    <span class="ar-name">{ab.name} {ab.mp ? <span class="num" style={{ color: 'var(--mp)', fontSize: '12px' }}>{ab.mp}MP</span> : null} {ab.speed ? <span class="num muted" style={{ fontSize: '12px' }}>CT{ab.speed}</span> : null}</span>
                    <span class="muted ar-desc">{ab.description}</span>
                  </div>
                  {learned ? <span class="label" style={{ color: 'var(--good)' }}>Learned</span> : (
                    <button class={`btn small ${can ? 'primary' : ''}`} disabled={!can} onClick={() => { mutate((g) => { learn(g.roster.find((x) => x.id === u.id)!, jobId, a); }); sfx('learn'); }}>
                      <span class="num">{ab.jp} JP</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function EquipTab({ u }: { u: UnitBuild }) {
  const g = useGame();
  const [slot, setSlot] = useState<EquipSlot>('main');
  const st = deriveStats(u);
  const options = useMemo(() => {
    return Object.entries(g.inventory)
      .filter(([id, n]) => n > 0 && ITEMS[id] && !KEY_ITEMS.has(id) && canEquip(u, ITEMS[id], slot))
      .map(([id, n]) => ({ item: ITEMS[id], n }))
      .sort((a, b) => b.item.tier - a.item.tier);
  }, [g.inventory, u, slot]);
  const equip = (it: ItemDef | null) => {
    mutate((gg) => {
      const r = gg.roster.find((x) => x.id === u.id)!;
      const prev = r.equipment[slot];
      if (prev) gg.inventory[prev] = (gg.inventory[prev] ?? 0) + 1;
      if (it) {
        gg.inventory[it.id] = (gg.inventory[it.id] ?? 0) - 1;
        if (gg.inventory[it.id] <= 0) delete gg.inventory[it.id];
        r.equipment[slot] = it.id;
        if (slot === 'main' && it.twoHanded && r.equipment.off) { gg.inventory[r.equipment.off] = (gg.inventory[r.equipment.off] ?? 0) + 1; delete r.equipment.off; }
      } else delete r.equipment[slot];
    });
    sfx(it ? 'equip' : 'unequip');
  };
  const optimize = () => {
    mutate((gg) => {
      const r = gg.roster.find((x) => x.id === u.id)!;
      for (const id of Object.values(r.equipment)) if (id) gg.inventory[id] = (gg.inventory[id] ?? 0) + 1;
      r.equipment = {};
      const pool = Object.entries(gg.inventory).filter(([id, n]) => n > 0 && ITEMS[id] && !KEY_ITEMS.has(id)).map(([id]) => ({ ...ITEMS[id], rare: false }));
      autoEquip(r, 99, pool);
      for (const id of Object.values(r.equipment)) if (id) { gg.inventory[id]--; if (gg.inventory[id] <= 0) delete gg.inventory[id]; }
    });
    sfx('equip');
  };
  return (
    <div class="col">
      <div class="equip-slots">
        {(['main', 'off', 'head', 'body', 'accessory'] as EquipSlot[]).map((s) => {
          const it = u.equipment[s] ? ITEMS[u.equipment[s]!] : undefined;
          return (
            <button class={`equip-slot ${slot === s ? 'sel' : ''}`} onClick={() => setSlot(s)}>
              <span class="label">{SLOT_LABEL[s]}</span>
              <span>{it?.name ?? <span class="muted">—</span>}</span>
            </button>
          );
        })}
      </div>
      <div class="row"><button class="btn small" onClick={optimize}>Optimise</button>{u.equipment[slot] && <button class="btn small" onClick={() => equip(null)}>Remove</button>}<span class="muted" style={{ fontSize: '12px' }}>Can use: {equipCategories(u).filter((c) => !['accessory', 'cloak', 'ring', 'armlet', 'boots', 'perfume', 'ribbon'].includes(c)).join(', ')}</span></div>
      <div class="equip-list">
        {options.length === 0 && <div class="muted">Nothing in the stores fits this slot.</div>}
        {options.map(({ item, n }) => {
          const trial = structuredClone(u);
          trial.equipment[slot] = item.id;
          if (slot === 'main' && item.twoHanded) delete trial.equipment.off;
          const ts = deriveStats(trial);
          const diffs: [string, number][] = [['HP', ts.maxHp - st.maxHp], ['MP', ts.maxMp - st.maxMp], ['PA', ts.pa - st.pa], ['MA', ts.ma - st.ma], ['Sp', ts.sp - st.sp], ['WP', ts.wp - st.wp], ['Ev', ts.sev + ts.aev - st.sev - st.aev], ['Mv', ts.move - st.move]];
          return (
            <button class="equip-option" onClick={() => equip(item)}>
              <span class="col" style={{ gap: 0, alignItems: 'flex-start', minWidth: 0 }}>
                <span>{item.name} <span class="muted num">×{n}</span></span>
                <span class="muted" style={{ fontSize: '12px' }}>{itemSummary(item)}</span>
              </span>
              <span class="diffs num">{diffs.filter(([, d]) => d !== 0).map(([k, d]) => <span class={d > 0 ? 'up' : 'down'}>{k}{d > 0 ? '+' : ''}{d}</span>)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function itemSummary(it: ItemDef): string {
  const parts: string[] = [];
  if (it.wp) parts.push(`WP ${it.wp}`);
  if (it.hp) parts.push(`HP +${it.hp}`);
  if (it.mp) parts.push(`MP +${it.mp}`);
  if (it.pev) parts.push(`Ev ${it.pev}%`);
  if (it.mev) parts.push(`M-Ev ${it.mev}%`);
  if (it.element) parts.push(it.element);
  for (const [k, v] of Object.entries(it.bonus ?? {})) if (v) parts.push(`${k.toUpperCase()} +${v}`);
  if (it.autoStatus?.length) parts.push(`Auto-${it.autoStatus.map((s) => STATUSES[s]?.name).join('/')}`);
  if (it.immune?.length) parts.push('Status immunity');
  if (it.twoHanded) parts.push('2H');
  if (it.description && !parts.length) parts.push(it.description);
  return parts.join(' · ');
}

function LoadoutTab({ u }: { u: UnitBuild }) {
  const learned = new Set(allLearned(u));
  const secondaries = Object.keys(u.jobs).filter((j) => j !== u.job && JOBS[j] && u.jobs[j].learned.some((a) => ABILITIES[a]?.kind === 'action'));
  const pick = (k: 'reaction' | 'support' | 'movement') => [...learned].filter((a) => ABILITIES[a]?.kind === k);
  const set = (field: 'secondary' | 'reaction' | 'support' | 'movement', v: string | undefined) => {
    mutate((g) => { const r = g.roster.find((x) => x.id === u.id)!; r[field] = v; });
    sfx('confirm');
  };
  const Section = ({ title, field, options, name }: { title: string; field: 'secondary' | 'reaction' | 'support' | 'movement'; options: string[]; name: (id: string) => string }) => (
    <div>
      <div class="label" style={{ margin: '8px 0 4px' }}>{title}</div>
      <div class="loadout-options">
        <button class={`chip ${!u[field] ? 'sel' : ''}`} onClick={() => set(field, undefined)}>None</button>
        {options.map((o) => <button class={`chip ${u[field] === o ? 'sel' : ''}`} title={ABILITIES[o]?.description ?? JOBS[o]?.description} onClick={() => set(field, o)}>{name(o)}</button>)}
      </div>
    </div>
  );
  return (
    <div class="col">
      <div class="muted">Primary: <b class="gold-text">{JOBS[u.job]?.skillsetName}</b> (from {JOBS[u.job]?.name})</div>
      <Section title="Secondary skillset" field="secondary" options={secondaries} name={(j) => JOBS[j].skillsetName} />
      <Section title="Reaction" field="reaction" options={pick('reaction')} name={(a) => ABILITIES[a].name} />
      <Section title="Support" field="support" options={pick('support')} name={(a) => ABILITIES[a].name} />
      <Section title="Movement" field="movement" options={pick('movement')} name={(a) => ABILITIES[a].name} />
      <p class="muted" style={{ fontSize: '13px' }}>Abilities learned in any job stay learned forever. Mix them freely.</p>
    </div>
  );
}

export { tierForLevel };
