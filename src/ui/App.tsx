import { useEffect, useRef, useState } from 'preact/hooks';
import type { StoryBeat } from '../content/schema';
import type { BattleState } from '../engine/types';
import {
  advanceInstantBeats, applyBattleResult, buildFromCharacter, completeBeat, currentBeat, hasFlag, newGame, prepareStoryBattle, setFlag, unlockedNodes,
  type PreparedBattle,
} from '../game/campaign';
import { locationName, packData } from '../game/campaignData';
import { sandboxBattle } from '../game/sandbox';
import { loadGame, saveGame, type Slot } from '../game/save';
import { initSound, music, sfx } from '../game/sound';
import { playCueMusic } from '../game/storyAudio';
import { getGame, hasGame, mutate, setGame, type Difficulty } from '../game/state';
import { loadCatalog } from '../render/sprites';
import type { BackdropKind } from '../render/backdrops';
import { BattleScreen } from './battle/BattleScreen';
import { PartyScreen } from './party/PartyScreen';
import { SceneScreen } from './scene/SceneScreen';
import { TitleScreen } from './title/TitleScreen';
import { TownScreen } from './town/TownScreen';
import { WorldMapScreen } from './world/WorldMapScreen';
import { WorldScreen } from './world/WorldScreen';
import { carve, kingdomOverview, nodeForSetPiece, nodeTile, worldGen } from '../game/worldRuntime';
import { encounterRewards, epoch, type Encounter } from '../game/overworld';
import { hashString } from '../engine/rng';
import { SettingsScreen } from './common/SettingsScreen';
import { CreditsScreen } from './common/CreditsScreen';
import { TitleCard } from './common/TitleCard';
import { OnlineScreen } from './online/OnlineScreen';
import { ErrorBoundary } from './common/ErrorBoundary';

type Screen =
  | { k: 'boot' }
  | { k: 'title' }
  | { k: 'scene'; id: string; next: () => void }
  | { k: 'titlecard'; text: string; subtitle?: string; next: () => void }
  | { k: 'world'; key?: number }
  | { k: 'map' }
  | { k: 'encounter'; enc: Encounter; key: number }
  | { k: 'town'; node: string }
  | { k: 'battle'; prep: PreparedBattle; key: number; skirmish?: boolean }
  | { k: 'defeat'; prep: PreparedBattle; skirmish?: boolean }
  | { k: 'end'; text: string }
  | { k: 'sandbox'; key: number }
  | { k: 'online' }
  | { k: 'settings'; back: Screen }
  | { k: 'credits'; back: Screen };

