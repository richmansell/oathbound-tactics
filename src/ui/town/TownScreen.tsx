import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ITEMS } from '../../content/items';
import { JOBS } from '../../content/jobs';
import { KEY_ITEMS } from '../../content/storyJobs';
import type { ItemDef } from '../../content/types';
import { canEquip } from '../../engine/units';
import { MONEY } from '../../game/campaign';
import { makeRecruit } from '../../game/recruit';
import { saveGame, SLOTS, type Slot } from '../../game/save';
import { music, sfx } from '../../game/sound';
import { MAX_ROSTER, mutate, useGame } from '../../game/state';
import { animateBackdrop, type BackdropKind } from '../../render/backdrops';
import { Portrait } from '../common/Portrait';
import { Icon } from '../common/Icon';
import { itemSummary } from '../party/PartyScreen';
import './town.css';

const RUMOURS: Record<string, string[]> = {
  tallow_cross: [
    'They say the lanterns on the Lantern Road went dark the same night the Notary\'s clerk drowned.',
    'An Auditor came through last week. Grey gloves. Asked about the foundling house at Millbrook.',
    'The Struck don\'t pay tithes because the Ledger won\'t write them down. Funny how the Hollows still find them.',
    'Sloe gin\'s half price if you can tell old Hennet what the Regent ate for breakfast. Nobody ever can.',
    'Ashguard grey on the King\'s Road. When the grey cloaks come south, villages burn.',
  ],
  millbrook: ['Saint Verity\'s took in thirty children last winter. The Ledger counted twenty-nine.', 'The mill wheel stopped the night the bell rang by itself.'],
  tenpenny: ['Every door has a tally. Every tally is a debt the Ledger struck and the fen remembered.', 'Don\'t whistle on the walkways after dark. The shades answer.'],
};

type Tab = 'shop' | 'sell' | 'tavern' | 'rumours' | 'save';

