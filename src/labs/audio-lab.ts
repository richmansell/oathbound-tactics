/**
 * Audio Lab — audition every music cue and sound effect, tweak the mix, check loop seams.
 * Open http://localhost:5173/audio-lab.html with `npm run dev`.
 */
import { audio, type Volumes } from '../audio/audio';
import { MUSIC, SFX, type BlipVoice, type MusicEntry, type MusicId, type SfxEntry, type SfxId } from '../audio/manifest';

audio.init();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
}

const logBox = el('div', { id: 'log' });
function log(msg: string) {
  logBox.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n${logBox.textContent ?? ''}`.slice(0, 4000);
}

// ---------------------------------------------------------------- mixer
const mixer = $('#mixer');
const vols = audio.getVolumes();
for (const k of ['master', 'music', 'sfx', 'voice'] as (keyof Volumes)[]) {
  const input = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(vols[k]) });
  const out = el('span', { textContent: `${Math.round(vols[k] * 100)}` });
  input.addEventListener('input', () => {
    audio.setVolumes({ [k]: Number(input.value) });
    out.textContent = `${Math.round(Number(input.value) * 100)}`;
  });
  mixer.append(el('label', {}, k, input, out));
}
const mute = el('input', { type: 'checkbox', checked: audio.isMuted });
mute.addEventListener('change', () => audio.setMuted(mute.checked));
mixer.append(el('label', {}, 'mute', mute));

const status = $('#status');
setInterval(() => {
  status.textContent = `context: ${audio.state} · music: ${audio.currentMusic ?? '—'}${audio.context ? ` · ${audio.context.sampleRate} Hz` : ''}`;
  document.querySelectorAll<HTMLElement>('.track').forEach((t) => t.classList.toggle('playing', t.dataset.id === audio.currentMusic));
}, 250);

// ---------------------------------------------------------------- music
const app = $('#app');
const fadeInput = el('input', { type: 'number', value: '1200', min: '0', step: '100' });
app.append(
  el('h2', {}, 'Music'),
  el('div', { className: 'row' },
    el('label', {}, 'crossfade ms', fadeInput),
    el('button', { textContent: '■ Stop music', onclick: () => { audio.stopMusic(Number(fadeInput.value)); log('stopMusic'); } }),
    el('button', { textContent: 'Duck music 3 s', onclick: () => { const r = audio.duck(0.6, 200); setTimeout(r, 3000); log('duck 60% for 3 s'); } }),
  ),
);
const tracks = el('div', { className: 'tracks' });
for (const [id, m] of Object.entries(MUSIC) as [MusicId, MusicEntry][]) {
  const loop = m.loop === 'crossfade' ? `crossfade loop (${m.crossfadeMs} ms)` : m.loop ? `seamless loop ${m.loop.start.toFixed(2)}–${m.loop.end.toFixed(2)} s` : 'one-shot';
  const card = el('div', { className: 'track' },
    el('b', {}, `${id} — “${m.title}”`),
    el('small', {}, `${m.role} · ${m.duration.toFixed(1)} s · ${loop}`),
  );
  card.dataset.id = id;
  const play = el('button', { textContent: '▶ Play', onclick: () => { void audio.playMusic(id, { fadeMs: Number(fadeInput.value), restart: true }); log(`playMusic ${id}`); } });
  card.append(play, ' ');
  if (m.loop && typeof m.loop === 'object') {
    const loopEnd = m.loop.end;
    card.append(el('button', {
      textContent: 'Seam −6 s', title: 'Start 6 s before the loop point to audition the seam',
      onclick: () => { void audio.playMusic(id, { fadeMs: 0, restart: true, startAt: loopEnd - 6 }); log(`seam test ${id} @ ${(loopEnd - 6).toFixed(2)} s`); },
    }));
  } else if (m.loop === 'crossfade') {
    card.append(el('button', {
      textContent: 'Crossfade −10 s', title: 'Start 10 s before the end to audition the crossfade loop',
      onclick: () => { void audio.playMusic(id, { fadeMs: 0, restart: true, startAt: m.duration - 10 }); log(`crossfade test ${id}`); },
    }));
  }
  tracks.append(card);
}
app.append(tracks);

// ---------------------------------------------------------------- sfx
const pitch = el('input', { type: 'range', min: '0.5', max: '2', step: '0.01', value: '1' });
const pan = el('input', { type: 'range', min: '-1', max: '1', step: '0.01', value: '0' });
const vol = el('input', { type: 'range', min: '0', max: '1.5', step: '0.01', value: '1' });
const randPan = el('input', { type: 'checkbox' });
app.append(
  el('h2', {}, 'Sound effects'),
  el('div', { className: 'row' },
    el('label', {}, 'pitch', pitch), el('label', {}, 'pan', pan), el('label', {}, 'volume', vol), el('label', {}, 'random pan', randPan),
    el('button', { textContent: 'Reset', onclick: () => { pitch.value = '1'; pan.value = '0'; vol.value = '1'; } }),
  ),
);
const groups = new Map<string, HTMLElement>();
for (const [id, e] of Object.entries(SFX) as [SfxId, SfxEntry][]) {
  let g = groups.get(e.category);
  if (!g) {
    g = el('div', { className: 'grid' });
    groups.set(e.category, g);
    app.append(el('h3', {}, e.category), g);
  }
  g.append(el('button', {
    textContent: e.variants.length > 1 ? `${id} ×${e.variants.length}` : id,
    onclick: () => {
      const p = randPan.checked ? Math.random() * 2 - 1 : Number(pan.value);
      const h = audio.sfx(id, { pitch: Number(pitch.value), pan: p, volume: Number(vol.value) });
      log(`sfx ${id}${h ? '' : ' (dropped: locked or unsupported)'}`);
    },
  }));
}

// ---------------------------------------------------------------- dialogue blips + voice
const dialogue = el('div', { id: 'dialogue' });
const line = 'The Ledger keeps every oath, Captain — and every debt.';
let typing = 0;
function typeOut(voice: BlipVoice) {
  const run = ++typing;
  dialogue.textContent = '';
  let i = 0;
  const step = () => {
    if (run !== typing || i >= line.length) return;
    const ch = line[i++];
    dialogue.textContent += ch;
    if (/[A-Za-z0-9]/.test(ch) && i % 2 === 1) audio.textBlip(voice);
    setTimeout(step, /[,.—]/.test(ch) ? 160 : 38);
  };
  step();
}
app.append(
  el('h2', {}, 'Dialogue'),
  el('div', { className: 'row' },
    ...(['low', 'mid', 'high'] as BlipVoice[]).map((v) => el('button', { textContent: `Type (${v} voice)`, onclick: () => typeOut(v) })),
    el('button', {
      textContent: 'playVoice("test_line")',
      onclick: async () => { const h = await audio.playVoice('test_line'); log(h ? `voice playing (${h.duration.toFixed(2)} s)` : 'voice line missing → silent no-op (expected until VO is recorded)'); },
    }),
  ),
  dialogue,
  el('h2', {}, 'Log'),
  logBox,
);
