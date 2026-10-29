# Audio — Oathbound Tactics

WebAudio engine, music cues, sound effects, voice-over hooks. Everything lives in:

```
src/audio/audio.ts          engine + `audio` singleton
src/audio/manifest.ts       id → file map, loop points, per-asset trims  (edit this to swap assets)
src/audio/tools/loopfind.py offline loop-point finder (not bundled)
public/assets/audio/music/  17 cues (MP3 / AAC .m4a), ≈ 21 MB
public/assets/audio/sfx/    70 files (AAC .m4a), ≈ 1.6 MB
public/assets/audio/CREDITS.md   title / author / licence / source for EVERY file (legal requirement)
audio-lab.html + src/labs/audio-lab.ts   audition page
tests/audio-manifest.test.ts, tests/audio-engine.test.ts
```

## Using it

```ts
import { audio } from '@/audio/audio';

audio.init();                                   // once at boot (creates the context, installs the first-gesture unlock)
audio.playMusic('title');                       // crossfades (default 1000 ms) from whatever is playing
audio.playMusic('battle', { fadeMs: 400 });
audio.stopMusic(800);
audio.sfx('slash', { pan: -0.4, pitch: 1.05, volume: 0.9 });
audio.textBlip('low');                          // dialogue typewriter blip, voices: low | mid | high
audio.setVolumes({ master: 0.8, music: 0.6 });  // 0..1 slider values, persisted in localStorage
const release = audio.duck(0.5, 250);           // lower music by 50 % (≈ −6 dB) … release() to restore
const line = await audio.playVoice('ch1_s3_ardel_004');  // null (silent) if not recorded yet
```

