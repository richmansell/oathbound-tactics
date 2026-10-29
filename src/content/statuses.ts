import type { StatusDef, StatusId } from './types';

const S = (d: StatusDef) => d;

/** Durations are clock ticks (a Speed-8 unit gains a turn about every 12 ticks). */
export const STATUSES: Record<StatusId, StatusDef> = {
  ko: S({ id: 'ko', name: 'KO', description: 'Knocked out. Crystallises when the countdown ends.', duration: 0, positive: false, skipTurn: true, noMove: true, noAct: true, incapacitating: true, color: '#888' }),
  crystal: S({ id: 'crystal', name: 'Crystal', description: 'Lost to the crystal.', duration: 0, positive: false, skipTurn: true, freezeCt: true, incapacitating: true, color: '#7fd4ff' }),
  petrify: S({ id: 'petrify', name: 'Stone', description: 'Turned to stone. Counts as defeated.', duration: 0, positive: false, skipTurn: true, freezeCt: true, noMove: true, noAct: true, incapacitating: true, color: '#9a8f80' }),
  poison: S({ id: 'poison', name: 'Poison', description: 'Loses 1/8 max HP each turn.', duration: 36, positive: false, cancels: ['regen'], color: '#8fd14f' }),
  regen: S({ id: 'regen', name: 'Regen', description: 'Recovers 1/8 max HP each turn.', duration: 36, positive: true, cancels: ['poison'], color: '#7cf2b2' }),
  protect: S({ id: 'protect', name: 'Protect', description: 'Physical damage taken ×2/3.', duration: 32, positive: true, color: '#e8c35a' }),
  shell: S({ id: 'shell', name: 'Shell', description: 'Magical damage taken ×2/3.', duration: 32, positive: true, color: '#5ab6e8' }),
  haste: S({ id: 'haste', name: 'Haste', description: 'Speed ×1.5.', duration: 32, positive: true, cancels: ['slow'], color: '#ffd54a' }),
  slow: S({ id: 'slow', name: 'Slow', description: 'Speed ×0.5.', duration: 24, positive: false, cancels: ['haste'], color: '#7f6bd6' }),
  stop: S({ id: 'stop', name: 'Stop', description: 'Frozen in time. No CT, no reactions, no evasion.', duration: 20, positive: false, skipTurn: true, freezeCt: true, noMove: true, noAct: true, color: '#b06bd6' }),
  immobilize: S({ id: 'immobilize', name: 'Immobilize', description: 'Cannot move.', duration: 24, positive: false, noMove: true, color: '#c97d4a' }),
  disable: S({ id: 'disable', name: 'Disable', description: 'Cannot act.', duration: 24, positive: false, noAct: true, color: '#c94a4a' }),
  silence: S({ id: 'silence', name: 'Silence', description: 'Cannot cast spells.', duration: 36, positive: false, noMagic: true, color: '#9ab' }),
  blind: S({ id: 'blind', name: 'Blind', description: 'Physical hit chance halved; ignores evasion poorly.', duration: 0, positive: false, color: '#444' }),
  sleep: S({ id: 'sleep', name: 'Sleep', description: 'Asleep. Skips turns, wakes on physical damage.', duration: 40, positive: false, skipTurn: true, noMove: true, noAct: true, breaksOnHit: true, color: '#6b8fd6' }),
  confuse: S({ id: 'confuse', name: 'Confuse', description: 'Acts at random. Cleared by physical damage.', duration: 0, positive: false, breaksOnHit: true, color: '#e86bd6' }),
  charm: S({ id: 'charm', name: 'Charm', description: 'Fights for the other side.', duration: 32, positive: false, breaksOnHit: true, color: '#ff8fb8' }),
  berserk: S({ id: 'berserk', name: 'Berserk', description: 'Attacks the nearest foe automatically; PA ×1.5.', duration: 0, positive: false, color: '#e84a4a' }),
  doom: S({ id: 'doom', name: 'Doom', description: 'KO when the count reaches zero.', duration: 0, positive: false, color: '#5a1a5a' }),
  float: S({ id: 'float', name: 'Float', description: 'Hovers: immune to earth, crosses water, ignores height when moving down.', duration: 40, positive: true, color: '#cdefff' }),
  reflect: S({ id: 'reflect', name: 'Reflect', description: 'Bounces reflectable spells back.', duration: 32, positive: true, color: '#e8f4ff' }),
  faith: S({ id: 'faith', name: 'Faith', description: 'Faith treated as 100.', duration: 32, positive: true, cancels: ['atheist'], color: '#fff3b0' }),
  atheist: S({ id: 'atheist', name: 'Doubtless', description: 'Faith treated as 0.', duration: 32, positive: false, cancels: ['faith'], color: '#777' }),
  undead: S({ id: 'undead', name: 'Undead', description: 'Healing harms; revival destroys. Rises again when KO count ends.', duration: 0, positive: false, color: '#6a7a5a' }),
  oil: S({ id: 'oil', name: 'Oil', description: 'Fire damage doubled once.', duration: 0, positive: false, color: '#5a4a2a' }),
  reraise: S({ id: 'reraise', name: 'Reraise', description: 'Revives automatically when KO\'d.', duration: 0, positive: true, color: '#ffe9a0' }),
  defending: S({ id: 'defending', name: 'Guarding', description: 'Evasion doubled until next turn.', duration: 0, positive: true, color: '#c0c0c0' }),
  charging: S({ id: 'charging', name: 'Charging', description: 'Preparing an action.', duration: 0, positive: true, color: '#ffffff' }),
  invisible: S({ id: 'invisible', name: 'Vanish', description: 'Cannot be targeted until acting.', duration: 0, positive: true, color: '#cccccc' }),
  vanish: S({ id: 'vanish', name: 'Vanish', description: 'Cannot be targeted until acting.', duration: 0, positive: true, color: '#cccccc' }),
  doubt: S({ id: 'doubt', name: 'Doubt', description: 'Broke an oath: Brave −20 for the battle.', duration: 0, positive: false, color: '#5a5a7a' }),
  chicken: S({ id: 'chicken', name: 'Faltering', description: 'Brave too low: flees and cannot act well.', duration: 0, positive: false, color: '#f0d080' }),
  quicken: S({ id: 'quicken', name: 'Quicken', description: 'Next turn comes immediately.', duration: 0, positive: true, color: '#fff' }),
  surety: S({ id: 'surety', name: 'Surety', description: 'Witnessed: an Oath kept now pays double. Protected while it lasts.', duration: 36, positive: true, color: '#fff0a0' }),
  forsworn: S({ id: 'forsworn', name: 'Forsworn', description: 'Named in forfeit: the next ability used costs 20% max HP.', duration: 36, positive: false, color: '#b04060' }),
  fear: S({ id: 'fear', name: 'Fear', description: 'Brave −30 and no reactions.', duration: 24, positive: false, color: '#8060a0' }),
  critical: S({ id: 'critical', name: 'Critical', description: 'HP at or below 1/5.', duration: 0, positive: false, color: '#ff6060' }),
};

/** Statuses that make a unit "out" for victory purposes. */
export const OUT_STATUSES: StatusId[] = ['ko', 'crystal', 'petrify'];
