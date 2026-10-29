/** Generic recruits: seeded names, looks and starting builds. */
import type { Appearance, BodyType } from '../content/schema';
import { createBuild } from '../engine/factory';
import { hashString, pick, rand, randInt, type RngHolder } from '../engine/rng';
import type { UnitBuild } from '../engine/types';

const MALE = ['Aldric', 'Bram', 'Cedric', 'Dunstan', 'Edmund', 'Fulk', 'Garrick', 'Hal', 'Ivo', 'Jasper', 'Kit', 'Leofric', 'Merek', 'Nyle', 'Osric', 'Piers', 'Quentin', 'Rowan', 'Simon', 'Tobias', 'Ulric', 'Wat', 'Wystan', 'Godwin', 'Hob', 'Anselm', 'Benedict', 'Colm', 'Drogo', 'Emeric', 'Gervase', 'Hugh', 'Lambert', 'Martin', 'Odo', 'Ralf', 'Roger', 'Stephen', 'Theo', 'Walter'];
const FEMALE = ['Ada', 'Beatrix', 'Cecily', 'Dulcie', 'Edith', 'Felise', 'Gwen', 'Hawise', 'Isolde', 'Joan', 'Kat', 'Liesel', 'Maud', 'Nell', 'Odile', 'Petra', 'Rosamund', 'Sabine', 'Tilda', 'Ursa', 'Wenna', 'Yvette', 'Agnes', 'Brigid', 'Clemence', 'Elinor', 'Emma', 'Galiena', 'Helewise', 'Idonea', 'Juliana', 'Lettice', 'Mabel', 'Margery', 'Orabel', 'Philippa', 'Rohese', 'Sibyl', 'Theda', 'Wymarc'];

const SKINS = ['light', 'light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'];
const HAIR_COLORS = ['chestnut', 'dark_brown', 'light_brown', 'black', 'raven', 'blonde', 'sandy', 'ginger', 'redhead', 'strawberry', 'ash', 'gray', 'platinum', 'gold', 'carrot'];
const EYES = ['blue', 'green', 'brown', 'gray', 'brown', 'blue'];
const HAIR_M = ['hair_plain', 'hair_messy1', 'hair_messy2', 'hair_parted', 'hair_spiked', 'hair_bedhead', 'hair_buzzcut', 'hair_swoop', 'hair_unkempt', 'hair_page', 'hair_shorthawk', 'hair_curly_short', 'hair_cornrows', 'hair_balding', 'hair_topknot_short', 'hair_long', 'hair_relm_short', 'hair_afro', 'hair_dreadlocks_short'];
const HAIR_F = ['hair_ponytail', 'hair_ponytail2', 'hair_bob', 'hair_bob_side_part', 'hair_long', 'hair_long_straight', 'hair_wavy', 'hair_braid', 'hair_pixie', 'hair_bangs_bun', 'hair_princess', 'hair_shoulderl', 'hair_curly_long', 'hair_half_up', 'hair_loose', 'hair_high_ponytail', 'hair_sara', 'hair_pigtails_bangs', 'hair_xlong'];
const BEARDS = ['beards_beard', 'beards_medium', 'beards_trimmed', 'beards_5oclock_shadow', 'beards_mustache', 'beards_handlebar'];

export function randomAppearance(r: RngHolder, body?: BodyType): Appearance {
  const b: BodyType = body ?? (rand(r) < 0.5 ? 'male' : 'female');
  const female = b === 'female';
  const ap: Appearance = {
    body: b,
    skin: pick(r, SKINS),
    hair: pick(r, female ? HAIR_F : HAIR_M),
    hairColor: pick(r, HAIR_COLORS),
    eyes: pick(r, EYES),
    portrait: { freckles: rand(r) < 0.15, age: rand(r) < 0.1 ? 'old' : rand(r) < 0.3 ? 'young' : 'adult' },
  };
  if (!female && rand(r) < 0.35) ap.beard = pick(r, BEARDS);
  if (rand(r) < 0.06) ap.ears = 'head_ears_elven';
  return ap;
}

export function randomName(r: RngHolder, body: BodyType): string {
  return pick(r, body === 'female' ? FEMALE : MALE);
}

/** A tavern recruit. `seed` makes the list stable between visits. */
export function makeRecruit(seed: number, level: number, index: number): { build: UnitBuild; cost: number } {
  const r: RngHolder = { rng: hashString(`recruit:${seed}:${index}`) };
  const ap = randomAppearance(r);
  const name = randomName(r, ap.body);
  const job = rand(r) < 0.6 ? 'squire' : 'alchemist';
  const lv = Math.max(1, level + randInt(r, -1, 1));
  const build = createBuild({ id: `r${seed.toString(36)}${index}${Math.floor(rand(r) * 1e6).toString(36)}`, name, appearance: ap, job, level: lv, seed: r.rng });
  build.jobs[job].jp = 100 + lv * 30;
  build.jobs[job].total = 100 + lv * 30;
  return { build, cost: 500 + lv * 150 };
}
