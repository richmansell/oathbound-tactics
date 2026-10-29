/**
 * Main campaign — generic enemy templates (story battles, skirmishes and overworld roaming parties).
 * Monster jobs (wolfkin, hollow, skeleton, ghoul, goblin, gaunt, brute, boarman, minotaur, troll,
 * lizardfolk) and story jobs (ashguard, inquisitor) are specified in docs/story/STORY_JOBS.md.
 * Region → roaming template tables live in world.ts (`regions`).
 *
 * NOTE: skeleton/zombie *bodies* are not expressible in BodyType yet (see docs/story/SCHEMA_REQUESTS.md);
 * until then such templates use a human body + skeleton/zombie head and are listed in the
 * `bodyOverride` map below so the renderer can swap in the LPC skeleton/zombie body sheet.
 */
import type { Appearance } from '../../schema';

export interface EnemyTemplate {
  id: string;
  name: string;
  job: string;
  appearance: Appearance;
  brave?: number;
  faith?: number;
  ai?: 'aggressive' | 'defensive' | 'support' | 'coward' | 'boss' | 'guard';
}

/** Templates whose body sheet should be the LPC skeleton/zombie body instead of the human body. */
export const bodyOverride: Record<string, 'skeleton' | 'zombie'> = {
  restless_skeleton: 'skeleton',
  restless_archer: 'skeleton',
  restless_ghoul: 'zombie',
};

const t = (e: EnemyTemplate): EnemyTemplate => e;

