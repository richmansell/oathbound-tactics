import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ABILITIES } from '../../content/abilities';
import { ITEMS } from '../../content/items';
import { JOBS } from '../../content/jobs';
import { STATUSES } from '../../content/statuses';
import { canUseAbility, mpCost, turnOrder } from '../../engine/battle';
import { previewAbility, type PreviewTarget } from '../../engine/combat';
import { DIRS, posKey, samePos, tileAt, TERRAIN_INFO } from '../../engine/grid';
import { isAlive, pathTo, reachable, unitAt } from '../../engine/movement';
import { jobLevel } from '../../engine/progression';
import { aoeTiles, validTargets } from '../../engine/targeting';
import { availableActions, deriveStats, statusActive } from '../../engine/units';
import type { BattleState, BattleUnit, Dir, Pos } from '../../engine/types';
import { BattleSession, type RemoteLink } from '../../game/battleSession';
import { BattleView, type HighlightKind } from '../../render/scene';
import { rotateDir, unrotateDir } from '../../render/iso';
import type { AnimatorHooks } from '../../render/animator';
import { spriteForBuild } from '../../render/unitSprites';
import { availableOaths, OATH_BY_ID } from '../../content/oaths';
import { sfx } from '../../game/sound';
import { Portrait } from '../common/Portrait';
import { Icon } from '../common/Icon';
import './battle.css';

type Mode =
  | { k: 'none' }
  | { k: 'menu' }
  | { k: 'move'; target?: Pos }
  | { k: 'skills'; jobId: string }
  | { k: 'target'; ability: string; target?: Pos }
  | { k: 'facing' }
  | { k: 'deploy'; selected?: string; placed: Record<string, Pos>; oaths?: Record<string, string> }
  | { k: 'inspect' };

export interface BattleScreenProps {
  initial: BattleState;
  deployTiles?: Pos[];
  hooks?: AnimatorHooks;
  title?: string;
  objective?: string;
  onEnd: (result: 'victory' | 'defeat', state: BattleState) => void;
  /** Allow retreating (skirmishes). */
  canRetreat?: boolean;
  onRetreat?: () => void;
  /** Story flags (Oaths unlock with 'oaths_unlocked'). */
  flags?: string[];
  /** Online: our seat and the server link. */
  me?: number;
  remote?: RemoteLink;
  onSession?: (s: BattleSession) => void;
  /** Shown on the victory screen. */
  rewards?: { gil?: number; items?: string[] };
  /** Maximum units to deploy (default 5). */
  maxDeploy?: number;
}

