/**
 * Sample characters used by the sprite lab and the rendering tests (also handy as fixtures).
 * Each is an Appearance plus equipment LayerRefs appended after defaultLayersForAppearance().
 */
import type { Appearance, LayerRef } from '../../content/schema';

export interface SampleCharacter {
  name: string;
  note: string;
  appearance: Appearance;
  gear: LayerRef[];
}

export const SAMPLE_CHARACTERS: SampleCharacter[] = [
  {
    name: 'Knight', note: 'plate + armet + longsword + kite',
    appearance: { body: 'male', skin: 'light', hair: 'hair_plain', hairColor: 'chestnut', eyes: 'blue' },
    gear: [
      { key: 'legs_armour' }, { key: 'feet_armour' }, { key: 'torso_chainmail' }, { key: 'torso_armour_plate' },
      { key: 'arms_armour' }, { key: 'shoulders_pauldrons', color: 'navy' }, { key: 'hat_helmet_armet' },
      { key: 'weapon_sword_longsword' }, { key: 'shield_kite', color: 'kite blue blue' },
    ],
  },
  {
    name: 'Wizard', note: 'robe + wizard hat + crystal staff',
    appearance: { body: 'female', skin: 'olive', hair: 'hair_long_straight', hairColor: 'platinum', eyes: 'purple' },
    gear: [
      { key: 'torso_clothes_robe', color: 'purple' }, { key: 'feet_slippers', color: 'black' },
      { key: 'hat_magic_wizard', color: 'navy' }, { key: 'hat_magic_wizard_belt', color: 'yellow' },
      { key: 'weapon_magic_crystal', color: 'blue' },
    ],
  },
  {
    name: 'Ranger', note: 'hood + bow + quiver + cape',
    appearance: { body: 'female', skin: 'amber', hair: 'hair_braid', hairColor: 'ginger', eyes: 'green' },
    gear: [
      { key: 'legs_leggings', color: 'brown' }, { key: 'feet_boots_fold', color: 'leather' },
      { key: 'torso_armour_leather' }, { key: 'cape_solid', color: 'forest' }, { key: 'hat_hood_cloth', color: 'forest' },
      { key: 'quiver' }, { key: 'weapon_ranged_bow_recurve' },
    ],
  },
  {
    name: 'Rogue', note: 'bandana + vest + dagger',
    appearance: { body: 'male', skin: 'taupe', hair: 'hair_messy1', hairColor: 'black', beard: 'beards_5oclock_shadow', eyes: 'brown' },
    gear: [
      { key: 'legs_pants2', color: 'charcoal' }, { key: 'feet_boots_basic', color: 'black' },
      { key: 'torso_clothes_longsleeve', color: 'black' }, { key: 'torso_clothes_vest', color: 'maroon' },
      { key: 'hat_bandana', color: 'red' }, { key: 'facial_mask_plain', color: 'black' }, { key: 'weapon_sword_dagger' },
    ],
  },
  {
    name: 'Monk', note: 'muscular, wide pants, headband, unarmed',
    appearance: { body: 'muscular', skin: 'bronze', hair: 'hair_buzzcut', hairColor: 'dark_brown', eyes: 'brown' },
    gear: [{ key: 'legs_widepants', color: 'orange' }, { key: 'feet_sandals', color: 'tan' }, { key: 'hat_headband_tied', color: 'white' }],
  },
  {
    name: 'Goblin', note: 'goblin head + club',
    appearance: { body: 'male', skin: 'green', head: 'heads_goblin' },
    gear: [{ key: 'legs_shorts', color: 'brown' }, { key: 'torso_bandages' }, { key: 'weapon_blunt_club' }],
  },
  {
    name: 'Skeleton', note: 'bone body + spear + round shield',
    appearance: { body: 'male', skin: 'light', head: 'heads_skeleton' },
    gear: [{ key: 'hat_helmet_barbuta' }, { key: 'weapon_polearm_spear', color: 'iron' }, { key: 'shield_round', color: 'brown' }],
  },
  {
    name: 'Orc', note: 'orc head + war axe',
    appearance: { body: 'male', skin: 'green', head: 'heads_orc_male', hair: 'hair_longhawk', hairColor: 'black' },
    gear: [
      { key: 'legs_pants', color: 'brown' }, { key: 'feet_boots_rim', color: 'black' }, { key: 'torso_armour_leather', color: 'brown' },
      { key: 'bauldron', color: 'brown' }, { key: 'hat_helmet_horned', color: 'iron' }, { key: 'weapon_blunt_waraxe' },
    ],
  },
  {
    name: 'Squire', note: 'tunic + leather cap + arming sword (female)',
    appearance: { body: 'female', skin: 'light', hair: 'hair_ponytail', hairColor: 'blonde', eyes: 'blue' },
    gear: [
      { key: 'legs_hose', color: 'brown' }, { key: 'feet_shoes_basic', color: 'brown' }, { key: 'torso_clothes_tunic', color: 'teal' },
      { key: 'belt_leather' }, { key: 'hat_cap_leather', color: 'leather' }, { key: 'weapon_sword_arming', color: 'steel' },
    ],
  },
  {
    name: 'Mage', note: 'male: longsleeve + skirt + celestial hat + gnarled staff',
    appearance: { body: 'male', skin: 'brown', hair: 'hair_long', hairColor: 'white', beard: 'beards_winter', head: 'heads_human_male_elderly', eyes: 'gray' },
    gear: [
      { key: 'torso_clothes_longsleeve', color: 'navy' }, { key: 'legs_skirts_plain', color: 'navy' }, { key: 'belt_sash', color: 'yellow' },
      { key: 'feet_shoes_revised', color: 'black' }, { key: 'hat_magic_celestial', color: 'navy' }, { key: 'weapon_magic_gnarled', color: 'gold' },
    ],
  },
  {
    name: 'Lancer', note: 'gold plate + longspear + plumed helm',
    appearance: { body: 'male', skin: 'lpcr.tawny', hair: 'hair_spiked', hairColor: 'red', eyes: 'orange' },
    gear: [
      { key: 'legs_armour', color: 'gold' }, { key: 'feet_armour', color: 'gold' }, { key: 'torso_armour_plate', color: 'gold' },
      { key: 'arms_armour', color: 'gold' }, { key: 'hat_helmet_greathelm', color: 'gold' }, { key: 'hat_accessory_plumage', color: 'red' },
      { key: 'weapon_polearm_longspear', color: 'gold' },
    ],
  },
  {
    name: 'Ronin', note: 'katana, elf ears',
    appearance: { body: 'female', skin: 'lpcr.porcelain', hair: 'hair_high_ponytail', hairColor: 'raven', ears: 'head_ears_elven', eyes: 'red' },
    gear: [
      { key: 'legs_pantaloons', color: 'charcoal' }, { key: 'feet_sandals', color: 'black' }, { key: 'torso_clothes_longsleeve2', color: 'red' },
      { key: 'belt_sash', color: 'black' }, { key: 'weapon_sword_katana' },
    ],
  },
  {
    name: 'Lizard', note: 'lizard head, scimitar, heater shield',
    appearance: { body: 'male', skin: 'dark_green', head: 'heads_lizard_male' },
    gear: [
      { key: 'legs_pants', color: 'tan' }, { key: 'torso_chainmail', color: 'bronze' }, { key: 'weapon_sword_scimitar' },
      { key: 'shield_heater_revised_paint', color: 'red' },
    ],
  },
  {
    name: 'Cleric', note: 'white robe, simple staff',
    appearance: { body: 'female', skin: 'black', hair: 'hair_afro', hairColor: 'dark_brown', eyes: 'brown' },
    gear: [{ key: 'torso_clothes_robe', color: 'white' }, { key: 'belt_robe', color: 'teal' }, { key: 'weapon_magic_simple' }],
  },
];
