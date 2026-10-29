import { ITEMS } from '../../content/items';
import { JOBS } from '../../content/jobs';
import type { Appearance, BodyType } from '../../content/schema';
import type { UnitBuild } from '../../engine/types';
import { getCatalogIfLoaded } from '../../render/sprites';
import { sfx } from '../../game/sound';
import { mutate } from '../../game/state';

const HAIR = ['hair_plain', 'hair_messy1', 'hair_messy2', 'hair_parted', 'hair_spiked', 'hair_bedhead', 'hair_buzzcut', 'hair_swoop', 'hair_unkempt', 'hair_page', 'hair_shorthawk', 'hair_longhawk', 'hair_curly_short', 'hair_cornrows', 'hair_balding', 'hair_topknot_short', 'hair_relm_short', 'hair_afro', 'hair_dreadlocks_short', 'hair_ponytail', 'hair_ponytail2', 'hair_high_ponytail', 'hair_bob', 'hair_bob_side_part', 'hair_long', 'hair_long_straight', 'hair_long_messy', 'hair_wavy', 'hair_braid', 'hair_pixie', 'hair_bangs', 'hair_bangsshort', 'hair_bangs_bun', 'hair_princess', 'hair_shoulderl', 'hair_curly_long', 'hair_half_up', 'hair_loose', 'hair_sara', 'hair_pigtails_bangs', 'hair_xlong'];
const BEARDS = ['', 'beards_5oclock_shadow', 'beards_trimmed', 'beards_beard', 'beards_medium', 'beards_winter', 'beards_mustache', 'beards_bigstache', 'beards_handlebar'];
const SKINS = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'];
const EYES = ['blue', 'green', 'brown', 'gray', 'purple', 'red', 'orange', 'yellow'];
const HAIR_COLORS = ['black', 'raven', 'dark_brown', 'chestnut', 'light_brown', 'ginger', 'redhead', 'carrot', 'strawberry', 'blonde', 'sandy', 'gold', 'platinum', 'white', 'ash', 'gray', 'dark_gray', 'navy', 'blue', 'green', 'purple', 'violet', 'rose', 'pink'];
const CLOTH = ['white', 'gray', 'charcoal', 'black', 'brown', 'leather', 'walnut', 'tan', 'yellow', 'orange', 'red', 'maroon', 'rose', 'pink', 'lavender', 'purple', 'blue', 'navy', 'sky', 'teal', 'bluegray', 'slate', 'forest', 'green'];

const pretty = (k: string) => k.replace(/^(hair|beards)_/, '').replace(/_/g, ' ');

/** Swatch colours for the palette buttons (approximate). */
const SWATCH: Record<string, string> = {
  light: '#f0c8a8', amber: '#e8a868', olive: '#c88c5c', taupe: '#a87850', bronze: '#8c5a38', brown: '#6a4028', black: '#3a2418',
  blue: '#3a6ad0', green: '#3a9a50', gray: '#909098', purple: '#8a4ab8', red: '#c03a3a', orange: '#e8862a', yellow: '#e8c83a',
  raven: '#1a1a24', dark_brown: '#4a2e1c', chestnut: '#7a3e22', light_brown: '#9a6a42', ginger: '#c8641e', redhead: '#a83a1a', carrot: '#e8742a',
  strawberry: '#e8946a', blonde: '#e8cc78', sandy: '#c8a468', gold: '#e8b830', platinum: '#e8e4d0', white: '#f4f4f0', ash: '#b8b4a8', dark_gray: '#5a5a60',
  navy: '#2a3a6a', violet: '#7a4ae0', rose: '#d06a7a', pink: '#f0a0c0', charcoal: '#3a3a40', leather: '#8a5a34', walnut: '#5a3a22', tan: '#c8a878',
  maroon: '#6a1a24', lavender: '#b8a0e0', sky: '#7ab8e8', teal: '#2a8a8a', bluegray: '#6a7a90', slate: '#5a6a7a', forest: '#2a5a32',
};