export const enemies: Record<string, EnemyTemplate> = {
  // ===================================================== Lowmarch: the Struck & outlaws
  struck_brigand: t({
    id: 'struck_brigand', name: 'Struck Brigand', job: 'squire', ai: 'aggressive', brave: 60, faith: 45,
    appearance: {
      body: 'male', skin: 'light', hair: 'hair_messy2', hairColor: 'light_brown', beard: 'beards_beard', eyes: 'brown',
      outfit: {
        hat: { key: 'hat_headband_tied', color: 'brown' },
        torso: { key: 'torso_clothes_tunic', color: 'brown' },
        legs: { key: 'legs_pants', color: 'tan' },
        feet: { key: 'feet_boots_basic', color: 'brown' },
      },
    },
  }),
  struck_poacher: t({
    id: 'struck_poacher', name: 'Struck Poacher', job: 'ranger', ai: 'defensive', brave: 55, faith: 45,
    appearance: {
      body: 'female', skin: 'bronze', hair: 'hair_ponytail2', hairColor: 'dark_brown', eyes: 'green',
      outfit: {
        hat: { key: 'hat_hood_cloth', color: 'green' },
        torso: { key: 'torso_clothes_vest', color: 'brown' },
        legs: { key: 'legs_leggings', color: 'forest' },
        feet: { key: 'feet_shoes_ghillies', color: 'brown' },
      },
    },
  }),
  struck_cutpurse: t({
    id: 'struck_cutpurse', name: 'Struck Cutpurse', job: 'rogue', ai: 'aggressive', brave: 50, faith: 40,
    appearance: {
      body: 'male', skin: 'amber', hair: 'hair_bedhead', hairColor: 'sandy', eyes: 'blue',
      outfit: {
        hat: { key: 'hat_bandana', color: 'red' },
        torso: { key: 'torso_clothes_vest_open', color: 'walnut' },
        legs: { key: 'legs_pants2', color: 'brown' },
        feet: { key: 'feet_shoes_basic', color: 'brown' },
      },
    },
  }),
  highwayman: t({
    id: 'highwayman', name: 'Highwayman', job: 'rogue', ai: 'aggressive', brave: 62, faith: 40,
    appearance: {
      body: 'male', skin: 'light', hair: 'hair_swoop', hairColor: 'black', beard: 'beards_handlebar', eyes: 'brown',
      outfit: {
        hat: { key: 'hat_tricorne', color: 'black' },
        torso: { key: 'torso_jacket_frock', color: 'maroon' },
        legs: { key: 'legs_pants', color: 'black' },
        feet: { key: 'feet_boots_rim', color: 'black' },
        cape: { key: 'cape_solid', color: 'black' },
      },
    },
  }),
  red_tithe_collector: t({
    id: 'red_tithe_collector', name: 'Red Tithe Collector', job: 'knight', ai: 'aggressive', brave: 65, faith: 50,
    appearance: {
      body: 'muscular', skin: 'taupe', hair: 'hair_buzzcut', hairColor: 'chestnut', beard: 'beards_trimmed', eyes: 'gray',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'red' },
        legs: { key: 'legs_pants', color: 'maroon' },
        feet: { key: 'feet_boots_basic', color: 'black' },
      },
    },
  }),

  // ===================================================== The Regency: Ashguard
  ashguard_soldier: t({
    id: 'ashguard_soldier', name: 'Ashguard Soldier', job: 'knight', ai: 'aggressive', brave: 65, faith: 45,
    appearance: {
      body: 'male', skin: 'light', hair: 'hair_plain', hairColor: 'chestnut', eyes: 'blue',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'gray' },
        cape: { key: 'cape_solid', color: 'gray' },
        hat: { key: 'hat_helmet_kettle', color: 'iron' },
        legs: { key: 'legs_armour', color: 'iron' },
        feet: { key: 'feet_armour', color: 'iron' },
      },
    },
  }),
  ashguard_archer: t({
    id: 'ashguard_archer', name: 'Ashguard Archer', job: 'ranger', ai: 'defensive', brave: 58, faith: 45,
    appearance: {
      body: 'female', skin: 'olive', hair: 'hair_ponytail', hairColor: 'black', eyes: 'brown',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'gray' },
        cape: { key: 'cape_solid', color: 'gray' },
        hat: { key: 'hat_cap_leather', color: 'gray' },
        legs: { key: 'legs_pants', color: 'charcoal' },
        feet: { key: 'feet_boots_basic', color: 'black' },
      },
    },
  }),
  ashguard_lancer: t({
    id: 'ashguard_lancer', name: 'Ashguard Lancer', job: 'lancer', ai: 'aggressive', brave: 70, faith: 40,
    appearance: {
      body: 'muscular', skin: 'brown', hair: 'hair_buzzcut', hairColor: 'black', eyes: 'brown',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'gray' },
        cape: { key: 'cape_solid', color: 'gray' },
        hat: { key: 'hat_helmet_nasal', color: 'steel' },
        legs: { key: 'legs_armour', color: 'steel' },
        feet: { key: 'feet_armour', color: 'steel' },
      },
    },
  }),
  ashguard_torchbearer: t({
    id: 'ashguard_torchbearer', name: 'Ashguard Torchbearer', job: 'ashguard', ai: 'aggressive', brave: 72, faith: 40,
    appearance: {
      body: 'muscular', skin: 'light', hair: 'hair_shorthawk', hairColor: 'red', beard: 'beards_medium', eyes: 'gray',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'black' },
        cape: { key: 'cape_tattered', color: 'gray' },
        hat: { key: 'hat_helmet_barbuta', color: 'iron' },
        legs: { key: 'legs_armour', color: 'iron' },
        feet: { key: 'feet_armour', color: 'iron' },
      },
      portrait: { markings: 'Ash smeared across the eyes like a mask.' },
    },
  }),

  // ===================================================== The Ledger
  ledger_acolyte: t({
    id: 'ledger_acolyte', name: 'Auditor Acolyte', job: 'inquisitor', ai: 'support', brave: 45, faith: 72,
    appearance: {
      body: 'male', skin: 'light', head: 'heads_human_male_gaunt', hair: 'hair_parted', hairColor: 'light_brown', eyes: 'gray',
      outfit: {
        torso: { key: 'torso_clothes_robe', color: 'black' },
        waist: { key: 'belt_sash', color: 'gray' },
        hands: { key: 'arms_gloves', color: 'iron' },
        feet: { key: 'feet_shoes_basic', color: 'black' },
      },
    },
  }),
  ledger_verger: t({
    id: 'ledger_verger', name: 'Ledger Verger', job: 'knight', ai: 'guard', brave: 62, faith: 65,
    appearance: {
      body: 'muscular', skin: 'bronze', hair: 'hair_plain', hairColor: 'black', beard: 'beards_trimmed', eyes: 'brown',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'white' },
        cape: { key: 'cape_solid', color: 'black' },
        hat: { key: 'hat_helmet_mail', color: 'steel' },
        legs: { key: 'legs_armour', color: 'steel' },
        feet: { key: 'feet_armour', color: 'steel' },
      },
    },
  }),
  ledger_censor: t({
    id: 'ledger_censor', name: 'Ledger Censor', job: 'hexer', ai: 'support', brave: 40, faith: 78,
    appearance: {
      body: 'female', skin: 'light', hair: 'hair_bob', hairColor: 'dark_gray', eyes: 'gray',
      outfit: {
        torso: { key: 'torso_clothes_robe', color: 'black' },
        hat: { key: 'hat_hood_cloth', color: 'gray' },
        hands: { key: 'arms_gloves', color: 'iron' },
      },
      portrait: { markings: 'Mouth covered by a black scarf embroidered with a struck line.' },
    },
  }),
  ledger_scribe: t({
    id: 'ledger_scribe', name: 'Ledger Scribe', job: 'cleric', ai: 'support', brave: 35, faith: 75,
    appearance: {
      body: 'female', skin: 'amber', hair: 'hair_bangs_bun', hairColor: 'chestnut', eyes: 'brown',
      outfit: {
        torso: { key: 'torso_clothes_robe', color: 'white' },
        waist: { key: 'belt_sash', color: 'navy' },
        hat: { key: 'hat_hood_cloth', color: 'white' },
      },
    },
  }),

  // ===================================================== Hollows (monsters)
  hollow_hound: t({
    id: 'hollow_hound', name: 'Hollow Hound', job: 'wolfkin', ai: 'aggressive', brave: 70, faith: 30,
    appearance: {
      body: 'muscular', skin: 'fur_grey', head: 'heads_wolf_male', eyes: 'gray',
      outfit: { torso: { key: 'torso_clothes_sleeveless', color: 'charcoal' }, legs: { key: 'legs_shorts', color: 'charcoal' } },
      portrait: { markings: 'Spectral: render with 70% opacity and a grey smoke trail. Hollow eyes glow faintly white.' },
    },
  }),
  wolfkin: t({
    id: 'wolfkin', name: 'Wolfkin', job: 'wolfkin', ai: 'aggressive', brave: 72, faith: 30,
    appearance: {
      body: 'muscular', skin: 'fur_brown', head: 'heads_wolf_male', eyes: 'yellow',
      outfit: { legs: { key: 'legs_pants', color: 'leather' }, cape: { key: 'cape_tattered', color: 'brown' } },
      portrait: { markings: 'A settled Hollow: solid, scarred, wearing scraps of a hunter\'s gear.' },
    },
  }),
  mountain_wolfkin: t({
    id: 'mountain_wolfkin', name: 'Crag Wolfkin', job: 'wolfkin', ai: 'aggressive', brave: 75, faith: 30,
    appearance: {
      body: 'muscular', skin: 'fur_black', head: 'heads_wolf_male', eyes: 'orange',
      outfit: { legs: { key: 'legs_pants', color: 'black' } },
    },
  }),
  frost_wolfkin: t({
    id: 'frost_wolfkin', name: 'Frost Wolfkin', job: 'wolfkin', ai: 'aggressive', brave: 75, faith: 35,
    appearance: {
      body: 'muscular', skin: 'fur_white', head: 'heads_wolf_male', eyes: 'blue',
      outfit: { legs: { key: 'legs_pants', color: 'white' } },
    },
  }),
  hollow_shade: t({
    id: 'hollow_shade', name: 'Hollow Shade', job: 'hollow', ai: 'aggressive', brave: 50, faith: 60,
    appearance: {
      body: 'male', skin: 'lavender', head: 'heads_human_male_gaunt', eyes: 'gray',
      outfit: {
        torso: { key: 'torso_clothes_robe', color: 'black' },
        hat: { key: 'hat_hood_cloth', color: 'black' },
        cape: { key: 'cape_tattered', color: 'charcoal' },
      },
      portrait: { markings: 'Spectral: 60% opacity, no feet (hover), face a smooth blank under the hood.' },
    },
  }),
  fen_titheling: t({
    id: 'fen_titheling', name: 'Fen Titheling', job: 'goblin', ai: 'coward', brave: 40, faith: 40,
    appearance: {
      body: 'male', skin: 'pale_green', head: 'heads_goblin', eyes: 'yellow',
      outfit: { torso: { key: 'torso_clothes_tunic', color: 'forest' }, hat: { key: 'hat_hood_sack_cloth', color: 'brown' } },
      portrait: { markings: 'Clutches stolen pennies; render slightly smaller (90% scale).' },
    },
  }),
  restless_skeleton: t({
    id: 'restless_skeleton', name: 'Restless Bones', job: 'skeleton', ai: 'aggressive', brave: 60, faith: 20,
    appearance: {
      body: 'male', skin: 'light', head: 'heads_skeleton',
      outfit: { torso: { key: 'torso_clothes_tunic', color: 'gray' }, hat: { key: 'hat_helmet_norman', color: 'iron' } },
      portrait: { markings: 'BODY: LPC skeleton body (see bodyOverride). Rusted mail scraps, weed in the ribs.' },
    },
  }),
  restless_archer: t({
    id: 'restless_archer', name: 'Restless Bowman', job: 'skeleton', ai: 'defensive', brave: 55, faith: 20,
    appearance: {
      body: 'male', skin: 'light', head: 'heads_skeleton',
      outfit: { hat: { key: 'hat_hood_cloth', color: 'gray' } },
      portrait: { markings: 'BODY: LPC skeleton body. Carries a bow (skeleton archer variant).' },
    },
  }),
  restless_ghoul: t({
    id: 'restless_ghoul', name: 'Restless Ghoul', job: 'ghoul', ai: 'aggressive', brave: 65, faith: 20,
    appearance: {
      body: 'male', skin: 'zombie', head: 'heads_zombie',
      outfit: { torso: { key: 'torso_clothes_tunic', color: 'slate' }, legs: { key: 'legs_pants', color: 'gray' } },
      portrait: { markings: 'BODY: LPC zombie body. Drowned-grey, marsh-weed in its hair.' },
    },
  }),
  gaunt: t({
    id: 'gaunt', name: 'Gaunt', job: 'gaunt', ai: 'boss', brave: 55, faith: 80,
    appearance: {
      body: 'male', skin: 'zombie', head: 'heads_vampire', hair: 'hair_long_straight', hairColor: 'white', eyes: 'red',
      outfit: {
        torso: { key: 'torso_jacket_frock', color: 'black' },
        cape: { key: 'cape_trim', color: 'maroon' },
        neck: { key: 'neck_jabot', color: 'white' },
        legs: { key: 'legs_formal', color: 'black' },
      },
      portrait: { markings: 'Wears the face of a nobleman whose debt it is; elegant and rotting.' },
    },
  }),
  horned_brute: t({
    id: 'horned_brute', name: 'Hollow Brute', job: 'brute', ai: 'aggressive', brave: 80, faith: 25,
    appearance: {
      body: 'muscular', skin: 'green', head: 'heads_orc_male', eyes: 'red',
      outfit: { torso: { key: 'torso_armour_leather', color: 'brown' }, legs: { key: 'legs_pants', color: 'brown' } },
      portrait: { markings: 'A settled Hollow of a soldier\'s broken fealty; tusks, a cracked iron collar.' },
    },
  }),
  boarman_brute: t({
    id: 'boarman_brute', name: 'Boarman', job: 'boarman', ai: 'aggressive', brave: 75, faith: 25,
    appearance: {
      body: 'muscular', skin: 'fur_brown', head: 'heads_boarman', eyes: 'brown',
      outfit: { legs: { key: 'legs_pants', color: 'leather' }, torso: { key: 'torso_clothes_sleeveless', color: 'brown' } },
    },
  }),
  minotaur_horned: t({
    id: 'minotaur_horned', name: 'The Horned Debt', job: 'minotaur', ai: 'boss', brave: 85, faith: 20,
    appearance: {
      body: 'muscular', skin: 'fur_copper', head: 'heads_minotaur', eyes: 'red',
      outfit: { legs: { key: 'legs_skirts_legion', color: 'maroon' }, torso: { key: 'torso_armour_legion', color: 'bronze' } },
    },
  }),
  troll_barrow: t({
    id: 'troll_barrow', name: 'Barrow Troll', job: 'troll', ai: 'aggressive', brave: 70, faith: 15,
    appearance: {
      body: 'muscular', skin: 'fur_grey', head: 'heads_troll', eyes: 'yellow',
      outfit: { legs: { key: 'legs_pants', color: 'gray' } },
      portrait: { markings: 'Moss and grave-earth on its shoulders; a standing stone for a club.' },
    },
  }),
  bog_sarth: t({
    id: 'bog_sarth', name: 'Sarth Fen-Spear', job: 'lizardfolk', ai: 'defensive', brave: 60, faith: 55,
    appearance: {
      body: 'male', skin: 'dark_green', head: 'heads_lizard_male', eyes: 'yellow',
      outfit: { torso: { key: 'torso_clothes_sleeveless2', color: 'tan' }, waist: { key: 'belt_sash', color: 'teal' } },
      portrait: { markings: 'A living Sarth (not a Hollow); reed-carved oath-bands on the forearms.' },
    },
  }),
  sarth_oathcarver: t({
    id: 'sarth_oathcarver', name: 'Sarth Oathcarver', job: 'lizardfolk', ai: 'support', brave: 50, faith: 75,
    appearance: {
      body: 'female', skin: 'bright_green', head: 'heads_lizard_male', eyes: 'orange',
      outfit: { torso: { key: 'torso_clothes_robe', color: 'forest green' }, neck: { key: 'neck_necklace_beaded_large', color: 'bronze' } },
    },
  }),

  // ===================================================== Other regions (roaming, later chapters)
  westmarch_footpad: t({
    id: 'westmarch_footpad', name: 'Westmarch Footpad', job: 'rogue', ai: 'aggressive', brave: 55, faith: 45,
    appearance: {
      body: 'female', skin: 'light', hair: 'hair_pixie', hairColor: 'redhead', eyes: 'green',
      outfit: { hat: { key: 'hat_cap_cavalier', color: 'navy' }, torso: { key: 'torso_clothes_vest', color: 'navy' }, legs: { key: 'legs_pants', color: 'gray' } },
    },
  }),
  westmarch_knight: t({
    id: 'westmarch_knight', name: 'Westmarch Knight', job: 'knight', ai: 'aggressive', brave: 68, faith: 55,
    appearance: {
      body: 'muscular', skin: 'light', hair: 'hair_parted', hairColor: 'blonde', eyes: 'blue',
      outfit: {
        torso: { key: 'torso_jacket_tabard', color: 'teal' },
        hat: { key: 'hat_helmet_armet', color: 'silver' },
        legs: { key: 'legs_armour', color: 'silver' },
        feet: { key: 'feet_armour', color: 'silver' },
        cape: { key: 'cape_trim', color: 'teal' },
      },
    },
  }),
  corsair: t({
    id: 'corsair', name: 'Saltreach Corsair', job: 'rogue', ai: 'aggressive', brave: 66, faith: 40,
    appearance: {
      body: 'male', skin: 'brown', hair: 'hair_dreadlocks_short', hairColor: 'black', beard: 'beards_medium', eyes: 'brown',
      outfit: { hat: { key: 'hat_bandana_pirate', color: 'red' }, torso: { key: 'torso_clothes_shortsleeve', color: 'white' }, legs: { key: 'legs_pantaloons', color: 'navy' } },
    },
  }),
  smuggler: t({
    id: 'smuggler', name: 'Smuggler', job: 'alchemist', ai: 'coward', brave: 45, faith: 50,
    appearance: {
      body: 'female', skin: 'taupe', hair: 'hair_curly_short', hairColor: 'black', eyes: 'brown',
      outfit: { torso: { key: 'torso_clothes_vest', color: 'bluegray' }, legs: { key: 'legs_pants', color: 'black' }, hat: { key: 'hat_headband_kerchief', color: 'teal' } },
    },
  }),
  thornwall_bandit: t({
    id: 'thornwall_bandit', name: 'Thornwall Bandit', job: 'warden', ai: 'aggressive', brave: 68, faith: 45,
    appearance: {
      body: 'muscular', skin: 'light', hair: 'hair_long_messy', hairColor: 'dark_brown', beard: 'beards_winter', eyes: 'gray',
      outfit: { torso: { key: 'torso_armour_leather', color: 'brown' }, cape: { key: 'cape_solid', color: 'brown' }, hat: { key: 'hat_helmet_horned', color: 'iron' } },
    },
  }),
  skarn_raider: t({
    id: 'skarn_raider', name: 'Skarn Raider', job: 'warden', ai: 'aggressive', brave: 78, faith: 40,
    appearance: {
      body: 'muscular', skin: 'light', hair: 'hair_braid', hairColor: 'blonde', beard: 'beards_beard', eyes: 'blue',
      outfit: { torso: { key: 'torso_chainmail', color: 'iron' }, cape: { key: 'cape_solid', color: 'white' }, hat: { key: 'hat_helmet_spangenhelm_viking', color: 'iron' } },
    },
  }),
  skarn_runecaster: t({
    id: 'skarn_runecaster', name: 'Skarn Runecaster', job: 'wizard', ai: 'support', brave: 50, faith: 70,
    appearance: {
      body: 'female', skin: 'light', hair: 'hair_long_straight', hairColor: 'white', eyes: 'blue',
      outfit: { torso: { key: 'torso_clothes_longsleeve_laced', color: 'navy' }, cape: { key: 'cape_solid', color: 'white' } },
      portrait: { markings: 'Blue rune tattoos on the chin.' },
    },
  }),
  skarn_huntress: t({
    id: 'skarn_huntress', name: 'Skarn Huntress', job: 'ranger', ai: 'defensive', brave: 66, faith: 45,
    appearance: {
      body: 'female', skin: 'light', hair: 'hair_high_ponytail', hairColor: 'strawberry', eyes: 'gray',
      outfit: { torso: { key: 'torso_armour_leather', color: 'leather' }, cape: { key: 'cape_solid', color: 'gray' }, hat: { key: 'hat_hood_cloth', color: 'white' } },
    },
  }),
  velmont_duelist: t({
    id: 'velmont_duelist', name: 'Velmont Duelist', job: 'spellblade', ai: 'aggressive', brave: 64, faith: 55,
    appearance: {
      body: 'male', skin: 'olive', hair: 'hair_swoop', hairColor: 'black', beard: 'beards_mustache', eyes: 'brown',
      outfit: { torso: { key: 'torso_jacket_collared', color: 'purple' }, legs: { key: 'legs_formal', color: 'black' }, hat: { key: 'hat_cap_cavalier_feather', color: 'purple' } },
    },
  }),
  velmont_crossbow: t({
    id: 'velmont_crossbow', name: 'Velmont Arbalest', job: 'ranger', ai: 'defensive', brave: 56, faith: 50,
    appearance: {
      body: 'female', skin: 'olive', hair: 'hair_bob_side_part', hairColor: 'chestnut', eyes: 'brown',
      outfit: { torso: { key: 'torso_jacket_tabard', color: 'purple' }, legs: { key: 'legs_pants', color: 'black' }, hat: { key: 'hat_cap_bonnie', color: 'purple' } },
    },
  }),
  scald_nomad: t({
    id: 'scald_nomad', name: 'Scald Nomad', job: 'lancer', ai: 'aggressive', brave: 66, faith: 50,
    appearance: {
      body: 'male', skin: 'brown', hair: 'hair_cornrows', hairColor: 'black', beard: 'beards_trimmed', eyes: 'brown',
      outfit: { torso: { key: 'torso_clothes_robe', color: 'brown' }, hat: { key: 'hat_headband_thick', color: 'orange' }, cape: { key: 'cape_solid', color: 'tan' } },
    },
  }),
  scald_skirmisher: t({
    id: 'scald_skirmisher', name: 'Scald Skirmisher', job: 'ranger', ai: 'defensive', brave: 60, faith: 50,
    appearance: {
      body: 'female', skin: 'black', hair: 'hair_afro', hairColor: 'black', eyes: 'brown',
      outfit: { torso: { key: 'torso_clothes_sleeveless2', color: 'orange' }, legs: { key: 'legs_widepants', color: 'tan' }, hat: { key: 'hat_hood_hijab', color: 'tan' } },
    },
  }),
};
