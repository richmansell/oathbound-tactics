/**
 * Oathbound Tactics audio engine (WebAudio, no framework).
 *
 *   import { audio } from '@/audio/audio';
 *   audio.init();                       // once at boot; installs first-gesture unlock (iOS)
 *   audio.playMusic('battle');          // crossfades from whatever is playing
 *   audio.sfx('slash', { pan: -0.3 });  // fire-and-forget
 *   audio.setVolumes({ music: 0.5 });   // persisted to localStorage
 *
 * Everything degrades to a silent no-op when WebAudio is unavailable (Node, SSR, very old
 * browsers) — callers never need to guard.
 */
import {
  CORE_SFX, MUSIC, SFX, VOICE_DIR, VOICE_FORMATS,
  type BlipVoice, type MusicEntry, type MusicId, type SfxEntry, type SfxId,
} from './manifest';

export interface Volumes { master: number; music: number; sfx: number; voice: number }

export interface InitOptions {
  /** URL prefix for `public/assets/audio/`. Defaults to `${BASE_URL}assets/audio/`. */
  baseUrl?: string;
  /** Decode the core UI set immediately (default true). */
  preloadCore?: boolean;
  /** iOS 17+: play through the ringer/silent switch (default false: respect it, like native games). */
  ignoreSilentSwitch?: boolean;
  /** Locale for voice lines (default 'en'). */
  locale?: string;
}

export interface PlayMusicOptions {
  /** Crossfade / fade-in time (default 1000 ms). 0 = hard cut. */
  fadeMs?: number;
  /** Override the manifest loop behaviour. `false` plays once; `true` uses the manifest loop (or whole-file loop). */
  loop?: boolean;
  /** Restart even if this id is already playing. */
  restart?: boolean;
  /** Extra linear gain for this play (multiplies the manifest volume). */
  volume?: number;
  /** Start this many seconds into the file (debug / audition loop seams). */
  startAt?: number;
}

export interface SfxOptions {
  /** Linear gain multiplier (default 1). */
  volume?: number;
  /** Playback-rate multiplier (default 1; also shifts duration). */
  pitch?: number;
  /** Stereo position −1 (left) … 1 (right). */
  pan?: number;
  /** Start delay in seconds. */
  delay?: number;
  /** If the sound still needs loading, drop it when it would start later than this (default 250 ms). */
  maxLatencyMs?: number;
}

export interface SfxHandle { stop(fadeMs?: number): void }

export interface VoiceHandle {
  lineId: string;
  duration: number;
  /** Resolves when the line finishes or is stopped. */
  ended: Promise<void>;
  stop(fadeMs?: number): void;
}

const STORAGE_KEY = 'oathbound.audio.v1';
const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.7, sfx: 0.85, voice: 1 };
const MAX_SFX_VOICES = 32;
const MUSIC_CACHE = 2; // decoded music is large (≈ 21 MB per stereo minute at 44.1 kHz)

interface Decoded { buffer: AudioBuffer; /** leading silence to skip (codec priming), seconds */ offset: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Slider position (0..1) → linear gain. Squared for a more even perceived loudness curve. */
export const sliderToGain = (v: number) => { const c = clamp(Number.isFinite(v) ? v : 0, 0, 1); return c * c; };

function defaultBaseUrl(): string {
  let base = '/';
  try { base = import.meta.env?.BASE_URL ?? '/'; } catch { /* not running under Vite */ }
  return `${base.endsWith('/') ? base : base + '/'}assets/audio/`;
}

function getAudioContextCtor(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function decodeAudio(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Supports both the promise and the legacy callback form (older Safari).
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (e) { reject(e); }
  });
}

/** Seconds of near-silence at the start of a buffer (AAC/MP3 encoder priming), capped. */
function leadingSilence(buf: AudioBuffer, threshold = 0.0015, cap = 0.12): number {
  const n = Math.min(buf.length, Math.floor(cap * buf.sampleRate));
  let first = n;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < first; i++) if (Math.abs(d[i]) > threshold) { first = i; break; }
  }
  return Math.max(0, first - Math.floor(0.002 * buf.sampleRate)) / buf.sampleRate;
}