export function WardrobeTab({ u }: { u: UnitBuild }) {
  const ap = u.appearance;
  const set = (patch: Partial<Appearance>) => {
    mutate((g) => { const r = g.roster.find((x) => x.id === u.id)!; r.appearance = { ...r.appearance, ...patch }; });
    sfx('equip');
  };
  const dye = (key: string, color: string | null) => {
    mutate((g) => {
      const r = g.roster.find((x) => x.id === u.id)!;
      const dyes = { ...(r.appearance.dyes ?? {}) };
      if (color) dyes[key] = color; else delete dyes[key];
      r.appearance = { ...r.appearance, dyes };
    });
    sfx('equip');
  };
  // Dyeable pieces: job outfit + equipment layers that recolour with the cloth palette.
  const cat = getCatalogIfLoaded();
  const job = JOBS[u.job];
  const pieces = [
    ...(job?.outfit.all ?? []).map((l) => ({ key: l.key, from: `${job.name} outfit` })),
    ...Object.values(u.equipment).filter(Boolean).flatMap((id) => (ITEMS[id!]?.visual ?? []).map((l) => ({ key: l.key, from: ITEMS[id!].name }))),
  ].filter((p, i, a) => a.findIndex((q) => q.key === p.key) === i && cat?.items[p.key]?.recolor?.some((c) => c.material === 'cloth'));
  const Swatches = ({ list, value, onPick }: { list: string[]; value?: string; onPick: (c: string) => void }) => (
    <div class="swatches">{list.map((c) => <button class={`swatch ${value === c ? 'sel' : ''}`} title={pretty(c)} style={{ background: SWATCH[c] ?? '#888' }} onClick={() => onPick(c)} />)}</div>
  );
  return (
    <div class="col">
      <div class="label">Body</div>
      <div class="loadout-options">{(['male', 'female', 'muscular'] as BodyType[]).map((b) => <button class={`chip ${ap.body === b ? 'sel' : ''}`} onClick={() => set({ body: b, head: undefined })}>{b}</button>)}</div>
      <div class="label">Skin</div>
      <Swatches list={SKINS} value={ap.skin} onPick={(c) => set({ skin: c })} />
      <div class="label">Hair</div>
      <select class="select" value={ap.hair ?? ''} onChange={(e) => set({ hair: (e.target as HTMLSelectElement).value || undefined })}>
        <option value="">bald</option>
        {HAIR.map((h) => <option value={h}>{pretty(h)}</option>)}
      </select>
      <Swatches list={HAIR_COLORS} value={ap.hairColor} onPick={(c) => set({ hairColor: c })} />
      {ap.body !== 'female' && (
        <>
          <div class="label">Beard</div>
          <select class="select" value={ap.beard ?? ''} onChange={(e) => set({ beard: (e.target as HTMLSelectElement).value || undefined })}>
            {BEARDS.map((b) => <option value={b}>{b ? pretty(b) : 'none'}</option>)}
          </select>
        </>
      )}
      <div class="label">Eyes</div>
      <Swatches list={EYES} value={ap.eyes} onPick={(c) => set({ eyes: c })} />
      {pieces.length > 0 && <div class="label" style={{ marginTop: '8px' }}>Dyes</div>}
      {pieces.map((p) => (
        <div class="dye-row">
          <span class="dye-name">{pretty(p.key.replace(/^(torso|legs|feet|cape|belt|hat|arms|neck)_/, '').replace(/^clothes_|^jacket_|^aprons_|^armour_/, ''))} <span class="muted">({p.from})</span></span>
          <Swatches list={CLOTH} value={ap.dyes?.[p.key]} onPick={(c) => dye(p.key, c)} />
          {ap.dyes?.[p.key] && <button class="btn small ghost" onClick={() => dye(p.key, null)}>Reset</button>}
        </div>
      ))}
      <p class="muted" style={{ fontSize: '12px' }}>Appearance never affects stats. More styles and dyes arrive with cosmetic collections.</p>
    </div>
  );
}
