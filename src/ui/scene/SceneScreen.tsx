import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Appearance, DialogueLine, Expression, SceneDef, SceneStep, StageStep } from '../../content/schema';
import { createBuild } from '../../engine/factory';
import { DIR_VEC, DIRS, keyPos, posKey, tileAt, TERRAIN_INFO } from '../../engine/grid';
import type { Dir, Pos, UnitBuild } from '../../engine/types';
import { battleMap, character, enemyTemplate, packData, speaker } from '../../game/campaignData';
import { blip, stopVoice, voice } from '../../game/sound';
import { playCueMusic, playCueSfx } from '../../game/storyAudio';
import { Animator } from '../../render/animator';
import { animateBackdrop, type BackdropKind } from '../../render/backdrops';
import { BattleView, type VisualUnit } from '../../render/scene';
import { spriteForBuild } from '../../render/unitSprites';
import { Portrait } from '../common/Portrait';
import { Icon } from '../common/Icon';
import './scene.css';

export interface SceneScreenProps {
  sceneId: string;
  pack?: string;
  /** Overlay mode: dialogue over an existing battlefield (no backdrop, no staging). */
  overlay?: boolean;
  textSpeed?: number;
  hasFlag: (f: string) => boolean;
  setFlag: (f: string, on: boolean) => void;
  onDone: () => void;
}

interface Shown {
  kind: 'line' | 'narration';
  step: DialogueLine | { kind: 'narration'; id: string; text: string };
  name?: string;
  appearance?: Appearance;
  side: 'left' | 'right';
  expression: Expression;
}

