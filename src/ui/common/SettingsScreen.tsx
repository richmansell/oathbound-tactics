import { useState } from 'preact/hooks';
import { audio } from '../../game/sound';
import { getGame, hasGame, mutate } from '../../game/state';
import { Icon } from './Icon';

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [vol, setVol] = useState(() => { try { return audio.getVolumes(); } catch { return { master: 1, music: 0.8, sfx: 0.9, voice: 1 }; } });
  const [, force] = useState(0);
  const g = hasGame() ? getGame() : null;
  const setV = (k: keyof typeof vol, v: number) => { const nv = { ...vol, [k]: v }; setVol(nv); try { audio.setVolumes(nv); } catch { /* optional */ } };
  return (
    <div class="screen" style={{ background: 'radial-gradient(ellipse at top, #1a2647, #070b16 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div class="panel" style={{ width: 'min(520px, 94vw)' }}>
        <div class="panel-title row"><span>Settings</span><span class="spacer" /><button class="btn small ghost" onClick={onClose}><Icon name="close" /></button></div>
        <div class="menu">
          {(['master', 'music', 'sfx', 'voice'] as const).map((k) => (
            <label class="menu-item"><span style={{ textTransform: 'capitalize' }}>{k} volume</span>
              <input type="range" min={0} max={1} step={0.05} value={vol[k]} onInput={(e) => setV(k, Number((e.target as HTMLInputElement).value))} style={{ width: '50%' }} />
            </label>
          ))}
          {g && (
            <>
              <label class="menu-item"><span>Text speed</span>
                <span class="row">{[[20, 'Slow'], [45, 'Normal'], [90, 'Fast'], [0, 'Instant']].map(([v, l]) => <button class={`btn small ${g.settings.textSpeed === v ? 'primary' : ''}`} onClick={() => { mutate((gg) => { gg.settings.textSpeed = v as number; }); force((n) => n + 1); }}>{l}</button>)}</span>
              </label>
              <div class="menu-item"><span>Difficulty</span><span class="meta" style={{ textTransform: 'capitalize' }}>{g.settings.difficulty}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
