/**
 * Oathbound Tactics — online match server (authoritative).
 *   npm run server            # ws://localhost:8787
 * Pairs queued players, validates parties, runs matches with the shared engine.
 * Stateless between restarts for now; accounts/persistence come later.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../src/net/protocol';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import { sanitiseParty } from '../src/net/validate';
import type { UnitBuild } from '../src/engine/types';
import { Match, type Seat } from './match';

const PORT = Number(process.env.PORT ?? 8787);

interface Client extends Seat {
  ws: WebSocket;
  party?: UnitBuild[];
  match?: Match;
  seatIndex?: number;
}

const clients = new Set<Client>();
const queue: Client[] = [];
const wss = new WebSocketServer({ port: PORT });

function send(c: Client, msg: ServerMsg): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

function tryPair(): void {
  while (queue.length >= 2) {
    const a = queue.shift()!, b = queue.shift()!;
    const m = new Match([a, b], [a.party!, b.party!]);
    a.match = m; a.seatIndex = 0;
    b.match = m; b.seatIndex = 1;
    console.log(`match ${m.id}: ${a.name} vs ${b.name}`);
  }
  queue.forEach((c, i) => send(c, { t: 'queued', position: i + 1 }));
}

wss.on('connection', (ws) => {
  const c: Client = { ws, id: Math.random().toString(36).slice(2, 10), name: 'Sellsword', send: (m) => send(c, m as ServerMsg) };
  clients.add(c);
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(data)); } catch { send(c, { t: 'error', msg: 'bad json' }); return; }
    switch (msg.t) {
      case 'hello':
        if (msg.v !== PROTOCOL_VERSION) { send(c, { t: 'error', msg: `protocol ${msg.v} unsupported` }); return; }
        c.name = String(msg.name ?? 'Sellsword').slice(0, 24);
        send(c, { t: 'welcome', id: c.id, v: PROTOCOL_VERSION, online: clients.size });
        return;
      case 'queue': {
        if (c.match && !c.match.ended) { send(c, { t: 'error', msg: 'already in a match' }); return; }
        const { party, errors } = sanitiseParty(msg.party);
        if (!party.length) { send(c, { t: 'error', msg: errors.join(', ') }); return; }
        c.party = party;
        if (!queue.includes(c)) queue.push(c);
        tryPair();
        return;
      }
      case 'unqueue': { const i = queue.indexOf(c); if (i >= 0) queue.splice(i, 1); return; }
      case 'deploy': {
        if (!c.match || c.match.id !== msg.matchId) return;
        const err = c.match.deploy(c.seatIndex!, msg.placements);
        if (err) send(c, { t: 'error', msg: err });
        return;
      }
      case 'cmd': {
        if (!c.match || c.match.id !== msg.matchId) return;
        const err = c.match.command(c.seatIndex!, msg.seq, msg.cmd);
        if (err) send(c, { t: 'rejected', matchId: msg.matchId, seq: msg.seq, reason: err });
        return;
      }
      case 'resync':
        if (c.match && c.match.id === msg.matchId) send(c, { t: 'state', matchId: msg.matchId, state: c.match.state });
        return;
      case 'forfeit':
        if (c.match && c.match.id === msg.matchId) c.match.forfeit(c.seatIndex!);
        return;
      case 'ping':
        send(c, { t: 'pong', at: msg.at });
        return;
    }
  });
  ws.on('close', () => {
    clients.delete(c);
    const i = queue.indexOf(c);
    if (i >= 0) queue.splice(i, 1);
    if (c.match && !c.match.ended) c.match.forfeit(c.seatIndex!);
  });
});

console.log(`Oathbound match server listening on ws://localhost:${PORT}`);
