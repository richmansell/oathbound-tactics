/**
 * Sample characters used by the portrait lab and the contact-sheet tool.
 */
import type { Appearance } from '../content/schema';

export interface PortraitSample {
  name: string;
  appearance: Appearance;
  headgear?: string;
  outfit?: string;
}

export const PORTRAIT_SAMPLES: PortraitSample[] = [
  {
    name: 'Squire (young man)',
    appearance: {
      body: 'male', skin: 'light', hair: 'hair_messy1', hairColor: 'chestnut', eyes: 'blue',
      outfit: { torso: { key: 'torso_clothes_tunic', color: 'blue', color2: 'tan' } },
      portrait: { age: 'young' },
    },
  },
  {
    name: 'Knight captain',
    appearance: {
      body: 'muscular', skin: 'olive', hair: 'hair_plain', hairColor: 'black', eyes: 'brown', beard: 'beards_trimmed',
      outfit: { torso: { key: 'torso_armour_plate', color: 'steel' }, hat: { key: 'hat_helmet_armet', color: 'steel' } },
      portrait: { scar: 'left-cheek' },
    },
  },
  {
    name: 'Wizard (old)',
    appearance: {
      body: 'male', skin: 'light', hair: 'hair_long_straight', hairColor: 'white', eyes: 'gray', beard: 'beards_winter',
      outfit: { torso: { key: 'torso_clothes_robe', color: 'navy', color2: 'yellow' }, hat: { key: 'hat_magic_wizard', color: 'navy' } },
      portrait: { age: 'old' },
    },
  },
  {
    name: 'Ranger (elf woman)',
    appearance: {
      body: 'female', skin: 'amber', hair: 'hair_long', hairColor: 'blonde', eyes: 'green', ears: 'ears_elven',
      outfit: { torso: { key: 'torso_leather', color: 'leather' }, cape: { key: 'cape_solid', color: 'forest' }, hat: { key: 'hat_hood_cloth', color: 'forest' } },
    },
  },
  {
    name: 'Cleric (woman)',
    appearance: {
      body: 'female', skin: 'bronze', hair: 'hair_ponytail', hairColor: 'black', eyes: 'brown',
      outfit: { torso: { key: 'torso_clothes_robe', color: 'white', color2: 'yellow' } },
      portrait: { freckles: false },
    },
  },
  {
    name: 'Rogue (freckles)',
    appearance: {
      body: 'female', skin: 'light', hair: 'hair_pixie', hairColor: 'redhead', eyes: 'green',
      outfit: { torso: { key: 'torso_clothes_vest', color: 'charcoal', color2: 'white' }, hat: { key: 'hat_bandana', color: 'red' } },
      portrait: { freckles: true, age: 'young' },
    },
  },
  {
    name: 'Mercenary (eyepatch)',
    appearance: {
      body: 'muscular', skin: 'brown', hair: 'hair_buzzcut', hairColor: 'black', eyes: 'brown', beard: 'beards_5oclock_shadow',
      outfit: { torso: { key: 'torso_leather_jerkin', color: 'brown', color2: 'tan' } },
      portrait: { eyepatch: 'right', scar: 'lip', build: 'broad' },
    },
  },
  {
    name: 'Alchemist (bob)',
    appearance: {
      body: 'female', skin: 'taupe', hair: 'hair_bob', hairColor: 'purple', eyes: 'purple',
      outfit: { torso: { key: 'torso_aprons_apron', color: 'teal', color2: 'white' } },
    },
  },
  {
    name: 'Monk (bald, old)',
    appearance: {
      body: 'muscular', skin: 'black', hair: 'hair_balding', hairColor: 'gray', eyes: 'brown', beard: 'beards_handlebar',
      outfit: { torso: { key: 'torso_clothes_sleeveless', color: 'orange' } },
      portrait: { age: 'old', scar: 'right-eye' },
    },
  },
  {
    name: 'Lancer (horned helm)',
    appearance: {
      body: 'male', skin: 'taupe', hair: 'hair_long_messy', hairColor: 'ginger', eyes: 'blue', beard: 'beards_beard',
      outfit: { torso: { key: 'torso_chainmail', color: 'iron', color2: 'red' }, hat: { key: 'hat_helmet_horned', color: 'iron' } },
    },
  },
  {
    name: 'Orc raider',
    appearance: {
      body: 'muscular', skin: 'green', head: 'heads_orc_male', hair: 'hair_longhawk', hairColor: 'black', eyes: 'red',
      outfit: { torso: { key: 'torso_leather', color: 'walnut' } },
    },
  },
  {
    name: 'Skeleton',
    appearance: {
      body: 'male', skin: 'light', head: 'heads_skeleton', eyes: 'blue',
      outfit: { torso: { key: 'torso_chainmail', color: 'iron', color2: 'maroon' } },
    },
  },
  {
    name: 'Noble (wavy, circlet)',
    appearance: {
      body: 'female', skin: 'olive', hair: 'hair_wavy', hairColor: 'chestnut', eyes: 'blue',
      outfit: { torso: { key: 'torso_clothes_dress', color: 'maroon', color2: 'yellow' }, hat: { key: 'hat_tiara', color: 'gold' } },
    },
  },
  {
    name: 'Goblin',
    appearance: {
      body: 'male', skin: 'pale_green', head: 'heads_goblin', hair: 'hair_messy2', hairColor: 'dark_gray', eyes: 'yellow',
      outfit: { torso: { key: 'torso_clothes_tunic', color: 'brown' }, hat: { key: 'hat_cap_leather', color: 'leather' } },
      portrait: { build: 'slight' },
    },
  },
  {
    name: 'Wolf beastman',
    appearance: {
      body: 'muscular', skin: 'fur_grey', head: 'heads_wolf_male', eyes: 'yellow',
      outfit: { torso: { key: 'torso_leather', color: 'leather' } },
    },
  },
  {
    name: 'Lizardfolk',
    appearance: {
      body: 'male', skin: 'dark_green', head: 'heads_lizard_male', eyes: 'orange',
      outfit: { torso: { key: 'torso_clothes_robe', color: 'maroon', color2: 'yellow' } },
    },
  },
];