export function App() {
  const [screen, setScreen] = useState<Screen>({ k: 'boot' });
  const [party, setParty] = useState(false);
  const [overlay, setOverlay] = useState<{ id: string; done: () => void } | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    initSound();
    loadCatalog().catch((e) => console.error('catalog failed', e)).finally(() => {
      const p = new URLSearchParams(location.search);
      if (p.get('sandbox') === 'battle') setScreen({ k: 'sandbox', key: 0 });
      else if (p.get('scene')) { newGame({ difficulty: 'tactician' }); setScreen({ k: 'scene', id: p.get('scene')!, next: () => setScreen({ k: 'title' }) }); }
      else if (p.get('battle')) { newGame({ difficulty: 'tactician' }); devParty(Number(p.get('lv') ?? 5)); startBattle(prepareStoryBattle(p.get('battle')!), true); }
      else setScreen({ k: 'title' });
    });
    // Global UI click sound.
    const onClick = (e: Event) => { const el = (e.target as HTMLElement).closest('.btn, .menu-item'); if (el && !(el as HTMLButtonElement).disabled) sfx('cursor', { volume: 0.5 }); };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Playtime
  useEffect(() => {
    const id = setInterval(() => { if (hasGame() && screenRef.current.k !== 'title') getGame().playtime += 5; }, 5000);
    return () => clearInterval(id);
  }, []);

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };
  const autosave = () => { if (hasGame()) saveGame(getGame(), 'auto'); };

  // ------------------------------------------------------------------ story director
  function runStory(): void {
    const b = advanceInstantBeats();
    if (!b) { setScreen({ k: 'end', text: 'To be continued.' }); return; }
    switch (b.kind) {
      case 'scene':
        if (b.at) { setScreen({ k: 'world' }); return; }
        setScreen({ k: 'scene', id: b.scene, next: () => { completeBeat(b.scene); autosave(); runStory(); } });
        return;
      case 'title':
        setScreen({ k: 'titlecard', text: b.text, subtitle: b.subtitle, next: () => { completeBeat(); autosave(); runStory(); } });
        return;
      case 'battle':
        setScreen({ k: 'world' });
        return;
      case 'end':
        autosave();
        setScreen({ k: 'end', text: b.text ?? 'End of chapter.' });
        return;
      default:
        completeBeat();
        runStory();
    }
  }

  function objective(b: StoryBeat | null): string {
    if (!b) return 'The chapter is complete.';
    const pack = packData(getGame().story.pack).pack;
    if (b.kind === 'battle') return `${pack.battles[b.battle]?.title ?? 'Battle'} — travel to ${nodeName(b.at)}.`;
    if (b.kind === 'scene' && b.at) return `Travel to ${nodeName(b.at)}.`;
    return 'Continue the story.';
  }

  function nodeName(id: string): string {
    return packData(getGame().story.pack).pack.world.nodes.find((n) => n.id === id)?.name ?? id;
  }

  function onArrive(node: string): void {
    const b = currentBeat();
    const pack = packData(getGame().story.pack).pack;
    if (b && (b.kind === 'battle' || b.kind === 'scene') && b.at === node) {
      if (b.kind === 'scene') {
        setScreen({ k: 'scene', id: b.scene, next: () => { completeBeat(b.scene); autosave(); runStory(); } });
        return;
      }
      startStoryBattle(b.battle);
      return;
    }
    const n = pack.world.nodes.find((x) => x.id === node);
    if (n?.kind === 'town' || n?.shop || n?.tavern) { setScreen({ k: 'town', node }); return; }
    const sk = n?.skirmishes?.find((id) => pack.battles[id]);
    if (sk) {
      const intro = pack.battles[sk].introScene;
      const go = () => startBattle(prepareStoryBattle(sk), true);
      if (intro && !getGame().story.done.includes(intro)) setScreen({ k: 'scene', id: intro, next: () => { mutate((g) => { g.story.done.push(intro); }); go(); } });
      else go();
      return;
    }
    showToast(`${n?.name ?? 'This place'} is quiet for now.`);
  }

  function startStoryBattle(id: string): void {
    const def = packData(getGame().story.pack).pack.battles[id];
    const go = () => startBattle(prepareStoryBattle(id), false);
    if (def.introScene) setScreen({ k: 'scene', id: def.introScene, next: go });
    else go();
  }

  function startBattle(prep: PreparedBattle, skirmish: boolean): void {
    if (prep.def.music) playCueMusic(prep.def.music);
    setScreen({ k: 'battle', prep, key: Date.now(), skirmish });
  }

  function onBattleEnd(prep: PreparedBattle, result: 'victory' | 'defeat', state: BattleState, skirmish: boolean): void {
    if (result === 'defeat') { setScreen({ k: 'defeat', prep, skirmish }); return; }
    applyBattleResult(state, 'victory', prep.def.rewards);
    music('results');
    const after = () => {
      if (skirmish) { autosave(); setScreen({ k: 'world' }); return; }
      completeBeat(prep.def.id);
      autosave();
      runStory();
    };
    if (prep.def.outroScene && !skirmish) setScreen({ k: 'scene', id: prep.def.outroScene, next: after });
    else after();
  }

  function startNewGame(d: Difficulty): void {
    newGame({ difficulty: d });
    placeOutsideStart();
    autosave();
    runStory();
  }

  function load(slot: Slot): void {
    const g = loadGame(slot);
    if (!g) { showToast('That save could not be loaded.'); return; }
    setGame(g);
    runStory();
  }

  // ------------------------------------------------------------------ render
  let content: preact.JSX.Element | null = null;
  switch (screen.k) {
    case 'boot':
      content = <div class="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span class="title-font gold-text">Loading…</span></div>;
      break;
    case 'title':
      content = <TitleScreen onNew={startNewGame} onLoad={load} onSandbox={() => setScreen({ k: 'sandbox', key: Date.now() })} onOnline={() => setScreen({ k: 'online' })}
        onSettings={() => setScreen({ k: 'settings', back: screen })} onCredits={() => setScreen({ k: 'credits', back: screen })} />;
      break;
    case 'scene':
      content = <SceneScreen key={screen.id} sceneId={screen.id} pack={hasGame() ? getGame().story.pack : 'main'} textSpeed={hasGame() ? getGame().settings.textSpeed : 45}
        hasFlag={hasFlag} setFlag={setFlag} onDone={screen.next} />;
      break;
    case 'titlecard':
      content = <TitleCard text={screen.text} subtitle={screen.subtitle} onDone={screen.next} />;
      break;
    case 'world': {
      const gen = worldGen(getGame().world.seed);
      content = <WorldScreen key={screen.key ?? 0} gen={gen} carve={carve} nodeForSetPiece={(id) => nodeForSetPiece(id)} nodeTile={(id) => nodeTile(gen, id)}
        target={targetNode()} objective={objective(currentBeat())}
        onArrive={(node) => { mutate((g) => { if (!g.world.visited.includes(node)) g.world.visited.push(node); }); onArrive(node); }}
        onEncounter={(enc) => { playCueMusic('battle_bandits'); setScreen({ k: 'encounter', enc, key: Date.now() }); }}
        onParty={() => setParty(true)} onMenu={() => setMenu(true)} onMap={() => setScreen({ k: 'map' })} />;
      break;
    }
    case 'map': {
      const g0 = getGame();
      const fast = [...new Set([...g0.world.visited, packData(g0.story.pack).pack.world.start])];
      content = <WorldMapScreen overview={kingdomOverview(g0.world.seed)} target={targetNode()} unlocked={fast} objective={`${objective(currentBeat())} Fast travel to places you have visited.`}
        onArrive={(node) => {
          const gen = worldGen(getGame().world.seed);
          const t = nodeTile(gen, node);
          mutate((g) => { g.world.pos = [t[0], t[1]]; });
          setScreen({ k: 'world', key: Date.now() });
          setTimeout(() => onArrive(node), 50);
        }}
        onParty={() => setParty(true)} onMenu={() => setScreen({ k: 'world', key: Date.now() })} />;
      break;
    }
    case 'encounter': {
      const enc = screen.enc;
      content = <BattleScreen key={screen.key} initial={enc.state} deployTiles={enc.deployTiles} title={enc.title} objective="Defeat all enemies"
        canRetreat onRetreat={() => { mutate((g) => { g.world.cleared[enc.roamer.key] = epoch(g.world.time); }); setScreen({ k: 'world', key: Date.now() }); }}
        flags={getGame().story.flags}
        rewards={encounterRewards(enc.roamer.level, hashString(enc.roamer.key))}
        onEnd={(r, st) => {
          if (r === 'victory') {
            const rw = encounterRewards(enc.roamer.level, hashString(enc.roamer.key));
            applyBattleResult(st, 'victory', { gil: rw.gil, items: rw.items });
            mutate((g) => { g.world.cleared[enc.roamer.key] = epoch(g.world.time); g.world.time += 20; });
            autosave();
            setScreen({ k: 'world', key: Date.now() });
          } else {
            // Defeat in the wild: the company limps back to the last town it visited.
            const g = getGame();
            const pack = packData(g.story.pack).pack;
            const town = [...g.world.visited].reverse().find((id) => pack.world.nodes.find((n) => n.id === id)?.kind === 'town') ?? pack.world.start;
            const t = nodeTile(worldGen(g.world.seed), town);
            mutate((gg) => { gg.world.pos = [t[0], t[1]]; gg.world.time += 240; gg.world.cleared[enc.roamer.key] = epoch(gg.world.time); });
            showToast('Your company retreats to safety.');
            setScreen({ k: 'world', key: Date.now() });
          }
        }} />;
      break;
    }
    case 'town': {
      const pack = packData(getGame().story.pack).pack;
      const n = pack.world.nodes.find((x) => x.id === screen.node)!;
      const bd = (pack.locations[screen.node]?.backdrop ?? 'village') as BackdropKind;
      content = <TownScreen nodeId={screen.node} name={n?.name ?? locationName(screen.node)} backdrop={bd} onLeave={() => setScreen({ k: 'world' })} onParty={() => setParty(true)} />;
      break;
    }
    case 'battle': {
      const prep = screen.prep;
      const skirmish = !!screen.skirmish;
      content = <BattleScreen key={screen.key} initial={prep.state} deployTiles={prep.deployTiles} maxDeploy={prep.def.maxDeploy} title={prep.def.title} objective={victoryText(prep)}
        hooks={{ onTrigger: (_id, sceneId) => sceneId && packData(getGame().story.pack).pack.scenes[sceneId] ? new Promise<void>((res) => setOverlay({ id: sceneId, done: res })) : Promise.resolve() }}
        canRetreat={skirmish} onRetreat={() => setScreen({ k: 'world' })} flags={getGame().story.flags} rewards={prep.def.rewards}
        onEnd={(r, st) => onBattleEnd(prep, r, st, skirmish)} />;
      break;
    }
    case 'defeat':
      content = (
        <div class="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'radial-gradient(ellipse, #1a0e14, #000)' }}>
          <div class="title-font" style={{ fontSize: '48px', color: '#c8a0a0', letterSpacing: '0.1em' }}>Fallen</div>
          <p class="muted" style={{ fontFamily: 'var(--font-story)', fontSize: '19px', fontStyle: 'italic' }}>The lanterns gutter. But a promise is not broken until you stop keeping it.</p>
          <div class="row">
            <button class="btn primary" onClick={() => startBattle(screen.skirmish ? prepareStoryBattle(screen.prep.def.id) : prepareStoryBattle(screen.prep.def.id), !!screen.skirmish)}>Try again</button>
            <button class="btn" onClick={() => setScreen({ k: 'world' })}>Return to the map</button>
          </div>
        </div>
      );
      break;
    case 'end':
      content = (
        <div class="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', background: '#000', padding: '24px', textAlign: 'center' }}>
          <div class="title-font gold-text" style={{ fontSize: 'clamp(28px, 5vw, 46px)', letterSpacing: '0.08em' }}>{screen.text}</div>
          <p class="muted">Thank you for playing the Oathbound Tactics demo.</p>
          <div class="row"><button class="btn" onClick={() => setScreen({ k: 'world' })}>Keep exploring</button><button class="btn primary" onClick={() => setScreen({ k: 'title' })}>Title</button></div>
        </div>
      );
      break;
    case 'sandbox': {
      const { state, deployTiles } = sandboxBattle(2024 + (screen.key % 1000));
      content = <BattleScreen key={screen.key} initial={state} deployTiles={deployTiles} title="Thornwick Ford" objective="Defeat all enemies" canRetreat onRetreat={() => setScreen({ k: 'title' })} onEnd={() => setScreen({ k: 'title' })} />;
      break;
    }
    case 'online':
      content = <OnlineScreen onClose={() => setScreen({ k: 'title' })} />;
      break;
    case 'settings':
      content = <SettingsScreen onClose={() => setScreen(screen.back)} />;
      break;
    case 'credits':
      content = <CreditsScreen onClose={() => setScreen(screen.back)} />;
      break;
  }

  function targetNode(): string | null {
    const b = currentBeat();
    return b && (b.kind === 'battle' || b.kind === 'scene') && b.at ? b.at : null;
  }

  return (
    <ErrorBoundary onReset={() => { setParty(false); setOverlay(null); setScreen({ k: 'title' }); }}>
      {content}
      {party && hasGame() && <PartyScreen onClose={() => setParty(false)} />}
      {overlay && <SceneScreen key={overlay.id} sceneId={overlay.id} overlay hasFlag={hasFlag} setFlag={setFlag} onDone={() => { const d = overlay.done; setOverlay(null); d(); }} />}
      {menu && (
        <div class="modal-backdrop" onClick={() => setMenu(false)}>
          <div class="panel modal pop-in" onClick={(e) => e.stopPropagation()}>
            <div class="panel-title">Menu</div>
            <div class="menu">
              <button class="menu-item" onClick={() => { setMenu(false); setParty(true); }}><span>Company</span></button>
              <button class="menu-item" onClick={() => { const ok = saveGame(getGame(), '1'); showToast(ok ? 'Saved to slot 1.' : 'Could not save.'); setMenu(false); }}><span>Save (slot 1)</span></button>
              <button class="menu-item" onClick={() => { setMenu(false); setScreen({ k: 'settings', back: screen }); }}><span>Settings</span></button>
              <button class="menu-item" onClick={() => { setMenu(false); autosave(); setScreen({ k: 'title' }); }}><span>Return to title</span></button>
              <button class="menu-item" onClick={() => setMenu(false)}><span>Close</span></button>
            </div>
          </div>
        </div>
      )}
      {toast && <div class="toast-wrap"><div class="toast panel">{toast}</div></div>}
    </ErrorBoundary>
  );
}

