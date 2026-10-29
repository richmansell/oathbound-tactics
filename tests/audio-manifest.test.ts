import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CORE_SFX, MUSIC, REQUIRED_MUSIC_IDS, REQUIRED_SFX_IDS, SFX, allManifestFiles,
  type MusicEntry, type SfxEntry,
} from '../src/audio/manifest';

const AUDIO_DIR = resolve(__dirname, '../public/assets/audio');
const credits = readFileSync(join(AUDIO_DIR, 'CREDITS.md'), 'utf8');
const music = MUSIC as Record<string, MusicEntry>;
const sfx = SFX as Record<string, SfxEntry>;

function sniffFormat(path: string): 'mp3' | 'm4a' | 'ogg' | 'wav' | 'unknown' {
  const b = readFileSync(path).subarray(0, 12);
  if (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (b.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF') return 'wav';
  return 'unknown';
}

describe('audio manifest', () => {
  it('declares every required music id', () => {
    for (const id of REQUIRED_MUSIC_IDS) expect(music[id], `music "${id}"`).toBeDefined();
  });

  it('declares every required sfx id', () => {
    for (const id of REQUIRED_SFX_IDS) expect(sfx[id], `sfx "${id}"`).toBeDefined();
    for (const id of CORE_SFX) expect(sfx[id], `core sfx "${id}"`).toBeDefined();
  });

  it('points every entry at an existing, non-empty file whose contents match its extension', () => {
    for (const rel of allManifestFiles()) {
      const p = join(AUDIO_DIR, rel);
      expect(existsSync(p), `missing ${rel}`).toBe(true);
      expect(statSync(p).size, `empty ${rel}`).toBeGreaterThan(1000);
      const ext = rel.split('.').pop();
      expect(sniffFormat(p), `format of ${rel}`).toBe(ext);
    }
  });

  it('keeps every music file mobile-sized (≤ 3 MB) and sfx small (≤ 200 kB)', () => {
    for (const m of Object.values(music)) for (const s of [m.src].flat()) expect(statSync(join(AUDIO_DIR, s)).size, s).toBeLessThanOrEqual(3 * 1024 * 1024);
    for (const e of Object.values(sfx)) for (const v of e.variants) expect(statSync(join(AUDIO_DIR, v)).size, v).toBeLessThanOrEqual(200 * 1024);
  });

  it('has a credits entry for every shipped file', () => {
    for (const rel of allManifestFiles()) expect(credits.includes(`\`${rel}\``), `CREDITS.md lacks \`${rel}\``).toBe(true);
  });

  it('ships no orphan audio files (everything on disk is in the manifest and credited)', () => {
    const listed = new Set(allManifestFiles());
    for (const dir of ['music', 'sfx']) {
      for (const f of readdirSync(join(AUDIO_DIR, dir))) {
        if (f.startsWith('.')) continue;
        const rel = `${dir}/${f}`;
        expect(listed.has(rel), `${rel} is not referenced by the manifest`).toBe(true);
        expect(credits.includes(`\`${rel}\``), `${rel} is not credited`).toBe(true);
      }
    }
  });

  it('has sane loop points and volumes', () => {
    for (const [id, m] of Object.entries(music)) {
      expect(m.volume, id).toBeGreaterThan(0);
      expect(m.volume, id).toBeLessThanOrEqual(2);
      if (m.loop && typeof m.loop === 'object') {
        expect(m.loop.start, id).toBeGreaterThanOrEqual(0);
        expect(m.loop.end - m.loop.start, `${id} loop length`).toBeGreaterThan(10);
        // keep a margin after loopEnd for decoder offset differences between browsers
        expect(m.loop.end, id).toBeLessThanOrEqual(m.duration - 0.25);
      }
      if (m.loop === 'crossfade') expect(m.crossfadeMs ?? 0, id).toBeGreaterThan(0);
    }
    for (const [id, e] of Object.entries(sfx)) {
      expect(e.variants.length, id).toBeGreaterThan(0);
      expect(e.volume, id).toBeGreaterThan(0);
      expect(e.volume, id).toBeLessThanOrEqual(2);
    }
  });

  it('only uses permitted licences in CREDITS.md (no NC/ND)', () => {
    expect(credits).not.toMatch(/CC-BY-NC|CC BY-NC|CC-BY-ND|CC BY-ND|NonCommercial|NoDerivatives/i);
  });
});