export function SceneScreen(props: SceneScreenProps) {
  const pack = props.pack ?? 'main';
  const scene: SceneDef | undefined = packData(pack).pack.scenes[props.sceneId];
  const hostRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [typed, setTyped] = useState(0);
  const [choice, setChoice] = useState<{ prompt?: string; options: { text: string; setFlag?: string; goto?: string }[] } | null>(null);
  const [fade, setFade] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [auto, setAuto] = useState(false);
  const [log, setLog] = useState<{ name?: string; text: string }[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [speakers, setSpeakers] = useState<{ left?: Shown; right?: Shown }>({});
  const backdrop = useRef<BackdropKind>('black');
  const advanceRef = useRef<() => void>(() => {});
  const choiceRef = useRef<(i: number) => void>(() => {});
  const viewRef = useRef<BattleView | null>(null);
  const animRef = useRef<Animator | null>(null);
  const sidesRef = useRef<Map<string, 'left' | 'right'>>(new Map());
  const doneRef = useRef(false);
  const textSpeed = props.textSpeed ?? 45;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopVoice();
    props.onDone();
  };

  // Backdrop (map-less scenes)
  useEffect(() => {
    if (props.overlay || !scene || scene.map || !bgRef.current) return;
    const loc = packData(pack).pack.locations[scene.location];
    backdrop.current = (loc?.backdrop as BackdropKind) ?? 'black';
    return animateBackdrop(bgRef.current, () => backdrop.current, scene.location.length);
  }, [scene?.id]);

  // Map staging
  useEffect(() => {
    if (props.overlay || !scene?.map || !hostRef.current) return;
    const map = battleMap(scene.map, pack);
    const view = new BattleView(hostRef.current, map);
    view.showHpBars = false;
    view.autoZoom();
    viewRef.current = view;
    animRef.current = new Animator(view, {});
    for (const [actorId, a] of Object.entries(scene.actors ?? {})) placeActor(actorId, a.character, a.at, a.dir ?? 's');
    return () => { view.destroy(); viewRef.current = null; };
  }, [scene?.id]);

  function actorBuild(charId: string): UnitBuild | null {
    const c = character(charId, pack);
    if (c) return createBuild({ id: `scene_${charId}`, name: c.name, appearance: c.appearance, job: c.job, level: c.level ?? 1, equipment: c.equipment ?? undefined });
    const e = enemyTemplate(charId, pack);
    if (e) return createBuild({ id: `scene_${charId}`, name: e.name, appearance: e.appearance, job: e.job, level: 3 });
    return null;
  }

  function placeActor(actorId: string, charId: string, at: Pos, dir: Dir): VisualUnit | undefined {
    const view = viewRef.current;
    if (!view) return;
    const b = actorBuild(charId);
    const v: VisualUnit = {
      uid: actorId, gx: at[0], gy: at[1], z: tileAt(view.map, at[0], at[1])?.h ?? 0, lift: 0, facing: dir, anim: 'idle', animStart: performance.now(),
      alpha: 1, hidden: false, team: 'neutral', sprite: b ? spriteForBuild(b) : null, hpFrac: 1, mpFrac: 0, statuses: [], name: b?.name ?? actorId,
      shakeUntil: 0, flashUntil: 0, flashColor: '#fff', crystal: false, charging: false,
    };
    view.units.set(actorId, v);
    return v;
  }

  function pathOnMap(from: Pos, to: Pos): Pos[] {
    const view = viewRef.current!;
    const map = view.map;
    const prev = new Map<number, number>();
    const start = posKey(from);
    const goal = posKey(to);
    const q = [start];
    prev.set(start, -1);
    while (q.length) {
      const k = q.shift()!;
      if (k === goal) break;
      const p = keyPos(k);
      const t0 = tileAt(map, p[0], p[1]);
      for (const d of DIRS) {
        const np: Pos = [p[0] + DIR_VEC[d][0], p[1] + DIR_VEC[d][1]];
        const t = tileAt(map, np[0], np[1]);
        if (!t || !t0 || prev.has(posKey(np))) continue;
        if (Math.abs(t.h - t0.h) > 5 || (!TERRAIN_INFO[t.t].walkable && !TERRAIN_INFO[t.t].water)) continue;
        prev.set(posKey(np), k);
        q.push(posKey(np));
      }
    }
    if (!prev.has(goal)) return [from, to];
    const path: Pos[] = [];
    for (let k = goal; k !== -1; k = prev.get(k)!) path.unshift(keyPos(k));
    return path;
  }

  async function stage(s: StageStep): Promise<void> {
    const view = viewRef.current;
    const anim = animRef.current;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    switch (s.action) {
      case 'music': if (s.value) playCueMusic(s.value); return;
      case 'sfx': if (s.value) playCueSfx(s.value); return;
      case 'fade': {
        const target = s.value === 'out' ? 1 : 0;
        setFade(target);
        await wait(700);
        return;
      }
      case 'flash': setFlash(s.value === 'red' ? '#ff3020' : '#ffffff'); setTimeout(() => setFlash(null), 260); await wait(200); return;
      case 'shake': setShake(true); setTimeout(() => setShake(false), 450); if (view) view.vfx.shake = 0.6; await wait(300); return;
      case 'wait': await wait(s.ms ?? 600); return;
      case 'background': if (s.value) { const loc = packData(pack).pack.locations[s.value]; backdrop.current = (loc?.backdrop as BackdropKind) ?? backdrop.current; } return;
    }
    if (!view || !anim || !s.actor) return;
    let v = view.units.get(s.actor);
    switch (s.action) {
      case 'place':
        if (s.to) {
          if (!v) v = placeActor(s.actor, s.actor, s.to, s.dir ?? 's');
          else { v.gx = s.to[0]; v.gy = s.to[1]; v.z = tileAt(view.map, s.to[0], s.to[1])?.h ?? 0; v.hidden = false; v.alpha = 1; if (s.dir) v.facing = s.dir; }
        }
        return;
      case 'walk':
        if (!v && s.to) v = placeActor(s.actor, s.actor, s.to, s.dir ?? 's');
        if (v && s.to) { await anim.animateMove(s.actor, pathOnMap([Math.round(v.gx), Math.round(v.gy)], s.to), false); if (s.dir) v.facing = s.dir; }
        return;
      case 'face': if (v && s.dir) v.facing = s.dir; return;
      case 'camera': if (s.to) view.focusTile(s.to); else if (v) view.focusTile([v.gx, v.gy]); return;
      case 'exit':
        if (v) { const u = v; await new Promise<void>((r) => { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 500); u.alpha = 1 - k; if (k < 1) requestAnimationFrame(step); else { u.hidden = true; r(); } }; step(); }); }
        return;
      case 'anim':
        if (v) {
          const map: Record<string, VisualUnit['anim']> = { slash: 'attack', thrust: 'attack', spellcast: 'cast', cast: 'cast', hurt: 'hurt', emote: 'kneel', kneel: 'kneel', jump: 'jump', shoot: 'shoot', victory: 'victory' };
          anim.setAnim(v, map[s.value ?? ''] ?? 'idle');
          await wait(700);
          if (s.value !== 'emote' && s.value !== 'kneel' && s.value !== 'hurt') anim.setAnim(v, 'idle');
        }
        return;
      case 'emote': {
        const icon: Record<string, string> = { '!': '!', '?': '?', '...': '…', heart: '♥', anger: '#', sweat: '~' };
        if (v) view.floatText(s.actor, icon[s.value ?? '!'] ?? s.value ?? '!', s.value === 'heart' ? '#ff8fb8' : s.value === 'anger' ? '#ff6a5a' : '#ffffff', 1.5);
        await wait(500);
        return;
      }
    }
  }

  // Step runner
  useEffect(() => {
    if (!scene) { finish(); return; }
    let cancelled = false;
    const labels = new Map<string, number>();
    scene.steps.forEach((s, i) => { if (s.kind === 'label') labels.set(s.name, i); });
    if (scene.music && !props.overlay) playCueMusic(scene.music);
    if (props.overlay || scene.map) setFade(0);
    (async () => {
      let i = 0;
      while (i < scene.steps.length && !cancelled) {
        const s: SceneStep = scene.steps[i];
        i++;
        switch (s.kind) {
          case 'line': case 'narration': {
            await present(s);
            break;
          }
          case 'choice': {
            const pick = await new Promise<number>((resolve) => { choiceRef.current = resolve; setChoice({ prompt: s.prompt, options: s.options }); });
            setChoice(null);
            const opt = s.options[pick];
            if (opt.setFlag) props.setFlag(opt.setFlag, true);
            setLog((l) => [...l, { name: '›', text: opt.text }]);
            if (opt.goto && labels.has(opt.goto)) i = labels.get(opt.goto)!;
            break;
          }
          case 'flag': if (s.set) props.setFlag(s.set, true); if (s.clear) props.setFlag(s.clear, false); break;
          case 'goto': {
            const ok = (!s.ifFlag || props.hasFlag(s.ifFlag)) && (!s.ifNotFlag || !props.hasFlag(s.ifNotFlag));
            if (ok && labels.has(s.label)) i = labels.get(s.label)!;
            break;
          }
          case 'label': break;
          case 'stage': await stage(s); break;
        }
      }
      if (!cancelled) {
        setShown(null);
        if (!props.overlay) { setFade(1); await new Promise((r) => setTimeout(r, 500)); }
        finish();
      }
    })();
    return () => { cancelled = true; };
  }, [scene?.id]);

  function present(s: DialogueLine | { kind: 'narration'; id: string; text: string }): Promise<void> {
    return new Promise((resolve) => {
      let entry: Shown;
      if (s.kind === 'line') {
        const sp = speaker(s.speaker, pack);
        let side = s.side ?? sidesRef.current.get(s.speaker);
        if (!side) {
          const used = new Set(sidesRef.current.values());
          side = !used.has('left') ? 'left' : !used.has('right') ? 'right' : sidesRef.current.size % 2 ? 'right' : 'left';
          // Evict whoever held this side.
          for (const [k, v] of sidesRef.current) if (v === side) sidesRef.current.delete(k);
          sidesRef.current.set(s.speaker, side);
        }
        entry = { kind: 'line', step: s, name: s.name ?? sp.name, appearance: sp.appearance, side, expression: s.expression ?? 'neutral' };
        setSpeakers((cur) => ({ ...cur, [side!]: entry }));
        voice(s.id);
        // Focus camera on a speaking actor when staged.
        const v = viewRef.current?.units.get(s.speaker);
        if (v) viewRef.current!.focusTile([v.gx, v.gy]);
      } else {
        entry = { kind: 'narration', step: s, side: 'left', expression: 'neutral' };
        voice(s.id);
      }
      setShown(entry);
      setTyped(0);
      setLog((l) => [...l, { name: entry.kind === 'line' ? entry.name : undefined, text: s.text }]);
      advanceRef.current = () => { stopVoice(); resolve(); };
    });
  }

  // Typewriter
  useEffect(() => {
    if (!shown) return;
    const text = shown.step.text;
    if (textSpeed <= 0) { setTyped(text.length); return; }
    let n = 0;
    const app = shown.appearance;
    const pitch: 'low' | 'mid' | 'high' = !app ? 'mid' : app.body === 'female' || app.portrait?.age === 'young' ? 'high' : app.portrait?.age === 'old' || app.body === 'muscular' ? 'low' : 'mid';
    const id = setInterval(() => {
      n += 1;
      setTyped(n);
      if (shown.kind === 'line' && n % 3 === 0 && /[a-z]/i.test(text[n] ?? '')) blip(pitch);
      if (n >= text.length) clearInterval(id);
    }, 1000 / textSpeed);
    return () => clearInterval(id);
  }, [shown]);

  // Auto-advance
  useEffect(() => {
    if (!auto || !shown || typed < shown.step.text.length) return;
    const t = setTimeout(() => advanceRef.current(), 900 + shown.step.text.length * 28);
    return () => clearTimeout(t);
  }, [auto, shown, typed]);

  function onTap(): void {
    if (choice || showLog) return;
    if (!shown) return;
    if (typed < shown.step.text.length) { setTyped(shown.step.text.length); return; }
    advanceRef.current();
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onTap(); }
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!scene) return null;
  const line = shown?.kind === 'line' ? (shown.step as DialogueLine) : null;
  const text = shown ? shown.step.text.slice(0, typed) : '';

  return (
    <div class={`screen scene-screen ${props.overlay ? 'overlay' : ''} ${shake ? 'shaking' : ''}`} onClick={onTap}>
      {!props.overlay && !scene.map && <canvas ref={bgRef} class="scene-bg" />}
      {!props.overlay && scene.map && <div ref={hostRef} class="fill" />}
      {!props.overlay && <div class="scene-vignette" />}
      {scene.title && !props.overlay && <div class="scene-title title-font">{scene.title}</div>}

      {/* Talking heads */}
      {shown?.kind === 'line' && (
        <>
          {(['left', 'right'] as const).map((side) => {
            const sp = speakers[side];
            if (!sp?.appearance) return null;
            const active = shown.side === side;
            return (
              <div key={side} class={`talk-head ${side} ${active ? 'active' : 'idle'}`}>
                <Portrait appearance={sp.appearance} size={192} expression={active ? shown.expression : sp.expression} flip={side === 'right'} />
              </div>
            );
          })}
        </>
      )}

      {shown?.kind === 'line' && line && (
        <div class={`dialogue panel ${shown.side} style-${line.style ?? 'normal'} pop-in`} key={line.id}>
          <div class="nameplate title-font">{shown.name}</div>
          <div class="dialogue-text">{line.style === 'thought' ? `(${text})` : text}<span class="caret">{typed >= shown.step.text.length ? '▾' : ''}</span></div>
        </div>
      )}

      {shown?.kind === 'narration' && (
        <div class="narration fade-in" key={shown.step.id}>
          <p>{text}</p>
        </div>
      )}

      {choice && (
        <div class="choice-box panel pop-in" onClick={(e) => e.stopPropagation()}>
          {choice.prompt && <div class="panel-title">{choice.prompt}</div>}
          <div class="menu">
            {choice.options.map((o, i) => <button class="menu-item" onClick={() => choiceRef.current(i)}><span>{o.text}</span></button>)}
          </div>
        </div>
      )}

      <div class="scene-controls" onClick={(e) => e.stopPropagation()}>
        <button class={`btn small ${auto ? 'primary' : ''}`} onClick={() => setAuto((a) => !a)} title="Auto-advance"><Icon name="speed" size={16} /></button>
        <button class="btn small" onClick={() => setShowLog(true)} title="Log"><Icon name="chat" size={16} /></button>
        <button class="btn small" onClick={finish} title="Skip scene">Skip</button>
      </div>

      {showLog && (
        <div class="modal-backdrop" onClick={(e) => { e.stopPropagation(); setShowLog(false); }}>
          <div class="panel log-panel pop-in" onClick={(e) => e.stopPropagation()}>
            <div class="panel-title">Log</div>
            <div class="scroll log-body">{log.map((l) => <p>{l.name && <b class="gold-text">{l.name}: </b>}{l.text}</p>)}</div>
            <button class="btn" onClick={() => setShowLog(false)}>Close</button>
          </div>
        </div>
      )}

      <div class="scene-fade" style={{ opacity: fade }} />
      {flash && <div class="scene-flash" style={{ background: flash }} />}
    </div>
  );
}

export function useSceneExists(id: string, pack = 'main'): boolean {
  return useMemo(() => !!packData(pack).pack.scenes[id], [id, pack]);
}
