/**
 * Maps the story script's music/SFX cue names onto shipped audio assets.
 * When bespoke tracks are commissioned, add them to the audio manifest under
 * the cue name and remove the alias here.
 */
import { MUSIC, SFX } from '../audio/manifest';
import { music, sfx, stopMusic } from './sound';

const MUSIC_ALIAS: Record<string, string> = {
  cold_open: 'dread', storm: 'tension', lantern_road: 'hollow', after_battle: 'camp', tavern: 'tavern',
  rooftop: 'camp', memory: 'sorrow', road_day: 'world', tension_low: 'tension', millbrook: 'town',
  night_quiet: 'camp', ashguard_theme: 'villain', night_tension: 'tension', odo_theme: 'sorrow',
  greyfen: 'hollow', aldous_theme: 'sorrow', tenpenny: 'town', confession: 'sorrow', campfire: 'camp',
  morrow_theme: 'church', revelation: 'dread', regent_theme: 'villain', oathbound_theme: 'title',
  clement_theme: 'church',
  battle_hollows: 'battle', battle_bandits: 'battle2', battle_ashguard: 'battle2', battle_escape: 'boss',
  battle_undead: 'battle', battle_ledger: 'battle2', battle_boss: 'boss',
};

const SFX_ALIAS: Record<string, string> = {
  bell: 'confirm', box: 'item_get', candle_flare: 'holy', chime: 'learn', coin: 'gil', cough: 'hit',
  hollow_shriek: 'dark', hooves: 'step', horn: 'turn_start', horses: 'step', howl: 'dark', hum: 'time',
  impact: 'slash_heavy', ink: 'dark', knife: 'slash', lantern: 'holy', lantern_flare: 'holy', lock: 'block',
  pages: 'page', paper: 'page', pen_strike: 'slash', punt: 'water', quill: 'page', quill_scratch: 'page',
  rain: 'water', scream: 'ko', sword: 'slash', whistle: 'cursor',
};

export function playCueMusic(id: string): void {
  if (id === 'silence') { stopMusic(1200); return; }
  const real = id in MUSIC ? id : MUSIC_ALIAS[id];
  if (real) music(real);
}

export function playCueSfx(id: string): void {
  const real = id in SFX ? id : SFX_ALIAS[id];
  if (real) sfx(real);
}
