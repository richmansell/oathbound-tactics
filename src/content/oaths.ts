/**
 * Battle Oaths — the signature system (DESIGN §3.11, docs/story/STORY_JOBS.md §4).
 * A unit may swear one Oath before battle. Keeping it grants a boon during the
 * battle and bonus JP/EXP after; breaking it inflicts Doubt (and sometimes more).
 * In the fiction every Oath is a hedge oath, witnessed by the company's lantern.
 */
export type OathCheck =
  | 'nearAlly2'       // never end a turn more than 2 tiles from an ally
  | 'actFirstTurn'    // use an action on your first turn
  | 'noRetreat'       // never end a turn farther from the nearest foe than you started
  | 'mercy'           // never strike a non-Hollow foe at critical HP
  | 'witness'         // end each turn with every ally within 4 tiles
  | 'lastStand';      // do not fall while any ally stands

export interface OathDef {
  id: string;
  name: string;
  vow: string;            // what the unit promises
  boon: string;           // reward text
  forfeit: string;        // penalty text
  check: OathCheck;
  /** Restricted to a character (story oaths). */
  character?: string;
  /** Story flag required to appear. */
  requires?: string;
  jp: number;
  exp: number;
}

export const OATHS: OathDef[] = [
  { id: 'oath_shield', name: 'Oath of the Shield', vow: 'Never end a turn more than 2 tiles from an ally.', boon: 'Chance of Protect at the start of each turn.', forfeit: 'Doubt (Brave −20).', check: 'nearAlly2', jp: 40, exp: 20 },
  { id: 'oath_first_light', name: 'Oath of First Light', vow: 'Act on your very first turn.', boon: 'Move +1 for the rest of the battle once kept.', forfeit: 'Doubt.', check: 'actFirstTurn', jp: 30, exp: 15 },
  { id: 'oath_no_retreat', name: 'Oath of the Ford', vow: 'Never end a turn farther from the nearest foe than where you began it.', boon: 'PA +2 while the oath holds.', forfeit: 'Doubt and Slow.', check: 'noRetreat', jp: 50, exp: 25 },
  { id: 'oath_mercy', name: 'Oath of Mercy', vow: 'Never strike a foe at Critical HP unless it is a Hollow.', boon: 'Faith +20 while the oath holds.', forfeit: 'Doubt.', check: 'mercy', jp: 45, exp: 30 },
  { id: 'oath_witness', name: 'Oath of the Witness', vow: 'End every turn with each ally within 4 tiles.', boon: 'Allies\' oath rewards +25%.', forfeit: 'Doubt.', check: 'witness', character: 'bren', jp: 60, exp: 30 },
  { id: 'oath_last_stand', name: 'Oath of the Lantern', vow: 'Do not fall while any ally still stands.', boon: 'Regen whenever you fall to Critical HP.', forfeit: 'Doubt; every ally loses 5 Brave.', check: 'lastStand', requires: 'c1_odo_memory', jp: 70, exp: 40 },
];

export const OATH_BY_ID: Record<string, OathDef> = Object.fromEntries(OATHS.map((o) => [o.id, o]));

/** Oaths a unit may swear given story flags. */
export function availableOaths(characterId: string | undefined, flags: string[]): OathDef[] {
  return OATHS.filter((o) => (!o.character || o.character === characterId) && (!o.requires || flags.includes(o.requires) || flags.includes('oaths_all')));
}
