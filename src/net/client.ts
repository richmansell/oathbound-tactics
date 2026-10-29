/** Browser WebSocket client for the match server. */
import type { Command, Dir, Pos, UnitBuild } from '../engine/types';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from './protocol';

export type NetListener = (msg: ServerMsg) => void;

export class NetClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<NetListener>();
  private seq = 0;
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' = 'idle';
  id = '';

  constructor(public url: string, public name: string) {}

  connect(): Promise<void> {
    this.status = 'connecting';
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try { ws = new WebSocket(this.url); } catch (e) { this.status = 'error'; reject(e); return; }
      this.ws = ws;
      ws.onopen = () => { this.status = 'open'; this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name }); };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (msg.t === 'welcome') { this.id = msg.id; resolve(); }
        for (const l of this.listeners) l(msg);
      };
      ws.onerror = () => { this.status = 'error'; reject(new Error('Could not reach the server')); };
      ws.onclose = () => { this.status = 'closed'; for (const l of this.listeners) l({ t: 'error', msg: 'Disconnected' }); };
    });
  }

  on(l: NetListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  queue(party: UnitBuild[]): void { this.send({ t: 'queue', party, mode: 'casual' }); }
  unqueue(): void { this.send({ t: 'unqueue' }); }
  deploy(matchId: string, placements: { uid: string; pos: Pos; facing: Dir }[]): void { this.send({ t: 'deploy', matchId, placements }); }
  command(matchId: string, cmd: Command): void { this.send({ t: 'cmd', matchId, seq: ++this.seq, cmd }); }
  resync(matchId: string): void { this.send({ t: 'resync', matchId }); }
  forfeit(matchId: string): void { this.send({ t: 'forfeit', matchId }); }
  close(): void { this.ws?.close(); }
}