const MIME: Record<string, string> = {
  ogg: 'audio/ogg; codecs="vorbis"', opus: 'audio/ogg; codecs="opus"', webm: 'audio/webm; codecs="opus"',
  m4a: 'audio/mp4; codecs="mp4a.40.2"', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
};
const canPlayCache = new Map<string, boolean>();
function canPlayExt(ext: string): boolean {
  if (canPlayCache.has(ext)) return canPlayCache.get(ext)!;
  let ok = true; // unknown → let decodeAudioData decide
  try {
    if (typeof document !== 'undefined' && MIME[ext]) ok = document.createElement('audio').canPlayType(MIME[ext]) !== '';
  } catch { /* ignore */ }
  canPlayCache.set(ext, ok);
  return ok;
}
const extOf = (p: string) => (p.split('?')[0].split('.').pop() ?? '').toLowerCase();

/** Smooth gain change that is safe to call at any time (cancels pending automation first). */
function ramp(ctx: BaseAudioContext, param: AudioParam, to: number, sec: number, at = ctx.currentTime): void {
  const from = param.value;
  param.cancelScheduledValues(at);
  param.setValueAtTime(from, at);
  if (sec <= 0.005) param.setValueAtTime(to, at + 0.001);
  else param.linearRampToValueAtTime(to, at + sec);
}

/** Equal-power fade curve (sin/cos quarter wave) for crossfading uncorrelated material. */
function eqCurve(fadeIn: boolean, n = 64): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    c[i] = fadeIn ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return c;
}

/** One playing music track (handles seamless loops and crossfade loops). */
class MusicPlayer {
  readonly out: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  stopping = false;
  onEnded: (() => void) | null = null;

  constructor(
    private ctx: AudioContext, dest: AudioNode, readonly id: MusicId, private entry: MusicEntry,
    private dec: Decoded, private loop: MusicEntry['loop'], private gain: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
  }

  start(fadeMs: number, startAt = 0): void {
    const now = this.ctx.currentTime + 0.02;
    ramp(this.ctx, this.out.gain, this.gain, fadeMs / 1000, now);
    const buf = this.dec.buffer;
    const offset = clamp(startAt, 0, Math.max(0, buf.duration - 0.5));
    if (this.loop === 'crossfade') {
      this.schedulePass(now, true, offset);
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      if (this.loop) {
        src.loop = true;
        const end = Math.min(this.loop.end, buf.duration);
        const start = clamp(this.loop.start, 0, end - 0.01);
        src.loopStart = start;
        src.loopEnd = end;
      }
      src.connect(this.out);
      src.onended = () => { if (!this.stopping) this.finish(); };
      src.start(now, this.loop ? Math.min(offset, src.loopEnd - 0.05) : offset);
      this.sources.push(src);
      // A loop-trimmed file forced to play once ends mid-phrase just after its loop end: fade it out.
      if (!this.loop && this.entry.loop && typeof this.entry.loop === 'object') {
        const fadeLen = Math.min(3, buf.duration / 4);
        const t = now + buf.duration - offset - fadeLen;
        if (t > now + fadeMs / 1000) {
          this.out.gain.setValueAtTime(this.gain, t);
          this.out.gain.linearRampToValueAtTime(0, t + fadeLen);
        }
      }
    }
  }

  /** Crossfade loop: each pass fades in over `xf` while the previous one fades out. */
  private schedulePass(at: number, first: boolean, offset = 0): void {
    if (this.stopping) return;
    const buf = this.dec.buffer;
    const xf = Math.min((this.entry.crossfadeMs ?? 4000) / 1000, buf.duration / 3);
    const len = Math.max(xf * 2, buf.duration - offset); // seconds this pass will sound
    const g = this.ctx.createGain();
    g.connect(this.out);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    if (first) g.gain.setValueAtTime(1, at);
    else g.gain.setValueCurveAtTime(eqCurve(true), at, xf);
    g.gain.setValueCurveAtTime(eqCurve(false), at + len - xf, xf);
    src.onended = () => {
      g.disconnect();
      this.sources = this.sources.filter((s) => s !== src);
    };
    src.start(at, Math.min(offset, Math.max(0, buf.duration - len)));
    src.stop(at + len + 0.05);
    this.sources.push(src);
    const next = at + len - xf;
    const wait = Math.max(0, (next - this.ctx.currentTime - 2) * 1000);
    this.timer = setTimeout(() => this.schedulePass(Math.max(next, this.ctx.currentTime + 0.05), false), wait);
  }

  setGain(gain: number, ms = 250): void {
    this.gain = gain;
    if (!this.stopping) ramp(this.ctx, this.out.gain, gain, ms / 1000);
  }

