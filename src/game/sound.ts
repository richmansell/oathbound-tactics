/** Thin, typo-tolerant wrapper over the audio engine for game code. */
import { audio } from '../audio/audio';
import { MUSIC, SFX } from '../audio/manifest';

let initialised = false;

export function initSound(): void {
  if (initialised) return;
  initialised = true;
  try {
    audio.init({ preloadCore: true });
  } catch (e) {
    console.warn('audio init failed', e);
  }
}

export function sfx(id: string, opts: { volume?: number; pitch?: number } = {}): void {
  if (!(id in SFX)) return;
  try { audio.sfx(id as keyof typeof SFX, opts); } catch { /* audio is optional */ }
}

export function music(id: string, fadeMs = 900): void {
  if (!(id in MUSIC)) return;
  try { void audio.playMusic(id as keyof typeof MUSIC, { fadeMs }); } catch { /* optional */ }
}

export function stopMusic(fadeMs = 800): void {
  try { audio.stopMusic(fadeMs); } catch { /* optional */ }
}

export function blip(voice: 'low' | 'mid' | 'high'): void {
  try { audio.textBlip(voice); } catch { /* optional */ }
}

export function voice(lineId: string): void {
  try { void audio.playVoice(lineId); } catch { /* optional */ }
}

export function stopVoice(): void {
  try { audio.stopVoice(); } catch { /* optional */ }
}

export { audio };