export function BattleScreen(props: BattleScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [, force] = useState(0);
  const [mode, setMode] = useState<Mode>(props.initial.phase === 'deploy' ? { k: 'deploy', placed: {} } : { k: 'none' });
  const [hover, setHover] = useState<Pos | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speed, setSpeedState] = useState(() => { try { return Number(localStorage.getItem('oathbound.battleSpeed')) || 1; } catch { return 1; } });
  const setSpeed = (v: number) => { setSpeedState(v); try { localStorage.setItem('oathbound.battleSpeed', String(v)); } catch { /* optional */ } };
  const [banner, setBanner] = useState<string | null>(props.title ?? null);
  const [result, setResult] = useState<{ result: 'victory' | 'defeat'; state: BattleState } | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Canvas listeners are bound once per session; they call through these refs
  // so taps and keys always see the current render's state (reach, targets…).
  const tapRef = useRef<(tile: Pos) => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});

  // ---- mount view + session
  useEffect(() => {
    const host = hostRef.current!;
    const view = new BattleView(host, props.initial.map);
    view.autoZoom();
    const hooks: AnimatorHooks = { spriteFor: (u) => spriteForBuild(u.build, u.lostEquip), sfx: (id) => sfx(id), ...props.hooks };
    const s = new BattleSession(props.initial, view, hooks);
    if (props.remote) { s.remote = props.remote; if (props.me === 1) view.cam.rot = 2; }
    props.onSession?.(s);
    s.onEnd = (r, st) => { if (!props.remote) setResult({ result: r, state: st }); };
    s.subscribe(() => force((n) => n + 1));
    setSession(s);
    if (import.meta.env.DEV) (window as unknown as { __session: BattleSession }).__session = s;
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    const t = setTimeout(() => setBanner(null), 2200);
    if (props.initial.phase !== 'deploy') s.begin();
    else {
      // Pre-place units on deploy tiles for convenience.
      const placed: Record<string, Pos> = {};
      const humans = props.initial.units.filter((u) => (props.me !== undefined ? u.owner === props.me : u.team === 'player') && u.pos[0] < 0);
      const cap = props.maxDeploy ?? 5;
      humans.sort((a, b) => Number(!!b.build.essential) - Number(!!a.build.essential));
      (props.deployTiles ?? []).slice(0, Math.min(humans.length, cap)).forEach((p, i) => { placed[humans[i].uid] = p; });
      setMode({ k: 'deploy', placed });
    }
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); s.destroy(); view.destroy(); };
  }, []);

  const state = session?.state ?? props.initial;
  const active = session?.active;
  const humanTurn = session?.phase === 'human' && !!active;

  // When a human turn starts, open the command menu.
  useEffect(() => {
    if (humanTurn && mode.k === 'none') setMode({ k: 'menu' });
    if (!humanTurn && mode.k !== 'deploy' && mode.k !== 'none' && mode.k !== 'inspect') setMode({ k: 'none' });
  }, [humanTurn, state.turn?.unit, state.turn?.moved, state.turn?.acted]);

  useEffect(() => { if (session) session.animator.speed = speed; }, [speed, session]);

  // ---- derived highlight sets
  const reach = useMemo(() => (session && active && mode.k === 'move' ? reachable(state, active) : null), [session, state, active?.uid, mode.k]);
  const targets = useMemo(() => (session && active && mode.k === 'target' ? validTargets(state, active, mode.ability) : []), [session, state, active?.uid, mode.k === 'target' ? mode.ability : '']);
  const aimTile = mode.k === 'target' ? mode.target ?? null : null;
  const preview: PreviewTarget[] = useMemo(() => {
    if (!session || !active || mode.k !== 'target' || !mode.target) return [];
    return previewAbility(state, active.uid, mode.ability, mode.target);
  }, [session, state, active?.uid, mode.k === 'target' ? `${mode.ability}|${mode.target}` : '']);

  // Push highlights into the view.
  useEffect(() => {
    if (!session) return;
    const view = session.view;
    view.highlights.clear();
    view.targetUids.clear();
    const set = (p: Pos, k: HighlightKind) => view.highlights.set(posKey(p), k);
    if (mode.k === 'move' && reach) {
      for (const p of reach.dests) set(p, 'move');
      if (mode.target) { const path = pathTo(reach, mode.target); path?.forEach((p) => set(p, 'path')); }
    }
    if (mode.k === 'target' && active) {
      for (const p of targets) set(p, 'attack');
      if (mode.target) {
        for (const p of aoeTiles(state, active, mode.ability, mode.target)) set(p, 'aoe');
        for (const pt of preview) view.targetUids.add(pt.uid);
      }
    }
    if (mode.k === 'deploy') {
      for (const p of props.deployTiles ?? []) set(p, 'deploy');
    }
    view.cursor = mode.k === 'move' ? mode.target ?? hover : mode.k === 'target' ? mode.target ?? hover : hover;
  }, [session, mode, reach, targets, preview, hover]);

  // Deploy: show placed units visually.
  useEffect(() => {
    if (!session || mode.k !== 'deploy') return;
    for (const u of state.units) {
      if (u.team !== 'player') continue;
      const v = session.view.units.get(u.uid);
      if (!v) continue;
      const p = mode.placed[u.uid];
      if (p) { v.hidden = false; v.gx = p[0]; v.gy = p[1]; v.z = tileAt(state.map, p[0], p[1])?.h ?? 0; v.facing = 'n'; }
      else if (u.pos[0] < 0) v.hidden = true;
    }
  }, [session, mode]);

  // ---- input: tap / drag / pinch / wheel / keys
  useEffect(() => {
    if (!session) return;
    const el = session.view.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; t: number } | null = null;
    let dragged = false;
    let pinchDist = 0;
    const rel = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, rel(e));
      if (pointers.size === 1) { downAt = { ...rel(e), t: performance.now() }; dragged = false; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const onMove = (e: PointerEvent) => {
      const p = rel(e);
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') setHover(session.view.pick(p.x, p.y));
        return;
      }
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist && Math.abs(d - pinchDist) > 40) {
          session.view.setZoom(session.view.cam.zoom + (d > pinchDist ? 0.5 : -0.5));
          pinchDist = d;
        }
        dragged = true;
        return;
      }
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 8) dragged = true;
      if (dragged) session.view.panBy(p.x - prev.x, p.y - prev.y);
    };
    const onUp = (e: PointerEvent) => {
      const p = rel(e);
      pointers.delete(e.pointerId);
      if (!dragged && downAt && pointers.size === 0) {
        const tile = session.view.pick(p.x, p.y);
        if (tile) tapRef.current(tile);
      }
      if (pointers.size === 0) downAt = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      session.view.setZoom(session.view.cam.zoom + (e.deltaY < 0 ? 0.5 : -0.5));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') session.view.rotateBy(-1);
      if (e.key === 'e' || e.key === 'E') session.view.rotateBy(1);
      if (e.key === 'Escape' || e.key === 'Backspace') cancelRef.current();
      if (e.key === '+' || e.key === '=') session.view.setZoom(session.view.cam.zoom + 0.5);
      if (e.key === '-') session.view.setZoom(session.view.cam.zoom - 0.5);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', onKey);
    };
  }, [session]);

  function cancel(): void {
    const m = modeRef.current;
    if (m.k === 'move' || m.k === 'skills' || m.k === 'facing') setMode({ k: 'menu' });
    else if (m.k === 'target') setMode(ABILITIES[m.ability].id === 'attack' ? { k: 'menu' } : { k: 'skills', jobId: skillsetOf(m.ability) });
    else if (m.k === 'inspect') setMode(humanTurn ? { k: 'menu' } : { k: 'none' });
  }

  function skillsetOf(ability: string): string {
    if (!active) return '';
    const sets = availableActions(active.build);
    return sets.find((s) => s.abilities.includes(ability))?.jobId ?? active.build.job;
  }

  async function onTileTap(tile: Pos): Promise<void> {
    if (!session) return;
    const m = modeRef.current;
    setHover(tile);
    const s = session.state;
    const a = session.active;
    if (m.k === 'deploy') {
      const occupantUid = Object.entries(m.placed).find(([, p]) => samePos(p, tile))?.[0];
      const valid = (props.deployTiles ?? []).some((p) => samePos(p, tile));
      if (m.selected && valid) {
        const placed = { ...m.placed };
        if (!placed[m.selected] && !occupantUid && Object.keys(placed).length >= (props.maxDeploy ?? 5)) return;
        if (occupantUid && occupantUid !== m.selected) { const prev = placed[m.selected]; if (prev) placed[occupantUid] = prev; else delete placed[occupantUid]; }
        placed[m.selected] = tile;
        setMode({ k: 'deploy', placed });
      } else if (occupantUid) {
        setMode({ ...m, selected: occupantUid });
      }
      return;
    }
    if (m.k === 'move' && a && reach) {
      const ok = reach.dests.some((p) => samePos(p, tile));
      if (!ok) { if (!samePos(tile, a.pos)) return; }
      if (m.target && samePos(m.target, tile)) {
        if (samePos(tile, a.pos)) { setMode({ k: 'menu' }); return; }
        setMode({ k: 'none' });
        await session.command({ type: 'move', unit: a.uid, to: tile });
        return;
      }
      // No camera pan here: the confirming second tap must land on the same tile.
      setMode({ k: 'move', target: tile });
      return;
    }
    if (m.k === 'target' && a) {
      const ok = validTargets(s, a, m.ability).some((p) => samePos(p, tile));
      if (!ok) return;
      if (m.target && samePos(m.target, tile)) { await confirmAct(); return; }
      setMode({ k: 'target', ability: m.ability, target: tile });
      return;
    }
    if (m.k === 'facing' && a) {
      // Tap a tile to face toward it.
      const d = facingToward(a.pos, tile);
      if (d) await doWait(d);
      return;
    }
    // Inspect any unit by tapping it.
    setMode((cur) => (cur.k === 'menu' || cur.k === 'none' || cur.k === 'inspect' ? { k: 'inspect' } : cur));
  }

  tapRef.current = (tile) => void onTileTap(tile);
  cancelRef.current = cancel;

  async function confirmAct(): Promise<void> {
    const m = modeRef.current;
    if (!session || !active || m.k !== 'target' || !m.target) return;
    setMode({ k: 'none' });
    const err = await session.command({ type: 'act', unit: active.uid, ability: m.ability, target: m.target });
    if (err) console.warn(err);
  }

  async function doWait(d: Dir): Promise<void> {
    if (!session || !active) return;
    setMode({ k: 'none' });
    await session.command({ type: 'wait', unit: active.uid, facing: d });
  }

  async function startDeploy(): Promise<void> {
    if (!session || mode.k !== 'deploy') return;
    const placements = Object.entries(mode.placed).map(([uid, pos]) => ({ uid, pos, facing: deployFacing(state, pos), oath: mode.oaths?.[uid] }));
    if (!placements.length) return;
    setMode({ k: 'none' });
    const err = await session.deploy({ type: 'deploy', placements });
    if (err) { console.warn('deploy failed:', err); setMode({ k: 'deploy', placed: mode.placed }); }
  }

  // ---- render
  const inspectUnit = hover ? unitAt(state, hover) : undefined;
  const shownUnit = mode.k === 'deploy' ? state.units.find((u) => u.uid === (mode as { selected?: string }).selected) : inspectUnit && (mode.k === 'inspect' || mode.k === 'target' || mode.k === 'move' || !humanTurn) ? inspectUnit : active;
  const order = useMemo(() => (session && state.phase === 'battle' ? turnOrder(state, 10) : []), [session, state]);
  const hoveredTile = hover ? tileAt(state.map, hover[0], hover[1]) : undefined;

  return (
    <div class="screen battle-screen">
      <div ref={hostRef} class="fill battle-host" />

      {banner && <div class="battle-banner pop-in"><div class="title-font">{banner}</div>{props.objective && <div class="objective">{props.objective}</div>}</div>}

      {/* Top bar: turn order + controls */}
      <div class="battle-top">
        <div class="turn-order panel">
          {order.map((o, i) => {
            const u = state.units.find((x) => x.uid === o.uid);
            if (!u) return null;
            return (
              <div key={i} class={`to-chip ${u.team} ${o.kind === 'pending' ? 'pending' : ''} ${i === 0 ? 'now' : ''}`} title={o.kind === 'pending' ? `${u.build.name}: ${ABILITIES[o.ability!]?.name}` : u.build.name}>
                <Portrait build={u.build} size={34} expression={statusActive(u, 'critical') ? 'hurt' : 'neutral'} />
                {o.kind === 'pending' && <span class="to-spell">✦</span>}
              </div>
            );
          })}
        </div>
        <div class="spacer" />
        <div class="cam-controls">
          <button class="btn small" title="Rotate left (Q)" onClick={() => session?.view.rotateBy(-1)}><Icon name="rotl" /></button>
          <button class="btn small" title="Rotate right (E)" onClick={() => session?.view.rotateBy(1)}><Icon name="rotr" /></button>
          <button class="btn small" title="Zoom out" onClick={() => session?.view.setZoom(session.view.cam.zoom - 0.5)}><Icon name="minus" /></button>
          <button class="btn small" title="Zoom in" onClick={() => session?.view.setZoom(session.view.cam.zoom + 0.5)}><Icon name="plus" /></button>
          <button class="btn small" title="Menu" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
        </div>
      </div>

      {/* Unit info (bottom-left) */}
      {shownUnit && <UnitCard unit={shownUnit} state={state} active={shownUnit.uid === active?.uid} />}

      {/* Tile info */}
      {hoveredTile && mode.k !== 'deploy' && (
        <div class="tile-info panel num">
          {TERRAIN_INFO[hoveredTile.t].label} · H{hoveredTile.h}{hoveredTile.prop ? ` · ${hoveredTile.prop}` : ''}
        </div>
      )}

      {/* Command menus (bottom-right) */}
      {humanTurn && active && mode.k === 'menu' && (
        <CommandMenu state={state} unit={active}
          onMove={() => setMode({ k: 'move' })}
          onAttack={() => setMode({ k: 'target', ability: 'attack' })}
          onSkills={(jobId) => setMode({ k: 'skills', jobId })}
          onWait={() => setMode({ k: 'facing' })}
          onUndo={() => session?.command({ type: 'undoMove', unit: active.uid })}
          onInspect={() => setMode({ k: 'inspect' })}
        />
      )}
      {humanTurn && active && mode.k === 'skills' && (
        <SkillMenu state={state} unit={active} jobId={mode.jobId} onPick={(ab) => setMode({ k: 'target', ability: ab })} onBack={() => setMode({ k: 'menu' })} />
      )}
      {humanTurn && active && mode.k === 'move' && (
        <div class="action-hint panel fade-in">
          <div>{mode.target ? 'Tap again to move here' : 'Choose where to move'}</div>
          <div class="row">
            {mode.target && <button class="btn primary small" onClick={() => onTileTap(mode.target!)}>Move</button>}
            <button class="btn small" onClick={cancel}>Back</button>
          </div>
        </div>
      )}
      {humanTurn && active && mode.k === 'target' && (
        <TargetPanel state={state} unit={active} ability={mode.ability} target={aimTile} preview={preview} onConfirm={confirmAct} onBack={cancel} />
      )}
      {humanTurn && active && mode.k === 'facing' && (
        <FacingPicker view={session!.view} unit={active} onPick={doWait} onBack={cancel} />
      )}
      {mode.k === 'inspect' && (
        <div class="action-hint panel fade-in"><div>Inspecting — tap units to view them</div><button class="btn small" onClick={cancel}>Done</button></div>
      )}

      {mode.k === 'deploy' && (
        <DeployPanel me={props.me} state={state} placed={mode.placed} selected={mode.selected} max={Math.min(props.maxDeploy ?? 5, props.deployTiles?.length ?? 5)}
          flags={props.flags} oaths={mode.oaths ?? {}} onOath={(uid, oath) => setMode({ ...mode, oaths: { ...(mode.oaths ?? {}), [uid]: oath ?? '' } })}
          onSelect={(uid) => setMode({ ...mode, selected: uid })}
          onRemove={(uid) => { const placed = { ...mode.placed }; delete placed[uid]; setMode({ ...mode, placed }); }}
          onStart={startDeploy} objective={props.objective} />
      )}

      {session?.phase === 'ai' && <div class="ai-indicator num">Enemy turn…</div>}
      {session?.phase === 'remote' && <div class="ai-indicator num">{state.phase === 'deploy' ? 'Waiting for opponent to deploy…' : 'Opponent\'s turn…'}</div>}

      {menuOpen && (
        <div class="modal-backdrop" onClick={() => setMenuOpen(false)}>
          <div class="panel modal pop-in" onClick={(e) => e.stopPropagation()}>
            <div class="panel-title">Battle</div>
            <div class="menu">
              <div class="menu-item"><span>Battle speed</span>
                <span class="row">{[1, 1.5, 2, 3].map((s) => <button class={`btn small ${speed === s ? 'primary' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>)}</span>
              </div>
              <div class="menu-item"><span>HP bars</span><button class="btn small" onClick={() => { if (session) session.view.showHpBars = !session.view.showHpBars; force((n) => n + 1); }}>{session?.view.showHpBars ? 'On' : 'Off'}</button></div>
              <div class="menu-item"><span>Auto-battle</span><button class="btn small" onClick={() => { if (session) { session.auto = !session.auto; force((n) => n + 1); } }}>{session?.auto ? 'On' : 'Off'}</button></div>
              {props.objective && <div class="menu-item"><span class="label">Objective</span><span>{props.objective}</span></div>}
              {props.canRetreat && <button class="menu-item" onClick={() => { setMenuOpen(false); props.onRetreat?.(); }}><span>Retreat</span><span class="meta">Leave the battle</span></button>}
              <button class="menu-item" onClick={() => setMenuOpen(false)}><span>Resume</span></button>
            </div>
          </div>
        </div>
      )}

      {result && <ResultOverlay result={result.result} state={result.state} rewards={props.rewards} onContinue={() => props.onEnd(result.result, result.state)} />}
    </div>
  );
}

function deployFacing(state: BattleState, pos: Pos): Dir {
  const foes = state.units.filter((u) => u.team === 'enemy' && !u.hidden && u.pos[0] >= 0);
  if (!foes.length) return 'n';
  const cx = foes.reduce((a, u) => a + u.pos[0], 0) / foes.length;
  const cy = foes.reduce((a, u) => a + u.pos[1], 0) / foes.length;
  const dx = cx - pos[0], dy = cy - pos[1];
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

function facingToward(from: Pos, to: Pos): Dir | null {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

// ---------------------------------------------------------------------------

function UnitCard({ unit, state, active }: { unit: BattleUnit; state: BattleState; active: boolean }) {
  const st = deriveStats(unit.build, unit);
  const job = JOBS[unit.build.job];
  const ko = statusActive(unit, 'ko');
  const statuses = unit.statuses.filter((s) => !['critical', 'charging'].includes(s.id));
  const ct = Math.min(100, unit.ct);
  return (
    <div class={`unit-card panel ${unit.team}`}>
      <div class="row">
        <div class="uc-portrait"><Portrait build={unit.build} size={64} expression={ko ? 'hurt' : statusActive(unit, 'critical') ? 'hurt' : active ? 'determined' : 'neutral'} /></div>
        <div class="col" style={{ gap: '2px', flex: 1, minWidth: 0 }}>
          <div class="row" style={{ gap: '6px' }}>
            <span class="uc-name title-font">{unit.build.name}</span>
            {active && <span class="uc-tag">ACTIVE</span>}
          </div>
          <div class="uc-sub">{job?.name ?? unit.build.job} · Lv <span class="num">{unit.build.level}</span> · <span class="muted">JLv {jobLevel(unit.build, unit.build.job)}</span></div>
          <StatBar label="HP" cls="hp" v={unit.hp} max={st.maxHp} />
          <StatBar label="MP" cls="mp" v={unit.mp} max={st.maxMp} />
          <StatBar label="CT" cls="ct" v={ct} max={100} />
        </div>
      </div>
      <div class="uc-stats num">
        <span>Mv {st.move}</span><span>Jp {st.jump}</span><span>Sp {st.sp}</span><span>PA {st.pa}</span><span>MA {st.ma}</span><span>Br {st.brave}</span><span>Fa {st.faith}</span>
      </div>
      {statuses.length > 0 && (
        <div class="uc-statuses">{statuses.map((s) => <span class="status-chip" style={{ borderColor: STATUSES[s.id].color, color: STATUSES[s.id].color }}>{STATUSES[s.id].name}{s.count !== undefined ? ` ${s.count}` : ''}</span>)}</div>
      )}
      {state.pending.filter((p) => p.unit === unit.uid).map((p) => <div class="uc-charging">Charging {ABILITIES[p.ability].name}…</div>)}
      {unit.oath && <div class={`uc-oath ${unit.oath.state}`}>✦ {OATH_BY_ID[unit.oath.id]?.name}{unit.oath.state === 'broken' ? ' (broken)' : unit.oath.state === 'kept' ? ' (kept)' : ''}</div>}
    </div>
  );
}

function StatBar({ label, cls, v, max }: { label: string; cls: string; v: number; max: number }) {
  return (
    <div class="statbar">
      <span class="label">{label}</span>
      <div class={`bar ${cls}`} style={{ flex: 1 }}><i style={{ width: `${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%` }} /></div>
      <span class="num sb-val">{Math.max(0, Math.floor(v))}<span class="muted">/{max}</span></span>
    </div>
  );
}

function CommandMenu(p: { state: BattleState; unit: BattleUnit; onMove: () => void; onAttack: () => void; onSkills: (job: string) => void; onWait: () => void; onUndo: () => void; onInspect: () => void }) {
  const t = p.state.turn!;
  const sets = availableActions(p.unit.build);
  const canMove = !t.moved && !statusActive(p.unit, 'immobilize');
  const canAct = !t.acted && !statusActive(p.unit, 'disable');
  return (
    <div class="command-menu panel pop-in">
      <div class="panel-title">{p.unit.build.name}</div>
      <div class="menu">
        <button class={`menu-item ${canMove ? '' : 'disabled'}`} disabled={!canMove} onClick={p.onMove}><span>Move</span><span class="meta">{t.moved ? 'done' : ''}</span></button>
        {t.moved && !t.acted && t.canUndoMove && <button class="menu-item" onClick={p.onUndo}><span>Undo Move</span></button>}
        <button class={`menu-item ${canAct ? '' : 'disabled'}`} disabled={!canAct} onClick={p.onAttack}><span>Attack</span></button>
        {sets.map((s) => (
          <button class={`menu-item ${canAct && s.abilities.length ? '' : 'disabled'}`} disabled={!canAct || !s.abilities.length} onClick={() => p.onSkills(s.jobId)}>
            <span>{s.skillset}</span><span class="meta">{s.abilities.length}</span>
          </button>
        ))}
        <button class="menu-item" onClick={p.onWait}><span>Wait</span><span class="meta">end turn</span></button>
        <button class="menu-item" onClick={p.onInspect}><span>Inspect</span></button>
      </div>
    </div>
  );
}

function SkillMenu({ state, unit, jobId, onPick, onBack }: { state: BattleState; unit: BattleUnit; jobId: string; onPick: (a: string) => void; onBack: () => void }) {
  const set = availableActions(unit.build).find((s) => s.jobId === jobId);
  const [info, setInfo] = useState<string | null>(null);
  if (!set) return null;
  return (
    <div class="command-menu skill-menu panel pop-in">
      <div class="panel-title row"><span>{set.skillset}</span><span class="spacer" /><button class="btn small ghost" onClick={onBack}>Back</button></div>
      <div class="menu scroll" style={{ maxHeight: '46vh' }}>
        {set.abilities.map((id) => {
          const ab = ABILITIES[id];
          const err = canUseAbility(state, unit, id);
          const mp = mpCost(unit, id);
          const stock = ab.consumes ? state.inventory[unit.team === 'ally' ? 'player' : unit.team]?.[ab.consumes] ?? 0 : null;
          const hasTargets = !err && validTargets(state, unit, id).length > 0;
          return (
            <button class={`menu-item ${err || !hasTargets ? 'disabled' : ''}`} disabled={!!err || !hasTargets} onClick={() => onPick(id)} onPointerEnter={() => setInfo(id)}>
              <span>{ab.name}</span>
              <span class="meta">
                {mp ? <span style={{ color: 'var(--mp)' }}>{mp} MP </span> : null}
                {ab.speed ? <span>CT{ab.speed} </span> : null}
                {stock !== null ? <span>×{stock}</span> : null}
                {err && !stock ? <span> {err}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {info && <div class="skill-desc">{ABILITIES[info].description}</div>}
    </div>
  );
}

function TargetPanel({ state, unit, ability, target, preview, onConfirm, onBack }: { state: BattleState; unit: BattleUnit; ability: string; target: Pos | null; preview: PreviewTarget[]; onConfirm: () => void; onBack: () => void }) {
  const ab = ABILITIES[ability];
  return (
    <div class="target-panel panel pop-in">
      <div class="panel-title row"><span>{ab.name}</span><span class="spacer" />{ab.speed ? <span class="num muted">Charge {Math.ceil(100 / ab.speed)}t</span> : null}</div>
      <div class="tp-body">
        {!target && <div class="muted">{ab.description}<br />Choose a target.</div>}
        {target && preview.length === 0 && <div class="muted">No one in the area.</div>}
        {preview.map((pt) => {
          const u = state.units.find((x) => x.uid === pt.uid)!;
          const st = deriveStats(u.build, u);
          return (
            <div class="tp-row">
              <Portrait build={u.build} size={32} />
              <div class="col" style={{ gap: '1px', flex: 1, minWidth: 0 }}>
                <div class="row" style={{ gap: '6px' }}><span class={`tp-name ${u.team}`}>{u.build.name}</span><span class="num muted">{pt.side !== 'front' ? pt.side.toUpperCase() : ''}</span></div>
                <div class="tp-effects num">
                  {pt.effects.map((e) => (
                    <span class={`tp-eff ${e.kind}`}>
                      {e.kind === 'damage' && `${e.min === e.max ? e.min : `${e.min}–${e.max}`}${e.mp ? ' MP' : ''} dmg${e.weak ? ' (weak)' : ''}${e.immune ? ' (immune)' : ''}`}
                      {e.kind === 'heal' && `+${e.min === e.max ? e.min : `${e.min}–${e.max}`}${e.mp ? ' MP' : ' HP'}`}
                      {e.kind === 'status' && `${STATUSES[e.status!]?.name}${e.chance !== 100 ? ` ${e.chance}%` : ''}${e.immune ? ' (immune)' : ''}`}
                      {e.kind !== 'damage' && e.kind !== 'heal' && e.kind !== 'status' && e.label}
                    </span>
                  ))}
                </div>
                <div class="bar hp" style={{ height: '5px' }}><i style={{ width: `${(Math.max(0, pt.hpAfter) / st.maxHp) * 100}%` }} /></div>
              </div>
              <div class="tp-hit num">{pt.hit}%</div>
            </div>
          );
        })}
      </div>
      <div class="row tp-actions">
        <button class="btn" onClick={onBack}>Back</button>
        <button class="btn primary" disabled={!target} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}

function FacingPicker({ view, unit, onPick, onBack }: { view: BattleView; unit: BattleUnit; onPick: (d: Dir) => void; onBack: () => void }) {
  // Screen-relative arrows: n (up-right), e (down-right), s (down-left), w (up-left).
  const arrows: { sd: Dir; label: string; cls: string }[] = [
    { sd: 'w', label: '↖', cls: 'nw' }, { sd: 'n', label: '↗', cls: 'ne' }, { sd: 's', label: '↙', cls: 'sw' }, { sd: 'e', label: '↘', cls: 'se' },
  ];
  return (
    <div class="facing-picker panel pop-in">
      <div class="panel-title">Choose facing</div>
      <div class="fp-grid">
        {arrows.map((a) => {
          const world = unrotateDir(a.sd, view.cam.rot);
          const current = rotateDir(unit.facing, view.cam.rot) === a.sd;
          return <button class={`btn fp-btn ${a.cls} ${current ? 'primary' : ''}`} onClick={() => onPick(world)}>{a.label}</button>;
        })}
      </div>
      <div class="row" style={{ justifyContent: 'center', padding: '6px' }}>
        <button class="btn small" onClick={() => onPick(unit.facing)}>Keep</button>
        <button class="btn small" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function DeployPanel({ me, state, placed, selected, max, onSelect, onRemove, onStart, objective, flags, oaths, onOath }: { me?: number; state: BattleState; placed: Record<string, Pos>; selected?: string; max: number; onSelect: (uid: string) => void; onRemove: (uid: string) => void; onStart: () => void; objective?: string; flags?: string[]; oaths: Record<string, string>; onOath: (uid: string, oath: string | null) => void }) {
  const party = state.units.filter((u) => (me !== undefined ? u.owner === me : u.team === 'player' && u.control === 'human'));
  const count = Object.keys(placed).length;
  const oathsOn = !!flags?.includes('oaths_unlocked');
  const selUnit = party.find((u) => u.uid === selected);
  return (
    <div class="deploy-panel panel pop-in">
      <div class="panel-title row"><span>Formation</span><span class="spacer" /><span class="num">{count}/{max}</span></div>
      {objective && <div class="deploy-obj">{objective}</div>}
      <div class="deploy-list scroll">
        {party.map((u) => (
          <div class={`deploy-unit ${selected === u.uid ? 'sel' : ''} ${placed[u.uid] ? 'placed' : ''}`} onClick={() => onSelect(u.uid)}>
            <Portrait build={u.build} size={36} />
            <div class="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
              <span class="title-font">{u.build.name}</span>
              <span class="muted" style={{ fontSize: '12px' }}>{JOBS[u.build.job]?.name} · Lv {u.build.level}{u.build.essential ? ' · Required' : ''}</span>
            </div>
            {oaths[u.uid] && <span class="oath-badge" title={OATH_BY_ID[oaths[u.uid]]?.name}>✦</span>}
            {placed[u.uid] && !u.build.essential && <button class="btn small ghost" onClick={(e) => { e.stopPropagation(); onRemove(u.uid); }}>✕</button>}
          </div>
        ))}
      </div>
      {oathsOn && selUnit && placed[selUnit.uid] && (
        <div class="oath-picker">
          <div class="label">Swear an Oath — {selUnit.build.name}</div>
          <div class="loadout-options">
            <button class={`chip ${!oaths[selUnit.uid] ? 'sel' : ''}`} onClick={() => onOath(selUnit.uid, null)}>None</button>
            {availableOaths(selUnit.build.character, flags ?? []).map((o) => <button class={`chip ${oaths[selUnit.uid] === o.id ? 'sel' : ''}`} title={`${o.vow}\nBoon: ${o.boon}\nForfeit: ${o.forfeit}`} onClick={() => onOath(selUnit.uid, o.id)}>{o.name.replace('Oath of the ', '').replace('Oath of ', '')}</button>)}
          </div>
          {oaths[selUnit.uid] && OATH_BY_ID[oaths[selUnit.uid]] && (
            <div class="oath-text"><i>“{OATH_BY_ID[oaths[selUnit.uid]].vow}”</i><br /><span style={{ color: 'var(--good)' }}>Boon: {OATH_BY_ID[oaths[selUnit.uid]].boon}</span><br /><span style={{ color: '#ff9a8a' }}>Forfeit: {OATH_BY_ID[oaths[selUnit.uid]].forfeit}</span></div>
          )}
        </div>
      )}
      <div class="muted" style={{ padding: '4px 12px', fontSize: '13px' }}>Select a unit, then tap a green tile.</div>
      <div class="row" style={{ padding: '8px' }}><button class="btn primary" style={{ flex: 1 }} disabled={!count} onClick={onStart}>Begin Battle</button></div>
    </div>
  );
}

function ResultOverlay({ result, state, rewards, onContinue }: { result: 'victory' | 'defeat'; state: BattleState; rewards?: { gil?: number; items?: string[] }; onContinue: () => void }) {
  const party = state.units.filter((u) => u.team === 'player' && u.pos[0] >= 0);
  return (
    <div class="result-overlay fade-in">
      <div class={`result-title title-font ${result}`}>{result === 'victory' ? 'Victory' : 'Defeat'}</div>
      <div class="panel result-panel pop-in">
        {party.map((u) => (
          <div class="result-row">
            <Portrait build={u.build} size={40} expression={result === 'victory' ? 'happy' : 'sad'} />
            <div class="col" style={{ gap: 0, flex: 1 }}>
              <span class="title-font">{u.build.name}</span>
              <span class="muted num" style={{ fontSize: '12px' }}>Lv {u.build.level} · {JOBS[u.build.job]?.name} JLv {jobLevel(u.build, u.build.job)}</span>
            </div>
            <span class="num gold-text">+{u.earned.exp} EXP</span>
            <span class="num" style={{ color: 'var(--good)' }}>+{u.earned.jp} JP</span>
          </div>
        ))}
        {result === 'victory' && rewards && ((rewards.gil ?? 0) > 0 || (rewards.items?.length ?? 0) > 0) && (
          <div class="result-loot">Rewards: {[(rewards.gil ?? 0) > 0 ? `${rewards.gil} marks` : '', ...(rewards.items ?? []).map((i) => ITEMS[i]?.name ?? i)].filter(Boolean).join(', ')}</div>
        )}
        {state.units.some((u) => u.oath && u.team === 'player') && (
          <div class="result-oaths">{state.units.filter((u) => u.oath && u.team === 'player').map((u) => <span class={u.oath!.state}>{u.build.name}: {OATH_BY_ID[u.oath!.id]?.name} — {u.oath!.state === 'broken' ? 'broken' : 'kept'}</span>)}</div>
        )}
        {state.loot.length > 0 && <div class="result-loot">Spoils: {state.loot.map((i) => ITEMS[i]?.name ?? i).join(', ')}</div>}
        {state.lost.length > 0 && <div class="result-lost">Lost to the crystal: {state.lost.join(', ')}</div>}
        <button class="btn primary" style={{ width: '100%', marginTop: '10px' }} onClick={onContinue}>Continue</button>
      </div>
    </div>
  );
}

export { DIRS, isAlive };
