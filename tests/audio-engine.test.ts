import { describe, expect, it } from 'vitest';
import { AudioEngine, sliderToGain } from '../src/audio/audio';

// Node has no WebAudio: the engine must degrade to a silent no-op without throwing.
describe('audio engine (no WebAudio available)', () => {
  it('is a graceful no-op', async () => {
    const a = new AudioEngine();
    expect(a.supported).toBe(false);
    expect(a.state).toBe('unsupported');
    a.init({ baseUrl: '/x/' });
    await a.unlock();
    await a.playMusic('battle');
    expect(a.currentMusic).toBeNull();
    a.stopMusic(100);
    expect(a.sfx('slash', { pan: 0.5, pitch: 1.2 })).toBeNull();
    expect(a.textBlip('high')).toBeNull();
    await expect(a.playVoice('ch1_intro_001')).resolves.toBeNull();
    const release = a.duck(0.5, 100);
    expect(typeof release).toBe('function');
    release();
    await a.preload({ music: ['title'], sfx: ['cursor'] });
    a.setPaused(true);
    a.setPaused(false);
  });

  it('clamps and reports volumes', () => {
    const a = new AudioEngine();
    a.setVolumes({ master: 2, music: -1, sfx: 0.5, voice: Number.NaN });
    const v = a.getVolumes();
    expect(v.master).toBe(1);
    expect(v.music).toBe(0);
    expect(v.sfx).toBe(0.5);
    expect(v.voice).toBeGreaterThanOrEqual(0);
    a.setMuted(true);
    expect(a.isMuted).toBe(true);
  });

  it('maps slider positions to gain', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(0.5)).toBeCloseTo(0.25);
    expect(sliderToGain(7)).toBe(1);
  });
});