  stop(fadeMs: number): void {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    const sec = Math.max(0, fadeMs) / 1000;
    const now = this.ctx.currentTime;
    ramp(this.ctx, this.out.gain, 0, sec, now);
    for (const s of this.sources) { try { s.stop(now + sec + 0.05); } catch { /* already stopped */ } }
    setTimeout(() => { try { this.out.disconnect(); } catch { /* ignore */ } }, (sec + 0.2) * 1000);
  }

  private finish(): void {
    if (this.timer) clearTimeout(this.timer);
    try { this.out.disconnect(); } catch { /* ignore */ }
    this.onEnded?.();
  }
}

interface ActiveSfx { id: string; src: AudioBufferSourceNode; gain: GainNode; started: number }

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private musicBus: GainNode | null = null;
  private duckBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;

  private baseUrl = defaultBaseUrl();
  private locale = 'en';
  private volumes: Volumes = { ...DEFAULT_VOLUMES };
  private muted = false;
  private initialised = false;
  private unlocked = false;
  private appPaused = false;
  private unlockHandler: (() => void) | null = null;

  private cache = new Map<string, Promise<Decoded | null>>();
  /** Synchronously-available decoded sfx so hot sounds start in the same frame. */
  private ready = new Map<string, Decoded>();
  private resumeRequestedAt = -Infinity;
  private musicLru: string[] = [];
  private missing = new Set<string>();
  private music: MusicPlayer | null = null;
  private musicToken = 0;
  private active: ActiveSfx[] = [];
  private lastVariant = new Map<string, number>();
  private voice: { handle: VoiceHandle; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private duckDepth = 0;
  private ducks = new Map<number, number>();
  private duckSeq = 0;

  constructor() {
    this.loadSettings();
  }

  /** True when WebAudio exists in this environment. */
  get supported(): boolean { return getAudioContextCtor() !== null; }
  /** 'running' | 'suspended' | 'closed' | 'interrupted' | 'unsupported' */
  get state(): string { return this.ctx ? this.ctx.state : this.supported ? 'uninitialised' : 'unsupported'; }
  get currentMusic(): MusicId | null { return this.music && !this.music.stopping ? this.music.id : null; }
  get context(): AudioContext | null { return this.ctx; }

  // ------------------------------------------------------------------ lifecycle
  init(opts: InitOptions = {}): void {
    if (opts.baseUrl) this.baseUrl = opts.baseUrl.endsWith('/') ? opts.baseUrl : opts.baseUrl + '/';
    if (opts.locale) this.locale = opts.locale;
    if (this.initialised) return;
    this.initialised = true;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'running') this.unlocked = true; // desktop browsers with prior engagement
    if (opts.ignoreSilentSwitch) {
      try {
        const nav = navigator as unknown as { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = 'playback';
      } catch { /* not supported */ }
    }
    this.installUnlock();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.applyRunState());
    }
    if (opts.preloadCore !== false) void this.preload({ sfx: [...CORE_SFX] });
  }

  /**
   * Resume the AudioContext. Must run inside a user gesture on iOS/Android; `init()` installs
   * listeners that call this on the first pointer/touch/key event, so calling it manually is optional.
   */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // A one-sample silent buffer started inside the gesture "wakes" iOS Safari's output.
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch { /* ignore */ }
    try {
      if (ctx.state !== 'running' && !this.appPaused) {
        this.resumeRequestedAt = typeof performance !== 'undefined' ? performance.now() : 0;
        await ctx.resume();
      }
    } catch { /* ignore */ }
    if (ctx.state === 'running') {
      this.unlocked = true;
      this.removeUnlock();
    }
  }

  /** Pause/resume all audio for app lifecycle (e.g. Capacitor `pause`/`resume`). */
  setPaused(paused: boolean): void {
    this.appPaused = paused;
    this.applyRunState();
  }

  private applyRunState(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (hidden || this.appPaused) { ctx.suspend().catch(() => {}); return; }
    if (this.unlocked) ctx.resume().catch(() => {});
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      let ctx: AudioContext;
      try { ctx = new Ctor({ latencyHint: 'interactive' }); } catch { ctx = new Ctor(); }
      this.ctx = ctx;
      this.limiter = ctx.createDynamicsCompressor();
      // Gentle safety limiter so stacked SFX + music never hard-clip.
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 4;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.2;
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.duckBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.voiceBus = ctx.createGain();
      this.musicBus.connect(this.duckBus).connect(this.master);
      this.sfxBus.connect(this.master);
      this.voiceBus.connect(this.master);
      this.master.connect(this.limiter).connect(ctx.destination);
      this.applyVolumes(0);
      ctx.addEventListener?.('statechange', () => {
        // iOS can 'interrupt' (phone call, Siri) — re-arm the gesture unlock.
        if (ctx.state !== 'running' && !this.appPaused && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
          this.unlocked = false;
          this.installUnlock();
        }
      });
      return ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  private installUnlock(): void {
    if (this.unlockHandler || typeof window === 'undefined') return;
    const handler = () => { void this.unlock(); };
    this.unlockHandler = handler;
    for (const ev of ['pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
      window.addEventListener(ev, handler, { capture: true, passive: true });
    }
  }

  private removeUnlock(): void {
    const h = this.unlockHandler;
    if (!h || typeof window === 'undefined') return;
    for (const ev of ['pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
      window.removeEventListener(ev, h, { capture: true } as EventListenerOptions);
    }
    this.unlockHandler = null;
  }

  // ------------------------------------------------------------------ loading
  private url(rel: string): string { return /^([a-z]+:)?\/\//i.test(rel) || rel.startsWith('/') ? rel : this.baseUrl + rel; }

  private pickSrc(src: string | string[]): string {
    const list = Array.isArray(src) ? src : [src];
    return list.find((s) => canPlayExt(extOf(s))) ?? list[0];
  }

  private load(rel: string, opts: { trimLead?: boolean; quiet?: boolean; music?: boolean; keep?: boolean } = {}): Promise<Decoded | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const url = this.url(rel);
    const hit = this.cache.get(url);
    if (hit) { if (opts.music) this.touchMusic(url); return hit; }
    const p = (async (): Promise<Decoded | null> => {
      try {
        const res = await fetch(url);
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html')) throw new Error(`HTTP ${res.status}`);
        const buffer = await decodeAudio(ctx, await res.arrayBuffer());
        const dec: Decoded = { buffer, offset: opts.trimLead ? leadingSilence(buffer) : 0 };
        if (opts.keep === false) this.cache.delete(url);
        else if (!opts.music) this.ready.set(url, dec);
        return dec;
      } catch (e) {
        if (!opts.quiet && !this.missing.has(url)) console.warn(`[audio] could not load ${url}:`, e);
        this.missing.add(url);
        this.cache.delete(url); // allow a later retry
        return null;
      }
    })();
    this.cache.set(url, p);
    if (opts.music) this.touchMusic(url);
    return p;
  }

  /** Keep only the most recently used decoded music buffers in memory (never the playing one). */
  private touchMusic(url: string): void {
    this.musicLru = [url, ...this.musicLru.filter((u) => u !== url)];
    const playing = this.music ? this.url(this.pickSrc(MUSIC[this.music.id].src)) : null;
    for (let i = this.musicLru.length - 1; i >= 0 && this.musicLru.length > MUSIC_CACHE; i--) {
      const u = this.musicLru[i];
      if (u === url || u === playing) continue;
      this.musicLru.splice(i, 1);
      this.cache.delete(u);
    }
  }

  /** Decode assets ahead of time. Music preloads count against the small music cache. */
  async preload(ids: { music?: MusicId[]; sfx?: SfxId[] }): Promise<void> {
    if (!this.ensureContext()) return;
    const jobs: Promise<unknown>[] = [];
    for (const id of ids.sfx ?? []) {
      const e = SFX[id] as SfxEntry | undefined;
      if (e) for (const v of e.variants) jobs.push(this.load(v, { trimLead: true }));
    }
    for (const id of ids.music ?? []) {
      const e = MUSIC[id] as MusicEntry | undefined;
      if (e) jobs.push(this.load(this.pickSrc(e.src), { music: true }));
    }
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------------ music
  async playMusic(id: MusicId, opts: PlayMusicOptions = {}): Promise<void> {
    const ctx = this.ensureContext();
    const entry = MUSIC[id] as MusicEntry | undefined;
    if (!ctx || !this.musicBus) return;
    if (!entry) { console.warn(`[audio] unknown music id "${id}"`); return; }
    if (!opts.restart && this.music && !this.music.stopping && this.music.id === id) return;
    const token = ++this.musicToken;
    const dec = await this.load(this.pickSrc(entry.src), { music: true });
    if (!dec || token !== this.musicToken) return;
    const fadeMs = Math.max(0, opts.fadeMs ?? 1000);
    let loop: MusicEntry['loop'] = entry.loop;
    if (opts.loop === false) loop = false;
    else if (opts.loop === true && !loop) loop = { start: 0, end: dec.buffer.duration };
    this.music?.stop(fadeMs);
    const player = new MusicPlayer(ctx, this.musicBus, id, entry, dec, loop, entry.volume * (opts.volume ?? 1));
    player.onEnded = () => { if (this.music === player) this.music = null; };
    this.music = player;
    player.start(fadeMs, opts.startAt ?? 0);
  }

  stopMusic(fadeMs = 800): void {
    this.musicToken++;
    this.music?.stop(fadeMs);
    this.music = null;
  }

  // ------------------------------------------------------------------ sfx
  sfx(id: SfxId, opts: SfxOptions = {}): SfxHandle | null {
    const ctx = this.ctx;
    const entry = SFX[id] as SfxEntry | undefined;
    if (!ctx || !this.sfxBus) return null;
    if (!entry) { console.warn(`[audio] unknown sfx id "${id}"`); return null; }
    // While the context is locked, sounds would queue up and burst out at unlock — drop them,
    // except during the brief window where a gesture has just requested resume().
    if (ctx.state !== 'running' && performance.now() - this.resumeRequestedAt > 1000) return null;
    const rel = this.pickVariant(id, entry);
    const url = this.url(rel);
    let cancelled = false;
    let playing: ActiveSfx | null = null;
    const handle: SfxHandle = {
      stop: (fadeMs = 30) => {
        cancelled = true;
        if (playing) this.stopActive(playing, fadeMs);
      },
    };
    const requested = performance.now();
    const go = (dec: Decoded | null) => {
      if (!dec || cancelled) return;
      if (performance.now() - requested > (opts.maxLatencyMs ?? 250)) return; // too late to be meaningful
      playing = this.playBuffer(id, entry, dec, opts);
    };
    // Fast path: already decoded → play synchronously in this frame.
    const ready = this.ready.get(url);
    if (ready) go(ready);
    else void this.load(rel, { trimLead: true }).then(go);
    return handle;
  }

  /** Dialogue typewriter blip for a speaker voice. */
  textBlip(voice: BlipVoice = 'mid', opts: SfxOptions = {}): SfxHandle | null {
    return this.sfx(`text_blip_${voice}` as SfxId, opts);
  }

  private pickVariant(id: string, e: SfxEntry): string {
    if (e.variants.length === 1) return e.variants[0];
    const last = this.lastVariant.get(id) ?? -1;
    let i = Math.floor(Math.random() * e.variants.length);
    if (i === last) i = (i + 1) % e.variants.length;
    this.lastVariant.set(id, i);
    return e.variants[i];
  }

  private playBuffer(id: string, e: SfxEntry, dec: Decoded, opts: SfxOptions): ActiveSfx | null {
    const ctx = this.ctx!;
    // Voice limiting: per id, then global.
    const same = this.active.filter((a) => a.id === id);
    if (same.length >= (e.maxVoices ?? 6)) this.stopActive(same[0], 15);
    if (this.active.length >= MAX_SFX_VOICES) this.stopActive(this.active[0], 15);

    const src = ctx.createBufferSource();
    src.buffer = dec.buffer;
    const jitter = e.pitchJitter ? 1 + (Math.random() * 2 - 1) * e.pitchJitter : 1;
    src.playbackRate.value = clamp((opts.pitch ?? 1) * jitter, 0.25, 4);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, e.volume * (opts.volume ?? 1));
    let node: AudioNode = src.connect(gain);
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      node = node.connect(p);
    }
    node.connect(e.category === 'voice' ? this.voiceBus! : this.sfxBus!);
    const a: ActiveSfx = { id, src, gain, started: ctx.currentTime };
    src.onended = () => {
      this.active = this.active.filter((x) => x !== a);
      try { gain.disconnect(); } catch { /* ignore */ }
    };
    src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0), dec.offset);
    this.active.push(a);
    return a;
  }

  private stopActive(a: ActiveSfx, fadeMs: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const sec = Math.max(0.005, fadeMs / 1000);
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(0, t + sec);
    try { a.src.stop(t + sec + 0.01); } catch { /* ignore */ }
    this.active = this.active.filter((x) => x !== a);
  }

  // ------------------------------------------------------------------ voice
  setLocale(locale: string): void { this.locale = locale; }

  /**
   * Play a voiced dialogue line from `voice/<locale>/<lineId>.(ogg|m4a|mp3)`. Resolves to `null`
   * (silently) if the line has not been recorded yet. Music is ducked while the line plays.
   */
  async playVoice(lineId: string, opts: { locale?: string; volume?: number; duck?: number } = {}): Promise<VoiceHandle | null> {
    const ctx = this.ensureContext();
    if (!ctx || !this.voiceBus) return null;
    const locale = opts.locale ?? this.locale;
    const safeId = lineId.replace(/[^A-Za-z0-9_.-]/g, '_');
    let dec: Decoded | null = null;
    for (const ext of VOICE_FORMATS) {
      if (!canPlayExt(ext)) continue;
      const rel = `${VOICE_DIR}/${locale}/${safeId}.${ext}`;
      if (this.missing.has(this.url(rel))) continue;
      dec = await this.load(rel, { quiet: true, trimLead: true, keep: false });
      if (dec) break;
    }
    if (!dec) return null;
    this.stopVoice(60);
    const src = ctx.createBufferSource();
    src.buffer = dec.buffer;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain).connect(this.voiceBus);
    const release = this.duck(opts.duck ?? 0.45, 200);
    let resolveEnded!: () => void;
    const ended = new Promise<void>((r) => { resolveEnded = r; });
    const handle: VoiceHandle = {
      lineId, duration: dec.buffer.duration - dec.offset, ended,
      stop: (fadeMs = 80) => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
        try { src.stop(t + fadeMs / 1000 + 0.01); } catch { /* ignore */ }
      },
    };
    src.onended = () => {
      release();
      try { gain.disconnect(); } catch { /* ignore */ }
      if (this.voice?.src === src) this.voice = null;
      resolveEnded();
    };
    src.start(ctx.currentTime + 0.01, dec.offset);
    this.voice = { handle, src, gain };
    return handle;
  }

  stopVoice(fadeMs = 80): void { this.voice?.handle.stop(fadeMs); }

  // ------------------------------------------------------------------ mixing
  /**
   * Lower the music bus by `amount` (0..1, e.g. 0.5 = −6 dB) over `ms`. Returns a release function
   * that restores it (over the same time). Overlapping ducks use the deepest active amount.
   */
  duck(amount = 0.5, ms = 250): () => void {
    const key = ++this.duckSeq;
    this.ducks.set(key, clamp(amount, 0, 1));
    this.applyDuck(ms);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ducks.delete(key);
      this.applyDuck(ms);
    };
  }

  private applyDuck(ms: number): void {
    this.duckDepth = Math.max(0, ...this.ducks.values());
    if (this.ctx && this.duckBus) ramp(this.ctx, this.duckBus.gain, 1 - this.duckDepth, ms / 1000);
  }

  getVolumes(): Volumes { return { ...this.volumes }; }

  setVolumes(v: Partial<Volumes>): void {
    for (const k of ['master', 'music', 'sfx', 'voice'] as const) {
      const val = v[k];
      if (typeof val === 'number' && Number.isFinite(val)) this.volumes[k] = clamp(val, 0, 1);
    }
    this.applyVolumes(60);
    this.saveSettings();
  }

  get isMuted(): boolean { return this.muted; }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes(60);
    this.saveSettings();
  }

  private applyVolumes(ms: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const set = (node: GainNode | null, v: number) => {
      if (!node) return;
      const t = ctx.currentTime;
      node.gain.cancelScheduledValues(t);
      if (ms <= 0) node.gain.setValueAtTime(v, t);
      else node.gain.setTargetAtTime(v, t, ms / 3000);
    };
    set(this.master, this.muted ? 0 : sliderToGain(this.volumes.master));
    set(this.musicBus, sliderToGain(this.volumes.music));
    set(this.sfxBus, sliderToGain(this.volumes.sfx));
    set(this.voiceBus, sliderToGain(this.volumes.voice));
  }

  private loadSettings(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Volumes> & { muted?: boolean };
      for (const k of ['master', 'music', 'sfx', 'voice'] as const) {
        const val = data[k];
        if (typeof val === 'number' && Number.isFinite(val)) this.volumes[k] = clamp(val, 0, 1);
      }
      this.muted = data.muted === true;
    } catch { /* storage blocked or corrupt — keep defaults */ }
  }

  private saveSettings(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.volumes, muted: this.muted }));
    } catch { /* storage blocked (private mode) — settings just won't persist */ }
  }
}

/** The game-wide audio singleton. */
export const audio = new AudioEngine();
export type { MusicId, SfxId, BlipVoice } from './manifest';