/** Start the party on the road just outside the first story location so the player walks in. */
function placeOutsideStart(): void {
  const g = getGame();
  const pack = packData(g.story.pack).pack;
  const gen = worldGen(g.world.seed);
  const info = gen.setPieceInfo(pack.world.start);
  if (!info) return;
  const cy = Math.round((info.bounds.y0 + info.bounds.y1) / 2);
  for (let r = 0; r < 40; r++) {
    for (const [x, y] of [[info.bounds.x0 - 4 - r, cy], [info.bounds.x0 - 4 - r, cy + r], [info.bounds.x0 - 4 - r, cy - r], [info.bounds.x1 + 3 + r, cy]] as [number, number][]) {
      const t = gen.tile(x, y);
      if (!t.setPiece && !t.blocked && t.t !== 'deepwater' && t.t !== 'water' && t.t !== 'swamp') {
        mutate((gg) => { gg.world.pos = [x, y]; });
        return;
      }
    }
  }
}

/** Dev: give the save a full Chapter 1 party at a level. */
function devParty(level: number): void {
  const pack = packData('main').pack;
  mutate((g) => {
    g.roster = ['bren', 'hesper', 'tamsin', 'aldous', 'eira', 'jory', 'odo'].map((id) => buildFromCharacter(pack.characters[id], level));
    g.party = g.roster.map((u) => u.id);
    g.inventory = { potion: 8, hi_potion: 3, phoenix_down: 3, ether: 2 };
  });
}

function victoryText(prep: PreparedBattle): string {
  const v = prep.def.victory;
  switch (v.type) {
    case 'defeatAll': return 'Defeat all enemies';
    case 'defeatTarget': return `Defeat ${prep.state.units.find((u) => u.spawnId === v.target)?.build.name ?? 'the leader'}`;
    case 'protect': return `Protect ${prep.state.units.find((u) => u.spawnId === v.target || u.build.id === v.target)?.build.name ?? 'your ally'}`;
    case 'survive': return `Survive ${v.turns} turns`;
    case 'reach': return 'Reach the marked area';
    case 'escape': return 'Escape across the marked tiles';
  }
}
