import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon';

/** Credits: our own summary plus the generated asset attribution files (legal requirement). */
export function CreditsScreen({ onClose }: { onClose: () => void }) {
  const [audioCredits, setAudio] = useState('');
  const [spriteCredits, setSprites] = useState('');
  useEffect(() => {
    fetch('assets/audio/CREDITS.md').then((r) => r.text()).then(setAudio).catch(() => setAudio('(unavailable)'));
    fetch('assets/lpc/CREDITS.md').then((r) => r.text()).then((t) => setSprites(t.slice(0, 60000))).catch(() => setSprites('(unavailable)'));
  }, []);
  return (
    <div class="screen" style={{ background: '#070b16', display: 'flex', flexDirection: 'column' }}>
      <div class="row" style={{ padding: 'calc(10px + var(--safe-top)) 12px 8px' }}>
        <button class="btn small" onClick={onClose}><Icon name="back" /></button>
        <div class="title-font gold-text" style={{ fontSize: '22px' }}>Credits</div>
      </div>
      <div class="scroll" style={{ flex: 1, padding: '0 16px 24px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <h2 class="title-font gold-text">Oathbound Tactics</h2>
        <p>An original tactics RPG. Story, systems, procedural art (terrain, props, portraits, backdrops) and code created for this project.</p>
        <p>Character sprites are composited from the <b>Liberated Pixel Cup (LPC)</b> Universal Spritesheet project and its many contributors, used under CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 / CC0 as listed per file below. Portrait colour ramps use the ULPC palettes (CC-BY-SA 3.0 / GPL 3.0).</p>
        <p>Music: Jonathan Shaw (RPG Orchestral Essentials, CC-BY 3.0), Kevin MacLeod (incompetech.com, CC-BY 4.0), spuispuin (CC-BY 4.0), RandomMind (CC0). Sound effects: leohpaz (CC-BY 4.0), Kenney (CC0), Little Robot Sound Factory (CC-BY 3.0) and others — full list below.</p>
        <h3 class="title-font">Audio</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--parch-dim)' }}>{audioCredits}</pre>
        <h3 class="title-font">Character sprites (LPC)</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--parch-dim)' }}>{spriteCredits}</pre>
      </div>
    </div>
  );
}
