import { useEffect, useRef, useState } from 'preact/hooks';
import type { BattleState, Pos, UnitBuild } from '../../engine/types';
import { createBuild } from '../../engine/factory';
import type { BattleSession } from '../../game/battleSession';
import { getGame, hasGame } from '../../game/state';
import { NetClient } from '../../net/client';
import { stateHash, type ServerMsg } from '../../net/protocol';
import { BattleScreen } from '../battle/BattleScreen';
import { Portrait } from '../common/Portrait';
import { Icon } from '../common/Icon';

const DEFAULT_URL = (() => {
  try { return localStorage.getItem('oathbound.server') ?? `ws://${location.hostname || 'localhost'}:8787`; } catch { return 'ws://localhost:8787'; }
})();

function demoParty(): UnitBuild[] {
  const ap = (body: 'male' | 'female', hair: string, hairColor: string) => ({ body, skin: 'light', hair, hairColor, eyes: 'brown' });
  return [
    createBuild({ id: 'd1', name: 'Garrick', appearance: ap('male', 'hair_messy1', 'chestnut'), job: 'knight', level: 30, autoLearn: true }),
    createBuild({ id: 'd2', name: 'Isolde', appearance: ap('female', 'hair_long', 'blonde'), job: 'wizard', level: 30, autoLearn: true }),
    createBuild({ id: 'd3', name: 'Anselm', appearance: ap('male', 'hair_balding', 'gray'), job: 'cleric', level: 30, autoLearn: true }),
    createBuild({ id: 'd4', name: 'Wenna', appearance: ap('female', 'hair_braid', 'ginger'), job: 'ranger', level: 30, autoLearn: true }),
    createBuild({ id: 'd5', name: 'Hob', appearance: ap('male', 'hair_spiked', 'black'), job: 'lancer', level: 30, autoLearn: true }),
  ];
}

export function OnlineScreen({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [name, setName] = useState(hasGame() ? getGame().roster[0]?.name ?? 'Sellsword' : 'Sellsword');
  const [status, setStatus] = useState('Not connected');
  const [match, setMatch] = useState<{ id: string; you: number; opponent: string; state: BattleState; deployTiles: Pos[] } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const client = useRef<NetClient | null>(null);
  const session = useRef<BattleSession | null>(null);
  const party: UnitBuild[] = hasGame() ? getGame().pvpParty.map((id) => getGame().roster.find((u) => u.id === id)).filter(Boolean).slice(0, 5) as UnitBuild[] : demoParty();
  const usingDemo = !hasGame() || party.length === 0;
  const finalParty = usingDemo ? demoParty() : party;

  useEffect(() => () => client.current?.close(), []);

  async function connectAndQueue() {
    try { localStorage.setItem('oathbound.server', url); } catch { /* optional */ }
    const c = new NetClient(url, name);
    client.current = c;
    setStatus('Connecting…');
    c.on((msg: ServerMsg) => {
      switch (msg.t) {
        case 'welcome': setStatus(`Connected · ${msg.online} online`); c.queue(finalParty); break;
        case 'queued': setStatus(`Searching for an opponent… (#${msg.position} in queue)`); break;
        case 'match': setMatch({ id: msg.matchId, you: msg.you, opponent: msg.opponent, state: msg.state, deployTiles: msg.deployTiles }); setStatus(`Matched against ${msg.opponent}`); break;
        case 'started': case 'applied': session.current?.applyRemote(msg.cmd, msg.hash, stateHash); break;
        case 'rejected': session.current?.rejected(); break;
        case 'state': session.current?.resync(msg.state); break;
        case 'end': setResult(msg.winner === null ? 'Draw' : msg.winner === match?.you || (session.current && msg.winner === session.current.remote?.me) ? 'Victory' : 'Defeat'); break;
        case 'error': setStatus(msg.msg); break;
      }
    });
    try { await c.connect(); } catch (e) { setStatus((e as Error).message); }
  }

  if (match && client.current) {
    const c = client.current;
    return (
      <>
        <BattleScreen key={match.id} initial={match.state} deployTiles={match.deployTiles} title={`vs ${match.opponent}`} objective="Defeat the rival company"
          me={match.you}
          remote={{ me: match.you, sendCommand: (cmd) => c.command(match.id, cmd), sendDeploy: (p) => c.deploy(match.id, p), requestResync: () => c.resync(match.id) }}
          onSession={(s) => { session.current = s; }}
          canRetreat onRetreat={() => { c.forfeit(match.id); }}
          onEnd={() => { /* end handled by server 'end' message */ }} />
        {result && (
          <div class="result-overlay fade-in">
            <div class={`result-title title-font ${result === 'Victory' ? 'victory' : 'defeat'}`}>{result}</div>
            <button class="btn primary" onClick={() => { c.close(); onClose(); }}>Leave</button>
          </div>
        )}
      </>
    );
  }

  return (
    <div class="screen" style={{ background: 'radial-gradient(ellipse at top, #1a2647, #070b16 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div class="panel" style={{ width: 'min(560px, 94vw)' }}>
        <div class="panel-title row"><span>Online — Duel</span><span class="spacer" /><button class="btn small ghost" onClick={onClose}><Icon name="close" /></button></div>
        <div class="col" style={{ padding: '12px 14px' }}>
          <label class="col" style={{ gap: '4px' }}><span class="label">Server</span><input value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} style={inputStyle} /></label>
          <label class="col" style={{ gap: '4px' }}><span class="label">Your name</span><input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={inputStyle} /></label>
          <div class="label">{usingDemo ? 'Demo party (start a story to field your own)' : 'Your PvP party'} — normalised to level 30</div>
          <div class="row" style={{ flexWrap: 'wrap', gap: '6px' }}>{finalParty.map((u) => <div class="col" style={{ alignItems: 'center', gap: '2px' }}><Portrait build={u} size={48} /><span style={{ fontSize: '12px' }}>{u.name}</span></div>)}</div>
          <p class="muted" style={{ fontSize: '13px' }}>Matches run on an authoritative server with the same rules engine as story mode. Run <code>npm run server</code> to host one locally.</p>
          <div class="row"><button class="btn primary" onClick={connectAndQueue}>Find a match</button><span class="muted">{status}</span></div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = { background: 'rgba(0,0,0,0.35)', border: '1px solid var(--gold-dim)', borderRadius: '4px', color: 'var(--parch)', padding: '8px 10px', font: 'inherit' };
