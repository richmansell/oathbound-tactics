import { useEffect, useRef, useState } from 'preact/hooks';
import { formatPlaytime, listSaves, type Slot } from '../../game/save';
import { music, sfx } from '../../game/sound';
import type { Difficulty } from '../../game/state';
import { animateBackdrop } from '../../render/backdrops';
import './title.css';

export function TitleScreen(props: { onNew: (d: Difficulty) => void; onLoad: (slot: Slot) => void; onSandbox: () => void; onOnline: () => void; onSettings: () => void; onCredits: () => void }) {
  const bg = useRef<HTMLCanvasElement>(null);
  const [panel, setPanel] = useState<'main' | 'new' | 'load'>('main');
  const saves = listSaves();
  useEffect(() => animateBackdrop(bg.current!, () => 'camp-night', 3), []);
  useEffect(() => { music('title', 1500); }, []);
  const go = (fn: () => void) => () => { sfx('confirm'); fn(); };
  return (
    <div class="screen title-screen">
      <canvas ref={bg} class="title-bg" />
      <div class="title-vignette" />
      <div class="title-logo pop-in">
        <div class="logo-crest">✦</div>
        <h1 class="title-font">Oathbound</h1>
        <div class="logo-sub title-font">Tactics</div>
        <div class="logo-tag">The Split Penny</div>
      </div>
      <div class="title-menu panel fade-in">
        {panel === 'main' && (
          <div class="menu">
            {saves.length > 0 && <button class="menu-item" onClick={go(() => props.onLoad(saves[0].slot))}><span>Continue</span><span class="meta">{saves[0].leader} · Lv {saves[0].level}</span></button>}
            <button class="menu-item" onClick={go(() => setPanel('new'))}><span>New Story</span></button>
            {saves.length > 0 && <button class="menu-item" onClick={go(() => setPanel('load'))}><span>Load</span></button>}
            <button class="menu-item" onClick={go(props.onSandbox)}><span>Skirmish</span><span class="meta">quick battle</span></button>
            <button class="menu-item" onClick={go(props.onOnline)}><span>Online</span><span class="meta">duel</span></button>
            <button class="menu-item" onClick={go(props.onSettings)}><span>Settings</span></button>
            <button class="menu-item" onClick={go(props.onCredits)}><span>Credits</span></button>
          </div>
        )}
        {panel === 'new' && (
          <div class="menu">
            <div class="panel-title">Choose your path</div>
            <button class="menu-item diff" onClick={go(() => props.onNew('story'))}><span><b>Story</b><br /><small>Gentler foes. No one is lost forever.</small></span></button>
            <button class="menu-item diff" onClick={go(() => props.onNew('tactician'))}><span><b>Tactician</b><br /><small>The intended challenge.</small></span></button>
            <button class="menu-item diff" onClick={go(() => props.onNew('oathsworn'))}><span><b>Oathsworn</b><br /><small>Cunning foes. The fallen crystallise and are gone.</small></span></button>
            <button class="menu-item" onClick={() => setPanel('main')}><span class="muted">Back</span></button>
          </div>
        )}
        {panel === 'load' && (
          <div class="menu">
            <div class="panel-title">Load</div>
            {saves.map((s) => (
              <button class="menu-item" onClick={go(() => props.onLoad(s.slot))}>
                <span>{s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot}`} — {s.leader}</span>
                <span class="meta">Lv {s.level} · {formatPlaytime(s.playtime)} · {new Date(s.saved).toLocaleDateString()}</span>
              </button>
            ))}
            <button class="menu-item" onClick={() => setPanel('main')}><span class="muted">Back</span></button>
          </div>
        )}
      </div>
      <div class="title-foot">v0.1 · a tactics RPG of promises kept and broken</div>
    </div>
  );
}