| Method | Notes |
|---|---|
| `init(opts?)` | `baseUrl` (default `${import.meta.env.BASE_URL}assets/audio/`), `preloadCore` (default true), `locale` (default `en`), `ignoreSilentSwitch` (iOS 17+, default false). Idempotent. |
| `unlock()` | Resumes the AudioContext and plays a 1-sample buffer. `init()` already calls it on the first `pointerup`/`touchend`/`mousedown`/`keydown`/`click`, so you rarely need it. |
| `playMusic(id, { fadeMs, loop, restart, volume, startAt })` | No-op if `id` is already playing (unless `restart`). Concurrent calls are race-safe (last call wins). `loop:false` forces one pass (a loop-trimmed file then fades out at its end). |
| `stopMusic(fadeMs = 800)` | |
| `sfx(id, { volume, pitch, pan, delay, maxLatencyMs })` | Returns `{ stop(fadeMs) }` or `null`. Plays in the same frame if decoded; otherwise loads and plays only if that takes < `maxLatencyMs` (250 ms) — late hit sounds are worse than none. Dropped while the context is locked so sounds don't burst out at unlock. |
| `textBlip(voice)` | `sfx('text_blip_<voice>')` — 3 variants per voice + ±3 % pitch jitter. |
| `playVoice(lineId, { locale, volume, duck })` | Tries `voice/<locale>/<lineId>.ogg`, then `.m4a`, `.mp3` (skipping formats the browser can't play). Missing → resolves `null`, remembered so it isn't re-fetched. Ducks music by `duck` (0.45) while playing; a new line stops the previous one. Returns `{ duration, ended, stop() }`. |
| `stopVoice(fadeMs)` | |
| `duck(amount, ms)` | Returns a release function. Overlapping ducks use the deepest. |
| `setVolumes / getVolumes / setMuted / isMuted` | Stored under `localStorage['oathbound.audio.v1']` (wrapped in try/catch: private mode just won't persist). Slider → gain is squared (0.5 → −12 dB) for an even perceived curve. |
| `preload({ music, sfx })` | Decode ahead (e.g. preload `boss` during the pre-battle dialogue). |
| `setPaused(bool)` | App lifecycle (see Capacitor below). The engine also suspends on `visibilitychange`. |
| `supported`, `state`, `currentMusic`, `context` | Introspection. |

When WebAudio doesn't exist (Node, SSR, ancient browsers) every call is a silent no-op — callers never guard.

### Suggested event mapping

| Game event | Sound |
|---|---|
| Menu move / confirm / back / invalid | `cursor` / `confirm` / `cancel` / `error`; `menu_open`, `menu_close`, `page` |
| Unit turn begins | `turn_start` |
| Each tile walked / jump up / drop down | `step` (pitch jitter built in) / `jump` / `land` |
| Weapon attack | `slash` (sword, knife, katana), `slash_heavy` (axe, knightsword, crit-capable), `pierce` (spear), `blunt` (flail, staff, fists), `arrow_shoot` → `arrow_hit` (bow, crossbow) |
| Result | `hit`, `crit`, `miss` (evaded; `whoosh` for generic swings), `block` (shield), `guard` (Defend), `ko` |
| Charging a spell | `charge` (riser; `stop()` the handle if interrupted) |
| Elements | `fire`, `ice`, `thunder`, `wind`, `earth`, `water`, `holy`, `dark`, `poison` |
| Support magic | `heal`, `cure_big`, `revive`, `buff`, `protect`, `debuff`, `sleep`, `absorb`, `time` (haste; `pitch: 0.8` for slow), `teleport`, `summon` |
| Rewards | `gil`, `item_get`, `steal`, `learn`, `level_up`, `job_level` |
| Battle end | `victory_stinger` SFX or `playMusic('victory', {fadeMs:0})` then `playMusic('results')`; `defeat_stinger` / `playMusic('defeat')` |
| World | `door`, shop `buy`, `equip` / `unequip`, `use_item` |

Pan from the unit's screen x: `pan = clamp((screenX / width) * 2 - 1, -1, 1) * 0.6`.

## Mobile / platform notes

- **Unlock**: iOS Safari and Android Chrome start the AudioContext suspended. `init()` installs capture-phase listeners and resumes on the first gesture (plus a silent 1-sample buffer for older iOS). If iOS interrupts audio (call, Siri) the listeners are re-armed automatically. Music requested before the unlock starts as soon as it happens; SFX requested while locked are dropped.
- **Silent switch**: by default WebAudio on iOS respects the ringer switch (like native games using the *ambient* category). `init({ ignoreSilentSwitch: true })` sets `navigator.audioSession.type = 'playback'` where supported.
- **Capacitor**: wire app lifecycle — `App.addListener('pause', () => audio.setPaused(true)); App.addListener('resume', () => audio.setPaused(false));`. Assets are fetched relative to the web root, which works under `capacitor://localhost`; pass `init({ baseUrl })` if the bundle layout differs.
- **Formats**: every browser/WebView we target decodes MP3 and AAC-in-MP4 via `decodeAudioData` (Ogg is still unreliable on older iOS). The orchestral loops are the composer's own 112–128 kbps MP3s, truncated losslessly at an MP3 frame shortly after the loop end (no generational loss); everything else is AAC (`afconvert`, 80–128 kbps; SFX mono 80 kbps, magic/jingles stereo 112 kbps). A manifest `src` may be an array of alternatives (`['x.ogg', 'x.m4a']`) — the first the browser reports it can play is used.
- **Encoder delay**: MP3/AAC add a few ms of priming silence that some browsers don't trim. SFX: the engine skips leading silence (≤ 120 ms) after decoding. Music: loop points are inside the file with ≥ 0.75 s margin on both sides, so a constant decoder offset shifts both points equally and the seam stays sample-aligned.
- **Memory**: decoded PCM is large (≈ 21 MB per stereo minute at 44.1 kHz, more at 48 kHz). The engine keeps only the 2 most recently used music buffers (never evicting the playing one); SFX (all short) stay cached. Long tracks were deliberately trimmed to their loop (e.g. `boss` 351 s → 189 s, `hollow` cut to its first movement).
- **Size**: 23 MB total. Every music file ≤ 3 MB (test-enforced), every SFX ≤ 200 kB.

## Mixing

`music → duck → master`, `sfx → master`, `voice/blips → master`, `master → limiter (−3 dB, 12:1) → out`.

- Music trims (`volume` in the manifest) come from measured integrated loudness (BS.1770) targeting ≈ −16 LUFS; the ambient `church`/`hollow`/`camp` cues sit a little lower by design.
- SFX were loudness-normalised at build time by category (max 100 ms momentary loudness: UI −20, movement −24, combat −13, magic −14, jingles −15, blips −23 dB), peak-limited to −1 dBFS, so per-id `volume` is mostly 1. Adjust trims in the manifest, not in code.
- `pitchJitter` and multi-file `variants` (footsteps) avoid machine-gun repetition; `maxVoices` caps simultaneous instances per id (oldest is faded out); 32 SFX voices globally.

## Music cues

All "RPG Orchestral Essentials" tracks by Jonathan Shaw are one cohesive orchestral library; each was composed to loop (intro + A + A + reverb tail). Loop points were found by waveform autocorrelation (`loopfind.py`: normalised cross-correlation 0.987–0.9996, seam SNR 19–34 dB, i.e. the residual is MP3 codec noise) and verified after browser decode (best alignment offset 0 samples).

| id | Track | Loop | Use |
|---|---|---|---|
| `title` | A Dream of First Flight (Shaw) | seamless 10.56 → 136.03 s | Title / main theme |
| `world` | The World At Your Door (Shaw) | seamless 14.69 → 89.37 s | World map |
| `town` | In Tranquil Spring (Shaw) | seamless 2.47 → 78.06 s | Towns, calm hubs |
| `battle` | A Fight in the Fields (Shaw) | seamless 7.22 → 110.40 s | Standard battle |
| `battle2` | The Tread of War (Shaw) | seamless 4.73 → 108.73 s | Alt battle (march) |
| `boss` | A Slave To No One (Shaw) | seamless 24.80 → 187.45 s | Boss battle |
| `tension` | Midnight Creeping (Shaw) | seamless 4.03 → 80.74 s | Intrigue / sneaking |
| `sorrow` | Visions of Freedom (Shaw) | seamless 5.14 → 122.14 s | Sad scenes |
| `church` | Rites (Kevin MacLeod) | 5 s crossfade | The Ledger church — chant-like voices + pipe organ |
| `hollow` | Halls of the Undead (Kevin MacLeod), first movement | 4 s crossfade | Hollows / undead |
| `victory` | Won! (spuispuin) | one-shot 3.1 s | Victory fanfare |
| `defeat` | The Fallen (Shaw), single pass | one-shot 39.6 s | Defeat / game over |
| `camp` | A Tale of Peace (Shaw) | seamless 4.20 → 107.87 s | Night camp |
| `results` | Can't Stop Winning (Shaw) | seamless 5.85 → 33.29 s | Spoils / results screen (after `victory`) |
| `villain` | Encounter of Misdeeds (Shaw) | seamless 3.03 → 62.34 s | Villain scenes |
| `dread` | Out Of Time (Shaw) | seamless 2.83 → 72.02 s | Danger, terror |
| `tavern` | Medieval: Minstrel Dance (RandomMind) | seamless 0.75 → 57.06 s | Tavern / festival folk |

## Sound effects

70 files / 62 ids (step, text_blip_* use variants). Sources: **leohpaz** (SNES/PSX-style RPG menu, movement, magic, heal/buff packs — CC-BY 4.0) for UI and all elemental/status magic; **Kenney** RPG Audio + Impact Sounds (CC0), **artisticdude** (CC0), **rubberduck** (CC0), **StarNinjas** (CC0), **Little Robot Sound Factory** (CC-BY 3.0) for foley, impacts and jingles. Weapon sounds are *layered* designs (e.g. `slash` = swing + blade + body impact; `crit` adds a metal ring, a synthetic sub drop and saturation). `job_level`, `learn`, `item_get`, `turn_start` and the nine `text_blip_*` files are pure original synthesis (FM bells, Karplus-Strong harp, filtered noise) and are project-owned; `holy` (FM-bell chord + pad + shimmer) and `dark` (swell + tritone drone + rumble) are original synthesis layered with one credited sample each. Exact source files per output are in CREDITS.md.

## Replacing or adding assets

1. **Pick legal sources only**: CC0, CC-BY or (if unavoidable) CC-BY-SA. Never NC/ND. Keep the source page URL and author.
2. **Encode**: music as MP3 or AAC `.m4a` (≈ 96–128 kbps stereo, ≤ 3 MB); SFX as AAC `.m4a` (mono 64–80 kbps unless stereo matters). macOS: `afconvert -f m4af -d aac -b 96000 in.wav out.m4a`; elsewhere `ffmpeg -i in.wav -c:a aac -b:a 96k out.m4a`. Trim leading silence; leave a short fade at the end.
3. **Loop points** (music): if the track contains a repeat, run `python3 -I src/audio/tools/loopfind.py track.wav` on a 44.1 kHz 16-bit WAV decode and copy `loopStart`/`loopEnd` (samples ÷ 44100, 6 decimals) into the manifest; keep ≥ 0.75 s of audio after `loopEnd` (you may cut the rest of the file to save space). Otherwise use `loop: 'crossfade'` with `crossfadeMs`.
4. **Manifest**: add/modify the entry in `src/audio/manifest.ts` (`MUSIC` or `SFX`), setting `volume` so it sits with its neighbours (audition in the lab).
5. **Credits**: add a row to `public/assets/audio/CREDITS.md` with the file path in backticks, title, author, licence (+ link), source URL and what you changed.
6. **Check**: `npx vitest run tests/audio-manifest.test.ts` (file exists, format matches extension, size limits, required ids, credits row, no orphan files) and audition in the lab — `npm run dev`, open `/audio-lab.html`. Loop cues have a "Seam −6 s" button that starts just before the loop point; crossfade cues have "Crossfade −10 s".

### Voice-over (later)

Put lines at `public/assets/audio/voice/<locale>/<lineId>.ogg` (and/or `.m4a` for older iOS — the engine tries `ogg`, `m4a`, `mp3` in order and skips formats the browser can't play). `lineId` characters outside `[A-Za-z0-9_.-]` are replaced with `_`. Suggested ids: `<chapter>_<scene>_<speaker>_<nnn>`, e.g. `ch1_s3_ardel_004`. Mono, −16 LUFS integrated, 64–96 kbps. Add the actors and licence to CREDITS.md.

## Known limitations

- `audio-lab.html` is a dev page; it isn't in Vite's production `build.rollupOptions.input`.
- AAC decoding in Firefox on Linux depends on system codecs; if that platform matters, add `.ogg` alternatives via `src: ['x.ogg', 'x.m4a']`.
- Crossfade loops are scheduled from a JS timer with 2 s lookahead; background-tab timer throttling is harmless because the engine suspends audio when the page is hidden.