export function TownScreen({ nodeId, name, backdrop, onLeave, onParty }: { nodeId: string; name: string; backdrop: BackdropKind; onLeave: () => void; onParty: () => void }) {
  const g = useGame();
  const bg = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<Tab>('shop');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => animateBackdrop(bg.current!, () => backdrop, nodeId.length), []);
  useEffect(() => { music(nodeId === 'tallow_cross' ? 'tavern' : 'town'); }, []);
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 1800); };

  const progressTier = Math.min(8, 1 + Math.floor(g.story.done.length / 3));
  const stock = useMemo(() => {
    const ids = new Set(g.shopUnlocks);
    for (const it of Object.values(ITEMS)) if (!it.rare && it.tier <= progressTier && !KEY_ITEMS.has(it.id) && it.price > 0) ids.add(it.id);
    return [...ids].map((id) => ITEMS[id]).filter(Boolean).sort((a, b) => order(a) - order(b) || a.price - b.price);
  }, [g.shopUnlocks.length, progressTier]);

  const buy = (it: ItemDef) => {
    if (g.gil < it.price) { sfx('error'); toast(`Not enough ${MONEY}.`); return; }
    mutate((gg) => { gg.gil -= it.price; gg.inventory[it.id] = (gg.inventory[it.id] ?? 0) + 1; });
    sfx('buy');
  };
  const sell = (it: ItemDef) => {
    mutate((gg) => { gg.gil += Math.floor(it.price / 2); gg.inventory[it.id]--; if (gg.inventory[it.id] <= 0) delete gg.inventory[it.id]; });
    sfx('gil');
  };

  const recruits = useMemo(() => {
    const lv = Math.max(1, Math.round(g.roster.reduce((a, u) => a + u.level, 0) / Math.max(1, g.roster.length)) - 1);
    return [0, 1, 2, 3].map((i) => makeRecruit(g.tavernSeed * 7 + nodeId.length, lv, i));
  }, [g.tavernSeed]);

  return (
    <div class="screen town-screen">
      <canvas ref={bg} class="town-bg" />
      <div class="town-shade" />
      <div class="town-header">
        <button class="btn small" onClick={onLeave}><Icon name="back" /> Leave</button>
        <div class="title-font town-name">{name}</div>
        <div class="spacer" />
        <button class="btn small" onClick={onParty}><Icon name="party" /> Company</button>
        <div class="num gold-text">{g.gil.toLocaleString()} {MONEY}</div>
      </div>
      <div class="town-tabs">
        {(['shop', 'sell', 'tavern', 'rumours', 'save'] as Tab[]).map((t) => <button class={`btn small ${tab === t ? 'primary' : ''}`} onClick={() => { setTab(t); sfx('page'); }}>{{ shop: 'Merchant', sell: 'Sell', tavern: 'Tavern', rumours: 'Rumours', save: 'Save' }[t]}</button>)}
      </div>
      <div class="town-body panel scroll">
        {tab === 'shop' && stock.map((it) => {
          const owned = g.inventory[it.id] ?? 0;
          const users = g.roster.filter((u) => it.type !== 'consumable' && canEquip(u, it, slotFor(it))).length;
          return (
            <div class="shop-row">
              <div class="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                <span>{it.name} <span class="muted num" style={{ fontSize: '12px' }}>owned {owned}</span></span>
                <span class="muted" style={{ fontSize: '12px' }}>{itemSummary(it) || it.description}{it.type !== 'consumable' ? ` · ${users} can use` : ''}</span>
              </div>
              <button class="btn small" disabled={g.gil < it.price} onClick={() => buy(it)}><span class="num">{it.price}</span></button>
            </div>
          );
        })}
        {tab === 'sell' && Object.entries(g.inventory).filter(([id, n]) => n > 0 && ITEMS[id] && !KEY_ITEMS.has(id) && ITEMS[id].price > 0).map(([id, n]) => {
          const it = ITEMS[id];
          return (
            <div class="shop-row">
              <div class="col" style={{ gap: 0, flex: 1 }}><span>{it.name} <span class="muted num">×{n}</span></span><span class="muted" style={{ fontSize: '12px' }}>{itemSummary(it)}</span></div>
              <button class="btn small" onClick={() => sell(it)}><span class="num">+{Math.floor(it.price / 2)}</span></button>
            </div>
          );
        })}
        {tab === 'tavern' && (
          <div class="col">
            <p class="muted">Sellswords looking for a company. ({g.roster.length}/{MAX_ROSTER})</p>
            {recruits.map(({ build, cost }) => {
              const hired = g.roster.some((u) => u.id === build.id);
              return (
                <div class="shop-row">
                  <Portrait build={build} size={48} />
                  <div class="col" style={{ gap: 0, flex: 1 }}><span class="title-font">{build.name}</span><span class="muted" style={{ fontSize: '12px' }}>{JOBS[build.job].name} · Lv {build.level} · Brave {build.brave} · Faith {build.faith}</span></div>
                  <button class="btn small" disabled={hired || g.gil < cost || g.roster.length >= MAX_ROSTER} onClick={() => {
                    mutate((gg) => { gg.gil -= cost; gg.roster.push(structuredClone(build)); gg.party.push(build.id); });
                    sfx('buy');
                    toast(`${build.name} joins the company.`);
                  }}>{hired ? 'Hired' : <span class="num">{cost}</span>}</button>
                </div>
              );
            })}
            <button class="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => mutate((gg) => { gg.tavernSeed++; })}>Look for others</button>
          </div>
        )}
        {tab === 'rumours' && (
          <div class="col">{(RUMOURS[nodeId] ?? ['The talk here is of harvests and weather. Nothing a sellsword needs to hear.']).map((r) => <p class="rumour">“{r}”</p>)}</div>
        )}
        {tab === 'save' && (
          <div class="col">
            {SLOTS.filter((s) => s !== 'auto').map((s) => (
              <button class="btn" onClick={() => { const ok = saveGame(g, s as Slot); sfx(ok ? 'confirm' : 'error'); toast(ok ? `Saved to slot ${s}.` : 'Could not save.'); }}>Save to slot {s}</button>
            ))}
          </div>
        )}
      </div>
      {msg && <div class="toast-wrap"><div class="toast panel">{msg}</div></div>}
    </div>
  );
}

function order(it: ItemDef): number {
  return { consumable: 0, weapon: 1, shield: 2, head: 3, body: 4, accessory: 5 }[it.type];
}

function slotFor(it: ItemDef) {
  return it.type === 'weapon' ? 'main' as const : it.type === 'shield' ? 'off' as const : it.type === 'head' ? 'head' as const : it.type === 'body' ? 'body' as const : 'accessory' as const;
}
